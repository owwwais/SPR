// One JSON line per event. Fields are identifiers, counts and durations —
// never an answer, a transcript, a CV field or a request body (D8 parity).
type Fields = Record<string, string | number | boolean | null | undefined>;

function write(level: "info" | "warn" | "error", msg: string, fields?: Fields) {
  const line = JSON.stringify({ level, msg, at: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else console.log(line);
}

export const log = {
  info: (msg: string, fields?: Fields) => write("info", msg, fields),
  warn: (msg: string, fields?: Fields) => write("warn", msg, fields),
  error: (msg: string, fields?: Fields) => write("error", msg, fields),
};
