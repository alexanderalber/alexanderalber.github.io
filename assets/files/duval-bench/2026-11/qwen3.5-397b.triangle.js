const DuvalTriangle = {
  classify: function(ch4, c2h4, c2h2) {
    const total = ch4 + c2h4 + c2h2;
    if (total === 0) return "Unknown";

    const p1 = (ch4 / total) * 100;
    const p2 = (c2h4 / total) * 100;
    const p3 = (c2h2 / total) * 100;

    // Duval Triangle 1 Logic
    if (p3 >= 50) {
      return "D1";
    }
    if (p3 >= 5) {
      if (p2 >= 50) {
        return "D2";
      } else {
        return "DT";
      }
    }
    // p3 < 5 (Thermal / PD)
    if (p2 >= 80) {
      return "T3";
    }
    if (p2 >= 20) {
      return "T2";
    }
    // p2 < 20
    if (p1 >= 98) {
      return "PD";
    }
    return "T1";
  },

  render: function(svg, sample) {
    const NS = "http://www.w3.org/2000/svg";
    const create = (tag, attrs) => {
      const el = document.createElementNS(NS, tag);
      for (const k in attrs) el.setAttribute(k, attrs[k]);
      return el;
    };

    // Helper to convert percentages (ch4, c2h4, c2h2) to SVG coordinates
    // Triangle vertices: CH4(0, 540), C2H4(600, 540), C2H2(300, 0)
    const toCoord = (p1, p2, p3) => {
      const x = (p2 + 0.5 * p3) * 6;
      const y = (1 - p3 / 100) * 540;
      return [x, y];
    };

    const makePoly = (points, color, label) => {
      const g = create("g", {});
      const poly = create("polygon", {
        points: points.map(p => p.join(",")).join(" "),
        fill: color,
        stroke: "#fff",
        "stroke-width": "1",
        "stroke-linejoin": "round"
      });
      g.appendChild(poly);
      if (label) {
        // Simple centroid calculation for label placement
        const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
        const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
        const text = create("text", {
          x: cx,
          y: cy,
          "text-anchor": "middle",
          "dominant-baseline": "middle",
          fill: "#000",
          "font-weight": "bold",
          "font-size": "14px",
          "pointer-events": "none"
        });
        text.textContent = label;
        g.appendChild(text);
      }
      return g;
    };

    // Define Zone Vertices (CH4%, C2H4%, C2H2%)
    // D1: Top
    const d1 = [toCoord(0, 0, 100), toCoord(0, 50, 50), toCoord(50, 0, 50)];
    // D2: Right Mid
    const d2 = [toCoord(0, 50, 50), toCoord(0, 95, 5), toCoord(45, 50, 5)];
    // DT: Center Right
    const dt = [
      toCoord(50, 0, 50), toCoord(0, 50, 50), toCoord(45, 50, 5),
      toCoord(75, 20, 5), toCoord(95, 0, 5)
    ];
    // T3: Bottom Right
    const t3 = [
      toCoord(0, 100, 0), toCoord(0, 95, 5), toCoord(15, 80, 5), toCoord(20, 80, 0)
    ];
    // T2: Bottom Mid
    const t2 = [
      toCoord(20, 80, 0), toCoord(15, 80, 5), toCoord(75, 20, 5), toCoord(80, 20, 0)
    ];
    // T1: Bottom Left (excluding PD)
    const t1 = [
      toCoord(80, 20, 0), toCoord(75, 20, 5), toCoord(95, 0, 5),
      toCoord(98, 0, 2), toCoord(98, 2, 0)
    ];
    // PD: Bottom Left Corner
    const pd = [
      toCoord(98, 2, 0), toCoord(100, 0, 0), toCoord(98, 0, 2)
    ];

    // Colors
    const zones = [
      { poly: d1, color: "#6666ff", label: "D1" },
      { poly: d2, color: "#ff66ff", label: "D2" },
      { poly: dt, color: "#ff9933", label: "DT" },
      { poly: t3, color: "#ff0000", label: "T3" },
      { poly: t2, color: "#ffcc00", label: "T2" },
      { poly: t1, color: "#ffff66", label: "T1" },
      { poly: pd, color: "#00cc00", label: "PD" }
    ];

    // Draw Outline
    const outline = create("polygon", {
      points: "0,540 600,540 300,0",
      fill: "none",
      stroke: "#000",
      "stroke-width": "2"
    });
    svg.appendChild(outline);

    // Draw Zones
    zones.forEach(z => svg.appendChild(makePoly(z.poly, z.color, z.label)));

    // Draw Axes Labels
    const labelAttr = { "font-size": "16px", fill: "#000" };
    
    const v1 = create("text", { x: 300, y: -10, "text-anchor": "middle", ...labelAttr });
    v1.textContent = "C2H2";
    svg.appendChild(v1);

    const v2 = create("text", { x: 580, y: 530, "text-anchor": "end", ...labelAttr });
    v2.textContent = "C2H4";
    svg.appendChild(v2);

    const v3 = create("text", { x: 20, y: 530, "text-anchor": "start", ...labelAttr });
    v3.textContent = "CH4";
    svg.appendChild(v3);

    // Draw Sample Point
    if (sample) {
      const total = sample.ch4 + sample.c2h4 + sample.c2h2;
      if (total > 0) {
        const p1 = (sample.ch4 / total) * 100;
        const p2 = (sample.c2h4 / total) * 100;
        const p3 = (sample.c2h2 / total) * 100;
        const [x, y] = toCoord(p1, p2, p3);
        
        const point = create("circle", {
          cx: x,
          cy: y,
          r: 6,
          fill: "#000",
          stroke: "#fff",
          "stroke-width": 2
        });
        svg.appendChild(point);
      }
    }
  }
};
