const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const total = ch4 + c2h4 + c2h6;
    if (total === 0) return "N/A";
    const u = (c2h4 / total) * 100; // %C2H4 (Ethylene)
    const w = (c2h6 / total) * 100; // %C2H6 (Ethane)

    if (u < 12) {
      return w >= 13 ? "S" : "O";
    } else if (u < 50) {
      return w >= 35 ? "C" : "T2";
    } else {
      return "T3";
    }
  },

  render(svg, sample) {
    const NS = "http://www.w3.org/2000/svg";
    const xL = 80, yL = 460;
    const xR = 520, yR = 460;
    const xT = 300, yT = 79; // Height ~381 for side 440

    function getXY(u, v, w) {
      const x = (xL * w + xR * u + xT * v) / 100;
      const y = (yL * w + yR * u + yT * v) / 100;
      return `${x},${y}`;
    }

    const zones = [
      {
        id: "S",
        name: "Stray Gassing (S)",
        color: "#e0e0e0",
        pts: [
          [0, 0, 100], [0, 87, 13], [12, 75, 13], [12, 0, 88]
        ]
      },
      {
        id: "O",
        name: "Overheating (O)",
        color: "#fff9c4",
        pts: [
          [0, 87, 13], [0, 100, 0], [12, 88, 0], [12, 75, 13]
        ]
      },
      {
        id: "T2",
        name: "Thermal Fault 300-700°C (T2)",
        color: "#ffab91",
        pts: [
          [12, 88, 0], [50, 50, 0], [50, 15, 35], [12, 53, 35]
        ]
      },
      {
        id: "C",
        name: "Carbonization (C)",
        color: "#ffcc80",
        pts: [
          [12, 53, 35], [50, 15, 35], [50, 0, 50], [12, 0, 88]
        ]
      },
      {
        id: "T3",
        name: "Thermal Fault >700°C (T3)",
        color: "#ef5350",
        pts: [
          [50, 50, 0], [100, 0, 0], [50, 0, 50]
        ]
      }
    ];

    zones.forEach(z => {
      const poly = document.createElementNS(NS, "polygon");
      const pointsStr = z.pts.map(p => getXY(p[0], p[1], p[2])).join(" ");
      poly.setAttribute("points", pointsStr);
      poly.setAttribute("fill", z.color);
      poly.setAttribute("stroke", "#333");
      poly.setAttribute("stroke-width", "1");
      svg.appendChild(poly);

      // Label
      const sum = z.pts.reduce((a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], [0, 0, 0]);
      const center = sum.map(s => s / z.pts.length);
      const [cx, cy] = getXY(center[0], center[1], center[2]).split(",").map(Number);
      const text = document.createElementNS(NS, "text");
      text.setAttribute("x", cx);
      text.setAttribute("y", cy);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("font-size", "14");
      text.setAttribute("font-weight", "bold");
      text.setAttribute("fill", "rgba(0,0,0,0.6)");
      text.textContent = z.id;
      svg.appendChild(text);
    });

    // Grid and Ticks
    for (let i = 10; i < 100; i += 10) {
      const lineC2H4 = document.createElementNS(NS, "line");
      const p1 = getXY(i, 0, 100 - i), p2 = getXY(i, 100 - i, 0);
      lineC2H4.setAttribute("x1", p1.split(",")[0]); lineC2H4.setAttribute("y1", p1.split(",")[1]);
      lineC2H4.setAttribute("x2", p2.split(",")[0]); lineC2H4.setAttribute("y2", p2.split(",")[1]);
      lineC2H4.setAttribute("stroke", "rgba(0,0,0,0.1)");
      svg.appendChild(lineC2H4);
    }

    // Axis Labels
    const labels = [
      { text: "% CH4", x: 300, y: 60 },
      { text: "% C2H4", x: 540, y: 480 },
      { text: "% C2H6", x: 60, y: 480 }
    ];
    labels.forEach(l => {
      const t = document.createElementNS(NS, "text");
      t.setAttribute("x", l.x); t.setAttribute("y", l.y);
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("font-size", "16");
      t.setAttribute("font-weight", "bold");
      t.textContent = l.text;
      svg.appendChild(t);
    });

    // Plot Sample
    if (sample && (sample.ch4 || sample.c2h4 || sample.c2h6)) {
      const total = sample.ch4 + sample.c2h4 + sample.c2h6;
      if (total > 0) {
        const u = (sample.c2h4 / total) * 100;
        const v = (sample.ch4 / total) * 100;
        const w = (sample.c2h6 / total) * 100;
        const [sx, sy] = getXY(u, v, w).split(",").map(Number);
        
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
  }
};
