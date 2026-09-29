import { describe, expect, it } from 'vitest';
import { createViewExportSvg, VIEW_PRINT_LAYOUTS } from '../src/lib/viewExport';

describe('current-view print layouts', () => {
  it('provides fixed A-series landscape layouts at five-times print resolution', () => {
    expect(VIEW_PRINT_LAYOUTS.A4).toMatchObject({ pageWidthPt: 842, pageHeightPt: 595, pixelWidth: 4210, pixelHeight: 2975 });
    expect(VIEW_PRINT_LAYOUTS.A3.pixelWidth).toBe(VIEW_PRINT_LAYOUTS.A3.pageWidthPt * 5);
    expect(VIEW_PRINT_LAYOUTS.A2.pixelHeight).toBe(VIEW_PRINT_LAYOUTS.A2.pageHeightPt * 5);
  });

  it('builds a scalable paper master with a small bottom-left north arrow and escaped labels', () => {
    const svg = createViewExportSvg({ source: 'data:image/png;base64,AAAA', sourceWidth: 1600, sourceHeight: 900, projectName: 'House & services', caption: '<survey>', dateLabel: '27/09/2026', northAngleRad: Math.PI / 2, layoutId: 'A4' });
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 842 595"');
    expect(svg).toContain('<circle r="9.5"');
    expect(svg).toContain('rotate(90)');
    expect(svg).toContain('House &amp; services');
    expect(svg).toContain('&lt;survey&gt;');
    expect(svg).not.toContain('Gizmo');
  });
});
