import { db } from "@smm/db/client";
import { disclaimerTemplates } from "@smm/db/schema";
import { and, eq, or, isNull } from "drizzle-orm";

export async function getDisclaimerFor(
  contentType:
    | "psychoeducation"
    | "normalization"
    | "coping_skill"
    | "story"
    | "cta",
  state: string | null,
): Promise<string | null> {
  const templates = await db
    .select({ disclaimerText: disclaimerTemplates.disclaimerText })
    .from(disclaimerTemplates)
    .where(
      and(
        eq(disclaimerTemplates.active, true),
        or(
          eq(disclaimerTemplates.contentType, contentType),
          eq(disclaimerTemplates.contentType, "default"),
        ),
        or(
          state
            ? eq(disclaimerTemplates.state, state)
            : isNull(disclaimerTemplates.state),
          isNull(disclaimerTemplates.state),
        ),
      ),
    );

  const stateSpecific = state
    ? templates.find((t) => t.disclaimerText.length > 0)
    : null;

  return stateSpecific?.disclaimerText ?? templates[0]?.disclaimerText ?? null;
}

export function appendDisclaimer(
  content: string,
  disclaimer: string | null,
): string {
  if (!disclaimer) return content;
  return `${content}\n\n📋 ${disclaimer}`;
}
