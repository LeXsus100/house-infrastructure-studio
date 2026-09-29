export function formatMeasurementLabel(text: string | undefined, lengthMm: number): string {
  const length = `${(lengthMm / 1000).toFixed(2)} m`;
  const customText = text?.trim();
  return customText ? `${customText} - ${length}` : length;
}
