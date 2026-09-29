import { describe, expect, it } from 'vitest';
import { labelRectsOverlap, placeLabelRect, type LabelRect } from '../src/lib/labelLayout';

describe('technical sheet label layout', () => {
  it('places repeated labels without overlap while space is available', () => {
    const occupied: LabelRect[] = [];
    for (let index = 0; index < 12; index += 1) {
      const placed = placeLabelRect(300, 250, 96, 18, { left: 10, top: 10, right: 590, bottom: 490 }, occupied, 4);
      expect(occupied.every((item) => !labelRectsOverlap(placed, item, 4))).toBe(true);
      occupied.push(placed);
    }
  });

  it('keeps annotations inside printable bounds', () => {
    const placed = placeLabelRect(0, 0, 120, 24, { left: 20, top: 30, right: 400, bottom: 280 }, [], 5);
    expect(placed.x).toBeGreaterThanOrEqual(20);
    expect(placed.y).toBeGreaterThanOrEqual(30);
    expect(placed.x + placed.width).toBeLessThanOrEqual(400);
    expect(placed.y + placed.height).toBeLessThanOrEqual(280);
  });
});
