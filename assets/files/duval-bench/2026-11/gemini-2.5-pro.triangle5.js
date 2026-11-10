const DuvalTriangle5 = {
  /**
   * Classifies a gas sample into a Duval Triangle 5 fault zone.
   * @param {number} ch4 - Concentration of Methane (CH₄) in ppm.
   * @param {number} c2h4 - Concentration of Ethylene (C₂H₄) in ppm.
   * @param {number} c2h6 - Concentration of Ethane (C₂H₆) in ppm.
   * @returns {string} The fault zone code ('PD', 'S', 'O', 'T1', 'T2').
   */
  classify(ch4, c2h4, c2h6) {
    const total = ch4 + c2h4 + c2h6;
    if (total === 0) {
      // Not strictly required by the prompt, but good practice.
      return 'ND'; // Not determinable
    }

    const p_ch4 = (ch4 / total) * 100;
    const p_c2h4 = (c2h4 / total) * 100;
    const p_c2h6 = (c2h6 / total) * 100;

    if (p_ch4 >= 98) return 'PD';
    if (p_c2h6 >= 75) return 'S';
    if (p_c2h4 < 4) return 'O';
    if (p_c2h4 < 20) return 'T1';
    return 'T2';
  },

  /**
   * Renders the Duval Triangle 5 into a given SVG element.
   * @param {SVGElement} svg - An empty <svg> element to draw into.
   * @param {object|null} sample - An optional sample object {ch4, c2h4, c2h6} to plot.
   */
  render(svg, sample) {
    const NS = 'http://www.w3.org/2000/svg';
    svg.innerHTML = ''; // Clear previous content

    // --- Geometry and Mapping ---
    const P_CH4 = { x: 50, y: 483 };
    const P_C2H6 = { x: 550, y: 483 };
    const P_C2H4 = { x: 300, y: 50 };

    const mapToCartesian = (p_ch4, p_c2h4, p_c2h6) => {
      const x = (p_ch4 / 100) * P_CH4.x + (p_c2h6 / 100) * P_C2H6.x + (p_c2h4 / 100) * P_C2H4.x;
      const y = (p_ch4 / 100) * P_CH4.y + (p_c2h6 / 100) * P_C2H6.y + (p_c2h4 / 100) * P_C2H4.y;
      return { x, y };
    };

    // --- SVG Element Creation Helpers ---
    const createElement = (name, attributes) => {
      const el = document.createElementNS(NS, name);
      for (const key in attributes) {
        el.setAttribute(key, attributes[key]);
      }
      return el;
    };

    const createGasText = (text, attrs) => {
        const textEl = createElement('text', attrs);
        const parts = text.match(/[a-zA-Z]+|[0-9]+/g) || [];
        parts.forEach(part => {
            const tspan = createElement('tspan', {});
            if (/\d+/.test(part)) {
                tspan.setAttribute('baseline-shift', 'sub');
                tspan.setAttribute('font-size', '0.8em');
            }
            tspan.textContent = part;
            textEl.appendChild(tspan);
        });
        return textEl;
    };


    // --- Data Definitions ---
    const zones = [
      { name: 'PD', color: '#a0d2f0', points: [[100, 0, 0], [98, 2, 0], [98, 0, 2]] },
      { name: 'S',  color: '#a0e0a0', points: [[0, 0, 100], [25, 0, 75], [0, 25, 75]] },
      { name: 'O',  color: '#ffffa0', points: [[98, 0, 2], [25, 0, 75], [21, 4, 75], [96, 4, 0]] },
      { name: 'T1', color: '#ffc080', points: [[96, 4, 0], [21, 4, 75], [5, 20, 75], [80, 20, 0]] },
      { name: 'T2', color: '#ff9090', points: [[80, 20, 0], [5, 20, 75], [0, 25, 75], [0, 100, 0]] }
    ];
    
    // --- Drawing ---

    // 1. Grid Lines
    const gridGroup = createElement('g', { stroke: '#e0e0e0', 'stroke-width': 0.75 });
    svg.appendChild(gridGroup);
    for (let i = 10; i < 100; i += 10) {
      let p1, p2;
      // C2H4 const lines
      p1 = mapToCartesian(100 - i, i, 0); p2 = mapToCartesian(0, i, 100 - i);
      gridGroup.appendChild(createElement('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }));
      // C2H6 const lines
      p1 = mapToCartesian(100 - i, 0, i); p2 = mapToCartesian(0, 100 - i, i);
      gridGroup.appendChild(createElement('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }));
      // CH4 const lines
      p1 = mapToCartesian(i, 100 - i, 0); p2 = mapToCartesian(i, 0, 100 - i);
      gridGroup.appendChild(createElement('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }));
    }

    // 2. Zone Polygons
    const zoneGroup = createElement('g', { stroke: '#666', 'stroke-width': 1 });
    svg.appendChild(zoneGroup);
    zones.forEach(zone => {
      const pointsStr = zone.points.map(p => mapToCartesian(...p)).map(p => `${p.x},${p.y}`).join(' ');
      zoneGroup.appendChild(createElement('polygon', { points: pointsStr, fill: zone.color }));
    });

    // 3. Main Triangle Outline
    const outlinePoints = [P_CH4, P_C2H6, P_C2H4].map(p => `${p.x},${p.y}`).join(' ');
    svg.appendChild(createElement('polygon', {
      points: outlinePoints, fill: 'none', stroke: 'black', 'stroke-width': 2
    }));

    // 4. Labels (Zones, Axes, Ticks)
    const labelGroup = createElement('g', { 'font-family': 'sans-serif', fill: '#333' });
    svg.appendChild(labelGroup);
    
    zones.forEach(zone => {
      const cartesianPoints = zone.points.map(p => mapToCartesian(...p));
      const cx = cartesianPoints.reduce((sum, p) => sum + p.x, 0) / cartesianPoints.length;
      const cy = cartesianPoints.reduce((sum, p) => sum + p.y, 0) / cartesianPoints.length;
      const label = createElement('text', {
        x: cx, y: cy, 'font-size': '16px', 'font-weight': 'bold',
        'text-anchor': 'middle', 'dominant-baseline': 'middle'
      });
      label.textContent = zone.name;
      labelGroup.appendChild(label);
    });

    const axisLabelAttrs = { 'font-size': '20px', 'font-weight': 'bold', 'text-anchor': 'middle' };
    labelGroup.appendChild(createGasText('C2H4', { ...axisLabelAttrs, x: P_C2H4.x, y: P_C2H4.y - 20 }));
    labelGroup.appendChild(createGasText('CH4',  { ...axisLabelAttrs, x: P_CH4.x - 20, y: P_CH4.y + 15, 'text-anchor': 'end'}));
    labelGroup.appendChild(createGasText('C2H6', { ...axisLabelAttrs, x: P_C2H6.x + 20, y: P_C2H6.y + 15, 'text-anchor': 'start'}));

    const tickGroup = createElement('g', { 'font-size': '11px', stroke: 'black', 'stroke-width': 1 });
    labelGroup.appendChild(tickGroup);
    const tickLabelGroup = createElement('g', { 'font-size': '11px', 'text-anchor': 'middle' });
    labelGroup.appendChild(tickLabelGroup);

    for (let i = 10; i < 100; i += 10) {
      const tickLength = 6;
      let p, p_text;
      
      // %C2H6 Ticks (bottom)
      p = mapToCartesian(100 - i, 0, i);
      tickGroup.appendChild(createElement('line', { x1: p.x, y1: p.y, x2: p.x, y2: p.y + tickLength }));
      p_text = createElement('text', { x: p.x, y: p.y + 20 });
      p_text.textContent = i;
      tickLabelGroup.appendChild(p_text);
      
      // %C2H4 Ticks (left side)
      p = mapToCartesian(100 - i, i, 0);
      tickGroup.appendChild(createElement('line', { x1: p.x, y1: p.y, x2: p.x - tickLength*0.866, y2: p.y + tickLength*0.5 }));
      p_text = createElement('text', { x: p.x - 18, y: p.y + 6, 'text-anchor': 'middle' });
      p_text.textContent = i;
      tickLabelGroup.appendChild(p_text);

      // %CH4 Ticks (right side)
      p = mapToCartesian(i, 0, 100 - i);
      tickGroup.appendChild(createElement('line', { x1: p.x, y1: p.y, x2: p.x + tickLength*0.866, y2: p.y + tickLength*0.5 }));
      p_text = createElement('text', { x: p.x + 18, y: p.y + 6, 'text-anchor': 'middle' });
      p_text.textContent = i;
      tickLabelGroup.appendChild(p_text);
    }
    
    // Axis % labels
    const axisPercentLabelGroup = createElement('g', { 'font-size': '13px', 'font-style': 'italic', 'text-anchor': 'middle' });
    labelGroup.appendChild(axisPercentLabelGroup);
    axisPercentLabelGroup.appendChild(createGasText('% C2H6', { x: (P_CH4.x + P_C2H6.x)/2, y: P_CH4.y + 40 }));
    axisPercentLabelGroup.appendChild(createGasText('% C2H4', { transform: `translate(${P_CH4.x - 45}, ${ (P_CH4.y + P_C2H4.y)/2 }) rotate(-60)`}));
    axisPercentLabelGroup.appendChild(createGasText('% CH4', { transform: `translate(${P_C2H6.x + 45}, ${ (P_C2H6.y + P_C2H4.y)/2 }) rotate(60)`}));


    // 5. Sample Point
    if (sample && typeof sample === 'object') {
      const total = sample.ch4 + sample.c2h4 + sample.c2h6;
      if (total > 0) {
        const p_ch4 = (sample.ch4 / total) * 100;
        const p_c2h4 = (sample.c2h4 / total) * 100;
        const p_c2h6 = (sample.c2h6 / total) * 100;
        const p = mapToCartesian(p_ch4, p_c2h4, p_c2h6);

        svg.appendChild(createElement('circle', {
          cx: p.x, cy: p.y, r: 6,
          fill: 'white', stroke: 'black', 'stroke-width': 2.5
        }));
      }
    }
  }
};
