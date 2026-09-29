const encoder = new TextEncoder();

function bytes(value: string) {
  return encoder.encode(value);
}

function concatenate(parts: Uint8Array[]) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(length); let offset = 0;
  parts.forEach((part) => { result.set(part, offset); offset += part.length; });
  return result;
}

/** Builds a compact, local-only, single-page PDF containing one JPEG image. */
export function imagePdf(jpeg: Uint8Array, imageWidth: number, imageHeight: number, pageWidth: number, pageHeight: number) {
  const content = bytes(`q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`);
  const objects = [
    bytes('<< /Type /Catalog /Pages 2 0 R >>'),
    bytes('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    bytes(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`),
    concatenate([bytes(`<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`), jpeg, bytes('\nendstream')]),
    concatenate([bytes(`<< /Length ${content.length} >>\nstream\n`), content, bytes('endstream')])
  ];
  const parts: Uint8Array[] = [bytes('%PDF-1.4\n%âãÏÓ\n')]; const offsets = [0]; let offset = parts[0].length;
  objects.forEach((object, index) => {
    offsets.push(offset); const wrapped = concatenate([bytes(`${index + 1} 0 obj\n`), object, bytes('\nendobj\n')]); parts.push(wrapped); offset += wrapped.length;
  });
  const xrefOffset = offset;
  const xref = [`xref\n0 ${objects.length + 1}\n`, '0000000000 65535 f \n', ...offsets.slice(1).map((value) => `${String(value).padStart(10, '0')} 00000 n \n`)].join('');
  parts.push(bytes(`${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`));
  return new Blob([concatenate(parts).buffer as ArrayBuffer], { type: 'application/pdf' });
}
