const DuvalPentagon = (() => {
  const NS = "http://www.w3.org/2000/svg";

  const vertices = {
    h2:   [300, 55],
    ch4:  [548, 220],
    c2h6: [455, 510],
    c2h4: [145, 510],
    c2h2: [52, 220]
  };

  const q01 = [420, 143];
  const q23 = [300, 510];
  const q34 = [98, 365];
  const q40 = [188, 147];

  const a = [330, 225];
  const b = [385, 340];
  const c = [300, 405];
  const d = [210, 355];
  const e = [185, 260];

  const zones = [
    {
      code: "PD",
      color: "#f6e58d",
      label: [300, 155],
      polygon: [vertices.h2, q01, a, e, q40]
    },
    {
      code: "T1",
      color: "#b8e994",
      label: [438, 293],
      polygon: [q01, vertices.ch4, vertices.c2h6, q23, b, a]
    },
    {
      code: "T2",
      color: "#78e08f",
      label: [344, 398],
      polygon: [q23, c, b]
    },
    {
      code: "T3",
      color: "#38ada9",
      label: [205, 422],
      polygon: [q23, vertices.c2h4, q34, d, c]
    },
    {
      code: "D1",
      color: "#eb4d4b",
      label: [128, 278],
      polygon: [q34, vertices.c2h2, q40, e, d]
    },
    {
      code: "D2",
      color: "#f6b93b",
      label: [284, 315],
      polygon: [a, b, c, d, e]
    }
  ];

  function make(tag, attributes) {
    const element = document.createElementNS(NS, tag);
    if (attributes) {
      for (const key in attributes) {
        element.setAttribute(key, String(attributes[key]));
      }
    }
    return element;
  }

  function polygonPoints(points) {
    return points.map(point => point[0] + "," + point[1]).join(" ");
  }

  function validValues(h2, ch4, c2h6, c2h4, c2h2) {
    const values = [h2, ch4, c2h6, c2h4, c2h2];
    if (
      values.some(value => typeof value !== "number" || !Number.isFinite(value) || value < 0)
    ) {
      throw new TypeError("DGA gas concentrations must be finite non-negative numbers.");
    }

    const total = h2 + ch4 + c2h6 + c2h4 + c2h2;
    if (total <= 0) {
      throw new RangeError("The sum of DGA gas concentrations must be greater than zero.");
    }

    return total;
  }

  function pointFor(h2, ch4, c2h6, c2h4, c2h2) {
    const total = validValues(h2, ch4, c2h6, c2h4, c2h2);

    return [
      (
        h2 * vertices.h2[0] +
        ch4 * vertices.ch4[0] +
        c2h6 * vertices.c2h6[0] +
        c2h4 * vertices.c2h4[0] +
        c2h2 * vertices.c2h2[0]
      ) / total,
      (
        h2 * vertices.h2[1] +
        ch4 * vertices.ch4[1] +
        c2h6 * vertices.c2h6[1] +
        c2h4 * vertices.c2h4[1] +
        c2h2 * vertices.c2h2[1]
      ) / total
    ];
  }

  function onSegment(point, a0, b0) {
    const epsilon = 0.000001;
    const cross =
      (point[1] - a0[1]) * (b0[0] - a0[0]) -
      (point[0] - a0[0]) * (b0[1] - a0[1]);

    if (Math.abs(cross) > epsilon) return false;

    return (
      point[0] >= Math.min(a0[0], b0[0]) - epsilon &&
      point[0] <= Math.max(a0[0], b0[0]) + epsilon &&
      point[1] >= Math.min(a0[1], b0[1]) - epsilon &&
      point[1] <= Math.max(a0[1], b0[1]) + epsilon
    );
  }

  function pointInPolygon(point, polygon) {
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a0 = polygon[i];
      const b0 = polygon[j];

      if (onSegment(point, a0, b0)) return true;

      const intersects =
        ((a0[1] > point[1]) !== (b0[1] > point[1])) &&
        point[0] <
          ((b0[0] - a0[0]) * (point[1] - a0[1])) / (b0[1] - a0[1]) + a0[0];

      if (intersects) inside = !inside;
    }

    return inside;
  }

  function classifyPoint(point) {
    for (const zone of zones) {
      if (pointInPolygon(point, zone.polygon)) {
        return zone.code;
      }
    }

    return "D2";
  }

  function appendText(svg, text, x, y, attributes) {
    const element = make("text", Object.assign({
      x,
      y,
      fill: "#1f1f1f",
      "font-family": "Arial, Helvetica, sans-serif",
      "font-size": 16,
      "text-anchor": "middle",
      "dominant-baseline": "middle"
    }, attributes || {}));

    element.textContent = text;
    svg.appendChild(element);
    return element;
  }

  return {
    classify(h2, ch4, c2h6, c2h4, c2h2) {
      return classifyPoint(pointFor(h2, ch4, c2h6, c2h4, c2h2));
    },

    render(svg, sample) {
      while (svg.firstChild) {
        svg.removeChild(svg.firstChild);
      }

      svg.appendChild(make("rect", {
        x: 0,
        y: 0,
        width: 600,
        height: 600,
        fill: "white"
      }));

      for (const zone of zones) {
        svg.appendChild(make("polygon", {
          points: polygonPoints(zone.polygon),
          fill: zone.color,
          stroke: "#ffffff",
          "stroke-width": 2,
          "stroke-linejoin": "round"
        }));
      }

      const center = [300, 300];
      const axisData = [
        [vertices.h2, "H₂", 300, 25, "middle"],
        [vertices.ch4, "CH₄", 570, 205, "start"],
        [vertices.c2h6, "C₂H₆", 485, 540, "start"],
        [vertices.c2h4, "C₂H₄", 115, 540, "end"],
        [vertices.c2h2, "C₂H₂", 30, 205, "end"]
      ];

      for (const axis of axisData) {
        svg.appendChild(make("line", {
          x1: center[0],
          y1: center[1],
          x2: axis[0][0],
          y2: axis[0][1],
          stroke: "#555",
          "stroke-width": 1,
          "stroke-dasharray": "4 4",
          opacity: 0.65
        }));
      }

      svg.appendChild(make("polygon", {
        points: polygonPoints([
          vertices.h2,
          vertices.ch4,
          vertices.c2h6,
          vertices.c2h4,
          vertices.c2h2
        ]),
        fill: "none",
        stroke: "#202020",
        "stroke-width": 3,
        "stroke-linejoin": "round"
      }));

      for (const zone of zones) {
        appendText(svg, zone.code, zone.label[0], zone.label[1], {
          "font-size": zone.code === "D2" ? 22 : 20,
          "font-weight": "bold",
          stroke: "rgba(255,255,255,0.45)",
          "stroke-width": 3,
          "paint-order": "stroke"
        });
      }

      for (const axis of axisData) {
        appendText(svg, axis[1], axis[2], axis[3], {
          "text-anchor": axis[4],
          "font-size": 18,
          "font-weight": "bold"
        });
      }

      appendText(svg, "Duval Pentagon 1", 300, 575, {
        "font-size": 18,
        "font-weight": "bold"
      });

      if (sample !== null && sample !== undefined) {
        const point = pointFor(
          sample.h2,
          sample.ch4,
          sample.c2h6,
          sample.c2h4,
          sample.c2h2
        );

        const code = classifyPoint(point);

        svg.appendChild(make("circle", {
          cx: point[0],
          cy: point[1],
          r: 8,
          fill: "#111",
          stroke: "#fff",
          "stroke-width": 3
        }));

        svg.appendChild(make("circle", {
          cx: point[0],
          cy: point[1],
          r: 2.5,
          fill: "#fff"
        }));

        appendText(svg, code, point[0] + 13, point[1] - 13, {
          "text-anchor": "start",
          "font-size": 16,
          "font-weight": "bold",
          fill: "#111",
          stroke: "#fff",
          "stroke-width": 4,
          "paint-order": "stroke"
        });
      }
    }
  };
})();
