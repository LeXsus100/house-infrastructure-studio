import type { ConductorColor, EthernetPairColor, ServiceCategory } from '../../shared/types';

export const ITALIAN_CONDUCTOR_COLORS: Record<'single-phase' | 'three-phase', ConductorColor[]> = {
  'single-phase': [
    { function: 'L1', color: '#6f4e37', label: 'Brown phase', colorSource: 'standard' },
    { function: 'N', color: '#2474c6', label: 'Blue neutral', colorSource: 'regulated' },
    { function: 'PE', color: 'yellow-green', label: 'Yellow-green protective earth', colorSource: 'regulated' }
  ],
  'three-phase': [
    { function: 'L1', color: '#6f4e37', label: 'Brown phase L1', colorSource: 'standard' },
    { function: 'L2', color: '#161616', label: 'Black phase L2', colorSource: 'standard' },
    { function: 'L3', color: '#858b90', label: 'Grey phase L3', colorSource: 'standard' },
    { function: 'N', color: '#2474c6', label: 'Blue neutral', colorSource: 'regulated' },
    { function: 'PE', color: 'yellow-green', label: 'Yellow-green protective earth', colorSource: 'regulated' }
  ]
};

export const ETHERNET_PAIR_COLORS: Record<'T568A' | 'T568B', EthernetPairColor[]> = {
  T568B: ['White-orange', 'Orange', 'White-green', 'Blue', 'White-blue', 'Green', 'White-brown', 'Brown'].map((color, index) => ({ pin: index + 1, color })),
  T568A: ['White-green', 'Green', 'White-orange', 'Blue', 'White-blue', 'Orange', 'White-brown', 'Brown'].map((color, index) => ({ pin: index + 1, color }))
};

export const PROJECT_SERVICE_COLORS: Partial<Record<ServiceCategory, string>> = {
  electrical: '#e97824',
  data: '#2775c9',
  security: '#d64045',
  hvac: '#64b5d2',
  heating: '#a7aaad',
  plumbing: '#25844f',
  sensors: '#78a83a',
  automation: '#8a55b5',
  storage: '#69737a',
  transitions: '#26a9c4',
  generic: '#6b747b',
  custom: '#6b747b'
};

export const CONTAINER_DISPLAY_COLORS: Record<string, string> = {
  'potable-water-tank': '#25844f',
  'rainwater-tank': '#2a9d8f',
  'external-sewage-tank': '#40464a',
  'hot-water-storage': '#a7aaad',
  'solar-battery-storage': '#59636b',
  'custom-container': '#69737a'
};

export const PIPE_IDENTIFICATION_COLORS = [
  { type: 'Cold water', color: '#25844f', source: 'standard', pattern: 'solid' },
  { type: 'Steam / hot water', color: '#a7aaad', source: 'standard', pattern: 'solid' },
  { type: 'Oil / liquid fuel', color: '#7a4c2d', source: 'standard', pattern: 'solid' },
  { type: 'Gas', color: '#d2a106', source: 'standard', pattern: 'solid' },
  { type: 'Acids / alkalis', color: '#7f4aa5', source: 'standard', pattern: 'solid' },
  { type: 'Compressed air', color: '#68bde1', source: 'standard', pattern: 'solid' },
  { type: 'Other liquids', color: '#202427', source: 'projectConvention', pattern: 'solid' },
  { type: 'Fire protection', color: '#d32f2f', source: 'standard', pattern: 'solid' },
  { type: 'Hazardous condition', color: '#e0b500', source: 'standard', pattern: 'black diagonal' },
  { type: 'Waste / drainage', color: '#4b5155', source: 'projectConvention', pattern: 'solid' }
] as const;

export const CONDUIT_PROJECT_COLORS = [
  { service: 'Electrical power', color: '#e97824' },
  { service: 'Ethernet and data', color: '#2775c9' },
  { service: 'Telephone', color: '#3b8f5a' },
  { service: 'Alarm and security', color: '#d64045' },
  { service: 'TV and coaxial', color: '#7f4aa5' },
  { service: 'Spare conduit', color: '#f4f4f0' },
  { service: 'Outdoor / underground', color: '#202427' }
] as const;

export const defaultDeviceDisplayColor = (typeId: string, service: ServiceCategory): string => CONTAINER_DISPLAY_COLORS[typeId] ?? PROJECT_SERVICE_COLORS[service] ?? '#6b747b';
