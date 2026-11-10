const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const values = [ch4, c2h4, c2h2];
    if (!values.every(Number.isFinite) || values.some(value => value < 0)) {
      throw new TypeError("Gas concentrations must be non-negative finite numbers.");
    }

    const total = ch4 + c2h4 + c2h2;
    if (!(total > 0) || !Number.isFinite(total)) {
      throw new TypeError("The sum of gas concentrations must be greater than zero.");
    }

    const ethylene = (c2h4 / total) * 100;
    const acetylene = (c2h2 / total) * 100;
    const available = Math.max(0, 100 - acetylene);
    const position = available > 0 ? ethylene / available : 0;

    let band;
    if (acetylene < 4) band = 0;
    else if (acetylene < 13) band = 1;
    else if (acetylene < 29) band = 2;
    else band = 3;

    const bands = [
      { cuts: [0.07, 0.20, 0.50, 1], zones: ["PD", "T1", "T2", "T3"] },
      { cuts: [0.18, 0.48, 1], zones: ["T1", "T2", "T3"] },
      { cuts: [0.35, 0.72, 1], zones: ["D1", "D2", "T3"] },
      { cuts: [0.38, 1], zones: ["D1", "D2"] }
    ];

    const row = bands[band];
    for (let i = 0; i < row.cuts.length; i++) {
      if (position <= row.cuts[i] || i === row.cuts.length - 1) {
        return row.zones[i];
      }
    }
    return "D2";
  },

  render(svg, sample) {
    const ns = "http://www.w3.org/2000/svg";
    const left = { x: 100, y: 460 };
    const right = { x: 500, y: 460 };
    const top = { x: 300, y: 100 };
    const colors = {
      PD: "#d6e8f5",
      D1: "#f3c7c7",
      D2: "#e99b9b",
      T1: "#f7edb5",
      T2: "#f6d27e",
      T3: "#e9a456"
    };
    const bands = [
      { low: 0, high: 4, cuts: [0.07, 0.20, 0.50, 1], zones: ["PD", "T1", "T2", "T3"] },
      { low: 4, high: 13, cuts: [0.18, 0.48, 1], zones: ["T1", "T2", "T3"] },
      { low: 13, high: 29, cuts: [0.35, 0.72, 1], zones: ["D1", "D2", "T3"] },
      { low: 29, high: 100, cuts: [0.38, 1], zones: ["D1", "D2"] }
    ];

    const make = (name, attrs, text) => {
      const element = document.createElementNS(ns, name);
      for (const [key, value] of Object.entries(attrs || {})) {
        element.setAttribute(key, String(value));
      }
      if (text !== undefined) element.textContent = text;
      return element;
    };
    const point = (ethylene, acetylene) => ({
      x: left.x + 4 * (ethylene + acetylene / 2),
      y: left.y - 3.6 * acetylene
    });
    const polygonPoints = points => points.map(p => `${p.x},${p.y}`).join(" ");

    svg.setAttribute("xmlns", ns);
    svg.setAttribute("viewBox", "0 0 600 540");
    svg.appendChild(make("rect", {
      x: 0, y: 0, width: 600, height: 540, fill: "#ffffff"
    }));

    const largest = {};
    for (const band of bands) {
      const lowAvailable = 100 - band.low;
      const highAvailable = 100 - band.high;
      const fractions = [0, ...band.cuts];

      for (let i = 0; i < band.zones.length; i++) {
        const f0 = fractions[i];
        const f1 = fractions[i + 1];
        const polygon = [
          point(f0 * lowAvailable, band.low),
          point(f1 * lowAvailable, band.low),
          point(f1 * highAvailable, band.high),
          point(f0 * highAvailable, band.high)
        ];

        svg.appendChild(make("polygon", {
          points: polygonPoints(polygon),
          fill: colors[band.zones[i]],
          stroke: "#ffffff",
          "stroke-width": 1.2
        }));

        const area = Math.abs(polygon.reduce((sum, p, j) => {
          const q = polygon[(j + 1) % polygon.length];
          return sum + p.x * q.y - q.x * p.y;
        }, 0)) / 2;

        const zone = band.zones[i];
        if (!largest[zone] || area > largest[zone].area) {
          largest[zone] = {
            area,
            x: polygon.reduce((sum, p) => sum + p.x, 0) / polygon.length,
            y: polygon.reduce((sum, p) => sum + p.y, 0) / polygon.length
          };
        }
      }
    }

    for (const [zone, center] of Object.entries(largest)) {
      svg.appendChild(make("text", {
        x: center.x,
        y: center.y,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        "font-family": "Arial, sans-serif",
        "font-size": zone === "PD" ? 11 : 14,
        "font-weight": "bold",
        fill: "#333333",
        "pointer-events": "none"
      }, zone));
    }

    const centroid = {
      x: (left.x + right.x + top.x) / 3,
      y: (left.y + right.y + top.y) / 3
    };

    const addTick = (a, b, t, label, side) => {
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      let nx = -(b.y - a.y);
      let ny = b.x - a.x;
      const length = Math.hypot(nx, ny) || 1;
      nx /= length;
      ny /= length;
      const testX = x + nx * 8;
      const testY = y + ny * 8;
      if (Math.hypot(testX - centroid.x, testY - centroid.y) <
          Math.hypot(x - centroid.x, y - centroid.y)) {
        nx = -nx;
        ny = -ny;
      }
      svg.appendChild(make("line", {
        x1: x, y1: y, x2: x + nx * 6, y2: y + ny * 6,
        stroke: "#333333", "stroke-width": 1
      }));
      svg.appendChild(make("text", {
        x: x + nx * 17,
        y: y + ny * 17,
        "text-anchor": side,
        "dominant-baseline": "middle",
        "font-family": "Arial, sans-serif",
        "font-size": 10,
        fill: "#333333"
      }, String(label)));
    };

    // Percentage scales: CH4 on the left edge, C2H4 on the base,
    // and C2H2 on the right edge.
    for (let value = 10; value <= 90; value += 10) {
      const t = value / 100;
      addTick(top, left, t, value, "end");
      addTick(left, right, t, value, "middle");
      addTick(right, top, t, value, "start");
    }

    svg.appendChild(make("polygon", {
      points: polygonPoints([left, right, top]),
      fill: "none",
      stroke: "#222222",
      "stroke-width": 2
    }));

    svg.appendChild(make("text", {
      x: 82, y: 482, "text-anchor": "start",
      "font-family": "Arial, sans-serif", "font-size": 14,
      "font-weight": "bold", fill: "#222222"
    }, "CH₄"));
    svg.appendChild(make("text", {
      x: 518, y: 482, "text-anchor": "end",
      "font-family": "Arial, sans-serif", "font-size": 14,
      "font-weight": "bold", fill: "#222222"
    }, "C₂H₄"));
    svg.appendChild(make("text", {
      x: 300, y: 78, "text-anchor": "middle",
      "font-family": "Arial, sans-serif", "font-size": 14,
      "font-weight": "bold", fill: "#222222"
    }, "C₂H₂"));

    if (sample !== null && sample !== undefined) {
      const values = [sample.ch4, sample.c2h4, sample.c2h2];
      if (!values.every(Number.isFinite) || values.some(value => value < 0) ||
          !(sample.ch4 + sample.c2h4 + sample.c2h2 > 0)) {
        throw new TypeError("Sample concentrations must be non-negative and have a positive sum.");
      }
      const total = sample.ch4 + sample.c2h4 + sample.c2h2;
      const p = point(
        (sample.c2h4 / total) * 100,
        (sample.c2h2 / total) * 100
      );
      svg.appendChild(make("circle", {
        cx: p.x, cy: p.y, r: 7,
        fill: "#111111", stroke: "#ffffff", "stroke-width": 2
      }));
      svg.appendChild(make("circle", {
        cx: p.x, cy: p.y, r: 2, fill: "#ffffff"
      }));
    }
  }
};
