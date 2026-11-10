const DuvalPentagon = (() => {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";

  const vertices = {
    H2:    [0, 1],
    CH4:   [0.9510565163, 0.3090169944],
    C2H4:  [0.5877852523, -0.8090169944],
    C2H2:  [-0.5877852523, -0.8090169944],
    C2H6:  [-0.9510565163, 0.3090169944]
  };

  const hub = [0, 0.02];

  const boundaries = {
    pdLeft:  [-0.428, 0.689],
    pdRight: [0.428, 0.689],
    t1t2:    [0.762, -0.272],
    t2t3:    [0.675, -0.541],
    t3d2:    [0.18, -0.8090169944],
    d2d1:    [-0.23, -0.8090169944],
    d1s:     [-0.740, -0.339]
  };

  const zones = [
    {
      code: "PD",
      color: "#fff3a6",
      label: [0, 0.61],
      polygon: [hub, boundaries.pdLeft, vertices.H2, boundaries.pdRight]
    },
    {
      code: "T1",
      color: "#ccebc5",
      label: [0.52, 0.25],
      polygon: [hub, boundaries.pdRight, vertices.CH4, boundaries.t1t2]
    },
    {
      code: "T2",
      color: "#ffe29a",
      label: [0.53, -0.29],
      polygon: [hub, boundaries.t1t2, boundaries.t2t3]
    },
    {
      code: "T3",
      color: "#f4a582",
      label: [0.43, -0.61],
      polygon: [hub, boundaries.t2t3, vertices.C2H4, boundaries.t3d2]
    },
    {
      code: "D2",
      color: "#f7b6d2",
      label: [-0.02, -0.58],
      polygon: [hub, boundaries.t3d2, boundaries.d2d1]
    },
    {
      code: "D1",
      color: "#ef8a8a",
      label: [-0.43, -0.57],
      polygon: [hub, boundaries.d2d1, vertices.C2H2, boundaries.d1s]
    },
    {
      code: "S",
      color: "#b3cde3",
      label: [-0.52, 0.15],
      polygon: [hub, boundaries.d1s, vertices.C2H6, boundaries.pdLeft]
    }
  ];

  const classificationOrder = ["D2", "PD", "D1", "T3", "T2", "T1", "S"];

  function validateValues(values) {
    let total = 0;

    for (const value of values) {
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0
      ) {
        throw new TypeError("Gas concentrations must be finite non-negative numbers.");
      }
      total += value;
    }

    if (!(total > 0)) {
      throw new RangeError("The sum of gas concentrations must be greater than zero.");
    }

    return total;
  }

  function gasPoint(h2, ch4, c2h6, c2h4, c2h2) {
    const values = [h2, ch4, c2h6, c2h4, c2h2];
    const total = validateValues(values);

    return [
      (
        h2 * vertices.H2[0] +
        ch4 * vertices.CH4[0] +
        c2h6 * vertices.C2H6[0] +
        c2h4 * vertices.C2H4[0] +
        c2h2 * vertices.C2H2[0]
      ) / total,
      (
        h2 * vertices.H2[1] +
        ch4 * vertices.CH4[1] +
        c2h6 * vertices.C2H6[1] +
        c2h4 * vertices.C2H4[1] +
        c2h2 * vertices.C2H2[1]
      ) / total
    ];
  }

  function pointOnSegment(point, a, b) {
    const epsilon = 1e-10;
    const cross =
      (point[0] - a[0]) * (b[1] - a[1]) -
      (point[1] - a[1]) * (b[0] - a[0]);

    if (Math.abs(cross) > epsilon) return false;

    const dot =
      (point[0] - a[0]) * (point[0] - b[0]) +
      (point[1] - a[1]) * (point[1] - b[1]);

    return dot <= epsilon;
  }

  function pointInPolygon(point, polygon) {
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[j];
      const b = polygon[i];

      if (pointOnSegment(point, a, b)) return true;

      const crosses =
        (a[1] > point[1]) !== (b[1] > point[1]) &&
        point[0] <
          ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0];

      if (crosses) inside = !inside;
    }

    return inside;
  }

  function classifyPoint(point) {
    for (const code of classificationOrder) {
      const zone = zones.find(candidate => candidate.code === code);
      if (pointInPolygon(point, zone.polygon)) return code;
    }

    let closest = zones[0];
    let closestDistance = Infinity;

    for (const zone of zones) {
      const dx = point[0] - zone.label[0];
      const dy = point[1] - zone.label[1];
      const distance = dx * dx + dy * dy;

      if (distance < closestDistance) {
        closest = zone;
        closestDistance = distance;
      }
    }

    return closest.code;
  }

  function createElement(name, attributes, text) {
    const element = document.createElementNS(NS, name);

    for (const key in attributes) {
      element.setAttribute(key, String(attributes[key]));
    }

    if (text !== undefined) element.textContent = text;
    return element;
  }

  function clearSvg(svg) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
  }

  function renderPoint(point) {
    const centerX = 300;
    const centerY = 285;
    const radius = 235;

    return [
      centerX + radius * point[0],
      centerY - radius * point[1]
    ];
  }

  function pointsAttribute(polygon) {
    return polygon
      .map(point => {
        const rendered = renderPoint(point);
        return rendered[0].toFixed(2) + "," + rendered[1].toFixed(2);
      })
      .join(" ");
  }

  return {
    classify(h2, ch4, c2h6, c2h4, c2h2) {
      return classifyPoint(gasPoint(h2, ch4, c2h6, c2h4, c2h2));
    },

    render(svg, sample) {
      if (
        !svg ||
        svg.namespaceURI !== NS ||
        String(svg.localName).toLowerCase() !== "svg"
      ) {
        throw new TypeError("svg must be an SVG element.");
      }

      clearSvg(svg);

      const background = createElement("rect", {
        x: 0,
        y: 0,
        width: 600,
        height: 600,
        fill: "#ffffff"
      });
      svg.appendChild(background);

      const zoneGroup = createElement("g", {
        "stroke-linejoin": "round"
      });

      for (const zone of zones) {
        zoneGroup.appendChild(createElement("polygon", {
          points: pointsAttribute(zone.polygon),
          fill: zone.color,
          stroke: "#333333",
          "stroke-width": 1.6
        }));
      }

      svg.appendChild(zoneGroup);

      const orderedVertices = [
        vertices.H2,
        vertices.CH4,
        vertices.C2H4,
        vertices.C2H2,
        vertices.C2H6
      ];

      const gridGroup = createElement("g", {
        fill: "none",
        stroke: "#555555",
        "stroke-width": 0.8,
        "stroke-opacity": 0.42
      });

      for (const fraction of [0.2, 0.4, 0.6, 0.8]) {
        gridGroup.appendChild(createElement("polygon", {
          points: pointsAttribute(
            orderedVertices.map(point => [
              point[0] * fraction,
              point[1] * fraction
            ])
          )
        }));
      }

      svg.appendChild(gridGroup);

      const axesGroup = createElement("g", {
        stroke: "#222222",
        "stroke-width": 1,
        "stroke-opacity": 0.6,
        "stroke-dasharray": "4 4"
      });

      const center = renderPoint([0, 0]);

      for (const vertex of orderedVertices) {
        const end = renderPoint(vertex);
        axesGroup.appendChild(createElement("line", {
          x1: center[0],
          y1: center[1],
          x2: end[0],
          y2: end[1]
        }));
      }

      svg.appendChild(axesGroup);

      svg.appendChild(createElement("polygon", {
        points: pointsAttribute(orderedVertices),
        fill: "none",
        stroke: "#111111",
        "stroke-width": 2.5,
        "stroke-linejoin": "round"
      }));

      const zoneLabelGroup = createElement("g", {
        "font-family": "Arial, Helvetica, sans-serif",
        "font-size": 18,
        "font-weight": "700",
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        fill: "#111111",
        stroke: "#ffffff",
        "stroke-width": 3,
        "paint-order": "stroke"
      });

      for (const zone of zones) {
        const point = renderPoint(zone.label);
        zoneLabelGroup.appendChild(createElement("text", {
          x: point[0],
          y: point[1]
        }, zone.code));
      }

      svg.appendChild(zoneLabelGroup);

      const axisLabels = [
        { text: "H₂", x: 300, y: 25 },
        { text: "CH₄", x: 558, y: 207 },
        { text: "C₂H₄", x: 472, y: 526 },
        { text: "C₂H₂", x: 128, y: 526 },
        { text: "C₂H₆", x: 42, y: 207 }
      ];

      const axisLabelGroup = createElement("g", {
        "font-family": "Arial, Helvetica, sans-serif",
        "font-size": 18,
        "font-weight": "700",
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        fill: "#111111"
      });

      for (const label of axisLabels) {
        axisLabelGroup.appendChild(createElement("text", {
          x: label.x,
          y: label.y
        }, label.text));
      }

      svg.appendChild(axisLabelGroup);

      if (sample !== null) {
        if (!sample || typeof sample !== "object") {
          throw new TypeError("sample must be null or a gas concentration object.");
        }

        const point = gasPoint(
          sample.h2,
          sample.ch4,
          sample.c2h6,
          sample.c2h4,
          sample.c2h2
        );
        const rendered = renderPoint(point);
        const code = classifyPoint(point);

        const markerGroup = createElement("g", {
          "pointer-events": "none"
        });

        markerGroup.appendChild(createElement("circle", {
          cx: rendered[0],
          cy: rendered[1],
          r: 9,
          fill: "#ffffff",
          stroke: "#000000",
          "stroke-width": 3
        }));

        markerGroup.appendChild(createElement("circle", {
          cx: rendered[0],
          cy: rendered[1],
          r: 4,
          fill: "#0066ff"
        }));

        markerGroup.appendChild(createElement("line", {
          x1: rendered[0] - 13,
          y1: rendered[1],
          x2: rendered[0] + 13,
          y2: rendered[1],
          stroke: "#000000",
          "stroke-width": 1.5
        }));

        markerGroup.appendChild(createElement("line", {
          x1: rendered[0],
          y1: rendered[1] - 13,
          x2: rendered[0],
          y2: rendered[1] + 13,
          stroke: "#000000",
          "stroke-width": 1.5
        }));

        markerGroup.appendChild(createElement("title", {}, "Sample: " + code));
        svg.appendChild(markerGroup);
      }
    }
  };
})();
