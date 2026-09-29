import { describe, expect, it } from 'vitest';
import { formatMeasurementLabel } from '../src/lib/measurement';

describe('measurement labels', () => {
  it('always shows the calculated metric length', () => {
    expect(formatMeasurementLabel(undefined, 2450)).toBe('2.45 m');
  });

  it('keeps custom text and appends the calculated length', () => {
    expect(formatMeasurementLabel('Ceiling clearance', 1875)).toBe('Ceiling clearance - 1.88 m');
  });

  it('trims custom text and treats whitespace-only text as empty', () => {
    expect(formatMeasurementLabel('  Service gap  ', 500)).toBe('Service gap - 0.50 m');
    expect(formatMeasurementLabel('   ', 500)).toBe('0.50 m');
  });
});
