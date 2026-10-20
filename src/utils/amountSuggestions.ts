export function getAmountSuggestions(input: string): number[] {
  if (!/^\d+$/.test(input)) return [];
  const base = Number(input);
  if (!Number.isSafeInteger(base) || base <= 0) return [];
  return [1_000, 10_000, 100_000]
    .map((multiplier) => base * multiplier)
    .filter(Number.isSafeInteger);
}
