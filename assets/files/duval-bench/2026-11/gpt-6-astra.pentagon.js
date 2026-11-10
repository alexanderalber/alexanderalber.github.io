const DuvalPentagon = (() => {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const EPSILON = 1e-9;

  // Cartesian coordinates, with positive y pointing upward.
  const outline = [
    [0, 40], [38, 12.4], [23.5, -32.4],
    [-23.5, -32.4], [-38, 12.4]
  ];

  const zones = [
    {
      code: "S",
      name: "Stray gassing",
      color: "#c9e8f5",
      vertices: [
        [-35, 3], [-38, 12.4], [0, 40],
        [0, 1.5], [-6, -4], [-24, 1.5]
      ],
      label: [-18, 15]
    },
    {
      code: "T1",
      name: "Thermal fault below 300 °C",
      color: "#fff1ab",
      vertices: [
        [-35, 3], [-24, 1.5], [-6, -4],
        [-22.5, -32.4], [-23.5, -32.4]
      ],
      label: [-24, -13]
    },
    {
      code: "T2",
      name: "Thermal fault from 300 to 700 °C",
      color: "#ffd08a",
      vertices: [[-6, -4], [1, -32.4], [-22.5, -32.4]],
      label: [-9, -23]
    },
    {
      code: "T3",
      name: "Thermal fault above 700 °C",
      color: "#f5a18c",
      vertices: [
        [0, -3], [24.3, -30], [23.5, -32.4],
        [1, -32.4], [-6, -4]
      ],
      label: [10, -23]
    },
    {
      code: "D2",
      name: "Discharges of high energy",
      color: "#d6b5e5",
      vertices: [
        [0, 1.5], [4, 16], [32, -6.1],
        [24.3, -30], [0, -3]
      ],
      label: [17, -7]
    },
    {
      code: "D1",
      name: "Discharges of low energy",
      color: "#f4c4d7",
      vertices: [
        [0, 40], [38, 12.4], [32, -6.1],
        [4, 16], [0, 1.5]
      ],
      label: [19, 18]
    },
    {
      code: "PD",
      name: "Partial discharges",
      color: "#a5d9ab",
      vertices: [[-1, 24.5], [0, 24.5], [0, 33], [-1, 33]],
      label: [-6, 29]
    }
  ];

  // Explicit tie-breaking for points exactly on shared boundaries.
  const boundaryOrder = ["PD", "D1", "D2", "T3", "T2", "T1", "S"];
  const orderedZones = boundaryOrder.map(code =>
    zones.find(zone => zone.code === code)
  );

  const directions = [90, 162, 234, 306, 18].map(degrees => {
    const radians = degrees * Math.PI / 180;
    const x = Math.cos(radians);
    const y = Math.sin(radians);
    return [Math.abs(x) < 1e-15 ? 0 : x, y];
  });

  function samplePoint(h2, ch4, c2h6, c2h4, c2h2) {
    // Counterclockwise order: H2, C2H6, CH4, C2H4, C2H2.
    const gases = [h2, c2h6, ch4, c2h4, c2h2];

    if (gases.some(value =>
      typeof value !== "number" || !Number.isFinite(value) || value < 0
    )) {
      throw new TypeError("Gas concentrations must be finite non-negative numbers.");
    }

    const maximum = Math.max(...gases);
    if (maximum === 0) {
      throw new RangeError("The sum of the gas concentrations must be positive.");
    }

    // Scale first to avoid overflowing the concentration sum.
    const scaled = gases.map(value => value / maximum);
    const total = scaled.reduce((sum, value) => sum + value, 0);
    const radii = scaled.map(value => 100 * value / total);
    const vertices = radii.map((radius, i) => [
      radius * directions[i][0],
      radius * directions[i][1]
    ]);

    /*
     * Use the AREA centroid of the five-sided gas polygon, not the
     * arithmetic mean of its vertices. Since adjacent axes are all 72°
     * apart, their common sine factor cancels from the shoelace formula.
     */
    let weightSum = 0;
    let xSum = 0;
    let ySum = 0;

    for (let i = 0; i < 5; i++) {
      const j = (i + 1) % 5;
      const weight = radii[i] * radii[j];
      weightSum += weight;
      xSum += weight * (vertices[i][0] + vertices[j][0]);
      ySum += weight * (vertices[i][1] + vertices[j][1]);
    }

    if (weightSum > 0) {
      return [xSum / (3 * weightSum), ySum / (3 * weightSum)];
    }

    /*
     * A polygon with no adjacent nonzero gases has zero area. Extend the
     * centroid by the limit obtained by adding the same infinitesimal
     * concentration to all five gases.
     */
    xSum = 0;
    ySum = 0;
    for (let i = 0; i < 5; i++) {
      xSum += radii[i] * vertices[i][0];
      ySum += radii[i] * vertices[i][1];
    }
    return [xSum / 300, ySum / 300];
  }

  function segmentDistanceSquared(point, a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
      ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared
    ));
    const ex = point[0] - a[0] - t * dx;
    const ey = point[1] - a[1] - t * dy;
    return ex * ex + ey * ey;
  }

  function contains(point, vertices) {
    let inside = false;

    for (let i = 0, j = vertices.length - 1;
      i < vertices.length; j = i++) {
      const a = vertices[j];
      const b = vertices[i];

      if (segmentDistanceSquared(point, a, b) <= EPSILON * EPSILON) {
        return true;
      }

      if ((a[1] > point[1]) !== (b[1] > point[1])) {
        const intersection =
          a[0] + (point[1] - a[1]) * (b[0] - a[0]) / (b[1] - a[1]);
        if (point[0] < intersection) inside = !inside;
      }
    }

    return inside;
  }

  function zoneAt(point) {
    for (const zone of orderedZones) {
      if (contains(point, zone.vertices)) return zone.code;
    }

    // Numerical safeguard at the rounded outer chart coordinates.
    let nearestCode = "S";
    let nearestDistance = Infinity;
    for (const zone of orderedZones) {
      const vertices = zone.vertices;
      for (let i = 0; i < vertices.length; i++) {
        const distance = segmentDistanceSquared(
          point, vertices[i], vertices[(i + 1) % vertices.length]
        );
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestCode = zone.code;
        }
      }
    }
    return nearestCode;
  }

  return {
    classify(h2, ch4, c2h6, c2h4, c2h2) {
      return zoneAt(samplePoint(h2, ch4, c2h6, c2h4, c2h2));
    },

    render(svg, sample) {
      if (!svg || svg.namespaceURI !== NS || svg.localName !== "svg") {
        throw new TypeError("Expected an SVG element.");
      }

      const point = sample == null ? null : samplePoint(
        sample.h2, sample.ch4, sample.c2h6, sample.c2h4, sample.c2h2
      );
      const code = point === null ? null : zoneAt(point);

      function element(tag, attributes, parent, text) {
        const node = document.createElementNS(NS, tag);
        for (const [name, value] of Object.entries(attributes || {})) {
          node.setAttribute(name, String(value));
        }
        if (text !== undefined) node.textContent = text;
        (parent || svg).appendChild(node);
        return node;
      }

      const scale = 5.9;
      const project = p => [300 + scale * p[0], 290 - scale * p[1]];
      const polygonPoints = vertices =>
        vertices.map(p => project(p).join(",")).join(" ");

      svg.setAttribute("viewBox", "0 0 600 600");
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label",
        "Duval Pentagon 1" + (code === null ? "" : "; sample zone " + code)
      );

      element("title", {}, svg, "Duval Pentagon 1");
      element("desc", {}, svg,
        "Mineral-oil dissolved gas analysis using the area centroid of " +
        "the normalized H2, C2H6, CH4, C2H4 and C2H2 gas polygon."
      );

      const chart = element("g", {
        "font-family": "Arial, Helvetica, sans-serif",
        "font-size": 16,
        "stroke-linejoin": "round"
      });

      for (const zone of zones) {
        const polygon = element("polygon", {
          points: polygonPoints(zone.vertices),
          fill: zone.color,
          stroke: "#555",
          "stroke-width": 1.1
        }, chart);
        element("title", {}, polygon, zone.code + ": " + zone.name);
      }

      const axes = [
        { name: "H2", tip: [0, 40], label: [300, 28], anchor: "middle" },
        { name: "C2H6", tip: [-38, 12.4], label: [62, 204], anchor: "end" },
        { name: "CH4", tip: [-23.5, -32.4], label: [148, 511], anchor: "middle" },
        { name: "C2H4", tip: [23.5, -32.4], label: [452, 511], anchor: "middle" },
        { name: "C2H2", tip: [38, 12.4], label: [538, 204], anchor: "start" }
      ];

      for (const axis of axes) {
        const end = project(axis.tip);
        element("line", {
          x1: 300, y1: 290, x2: end[0], y2: end[1],
          stroke: "#333",
          "stroke-width": 0.8,
          "stroke-dasharray": "3 4",
          "stroke-opacity": 0.38
        }, chart);

        element("text", {
          x: axis.label[0],
          y: axis.label[1],
          "text-anchor": axis.anchor,
          "font-weight": "bold",
          fill: "#222"
        }, chart, axis.name);
      }

      element("polygon", {
        points: polygonPoints(outline),
        fill: "none",
        stroke: "#333",
        "stroke-width": 1.6
      }, chart);

      for (const zone of zones) {
        const label = project(zone.label);

        if (zone.code === "PD") {
          const target = project([-0.5, 29]);
          element("line", {
            x1: label[0] + 15, y1: label[1],
            x2: target[0], y2: target[1],
            stroke: "#333", "stroke-width": 1
          }, chart);
        }

        element("text", {
          x: label[0],
          y: label[1],
          "text-anchor": "middle",
          "dominant-baseline": "middle",
          "font-weight": "bold",
          fill: "#222"
        }, chart, zone.code);
      }

      element("text", {
        x: 300, y: 550,
        "text-anchor": "middle",
        "font-size": 20,
        "font-weight": "bold",
        fill: "#222"
      }, chart, "Duval Pentagon 1");

      if (point !== null) {
        const position = project(point);
        const marker = element("g", {}, chart);
        element("title", {}, marker,
          "Sample: " + code +
          "; centroid (" + point[0].toFixed(3) +
          ", " + point[1].toFixed(3) + ")"
        );
        element("circle", {
          cx: position[0], cy: position[1], r: 6,
          fill: "white", stroke: "#111", "stroke-width": 2
        }, marker);
        element("circle", {
          cx: position[0], cy: position[1], r: 2,
          fill: "#111"
        }, marker);
        element("text", {
          x: 300, y: 578,
          "text-anchor": "middle",
          fill: "#222"
        }, chart, "Sample: " + code);
      }
    }
  };
})();
