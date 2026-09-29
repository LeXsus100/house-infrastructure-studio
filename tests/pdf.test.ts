import { describe, expect, it } from 'vitest';
import { imagePdf } from '../src/lib/pdf';

describe('local image PDF export', () => {
  it('creates a self-contained single-page PDF with the requested paper size', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const blob = imagePdf(jpeg, 2, 2, 842, 595);
    const data = new Uint8Array(await blob.arrayBuffer()); const text = new TextDecoder().decode(data);
    expect(blob.type).toBe('application/pdf');
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/MediaBox [0 0 842 595]');
    expect(text).toContain('/Subtype /Image');
    expect(text).toContain('startxref');
    expect(data.includes(0xd8)).toBe(true);
  });
});
