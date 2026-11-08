export type SeedCounts = { users: number; requests: number; onboardings: number; templates: number; hasAssessmentAdmin: boolean };

export function seedAction(counts: SeedCounts): "seed" | "skip" {
  const populated = counts.users > 0 || counts.requests > 0 || counts.onboardings > 0 || counts.templates > 0;
  if (!populated) return "seed";
  if (counts.hasAssessmentAdmin && counts.users >= 109 && counts.requests >= 30 && counts.onboardings >= 5 && counts.templates >= 1) return "skip";
  throw new Error("Refusing to seed a populated database. Use a new empty local database for assessment demo data; existing records were not changed.");
}
