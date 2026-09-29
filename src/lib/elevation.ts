/// <reference lib="dom" />

import type { ExportPreset, ProjectSnapshot, Wall } from '../../shared/types';
import { batchExportFilename, distance3, roundedRoutePoints, routeLength, routeSegmentsOnWall, wallLength, worldToWallLocal } from './geometry';
import { labelRectsOverlap, placeLabelRect, type LabelBounds, type LabelRect } from './labelLayout';
import { formatMeasurementLabel } from './measurement';

const formatLength = (mm: number) => `${(mm / 1000).toFixed(2)} m`;
const formatDeviceLength = (mm: number) => `${Math.round(mm / 10)} cm`;

export function formatWallRouteMetadata(subtype: string, kind: 'cable' | 'pipe' | 'duct', totalLengthMm: number, wallLengthMm: number): string {
  const trimmedSubtype = subtype.trim();
  const genericSubtype = ['custom', `custom ${kind}`].includes(trimmedSubtype.toLocaleLowerCase());
  return `${genericSubtype || !trimmedSubtype ? '' : `${trimmedSubtype} · `}${formatLength(totalLengthMm)} tot | ${formatLength(wallLengthMm)} wall`;
}

export interface WallElevationContent {
  showDevices: boolean;
  showDeviceNames: boolean;
  showDeviceHeights: boolean;
  showDeviceOffsets: boolean;
  showRoutes: boolean;
  showRouteNames: boolean;
  showRouteMetadata: boolean;
  showMeasurements: boolean;
  showWallDimensions: boolean;
  hiddenDeviceIds: string[];
  hiddenRouteIds: string[];
  hiddenMeasurementIds: string[];
}

export function createDefaultWallElevationContent(preset?: ExportPreset): WallElevationContent {
  return {
    showDevices: true,
    showDeviceNames: preset?.showLabels ?? true,
    showDeviceHeights: preset?.showDimensions ?? true,
    showDeviceOffsets: preset?.showDimensions ?? true,
    showRoutes: true,
    showRouteNames: preset?.showLabels ?? true,
    showRouteMetadata: preset?.showRouteMetadata ?? true,
    showMeasurements: preset?.showDimensions ?? true,
    showWallDimensions: false,
    hiddenDeviceIds: [],
    hiddenRouteIds: [],
    hiddenMeasurementIds: []
  };
}

interface LabelStyle {
  fontSize: number;
  bold?: boolean;
  color: string;
  background: string;
  border: string;
  leader: string;
}

function drawCollisionAwareLabel(ctx: CanvasRenderingContext2D, lines: string[], anchorX: number, anchorY: number, bounds: LabelBounds, occupied: LabelRect[], style: LabelStyle) {
  const visibleLines = lines.map((line) => line.trim()).filter(Boolean);
  if (!visibleLines.length) return;
  ctx.save();
  ctx.font = `${style.bold ? 'bold ' : ''}${style.fontSize}px Manrope, sans-serif`;
  const paddingX = style.fontSize * .38; const paddingY = style.fontSize * .28; const lineHeight = style.fontSize * 1.22;
  const width = Math.max(...visibleLines.map((line) => ctx.measureText(line).width)) + paddingX * 2;
  const height = visibleLines.length * lineHeight + paddingY * 2;
  const rect = placeLabelRect(anchorX, anchorY, width, height, bounds, occupied, Math.max(2, style.fontSize * .28));
  const nearestX = Math.min(rect.x + rect.width, Math.max(rect.x, anchorX));
  const nearestY = Math.min(rect.y + rect.height, Math.max(rect.y, anchorY));
  if (Math.hypot(nearestX - anchorX, nearestY - anchorY) > style.fontSize * .6) {
    ctx.strokeStyle = style.leader; ctx.lineWidth = Math.max(1, style.fontSize * .08); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(anchorX, anchorY); ctx.lineTo(nearestX, nearestY); ctx.stroke();
  }
  ctx.globalAlpha = .94; ctx.fillStyle = style.background; ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.globalAlpha = 1; ctx.strokeStyle = style.border; ctx.lineWidth = Math.max(.75, style.fontSize * .055); ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  ctx.fillStyle = style.color;
  visibleLines.forEach((line, index) => ctx.fillText(line, rect.x + paddingX, rect.y + paddingY + style.fontSize + index * lineHeight));
  ctx.restore();
  occupied.push(rect);
}

type DimensionOrientation = 'horizontal' | 'vertical';

function drawInlineDimensionLabel(ctx: CanvasRenderingContext2D, text: string, startX: number, startY: number, endX: number, endY: number, orientation: DimensionOrientation, bounds: LabelBounds, occupied: LabelRect[], style: LabelStyle) {
  const label = text.trim();
  if (!label) return;
  ctx.save();
  ctx.font = `${style.bold ? 'bold ' : ''}${style.fontSize}px Manrope, sans-serif`;
  const textWidth = ctx.measureText(label).width;
  const padding = Math.max(2, style.fontSize * .28);
  const horizontal = orientation === 'horizontal';
  const width = horizontal ? textWidth + padding * 2 : style.fontSize * 1.45 + padding * 2;
  const height = horizontal ? style.fontSize * 1.45 + padding * 2 : textWidth + padding * 2;
  const ratios = [.5, .34, .66, .2, .8];
  const offsets = [0, style.fontSize * 1.45, -style.fontSize * 1.45, style.fontSize * 2.7, -style.fontSize * 2.7];
  const candidates: LabelRect[] = [];
  for (const offset of offsets) for (const ratio of ratios) {
    const centerX = startX + (endX - startX) * ratio + (horizontal ? 0 : offset);
    const centerY = startY + (endY - startY) * ratio + (horizontal ? offset : 0);
    const candidate = { x: centerX - width / 2, y: centerY - height / 2, width, height };
    if (candidate.x >= bounds.left && candidate.y >= bounds.top && candidate.x + width <= bounds.right && candidate.y + height <= bounds.bottom) candidates.push(candidate);
  }
  const rect = candidates.find((candidate) => occupied.every((item) => !labelRectsOverlap(candidate, item, Math.max(1, style.fontSize * .16))))
    ?? candidates.reduce((best, candidate) => {
      const score = occupied.filter((item) => labelRectsOverlap(candidate, item, 1)).length;
      const bestScore = occupied.filter((item) => labelRectsOverlap(best, item, 1)).length;
      return score < bestScore ? candidate : best;
    }, candidates[0]);
  if (!rect) { ctx.restore(); return; }
  const centerX = rect.x + rect.width / 2; const centerY = rect.y + rect.height / 2;
  ctx.translate(centerX, centerY);
  if (!horizontal) ctx.rotate(-Math.PI / 2);
  const boxWidth = horizontal ? rect.width : rect.height;
  const boxHeight = horizontal ? rect.height : rect.width;
  ctx.globalAlpha = .8;
  ctx.fillStyle = style.background;
  ctx.fillRect(-boxWidth / 2, -boxHeight / 2, boxWidth, boxHeight);
  ctx.globalAlpha = 1;
  ctx.fillStyle = style.color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 0, 0);
  ctx.restore();
  occupied.push(rect);
}

function drawDimensionArrowhead(ctx: CanvasRenderingContext2D, tipX: number, tipY: number, direction: number, size: number) {
  const baseX = tipX - Math.cos(direction) * size;
  const baseY = tipY - Math.sin(direction) * size;
  const halfWidth = size * .48;
  const normalX = -Math.sin(direction) * halfWidth;
  const normalY = Math.cos(direction) * halfWidth;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(baseX + normalX, baseY + normalY);
  ctx.lineTo(baseX - normalX, baseY - normalY);
  ctx.closePath();
  ctx.fill();
}

function drawDimensionLine(ctx: CanvasRenderingContext2D, startX: number, startY: number, endX: number, endY: number, color: string, lineWidth: number, scaleFactor: number, dash: number[] = []) {
  const length = Math.hypot(endX - startX, endY - startY);
  if (length < .5) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.setLineDash([]);
  const arrowSize = Math.min(5 * scaleFactor, length * .22);
  if (arrowSize >= 1.5 * scaleFactor) {
    const direction = Math.atan2(endY - startY, endX - startX);
    drawDimensionArrowhead(ctx, startX, startY, direction + Math.PI, arrowSize);
    drawDimensionArrowhead(ctx, endX, endY, direction, arrowSize);
  }
  ctx.restore();
}

export interface ChainedDimensionSpan {
  startMm: number;
  endMm: number;
}

export function buildChainedDeviceOffsetSpans(positionsMm: number[], wallLengthMm: number, toleranceMm = 1): ChainedDimensionSpan[] {
  const maximum = Math.max(0, wallLengthMm);
  const positions = positionsMm
    .filter(Number.isFinite)
    .map((position) => Math.min(maximum, Math.max(0, position)))
    .sort((a, b) => a - b)
    .reduce<number[]>((unique, position) => {
      if (!unique.length || Math.abs(position - unique[unique.length - 1]) > toleranceMm) unique.push(position);
      return unique;
    }, []);
  const anchors = [0, ...positions.filter((position) => position > toleranceMm)];
  return anchors.slice(1).map((endMm, index) => ({ startMm: anchors[index], endMm }));
}

export function renderWallElevation(canvas: HTMLCanvasElement, project: ProjectSnapshot, wall: Wall, preset: ExportPreset, content = createDefaultWallElevationContent(preset), caption = '') {
  const width = Math.max(400, Math.round(preset.width * preset.scale));
  const height = Math.max(300, Math.round(preset.height * preset.scale));
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas rendering is not supported.');
  const dark = preset.style === 'dark';
  const background = dark ? '#11171b' : '#ffffff';
  const ink = dark ? '#eaf0f2' : '#172126';
  const muted = dark ? '#93a2aa' : '#5f6c72';
  const labelBackground = dark ? '#182126' : '#ffffff';
  const labelBorder = dark ? '#526168' : '#c7d0cd';
  const accent = '#22c982';
  if (!preset.transparent) { ctx.fillStyle = background; ctx.fillRect(0, 0, width, height); }
  const scaleFactor = preset.scale;
  const categoryMap = new Map(project.categories.map((category) => [category.serviceCategory, category]));
  const hiddenDevices = new Set(content.hiddenDeviceIds); const hiddenRoutes = new Set(content.hiddenRouteIds); const hiddenMeasurements = new Set(content.hiddenMeasurementIds);
  const isOpening = (typeId: string) => ['door-opening', 'window-opening'].includes(typeId);
  const wallObjects = project.devices.filter((device) => device.wallId === wall.id && !device.hidden);
  const openings = wallObjects.filter((device) => isOpening(device.typeId));
  const technicalDevices = content.showDevices ? wallObjects.filter((device) => !isOpening(device.typeId) && !hiddenDevices.has(device.id)) : [];
  const devices = [...openings, ...technicalDevices];
  const routeEntries = content.showRoutes ? project.routes.filter((route) => route.wallIds.includes(wall.id) && !route.hidden && !hiddenRoutes.has(route.id)).map((route) => {
    const associatedWalls = project.walls.filter((candidate) => route.wallIds.includes(candidate.id));
    const bendRadius = project.preferences.routeBendRadiusMm[route.serviceCategory] ?? 0;
    const points = roundedRoutePoints(route.points, bendRadius, associatedWalls);
    return { route, segments: routeSegmentsOnWall({ ...route, points }, wall), totalLength: routeLength(route, bendRadius, associatedWalls) };
  }).filter((item) => item.segments.length) : [];
  const legendServices = preset.showLegend ? [...new Set(routeEntries.map(({ route }) => route.serviceCategory))] : [];
  const legendColumns = Math.min(3, Math.max(1, legendServices.length));
  const legendRows = Math.ceil(legendServices.length / legendColumns);
  const hasCaption = Boolean(caption.trim());
  const titleBlockHeight = preset.showTitleBlock ? (hasCaption ? 48 : 35) * scaleFactor : 0;
  const legendHeight = legendServices.length ? (14 + legendRows * 10) * scaleFactor : 0;
  const titleHeight = Math.max(titleBlockHeight, legendHeight);
  const margin = 34 * scaleFactor;
  const wallWidth = wallLength(wall); const wallHeight = wall.heightMm;
  const pxPerMm = Math.min((width - margin * 2) / wallWidth, (height - margin * 2 - titleHeight) / wallHeight);
  const x0 = (width - wallWidth * pxPerMm) / 2;
  const y0 = height - titleHeight - margin;
  const labelBounds: LabelBounds = { left: margin * .24, top: margin * .2, right: width - margin * .24, bottom: height - titleHeight - 5 * scaleFactor };
  const occupied: LabelRect[] = [];
  const labelStyle = (fontSize: number, bold = false, color = ink): LabelStyle => ({ fontSize: fontSize * scaleFactor, bold, color, background: labelBackground, border: labelBorder, leader: muted });
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = Math.max(1, 1.3 * scaleFactor);
  ctx.font = `${12 * scaleFactor}px Manrope, sans-serif`;
  if (preset.showWallOutline) {
    ctx.setLineDash([]); ctx.strokeRect(x0, y0 - wallHeight * pxPerMm, wallWidth * pxPerMm, wallHeight * pxPerMm);
  }

  const deviceDrawings = devices.map((device) => {
    const local = device.distanceAlongWallMm == null ? worldToWallLocal(wall, device.position) : { distanceAlongMm: device.distanceAlongWallMm, heightMm: device.heightFromFloorMm, depthMm: device.depthInsideWallMm ?? 0 };
    const w = Math.max(9 * scaleFactor, device.dimensions.width * pxPerMm); const h = Math.max(9 * scaleFactor, device.dimensions.height * pxPerMm);
    const x = x0 + local.distanceAlongMm * pxPerMm - w / 2; const y = y0 - local.heightMm * pxPerMm - h / 2;
    const opening = isOpening(device.typeId);
    ctx.fillStyle = categoryMap.get(device.serviceCategory)?.color ?? accent; ctx.globalAlpha = dark ? .95 : .86; if (!opening) ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1;
    ctx.strokeStyle = opening ? categoryMap.get(device.serviceCategory)?.color ?? accent : ink; ctx.setLineDash(opening ? [8 * scaleFactor, 5 * scaleFactor] : []); ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
    occupied.push({ x: x - 2 * scaleFactor, y: y - 2 * scaleFactor, width: w + 4 * scaleFactor, height: h + 4 * scaleFactor });
    return { device, local, w, h, x, y, opening };
  });
  for (const { route, segments } of routeEntries) {
    const category = categoryMap.get(route.serviceCategory);
    ctx.strokeStyle = category?.color ?? accent; ctx.lineWidth = Math.max(2, (route.kind === 'duct' ? 5 : 3) * scaleFactor);
    ctx.setLineDash(category?.pattern === 'solid' ? [] : [10 * scaleFactor, 6 * scaleFactor]);
    for (const [start, end] of segments) {
      const a = worldToWallLocal(wall, start); const b = worldToWallLocal(wall, end);
      ctx.beginPath(); ctx.moveTo(x0 + a.distanceAlongMm * pxPerMm, y0 - a.heightMm * pxPerMm); ctx.lineTo(x0 + b.distanceAlongMm * pxPerMm, y0 - b.heightMm * pxPerMm); ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  if (content.showDeviceNames) for (const drawing of deviceDrawings) {
    if (!drawing.opening) drawCollisionAwareLabel(ctx, [drawing.device.name], drawing.x + drawing.w / 2, drawing.y, labelBounds, occupied, labelStyle(8, true));
  }

  if (content.showDeviceHeights) for (const drawing of deviceDrawings) {
    if (drawing.opening) continue;
    const centerX = drawing.x + drawing.w / 2; const centerY = drawing.y + drawing.h / 2;
    drawDimensionLine(ctx, centerX, y0, centerX, centerY, muted, scaleFactor, scaleFactor, [3 * scaleFactor, 4 * scaleFactor]);
    drawInlineDimensionLabel(ctx, formatDeviceLength(drawing.local.heightMm), centerX, y0, centerX, centerY, 'vertical', labelBounds, occupied, labelStyle(7, false, muted));
  }

  const dimensionedDevices = deviceDrawings.filter((drawing) => !drawing.opening);
  if (content.showDeviceOffsets && dimensionedDevices.length) {
    const spans = buildChainedDeviceOffsetSpans(dimensionedDevices.map((drawing) => drawing.local.distanceAlongMm), wallWidth);
    const dimensionY = y0 - 14 * scaleFactor;
    for (const span of spans) {
      const ax = x0 + span.startMm * pxPerMm; const bx = x0 + span.endMm * pxPerMm;
      drawDimensionLine(ctx, ax, dimensionY, bx, dimensionY, muted, scaleFactor, scaleFactor, [8 * scaleFactor, 3 * scaleFactor, 2 * scaleFactor, 3 * scaleFactor]);
      drawInlineDimensionLabel(ctx, formatDeviceLength(span.endMm - span.startMm), ax, dimensionY, bx, dimensionY, 'horizontal', labelBounds, occupied, labelStyle(6.8, false, muted));
    }
  }

  if (content.showRouteNames) for (const { route, segments, totalLength } of routeEntries) {
    const longest = segments.reduce((best, segment) => distance3(...segment) > distance3(...best) ? segment : best, segments[0]);
    const middlePoint = { x: (longest[0].x + longest[1].x) / 2, y: (longest[0].y + longest[1].y) / 2, z: (longest[0].z + longest[1].z) / 2 }; const middle = worldToWallLocal(wall, middlePoint);
    const length = segments.reduce((sum, segment) => sum + distance3(...segment), 0);
    drawCollisionAwareLabel(ctx, [
      `${route.kind.toUpperCase()} · ${route.name}`,
      content.showRouteMetadata ? formatWallRouteMetadata(route.subtype, route.kind, totalLength, length) : ''
    ], x0 + middle.distanceAlongMm * pxPerMm, y0 - middle.heightMm * pxPerMm, labelBounds, occupied, labelStyle(7.5, true));
  }

  const measurements = content.showMeasurements ? project.measurements.filter((item) => item.wallId === wall.id && item.visible && !hiddenMeasurements.has(item.id)) : [];
  for (const measurement of measurements) {
    const a = worldToWallLocal(wall, measurement.start); const b = worldToWallLocal(wall, measurement.end);
    const ax = x0 + a.distanceAlongMm * pxPerMm; const ay = y0 - a.heightMm * pxPerMm;
    const bx = x0 + b.distanceAlongMm * pxPerMm; const by = y0 - b.heightMm * pxPerMm;
    drawDimensionLine(ctx, ax, ay, bx, by, muted, scaleFactor, scaleFactor);
    drawCollisionAwareLabel(ctx, [formatMeasurementLabel(measurement.text, distance3(measurement.start, measurement.end))], (ax + bx) / 2, (ay + by) / 2, labelBounds, occupied, labelStyle(9));
  }

  if (content.showWallDimensions) {
    const dimensionY = y0 + 24 * scaleFactor;
    drawDimensionLine(ctx, x0, dimensionY, x0 + wallWidth * pxPerMm, dimensionY, muted, scaleFactor, scaleFactor);
    drawCollisionAwareLabel(ctx, [formatLength(wallWidth)], x0 + wallWidth * pxPerMm / 2, dimensionY, labelBounds, occupied, labelStyle(10, true));
    const dimensionX = x0 - 24 * scaleFactor;
    drawDimensionLine(ctx, dimensionX, y0, dimensionX, y0 - wallHeight * pxPerMm, muted, scaleFactor, scaleFactor);
    drawCollisionAwareLabel(ctx, [formatLength(wallHeight)], dimensionX, y0 - wallHeight * pxPerMm / 2, labelBounds, occupied, labelStyle(10, true));
  }

  if (preset.showTitleBlock) {
    const roomNames = project.rooms.filter((room) => room.wallIds.includes(wall.id)).map((room) => room.name).join(', ');
    const footerTop = height - titleHeight;
    ctx.strokeStyle = muted; ctx.lineWidth = scaleFactor; ctx.beginPath(); ctx.moveTo(margin, footerTop + 1 * scaleFactor); ctx.lineTo(width - margin, footerTop + 1 * scaleFactor); ctx.stroke();
    ctx.fillStyle = ink; ctx.font = `bold ${11 * scaleFactor}px Manrope, sans-serif`; ctx.fillText(project.title, margin, footerTop + 14 * scaleFactor, width * .42);
    if (hasCaption) { ctx.font = `bold ${8 * scaleFactor}px Manrope, sans-serif`; ctx.fillText(caption.trim(), margin, footerTop + 26 * scaleFactor, width * .42); }
    ctx.font = `${7 * scaleFactor}px Manrope, sans-serif`;
    const meta = [preset.includeWallName ? `Wall: ${wall.name}` : '', preset.includeRoomName && roomNames ? `Room: ${roomNames}` : '', preset.includeExportDate ? `Export: ${new Date().toLocaleDateString('en-GB')}` : ''].filter(Boolean).join('  ·  ');
    ctx.fillText(meta, margin, footerTop + (hasCaption ? 38 : 27) * scaleFactor, width * .42);
  }

  if (legendServices.length) {
    const footerTop = height - titleHeight;
    if (!preset.showTitleBlock) { ctx.strokeStyle = muted; ctx.lineWidth = scaleFactor; ctx.beginPath(); ctx.moveTo(margin, footerTop + scaleFactor); ctx.lineTo(width - margin, footerTop + scaleFactor); ctx.stroke(); }
    const legendLeft = Math.max(width * .52, margin); const legendRight = width - margin; const cellWidth = (legendRight - legendLeft) / legendColumns;
    ctx.font = `${6.5 * scaleFactor}px Manrope, sans-serif`;
    legendServices.forEach((service, index) => {
      const column = index % legendColumns; const row = Math.floor(index / legendColumns);
      const x = legendLeft + column * cellWidth; const y = footerTop + (12 + row * 10) * scaleFactor;
      const category = categoryMap.get(service); const name = category?.name ?? service;
      ctx.strokeStyle = category?.color ?? accent; ctx.lineWidth = 2.4 * scaleFactor; ctx.setLineDash(category?.pattern === 'solid' ? [] : [5 * scaleFactor, 3 * scaleFactor]);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 14 * scaleFactor, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = ink; ctx.fillText(name, x + 18 * scaleFactor, y + 2 * scaleFactor, Math.max(10, cellWidth - 21 * scaleFactor));
    });
  }
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg' = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Image generation failed.')), type, quality));
}

export function wallExportName(project: ProjectSnapshot, wall: Wall, extension: 'png' | 'pdf' = 'png'): string {
  const room = project.rooms.find((item) => item.wallIds.includes(wall.id));
  return batchExportFilename(project.title, room?.name ?? 'Unassigned', wall.name).replace(/\.png$/i, `.${extension}`);
}

export function wallExportFiles(project: ProjectSnapshot, walls: Wall[], extension: 'png' | 'pdf' = 'png'): Array<{ wall: Wall; fileName: string }> {
  const seen = new Map<string, number>();
  return walls.map((wall) => {
    const baseName = wallExportName(project, wall, extension); const key = baseName.toLocaleLowerCase(); const occurrence = (seen.get(key) ?? 0) + 1; seen.set(key, occurrence);
    if (occurrence === 1) return { wall, fileName: baseName };
    const dot = baseName.lastIndexOf('.'); const stem = dot >= 0 ? baseName.slice(0, dot) : baseName; const suffix = dot >= 0 ? baseName.slice(dot) : '';
    return { wall, fileName: `${stem}-${occurrence}${suffix}` };
  });
}
