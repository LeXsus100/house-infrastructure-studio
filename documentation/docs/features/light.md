---
title: Light
description: Active-floor lighting topology, switch tracing, and cable-continuity checks.
---

# Light

<div class="his-page-lead">
  <span class="his-section-id">FEATURE 04</span>
  <p>Light provides a focused active-floor view of light points, switches, their documented cable paths, and the junctions, panels, or risers required to connect them.</p>
</div>

Open **Light** from the header. The workspace uses X-ray automatically and
reduces the scene to the lighting network under review. The left side retains
level navigation, the centre shows the 3D topology, and the right panel presents
counts, continuity issues, and light-point tracing.

## LIGHT 01 · How the network is derived

The lighting graph follows saved technical relationships:

1. electrical or lighting cable endpoints at switches and light points;
2. route-junction branches;
3. explicit incoming-to-outgoing groups at junction boxes and electrical
   panels;
4. valid paired routes through floor transitions.

This gives the view a reproducible path through the project data. It also makes
missing correspondence visible during review.

## LIGHT 02 · Read the active floor

The summary reports light points, light switches, and connection issues on the
active floor. The 3D view includes the cables that participate in the lighting
network plus the connector devices needed to understand their continuity.

Select a light point from the model or the right panel. Every switch with a
documented cable path pulses red in the viewport, and the result list names the
matching controls and their floors.

## LIGHT 03 · Connection audit

The audit reports issues such as:

- a light point with no cable continuity to a switch;
- a switch with no connected light point;
- a lighting route with a missing device endpoint;
- an incomplete junction or panel correspondence in the visible network;
- an invalid or unpaired riser continuation.

Selecting an issue locates the relevant device or route in the editor. Correct
the ports, correspondence group, or riser pair in Edit mode, then reopen Light
to confirm the complete path.

## LIGHT 04 · Scope of the view

Light documents wiring topology and helps verify the model. Installed building
controls continue to operate through their physical switches, relays,
controllers, and automation systems. The Light workspace reads the saved
project relationships for inspection.

Route construction and flow are described in [X-ray and routes](xray-and-routes.md).
Project-wide checks are described in [Settings](settings.md).
