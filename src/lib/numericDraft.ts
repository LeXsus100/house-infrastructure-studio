export const isNumericDraft = (value: string): boolean => /^-?\d*(?:[.,]\d*)?$/.test(value);

export function parseNumericDraft(value: string, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY): number | null {
  const trimmed = value.trim();
  if (!trimmed || ['-', '.', ',', '-.', '-,'].includes(trimmed)) return null;
  const parsed = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(parsed)) return null;
  return Math.min(max, Math.max(min, parsed));
}
