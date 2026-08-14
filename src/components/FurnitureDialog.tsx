import { useState } from 'react';
import { Cable, Droplets, PlugZap } from 'lucide-react';
import type { AssociationType, DeviceType, MountingFace } from '../../shared/types';
import { ObjectPreview3D } from './ObjectPreview3D';

interface Props { types: DeviceType[]; onChoose: (type: DeviceType) => void; onClose: () => void }

export function FurnitureDialog({ types, onChoose, onClose }: Props) {
  const [selectedId, setSelectedId] = useState(types[0]?.id ?? '');
  const selected = types.find((type) => type.id === selectedId) ?? types[0];
  const [backFace, setBackFace] = useState<MountingFace>(selected?.defaultBackFace ?? 'back');
  const [association, setAssociation] = useState<AssociationType>(selected?.defaultAssociation ?? 'floor');
  if (!selected) return null;
  const grouped = types.reduce<Record<string, DeviceType[]>>((groups, type) => { const group = furnitureGroup(type.id); (groups[group] ??= []).push(type); return groups; }, {});
  const choose = () => onChoose({ ...selected, defaultBackFace: backFace, defaultAssociation: association });
  return <div className="modal-backdrop furniture-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="furniture-dialog" role="dialog" aria-modal="true" aria-label="Choose furniture"><header><div><strong>Reference furniture</strong><span>Simple technical volumes with realistic service connection defaults.</span></div><button aria-label="Close" onClick={onClose}>×</button></header><div className="furniture-body"><aside>{Object.entries(grouped).map(([group, groupTypes]) => <section key={group}><h3>{group}</h3>{groupTypes.map((type) => <button key={type.id} className={selected.id === type.id ? 'active' : ''} onClick={() => { setSelectedId(type.id); setBackFace(type.defaultBackFace); setAssociation(type.defaultAssociation); }}><FurnitureGlyph shape={type.shape} /><span><strong>{type.name}</strong><small>{type.defaultDimensions.width / 10} × {type.defaultDimensions.height / 10} × {type.defaultDimensions.depth / 10} cm</small></span></button>)}</section>)}</aside><main><ObjectPreview3D type={selected} color={selected.defaultDisplayColor ?? '#788b93'} backFace={backFace} ports={selected.defaultPorts} onBackFaceChange={setBackFace} /><h2>{selected.name}</h2><p className="furniture-mounting-note">The face marked BACK will touch the selected association surface.</p><label className="field furniture-association"><span>Attach BACK to</span><select value={association} onChange={(event) => setAssociation(event.target.value as AssociationType)}><option value="floor">Floor</option><option value="wall">Wall</option><option value="ceiling">Ceiling</option><option value="free">Free-standing</option></select></label><div className="furniture-services">{[...new Set(selected.defaultPorts.map((port) => port.serviceCategory))].map((service) => <span key={service}>{service === 'electrical' ? <PlugZap size={15} /> : service === 'plumbing' ? <Droplets size={15} /> : <Cable size={15} />}{service}</span>)}</div><section><h3>Default connection points</h3>{selected.defaultPorts.length ? selected.defaultPorts.map((port) => <div className="furniture-port" key={port.name}><i /><span><strong>{port.name}</strong><small>{port.serviceCategory} · {port.direction} · {port.face} face</small></span></div>) : <p className="muted">No services by default. Add connection points in Properties.</p>}</section></main></div><footer><button onClick={onClose}>Cancel</button><button className="primary" onClick={choose}>Place {selected.name}</button></footer></div></div>;
}

function FurnitureGlyph({ shape, large = false }: { shape: DeviceType['shape']; large?: boolean }) {
  return <span className={`furniture-glyph ${shape} ${large ? 'large' : ''}`}>{shape === 'washer' && <i />}{shape === 'sink' && <><i /><b /></>}</span>;
}

function furnitureGroup(id: string) {
  if (['furniture-washer','furniture-fridge','furniture-sink','furniture-dishwasher','furniture-oven','furniture-kitchen-hood'].includes(id)) return 'Kitchen & utility';
  if (['furniture-tv','furniture-media-console'].includes(id)) return 'Living room';
  if (['furniture-pc','furniture-desk'].includes(id)) return 'Office';
  return 'General';
}
