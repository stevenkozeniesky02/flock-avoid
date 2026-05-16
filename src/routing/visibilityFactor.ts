export const MAX_VISIBILITY_M = 150;

export function visibilityFactor(distanceMeters: number): number {
  if (distanceMeters <= 0) return 1;
  if (distanceMeters >= MAX_VISIBILITY_M) return 0;
  return 1 - distanceMeters / MAX_VISIBILITY_M;
}
