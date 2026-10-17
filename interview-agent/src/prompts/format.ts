// Helpers shared by the prompt templates. Text from outside (the job posting,
// the candidate's profile, staff edits) enters a prompt only inside named
// delimiters, as data (design §4.5). A delimiter that appears inside that
// text is defused first, so data cannot close its own block and continue as
// if it were instructions.
import type { JobContext } from "../contract/index.ts";

const DELIMITERS = /<\s*\/?\s*(job|candidate_profile|existing_questions|request)\b[^>]*>/gi;

export function defuse(text: string): string {
  return text.replace(DELIMITERS, "[…]");
}

export function block(tag: string, body: string): string {
  return `<${tag}>\n${defuse(body)}\n</${tag}>`;
}

const JOB_TYPES: Record<JobContext["type"], string> = {
  full_time: "full-time",
  part_time: "part-time",
  contract: "contract",
  remote: "remote",
  internship: "internship",
};

export function jobBlock(job: JobContext): string {
  const lines = [
    `Title: ${job.title}`,
    `Type: ${JOB_TYPES[job.type]}`,
    `Location: ${job.location ?? "—"}`,
    `Minimum years of experience: ${job.min_years_experience}`,
    `Required skills: ${job.skills.length > 0 ? job.skills.join(", ") : "—"}`,
    "Requirements:",
    job.requirements,
    "Description:",
    job.description.trim().length > 0 ? job.description : "—",
  ];
  return block("job", lines.join("\n"));
}

export function existingQuestionsBlock(texts: readonly string[]): string {
  const body =
    texts.length === 0
      ? "—"
      : texts.map((text, index) => `${index + 1}. ${text.replace(/\s+/g, " ").trim()}`).join("\n");
  return block("existing_questions", body);
}
