const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const total = ch4 + c2h4 + c2h2;
    if (
      ![ch4, c2h4, c2h2].every(Number.isFinite) ||
      ch4 < 0 || c2h4 < 0 || c2h2 < 0 || total <= 0
    ) {
      throw new RangeError("Gas concentrations must be non-negative and sum to more than zero.");
    }

    const methane = 100 * ch4 / total;
    const ethylene = 100 * c2h4 / total;
    const acetylene = 100 * c2h2 / total;

    if (methane >= 98) return "PD";
    if (acetylene <= 4 && ethylene <= 20) return "T1";
    if (acetylene <= 4 && ethylene <= 50) return "T2";
    if (acetylene <= 15 && ethylene >= 50) return "T3";
    if (acetylene >= 13 && ethylene <= 23) return "D1";
    if (acetylene >= 13 && ethylene >= 23) return "D2";
    return "DT";
  },

  render(svg, sample) {
    const NS = "http://www.w3.org/2000/svg";
    const colors = {
      PD: "#d9d5f0",
      T1: "#f8e3a8",
      T2: "#f6bb80",
      T3: "#ef827b",
      DT: "#a9d9bd",
      D1: "#a9c8eb",
      D2: "#7da9d5"
    };

    function element(name, attributes, parent = svg) {
      const node = document.createElementNS(NS, name);
      for (const [key, value] of Object.entries(attributes)) {
        node.setAttribute(key, String(value));
      }
      parent.appendChild(node);
      return node;
    }

    // In percentage coordinates, x is C2H4 and y is C2H2.
    function position(x, y) {
      return [300 + 2.35 * (x - y), 45 + 4.05 * (x + y)];
    }

    function polygonPath(points) {
      return points.map((point, index) => {
        const [x, y] = position(point[0], point[1]);
        return `${index ? "L" : "M"}${x.toFixed(3)} ${y.toFixed(3)}`;
      }).join(" ") + " Z";
    }

    function clip(points, value, limit, keepGreater) {
      const result = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        const da = value(a) - limit;
        const db = value(b) - limit;
        const insideA = keepGreater ? da >= -1e-9 : da <= 1e-9;
        const insideB = keepGreater ? db >= -1e-9 : db <= 1e-9;

        if (insideA) result.push(a);
        if (insideA !== insideB) {
          const t = da / (da - db);
          result.push([
            a[0] + t * (b[0] - a[0]),
            a[1] + t * (b[1] - a[1])
          ]);
        }
      }
      return result;
    }

    function area(points) {
      let twiceArea = 0;
      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        twiceArea += a[0] * b[1] - b[0] * a[1];
      }
      return Math.abs(twiceArea) / 2;
    }

    function zoneAt(x, y) {
      return DuvalTriangle.classify(100 - x - y, x, y);
    }

    function text(label, x, y, attributes = {}) {
      const node = element("text", {
        x, y,
        "text-anchor": "middle",
        "font-family": "Arial, sans-serif",
        ...attributes
      });
      node.textContent = label;
      return node;
    }

    svg.replaceChildren();
    element("rect", { x: 0, y: 0, width: 600, height: 540, fill: "white" });

    // Subdivide at every zone threshold, then fill each resulting cell.
    // Only edges separating different zones are outlined below.
    const ethyleneCuts = [0, 20, 23, 50, 100];
    const acetyleneCuts = [0, 4, 13, 15, 100];
    const methaneCuts = [0, 2, 100]; // Cuts in C2H4 + C2H2.
    const cells = [];

    for (let i = 0; i < ethyleneCuts.length - 1; i++) {
      for (let j = 0; j < acetyleneCuts.length - 1; j++) {
        for (let k = 0; k < methaneCuts.length - 1; k++) {
          let points = [[0, 0], [100, 0], [0, 100]];
          const cuts = [
            [p => p[0], ethyleneCuts[i], true],
            [p => p[0], ethyleneCuts[i + 1], false],
            [p => p[1], acetyleneCuts[j], true],
            [p => p[1], acetyleneCuts[j + 1], false],
            [p => p[0] + p[1], methaneCuts[k], true],
            [p => p[0] + p[1], methaneCuts[k + 1], false]
          ];

          for (const [value, limit, keepGreater] of cuts) {
            if (!points.length) break;
            points = clip(points, value, limit, keepGreater);
          }
          if (points.length < 3 || area(points) < 1e-7) continue;

          const center = points.reduce(
            (sum, p) => [sum[0] + p[0] / points.length, sum[1] + p[1] / points.length],
            [0, 0]
          );
          cells.push({ points, zone: zoneAt(center[0], center[1]) });
        }
      }
    }

    for (const cell of cells) {
      element("path", {
        d: polygonPath(cell.points),
        fill: colors[cell.zone]
      });
    }

    for (const cell of cells) {
      const points = cell.points;
      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        const mx = (a[0] + b[0]) / 2;
        const my = (a[1] + b[1]) / 2;
        if (
          Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-7 ||
          mx < 1e-7 || my < 1e-7 || mx + my > 100 - 1e-7
        ) continue;

        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const length = Math.hypot(dx, dy);
        const offset = 1e-4;
        const nx = -dy / length * offset;
        const ny = dx / length * offset;
        if (zoneAt(mx + nx, my + ny) === zoneAt(mx - nx, my - ny)) continue;

        const [x1, y1] = position(a[0], a[1]);
        const [x2, y2] = position(b[0], b[1]);
        element("line", {
          x1, y1, x2, y2,
          stroke: "#555",
          "stroke-width": 1
        });
      }
    }

    const vertices = {
      methane: position(0, 0),
      acetylene: position(0, 100),
      ethylene: position(100, 0)
    };
    element("polygon", {
      points: [
        vertices.methane,
        vertices.acetylene,
        vertices.ethylene
      ].map(p => p.join(",")).join(" "),
      fill: "none",
      stroke: "#222",
      "stroke-width": 2
    });

    function ticks(start, end, normal) {
      for (let percent = 0; percent <= 100; percent += 20) {
        const t = percent / 100;
        const x = start[0] + t * (end[0] - start[0]);
        const y = start[1] + t * (end[1] - start[1]);
        element("line", {
          x1: x, y1: y,
          x2: x + normal[0] * 8,
          y2: y + normal[1] * 8,
          stroke: "#222",
          "stroke-width": 1
        });
        if (percent > 0 && percent < 100) {
          text(String(percent),
            x + normal[0] * 25,
            y + normal[1] * 25 + 4,
            { "font-size": 12, fill: "#333" });
        }
      }
    }

    ticks(vertices.acetylene, vertices.methane, [-0.865, -0.502]); // CH4
    ticks(vertices.methane, vertices.ethylene, [0.865, -0.502]); // C2H4
    ticks(vertices.ethylene, vertices.acetylene, [0, 1]);       // C2H2

    text("CH4", 300, 22, { "font-size": 16, "font-weight": "bold" });
    text("C2H2", 65, 503, { "font-size": 16, "font-weight": "bold" });
    text("C2H4", 535, 503, { "font-size": 16, "font-weight": "bold" });

    // The PD region is too small to contain legible text; use a leader line.
    element("line", {
      x1: 300, y1: 52, x2: 300, y2: 65,
      stroke: "#333", "stroke-width": 1
    });
    text("PD", 300, 78, { "font-size": 14, "font-weight": "bold" });

    const labels = [
      ["T1", 12, 1],
      ["T2", 37, 2],
      ["T3", 74, 7],
      ["DT", 27, 9],
      ["D1", 13, 58],
      ["D2", 42, 35]
    ];
    for (const [label, ethylene, acetylene] of labels) {
      const [x, y] = position(ethylene, acetylene);
      text(label, x, y + 5, {
        "font-size": 17,
        "font-weight": "bold",
        fill: "#222"
      });
    }

    if (sample !== null && sample !== undefined) {
      const total = sample.ch4 + sample.c2h4 + sample.c2h2;
      DuvalTriangle.classify(sample.ch4, sample.c2h4, sample.c2h2);
      const [x, y] = position(
        100 * sample.c2h4 / total,
        100 * sample.c2h2 / total
      );
      element("circle", {
        cx: x, cy: y, r: 7,
        fill: "white",
        stroke: "#111",
        "stroke-width": 2.5
      });
      element("circle", {
        cx: x, cy: y, r: 2.5,
        fill: "#111"
      });
    }
  }
};
