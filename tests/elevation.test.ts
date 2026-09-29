import { describe, expect, it } from 'vitest';
import type { Wall } from '../shared/types';
import { buildChainedDeviceOffsetSpans, createDefaultWallElevationContent, formatWallRouteMetadata, wallExportFiles } from '../src/lib/elevation';
import { createDefaultProject } from '../src/lib/project';

const wall = (id: string): Wall => ({
  id, floorId: 'floor', name: 'Wall 01', start: { x: 0, z: 0 }, end: { x: 3000, z: 0 }, heightMm: 2700,
  thicknessMm: 120, structuralThicknessMm: 120, liningLeftMm: 0, liningRightMm: 0, hidden: false, locked: false
});

describe('wall scheme batch filenames', () => {
  it('keeps repeated wall names deterministic without overwriting ZIP entries', () => {
    const project = createDefaultProject('Example house'); const walls = [wall('a'), wall('b'), wall('c')];
    expect(wallExportFiles(project, walls).map((item) => item.fileName)).toEqual([
      'Example-house_Unassigned_Wall-01.png',
      'Example-house_Unassigned_Wall-01-2.png',
      'Example-house_Unassigned_Wall-01-3.png'
    ]);
  });

  it('keeps overall wall dimensions disabled by default', () => {
    expect(createDefaultWallElevationContent().showWallDimensions).toBe(false);
  });

  it('omits generic custom route wording while retaining technical subtypes', () => {
    expect(formatWallRouteMetadata('Custom cable', 'cable', 5020, 2590)).toBe('5.02 m tot | 2.59 m wall');
    expect(formatWallRouteMetadata('CAT6A', 'cable', 5020, 2590)).toBe('CAT6A · 5.02 m tot | 2.59 m wall');
  });

  it('uses a non-redundant chained dimension sequence for device offsets', () => {
    expect(buildChainedDeviceOffsetSpans([2200, 700, 1400, 1400.4], 3000)).toEqual([
      { startMm: 0, endMm: 700 },
      { startMm: 700, endMm: 1400 },
      { startMm: 1400, endMm: 2200 }
    ]);
  });
});
