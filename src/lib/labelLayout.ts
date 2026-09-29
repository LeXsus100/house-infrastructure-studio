export interface LabelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LabelBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function labelRectsOverlap(a: LabelRect, b: LabelRect, padding = 0): boolean {
  return a.x < b.x + b.width + padding
    && a.x + a.width + padding > b.x
    && a.y < b.y + b.height + padding
    && a.y + a.height + padding > b.y;
}

function overlapArea(a: LabelRect, b: LabelRect, padding: number): number {
  const left = Math.max(a.x, b.x - padding);
  const top = Math.max(a.y, b.y - padding);
  const right = Math.min(a.x + a.width, b.x + b.width + padding);
  const bottom = Math.min(a.y + a.height, b.y + b.height + padding);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

/**
 * Finds the nearest free label rectangle around an annotation anchor. Candidates
 * stay inside the printable bounds and progressively expand into orderly rows.
 * When a sheet is physically too crowded, the least-overlapping candidate is
 * returned so callers still receive a deterministic result.
 */
export function placeLabelRect(anchorX: number, anchorY: number, width: number, height: number, bounds: LabelBounds, occupied: LabelRect[], gap = 4): LabelRect {
  const maxX = Math.max(bounds.left, bounds.right - width);
  const maxY = Math.max(bounds.top, bounds.bottom - height);
  const candidates: LabelRect[] = [];
  const seen = new Set<string>();
  const add = (x: number, y: number) => {
    const candidate = { x: clamp(x, bounds.left, maxX), y: clamp(y, bounds.top, maxY), width, height };
    const key = `${Math.round(candidate.x * 10)}:${Math.round(candidate.y * 10)}`;
    if (!seen.has(key)) { seen.add(key); candidates.push(candidate); }
  };

  add(anchorX + gap, anchorY - height - gap);
  add(anchorX + gap, anchorY + gap);
  add(anchorX - width - gap, anchorY - height - gap);
  add(anchorX - width - gap, anchorY + gap);
  add(anchorX - width / 2, anchorY - height - gap);
  add(anchorX - width / 2, anchorY + gap);

  const stepY = height + gap;
  for (let ring = 1; ring <= 24; ring += 1) {
    const offset = ring * stepY;
    add(anchorX + gap, anchorY - height - gap - offset);
    add(anchorX + gap, anchorY + gap + offset);
    add(anchorX - width - gap, anchorY - height - gap - offset);
    add(anchorX - width - gap, anchorY + gap + offset);
    add(anchorX - width / 2, anchorY - height - gap - offset);
    add(anchorX - width / 2, anchorY + gap + offset);
  }

  const rowCount = Math.max(1, Math.floor((bounds.bottom - bounds.top - height) / stepY));
  const rows = Array.from({ length: rowCount + 1 }, (_, index) => bounds.top + index * stepY)
    .sort((a, b) => Math.abs(a + height / 2 - anchorY) - Math.abs(b + height / 2 - anchorY));
  rows.forEach((y) => {
    add(anchorX - width / 2, y);
    add(bounds.left, y);
    add(bounds.right - width, y);
  });

  const clear = candidates.find((candidate) => occupied.every((item) => !labelRectsOverlap(candidate, item, gap)));
  if (clear) return clear;
  return candidates.reduce((best, candidate) => {
    const score = occupied.reduce((sum, item) => sum + overlapArea(candidate, item, gap), 0);
    const distance = Math.hypot(candidate.x + width / 2 - anchorX, candidate.y + height / 2 - anchorY);
    const bestScore = occupied.reduce((sum, item) => sum + overlapArea(best, item, gap), 0);
    const bestDistance = Math.hypot(best.x + width / 2 - anchorX, best.y + height / 2 - anchorY);
    return score < bestScore || score === bestScore && distance < bestDistance ? candidate : best;
  }, candidates[0]);
}
