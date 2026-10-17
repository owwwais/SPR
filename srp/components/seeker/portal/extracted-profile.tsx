import { Badge } from "@/components/ui/badge";
import type { SeekerProfile } from "@/lib/seeker";
import { ar } from "@/lib/i18n/ar";

// Model output stored as jsonb: typed by the analysis schema, but read
// defensively so a malformed entry is dropped instead of breaking the page.
function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function strings(values: unknown): string[] {
  return Array.isArray(values)
    ? values.map(str).filter((v): v is string => v !== null)
    : [];
}

function entries(values: unknown): Record<string, unknown>[] {
  return Array.isArray(values)
    ? values.filter(
        (v): v is Record<string, unknown> => typeof v === "object" && v !== null
      )
    : [];
}

// What the analysis read from the current CV, shown back to its owner as
// is. Read-only here: strengths and focus areas are our analysis (hideable
// only through skills, never rewritten), and the timeline is the CV's own
// content.
export function ExtractedProfile({ profile }: { profile: SeekerProfile }) {
  const t = ar.seekerPortal.profile;
  const strengths = strings(strengths);
  const focusAreas = strings(focusAreas);
  const languages = strings(languages);
  const experiences = entries(experiences)
    .map((exp) => ({
      title: str(exp.title),
      company: str(exp.company),
      start: str(exp.start),
      end: str(exp.end),
      summary: str(exp.summary),
    }))
    .filter((exp) => exp.title !== null);
  const education = entries(education)
    .map((edu) => ({
      degree: str(edu.degree),
      field: str(edu.field),
      institution: str(edu.institution),
      year: str(edu.year),
    }))
    .filter((edu) => edu.degree !== null);

  const hasAnything =
    strengths.length > 0 ||
    focusAreas.length > 0 ||
    experiences.length > 0 ||
    education.length > 0 ||
    languages.length > 0;
  if (!hasAnything) return null;

  return (
    <div className="flex flex-col gap-6">
      {(strengths.length > 0 || focusAreas.length > 0) && (
        <div className="grid gap-6 sm:grid-cols-2">
          {strengths.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{t.strengthsTitle}</h3>
              <ul className="flex list-disc flex-col gap-1.5 ps-5 text-sm text-body">
                {strengths.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {focusAreas.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{t.focusTitle}</h3>
              <div className="flex flex-wrap gap-1.5">
                {focusAreas.map((item, i) => (
                  <Badge key={i} variant="secondary">
                    {item}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {experiences.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">{t.experiencesTitle}</h3>
          <ol className="flex flex-col gap-4 border-s border-input ps-4">
            {experiences.map((exp, i) => (
              <li key={i} className="flex flex-col gap-0.5">
                <span className="font-medium">
                  {exp.title}
                  {exp.company && (
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      — {exp.company}
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  <bdi dir="ltr">{exp.start ?? t.unknownDate}</bdi>
                  {" – "}
                  <bdi dir="ltr">{exp.end ?? t.present}</bdi>
                </span>
                {exp.summary && (
                  <p className="mt-1 max-w-[68ch] text-sm text-body">{exp.summary}</p>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {(education.length > 0 || languages.length > 0) && (
        <div className="grid gap-6 sm:grid-cols-2">
          {education.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{t.educationTitle}</h3>
              <ul className="flex flex-col gap-1.5 text-sm">
                {education.map((edu, i) => (
                  <li key={i}>
                    {edu.degree}
                    {edu.field && ` — ${edu.field}`}
                    {(edu.institution || edu.year) && (
                      <span className="text-muted-foreground">
                        {" "}
                        ({[edu.institution, edu.year].filter(Boolean).join("، ")})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {languages.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{t.languagesTitle}</h3>
              <div className="flex flex-wrap gap-1.5">
                {languages.map((lang, i) => (
                  <Badge key={i} variant="outline">
                    {lang}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
