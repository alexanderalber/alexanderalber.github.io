const DuvalPentagon = (function () {
  // Pentagon axes in Duval order (starting at top, then clockwise)
  const gases = [
    { key: "h2",   label: "H₂" },      // top
    { key: "ch4",  label: "CH₄" },     // upper right
    { key: "c2h6", label: "C₂H₆" },    // lower right
    { key: "c2h4", label: "C₂H₄" },    // lower left
    { key: "c2h2", label: "C₂H₂" },    // upper left
  ];

  // Duval Pentagon 1 zones, drawn from memory – boundaries are defined as "fractions" (percentages of total gas)
  // Note: Fractions in order: H2, CH4, C2H6, C2H4, C2H2
  // Short codes: PD, D1, D2, O, DT

  const zones = [
    {
      code: "PD", // Partial Discharge
      color: "#92d4f4",
      // Upper left of the pentagon.
      // PD: H2 > 63%, and CH4 < 11%, C2H2 < 4.2%, C2H4 < 16%
      contains: f =>
        f[0] >= 0.63 &&
        f[1] <= 0.11 &&
        f[4] <= 0.042 &&
        f[3] <= 0.16
    },
    {
      code: "D1", // Low Intensity Discharge
      color: "#aecb83",
      // D1: C2H4 < 16%, C2H2 > 0.042, CH4 < 11%, H2 < 63%
      contains: f =>
        f[3] <= 0.16 &&
        f[4] > 0.042 &&
        f[1] <= 0.11 &&
        f[0] < 0.63
    },
    {
      code: "D2", // High Intensity Discharge
      color: "#f6a385",
      // D2: C2H4 < 16%, C2H2 > 0.042, CH4 > 0.11 or H2 > 0.63
      contains: f =>
        f[3] <= 0.16 &&
        f[4] > 0.042 &&
        (f[1] > 0.11 || f[0] > 0.63)
    },
    {
      code: "O", // Overheated Oil
      color: "#ffe18a",
      // O: C2H4 >= 0.16, C2H6 > C2H4, C2H2 < 0.042
      contains: f =>
        f[3] > 0.16 &&
        f[2] > f[3] &&
        f[4] <= 0.042
    },
    {
      code: "DT", // Thermal Fault (T2–T3)
      color: "#eaace8",
      // DT: C2H4 >= 0.16, C2H4 >= C2H6, C2H2 < 0.042
      contains: f =>
        f[3] > 0.16 &&
        f[3] >= f[2] &&
        f[4] <= 0.042
    }
    // There is (very rarely) a central "unclassified" area, but the above covers all standard zones.
  ];

  // Axes: H2 (top, 0deg), CH4 (72deg), C2H6 (144deg), C2H4 (216deg), C2H2 (288deg)
  // Each axis is a vector from pentagon center to one vertex.
  // We'll use a radius of 250px, centered at (300,300)
  const pentagon = {
    cx: 300,
    cy: 300,
    r: 250
  };

  function toFractions(h2, ch4, c2h6, c2h4, c2h2) {
    const arr = [h2, ch4, c2h6, c2h4, c2h2].map(Number);
    const sum = arr.reduce((a, b) => a + b, 0);
    return sum > 0 ? arr.map(val => val / sum) : [0, 0, 0, 0, 0];
  }

  function classify(h2, ch4, c2h6, c2h4, c2h2) {
    const f = toFractions(h2, ch4, c2h6, c2h4, c2h2);
    for (const zone of zones) {
      if (zone.contains(f)) return zone.code;
    }
    // Fallback: outside all zones, mark as "?" (should be rare).
    return "?";
  }

  // --- Polygon vertices on the pentagon
  function getAxisPos(axis, frac) {
    // axis: 0 .. 4 (corresponding to gases order), frac: 0..1 (fraction)
    // Axis 0 is at -90deg (top), then +72 deg per axis (CW).
    const angle = (-Math.PI / 2) + axis * (2 * Math.PI / 5);
    const r = pentagon.r * frac;
    return [
      pentagon.cx + r * Math.cos(angle),
      pentagon.cy + r * Math.sin(angle)
    ];
  }

  // Fill for a single zone
  function zonePolygon(zoneId) {
    // For each zone, define vertexes in barycentric coordinates (approximated from Duval diagrams).
    // We'll use 6-10 points per zone for accuracy.

    // Coordinates below are approximate and for illustration, close to the actual Duval Pentagon.
    // Each vertex is [H2, CH4, C2H6, C2H4, C2H2] fractions (must sum to 1).
    switch (zoneId) {
      case "PD":
        // "left-top" small area near H2 axis
        return [
          [1.00, 0.00, 0.00, 0.00, 0.00],
          [0.63, 0.10, 0.09, 0.16, 0.02],
          [0.65, 0.11, 0.03, 0.16, 0.05],
          [0.80, 0.07, 0.06, 0.03, 0.04],
          [0.90, 0.04, 0.00, 0.03, 0.03]
        ];
      case "D1":
        // Area between low H2, low CH4, high C2H2, low C2H4
        return [
          [0.50, 0.10, 0.10, 0.16, 0.14],
          [0.63, 0.10, 0.09, 0.16, 0.02],
          [0.65, 0.11, 0.03, 0.16, 0.05],
          [0.52, 0.11, 0.09, 0.16, 0.12],
          [0.40, 0.09, 0.13, 0.16, 0.22],
          [0.35, 0.12, 0.10, 0.16, 0.27],
        ];
      case "D2":
        // Higher CH4/H2, high C2H2, low C2H4
        return [
          [0.51, 0.12, 0.13, 0.16, 0.08],
          [0.30, 0.20, 0.12, 0.16, 0.22],
          [0.25, 0.23, 0.09, 0.16, 0.27],
          [0.15, 0.29, 0.10, 0.16, 0.30],
          [0.12, 0.31, 0.10, 0.16, 0.31],
        ];
      case "O":
        // Overheated oil: high C2H6 > C2H4, C2H4 > 0.16
        return [
          [0.05, 0.06, 0.50, 0.30, 0.09],
          [0.10, 0.07, 0.44, 0.35, 0.04],
          [0.12, 0.08, 0.40, 0.38, 0.02],
          [0.14, 0.10, 0.37, 0.39, 0.00],
          [0.20, 0.12, 0.33, 0.35, 0.00]
        ];
      case "DT":
        // Thermal faults: C2H4 >= C2H6, C2H4 > 0.16
        return [
          [0.02, 0.07, 0.29, 0.60, 0.02],
          [0.06, 0.08, 0.23, 0.63, 0.00],
          [0.08, 0.09, 0.20, 0.63, 0.00],
          [0.10, 0.10, 0.16, 0.64, 0.00],
          [0.15, 0.11, 0.10, 0.64, 0.00]
        ];
      default:
        return [];
    }
  }

  // Map barycentric "gas fractions" to SVG 2D point
  function fractionsToXY(fracs) {
    // Interpolate along each axis, then sum (since it's a pentagon, not triangle, use weighted average)
    let x = 0, y = 0;
    for (let i = 0; i < 5; ++i) {
      const [px, py] = getAxisPos(i, fracs[i]);
      x += px;
      y += py;
    }
    return [x / 5, y / 5];
  }

  function renderPentagonOutline(svg) {
    // Draw the full pentagon
    const pts = [];
    for (let i = 0; i < 5; ++i) {
      pts.push(getAxisPos(i, 1).join(","));
    }
    const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    poly.setAttribute("points", pts.join(" "));
    poly.setAttribute("fill", "white");
    poly.setAttribute("stroke", "#222");
    poly.setAttribute("stroke-width", "2");
    svg.appendChild(poly);
  }

  function renderZone(svg, code, color, label) {
    const verts = zonePolygon(code);
    if (verts.length < 2) return;
    const pts = verts.map(fractionsToXY).map(pt => pt.join(",")).join(" ");
    const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    poly.setAttribute("points", pts);
    poly.setAttribute("fill", color);
    poly.setAttribute("stroke", "#444");
    poly.setAttribute("stroke-width", "1.5");
    poly.setAttribute("fill-opacity", "0.7");
    svg.appendChild(poly);

    // Place label at centroid of vertices
    let cx = 0, cy = 0;
    for (const v of verts) {
      const [x, y] = fractionsToXY(v);
      cx += x;
      cy += y;
    }
    cx /= verts.length;
    cy /= verts.length;

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.textContent = label;
    text.setAttribute("x", cx);
    text.setAttribute("y", cy + 4); // Approximate label centering
    text.setAttribute("font-family", "Arial, sans-serif");
    text.setAttribute("font-size", "32");
    text.setAttribute("fill", "#333");
    text.setAttribute("font-weight", "bold");
    text.setAttribute("text-anchor", "middle");
    svg.appendChild(text);
  }

  function renderAxes(svg) {
    for (let i = 0; i < 5; ++i) {
      const [x1, y1] = [pentagon.cx, pentagon.cy];
      const [x2, y2] = getAxisPos(i, 1);
      const axis = document.createElementNS("http://www.w3.org/2000/svg", "line");
      axis.setAttribute("x1", x1);
      axis.setAttribute("y1", y1);
      axis.setAttribute("x2", x2);
      axis.setAttribute("y2", y2);
      axis.setAttribute("stroke", "#888");
      axis.setAttribute("stroke-width", "2");
      svg.appendChild(axis);

      // Add gas label outside pentagon at each axis (extend slightly beyond r)
      const [lx, ly] = getAxisPos(i, 1.09);
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.textContent = gases[i].label;
      label.setAttribute("x", lx);
      label.setAttribute("y", ly + 10); // fudge factor for centering label
      label.setAttribute("font-family", "Arial, sans-serif");
      label.setAttribute("font-size", "24");
      label.setAttribute("fill", "#000");
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("font-weight", "bold");
      svg.appendChild(label);
    }
  }

  function renderSample(svg, sample) {
    if (!sample) return;
    const { h2, ch4, c2h6, c2h4, c2h2 } = sample;
    const f = toFractions(h2, ch4, c2h6, c2h4, c2h2);
    const [x, y] = fractionsToXY(f);
    // Draw sample point
    const circ = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circ.setAttribute("cx", x);
    circ.setAttribute("cy", y);
    circ.setAttribute("r", 11);
    circ.setAttribute("fill", "#1c2357");
    circ.setAttribute("stroke", "#fff");
    circ.setAttribute("stroke-width", "3");
    svg.appendChild(circ);
  }

  function render(svg, sample) {
    // Clear SVG
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // White background (required by prompt)
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("x", "0");
    bg.setAttribute("y", "0");
    bg.setAttribute("width", "600");
    bg.setAttribute("height", "600");
    bg.setAttribute("fill", "white");
    svg.appendChild(bg);

    renderPentagonOutline(svg);

    // Draw each zone
    for (const zone of zones) {
      renderZone(svg, zone.code, zone.color, zone.code);
    }

    renderAxes(svg);

    // Sample marker
    renderSample(svg, sample);
  }

  return {
    classify,
    render,
  };
})();
