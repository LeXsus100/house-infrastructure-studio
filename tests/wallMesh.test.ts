import { describe, expect, it } from 'vitest';
import { WALL_PRISM_TRIANGLE_INDICES, wallPrismVerticesMm } from '../src/lib/wallMesh';

const triangleNormal = (vertices: number[], triangle: number) => {
  const index = triangle * 3; const a = WALL_PRISM_TRIANGLE_INDICES[index] * 3; const b = WALL_PRISM_TRIANGLE_INDICES[index + 1] * 3; const c = WALL_PRISM_TRIANGLE_INDICES[index + 2] * 3;
  const ab = [vertices[b] - vertices[a], vertices[b + 1] - vertices[a + 1], vertices[b + 2] - vertices[a + 2]];
  const ac = [vertices[c] - vertices[a], vertices[c + 1] - vertices[a + 1], vertices[c + 2] - vertices[a + 2]];
  return [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
};

describe('wall prism rendering geometry', () => {
  it('winds every finished wall face outwards', () => {
    const vertices = wallPrismVerticesMm({ startNegativeX: -1000, startPositiveX: -1000, endNegativeX: 1000, endPositiveX: 1000, bottomY: 0, topY: 2700, negativeDepth: -200, positiveDepth: 200 });
    const normals = Array.from({ length: 12 }, (_, triangle) => triangleNormal(vertices, triangle));
    expect(normals.slice(0, 2).every((normal) => normal[1] < 0)).toBe(true);
    expect(normals.slice(2, 4).every((normal) => normal[1] > 0)).toBe(true);
    expect(normals.slice(4, 6).every((normal) => normal[2] < 0)).toBe(true);
    expect(normals.slice(6, 8).every((normal) => normal[2] > 0)).toBe(true);
    expect(normals.slice(8, 10).every((normal) => normal[0] < 0)).toBe(true);
    expect(normals.slice(10, 12).every((normal) => normal[0] > 0)).toBe(true);
  });
});
