export type Id = string;
export type ThemeMode = 'light' | 'dark' | 'system';
export type ToolMode = 'select' | 'wall' | 'room' | 'structure' | 'device' | 'container' | 'route' | 'measure';
export type ViewMode = 'normal' | 'xray' | 'isolate-room' | 'isolate-wall';
export type ServiceCategory =
  | 'electrical' | 'lighting' | 'data' | 'wifi' | 'security' | 'cctv'
  | 'hvac' | 'heating' | 'plumbing' | 'sensors' | 'automation' | 'storage' | 'structural' | 'transitions' | 'generic' | 'custom';
export type RouteKind = 'cable' | 'pipe' | 'duct';
export type InstallationStatus = 'planned' | 'installed' | 'tested' | 'decommissioned';
export type AssociationType = 'wall' | 'floor' | 'ceiling' | 'free';
export type MountingFace = 'back' | 'front' | 'left' | 'right' | 'top' | 'bottom';
export type ColorSource = 'regulated' | 'standard' | 'projectConvention' | 'userDefined';
export type PhotoCategory = 'finished-house' | 'cable-systems' | 'structural' | 'electrical' | 'data' | 'plumbing' | 'hvac' | 'security' | 'other';
export type ConductorFunction = 'L1' | 'L2' | 'L3' | 'N' | 'PE';
export interface ConductorColor { function: ConductorFunction; color: string; label: string; colorSource: 'regulated' | 'standard' }
export interface EthernetPairColor { pin: number; color: string }
export interface ConduitMetadata {
  serviceType: string;
  displayColor: string;
  label: string;
  containsCableIds: Id[];
  diameterMm?: number;
  material: string;
  installationType: string;
}

export interface Vec2 { x: number; z: number }
export interface Vec3 { x: number; y: number; z: number }
export interface Dimensions3 { width: number; height: number; depth: number }
export interface CustomProperty { key: string; value: string }

export interface FloorBlueprint {
  dataUrl: string;
  fileName: string;
  naturalWidth: number;
  naturalHeight: number;
  /** Millimetres represented by one source-image pixel. */
  scaleMmPerPixel: number;
  offsetXmm: number;
  offsetZmm: number;
  rotationDeg: number;
  opacity: number;
  visible: boolean;
  /** Source-image pixel selected as the common registration point between floors. */
  alignmentPointPx?: Vec2;
  /** Source-image base and tip of the north arrow. */
  northArrowPx?: [Vec2, Vec2];
  /** Persisted source-image endpoints used for the last scale calibration. */
  scaleLinePx?: [Vec2, Vec2];
  /** Real length assigned to scaleLinePx, in integer millimetres. */
  scaleLineLengthMm?: number;
}

export interface Floor {
  id: Id;
  name: string;
  sortOrder: number;
  elevationMm: number;
  ceilingHeightMm: number;
  blueprint?: FloorBlueprint;
}

export interface Wall {
  id: Id;
  floorId: Id;
  name: string;
  start: Vec2;
  end: Vec2;
  heightMm: number;
  /** Total finished thickness: left lining + structural core + right lining. */
  thicknessMm: number;
  structuralThicknessMm: number;
  liningLeftMm: number;
  liningRightMm: number;
  locked: boolean;
  hidden: boolean;
}

export interface Room {
  id: Id;
  floorId: Id;
  name: string;
  description: string;
  boundary: Vec2[];
  wallIds: Id[];
  areaMm2: number;
  ceilingHeightMm: number;
  categoryId?: Id;
  locked: boolean;
  hidden: boolean;
}

export interface RoomCategory {
  id: Id;
  name: string;
  description: string;
  color: string;
}

export interface DevicePort {
  id: Id;
  deviceId: Id;
  name: string;
  portType: string;
  direction: 'input' | 'output' | 'bidirectional';
  serviceCategory: ServiceCategory;
  connectorType: string;
  maximumVoltage?: number;
  maximumCurrent?: number;
  networkSpeed?: string;
  mediaType?: string;
  notes: string;
  /** Device-local millimetres. x=width, y=height, z=depth. */
  position: Vec3;
  face: MountingFace;
  required: boolean;
  /** Minimum enclosure face space reserved for this termination. */
  spaceRequiredMm?: number;
}

export type DevicePortTemplate = Omit<DevicePort, 'id' | 'deviceId'>;

export interface RackModulePort {
  id: Id;
  name: string;
  /** Short editable identifier drawn on the rack face, such as 01 or A12. */
  displayLabel?: string;
  serviceCategory: ServiceCategory;
  direction: 'input' | 'output' | 'bidirectional';
  connectorType: string;
  /** Exact panel side and grid location used by the rack preview and port picker. */
  face: 'front' | 'back';
  row: number;
  column: number;
  networkSpeed?: string;
  poe?: 'none' | 'passive' | '802.3af' | '802.3at' | '802.3bt';
  maximumPowerW?: number;
  maximumVoltage?: number;
  mediaType?: string;
  /** The corresponding front/rear jack of a patch-panel position. */
  pairedPortId?: Id;
  /** A removable internal rack lead to another module port. */
  connectedPortId?: Id;
  /** Optional patch from this internal module to a port exposed by the rack device. */
  externalPortId?: Id;
  notes: string;
}

export interface RackModule {
  id: Id;
  name: string;
  kind: 'ups' | 'pdu' | 'nvr' | 'switch' | 'patch-panel' | 'empty' | 'nas' | 'router' | 'computer' | 'custom';
  startUnit: number;
  heightUnits: number;
  manufacturer: string;
  model: string;
  /** Modules in one shelf group share the same U range and render side-by-side. */
  shelfGroupId?: Id;
  shelfSlot?: number;
  shelfSlotCount?: number;
  ports: RackModulePort[];
}

export interface RackConfiguration {
  /** Prepared-layout migration marker; custom layouts remain editable. */
  layoutVersion?: number;
  totalUnits: number;
  modules: RackModule[];
}

/** Two floor-specific routes that continue through one physical lane in a service riser. */
export interface RiserRouteLink {
  id: Id;
  routeAId: Id;
  routeBId: Id;
}

/** Explicit incoming-to-outgoing route correspondence inside a panel or junction box. */
export interface JunctionRouteGroup {
  id: Id;
  name: string;
  incomingRouteIds: Id[];
  outgoingRouteIds: Id[];
}

export interface DeviceType {
  id: Id;
  /** One-time upgrade marker for built-in definitions; user edits remain untouched after this revision is applied. */
  builtInRevision?: number;
  categoryId: string;
  name: string;
  serviceCategory: ServiceCategory;
  shape: 'box' | 'plate' | 'cylinder' | 'camera' | 'junction' | 'washer' | 'fridge' | 'sink' | 'staircase' | 'solar-panel';
  defaultDimensions: Dimensions3;
  defaultDisplayColor?: string;
  family: 'device' | 'structure' | 'furniture' | 'transition';
  defaultBackFace: MountingFace;
  defaultAssociation: AssociationType;
  defaultPorts: DevicePortTemplate[];
  unlimitedPorts?: boolean;
  defaultPortSpaceMm?: number;
  custom: boolean;
}

export interface Device {
  id: Id;
  typeId: Id;
  name: string;
  categoryId: string;
  serviceCategory: ServiceCategory;
  manufacturer: string;
  model: string;
  description: string;
  roomId?: Id;
  floorId: Id;
  wallId?: Id;
  associationType: AssociationType;
  position: Vec3;
  heightFromFloorMm: number;
  rotationDeg: Vec3;
  dimensions: Dimensions3;
  distanceAlongWallMm?: number;
  depthInsideWallMm?: number;
  wallSide?: 'left' | 'right' | 'center';
  mounting: 'recessed' | 'surface' | 'concealed';
  backFace: MountingFace;
  /** Floor transitions are deliberately available from both adjacent levels. */
  accessibleFloorIds?: Id[];
  transitionToFloorId?: Id;
  powerRequirements: string;
  voltage?: number;
  current?: number;
  wattage?: number;
  networkRequirements: string;
  notes: string;
  installationStatus: InstallationStatus;
  installationDate?: string;
  functionalColor?: string;
  physicalColor?: string;
  displayColor?: string;
  colorSource?: ColorSource;
  showLabel: boolean;
  ports: DevicePort[];
  rackConfiguration?: RackConfiguration;
  riserRouteLinks?: RiserRouteLink[];
  junctionRouteGroups?: JunctionRouteGroup[];
  customProperties: CustomProperty[];
  locked: boolean;
  hidden: boolean;
}

export interface RoutePoint extends Vec3 { id: Id; order: number }

export interface Route {
  id: Id;
  kind: RouteKind;
  name: string;
  serviceCategory: ServiceCategory;
  subtype: string;
  standard: string;
  manufacturer: string;
  productCode: string;
  floorId: Id;
  roomIds: Id[];
  wallIds: Id[];
  sourceDeviceId?: Id;
  destinationDeviceId?: Id;
  sourcePortId?: Id;
  destinationPortId?: Id;
  points: RoutePoint[];
  installedLengthMm?: number;
  spareLengthMm?: number;
  voltage?: number;
  current?: number;
  power?: number;
  conductors?: number;
  conductorCrossSectionMm2?: number;
  wireGauge?: string;
  shielding?: string;
  jacketType?: string;
  fireRating?: string;
  installationMethod: string;
  maximumDataRate?: string;
  poeClass?: string;
  frequencyRating?: string;
  physicalIdentification: string;
  labelAtSource: string;
  labelAtDestination: string;
  conduitAssociation?: string;
  installationStatus: InstallationStatus;
  installationDate?: string;
  testStatus: string;
  testDate?: string;
  flowDirection?: 'source-to-destination' | 'destination-to-source' | 'bidirectional' | 'none';
  functionalColor?: string;
  physicalColor?: string;
  displayColor?: string;
  colorSource?: ColorSource;
  conductorConfiguration?: 'single-phase' | 'three-phase' | 'custom';
  conductorColors?: ConductorColor[];
  ethernetTerminationStandard?: 'T568A' | 'T568B';
  ethernetPairColors?: EthernetPairColor[];
  conduit?: ConduitMetadata;
  notes: string;
  customProperties: CustomProperty[];
  pipe?: {
    material: string; internalDiameterMm?: number; externalDiameterMm?: number;
    wallThicknessMm?: number; pressureRating?: string; temperatureRating?: string;
    flowDirection?: string; insulation?: string;
  };
  duct?: {
    widthMm?: number; heightMm?: number; diameterMm?: number; material: string;
    insulation?: string; airflowDirection?: string; designAirflow?: string;
  };
  locked: boolean;
  hidden: boolean;
}

export interface Measurement {
  id: Id;
  projectId: Id;
  type: 'horizontal' | 'vertical' | 'point-to-point' | 'height' | 'wall-edge' | 'route' | 'text';
  name: string;
  start: Vec3;
  end: Vec3;
  wallId?: Id;
  roomId?: Id;
  referencedObjectIds: Id[];
  text: string;
  visible: boolean;
  locked: boolean;
}

export interface Category {
  id: string;
  name: string;
  serviceCategory: ServiceCategory;
  pattern: string;
  color: string;
}

export interface ExportPreset {
  id: Id;
  name: string;
  width: number;
  height: number;
  scale: number;
  transparent: boolean;
  style: 'light' | 'dark';
  showWallOutline: boolean;
  showDimensions: boolean;
  showLabels: boolean;
  showRouteMetadata: boolean;
  showLegend: boolean;
  showTitleBlock: boolean;
  includeRoomName: boolean;
  includeWallName: boolean;
  includeExportDate: boolean;
}

export interface CameraView {
  id: Id;
  name: string;
  projection: 'perspective' | 'orthographic';
  position: Vec3;
  target: Vec3;
}

export interface LightingControl {
  id: Id;
  name: string;
  switchDeviceId: Id;
  lightDeviceIds: Id[];
  /** Documentation/simulation state only; this application does not control live equipment. */
  state: 'on' | 'off';
  notes: string;
}

export interface ProjectPhoto {
  id: Id;
  markerId: Id;
  originalFileName: string;
  storedFileName: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  caption: string;
  createdAt: string;
}

export interface PhotoMarker {
  id: Id;
  projectId: Id;
  floorId: Id;
  title: string;
  description: string;
  category: PhotoCategory;
  position: Vec3;
  createdAt: string;
  photos: ProjectPhoto[];
}

export interface ProjectSnapshot {
  id: Id;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  floors: Floor[];
  walls: Wall[];
  rooms: Room[];
  roomCategories: RoomCategory[];
  devices: Device[];
  deviceTypes: DeviceType[];
  routes: Route[];
  measurements: Measurement[];
  categories: Category[];
  exportPresets: ExportPreset[];
  cameraViews: CameraView[];
  lightingControls: LightingControl[];
  photoMarkers: PhotoMarker[];
  preferences: {
    theme: ThemeMode;
    gridSizeMm: number;
    snapToGrid: boolean;
    snapToEndpoints: boolean;
    unit: 'mm' | 'cm' | 'm';
    newWallThicknessMm: number;
    newWallStructuralThicknessMm: number;
    newWallLiningLeftMm: number;
    newWallLiningRightMm: number;
    avoidRouteOverlaps: boolean;
    preferSharedCorridors: boolean;
    routeNamingPattern: string;
    routeNamingPrefixes: Partial<Record<ServiceCategory, string>>;
    routeTurnPenaltyMm: number;
    ceilingRouteOffsetMm: number;
    floorRouteOffsetMm: number;
    routeVerticalOrder: RouteKind[];
    /** Service-specific bend radius used on floor and ceiling turns. */
    routeBendRadiusMm: Partial<Record<ServiceCategory, number>>;
    motionMode: 'system' | 'animated' | 'reduced' | 'off';
    routeOverlapPriorities: Partial<Record<ServiceCategory, number>>;
    routeSeparationMm: Partial<Record<ServiceCategory, number>>;
    /** Installed outside diameter used for a service when a route has no explicit physical size. */
    routeDiameterMm: Partial<Record<ServiceCategory, number>>;
    intersectionCheckEnabled: boolean;
  };
}

export interface Selection { type: 'wall' | 'room' | 'device' | 'route' | 'measurement'; ids: Id[] }

export const uuid = () => crypto.randomUUID();
