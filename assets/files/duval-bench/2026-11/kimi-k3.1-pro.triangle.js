"use strict";

const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const total = ch4 + c2h4 + c2h2;
    const point = [
      100 * ch4 / total,
      100 * c2h4 / total,
      100 * c2h2 / total
    ];

    // Polygon vertices are [CH4, C2H4, C2H2], in percent.
    const zones = [
      ["PD", [
        [100, 0, 0], [98, 0, 2], [98, 2, 0]
      ]],
      ["D2", [
        [71, 0, 29], [0, 0, 100], [0, 71, 29],
        [46, 50, 4], [31, 40, 29]
      ]],
      ["D1", [
        [96, 0, 4], [71, 0, 29], [31, 40, 29],
        [87, 0, 13], [76, 20, 4]
      ]],
      ["DT", [
        [76, 20, 4], [87, 0, 13], [31, 40, 29], [46, 50, 4]
      ]],
      ["T3", [
        [50, 50, 0], [0, 100, 0], [0, 71, 29], [46, 50, 4]
      ]],
      ["T2", [
        [80, 20, 0], [50, 50, 0], [46, 50, 4], [76, 20, 4]
      ]],
      ["T1", [
        [98, 2, 0], [80, 20, 0], [76, 20, 4],
        [96, 0, 4], [98, 0, 2]
      ]]
    ];

    function contains(polygon, p) {
      const x = p[1] + p[2] / 2;
      const y = p[2];
      let inside = false;

      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[j];
        const b = polygon[i];
        const ax = a[1] + a[2] / 2;
        const ay = a[2];
        const bx = b[1] + b[2] / 2;
        const by = b[2];

        const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
        if (
          Math.abs(cross) < 1e-7 &&
          x >= Math.min(ax, bx) - 1e-7 &&
          x <= Math.max(ax, bx) + 1e-7 &&
          y >= Math.min(ay, by) - 1e-7 &&
          y <= Math.max(ay, by) + 1e-7
        ) {
          return true;
        }

        if (
          (ay > y) !== (by > y) &&
          x < (bx - ax) * (y - ay) / (by - ay) + ax
        ) {
          inside = !inside;
        }
      }
      return inside;
    }

    for (const zone of zones) {
      if (contains(zone[1], point)) {
        return zone[0];
      }
    }

    // Only reachable through negligible floating-point roundoff.
    return point[2] >= 29 ? "D2" : point[2] >= 4 ? "DT" : "T1";
  },

  render(svg, sample) {
    const NS = "http://www.w3.org/2000/svg";

    function element(name, attributes, text) {
      const node = document.createElementNS(NS, name);
      for (const key in attributes) {
        node.setAttribute(key, attributes[key]);
      }
      if (text !== undefined) {
        node.textContent = text;
      }
      svg.appendChild(node);
      return node;
    }

    function xy(gas) {
      const ch4 = gas[0];
      const c2h4 = gas[1];
      const c2h2 = gas[2];
      return [
        80 + 4.4 * c2h4 + 2.2 * c2h2,
        450 - 3.8 * c2h2
      ];
    }

    const zones = [
      {
        code: "PD",
        color: "#fff2a8",
        label: [99, 0.65, 0.35],
        size: 9,
        polygon: [[100, 0, 0], [98, 0, 2], [98, 2, 0]]
      },
      {
        code: "T1",
        color: "#bfe3b4",
        label: [87, 10, 1.5],
        size: 15,
        polygon: [
          [98, 2, 0], [80, 20, 0], [76, 20, 4],
          [96, 0, 4], [98, 0, 2]
        ]
      },
      {
        code: "T2",
        color: "#f6c978",
        label: [65, 33, 1.5],
        size: 15,
        polygon: [
          [80, 20, 0], [50, 50, 0], [46, 50, 4], [76, 20, 4]
        ]
      },
      {
        code: "T3",
        color: "#ed9a82",
        label: [20, 73, 5],
        size: 15,
        polygon: [
          [50, 50, 0], [0, 100, 0], [0, 71, 29], [46, 50, 4]
        ]
      },
      {
        code: "DT",
        color: "#d4b5df",
        label: [60, 25, 15],
        size: 15,
        polygon: [
          [76, 20, 4], [87, 0, 13], [31, 40, 29], [46, 50, 4]
        ]
      },
      {
        code: "D1",
        color: "#9fc9e8",
        label: [75, 10, 15],
        size: 15,
        polygon: [
          [96, 0, 4], [71, 0, 29], [31, 40, 29],
          [87, 0, 13], [76, 20, 4]
        ]
      },
      {
        code: "D2",
        color: "#8299cf",
        label: [24, 35, 41],
        size: 15,
        polygon: [
          [71, 0, 29], [0, 0, 100], [0, 71, 29],
          [46, 50, 4], [31, 40, 29]
        ]
      }
    ];

    element("rect", {
      x: 0, y: 0, width: 600, height: 540, fill: "#ffffff"
    });

    element("text", {
      x: 300, y: 22,
      "text-anchor": "middle",
      "font-family": "Arial, sans-serif",
      "font-size": 17,
      "font-weight": "bold",
      fill: "#263238"
    }, "Duval Triangle 1");

    for (const zone of zones) {
      element("polygon", {
        points: zone.polygon.map(p => xy(p).join(",")).join(" "),
        fill: zone.color,
        stroke: "#ffffff",
        "stroke-width": 1.5,
        "stroke-linejoin": "round"
      });
    }

    // Light percentage grid.
    for (const value of [20, 40, 60, 80]) {
      const lines = [
        [[value, 100 - value, 0], [value, 0, 100 - value]],
        [[100 - value, value, 0], [0, value, 100 - value]],
        [[100 - value, 0, value], [0, 100 - value, value]]
      ];
      for (const line of lines) {
        const a = xy(line[0]);
        const b = xy(line[1]);
        element("line", {
          x1: a[0], y1: a[1], x2: b[0], y2: b[1],
          stroke: "#ffffff",
          "stroke-width": 0.7,
          opacity: 0.45,
          "pointer-events": "none"
        });
      }
    }

    for (const zone of zones) {
      element("polygon", {
        points: zone.polygon.map(p => xy(p).join(",")).join(" "),
        fill: "none",
        stroke: "#59636b",
        "stroke-width": 1,
        "stroke-linejoin": "round"
      });
      const p = xy(zone.label);
      element("text", {
        x: p[0], y: p[1] + zone.size * 0.35,
        "text-anchor": "middle",
        "font-family": "Arial, sans-serif",
        "font-size": zone.size,
        "font-weight": "bold",
        fill: "#263238",
        "pointer-events": "none"
      }, zone.code);
    }

    const A = xy([100, 0, 0]);
    const B = xy([0, 100, 0]);
    const C = xy([0, 0, 100]);

    element("polygon", {
      points: [A, B, C].map(p => p.join(",")).join(" "),
      fill: "none",
      stroke: "#263238",
      "stroke-width": 2,
      "stroke-linejoin": "round"
    });

    // CH4 scale on the left side.
    for (let i = 0; i <= 100; i += 20) {
      const p = xy([100 - i, 0, i]);
      element("line", {
        x1: p[0], y1: p[1], x2: p[0] - 6, y2: p[1],
        stroke: "#263238", "stroke-width": 1
      });
      if (i !== 0 && i !== 100) {
        element("text", {
          x: p[0] - 10, y: p[1] + 4,
          "text-anchor": "end",
          "font-family": "Arial, sans-serif",
          "font-size": 10,
          fill: "#37474f"
        }, String(100 - i));
      }
    }

    // C2H4 scale on the base.
    for (let i = 0; i <= 100; i += 20) {
      const p = xy([100 - i, i, 0]);
      element("line", {
        x1: p[0], y1: p[1], x2: p[0], y2: p[1] + 7,
        stroke: "#263238", "stroke-width": 1
      });
      if (i !== 0 && i !== 100) {
        element("text", {
          x: p[0], y: p[1] + 21,
          "text-anchor": "middle",
          "font-family": "Arial, sans-serif",
          "font-size": 10,
          fill: "#37474f"
        }, String(i));
      }
    }

    // C2H2 scale on the right side.
    for (let i = 0; i <= 100; i += 20) {
      const p = xy([0, 100 - i, i]);
      element("line", {
        x1: p[0], y1: p[1], x2: p[0] + 6, y2: p[1],
        stroke: "#263238", "stroke-width": 1
      });
      if (i !== 0 && i !== 100) {
        element("text", {
          x: p[0] + 10, y: p[1] + 4,
          "text-anchor": "start",
          "font-family": "Arial, sans-serif",
          "font-size": 10,
          fill: "#37474f"
        }, String(i));
      }
    }

    const axisStyle = {
      "font-family": "Arial, sans-serif",
      "font-size": 15,
      "font-weight": "bold",
      fill: "#263238"
    };

    element("text", Object.assign({}, axisStyle, {
      x: 55, y: 452, "text-anchor": "end"
    }), "CH4");
    element("text", Object.assign({}, axisStyle, {
      x: 545, y: 452, "text-anchor": "start"
    }), "C2H4");
    element("text", Object.assign({}, axisStyle, {
      x: 300, y: 53, "text-anchor": "middle"
    }), "C2H2");

    element("text", {
      x: 45, y: 255,
      transform: "rotate(-60 45 255)",
      "text-anchor": "middle",
      "font-family": "Arial, sans-serif",
      "font-size": 11,
      fill: "#546e7a"
    }, "% CH4");
    element("text", {
      x: 300, y: 505,
      "text-anchor": "middle",
      "font-family": "Arial, sans-serif",
      "font-size": 11,
      fill: "#546e7a"
    }, "% C2H4");
    element("text", {
      x: 558, y: 255,
      transform: "rotate(60 558 255)",
      "text-anchor": "middle",
      "font-family": "Arial, sans-serif",
      "font-size": 11,
      fill: "#546e7a"
    }, "% C2H2");

    if (sample !== null) {
      const total = sample.ch4 + sample.c2h4 + sample.c2h2;
      const gas = [
        100 * sample.ch4 / total,
        100 * sample.c2h4 / total,
        100 * sample.c2h2 / total
      ];
      const p = xy(gas);
      const code = this.classify(sample.ch4, sample.c2h4, sample.c2h2);

      element("circle", {
        cx: p[0], cy: p[1], r: 7,
        fill: "#ffffff",
        stroke: "#111111",
        "stroke-width": 2
      });
      element("circle", {
        cx: p[0], cy: p[1], r: 3,
        fill: "#111111"
      });

      const labelX = Math.max(28, Math.min(572, p[0] + 12));
      const anchor = p[0] > 500 ? "end" : "start";
      const adjustedX = p[0] > 500 ? p[0] - 12 : labelX;

      element("text", {
        x: adjustedX,
        y: Math.max(18, p[1] - 10),
        "text-anchor": anchor,
        "font-family": "Arial, sans-serif",
        "font-size": 12,
        "font-weight": "bold",
        fill: "#111111",
        stroke: "#ffffff",
        "stroke-width": 3,
        "paint-order": "stroke"
      }, code);
    }
  }
};
