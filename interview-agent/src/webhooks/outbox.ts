// Event delivery to the platform (design §3.4).
//
// enqueueEvent() runs inside the transaction that made the change, so an
// event exists if and only if its change committed. The worker then leases a
// batch, POSTs each event signed with the webhook secret, and records the
// outcome. A lease (not a held row lock) covers the HTTP call, so a slow
// platform never pins database locks, and a crashed worker's lease simply
// expires for the next one to pick up.
import { jsonb, type Sql, type Tx } from "../db/client.ts";
import type { EventType, InterviewEvent, InterviewStatus } from "../contract/index.ts";
import { signRequest } from "../auth/hmac.ts";
import { log } from "../lib/log.ts";

export const MAX_ATTEMPTS = 15;
const LEASE_SECONDS = 60;
const REQUEST_TIMEOUT_MS = 10_000;

// 10s, 20s, 40s … capped at an hour: about 9 hours of retrying in total
// before an event is declared dead.
export function backoffSeconds(attempts: number): number {
  return Math.min(10 * 2 ** Math.max(0, attempts - 1), 3600);
}

export async function enqueueEvent(
  tx: Tx,
  event: {
    type: EventType;
    interviewId: string;
    externalRef: string;
    status: InterviewStatus;
    data?: Record<string, unknown>;
  }
): Promise<string> {
  const [row] = await tx<{ event_id: string }[]>`
    insert into webhook_outbox (interview_id, type, payload)
    values (${event.interviewId}, ${event.type}, '{}'::jsonb)
    returning event_id`;
  const payload: InterviewEvent = {
    event_id: row!.event_id,
    type: event.type,
    interview_id: event.interviewId,
    external_ref: event.externalRef,
    status: event.status,
    occurred_at: new Date().toISOString(),
    data: event.data ?? {},
  };
  await tx`
    update webhook_outbox set payload = ${tx.json(jsonb(payload))}
    where event_id = ${row!.event_id}`;
  return row!.event_id;
}

type OutboxRow = {
  id: string;
  event_id: string;
  payload: InterviewEvent;
  attempts: number;
};

export type OutboxWorkerOptions = {
  sql: Sql;
  url: string;
  secret: string;
  keyId: string;
  pollMs: number;
  batchSize?: number;
  fetchImpl?: typeof fetch;
};

export function createOutboxWorker(options: OutboxWorkerOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const batchSize = options.batchSize ?? 10;
  const target = new URL(options.url);
  const signedPath = target.pathname + target.search;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  async function deliver(row: OutboxRow): Promise<void> {
    const body = JSON.stringify(row.payload);
    let error: string | null = null;
    try {
      const headers = await signRequest({
        secret: options.secret,
        keyId: options.keyId,
        method: "POST",
        path: signedPath,
        body,
      });
      const response = await fetchImpl(target, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) error = `http ${response.status}`;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    if (error === null) {
      await options.sql`
        update webhook_outbox
        set delivered_at = now(), lease_until = null, last_error = null
        where id = ${row.id}`;
      return;
    }

    const dead = row.attempts >= MAX_ATTEMPTS;
    await options.sql`
      update webhook_outbox
      set lease_until = null,
          last_error = ${error.slice(0, 300)},
          next_attempt_at = now() + make_interval(secs => ${backoffSeconds(row.attempts)}),
          dead_at = case when ${dead} then now() end
      where id = ${row.id}`;
    log.warn("webhook delivery failed", {
      event_id: row.event_id,
      attempts: row.attempts,
      dead,
      error: error.slice(0, 120),
    });
  }

  // Leases and delivers one batch; returns how many events it attempted.
  async function tick(): Promise<number> {
    const rows = await options.sql<OutboxRow[]>`
      update webhook_outbox
      set lease_until = now() + make_interval(secs => ${LEASE_SECONDS}),
          attempts = attempts + 1
      where id in (
        select id from webhook_outbox
        where delivered_at is null
          and dead_at is null
          and next_attempt_at <= now()
          and (lease_until is null or lease_until < now())
        order by id
        limit ${batchSize}
        for update skip locked
      )
      returning id, event_id, payload, attempts`;
    for (const row of rows) await deliver(row);
    return rows.length;
  }

  async function loop() {
    if (stopped) return;
    try {
      // Drain without waiting while there is a backlog.
      while (!stopped && (await tick()) === batchSize) {}
    } catch (err) {
      log.error("outbox tick failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    if (!stopped) timer = setTimeout(loop, options.pollMs);
  }

  return {
    tick,
    start() {
      stopped = false;
      void loop();
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
