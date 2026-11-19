const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const total = ch4 + c2h4 + c2h2;
    if (total <= 0) throw new Error("Gas concentrations must sum to a positive value.");
    const ch4Pct = (ch4 / total) * 100;
    const c2h4Pct = (c2h4 / total) * 100;
    const c2h2Pct = (c2h2 / total) * 100;

    // Determine the zone based on approximate boundaries
    if (c2h2Pct > 98) return "D1";
    if (c2h4Pct > 98) return "D2";
    if (ch4Pct > 98) return "PD";

    if (c2h2Pct >= 50 && c2h4Pct <= 35) return "T3";
    if (c2h4Pct >= 50 && c2h2Pct <= 15) return "T2";
    if (ch4Pct >= 85) return "T1";

    if (c2h2Pct >= 23 && c2h2Pct <= 50 && c2h4Pct <= 40) return "DT";
    if (c2h4Pct >= 20 && c2h4Pct <= 50 && c2h2Pct <= 23) return "T2-T3";
    
    return "Unknown";
  },

  render(svg, sample) {
    const NS = "http://www.w3.org/2000/svg";

    // Helper function to create an SVG element
    const createElem = (type, attrs) => {
      const el = document.createElementNS(NS, type);
      for (const attr in attrs) {
        el.setAttribute(attr, attrs[attr]);
      }
      return el;
    };

    // Draw triangle boundary
    const triangle = createElem("polygon", {
      points: "300,10 590,520 10,520",
      stroke: "black",
      "stroke-width": 2,
      fill: "none",
    });
    svg.appendChild(triangle);

    // Draw grid lines and labels for axes
    const drawAxis = (x1, y1, x2, y2, label, ticks) => {
      const axis = createElem("line", {
        x1,
        y1,
        x2,
        y2,
        stroke: "black",
        "stroke-width": 1,
      });
      svg.appendChild(axis);

      // Add label
      const text = createElem("text", {
        x: (x1 + x2) / 2,
        y: (y1 + y2) / 2 - 10,
        "text-anchor": "middle",
        "font-size": "12",
        fill: "black",
      });
      text.textContent = label;
      svg.appendChild(text);

      // Add tick marks
      for (let i = 1; i < ticks; i++) {
        const px = x1 + (x2 - x1) * (i / ticks);
        const py = y1 + (y2 - y1) * (i / ticks);
        const tick = createElem("line", {
          x1: px,
          y1: py,
          x2: px + (y1 === y2 ? 0 : 5),
          y2: py - (x1 === x2 ? 0 : 5),
          stroke: "black",
          "stroke-width": 1,
        });
        svg.appendChild(tick);
      }
    };

    drawAxis(300, 10, 590, 520, "C2H4", 10); // C2H4 axis
    drawAxis(300, 10, 10, 520, "CH4", 10);  // CH4 axis
    drawAxis(10, 520, 590, 520, "C2H2", 10); // C2H2 axis

    // Legend (approximate zones)
    const zones = [
      { points: "300,10 480,520 300,520", fill: "#FFDDC1", label: "D1" },
      { points: "300,10 300,520 120,520", fill: "#FFABAB", label: "D2" },
      { points: "300,10 480,520 10,520", fill: "#D5AAFF", label: "PD" },
    ];

    zones.forEach((zone) => {
      const poly = createElem("polygon", {
        points: zone.points,
        fill: zone.fill,
        stroke: "black",
        "stroke-width": 1,
        "fill-opacity": 0.5,
      });
      svg.appendChild(poly);

      // Place label in approximate center of zone
      const text = createElem("text", {
        x: 300,
        y: 300,
        "font-size": "14",
        fill: "black",
        "text-anchor": "middle",
      });
      text.textContent = zone.label;
      svg.appendChild(text);
    });

    // Plot sample if given
    if (sample) {
      const { ch4, c2h4, c2h2 } = sample;
      const total = ch4 + c2h4 + c2h2;
      if (total <= 0) throw new Error("Sample gas concentrations must sum to a positive value.");

      const ch4Pct = (ch4 / total) * 100;
      const c2h4Pct = (c2h4 / total) * 100;

      const x = 300 + (c2h4Pct - ch4Pct) * 2.9; // Approximation for x-coordinate
      const y = 520 - c2h4Pct * 5; // Approximation for y-coordinate

      const point = createElem("circle", {
        cx: x,
        cy: y,
        r: 5,
        fill: "red",
        stroke: "black",
        "stroke-width": 1,
      });
      svg.appendChild(point);
    }
  },
};
