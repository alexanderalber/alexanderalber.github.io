const DuvalPentagon = (() => {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const EPS = 1e-9;
  const PD_TIP = 100 / 3;

  // Counterclockwise order around the gas-concentration pentagon.
  const gases = [
    { key: "h2",   label: "H₂",   angle: 90 },
    { key: "c2h6", label: "C₂H₆", angle: 162 },
    { key: "ch4",  label: "CH₄",  angle: 234 },
    { key: "c2h4", label: "C₂H₄", angle: 306 },
    { key: "c2h2", label: "C₂H₂", angle: 18 }
  ].map(g => {
    const a = g.angle * Math.PI / 180;
    return { ...g, x: Math.cos(a), y: Math.sin(a) };
  });

  // Coordinates are in the centroid plane, not gas percentages.
  // Ordering also defines the deterministic precedence on shared boundaries.
  const zones = [
    {
      code: "PD",
      name: "Partial discharges",
      color: "#c9a6e8",
      polygon: [[0, PD_TIP], [-1, 24.5], [0, 1]],
      label: [-7, 29]
    },
    {
      code: "D1",
      name: "Discharges of low energy",
      color: "#9bc9ee",
      polygon: [
        [0, 40], [38, 12], [32, -6], [4, 16],
        [0, 1], [0, PD_TIP]
      ],
      label: [18, 21]
    },
    {
      code: "D2",
      name: "Discharges of high energy",
      color: "#ef9ca9",
      polygon: [
        [4, 16], [32, -6], [24, -30], [-1, -2], [0, 1]
      ],
      label: [17, -6]
    },
    {
      code: "T3",
      name: "Thermal fault above 700 °C",
      color: "#f29b70",
      polygon: [
        [24, -30], [23.5, -32], [-4, -32],
        [-3.5, -3], [-1, -2]
      ],
      label: [6, -23]
    },
    {
      code: "T2",
      name: "Thermal fault from 300 to 700 °C",
      color: "#f5ce77",
      polygon: [
        [-4, -32], [-22.5, -32], [-6, -4], [-3.5, -3]
      ],
      label: [-11, -23]
    },
    {
      code: "T1",
      name: "Thermal fault below 300 °C",
      color: "#f5eca0",
      polygon: [
        [-22.5, -32], [-23.5, -32], [-35, -3], [-6, -4]
      ],
      label: [-23, -13]
    },
    {
      code: "S",
      name: "Stray gassing",
      color: "#bce0ac",
      polygon: [
        [-35, -3], [-38, 12], [0, 40], [0, PD_TIP],
        [-1, 24.5], [0, 1], [-1, -2], [-6, -4]
      ],
      label: [-19, 12]
    }
  ];

  function centroid(h2, ch4, c2h6, c2h4, c2h2) {
    const input = { h2, ch4, c2h6, c2h4, c2h2 };
    let maximum = 0;

    for (const gas of gases) {
      const value = input[gas.key];
      if (typeof value !== "number" ||
          !Number.isFinite(value) || value < 0) {
        throw new TypeError("Gas concentrations must be finite non-negative numbers.");
      }
      maximum = Math.max(maximum, value);
    }

    if (maximum === 0) {
      throw new RangeError("At least one gas concentration must be positive.");
    }

    // Scale before summation to avoid overflowing on large finite inputs.
    const fractions = gases.map(g => input[g.key] / maximum);
    const total = fractions.reduce((a, b) => a + b, 0);
    const percentages = fractions.map(v => 100 * v / total);
    const vertices = gases.map((g, i) => [
      percentages[i] * g.x,
      percentages[i] * g.y
    ]);

    let twiceArea = 0;
    let numeratorX = 0;
    let numeratorY = 0;

    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i];
      const b = vertices[(i + 1) % vertices.length];
      const cross = a[0] * b[1] - b[0] * a[1];
      twiceArea += cross;
      numeratorX += (a[0] + b[0]) * cross;
      numeratorY += (a[1] + b[1]) * cross;
    }

    if (twiceArea > 0) {
      return [
        numeratorX / (3 * twiceArea),
        numeratorY / (3 * twiceArea)
      ];
    }

    // Degenerate polygons: take the limit obtained by adding equal,
    // infinitesimal traces to the absent gases.
    let weight = 0;
    let x = 0;
    let y = 0;

    for (let i = 0; i < gases.length; i++) {
      const p = percentages[i];
      weight += p;
      x += p * p * gases[i].x;
      y += p * p * gases[i].y;
    }

    return [x / (3 * weight), y / (3 * weight)];
  }

  function segmentDistanceSquared(point, a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
      ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) /
      lengthSquared
    ));
    const ex = point[0] - a[0] - t * dx;
    const ey = point[1] - a[1] - t * dy;
    return ex * ex + ey * ey;
  }

  function contains(polygon, point) {
    let inside = false;

    for (let i = 0, j = polygon.length - 1;
         i < polygon.length; j = i++) {
      const a = polygon[j];
      const b = polygon[i];

      if (segmentDistanceSquared(point, a, b) <= EPS * EPS) {
        return true;
      }

      if ((a[1] > point[1]) !== (b[1] > point[1]) &&
          point[0] <
            (b[0] - a[0]) * (point[1] - a[1]) /
            (b[1] - a[1]) + a[0]) {
        inside = !inside;
      }
    }

    return inside;
  }

  function zoneAt(point) {
    for (const zone of zones) {
      if (contains(zone.polygon, point)) return zone.code;
    }

    // Resolve any tiny discrepancy at the rounded exterior coordinates
    // against the nearest zone rather than returning an arbitrary fault.
    let nearest = zones[0].code;
    let distance = Infinity;

    for (const zone of zones) {
      for (let i = 0; i < zone.polygon.length; i++) {
        const d = segmentDistanceSquared(
          point,
          zone.polygon[i],
          zone.polygon[(i + 1) % zone.polygon.length]
        );
        if (d < distance) {
          distance = d;
          nearest = zone.code;
        }
      }
    }

    return nearest;
  }

  return {
    classify(h2, ch4, c2h6, c2h4, c2h2) {
      return zoneAt(centroid(h2, ch4, c2h6, c2h4, c2h2));
    },

    render(svg, sample) {
      // Validate before modifying the supplied SVG.
      const point = sample == null ? null : centroid(
        sample.h2, sample.ch4, sample.c2h6, sample.c2h4, sample.c2h2
      );
      const code = point === null ? null : zoneAt(point);
      const scale = 5.4;
      const screen = p => [300 + scale * p[0], 300 - scale * p[1]];

      function element(tag, attributes, parent, text) {
        const node = document.createElementNS(NS, tag);
        for (const key of Object.keys(attributes || {})) {
          node.setAttribute(key, String(attributes[key]));
        }
        if (text !== undefined) node.textContent = text;
        parent.appendChild(node);
        return node;
      }

      function line(a, b, attributes, parent) {
        const p = screen(a);
        const q = screen(b);
        return element("line", {
          x1: p[0], y1: p[1], x2: q[0], y2: q[1],
          ...attributes
        }, parent);
      }

      const root = element("g", {
        "font-family": "Arial, Helvetica, sans-serif",
        "stroke-linejoin": "round",
        "stroke-linecap": "round"
      }, svg);

      element("title", {}, root, "Duval Pentagon 1");
      element("desc", {}, root,
        "Mineral-oil dissolved gas analysis using the centroid of the " +
        "five-gas percentage polygon. Zones: PD, D1, D2, T1, T2, T3 and S."
      );

      for (const zone of zones) {
        const shape = element("polygon", {
          points: zone.polygon.map(p => screen(p).join(",")).join(" "),
          fill: zone.color,
          stroke: "#444",
          "stroke-width": 1.2
        }, root);
        element("title", {}, shape, zone.code + ": " + zone.name);
      }

      const axes = element("g", {
        stroke: "#555",
        "stroke-width": 0.9,
        "stroke-dasharray": "3 4",
        "stroke-opacity": 0.65
      }, root);

      for (const gas of gases) {
        line([0, 0], [43 * gas.x, 43 * gas.y], {}, axes);
        const p = screen([49 * gas.x, 49 * gas.y]);
        element("text", {
          x: p[0],
          y: p[1],
          fill: "#222",
          "font-size": 17,
          "font-weight": "bold",
          "text-anchor": "middle",
          "dominant-baseline": "middle"
        }, root, gas.label);
      }

      // The PD zone is too narrow for an internal label.
      line([-4.8, 28.5], [-0.35, 28.5], {
        stroke: "#333",
        "stroke-width": 1
      }, root);

      for (const zone of zones) {
        const p = screen(zone.label);
        const label = element("text", {
          x: p[0],
          y: p[1],
          fill: "#202020",
          "font-size": 17,
          "font-weight": "bold",
          "text-anchor": "middle",
          "dominant-baseline": "middle"
        }, root, zone.code);
        element("title", {}, label, zone.name);
      }

      if (point !== null) {
        const p = screen(point);
        const marker = element("g", {
          "aria-label": "Sample classified as " + code
        }, root);

        element("title", {}, marker,
          "Sample: " + code +
          "; H₂=" + sample.h2 +
          ", CH₄=" + sample.ch4 +
          ", C₂H₆=" + sample.c2h6 +
          ", C₂H₄=" + sample.c2h4 +
          ", C₂H₂=" + sample.c2h2 + " ppm"
        );

        element("circle", {
          cx: p[0], cy: p[1], r: 6,
          fill: "#fff", stroke: "#111", "stroke-width": 2
        }, marker);
        element("circle", {
          cx: p[0], cy: p[1], r: 2.5, fill: "#111"
        }, marker);

        element("text", {
          x: 300,
          y: 572,
          fill: "#222",
          "font-size": 15,
          "text-anchor": "middle"
        }, root, "Sample: " + code);
      }
    }
  };
})();
