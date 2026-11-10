const DuvalTriangle5 = (() => {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";

  /*
   * Coordinates are expressed as percentages:
   *   x = C2H4 %
   *   y = C2H6 %
   *   CH4 % = 100 - x - y
   *
   * The four Duval Triangle 5 regions are:
   *   PD = partial discharge
   *   O  = overheating
   *   S  = stray gassing
   *   C  = carbonization
   */
  const zones = [
    {
      code: "PD",
      color: "#f5d76e",
      points: [
        [0, 0],
        [30, 0],
        [15, 15],
        [0, 15]
      ],
      label: [10, 5]
    },
    {
      code: "O",
      color: "#f7a35c",
      points: [
        [30, 0],
        [55, 0],
        [35, 20],
        [15, 15]
      ],
      label: [34, 7]
    },
    {
      code: "C",
      color: "#e96b68",
      points: [
        [55, 0],
        [100, 0],
        [65, 35],
        [35, 20]
      ],
      label: [66, 10]
    },
    {
      code: "S",
      color: "#7fc8a9",
      points: [
        [0, 15],
        [15, 15],
        [35, 20],
        [65, 35],
        [0, 100]
      ],
      label: [18, 47]
    }
  ];

  function pointInPolygon(x, y, polygon) {
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0];
      const yi = polygon[i][1];
      const xj = polygon[j][0];
      const yj = polygon[j][1];

      const onSegment =
        Math.abs((xj - xi) * (y - yi) - (yj - yi) * (x - xi)) < 1e-9 &&
        x >= Math.min(xi, xj) - 1e-9 &&
        x <= Math.max(xi, xj) + 1e-9 &&
        y >= Math.min(yi, yj) - 1e-9 &&
        y <= Math.max(yi, yj) + 1e-9;

      if (onSegment) {
        return true;
      }

      const intersects =
        (yi > y) !== (yj > y) &&
        x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

      if (intersects) {
        inside = !inside;
      }
    }

    return inside;
  }

  function normalized(ch4, c2h4, c2h6) {
    const values = [ch4, c2h4, c2h6];

    if (
      values.some(
        value =>
          typeof value !== "number" ||
          !Number.isFinite(value) ||
          value < 0
      )
    ) {
      throw new TypeError("Gas concentrations must be finite non-negative numbers.");
    }

    const total = ch4 + c2h4 + c2h6;

    if (total <= 0) {
      throw new RangeError("The sum of gas concentrations must be greater than zero.");
    }

    return {
      ch4: (ch4 / total) * 100,
      c2h4: (c2h4 / total) * 100,
      c2h6: (c2h6 / total) * 100
    };
  }

  function make(svg, name, attributes, text) {
    const element = document.createElementNS(NS, name);

    if (attributes) {
      Object.keys(attributes).forEach(key => {
        element.setAttribute(key, String(attributes[key]));
      });
    }

    if (text !== undefined) {
      element.textContent = text;
    }

    svg.appendChild(element);
    return element;
  }

  function svgPoint(c2h4, c2h6) {
    const left = 80;
    const right = 520;
    const baseY = 470;
    const topY = 89;

    return {
      x: left + ((c2h4 + c2h6 * 0.5) / 100) * (right - left),
      y: baseY - (c2h6 / 100) * (baseY - topY)
    };
  }

  function polygonString(points) {
    return points
      .map(point => {
        const p = svgPoint(point[0], point[1]);
        return p.x.toFixed(2) + "," + p.y.toFixed(2);
      })
      .join(" ");
  }

  function drawText(svg, x, y, text, options) {
    const attrs = Object.assign(
      {
        x: x,
        y: y,
        fill: "#1d2730",
        "font-family": "Arial, Helvetica, sans-serif",
        "font-size": 14,
        "text-anchor": "middle"
      },
      options || {}
    );

    return make(svg, "text", attrs, text);
  }

  return {
    classify(ch4, c2h4, c2h6) {
      const gas = normalized(ch4, c2h4, c2h6);

      for (let i = 0; i < zones.length; i++) {
        if (pointInPolygon(gas.c2h4, gas.c2h6, zones[i].points)) {
          return zones[i].code;
        }
      }

      return "S";
    },

    render(svg, sample) {
      while (svg.firstChild) {
        svg.removeChild(svg.firstChild);
      }

      make(svg, "rect", {
        x: 0,
        y: 0,
        width: 600,
        height: 540,
        fill: "#ffffff"
      });

      drawText(svg, 300, 34, "Duval Triangle 5", {
        "font-size": 22,
        "font-weight": "bold"
      });

      drawText(
        svg,
        300,
        56,
        "CH₄ / C₂H₄ / C₂H₆ (% of total)",
        {
          "font-size": 12,
          fill: "#4a5560"
        }
      );

      zones.forEach(zone => {
        make(svg, "polygon", {
          points: polygonString(zone.points),
          fill: zone.color,
          stroke: "#ffffff",
          "stroke-width": 2,
          "stroke-linejoin": "round"
        });
      });

      const triangle = [
        svgPoint(0, 0),
        svgPoint(100, 0),
        svgPoint(0, 100)
      ];

      make(svg, "polyline", {
        points: triangle
          .map(p => p.x.toFixed(2) + "," + p.y.toFixed(2))
          .join(" ") + " " + triangle[0].x.toFixed(2) + "," + triangle[0].y.toFixed(2),
        fill: "none",
        stroke: "#24313b",
        "stroke-width": 2
      });

      for (let value = 0; value <= 100; value += 10) {
        const bottom = svgPoint(value, 0);
        const left = svgPoint(0, 100 - value);
        const right = svgPoint(100 - value, value);

        make(svg, "line", {
          x1: bottom.x,
          y1: bottom.y,
          x2: bottom.x,
          y2: bottom.y + 6,
          stroke: "#24313b",
          "stroke-width": 1
        });

        make(svg, "line", {
          x1: left.x,
          y1: left.y,
          x2: left.x - 5.2,
          y2: left.y + 3,
          stroke: "#24313b",
          "stroke-width": 1
        });

        make(svg, "line", {
          x1: right.x,
          y1: right.y,
          x2: right.x + 5.2,
          y2: right.y + 3,
          stroke: "#24313b",
          "stroke-width": 1
        });

        if (value % 20 === 0) {
          drawText(svg, bottom.x, bottom.y + 21, String(value), {
            "font-size": 10,
            fill: "#4a5560"
          });

          drawText(svg, left.x - 14, left.y + 7, String(value), {
            "font-size": 10,
            fill: "#4a5560"
          });

          drawText(svg, right.x + 14, right.y + 7, String(value), {
            "font-size": 10,
            fill: "#4a5560"
          });
        }
      }

      drawText(svg, 300, 520, "C₂H₄ (%)", {
        "font-size": 16,
        "font-weight": "bold"
      });

      drawText(svg, 118, 284, "CH₄ (%)", {
        "font-size": 16,
        "font-weight": "bold",
        transform: "rotate(-60 118 284)"
      });

      drawText(svg, 482, 284, "C₂H₆ (%)", {
        "font-size": 16,
        "font-weight": "bold",
        transform: "rotate(60 482 284)"
      });

      zones.forEach(zone => {
        const p = svgPoint(zone.label[0], zone.label[1]);

        drawText(svg, p.x, p.y, zone.code, {
          "font-size": 22,
          "font-weight": "bold",
          fill: "#18232d",
          stroke: "#ffffff",
          "stroke-width": 3,
          "paint-order": "stroke"
        });
      });

      if (sample !== null && sample !== undefined) {
        const gas = normalized(sample.ch4, sample.c2h4, sample.c2h6);
        const p = svgPoint(gas.c2h4, gas.c2h6);
        const code = this.classify(sample.ch4, sample.c2h4, sample.c2h6);

        make(svg, "circle", {
          cx: p.x,
          cy: p.y,
          r: 7,
          fill: "#111827",
          stroke: "#ffffff",
          "stroke-width": 3
        });

        make(svg, "circle", {
          cx: p.x,
          cy: p.y,
          r: 2,
          fill: "#ffffff"
        });

        drawText(svg, p.x + 12, p.y - 10, code, {
          "font-size": 13,
          "font-weight": "bold",
          "text-anchor": "start",
          fill: "#111827",
          stroke: "#ffffff",
          "stroke-width": 3,
          "paint-order": "stroke"
        });
      }
    }
  };
})();
