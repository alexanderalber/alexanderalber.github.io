const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    // Calculate percentage composition
    const total = ch4 + c2h4 + c2h2;
    if (total <= 0) throw new Error('Total gas cannot be zero');
    const pct_ch4 = ch4 / total * 100;
    const pct_c2h4 = c2h4 / total * 100;
    const pct_c2h2 = c2h2 / total * 100;

    // Duval Triangle 1 Zone boundaries (from memory, best approximation):
    // * PD:       C2H2 < 4%, C2H4 < 20%
    // * D1:       C2H2 >= 4%, C2H2 < 15%, C2H4 < 23%, CH4 < 98%
    // * D2:       C2H2 >= 15%, C2H4 < 13%, CH4 < 79%
    // * T1:       C2H2 < 4%, C2H4 >= 20%, C2H4 < 50%
    // * T2:       C2H2 < 4%, C2H4 >= 50%
    // * T3:       C2H2 >= 4%, C2H4 >= 23%, C2H2 + C2H4 > 77%
    // * DT:       C2H2 >= 15%, C2H4 >= 13%, CH4 < 79%
    // * ND:       Anything not classified above

    // Order of checking is crucial, from most specific to most general

    // D2
    if (pct_c2h2 >= 15 && pct_c2h4 < 13 && pct_ch4 < 79) return 'D2';
    // DT
    if (pct_c2h2 >= 15 && pct_c2h4 >= 13 && pct_ch4 < 79) return 'DT';
    // D1
    if (pct_c2h2 >= 4 && pct_c2h2 < 15 && pct_c2h4 < 23 && pct_ch4 < 98) return 'D1';
    // T3
    if (pct_c2h2 >= 4 && pct_c2h4 >= 23 && (pct_c2h2 + pct_c2h4) > 77) return 'T3';
    // T2
    if (pct_c2h2 < 4 && pct_c2h4 >= 50) return 'T2';
    // T1
    if (pct_c2h2 < 4 && pct_c2h4 >= 20 && pct_c2h4 < 50) return 'T1';
    // PD
    if (pct_c2h2 < 4 && pct_c2h4 < 20) return 'PD';
    // ND (Not Defined, i.e. out of normal triangle area)
    return 'ND';
  },

  render(svg, sample) {
    // Clean SVG
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // Triangle dimensions
    const H = 520; // triangle height (pixels)
    const A = 520; // triangle base (pixels)
    const marginX = 40, marginY = 10;

    // Axes: vertex0 at (marginX, marginY + H), vertex1 at (marginX + A, marginY + H), vertex2 at (marginX + A/2, marginY)
    const v0 = [marginX, marginY + H];                   // 100% CH4
    const v1 = [marginX + A, marginY + H];               // 100% C2H4
    const v2 = [marginX + A / 2, marginY];               // 100% C2H2

    // Helper: barycentric (percentages) -> (x, y)
    function baryToXY(ch4, c2h4, c2h2) {
      // ch4, c2h4, c2h2 as percentage (add up to 100)
      const x = v0[0] * (ch4 / 100) + v1[0] * (c2h4 / 100) + v2[0] * (c2h2 / 100);
      const y = v0[1] * (ch4 / 100) + v1[1] * (c2h4 / 100) + v2[1] * (c2h2 / 100);
      return [x, y];
    }

    // Zone polygons (as % barycentric coordinates, best effort!)
    const zones = [
      { // PD: C2H2 <4%, C2H4 <20%
        code: 'PD',  color: '#e5f5e0',
        points: [
          [100, 0, 0],      // 100% CH4
          [80, 20, 0],      // CH4 80%, C2H4 20%
          [4/76*100, 72/76*100, 4], // C2H2 = 4, CH4 + C2H4 = 96, split in same CH4:C2H4 ratio as previous
          [4/96*80, 20/96*80, 4],   // Approximated
          [4, 0, 96]        // C2H2 96%, at the left edge but still at C2H4<20% line
        ]
      },

      { // T1: C2H2 < 4%, 20% ≤ C2H4 < 50%
        code: 'T1', color: '#d2d8fa',
        points: [
          [80, 20, 0],
          [50, 50, 0],
          [2, 48, 50],   // interpolate to C2H2=4%, C2H4=50%
          [4, 46, 50],   // C2H2=4%, C2H4=50%, CH4=46%
          [4, 20, 76],   // C2H2=4%, C2H4=20%, CH4=76%
        ]
      },

      { // T2: C2H2 < 4%, C2H4 ≥ 50%
        code: 'T2', color: '#b0c4e3',
        points: [
          [50, 50, 0],
          [0, 100, 0],
          [0, 96, 4],
          [4, 46, 50],
        ]
      },

      { // D2: C2H2 ≥ 15%, C2H4 < 13%, CH4 < 79%
        code: 'D2', color: '#f9e2e7',
        points: [
          [85, 0, 15],
          [79, 13, 8],      // C2H4=13%, C2H2 + CH4 = 87%
          [71, 13, 16],
          [0, 13, 87],
          [0, 0, 100],
        ]
      },

      { // DT: C2H2 ≥ 15%, C2H4 ≥ 13%, CH4 < 79%
        code: 'DT', color: '#f9c0d2',
        points: [
          [79, 13, 8],
          [66, 34, 0],
          [0, 79, 21],
          [0, 13, 87],
          [71, 13, 16],
        ]
      },

      { // D1: 4% ≤ C2H2 < 15%, C2H4 < 23%, CH4 < 98%
        code: 'D1', color: '#ffe5b1',
        points: [
          [96, 0, 4],
          [85, 0, 15],
          [71, 13, 16],
          [77, 23, 0],
          [73, 23, 4],
          [96, 0, 4]
        ]
      },

      { // T3: C2H2 ≥ 4%, C2H4 ≥ 23%, C2H2 + C2H4 > 77%
        code: 'T3', color: '#e1eafc',
        points: [
          [23, 77, 0],
          [0, 100, 0],
          [0, 79, 21],
          [66, 34, 0],
          [73, 23, 4],
          [23, 77, 0]
        ]
      },
    ];

    // Draw zones (filled polygons)
    for (const z of zones) {
      const pts = z.points.map(([ch4, c2h4, c2h2]) => baryToXY(ch4, c2h4, c2h2));
      const path = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      path.setAttribute("points", pts.map(([x, y]) => x + "," + y).join(" "));
      path.setAttribute("fill", z.color);
      path.setAttribute("stroke", "#888");
      path.setAttribute("stroke-width", "1.5");
      svg.appendChild(path);
    }

    // Draw triangle outline
    const outline = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    outline.setAttribute("points", [v0, v1, v2].map(([x, y]) => x + "," + y).join(" "));
    outline.setAttribute("fill", "none");
    outline.setAttribute("stroke", "#000");
    outline.setAttribute("stroke-width", "2.2");
    svg.appendChild(outline);

    // Draw axis ticks and gas labels
    const tickLen = 10, fontSize = 18;
    for (let i = 0; i <= 10; ++i) {
      // From v0 to v1: C2H4 axis
      const f = i / 10;
      const [x, y] = baryToXY(100 - 100 * f, 100 * f, 0);
      const [xt, yt] = baryToXY(100 - 100 * f, 100 * f, 0.0);
      const ang = Math.atan2(v1[1] - v0[1], v1[0] - v0[0]);
      const dx = tickLen * Math.sin(ang);
      const dy = -tickLen * Math.cos(ang);
      drawTick(x, y, x + dx, y + dy);
      if (i != 0 && i != 10)
        drawText((x + x + dx) / 2 - 5, (y + y + dy) / 2 + 6, (i * 10) + "%", "middle", fontSize - 4);
    }

    for (let i = 1; i <= 10; ++i) {
      // From v1 to v2: C2H2 axis
      const f = i / 10;
      const [x, y] = baryToXY(0, 100 - 100 * f, 100 * f);
      const ang = Math.atan2(v2[1] - v1[1], v2[0] - v1[0]);
      const dx = tickLen * Math.sin(ang);
      const dy = -tickLen * Math.cos(ang);
      drawTick(x, y, x + dx, y + dy);
      if (i != 10)
        drawText(x + dx * 1.1, y + dy * 1.2, (i * 10) + "%", "start", fontSize - 4);
    }

    for (let i = 1; i <= 10; ++i) {
      // From v2 to v0: CH4 axis
      const f = i / 10;
      const [x, y] = baryToXY(100 * f, 0, 100 - 100 * f);
      const ang = Math.atan2(v0[1] - v2[1], v0[0] - v2[0]);
      const dx = tickLen * Math.sin(ang);
      const dy = -tickLen * Math.cos(ang);
      drawTick(x, y, x + dx, y + dy);
      if (i != 10)
        drawText(x + dx * 0.95, y + dy * 1.18, (i * 10) + "%", "end", fontSize - 4);
    }

    // Gas names
    drawText(v0[0] - 18, v0[1] + 16, "CH₄", "end", fontSize+2, "#284");
    drawText(v1[0] + 18, v1[1] + 16, "C₂H₄", "start", fontSize+2, "#36a");
    drawText(v2[0], v2[1] - 14, "C₂H₂", "middle", fontSize+2, "#c32");

    // Zone codes in their approximate centers
    const zoneCenters = {
      PD:   baryToXY(90, 7, 3),
      D1:   baryToXY(82, 12, 6),
      D2:   baryToXY(67, 7, 26),
      DT:   baryToXY(35, 30, 35),
      T1:   baryToXY(66, 30, 4),
      T2:   baryToXY(24, 74, 2),
      T3:   baryToXY(7, 75, 18),
    };

    for (const z of zones) {
      const [x, y] = zoneCenters[z.code] || [0, 0];
      drawText(x, y, z.code, "middle", fontSize+7, "#000", "bold", "1");
    }

    // If sample is given, plot
    if (sample && (sample.ch4 > 0 || sample.c2h4 > 0 || sample.c2h2 > 0)) {
      const tot = sample.ch4 + sample.c2h4 + sample.c2h2;
      const pct_ch4 = sample.ch4 / tot * 100;
      const pct_c2h4 = sample.c2h4 / tot * 100;
      const pct_c2h2 = sample.c2h2 / tot * 100;
      const [x, y] = baryToXY(pct_ch4, pct_c2h4, pct_c2h2);

      const mark = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      mark.setAttribute("cx", x);
      mark.setAttribute("cy", y);
      mark.setAttribute("r", "9");
      mark.setAttribute("fill", "#e31a1c");
      mark.setAttribute("stroke", "#000");
      mark.setAttribute("stroke-width", "2");
      svg.appendChild(mark);

      // Optionally label
      drawText(x+13, y-13, "●", "left", fontSize+4, "#a11", "bold", "1");
    }

    // Helper: draw tick mark
    function drawTick(x1, y1, x2, y2) {
      const l = document.createElementNS("http://www.w3.org/2000/svg", "line");
      l.setAttribute("x1", x1); l.setAttribute("y1", y1);
      l.setAttribute("x2", x2); l.setAttribute("y2", y2);
      l.setAttribute("stroke", "#444");
      l.setAttribute("stroke-width", "2");
      svg.appendChild(l);
    }

    // Helper: add a text label
    function drawText(x, y, text, align, size, color, weight, opacity) {
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.textContent = text;
      t.setAttribute("x", x);
      t.setAttribute("y", y);
      if (align === "middle") t.setAttribute("text-anchor", "middle");
      if (align === "end") t.setAttribute("text-anchor", "end");
      if (align === "start") t.setAttribute("text-anchor", "start");
      t.setAttribute("font-size", size);
      t.setAttribute("font-family", "sans-serif");
      t.setAttribute("fill", color || "#222");
      if (weight) t.setAttribute("font-weight", weight);
      if (opacity) t.setAttribute("opacity", opacity);
      svg.appendChild(t);
    }
  }
};
