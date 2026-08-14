import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { MOUSE } from 'three';
import type { Device, ServiceCategory } from '../../shared/types';
import { RackModel3D } from '../editor/RackModel3D';

export function RackPreview3D({ rack, serviceColors, selectedModuleId, selectedPortId, onSelectModule, onSelectPort }: { rack: Device; serviceColors?: Partial<Record<ServiceCategory, string>>; selectedModuleId?: string; selectedPortId?: string; onSelectModule?: (id: string) => void; onSelectPort?: (moduleId: string, portId: string) => void }) {
  const configuration = rack.rackConfiguration; if (!configuration) return null;
  const maximum = Math.max(rack.dimensions.width, rack.dimensions.height, rack.dimensions.depth, 1); const scale = 2.6 / maximum;
  return <div className="rack-preview-3d" aria-label={`3D preview of ${rack.name}`}><Canvas camera={{ position: [3.4, 2.8, 4.2], fov: 40, near: .01, far: 100 }} dpr={[1,1.6]}><color attach="background" args={['#151b1f']} /><ambientLight intensity={2.2} /><directionalLight position={[4,7,5]} intensity={2.4} /><RackModel3D configuration={configuration} size={[rack.dimensions.width * scale, rack.dimensions.height * scale, rack.dimensions.depth * scale]} serviceColors={serviceColors} selectedModuleId={selectedModuleId} selectedPortId={selectedPortId} onSelectModule={onSelectModule} onSelectPort={onSelectPort} /><gridHelper args={[7,14,'#39474d','#273238']} position={[0,-1.34,0]} /><OrbitControls makeDefault enableDamping dampingFactor={.08} screenSpacePanning mouseButtons={{ LEFT: -1 as never, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.ROTATE }} minDistance={3.2} maxDistance={8} /></Canvas><span>Right-drag orbit · middle-drag pan · wheel zoom</span></div>;
}
