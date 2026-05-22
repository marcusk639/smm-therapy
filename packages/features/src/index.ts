export type Plan = "starter" | "growth" | "agency";
export type Feature =
  | "calendar_generation"
  | "multi_client"
  | "meta_publishing"
  | "api_access"
  | "trend_digest";

const FEATURE_MATRIX: Record<Feature, Plan[]> = {
  calendar_generation: ["growth", "agency"],
  multi_client: ["growth", "agency"],
  meta_publishing: ["agency"],
  api_access: ["agency"],
  trend_digest: ["growth", "agency"],
};

const CLIENT_LIMITS: Record<Plan, number> = {
  starter: 1,
  growth: 5,
  agency: -1,
};

export function canUseFeature(plan: Plan, feature: Feature): boolean {
  return FEATURE_MATRIX[feature].includes(plan);
}

export function clientLimit(plan: Plan): number {
  return CLIENT_LIMITS[plan];
}

export function isWithinClientLimit(plan: Plan, currentCount: number): boolean {
  const limit = clientLimit(plan);
  if (limit === -1) return true;
  return currentCount < limit;
}
