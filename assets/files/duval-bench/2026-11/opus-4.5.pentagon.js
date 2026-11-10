const DuvalPentagon = {
  _cx: 300,
  _cy: 300,
  _r: 230,

  _getVertices() {
    const { _cx: cx, _cy: cy, _r: r } = this;
    const verts = [];
    for (let i = 0; i < 5; i++) {
      const angle = -Math.PI / 2 + i * 2 * Math.PI / 5;
      verts.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
    }
    return verts;
  },

  _gasToPoint(h2, ch4, c2h6, c2h4, c2h2) {
    const total = h2 + ch4 + c2h6 + c2h4 + c2h2;
    if (total === 0) return [this._cx, this._cy];
    const pcts = [h2 / total, c2h6 / total, ch4 / total, c2h4 / total, c2h2 / total];
    const v = this._getVertices();
    let x = 0, y = 0;
    for (let i = 0; i < 5; i++) {
      x += pcts[i] * v[i][0];
      y += pcts[i] * v[i][1];
    }
    return [x, y];
  },

  _lerp(p1, p2, t) {
    return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
  },

  _getZones() {
    const v = this._getVertices();
    const c = [this._cx, this._cy];
    const lerp = this._lerp;

    const p01_30 = lerp(v[0], v[1], 0.30);
    const p01_60 = lerp(v[0], v[1], 0.60);
    const p12_50 = lerp(v[1], v[2], 0.50);
    const p23_35 = lerp(v[2], v[3], 0.35);
    const p23_65 = lerp(v[2], v[3], 0.65);
    const p34_40 = lerp(v[3], v[4], 0.40);
    const p34_70 = lerp(v[3], v[4], 0.70);
    const p40_35 = lerp(v[4], v[0], 0.35);
    const p40_70 = lerp(v[4], v[0], 0.70);

    const c1 = lerp(c, v[0], 0.40);
    const c2 = lerp(c, v[1], 0.35);
    const c3 = lerp(c, v[2], 0.30);
    const c4 = lerp(c, v[3], 0.35);
    const c5 = lerp(c, v[4], 0.40);

    const inner1 = lerp(c, lerp(v[0], v[4], 0.5), 0.55);
    const inner2 = lerp(c, lerp(v[0], v[1], 0.5), 0.50);
    const inner3 = lerp(c, lerp(v[3], v[4], 0.5), 0.45);

    return [
      {
        code: "PD",
        color: "#ffe4b5",
        polygon: [v[0], p01_30, inner2, c1, p40_70]
      },
      {
        code: "T1",
        color: "#98fb98",
        polygon: [p01_60, v[1], p12_50, c2, inner2, p01_30, lerp(v[0], v[1], 0.45)]
      },
      {
        code: "T2",
        color: "#90ee90",
        polygon: [p12_50, v[2], p23_35, c3, c2]
      },
      {
        code: "T3",
        color: "#32cd32",
        polygon: [p23_35, p23_65, c4, c3]
      },
      {
        code: "D1",
        color: "#87ceeb",
        polygon: [p34_40, v[4], p40_35, inner1, inner3]
      },
      {
        code: "D2",
        color: "#add8e6",
        polygon: [p40_35, p40_70, c1, inner2, c2, c3, c4, inner3, inner1]
      },
      {
        code: "T3",
        color: "#32cd32",
        polygon: [p23_65, v[3], p34_40, inner3, c4]
      }
    ];
  },

  _pointInPolygon(x, y, polygon) {
    let inside = false;
    const n = polygon.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  },

  classify(h2, ch4, c2h6, c2h4, c2h2) {
    const [x, y] = this._gasToPoint(h2, ch4, c2h6, c2h4, c2h2);
    const zones = this._getZones();
    for (const zone of zones) {
      if (this._pointInPolygon(x, y, zone.polygon)) {
        return zone.code;
      }
    }
    return "ND";
  },

  render(svg, sample) {
    const ns = "http://www.w3.org/2000/svg";
    const v = this._getVertices();
    const zones = this._getZones();
    const gasNames = ["H₂", "C₂H₆", "CH₄", "C₂H₄", "C₂H₂"];

    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const defs = document.createElementNS(ns, "defs");
    svg.appendChild(defs);

    for (const zone of zones) {
      const path = document.createElementNS(ns, "polygon");
      path.setAttribute("points", zone.polygon.map(p => p.join(",")).join(" "));
      path.setAttribute("fill", zone.color);
      path.setAttribute("stroke", "#333");
      path.setAttribute("stroke-width", "1");
      svg.appendChild(path);
    }

    const outline = document.createElementNS(ns, "polygon");
    outline.setAttribute("points", v.map(p => p.join(",")).join(" "));
    outline.setAttribute("fill", "none");
    outline.setAttribute("stroke", "#000");
    outline.setAttribute("stroke-width", "2");
    svg.appendChild(outline);

    for (let i = 0; i < 5; i++) {
      const line = document.createElementNS(ns, "line");
      line.setAttribute("x1", this._cx);
      line.setAttribute("y1", this._cy);
      line.setAttribute("x2", v[i][0]);
      line.setAttribute("y2", v[i][1]);
      line.setAttribute("stroke", "#666");
      line.setAttribute("stroke-width", "0.5");
      line.setAttribute("stroke-dasharray", "4,2");
      svg.appendChild(line);
    }

    const labelOffsets = [
      [0, -20],
      [20, -5],
      [15, 15],
      [-15, 15],
      [-20, -5]
    ];

    for (let i = 0; i < 5; i++) {
      const text = document.createElementNS(ns, "text");
      text.setAttribute("x", v[i][0] + labelOffsets[i][0]);
      text.setAttribute("y", v[i][1] + labelOffsets[i][1]);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("font-family", "Arial, sans-serif");
      text.setAttribute("font-size", "14");
      text.setAttribute("font-weight", "bold");
      text.setAttribute("fill", "#000");
      text.textContent = gasNames[i];
      svg.appendChild(text);
    }

    const zoneCentroids = {};
    for (const zone of zones) {
      if (!zoneCentroids[zone.code]) {
        let cx = 0, cy = 0;
        for (const p of zone.polygon) {
          cx += p[0];
          cy += p[1];
        }
        zoneCentroids[zone.code] = {
          x: cx / zone.polygon.length,
          y: cy / zone.polygon.length,
          code: zone.code
        };
      }
    }

    for (const code in zoneCentroids) {
      const centroid = zoneCentroids[code];
      const text = document.createElementNS(ns, "text");
      text.setAttribute("x", centroid.x);
      text.setAttribute("y", centroid.y);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "middle");
      text.setAttribute("font-family", "Arial, sans-serif");
      text.setAttribute("font-size", "16");
      text.setAttribute("font-weight", "bold");
      text.setAttribute("fill", "#333");
      text.textContent = code;
      svg.appendChild(text);
    }

    const title = document.createElementNS(ns, "text");
    title.setAttribute("x", 300);
    title.setAttribute("y", 30);
    title.setAttribute("text-anchor", "middle");
    title.setAttribute("font-family", "Arial, sans-serif");
    title.setAttribute("font-size", "18");
    title.setAttribute("font-weight", "bold");
    title.setAttribute("fill", "#000");
    title.textContent = "Duval Pentagon 1";
    svg.appendChild(title);

    if (sample) {
      const [px, py] = this._gasToPoint(sample.h2, sample.ch4, sample.c2h6, sample.c2h4, sample.c2h2);

      const marker = document.createElementNS(ns, "circle");
      marker.setAttribute("cx", px);
      marker.setAttribute("cy", py);
      marker.setAttribute("r", "8");
      marker.setAttribute("fill", "#ff0000");
      marker.setAttribute("stroke", "#fff");
      marker.setAttribute("stroke-width", "2");
      svg.appendChild(marker);

      const faultCode = this.classify(sample.h2, sample.ch4, sample.c2h6, sample.c2h4, sample.c2h2);
      const label = document.createElementNS(ns, "text");
      label.setAttribute("x", px);
      label.setAttribute("y", py - 15);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("font-family", "Arial, sans-serif");
      label.setAttribute("font-size", "12");
      label.setAttribute("font-weight", "bold");
      label.setAttribute("fill", "#ff0000");
      label.textContent = faultCode;
      svg.appendChild(label);
    }

    const legend = [
      { code: "PD", desc: "Partial Discharge", color: "#ffe4b5" },
      { code: "D1", desc: "Low Energy Discharge", color: "#87ceeb" },
      { code: "D2", desc: "High Energy Discharge", color: "#add8e6" },
      { code: "T1", desc: "Thermal < 300°C", color: "#98fb98" },
      { code: "T2", desc: "Thermal 300-700°C", color: "#90ee90" },
      { code: "T3", desc: "Thermal > 700°C", color: "#32cd32" }
    ];

    const legendY = 520;
    for (let i = 0; i < legend.length; i++) {
      const item = legend[i];
      const lx = 60 + (i % 3) * 180;
      const ly = legendY + Math.floor(i / 3) * 25;

      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", lx);
      rect.setAttribute("y", ly);
      rect.setAttribute("width", "15");
      rect.setAttribute("height", "15");
      rect.setAttribute("fill", item.color);
      rect.setAttribute("stroke", "#333");
      rect.setAttribute("stroke-width", "1");
      svg.appendChild(rect);

      const text = document.createElementNS(ns, "text");
      text.setAttribute("x", lx + 20);
      text.setAttribute("y", ly + 12);
      text.setAttribute("font-family", "Arial, sans-serif");
      text.setAttribute("font-size", "11");
      text.setAttribute("fill", "#000");
      text.textContent = item.code + ": " + item.desc;
      svg.appendChild(text);
    }
  }
};
