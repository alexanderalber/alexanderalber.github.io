const DuvalPentagon = (function() {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const GASES = ['H2', 'C2H6', 'CH4', 'C2H4', 'C2H2'];
  const CX = 300, CY = 300, R = 240;
  
  // Regular pentagon vertices (indices 0..4)
  const VERTICES = [];
  for (let i = 0; i < 5; i++) {
    const angle = -Math.PI / 2 + i * (2 * Math.PI / 5);
    VERTICES.push({ x: CX + R * Math.cos(angle), y: CY + R * Math.sin(angle) });
  }
  
  function bary(pcts) {
    return pcts; // array of 5 percentages
  }
  
  function O(i) {
    const arr = [0, 0, 0, 0, 0];
    arr[i] = 100;
    return arr;
  }
  
  function I(i) {
    const arr = [10, 10, 10, 10, 10];
    arr[i] = 60;
    return arr;
  }
  
  // Split points on edge H2-C2H2
  const S_outer = [50, 0, 0, 0, 50]; // midpoint between H2 and C2H2
  const S_inner = [35, 10, 10, 10, 35]; // midpoint between I(0) and I(4)
  
  const ZONES = [
    { name: 'PD', color: '#f4cccc', pts: [O(0), O(1), I(1), I(0)] },
    { name: 'T1', color: '#d9ead3', pts: [O(1), O(2), I(2), I(1)] },
    { name: 'T2', color: '#fff2cc', pts: [O(2), O(3), I(3), I(2)] },
    { name: 'T3', color: '#fce5cd', pts: [O(3), O(4), I(4), I(3)] },
    { name: 'D1', color: '#cfe2f3', pts: [O(0), S_outer, S_inner, I(0)] },
    { name: 'D2', color: '#ead1dc', pts: [S_outer, O(4), I(4), S_inner] },
    { name: 'DT', color: '#efefef', pts: [I(0), I(1), I(2), I(3), I(4)] }
  ];
  
  function toXY(b) {
    let x = 0, y = 0;
    for (let i = 0; i < 5; i++) {
      x += (b[i] / 100) * VERTICES[i].x;
      y += (b[i] / 100) * VERTICES[i].y;
    }
    return { x, y };
  }
  
  function pointInPolygon(p, poly) {
    if (poly.length < 3) return false;
    // boundary check
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const dx = b.x - a.x, dy = b.y - a.y;
      const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
      if (t >= 0 && t <= 1) {
        const cx = a.x + t * dx, cy = a.y + t * dy;
        if ((p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy) < 1e-8) return true;
      }
    }
    // ray casting
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      if ((yi > p.y) !== (yj > p.y)) {
        const x = (xj - xi) * (p.y - yi) / (yj - yi) + xi;
        if (p.x < x) inside = !inside;
      }
    }
    return inside;
  }
  
  function zoneOfSample(h2, ch4, c2h6, c2h4, c2h2) {
    const sum = h2 + ch4 + c2h6 + c2h4 + c2h2;
    if (sum <= 0) return 'DT';
    const b = [
      (h2 / sum) * 100,
      (c2h6 / sum) * 100,
      (ch4 / sum) * 100,
      (c2h4 / sum) * 100,
      (c2h2 / sum) * 100
    ];
    const p = toXY(b);
    for (const zone of ZONES) {
      const poly = zone.pts.map(toXY);
      if (pointInPolygon(p, poly)) return zone.name;
    }
    return 'DT';
  }
  
  function createSvgElement(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const key in attrs) {
      el.setAttribute(key, attrs[key]);
    }
    return el;
  }
  
  function render(svg, sample) {
    // Ensure white background
    const bg = createSvgElement('rect', { x: 0, y: 0, width: 600, height: 600, fill: 'white' });
    svg.appendChild(bg);
    
    // Draw zones
    for (const zone of ZONES) {
      const poly2d = zone.pts.map(toXY);
      let d = '';
      for (let i = 0; i < poly2d.length; i++) {
        if (i === 0) d += 'M ' + poly2d[i].x.toFixed(2) + ' ' + poly2d[i].y.toFixed(2);
        else d += ' L ' + poly2d[i].x.toFixed(2) + ' ' + poly2d[i].y.toFixed(2);
      }
      d += ' Z';
      const path = createSvgElement('path', {
        d: d,
        fill: zone.color,
        stroke: '#555',
        'stroke-width': '1.2'
      });
      svg.appendChild(path);
    }
    
    // Draw axes
    for (let i = 0; i < 5; i++) {
      const line = createSvgElement('line', {
        x1: CX, y1: CY,
        x2: VERTICES[i].x, y2: VERTICES[i].y,
        stroke: '#777',
        'stroke-width': '1.5'
      });
      svg.appendChild(line);
    }
    
    // Label gas names
    for (let i = 0; i < 5; i++) {
      const angle = -Math.PI / 2 + i * (2 * Math.PI / 5);
      const labelR = R + 28;
      const x = CX + labelR * Math.cos(angle);
      const y = CY + labelR * Math.sin(angle);
      const text = createSvgElement('text', {
        x: x,
        y: y,
        'font-size': '16',
        'font-family': 'Arial, sans-serif',
        'font-weight': 'bold',
        fill: '#222',
        'text-anchor': Math.abs(Math.cos(angle)) < 0.3 ? 'middle' : (Math.cos(angle) > 0 ? 'start' : 'end'),
        'dominant-baseline': 'middle'
      });
      text.textContent = GASES[i];
      svg.appendChild(text);
    }
    
    // Label zones
    for (const zone of ZONES) {
      const poly2d = zone.pts.map(toXY);
      let cx = 0, cy = 0;
      for (const pt of poly2d) { cx += pt.x; cy += pt.y; }
      cx /= poly2d.length;
      cy /= poly2d.length;
      const text = createSvgElement('text', {
        x: cx,
        y: cy,
        'font-size': '13',
        'font-family': 'Arial, sans-serif',
        'font-weight': 'bold',
        fill: '#111',
        'text-anchor': 'middle',
        'dominant-baseline': 'middle'
      });
      text.textContent = zone.name;
      svg.appendChild(text);
    }
    
    // Mark sample point if given
    if (sample) {
      const h2 = sample.h2 || 0;
      const ch4 = sample.ch4 || 0;
      const c2h6 = sample.c2h6 || 0;
      const c2h4 = sample.c2h4 || 0;
      const c2h2 = sample.c2h2 || 0;
      const sum = h2 + ch4 + c2h6 + c2h4 + c2h2;
      if (sum > 0) {
        const b = [
          (h2 / sum) * 100,
          (c2h6 / sum) * 100,
          (ch4 / sum) * 100,
          (c2h4 / sum) * 100,
          (c2h2 / sum) * 100
        ];
        const pt = toXY(b);
        const circle = createSvgElement('circle', {
          cx: pt.x, cy: pt.y, r: 6,
          fill: '#000', stroke: '#fff', 'stroke-width': '2'
        });
        svg.appendChild(circle);
      }
    }
  }
  
  return {
    classify: function(h2, ch4, c2h6, c2h4, c2h2) {
      return zoneOfSample(h2, ch4, c2h6, c2h4, c2h2);
    },
    render: render
  };
})();
