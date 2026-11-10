const DuvalTriangle = (function() {
  // ---- Triangle geometry in SVG coordinates ----
  const V = {
    CH4:  { x: 300, y: 70  },  // top vertex
    C2H4: { x: 510, y: 440 },  // bottom-right vertex
    C2H2: { x: 90,  y: 440 }   // bottom-left vertex
  };

  // Convert barycentric (%CH4, %C2H4, %C2H2) → Cartesian
  function toCartesian(a, b, c) {
    const x = (c * V.C2H2.x + b * V.C2H4.x + a * V.CH4.x) / 100;
    const y = (c * V.C2H2.y + b * V.C2H4.y + a * V.CH4.y) / 100;
    return { x, y };
  }

  // ---- Zone definitions (barycentric %CH4, %C2H4, %C2H2) ----
  const zoneDefs = {
    PD: [[100,0,0], [80,20,0], [78,20,2], [98,0,2]],
    T1: [[80,20,0], [78,20,2], [48,50,2], [50,50,0]],
    T3: [[50,50,0], [48,50,2], [0,98,2], [0,100,0]],
    D1: [[64,23,13], [0,23,77], [0,87,13]],
    D2: [[87,0,13], [64,23,13], [0,87,13], [0,0,100]],
    T2: [[78,20,2], [48,50,2], [0,98,2], [0,87,13], [64,23,13], [87,0,13], [98,0,2]]
  };

  // Pre-compute Cartesian polygons for each zone
  const zonePolygons = {};
  for (const [name, pts] of Object.entries(zoneDefs)) {
    zonePolygons[name] = pts.map(function(p) { return toCartesian(p[0], p[1], p[2]); });
  }

  // Zone colours
  const zoneColors = {
    PD: '#FFEE58',
    T1: '#66BB6A',
    T2: '#FFA726',
    T3: '#EF5350',
    D1: '#EC407A',
    D2: '#AB47BC'
  };

  // Zone check order for classify()
  const zoneOrder = ['PD', 'T1', 'T3', 'D1', 'D2', 'T2'];

  // ---- Point-in-polygon (ray casting) ----
  function pointInPolygon(px, py, poly) {
    let inside = false;
    const n = poly.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  // ---- classify() ----
  function classify(ch4, c2h4, c2h2) {
    const total = ch4 + c2h4 + c2h2;
    if (total <= 0) return null;
    const a = (ch4 / total) * 100;
    const b = (c2h4 / total) * 100;
    const c = (c2h2 / total) * 100;
    const pt = toCartesian(a, b, c);
    for (let i = 0; i < zoneOrder.length; i++) {
      const zone = zoneOrder[i];
      if (pointInPolygon(pt.x, pt.y, zonePolygons[zone])) {
        return zone;
      }
    }
    return 'T2'; // fallback
  }

  // ---- SVG helpers ----
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function makeEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, v);
    }
    return el;
  }

  function polygonPoints(poly) {
    return poly.map(function(p) { return p.x + ',' + p.y; }).join(' ');
  }

  function centroid(poly) {
    let cx = 0, cy = 0;
    for (let i = 0; i < poly.length; i++) {
      cx += poly[i].x;
      cy += poly[i].y;
    }
    return { x: cx / poly.length, y: cy / poly.length };
  }

  // ---- render() ----
  function render(svg, sample) {
    // Clear SVG
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    // White background
    svg.appendChild(makeEl('rect', { x: '0', y: '0', width: '600', height: '540', fill: 'white' }));

    // Group for triangle content
    const g = makeEl('g', {});
    svg.appendChild(g);

    // 1. Draw filled zones
    for (const [name, poly] of Object.entries(zonePolygons)) {
      g.appendChild(makeEl('polygon', {
        points: polygonPoints(poly),
        fill: zoneColors[name],
        stroke: '#333',
        'stroke-width': '1',
        'stroke-linejoin': 'round'
      }));
    }

    // 2. Triangle outline
    const triPoly = [V.CH4, V.C2H4, V.C2H2];
    g.appendChild(makeEl('polygon', {
      points: polygonPoints(triPoly),
      fill: 'none',
      stroke: '#111',
      'stroke-width': '2.5',
      'stroke-linejoin': 'round'
    }));

    // 3. Zone labels
    for (const [name, poly] of Object.entries(zonePolygons)) {
      const c = centroid(poly);
      g.appendChild(makeEl('text', {
        x: c.x.toFixed(1),
        y: c.y.toFixed(1),
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-size': '12',
        'font-weight': 'bold',
        'font-family': 'Arial, sans-serif',
        fill: '#222',
        'pointer-events': 'none'
      }));
      // Set text content
      const txt = g.lastChild;
      txt.textContent = name;
    }

    // 4. Tick marks and percentage labels on the three edges
    const edges = [
      { v0: V.CH4, v1: V.C2H4, gasOnEdge: 'C₂H₄', oppositeGas: 'C₂H₂' },
      { v0: V.C2H4, v1: V.C2H2, gasOnEdge: 'C₂H₂', oppositeGas: 'CH₄' },
      { v0: V.C2H2, v1: V.CH4, gasOnEdge: 'CH₄', oppositeGas: 'C₂H₄' }
    ];

    // Outward normals (precomputed)
    const edgeNormals = [
      { nx: 0.8696, ny: -0.4936 },  // CH4→C2H4 outward
      { nx: 0, ny: 1 },             // C2H4→C2H2 outward (down)
      { nx: -0.8696, ny: -0.4936 }  // C2H2→CH4 outward
    ];

    for (let e = 0; e < 3; e++) {
      const v0 = edges[e].v0;
      const v1 = edges[e].v1;
      const dx = v1.x - v0.x;
      const dy = v1.y - v0.y;
      const normal = edgeNormals[e];

      for (let t = 0; t <= 5; t++) {
        const frac = t / 5; // 0, 0.2, 0.4, 0.6, 0.8, 1.0
        const px = v0.x + frac * dx;
        const py = v0.y + frac * dy;
        const tickLen = (frac === 0 || frac === 1) ? 5 : 8;
        const tx = px + normal.nx * tickLen;
        const ty = py + normal.ny * tickLen;
        const lx = px + normal.nx * (tickLen + 14);
        const ly = py + normal.ny * (tickLen + 14);

        // Tick line
        g.appendChild(makeEl('line', {
          x1: px.toFixed(1), y1: py.toFixed(1),
          x2: tx.toFixed(1), y2: ty.toFixed(1),
          stroke: '#333', 'stroke-width': '1.2'
        }));

        // Percentage label
        const pct = Math.round(frac * 100);
        const lbl = g.appendChild(makeEl('text', {
          x: lx.toFixed(1),
          y: ly.toFixed(1),
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-size': '9',
          'font-family': 'Arial, sans-serif',
          fill: '#444',
          'pointer-events': 'none'
        }));
        lbl.textContent = pct;
      }
    }

    // 5. Gas name labels near vertices
    const vertexLabels = [
      { v: V.CH4,  text: 'CH₄',  dx: 0,   dy: -18 },
      { v: V.C2H4, text: 'C₂H₄', dx: 18,  dy: 6 },
      { v: V.C2H2, text: 'C₂H₂', dx: -18, dy: 6 }
    ];
    for (const vl of vertexLabels) {
      const lbl = g.appendChild(makeEl('text', {
        x: (vl.v.x + vl.dx).toFixed(1),
        y: (vl.v.y + vl.dy).toFixed(1),
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-size': '13',
        'font-weight': 'bold',
        'font-family': 'Arial, sans-serif',
        fill: '#111',
        'pointer-events': 'none'
      }));
      lbl.textContent = vl.text;
    }

    // 6. Edge gas labels (which gas is 0% along each edge)
    const edgeLabels = [
      { // CH4-C2H4 edge: C2H2 = 0%
        x: 430, y: 230,
        text: 'C₂H₂ = 0%',
        rotation: 0
      },
      { // C2H4-C2H2 edge: CH4 = 0%
        x: 300, y: 470,
        text: 'CH₄ = 0%',
        rotation: 0
      },
      { // C2H2-CH4 edge: C2H4 = 0%
        x: 165, y: 230,
        text: 'C₂H₄ = 0%',
        rotation: 0
      }
    ];
    for (const el of edgeLabels) {
      const lbl = g.appendChild(makeEl('text', {
        x: el.x.toFixed(1),
        y: el.y.toFixed(1),
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-size': '10',
        'font-style': 'italic',
        'font-family': 'Arial, sans-serif',
        fill: '#555',
        'pointer-events': 'none'
      }));
      lbl.textContent = el.text;
    }

    // 7. Sample point (if provided)
    if (sample) {
      const total = sample.ch4 + sample.c2h4 + sample.c2h2;
      if (total > 0) {
        const a = (sample.ch4 / total) * 100;
        const b = (sample.c2h4 / total) * 100;
        const c = (sample.c2h2 / total) * 100;
        const pt = toCartesian(a, b, c);

        // White halo
        g.appendChild(makeEl('circle', {
          cx: pt.x.toFixed(2),
          cy: pt.y.toFixed(2),
          r: '7',
          fill: 'white',
          stroke: 'white',
          'stroke-width': '3'
        }));

        // Blue dot
        g.appendChild(makeEl('circle', {
          cx: pt.x.toFixed(2),
          cy: pt.y.toFixed(2),
          r: '5',
          fill: '#1565C0',
          stroke: '#0D47A1',
          'stroke-width': '1.5'
        }));

        // Crosshair
        const hs = 8;
        g.appendChild(makeEl('line', {
          x1: (pt.x - hs).toFixed(2), y1: pt.y.toFixed(2),
          x2: (pt.x + hs).toFixed(2), y2: pt.y.toFixed(2),
          stroke: '#0D47A1', 'stroke-width': '1.5'
        }));
        g.appendChild(makeEl('line', {
          x1: pt.x.toFixed(2), y1: (pt.y - hs).toFixed(2),
          x2: pt.x.toFixed(2), y2: (pt.y + hs).toFixed(2),
          stroke: '#0D47A1', 'stroke-width': '1.5'
        }));

        // Zone callout
        const zone = classify(sample.ch4, sample.c2h4, sample.c2h2);
        if (zone) {
          const callout = g.appendChild(makeEl('text', {
            x: (pt.x + 14).toFixed(1),
            y: (pt.y - 14).toFixed(1),
            'text-anchor': 'start',
            'dominant-baseline': 'baseline',
            'font-size': '11',
            'font-weight': 'bold',
            'font-family': 'Arial, sans-serif',
            fill: '#1565C0',
            'pointer-events': 'none'
          }));
          callout.textContent = zone;
        }
      }
    }
  }

  // ---- Public API ----
  return {
    classify: classify,
    render: render
  };
})();
