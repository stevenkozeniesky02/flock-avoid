export function pickEvictionTargets(
  keys: readonly string[],
  max: number,
): readonly string[] {
  const overflow = keys.length - max;
  if (overflow <= 0) return [];
  return keys.slice(0, overflow);
}
