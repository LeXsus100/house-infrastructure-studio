import type { FloorBlueprint, Vec2 } from '../../shared/types';

/** Converts a source-image pixel into project plan coordinates in integer millimetres. */
export function blueprintPixelToWorld(blueprint: FloorBlueprint, pixel: Vec2): Vec2 {
  const angle = blueprint.rotationDeg * Math.PI / 180;
  const localX = (pixel.x - blueprint.naturalWidth / 2) * blueprint.scaleMmPerPixel;
  // Source-image Y and the rendered plan plane both grow toward positive project Z.
  // This sign must match BlueprintPlane's -90 degree X rotation.
  const localZ = (pixel.z - blueprint.naturalHeight / 2) * blueprint.scaleMmPerPixel;
  return {
    x: Math.round(blueprint.offsetXmm + Math.cos(angle) * localX - Math.sin(angle) * localZ),
    z: Math.round(blueprint.offsetZmm + Math.sin(angle) * localX + Math.cos(angle) * localZ)
  };
}

/** Converts project plan coordinates to a source-image pixel, useful for drawing the 0,0 marker. */
export function worldToBlueprintPixel(blueprint: FloorBlueprint, world: Vec2): Vec2 {
  const angle = blueprint.rotationDeg * Math.PI / 180;
  const dx = world.x - blueprint.offsetXmm; const dz = world.z - blueprint.offsetZmm;
  const localX = Math.cos(angle) * dx + Math.sin(angle) * dz;
  const localZ = -Math.sin(angle) * dx + Math.cos(angle) * dz;
  return {
    x: blueprint.naturalWidth / 2 + localX / blueprint.scaleMmPerPixel,
    z: blueprint.naturalHeight / 2 + localZ / blueprint.scaleMmPerPixel
  };
}

/** Moves a blueprint so its registration point shares the reference blueprint's project coordinate. */
export function alignBlueprintToReference(blueprint: FloorBlueprint, reference: FloorBlueprint): FloorBlueprint {
  if (!blueprint.alignmentPointPx || !reference.alignmentPointPx) return blueprint;
  const target = blueprintPixelToWorld(reference, reference.alignmentPointPx);
  const current = blueprintPixelToWorld({ ...blueprint, offsetXmm: 0, offsetZmm: 0 }, blueprint.alignmentPointPx);
  return { ...blueprint, offsetXmm: target.x - current.x, offsetZmm: target.z - current.z };
}

/** Keeps the registered project point fixed while scale or rotation is edited. */
export function updateBlueprintTransformPreservingAlignment(
  blueprint: FloorBlueprint,
  patch: Partial<Pick<FloorBlueprint, 'scaleMmPerPixel' | 'rotationDeg'>>
): FloorBlueprint {
  if (!blueprint.alignmentPointPx) return { ...blueprint, ...patch };
  const anchorWorld = blueprintPixelToWorld(blueprint, blueprint.alignmentPointPx);
  const updated = { ...blueprint, ...patch };
  const movedAnchor = blueprintPixelToWorld(updated, blueprint.alignmentPointPx);
  return {
    ...updated,
    offsetXmm: updated.offsetXmm + anchorWorld.x - movedAnchor.x,
    offsetZmm: updated.offsetZmm + anchorWorld.z - movedAnchor.z
  };
}

/** Rotates the image so the user-drawn arrow points toward project north (-Z). */
export function setBlueprintNorthArrow(blueprint: FloorBlueprint, northArrowPx: [Vec2, Vec2]): FloorBlueprint {
  const [tail, tip] = northArrowPx;
  const imageAngle = Math.atan2(tip.z - tail.z, tip.x - tail.x);
  const rotationDeg = (-Math.PI / 2 - imageAngle) * 180 / Math.PI;
  const anchor = blueprint.alignmentPointPx ?? { x: blueprint.naturalWidth / 2, z: blueprint.naturalHeight / 2 };
  const anchorWorld = blueprintPixelToWorld(blueprint, anchor);
  const rotated = { ...blueprint, northArrowPx, rotationDeg, offsetXmm: 0, offsetZmm: 0 };
  const rotatedAnchor = blueprintPixelToWorld(rotated, anchor);
  return {
    ...rotated,
    offsetXmm: anchorWorld.x - rotatedAnchor.x,
    offsetZmm: anchorWorld.z - rotatedAnchor.z
  };
}
