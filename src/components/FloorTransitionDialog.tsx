import type { Floor } from '../../shared/types';

interface Props { activeFloor: Floor; floors: Floor[]; onChoose: (floorId: string) => void; onClose: () => void }

export function FloorTransitionDialog({ activeFloor, floors, onChoose, onClose }: Props) {
  const ordered = [...floors].sort((a, b) => a.elevationMm - b.elevationMm); const index = ordered.findIndex((floor) => floor.id === activeFloor.id);
  const adjacent = [ordered[index - 1], ordered[index + 1]].filter((floor): floor is Floor => !!floor);
  return <div className="modal-backdrop transition-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="transition-dialog" role="dialog" aria-modal="true" aria-label="Choose adjacent floor"><header><div><strong>Floor transition</strong><span>Choose the adjacent level reached by this vertical sleeve.</span></div><button onClick={onClose} aria-label="Close">×</button></header><div className="transition-options">{adjacent.length ? adjacent.map((floor) => <button key={floor.id} onClick={() => onChoose(floor.id)}><strong>{floor.name}</strong><span>{floor.elevationMm > activeFloor.elevationMm ? 'Above' : 'Below'} · {Math.abs(floor.elevationMm - activeFloor.elevationMm) / 1000} m</span></button>) : <p>No adjacent floor is available. Add another level first.</p>}</div><footer><button onClick={onClose}>Cancel</button></footer></div></div>;
}
