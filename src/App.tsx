import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Camera } from 'lucide-react';
import type { Device, DevicePort, DeviceType, Floor, Measurement, PhotoCategory, PhotoMarker, ProjectPhoto, ProjectSnapshot, Room, RoomCategory, Route, Selection, ServiceCategory, ThemeMode, ToolMode, Vec2, Vec3, ViewMode, Wall } from '../shared/types';
import { SOFTWARE_NAME } from '../shared/branding';
import { api } from './api';
import { categoryIdForService, ROUTE_SERVICE_COMPATIBILITY } from './catalog';
import { ElevationDialog } from './components/ElevationDialog';
import { CustomDeviceTypeDialog } from './components/CustomDeviceTypeDialog';
import { FloorTransitionDialog } from './components/FloorTransitionDialog';
import { FurnitureDialog } from './components/FurnitureDialog';
import { LevelManagerDialog } from './components/LevelManagerDialog';
import { LeftSidebar } from './components/LeftSidebar';
import { LightingPanel } from './components/LightingPanel';
import { LightingSidebar } from './components/LightingSidebar';
import { OverviewPage } from './components/OverviewPage';
import { PhotoMarkerDialog } from './components/PhotoMarkerDialog';
import { PhotoPointCreateDialog } from './components/PhotoPointCreateDialog';
import { PHOTO_CATEGORIES, PhotoSidebar } from './components/PhotoSidebar';
import { PropertiesPanel } from './components/PropertiesPanel';
import { ProjectTutorial } from './components/ProjectTutorial';
import { SettingsDialog } from './components/SettingsDialog';
import { TopToolbar } from './components/TopToolbar';
import { ViewSnapshotDialog } from './components/ViewSnapshotDialog';
import { HouseViewport, type ViewCommand } from './editor/HouseViewport';
import { addVerticalClearanceAtCrossings, confineRouteToAssociatedWalls, constrainRoutePointToWallLining, devicePortWorldPosition, distance3, findRouteIntersections, mountingRotation, orderWallBoundaryWithGaps, orthogonalizeWallRoutePoints, pointInPolygon, polygonArea, polygonEdgesCross, preferredDevicePort, projectDevicePositionOntoWall, proposeRouteClearanceSolution, reattachDeviceToWall, reattachRouteEndpointsToDevice, resolveRouteConflicts, routeDisplayDiameterMm, routePairClearanceMm, routePointsKeepDeviceClearance, routeSurfaceBounds, stackFloorRoutes, wallAtPlanPoint, wallBackFaceRecessMm, wallCenterDepthForBackFaceRecess, wallLength, wallLocalToWorld, wallMountedPosition, wallServiceDepthMm, worldToWallLocal, verticalTransitionBounds } from './lib/geometry';
import { commitHistory, createDefaultProject, createHistory, normalizeConcealedRouteSurfaces, redoHistory, removeDevicesAndConnectedRoutes, serializeProject, startingFloorId, undoHistory, upgradeProject, type HistoryState } from './lib/project';
import { ETHERNET_PAIR_COLORS, ITALIAN_CONDUCTOR_COLORS } from './lib/italianColors';
import { useI18n } from './lib/i18n';
import { formatRouteName } from './lib/routeNaming';
import { createDefaultRackSystem, synchronizeRackExternalPorts } from './lib/rack';
import { reassignRouteDevicePort, routeEndpointDirectionsCoherent, routeFlowFromEndpointPorts, type RouteEndpointRole } from './lib/ports';
import { validRiserRouteLinks } from './lib/riser';
import { dimensionsForDevicePorts } from './lib/devicePorts';
import { analyzeLightingNetwork, lightingVisibleDeviceIds } from './lib/lightingNetwork';
import { findRouteLayoutIssues, type RouteLayoutIssue } from './lib/routeLayout';
import { loadLocalAppIcon, readLocalAppIcon, resetLocalAppIcon, saveLocalAppIcon } from './lib/appBranding';

type SaveState = 'saved' | 'saving' | 'error';

function selectionIsLocked(project: ProjectSnapshot, selection: Selection) {
  const ids = new Set(selection.ids);
  return [...project.walls, ...project.rooms, ...project.devices, ...project.routes, ...project.measurements]
    .some((item) => ids.has(item.id) && item.locked);
}

export default function App() {
  const { t } = useI18n();
  const [appIconUrl, setAppIconUrl] = useState(loadLocalAppIcon);
  const [history, setHistory] = useState<HistoryState<ProjectSnapshot> | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [tool, setTool] = useState<ToolMode>('select');
  const [activeFloorId, setActiveFloorId] = useState('');
  const [placementType, setPlacementType] = useState<DeviceType>();
  const [routeKind, setRouteKind] = useState<Route['kind'] | 'junction' | 'transition'>('cable');
  const [routeService, setRouteService] = useState<ServiceCategory>('electrical');
  const [measurementType, setMeasurementType] = useState<Measurement['type']>('point-to-point');
  const [viewMode, setViewMode] = useState<ViewMode>('normal');
  const [isolatedRoomId, setIsolatedRoomId] = useState<string>();
  const [projection, setProjection] = useState<'perspective' | 'orthographic'>('perspective');
  const [showAllFloors, setShowAllFloors] = useState(false);
  const [showAdjacentBlueprint, setShowAdjacentBlueprint] = useState(false);
  const [cancelToken, setCancelToken] = useState(0);
  const [viewCommand, setViewCommand] = useState<{ command: ViewCommand; nonce: number; focusPoint?: Vec3; radius?: number }>({ command: 'reset', nonce: 0 });
  const [pendingProjectionView, setPendingProjectionView] = useState<'top' | 'iso'>();
  const [visibleServices, setVisibleServices] = useState<Set<ServiceCategory>>(new Set());
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [elevation, setElevation] = useState<{ open: boolean; batch: boolean }>({ open: false, batch: false });
  const [projectManager, setProjectManager] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [conflictReview, setConflictReview] = useState<{ items: ReturnType<typeof findRouteIntersections>; index: number; solution: boolean }>();
  const [layoutReview, setLayoutReview] = useState<{ items: RouteLayoutIssue[]; index: number; solution: boolean }>();
  const [customTypeOpen, setCustomTypeOpen] = useState(false);
  const [levelManagerOpen, setLevelManagerOpen] = useState(false);
  const [furnitureOpen, setFurnitureOpen] = useState(false);
  const [pendingTransition, setPendingTransition] = useState<{ position: Vec3; wallId?: string }>();
  const [projectList, setProjectList] = useState<Array<{ id: string; title: string; updatedAt: string }>>([]);
  const [firstRun, setFirstRun] = useState(false);
  const [status, setStatus] = useState({ x: 0, y: 0, z: 0 });
  const [notice, setNotice] = useState('Ready');
  const [page, setPage] = useState<'editor' | 'overview' | 'light' | 'photo'>('editor');
  const [photoPlacementActive, setPhotoPlacementActive] = useState(false);
  const [photoXray, setPhotoXray] = useState(true);
  const [photoCategory, setPhotoCategory] = useState<PhotoCategory>('finished-house');
  const [pendingPhotoPosition, setPendingPhotoPosition] = useState<Vec3>();
  const [visiblePhotoCategories, setVisiblePhotoCategories] = useState<Set<PhotoCategory>>(() => new Set(PHOTO_CATEGORIES.map((item) => item.id)));
  const [openPhotoMarkerId, setOpenPhotoMarkerId] = useState<string>();
  const [snapshotSource, setSnapshotSource] = useState<string>();
  const [snapshotPreparing, setSnapshotPreparing] = useState(false);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');
  const clipboard = useRef<Selection | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const viewportRef = useRef<HTMLElement>(null);
  const project = history?.present;
  const lightingAnalysis = useMemo(() => project ? analyzeLightingNetwork(project) : undefined, [project]);
  const lightingDeviceIds = useMemo(() => project && lightingAnalysis ? lightingVisibleDeviceIds(project, lightingAnalysis) : new Set<string>(), [lightingAnalysis, project]);
  const lightingRouteIds = useMemo(() => new Set(lightingAnalysis?.routeIds ?? []), [lightingAnalysis]);
  const selectedLightId = selection?.type === 'device' && lightingAnalysis?.lightIds.includes(selection.ids[0]) ? selection.ids[0] : undefined;
  const blinkingLightingSwitchIds = useMemo(() => new Set(selectedLightId && lightingAnalysis ? lightingAnalysis.controlsByLight[selectedLightId] ?? [] : []), [lightingAnalysis, selectedLightId]);
  useEffect(() => {
    if (pendingProjectionView === 'top' && projection === 'orthographic' || pendingProjectionView === 'iso' && projection === 'perspective') {
      setViewCommand({ command: pendingProjectionView, nonce: Date.now() }); setPendingProjectionView(undefined);
    }
  }, [pendingProjectionView, projection]);
  const selectedLocked = !!project && !!selection && selectionIsLocked(project, selection);
  const routeIntersections = useMemo(() => project ? findRouteIntersections(project.routes, project.preferences.routeOverlapPriorities, project.preferences.routeSeparationMm, project.preferences.routeDiameterMm) : [], [project?.routes, project?.preferences.routeOverlapPriorities, project?.preferences.routeSeparationMm, project?.preferences.routeDiameterMm]);
  const routeLayoutIssues = useMemo(() => project && settingsOpen ? findRouteLayoutIssues(project) : [], [project, settingsOpen]);
  const activeConflict = conflictReview?.items[conflictReview.index];
  const activeLayoutIssue = layoutReview?.items[layoutReview.index];
  const proposedConflictRoute = useMemo(() => { if (!project || !activeConflict) return undefined; const route = project.routes.find((item) => item.id === activeConflict.routeBId); const other = project.routes.find((item) => item.id === activeConflict.routeAId); return route ? proposeRouteClearanceSolution(route, activeConflict.point, other ? routePairClearanceMm(route, other, project.preferences.routeSeparationMm, project.preferences.routeDiameterMm) : Math.max(project.preferences.routeSeparationMm[route.serviceCategory] ?? 30, routeDisplayDiameterMm(route, project.preferences.routeDiameterMm)), project.routes, project.walls, undefined, { bendRadiusMm: project.preferences.routeBendRadiusMm[route.serviceCategory] ?? 0, diameterMm: routeDisplayDiameterMm(route, project.preferences.routeDiameterMm), surfaceBounds: routeSurfaceBounds(project.floors, route.floorId), turnPenaltyMm: project.preferences.routeTurnPenaltyMm }) : undefined; }, [activeConflict, project]);
  const viewportProject = useMemo(() => {
    if (!project) return project;
    if (layoutReview?.solution && activeLayoutIssue) { const replacements = new Map(activeLayoutIssue.proposedRoutes.map((route) => [route.id, route])); return { ...project, routes: project.routes.map((route) => replacements.get(route.id) ?? route) }; }
    return conflictReview?.solution && proposedConflictRoute ? { ...project, routes: project.routes.map((route) => route.id === proposedConflictRoute.id ? proposedConflictRoute : route) } : project;
  }, [activeLayoutIssue, conflictReview?.solution, layoutReview?.solution, project, proposedConflictRoute]);

  useEffect(() => { if (activeFloorId) setShowAllFloors(false); }, [activeFloorId]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await api.waitUntilReady();
        const list = await api.listProjects();
        if (!list.length) {
          if (!active) return;
          setProjectList([]);
          setFirstRun(true);
          setNotice('Create your first local project.');
          return;
        }
        const loaded = upgradeProject(await api.getProject(list[0].id));
        if (!active) return;
        setFirstRun(false);
        setHistory(createHistory(loaded)); setActiveFloorId(startingFloorId(loaded)); setVisibleServices(new Set(loaded.categories.map((category) => category.serviceCategory)));
        setProjectList(list.map((item) => item.id === loaded.id ? { ...item, title: loaded.title } : item));
      } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not start the local project.'); }
    })();
    return () => { active = false; };
  }, []);

  const createProject = async (title: string) => {
    const name = title.trim() || 'Untitled house project';
    setNotice('Creating local project…');
    try {
      const created = upgradeProject(await api.saveProject(createDefaultProject(name)));
      setHistory(createHistory(created));
      setActiveFloorId(startingFloorId(created));
      setVisibleServices(new Set(created.categories.map((category) => category.serviceCategory)));
      setProjectList([{ id: created.id, title: created.title, updatedAt: created.updatedAt }]);
      setFirstRun(false);
      setNotice('Local project created.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not create the local project.');
      throw error;
    }
  };

  const saveNow = useCallback(async (snapshot?: ProjectSnapshot) => {
    const target = snapshot ?? history?.present; if (!target) return;
    setSaveState('saving');
    try { const saved = await api.saveProject(target); setSaveState('saved'); setNotice(`Saved locally at ${new Date(saved.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`); }
    catch (error) { setSaveState('error'); setNotice(error instanceof Error ? error.message : 'Local save failed.'); }
  }, [history?.present]);

  useEffect(() => {
    if (!project) return;
    setSaveState('saving');
    const timer = window.setTimeout(() => saveNow(project), 800);
    return () => window.clearTimeout(timer);
  }, [project, saveNow]);

  const commit = useCallback((updater: (current: ProjectSnapshot) => ProjectSnapshot) => {
    setHistory((state) => state ? commitHistory(state, updater(state.present)) : state);
  }, []);
  const undo = useCallback(() => setHistory((state) => state ? undoHistory(state) : state), []);
  const redo = useCallback(() => setHistory((state) => state ? redoHistory(state) : state), []);

  const select = useCallback((next: Selection | null, additive = false) => {
    if (next?.type === 'room' && !additive) {
      const room = project?.rooms.find((item) => item.id === next.ids[0]);
      if (room) {
        setActiveFloorId(room.floorId);
        setShowAllFloors(false);
        setIsolatedRoomId(room.id);
        setViewCommand({ command: 'fit-selection', nonce: Date.now() });
      }
    }
    if (!next) setIsolatedRoomId(undefined);
    setSelection((current) => {
      if (!next || !additive || !current || current.type !== next.type) return next;
      return { type: next.type, ids: [...new Set([...current.ids, ...next.ids])] };
    });
  }, [project]);
  const chooseTool = useCallback((next: ToolMode) => {
    setTool(next);
    if (next === 'route') {
      setSelection((current) => current?.type === 'device' ? current : null);
    }
    if (next === 'structure') {
      const door = project?.deviceTypes.find((type) => type.id === 'door-opening');
      if (door) setPlacementType(door);
    }
    if (next === 'container') {
      const container = project?.deviceTypes.find((type) => type.serviceCategory === 'storage');
      if (container) setPlacementType(container);
    }
  }, [project]);
  const choosePlacementType = useCallback((type: DeviceType) => {
    setPlacementType(type);
    if (type.serviceCategory !== 'structural') setVisibleServices((current) => new Set(current).add(type.serviceCategory));
    setTool(type.serviceCategory === 'structural' ? 'structure' : type.serviceCategory === 'storage' ? 'container' : 'device');
  }, []);
  useEffect(() => {
    if (viewMode === 'xray' && selection?.type === 'wall' || viewMode !== 'xray' && selection?.type === 'route') setSelection(null);
  }, [viewMode, selection?.type]);

  const updateWall = (id: string, patch: Partial<Wall>) => commit((current) => {
    const previous = current.walls.find((wall) => wall.id === id);
    const walls = current.walls.map((wall) => {
      if (wall.id !== id) return wall;
      const next = { ...wall, ...patch };
      const structuralThicknessMm = Math.max(10, Math.round(patch.structuralThicknessMm ?? next.structuralThicknessMm));
      const liningLeftMm = Math.max(0, Math.round(patch.liningLeftMm ?? next.liningLeftMm)); const liningRightMm = Math.max(0, Math.round(patch.liningRightMm ?? next.liningRightMm));
      return { ...next, structuralThicknessMm, liningLeftMm, liningRightMm, thicknessMm: structuralThicknessMm + liningLeftMm + liningRightMm };
    });
    const changed = walls.find((wall) => wall.id === id)!;
    const routes = previous ? current.routes.map((route) => {
      if (!route.wallIds.includes(id)) return route;
      let routeChanged = false;
      const points = route.points.map((point) => {
        const local = worldToWallLocal(previous, point); const attached = local.heightMm >= 0 && local.heightMm <= previous.heightMm && local.distanceAlongMm >= -5 && local.distanceAlongMm <= wallLength(previous) + 5 && Math.abs(local.depthMm) <= previous.thicknessMm / 2 + 5;
        if (!attached) return point;
        routeChanged = true; const side: -1 | 1 = local.depthMm < 0 ? -1 : 1;
        return { ...point, ...wallLocalToWorld(changed, Math.max(0, Math.min(wallLength(changed), local.distanceAlongMm)), Math.min(changed.heightMm, local.heightMm), wallServiceDepthMm(changed, side)) };
      });
      return routeChanged ? { ...route, points } : route;
    }) : current.routes;
    const devices = current.devices.map((device) => {
      if (!previous || device.wallId !== id || device.distanceAlongWallMm == null) return device;
      if (['door-opening', 'window-opening'].includes(device.typeId)) return reattachDeviceToWall({ ...device, depthInsideWallMm: 0 }, changed);
      const direction: -1 | 1 = device.depthInsideWallMm != null && device.depthInsideWallMm < 0 || device.wallSide === 'right' ? -1 : 1;
      const recess = wallBackFaceRecessMm(previous, device.dimensions, device.backFace, device.depthInsideWallMm ?? 0);
      return reattachDeviceToWall({ ...device, depthInsideWallMm: wallCenterDepthForBackFaceRecess(changed, device.dimensions, device.backFace, recess, direction) }, changed);
    });
    return { ...current, walls, routes, devices };
  });
  const updateRoom = (id: string, patch: Partial<Room>) => commit((current) => ({ ...current, rooms: current.rooms.map((room) => room.id === id ? { ...room, ...patch } : room) }));
  const updateDevice = (id: string, patch: Partial<Device>) => {
    const selectedDevice = project?.devices.find((device) => device.id === id);
    if (patch.associationType === 'wall' && selectedDevice && !selectedDevice.wallId) { setNotice('Place the device on a wall before changing its association to wall.'); return; }
    commit((current) => {
      const existing = current.devices.find((device) => device.id === id); if (!existing) return current;
      const association = patch.associationType ?? existing.associationType; const backFace = patch.backFace ?? existing.backFace; const dimensions = patch.dimensions ?? existing.dimensions; const wall = existing.wallId ? current.walls.find((item) => item.id === existing.wallId) : undefined;
      let adjustedPatch: Partial<Device> = { ...patch, rotationDeg: patch.rotationDeg ?? (patch.associationType || patch.backFace ? mountingRotation(backFace, association, wall, existing.wallSide) : existing.rotationDeg) };
      const opening = ['door-opening', 'window-opening'].includes(existing.typeId);
      if (association === 'wall' && wall && adjustedPatch.position) adjustedPatch = { ...adjustedPatch, ...projectDevicePositionOntoWall(wall, adjustedPatch.position, opening) };
      else if (association === 'wall' && wall && opening && (adjustedPatch.distanceAlongWallMm != null || adjustedPatch.depthInsideWallMm != null || adjustedPatch.heightFromFloorMm != null)) adjustedPatch = { ...adjustedPatch, depthInsideWallMm: 0 };
      if (association === 'ceiling' || association === 'floor') {
        const floor = current.floors.find((item) => item.id === existing.floorId); const room = current.rooms.find((item) => item.id === existing.roomId); const halfHeight = dimensions.height / 2; const height = association === 'ceiling' ? Math.max(halfHeight, (room?.ceilingHeightMm ?? floor?.ceilingHeightMm ?? 2700) - halfHeight) : halfHeight;
        adjustedPatch = { ...adjustedPatch, wallId: undefined, distanceAlongWallMm: undefined, depthInsideWallMm: undefined, wallSide: undefined, mounting: 'surface', position: { ...(patch.position ?? existing.position), y: Math.round(height) }, heightFromFloorMm: Math.round(height) };
      }
      let devices = current.devices.map((device) => device.id === id ? { ...device, ...adjustedPatch } : device); let updatedDevice = devices.find((item) => item.id === id)!;
      if (updatedDevice.wallId && (adjustedPatch.distanceAlongWallMm != null || adjustedPatch.depthInsideWallMm != null || adjustedPatch.heightFromFloorMm != null) && !adjustedPatch.position) {
        const attachedWall = current.walls.find((item) => item.id === updatedDevice.wallId); if (attachedWall) { devices = devices.map((item) => item.id === id ? { ...item, position: wallLocalToWorld(attachedWall, item.distanceAlongWallMm ?? 0, item.heightFromFloorMm, item.depthInsideWallMm ?? 0) } : item); updatedDevice = devices.find((item) => item.id === id)!; }
      }
      const deviceFloorElevation = current.floors.find((item) => item.id === updatedDevice.floorId)?.elevationMm ?? 0; const routes = current.routes.map((route) => reattachRouteEndpointsToDevice(route, updatedDevice, deviceFloorElevation, current.floors.find((item) => item.id === route.floorId)?.elevationMm ?? 0));
      return { ...current, devices, routes };
    });
  };
  const updateRoute = (id: string, patch: Partial<Route>) => commit((current) => { const routes = current.routes.map((route) => { if (route.id !== id) return route; const updated = { ...route, ...patch }; if (!patch.points) return updated; const walls = current.walls.filter((wall) => updated.wallIds.includes(wall.id)); const points = orthogonalizeWallRoutePoints(updated.points, walls).map((point, order) => ({ ...point, id: 'id' in point && typeof point.id === 'string' ? point.id : crypto.randomUUID(), order })); return { ...updated, points }; }); return { ...current, routes, devices: current.devices.map((device) => device.typeId === 'floor-transition' ? { ...device, riserRouteLinks: validRiserRouteLinks(routes, device.id, device.riserRouteLinks) } : device) }; });
  const addDevicePort = (deviceId: string, port: DevicePort) => commit((current) => ({ ...current, devices: current.devices.map((device) => {
    if (device.id !== deviceId) return device;
    const ports = [...device.ports, port]; const type = current.deviceTypes.find((item) => item.id === device.typeId);
    return { ...device, ports, dimensions: type ? dimensionsForDevicePorts(device, type, ports) : device.dimensions };
  }) }));
  const reassignRoutePort = (routeId: string, deviceId: string, role: RouteEndpointRole, portId: string) => commit((current) => ({ ...current, routes: current.routes.map((route) => route.id === routeId ? reassignRouteDevicePort(route, deviceId, role, portId) : route) }));
  const updateMeasurement = (id: string, patch: Partial<Measurement>) => commit((current) => ({ ...current, measurements: current.measurements.map((item) => item.id === id ? { ...item, ...patch } : item) }));

  const createWall = (start: Vec2, end: Vec2) => {
    if (!project || start.x === end.x && start.z === end.z) return;
    const floor = project.floors.find((item) => item.id === activeFloorId)!;
    if (start.x === end.x && start.z === end.z) return;
    const structuralThicknessMm = project.preferences.newWallStructuralThicknessMm; const liningLeftMm = project.preferences.newWallLiningLeftMm; const liningRightMm = project.preferences.newWallLiningRightMm;
    const wall: Wall = { id: crypto.randomUUID(), floorId: floor.id, name: `Wall-${String(project.walls.length + 1).padStart(2, '0')}`, start: { ...start }, end: { ...end }, heightMm: floor.ceilingHeightMm, thicknessMm: structuralThicknessMm + liningLeftMm + liningRightMm, structuralThicknessMm, liningLeftMm, liningRightMm, locked: false, hidden: false };
    commit((current) => ({ ...current, walls: [...current.walls, wall] })); setSelection({ type: 'wall', ids: [wall.id] }); setNotice(`${wall.name} created. Enter exact dimensions in Properties.`);
  };
  const createRoom = (boundary: Vec2[], wallIds: string[] = []) => {
    if (!project) return; const name = window.prompt('Room name', `Room ${project.rooms.length + 1}`); if (!name) return;
    const floor = project.floors.find((item) => item.id === activeFloorId)!;
    const room: Room = { id: crypto.randomUUID(), floorId: floor.id, name, description: '', boundary, wallIds, areaMm2: polygonArea(boundary), ceilingHeightMm: floor.ceilingHeightMm, locked: false, hidden: false };
    commit((current) => ({ ...current, rooms: [...current.rooms, room] })); setSelection({ type: 'room', ids: [room.id] }); setTool('select');
  };
  const createRoomFromWalls = () => {
    if (!project || selection?.type !== 'wall') return; const walls = project.walls.filter((wall) => selection.ids.includes(wall.id)); const boundary = orderWallBoundaryWithGaps(walls);
    if (!boundary) { setNotice('Select at least three walls that can form a room boundary.'); return; }
    if (project.rooms.some((room) => room.floorId === activeFloorId && polygonEdgesCross(boundary, room.boundary))) { setNotice('The straight gap connectors would cross an existing room boundary. Adjust the wall selection.'); return; }
    createRoom(boundary, walls.map((wall) => wall.id));
  };
  const createStaircase = (path: Vec3[]) => {
    if (!project || path.length < 2) return; const type = project.deviceTypes.find((item) => item.id === 'staircase'); const floor = project.floors.find((item) => item.id === activeFloorId); if (!type || !floor) return;
    const upperFloor = [...project.floors].filter((item) => item.elevationMm > floor.elevationMm).sort((a, b) => a.elevationMm - b.elevationMm)[0]; const rise = upperFloor ? upperFloor.elevationMm - floor.elevationMm : floor.ceilingHeightMm;
    const length = Math.max(500, Math.round(path.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - path[index].x, point.z - path[index].z), 0))); const minX = Math.min(...path.map((point) => point.x)); const maxX = Math.max(...path.map((point) => point.x)); const minZ = Math.min(...path.map((point) => point.z)); const maxZ = Math.max(...path.map((point) => point.z)); const id = crypto.randomUUID(); const center = { x: Math.round((minX + maxX) / 2), y: Math.round(rise / 2), z: Math.round((minZ + maxZ) / 2) }; const stepCount = Math.max(3, Math.ceil(rise / 180), Math.round(length / 270));
    const device: Device = { id, typeId: type.id, name: `Staircase ${project.devices.filter((item) => item.typeId === type.id).length + 1}`, categoryId: type.categoryId, serviceCategory: 'structural', manufacturer: '', model: '', description: 'Simple generated staircase reference', floorId: floor.id, associationType: 'floor', position: center, heightFromFloorMm: center.y, rotationDeg: { x: 0, y: 0, z: 0 }, dimensions: { width: type.defaultDimensions.width, height: rise, depth: length }, accessibleFloorIds: upperFloor ? [floor.id, upperFloor.id] : undefined, mounting: 'surface', backFace: 'bottom', powerRequirements: '', networkRequirements: '', notes: '', installationStatus: 'planned', colorSource: 'projectConvention', showLabel: false, ports: [], customProperties: [{ key: 'Step count', value: String(stepCount) }, { key: 'Path', value: JSON.stringify(path.map(({ x, z }) => ({ x, z }))) }, ...(upperFloor ? [{ key: 'Upper floor', value: upperFloor.id }] : [])], locked: false, hidden: false };
    commit((current) => ({ ...current, devices: [...current.devices, device] })); setSelection({ type: 'device', ids: [id] }); setTool('select');
  };
  const placeDevice = (position: Vec3, wallId?: string, pointedWallSide?: Device['wallSide'], transitionToFloorId?: string) => {
    if (!project) return; const type = placementType ?? project.deviceTypes[0]; if (!type) return;
    if (type.family === 'transition' && !transitionToFloorId) { setPendingTransition({ position, wallId }); return; }
    const activeFloor = project.floors.find((item) => item.id === activeFloorId)!; const requestedWall = wallId ? project.walls.find((item) => item.id === wallId) : undefined; const isContainer = type.serviceCategory === 'storage';
    const isDoor = type.id === 'door-opening'; const isTransition = type.family === 'transition'; const isOpening = isDoor || type.id === 'window-opening';
    const requiresWall = !isContainer && (type.defaultAssociation === 'wall' || isOpening);
    const footprintWall = requiresWall && !requestedWall
      ? wallAtPlanPoint(project.walls.filter((item) => item.floorId === activeFloor.id && !item.hidden), position)
      : undefined;
    const wall = isContainer ? undefined : requestedWall ?? footprintWall;
    if (requiresWall && !wall) { setNotice(`${type.name} is wall-associated. Click the exact wall where it must be placed.`); return; }
    if (wall && wall.floorId !== activeFloor.id) { setNotice('Switch to that floor before placing an object on its wall.'); return; }
    const floor = wall ? project.floors.find((item) => item.id === wall.floorId)! : activeFloor;
    const room = project.rooms.find((item) => item.floorId === floor.id && pointInPolygon({ x: position.x, z: position.z }, item.boundary));
    if (isOpening && !wall) { setNotice('Door and window openings must be placed on a wall.'); return; }
    const targetFloor = transitionToFloorId ? project.floors.find((item) => item.id === transitionToFloorId) : undefined;
    const associationType = isContainer ? 'floor' : isOpening ? 'wall' : type.defaultAssociation;
    const defaultY = associationType === 'ceiling' ? floor.ceilingHeightMm - type.defaultDimensions.height / 2 : type.id === 'window-opening' ? 1700 : type.defaultDimensions.height / 2;
    const lowerFloor = targetFloor && targetFloor.elevationMm < floor.elevationMm ? targetFloor : floor;
    const upperFloor = targetFloor && targetFloor.elevationMm > floor.elevationMm ? targetFloor : floor;
    const lowerCeilingAbs = lowerFloor.elevationMm + lowerFloor.ceilingHeightMm;
    const upperSlabAbs = upperFloor.elevationMm;
    const transitionGapStartAbs = Math.min(lowerCeilingAbs, upperSlabAbs);
    const transitionGapEndAbs = Math.max(lowerCeilingAbs, upperSlabAbs);
    const transitionBounds = verticalTransitionBounds(transitionGapStartAbs, transitionGapEndAbs, project.preferences.ceilingRouteOffsetMm);
    const transitionCenterAbs = transitionBounds.centerMm;
    const transitionHeight = transitionBounds.heightMm;
    const boundaryForFloor = (candidate: Floor) => candidate.id === lowerFloor.id ? transitionBounds.startMm : transitionBounds.endMm;
    const attachedWall = associationType === 'wall' ? wall : undefined;
    const clickedLocal = attachedWall ? worldToWallLocal(attachedWall, position) : undefined; const wallSide: Device['wallSide'] = pointedWallSide ?? (clickedLocal && clickedLocal.depthMm < 0 ? 'right' : 'left');
    const placedPosition = (() => {
      if (isTransition) return { ...position, y: transitionCenterAbs - floor.elevationMm };
      if (!attachedWall) return { ...position, y: Math.round(defaultY) };
      if (isOpening) {
        const local = worldToWallLocal(attachedWall, position);
        const halfHeight = type.defaultDimensions.height / 2; const preferredHeight = isDoor ? halfHeight : type.id === 'window-opening' ? 1700 : local.heightMm; const height = Math.max(halfHeight, Math.min(attachedWall.heightMm - halfHeight, preferredHeight));
        return wallLocalToWorld(attachedWall, Math.max(0, Math.min(wallLength(attachedWall), local.distanceAlongMm)), height, 0);
      }
      return wallMountedPosition(attachedWall, position, type.defaultDimensions, type.defaultBackFace, wallSide);
    })();
    const placedLocal = attachedWall ? worldToWallLocal(attachedWall, placedPosition) : undefined;
    const fallbackPorts = isTransition ? [{ name: floor.name, portType: 'vertical transition', direction: 'bidirectional' as const, serviceCategory: 'custom' as const, connectorType: 'floor sleeve', notes: '', position: { x: 0, y: boundaryForFloor(floor) - transitionCenterAbs, z: 0 }, face: (floor.id === lowerFloor.id ? 'bottom' : 'top') as 'bottom' | 'top', required: false }, { name: targetFloor?.name ?? 'Adjacent floor', portType: 'vertical transition', direction: 'bidirectional' as const, serviceCategory: 'custom' as const, connectorType: 'floor sleeve', notes: '', position: { x: 0, y: targetFloor ? boundaryForFloor(targetFloor) - transitionCenterAbs : 0, z: 0 }, face: (targetFloor?.id === lowerFloor.id ? 'bottom' : 'top') as 'bottom' | 'top', required: false }] : [];
    const deviceId = crypto.randomUUID(); const rackSystem = type.id === 'rack' ? createDefaultRackSystem(deviceId) : undefined;
    const device: Device = {
      id: deviceId, typeId: type.id, name: `${type.name} ${project.devices.filter((item) => item.typeId === type.id).length + 1}`, categoryId: type.categoryId,
      serviceCategory: type.serviceCategory, manufacturer: '', model: '', description: '', roomId: room?.id, floorId: floor.id, wallId: attachedWall?.id,
      associationType, position: placedPosition, heightFromFloorMm: placedPosition.y, rotationDeg: mountingRotation(type.defaultBackFace, associationType, attachedWall, wallSide), dimensions: isTransition ? { ...type.defaultDimensions, height: transitionHeight } : { ...type.defaultDimensions },
      distanceAlongWallMm: placedLocal?.distanceAlongMm, depthInsideWallMm: isOpening ? 0 : placedLocal?.depthMm, wallSide: attachedWall ? wallSide : undefined, mounting: attachedWall && isOpening ? 'recessed' : 'surface',
      backFace: type.defaultBackFace, accessibleFloorIds: isTransition ? [floor.id, targetFloor!.id] : undefined, transitionToFloorId: targetFloor?.id,
      powerRequirements: '', networkRequirements: '', notes: '', installationStatus: 'planned', ports: [...(type.defaultPorts.length ? type.defaultPorts : fallbackPorts).map((port) => ({ ...structuredClone(port), id: crypto.randomUUID(), deviceId })), ...(rackSystem?.externalPorts ?? [])], rackConfiguration: rackSystem?.configuration, customProperties: isContainer ? [{ key: type.id === 'solar-battery-storage' ? 'Capacity (kWh)' : 'Capacity (L)', value: '' }] : type.id === 'column' ? [{ key: 'Shape', value: type.shape }] : [], colorSource: 'projectConvention', showLabel: false, locked: false, hidden: false
    };
    device.ports = device.ports.map((port) => ({ ...port, deviceId: device.id }));
    if (rackSystem) device.ports = synchronizeRackExternalPorts(device, rackSystem.configuration);
    device.dimensions = dimensionsForDevicePorts(device, type, device.ports);
    commit((current) => ({ ...current, devices: [...current.devices, device] })); setSelection({ type: 'device', ids: [device.id] }); setNotice(`${device.name} placed${wall ? ` in ${wall.name}` : ''}.`);
  };
  const createRoute = (draftPoints: Vec3[], wallIds: string[] = [], initialSourceDeviceId?: string, initialDestinationDeviceId?: string, initialSourcePortId?: string, initialDestinationPortId?: string): boolean => {
    if (!project || !['cable','pipe','duct'].includes(routeKind)) return false; const kind = routeKind as Route['kind'];
    const sourceDeviceId = initialSourceDeviceId; const destinationDeviceId = initialDestinationDeviceId; let points = draftPoints.map((point) => ({ ...point }));
    const source = project.devices.find((device) => device.id === sourceDeviceId); const destination = project.devices.find((device) => device.id === destinationDeviceId);
    const sourcePort = source?.ports.find((port) => port.id === initialSourcePortId) ?? (source ? preferredDevicePort(source, routeService, 'source') : undefined);
    const destinationPort = destination?.ports.find((port) => port.id === initialDestinationPortId) ?? (destination ? preferredDevicePort(destination, routeService, 'destination') : undefined);
    if (sourcePort && destinationPort && !routeEndpointDirectionsCoherent(sourcePort, destinationPort)) { setNotice(`The second endpoint must use an ${sourcePort.direction === 'output' ? 'input' : 'output'} or bidirectional port.`); return false; }
    const activeElevation = project.floors.find((item) => item.id === activeFloorId)?.elevationMm ?? 0;
    if (source && sourcePort) { const point = devicePortWorldPosition(source, sourcePort); point.y += (project.floors.find((item) => item.id === source!.floorId)?.elevationMm ?? activeElevation) - activeElevation; points[0] = point; }
    if (destination && destinationPort) { const point = devicePortWorldPosition(destination, destinationPort); point.y += (project.floors.find((item) => item.id === destination!.floorId)?.elevationMm ?? activeElevation) - activeElevation; points[points.length - 1] = point; }
    const existingRoutes = project.routes.filter((route) => route.floorId === activeFloorId); const clearance = Math.max(project.preferences.routeSeparationMm[routeService] ?? 30, project.preferences.routeDiameterMm[routeService] ?? 20); const concealedPoints = points.map((point) => ({ ...point })); const floorDevices = project.devices.filter((device) => device.floorId === activeFloorId);
    if (wallIds.length) points = points.map((point) => {
      const candidates = project.walls.filter((wall) => wallIds.includes(wall.id)).map((wall) => ({ wall, local: worldToWallLocal(wall, point) })).filter(({ wall, local }) => local.distanceAlongMm > 5 && local.distanceAlongMm < wallLength(wall) - 5 && local.heightMm >= 0 && local.heightMm <= wall.heightMm && Math.abs(local.depthMm) <= wall.thicknessMm / 2 + 5).sort((a, b) => Math.abs(a.local.depthMm) - Math.abs(b.local.depthMm));
      return candidates[0] ? constrainRoutePointToWallLining(candidates[0].wall, point) : point;
    });
    const endpointDeviceIds = [sourceDeviceId, destinationDeviceId].filter((id): id is string => !!id);
    if (!routePointsKeepDeviceClearance(points, floorDevices, endpointDeviceIds, 100)) points = concealedPoints;
    const activeFloor = project.floors.find((item) => item.id === activeFloorId); let wallTop = activeFloor?.ceilingHeightMm ?? 2700;
    if (wallIds.length) {
      const wallHeights = project.walls.filter((wall) => wallIds.includes(wall.id)).map((wall) => wall.heightMm); wallTop = Math.min(...wallHeights); const wallMaximum = Math.max(100, wallTop - 100);
      points = points.map((point, index) => index === 0 || index === points.length - 1 || point.y < 0 || point.y >= wallTop ? point : { ...point, y: Math.max(0, Math.min(wallMaximum, point.y)) });
    }
    const bounds = routeSurfaceBounds(project.floors, activeFloorId);
    points = addVerticalClearanceAtCrossings(points, existingRoutes, clearance, bounds.floorMinimumY, bounds.ceilingMaximumY, { bendRadiusMm: project.preferences.routeBendRadiusMm[routeService] ?? 0, diameterMm: project.preferences.routeDiameterMm[routeService] ?? 20, wallTopMm: wallTop, surfaceBounds: bounds });
    const route: Route = {
      id: crypto.randomUUID(), kind, name: formatRouteName(project, routeService, kind, activeFloorId),
      serviceCategory: routeService, subtype: kind === 'cable' ? 'Custom cable' : kind === 'pipe' ? 'Custom pipe' : 'Custom duct', standard: '', manufacturer: '', productCode: '', floorId: activeFloorId,
      roomIds: project.rooms.filter((room) => points.some((point) => pointInPolygon(point, room.boundary))).map((room) => room.id), wallIds,
      sourceDeviceId, destinationDeviceId, sourcePortId: sourcePort?.id, destinationPortId: destinationPort?.id,
      points: points.map((point, order) => ({ ...point, id: crypto.randomUUID(), order })), installationMethod: 'concealed', physicalIdentification: '', labelAtSource: '', labelAtDestination: '',
      installationStatus: 'planned', testStatus: 'not tested', flowDirection: routeFlowFromEndpointPorts(sourcePort, destinationPort), colorSource: 'projectConvention',
      conductorConfiguration: kind === 'cable' && routeService === 'electrical' ? 'single-phase' : undefined,
      conductorColors: kind === 'cable' && routeService === 'electrical' ? structuredClone(ITALIAN_CONDUCTOR_COLORS['single-phase']) : undefined,
      ethernetTerminationStandard: kind === 'cable' && routeService === 'data' ? 'T568B' : undefined,
      ethernetPairColors: kind === 'cable' && routeService === 'data' ? structuredClone(ETHERNET_PAIR_COLORS.T568B) : undefined,
      conduit: kind === 'cable' ? { serviceType: routeService, displayColor: project.categories.find((category) => category.serviceCategory === routeService)?.color ?? '#6b747b', label: '', containsCableIds: [], material: '', installationType: 'concealed' } : undefined,
      notes: '', customProperties: [], pipe: kind === 'pipe' ? { material: '' } : undefined, duct: kind === 'duct' ? { material: '' } : undefined, locked: false, hidden: false
    };
    const candidate = resolveRouteConflicts(route, project.preferences.avoidRouteOverlaps ? existingRoutes : [], project.preferences.routeOverlapPriorities, project.preferences.routeSeparationMm, project.preferences.routeDiameterMm, 10, project.walls, project.preferences.routeBendRadiusMm, routeSurfaceBounds(project.floors, activeFloorId), project.preferences.routeTurnPenaltyMm, floorDevices);
    const resolved = routePointsKeepDeviceClearance(candidate.route.points, floorDevices, endpointDeviceIds, 100) ? candidate : { route, remainingConflicts: candidate.remainingConflicts };
    const confinedRoute = confineRouteToAssociatedWalls({ ...resolved.route, points: orthogonalizeWallRoutePoints(resolved.route.points, project.walls.filter((wall) => wallIds.includes(wall.id))).map((point, order) => ({ ...point, id: 'id' in point && typeof point.id === 'string' ? point.id : crypto.randomUUID(), order })) }, project.walls);
    const finalRoute = normalizeConcealedRouteSurfaces({ ...project, routes: [confinedRoute] }, [confinedRoute])[0] ?? confinedRoute;
    commit((current) => {
      const stacked = stackFloorRoutes([...current.routes, finalRoute], activeFloorId, current.preferences.floorRouteOffsetMm, current.preferences.routeVerticalOrder, current.preferences.routeSeparationMm);
      if (!current.preferences.avoidRouteOverlaps) return { ...current, routes: stacked };
      const inserted = stacked.find((item) => item.id === finalRoute.id); if (!inserted) return { ...current, routes: stacked };
      const others = stacked.filter((item) => item.id !== inserted.id && item.floorId === inserted.floorId);
      const conflictResolved = resolveRouteConflicts(inserted, others, current.preferences.routeOverlapPriorities, current.preferences.routeSeparationMm, current.preferences.routeDiameterMm, 10, current.walls, current.preferences.routeBendRadiusMm, routeSurfaceBounds(current.floors, inserted.floorId), current.preferences.routeTurnPenaltyMm, current.devices.filter((device) => device.floorId === inserted.floorId)).route;
      const confined = confineRouteToAssociatedWalls(conflictResolved, current.walls);
      const normalized = normalizeConcealedRouteSurfaces({ ...current, routes: [confined] }, [confined])[0] ?? confined;
      return { ...current, routes: stacked.map((item) => item.id === normalized.id ? normalized : item) };
    }); setSelection(viewMode === 'xray' ? { type: 'route', ids: [finalRoute.id] } : null); setTool('select');
    const hiddenHint = viewMode === 'xray' ? '' : ' Turn on X-ray to inspect the concealed route.';
    const conflictHint = resolved.remainingConflicts ? ` ${resolved.remainingConflicts} clearance conflict${resolved.remainingConflicts === 1 ? '' : 's'} remain; review them in Settings.` : '';
    setNotice(`${finalRoute.name} created between ${source?.name ?? 'the first endpoint'} and ${destination?.name ?? 'the second endpoint'}.${conflictHint}${hiddenHint}`);
    return true;
  };
  const createRouteJunction = (position: Vec3, routeId?: string, requestedWallId?: string) => {
    if (!project) return; const id = crypto.randomUUID(); const floorId = project.routes.find((route) => route.id === routeId)?.floorId ?? activeFloorId;
    let junctionPosition = { ...position }; let splitIndex = -1;
    const targetRoute = project.routes.find((route) => route.id === routeId);
    if (targetRoute) {
      let best = Number.POSITIVE_INFINITY;
      targetRoute.points.slice(1).forEach((end, index) => { const start = targetRoute.points[index]; const dx = end.x - start.x; const dy = end.y - start.y; const dz = end.z - start.z; const lengthSquared = dx * dx + dy * dy + dz * dz || 1; const raw = ((position.x - start.x) * dx + (position.y - start.y) * dy + (position.z - start.z) * dz) / lengthSquared; const t = Math.max(.05, Math.min(.95, raw)); const projected = { x: Math.round(start.x + dx * t), y: Math.round(start.y + dy * t), z: Math.round(start.z + dz * t) }; const distance = distance3(position, projected); if (distance < best) { best = distance; junctionPosition = projected; splitIndex = index; } });
    }
    const wall = project.walls.find((item) => item.id === requestedWallId) ?? project.walls.filter((item) => item.floorId === floorId).find((item) => { const local = worldToWallLocal(item, junctionPosition); return Math.abs(local.depthMm) <= item.thicknessMm / 2 + 100 && local.distanceAlongMm >= 0 && local.distanceAlongMm <= wallLength(item); });
    const local = wall ? worldToWallLocal(wall, junctionPosition) : undefined; const portIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    const junction: Device = { id, typeId: 'route-junction', name: `Junction ${project.devices.filter((device) => device.typeId === 'route-junction').length + 1}`, categoryId: categoryIdForService(routeService), serviceCategory: routeService, manufacturer: '', model: '', description: 'Route merge / split point', floorId, wallId: wall?.id, associationType: wall ? 'wall' : junctionPosition.y <= 100 ? 'floor' : 'free', position: junctionPosition, heightFromFloorMm: junctionPosition.y, rotationDeg: { x: 0, y: 0, z: 0 }, dimensions: { width: 140, height: 140, depth: 140 }, distanceAlongWallMm: local?.distanceAlongMm, depthInsideWallMm: local?.depthMm, wallSide: wall ? 'center' : undefined, mounting: wall ? 'concealed' : 'surface', backFace: 'back', powerRequirements: '', networkRequirements: '', notes: '', installationStatus: 'planned', displayColor: project.categories.find((category) => category.serviceCategory === routeService)?.color, colorSource: 'projectConvention', showLabel: false, ports: portIds.map((portId, index) => ({ id: portId, deviceId: id, name: `Branch ${index + 1}`, portType: 'route junction', direction: 'bidirectional', serviceCategory: routeService, connectorType: '', notes: '', position: { x: index === 0 ? -70 : index === 1 ? 70 : 0, y: 0, z: index === 2 ? 70 : 0 }, face: index === 0 ? 'left' : index === 1 ? 'right' : 'front', required: false })), customProperties: [], locked: false, hidden: false };
    commit((current) => {
      if (!targetRoute || splitIndex < 0) return { ...current, devices: [...current.devices, junction] };
      const splitPoint = { ...junctionPosition, id: crypto.randomUUID(), order: splitIndex + 1 }; const firstPoints = [...targetRoute.points.slice(0, splitIndex + 1), splitPoint].map((point, order) => ({ ...point, id: crypto.randomUUID(), order })); const secondPoints = [splitPoint, ...targetRoute.points.slice(splitIndex + 1)].map((point, order) => ({ ...point, id: crypto.randomUUID(), order }));
      const first: Route = { ...targetRoute, id: crypto.randomUUID(), name: `${targetRoute.name} A`, destinationDeviceId: id, destinationPortId: portIds[0], points: firstPoints, installedLengthMm: undefined };
      const second: Route = { ...targetRoute, id: crypto.randomUUID(), name: `${targetRoute.name} B`, sourceDeviceId: id, sourcePortId: portIds[1], points: secondPoints, installedLengthMm: undefined };
      return { ...current, devices: [...current.devices, junction], routes: [...current.routes.filter((route) => route.id !== targetRoute.id), first, second] };
    });
    setSelection({ type: 'device', ids: [id] }); setNotice(targetRoute ? `${targetRoute.name} split at ${junction.name}. New routes can branch from its ports.` : `${junction.name} placed.`);
  };
  const createMeasurement = (start: Vec3, end: Vec3, type: Measurement['type'] = measurementType, referencedObjectIds: string[] = []) => {
    if (!project) return; const wallId = selection?.type === 'wall' ? selection.ids[0] : undefined;
    const measurement: Measurement = { id: crypto.randomUUID(), projectId: project.id, type, name: `${type === 'height' || type === 'vertical' ? 'Height' : 'Dimension'} ${project.measurements.length + 1}`, start, end, wallId, referencedObjectIds, text: '', visible: true, locked: false };
    commit((current) => ({ ...current, measurements: [...current.measurements, measurement] })); setSelection({ type: 'measurement', ids: [measurement.id] }); setTool('select');
  };

  const deleteSelection = useCallback(() => {
    if (!selection) return;
    if (project && selectionIsLocked(project, selection)) { setNotice('Unlock the selection in Properties before deleting it.'); return; }
    commit((current) => {
      const ids = new Set(selection.ids);
      const structuralTypeIds = new Set(current.deviceTypes.filter((type) => type.family === 'structure').map((type) => type.id));
      const attachedStructureIds = new Set(selection.type === 'wall' ? current.devices.filter((device) => device.wallId && ids.has(device.wallId) && structuralTypeIds.has(device.typeId)).map((device) => device.id) : []);
      const deletedDeviceIds = new Set([...(selection.type === 'device' ? ids : []), ...attachedStructureIds]);
      const withoutConnectedRoutes = removeDevicesAndConnectedRoutes(current, deletedDeviceIds, selection.type === 'route' ? ids : []);
      return { ...withoutConnectedRoutes,
        walls: current.walls.filter((item) => !ids.has(item.id)), rooms: current.rooms.filter((item) => !ids.has(item.id)).map((room) => ({ ...room, wallIds: room.wallIds.filter((id) => !ids.has(id)) })),
        measurements: current.measurements.filter((item) => !ids.has(item.id)) };
    }); setSelection(null);
  }, [selection, project, commit]);
  const duplicateObjects = useCallback((target: Selection) => {
    if (project && selectionIsLocked(project, target)) { setNotice('Unlock the selection in Properties before duplicating it.'); return; }
    commit((current) => {
      if (target.type === 'wall') { const copies = current.walls.filter((item) => target.ids.includes(item.id)).map((item) => ({ ...item, id: crypto.randomUUID(), name: `${item.name} copy`, start: { x: item.start.x + 200, z: item.start.z + 200 }, end: { x: item.end.x + 200, z: item.end.z + 200 } })); setSelection({ type: 'wall', ids: copies.map((item) => item.id) }); return { ...current, walls: [...current.walls, ...copies] }; }
      if (target.type === 'device') { const copies = current.devices.filter((item) => target.ids.includes(item.id)).map((item) => {
        const id = crypto.randomUUID(); const portMap = new Map(item.ports.map((port) => [port.id, crypto.randomUUID()]));
        const internalPortMap = new Map(item.rackConfiguration?.modules.flatMap((module) => module.ports).map((port) => [port.id, crypto.randomUUID()]) ?? []);
        const shelfGroupMap = new Map<string,string>(); item.rackConfiguration?.modules.forEach((module) => { if (module.shelfGroupId && !shelfGroupMap.has(module.shelfGroupId)) shelfGroupMap.set(module.shelfGroupId, crypto.randomUUID()); });
        return { ...item, id, name: `${item.name} copy`, position: { ...item.position, x: item.position.x + 200 }, ports: item.ports.map((port) => ({ ...port, id: portMap.get(port.id)!, deviceId: id })), riserRouteLinks: undefined, rackConfiguration: item.rackConfiguration ? { ...structuredClone(item.rackConfiguration), modules: item.rackConfiguration.modules.map((module) => ({ ...structuredClone(module), id: crypto.randomUUID(), shelfGroupId: module.shelfGroupId ? shelfGroupMap.get(module.shelfGroupId) : undefined, ports: module.ports.map((port) => ({ ...structuredClone(port), id: internalPortMap.get(port.id)!, pairedPortId: port.pairedPortId ? internalPortMap.get(port.pairedPortId) : undefined, connectedPortId: port.connectedPortId ? internalPortMap.get(port.connectedPortId) : undefined, externalPortId: port.externalPortId ? portMap.get(port.externalPortId) : undefined })) })) } : undefined };
      }); setSelection({ type: 'device', ids: copies.map((item) => item.id) }); return { ...current, devices: [...current.devices, ...copies] }; }
      if (target.type === 'route') { const copies = current.routes.filter((item) => target.ids.includes(item.id)).map((item) => ({ ...item, id: crypto.randomUUID(), name: `${item.name} copy`, points: item.points.map((point) => ({ ...point, id: crypto.randomUUID(), x: point.x + 200 })) })); setSelection({ type: 'route', ids: copies.map((item) => item.id) }); return { ...current, routes: [...current.routes, ...copies] }; }
      return current;
    });
  }, [commit, project]);
  const duplicateSelection = useCallback(() => { if (selection) duplicateObjects(selection); }, [selection, duplicateObjects]);
  const setSelectionLocked = (locked: boolean) => {
    if (!selection) return; const ids = new Set(selection.ids);
    commit((current) => ({ ...current,
      walls: current.walls.map((item) => ids.has(item.id) ? { ...item, locked } : item),
      rooms: current.rooms.map((item) => ids.has(item.id) ? { ...item, locked } : item),
      devices: current.devices.map((item) => ids.has(item.id) ? { ...item, locked } : item),
      routes: current.routes.map((item) => ids.has(item.id) ? { ...item, locked } : item),
      measurements: current.measurements.map((item) => ids.has(item.id) ? { ...item, locked } : item)
    }));
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const input = event.target instanceof HTMLInputElement ? event.target : undefined;
      const editing = event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || !!input && !['checkbox', 'radio', 'button'].includes(input.type);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void saveNow(); return; }
      if (editing) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateSelection(); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') { clipboard.current = selection; }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') { if (clipboard.current) duplicateObjects(clipboard.current); }
      else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); if (tool !== 'select') { setCancelToken((value) => value + 1); setNotice('Current drawing cancelled.'); } else deleteSelection(); }
      else if (event.key === 'Escape') { setSelection(null); setCancelToken((value) => value + 1); }
      else if (event.key.toLowerCase() === 'x') { if (page === 'photo') setPhotoXray((current) => !current); else setViewMode((current) => current === 'xray' ? 'normal' : 'xray'); }
      else if (event.key.toLowerCase() === 's') chooseTool('select'); else if (event.key.toLowerCase() === 'w') chooseTool('wall'); else if (event.key.toLowerCase() === 'r') chooseTool('room'); else if (event.key.toLowerCase() === 't') chooseTool('structure'); else if (event.key.toLowerCase() === 'd') chooseTool('device'); else if (event.key.toLowerCase() === 'c') chooseTool('container'); else if (event.key.toLowerCase() === 'm') chooseTool('measure'); else if (event.key.toLowerCase() === 'e') chooseTool('route');
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [chooseTool, deleteSelection, duplicateObjects, duplicateSelection, page, redo, saveNow, selection, tool, undo]);

  const theme = (localStorage.getItem('casa-theme') as ThemeMode | null) ?? project?.preferences.theme ?? 'system';
  const [themeMode, setThemeMode] = useState<ThemeMode>(theme);
  useEffect(() => { const media = matchMedia('(prefers-color-scheme: dark)'); const apply = () => { const next = themeMode === 'system' ? media.matches ? 'dark' : 'light' : themeMode; document.documentElement.dataset.theme = next; setResolvedTheme(next); }; apply(); media.addEventListener('change', apply); localStorage.setItem('casa-theme', themeMode); return () => media.removeEventListener('change', apply); }, [themeMode]);
  const changeTheme = (mode: ThemeMode) => { setThemeMode(mode); commit((current) => ({ ...current, preferences: { ...current.preferences, theme: mode } })); };

  const addFloor = () => {
    if (!project) return; const name = window.prompt('Floor name', `Floor ${project.floors.length + 1}`); if (!name) return;
    const ordered = [...project.floors].sort((a, b) => a.sortOrder - b.sortOrder); const previous = ordered.at(-1)!; const floor: Floor = { id: crypto.randomUUID(), name, sortOrder: ordered.length, elevationMm: previous.elevationMm + previous.ceilingHeightMm + 300, ceilingHeightMm: 2700 };
    commit((current) => ({ ...current, floors: [...current.floors, floor] })); setActiveFloorId(floor.id); setShowAllFloors(false); setShowAdjacentBlueprint(false); setSelection(null);
  };
  const reorderFloor = (id: string, direction: -1 | 1) => commit((current) => { const ordered = [...current.floors].sort((a, b) => a.sortOrder - b.sortOrder); const index = ordered.findIndex((floor) => floor.id === id); const target = index + direction; if (index < 0 || target < 0 || target >= ordered.length) return current; [ordered[index], ordered[target]] = [ordered[target], ordered[index]]; const orderById = new Map(ordered.map((floor, order) => [floor.id, order])); return { ...current, floors: current.floors.map((floor) => ({ ...floor, sortOrder: orderById.get(floor.id)! })) }; });
  const deleteFloor = (id: string) => {
    if (!project || project.floors.length === 1) return; const floor = project.floors.find((item) => item.id === id); if (!floor || !window.confirm(`Delete “${floor.name}” and its walls, rooms, routes, and attached structures?`)) return;
    const remaining = [...project.floors.filter((item) => item.id !== id)].sort((a, b) => a.sortOrder - b.sortOrder); const nextFloor = remaining[0];
    void Promise.all(project.photoMarkers.filter((marker) => marker.floorId === id).flatMap((marker) => marker.photos.map((photo) => api.deletePhoto(project.id, photo.storedFileName).catch(() => undefined))));
    commit((current) => { const wallIds = new Set(current.walls.filter((wall) => wall.floorId === id).map((wall) => wall.id)); const roomIds = new Set(current.rooms.filter((room) => room.floorId === id).map((room) => room.id)); const deviceIds = new Set(current.devices.filter((device) => device.floorId === id || device.accessibleFloorIds?.includes(id)).map((device) => device.id)); return { ...current, floors: current.floors.filter((item) => item.id !== id).map((item, index) => ({ ...item, sortOrder: index })), walls: current.walls.filter((wall) => wall.floorId !== id), rooms: current.rooms.filter((room) => room.floorId !== id), devices: current.devices.filter((device) => !deviceIds.has(device.id)).map((device) => ({ ...device, roomId: device.roomId && roomIds.has(device.roomId) ? undefined : device.roomId, wallId: device.wallId && wallIds.has(device.wallId) ? undefined : device.wallId })), routes: current.routes.filter((route) => route.floorId !== id && !deviceIds.has(route.sourceDeviceId ?? '') && !deviceIds.has(route.destinationDeviceId ?? '')), measurements: current.measurements.filter((measurement) => !measurement.wallId || !wallIds.has(measurement.wallId)), lightingControls: current.lightingControls.filter((control) => !deviceIds.has(control.switchDeviceId)).map((control) => ({ ...control, lightDeviceIds: control.lightDeviceIds.filter((deviceId) => !deviceIds.has(deviceId)) })), photoMarkers: current.photoMarkers.filter((marker) => marker.floorId !== id) }; });
    setActiveFloorId(nextFloor.id); setSelection(null);
  };
  const changeRouteKind = (kind: typeof routeKind) => {
    setRouteKind(kind); setTool('route');
    setSelection((current) => current?.type === 'device' ? current : null);
    if (kind === 'transition') { const transition = project?.deviceTypes.find((type) => type.id === 'floor-transition'); if (transition) setPlacementType(transition); return; }
    if (kind === 'junction') return;
    if (!ROUTE_SERVICE_COMPATIBILITY[kind].includes(routeService)) setRouteService(ROUTE_SERVICE_COMPATIBILITY[kind][0]);
  };
  const addCustomType = () => setCustomTypeOpen(true);
  const roomCategoryColors = ['#4f8cff', '#c970ff', '#28a987', '#e58c36', '#df5f78', '#74838b'];
  const addRoomCategory = () => {
    if (!project) return;
    const name = window.prompt('Room category name', 'Parents Apartment')?.trim(); if (!name) return;
    const category: RoomCategory = { id: crypto.randomUUID(), name, description: '', color: roomCategoryColors[(project.roomCategories.length) % roomCategoryColors.length] };
    commit((current) => ({ ...current, roomCategories: [...current.roomCategories, category] }));
  };
  const editRoomCategory = (id: string) => {
    if (!project) return;
    const category = project.roomCategories.find((item) => item.id === id); if (!category) return;
    const name = window.prompt('Room category name', category.name)?.trim(); if (!name) return;
    const description = window.prompt('Room category description (optional)', category.description) ?? category.description;
    commit((current) => ({ ...current, roomCategories: current.roomCategories.map((item) => item.id === id ? { ...item, name, description } : item) }));
  };
  const deleteRoomCategory = (id: string) => {
    if (!project) return;
    const category = project.roomCategories.find((item) => item.id === id); if (!category || !window.confirm(`Delete room category “${category.name}”? Rooms will become uncategorized.`)) return;
    commit((current) => ({ ...current, roomCategories: current.roomCategories.filter((item) => item.id !== id), rooms: current.rooms.map((room) => room.categoryId === id ? { ...room, categoryId: undefined } : room) }));
  };
  const preparePhotoMarker = (position: Vec3) => { setPhotoPlacementActive(false); setPendingPhotoPosition({ x: Math.round(position.x), y: Math.round(position.y), z: Math.round(position.z) }); };
  const createPhotoMarker = (position: Vec3, values: { title: string; description: string; category: PhotoCategory }) => {
    if (!project) return; const id = crypto.randomUUID(); const marker: PhotoMarker = { id, projectId: project.id, floorId: activeFloorId, title: values.title, description: values.description, category: values.category, position, createdAt: new Date().toISOString(), photos: [] };
    setPhotoCategory(values.category); setPendingPhotoPosition(undefined);
    commit((current) => ({ ...current, photoMarkers: [...current.photoMarkers, marker] })); setPhotoPlacementActive(false); setOpenPhotoMarkerId(id); setNotice(t('Photo point placed. Add one or more local pictures.'));
  };
  const updatePhotoMarker = (id: string, patch: Partial<PhotoMarker>) => commit((current) => ({ ...current, photoMarkers: current.photoMarkers.map((marker) => marker.id === id ? { ...marker, ...patch } : marker) }));
  const addMarkerPhotos = (id: string, photos: ProjectPhoto[]) => commit((current) => ({ ...current, photoMarkers: current.photoMarkers.map((marker) => marker.id === id ? { ...marker, photos: [...marker.photos, ...photos] } : marker) }));
  const removeMarkerPhoto = async (markerId: string, photo: ProjectPhoto) => { if (!project) return; try { await api.deletePhoto(project.id, photo.storedFileName); } catch { /* The metadata removal still prevents a broken project reference. */ } commit((current) => ({ ...current, photoMarkers: current.photoMarkers.map((marker) => marker.id === markerId ? { ...marker, photos: marker.photos.filter((item) => item.id !== photo.id) } : marker) })); };
  const deletePhotoMarker = async (id: string) => { if (!project) return; const marker = project.photoMarkers.find((item) => item.id === id); if (!marker || !window.confirm(t('Delete this photo point and its local pictures?'))) return; await Promise.all(marker.photos.map((photo) => api.deletePhoto(project.id, photo.storedFileName).catch(() => undefined))); commit((current) => ({ ...current, photoMarkers: current.photoMarkers.filter((item) => item.id !== id) })); setOpenPhotoMarkerId(undefined); };
  const photoCounts = useMemo(() => project ? Object.fromEntries(PHOTO_CATEGORIES.map((category) => [category.id, project.photoMarkers.filter((marker) => marker.category === category.id).length])) as Partial<Record<PhotoCategory, number>> : {}, [project]);
  const changePage = (next: 'editor' | 'overview' | 'light' | 'photo') => { setPage(next); setPhotoPlacementActive(false); setPendingPhotoPosition(undefined); if (next === 'photo' || next === 'light') { setSelection(null); setIsolatedRoomId(undefined); setShowAllFloors(false); } };
  const toolbarViewMode: ViewMode = page === 'light' ? 'xray' : page === 'photo' ? photoXray ? 'xray' : 'normal' : viewMode;
  const changeToolbarViewMode = (mode: ViewMode) => { if (page === 'light') return; if (page === 'photo') setPhotoXray(mode === 'xray'); else setViewMode(mode); };
  const exportBackup = () => { if (!project) return; const blob = new Blob([serializeProject(project)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${project.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'house-project'}-backup.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  const importBackup = async (file: File) => { try { const backup = JSON.parse(await file.text()); const loaded = upgradeProject(await api.importBackup(backup)); setHistory(createHistory(loaded)); setActiveFloorId(startingFloorId(loaded)); setProjectManager(false); setNotice('Project backup imported and validated.'); } catch (error) { setNotice(error instanceof Error ? error.message : 'Backup import failed.'); } };
  const refreshProjects = async () => setProjectList(await api.listProjects());
  const openManager = () => { void refreshProjects(); setProjectManager(true); };

  useEffect(() => {
    if (!snapshotPreparing) return;
    let secondFrame = 0; const firstFrame = requestAnimationFrame(() => { secondFrame = requestAnimationFrame(() => {
      const canvas = viewportRef.current?.querySelector('canvas');
      if (canvas) setSnapshotSource(canvas.toDataURL('image/png')); else setNotice('The current 3D view could not be captured.');
      setSnapshotPreparing(false);
    }); });
    return () => { cancelAnimationFrame(firstFrame); cancelAnimationFrame(secondFrame); };
  }, [snapshotPreparing]);

  const focusIntersection = (item: (typeof routeIntersections)[number], solution: boolean) => {
    if (!project) return; const route = project.routes.find((candidate) => candidate.id === item.routeAId); const floor = project.floors.find((candidate) => candidate.id === route?.floorId); if (!route || !floor) return;
    setPage('editor'); setActiveFloorId(floor.id); setShowAllFloors(false); setIsolatedRoomId(undefined); setViewMode('xray'); setSelection({ type: 'route', ids: [item.routeAId, item.routeBId] });
    setViewCommand({ command: 'focus-point', nonce: Date.now(), focusPoint: { x: item.point.x, y: floor.elevationMm + item.point.y, z: item.point.z }, radius: 2.3 }); setConflictReview((current) => current ? { ...current, solution } : current);
  };
  const startIntersectionReview = (intersectionId?: string) => {
    if (!routeIntersections.length) { setNotice('No route conflicts are available to review.'); return; } const index = Math.max(0, intersectionId ? routeIntersections.findIndex((item) => item.id === intersectionId) : 0); const item = routeIntersections[index];
    setSettingsOpen(false); setLayoutReview(undefined); setConflictReview({ items: routeIntersections, index, solution: false }); focusIntersection(item, false);
  };
  const advanceIntersectionReview = () => {
    if (!conflictReview) return; const nextIndex = conflictReview.index + 1; if (nextIndex >= conflictReview.items.length) { setConflictReview(undefined); setSelection(null); setSettingsOpen(true); return; }
    const next = conflictReview.items[nextIndex]; setConflictReview({ ...conflictReview, index: nextIndex, solution: false }); focusIntersection(next, false);
  };
  const closeIntersectionReview = () => { setConflictReview(undefined); setSelection(null); setSettingsOpen(true); };
  const focusRouteLayout = (item: RouteLayoutIssue, solution: boolean) => {
    const floor = project?.floors.find((candidate) => candidate.id === item.floorId); if (!floor) return;
    setPage('editor'); setActiveFloorId(floor.id); setShowAllFloors(false); setIsolatedRoomId(undefined); setViewMode('xray'); setSelection({ type: 'route', ids: item.affectedRouteIds });
    setViewCommand({ command: 'focus-point', nonce: Date.now(), focusPoint: { x: item.focusPoint.x, y: floor.elevationMm + item.focusPoint.y, z: item.focusPoint.z }, radius: 4 });
    setLayoutReview((current) => current ? { ...current, solution } : current);
  };
  const startRouteLayoutReview = (issueId?: string) => {
    if (!routeLayoutIssues.length) { setNotice(t('No coordinated route improvements are available.')); return; }
    const index = Math.max(0, issueId ? routeLayoutIssues.findIndex((item) => item.id === issueId) : 0); const item = routeLayoutIssues[index];
    setSettingsOpen(false); setConflictReview(undefined); setLayoutReview({ items: routeLayoutIssues, index, solution: false }); focusRouteLayout(item, false);
  };
  const advanceRouteLayoutReview = () => {
    if (!layoutReview) return; const nextIndex = layoutReview.index + 1;
    if (nextIndex >= layoutReview.items.length) { setLayoutReview(undefined); setSelection(null); setSettingsOpen(true); return; }
    const next = layoutReview.items[nextIndex]; setLayoutReview({ ...layoutReview, index: nextIndex, solution: false }); focusRouteLayout(next, false);
  };
  const closeRouteLayoutReview = () => { setLayoutReview(undefined); setSelection(null); setSettingsOpen(true); };

  const selectedWallId = selection?.type === 'wall' && selection.ids.length === 1 ? selection.ids[0] : undefined;
  const selectedRoomName = project?.rooms.find((room) => selection?.ids.includes(room.id))?.name ?? '—';
  if (!project || !history) {
    if (firstRun) return <FirstRunScreen appIconUrl={appIconUrl} notice={notice} onCreate={createProject} />;
    return <div className="loading-screen"><img src={appIconUrl} alt="" /><strong>{SOFTWARE_NAME}</strong><span>{notice === 'Ready' ? 'Starting the local desktop service…' : notice}</span></div>;
  }
  const focusLightingItem = (deviceId?: string, routeId?: string) => {
    const device = deviceId ? project.devices.find((item) => item.id === deviceId) : undefined; const route = routeId ? project.routes.find((item) => item.id === routeId) : undefined;
    const targetFloorId = device?.accessibleFloorIds?.includes(activeFloorId) ? activeFloorId : device?.floorId ?? route?.floorId; if (targetFloorId) setActiveFloorId(targetFloorId);
    if (device) setSelection({ type: 'device', ids: [device.id] }); else if (route) setSelection({ type: 'route', ids: [route.id] });
    setViewCommand({ command: 'fit-selection', nonce: Date.now() });
  };

  return <div className="app-shell">
    <TopToolbar project={project} appIconUrl={appIconUrl} page={page} onPage={changePage} onOpenSettings={() => setSettingsOpen(true)} saveState={saveState} viewMode={toolbarViewMode} projection={projection} theme={themeMode} canUndo={history.past.length > 0} canRedo={history.future.length > 0}
      onSave={() => void saveNow()} onUndo={undo} onRedo={redo} onViewMode={changeToolbarViewMode} onToggle2D={() => { const enable = projection !== 'orthographic'; setPendingProjectionView(enable ? 'top' : 'iso'); setProjection(enable ? 'orthographic' : 'perspective'); }} onView={(command) => setViewCommand({ command, nonce: Date.now() })}
      onTheme={changeTheme} onOpenProjectManager={openManager} onExportBackup={exportBackup} onImportBackup={() => importInput.current?.click()}
      onOpenElevation={() => selectedWallId ? setElevation({ open: true, batch: false }) : setNotice('Select one wall before opening its wall scheme.')} onBatchExport={() => setElevation({ open: true, batch: true })} />
    {page === 'overview' ? <OverviewPage project={project} onAddRoomCategory={addRoomCategory} onEditRoomCategory={editRoomCategory} onDeleteRoomCategory={deleteRoomCategory} /> : page === 'light' && lightingAnalysis ? <div className="workspace-grid lighting-workspace"><LightingSidebar floors={project.floors} activeFloorId={activeFloorId} onActiveFloor={(id) => { setActiveFloorId(id); setSelection(null); }} onManageFloors={() => setLevelManagerOpen(true)} /><main className="viewport-column lighting-viewport" onContextMenu={(event) => event.preventDefault()}><HouseViewport project={project} activeFloorId={activeFloorId} selection={selection} tool="select" viewMode="xray" visibleServices={new Set(project.categories.map((category) => category.serviceCategory))} projection={projection} viewCommand={viewCommand} showAllFloors={false} showAdjacentBlueprint={false} cancelToken={cancelToken} sceneTheme={resolvedTheme} lightingMode visibleDeviceIds={lightingDeviceIds} visibleRouteIds={lightingRouteIds} blinkingDeviceIds={blinkingLightingSwitchIds} suppressRouteMotion routeKind="cable" routeService="lighting" measurementType="point-to-point" onSelect={(next) => { if (!next) { setSelection(null); return; } if (next.type === 'device' && lightingAnalysis.lightIds.includes(next.ids[0])) setSelection(next); }} onCreateWall={() => undefined} onCreateRoom={() => undefined} onCreateStaircase={() => undefined} onPlaceDevice={() => undefined} onCreateRoute={() => false} onCreateRouteJunction={() => undefined} onCreateMeasurement={() => undefined} onAddDevicePort={() => undefined} onReassignRoutePort={() => undefined} onStatus={setStatus} onNotice={setNotice} onNorth={() => setViewCommand({ command: 'front', nonce: Date.now() })} /></main><LightingPanel project={project} activeFloorId={activeFloorId} analysis={lightingAnalysis} selectedLightId={selectedLightId} onSelectLight={(id) => { setSelection({ type: 'device', ids: [id] }); setViewCommand({ command: 'fit-selection', nonce: Date.now() }); }} onLocateIssue={focusLightingItem} /></div> : page === 'photo' ? <div className="photo-workspace-grid"><PhotoSidebar floors={project.floors} activeFloorId={activeFloorId} showAllFloors={showAllFloors} placementActive={photoPlacementActive} visibleCategories={visiblePhotoCategories} counts={photoCounts} onActiveFloor={(id) => { setActiveFloorId(id); setShowAllFloors(false); }} onShowAllFloors={setShowAllFloors} onPlacementActive={setPhotoPlacementActive} onToggleCategory={(category) => setVisiblePhotoCategories((current) => { const next = new Set(current); next.has(category) ? next.delete(category) : next.add(category); return next; })} onSetAllCategories={(visible) => setVisiblePhotoCategories(visible ? new Set(PHOTO_CATEGORIES.map((item) => item.id)) : new Set())} onManageFloors={() => setLevelManagerOpen(true)} /><main className="viewport-column photo-viewport" onContextMenu={(event) => event.preventDefault()}><HouseViewport project={project} activeFloorId={activeFloorId} selection={null} tool="select" viewMode={photoXray ? 'xray' : 'normal'} visibleServices={new Set(project.categories.map((category) => category.serviceCategory))} projection={projection} viewCommand={viewCommand} showAllFloors={showAllFloors} showAdjacentBlueprint={false} cancelToken={cancelToken} sceneTheme={resolvedTheme} photoMode photoPlacementActive={photoPlacementActive} visiblePhotoCategories={visiblePhotoCategories} suppressRouteMotion suppressRoutes={!photoXray} routeKind="cable" routeService="electrical" measurementType="point-to-point" onSelect={() => undefined} onCreateWall={() => undefined} onCreateRoom={() => undefined} onCreateStaircase={() => undefined} onPlaceDevice={() => undefined} onCreateRoute={() => false} onCreateRouteJunction={() => undefined} onCreateMeasurement={() => undefined} onAddDevicePort={() => undefined} onReassignRoutePort={() => undefined} onStatus={setStatus} onNotice={setNotice} onNorth={() => setViewCommand({ command: 'front', nonce: Date.now() })} onPlacePhotoMarker={preparePhotoMarker} onOpenPhotoMarker={setOpenPhotoMarkerId} /></main></div> : <div className="workspace-grid"><LeftSidebar project={project} activeFloorId={activeFloorId} tool={tool} selection={selection} placementType={placementType} routeKind={routeKind} routeService={routeService} measurementType={measurementType} visibleServices={visibleServices}
      onActiveFloor={(id) => { setActiveFloorId(id); setShowAllFloors(false); setSelection(null); setIsolatedRoomId(undefined); }} onTool={chooseTool} onPlacementType={choosePlacementType} onRouteKind={changeRouteKind} onRouteService={setRouteService} onMeasurementType={setMeasurementType}
      onUpdateFloor={(id, patch) => commit((current) => ({ ...current, floors: current.floors.map((floor) => floor.id === id ? { ...floor, ...patch } : floor) }))}
      onNewWallLayers={(layers) => commit((current) => { const preferences = { ...current.preferences, ...layers }; return { ...current, preferences: { ...preferences, newWallThicknessMm: preferences.newWallStructuralThicknessMm + preferences.newWallLiningLeftMm + preferences.newWallLiningRightMm } }; })}
      showAllFloors={showAllFloors} onShowAllFloors={setShowAllFloors}
      onToggleService={(service) => setVisibleServices((current) => { const next = new Set(current); next.has(service) ? next.delete(service) : next.add(service); return next; })} onSetAllServices={(visible) => setVisibleServices(visible ? new Set(project.categories.filter((category) => category.serviceCategory !== 'structural').map((category) => category.serviceCategory)) : new Set())}
      onSelect={select} onManageFloors={() => setLevelManagerOpen(true)} onChooseFurniture={() => setFurnitureOpen(true)} onCreateCustomType={addCustomType} onCreateRoomFromWalls={createRoomFromWalls}
      onAddRoomCategory={addRoomCategory} onEditRoomCategory={editRoomCategory} onDeleteRoomCategory={deleteRoomCategory} />
      <main ref={viewportRef} className="viewport-column" onContextMenu={(event) => event.preventDefault()}>
        <HouseViewport project={viewportProject ?? project} activeFloorId={activeFloorId} selection={selection} isolatedRoomId={isolatedRoomId} conflictFocus={activeLayoutIssue ? { floorId: activeLayoutIssue.floorId, point: activeLayoutIssue.focusPoint, solution: !!layoutReview?.solution, label: t('Coordinated route layout') } : activeConflict ? { floorId: project.routes.find((route) => route.id === activeConflict.routeAId)?.floorId ?? activeFloorId, point: activeConflict.point, solution: !!conflictReview?.solution, label: t('Route conflict') } : undefined} tool={tool} viewMode={viewMode} visibleServices={visibleServices} projection={projection} viewCommand={viewCommand} showAllFloors={showAllFloors} showAdjacentBlueprint={showAdjacentBlueprint} cancelToken={cancelToken} sceneTheme={snapshotPreparing ? 'light' : resolvedTheme} suppressSceneLabels={elevation.open || snapshotPreparing || !!snapshotSource}
          placementType={placementType} routeKind={routeKind} routeService={routeService} measurementType={measurementType} onSelect={select} onCreateWall={createWall} onCreateRoom={createRoom} onCreateStaircase={createStaircase} onPlaceDevice={placeDevice} onCreateRoute={createRoute} onCreateRouteJunction={createRouteJunction} onCreateMeasurement={createMeasurement} onAddDevicePort={addDevicePort} onReassignRoutePort={reassignRoutePort} onStatus={setStatus} onNotice={setNotice} onNorth={() => setViewCommand({ command: 'front', nonce: Date.now() })} />
        <button className="view-snapshot-button" title="Capture a printable light view" aria-label="Capture current 3D view" disabled={snapshotPreparing} onClick={() => setSnapshotPreparing(true)}><Camera size={17} /></button>
        {conflictReview && activeConflict && proposedConflictRoute && <IntersectionModelReview index={conflictReview.index} count={conflictReview.items.length} item={activeConflict} solution={conflictReview.solution} clearanceMm={project.preferences.routeSeparationMm[proposedConflictRoute.serviceCategory] ?? 30} onToggleSolution={() => { const solution = !conflictReview.solution; setConflictReview({ ...conflictReview, solution }); focusIntersection(activeConflict, solution); }} onNext={advanceIntersectionReview} onApply={() => { commit((current) => ({ ...current, routes: current.routes.map((route) => route.id === proposedConflictRoute.id ? proposedConflictRoute : route) })); advanceIntersectionReview(); }} onClose={closeIntersectionReview} />}
        {layoutReview && activeLayoutIssue && <RouteLayoutModelReview index={layoutReview.index} count={layoutReview.items.length} item={activeLayoutIssue} solution={layoutReview.solution} onToggleSolution={() => { const solution = !layoutReview.solution; setLayoutReview({ ...layoutReview, solution }); focusRouteLayout(activeLayoutIssue, solution); }} onNext={advanceRouteLayoutReview} onApply={() => { const replacements = new Map(activeLayoutIssue.proposedRoutes.map((route) => [route.id, route])); commit((current) => ({ ...current, routes: current.routes.map((route) => replacements.get(route.id) ?? route) })); setNotice(t('Coordinated route layout applied.')); closeRouteLayoutReview(); }} onClose={closeRouteLayoutReview} />}
      </main>
      <PropertiesPanel project={project} selection={selection} locked={selectedLocked} onSetLocked={setSelectionLocked} onUpdateWall={updateWall} onUpdateRoom={updateRoom} onUpdateDevice={updateDevice} onUpdateRoute={updateRoute} onUpdateMeasurement={updateMeasurement} onDelete={deleteSelection} onDuplicate={duplicateSelection} onOpenElevation={() => setElevation({ open: true, batch: false })} />
    </div>}
    <footer className="status-bar"><span>XYZ <strong>{(status.x / 1000).toFixed(2)}, {(status.z / 1000).toFixed(2)}, {(status.y / 1000).toFixed(2)} m</strong></span><span>{t('Tool')} <strong>{tool}</strong></span><span>{t('Room')} <strong>{selectedRoomName}</strong></span><span>{t('Grid')} <strong>{(project.preferences.gridSizeMm / 1000).toFixed(2)} m</strong></span><span>{t('Snapping')} <strong>{project.preferences.snapToGrid || project.preferences.snapToEndpoints ? 'ON' : 'OFF'}</strong></span><span className="status-notice">{notice}</span></footer>
    {elevation.open && <ElevationDialog project={project} selectedWallId={selectedWallId} batch={elevation.batch} onClose={() => setElevation({ open: false, batch: false })} />}
    {snapshotSource && <ViewSnapshotDialog source={snapshotSource} projectName={project.title} floorName={project.floors.find((floor) => floor.id === activeFloorId)?.name ?? 'House'} onClose={() => setSnapshotSource(undefined)} />}
    {settingsOpen && <SettingsDialog project={project} appIconUrl={appIconUrl} onApplicationIconFile={async (file) => { const next = await readLocalAppIcon(file); saveLocalAppIcon(next); setAppIconUrl(next); }} onResetApplicationIcon={() => setAppIconUrl(resetLocalAppIcon())} routeLayoutIssues={routeLayoutIssues} onChange={(patch) => commit((current) => { const next = { ...current, ...patch }; if (!patch.preferences) return next; return { ...next, routes: next.floors.reduce((routes, floor) => stackFloorRoutes(routes, floor.id, next.preferences.floorRouteOffsetMm, next.preferences.routeVerticalOrder, next.preferences.routeSeparationMm), next.routes) }; })} onReviewIntersections={startIntersectionReview} onReviewRouteLayout={startRouteLayoutReview} onFocusDevice={(deviceId) => { const device = project.devices.find((item) => item.id === deviceId); if (!device) return; setSettingsOpen(false); setPage('editor'); setActiveFloorId(device.floorId); setShowAllFloors(false); setViewMode('xray'); setSelection({ type: 'device', ids: [device.id] }); setViewCommand({ command: 'fit-selection', nonce: Date.now() }); }} onFocusRoute={(routeId) => { const route = project.routes.find((item) => item.id === routeId); if (!route) return; setSettingsOpen(false); setPage('editor'); setActiveFloorId(route.floorId); setShowAllFloors(false); setViewMode('xray'); setSelection({ type: 'route', ids: [route.id] }); setViewCommand({ command: 'fit-selection', nonce: Date.now() }); }} onClose={() => setSettingsOpen(false)} />}
    {levelManagerOpen && <LevelManagerDialog floors={project.floors} activeFloorId={activeFloorId} showAdjacentBlueprint={showAdjacentBlueprint} onShowAdjacentBlueprint={setShowAdjacentBlueprint} onActiveFloor={(id) => { setActiveFloorId(id); setSelection(null); setIsolatedRoomId(undefined); }} onUpdate={(id, patch) => commit((current) => ({ ...current, floors: current.floors.map((floor) => floor.id === id ? { ...floor, ...patch } : floor) }))} onAdd={addFloor} onDelete={deleteFloor} onReorder={reorderFloor} onNotice={setNotice} onClose={() => setLevelManagerOpen(false)} />}
    {furnitureOpen && <FurnitureDialog types={project.deviceTypes.filter((type) => type.family === 'furniture')} onClose={() => setFurnitureOpen(false)} onChoose={(type) => { setPlacementType(type); setTool('structure'); setFurnitureOpen(false); }} />}
    {pendingTransition && <FloorTransitionDialog activeFloor={project.floors.find((floor) => floor.id === activeFloorId)!} floors={project.floors} onClose={() => setPendingTransition(undefined)} onChoose={(floorId) => { const placement = pendingTransition; setPendingTransition(undefined); placeDevice(placement.position, placement.wallId, undefined, floorId); }} />}
    {customTypeOpen && <CustomDeviceTypeDialog project={project} onClose={() => setCustomTypeOpen(false)} onCreate={(type) => { commit((current) => ({ ...current, deviceTypes: [...current.deviceTypes, type] })); setPlacementType(type); setCustomTypeOpen(false); }} />}
    {openPhotoMarkerId && project.photoMarkers.find((marker) => marker.id === openPhotoMarkerId) && <PhotoMarkerDialog projectId={project.id} marker={project.photoMarkers.find((marker) => marker.id === openPhotoMarkerId)!} onUpdate={(patch) => updatePhotoMarker(openPhotoMarkerId, patch)} onAddPhotos={(photos) => addMarkerPhotos(openPhotoMarkerId, photos)} onRemovePhoto={(photo) => void removeMarkerPhoto(openPhotoMarkerId, photo)} onDeleteMarker={() => void deletePhotoMarker(openPhotoMarkerId)} onClose={() => setOpenPhotoMarkerId(undefined)} onNotice={setNotice} />}
    {pendingPhotoPosition && <PhotoPointCreateDialog position={pendingPhotoPosition} initialCategory={photoCategory} suggestedName={`${t('Photo point')} ${project.photoMarkers.length + 1}`} onCreate={(values) => createPhotoMarker(pendingPhotoPosition, values)} onClose={() => setPendingPhotoPosition(undefined)} />}
    {projectManager && <ProjectManager appIconUrl={appIconUrl} projects={projectList} activeId={project.id} onClose={() => setProjectManager(false)} onOpen={async (id) => { const loaded = upgradeProject(await api.getProject(id)); setHistory(createHistory(loaded)); setActiveFloorId(startingFloorId(loaded)); setSelection(null); setProjectManager(false); }} onNew={async () => { const title = window.prompt('New project name', 'New house project')?.trim(); if (!title) return; const created = await api.saveProject(createDefaultProject(title)); setHistory(createHistory(created)); setActiveFloorId(startingFloorId(created)); setSelection(null); setProjectManager(false); }} onDuplicate={async (id) => { await api.duplicateProject(id); await refreshProjects(); }} onDelete={async (id) => { if (id === project.id) return setNotice('Open another project before deleting the current one.'); if (confirm('Delete this local project and its dedicated workspace folder? This cannot be undone.')) { await api.deleteProject(id); await refreshProjects(); } }} />}
    <ProjectTutorial projectId={project.id} />
    <input ref={importInput} type="file" accept="application/json,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importBackup(file); event.target.value = ''; }} />
  </div>;
}

function IntersectionModelReview({ index, count, item, solution, clearanceMm, onToggleSolution, onNext, onApply, onClose }: { index: number; count: number; item: { label: string; severity: number; point: Vec3 }; solution: boolean; clearanceMm: number; onToggleSolution: () => void; onNext: () => void; onApply: () => void; onClose: () => void }) {
  return <aside className="model-conflict-review" aria-label="Route conflict review"><header><span><strong>Conflict {index + 1} of {count}</strong><small>{item.label}</small></span><button aria-label="Close conflict review" onClick={onClose}>×</button></header><div className="model-conflict-status" data-solution={solution}><i /><span><strong>{solution ? 'Proposed route in model' : 'Current conflict in model'}</strong><small>{solution ? `${clearanceMm / 10} cm clearance · shortest clean candidate` : `Severity ${item.severity} · camera centered on the clash`}</small></span></div><p>X {(item.point.x / 1000).toFixed(2)} m · Y {(item.point.z / 1000).toFixed(2)} m · Z {(item.point.y / 1000).toFixed(2)} m</p><footer><button className={solution ? 'active' : ''} onClick={onToggleSolution}>{solution ? 'Show original' : 'Show solution'}</button><button onClick={onNext}>Skip / next</button><button className="primary" disabled={!solution} onClick={onApply}>Apply</button></footer></aside>;
}

function RouteLayoutModelReview({ index, count, item, solution, onToggleSolution, onNext, onApply, onClose }: { index: number; count: number; item: RouteLayoutIssue; solution: boolean; onToggleSolution: () => void; onNext: () => void; onApply: () => void; onClose: () => void }) {
  const { t } = useI18n(); const turnsSaved = item.current.turns - item.proposed.turns; const conflictsSaved = item.current.conflicts - item.proposed.conflicts; const lengthDelta = item.proposed.lengthMm - item.current.lengthMm;
  return <aside className="model-conflict-review route-layout-review" aria-label={t('Coordinated route layout review')}><header><span><strong>{t('Layout proposal')} {index + 1} / {count}</strong><small>{item.affectedRouteNames.join(' · ')}</small></span><button aria-label={t('Close route layout review')} onClick={onClose}>×</button></header><div className="model-conflict-status" data-solution={solution}><i /><span><strong>{solution ? t('Coordinated proposal in model') : t('Current route layout in model')}</strong><small>{t('The complete affected route set is previewed and applied together.')}</small></span></div><div className="route-layout-metrics"><span><strong>{item.current.turns}</strong><small>{t('Current turns')}</small></span><b>→</b><span><strong>{item.proposed.turns}</strong><small>{t('Proposed turns')}</small></span><span><strong>{turnsSaved}</strong><small>{t('Fewer turns')}</small></span><span><strong>{conflictsSaved}</strong><small>{t('Conflicts removed')}</small></span><span><strong>{lengthDelta >= 0 ? '+' : '−'}{Math.abs(lengthDelta / 1000).toFixed(2)} m</strong><small>{t('Length change')}</small></span></div><p>{item.affectedRouteIds.length} {t('routes coordinated on this floor')}</p><footer><button className={solution ? 'active' : ''} onClick={onToggleSolution}>{solution ? t('Show original') : t('Show coordinated solution')}</button><button onClick={onNext}>{t('Skip / next')}</button><button className="primary" disabled={!solution} onClick={onApply}>{t('Apply all routes')}</button></footer></aside>;
}

function ProjectManager({ appIconUrl, projects, activeId, onClose, onOpen, onNew, onDuplicate, onDelete }: { appIconUrl: string; projects: Array<{ id: string; title: string; updatedAt: string }>; activeId: string; onClose: () => void; onOpen: (id: string) => void; onNew: () => void; onDuplicate: (id: string) => void; onDelete: (id: string) => void }) {
  const { t } = useI18n();
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="project-dialog" role="dialog" aria-modal="true"><header><div><strong>{t('Local projects')}</strong><span>{t('Each project has an isolated local workspace folder')}</span></div><button onClick={onClose}>×</button></header><div className="project-list">{projects.map((project) => <div key={project.id} className={project.id === activeId ? 'active' : ''}><img src={appIconUrl} alt="" /><div><strong>{project.title}</strong><span>{t('Updated')} {new Date(project.updatedAt).toLocaleString()}</span></div><button onClick={() => onOpen(project.id)}>{project.id === activeId ? t('Current project') : t('Open')}</button><button onClick={() => onDuplicate(project.id)}>{t('Duplicate')}</button><button className="danger" onClick={() => onDelete(project.id)}>{t('Delete')}</button></div>)}</div><footer><button className="primary" onClick={onNew}>{t('Create another project')}</button></footer></div></div>;
}

function FirstRunScreen({ appIconUrl, notice, onCreate }: { appIconUrl: string; notice: string; onCreate: (title: string) => Promise<void> }) {
  const [title, setTitle] = useState('Untitled house project');
  const [creating, setCreating] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setCreating(true);
    try { await onCreate(title); } catch { /* the app notice contains the actionable error */ } finally { setCreating(false); }
  };
  return <main className="first-run-screen"><div className="first-run-card"><img src={appIconUrl} alt="" /><span className="eyebrow">LOCAL PROJECT SETUP</span><h1>Start a new infrastructure project</h1><p>Your project database and a dedicated workspace folder will be created locally on this computer. Nothing is uploaded.</p><form onSubmit={submit}><label htmlFor="first-project-title">Project name</label><input id="first-project-title" value={title} onChange={(event) => setTitle(event.target.value)} autoFocus maxLength={120} /><button className="primary" type="submit" disabled={creating}>{creating ? 'Creating…' : 'Create local project'}</button></form>{notice !== 'Create your first local project.' && <span className="first-run-notice">{notice}</span>}</div></main>;
}
