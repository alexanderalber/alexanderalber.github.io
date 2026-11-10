const DuvalTriangle = {
  /**
   * Classifies a DGA sample using Duval Triangle 1.
   * @param {number} ch4 - Methane concentration in ppm.
   * @param {number} c2h4 - Ethylene concentration in ppm.
   * @param {number} c2h2 - Acetylene concentration in ppm.
   * @returns {string} The short code for the fault zone (e.g., "PD", "T1", "D2").
   */
  classify(ch4, c2h4, c2h2) {
    const total = ch4 + c2h4 + c2h2;

    const pCH4 = (ch4 / total) * 100;
    const pC2H4 = (c2h4 / total) * 100;
    const pC2H2 = (c2h2 / total) * 100;

    // Based on my best recollection of the zone boundaries for Duval Triangle 1.
    if (pCH4 >= 98) {
      return "PD";
    }
    if (pC2H2 >= 29) {
      return "D2";
    }
    if (pC2H2 >= 13) {
      return "D1";
    }
    if (pC2H2 >= 4) {
      return "DT";
    }
    // Now in the T-zones (pC2H2 < 4)
    if (pC2H4 < 20) {
      return "T1";
    }
    if (pC2H4 < 50) {
      return "T2";
    }
    return "T3";
  },

  /**
   * Renders the Duval Triangle 1 diagram into an SVG element.
   * @param {SVGSVGElement} svg - An empty <svg> element with viewBox="0 0 600 540".
   * @param {object|null} sample - A sample to plot, e.g., {ch4: 10, c2h4: 20, c2h2: 5}, or null.
   */
  render(svg, sample) {
    const NS = 'http://www.w3.org/2000/svg';

    // --- Helper Functions ---

    function createEl(name, attributes) {
      const el = document.createElementNS(NS, name);
      for (const key in attributes) {
        el.setAttribute(key, attributes[key]);
      }
      return el;
    }
    
    function createText(content, attrs) {
      const text = createEl('text', attrs);
      text.appendChild(document.createTextNode(content));
      return text;
    }

    // --- Geometry and Coordinate Transformation ---
    
    const margin = { top: 45, right: 50, bottom: 65, left: 50 };
    const width = 600 - margin.left - margin.right; // 500
    const height = 540 - margin.top - margin.bottom; // 430, let's use sqrt(3)/2 * width
    const triangleHeight = width * Math.sqrt(3) / 2; // ~433

    const vCH4 = { x: margin.left, y: margin.top + triangleHeight }; // bottom-left
    const vC2H4 = { x: margin.left + width, y: margin.top + triangleHeight }; // bottom-right
    const vC2H2 = { x: margin.left + width / 2, y: margin.top }; // top

    function getXY(pC2H4, pC2H2) {
      const pcC2H4 = pC2H4 / 100;
      const pcC2H2 = pC2H2 / 100;
      const x = vCH4.x * (1 - pcC2H4 - pcC2H2) + vC2H4.x * pcC2H4 + vC2H2.x * pcC2H2;
      const y = vCH4.y * (1 - pcC2H4 - pcC2H2) + vC2H4.y * pcC2H4 + vC2H2.y * pcC2H2;
      return { x, y };
    }

    // --- Definitions for Zones, Labels, and Ticks ---

    const zones = {
      PD: { color: '#b0e0e6', points: [{pC2H4: 0, pC2H2: 0}, {pC2H4: 2, pC2H2: 0}, {pC2H4: 0, pC2H2: 2}] },
      T1: { color: '#ffff99', points: [{pC2H4: 2, pC2H2: 0}, {pC2H4: 20, pC2H2: 0}, {pC2H4: 20, pC2H2: 4}, {pC2H4: 0, pC2H2: 4}, {pC2H4: 0, pC2H2: 2}] },
      T2: { color: '#ffd700', points: [{pC2H4: 20, pC2H2: 0}, {pC2H4: 50, pC2H2: 0}, {pC2H4: 50, pC2H2: 4}, {pC2H4: 20, pC2H2: 4}] },
      T3: { color: '#ff8c00', points: [{pC2H4: 50, pC2H2: 0}, {pC2H4: 100, pC2H2: 0}, {pC2H4: 96, pC2H2: 4}, {pC2H4: 50, pC2H2: 4}] },
      DT: { color: '#d2b48c', points: [{pC2H4: 0, pC2H2: 4}, {pC2H4: 96, pC2H2: 4}, {pC2H4: 87, pC2H2: 13}, {pC2H4: 0, pC2H2: 13}] },
      D1: { color: '#f08080', points: [{pC2H4: 0, pC2H2: 13}, {pC2H4: 87, pC2H2: 13}, {pC2H4: 71, pC2H2: 29}, {pC2H4: 0, pC2H2: 29}] },
      D2: { color: '#ff0000', points: [{pC2H4: 0, pC2H2: 29}, {pC2H4: 71, pC2H2: 29}, {pC2H4: 0, pC2H2: 100}] }
    };
    
    const zoneLabels = {
      PD: { pC2H4: 0.5, pC2H2: 0.5 },
      T1: { pC2H4: 10, pC2H2: 1.5 },
      T2: { pC2H4: 35, pC2H2: 1.5 },
      T3: { pC2H4: 70, pC2H2: 1.5 },
      DT: { pC2H4: 45, pC2H2: 8 },
      D1: { pC2H4: 40, pC2H2: 20 },
      D2: { pC2H4: 25, pC2H2: 50 }
    };

    // --- Drawing ---

    // 1. Draw zone polygons
    for (const id in zones) {
      const zone = zones[id];
      const polyPoints = zone.points.map(p => {
        const { x, y } = getXY(p.pC2H4, p.pC2H2);
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      }).join(' ');
      
      const poly = createEl('polygon', {
        points: polyPoints,
        fill: zone.color,
        stroke: '#555',
        'stroke-width': '0.5'
      });
      svg.appendChild(poly);
    }
    
    // 2. Draw main triangle outline
    const outline = createEl('polygon', {
        points: `${vCH4.x},${vCH4.y} ${vC2H4.x},${vC2H4.y} ${vC2H2.x},${vC2H2.y}`,
        fill: 'none',
        stroke: 'black',
        'stroke-width': '1.5'
    });
    svg.appendChild(outline);

    // 3. Draw axes, ticks and labels
    const textStyle = { 'font-family': 'sans-serif', 'font-size': '14px', 'text-anchor': 'middle', 'dominant-baseline': 'middle' };
    
    // C2H2 Axis (left)
    for (let p = 10; p <= 90; p += 10) {
      const p1 = getXY(0, p);
      const p2 = getXY(-2, p);
      svg.appendChild(createEl('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, stroke: 'black', 'stroke-width': '1'}));
      const pLabel = getXY(-5, p);
      svg.appendChild(createText(p, { ...textStyle, x: pLabel.x, y: pLabel.y, 'text-anchor': 'end' }));
    }
    
    // C2H4 Axis (bottom)
    for (let p = 10; p <= 90; p += 10) {
      const p1 = getXY(p, 0);
      const p2 = { x: p1.x, y: p1.y + 10 };
      svg.appendChild(createEl('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, stroke: 'black', 'stroke-width': '1'}));
      svg.appendChild(createText(p, { ...textStyle, x: p2.x, y: p2.y + 10 }));
    }
    
    // CH4 Axis (right)
    for (let p = 10; p <= 90; p += 10) {
      const pCH4 = p;
      const pC2H4 = 100 - pCH4;
      const p1 = getXY(pC2H4, 0); // on the C2H4 axis
      const p2 = getXY(100 - p, p); // diagonal point
      const p3 = getXY(100,0);
      const dx = p3.x-vC2H2.x; // vector along the axis
      const dy = p3.y-vC2H2.y;
      const len = Math.sqrt(dx*dx+dy*dy);
      const pTick = getXY(pC2H4, 0);
      pTick.x += 10 * (dy/len);
      pTick.y -= 10 * (dx/len);
      
      svg.appendChild(createEl('line', { x1: p1.x, y1: p1.y, x2: pTick.x, y2: pTick.y, stroke: 'black', 'stroke-width': '1'}));
      svg.appendChild(createText(p, { ...textStyle, x: pTick.x + 10*(dy/len), y: pTick.y - 10*(dx/len) + 5, 'text-anchor': 'start' }));
    }

    // 4. Draw gas name labels
    const gasLabelStyle = { ...textStyle, 'font-size': '18px', 'font-weight': 'bold' };
    svg.appendChild(createText('%CH₄', { ...gasLabelStyle, x: vCH4.x - 10, y: vCH4.y + 20, 'text-anchor': 'end' }));
    svg.appendChild(createText('%C₂H₄', { ...gasLabelStyle, x: vC2H4.x + 10, y: vC2H4.y + 20, 'text-anchor': 'start' }));
    svg.appendChild(createText('%C₂H₂', { ...gasLabelStyle, x: vC2H2.x, y: vC2H2.y - 20 }));
    
    // 5. Draw zone labels
    const zoneLabelStyle = { ...textStyle, 'font-size': '18px', 'font-weight': 'bold', 'pointer-events': 'none' };
    for (const id in zoneLabels) {
        const { x, y } = getXY(zoneLabels[id].pC2H4, zoneLabels[id].pC2H2);
        svg.appendChild(createText(id, { ...zoneLabelStyle, x: x, y: y }));
    }

    // 6. Plot the sample point, if provided
    if (sample && typeof sample === 'object' && 'ch4' in sample) {
      const total = sample.ch4 + sample.c2h4 + sample.c2h2;
      if (total > 0) {
        const pC2H4 = (sample.c2h4 / total) * 100;
        const pC2H2 = (sample.c2h2 / total) * 100;
        const { x, y } = getXY(pC2H4, pC2H2);

        const point = createEl('circle', {
          cx: x,
          cy: y,
          r: 6,
          fill: 'black',
          stroke: 'white',
          'stroke-width': '2'
        });
        svg.appendChild(point);
      }
    }
  }
};
