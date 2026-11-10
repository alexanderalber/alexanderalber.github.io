const DuvalTriangle = {
  /**
   * Classifies a dissolved gas sample using Duval Triangle 1.
   * @param {number} ch4 - Methane concentration in ppm.
   * @param {number} c2h4 - Ethylene concentration in ppm.
   * @param {number} c2h2 - Acetylene concentration in ppm.
   * @returns {string} Standard fault zone code (PD, T1, T2, T3, D1, D2, DT).
   */
  classify(ch4, c2h4, c2h2) {
    const total = ch4 + c2h4 + c2h2;
    if (total <= 0) return "Unknown";

    const pCH4 = (ch4 / total) * 100;
    const pC2H4 = (c2h4 / total) * 100;
    const pC2H2 = (c2h2 / total) * 100;

    // PD: Partial Discharge
    if (pCH4 >= 98) return "PD";

    // Thermal Faults (T1, T2, T3)
    if (pC2H2 < 4) {
      if (pC2H4 < 20) return "T1";
      if (pC2H4 < 50) return "T2";
      return "T3";
    }

    // Electrical Arcing Faults (D1, D2)
    if (pC2H2 >= 13) {
      if (pC2H4 < 23) return "D1";
      if (pC2H2 >= 29 && pC2H4 >= 23) return "D2";
    }

    // T3 can extend into higher acetylene regions
    if (pC2H4 >= 50 && pC2H2 < 15) return "T3";
    if (pC2H4 >= 40 && pC2H2 >= 15 && pC2H2 < 29) return "T3";

    // DT: Thermal and Electrical (Mix)
    return "DT";
  },

  /**
   * Renders the Duval Triangle 1 into an SVG element.
   * @param {SVGElement} svg - The SVG element to draw in.
   * @param {Object|null} sample - Object with {ch4, c2h4, c2h2} in ppm, or null.
   */
  render(svg, sample) {
    const NS = "http://www.w3.org/2000/svg";

    // Vertex coordinates (x, y) for CH4, C2H4, C2H2
    const V = {
      ch4: [300, 40], // Top
      c2h4: [550, 473], // Bottom Right
      c2h2: [50, 473] // Bottom Left
    };

    const toXY = (ch4, c2h4, c2h2) => {
      const sum = ch4 + c2h4 + c2h2 || 100;
      const a = ch4 / sum;
      const b = c2h4 / sum;
      const c = c2h2 / sum;
      return [
        a * V.ch4[0] + b * V.c2h4[0] + c * V.c2h2[0],
        a * V.ch4[1] + b * V.c2h4[1] + c * V.c2h2[1]
      ];
    };

    const drawPoly = (points, color, label, labelPos) => {
      const g = document.createElementNS(NS, "g");
      const poly = document.createElementNS(NS, "polygon");
      const ptsString = points.map(p => toXY(...p).join(",")).join(" ");
      poly.setAttribute("points", ptsString);
      poly.setAttribute("fill", color);
      poly.setAttribute("stroke", "#333");
      poly.setAttribute("stroke-width", "0.5");
      g.appendChild(poly);

      if (label && labelPos) {
        const text = document.createElementNS(NS, "text");
        const [lx, ly] = toXY(...labelPos);
        text.setAttribute("x", lx);
        text.setAttribute("y", ly);
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("font-family", "sans-serif");
        text.setAttribute("font-weight", "bold");
        text.setAttribute("font-size", "14");
        text.setAttribute("fill", "rgba(0,0,0,0.5)");
        text.textContent = label;
        g.appendChild(text);
      }
      svg.appendChild(g);
    };

    // Define Duval Zones (CH4, C2H4, C2H2)
    const zones = [
      { id: "PD", color: "#fef3c7", label: "PD", lp: [99.2, 0.4, 0.4], pts: [[100, 0, 0], [98, 2, 0], [98, 0, 2]] },
      { id: "T1", color: "#dcfce7", label: "T1", lp: [88, 10, 2], pts: [[98, 2, 0], [80, 20, 0], [76, 20, 4], [96, 0, 4], [98, 0, 2]] },
      { id: "T2", color: "#86efac", label: "T2", lp: [65, 33, 2], pts: [[80, 20, 0], [50, 50, 0], [46, 50, 4], [76, 20, 4]] },
      { id: "T3", color: "#22c55e", label: "T3", lp: [25, 65, 10], pts: [[50, 50, 0], [0, 100, 0], [0, 85, 15], [40, 45, 15], [46, 50, 4]] },
      { id: "D1", color: "#fee2e2", label: "D1", lp: [20, 5, 75], pts: [[0, 0, 100], [87, 0, 13], [64, 13, 23], [0, 23, 77]] },
      { id: "D2", color: "#ef4444", label: "D2", lp: [20, 40, 40], pts: [[0, 23, 77], [64, 13, 23], [48, 23, 29], [0, 71, 29]] },
      { id: "DT", color: "#e5e7eb", label: "DT", lp: [60, 20, 20], pts: [[96, 0, 4], [76, 20, 4], [46, 50, 4], [40, 45, 15], [48, 23, 29], [64, 13, 23], [87, 0, 13]] }
    ];

    zones.forEach(z => drawPoly(z.pts, z.color, z.label, z.lp));

    // Axes and Ticks
    const drawAxis = (v1, v2, label, offsetDir) => {
      const line = document.createElementNS(NS, "line");
      line.setAttribute("x1", v1[0]); line.setAttribute("y1", v1[1]);
      line.setAttribute("x2", v2[0]); line.setAttribute("y2", v2[1]);
      line.setAttribute("stroke", "black");
      line.setAttribute("stroke-width", "2");
      svg.appendChild(line);

      // Label
      const text = document.createElementNS(NS, "text");
      text.setAttribute("x", (v1[0] + v2[0]) / 2 + offsetDir[0] * 40);
      text.setAttribute("y", (v1[1] + v2[1]) / 2 + offsetDir[1] * 40);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("font-family", "sans-serif");
      text.setAttribute("font-weight", "bold");
      text.textContent = label;
      svg.appendChild(text);

      // Ticks
      for (let i = 20; i < 100; i += 20) {
        const x = v1[0] + (v2[0] - v1[0]) * (i / 100);
        const y = v1[1] + (v2[1] - v1[1]) * (i / 100);
        const tick = document.createElementNS(NS, "line");
        tick.setAttribute("x1", x);
        tick.setAttribute("y1", y);
        tick.setAttribute("x2", x + offsetDir[0] * 8);
        tick.setAttribute("y2", y + offsetDir[1] * 8);
        tick.setAttribute("stroke", "black");
        svg.appendChild(tick);
      }
    };

    drawAxis(V.c2h2, V.ch4, "% CH4", [-1, -0.5]);
    drawAxis(V.ch4, V.c2h4, "% C2H4", [1, -0.5]);
    drawAxis(V.c2h4, V.c2h2, "% C2H2", [0, 1]);

    // Sample Marker
    if (sample && (sample.ch4 || sample.c2h4 || sample.c2h2)) {
      const [sx, sy] = toXY(sample.ch4, sample.c2h4, sample.c2h2);
      const circle = document.createElementNS(NS, "circle");
      circle.setAttribute("cx", sx);
      circle.setAttribute("cy", sy);
      circle.setAttribute("r", "6");
      circle.setAttribute("fill", "black");
      circle.setAttribute("stroke", "white");
      circle.setAttribute("stroke-width", "2");
      svg.appendChild(circle);
    }
  }
};
