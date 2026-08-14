import type { Floor } from '../../shared/types';

export interface NumberedFloor { floor: Floor; number: number }

export function numberedFloors(floors: Floor[]): NumberedFloor[] {
  const ordered = [...floors].sort((a, b) => a.elevationMm - b.elevationMm || a.sortOrder - b.sortOrder);
  if (!ordered.length) return [];
  const zeroIndex = ordered.reduce((closest, floor, index) => Math.abs(floor.elevationMm) < Math.abs(ordered[closest].elevationMm) ? index : closest, 0);
  return ordered.map((floor, index) => ({ floor, number: index - zeroIndex }));
}
