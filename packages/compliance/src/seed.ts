import { db } from "@smm/db/client";
import {
  complianceRules,
  crisisResources,
  disclaimerTemplates,
} from "@smm/db/schema";
import { ALL_SEED_RULES } from "./rules/index";

export async function seedComplianceRules(): Promise<void> {
  await db.insert(complianceRules).values(ALL_SEED_RULES).onConflictDoNothing();
  console.log(`Seeded ${ALL_SEED_RULES.length} compliance rules`);
}

export async function seedCrisisResources(): Promise<void> {
  const resources = [
    {
      topicKey: "suicidality",
      resourceText:
        "If you or someone you know is in crisis, please reach out for immediate support.",
      hotline: "988 Suicide & Crisis Lifeline: call or text 988",
      url: "https://988lifeline.org",
      active: true,
    },
    {
      topicKey: "crisis_text",
      resourceText: "Free, confidential crisis counseling via text.",
      hotline: "Crisis Text Line: Text HOME to 741741",
      url: "https://www.crisistextline.org",
      active: true,
    },
    {
      topicKey: "eating_disorder",
      resourceText: "Support resources for eating disorders.",
      hotline: "NEDA Helpline: 1-800-931-2237",
      url: "https://www.nationaleatingdisorders.org",
      active: true,
    },
    {
      topicKey: "domestic_abuse",
      resourceText: "Confidential support for domestic violence situations.",
      hotline: "National DV Hotline: 1-800-799-7233",
      url: "https://www.thehotline.org",
      active: true,
    },
  ];

  await db.insert(crisisResources).values(resources).onConflictDoNothing();
  console.log(`Seeded ${resources.length} crisis resources`);
}

export async function seedDisclaimerTemplates(): Promise<void> {
  const templates = [
    {
      contentType: "psychoeducation" as const,
      state: null,
      disclaimerText:
        "This content is for educational purposes only and does not constitute medical advice. Please consult a licensed mental health professional for personalized support.",
      active: true,
    },
    {
      contentType: "coping_skill" as const,
      state: null,
      disclaimerText:
        "These techniques are meant as general wellness strategies. If you are experiencing significant distress, please reach out to a licensed mental health professional.",
      active: true,
    },
    {
      contentType: "default" as const,
      state: null,
      disclaimerText:
        "Content provided for informational purposes only. Not a substitute for professional mental health care.",
      active: true,
    },
  ];

  await db.insert(disclaimerTemplates).values(templates).onConflictDoNothing();
  console.log(`Seeded ${templates.length} disclaimer templates`);
}

async function runSeed() {
  await seedComplianceRules();
  await seedCrisisResources();
  await seedDisclaimerTemplates();
  process.exit(0);
}

runSeed().catch((err) => {
  console.error(err);
  process.exit(1);
});
