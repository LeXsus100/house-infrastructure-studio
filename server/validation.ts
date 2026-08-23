import { z } from 'zod';

const id = z.string().min(1).max(100);
const vec2 = z.object({ x: z.number().finite(), z: z.number().finite() });
const vec3 = z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() });
const dimensions = z.object({ width: z.number().positive(), height: z.number().positive(), depth: z.number().positive() });
const customProperties = z.array(z.object({ key: z.string().max(100), value: z.string().max(2000) })).max(200);
const colorSource = z.enum(['regulated', 'standard', 'projectConvention', 'userDefined']);

const blueprint = z.object({ dataUrl: z.string().startsWith('data:image/').max(12_000_000), fileName: z.string().min(1).max(255), naturalWidth: z.number().int().positive(), naturalHeight: z.number().int().positive(), scaleMmPerPixel: z.number().positive(), offsetXmm: z.number().int(), offsetZmm: z.number().int(), rotationDeg: z.number().finite(), opacity: z.number().min(.05).max(1), visible: z.boolean(), alignmentPointPx: vec2.optional(), northArrowPx: z.tuple([vec2, vec2]).optional(), scaleLinePx: z.tuple([vec2, vec2]).optional(), scaleLineLengthMm: z.number().int().positive().optional() });
const floor = z.object({ id, name: z.string().min(1).max(200), sortOrder: z.number().int().nonnegative().default(0), elevationMm: z.number().int(), ceilingHeightMm: z.number().int().positive(), blueprint: blueprint.optional() });
const wall = z.object({
  id, floorId: id, name: z.string().min(1).max(200), start: vec2, end: vec2,
  heightMm: z.number().int().positive(), thicknessMm: z.number().int().positive(), structuralThicknessMm: z.number().int().positive(), liningLeftMm: z.number().int().nonnegative(), liningRightMm: z.number().int().nonnegative(), locked: z.boolean(), hidden: z.boolean()
}).refine((item) => item.start.x !== item.end.x || item.start.z !== item.end.z, 'Wall start and end points must differ.')
  .refine((item) => item.thicknessMm === item.structuralThicknessMm + item.liningLeftMm + item.liningRightMm, 'Finished wall thickness must equal both linings plus the structural core.');
const room = z.object({
  id, floorId: id, name: z.string().min(1).max(200), description: z.string().max(10000),
  boundary: z.array(vec2).min(3), wallIds: z.array(id), areaMm2: z.number().nonnegative(),
  ceilingHeightMm: z.number().int().positive(), categoryId: id.optional(), locked: z.boolean().default(false), hidden: z.boolean()
});
const roomCategory = z.object({ id, name: z.string().min(1).max(200), description: z.string().max(10000), color: z.string().min(1).max(40) });
const port = z.object({
  id, deviceId: id, name: z.string().min(1).max(200), portType: z.string().max(200),
  direction: z.enum(['input', 'output', 'bidirectional']), serviceCategory: z.string(), connectorType: z.string().max(200),
  maximumVoltage: z.number().optional(), maximumCurrent: z.number().optional(), networkSpeed: z.string().optional(),
  mediaType: z.string().optional(), notes: z.string(), position: vec3.default({ x: 0, y: 0, z: 0 }),
  face: z.enum(['back','front','left','right','top','bottom']).default('back'), required: z.boolean().default(false), spaceRequiredMm: z.number().positive().max(2000).optional()
});
const deviceType = z.object({
  id, categoryId: z.string(), name: z.string().min(1).max(200), serviceCategory: z.string(),
  shape: z.enum(['box', 'plate', 'cylinder', 'camera', 'junction', 'washer', 'fridge', 'sink', 'staircase', 'solar-panel']), defaultDimensions: dimensions, defaultDisplayColor: z.string().max(40).optional(),
  family: z.enum(['device','structure','furniture','transition']).default('device'), defaultBackFace: z.enum(['back','front','left','right','top','bottom']).default('back'),
  defaultAssociation: z.enum(['wall','floor','ceiling','free']).default('wall'), defaultPorts: z.array(port.omit({ id: true, deviceId: true })).default([]), unlimitedPorts: z.boolean().optional(), defaultPortSpaceMm: z.number().positive().max(2000).optional(), custom: z.boolean()
});
const rackModulePort = z.object({ id, name: z.string().min(1).max(200), displayLabel: z.string().max(24).optional(), serviceCategory: z.string(), direction: z.enum(['input','output','bidirectional']), connectorType: z.string().max(200), face: z.enum(['front','back']).default('front'), row: z.number().int().min(1).max(64).default(1), column: z.number().int().min(1).max(96).default(1), networkSpeed: z.string().max(100).optional(), poe: z.enum(['none','passive','802.3af','802.3at','802.3bt']).optional(), maximumPowerW: z.number().nonnegative().optional(), maximumVoltage: z.number().nonnegative().optional(), mediaType: z.string().max(100).optional(), pairedPortId: id.optional(), connectedPortId: id.optional(), externalPortId: id.optional(), notes: z.string().max(2000) });
const rackConfiguration = z.object({ layoutVersion: z.number().int().min(1).max(100).optional(), totalUnits: z.number().int().min(4).max(84), modules: z.array(z.object({ id, name: z.string().min(1).max(200), kind: z.enum(['ups','pdu','nvr','switch','patch-panel','empty','nas','router','computer','custom']), startUnit: z.number().int().min(1).max(84), heightUnits: z.number().int().min(1).max(20), manufacturer: z.string().max(200), model: z.string().max(200), shelfGroupId: id.optional(), shelfSlot: z.number().int().min(0).max(20).optional(), shelfSlotCount: z.number().int().min(1).max(20).optional(), ports: z.array(rackModulePort).max(256) })).max(84) });
const riserRouteLink = z.object({ id, routeAId: id, routeBId: id }).refine((item) => item.routeAId !== item.routeBId, 'A riser link must connect two different routes.');
const junctionRouteGroup = z.object({ id, name: z.string().min(1).max(200), incomingRouteIds: z.array(id).max(512), outgoingRouteIds: z.array(id).max(512) });
const device = z.object({
  id, typeId: id, name: z.string().min(1).max(200), categoryId: z.string(), serviceCategory: z.string(),
  manufacturer: z.string(), model: z.string(), description: z.string(), roomId: id.optional(), floorId: id, wallId: id.optional(),
  associationType: z.enum(['wall', 'floor', 'ceiling', 'free']), position: vec3, heightFromFloorMm: z.number().int(),
  rotationDeg: vec3, dimensions, distanceAlongWallMm: z.number().optional(), depthInsideWallMm: z.number().optional(),
  wallSide: z.enum(['left', 'right', 'center']).optional(), mounting: z.enum(['recessed', 'surface', 'concealed']),
  backFace: z.enum(['back','front','left','right','top','bottom']).default('back'), accessibleFloorIds: z.array(id).optional(), transitionToFloorId: id.optional(),
  powerRequirements: z.string(), voltage: z.number().optional(), current: z.number().optional(), wattage: z.number().optional(),
  networkRequirements: z.string(), notes: z.string(), installationStatus: z.enum(['planned', 'installed', 'tested', 'decommissioned']),
  installationDate: z.string().optional(), functionalColor: z.string().max(100).optional(), physicalColor: z.string().max(100).optional(), displayColor: z.string().max(40).optional(), colorSource: colorSource.optional(), showLabel: z.boolean().default(false), ports: z.array(port), rackConfiguration: rackConfiguration.optional(), riserRouteLinks: z.array(riserRouteLink).max(512).optional(), junctionRouteGroups: z.array(junctionRouteGroup).max(512).optional(), customProperties, locked: z.boolean(), hidden: z.boolean()
});
const routePoint = vec3.extend({ id, order: z.number().int().nonnegative(), automatic: z.literal('crossing-clearance').optional() });
const route = z.object({
  id, kind: z.enum(['cable', 'pipe', 'duct']), name: z.string().min(1).max(200), serviceCategory: z.string(), subtype: z.string(),
  standard: z.string(), manufacturer: z.string(), productCode: z.string(), floorId: id, roomIds: z.array(id), wallIds: z.array(id),
  sourceDeviceId: id.optional(), destinationDeviceId: id.optional(), sourcePortId: id.optional(), destinationPortId: id.optional(),
  points: z.array(routePoint).min(2), installedLengthMm: z.number().optional(), spareLengthMm: z.number().optional(),
  voltage: z.number().optional(), current: z.number().optional(), power: z.number().optional(), conductors: z.number().optional(),
  conductorCrossSectionMm2: z.number().optional(), wireGauge: z.string().optional(), shielding: z.string().optional(),
  jacketType: z.string().optional(), fireRating: z.string().optional(), installationMethod: z.string(), maximumDataRate: z.string().optional(),
  poeClass: z.string().optional(), frequencyRating: z.string().optional(), physicalIdentification: z.string(), labelAtSource: z.string(),
  labelAtDestination: z.string(), conduitAssociation: z.string().optional(), installationStatus: z.enum(['planned', 'installed', 'tested', 'decommissioned']), installationDate: z.string().optional(),
  testStatus: z.string(), testDate: z.string().optional(), flowDirection: z.enum(['source-to-destination', 'destination-to-source', 'bidirectional', 'none']).optional(),
  functionalColor: z.string().max(100).optional(), physicalColor: z.string().max(100).optional(), displayColor: z.string().max(40).optional(), colorSource: colorSource.optional(),
  conductorConfiguration: z.enum(['single-phase', 'three-phase', 'custom']).optional(), conductorColors: z.array(z.object({ function: z.enum(['L1','L2','L3','N','PE']), color: z.string(), label: z.string(), colorSource: z.enum(['regulated','standard']) })).optional(),
  ethernetTerminationStandard: z.enum(['T568A','T568B']).optional(), ethernetPairColors: z.array(z.object({ pin: z.number().int().min(1).max(8), color: z.string() })).optional(),
  conduit: z.object({ serviceType: z.string(), displayColor: z.string(), label: z.string(), containsCableIds: z.array(id), diameterMm: z.number().optional(), material: z.string(), installationType: z.string() }).optional(), notes: z.string(), customProperties,
  pipe: z.record(z.string(), z.unknown()).optional(), duct: z.record(z.string(), z.unknown()).optional(), locked: z.boolean(), hidden: z.boolean()
});
const measurement = z.object({
  id, projectId: id, type: z.enum(['horizontal', 'vertical', 'point-to-point', 'height', 'wall-edge', 'route', 'text']),
  name: z.string(), start: vec3, end: vec3, wallId: id.optional(), roomId: id.optional(), referencedObjectIds: z.array(id),
  text: z.string(), visible: z.boolean(), locked: z.boolean().default(false)
});
const lightingControl = z.object({ id, name: z.string().min(1).max(200), switchDeviceId: id, lightDeviceIds: z.array(id).max(200), state: z.enum(['on','off']), notes: z.string().max(10000) });
const projectPhoto = z.object({ id, markerId: id, originalFileName: z.string().min(1).max(255), storedFileName: z.string().regex(/^[0-9a-f-]{36}\.(?:jpg|png|webp)$/i), mimeType: z.enum(['image/jpeg','image/png','image/webp']), caption: z.string().max(1000), createdAt: z.string() });
const photoMarker = z.object({ id, projectId: id, floorId: id, title: z.string().min(1).max(200), description: z.string().max(10000), category: z.enum(['finished-house','cable-systems','structural','electrical','data','plumbing','hvac','security','other']), position: vec3, createdAt: z.string(), photos: z.array(projectPhoto).max(100) });

export const projectSchema = z.object({
  id, title: z.string().min(1).max(300), description: z.string().max(10000),
  createdAt: z.string(), updatedAt: z.string(), floors: z.array(floor).min(1), walls: z.array(wall), rooms: z.array(room), roomCategories: z.array(roomCategory).default([]),
  devices: z.array(device), deviceTypes: z.array(deviceType), routes: z.array(route), measurements: z.array(measurement),
  categories: z.array(z.object({ id: z.string(), name: z.string(), serviceCategory: z.string(), pattern: z.string(), color: z.string() })),
  exportPresets: z.array(z.record(z.string(), z.unknown())), cameraViews: z.array(z.record(z.string(), z.unknown())), lightingControls: z.array(lightingControl).default([]), photoMarkers: z.array(photoMarker).default([]),
  preferences: z.object({ theme: z.enum(['light', 'dark', 'system']), gridSizeMm: z.number().int().positive(), snapToGrid: z.boolean(), snapToEndpoints: z.boolean(), unit: z.enum(['mm', 'cm', 'm']), newWallThicknessMm: z.number().int().positive().default(120), newWallStructuralThicknessMm: z.number().int().positive().default(120), newWallLiningLeftMm: z.number().int().nonnegative().default(0), newWallLiningRightMm: z.number().int().nonnegative().default(0), avoidRouteOverlaps: z.boolean().default(true), preferSharedCorridors: z.boolean().default(true), routeNamingPattern: z.string().min(1).max(120).default('{PREFIX}-{FLOOR}-{SEQ:03}'), routeNamingPrefixes: z.record(z.string(), z.string().max(12)).default({}), routeTurnPenaltyMm: z.number().int().nonnegative().default(500), ceilingRouteOffsetMm: z.number().int().default(-50), floorRouteOffsetMm: z.number().int().max(-1).default(-150), routeVerticalOrder: z.array(z.enum(['cable','pipe','duct'])).length(3).refine((items) => new Set(items).size === 3).default(['pipe','cable','duct']), routeBendRadiusMm: z.record(z.string(), z.number().int().min(0).max(5000)).default({}), motionMode: z.enum(['system', 'animated', 'reduced', 'off']).default('animated'), routeOverlapPriorities: z.record(z.string(), z.number().int().min(1).max(4)).default({}), routeSeparationMm: z.record(z.string(), z.number().int().min(0).max(1000)).default({}), routeDiameterMm: z.record(z.string(), z.number().int().min(1).max(2000)).default({}), intersectionCheckEnabled: z.boolean().default(true) })
}).superRefine((project, context) => {
  const routes = new Map(project.routes.map((item) => [item.id, item]));
  const devices = new Map(project.devices.map((item) => [item.id, item])); const floors = new Set(project.floors.map((item) => item.id));
  const controlledSwitches = new Set<string>(); const storedPhotoNames = new Set<string>();
  project.lightingControls.forEach((control, controlIndex) => {
    if (devices.get(control.switchDeviceId)?.typeId !== 'switch') context.addIssue({ code: 'custom', path: ['lightingControls', controlIndex, 'switchDeviceId'], message: 'A lighting control must reference a light switch.' });
    if (controlledSwitches.has(control.switchDeviceId)) context.addIssue({ code: 'custom', path: ['lightingControls', controlIndex, 'switchDeviceId'], message: 'A light switch may have only one lighting-control record.' }); controlledSwitches.add(control.switchDeviceId);
    if (new Set(control.lightDeviceIds).size !== control.lightDeviceIds.length) context.addIssue({ code: 'custom', path: ['lightingControls', controlIndex, 'lightDeviceIds'], message: 'A lighting control cannot list the same light point twice.' });
    control.lightDeviceIds.forEach((lightId, lightIndex) => { if (devices.get(lightId)?.typeId !== 'light-point') context.addIssue({ code: 'custom', path: ['lightingControls', controlIndex, 'lightDeviceIds', lightIndex], message: 'A lighting control target must reference a light point.' }); });
  });
  project.photoMarkers.forEach((marker, markerIndex) => { if (marker.projectId !== project.id) context.addIssue({ code: 'custom', path: ['photoMarkers', markerIndex, 'projectId'], message: 'Photo marker project does not match the saved project.' }); if (!floors.has(marker.floorId)) context.addIssue({ code: 'custom', path: ['photoMarkers', markerIndex, 'floorId'], message: 'Photo marker references a missing floor.' }); marker.photos.forEach((photo, photoIndex) => { if (photo.markerId !== marker.id) context.addIssue({ code: 'custom', path: ['photoMarkers', markerIndex, 'photos', photoIndex, 'markerId'], message: 'Photo asset marker does not match its parent marker.' }); if (storedPhotoNames.has(photo.storedFileName)) context.addIssue({ code: 'custom', path: ['photoMarkers', markerIndex, 'photos', photoIndex, 'storedFileName'], message: 'Photo asset filenames must be unique inside a project.' }); storedPhotoNames.add(photo.storedFileName); }); });
  project.devices.forEach((riser, deviceIndex) => {
    const used = new Set<string>();
    riser.riserRouteLinks?.forEach((link, linkIndex) => {
      const a = routes.get(link.routeAId); const b = routes.get(link.routeBId); const path = ['devices', deviceIndex, 'riserRouteLinks', linkIndex] as Array<string | number>;
      if (!a || !b) { context.addIssue({ code: 'custom', path, message: 'A riser route link references a missing route.' }); return; }
      if (![a.sourceDeviceId, a.destinationDeviceId].includes(riser.id) || ![b.sourceDeviceId, b.destinationDeviceId].includes(riser.id)) context.addIssue({ code: 'custom', path, message: 'Both linked routes must terminate at this riser.' });
      if (a.floorId === b.floorId) context.addIssue({ code: 'custom', path, message: 'Linked riser routes must belong to different floors.' });
      if (a.kind !== b.kind || a.serviceCategory !== b.serviceCategory) context.addIssue({ code: 'custom', path, message: 'Linked riser routes must use the same route kind and service.' });
      if (used.has(a.id) || used.has(b.id)) context.addIssue({ code: 'custom', path, message: 'Each riser route may be linked only once.' });
      used.add(a.id); used.add(b.id);
    });
  });
});

export const backupSchema = z.object({
  format: z.literal('casa-infrastructure-project'),
  version: z.literal(1),
  project: projectSchema
});
