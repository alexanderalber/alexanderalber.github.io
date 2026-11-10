const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    // Scale first to avoid overflow when summing large concentrations.
    const max = Math.max(ch4, c2h4, c2h2);
    const m = ch4 / max;
    const e = c2h4 / max;
    const a = c2h2 / max;
    const total = m + e + a;
    const ethylene = 100 * e / total;
    const acetylene = 100 * a / total;

    // Shared boundaries are assigned in the order of these tests.
    if (ethylene + acetylene <= 2) return "PD";
    if (acetylene <= 4 && ethylene <= 20) return "T1";
    if (acetylene <= 4 && ethylene <= 50) return "T2";
    if (acetylene <= 15 && ethylene >= 50) return "T3";
    if (acetylene >= 13 && ethylene <= 23) return "D1";
    if (
      (acetylene >= 13 && ethylene >= 23 && ethylene <= 40) ||
      (acetylene >= 15 && ethylene >= 40)
    ) return "D2";
    return "DT";
  },

  render(svg, sample) {
    const ns = "http://www.w3.org/2000/svg";
    const top = { x: 300, y: 45 };
    const left = { x: 74, y: 436 };
    const right = { x: 526, y: 436 };

    svg.replaceChildren();

    function element(name, attributes, text) {
      const node = document.createElementNS(ns, name);
      for (const [key, value] of Object.entries(attributes)) {
        node.setAttribute(key, String(value));
      }
      if (text !== undefined) node.textContent = text;
      svg.appendChild(node);
      return node;
    }

    // Coordinates are percentages of ethylene and acetylene.
    function point(ethylene, acetylene) {
      const methane = 100 - ethylene - acetylene;
      return {
        x: (methane * top.x + ethylene * right.x + acetylene * left.x) / 100,
        y: (methane * top.y + ethylene * right.y + acetylene * left.y) / 100
      };
    }

    function line(x1, y1, x2, y2, attributes = {}) {
      element("line", {
        x1, y1, x2, y2,
        stroke: "#222",
        "stroke-width": 1,
        ...attributes
      });
    }

    function text(x, y, value, attributes = {}) {
      element("text", {
        x, y,
        fill: "#111",
        "font-family": "Arial, sans-serif",
        "font-size": 12,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        ...attributes
      }, value);
    }

    const zones = [
      {
        code: "PD",
        color: "#f4d35e",
        vertices: [[0, 0], [2, 0], [0, 2]]
      },
      {
        code: "T1",
        color: "#b8df8d",
        vertices: [[2, 0], [20, 0], [20, 4], [0, 4], [0, 2]],
        label: [10, 2]
      },
      {
        code: "T2",
        color: "#f6c77a",
        vertices: [[20, 0], [50, 0], [50, 4], [20, 4]],
        label: [35, 2]
      },
      {
        code: "T3",
        color: "#ee9691",
        vertices: [[50, 0], [100, 0], [85, 15], [50, 15]],
        label: [65, 7]
      },
      {
        code: "D1",
        color: "#9bc9eb",
        vertices: [[0, 13], [23, 13], [23, 77], [0, 100]],
        label: [10, 50]
      },
      {
        code: "D2",
        color: "#b3a4dc",
        vertices: [[23, 13], [40, 13], [40, 15], [85, 15], [23, 77]],
        label: [37, 37]
      },
      {
        code: "DT",
        color: "#d6c7ac",
        vertices: [[0, 4], [20, 4], [50, 4], [50, 15], [40, 15], [40, 13], [23, 13], [0, 13]],
        label: [20, 8]
      }
    ];

    for (const zone of zones) {
      const points = zone.vertices.map(([e, a]) => {
        const p = point(e, a);
        return `${p.x},${p.y}`;
      }).join(" ");
      element("polygon", {
        points,
        fill: zone.color,
        stroke: "#333",
        "stroke-width": 1,
        "stroke-linejoin": "round"
      });
    }

    for (const zone of zones) {
      if (zone.label) {
        const p = point(...zone.label);
        text(p.x, p.y, zone.code, {
          "font-size": 12,
          "font-weight": "bold"
        });
      }
    }

    // The PD region is too small for an internal label.
    const pd = point(0.7, 0.7);
    line(326, 30, pd.x, pd.y, { "stroke-width": 0.8 });
    text(339, 27, "PD", { "font-weight": "bold" });

    element("polygon", {
      points: `${top.x},${top.y} ${right.x},${right.y} ${left.x},${left.y}`,
      fill: "none",
      stroke: "#111",
      "stroke-width": 1.5
    });

    // Bottom axis: ethylene increases from left to right.
    for (let i = 0; i <= 100; i += 10) {
      const x = left.x + (right.x - left.x) * i / 100;
      line(x, left.y, x, left.y + 6);
      text(x, left.y + 17, i, { "font-size": 10 });
    }
    text(300, 491, "C₂H₄ (%)", { "font-size": 14, "font-weight": "bold" });

    // Left axis: acetylene increases from the top to the left vertex.
    // Right axis: methane increases from the right vertex to the top.
    const nx = 0.866;
    const ny = 0.5;
    for (let i = 0; i <= 100; i += 10) {
      const t = i / 100;
      const lx = top.x + (left.x - top.x) * t;
      const ly = top.y + (left.y - top.y) * t;
      line(lx, ly, lx - 6 * nx, ly - 6 * ny);
      text(lx - 19 * nx, ly - 19 * ny, i, { "font-size": 10 });

      const rx = top.x + (right.x - top.x) * t;
      const ry = top.y + (right.y - top.y) * t;
      line(rx, ry, rx + 6 * nx, ry - 6 * ny);
      text(rx + 19 * nx, ry - 19 * ny, 100 - i, { "font-size": 10 });
    }

    text(145, 216, "C₂H₂ (%)", {
      "font-size": 14,
      "font-weight": "bold",
      transform: "rotate(-60 145 216)"
    });
    text(455, 216, "CH₄ (%)", {
      "font-size": 14,
      "font-weight": "bold",
      transform: "rotate(60 455 216)"
    });

    if (sample !== null) {
      const max = Math.max(sample.ch4, sample.c2h4, sample.c2h2);
      const m = sample.ch4 / max;
      const e = sample.c2h4 / max;
      const a = sample.c2h2 / max;
      const total = m + e + a;
      const p = point(100 * e / total, 100 * a / total);
      element("circle", {
        cx: p.x,
        cy: p.y,
        r: 5,
        fill: "#111",
        stroke: "#fff",
        "stroke-width": 2
      });
    }
  }
};
