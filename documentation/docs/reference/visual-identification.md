---
title: Visual identification defaults
description: Italy-oriented conductor, Ethernet, conduit, and pipe identification conventions.
---

# Visual identification defaults

House Infrastructure Studio starts with Italy-oriented visual identification
defaults. They make technical drawings easier to read while keeping functional,
physical, and display colours separate in the project data.

## Electrical conductors

Electrical routes document single-phase `L1` brown, `N` blue, and `PE`
yellow-green conductors by default. Three-phase routes add black `L2` and grey
`L3`. Yellow-green is reserved for protective earth and blue for neutral.

## Ethernet cabling

Data routes default to T568B and can switch to T568A. The eight internal pair
colours are stored separately from the configurable physical Ethernet jacket
colour. Keep the jacket colour independent from cable category, speed, PoE
support, and shielding data.

## Conduits and pipes

Conduit service colours are editable project conventions with an explicit
service label and line pattern. Pipe Properties provides Italy-oriented water,
hot-water and steam, fuel, gas, chemical, compressed-air, fire, hazardous, and
drainage presets. Each preset identifies whether its colour is standard
identification or a project convention.

## Colour fields

Every technical object separates these values:

| Field | Purpose |
| --- | --- |
| `functionalColor` | Identifies the service or engineering function. |
| `physicalColor` | Records the colour of the installed component. |
| `displayColor` | Controls its appearance in the editor and output. |
| `colorSource` | Records whether the colour came from a standard, preset, or project choice. |

Colours work alongside service labels, icons, patterns, and technical metadata.

!!! warning "Verify applicable rules"

    These defaults support practical documentation. Verify the applicable
    standards and installation rules with a qualified professional.
