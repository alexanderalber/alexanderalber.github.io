const DuvalPentagon = (() => {
  const NS = "http://www.w3.org/2000/svg";
  const radius = 100 / 3;
  const axes = ["H2", "C2H2", "C2H4", "CH4", "C2H6"];
  const directions = axes.map((_, i) => {
    const angle = Math.PI / 2 - i * 2 * Math.PI / 5;
    return [Math.cos(angle), Math.sin(angle)];
  });
  const outer = directions.map(([x, y]) => [radius * x, radius * y]);
  const [top, right, bottomRight, bottomLeft, left] = outer;

  const interpolate = (a, b, t) => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t
  ];

  const topLeft = interpolate(top, left, 0.4 / -left[0]);
  const topRight = interpolate(top, right, 0.4 / right[0]);
  const leftSplit = interpolate(left, bottomLeft, 0.45);
  const rightUpper = interpolate(right, bottomRight, 0.22);
  const rightLower = interpolate(right, bottomRight, 0.60);
  const bottomY = bottomLeft[1];
  const origin = [0, 2];

  // Zone boundaries are a best-effort recollection, not a verified
  // diagnostic reference.
  const zones = [
    {
      code: "PD", color: "#f6d9f2", label: [0, 28],
      points: [top, topRight, [0.4, 23], [-0.4, 23], topLeft]
    },
    {
      code: "S", color: "#dcefd4", label: [-17, 12],
      points: [topLeft, left, leftSplit, [-12, -2], origin, [0, 23], [-0.4, 23]]
    },
    {
      code: "T1", color: "#fff1bf", label: [-15, -14],
      points: [leftSplit, bottomLeft, [-7, bottomY], [-7, -10], origin, [-12, -2]]
    },
    {
      code: "T2", color: "#ffdab3", label: [-1, -19],
      points: [[-7, bottomY], [5, bottomY], [3, -10], origin, [-7, -10]]
    },
    {
      code: "T3", color: "#f5b8a7", label: [14, -16],
      points: [[5, bottomY], bottomRight, rightLower, [11, -4], origin, [3, -10]]
    },
    {
      code: "D2", color: "#d4dcfa", label: [16, -1],
      points: [rightLower, rightUpper, [5, 3], origin, [11, -4]]
    },
    {
      code: "D1", color: "#c4e7f3", label: [15, 13],
      points: [rightUpper, right, topRight, [0.4, 23], [0, 23], origin, [5, 3]]
    }
  ];

  function pointFor(h2, ch4, c2h6, c2h4, c2h2) {
    const values = [h2, c2h2, c2h4, ch4, c2h6];
    if (values.some(v => typeof v !== "number" || !Number.isFinite(v) || v < 0)) {
      throw new RangeError("Gas concentrations must be finite non-negative numbers.");
    }

    const max = Math.max(...values);
    if (max === 0) throw new RangeError("At least one gas concentration must be positive.");

    const scaled = values.map(v => v / max);
    const sum = scaled.reduce((a, b) => a + b, 0);
    const vertices = scaled.map((v, i) => [
      100 * v / sum * directions[i][0],
      100 * v / sum * directions[i][1]
    ]);

    let twiceArea = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i];
      const b = vertices[(i + 1) % vertices.length];
      const cross = a[0] * b[1] - b[0] * a[1];
      twiceArea += cross;
      cx += (a[0] + b[0]) * cross;
      cy += (a[1] + b[1]) * cross;
    }

    if (twiceArea !== 0) return [cx / (3 * twiceArea), cy / (3 * twiceArea)];

    // A zero-area gas polygon has no unique centroid. Use the centroid
    // of the corresponding limiting triangle as a deterministic fallback.
    return [
      vertices.reduce((s, p) => s + p[0], 0) / 3,
      vertices.reduce((s, p) => s + p[1], 0) / 3
    ];
  }

  function contains(polygon, point) {
    const [x, y] = point;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      const cross = (x - xi) * (yj - yi) - (y - yi) * (xj - xi);
      const dot = (x - xi) * (x - xj) + (y - yi) * (y - yj);
      if (Math.abs(cross) < 1e-9 && dot <= 1e-9) return true;
      if ((yi > y) !== (yj > y) &&
          x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  function classifyPoint(point) {
    for (const zone of zones) {
      if (contains(zone.points, point)) return zone.code;
    }
    throw new RangeError("The calculated centroid is outside the pentagon.");
  }

  function element(name, attributes, text) {
    const node = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attributes)) {
      node.setAttribute(key, String(value));
    }
    if (text !== undefined) node.textContent = text;
    return node;
  }

  const screen = ([x, y]) => [300 + 7.5 * x, 300 - 7.5 * y];

  return {
    classify(h2, ch4, c2h6, c2h4, c2h2) {
      return classifyPoint(pointFor(h2, ch4, c2h6, c2h4, c2h2));
    },

    render(svg, sample) {
      const samplePoint = sample === null
        ? null
        : pointFor(sample.h2, sample.ch4, sample.c2h6, sample.c2h4, sample.c2h2);

      for (const zone of zones) {
        svg.appendChild(element("polygon", {
          points: zone.points.map(p => screen(p).join(",")).join(" "),
          fill: zone.color,
          stroke: "#555",
          "stroke-width": 1.2,
          "stroke-linejoin": "round"
        }));
      }

      for (const vertex of outer) {
        const [x, y] = screen(vertex);
        svg.appendChild(element("line", {
          x1: 300, y1: 300, x2: x, y2: y,
          stroke: "#777", "stroke-width": 0.8,
          "stroke-dasharray": "4 4", opacity: 0.6
        }));
      }

      svg.appendChild(element("polygon", {
        points: outer.map(p => screen(p).join(",")).join(" "),
        fill: "none", stroke: "#222", "stroke-width": 2
      }));

      for (const zone of zones) {
        const [x, y] = screen(zone.label);
        svg.appendChild(element("text", {
          x, y, "text-anchor": "middle", "dominant-baseline": "middle",
          "font-family": "sans-serif", "font-size": 16, "font-weight": "bold",
          fill: "#222"
        }, zone.code));
      }

      axes.forEach((name, i) => {
        const [x, y] = screen([
          directions[i][0] * (radius + 3.5),
          directions[i][1] * (radius + 3.5)
        ]);
        svg.appendChild(element("text", {
          x, y, "text-anchor": "middle", "dominant-baseline": "middle",
          "font-family": "sans-serif", "font-size": 17, "font-weight": "bold",
          fill: "#111"
        }, name));
      });

      if (samplePoint !== null) {
        const [x, y] = screen(samplePoint);
        svg.appendChild(element("circle", {
          cx: x, cy: y, r: 6, fill: "#111", stroke: "#fff", "stroke-width": 2
        }));
      }
    }
  };
})();
