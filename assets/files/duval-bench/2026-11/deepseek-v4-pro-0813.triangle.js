const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const total = ch4 + c2h4 + c2h2;
    if (total <= 0) return "";
    const x = (100 * c2h4) / total; // %C2H4
    const y = (100 * ch4) / total;  // %CH4
    const z = (100 * c2h2) / total; // %C2H2

    if (y >= 98) return "PD";
    if (z < 4) {
      if (x < 20) return "T1";
      if (x < 50) return "T2";
      return "T3";
    }
    if (z < 13) {
      if (x < 50) return "DT";
      return "T3";
    }
    if (x < 23) return "D1";
    return "D2";
  },

  render(svg, sample) {
    const NS = "http://www.w3.org/2000/svg";
    const clear = () => {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
    };
    const el = (name, attrs) => {
      const e = document.createElementNS(NS, name);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      return e;
    };

    clear();

    // Equilateral triangle geometry
    const baseLen = 420;
    const cx = 300;
    const baseY = 480;
    const leftX = cx - baseLen / 2;   // 90
    const rightX = cx + baseLen / 2;  // 510
    const topY = baseY - (baseLen * Math.sqrt(3)) / 2; // ~116.27

    // Data coordinates: x = %C2H4, y = %CH4, z = %C2H2 = 100 - x - y
    const toXY = (x, y) => {
      const z = 100 - x - y;
      const px = (z * leftX + x * rightX + y * cx) / 100;
      const py = (z * baseY + x * baseY + y * topY) / 100;
      return [px, py];
    };

    const zoneData = {
      PD: [[0, 98], [2, 98], [0, 100]],
      T1: [[0, 96], [0, 98], [2, 98], [20, 80], [20, 76]],
      T2: [[20, 76], [20, 80], [50, 50], [50, 46]],
      T3: [[50, 37], [50, 50], [100, 0], [87, 0]],
      DT: [[0, 96], [0, 87], [50, 37], [50, 46]],
      D1: [[0, 0], [23, 0], [23, 64], [0, 87]],
      D2: [[23, 0], [87, 0], [23, 64]]
    };

    const colors = {
      PD: "#ffff99",
      T1: "#ccebc5",
      T2: "#a6cee3",
      T3: "#fdbf6f",
      DT: "#cab2d6",
      D1: "#fb9a99",
      D2: "#ffcccc"
    };

    // Draw zones
    for (const [code, pts] of Object.entries(zoneData)) {
      const points = pts.map(([x, y]) => toXY(x, y).join(",")).join(" ");
      const polygon = el("polygon", {
        points: points,
        fill: colors[code] || "#eeeeee",
        stroke: "none"
      });
      svg.appendChild(polygon);
    }

    // Zone labels at approximate centroids
    const labelPos = {
      PD: [0.7, 98.7],
      T1: [8, 88],
      T2: [32, 73],
      T3: [72, 30],
      DT: [25, 55],
      D1: [11, 35],
      D2: [40, 25]
    };
    for (const [code, [lx, ly]] of Object.entries(labelPos)) {
      const [px, py] = toXY(lx, ly);
      const text = el("text", {
        x: px,
        y: py,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        "font-size": "14",
        "font-weight": "bold",
        fill: "#000000"
      });
      text.textContent = code;
      svg.appendChild(text);
    }

    // Triangle outline
    const outlinePoints = [
      [leftX, baseY],
      [rightX, baseY],
      [cx, topY]
    ].join(" ");
    const outline = el("polygon", {
      points: outlinePoints,
      fill: "none",
      stroke: "#000000",
      "stroke-width": "2"
    });
    svg.appendChild(outline);

    // Tick marks and gas names
    const sides = [
      [leftX, baseY, rightX, baseY], // C2H2 - C2H4 (bottom)
      [leftX, baseY, cx, topY],      // C2H2 - CH4 (left)
      [rightX, baseY, cx, topY]      // C2H4 - CH4 (right)
    ];

    for (const [xA, yA, xB, yB] of sides) {
      const dx = xB - xA;
      const dy = yB - yA;
      const len = Math.hypot(dx, dy);
      const nx = -dy / len;
      const ny = dx / len;

      for (let i = 0; i <= 5; i++) {
        const t = i / 5;
        const x = xA + dx * t;
        const y = yA + dy * t;
        const tx = nx * 6;
        const ty = ny * 6;

        const tick = el("line", {
          x1: x - tx,
          y1: y - ty,
          x2: x + tx,
          y2: y + ty,
          stroke: "#000000",
          "stroke-width": "1.5"
        });
        svg.appendChild(tick);

        const lx = x - nx * 18;
        const ly = y - ny * 18;
        const label = el("text", {
          x: lx,
          y: ly,
          "text-anchor": "middle",
          "dominant-baseline": "middle",
          "font-size": "10",
          fill: "#000000"
        });
        label.textContent = String(i * 20);
        svg.appendChild(label);
      }
    }

    // Gas names at vertices
    const names = [
      ["C2H2", leftX - 25, baseY + 25],
      ["C2H4", rightX + 25, baseY + 25],
      ["CH4", cx, topY - 25]
    ];
    for (const [name, nx, ny] of names) {
      const text = el("text", {
        x: nx,
        y: ny,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        "font-size": "16",
        "font-weight": "bold",
        fill: "#000000"
      });
      text.textContent = name;
      svg.appendChild(text);
    }

    // Sample point
    if (sample && typeof sample.ch4 === "number" && typeof sample.c2h4 === "number" && typeof sample.c2h2 === "number") {
      const total = sample.ch4 + sample.c2h4 + sample.c2h2;
      if (total > 0) {
        const x = (100 * sample.c2h4) / total;
        const y = (100 * sample.ch4) / total;
        const [px, py] = toXY(x, y);
        const circle = el("circle", {
          cx: px,
          cy: py,
          r: 5,
          fill: "#ff0000",
          stroke: "#000000",
          "stroke-width": "1.5"
        });
        svg.appendChild(circle);

        const code = DuvalTriangle.classify(sample.ch4, sample.c2h4, sample.c2h2);
        const label = el("text", {
          x: px + 10,
          y: py - 10,
          "text-anchor": "start",
          "dominant-baseline": "middle",
          "font-size": "12",
          fill: "#000000"
        });
        label.textContent = code;
        svg.appendChild(label);
      }
    }
  }
};
