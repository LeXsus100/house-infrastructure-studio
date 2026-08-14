import type { ExportPreset, ProjectSnapshot, Wall } from '../../shared/types';
import { batchExportFilename, distance3, roundedRoutePoints, routeSegmentsOnWall, wallLength, worldToWallLocal } from './geometry';

const formatLength = (mm: number) => `${(mm / 1000).toFixed(2)} m`;
const formatDeviceLength = (mm: number) => `${(mm / 10).toFixed(1)} cm`;

export function renderWallElevation(canvas: HTMLCanvasElement, project: ProjectSnapshot, wall: Wall, preset: ExportPreset) {
  const width = Math.max(400, Math.round(preset.width * preset.scale));
  const height = Math.max(300, Math.round(preset.height * preset.scale));
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas rendering is not supported.');
  const dark = preset.style === 'dark';
  const background = dark ? '#11171b' : '#f8fafb';
  const ink = dark ? '#eaf0f2' : '#172126';
  const muted = dark ? '#93a2aa' : '#5f6c72';
  const accent = '#22c982';
  if (!preset.transparent) { ctx.fillStyle = background; ctx.fillRect(0, 0, width, height); }
  const scaleFactor = preset.scale;
  const margin = 80 * scaleFactor;
  const titleHeight = preset.showTitleBlock ? 120 * scaleFactor : 30 * scaleFactor;
  const wallWidth = wallLength(wall); const wallHeight = wall.heightMm;
  const pxPerMm = Math.min((width - margin * 2) / wallWidth, (height - margin * 2 - titleHeight) / wallHeight);
  const x0 = (width - wallWidth * pxPerMm) / 2;
  const y0 = height - titleHeight - margin;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = Math.max(1, 1.3 * scaleFactor);
  ctx.font = `${12 * scaleFactor}px Manrope, sans-serif`;
  if (preset.showWallOutline) {
    ctx.setLineDash([]); ctx.strokeRect(x0, y0 - wallHeight * pxPerMm, wallWidth * pxPerMm, wallHeight * pxPerMm);
  }

  const categoryMap = new Map(project.categories.map((category) => [category.serviceCategory, category]));
  const devices = project.devices.filter((device) => device.wallId === wall.id && !device.hidden);
  for (const device of devices) {
    const local = device.distanceAlongWallMm == null ? worldToWallLocal(wall, device.position) : { distanceAlongMm: device.distanceAlongWallMm, heightMm: device.heightFromFloorMm, depthMm: device.depthInsideWallMm ?? 0 };
    const w = Math.max(9 * scaleFactor, device.dimensions.width * pxPerMm); const h = Math.max(9 * scaleFactor, device.dimensions.height * pxPerMm);
    const x = x0 + local.distanceAlongMm * pxPerMm - w / 2; const y = y0 - local.heightMm * pxPerMm - h / 2;
    const opening = ['door-opening', 'window-opening'].includes(device.typeId);
    ctx.fillStyle = categoryMap.get(device.serviceCategory)?.color ?? accent; ctx.globalAlpha = dark ? .95 : .86; if (!opening) ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1;
    ctx.strokeStyle = opening ? categoryMap.get(device.serviceCategory)?.color ?? accent : ink; ctx.setLineDash(opening ? [8 * scaleFactor, 5 * scaleFactor] : []); ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
    if (preset.showLabels) { ctx.fillStyle = ink; ctx.font = `bold ${11 * scaleFactor}px Manrope, sans-serif`; ctx.fillText(device.name, x, y - 7 * scaleFactor); }
    if (preset.showDimensions) {
      ctx.strokeStyle = muted; ctx.setLineDash([3 * scaleFactor, 3 * scaleFactor]); ctx.beginPath(); ctx.moveTo(x + w / 2, y0); ctx.lineTo(x + w / 2, y + h / 2); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = muted; ctx.font = `${9 * scaleFactor}px Manrope, sans-serif`; ctx.fillText(formatDeviceLength(local.heightMm), x + w / 2 + 4 * scaleFactor, y0 - 8 * scaleFactor);
    }
  }

  if (preset.showDimensions && devices.length) {
    const ordered = devices.map((device) => ({ device, local: device.distanceAlongWallMm == null ? worldToWallLocal(wall, device.position) : { distanceAlongMm: device.distanceAlongWallMm } })).sort((a, b) => a.local.distanceAlongMm - b.local.distanceAlongMm);
    ordered.forEach(({ device, local }, index) => {
      const x = x0 + local.distanceAlongMm * pxPerMm; const dimensionY = y0 - (18 + index * 14) * scaleFactor;
      ctx.strokeStyle = muted; ctx.lineWidth = scaleFactor; ctx.setLineDash([3 * scaleFactor, 3 * scaleFactor]); ctx.beginPath(); ctx.moveTo(x0, dimensionY); ctx.lineTo(x, dimensionY); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(x0, dimensionY - 4 * scaleFactor); ctx.lineTo(x0, dimensionY + 4 * scaleFactor); ctx.moveTo(x, dimensionY - 4 * scaleFactor); ctx.lineTo(x, dimensionY + 4 * scaleFactor); ctx.stroke();
      ctx.fillStyle = muted; ctx.font = `${8 * scaleFactor}px Manrope, sans-serif`; ctx.fillText(`← ${device.name}: ${formatLength(local.distanceAlongMm)}`, Math.min(x0, x) + 4 * scaleFactor, dimensionY - 3 * scaleFactor);
    });
    if (ordered.length > 1) {
      const dimensionY = y0 - (24 + ordered.length * 14) * scaleFactor;
      ordered.slice(1).forEach((current, index) => { const previous = ordered[index]; const ax = x0 + previous.local.distanceAlongMm * pxPerMm; const bx = x0 + current.local.distanceAlongMm * pxPerMm; ctx.strokeStyle = accent; ctx.beginPath(); ctx.moveTo(ax, dimensionY); ctx.lineTo(bx, dimensionY); ctx.stroke(); ctx.fillStyle = ink; ctx.fillText(formatLength(current.local.distanceAlongMm - previous.local.distanceAlongMm), (ax + bx) / 2 - 16 * scaleFactor, dimensionY - 3 * scaleFactor); });
    }
  }

  const routes = project.routes.filter((route) => route.wallIds.includes(wall.id) && !route.hidden).map((route) => {
    const associatedWalls = project.walls.filter((candidate) => route.wallIds.includes(candidate.id));
    const points = roundedRoutePoints(route.points, project.preferences.routeBendRadiusMm[route.serviceCategory] ?? 0, associatedWalls);
    return { route, segments: routeSegmentsOnWall({ ...route, points }, wall) };
  }).filter((item) => item.segments.length);
  for (const { route, segments } of routes) {
    const category = categoryMap.get(route.serviceCategory);
    ctx.strokeStyle = category?.color ?? accent; ctx.lineWidth = Math.max(2, (route.kind === 'duct' ? 5 : 3) * scaleFactor);
    ctx.setLineDash(category?.pattern === 'solid' ? [] : [10 * scaleFactor, 6 * scaleFactor]);
    for (const [start, end] of segments) { const a = worldToWallLocal(wall, start); const b = worldToWallLocal(wall, end); ctx.beginPath(); ctx.moveTo(x0 + a.distanceAlongMm * pxPerMm, y0 - a.heightMm * pxPerMm); ctx.lineTo(x0 + b.distanceAlongMm * pxPerMm, y0 - b.heightMm * pxPerMm); ctx.stroke(); }
    ctx.setLineDash([]);
    if (preset.showLabels) {
      const longest = segments.reduce((best, segment) => distance3(...segment) > distance3(...best) ? segment : best, segments[0]); const middlePoint = { x: (longest[0].x + longest[1].x) / 2, y: (longest[0].y + longest[1].y) / 2, z: (longest[0].z + longest[1].z) / 2 }; const middle = worldToWallLocal(wall, middlePoint);
      ctx.fillStyle = ink; ctx.font = `bold ${10 * scaleFactor}px Manrope, sans-serif`; ctx.fillText(`${route.kind.toUpperCase()} · ${route.name}`, x0 + middle.distanceAlongMm * pxPerMm + 6, y0 - middle.heightMm * pxPerMm - 6);
      if (preset.showRouteMetadata) { const length = segments.reduce((sum, segment) => sum + distance3(...segment), 0); ctx.font = `${9 * scaleFactor}px Manrope, sans-serif`; ctx.fillText(`${route.subtype || 'custom'} · ${formatLength(length)} on this wall`, x0 + middle.distanceAlongMm * pxPerMm + 6, y0 - middle.heightMm * pxPerMm + 8 * scaleFactor); }
    }
  }

  const measurements = project.measurements.filter((item) => item.wallId === wall.id && item.visible);
  if (preset.showDimensions) for (const measurement of measurements) {
    const a = worldToWallLocal(wall, measurement.start); const b = worldToWallLocal(wall, measurement.end);
    const ax = x0 + a.distanceAlongMm * pxPerMm; const ay = y0 - a.heightMm * pxPerMm;
    const bx = x0 + b.distanceAlongMm * pxPerMm; const by = y0 - b.heightMm * pxPerMm;
    ctx.strokeStyle = muted; ctx.lineWidth = scaleFactor; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.fillStyle = ink; ctx.font = `${10 * scaleFactor}px Manrope, sans-serif`; ctx.fillText(measurement.text || formatLength(distance3(measurement.start, measurement.end)), (ax + bx) / 2 + 4, (ay + by) / 2 - 4);
  }

  if (preset.showDimensions) {
    ctx.strokeStyle = muted; ctx.fillStyle = ink; ctx.lineWidth = scaleFactor; ctx.font = `bold ${11 * scaleFactor}px Manrope, sans-serif`;
    ctx.beginPath(); ctx.moveTo(x0, y0 + 24 * scaleFactor); ctx.lineTo(x0 + wallWidth * pxPerMm, y0 + 24 * scaleFactor); ctx.stroke();
    ctx.fillText(formatLength(wallWidth), x0 + wallWidth * pxPerMm / 2 - 25 * scaleFactor, y0 + 18 * scaleFactor);
    ctx.beginPath(); ctx.moveTo(x0 - 24 * scaleFactor, y0); ctx.lineTo(x0 - 24 * scaleFactor, y0 - wallHeight * pxPerMm); ctx.stroke();
    ctx.save(); ctx.translate(x0 - 32 * scaleFactor, y0 - wallHeight * pxPerMm / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(formatLength(wallHeight), 0, 0); ctx.restore();
  }

  if (preset.showLegend && routes.length) {
    const services = [...new Set(routes.map(({ route }) => route.serviceCategory))];
    let x = margin; const y = 24 * scaleFactor;
    ctx.font = `${10 * scaleFactor}px Manrope, sans-serif`;
    for (const service of services) { const category = categoryMap.get(service); ctx.strokeStyle = category?.color ?? accent; ctx.lineWidth = 3 * scaleFactor; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 24 * scaleFactor, y); ctx.stroke(); ctx.fillStyle = ink; ctx.fillText(category?.name ?? service, x + 30 * scaleFactor, y + 3 * scaleFactor); x += 150 * scaleFactor; }
  }

  if (preset.showTitleBlock) {
    const roomNames = project.rooms.filter((room) => room.wallIds.includes(wall.id)).map((room) => room.name).join(', ');
    const titleY = height - titleHeight + 18 * scaleFactor;
    ctx.strokeStyle = muted; ctx.lineWidth = scaleFactor; ctx.beginPath(); ctx.moveTo(margin, titleY - 10 * scaleFactor); ctx.lineTo(width - margin, titleY - 10 * scaleFactor); ctx.stroke();
    ctx.fillStyle = ink; ctx.font = `bold ${18 * scaleFactor}px Manrope, sans-serif`; ctx.fillText(project.title, margin, titleY + 16 * scaleFactor);
    ctx.font = `bold ${12 * scaleFactor}px Manrope, sans-serif`; ctx.fillText(preset.includeWallName ? wall.name : 'Technical wall scheme', margin, titleY + 40 * scaleFactor);
    ctx.font = `${10 * scaleFactor}px Manrope, sans-serif`; const meta = [preset.includeRoomName && roomNames ? `Room: ${roomNames}` : '', preset.includeExportDate ? `Export: ${new Date().toLocaleDateString('en-GB')}` : ''].filter(Boolean).join('  ·  '); ctx.fillText(meta, margin, titleY + 60 * scaleFactor);
  }
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG generation failed.')), 'image/png'));
}

export function wallExportName(project: ProjectSnapshot, wall: Wall): string {
  const room = project.rooms.find((item) => item.wallIds.includes(wall.id));
  return batchExportFilename(project.title, room?.name ?? 'Unassigned', wall.name);
}
