---
title: Overview
description: Animated blueprint of the services mapped inside a home.
hide:
  - toc
  - edit
---

<section
  class="his-blueprint-home"
  id="his-blueprint-routes"
  role="img"
  aria-label="Animated blueprint-style house with ten electrical, data, plumbing, and building-service routes"
>
  <div class="his-blueprint-home__copy">
    <h1>See the systems your home hides.</h1>
    <p>
      Build a clear local 3D record of rooms, cables, pipes, ducts, devices,
      and installation photos, with every project kept on your own computer.
    </p>
    <div class="his-blueprint-home__actions">
      <a class="his-blueprint-home__action his-blueprint-home__action--primary" href="getting-started/">Get started</a>
      <a class="his-blueprint-home__action" href="reference/capabilities/">Explore capabilities</a>
    </div>
  </div>

  <svg class="his-blueprint-home__scene" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs id="his-blueprint-defs">
      <linearGradient id="his-blueprint-scan-gradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#79c7ff" stop-opacity="0" />
        <stop offset=".5" stop-color="#79c7ff" stop-opacity=".4" />
        <stop offset="1" stop-color="#79c7ff" stop-opacity="0" />
      </linearGradient>
    </defs>

    <rect class="his-blueprint-scan" x="0" y="-120" width="1920" height="120" fill="url(#his-blueprint-scan-gradient)" />

    <g id="his-blueprint-structure">
      <path class="his-blueprint-house" d="M 245 930 V 250 L 960 70 L 1675 250 V 930 Z" />
      <path class="his-blueprint-house his-blueprint-house--secondary" d="M 245 585 H 700 M 700 780 H 960 M 960 585 H 1675" />
      <path class="his-blueprint-house his-blueprint-house--secondary" d="M 700 248 V 930 M 960 250 V 930" />
      <path class="his-blueprint-house his-blueprint-house--detail" d="M 445 245 V 380 M 1290 245 V 380" />
      <text class="his-blueprint-label" x="425" y="510">LIVING</text>
      <text class="his-blueprint-label" x="425" y="860">STUDIO</text>
      <text class="his-blueprint-label" x="1250" y="510">KITCHEN</text>
      <text class="his-blueprint-label" x="1250" y="860">UTILITY</text>
      <text class="his-blueprint-micro" x="270" y="280">HOUSE INFRASTRUCTURE / 10 ROUTES</text>
      <text class="his-blueprint-micro" x="1340" y="910">LOCAL 3D SYSTEM MAP</text>
    </g>

    <g id="his-blueprint-route-layer"></g>
  </svg>
</section>
