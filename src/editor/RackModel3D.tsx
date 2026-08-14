import { Edges } from '@react-three/drei';
import type { RackConfiguration, RackModule, ServiceCategory } from '../../shared/types';

interface Props {
  configuration: RackConfiguration;
  size: [number, number, number];
  xray?: boolean;
  serviceColors?: Partial<Record<ServiceCategory, string>>;
  selectedModuleId?: string;
  selectedPortId?: string;
  onSelectModule?: (moduleId: string) => void;
  onSelectPort?: (moduleId: string, portId: string) => void;
}

const moduleColor = (kind: RackModule['kind']) => kind === 'ups' || kind === 'pdu' ? '#596168' : kind === 'switch' ? '#6f7b82' : kind === 'patch-panel' ? '#8b969c' : kind === 'empty' ? '#30383d' : kind === 'router' ? '#7e878c' : '#657077';
const DEFAULT_SERVICE_COLORS: Partial<Record<ServiceCategory, string>> = { electrical: '#e28b18', data: '#2f80ed', security: '#d94b64', hvac: '#1c9cb8', heating: '#df681a', plumbing: '#168d68', sensors: '#699d1f', automation: '#8751c7', generic: '#64748b', custom: '#64748b' };

/** Open rack: four black pillars plus black base/top, with full-volume installed equipment. */
export function RackModel3D({ configuration, size, xray = false, serviceColors, selectedModuleId, selectedPortId, onSelectModule, onSelectPort }: Props) {
  const [width, height, depth] = size; const u = height / Math.max(1, configuration.totalUnits); const rail = Math.max(.018, Math.min(.045, width * .055)); const frameOpacity = xray ? .12 : 1; const moduleOpacity = xray ? .1 : 1;
  const frameMaterial = <meshStandardMaterial color="#090b0d" roughness={.58} metalness={.5} transparent={xray} opacity={frameOpacity} depthWrite={!xray} />;
  return <group>
    {[-1, 1].flatMap((xSign) => [-1, 1].map((zSign) => <mesh key={`${xSign}-${zSign}`} position={[xSign * (width / 2 - rail / 2), 0, zSign * (depth / 2 - rail / 2)]}><boxGeometry args={[rail, height, rail]} />{frameMaterial}</mesh>))}
    {[-1, 1].map((sign) => <mesh key={sign} position={[0, sign * (height / 2 - rail / 2), 0]}><boxGeometry args={[width, rail, depth]} />{frameMaterial}<Edges color="#32383d" transparent opacity={xray ? .2 : .8} /></mesh>)}
    {configuration.modules.map((item) => {
      const slotCount = Math.max(1, item.shelfSlotCount ?? 1); const slot = Math.max(0, Math.min(slotCount - 1, item.shelfSlot ?? 0)); const gap = slotCount > 1 ? rail * .45 : 0;
      const availableWidth = Math.max(.04, width - rail * 2.8); const moduleWidth = (availableWidth - gap * (slotCount - 1)) / slotCount;
      const x = slotCount > 1 ? -availableWidth / 2 + moduleWidth / 2 + slot * (moduleWidth + gap) : 0;
      const moduleHeight = Math.max(.012, u * item.heightUnits - .006); const y = -height / 2 + u * (item.startUnit - 1 + item.heightUnits / 2); const moduleDepth = Math.max(.04, depth - rail * 2.2); const selected = item.id === selectedModuleId;
      const maxRow = (face: 'front' | 'back') => Math.max(1, ...item.ports.filter((port) => port.face === face).map((port) => port.row));
      const maxColumn = (face: 'front' | 'back') => Math.max(1, ...item.ports.filter((port) => port.face === face).map((port) => port.column));
      return <group key={item.id} position={[x, y, 0]}>
        <mesh onClick={(event) => { if (!onSelectModule) return; event.stopPropagation(); onSelectModule(item.id); }}>
          <boxGeometry args={[moduleWidth, moduleHeight, moduleDepth]} />
          <meshStandardMaterial color={moduleColor(item.kind)} roughness={.68} metalness={.25} wireframe={item.kind === 'empty'} transparent={xray || item.kind === 'empty'} opacity={item.kind === 'empty' ? .25 : moduleOpacity} depthWrite={!xray} emissive={selected ? '#2dd99a' : '#000000'} emissiveIntensity={selected ? .24 : 0} />
          <Edges color={selected ? '#42e7aa' : '#a5adb1'} transparent opacity={xray ? .15 : selected ? .9 : .48} />
        </mesh>
        {item.ports.map((rackPort) => {
          const columns = maxColumn(rackPort.face); const rows = maxRow(rackPort.face); const px = -moduleWidth * .42 + moduleWidth * .84 * (rackPort.column - .5) / columns; const py = moduleHeight * .38 - moduleHeight * .76 * (rackPort.row - .5) / rows; const pz = (rackPort.face === 'front' ? 1 : -1) * (moduleDepth / 2 + .008); const portSelected = rackPort.id === selectedPortId;
          const markerColor = serviceColors?.[rackPort.serviceCategory] ?? DEFAULT_SERVICE_COLORS[rackPort.serviceCategory] ?? '#64748b'; const selectedScale = portSelected ? 1.45 : rackPort.connectedPortId ? 1.15 : 1;
          return <mesh key={rackPort.id} position={[px, py, pz]} scale={selectedScale} rotation={[0, rackPort.face === 'front' ? 0 : Math.PI, 0]} onClick={(event) => { if (!onSelectPort) return; event.stopPropagation(); onSelectModule?.(item.id); onSelectPort(item.id, rackPort.id); }}>
            <boxGeometry args={[Math.max(.009, Math.min(.026, moduleWidth / Math.max(columns, 4) * .55)), Math.max(.009, Math.min(.018, moduleHeight / Math.max(rows, 2) * .28)), .008]} />
            <meshBasicMaterial color={markerColor} depthTest />
          </mesh>;
        })}
      </group>;
    })}
  </group>;
}
