(() => {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const DURATION = 18;
  const DASH_SPEED = 52;
  const routeDefs = [
    { id: 'A', color: '#ff8729', start: 0.55, draw: 3.2, erase: 12.8, eraseDur: 2.2, speed: 1,
      d: 'M 300 710 H 515 Q 540 710 540 685 V 430 Q 540 405 565 405 H 775 Q 800 405 800 430 V 710 Q 800 735 825 735 H 1075 Q 1100 735 1100 710 V 570 Q 1100 545 1125 545 H 1455' },
    { id: 'B', color: '#35b8ff', start: 1.45, draw: 3.65, erase: 14, eraseDur: 2.2, speed: 1.13,
      d: 'M 1460 835 H 1080 Q 1055 835 1055 810 V 360 Q 1055 335 1030 335 H 880 Q 855 335 855 360 V 535 Q 855 560 830 560 H 490 Q 465 560 465 585 V 790 Q 465 815 440 815 H 305' },
    { id: 'C', color: '#71f47f', start: 2.6, draw: 2.9, erase: 11.15, eraseDur: 2.45, speed: 0.92,
      d: 'M 305 900 H 735 Q 760 900 760 875 V 820 Q 760 795 785 795 H 1010 Q 1035 795 1035 770 V 665 Q 1035 640 1060 640 H 1455' },
    { id: 'D', color: '#d769ff', start: 3.3, draw: 3.1, erase: 15.05, eraseDur: 1.75, speed: 1.25,
      d: 'M 445 300 V 455 Q 445 480 470 480 H 620 Q 645 480 645 505 V 650 Q 645 675 670 675 H 905 Q 930 675 930 650 V 445 Q 930 420 955 420 H 1260 Q 1285 420 1285 445 V 735 Q 1285 760 1310 760 H 1510' },
    { id: 'E', color: '#ffd45a', start: 4.35, draw: 2.55, erase: 10.1, eraseDur: 2, speed: 1.38,
      d: 'M 285 620 H 395 Q 420 620 420 595 V 520 Q 420 495 445 495 H 665 Q 690 495 690 470 V 330 Q 690 305 715 305 H 930' },
    { id: 'F', color: '#6c8cff', start: 5.15, draw: 3.75, erase: 13.25, eraseDur: 2.55, speed: 0.86,
      d: 'M 1515 330 H 1370 Q 1345 330 1345 355 V 465 Q 1345 490 1320 490 H 1185 Q 1160 490 1160 515 V 610 Q 1160 635 1135 635 H 905 Q 880 635 880 610 V 570 Q 880 545 855 545 H 690 Q 665 545 665 570 V 700 Q 665 725 640 725 H 520 Q 495 725 495 700 H 300' },
    { id: 'G', color: '#39f0df', start: 6.15, draw: 2.8, erase: 15.55, eraseDur: 1.55, speed: 1.08,
      d: 'M 820 885 V 820 Q 820 795 845 795 H 925 Q 950 795 950 770 V 690 Q 950 665 975 665 H 1170 Q 1195 665 1195 640 V 535 Q 1195 510 1220 510 H 1505' },
    { id: 'H', color: '#ff5f6d', start: 7.2, draw: 2.35, erase: 12.1, eraseDur: 2.8, speed: 1.47,
      d: 'M 1465 525 H 1390 Q 1365 525 1365 550 V 675 Q 1365 700 1340 700 H 1115 Q 1090 700 1090 725 V 865 Q 1090 890 1065 890 H 930' },
    { id: 'I', color: '#55a7ff', start: 8.1, draw: 1.95, erase: 14.55, eraseDur: 2.05, speed: 1.19,
      d: 'M 300 840 H 380 Q 405 840 405 815 V 745 Q 405 720 430 720 H 575 Q 600 720 600 745 V 820 Q 600 845 625 845 H 730' },
    { id: 'J', color: '#b7ff5b', start: 9.25, draw: 3.25, erase: 16.05, eraseDur: 1.55, speed: 0.98,
      d: 'M 1485 690 H 1435 Q 1410 690 1410 665 V 615 Q 1410 590 1385 590 H 1240 Q 1215 590 1215 615 V 745 Q 1215 770 1190 770 H 900 Q 875 770 875 745 V 585 Q 875 560 850 560 H 615 Q 590 560 590 535 V 470 Q 590 445 565 445 H 305' },
  ];

  const clamp = (value, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, value));
  const easeOutCubic = (value) => 1 - Math.pow(1 - value, 3);
  const easeInOutCubic = (value) => value < 0.5
    ? 4 * value * value * value
    : 1 - (Math.pow((-2 * value) + 2, 3) / 2);

  function svgElement(tag, attributes = {}) {
    const element = document.createElementNS(NS, tag);
    for (const [name, value] of Object.entries(attributes)) {
      element.setAttribute(name, value);
    }
    return element;
  }

  function visibilityAt(time, route) {
    if (time <= route.start) return 0;
    if (time < route.start + route.draw) {
      return easeOutCubic(clamp((time - route.start) / route.draw));
    }
    if (time < route.erase) return 1;
    if (time < route.erase + route.eraseDur) {
      return 1 - easeInOutCubic(clamp((time - route.erase) / route.eraseDur));
    }
    return 0;
  }

  function mountBlueprint() {
    const root = document.querySelector('#his-blueprint-routes');
    if (!root || root.dataset.animationMounted === 'true') return;

    const blueprint = root.querySelector('#his-blueprint-structure');
    const defs = root.querySelector('#his-blueprint-defs');
    const layer = root.querySelector('#his-blueprint-route-layer');
    if (!blueprint || !defs || !layer) return;

    root.dataset.animationMounted = 'true';

    function createRoute(definition, index) {
      const mask = svgElement('mask', {
        id: `his-blueprint-mask-${definition.id}`,
        maskUnits: 'userSpaceOnUse',
        x: '0',
        y: '0',
        width: '1920',
        height: '1080',
      });
      mask.appendChild(svgElement('rect', { width: '1920', height: '1080', fill: 'black' }));
      const reveal = svgElement('path', {
        d: definition.d,
        fill: 'none',
        stroke: 'white',
        'stroke-width': '30',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      });
      mask.appendChild(reveal);
      defs.appendChild(mask);

      const masked = svgElement('g', { mask: `url(#his-blueprint-mask-${definition.id})` });
      const main = svgElement('path', { class: 'his-blueprint-route-main', stroke: definition.color, d: definition.d });
      masked.appendChild(main);
      layer.appendChild(masked);

      const nodes = svgElement('g', { fill: definition.color });
      const startCore = svgElement('circle', { class: 'his-blueprint-node-core', r: '9' });
      const endCore = svgElement('circle', { class: 'his-blueprint-node-core', r: '9' });
      const packet = svgElement('circle', { class: 'his-blueprint-packet', r: '5.5', fill: definition.color });
      nodes.append(startCore, endCore, packet);
      layer.appendChild(nodes);

      const length = main.getTotalLength();
      const start = main.getPointAtLength(0);
      const end = main.getPointAtLength(length);
      startCore.setAttribute('cx', start.x);
      startCore.setAttribute('cy', start.y);
      endCore.setAttribute('cx', end.x);
      endCore.setAttribute('cy', end.y);
      reveal.style.strokeDasharray = `0.001 ${length + 1}`;

      return {
        ...definition,
        index,
        reveal,
        main,
        startCore,
        endCore,
        packet,
        length,
      };
    }

    const routes = routeDefs.map(createRoute);
    const startedAt = performance.now() - 2400;
    let visible = true;
    let animationFrameId = 0;

    function render(time) {
      routes.forEach((route, index) => {
        const progress = visibilityAt(time, route);
        const visibleLength = Math.max(0.001, progress * route.length);
        route.reveal.style.strokeDasharray = `${visibleLength} ${route.length + 6}`;

        const dash = -((time * DASH_SPEED * route.speed) + (index * 17));
        route.main.style.strokeDashoffset = dash;

        route.startCore.style.opacity = clamp((time - route.start) * 3.5) * progress;
        route.endCore.style.opacity = clamp((progress - 0.93) / 0.07);

        const packetProgress = ((time * 0.16 * route.speed) + (index * 0.117)) % 1;
        if (progress < 0.1 || packetProgress > progress - 0.015) {
          route.packet.style.opacity = 0;
        } else {
          const point = route.main.getPointAtLength(packetProgress * route.length);
          route.packet.setAttribute('cx', point.x);
          route.packet.setAttribute('cy', point.y);
          route.packet.style.opacity = 0.72;
        }
      });
    }

    function scheduleFrame() {
      if (animationFrameId || !visible || document.hidden || !root.isConnected) return;
      animationFrameId = requestAnimationFrame(tick);
    }

    function tick(now) {
      animationFrameId = 0;
      if (!visible || document.hidden || !root.isConnected) return;
      render(((now - startedAt) / 1000) % DURATION);
      scheduleFrame();
    }

    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      scheduleFrame();
    }, { threshold: 0.01 });
    intersectionObserver.observe(root);

    document.addEventListener('visibilitychange', scheduleFrame);
    root.dataset.animationProfile = 'lightweight-native-fps';
    render(2.4);
    scheduleFrame();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountBlueprint, { once: true });
  } else {
    mountBlueprint();
  }

  new MutationObserver(mountBlueprint).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
