import { describe, expect, it } from 'vitest';
import { DEFAULT_DEVICE_TYPES } from '../src/catalog';
import { en } from '../src/i18n/en';
import { it as italian } from '../src/i18n/it';

describe('local EN/IT dictionaries', () => {
  it('keeps both dictionaries synchronized', () => {
    expect(Object.keys(italian).sort()).toEqual(Object.keys(en).sort());
  });

  it('translates every default catalogue device name', () => {
    const missing = DEFAULT_DEVICE_TYPES.map((type) => type.name).filter((name) => !(name in italian));
    expect(missing).toEqual([]);
    expect(italian['Light switch']).toBe('Interruttore luce');
    expect(italian['One PNG per selected wall']).toBe('Un PNG per parete selezionata');
  });
});
