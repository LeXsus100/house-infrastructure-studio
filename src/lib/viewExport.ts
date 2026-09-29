export const VIEW_PRINT_LAYOUTS = {
  A4: { id: 'A4', pageWidthPt: 842, pageHeightPt: 595, pixelWidth: 4210, pixelHeight: 2975 },
  A3: { id: 'A3', pageWidthPt: 1191, pageHeightPt: 842, pixelWidth: 5955, pixelHeight: 4210 },
  A2: { id: 'A2', pageWidthPt: 1684, pageHeightPt: 1191, pixelWidth: 8420, pixelHeight: 5955 }
} as const;

export type ViewPrintLayoutId = keyof typeof VIEW_PRINT_LAYOUTS;

interface ViewExportSvgOptions {
  source: string;
  sourceWidth: number;
  sourceHeight: number;
  projectName: string;
  caption: string;
  dateLabel: string;
  northAngleRad: number;
  layoutId: ViewPrintLayoutId;
}

const escapeXml = (value: string) => value.replace(/[<>&"']/g, (character) => ({
  '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'
}[character]!));

/**
 * Creates the scalable paper master used by the preview and both file exports.
 * The Three.js scene remains a high-resolution raster image; page furniture,
 * typography, borders, and the north indicator stay vector until final output.
 */
export function createViewExportSvg(options: ViewExportSvgOptions) {
  const layout = VIEW_PRINT_LAYOUTS[options.layoutId]; const margin = 12; const footerHeight = 35;
  const availableWidth = layout.pageWidthPt - margin * 2; const availableHeight = layout.pageHeightPt - margin * 2 - footerHeight;
  const sourceWidth = Math.max(1, options.sourceWidth); const sourceHeight = Math.max(1, options.sourceHeight);
  const ratio = Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight);
  const sceneWidth = sourceWidth * ratio; const sceneHeight = sourceHeight * ratio;
  const sceneX = (layout.pageWidthPt - sceneWidth) / 2; const sceneY = margin + (availableHeight - sceneHeight) / 2;
  const northX = sceneX + 14; const northY = sceneY + sceneHeight - 14; const northDegrees = options.northAngleRad * 180 / Math.PI;
  const projectName = escapeXml(options.projectName); const caption = escapeXml(options.caption.trim()); const dateLabel = escapeXml(options.dateLabel);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.pageWidthPt}" height="${layout.pageHeightPt}" viewBox="0 0 ${layout.pageWidthPt} ${layout.pageHeightPt}">
  <rect width="100%" height="100%" fill="#fff"/>
  <image href="${escapeXml(options.source)}" x="${sceneX}" y="${sceneY}" width="${sceneWidth}" height="${sceneHeight}" preserveAspectRatio="none"/>
  <rect x="${sceneX}" y="${sceneY}" width="${sceneWidth}" height="${sceneHeight}" fill="none" stroke="#cbd3d0" stroke-width="1"/>
  <g transform="translate(${northX} ${northY})">
    <circle r="9.5" fill="#fff" fill-opacity=".92" stroke="#9eaaa7" stroke-width=".7"/>
    <g transform="rotate(${northDegrees})">
      <path d="M 0 -5.5 L 2.7 3.7 L 0 1.9 L -2.7 3.7 Z" fill="#26343a"/>
      <text x="0" y="-5.8" fill="#cf2f35" font-family="Manrope,Arial,sans-serif" font-size="5" font-weight="700" text-anchor="middle">N</text>
    </g>
  </g>
  <text x="${margin}" y="${layout.pageHeightPt - 21}" fill="#172126" font-family="Manrope,Arial,sans-serif" font-size="13" font-weight="700">${projectName}</text>
  ${caption ? `<text x="${margin}" y="${layout.pageHeightPt - 8}" fill="#65716d" font-family="Manrope,Arial,sans-serif" font-size="9">${caption}</text>` : ''}
  <text x="${layout.pageWidthPt - margin}" y="${layout.pageHeightPt - 8}" fill="#65716d" font-family="Manrope,Arial,sans-serif" font-size="9" text-anchor="end">${dateLabel}</text>
</svg>`;
}
