export type PolylinePoint = readonly [number, number, number];

export interface PolylinePath {
  total: number;
  segments: Array<{ start: PolylinePoint; end: PolylinePoint; length: number; cumulative: number }>;
}

export function buildPolylinePath(points: PolylinePoint[]): PolylinePath {
  let cumulative = 0;
  const segments = points.slice(1).map((end, index) => {
    const start = points[index]; const length = Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
    const segment = { start, end, length, cumulative }; cumulative += length; return segment;
  }).filter((segment) => segment.length > .0001);
  return { segments, total: cumulative };
}

export function samplePolylinePath(path: PolylinePath, travelProgress: number, reverse = false): { position: [number,number,number]; direction: [number,number,number] } | null {
  if (!path.total || !path.segments.length) return null;
  const forward = ((travelProgress % 1) + 1) % 1; const progress = reverse ? 1 - forward : forward; const distance = progress * path.total;
  const segment = path.segments.find((item) => distance <= item.cumulative + item.length) ?? path.segments[path.segments.length - 1];
  const local = Math.max(0, Math.min(1, (distance - segment.cumulative) / segment.length)); const sign = reverse ? -1 : 1;
  const direction = (axis: 0 | 1 | 2) => {
    const value = (segment.end[axis] - segment.start[axis]) / segment.length * sign;
    return Object.is(value, -0) ? 0 : value;
  };
  return {
    position: [segment.start[0] + (segment.end[0] - segment.start[0]) * local, segment.start[1] + (segment.end[1] - segment.start[1]) * local, segment.start[2] + (segment.end[2] - segment.start[2]) * local],
    direction: [direction(0), direction(1), direction(2)]
  };
}

export function routeDirectionMarkerDistances(total: number, travelDistance: number, count: number): number[] {
  if (total <= 0 || count <= 0) return [];
  const spacing = total / count; const phase = ((travelDistance % spacing) + spacing) % spacing;
  return Array.from({ length: count }, (_, index) => Number((phase + index * spacing).toFixed(6)));
}
