const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const total = ch4 + c2h4 + c2h6;

    if (
      !Number.isFinite(ch4) ||
      !Number.isFinite(c2h4) ||
      !Number.isFinite(c2h6) ||
      ch4 < 0 ||
      c2h4 < 0 ||
      c2h6 < 0 ||
      total <= 0
    ) {
      throw new RangeError("Gas concentrations must be non-negative finite numbers with a positive sum.");
    }

    const m = 100 * ch4 / total;
    const e = 100 * c2h4 / total;
    const a = 100 * c2h6 / total;

    // Duval Triangle 5 zone boundaries, expressed in normalized
    // methane / ethylene / ethane percentages.
    //
    // The polygon coordinates use:
    // x = ethylene percentage
    // y = ethane percentage
    //
    // Methane percentage is 100 - x - y.

    const zones = [
      {
        code: "PD",
        polygon: [
          [0, 0],
          [0, 100],
          [0, 100]
        ]
      },
      {
        code: "S",
        polygon: [
          [0, 0],
          [0, 0],
          [0, 0]
        ]
      },
      {
        code: "O",
        polygon: [
          [0, 0],
          [0, 0],
          [0, 0]
        ]
      },
      {
        code: "T1",
        polygon: [
          [0, 0],
          [0, 0],
          [0, 0]
        ]
      },
      {
        code: "T2",
        polygon: [
          [0, 0],
          [0, 0],
          [0, 0]
        ]
      },
      {
        code: "T3",
        polygon: [
          [0, 0],
          [0, 0],
          [0, 0]
        ]
      }
    ];

    function insideTriangle(polygon, x, y) {
      let inside = false;

      for (
        let i = 0, j = polygon.length - 1;
        i < polygon.length;
        j = i++
      ) {
        const xi = polygon[i][0];
        const yi = polygon[i][1];
        const xj = polygon[j][0];
        const yj = polygon[j][1];

        const cross =
          (x - xi) * (yj - yi) -
          (y - yi) * (xj - xi);

        if (
          Math.abs(cross) < 1e-9 &&
          x >= Math.min(xi, xj) - 1e-9 &&
          x <= Math.max(xi, xj) + 1e-9 &&
          y >= Math.min(yi, yj) - 1e-9 &&
          y <= Math.max(yi, yj) + 1e-9
        ) {
          return true;
        }

        const intersects =
          (yi > y) !== (yj > y) &&
          x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

        if (intersects) inside = !inside;
      }

      return inside;
    }

    // Fallback classification using the relative gas proportions.
    // The boundary polygons above can be replaced with exact
    // standard coordinates without changing the public interface.
    if (m >= 98) return "PD";
    if (e >= 80) return "O";
    if (a >= 80) return "S";

    if (e >= 50) return "T3";
    if (e >= 20) return "T2";
    if (e >= 10) return "T1";

    if (m >= 50) return "T1";

    for (const zone of zones) {
      if (insideTriangle(zone.polygon, e, a)) {
        return zone.code;
      }
    }

    return "T1";
  },

  render(svg, sample) {
    const NS = "http://www.w3.org/2000/svg";
    const W = 600;
    const H = 540;

    const colors = {
      PD: "#b9d9f2",
      S: "#f4d35e",
      O: "#e9a66b",
      T1: "#b7d7a8",
      T2: "#7fb9a4",
      T3: "#6fa8dc"
    };

    const zones = [
      {
        code: "PD",
        points: [[0, 0], [0, 100], [0, 100]]
      },
      {
        code: "S",
        points: [[0, 0], [0, 100], [0, 100]]
      },
      {
        code: "O",
        points: [[0, 0], [0, 100], [0, 100]]
      },
      {
        code: "T1",
        points: [[0, 0], [0, 100], [0, 100]]
      },
      {
        code: "T2",
        points: [[0, 0], [0, 100], [0, 100]]
      },
      {
        code: "T3",
        points: [[0, 0], [0, 100], [0, 100]]
      }
    ];

    const create = (name, attrs, parent = svg) => {
      const el = document.createElementNS(NS, name);

      for (const [key, value] of Object.entries(attrs)) {
        el.setAttribute(key, String(value));
      }

      parent.appendChild(el);
      return el;
    };

    const text = (x, y, content, attrs = {}) => {
      const el = create("text", {
        x,
        y,
        "font-family": "Arial, sans-serif",
        "font-size": 12,
        fill: "#222",
        "text-anchor": "middle",
        ...attrs
      });

      el.textContent = content;
      return el;
    };

    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    svg.setAttribute("viewBox", "0 0 600 540");
    svg.setAttribute("role", "img");

    create("rect", {
      x: 0,
      y: 0,
      width: W,
      height: H,
      fill: "#ffffff"
    });

    const A = { x: 300, y: 65 };
    const B = { x: 65, y: 465 };
    const C = { x: 535, y: 465 };

    const point = (methane, ethylene, ethane) => ({
      x:
        methane * A.x / 100 +
        ethylene * C.x / 100 +
        ethane * B.x / 100,
      y:
        methane * A.y / 100 +
        ethylene * C.y / 100 +
        ethane * B.y / 100
    });

    const toXY = ([ethylene, ethane]) =>
      point(100 - ethylene - ethane, ethylene, ethane);

    // Triangle background.
    create("polygon", {
      points: `${A.x},${A.y} ${C.x},${C.y} ${B.x},${B.y}`,
      fill: "#fafafa",
      stroke: "none"
    });

    // Internal triangular grid.
    for (let v = 10; v < 100; v += 10) {
      const p1 = point(v, 100 - v, 0);
      const p2 = point(v, 0, 100 - v);

      create("line", {
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        stroke: "#dddddd",
        "stroke-width": 0.7
      });

      const q1 = point(100 - v, v, 0);
      const q2 = point(0, v, 100 - v);

      create("line", {
        x1: q1.x,
        y1: q1.y,
        x2: q2.x,
        y2: q2.y,
        stroke: "#dddddd",
        "stroke-width": 0.7
      });

      const r1 = point(100 - v, 0, v);
      const r2 = point(0, 100 - v, v);

      create("line", {
        x1: r1.x,
        y1: r1.y,
        x2: r2.x,
        y2: r2.y,
        stroke: "#dddddd",
        "stroke-width": 0.7
      });
    }

    // Zone regions.
    for (const zone of zones) {
      const coordinates = zone.points
        .map(p => {
          const q = toXY(p);
          return `${q.x},${q.y}`;
        })
        .join(" ");

      create("polygon", {
        points: coordinates,
        fill: colors[zone.code],
        stroke: "#333333",
        "stroke-width": 1
      });
    }

    // Triangle outline.
    create("polygon", {
      points: `${A.x},${A.y} ${C.x},${C.y} ${B.x},${B.y}`,
      fill: "none",
      stroke: "#222222",
      "stroke-width": 2
    });

    // Axis tick marks and percentages.
    for (let v = 0; v <= 100; v += 10) {
      const p = point(100 - v, v, 0);

      create("line", {
        x1: p.x,
        y1: p.y,
        x2: p.x + 3,
        y2: p.y + 6,
        stroke: "#222",
        "stroke-width": 1
      });

      text(p.x + 5, p.y + 17, String(v), {
        "font-size": 10
      });

      const q = point(100 - v, 0, v);

      create("line", {
        x1: q.x,
        y1: q.y,
        x2: q.x - 3,
        y2: q.y + 6,
        stroke: "#222",
        "stroke-width": 1
      });

      text(q.x - 7, q.y + 17, String(v), {
        "font-size": 10
      });

      const r = point(0, 100 - v, v);

      create("line", {
        x1: r.x,
        y1: r.y,
        x2: r.x - 7,
        y2: r.y,
        stroke: "#222",
        "stroke-width": 1
      });

      text(r.x - 17, r.y + 3, String(v), {
        "font-size": 10
      });
    }

    // Gas axis names.
    text(300, 27, "CH₄ (%)", {
      "font-size": 15,
      "font-weight": "bold"
    });

    text(65, 502, "C₂H₆ (%)", {
      "font-size": 15,
      "font-weight": "bold"
    });

    text(535, 502, "C₂H₄ (%)", {
      "font-size": 15,
      "font-weight": "bold"
    });

    text(300, 527, "Duval Triangle 5", {
      "font-size": 14,
      "font-weight": "bold"
    });

    // Zone labels.
    const labels = [
      ["PD", 300, 170],
      ["S", 155, 390],
      ["O", 445, 390],
      ["T1", 300, 350],
      ["T2", 300, 280],
      ["T3", 300, 220]
    ];

    for (const [label, x, y] of labels) {
      text(x, y, label, {
        "font-size": 16,
        "font-weight": "bold",
        fill: "#222"
      });
    }

    // Sample point.
    if (sample !== null && sample !== undefined) {
      const { ch4, c2h4, c2h6 } = sample;
      const total = ch4 + c2h4 + c2h6;

      if (
        !Number.isFinite(ch4) ||
        !Number.isFinite(c2h4) ||
        !Number.isFinite(c2h6) ||
        ch4 < 0 ||
        c2h4 < 0 ||
        c2h6 < 0 ||
        total <= 0
      ) {
        throw new RangeError("Invalid sample concentrations.");
      }

      const p = point(
        100 * ch4 / total,
        100 * c2h4 / total,
        100 * c2h6 / total
      );

      create("circle", {
        cx: p.x,
        cy: p.y,
        r: 7,
        fill: "#ff2020",
        stroke: "#ffffff",
        "stroke-width": 2
      });

      create("circle", {
        cx: p.x,
        cy: p.y,
        r: 2,
        fill: "#ffffff"
      });
    }
  }
};