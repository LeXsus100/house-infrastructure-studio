export interface WallPrismBoundsMm {
  startNegativeX: number;
  startPositiveX: number;
  endNegativeX: number;
  endPositiveX: number;
  bottomY: number;
  topY: number;
  negativeDepth: number;
  positiveDepth: number;
}

// Vertex order: bottom ring (start-/end-/end+/start+), then the top ring.
// Every triangle is counter-clockwise when viewed from outside the wall.
export const WALL_PRISM_TRIANGLE_INDICES = [
  0, 1, 2, 0, 2, 3, // bottom
  4, 6, 5, 4, 7, 6, // top
  0, 5, 1, 0, 4, 5, // negative-depth face
  3, 2, 6, 3, 6, 7, // positive-depth face
  0, 3, 7, 0, 7, 4, // start face
  1, 5, 6, 1, 6, 2, // end face
] as const;

export function wallPrismVerticesMm(bounds: WallPrismBoundsMm): number[] {
  const { startNegativeX: sn, startPositiveX: sp, endNegativeX: en, endPositiveX: ep, bottomY: bottom, topY: top, negativeDepth: negative, positiveDepth: positive } = bounds;
  return [
    sn, bottom, negative, en, bottom, negative, ep, bottom, positive, sp, bottom, positive,
    sn, top, negative, en, top, negative, ep, top, positive, sp, top, positive,
  ];
}
