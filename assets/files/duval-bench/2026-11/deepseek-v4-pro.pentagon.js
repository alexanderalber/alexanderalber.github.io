const DuvalPentagon = (function() {
  // Pentagram geometry: 5 gases placed on a regular pentagon
  // Center (300,300), radius 250, viewBox 0 0 600 600
  const cx = 300, cy = 300, R = 250;
  // Angles from positive x-axis (math coords, y up), but SVG y down so adjust
  const angle = [90, 18, -54, -126, -198].map(a => a * Math.PI / 180);
  const names = ["H2", "C2H2", "C2H4", "C2H6", "CH4"];
  const toXY = (a, r) => ({ x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) });
  const V = angle.map(a => toXY(a, R));
  // ND pentagon (scale 0.32 from center) vertices on axes
  const NdR = R * 0.32;
  const N = angle.map(a => toXY(a, NdR));

  // Build polygons for each zone (hardcoded vertices)
  // PD: small triangle at H2
  function mixEdge(p1, p2, w1, w2) {
    return { x: (p1.x * w1 + p2.x * w2) / (w1 + w2), y: (p1.y * w1 + p2.y * w2) / (w1 + w2) };
  }
  const P04 = mixEdge(V[0], V[4], 98, 2); // 98% H2, 2% CH4
  const P01 = mixEdge(V[0], V[1], 98, 2); // 98% H2, 2% C2H2

  const pdPoly = [V[0], P04, P01];

  // D1: small triangle at C2H2
  const D1_A = mixEdge(V[1], V[0], 70, 30); // 70% C2H2, 30% H2
  const D1_B = mixEdge(V[1], V[2], 70, 30); // 70% C2H2, 30% C2H4
  const d1Poly = [V[1], D1_A, D1_B];

  // D2: quadrilateral between PD/D1 and ND
  const d2Poly = [P01, D1_A, D1_B, N[1], N[0]];

  // T3: near C2H4
  const T3_a = mixEdge(V[1], V[2], 20, 80); // 20% C2H2, 80% C2H4
  const T3_b = mixEdge(V[2], V[3], 50, 50); // mid of C2H4-C2H6 edge
  const t3Poly = [D1_B, T3_a, V[2], T3_b, N[2], N[1]];

  // T2: near C2H6
  const T2_a = mixEdge(V[3], V[4], 70, 30); // 70% C2H6, 30% CH4
  const t2Poly = [T3_b, V[3], T2_a, N[3], N[2]];

  // T1: near CH4
  const t1Poly = [T2_a, V[4], P04, N[4], N[3]];

  // ND: central pentagon
  const ndPoly = [N[0], N[1], N[2], N[3], N[4]];

  // Zone map
  const zones = [
    { code: "PD", poly: pdPoly, fill: "#ff9999", label: "PD" },
    { code: "D1", poly: d1Poly, fill: "#ff6666", label: "D1" },
    { code: "D2", poly: d2Poly, fill: "#ffaa00", label: "D2" },
    { code: "T3", poly: t3Poly, fill: "#99ccff", label: "T3" },
    { code: "T2", poly: t2Poly, fill: "#66aaff", label: "T2" },
    { code: "T1", poly: t1Poly, fill: "#3399ff", label: "T1" },
    { code: "ND", poly: ndPoly, fill: "#cccccc", label: "ND" }
  ];

  // Point-in-polygon (ray casting)
  function pointInPolygon(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      if ((yi > p.y) !== (yj > p.y) && p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  function classify(h2, ch4, c2h6, c2h4, c2h2) {
    const total = h2 + ch4 + c2h6 + c2h4 + c2h2;
    if (total <= 0) return "ND";
    const pct = [h2, ch4, c2h6, c2h4, c2h2].map(v => 100 * v / total);
    // compute point in pentagon
    const point = { x: 0, y: 0 };
    for (let i = 0; i < 5; i++) {
      point.x += pct[i] / 100 * V[i].x;
      point.y += pct[i] / 100 * V[i].y;
    }
    for (const z of zones) {
      if (pointInPolygon(point, z.poly)) return z.code;
    }
    // Fallback (should never happen)
    return "ND";
  }

  function render(svg, sample) {
    // Clear any existing content
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // Background white rect
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("x", "0"); bg.setAttribute("y", "0");
    bg.setAttribute("width", "600"); bg.setAttribute("height", "600");
    bg.setAttribute("fill", "white");
    svg.appendChild(bg);

    // Draw filled zone polygons
    for (const z of zones) {
      const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      poly.setAttribute("points", z.poly.map(p => `${p.x},${p.y}`).join(" "));
      poly.setAttribute("fill", z.fill);
      poly.setAttribute("stroke", "#333");
      poly.setAttribute("stroke-width", "1.5");
      poly.setAttribute("opacity", "0.7");
      svg.appendChild(poly);
    }

    // Draw outer pentagon
    const outer = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    outer.setAttribute("points", V.map(p => `${p.x},${p.y}`).join(" "));
    outer.setAttribute("fill", "none");
    outer.setAttribute("stroke", "#000");
    outer.setAttribute("stroke-width", "3");
    svg.appendChild(outer);

    // Draw axes and labels
    for (let i = 0; i < 5; i++) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", cx); line.setAttribute("y1", cy);
      line.setAttribute("x2", V[i].x); line.setAttribute("y2", V[i].y);
      line.setAttribute("stroke", "#555");
      line.setAttribute("stroke-width", "1");
      line.setAttribute("stroke-dasharray", "4 2");
      svg.appendChild(line);

      const labelPos = toXY(angle[i], R * 1.08);
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", labelPos.x);
      text.setAttribute("y", labelPos.y);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "middle");
      text.setAttribute("font-family", "Arial, sans-serif");
      text.setAttribute("font-size", "14");
      text.setAttribute("fill", "#000");
      text.textContent = names[i];
      svg.appendChild(text);
    }

    // Draw zone labels (centers of polygons)
    for (const z of zones) {
      let cxZ = z.poly.reduce((s, p) => s + p.x, 0) / z.poly.length;
      let cyZ = z.poly.reduce((s, p) => s + p.y, 0) / z.poly.length;
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", cxZ);
      text.setAttribute("y", cyZ);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "middle");
      text.setAttribute("font-family", "Arial, sans-serif");
      text.setAttribute("font-size", "12");
      text.setAttribute("fill", "#000");
      text.setAttribute("font-weight", "bold");
      text.textContent = z.label;
      svg.appendChild(text);
    }

    // Plot sample point if provided
    if (sample) {
      const total = sample.h2 + sample.ch4 + sample.c2h6 + sample.c2h4 + sample.c2h2;
      if (total > 0) {
        const pct = [sample.h2, sample.ch4, sample.c2h6, sample.c2h4, sample.c2h2].map(v => 100 * v / total);
        const point = { x: 0, y: 0 };
        for (let i = 0; i < 5; i++) {
          point.x += pct[i] / 100 * V[i].x;
          point.y += pct[i] / 100 * V[i].y;
        }
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", point.x);
        circle.setAttribute("cy", point.y);
        circle.setAttribute("r", "6");
        circle.setAttribute("fill", "black");
        circle.setAttribute("stroke", "white");
        circle.setAttribute("stroke-width", "2");
        svg.appendChild(circle);
      }
    }
  }

  return { classify, render };
})();
