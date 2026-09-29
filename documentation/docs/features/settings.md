---
title: Settings
description: Route rules, drafting preferences, identification, device defaults, rack systems, diagnostics, and local administration.
---

# Settings

<div class="his-page-lead">
  <span class="his-section-id">FEATURE 05</span>
  <p>Settings defines the repeatable rules behind the model. Most values belong to the current project; built-in device defaults and the optional application icon use local application storage.</p>
</div>

Open **Settings** from the header. Hover help on headings and fields explains
the effect of each compact control.

## SETTINGS 01 · Route planning

Route planning controls path selection, physical separation, and identification.

### Path rules

- **Avoid unrelated route conflicts** enables automated clearance planning.
- **Strongly group routes sharing a destination** encourages concise shared
  corridors.
- **Turn penalty** expresses the preference for fewer corners as an equivalent
  path length.
- **Ceiling route offset** positions concealed services relative to the finished
  ceiling plane.
- **Floor route offset** sets the buried reference plane below the finished
  floor.
- **Pipe gravity slope** and **Duct gravity slope** define the flow-oriented
  minimum grade used by 0.3.0 route geometry.

### Stack, priority, and size

The floor service stack orders pipe, cable, and duct tiers from deepest to
closest to the finished floor. Avoidance tiers assign each service a priority
from 1 to 4 when several systems compete for space.

A single service switcher edits three values:

| Parameter | Effect |
| --- | --- |
| Minimum separation | Centreline and tier clearance for the selected service. |
| Turn curvature | Preferred bend radius at corners, detours, and structural transitions. |
| Default route diameter | Physical size used when the route has no explicit conduit, pipe, or duct dimension. |

### Route identification

The naming pattern accepts `{PREFIX}`, `{FLOOR}`, `{KIND}`, `{SERVICE}`, and a
sequence token such as `{SEQ:03}`. Each service has an editable short prefix and
the page previews the resulting identifier before new routes are created.

## SETTINGS 02 · Drafting

Drafting contains the metric grid, grid snapping, wall/corner/angle snapping,
and route direction motion. The motion control offers **Animated** and **Off**;
it changes the direction markers shown on directed routes in X-ray.

## SETTINGS 03 · Appearance

Every service category has an editable project display colour and a text
pattern. Labels and patterns keep services identifiable when colours appear
similar or output is printed with limited colour.

The page also summarizes the reserved and conventional meanings used by the
Italy-oriented defaults. See [Visual identification defaults](../reference/visual-identification.md)
for conductors, Ethernet pairs, conduits, pipes, and colour provenance.

## SETTINGS 04 · Devices and furniture

This area edits built-in catalogue defaults and complete rack systems.

### All other devices

Filter by category or name, then expand a type to set its display colour,
association, width, height, depth, BACK mounting face, and positioned connection
points. Expandable enclosures also have a default termination-space value.

Changes to a built-in type become local application defaults and are applied
when projects are created or opened. Project-created custom types remain inside
their project.

### Rack systems

Rack settings model U capacity, front and rear faces, installed equipment,
patch-panel pairs, port grids, internal leads, and house-facing endpoints. Port
records can include label, service, direction, speed, PoE, voltage, power, and
media details. The prepared rack starts at 800 mm wide and 1000 mm deep with an
editable 22U layout.

## SETTINGS 05 · Project diagnostics

Diagnostics groups the current model checks into five areas:

1. route layout and physical clearance;
2. cable length beyond the 11 m accepted review limit;
3. vertical-service riser pairing and directional balance;
4. panel and junction continuity;
5. technical devices without route attachments.

Each relevant row can locate or review the affected object in the live model.
Coordinated route proposals include before-and-after conflict, bend, and length
metrics so the suggested geometry can be inspected first.

## SETTINGS 06 · Administration

Administration manages the optional local application icon. PNG, JPEG, and
WebP images up to 4 MB are accepted. The override stays in the current browser
or desktop profile and is separate from SQLite, project backups, and release
assets. **Use neutral icon** restores the public project artwork.

For the geometry controlled by these settings, see
[X-ray and routes](xray-and-routes.md). For release and privacy boundaries, see
[Data and privacy](../reference/privacy.md).
