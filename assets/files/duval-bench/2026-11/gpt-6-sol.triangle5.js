const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const total = ch4 + c2h4 + c2h6;
    const methane = 100 * ch4 / total;
    const ethylene = 100 * c2h4 / total;
    const ethane = 100 * c2h6 / total;

    if (ethylene >= 50) return "T3";
    if (ethylene >= 30) return "T2";
    if (ethylene >= 10) return methane >= 40 ? "C" : "T2";
    return ethane >= 60 ? "S" : "O";
  },

  render(svg, sample) {
    const ns = "http://www.w3.org/2000/svg";
    const vertices = {
      ch4:  { x: 70,  y: 455 },
      c2h4: { x: 530, y: 455 },
      c2h6: { x: 300, y: 57 }
    };

    function element(name, attributes, parent = svg) {
      const node = document.createElementNS(ns, name);
      for (const [key, value] of Object.entries(attributes)) {
        node.setAttribute(key, String(value));
      }
      parent.appendChild(node);
      return node;
    }

    function text(content, x, y, attributes = {}) {
      const node = element("text", {
        x, y,
        "text-anchor": "middle",
        "font-family": "Arial, sans-serif",
        ...attributes
      });
      node.textContent = content;
      return node;
    }

    function position(p) {
      return {
        x: (p.ch4 * vertices.ch4.x +
            p.c2h4 * vertices.c2h4.x +
            p.c2h6 * vertices.c2h6.x) / 100,
        y: (p.ch4 * vertices.ch4.y +
            p.c2h4 * vertices.c2h4.y +
            p.c2h6 * vertices.c2h6.y) / 100
      };
    }

    function clip(polygon, gas, limit, keepGreater) {
      const result = [];
      for (let i = 0; i < polygon.length; i++) {
        const start = polygon[i];
        const end = polygon[(i + 1) % polygon.length];
        const startInside = keepGreater
          ? start[gas] >= limit - 1e-9
          : start[gas] <= limit + 1e-9;
        const endInside = keepGreater
          ? end[gas] >= limit - 1e-9
          : end[gas] <= limit + 1e-9;

        if (startInside !== endInside) {
          const t = (limit - start[gas]) / (end[gas] - start[gas]);
          result.push({
            ch4: start.ch4 + t * (end.ch4 - start.ch4),
            c2h4: start.c2h4 + t * (end.c2h4 - start.c2h4),
            c2h6: start.c2h6 + t * (end.c2h6 - start.c2h6)
          });
        }
        if (endInside) result.push(end);
      }
      return result;
    }

    const triangle = [
      { ch4: 100, c2h4: 0, c2h6: 0 },
      { ch4: 0, c2h4: 100, c2h6: 0 },
      { ch4: 0, c2h4: 0, c2h6: 100 }
    ];

    // Each constraint is [gas, percentage, keep values at or above limit].
    const zones = [
      {
        code: "S", color: "#d9e9f7",
        constraints: [["c2h4", 10, false], ["c2h6", 60, true]]
      },
      {
        code: "O", color: "#e4efd4",
        constraints: [["c2h4", 10, false], ["c2h6", 60, false]]
      },
      {
        code: "C", color: "#f9e4ac",
        constraints: [
          ["c2h4", 10, true], ["c2h4", 30, false],
          ["ch4", 40, true]
        ]
      },
      {
        code: "T2", color: "#f8c99e",
        constraints: [
          ["c2h4", 10, true], ["c2h4", 30, false],
          ["ch4", 40, false]
        ]
      },
      {
        code: "T2", color: "#f8c99e",
        constraints: [["c2h4", 30, true], ["c2h4", 50, false]]
      },
      {
        code: "T3", color: "#eea5a5",
        constraints: [["c2h4", 50, true]]
      }
    ];

    svg.replaceChildren();
    element("rect", { x: 0, y: 0, width: 600, height: 540, fill: "white" });

    for (const zone of zones) {
      let polygon = triangle;
      for (const [gas, limit, keepGreater] of zone.constraints) {
        polygon = clip(polygon, gas, limit, keepGreater);
      }
      if (polygon.length < 3) continue;
      const points = polygon.map(p => {
        const q = position(p);
        return `${q.x},${q.y}`;
      }).join(" ");
      element("polygon", {
        points,
        fill: zone.color,
        stroke: "#777",
        "stroke-width": 1.2,
        "stroke-linejoin": "round"
      });
    }

    const labels = [
      ["S",  9,  4, 87],
      ["O", 65,  5, 30],
      ["C", 62, 20, 18],
      ["T2", 27, 37, 36],
      ["T3", 10, 75, 15]
    ];
    for (const [code, ch4, c2h4, c2h6] of labels) {
      const p = position({ ch4, c2h4, c2h6 });
      text(code, p.x, p.y + 6, {
        fill: "#263238",
        "font-size": 19,
        "font-weight": "bold"
      });
    }

    element("polygon", {
      points: "70,455 530,455 300,57",
      fill: "none",
      stroke: "#202830",
      "stroke-width": 2.5,
      "stroke-linejoin": "round"
    });

    function tick(p, dx, dy, label) {
      element("line", {
        x1: p.x, y1: p.y,
        x2: p.x + dx * 9, y2: p.y + dy * 9,
        stroke: "#202830", "stroke-width": 1.4
      });
      if (label !== null) {
        text(label, p.x + dx * 23, p.y + dy * 23 + 4, {
          fill: "#34404a", "font-size": 11
        });
      }
    }

    for (let value = 0; value <= 100; value += 10) {
      const label = value > 0 && value < 100 && value % 20 === 0
        ? String(value)
        : null;
      tick(position({
        ch4: value, c2h4: 100 - value, c2h6: 0
      }), 0, 1, label);
      tick(position({
        ch4: 0, c2h4: value, c2h6: 100 - value
      }), 0.866, -0.5, label);
      tick(position({
        ch4: 100 - value, c2h4: 0, c2h6: value
      }), -0.866, -0.5, label);
    }

    text("CH₄ (%)", 300, 525, {
      fill: "#202830", "font-size": 16, "font-weight": "bold"
    });
    text("C₂H₄ (%)", 555, 267, {
      fill: "#202830", "font-size": 16, "font-weight": "bold",
      transform: "rotate(-60 555 267)"
    });
    text("C₂H₆ (%)", 45, 267, {
      fill: "#202830", "font-size": 16, "font-weight": "bold",
      transform: "rotate(60 45 267)"
    });

    if (sample !== null) {
      const total = sample.ch4 + sample.c2h4 + sample.c2h6;
      const p = position({
        ch4: 100 * sample.ch4 / total,
        c2h4: 100 * sample.c2h4 / total,
        c2h6: 100 * sample.c2h6 / total
      });
      element("circle", {
        cx: p.x, cy: p.y, r: 7,
        fill: "#17232e", stroke: "white", "stroke-width": 2
      });
    }
  }
};
