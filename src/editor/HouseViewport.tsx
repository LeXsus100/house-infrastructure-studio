import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, type ThreeEvent, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Edges, GizmoHelper, GizmoViewport, Grid, Html, Line, OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import { BufferGeometry, DoubleSide, Float32BufferAttribute, MOUSE, Quaternion, SRGBColorSpace, TextureLoader, Vector3, type Group } from 'three';
import type { Device, DevicePort, DeviceType, ProjectSnapshot, Selection, ServiceCategory, ToolMode, Vec2, Vec3, ViewMode, Wall } from '../../shared/types';
import { ceilingRouteHeight, devicePlanObstacle, devicePortWorldPosition, deviceSafeTerminalLead, distance3, floorRouteHeight, isAutomaticRoutePoint, mmToM, mToMm, nearestEndpoint, openingPlanGeometry, pointInPolygon, preferredOrthogonalPlaneRoute, preferSharedWallRoute, projectWallDrawingHitToCenterline, roundedRoutePoints, routeDeviceClearanceConflicts, routeDisplayDiameterMm, routeSegmentAvoidsOpenings, routeSegmentCrossesDeviceBody, routeSegmentDetourDevices, routeUsesTubeRendering, shortestWallRoute, simplifyRoutePoints, snapPoint, wallDrawingSnap, wallLength, wallLocalToWorld, wallRenderEndProfiles, wallRenderIntersectionCuts, wallServiceDepthMm, worldToWallLocal, type WallDrawingSnapResult, type WallRenderIntersectionCut } from '../lib/geometry';
import { WALL_PRISM_TRIANGLE_INDICES, wallPrismVerticesMm, type WallPrismBoundsMm } from '../lib/wallMesh';
import { buildPolylinePath, routeDirectionMarkerDistances, samplePolylinePath } from '../lib/polyline';
import { effectiveRiserDiameterMm, riserRouteGroups, riserRouteSlots } from '../lib/riser';
import { RackModel3D } from './RackModel3D';
import { RoutePortDialog } from '../components/RoutePortDialog';
import { routeEndpointDirectionsCoherent, type RouteEndpointRole } from '../lib/ports';
import { DeviceDetails3D, JunctionBox3D } from './DeviceDetails3D';
import { Camera } from 'lucide-react';
import type { PhotoCategory } from '../../shared/types';
import { useI18n } from '../lib/i18n';
import { clipRouteToRoom } from '../lib/roomIsolation';

export type ViewCommand = 'reset' | 'fit-house' | 'fit-selection' | 'focus-point' | 'top' | 'front' | 'rear' | 'left' | 'right' | 'iso';

interface Props {
  project: ProjectSnapshot;
  activeFloorId: string;
  selection: Selection | null;
  isolatedRoomId?: string;
  tool: ToolMode;
  viewMode: ViewMode;
  visibleServices: Set<ServiceCategory>;
  projection: 'perspective' | 'orthographic';
  viewCommand: { command: ViewCommand; nonce: number; focusPoint?: Vec3; radius?: number };
  conflictFocus?: { floorId: string; point: Vec3; solution: boolean; label?: string };
  showAllFloors: boolean;
  showAdjacentBlueprint: boolean;
  cancelToken: number;
  sceneTheme: 'light' | 'dark';
  suppressSceneLabels?: boolean;
  photoMode?: boolean;
  photoPlacementActive?: boolean;
  visiblePhotoCategories?: Set<PhotoCategory>;
  suppressRouteMotion?: boolean;
  suppressRoutes?: boolean;
  lightingMode?: boolean;
  visibleDeviceIds?: ReadonlySet<string>;
  visibleRouteIds?: ReadonlySet<string>;
  blinkingDeviceIds?: ReadonlySet<string>;
  placementType?: DeviceType;
  routeKind: 'cable' | 'pipe' | 'duct' | 'junction' | 'transition';
  routeService: ServiceCategory;
  measurementType: ProjectSnapshot['measurements'][number]['type'];
  onSelect: (selection: Selection | null, additive?: boolean) => void;
  onCreateWall: (start: Vec2, end: Vec2) => void;
  onCreateRoom: (boundary: Vec2[]) => void;
  onCreateStaircase: (path: Vec3[]) => void;
  onPlaceDevice: (position: Vec3, wallId?: string, wallSide?: Device['wallSide']) => void;
  onCreateRoute: (points: Vec3[], wallIds: string[], sourceDeviceId?: string, destinationDeviceId?: string, sourcePortId?: string, destinationPortId?: string) => boolean;
  onCreateRouteJunction: (position: Vec3, routeId?: string, wallId?: string) => void;
  onCreateMeasurement: (start: Vec3, end: Vec3, type?: ProjectSnapshot['measurements'][number]['type'], referencedObjectIds?: string[]) => void;
  onAddDevicePort: (deviceId: string, port: DevicePort) => void;
  onReassignRoutePort: (routeId: string, deviceId: string, role: RouteEndpointRole, portId: string) => void;
  onStatus: (status: { x: number; y: number; z: number; hint?: string }) => void;
  onNotice: (message: string) => void;
  onNorth: () => void;
  onPlacePhotoMarker?: (position: Vec3) => void;
  onOpenPhotoMarker?: (id: string) => void;
}

type RouteSurface = string | 'floor' | 'ceiling' | 'shaft' | 'terminal';

function CameraRig({ command, project, selection, onAzimuth, fastZoom, twoDView }: { command: Props['viewCommand']; project: ProjectSnapshot; selection: Selection | null; onAzimuth: (angle: number) => void; fastZoom: boolean; twoDView: boolean }) {
  const controls = useRef<any>(null);
  const { camera } = useThree();
  const lastNonce = useRef(-1);
  useEffect(() => {
    if (!controls.current || lastNonce.current === command.nonce) return; lastNonce.current = command.nonce;
    let target = new Vector3(0, 1.2, 0); let radius = 12;
    const points = project.walls.flatMap((wall) => [wall.start, wall.end]);
    const floorElevations = project.floors.map((floor) => floor.elevationMm);
    if (points.length) {
      const minX = Math.min(...points.map((p) => p.x)); const maxX = Math.max(...points.map((p) => p.x));
      const minZ = Math.min(...points.map((p) => p.z)); const maxZ = Math.max(...points.map((p) => p.z));
      const minY = floorElevations.length ? Math.min(...floorElevations) : 0;
      const maxY = project.floors.reduce((value, floor) => Math.max(value, floor.elevationMm + floor.ceilingHeightMm), 2700);
      target = new Vector3(mmToM((minX + maxX) / 2), mmToM((minY + maxY) / 2), mmToM((minZ + maxZ) / 2));
      radius = Math.max(5, mmToM(Math.max(maxX - minX, maxZ - minZ, maxY - minY)) * 1.4);
    }
    if (command.command === 'fit-selection' && selection?.ids[0]) {
      const wall = project.walls.find((item) => item.id === selection.ids[0]);
      const room = project.rooms.find((item) => item.id === selection.ids[0]);
      const device = project.devices.find((item) => item.id === selection.ids[0]);
      if (wall) { const floor = project.floors.find((item) => item.id === wall.floorId); target.set(mmToM((wall.start.x + wall.end.x) / 2), mmToM((floor?.elevationMm ?? 0) + wall.heightMm / 2), mmToM((wall.start.z + wall.end.z) / 2)); radius = Math.max(2.5, mmToM(Math.max(wallLength(wall), wall.heightMm)) * 1.25); }
      if (room) { const floor = project.floors.find((item) => item.id === room.floorId); const minX = Math.min(...room.boundary.map((point) => point.x)); const maxX = Math.max(...room.boundary.map((point) => point.x)); const minZ = Math.min(...room.boundary.map((point) => point.z)); const maxZ = Math.max(...room.boundary.map((point) => point.z)); target.set(mmToM((minX + maxX) / 2), mmToM((floor?.elevationMm ?? 0) + room.ceilingHeightMm / 2), mmToM((minZ + maxZ) / 2)); radius = Math.max(2.2, mmToM(Math.max(maxX - minX, maxZ - minZ, room.ceilingHeightMm)) * 1.08); }
      if (device) { const floor = project.floors.find((item) => item.id === device.floorId); target.set(mmToM(device.position.x), mmToM((floor?.elevationMm ?? 0) + device.position.y), mmToM(device.position.z)); radius = 2.5; }
    }
    if (command.command === 'focus-point' && command.focusPoint) { target.set(mmToM(command.focusPoint.x), mmToM(command.focusPoint.y), mmToM(command.focusPoint.z)); radius = command.radius ?? 2.4; }
    const effectiveCommand: ViewCommand = twoDView ? 'top' : command.command;
    const vectors: Record<ViewCommand, Vector3> = {
      reset: new Vector3(radius, radius * .75, radius), 'fit-house': new Vector3(radius, radius * .75, radius),
      'fit-selection': new Vector3(radius * .55, radius * .4, radius * .55), 'focus-point': new Vector3(radius * .7, radius * .45, radius * .7), top: new Vector3(0, radius, 0),
      front: new Vector3(0, radius * .25, radius), rear: new Vector3(0, radius * .25, -radius),
      left: new Vector3(-radius, radius * .25, 0), right: new Vector3(radius, radius * .25, 0), iso: new Vector3(radius, radius * .8, radius)
    };
    camera.up.set(0, effectiveCommand === 'top' ? 0 : 1, effectiveCommand === 'top' ? -1 : 0);
    camera.position.copy(target.clone().add(vectors[effectiveCommand])); camera.lookAt(target);
    controls.current.target.copy(target); controls.current.update();
  }, [camera, command.nonce, command.command, project, selection, twoDView]);
  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={.08} screenSpacePanning onChange={() => controls.current && onAzimuth(controls.current.getAzimuthalAngle())}
    enableRotate={!twoDView} mouseButtons={{ LEFT: -1 as never, MIDDLE: MOUSE.PAN, RIGHT: twoDView ? MOUSE.PAN : MOUSE.ROTATE }} zoomSpeed={fastZoom ? 3.2 : 1} minDistance={.6} maxDistance={180} />;
}

function MovingRouteDirectionArrows({ points, color, reverse, lightScene, motionMode }: { points: Array<[number,number,number]>; color: string; reverse: boolean; lightScene: boolean; motionMode: ProjectSnapshot['preferences']['motionMode'] }) {
  const arrows = useRef<Array<Group | null>>([]);
  const path = useMemo(() => buildPolylinePath(points), [points]);
  const markerCount = Math.max(1, Math.round(path.total / 1.6));
  const up = useMemo(() => new Vector3(0, 1, 0), []);
  const directionVector = useMemo(() => new Vector3(), []);
  useFrame(({ clock }) => {
    if (!path.total || !path.segments.length) return;
    const distances = routeDirectionMarkerDistances(path.total, clock.elapsedTime * .48, markerCount);
    arrows.current.slice(0, markerCount).forEach((arrow, index) => {
      if (!arrow) return; const distance = distances[index]; arrow.visible = distance != null;
      if (distance == null) return;
      const sample = samplePolylinePath(path, distance / path.total, reverse); if (!sample) return;
      arrow.position.set(...sample.position); arrow.quaternion.setFromUnitVectors(up, directionVector.set(...sample.direction));
    });
  });
  const outline = lightScene ? '#172126' : '#f7faf9';
  if (!path.total || motionMode === 'off') return null;
  return <>{Array.from({ length: markerCount }, (_, index) => <group key={index} ref={(node) => { arrows.current[index] = node; }} renderOrder={16}>
    <mesh><coneGeometry args={[.044, .126, 12]} /><meshBasicMaterial color={outline} depthTest depthWrite={false} /></mesh>
    <mesh><coneGeometry args={[.028, .132, 12]} /><meshBasicMaterial color={color} depthTest depthWrite={false} /></mesh>
  </group>)}</>;
}

function RouteHitTargets({ points, onClick }: { points: Array<[number, number, number]>; onClick: (event: ThreeEvent<MouseEvent>) => void }) {
  return <>{points.slice(1).map((end, index) => {
    const start = points[index]; const startVector = new Vector3(...start); const endVector = new Vector3(...end); const direction = endVector.clone().sub(startVector); const length = direction.length();
    if (length < .001) return null;
    const midpoint = startVector.clone().add(endVector).multiplyScalar(.5); const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize());
    return <mesh key={`route-hit-${index}`} position={midpoint} quaternion={quaternion} onClick={onClick}>
      <cylinderGeometry args={[.055, .055, length, 8]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </mesh>;
  })}</>;
}

function VolumetricRoute({ points, diameterMm, color, dashed, dashSize, gapSize, selected }: { points: Array<[number,number,number]>; diameterMm: number; color: string; dashed: boolean; dashSize: number; gapSize: number; selected: boolean }) {
  const radius = mmToM(diameterMm) / 2;
  const segments = useMemo(() => {
    const result: Array<{ position: [number,number,number]; quaternion: Quaternion; length: number }> = []; let cumulative = 0;
    const append = (start: Vector3, direction: Vector3, from: number, to: number) => {
      const length = to - from; if (length <= .0001) return;
      const unit = direction.clone().normalize(); const first = start.clone().addScaledVector(unit, from); const last = start.clone().addScaledVector(unit, to);
      const midpoint = first.clone().add(last).multiplyScalar(.5); const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), unit);
      result.push({ position: [midpoint.x, midpoint.y, midpoint.z], quaternion, length });
    };
    points.slice(1).forEach((endTuple, index) => {
      const start = new Vector3(...points[index]); const end = new Vector3(...endTuple); const direction = end.clone().sub(start); const length = direction.length();
      if (length <= .0001) return;
      if (!dashed) append(start, direction, 0, length);
      else {
        const period = dashSize + gapSize; const segmentEnd = cumulative + length;
        const firstInterval = Math.floor(cumulative / period); const lastInterval = Math.floor(segmentEnd / period);
        for (let interval = firstInterval; interval <= lastInterval; interval++) {
          const dashStart = interval * period; const dashEnd = dashStart + dashSize;
          const visibleStart = Math.max(cumulative, dashStart); const visibleEnd = Math.min(segmentEnd, dashEnd);
          if (visibleEnd - visibleStart > .0001) append(start, direction, visibleStart - cumulative, visibleEnd - cumulative);
        }
      }
      cumulative += length;
    });
    return result;
  }, [dashSize, dashed, gapSize, points]);
  const joints = dashed ? [] : points;
  return <group>
    {segments.map((segment, index) => <mesh key={`tube-${index}`} position={segment.position} quaternion={segment.quaternion}>
      <cylinderGeometry args={[radius, radius, segment.length, 14]} /><meshStandardMaterial color={color} roughness={.68} metalness={.04} emissive={selected ? color : '#000000'} emissiveIntensity={selected ? .25 : 0} />
    </mesh>)}
    {joints.map((point, index) => <mesh key={`joint-${index}`} position={point}><sphereGeometry args={[radius, 12, 8]} /><meshStandardMaterial color={color} roughness={.68} metalness={.04} emissive={selected ? color : '#000000'} emissiveIntensity={selected ? .25 : 0} /></mesh>)}
  </group>;
}

function BlueprintPlane({ floor, displayElevationMm }: { floor: ProjectSnapshot['floors'][number]; displayElevationMm: number }) {
  const blueprint = floor.blueprint!; const texture = useLoader(TextureLoader, blueprint.dataUrl); texture.colorSpace = SRGBColorSpace;
  const width = mmToM(blueprint.naturalWidth * blueprint.scaleMmPerPixel); const height = mmToM(blueprint.naturalHeight * blueprint.scaleMmPerPixel);
  return <mesh raycast={() => null} position={[mmToM(blueprint.offsetXmm), mmToM(displayElevationMm) + .009, mmToM(blueprint.offsetZmm)]} rotation={[-Math.PI / 2, 0, -blueprint.rotationDeg * Math.PI / 180]} renderOrder={-2}>
    <planeGeometry args={[width, height]} /><meshBasicMaterial map={texture} transparent opacity={blueprint.opacity} side={DoubleSide} depthWrite={false} />
  </mesh>;
}

function OpeningPlanMarker({ device, wall, floorElevationMm, label, selected, preview = false, suppressLabel = false, onClick, onLabelClick }: {
  device: Pick<Device, 'position' | 'distanceAlongWallMm' | 'dimensions' | 'wallSide' | 'typeId'>;
  wall: Wall;
  floorElevationMm: number;
  label: string;
  selected: boolean;
  preview?: boolean;
  suppressLabel?: boolean;
  onClick?: (event: ThreeEvent<MouseEvent>) => void;
  onLabelClick?: () => void;
}) {
  const plan = useMemo(() => openingPlanGeometry(wall, device), [device, wall]);
  const y = mmToM(floorElevationMm + wall.heightMm) + .045;
  const point = (value: Vec2): [number, number, number] => [mmToM(value.x), y, mmToM(value.z)];
  const color = selected ? '#45d99a' : device.typeId === 'door-opening' ? '#d58a36' : '#329ccc';
  const lineWidth = selected ? 4 : preview ? 3.5 : 3;
  const dashed = preview || device.typeId === 'window-opening';
  return <group renderOrder={40} onClick={onClick}>
    <Line points={plan.outline.map(point)} color={color} lineWidth={lineWidth} dashed={dashed} dashSize={.12} gapSize={.06} depthTest={false} renderOrder={40} />
    {!suppressLabel && <Html center wrapperClass="opening-plan-overlay" pointerEvents={onLabelClick ? 'auto' : 'none'} position={point(plan.labelPoint)}>
      {onLabelClick
        ? <button type="button" className={`opening-plan-label ${device.typeId === 'door-opening' ? 'door' : 'window'}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onLabelClick(); }}>{label} · {(device.dimensions.width / 1000).toFixed(2)} m</button>
        : <span className={`opening-plan-label ${device.typeId === 'door-opening' ? 'door' : 'window'}`}>{label} · {(device.dimensions.width / 1000).toFixed(2)} m</span>}
    </Html>}
  </group>;
}

interface WallRenderPart { start: number; end: number; center: number; width: number; centerY: number; height: number }

const wallRenderPart = (start: number, end: number, bottom: number, top: number): WallRenderPart => ({ start, end, center: (start + end) / 2, width: end - start, centerY: (bottom + top) / 2, height: top - bottom });

function subtractWallIntersection(part: WallRenderPart, cut: WallRenderIntersectionCut): WallRenderPart[] {
  const overlapStart = Math.max(part.start, cut.startMm); const overlapEnd = Math.min(part.end, cut.endMm);
  const bottom = part.centerY - part.height / 2; const top = part.centerY + part.height / 2; const overlapTop = Math.min(top, cut.heightMm);
  if (overlapEnd <= overlapStart || overlapTop <= bottom) return [part];
  const pieces: WallRenderPart[] = [];
  if (part.start < overlapStart) pieces.push(wallRenderPart(part.start, overlapStart, bottom, top));
  if (overlapEnd < part.end) pieces.push(wallRenderPart(overlapEnd, part.end, bottom, top));
  if (overlapTop < top) pieces.push(wallRenderPart(overlapStart, overlapEnd, overlapTop, top));
  return pieces.filter((item) => item.width > 0 && item.height > 0);
}

function wallParts(wall: Wall, wallDevices: Device[], intersectionCuts: WallRenderIntersectionCut[]) {
  const length = wallLength(wall); const parts: WallRenderPart[] = [];
  const openings = wallDevices.filter((device) => !device.hidden && ['door-opening', 'window-opening'].includes(device.typeId))
    .map((device) => ({ device, center: device.distanceAlongWallMm ?? worldToWallLocal(wall, device.position).distanceAlongMm }))
    .sort((a, b) => a.center - b.center);
  let cursor = 0;
  for (const { device, center } of openings) {
    const start = Math.max(cursor, Math.max(0, center - device.dimensions.width / 2)); const end = Math.min(length, center + device.dimensions.width / 2);
    if (start > cursor) parts.push(wallRenderPart(cursor, start, 0, wall.heightMm));
    const bottom = Math.max(0, device.position.y - device.dimensions.height / 2); const top = Math.min(wall.heightMm, device.position.y + device.dimensions.height / 2);
    if (bottom > 0 && end > start) parts.push(wallRenderPart(start, end, 0, bottom));
    if (top < wall.heightMm && end > start) parts.push(wallRenderPart(start, end, top, wall.heightMm));
    cursor = Math.max(cursor, end);
  }
  if (cursor < length) parts.push(wallRenderPart(cursor, length, 0, wall.heightMm));
  const baseParts = parts.length ? parts : [wallRenderPart(0, length, 0, wall.heightMm)];
  return intersectionCuts.reduce((items, cut) => items.flatMap((part) => subtractWallIntersection(part, cut)), baseParts);
}

function softenedStairPath(path: Vec2[], widthMm: number): Vec2[] {
  if (path.length < 3) return path;
  const result: Vec2[] = [path[0]];
  path.slice(1, -1).forEach((corner, index) => {
    const before = path[index]; const after = path[index + 2];
    const incomingLength = Math.hypot(corner.x - before.x, corner.z - before.z); const outgoingLength = Math.hypot(after.x - corner.x, after.z - corner.z);
    if (incomingLength < 1 || outgoingLength < 1) { result.push(corner); return; }
    const inX = (corner.x - before.x) / incomingLength; const inZ = (corner.z - before.z) / incomingLength; const outX = (after.x - corner.x) / outgoingLength; const outZ = (after.z - corner.z) / outgoingLength;
    const turn = Math.abs(inX * outZ - inZ * outX); const trim = Math.min(widthMm * .46, incomingLength * .28, outgoingLength * .28);
    if (turn < .35 || trim < 80) { result.push(corner); return; }
    const entry = { x: corner.x - inX * trim, z: corner.z - inZ * trim }; const exit = { x: corner.x + outX * trim, z: corner.z + outZ * trim };
    result.push(entry);
    for (const t of [.25, .5, .75]) { const inverse = 1 - t; result.push({ x: inverse * inverse * entry.x + 2 * inverse * t * corner.x + t * t * exit.x, z: inverse * inverse * entry.z + 2 * inverse * t * corner.z + t * t * exit.z }); }
    result.push(exit);
  });
  result.push(path[path.length - 1]); return result;
}

function StaircaseSteps({ device, color, xray, tailOnly = false }: { device: Device; color: string; xray: boolean; tailOnly?: boolean }) {
  const count = Math.max(3, Number(device.customProperties.find((item) => item.key === 'Step count')?.value) || 10); const stepHeight = mmToM(device.dimensions.height) / count;
  let path: Vec2[] = []; try { const parsed = JSON.parse(device.customProperties.find((item) => item.key === 'Path')?.value ?? '[]'); if (Array.isArray(parsed)) path = parsed.filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.z)); } catch { path = []; }
  const visibleStep = (index: number) => !tailOnly || index >= count - 5;
  if (path.length < 2) return <>{Array.from({ length: count }, (_, index) => visibleStep(index) ? <mesh key={index} position={[0, -mmToM(device.dimensions.height) / 2 + stepHeight * (index + .5), -mmToM(device.dimensions.depth) / 2 + mmToM(device.dimensions.depth) * (index + .5) / count]}><boxGeometry args={[mmToM(device.dimensions.width), stepHeight, mmToM(device.dimensions.depth) / count]} />{xray ? <meshBasicMaterial color={color} transparent opacity={.055} depthTest depthWrite={false} /> : <meshStandardMaterial color={color} />}</mesh> : null)}</>;
  path = softenedStairPath(path, device.dimensions.width);
  const segments = path.slice(1).map((end, index) => ({ start: path[index], end, length: Math.hypot(end.x - path[index].x, end.z - path[index].z) })); const total = segments.reduce((sum, segment) => sum + segment.length, 0) || 1; const tread = Math.max(120, total / count + 18);
  const sample = (distance: number) => { let remaining = distance; for (const segment of segments) { if (remaining <= segment.length || segment === segments.at(-1)) { const ratio = Math.max(0, Math.min(1, remaining / (segment.length || 1))); return { x: segment.start.x + (segment.end.x - segment.start.x) * ratio, z: segment.start.z + (segment.end.z - segment.start.z) * ratio, angle: Math.atan2(segment.end.x - segment.start.x, segment.end.z - segment.start.z) }; } remaining -= segment.length; } return { x: path[0].x, z: path[0].z, angle: 0 }; };
  return <>{Array.from({ length: count }, (_, index) => { if (!visibleStep(index)) return null; const point = sample(total * (index + .5) / count); return <mesh key={index} position={[mmToM(point.x - device.position.x), -mmToM(device.dimensions.height) / 2 + stepHeight * (index + .5), mmToM(point.z - device.position.z)]} rotation={[0, point.angle, 0]}><boxGeometry args={[mmToM(device.dimensions.width), stepHeight, mmToM(tread)]} />{xray ? <meshBasicMaterial color={color} transparent opacity={.055} depthTest depthWrite={false} /> : <meshStandardMaterial color={color} />}</mesh>; })}</>;
}

function SolarPanelGeometry({ device, size, color, xray }: { device: Device; size: [number,number,number]; color: string; xray: boolean }) {
  const localFloor = -mmToM(device.position.y); const supportHeight = Math.max(.65, size[1]); const panelY = localFloor + supportHeight; const legRadius = Math.max(.035, Math.min(.075, size[0] * .04)); const panelThickness = Math.min(.055, Math.max(.035, size[1] * .05));
  return <>
    <mesh position={[0, localFloor + supportHeight / 2, 0]}><cylinderGeometry args={[legRadius, legRadius, supportHeight, 18]} /><meshStandardMaterial color="#718188" roughness={.7} transparent={xray} opacity={xray ? .11 : 1} depthWrite={!xray} /></mesh>
    <mesh position={[0, localFloor + .025, 0]}><cylinderGeometry args={[legRadius * 2.4, legRadius * 2.4, .05, 24]} /><meshStandardMaterial color="#55666d" roughness={.8} transparent={xray} opacity={xray ? .11 : 1} depthWrite={!xray} /></mesh>
    <group position={[0, panelY, 0]} rotation={[-18 * Math.PI / 180, 0, 0]}>
      <mesh><boxGeometry args={[size[0], panelThickness, size[2]]} /><meshStandardMaterial color={color} transparent={xray} opacity={xray ? .11 : 1} depthWrite={!xray} roughness={.65} /></mesh>
      <mesh position={[size[0] * .34, -panelThickness, -size[2] * .3]}><boxGeometry args={[size[0] * .15, panelThickness * 1.4, size[2] * .15]} /><meshStandardMaterial color="#2d3b42" transparent={xray} opacity={xray ? .11 : 1} depthWrite={!xray} /></mesh>
      <Line points={[[0,panelThickness / 2 + .003,-size[2] * .48],[0,panelThickness / 2 + .003,size[2] * .48]]} color="#d7e7ef" lineWidth={1} transparent opacity={xray ? .22 : 1} depthWrite={!xray} />
      <Line points={[[-size[0] * .48,panelThickness / 2 + .003,0],[size[0] * .48,panelThickness / 2 + .003,0]]} color="#d7e7ef" lineWidth={1} transparent opacity={xray ? .22 : 1} depthWrite={!xray} />
    </group>
  </>;
}

function FloorTransitionGeometry({ device, size, color, xray, project }: { device: Device; size: [number,number,number]; color: string; xray: boolean; project: ProjectSnapshot }) {
  const groups = riserRouteGroups(project.routes, device.id, device.riserRouteLinks); const slots = riserRouteSlots(groups.length); const category = (service: ServiceCategory) => project.categories.find((item) => item.serviceCategory === service)?.color ?? '#f8fafc';
  return <group>
    <mesh><cylinderGeometry args={[size[0] / 2, size[0] / 2, size[1], 32]} /><meshStandardMaterial color={color} transparent opacity={xray ? .1 : .34} depthWrite={!xray} roughness={.65} /><Edges color={color} transparent opacity={xray ? .28 : .7} /></mesh>
    {groups.map((group, index) => { const route = group[0]; return <mesh key={group.map((item) => item.id).join('-')} position={[mmToM(slots[index].x), 0, mmToM(slots[index].z)]}><cylinderGeometry args={[.012,.012,Math.max(.04,size[1] * .9),10]} /><meshBasicMaterial color={route.displayColor ?? category(route.serviceCategory)} depthTest depthWrite /></mesh>; })}
  </group>;
}

function BlinkingDeviceMarker({ size }: { size: [number, number, number] }) {
  const marker = useRef<Group>(null);
  useFrame(({ clock }) => { if (!marker.current) return; const pulse = .96 + (Math.sin(clock.elapsedTime * 6) + 1) * .055; marker.current.scale.setScalar(pulse); });
  return <group ref={marker}><mesh><boxGeometry args={[size[0] + .09, size[1] + .09, size[2] + .09]} /><meshBasicMaterial color="#ff334c" wireframe transparent opacity={.9} depthTest depthWrite={false} /></mesh></group>;
}

function WallPrismGeometry(props: WallPrismBoundsMm) {
  const geometry = useMemo(() => {
    const values = wallPrismVerticesMm(props).map(mmToM);
    const result = new BufferGeometry(); result.setAttribute('position', new Float32BufferAttribute(values, 3));
    result.setIndex([...WALL_PRISM_TRIANGLE_INDICES]); result.computeVertexNormals(); result.computeBoundingBox(); result.computeBoundingSphere(); return result;
  }, [props.startNegativeX, props.startPositiveX, props.endNegativeX, props.endPositiveX, props.bottomY, props.topY, props.negativeDepth, props.positiveDepth]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <primitive object={geometry} attach="geometry" />;
}

const wallProfileOffset = (profile: { negativeDepthMm: number; positiveDepthMm: number }, depthMm: number, halfThicknessMm: number) => {
  if (halfThicknessMm <= 0) return 0; const ratio = Math.max(0, Math.min(1, (depthMm + halfThicknessMm) / (halfThicknessMm * 2)));
  return profile.negativeDepthMm + (profile.positiveDepthMm - profile.negativeDepthMm) * ratio;
};

export function HouseViewport(props: Props) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<Vec3[]>([]);
  const [draftSurfaces, setDraftSurfaces] = useState<RouteSurface[]>([]);
  const [draftDeviceIds, setDraftDeviceIds] = useState<Array<string | undefined>>([]);
  const [draftPortIds, setDraftPortIds] = useState<Array<string | undefined>>([]);
  const [hover, setHover] = useState<Vec3 | null>(null);
  const [wallSnapResult, setWallSnapResult] = useState<WallDrawingSnapResult | null>(null);
  const [wallLengthDraft, setWallLengthDraft] = useState('');
  const [fastZoom, setFastZoom] = useState(false);
  const [pendingPortDevice, setPendingPortDevice] = useState<{ device: Device; role: RouteEndpointRole; firstPortDirection?: DevicePort['direction']; allowedPortIds?: string[] }>();
  const [pendingPortError, setPendingPortError] = useState<string>();
  const [pendingCreatedPort, setPendingCreatedPort] = useState<{ deviceId: string; portId: string }>();
  const dragStart = useRef<{ x: number; y: number } | null>(null); const dragged = useRef(false); const suppressClick = useRef(false); const compassRose = useRef<HTMLSpanElement>(null);
  const floor = props.project.floors.find((item) => item.id === props.activeFloorId) ?? props.project.floors[0];
  const floorRoutingY = floorRouteHeight(props.project.preferences.floorRouteOffsetMm, props.routeKind === 'pipe' || props.routeKind === 'duct' ? props.routeKind : 'cable', props.project.preferences.routeVerticalOrder, props.project.preferences.routeSeparationMm[props.routeService] ?? 30);
  const selectedRoom = props.isolatedRoomId ? props.project.rooms.find((item) => item.id === props.isolatedRoomId) : props.selection?.type === 'room' ? props.project.rooms.find((item) => item.id === props.selection?.ids[0]) : undefined;
  const selectedWallId = props.selection?.type === 'wall' ? props.selection.ids[0] : undefined;
  const categoryMap = useMemo(() => new Map(props.project.categories.map((category) => [category.serviceCategory, category])), [props.project.categories]);
  const wallMap = useMemo(() => new Map(props.project.walls.map((wall) => [wall.id, wall])), [props.project.walls]);
  const floorMap = useMemo(() => new Map(props.project.floors.map((item) => [item.id, item])), [props.project.floors]);
  const deviceTypeMap = useMemo(() => new Map(props.project.deviceTypes.map((item) => [item.id, item])), [props.project.deviceTypes]);
  const deviceMap = useMemo(() => new Map(props.project.devices.map((item) => [item.id, item])), [props.project.devices]);
  const wallDevices = useMemo(() => {
    const indexed = new Map<string, Device[]>();
    props.project.devices.forEach((device) => { if (device.wallId) { const devices = indexed.get(device.wallId); if (devices) devices.push(device); else indexed.set(device.wallId, [device]); } });
    return indexed;
  }, [props.project.devices]);
  const wallIntersectionCutsMap = useMemo(() => new Map(props.project.walls.map((wall) => [wall.id, wallRenderIntersectionCuts(wall, props.project.walls)])), [props.project.walls]);
  const wallPartsMap = useMemo(() => new Map(props.project.walls.map((wall) => [wall.id, wallParts(wall, wallDevices.get(wall.id) ?? [], wallIntersectionCutsMap.get(wall.id) ?? [])])), [props.project.walls, wallDevices, wallIntersectionCutsMap]);
  const wallJoinMap = useMemo(() => new Map(props.project.walls.map((wall) => [wall.id, wallRenderEndProfiles(wall, props.project.walls)])), [props.project.walls]);
  const updateCompassAzimuth = useCallback((angle: number) => {
    if (compassRose.current) compassRose.current.style.transform = `rotate(${-angle}rad)`;
  }, []);
  const roomContains = (point: Vec2, marginMm = 160) => {
    if (!selectedRoom) return false; if (pointInPolygon(point, selectedRoom.boundary)) return true;
    return selectedRoom.boundary.some((start, index) => { const end = selectedRoom.boundary[(index + 1) % selectedRoom.boundary.length]; const dx = end.x - start.x; const dz = end.z - start.z; const lengthSquared = dx * dx + dz * dz || 1; const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared)); return Math.hypot(point.x - (start.x + dx * ratio), point.z - (start.z + dz * ratio)) <= marginMm; });
  };
  const isolatedWallIds = useMemo(() => {
    if (!selectedRoom) return new Set<string>(); const ids = new Set(selectedRoom.wallIds);
    props.project.walls.filter((wall) => wall.floorId === selectedRoom.floorId).forEach((wall) => { const middle = { x: (wall.start.x + wall.end.x) / 2, z: (wall.start.z + wall.end.z) / 2 }; if (roomContains(wall.start, wall.thicknessMm / 2 + 180) || roomContains(wall.end, wall.thicknessMm / 2 + 180) || roomContains(middle, wall.thicknessMm / 2 + 180)) ids.add(wall.id); }); return ids;
  }, [props.project.walls, selectedRoom]);
  const clearDraft = () => { setDraft([]); setDraftSurfaces([]); setDraftDeviceIds([]); setDraftPortIds([]); setHover(null); setWallSnapResult(null); setWallLengthDraft(''); setPendingPortDevice(undefined); setPendingCreatedPort(undefined); };
  useEffect(clearDraft, [props.cancelToken, props.tool, props.activeFloorId]);
  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => event.key === 'Shift' && setFastZoom(true); const keyUp = (event: KeyboardEvent) => event.key === 'Shift' && setFastZoom(false); const blur = () => setFastZoom(false);
    window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp); window.addEventListener('blur', blur); return () => { window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('blur', blur); };
  }, []);
  const typedWallEnd = useMemo(() => {
    if (props.tool !== 'wall' || draft.length !== 1 || !hover) return null; const metres = Number(wallLengthDraft.replace(',', '.')); if (!Number.isFinite(metres) || metres <= 0) return null;
    const dx = hover.x - draft[0].x; const dz = hover.z - draft[0].z; const length = Math.hypot(dx, dz); if (length < 1) return null;
    return { x: Math.round(draft[0].x + dx / length * metres * 1000), y: 0, z: Math.round(draft[0].z + dz / length * metres * 1000) };
  }, [draft, hover, props.tool, wallLengthDraft]);
  useEffect(() => {
    const onWallLengthKey = (event: KeyboardEvent) => {
      if (props.tool !== 'wall' || draft.length !== 1 || event.ctrlKey || event.metaKey || event.altKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      if (/^[0-9.,]$/.test(event.key)) { event.preventDefault(); event.stopImmediatePropagation(); setWallLengthDraft((value) => event.key === ',' || event.key === '.' ? /[.,]/.test(value) ? value : `${value}${event.key}` : `${value}${event.key}`); return; }
      if (event.key === 'Backspace' && wallLengthDraft) { event.preventDefault(); event.stopImmediatePropagation(); setWallLengthDraft((value) => value.slice(0, -1)); return; }
      if (event.key === 'Enter' && typedWallEnd) { event.preventDefault(); event.stopImmediatePropagation(); props.onCreateWall(draft[0], typedWallEnd); clearDraft(); }
    };
    window.addEventListener('keydown', onWallLengthKey, true); return () => window.removeEventListener('keydown', onWallLengthKey, true);
  }, [draft, props.tool, props.onCreateWall, typedWallEnd, wallLengthDraft]);

  const shouldIgnoreClick = () => { if (!suppressClick.current) return false; suppressClick.current = false; return true; };
  const snap = (point: Vec3, disabled = false, gridDisabled = false): Vec3 => {
    const usesArchitecturalSnap = props.tool === 'wall' || props.tool === 'structure';
    if (disabled) { if (usesArchitecturalSnap) setWallSnapResult(null); return point; }
    let horizontal = { x: point.x, z: point.z };
    if (usesArchitecturalSnap) {
      const floorWalls = props.project.walls.filter((wall) => wall.floorId === floor.id && !wall.hidden);
      const structureStart = props.placementType?.id === 'staircase' && draft.length ? draft[draft.length - 1] : undefined;
      const start = props.tool === 'wall' ? draft[0] : structureStart;
      const result = wallDrawingSnap(horizontal, start ? { x: start.x, z: start.z } : undefined, floorWalls, props.project.preferences.gridSizeMm, props.project.preferences.snapToGrid && !gridDisabled, props.project.preferences.snapToEndpoints);
      setWallSnapResult(result.kind === 'free' ? null : result); return { ...point, ...result.point };
    }
    if (props.project.preferences.snapToGrid) horizontal = snapPoint(horizontal, props.project.preferences.gridSizeMm);
    if (props.project.preferences.snapToEndpoints) {
      const floorWalls = props.project.walls.filter((wall) => wall.floorId === floor.id);
      horizontal = nearestEndpoint(horizontal, floorWalls, 180) ?? horizontal;
    }
    return { ...point, ...horizontal };
  };
  const eventPoint = (event: ThreeEvent<PointerEvent | MouseEvent>, wallId?: string): Vec3 => {
    let rawPoint = { x: mToMm(event.point.x), y: mToMm(event.point.y) - floor.elevationMm, z: mToMm(event.point.z) };
    if (props.photoMode) return rawPoint;
    if (wallId && (props.tool === 'device' || props.tool === 'container')) return rawPoint;
    if (wallId && (props.tool === 'wall' || props.tool === 'structure') && !event.nativeEvent.shiftKey) {
      const pointedWall = wallMap.get(wallId);
      if (pointedWall) rawPoint = projectWallDrawingHitToCenterline(pointedWall, rawPoint);
    }
    const disablePlacementSnap = event.nativeEvent.shiftKey && (props.tool === 'wall' || props.tool === 'room' || props.tool === 'structure');
    const disableGridOnly = props.tool === 'wall' && event.nativeEvent.ctrlKey;
    const point = snap(rawPoint, disablePlacementSnap, disableGridOnly);
    if (props.tool === 'route' && wallId) {
      const wall = props.project.walls.find((item) => item.id === wallId);
      if (wall) { const local = worldToWallLocal(wall, point); const side: -1 | 1 = local.depthMm < 0 ? -1 : 1; return wallLocalToWorld(wall, Math.max(0, Math.min(wallLength(wall), local.distanceAlongMm)), Math.max(0, Math.min(wall.heightMm, local.heightMm)), wallServiceDepthMm(wall, side)); }
    }
    return props.tool === 'wall' || props.tool === 'room' ? { ...point, y: 0 } : point;
  };
  const pointedWallSide = (event: ThreeEvent<MouseEvent>, wallId?: string): Device['wallSide'] | undefined => {
    const wall = wallId ? props.project.walls.find((item) => item.id === wallId) : undefined; if (!wall) return undefined;
    const localFaceDepth = event.face?.normal.z ?? 0; if (localFaceDepth > .5) return 'left'; if (localFaceDepth < -.5) return 'right';
    const length = wallLength(wall) || 1; const positiveDepthNormal = { x: -(wall.end.z - wall.start.z) / length, z: (wall.end.x - wall.start.x) / length }; const rayDot = event.ray.direction.x * positiveDepthNormal.x + event.ray.direction.z * positiveDepthNormal.z;
    return rayDot <= 0 ? 'left' : 'right';
  };
  const addRoutePoint = (point: Vec3, surface: RouteSurface, deviceId?: string, portId?: string) => {
    setDraft((items) => [...items, point]); setDraftSurfaces((items) => [...items, surface]); setDraftDeviceIds((items) => [...items, deviceId]); setDraftPortIds((items) => [...items, portId]);
  };
  const clickScene = (event: ThreeEvent<MouseEvent>, wallId?: string) => {
    event.stopPropagation(); if (shouldIgnoreClick()) return;
    const point = eventPoint(event, wallId);
    if (props.photoMode) { if (props.photoPlacementActive) props.onPlacePhotoMarker?.(point); return; }
    if (props.tool === 'select') { props.onSelect(null); return; }
    if (props.tool === 'structure' && props.placementType?.id === 'staircase') {
      if (!draft.length) { setDraft([point]); props.onNotice('Staircase start set. Ctrl-click intermediate corners, then click the final point without Ctrl.'); }
      else if (event.nativeEvent.ctrlKey || event.nativeEvent.metaKey) { setDraft((items) => [...items, point]); props.onNotice('Staircase corner added. Keep Ctrl pressed for more corners, or click once to finish.'); }
      else { props.onCreateStaircase([...draft, point]); clearDraft(); }
      return;
    }
    if (props.tool === 'device' || props.tool === 'structure' || props.tool === 'container') { props.onPlaceDevice(point, wallId, pointedWallSide(event, wallId)); return; }
    if (props.tool === 'wall') { if (!draft.length) setDraft([point]); else { props.onCreateWall(draft[0], point); clearDraft(); } }
    else if (props.tool === 'room') setDraft((items) => [...items, point]);
    else if (props.tool === 'route') {
      if (props.routeKind === 'junction') { props.onCreateRouteJunction(point, undefined, wallId); return; }
      if (props.routeKind === 'transition') { props.onPlaceDevice(point, wallId); return; }
      if (!draft.length) { props.onNotice('Start the route by clicking its source device.'); return; }
      addRoutePoint(wallId ? point : { ...point, y: floorRoutingY }, wallId ?? 'floor');
    }
    else if (props.tool === 'measure') { if (!draft.length) setDraft([point]); else { const end = ['height','vertical'].includes(props.measurementType) ? { x: draft[0].x, y: point.y, z: draft[0].z } : point; props.onCreateMeasurement(draft[0], end, props.measurementType); clearDraft(); } }
  };
  const adaptConcealedRoute = (requestedPoints: Vec3[], requestedSurfaces: RouteSurface[], sourceDeviceId?: string, destinationDeviceId?: string, sourcePortId?: string, destinationPortId?: string) => {
    let points: Vec3[] = [requestedPoints[0]]; let surfaces: RouteSurface[] = [requestedSurfaces[0]];
    const excludedDeviceIds = [sourceDeviceId, destinationDeviceId].filter((id): id is string => !!id);
    const clearanceDevices = props.project.devices.filter((device) => device.floorId === floor.id && !excludedDeviceIds.includes(device.id) && props.project.deviceTypes.find((type) => type.id === device.typeId)?.family !== 'structure');
    const push = (point: Vec3, surface: RouteSurface) => { if (distance3(points[points.length - 1], point) > 1 || surfaces[surfaces.length - 1] !== surface) { points.push(point); surfaces.push(surface); } };
    const terminalPoints = [requestedPoints[0], requestedPoints[requestedPoints.length - 1]];
    const pushWallSegment = (start: Vec3, end: Vec3, wallId: string) => { const wall = props.project.walls.find((item) => item.id === wallId); if (!wall) return; routeSegmentDetourDevices(wall, start, end, props.project.devices, 100, excludedDeviceIds, terminalPoints).slice(1).forEach((point) => push(point, wallId)); };
    const ceilingY = Math.max(0, ceilingRouteHeight(floor.ceilingHeightMm, props.project.preferences.ceilingRouteOffsetMm));
    const pushPlaneSegment = (start: Vec3, end: Vec3, surface: 'floor' | 'ceiling', y: number) => {
      const currentTier = props.project.preferences.routeOverlapPriorities[props.routeService] ?? 4;
      const existing = props.project.routes.filter((route) => route.floorId === floor.id).flatMap((route) => {
        const otherTier = props.project.preferences.routeOverlapPriorities[route.serviceCategory] ?? 4;
        const sharesDestination = !!destinationDeviceId && [route.sourceDeviceId, route.destinationDeviceId].includes(destinationDeviceId);
        const weight = props.project.preferences.preferSharedCorridors && sharesDestination ? -.9 : props.project.preferences.avoidRouteOverlaps ? (5 - currentTier) * (5 - otherTier) : 0;
        return weight ? route.points.slice(1).map((point, index) => ({ start: route.points[index], end: point, weight })) : [];
      });
      const obstacles = clearanceDevices.map((device) => devicePlanObstacle(device, y, 100)).filter((item): item is NonNullable<typeof item> => !!item);
      preferredOrthogonalPlaneRoute(start, end, y, existing, obstacles, props.project.preferences.routeTurnPenaltyMm).forEach((point) => push(point, surface));
    };
    const pushFloorSegment = (start: Vec3, end: Vec3) => pushPlaneSegment(start, end, 'floor', floorRoutingY);
    const activeWalls = props.project.walls.filter((wall) => wall.floorId === floor.id);
    const wallAnchor = (wall: Wall, point: Vec3) => { const local = worldToWallLocal(wall, point); const side: -1 | 1 = local.depthMm < 0 ? -1 : 1; return wallLocalToWorld(wall, Math.max(0, Math.min(wallLength(wall), local.distanceAlongMm)), Math.max(0, Math.min(wall.heightMm, local.heightMm)), wallServiceDepthMm(wall, side)); };
    const nearestWallAnchor = (position: Vec3, height: number) => activeWalls.map((wall) => { const local = worldToWallLocal(wall, position); const along = Math.max(0, Math.min(wallLength(wall), local.distanceAlongMm)); const side: -1 | 1 = local.depthMm < 0 ? -1 : 1; const point = wallLocalToWorld(wall, along, height, wallServiceDepthMm(wall, side)); return { wall, point, distance: Math.hypot(position.x - point.x, position.z - point.z) }; }).sort((a, b) => a.distance - b.distance)[0];
    const wallSurface = (surface: RouteSurface) => ['floor','ceiling','shaft','terminal'].includes(surface) ? undefined : props.project.walls.find((wall) => wall.id === surface);
    const compatibleSharedRoutes = props.project.routes.filter((route) => route.floorId === floor.id && route.kind === props.routeKind && route.serviceCategory === props.routeService);
    const commonWallIds = new Set(compatibleSharedRoutes.flatMap((route) => route.wallIds));
    const sharedWallRoutePenalty = (wallId: string, eligibleCommonWallIds: Set<string>) => {
      const priority = props.project.preferences.routeOverlapPriorities[props.routeService] ?? 4;
      const existingOnWall = props.project.routes.filter((route) => route.floorId === floor.id && route.wallIds.includes(wallId));
      const common = eligibleCommonWallIds.has(wallId) ? compatibleSharedRoutes.filter((route) => route.wallIds.includes(wallId)) : []; const unrelated = existingOnWall.filter((route) => !common.includes(route)); const targetWall = activeWalls.find((wall) => wall.id === wallId);
      const commonAttraction = common.length && props.project.preferences.preferSharedCorridors ? Math.min((targetWall ? wallLength(targetWall) : 1000) * .8, 5000) + common.length * 400 : 0;
      return props.project.preferences.routeTurnPenaltyMm + (props.project.preferences.avoidRouteOverlaps ? unrelated.length * (5 - priority) * 500 : 0) - commonAttraction;
    };
    const pushStraightWallRun = (startWall: Wall, startAnchor: Vec3, endWall: Wall, endAnchor: Vec3) => {
      const routingHeight = Math.max(0, Math.min(startAnchor.y, startWall.heightMm, endWall.heightMm));
      const startRun = { ...wallAnchor(startWall, startAnchor), y: routingHeight }; const endRun = { ...wallAnchor(endWall, endAnchor), y: routingHeight };
      if (startWall.id === endWall.id) { push(startAnchor, startWall.id); pushWallSegment(startAnchor, startRun, startWall.id); pushWallSegment(startRun, endRun, startWall.id); pushWallSegment(endRun, endAnchor, endWall.id); return; }
      const shortestPath = shortestWallRoute(activeWalls, startWall.id, endWall.id, startRun, endRun, 200);
      const eligibleCommonWallIds = new Set([...commonWallIds].filter((wallId) => wallId !== startWall.id && wallId !== endWall.id));
      const sharedCandidate = eligibleCommonWallIds.size ? shortestWallRoute(activeWalls, startWall.id, endWall.id, startRun, endRun, 200, (wallId) => sharedWallRoutePenalty(wallId, eligibleCommonWallIds)) : null;
      const sharedUsesCommonWall = !!sharedCandidate?.some((entry) => eligibleCommonWallIds.has(entry.wallId));
      const wallPath = sharedUsesCommonWall ? preferSharedWallRoute(shortestPath, sharedCandidate) : shortestPath;
      if (wallPath) {
        let previousConcealed = startRun;
        const concealedPath = wallPath.map((entry, entryIndex) => {
          const pathWall = activeWalls.find((item) => item.id === entry.wallId); if (!pathWall) return entry;
          const local = worldToWallLocal(pathWall, entry.point); const positive = wallLocalToWorld(pathWall, local.distanceAlongMm, local.heightMm, wallServiceDepthMm(pathWall, 1)); const negative = wallLocalToWorld(pathWall, local.distanceAlongMm, local.heightMm, wallServiceDepthMm(pathWall, -1));
          const startSide = worldToWallLocal(startWall, startRun).depthMm < 0 ? -1 : 1; const point = entryIndex === 0 && pathWall.id === startWall.id ? (startSide < 0 ? negative : positive) : distance3(previousConcealed, positive) <= distance3(previousConcealed, negative) ? positive : negative;
          previousConcealed = point; return { ...entry, point };
        });
        for (let index = 1; index < concealedPath.length; index++) {
          const previous = concealedPath[index - 1]; const current = concealedPath[index]; if (previous.wallId === current.wallId) continue;
          const previousWall = activeWalls.find((item) => item.id === previous.wallId); const currentWall = activeWalls.find((item) => item.id === current.wallId); if (!previousWall || !currentWall) continue;
          const a = wallLocalToWorld(previousWall, 0, previous.point.y, worldToWallLocal(previousWall, previous.point).depthMm); const b = wallLocalToWorld(currentWall, 0, current.point.y, worldToWallLocal(currentWall, current.point).depthMm);
          const ad = { x: previousWall.end.x - previousWall.start.x, z: previousWall.end.z - previousWall.start.z }; const bd = { x: currentWall.end.x - currentWall.start.x, z: currentWall.end.z - currentWall.start.z }; const denominator = ad.x * bd.z - ad.z * bd.x;
          if (Math.abs(denominator) < .001) continue;
          const ratio = ((b.x - a.x) * bd.z - (b.z - a.z) * bd.x) / denominator; const joint = { x: Math.round(a.x + ad.x * ratio), y: previous.point.y, z: Math.round(a.z + ad.z * ratio) };
          const centralCorner = wallPath[index].point; const allowance = Math.max(500, previousWall.thicknessMm + currentWall.thicknessMm);
          if (Math.hypot(joint.x - centralCorner.x, joint.z - centralCorner.z) <= allowance) { concealedPath[index - 1] = { ...previous, point: joint }; concealedPath[index] = { ...current, point: joint }; }
        }
        push(startAnchor, startWall.id); pushWallSegment(startAnchor, startRun, startWall.id); pushWallSegment(startRun, concealedPath[0].point, startWall.id);
        concealedPath.slice(1).forEach((entry, pathIndex) => { const previous = concealedPath[pathIndex]; if (previous.wallId === entry.wallId) pushWallSegment(previous.point, entry.point, entry.wallId); else push(entry.point, entry.wallId); });
        pushWallSegment(concealedPath[concealedPath.length - 1].point, endRun, endWall.id); pushWallSegment(endRun, endAnchor, endWall.id); return;
      }
      const floorCost = Math.abs(startAnchor.y - floorRoutingY) + Math.abs(endAnchor.y - floorRoutingY); const ceilingCost = Math.abs(ceilingY - startAnchor.y) + Math.abs(ceilingY - endAnchor.y); const useCeiling = ceilingCost < floorCost; const planeY = useCeiling ? ceilingY : floorRoutingY; const planeSurface = useCeiling ? 'ceiling' : 'floor';
      const startPlane = { ...wallAnchor(startWall, startAnchor), y: planeY }; const endPlane = { ...wallAnchor(endWall, endAnchor), y: planeY };
      push(startAnchor, startWall.id); pushWallSegment(startAnchor, startPlane, startWall.id); push(startPlane, planeSurface); pushPlaneSegment(startPlane, endPlane, planeSurface, planeY); push(endPlane, endWall.id); pushWallSegment(endPlane, endAnchor, endWall.id);
    };
    for (let index = 1; index < requestedPoints.length; index++) {
      const start = requestedPoints[index - 1]; const end = requestedPoints[index]; const a = requestedSurfaces[index - 1]; const b = requestedSurfaces[index];
      if (a === b && wallSurface(a)) {
        const wall = wallSurface(a)!;
        if (wall) { const startAnchor = wallAnchor(wall, start); const endAnchor = wallAnchor(wall, end); pushStraightWallRun(wall, startAnchor, wall, endAnchor); push(end, a); continue; }
      }
      if (a === b && a === 'floor') { pushFloorSegment(start, end); push(end, 'floor'); continue; }
      if (a === b && a === 'ceiling') { pushPlaneSegment(start, end, 'ceiling', ceilingY); push(end, 'ceiling'); continue; }
      const firstWall = wallSurface(a); const secondWall = wallSurface(b);
      if (firstWall && secondWall) {
        const startAnchor = wallAnchor(firstWall, start); const endAnchor = wallAnchor(secondWall, end); pushStraightWallRun(firstWall, startAnchor, secondWall, endAnchor); push(end, secondWall.id); continue;
      }
      if (a === 'ceiling' && secondWall) { const endAnchor = wallAnchor(secondWall, end); const ceilingEnd = { ...endAnchor, y: ceilingY }; pushPlaneSegment(start, ceilingEnd, 'ceiling', ceilingY); push(ceilingEnd, secondWall.id); pushWallSegment(ceilingEnd, endAnchor, secondWall.id); push(end, secondWall.id); continue; }
      if (firstWall && b === 'ceiling') { const startAnchor = wallAnchor(firstWall, start); const ceilingStart = { ...startAnchor, y: ceilingY }; push(startAnchor, firstWall.id); pushWallSegment(startAnchor, ceilingStart, firstWall.id); push(ceilingStart, 'ceiling'); pushPlaneSegment(ceilingStart, end, 'ceiling', ceilingY); push(end, 'ceiling'); continue; }
      if (a === 'ceiling' && (b === 'floor' || b === 'terminal')) { const anchor = nearestWallAnchor(start, ceilingY); if (anchor) { pushPlaneSegment(start, anchor.point, 'ceiling', ceilingY); push(anchor.point, anchor.wall.id); const bottom = { ...anchor.point, y: floorRoutingY }; pushWallSegment(anchor.point, bottom, anchor.wall.id); push(bottom, 'floor'); pushFloorSegment(bottom, end); push(end, b); continue; } }
      if ((a === 'floor' || a === 'terminal') && b === 'ceiling') { const anchor = nearestWallAnchor(end, ceilingY); if (anchor) { const bottom = { ...anchor.point, y: floorRoutingY }; pushFloorSegment(start, bottom); push(bottom, anchor.wall.id); pushWallSegment(bottom, anchor.point, anchor.wall.id); push(anchor.point, 'ceiling'); pushPlaneSegment(anchor.point, end, 'ceiling', ceilingY); push(end, 'ceiling'); continue; } }
      if (a === 'ceiling' || b === 'ceiling') { pushPlaneSegment(start, end, 'ceiling', ceilingY); push(end, b); continue; }
      if (a === 'shaft' && (b === 'floor' || b === 'terminal')) { const bottom = { x: start.x, y: floorRoutingY, z: start.z }; push(bottom, 'shaft'); push(bottom, 'floor'); pushFloorSegment(bottom, end); push(end, b); continue; }
      if ((a === 'floor' || a === 'terminal') && b === 'shaft') { const bottom = { x: end.x, y: floorRoutingY, z: end.z }; pushFloorSegment(start, bottom); push(bottom, 'shaft'); push(end, 'shaft'); continue; }
      if (a === 'shaft' || b === 'shaft') { const floorDistance = Math.abs(start.y - floorRoutingY) + Math.abs(end.y - floorRoutingY); const planeY = Math.abs(start.y - ceilingY) + Math.abs(end.y - ceilingY) <= floorDistance ? ceilingY : floorRoutingY; const planeSurface = planeY === ceilingY ? 'ceiling' : 'floor'; const planeStart = { x: start.x, y: planeY, z: start.z }; const planeEnd = { x: end.x, y: planeY, z: end.z }; push(planeStart, 'shaft'); push(planeStart, planeSurface); pushPlaneSegment(planeStart, planeEnd, planeSurface, planeY); push(planeEnd, 'shaft'); push(end, b); continue; }
      const floorStart = { x: start.x, y: floorRoutingY, z: start.z }; const floorEnd = { x: end.x, y: floorRoutingY, z: end.z };
      if (firstWall) { const startAnchor = wallAnchor(firstWall, start); const wallBottom = { ...startAnchor, y: floorRoutingY }; push(startAnchor, firstWall.id); pushWallSegment(startAnchor, wallBottom, firstWall.id); push(wallBottom, 'floor'); pushFloorSegment(wallBottom, secondWall ? wallAnchor(secondWall, floorEnd) : floorEnd); }
      else { if (a === 'terminal') push(floorStart, 'floor'); pushFloorSegment(floorStart, secondWall ? wallAnchor(secondWall, floorEnd) : floorEnd); }
      if (secondWall) { const endAnchor = wallAnchor(secondWall, end); const wallBottom = { ...endAnchor, y: floorRoutingY }; push(wallBottom, secondWall.id); pushWallSegment(wallBottom, endAnchor, secondWall.id); push(end, secondWall.id); }
      else push(end, b);
    }
    const protectTerminal = (deviceId: string | undefined, portId: string | undefined, atStart: boolean) => {
      const device = props.project.devices.find((item) => item.id === deviceId); const port = device?.ports.find((item) => item.id === portId);
      if (!device || !port || ['junction-box', 'electrical-panel'].includes(device.typeId) || points.length < 2) return;
      const deviceFloor = props.project.floors.find((item) => item.id === device.floorId); const elevationDelta = (deviceFloor?.elevationMm ?? floor.elevationMm) - floor.elevationMm;
      const adjustedDevice = elevationDelta ? { ...device, position: { ...device.position, y: device.position.y + elevationDelta } } : device;
      const endpointIndex = atStart ? 0 : points.length - 1; const step = atStart ? 1 : -1; let anchorIndex = endpointIndex + step;
      while (anchorIndex > 0 && anchorIndex < points.length - 1 && routeSegmentCrossesDeviceBody(points[endpointIndex], points[anchorIndex], adjustedDevice)) anchorIndex += step;
      if (anchorIndex < 0 || anchorIndex >= points.length) return;
      const lead = deviceSafeTerminalLead(adjustedDevice, port, points[anchorIndex], Math.max(10, (props.project.preferences.routeDiameterMm[props.routeService] ?? 20) / 2 + 5));
      const surface = surfaces[endpointIndex];
      if (atStart) { points = [...lead].reverse().concat(points.slice(anchorIndex + 1)); surfaces = Array.from({ length: lead.length }, () => surface).concat(surfaces.slice(anchorIndex + 1)); }
      else { points = points.slice(0, anchorIndex).concat(lead); surfaces = surfaces.slice(0, anchorIndex).concat(Array.from({ length: lead.length }, () => surface)); }
    };
    protectTerminal(sourceDeviceId, sourcePortId, true); protectTerminal(destinationDeviceId, destinationPortId, false);
    return { points, surfaces };
  };
  const routeValidationError = (surfaces: RouteSurface[], points: Vec3[]) => {
    for (let index = 1; index < surfaces.length; index++) {
      const a = surfaces[index - 1]; const b = surfaces[index];
      if (a === 'terminal' || b === 'terminal') {
        if (a === 'terminal' && index === 1 || b === 'terminal' && index === surfaces.length - 1) continue;
        return 'Free-space route segments are allowed only as terminal leads at the source or destination device.';
      }
      if (a === 'ceiling' && b === 'ceiling' || a === 'shaft' || b === 'shaft') continue;
      if (a === 'floor' && b === 'floor') continue;
      if (a === 'floor' || b === 'floor' || a === 'ceiling' || b === 'ceiling') {
        if (distance3(points[index - 1], points[index]) === Math.abs(points[index - 1].y - points[index].y)) continue;
        return 'Wall-to-floor transitions must stay vertically inside the structure.';
      }
      if (a !== b) {
        const firstWall = props.project.walls.find((item) => item.id === a); const secondWall = props.project.walls.find((item) => item.id === b);
        if (distance3(points[index - 1], points[index]) <= 200 && firstWall && secondWall
          && routeSegmentAvoidsOpenings(firstWall, points[index - 1], points[index - 1], props.project.devices, 100)
          && routeSegmentAvoidsOpenings(secondWall, points[index], points[index], props.project.devices, 100)) continue;
        return 'Change walls only at a shared corner or junction; routes cannot cross room space.';
      }
      const wall = props.project.walls.find((item) => item.id === a);
      if (!wall) return 'Every route segment must be associated with an existing wall.';
      if (!routeSegmentAvoidsOpenings(wall, points[index - 1], points[index], props.project.devices, 100)) return 'Keep routes at least 10 cm away from every door and window opening.';
    }
    return null;
  };
  const commitRoute = (requestedPoints: Vec3[], requestedSurfaces: RouteSurface[], deviceIds: Array<string | undefined>, forcedDestinationId?: string, portIds = draftPortIds) => {
    const sourceId = deviceIds[0]; const destinationId = forcedDestinationId ?? deviceIds[deviceIds.length - 1];
    if (!sourceId || !destinationId || sourceId === destinationId) { const message = 'A route must connect two different technical devices.'; setPendingPortError(message); props.onNotice(message); return false; }
    const { points, surfaces } = adaptConcealedRoute(requestedPoints, requestedSurfaces, sourceId, destinationId, portIds[0], portIds[portIds.length - 1]);
    const error = routeValidationError(surfaces, points); if (error) { setPendingPortError(error); props.onNotice(error); return false; }
    const clearanceDevices = props.project.devices.filter((device) => device.floorId === floor.id);
    const clearanceConflicts = routeDeviceClearanceConflicts(points, clearanceDevices, [sourceId, destinationId], 100);
    if (clearanceConflicts.length) { const names = clearanceConflicts.map((item) => item.device.name).join(', '); const message = `The route cannot keep 10 cm clearance from ${names}. Add a control point or move the obstructing device.`; setPendingPortError(message); props.onNotice(message); return false; }
    const wallIds = [...new Set(surfaces.filter((item) => props.project.walls.some((wall) => wall.id === item)))];
    const created = props.onCreateRoute(simplifyRoutePoints(points), wallIds, sourceId, destinationId, portIds[0], portIds[portIds.length - 1]);
    if (!created) setPendingPortError('The route could not be created with the selected endpoints. Review the port directions and concealed path.');
    return created;
  };
  const finishMultiPoint = (event: ThreeEvent<MouseEvent>, wallId?: string) => {
    event.stopPropagation(); if (shouldIgnoreClick()) return;
    const point = eventPoint(event, wallId); const surface: RouteSurface = wallId ?? 'floor';
    const shouldAppend = !draft.length || distance3(draft[draft.length - 1], point) > 2;
    const points = shouldAppend ? [...draft, point] : draft; const surfaces = shouldAppend ? [...draftSurfaces, surface] : draftSurfaces;
    if (props.tool === 'route') { props.onNotice('Finish the route with one click on its destination device.'); return; }
    if (props.tool === 'room' && points.length >= 3) props.onCreateRoom(points.map(({ x, z }) => ({ x, z })));
    clearDraft();
  };
  const completePortSelection = (device: Device, port: DevicePort) => {
    const type = props.project.deviceTypes.find((item) => item.id === device.typeId);
    const rawEndpoint = devicePortWorldPosition(device, port); const deviceFloor = props.project.floors.find((item) => item.id === device.floorId); const endpoint = { ...rawEndpoint, y: rawEndpoint.y + (deviceFloor?.elevationMm ?? floor.elevationMm) - floor.elevationMm };
    const surface: RouteSurface = type?.family === 'transition' ? 'shaft' : device.wallId ?? (device.associationType === 'ceiling' ? 'ceiling' : device.associationType === 'floor' ? 'floor' : 'terminal');
    if (!draft.length) { setPendingPortError(undefined); setPendingPortDevice(undefined); addRoutePoint(endpoint, surface, device.id, port.id); props.onNotice(`Route started at ${device.name} · ${port.name}. Add control points, then click the destination device.`); return; }
    setPendingPortError(undefined);
    if (draftDeviceIds[0] === device.id) { const message = 'Choose a different destination device.'; setPendingPortError(message); props.onNotice(message); return; }
    const sourceDevice = props.project.devices.find((item) => item.id === draftDeviceIds[0]); const sourcePort = sourceDevice?.ports.find((item) => item.id === draftPortIds[0]);
    if (!routeEndpointDirectionsCoherent(sourcePort, port)) { const message = `Choose an ${sourcePort?.direction === 'output' ? 'input' : 'output'} or bidirectional destination port.`; setPendingPortError(message); props.onNotice(message); return; }
    const shouldAppend = draft.length === 1 || distance3(draft[draft.length - 1], endpoint) > 2; const points = shouldAppend ? [...draft, endpoint] : draft;
    const surfaces = shouldAppend ? [...draftSurfaces, surface] : [...draftSurfaces.slice(0, -1), surface];
    const deviceIds = shouldAppend ? [...draftDeviceIds, device.id] : [...draftDeviceIds.slice(0, -1), device.id]; const portIds = shouldAppend ? [...draftPortIds, port.id] : [...draftPortIds.slice(0, -1), port.id];
    if (points.length >= 2 && commitRoute(points, surfaces, deviceIds, device.id, portIds)) { setPendingPortDevice(undefined); clearDraft(); }
  };
  useEffect(() => {
    if (!pendingCreatedPort) return;
    const device = props.project.devices.find((item) => item.id === pendingCreatedPort.deviceId); const port = device?.ports.find((item) => item.id === pendingCreatedPort.portId);
    if (!device || !port) return;
    setPendingCreatedPort(undefined); completePortSelection(device, port);
  }, [pendingCreatedPort, props.project.devices]);
  const handleDeviceClick = (event: ThreeEvent<MouseEvent>, device: Device) => {
    if (shouldIgnoreClick()) { event.stopPropagation(); return; }
    if (props.photoMode) { event.stopPropagation(); if (props.photoPlacementActive) props.onPlacePhotoMarker?.(eventPoint(event, device.wallId)); return; }
    if (props.tool === 'measure') { event.stopPropagation(); const endpoint = { ...device.position }; props.onCreateMeasurement({ x: endpoint.x, y: 0, z: endpoint.z }, endpoint, 'height', [device.id]); return; }
    if (props.tool === 'route') {
      event.stopPropagation();
      if (props.routeKind === 'junction') { props.onNotice('Click a route segment to split it, or click a wall/floor for a standalone junction.'); return; }
      if (props.routeKind === 'transition') { props.onNotice('Place a floor transition on the plan, then choose an adjacent level.'); return; }
      const type = props.project.deviceTypes.find((item) => item.id === device.typeId);
      if (type?.family === 'structure') { if (device.typeId === 'column' && draft.length) { addRoutePoint(eventPoint(event), 'shaft'); props.onNotice('Column control point added to the concealed route.'); return; } props.onNotice('Routes connect technical service points; only a column may be used as an intermediate shaft.'); return; }
      if (device.floorId !== floor.id && !device.accessibleFloorIds?.includes(floor.id)) { props.onNotice('Start a separate route on that floor and join both routes through a floor transition.'); return; }
      const allowedPortIds = type?.family === 'transition' ? device.ports.filter((item) => item.name === floor.name).map((item) => item.id) : undefined;
      const sourceDevice = props.project.devices.find((item) => item.id === draftDeviceIds[0]); const sourcePort = sourceDevice?.ports.find((item) => item.id === draftPortIds[0]);
      setPendingPortError(undefined); setPendingPortDevice({ device, role: draft.length ? 'destination' : 'source', firstPortDirection: draft.length ? sourcePort?.direction : undefined, allowedPortIds: allowedPortIds?.length ? allowedPortIds : type?.family === 'transition' ? device.ports.slice(0,1).map((item) => item.id) : undefined }); return;
    }
    if (props.viewMode === 'xray' && device.serviceCategory === 'structural') { props.onSelect(null); return; }
    event.stopPropagation(); props.onSelect({ type: 'device', ids: [device.id] }, event.nativeEvent.ctrlKey || event.nativeEvent.metaKey);
  };

  const wallVisible = (wallId: string) => props.viewMode === 'isolate-wall' ? wallId === selectedWallId : selectedRoom ? isolatedWallIds.has(wallId) : true;
  const objectVisible = (service: ServiceCategory, roomId?: string, wallIds: string[] = [], position?: Vec2, floorId?: string) => {
    if (service !== 'structural' && !props.visibleServices.has(service)) return false;
    if (props.viewMode === 'isolate-wall') return !!selectedWallId && wallIds.includes(selectedWallId);
    if (selectedRoom) return floorId === selectedRoom.floorId && (roomId === selectedRoom.id || wallIds.some((id) => isolatedWallIds.has(id)) || !!position && roomContains(position));
    return true;
  };
  const floorVisible = (floorId: string) => selectedRoom ? floorId === selectedRoom.floorId : props.showAllFloors || floorId === floor.id;
  const deviceFloorVisible = (device: Device) => selectedRoom ? device.floorId === selectedRoom.floorId : props.showAllFloors || device.floorId === floor.id || !!device.accessibleFloorIds?.includes(floor.id);
  const adjacentFloorIds = useMemo(() => {
    const sortedFloors = [...props.project.floors].sort((a, b) => a.elevationMm - b.elevationMm); const activeIndex = sortedFloors.findIndex((item) => item.id === floor.id);
    return new Set([sortedFloors[activeIndex - 1]?.id, sortedFloors[activeIndex + 1]?.id].filter((id): id is string => !!id));
  }, [floor.id, props.project.floors]);
  const xray = props.viewMode === 'xray'; const lightScene = props.sceneTheme === 'light';
  const wallPlacementActive = !!props.placementType && (props.tool === 'device' || props.tool === 'structure')
    && (props.placementType.defaultAssociation === 'wall' || ['door-opening', 'window-opening'].includes(props.placementType.id));
  const visibleRoutes = useMemo(() => props.suppressRoutes || props.viewMode !== 'xray' ? [] : props.project.routes.flatMap((route) => {
    const routeFloorVisible = selectedRoom ? route.floorId === selectedRoom.floorId : props.showAllFloors || route.floorId === floor.id;
    if (!routeFloorVisible || route.hidden || !props.visibleServices.has(route.serviceCategory) || props.visibleRouteIds && !props.visibleRouteIds.has(route.id)) return [];
    if (!selectedRoom && props.viewMode === 'isolate-wall' && (!selectedWallId || !route.wallIds.includes(selectedWallId))) return [];
    const routeWalls = route.wallIds.map((id) => wallMap.get(id)).filter((wall): wall is Wall => !!wall);
    const geometry = roundedRoutePoints(route.points, props.project.preferences.routeBendRadiusMm[route.serviceCategory] ?? 100, routeWalls);
    const fragments = selectedRoom ? clipRouteToRoom(geometry, selectedRoom.boundary, 1000) : [geometry];
    const routeFloor = floorMap.get(route.floorId);
    if (!fragments.length || !routeFloor) return [];
    const displayFragments = fragments.map((fragment) => fragment.map((point) => [mmToM(point.x), mmToM(routeFloor.elevationMm + point.y) + (point.y === 0 ? .018 : 0), mmToM(point.z)] as [number, number, number]));
    return [{ route, displayFragments }];
  }), [floor.id, floorMap, props.project.preferences.routeBendRadiusMm, props.project.routes, props.showAllFloors, props.suppressRoutes, props.viewMode, props.visibleRouteIds, props.visibleServices, selectedRoom, selectedWallId, wallMap]);
  const drawingHover = typedWallEnd ?? (props.tool === 'measure' && hover && draft[0] && ['height','vertical'].includes(props.measurementType) ? { x: draft[0].x, y: hover.y, z: draft[0].z } : hover);
  const wallSnapLabel = wallSnapResult?.kind === 'corner' ? t('Corner snap') : wallSnapResult?.kind === 'wall' ? t('Wall snap') : wallSnapResult?.kind === 'grid' ? t('Grid snap') : wallSnapResult?.kind === 'perpendicular' ? t('Perpendicular 90°') : wallSnapResult?.kind === 'cardinal' ? (Math.abs(wallSnapResult.guideDirection?.x ?? 0) > .8 ? t('East / West axis') : t('North / South axis')) : undefined;
  const animateRouteDirection = xray && !props.suppressRouteMotion && props.project.preferences.motionMode === 'animated';
  const animateLightingSelection = !!props.blinkingDeviceIds?.size;

  return <div className={`viewport${props.tool !== 'select' ? ' viewport-creation-tool' : ''}`} aria-label="3D house infrastructure viewport"
    onWheelCapture={(event) => setFastZoom(event.shiftKey)}
    onPointerDownCapture={(event) => { if (event.button === 0) { dragStart.current = { x: event.clientX, y: event.clientY }; dragged.current = false; } }}
    onPointerMoveCapture={(event) => { if (dragStart.current && Math.hypot(event.clientX - dragStart.current.x, event.clientY - dragStart.current.y) > 6) dragged.current = true; }}
    onPointerUpCapture={() => { if (dragged.current) { suppressClick.current = true; window.setTimeout(() => { suppressClick.current = false; }, 80); } dragStart.current = null; }}
    onPointerLeave={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX > bounds.left && event.clientX < bounds.right && event.clientY > bounds.top && event.clientY < bounds.bottom) return; dragStart.current = null; setHover(null); setWallSnapResult(null); }}>
    <Canvas frameloop={animateRouteDirection || animateLightingSelection ? 'always' : 'demand'} shadows={false} gl={{ antialias: true, preserveDrawingBuffer: true }} onPointerMissed={() => props.tool === 'select' && props.onSelect(null)}>
      {props.projection === 'perspective' ? <PerspectiveCamera makeDefault position={[10, 8, 10]} fov={48} near={.05} far={500} /> : <OrthographicCamera makeDefault position={[10, 10, 10]} zoom={60} near={-500} far={500} />}
      <color attach="background" args={[lightScene ? '#f7f8f5' : '#151b1f']} /><ambientLight intensity={lightScene ? 2.5 : xray ? 2.4 : 1.8} /><directionalLight position={[8, 14, 7]} intensity={lightScene ? 1.1 : 1.6} />
      <CameraRig command={props.viewCommand} project={props.project} selection={props.selection} onAzimuth={updateCompassAzimuth} fastZoom={fastZoom} twoDView={props.projection === 'orthographic'} />
      <Grid position={[0, mmToM(floor.elevationMm) + .004, 0]} args={[60, 60]} cellSize={.5} sectionSize={1} cellThickness={.35} sectionThickness={.8}
        cellColor={lightScene ? '#d8ddda' : '#354147'} sectionColor={lightScene ? '#aab5b0' : '#5a6870'} fadeDistance={38} fadeStrength={1.8} infiniteGrid={false} />
      {floor.blueprint?.visible && <BlueprintPlane floor={floor} displayElevationMm={floor.elevationMm} />}
      {(props.tool !== 'select' || props.photoMode && props.photoPlacementActive) && <mesh position={[0, mmToM(floor.elevationMm) - .012, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={clickScene} onDoubleClick={finishMultiPoint}
        onPointerMove={(event) => { const point = eventPoint(event); setHover(point); props.onStatus(point); }}>
        <planeGeometry args={[200, 200]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>}

      {props.showAdjacentBlueprint && props.project.walls.filter((wall) => adjacentFloorIds.has(wall.floorId) && !wall.hidden).map((wall) => {
        const blueprintFloor = floorMap.get(wall.floorId)!; const isAbove = blueprintFloor.elevationMm > floor.elevationMm;
        return <Line key={`blueprint-${wall.id}`} points={[[mmToM(wall.start.x), mmToM(floor.elevationMm) + .025, mmToM(wall.start.z)], [mmToM(wall.end.x), mmToM(floor.elevationMm) + .025, mmToM(wall.end.z)]]}
          color={isAbove ? '#f59e0b' : '#38bdf8'} lineWidth={2} dashed dashSize={.18} gapSize={.1} depthTest={false} />;
      })}

      {props.project.walls.filter((wall) => floorVisible(wall.floorId) && !wall.hidden && wallVisible(wall.id)).map((wall, wallIndex) => {
        const wallFloor = floorMap.get(wall.floorId)!; const length = wallLength(wall); const angle = -Math.atan2(wall.end.z - wall.start.z, wall.end.x - wall.start.x);
        const selected = props.selection?.type === 'wall' && props.selection.ids.includes(wall.id); const joins = wallJoinMap.get(wall.id) ?? { start: { negativeDepthMm: 0, positiveDepthMm: 0, kind: 'square' as const }, end: { negativeDepthMm: 0, positiveDepthMm: 0, kind: 'square' as const } }; const parts = wallPartsMap.get(wall.id)!;
        const total = wall.structuralThicknessMm + wall.liningLeftMm + wall.liningRightMm;
        const layers = [
          { id: 'core', thickness: wall.structuralThicknessMm, depth: (wall.liningLeftMm - wall.liningRightMm) / 2, color: '#b8bfbd' },
          ...(wall.liningLeftMm ? [{ id: 'left-lining', thickness: wall.liningLeftMm, depth: -total / 2 + wall.liningLeftMm / 2, color: '#f1f2ef' }] : []),
          ...(wall.liningRightMm ? [{ id: 'right-lining', thickness: wall.liningRightMm, depth: total / 2 - wall.liningRightMm / 2, color: '#f1f2ef' }] : []),
        ].map((layer) => ({ ...layer, negativeDepth: layer.depth - layer.thickness / 2, positiveDepth: layer.depth + layer.thickness / 2 }));
        const prism = (part: WallRenderPart, negativeDepth: number, positiveDepth: number) => ({
          startNegativeX: part.start - length / 2 + (part.start <= 0 ? wallProfileOffset(joins.start, negativeDepth, total / 2) : 0),
          startPositiveX: part.start - length / 2 + (part.start <= 0 ? wallProfileOffset(joins.start, positiveDepth, total / 2) : 0),
          endNegativeX: part.end - length / 2 + (part.end >= length ? wallProfileOffset(joins.end, negativeDepth, total / 2) : 0),
          endPositiveX: part.end - length / 2 + (part.end >= length ? wallProfileOffset(joins.end, positiveDepth, total / 2) : 0),
          bottomY: part.centerY - part.height / 2, topY: part.centerY + part.height / 2, negativeDepth, positiveDepth
        });
        const xrayOpacity = selected ? .13 : .055;
        const handleWallClick = (event: ThreeEvent<MouseEvent | PointerEvent>) => { if (shouldIgnoreClick()) { event.stopPropagation(); return; } if (props.photoMode) return clickScene(event as ThreeEvent<MouseEvent>, wall.id); if (props.tool !== 'select' && wall.floorId !== floor.id) { event.stopPropagation(); props.onNotice(`Switch to ${wallFloor.name} before creating objects on that level.`); return; } if (props.tool === 'route' || props.tool === 'measure') { const deviceId = event.intersections.find((hit) => typeof hit.object.userData.deviceId === 'string')?.object.userData.deviceId as string | undefined; const device = props.project.devices.find((item) => item.id === deviceId); if (device) return handleDeviceClick(event as ThreeEvent<MouseEvent>, device); return clickScene(event as ThreeEvent<MouseEvent>, wall.id); } if (props.tool === 'device' || props.tool === 'container' || props.tool === 'structure' || props.tool === 'wall' || props.tool === 'room') return clickScene(event as ThreeEvent<MouseEvent>, wall.id); if (xray) { props.onSelect(null); return; } event.stopPropagation(); props.onSelect({ type: 'wall', ids: [wall.id] }, event.nativeEvent.ctrlKey || event.nativeEvent.metaKey); };
        return <group key={wall.id} position={[mmToM((wall.start.x + wall.end.x) / 2), mmToM(wallFloor.elevationMm), mmToM((wall.start.z + wall.end.z) / 2)]} rotation={[0, angle, 0]}
          onClick={props.photoMode || props.tool !== 'select' ? handleWallClick : undefined}
          onPointerMove={props.tool === 'wall' || props.tool === 'structure' ? (event) => { event.stopPropagation(); const point = eventPoint(event, wall.id); setHover(point); props.onStatus(point); } : undefined}
          onDoubleClick={(event) => (props.tool === 'route' || props.tool === 'room') && finishMultiPoint(event, wall.id)}>
          {xray
            ? parts.map((part, index) => <mesh key={`xray-${index}`} renderOrder={-1000 + wallIndex} raycast={props.tool === 'select' && !props.photoMode ? () => null : undefined} onClick={props.photoMode || props.tool !== 'select' ? handleWallClick : undefined}>
              <WallPrismGeometry {...prism(part, -total / 2, total / 2)} />
              <meshBasicMaterial color={selected ? '#4ce1a1' : '#9eabb1'} transparent opacity={xrayOpacity} depthWrite={false} />
              <Edges color={selected ? '#4ce1a1' : '#91a1a8'} threshold={15} transparent opacity={selected ? .65 : .28} depthTest={false} renderOrder={1000 + wallIndex} />
            </mesh>)
            : parts.flatMap((part, index) => layers.map((layer) => <mesh key={`${index}-${layer.id}`} onClick={props.photoMode || props.tool !== 'select' ? handleWallClick : undefined}>
              <WallPrismGeometry {...prism(part, layer.negativeDepth, layer.positiveDepth)} />
              <meshStandardMaterial color={selected ? '#4ce1a1' : layer.color} roughness={.95} flatShading />
            </mesh>))}
          {!xray && props.tool === 'select' && parts.map((part, index) => <mesh key={`selection-hit-${index}`} position={[mmToM(part.center - length / 2), mmToM(part.centerY), 0]} onClick={handleWallClick}>
            <boxGeometry args={[mmToM(part.width + 4), mmToM(part.height + 4), mmToM(total + 4)]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>)}
          {wallPlacementActive && wall.floorId === floor.id && parts.map((part, index) => <mesh key={`placement-hit-${index}`} position={[mmToM(part.center - length / 2), mmToM(part.centerY), 0]}>
            <boxGeometry args={[mmToM(part.width + 20), mmToM(part.height + 20), mmToM(wall.thicknessMm + 20)]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>)}
          {selected && !props.suppressSceneLabels && <Html center position={[0, mmToM(wall.heightMm) + .25, 0]}><span className="scene-label">{wall.name} · {(length / 1000).toFixed(2)} m</span></Html>}
        </group>;
      })}

      {!props.lightingMode && props.project.rooms.filter((room) => floorVisible(room.floorId) && !room.hidden && (props.tool === 'room' || props.selection?.ids.includes(room.id))).map((room) => {
        const roomFloor = floorMap.get(room.floorId)!; const points = [...room.boundary, room.boundary[0]].map((point) => [mmToM(point.x), mmToM(roomFloor.elevationMm) + .03, mmToM(point.z)] as [number, number, number]);
        const centerX = room.boundary.reduce((sum, point) => sum + point.x, 0) / room.boundary.length; const centerZ = room.boundary.reduce((sum, point) => sum + point.z, 0) / room.boundary.length;
        return <group key={room.id} onClick={(event) => { if (shouldIgnoreClick()) return; if (props.tool === 'route') { event.stopPropagation(); props.onNotice('Route creation selects device endpoints only.'); return; } event.stopPropagation(); props.onSelect({ type: 'room', ids: [room.id] }, event.nativeEvent.ctrlKey); }}>
          <Line points={points} color="#4ce1a1" lineWidth={2} dashed dashSize={.15} gapSize={.08} /><Html center position={[mmToM(centerX), mmToM(roomFloor.elevationMm) + .08, mmToM(centerZ)]}><button className="room-chip" onClick={() => props.onSelect({ type: 'room', ids: [room.id] })}>{room.name}</button></Html>
        </group>;
      })}

      {props.project.devices.filter((device) => deviceFloorVisible(device) && !device.hidden && (!props.visibleDeviceIds || props.visibleDeviceIds.has(device.id)) && objectVisible(device.serviceCategory, device.roomId, device.wallId ? [device.wallId] : [], device.position, device.floorId)).map((device) => {
        const deviceFloor = floorMap.get(device.floorId)!; const type = deviceTypeMap.get(device.typeId); const selected = props.selection?.type === 'device' && props.selection.ids.includes(device.id);
        const color = device.displayColor ?? type?.defaultDisplayColor ?? categoryMap.get(device.serviceCategory)?.color ?? '#94a3b8'; const riserGroups = type?.family === 'transition' ? riserRouteGroups(props.project.routes, device.id, device.riserRouteLinks) : []; const effectiveDiameter = type?.family === 'transition' ? effectiveRiserDiameterMm(device.dimensions.width, riserGroups.length) : device.dimensions.width; const size: [number, number, number] = [mmToM(effectiveDiameter), mmToM(device.dimensions.height), mmToM(type?.family === 'transition' ? effectiveDiameter : device.dimensions.depth)];
        const opening = ['door-opening', 'window-opening'].includes(device.typeId); if (opening && xray) return null;
        const savedShape = device.customProperties.find((item) => item.key === 'Shape')?.value; const shape = savedShape === 'cylinder' ? 'cylinder' : type?.shape;
        const wallLikeStructure = ['door-opening', 'window-opening', 'column', 'staircase'].includes(device.typeId); const structuralXray = xray && device.serviceCategory === 'structural';
        const sharedFloorAccess = type?.family === 'transition' && device.floorId !== floor.id && !!device.accessibleFloorIds?.includes(floor.id); const sharedAccessLocalY = mmToM(floor.elevationMm - deviceFloor.elevationMm - device.position.y) + .025; const staircaseTailOnly = shape === 'staircase' && !props.showAllFloors && device.floorId !== floor.id && !!device.accessibleFloorIds?.includes(floor.id);
        return <group key={device.id} userData={{ deviceId: device.id, technicalDevice: device.serviceCategory !== 'structural' }} position={[mmToM(device.position.x), mmToM(deviceFloor.elevationMm + device.position.y), mmToM(device.position.z)]}
          rotation={[device.rotationDeg.x * Math.PI / 180, device.rotationDeg.y * Math.PI / 180, device.rotationDeg.z * Math.PI / 180]} onClick={(event) => handleDeviceClick(event, device)}>
          {type?.family === 'transition' ? <FloorTransitionGeometry device={device} size={size} color={color} xray={xray} project={props.project} /> : device.typeId === 'rack' && device.rackConfiguration ? <RackModel3D configuration={device.rackConfiguration} size={size} xray={false} /> : shape === 'staircase' ? <StaircaseSteps device={device} color={color} xray={structuralXray} tailOnly={staircaseTailOnly} /> : shape === 'solar-panel' ? <SolarPanelGeometry device={device} size={size} color={color} xray={xray} /> : device.typeId === 'junction-box' ? <JunctionBox3D size={size} color={color} selected={selected} /> : <mesh userData={{ deviceId: device.id, technicalDevice: device.serviceCategory !== 'structural' }} renderOrder={0} raycast={structuralXray && props.tool === 'select' ? () => null : undefined}>
            {shape === 'cylinder' ? <cylinderGeometry args={[size[0] / 2, size[0] / 2, size[1], 20]} /> : shape === 'junction' ? <dodecahedronGeometry args={[Math.max(size[0], size[1], size[2]) * .42, 0]} /> : <boxGeometry args={size} />}
            {structuralXray ? <meshBasicMaterial color="#9eabb1" transparent opacity={.055} depthTest depthWrite={false} /> : <meshStandardMaterial color={color} wireframe={opening} transparent={opening} opacity={opening ? selected ? .75 : .12 : 1} depthTest emissive={selected || xray ? color : '#000000'} emissiveIntensity={selected ? .35 : xray ? .18 : 0} />}
            {structuralXray && <Edges color="#91a1a8" threshold={15} transparent opacity={.28} />}{shape === 'junction' && <Edges color={lightScene ? '#26363d' : '#e5eef0'} threshold={8} />}
          </mesh>}
          {shape === 'camera' && <mesh position={[size[0] * .55, 0, 0]}><sphereGeometry args={[size[1] * .24, 12, 12]} /><meshBasicMaterial color="#111" depthTest /></mesh>}
          {shape === 'washer' && <mesh position={[0, 0, size[2] / 2 + .003]}><torusGeometry args={[size[0] * .23, size[0] * .035, 10, 28]} /><meshBasicMaterial color="#263238" depthTest /></mesh>}
          {shape === 'sink' && <mesh position={[0, size[1] / 2 + .012, 0]} rotation={[-Math.PI / 2,0,0]}><torusGeometry args={[size[0] * .23, size[0] * .035, 10, 28]} /><meshBasicMaterial color="#5e777f" depthTest /></mesh>}
          {type?.family !== 'transition' && device.typeId !== 'rack' && device.typeId !== 'junction-box' && <DeviceDetails3D typeId={device.typeId} size={size} color={color} />}
          {props.blinkingDeviceIds?.has(device.id) && <BlinkingDeviceMarker size={size} />}
          {sharedFloorAccess && <mesh position={[0, sharedAccessLocalY + .055, 0]} userData={{ deviceId: device.id, technicalDevice: true }}><cylinderGeometry args={[Math.max(.1, size[0] * .55), Math.max(.1, size[0] * .55), .14, 20]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} /></mesh>}
          {!props.lightingMode && (selected || props.tool === 'route') && device.ports.map((port) => <group key={port.id} position={[mmToM(port.position.x), mmToM(port.position.y), mmToM(port.position.z)]} userData={{ deviceId: device.id, portId: port.id, technicalDevice: true }}><mesh userData={{ deviceId: device.id, portId: port.id, technicalDevice: true }}><sphereGeometry args={[.035, 8, 8]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} /></mesh><mesh userData={{ deviceId: device.id, portId: port.id, technicalDevice: true }}><sphereGeometry args={[.012, 10, 10]} /><meshBasicMaterial color={categoryMap.get(port.serviceCategory)?.color ?? '#94a3b8'} depthTest /></mesh></group>)}
          {(selected || device.showLabel) && !wallLikeStructure && !props.suppressSceneLabels && <Html center position={[0, size[1] / 2 + .18, 0]}><span className="scene-label service-label">{device.name}</span></Html>}
        </group>;
      })}

      {props.projection === 'orthographic' && props.project.devices.filter((device) => ['door-opening', 'window-opening'].includes(device.typeId) && deviceFloorVisible(device) && !device.hidden && (!props.visibleDeviceIds || props.visibleDeviceIds.has(device.id)) && objectVisible(device.serviceCategory, device.roomId, device.wallId ? [device.wallId] : [], device.position, device.floorId)).map((device) => {
        const hostWall = device.wallId ? wallMap.get(device.wallId) : undefined; const deviceFloor = floorMap.get(device.floorId);
        if (!hostWall || !deviceFloor || !wallVisible(hostWall.id)) return null;
        const selected = props.selection?.type === 'device' && props.selection.ids.includes(device.id);
        return <OpeningPlanMarker key={`opening-plan-${device.id}`} device={device} wall={hostWall} floorElevationMm={deviceFloor.elevationMm}
          label={t(device.typeId === 'door-opening' ? 'Door' : 'Window')} selected={selected} suppressLabel={props.suppressSceneLabels}
          onClick={props.tool === 'select' && !xray ? (event) => handleDeviceClick(event, device) : undefined}
          onLabelClick={props.tool === 'select' && !xray ? () => props.onSelect({ type: 'device', ids: [device.id] }) : undefined} />;
      })}

      {visibleRoutes.map(({ route, displayFragments }) => {
        const selected = props.selection?.type === 'route' && props.selection.ids.includes(route.id); const category = categoryMap.get(route.serviceCategory); const routeColor = route.displayColor ?? category?.color ?? '#94a3b8';
        const displayDiameterMm = routeDisplayDiameterMm(route, props.project.preferences.routeDiameterMm); const volumetric = routeUsesTubeRendering(route, props.project.preferences.routeDiameterMm);
        const reverseFlow = route.flowDirection === 'destination-to-source';
        const labelPoints = displayFragments.reduce((longest, points) => points.length > longest.length ? points : longest, displayFragments[0]);
        const routeFloor = floorMap.get(route.floorId)!;
        const authoredRoutePoints = route.points.map((point, index) => ({ point, index })).filter(({ point }) => !isAutomaticRoutePoint(point));
        const controlPoints = props.lightingMode ? [] : authoredRoutePoints.filter(({ point }, authoredIndex) => (!selectedRoom || roomContains(point, 1000)) && (selected || authoredIndex === 0 || authoredIndex === authoredRoutePoints.length - 1)).map(({ point, index }, authoredIndex) => ({ index, label: authoredIndex === 0 ? 'A' : authoredIndex === authoredRoutePoints.length - 1 ? 'B' : String(authoredIndex), position: [mmToM(point.x), mmToM(routeFloor.elevationMm + point.y) + (point.y === 0 ? .018 : 0), mmToM(point.z)] as [number,number,number] }));
        const endpointColor = (index: number) => {
          const device = index === 0 ? deviceMap.get(route.sourceDeviceId ?? '') : index === route.points.length - 1 ? deviceMap.get(route.destinationDeviceId ?? '') : undefined;
          const portId = index === 0 ? route.sourcePortId : index === route.points.length - 1 ? route.destinationPortId : undefined;
          const port = device?.ports.find((item) => item.id === portId);
          return port ? categoryMap.get(port.serviceCategory)?.color ?? routeColor : routeColor;
        };
        const handleRouteClick = (event: ThreeEvent<MouseEvent>) => { if (shouldIgnoreClick()) return; if (props.photoMode) { event.stopPropagation(); if (props.photoPlacementActive) props.onPlacePhotoMarker?.(eventPoint(event)); return; } if (props.tool === 'route') { event.stopPropagation(); if (props.routeKind === 'junction') props.onCreateRouteJunction(eventPoint(event), route.id); else props.onNotice('Route creation selects device endpoints only. Existing routes are not selectable.'); return; } if (!xray) { props.onSelect(null); return; } event.stopPropagation(); props.onSelect({ type: 'route', ids: [route.id] }, event.nativeEvent.ctrlKey); };
        return <group key={route.id} renderOrder={0} onClick={handleRouteClick}>
          {displayFragments.map((points, fragmentIndex) => <group key={`${route.id}-fragment-${fragmentIndex}`}>
            {xray && <RouteHitTargets points={points} onClick={handleRouteClick} />}
            {volumetric
              ? <VolumetricRoute points={points} diameterMm={displayDiameterMm} color={routeColor} dashed={category?.pattern !== 'solid'} dashSize={route.kind === 'pipe' ? .12 : .2} gapSize={.08} selected={selected} />
              : <Line points={points} color={routeColor} worldUnits lineWidth={mmToM(displayDiameterMm)} depthTest dashed={category?.pattern !== 'solid'} dashSize={route.kind === 'pipe' ? .12 : .2} gapSize={.08} />}
            {xray && !props.suppressRouteMotion && (route.flowDirection === 'source-to-destination' || route.flowDirection === 'destination-to-source') && points.length > 1 && <MovingRouteDirectionArrows points={points} color={routeColor} reverse={reverseFlow} lightScene={lightScene} motionMode={props.project.preferences.motionMode} />}
          </group>)}
          {controlPoints.map(({ position, index, label }) => <group key={`control-${index}`} position={position} onClick={handleRouteClick}><mesh><sphereGeometry args={[selected ? .022 : .014, 10, 10]} /><meshBasicMaterial color={endpointColor(index)} depthTest /></mesh>{selected && !props.suppressSceneLabels && <Html center position={[.05,.055,0]}><span className="route-point-index" style={{ borderColor: endpointColor(index) }}>{label}</span></Html>}</group>)}
          {selected && labelPoints.length > 1 && !props.suppressSceneLabels && <Html center position={labelPoints[Math.floor(labelPoints.length / 2)]}><span className="scene-label">{route.kind.toUpperCase()} · {route.name}</span></Html>}
        </group>;
      })}

      {!props.photoMode && !props.lightingMode && props.project.measurements.filter((item) => item.visible).map((measurement) => {
        const measurementWall = measurement.wallId ? wallMap.get(measurement.wallId) : undefined; const measurementFloor = measurementWall ? floorMap.get(measurementWall.floorId) ?? floor : floor;
        if (!floorVisible(measurementFloor.id)) return null; const start: [number, number, number] = [mmToM(measurement.start.x), mmToM(measurementFloor.elevationMm + measurement.start.y) + .03, mmToM(measurement.start.z)]; const end: [number, number, number] = [mmToM(measurement.end.x), mmToM(measurementFloor.elevationMm + measurement.end.y) + .03, mmToM(measurement.end.z)];
        const middle: [number, number, number] = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2 + .08, (start[2] + end[2]) / 2]; const selected = props.selection?.type === 'measurement' && props.selection.ids.includes(measurement.id); const selectMeasurement = () => props.onSelect({ type: 'measurement', ids: [measurement.id] });
        return <group key={measurement.id} onClick={(event) => { if (shouldIgnoreClick()) return; event.stopPropagation(); if (props.tool === 'route') { props.onNotice('Route creation selects device endpoints only.'); return; } selectMeasurement(); }}><Line points={[start, end]} color={selected ? '#45d99a' : lightScene ? '#233238' : '#f8fafc'} lineWidth={selected ? 3 : 2} depthTest={false} /><Line points={[start, end]} color="#ffffff" lineWidth={12} transparent opacity={.002} depthTest={false} depthWrite={false} />{!props.suppressSceneLabels && <Html center position={middle}><button type="button" className={`measurement-label measurement-select-label${selected ? ' selected' : ''}`} onClick={(event) => { event.stopPropagation(); if (props.tool === 'route') { props.onNotice('Route creation selects device endpoints only.'); return; } selectMeasurement(); }}>{measurement.text || `${(distance3(measurement.start, measurement.end) / 1000).toFixed(2)} m`}</button></Html>}</group>;
      })}
      {props.photoMode && props.project.photoMarkers.filter((marker) => floorVisible(marker.floorId) && (props.visiblePhotoCategories?.has(marker.category) ?? true)).map((marker) => { const markerFloor = floorMap.get(marker.floorId); if (!markerFloor) return null; return <Html key={marker.id} center position={[mmToM(marker.position.x), mmToM(markerFloor.elevationMm + marker.position.y) + .12, mmToM(marker.position.z)]}><button className="photo-map-marker" title={t('Open attached photos')} aria-label={`${t('Open photos')}: ${marker.title}`} onClick={(event) => { event.stopPropagation(); props.onOpenPhotoMarker?.(marker.id); }}><Camera size={16} /><span>{marker.photos.length}</span></button></Html>; })}
      {props.conflictFocus && floorVisible(props.conflictFocus.floorId) && (() => { const conflictFloor = floorMap.get(props.conflictFocus!.floorId); if (!conflictFloor) return null; const point: [number,number,number] = [mmToM(props.conflictFocus.point.x), mmToM(conflictFloor.elevationMm + props.conflictFocus.point.y), mmToM(props.conflictFocus.point.z)]; if (props.conflictFocus.solution) return <group position={point}><mesh rotation={[-Math.PI / 2,0,0]}><torusGeometry args={[.25,.045,12,48]} /><meshBasicMaterial color="#35d98d" transparent opacity={.9} depthTest depthWrite={false} /></mesh></group>; return <group position={point} renderOrder={30}><mesh><sphereGeometry args={[.11,18,18]} /><meshBasicMaterial color="#ff3b45" transparent opacity={.82} depthTest={false} /></mesh><mesh rotation={[-Math.PI / 2,0,0]}><torusGeometry args={[.22,.025,10,32]} /><meshBasicMaterial color="#ff3b45" depthTest={false} /></mesh>{!props.suppressSceneLabels && <Html center position={[0,.28,0]}><span className="conflict-marker-label">{props.conflictFocus.label ?? t('Route conflict')}</span></Html>}</group>; })()}

      {props.tool === 'wall' && draft[0] && drawingHover && wallSnapResult?.guideDirection && <Line points={[
        [mmToM(draft[0].x), mmToM(floor.elevationMm) + .026, mmToM(draft[0].z)],
        [mmToM(drawingHover.x + wallSnapResult.guideDirection.x * 800), mmToM(floor.elevationMm) + .026, mmToM(drawingHover.z + wallSnapResult.guideDirection.z * 800)]
      ]} color="#f59e0b" lineWidth={1.5} dashed dashSize={.12} gapSize={.08} depthTest={false} />}
      {draft.length > 0 && <><Line points={[...draft, ...(drawingHover ? [drawingHover] : [])].map((point) => [mmToM(point.x), mmToM(floor.elevationMm + point.y) + .04, mmToM(point.z)] as [number, number, number])}
        color={props.tool === 'wall' || props.tool === 'room' ? '#4ce1a1' : categoryMap.get(props.routeService)?.color ?? '#fff'} lineWidth={3} dashed depthTest={false} />
        {props.tool === 'measure' && drawingHover && <Html center wrapperClass="drafting-overlay" pointerEvents="none" position={[mmToM((draft[0].x + drawingHover.x) / 2), mmToM(floor.elevationMm + (draft[0].y + drawingHover.y) / 2) + .1, mmToM((draft[0].z + drawingHover.z) / 2)]}><span className="measurement-label">{(distance3(draft[0], drawingHover) / 1000).toFixed(2)} m</span></Html>}
        {props.tool === 'wall' && wallLengthDraft && drawingHover && <Html center wrapperClass="drafting-overlay" pointerEvents="none" position={[mmToM(drawingHover.x), mmToM(floor.elevationMm) + .18, mmToM(drawingHover.z)]}><span className="wall-length-entry">{wallLengthDraft.replace(',', '.')} m · Enter ↵</span></Html>}
      </>}
      {hover && props.tool !== 'select' && <group position={[mmToM(props.tool === 'wall' && drawingHover ? drawingHover.x : hover.x), mmToM(floor.elevationMm + (props.tool === 'wall' && drawingHover ? drawingHover.y : hover.y)) + .045, mmToM(props.tool === 'wall' && drawingHover ? drawingHover.z : hover.z)]}><mesh rotation={[-Math.PI / 2,0,0]}><ringGeometry args={[.07,.1,20]} /><meshBasicMaterial color={wallSnapResult?.kind === 'cardinal' || wallSnapResult?.kind === 'perpendicular' ? '#f59e0b' : '#45d99a'} depthTest={false} /></mesh><Line points={[[ -.14,0,0],[.14,0,0]]} color={wallSnapResult?.kind === 'cardinal' || wallSnapResult?.kind === 'perpendicular' ? '#f59e0b' : '#45d99a'} lineWidth={2} depthTest={false} /><Line points={[[0,0,-.14],[0,0,.14]]} color={wallSnapResult?.kind === 'cardinal' || wallSnapResult?.kind === 'perpendicular' ? '#f59e0b' : '#45d99a'} lineWidth={2} depthTest={false} />{(props.tool === 'wall' || props.tool === 'structure') && wallSnapLabel && <Html center wrapperClass="drafting-overlay" pointerEvents="none" position={[0,.11,0]}><span className="wall-snap-label">{wallSnapLabel}</span></Html>}</group>}
      <GizmoHelper alignment="bottom-left" margin={[58, 58]}><GizmoViewport axisColors={['#ef4444','#2563eb','#22c55e']} labelColor={lightScene ? '#1f2937' : '#f8fafc'} axisHeadScale={.75} labels={['X','Z','Y']} /></GizmoHelper>
    </Canvas>
    {pendingPortDevice && <RoutePortDialog device={pendingPortDevice.device} deviceType={props.project.deviceTypes.find((type) => type.id === pendingPortDevice.device.typeId)!} routes={props.project.routes} service={props.routeService} routeKind={props.routeKind === 'junction' || props.routeKind === 'transition' ? 'cable' : props.routeKind} role={pendingPortDevice.role} firstPortDirection={pendingPortDevice.firstPortDirection} validationMessage={pendingPortError} serviceColors={Object.fromEntries(props.project.categories.map((item) => [item.serviceCategory, item.color]))} allowedPortIds={pendingPortDevice.allowedPortIds} allowSharedPorts={props.project.deviceTypes.find((type) => type.id === pendingPortDevice.device.typeId)?.family === 'transition'} onChoose={(port) => completePortSelection(pendingPortDevice.device, port)} onAddPort={(port) => { props.onAddDevicePort(pendingPortDevice.device.id, port); setPendingCreatedPort({ deviceId: pendingPortDevice.device.id, portId: port.id }); }} onReassign={props.onReassignRoutePort} onClose={() => { setPendingPortError(undefined); setPendingPortDevice(undefined); setPendingCreatedPort(undefined); }} />}
    <button className="compass" aria-label="Align view to north" title="Align view to north" onClick={props.onNorth}><span ref={compassRose} className="compass-rose"><span className="north">N</span><i /></span></button>
  </div>;
}
