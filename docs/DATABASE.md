# Database schema

SQLite foreign keys are enabled, writes use prepared statements, and project replacement is transactional. UUID strings are stable primary identifiers for user-created objects.

| Table | Purpose and key relationships |
| --- | --- |
| `schema_migrations` | Applied migration versions. |
| `projects` | Project identity, timestamps, theme, drafting preferences, ceiling/floor route offsets, floor service-stack order and spacing, overlap avoidance, turn cost, route motion, per-service tiers, minimum route separations, bend radii, and default installed route diameters. |
| `floors` | Belongs to a project; stores explicit order, elevation, ceiling height in integer millimetres, and a bounded local image-blueprint value object including persisted scale-line endpoints/length and an optional source-pixel registration point. |
| `walls` | Belongs to a project and floor; stores exact start/end coordinates, height, derived finished thickness, structural-core thickness, independent left/right drywall-lining thicknesses, lock, and visibility. |
| `rooms` | Belongs to a project and floor; stores explicit polygon boundary, calculated area, ceiling height, optional room-category relationship, and lock state. |
| `room_categories` | Project-owned, editable room groupings with name, description, and display colour. |
| `room_walls` | Ordered many-to-many relationship between rooms and walls. |
| `categories` | Extensible project service categories with colour and non-colour pattern metadata. |
| `device_types` | Extensible catalogue definitions with category, family, schematic shape, default dimensions/colour, association, mounting back, positioned default connection templates, and bounded expandable-port defaults. |
| `global_device_type_defaults` | Application-wide built-in catalogue definitions shared by every local project. Custom device types remain in their owning project's `device_types` rows. |
| `devices` | Belongs to a floor, optionally a room and wall; stores world and wall-local placement, mounting back, adjacent-floor transition accessibility, explicit paired route continuity for risers, panel/junction correspondence groups, label visibility, separate colour metadata, and core technical metadata. |
| `device_ports` | Belongs to a device; stores direction, service, connector, voltage/current, speed, media, required state, device-local position, physical face, and termination face-space requirement. |
| `routes` | Cable, pipe, or duct identity; stores service, endpoint device/port relationships, room/wall associations, installation status/date, test state, directed flow, and typed technical extensions including conductor, Ethernet, conduit, and separated colour metadata. |
| `route_points` | Ordered 3D control points for a route, in integer millimetres. |
| `measurements` | Manual dimensions and annotations with optional wall/room references and lock state. |
| `annotations` | Reserved normalized text-annotation table for later independent annotation workflows. |
| `export_presets` | Project-owned wall-elevation image and content options. |
| `camera_views` | Named projection, position, and target presets. |
| `lighting_controls` | Project-owned lighting circuits linking one physical light-switch device to a documentation/simulation state and notes. |
| `lighting_control_lights` | Ordered many-to-many relationship from a lighting control to the light-point devices operated by that switch. |
| `photo_markers` | Project/floor-owned 3D photo locations with category, title, description, and integer-millimetre coordinates. |
| `project_photos` | Ordered metadata for JPEG/PNG/WebP assets stored in the matching project workspace `assets/photos/` folder. |

Core searchable and relational fields remain normal columns. JSON is limited to natural value objects (polygon vertices, rotations, dimensions, export options), arrays of custom key/value fields, and kind-specific technical extensions that would otherwise force sparse cable/pipe/duct columns into one table.

Migration `004_visual_metadata.sql` adds device-type default colours and bounded per-device visual metadata. Migrations `005_level_blueprints_and_device_mounting.sql` and `006_floor_order.sql` add bounded blueprint/mounting value objects, positioned port columns, and deterministic level order. Migration `007_lighting_and_photos.sql` adds switch/light relationships plus project-photo metadata and indexes. Migration `008_wall_layers_and_route_planning.sql` normalizes wall-core and lining thicknesses while route-planning preferences remain bounded project settings. Migration `009_expandable_device_ports.sql` adds normalized per-port termination-space requirements. Migration `010_global_device_type_defaults.sql` adds the local application-wide built-in catalogue overlay; each definition is one validated, bounded device-type value object, while project-created custom types stay project-owned. Migration `011_route_installation_date.sql` adds a nullable route installation date. Route colour provenance, conductor sets, T568 termination data, and conduit metadata remain in the existing typed route extension JSON because they are kind-specific value objects rather than relationship substitutes.

Rack layout versions, U capacity, module face/grid positions, editable visible port labels, per-port electrical/network specifications, patch-jack pairs, internal rack leads, and riser route-link pairs are bounded typed value objects in `devices.visual_json`; house-facing patch-panel rear ports remain normalized rows in `device_ports`, and every installed house route continues to reference those port rows explicitly. Riser links contain stable route UUID pairs only and are revalidated against endpoint, floor, kind, service, and one-to-one constraints whenever a project is upgraded or an affected route changes.

Indexes cover the main project/floor lookups, room/wall and device attachments, route-point ordering, and project measurements. The migration finishes with `PRAGMA optimize`.
