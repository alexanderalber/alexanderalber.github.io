const DuvalTriangle5 = (() => {
  // Constants: triangle geometry
  const W = 600, H = 540;
  const PAD = 40;
  const TRI_HEIGHT = H - 2 * PAD;
  const TRI_SIDE = W - 2 * PAD;
  // Corners of the equilateral triangle
  const A = [W / 2, PAD]; // C2H4 (Ethylene)
  const B = [PAD, H - PAD]; // C2H6 (Ethane)
  const C = [W - PAD, H - PAD]; // CH4 (Methane)

  // Zone definitions: each as a polygon in ternary coordinates (%-scaled)
  // Ternary coords: [CH4%, C2H4%, C2H6%], sum to 100
  // Duval Triangle 5 (DT5) zones and codes:
  // - "PD": Partial Discharge
  // - "D1": Low Energy Discharge
  // - "T1": Thermal Fault <300°C
  // - "T2": Thermal Fault 300-700°C
  // - "T3": Thermal Fault >700°C
  // - "DT": Electrical Fault (arc/distribution transformer short)

  // Based on memory (IEC 60599 / Duval, but zoning by recollection):
  //
  // The zones:
  //             C2H4
  //              /\
  //             /  \
  //        T2  /    \  T3
  //           /      \
  //          /        \
  //   C2H6  /__________\  CH4
  //         B     T1    C
  //
  // Duval 5 uses relative %'s of CH4, C2H4, C2H6.
  // Key vertices by Duval's paper:
  // For boundaries we recall approximate key points:

  // Zone boundaries (approximated from Duval's works and summaries)
  // Each zone is a polygon: array of ternary points ([m, e4, e6] in %)
  // Polygon order is clockwise

  const zones = [
    {
      code: "PD",
      label: "PD",
      color: "#a2d9f7",
      poly: [
        [100,   0,   0],   // CH4 apex
        [70,   15,  15],
        [62,   18,  20],
        [54,   16,  30],
        [52,   11,  37],
        [50,    7,  43],
        [50,    0,  50],   // edge CH4-C2H6, midpoint
        [100,  0,   0],    // close
      ],
    },
    {
      code: "D1",
      label: "D1",
      color: "#fcfaa3",
      poly: [
        [70,  15,  15],
        [62,  18,  20],
        [54,  16,  30],
        [52,  11,  37],
        [50,   7,  43],
        [47,  21,  32],
        [44,  32,  24],
        [54,  40,   6],
        [65,  25,  10],
        [70,  15,  15],
      ],
    },
    {
      code: "T1",
      label: "T1\n(<300°C)",
      color: "#bbeeab",
      poly: [
        [50,   7,  43],
        [47,  21,  32],
        [44,  32,  24],
        [35,  36,  29],
        [30,  26,  44],
        [39,   0,  61],    // edge CH4-C2H6
        [50,   0,  50],
        [50,   7,  43]
      ],
    },
    {
      code: "T2",
      label: "T2\n(300-700°C)",
      color: "#fddbaf",
      poly: [
        [44, 32, 24],
        [54, 40,  6],
        [59, 37,  4],
        [47, 53,  0],
        [35, 36, 29],
        [44, 32, 24]
      ],
    },
    {
      code: "T3",
      label: "T3\n(>700°C)",
      color: "#f66",
      poly: [
        [54, 40,  6],
        [59, 37,  4],
        [75, 25,  0],
        [100, 0,  0],
        [70, 15, 15],
        [65, 25, 10],
        [54, 40, 6]
      ],
    },
    {
      code: "DT",
      label: "DT",
      color: "#eee",
      poly: [
        [35, 36, 29],
        [47, 53,  0],
        [32, 68,  0],
        [30, 26, 44]
      ],
    }
  ];

  // Helper: Convert ppm sample to ternary percentages [CH4, C2H4, C2H6]
  function toPercents(ch4, c2h4, c2h6) {
    const sum = ch4 + c2h4 + c2h6;
    if (sum <= 0) return [0, 0, 0];
    return [
      (ch4 / sum) * 100,
      (c2h4 / sum) * 100,
      (c2h6 / sum) * 100
    ];
  }

  // Helper: Test if a point is inside a polygon (ternary, [CH4, C2H4, C2H6])
  // Order: [CH4, C2H4, C2H6]; map to [x, y] using barycentric coordinates
  function pointInPolygon(tern, poly) {
    const pt = ternaryToXY(tern);
    const pts = poly.map(ternaryToXY);

    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1];
      const xj = pts[j][0], yj = pts[j][1];
      if (
        ((yi > pt[1]) !== (yj > pt[1])) &&
        (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi + 1e-15) + xi)
      )
        inside = !inside;
    }
    return inside;
  }

  // Helper: Map ternary point [CH4%, C2H4%, C2H6%] to XY in SVG
  function ternaryToXY([ch4, c2h4, c2h6]) {
    // barycentric: p = w1*A + w2*B + w3*C, with w1+w2+w3=1
    const w1 = c2h4 / 100; // A (top, C2H4)
    const w2 = c2h6 / 100; // B (left, C2H6)
    const w3 = ch4  / 100; // C (right, CH4)
    return [
      w1 * A[0] + w2 * B[0] + w3 * C[0],
      w1 * A[1] + w2 * B[1] + w3 * C[1]
    ];
  }

  // --- Public API ---

  // Classify: return fault zone code for given ch4, c2h4, c2h6 (all ppm, sum>0)
  function classify(ch4, c2h4, c2h6) {
    const tern = toPercents(ch4, c2h4, c2h6);
    for (let z of zones) {
      if (pointInPolygon(tern, z.poly)) return z.code;
    }
    // If none: treat as border condition, look for closest
    let minDist = 1e9, bestCode = 'Unknown';
    const xy = ternaryToXY(tern);
    for (let z of zones) {
      for (let p of z.poly) {
        const [px, py] = ternaryToXY(p);
        const d2 = (xy[0]-px)*(xy[0]-px) + (xy[1]-py)*(xy[1]-py);
        if (d2 < minDist) { minDist = d2; bestCode = z.code; }
      }
    }
    return bestCode;
  }

  // Render the entire triangle, zones, labels, axes, and sample point
  function render(svg, sample) {
    // Clear the element
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // White background
    let background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    background.setAttribute("x", "0");
    background.setAttribute("y", "0");
    background.setAttribute("width", W);
    background.setAttribute("height", H);
    background.setAttribute("fill", "#fff");
    svg.appendChild(background);

    // --- Draw all zones
    for (let zone of zones) {
      const pts = zone.poly.map(ternaryToXY);
      const d = pts.map((p,i) => (i===0 ? 'M':'L')+p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ') + ' Z';
      let pat = document.createElementNS("http://www.w3.org/2000/svg", "path");
      pat.setAttribute("d", d);
      pat.setAttribute("fill", zone.color || "#eee");
      pat.setAttribute("stroke", "#000");
      pat.setAttribute("stroke-width", 1.3);
      svg.appendChild(pat);
    }

    // --- Draw triangle border
    let tri = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    tri.setAttribute("points", [
      A.join(','), B.join(','), C.join(',')
    ].join(' '));
    tri.setAttribute("fill", "none");
    tri.setAttribute("stroke", "#000");
    tri.setAttribute("stroke-width", 2.5);
    svg.appendChild(tri);

    // --- Draw axes (markers for percentages)
    function drawTicks(from, to, label, step = 10, axisType = 0) {
      // axisType: 0 = CH4-CH4, 1 = C2H4, 2 = C2H6
      for (let t = step; t < 100; t += step) {
        // Each tick is a ternary point with t% on ONE axis
        let tern;
        if (axisType === 0)      tern = [t, 100 - t, 0]; // CH4 axis: C to A
        else if (axisType === 1) tern = [0, t, 100 - t]; // C2H4 axis: A to B
        else                     tern = [100 - t, 0, t]; // C2H6: B to C

        const [x, y] = ternaryToXY(tern);
        const v = (axisType === 0) ? [ (A[0]-C[0]), (A[1]-C[1]) ] :
                  (axisType === 1) ? [ (B[0]-A[0]), (B[1]-A[1]) ] :
                                     [ (C[0]-B[0]), (C[1]-B[1]) ];
        const vlen = Math.sqrt(v[0]*v[0]+v[1]*v[1]);
        // Perp direction for tick
        const dx = -2.5 * v[1]/vlen, dy = 2.5 * v[0]/vlen;
        // draw line
        let tick = document.createElementNS("http://www.w3.org/2000/svg", "line");
        tick.setAttribute("x1", x-dx);
        tick.setAttribute("y1", y-dy);
        tick.setAttribute("x2", x+dx);
        tick.setAttribute("y2", y+dy);
        tick.setAttribute("stroke", "#666");
        tick.setAttribute("stroke-width", 1);
        svg.appendChild(tick);

        // Label value
        if (t % 20 === 0) {
          let tx = x + 9*dx, ty = y + 9*dy;
          let text = document.createElementNS("http://www.w3.org/2000/svg", "text");
          text.setAttribute("x", tx);
          text.setAttribute("y", ty+4);
          text.setAttribute("font-size", 16);
          text.setAttribute("text-anchor", "middle");
          text.setAttribute("fill", "#555");
          text.textContent = t;
          svg.appendChild(text);
        }
      }
      // Add axis label
      let lx=(from[0]+to[0])/2, ly=(from[1]+to[1])/2;
      let ltext = document.createElementNS("http://www.w3.org/2000/svg", "text");
      ltext.setAttribute("x", lx);
      ltext.setAttribute("y", ly-15);
      ltext.setAttribute("font-size", 19);
      ltext.setAttribute("font-weight", "bold");
      ltext.setAttribute("text-anchor", "middle");
      ltext.textContent = label;
      svg.appendChild(ltext);
    }
    // Axes: CH4 (C-B), C2H4 (A-B), C2H6 (A-C)
    drawTicks(C, A, "C2H₄ %", 10, 0); // CH4 axis (C-A), for C2H4
    drawTicks(A, B, "C2H₆ %", 10, 1); // C2H4 axis (A-B), for C2H6
    drawTicks(B, C, "CH₄ %",  10, 2); // C2H6 axis (B-C), for CH4

    // --- Zone labels
    for (let zone of zones) {
      // Compute centroid (average of polygon vertices)
      let x = 0, y = 0;
      for (let t of zone.poly) {
        const xy = ternaryToXY(t);
        x += xy[0];
        y += xy[1];
      }
      x /= zone.poly.length;
      y /= zone.poly.length;
      let label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", x);
      label.setAttribute("y", y);
      label.setAttribute("font-size", 23);
      label.setAttribute("font-weight", "bold");
      label.setAttribute("fill", "#444");
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("dominant-baseline", "middle");
      // Allow \n for multi-line
      let lines = String(zone.label).split(/\n/);
      if (lines.length > 1) {
        for (let i=0; i<lines.length; ++i) {
          let tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
          tspan.setAttribute("x", x);
          tspan.setAttribute("dy", i===0 ? "0" : "1.1em");
          tspan.textContent = lines[i];
          label.appendChild(tspan);
        }
      } else
        label.textContent = zone.label;
      svg.appendChild(label);
    }

    // --- Display triangle corners' labels (gas names)
    function gasLabel([x, y], s, label) {
      let text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", x+s[0]);
      text.setAttribute("y", y+s[1]);
      text.setAttribute("font-size", 22);
      text.setAttribute("font-weight", "bold");
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("fill", "#111");
      text.textContent = label;
      svg.appendChild(text);
    }
    gasLabel(A, [0,-24], "C2H₄ (Ethylene)");
    gasLabel(B, [-27,13], "C2H₆ (Ethane)");
    gasLabel(C, [36,13], "CH₄ (Methane)");

    // --- Draw sample point (if present)
    if (sample && (sample.ch4 + sample.c2h4 + sample.c2h6 > 0)) {
      const tern = toPercents(sample.ch4, sample.c2h4, sample.c2h6);
      const [x, y] = ternaryToXY(tern);
      let circ = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circ.setAttribute("cx", x);
      circ.setAttribute("cy", y);
      circ.setAttribute("r", 10);
      circ.setAttribute("fill", "#e642fc");
      circ.setAttribute("stroke", "#222");
      circ.setAttribute("stroke-width", 2.5);
      circ.setAttribute("opacity", 0.92);
      svg.appendChild(circ);

      // Annotate with values
      let text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", x+16);
      text.setAttribute("y", y-15);
      text.setAttribute("font-size", 15);
      text.setAttribute("font-weight", "bold");
      text.setAttribute("fill", "#e642fc");
      text.setAttribute("stroke", "#fff");
      text.setAttribute("stroke-width", 4);
      text.setAttribute("paint-order", "stroke");
      text.setAttribute("opacity", 0.95);
      text.textContent =
        `${Math.round(tern[0])}% CH₄, ${Math.round(tern[1])}% C2H₄, ${Math.round(tern[2])}% C2H₆`;
      svg.appendChild(text);

      // Also display zone code
      let zcode = classify(sample.ch4, sample.c2h4, sample.c2h6);
      let text2 = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text2.setAttribute("x", x+16);
      text2.setAttribute("y", y+6);
      text2.setAttribute("font-size", 17);
      text2.setAttribute("font-weight", "bold");
      text2.setAttribute("fill", "#e642fc");
      text2.setAttribute("stroke", "#fff");
      text2.setAttribute("stroke-width", 4);
      text2.setAttribute("paint-order", "stroke");
      text2.setAttribute("opacity", 0.95);
      text2.textContent = `Zone: ${zcode}`;
      svg.appendChild(text2);

      // Add fg layer for text after stroke
      let text_fg = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text_fg.setAttribute("x", x+16);
      text_fg.setAttribute("y", y-15);
      text_fg.setAttribute("font-size", 15);
      text_fg.setAttribute("font-weight", "bold");
      text_fg.setAttribute("fill", "#e642fc");
      text_fg.textContent =
        `${Math.round(tern[0])}% CH₄, ${Math.round(tern[1])}% C2H₄, ${Math.round(tern[2])}% C2H₆`;
      svg.appendChild(text_fg);

      let text2_fg = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text2_fg.setAttribute("x", x+16);
      text2_fg.setAttribute("y", y+6);
      text2_fg.setAttribute("font-size", 17);
      text2_fg.setAttribute("font-weight", "bold");
      text2_fg.setAttribute("fill", "#e642fc");
      text2_fg.textContent = `Zone: ${zcode}`;
      svg.appendChild(text2_fg);
    }
  }

  return { classify, render };
})();
