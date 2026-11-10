const DuvalTriangle5 = {
  // Classify a sample into Duval Triangle 5 zones using CH4, C2H4, C2H6 (ppm)
  // Zones used here (best recollection for Triangle 5 - low temperature faults):
  // S  = Stray gassing at very low ethylene and high methane share
  // T1 = Thermal fault <300C (low ethylene)
  // T2 = Thermal fault 300-700C (moderate ethylene)
  // T3 = Thermal fault >700C (high ethylene)
  classify(ch4, c2h4, c2h6) {
    const a = Math.max(0, Number(ch4) || 0);
    const b = Math.max(0, Number(c2h4) || 0);
    const c = Math.max(0, Number(c2h6) || 0);
    const sum = a + b + c;
    if (sum <= 0) throw new Error("Sum of CH4, C2H4, C2H6 must be > 0");
    const pCH4 = (a / sum) * 100;
    const pC2H4 = (b / sum) * 100;
    const pC2H6 = (c / sum) * 100;

    // Simple, consistent partition (commit to these boundaries):
    // - T3: C2H4 >= 50%
    // - T2: 20% <= C2H4 < 50%
    // - T1: 5%  <= C2H4 < 20%
    // - S : C2H4 <= 5% and CH4 >= 55%
    // - else (remaining very-low-ethylene area): T1
    if (pC2H4 >= 50) return "T3";
    if (pC2H4 >= 20) return "T2";
    if (pC2H4 <= 5 && pCH4 >= 55) return "S";
    return "T1";
  },

  // Render the Duval Triangle 5
  // svg: empty <svg> with viewBox="0 0 600 540"
  // sample: null or {ch4, c2h4, c2h6}
  render(svg, sample) {
    const NS = "http://www.w3.org/2000/svg";
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // Canvas and triangle geometry
    const width = 600, height = 540;
    const margin = { left: 40, right: 40, top: 20, bottom: 40 };
    const side = 520; // side length of triangle
    const h = Math.sqrt(3) / 2 * side;
    const x0 = margin.left;         // bottom-left x of triangle
    const y0 = height - margin.bottom; // bottom y of triangle

    // Helpers
    function el(name, attrs) {
      const e = document.createElementNS(NS, name);
      if (attrs) for (const k in attrs) e.setAttribute(k, String(attrs[k]));
      return e;
    }
    function baryToXY(pCH4, pC2H4, pC2H6) {
      // x = x0 + s*(C2H6 + 0.5*C2H4)/100
      // y = y0 - h*(C2H4)/100
      const x = x0 + side * (pC2H6 + 0.5 * pC2H4) / 100;
      const y = y0 - h * (pC2H4) / 100;
      return [x, y];
    }
    function pt(p) {
      const [x, y] = baryToXY(p[0], p[1], p[2]);
      return `${x},${y}`;
    }
    function polygon(points, style) {
      const poly = el("polygon", { points: points.map(pt).join(" ") });
      for (const k in style) poly.setAttribute(k, style[k]);
      return poly;
    }
    function line(p1, p2, style) {
      const [x1, y1] = baryToXY(p1[0], p1[1], p1[2]);
      const [x2, y2] = baryToXY(p2[0], p2[1], p2[2]);
      const ln = el("line", { x1, y1, x2, y2 });
      for (const k in style) ln.setAttribute(k, style[k]);
      return ln;
    }
    function textAtBary(p, str, style) {
      const [x, y] = baryToXY(p[0], p[1], p[2]);
      const t = el("text", { x, y });
      t.textContent = str;
      for (const k in style) t.setAttribute(k, style[k]);
      return t;
    }

    // Background
    svg.appendChild(el("rect", { x: 0, y: 0, width, height, fill: "#fff" }));

    // Triangle corners (in barycentric percentages)
    const CH4_CORNER = [100, 0, 0];  // left bottom
    const C2H6_CORNER = [0, 0, 100]; // right bottom
    const C2H4_CORNER = [0, 100, 0]; // top

    // Outline
    svg.appendChild(polygon([CH4_CORNER, C2H4_CORNER, C2H6_CORNER], {
      fill: "none",
      stroke: "#333",
      "stroke-width": "2"
    }));

    // Grid lines (10% steps) for each gas
    const gridGroup = el("g", { "stroke": "#bbb", "stroke-width": "1", "fill": "none" });
    svg.appendChild(gridGroup);

    // For C2H4 constant = t: line from (CH4=100-t,C2H4=t,C2H6=0) to (CH4=0,C2H4=t,C2H6=100-t)
    for (let t = 10; t <= 90; t += 10) {
      const L = [100 - t, t, 0];
      const R = [0, t, 100 - t];
      gridGroup.appendChild(line(L, R, { "stroke-dasharray": "3,3" }));
    }

    // For CH4 constant = t: line from (CH4=t,C2H4=100-t,C2H6=0) to (CH4=t,C2H4=0,C2H6=100-t)
    for (let t = 10; t <= 90; t += 10) {
      const A = [t, 100 - t, 0];
      const B = [t, 0, 100 - t];
      gridGroup.appendChild(line(A, B, { "stroke-dasharray": "3,3" }));
    }

    // For C2H6 constant = t: line from (CH4=100-t,C2H4=0,C2H6=t) to (CH4=0,C2H4=100-t,C2H6=t)
    for (let t = 10; t <= 90; t += 10) {
      const A = [100 - t, 0, t];
      const B = [0, 100 - t, t];
      gridGroup.appendChild(line(A, B, { "stroke-dasharray": "3,3" }));
    }

    // Zone boundaries in barycentric coordinates (commit to these for Triangle 5)
    // Lines at C2H4 = 5, 20, 50
    const L5  = [95, 5, 0];
    const R5  = [0, 5, 95];
    const L20 = [80, 20, 0];
    const R20 = [0, 20, 80];
    const L50 = [50, 50, 0];
    const R50 = [0, 50, 50];
    const LB  = [100, 0, 0];
    const RB  = [0, 0, 100];
    const TOP = [0, 100, 0];

    // Additional points for "S" wedge cutoff at CH4 = 55 within C2H4 <= 5
    const B = [55, 0, 45];
    const C = [55, 5, 40];

    // Zones as polygons (note T1 is split into two polygons)
    // T3: triangle apex above C2H4=50 line
    const T3_poly = [TOP, R50, L50];

    // T2: trapezoid between C2H4=20 and 50
    const T2_poly = [L50, R50, R20, L20];

    // T1 upper band between C2H4=5 and 20
    const T1_upper = [L20, R20, R5, L5];

    // T1 lower-right (below C2H4=5 and to the right of CH4=55 line)
    const T1_lower_right = [B, RB, R5, C];

    // S wedge (below C2H4=5 and with CH4>=55)
    const S_poly = [LB, L5, C, B];

    const zonesGroup = el("g");
    svg.appendChild(zonesGroup);

    function drawZone(polyPoints, fill, label, labelBary) {
      zonesGroup.appendChild(polygon(polyPoints, {
        fill: fill,
        stroke: "#444",
        "stroke-width": "1",
        "fill-opacity": "0.85"
      }));
      if (label && labelBary) {
        const t = textAtBary(labelBary, label, {
          "font-family": "sans-serif",
          "font-size": "22",
          "font-weight": "bold",
          "text-anchor": "middle",
          "dominant-baseline": "middle",
          "fill": "#000"
        });
        zonesGroup.appendChild(t);
      }
    }

    // Draw zones (order from back to front so borders are clean)
    drawZone(T3_poly, "#f79b9e", "T3", [12.5, 75, 12.5]);
    drawZone(T2_poly, "#f9c74f", "T2", [32.5, 35, 32.5]);
    drawZone(T1_upper, "#b6e3a1", null, null);
    drawZone(T1_lower_right, "#b6e3a1", null, null);
    // T1 label roughly central to the band
    zonesGroup.appendChild(textAtBary([43.75, 12.5, 43.75], "T1", {
      "font-family": "sans-serif",
      "font-size": "22",
      "font-weight": "bold",
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      "fill": "#000"
    }));
    drawZone(S_poly, "#fff3b0", "S", [80, 2, 18]);

    // Draw boundary lines for C2H4=5,20,50 subtly
    const boundsGroup = el("g", { "stroke": "#666", "stroke-width": "1.2", "fill": "none" });
    svg.appendChild(boundsGroup);
    boundsGroup.appendChild(line(L5, R5, {}));
    boundsGroup.appendChild(line(L20, R20, {}));
    boundsGroup.appendChild(line(L50, R50, {}));

    // Axis labels
    const axisGroup = el("g");
    svg.appendChild(axisGroup);

    // Gas names near corners
    const [xCH4, yCH4] = baryToXY(...CH4_CORNER);
    const [xC2H6, yC2H6] = baryToXY(...C2H6_CORNER);
    const [xC2H4, yC2H4] = baryToXY(...C2H4_CORNER);

    const labelStyleCorner = {
      "font-family": "sans-serif",
      "font-size": "16",
      "font-weight": "bold",
      "fill": "#000"
    };
    const tCH4 = el("text", Object.assign({ x: xCH4 - 10, y: yCH4 + 24, "text-anchor": "end" }, labelStyleCorner));
    tCH4.textContent = "CH4";
    axisGroup.appendChild(tCH4);

    const tC2H6 = el("text", Object.assign({ x: xC2H6 + 10, y: yC2H6 + 24, "text-anchor": "start" }, labelStyleCorner));
    tC2H6.textContent = "C2H6";
    axisGroup.appendChild(tC2H6);

    const tC2H4 = el("text", Object.assign({ x: xC2H4, y: yC2H4 - 10, "text-anchor": "middle" }, labelStyleCorner));
    tC2H4.textContent = "C2H4";
    axisGroup.appendChild(tC2H4);

    // Tick labels for each axis (every 10%)
    const tickStyle = {
      "font-family": "sans-serif",
      "font-size": "10",
      "fill": "#555"
    };

    // C2H4 ticks: label near left ends of the C2H4 grid lines
    for (let t = 10; t <= 90; t += 10) {
      const L = [100 - t, t, 0];
      const [x, y] = baryToXY(...L);
      const tx = el("text", Object.assign({ x: x - 8, y: y + 3, "text-anchor": "end" }, tickStyle));
      tx.textContent = t;
      axisGroup.appendChild(tx);
    }

    // CH4 ticks: label near base along CH4 constant lines at the base endpoints (B points)
    for (let t = 10; t <= 90; t += 10) {
      const Bp = [t, 0, 100 - t]; // on base
      const [x, y] = baryToXY(...Bp);
      const tx = el("text", Object.assign({ x, y: y + 12, "text-anchor": "middle" }, tickStyle));
      tx.textContent = t;
      axisGroup.appendChild(tx);
    }

    // C2H6 ticks: label near right side along the C2H6 constant lines at that right edge
    for (let t = 10; t <= 90; t += 10) {
      const Rp = [0, 100 - t, t]; // on right slanted edge
      const [x, y] = baryToXY(...Rp);
      const tx = el("text", Object.assign({ x: x + 8, y: y + 3, "text-anchor": "start" }, tickStyle));
      tx.textContent = t;
      axisGroup.appendChild(tx);
    }

    // Sample point marker
    if (sample && (sample.ch4 + sample.c2h4 + sample.c2h6) > 0) {
      const a = Math.max(0, Number(sample.ch4) || 0);
      const b = Math.max(0, Number(sample.c2h4) || 0);
      const c = Math.max(0, Number(sample.c2h6) || 0);
      const sum = a + b + c;
      const pCH4 = (a / sum) * 100;
      const pC2H4 = (b / sum) * 100;
      const pC2H6 = (c / sum) * 100;
      const [sx, sy] = baryToXY(pCH4, pC2H4, pC2H6);

      const zone = this.classify(a, b, c);

      const marker = el("circle", {
        cx: sx, cy: sy, r: 6,
        fill: "#d00",
        stroke: "#fff",
        "stroke-width": "2"
      });
      svg.appendChild(marker);

      const label = el("text", {
        x: sx + 10, y: sy - 10,
        "font-family": "sans-serif",
        "font-size": "12",
        "font-weight": "bold",
        "fill": "#000"
      });
      label.textContent = zone;
      svg.appendChild(label);
    }
  }
};
