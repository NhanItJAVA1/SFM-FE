/** Ignore the retired reason in older analysis results and cached previews. */
export function getCurrentAnomalyReasonCodes(reasonCodes?: readonly string[] | null): string[] {
  return (reasonCodes ?? []).filter(code => code.trim().toUpperCase() !== 'WEEKEND_TRANSACTION');
}
