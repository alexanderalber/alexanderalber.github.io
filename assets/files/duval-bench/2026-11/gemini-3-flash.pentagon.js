const DuvalPentagon = {
  // Vertices of the regular pentagon (Radius = 100)
  // V0: H2 (Top), V1: C2H6 (Upper Left), V2: CH4 (Lower Left), V3: C2H4 (Lower Right), V4: C2H2 (Upper Right)
  // Angles in degrees: 90, 162, 234, 306, 18
  vertices: [
    { name: 'H2', x: 0, y: 100 },
    { name: 'C2H6', x: -95.11, y: 30.9 },
    { name: 'CH4', x: -58.78, y: -80.9 },
    { name: 'C2H4', x: 58.78, y: -80.9 },
    { name: 'C2H2', x: 95.11, y: 30.9 }
  ],

  // Defined fault zones as polygons in the pentagon coordinate system
  zones: [
    { id: 'PD', label: 'PD', fill: '#d1d1d1', points: [[0, 100], [-7, 85], [7, 85]] },
    { id: 'S', label: 'S', fill: '#ffffff', points: [[0, 0], [-7, 85], [-95.11, 30.9], [-45, 25]] },
    { id: 'T1', label: 'T1', fill: '#fff5b1', points: [[0, 0], [-45, 25], [-95.11, 30.9], [-58.78, -80.9], [-25, -45]] },
    { id: 'T2', label: 'T2', fill: '#ffe066', points: [[0, 0], [-25, -45], [-58.78, -80.9], [0, -80.9], [0, -35]] },
    { id: 'T3', label: 'T3', fill: '#ffcc00', points: [[0, 0], [0, -35], [0, -80.9], [58.78, -80.9], [25, -45]] },
    { id: 'D2', label: 'D2', fill: '#f28b82', points: [[0, 0], [25, -45], [58.78, -80.9], [95.11, 30.9], [45, 25]] },
    { id: 'D1', label: 'D1', fill: '#d93025', points: [[0, 0], [45, 25], [95.11, 30.9], [7, 85]] }
  ],

  _calculatePoint(h2, ch4, c2h6, c2h4, c2h2) {
    const sum = h2 + ch4 + c2h6 + c2h4 + c2h2;
    if (sum === 0) return { x: 0, y: 0 };
    
    // Mapping inputs to their respective vertex coordinates
    // Order: h2 -> V0, c2h6 -> V1, ch4 -> V2, c2h4 -> V3, c2h2 -> V4
    const x = (h2 * this.vertices[0].x + c2h6 * this.vertices[1].x + ch4 * this.vertices[2].x + c2h4 * this.vertices[3].x + c2h2 * this.vertices[4].x) / sum;
    const y = (h2 * this.vertices[0].y + c2h6 * this.vertices[1].y + ch4 * this.vertices[2].y + c2h4 * this.vertices[3].y + c2h2 * this.vertices[4].y) / sum;
    return { x, y };
  },

  _isInside(x, y, vs) {
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      const xi = vs[i][0], yi = vs[i][1];
      const xj = vs[j][0], yj = vs[j][1];
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  },

  classify(h2, ch4, c2h6, c2h4, c2h2) {
    const pt = this._calculatePoint(h2, ch4, c2h6, c2h4, c2h2);
    for (const zone of this.zones) {
      if (this._isInside(pt.x, pt.y, zone.points)) return zone.id;
    }
    return "Unknown";
  },

  render(svg, sample) {
    const NS = "http://www.w3.org/2000/svg";
    svg.setAttribute("viewBox", "0 0 600 600");
    svg.innerHTML = ""; // Clear existing content

    const centerX = 300, centerY = 300, scale = 2.4;
    const toSVG = (x, y) => ({ x: centerX + x * scale, y: centerY - y * scale });

    // Draw Zone Polygons
    this.zones.forEach(zone => {
      const poly = document.createElementNS(NS, "polygon");
      const pointsString = zone.points.map(p => {
        const s = toSVG(p[0], p[1]);
        return `${s.x},${s.y}`;
      }).join(" ");
      poly.setAttribute("points", pointsString);
      poly.setAttribute("fill", zone.fill);
      poly.setAttribute("stroke", "#333");
      poly.setAttribute("stroke-width", "1");
      svg.appendChild(poly);

      // Add Zone Labels
      const cx = zone.points.reduce((a, b) => a + b[0], 0) / zone.points.length;
      const cy = zone.points.reduce((a, b) => a + b[1], 0) / zone.points.length;
      const labelPos = toSVG(cx, cy);
      const text = document.createElementNS(NS, "text");
      text.setAttribute("x", labelPos.x);
      text.setAttribute("y", labelPos.y);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "middle");
      text.setAttribute("font-size", "14px");
      text.setAttribute("font-weight", "bold");
      text.setAttribute("fill", "#000");
      text.textContent = zone.label;
      svg.appendChild(text);
    });

    // Draw Axes and Gas Labels
    this.vertices.forEach(v => {
      const vPos = toSVG(v.x, v.y);
      const line = document.createElementNS(NS, "line");
      line.setAttribute("x1", centerX);
      line.setAttribute("y1", centerY);
      line.setAttribute("x2", vPos.x);
      line.setAttribute("y2", vPos.y);
      line.setAttribute("stroke", "#999");
      line.setAttribute("stroke-dasharray", "4");
      svg.appendChild(line);

      const label = document.createElementNS(NS, "text");
      const offset = 1.15;
      const lPos = toSVG(v.x * offset, v.y * offset);
      label.setAttribute("x", lPos.x);
      label.setAttribute("y", lPos.y);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("dominant-baseline", "middle");
      label.setAttribute("font-family", "sans-serif");
      label.setAttribute("font-weight", "bold");
      label.textContent = v.name;
      svg.appendChild(label);
    });

    // Mark Sample Point
    if (sample) {
      const pt = this._calculatePoint(sample.h2, sample.ch4, sample.c2h6, sample.c2h4, sample.c2h2);
      const sPos = toSVG(pt.x, pt.y);
      const dot = document.createElementNS(NS, "circle");
      dot.setAttribute("cx", sPos.x);
      dot.setAttribute("cy", sPos.y);
      dot.setAttribute("r", "6");
      dot.setAttribute("fill", "#000");
      dot.setAttribute("stroke", "#fff");
      dot.setAttribute("stroke-width", "2");
      svg.appendChild(dot);
    }
  }
};
