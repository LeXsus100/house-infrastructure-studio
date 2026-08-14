import type { AssociationType, Category, DevicePortTemplate, DeviceType, Dimensions3, MountingFace, ServiceCategory } from '../shared/types';
import { defaultDeviceDisplayColor, PROJECT_SERVICE_COLORS } from './lib/italianColors';

const mm = (width: number, height: number, depth: number): Dimensions3 => ({ width, height, depth });
const port = (name: string, serviceCategory: ServiceCategory, direction: DevicePortTemplate['direction'], face: MountingFace, position: DevicePortTemplate['position'], connectorType = '', spaceRequiredMm = 30, required = true): DevicePortTemplate => ({
  name, portType: serviceCategory, direction, serviceCategory, connectorType,
  notes: '', position, face, required, spaceRequiredMm
});

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'electrical', name: 'Electrical power', serviceCategory: 'electrical', pattern: 'solid', color: PROJECT_SERVICE_COLORS.electrical! },
  { id: 'networking', name: 'Ethernet & data', serviceCategory: 'data', pattern: 'dot', color: PROJECT_SERVICE_COLORS.data! },
  { id: 'security', name: 'Security', serviceCategory: 'security', pattern: 'dash', color: PROJECT_SERVICE_COLORS.security! },
  { id: 'hvac', name: 'HVAC', serviceCategory: 'hvac', pattern: 'double', color: PROJECT_SERVICE_COLORS.hvac! },
  { id: 'heating', name: 'Heating', serviceCategory: 'heating', pattern: 'dash', color: PROJECT_SERVICE_COLORS.heating! },
  { id: 'plumbing', name: 'Plumbing', serviceCategory: 'plumbing', pattern: 'double', color: PROJECT_SERVICE_COLORS.plumbing! },
  { id: 'sensors', name: 'Sensors', serviceCategory: 'sensors', pattern: 'dot', color: PROJECT_SERVICE_COLORS.sensors! },
  { id: 'automation', name: 'Automation', serviceCategory: 'automation', pattern: 'dash', color: PROJECT_SERVICE_COLORS.automation! },
  { id: 'containers', name: 'Technical storage', serviceCategory: 'storage', pattern: 'solid', color: PROJECT_SERVICE_COLORS.storage! },
  { id: 'structural', name: 'House structure', serviceCategory: 'structural', pattern: 'solid', color: '#a78b7a' },
  { id: 'transitions', name: 'Floor transitions', serviceCategory: 'transitions', pattern: 'dash', color: PROJECT_SERVICE_COLORS.transitions! },
  { id: 'generic', name: 'Generic', serviceCategory: 'generic', pattern: 'solid', color: PROJECT_SERVICE_COLORS.generic! }
];

export const consolidatedServiceCategory = (service: ServiceCategory): ServiceCategory => {
  if (service === 'lighting') return 'electrical';
  if (service === 'wifi') return 'data';
  if (service === 'cctv') return 'security';
  return service;
};

export const categoryIdForService = (service: ServiceCategory): string => {
  const consolidated = consolidatedServiceCategory(service);
  return consolidated === 'data' ? 'networking' : consolidated === 'storage' ? 'containers' : consolidated;
};

const defs: Array<[string, string, ServiceCategory, DeviceType['shape'], Dimensions3]> = [
  ['power-outlet', 'Power outlet', 'electrical', 'plate', mm(86, 86, 35)],
  ['junction-box', 'Junction box', 'electrical', 'box', mm(120, 120, 70)],
  ['electrical-panel', 'Electrical panel', 'electrical', 'box', mm(600, 800, 180)],
  ['switch', 'Light switch', 'electrical', 'plate', mm(86, 86, 30)],
  ['light-point', 'Light point', 'lighting', 'cylinder', mm(120, 60, 120)],
  ['transformer', 'Transformer', 'electrical', 'box', mm(180, 120, 100)],
  ['power-supply', 'Power supply', 'electrical', 'box', mm(180, 80, 80)],
  ['ups', 'UPS', 'electrical', 'box', mm(240, 180, 360)],
  ['solar-panel', 'Solar panel', 'electrical', 'solar-panel', mm(1720, 900, 1130)],
  ['appliance-connection', 'Appliance connection', 'electrical', 'plate', mm(100, 100, 40)],
  ['ethernet-outlet', 'Ethernet outlet', 'data', 'plate', mm(86, 86, 35)],
  ['patch-panel', 'Patch panel', 'data', 'box', mm(480, 45, 150)],
  ['network-switch', 'Network switch', 'data', 'box', mm(440, 44, 200)],
  ['router', 'Router', 'data', 'box', mm(220, 45, 150)],
  ['access-point', 'Wi-Fi access point', 'wifi', 'plate', mm(103, 150, 36)],
  ['tv-antenna', 'TV antenna', 'data', 'box', mm(700, 800, 80)],
  ['fwa-antenna', 'FWA antenna', 'data', 'plate', mm(220, 320, 90)],
  ['fibre-termination', 'Fibre termination', 'data', 'box', mm(180, 120, 50)],
  ['rack', 'Rack', 'data', 'box', mm(800, 1158, 1000)],
  ['server', 'Server', 'data', 'box', mm(480, 88, 600)],
  ['nas', 'NAS', 'data', 'box', mm(220, 180, 280)],
  ['custom-network', 'Custom network device', 'data', 'box', mm(160, 100, 80)],
  ['security-camera', 'Security camera', 'cctv', 'camera', mm(180, 100, 100)],
  ['door-sensor', 'Door sensor', 'security', 'plate', mm(80, 20, 20)],
  ['motion-sensor', 'Motion sensor', 'sensors', 'cylinder', mm(100, 70, 100)],
  ['alarm-siren', 'Alarm siren', 'security', 'box', mm(180, 140, 70)],
  ['alarm-panel', 'Alarm control panel', 'security', 'box', mm(300, 400, 100)],
  ['intercom', 'Intercom', 'security', 'plate', mm(120, 220, 35)],
  ['video-intercom', 'Video intercom', 'security', 'plate', mm(160, 240, 40)],
  ['smoke-detector', 'Smoke detector', 'sensors', 'cylinder', mm(120, 45, 120)],
  ['co-detector', 'Carbon monoxide detector', 'sensors', 'plate', mm(120, 120, 35)],
  ['water-leak-sensor', 'Water leak sensor', 'sensors', 'box', mm(70, 25, 70)],
  ['multi-detector', 'Multi-detector', 'sensors', 'cylinder', mm(130, 45, 130)],
  ['custom-security', 'Custom security device', 'security', 'box', mm(140, 100, 70)],
  ['indoor-unit', 'Indoor HVAC unit', 'hvac', 'box', mm(850, 300, 220)],
  ['outdoor-unit', 'Outdoor unit', 'hvac', 'box', mm(850, 650, 350)],
  ['thermostat', 'Thermostat', 'heating', 'plate', mm(100, 100, 30)],
  ['temperature-sensor', 'Temperature sensor', 'sensors', 'plate', mm(80, 80, 25)],
  ['air-vent', 'Air vent', 'hvac', 'plate', mm(400, 200, 60)],
  ['duct-endpoint', 'Duct endpoint', 'hvac', 'box', mm(300, 200, 150)],
  ['hvac-manifold', 'HVAC manifold', 'hvac', 'box', mm(500, 250, 180)],
  ['boiler', 'Boiler', 'heating', 'box', mm(500, 750, 350)],
  ['heat-pump', 'Heat pump', 'heating', 'box', mm(900, 900, 450)],
  ['radiator', 'Radiator', 'heating', 'box', mm(800, 600, 100)],
  ['underfloor-connection', 'Underfloor heating connection', 'heating', 'box', mm(500, 300, 120)],
  ['custom-hvac', 'Custom HVAC device', 'hvac', 'box', mm(300, 200, 180)],
  ['water-inlet', 'Water inlet', 'plumbing', 'cylinder', mm(80, 80, 80)],
  ['water-outlet', 'Water outlet', 'plumbing', 'cylinder', mm(80, 80, 80)],
  ['valve', 'Valve', 'plumbing', 'cylinder', mm(100, 100, 100)],
  ['plumbing-manifold', 'Plumbing manifold', 'plumbing', 'box', mm(500, 300, 150)],
  ['pump', 'Pump', 'plumbing', 'cylinder', mm(240, 280, 240)],
  ['drain-point', 'Drain point', 'plumbing', 'cylinder', mm(120, 30, 120)],
  ['hot-water', 'Hot-water connection', 'plumbing', 'cylinder', mm(80, 80, 80)],
  ['cold-water', 'Cold-water connection', 'plumbing', 'cylinder', mm(80, 80, 80)],
  ['custom-plumbing', 'Custom plumbing device', 'plumbing', 'box', mm(180, 140, 100)],
  ['relay', 'Relay', 'automation', 'box', mm(80, 80, 35)],
  ['smart-switch', 'Smart switch', 'automation', 'plate', mm(86, 86, 35)],
  ['automation-controller', 'Automation controller', 'automation', 'box', mm(220, 160, 80)],
  ['gateway', 'Gateway', 'automation', 'box', mm(180, 120, 60)],
  ['smart-sensor', 'Smart sensor', 'automation', 'plate', mm(80, 80, 25)],
  ['motor-controller', 'Motor controller', 'automation', 'box', mm(160, 120, 80)],
  ['custom-automation', 'Custom automation device', 'automation', 'box', mm(150, 100, 70)],
  ['potable-water-tank', 'Potable water tank', 'storage', 'cylinder', mm(1200, 1800, 1200)],
  ['rainwater-tank', 'Rainwater tank', 'storage', 'cylinder', mm(1800, 1800, 1800)],
  ['external-sewage-tank', 'External sewage tank', 'storage', 'cylinder', mm(2000, 1600, 2000)],
  ['hot-water-storage', 'Hot-water storage tank', 'storage', 'cylinder', mm(700, 1500, 700)],
  ['solar-battery-storage', 'Solar battery storage', 'storage', 'box', mm(700, 1200, 300)],
  ['custom-container', 'Custom technical container', 'storage', 'box', mm(1000, 1000, 1000)],
  ['column', 'Column', 'structural', 'box', mm(300, 2700, 300)],
  ['door-opening', 'Door opening', 'structural', 'plate', mm(900, 2100, 150)],
  ['window-opening', 'Window opening', 'structural', 'plate', mm(1200, 1200, 150)],
  ['staircase', 'Staircase', 'structural', 'staircase', mm(1000, 2700, 3000)],
  ['furniture-washer', 'Washing machine', 'structural', 'washer', mm(600, 850, 600)],
  ['furniture-fridge', 'Fridge', 'structural', 'fridge', mm(600, 1850, 650)],
  ['furniture-sink', 'Sink', 'structural', 'sink', mm(800, 900, 600)],
  ['furniture-dishwasher', 'Dishwasher', 'structural', 'washer', mm(600, 850, 600)],
  ['furniture-oven', 'Oven', 'structural', 'box', mm(600, 600, 570)],
  ['furniture-kitchen-hood', 'Kitchen hood', 'structural', 'box', mm(900, 350, 500)],
  ['furniture-cabinet', 'Cabinet', 'structural', 'box', mm(800, 900, 500)],
  ['furniture-tv', 'Television', 'structural', 'plate', mm(1200, 700, 70)],
  ['furniture-media-console', 'Media console', 'structural', 'box', mm(1400, 450, 420)],
  ['furniture-pc', 'Desktop PC', 'structural', 'box', mm(220, 480, 500)],
  ['furniture-desk', 'Desk', 'structural', 'box', mm(1400, 750, 700)],
  ['furniture-custom', 'Custom furniture', 'structural', 'box', mm(1000, 800, 500)],
  ['floor-transition', 'Floor transition', 'transitions', 'junction', mm(180, 180, 180)],
  ['route-junction', 'Route junction', 'generic', 'junction', mm(140, 140, 140)],
  ['generic-electronic', 'Generic electronic device', 'generic', 'box', mm(150, 100, 80)],
  ['generic-powered', 'Generic powered device', 'generic', 'box', mm(180, 120, 100)],
  ['generic-passive', 'Generic passive device', 'generic', 'box', mm(120, 80, 60)],
  ['custom-device', 'Custom device', 'custom', 'box', mm(150, 100, 80)]
];

const furnitureIds = new Set(defs.map(([id]) => id).filter((id) => id.startsWith('furniture-')));
const structureIds = new Set(['column', 'door-opening', 'window-opening', 'staircase']);
const defaultAssociation: Partial<Record<string, AssociationType>> = {
  'access-point': 'ceiling', 'smoke-detector': 'ceiling', 'multi-detector': 'ceiling', 'light-point': 'ceiling',
  'drain-point': 'floor', 'water-leak-sensor': 'floor', 'floor-transition': 'floor', 'solar-panel': 'floor', 'tv-antenna': 'floor', 'rack': 'floor'
};
const defaultBackFace: Partial<Record<string, DeviceType['defaultBackFace']>> = { 'access-point': 'back' };
const defaultPorts: Partial<Record<string, DevicePortTemplate[]>> = {
  'power-outlet': [port('230 V output', 'electrical', 'output', 'back', { x: 0, y: 0, z: -18 }, 'CEE 7/3')],
  'junction-box': [port('Circuit input', 'electrical', 'bidirectional', 'back', { x: -25, y: 0, z: -25 }, 'terminal', 35), port('Circuit output', 'electrical', 'bidirectional', 'back', { x: 25, y: 0, z: -25 }, 'terminal', 35)],
  'switch': [port('230 V input', 'electrical', 'input', 'back', { x: -20, y: -20, z: -15 }, 'terminal'), port('Switched output', 'electrical', 'output', 'back', { x: 20, y: -20, z: -15 }, 'terminal')],
  'light-point': [port('Switched power', 'electrical', 'input', 'top', { x: 0, y: 30, z: 0 }, 'terminal')],
  'electrical-panel': [port('Mains input', 'electrical', 'input', 'back', { x: -180, y: -300, z: -90 }, 'terminal', 45), port('Circuit output', 'electrical', 'output', 'bottom', { x: 180, y: -400, z: 0 }, 'terminal', 35)],
  'solar-panel': [port('DC output', 'electrical', 'output', 'back', { x: 620, y: 400, z: -380 }, 'MC4')],
  'access-point': [port('PoE / Ethernet', 'data', 'input', 'back', { x: 0, y: -45, z: -18 }, 'RJ45')],
  'tv-antenna': [port('RF output', 'data', 'output', 'bottom', { x: 0, y: -400, z: 0 }, 'IEC coaxial')],
  'fwa-antenna': [port('PoE / Ethernet', 'data', 'bidirectional', 'back', { x: 0, y: -110, z: -45 }, 'RJ45')],
  'network-switch': [port('Ethernet', 'data', 'bidirectional', 'front', { x: 0, y: 0, z: 100 }, 'RJ45'), port('Power', 'electrical', 'input', 'back', { x: 170, y: 0, z: -100 }, 'IEC C14')],
  'rack': [port('Mains input', 'electrical', 'input', 'back', { x: 250, y: -470, z: -500 }, 'IEC / terminal'), port('Data trunk', 'data', 'bidirectional', 'back', { x: -250, y: -470, z: -500 }, 'RJ45 / fibre')],
  'security-camera': [port('PoE / Ethernet', 'data', 'input', 'back', { x: 0, y: 0, z: -50 }, 'RJ45')],
  'indoor-unit': [
    port('HVAC inlet', 'hvac', 'input', 'back', { x: -300, y: -80, z: -110 }, 'flare'),
    port('HVAC outlet', 'hvac', 'output', 'back', { x: -180, y: -80, z: -110 }, 'flare'),
    port('Main power', 'electrical', 'input', 'back', { x: 180, y: -80, z: -110 }, 'terminal'),
    port('Control / communication', 'electrical', 'input', 'back', { x: 300, y: -80, z: -110 }, 'low-voltage terminal', 30, false)
  ],
  'outdoor-unit': [
    port('HVAC inlet', 'hvac', 'input', 'back', { x: -300, y: -220, z: -175 }, 'flare'),
    port('HVAC outlet', 'hvac', 'output', 'back', { x: -170, y: -220, z: -175 }, 'flare'),
    port('Main power', 'electrical', 'input', 'back', { x: 170, y: -220, z: -175 }, 'terminal'),
    port('Control / communication', 'electrical', 'input', 'back', { x: 300, y: -220, z: -175 }, 'low-voltage terminal', 30, false)
  ],
  'boiler': [port('Electrical supply', 'electrical', 'input', 'back', { x: 180, y: -300, z: -175 }, 'terminal'), port('Cold water', 'plumbing', 'input', 'bottom', { x: -150, y: -375, z: 0 }, 'threaded'), port('Hot water', 'plumbing', 'output', 'bottom', { x: 150, y: -375, z: 0 }, 'threaded'), port('Heating flow', 'heating', 'output', 'bottom', { x: 0, y: -375, z: 0 }, 'threaded')],
  'heat-pump': [
    ...Array.from({ length: 5 }, (_, index) => {
      const x = -300 + index * 150;
      return [
        port(`HVAC circuit ${index + 1} inlet`, 'hvac', 'input', 'back', { x, y: -260, z: -225 }, 'flare'),
        port(`HVAC circuit ${index + 1} outlet`, 'hvac', 'output', 'back', { x, y: -120, z: -225 }, 'flare')
      ];
    }).flat(),
    port('Main power', 'electrical', 'input', 'back', { x: -120, y: 300, z: -225 }, 'terminal', 40),
    port('Control / communication', 'electrical', 'input', 'back', { x: 120, y: 300, z: -225 }, 'low-voltage terminal', 30, false)
  ],
  'radiator': [port('Heating inlet', 'heating', 'input', 'bottom', { x: -350, y: -300, z: 0 }, 'threaded'), port('Heating outlet', 'heating', 'output', 'bottom', { x: 350, y: -300, z: 0 }, 'threaded')],
  'furniture-washer': [port('Power', 'electrical', 'input', 'back', { x: 180, y: -300, z: -300 }, 'Schuko'), port('Cold water', 'plumbing', 'input', 'back', { x: -100, y: -300, z: -300 }, '3/4 in'), port('Drain', 'plumbing', 'output', 'back', { x: -200, y: -300, z: -300 }, 'hose')],
  'furniture-dishwasher': [port('Power', 'electrical', 'input', 'back', { x: 180, y: -300, z: -300 }, 'Schuko'), port('Cold water', 'plumbing', 'input', 'back', { x: -100, y: -300, z: -300 }, '3/4 in'), port('Drain', 'plumbing', 'output', 'back', { x: -200, y: -300, z: -300 }, 'hose')],
  'furniture-fridge': [port('Power', 'electrical', 'input', 'back', { x: 0, y: -700, z: -325 }, 'Schuko'), port('Ethernet / data', 'data', 'input', 'back', { x: 100, y: -700, z: -325 }, 'RJ45')],
  'furniture-sink': [port('Cold water', 'plumbing', 'input', 'back', { x: -120, y: -300, z: -300 }, 'threaded'), port('Hot water', 'plumbing', 'input', 'back', { x: 120, y: -300, z: -300 }, 'threaded'), port('Drain', 'plumbing', 'output', 'back', { x: 0, y: -390, z: -300 }, 'trap')],
  'furniture-oven': [port('Power', 'electrical', 'input', 'back', { x: 180, y: -220, z: -285 }, 'Schuko / terminal')],
  'furniture-kitchen-hood': [port('Power', 'electrical', 'input', 'back', { x: 300, y: 0, z: -250 }, 'terminal'), port('Exhaust duct', 'hvac', 'output', 'top', { x: 0, y: 175, z: 0 }, 'duct collar')],
  'furniture-tv': [port('Power', 'electrical', 'input', 'back', { x: 300, y: -260, z: -35 }, 'Schuko'), port('Ethernet', 'data', 'input', 'back', { x: 180, y: -260, z: -35 }, 'RJ45')],
  'furniture-media-console': [port('Power strip', 'electrical', 'input', 'back', { x: 500, y: -120, z: -210 }, 'Schuko'), port('Ethernet', 'data', 'bidirectional', 'back', { x: 350, y: -120, z: -210 }, 'RJ45')],
  'furniture-pc': [port('Power', 'electrical', 'input', 'back', { x: 60, y: -170, z: -250 }, 'IEC C14'), port('Ethernet', 'data', 'bidirectional', 'back', { x: -40, y: -150, z: -250 }, 'RJ45')],
  'potable-water-tank': [port('Water connection', 'plumbing', 'bidirectional', 'bottom', { x: 0, y: -900, z: 0 }, 'threaded', 60)],
  'rainwater-tank': [port('Rainwater connection', 'plumbing', 'bidirectional', 'bottom', { x: 0, y: -900, z: 0 }, 'threaded', 75)],
  'external-sewage-tank': [port('Waste inlet / outlet', 'plumbing', 'bidirectional', 'bottom', { x: 0, y: -800, z: 0 }, 'drain', 110)],
  'hot-water-storage': [port('Cold inlet', 'plumbing', 'input', 'bottom', { x: -180, y: -750, z: 0 }, 'threaded', 50), port('Hot outlet', 'plumbing', 'output', 'bottom', { x: 180, y: -750, z: 0 }, 'threaded', 50)],
  'solar-battery-storage': [port('DC power', 'electrical', 'bidirectional', 'back', { x: 0, y: -450, z: -150 }, 'terminal', 50)]
};

const unlimitedPortTypes = new Set(['junction-box', 'electrical-panel']);
const builtInRevisions: Partial<Record<string, number>> = { 'indoor-unit': 2, 'outdoor-unit': 2, 'heat-pump': 2, rack: 1 };

export const DEFAULT_DEVICE_TYPES: DeviceType[] = defs.map(([id, name, serviceCategory, shape, defaultDimensions]) => ({
  id, builtInRevision: builtInRevisions[id], categoryId: categoryIdForService(serviceCategory),
  name, serviceCategory: consolidatedServiceCategory(serviceCategory), shape, defaultDimensions,
  defaultDisplayColor: defaultDeviceDisplayColor(id, consolidatedServiceCategory(serviceCategory)),
  family: id === 'floor-transition' ? 'transition' : furnitureIds.has(id) ? 'furniture' : structureIds.has(id) ? 'structure' : 'device',
  defaultBackFace: defaultBackFace[id] ?? ((defaultAssociation[id] ?? (structureIds.has(id) || furnitureIds.has(id) ? 'floor' : 'wall')) === 'floor' ? 'bottom' : (defaultAssociation[id] ?? 'wall') === 'ceiling' ? 'top' : 'back'), defaultAssociation: defaultAssociation[id] ?? (structureIds.has(id) || furnitureIds.has(id) ? 'floor' : 'wall'),
  defaultPorts: structuredClone(defaultPorts[id] ?? (!structureIds.has(id) && id !== 'floor-transition' && !furnitureIds.has(id) ? [port('Service connection', consolidatedServiceCategory(serviceCategory), 'bidirectional', 'back', { x: 0, y: 0, z: -defaultDimensions.depth / 2 })] : [])),
  unlimitedPorts: unlimitedPortTypes.has(id), defaultPortSpaceMm: unlimitedPortTypes.has(id) ? id === 'electrical-panel' ? 45 : 35 : undefined, custom: false
}));

export const ROUTE_SERVICE_COMPATIBILITY: Record<'cable' | 'pipe' | 'duct', ServiceCategory[]> = {
  cable: ['electrical', 'data', 'security', 'sensors', 'automation', 'generic', 'custom'],
  pipe: ['plumbing', 'heating', 'generic', 'custom'],
  duct: ['hvac', 'generic', 'custom']
};
