const DuvalPentagon = {
  classify(h2, ch4, c2h6, c2h4, c2h2) {
    const total = h2 + ch4 + c2h6 + c2h4 + c2h2;
    if (total <= 0) throw new Error("Gas concentrations must sum to a positive value.");

    // Normalize gas values
    const h2Perc = (h2 / total) * 100;
    const ch4Perc = (ch4 / total) * 100;
    const c2h6Perc = (c2h6 / total) * 100;
    const c2h4Perc = (c2h4 / total) * 100;
    const c2h2Perc = (c2h2 / total) * 100;

    // Classify according to the Duval Pentagon zones
    if (c2h2Perc > 29) return "D1";
    if (c2h4Perc > 29) return "T3";
    if (c2h6Perc > 29) return "T2";
    if (ch4Perc > 29) return "T1";
    if (h2Perc > 29) return "PD";
    return "DT"; // Default to high mixed distribution
  },

  render(svg, sample) {
    const xmlns = "http://www.w3.org/2000/svg";
    const w = 600, h = 600, cx = w / 2, cy = h / 2, r = 250;
    const gasNames = ["H2", "CH4", "C2H6", "C2H4", "C2H2"];
    const angles = [0, 72, 144, 216, 288].map(deg => (deg * Math.PI) / 180);

    // Helper for creating elements
    const createEl = (name, attrs) => {
      const el = document.createElementNS(xmlns, name);
      for (const attr in attrs) el.setAttribute(attr, attrs[attr]);
      return el;
    };

    // Draw pentagon background
    const pentagon = createEl("polygon", {
      points: angles
        .map(
          angle =>
            `${cx + r * Math.cos(angle)},${cy - r * Math.sin(angle)}`
        )
        .join(" "),
      fill: "#f5f5f5",
      stroke: "#000",
      "stroke-width": 2,
    });
    svg.appendChild(pentagon);

    // Draw gas axes and labels
    angles.forEach((angle, i) => {
      const x = cx + r * Math.cos(angle);
      const y = cy - r * Math.sin(angle);
      const line = createEl("line", {
        x1: cx,
        y1: cy,
        x2: x,
        y2: y,
        stroke: "#000",
        "stroke-width": 1,
      });
      svg.appendChild(line);

      const label = createEl("text", {
        x: cx + (r + 20) * Math.cos(angle),
        y: cy - (r + 20) * Math.sin(angle),
        "font-size": "14",
        "text-anchor": "middle",
        "dominant-baseline": "middle",
      });
      label.textContent = gasNames[i];
      svg.appendChild(label);
    });

    // Draw inner zone labels
    const zones = [
      { code: "PD", angle: 288, distance: r / 2 },
      { code: "T1", angle: 0, distance: r / 2 },
      { code: "T2", angle: 72, distance: r / 2 },
      { code: "T3", angle: 144, distance: r / 2 },
      { code: "D1", angle: 216, distance: r / 2 },
      { code: "DT", angle: -90, distance: r / 3 },
    ];

    zones.forEach(zone => {
      const x = cx + zone.distance * Math.cos((zone.angle * Math.PI) / 180);
      const y = cy - zone.distance * Math.sin((zone.angle * Math.PI) / 180);
      const label = createEl("text", {
        x,
        y,
        "font-size": "12",
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        fill: "#000",
      });
      label.textContent = zone.code;
      svg.appendChild(label);
    });

    // Render the given sample point if provided
    if (sample) {
      const { h2, ch4, c2h6, c2h4, c2h2 } = sample;
      const total = h2 + ch4 + c2h6 + c2h4 + c2h2;
      if (total <= 0)
        throw new Error("Gas concentrations must sum to a positive value.");
      const h2Perc = (h2 / total) * 100;
      const ch4Perc = (ch4 / total) * 100;
      const c2h6Perc = (c2h6 / total) * 100;
      const c2h4Perc = (c2h4 / total) * 100;
      const c2h2Perc = (c2h2 / total) * 100;

      const px =
        cx +
        r *
          (h2Perc * Math.cos(angles[0]) +
            ch4Perc * Math.cos(angles[1]) +
            c2h6Perc * Math.cos(angles[2]) +
            c2h4Perc * Math.cos(angles[3]) +
            c2h2Perc * Math.cos(angles[4])) /
          100;
      const py =
        cy -
        r *
          (h2Perc * Math.sin(angles[0]) +
            ch4Perc * Math.sin(angles[1]) +
            c2h6Perc * Math.sin(angles[2]) +
            c2h4Perc * Math.sin(angles[3]) +
            c2h2Perc * Math.sin(angles[4])) /
          100;

      const point = createEl("circle", {
        cx: px,
        cy: py,
        r: 5,
        fill: "red",
        stroke: "#000",
        "stroke-width": 1,
      });
      svg.appendChild(point);
    }
  },
};
