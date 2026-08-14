import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { Edges, Html, OrbitControls } from '@react-three/drei';
import { DoubleSide, MOUSE } from 'three';
import type { DevicePortTemplate, DeviceType, MountingFace, ServiceCategory, Vec3 } from '../../shared/types';
import { DeviceDetails3D, JunctionBox3D } from '../editor/DeviceDetails3D';

const FACES: MountingFace[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];
export const DEFAULT_PREVIEW_SERVICE_COLORS: Partial<Record<ServiceCategory, string>> = { electrical: '#e28b18', data: '#2f80ed', security: '#d94b64', hvac: '#1c9cb8', heating: '#df681a', plumbing: '#168d68', sensors: '#699d1f', automation: '#8751c7', generic: '#64748b', custom: '#64748b' };

interface Props {
  type: Pick<DeviceType, 'id' | 'name' | 'shape' | 'defaultDimensions'>;
  color: string;
  backFace: MountingFace;
  ports?: DevicePortTemplate[];
  mode?: 'back' | 'port';
  pendingService?: ServiceCategory;
  serviceColors?: Partial<Record<ServiceCategory, string>>;
  onBackFaceChange?: (face: MountingFace) => void;
  onPlacePort?: (face: MountingFace, position: Vec3) => void;
  className?: string;
}

export function ObjectPreview3D({ type, color, backFace, ports = [], mode = 'back', pendingService, serviceColors, onBackFaceChange, onPlacePort, className = '' }: Props) {
  return <div className={`object-preview-3d ${className}`}>
    <Canvas camera={{ position: [3.6, 2.7, 4.2], fov: 42, near: .01, far: 100 }} dpr={[1, 1.6]}>
      <color attach="background" args={['#182126']} />
      <ambientLight intensity={2.1} /><directionalLight position={[4, 7, 5]} intensity={2.2} />
      <PreviewModel type={type} color={color} backFace={backFace} ports={ports} mode={mode} pendingService={pendingService} serviceColors={serviceColors} onBackFaceChange={onBackFaceChange} onPlacePort={onPlacePort} />
      <gridHelper args={[7, 14, '#39474d', '#273238']} position={[0, -1.42, 0]} />
      <OrbitControls makeDefault enableDamping dampingFactor={.08} screenSpacePanning mouseButtons={{ LEFT: -1 as never, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.ROTATE }} minDistance={3.4} maxDistance={8} />
    </Canvas>
    <div className="preview-face-hint">{mode === 'port' && pendingService ? `Click the exact ${pendingService} connection position` : 'Right-drag orbit · middle-drag pan · wheel zoom'}</div>
  </div>;
}

function PreviewModel({ type, color, backFace, ports = [], mode, pendingService, serviceColors, onBackFaceChange, onPlacePort }: Omit<Props, 'className'>) {
  const dimensions = type.defaultDimensions; const scale = 2.35 / Math.max(dimensions.width, dimensions.height, dimensions.depth, 1);
  const width = dimensions.width * scale; const height = dimensions.height * scale; const depth = dimensions.depth * scale;
  const clickFace = (face: MountingFace) => (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (mode === 'port' && pendingService && onPlacePort) {
      const raw = { x: event.point.x / scale, y: event.point.y / scale, z: event.point.z / scale };
      const position = clampPointToFace(face, raw, dimensions);
      onPlacePort(face, position); return;
    }
    onBackFaceChange?.(face);
  };
  const facePlane = (face: MountingFace) => {
    const epsilon = .012; let position: [number,number,number]; let rotation: [number,number,number]; let size: [number,number];
    if (face === 'front') { position = [0,0,depth / 2 + epsilon]; rotation = [0,0,0]; size = [width,height]; }
    else if (face === 'back') { position = [0,0,-depth / 2 - epsilon]; rotation = [0,Math.PI,0]; size = [width,height]; }
    else if (face === 'left') { position = [-width / 2 - epsilon,0,0]; rotation = [0,-Math.PI / 2,0]; size = [depth,height]; }
    else if (face === 'right') { position = [width / 2 + epsilon,0,0]; rotation = [0,Math.PI / 2,0]; size = [depth,height]; }
    else if (face === 'top') { position = [0,height / 2 + epsilon,0]; rotation = [-Math.PI / 2,0,0]; size = [width,depth]; }
    else { position = [0,-height / 2 - epsilon,0]; rotation = [Math.PI / 2,0,0]; size = [width,depth]; }
    const selected = face === backFace;
    return <group key={face} position={position} rotation={rotation}>
      <mesh onClick={clickFace(face)}><planeGeometry args={size} /><meshBasicMaterial color={selected ? '#10181c' : '#ffffff'} transparent opacity={selected ? .68 : .002} side={DoubleSide} depthWrite={false} /></mesh>
      {selected && mode === 'back' && <Html center transform position={[0,0,.018]} distanceFactor={5} style={{ pointerEvents: 'none' }}><span className="preview-back-label">BACK</span></Html>}
    </group>;
  };
  return <group>
    {type.shape === 'solar-panel' ? <><mesh position={[0,-height / 2 + height * .47,0]}><cylinderGeometry args={[.055,.055,height * .94,18]} /><meshStandardMaterial color="#84949a" /></mesh><mesh position={[0,-height / 2 + .03,0]}><cylinderGeometry args={[.14,.14,.06,22]} /><meshStandardMaterial color="#596a71" /></mesh><mesh position={[0,height * .42,0]} rotation={[-18 * Math.PI / 180,0,0]}><boxGeometry args={[width,.055,depth]} /><meshStandardMaterial color={color} roughness={.7} /><Edges color="#d7e1e4" threshold={15} /></mesh></> : type.id === 'junction-box' ? <JunctionBox3D size={[width,height,depth]} color={color} /> : <mesh>
      {type.shape === 'cylinder' ? <cylinderGeometry args={[width / 2, width / 2, height, 28]} /> : type.shape === 'junction' ? <dodecahedronGeometry args={[Math.max(width,height,depth) * .44]} /> : <boxGeometry args={[width,height,depth]} />}
      <meshStandardMaterial color={color} roughness={.72} metalness={.08} transparent opacity={.9} />
      <Edges color="#d7e1e4" threshold={15} />
    </mesh>}
    {type.shape === 'camera' && <mesh position={[width * .53, 0, 0]}><sphereGeometry args={[Math.min(width,height) * .22, 16, 12]} /><meshBasicMaterial color="#0d1215" /></mesh>}
    {type.shape === 'washer' && <mesh position={[0,0,depth / 2 + .018]}><torusGeometry args={[width * .23,width * .035,12,30]} /><meshBasicMaterial color="#1d3039" /></mesh>}
    {type.shape === 'sink' && <mesh position={[0,height / 2 + .018,0]} rotation={[-Math.PI / 2,0,0]}><torusGeometry args={[width * .24,width * .04,12,30]} /><meshBasicMaterial color="#b9d0d6" /></mesh>}
    {type.id === 'furniture-tv' && <mesh position={[0,0,depth / 2 + .02]}><planeGeometry args={[width * .82,height * .72]} /><meshBasicMaterial color="#10181d" /></mesh>}
    {type.id === 'furniture-pc' && <><mesh position={[width * .32,0,depth / 2 + .02]}><circleGeometry args={[.035,14]} /><meshBasicMaterial color="#42d49a" /></mesh><mesh position={[0,height * .35,depth / 2 + .02]}><planeGeometry args={[width * .45,.025]} /><meshBasicMaterial color="#26343a" /></mesh></>}
    {type.id !== 'junction-box' && <DeviceDetails3D typeId={type.id} size={[width,height,depth]} color={color} />}
    {FACES.map(facePlane)}
    {ports.map((port, index) => <group key={`${port.name}-${index}`} position={[port.position.x * scale, port.position.y * scale, port.position.z * scale]} renderOrder={8}><mesh><sphereGeometry args={[.105,16,16]} /><meshBasicMaterial color="#e9f1f2" depthTest depthWrite /></mesh><mesh><sphereGeometry args={[.073,16,16]} /><meshBasicMaterial color={serviceColors?.[port.serviceCategory] ?? DEFAULT_PREVIEW_SERVICE_COLORS[port.serviceCategory] ?? '#64748b'} depthTest depthWrite /></mesh></group>)}
  </group>;
}

function clampPointToFace(face: MountingFace, raw: Vec3, dimensions: DeviceType['defaultDimensions']): Vec3 {
  const half = { x: dimensions.width / 2, y: dimensions.height / 2, z: dimensions.depth / 2 };
  const point = { x: Math.round(Math.max(-half.x, Math.min(half.x, raw.x))), y: Math.round(Math.max(-half.y, Math.min(half.y, raw.y))), z: Math.round(Math.max(-half.z, Math.min(half.z, raw.z))) };
  if (face === 'front') point.z = half.z; if (face === 'back') point.z = -half.z;
  if (face === 'left') point.x = -half.x; if (face === 'right') point.x = half.x;
  if (face === 'top') point.y = half.y; if (face === 'bottom') point.y = -half.y;
  return point;
}
