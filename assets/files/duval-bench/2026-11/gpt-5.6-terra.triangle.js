const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const values = [ch4, c2h4, c2h2];

    if (
      !values.every(function (v) {
        return typeof v === "number" && Number.isFinite(v) && v >= 0;
      })
    ) {
      throw new TypeError("Gas concentrations must be finite non-negative numbers.");
    }

    const total = ch4 + c2h4 + c2h2;
    if (total <= 0) {
      throw new RangeError("The sum of gas concentrations must be greater than zero.");
    }

    const e = (c2h4 / total) * 100;
    const a = (c2h2 / total) * 100;

    const zones = [
      {
        code: "PD",
        points: [
          [0, 0],
          [2, 0],
          [0, 2]
        ]
      },
      {
        code: "T1",
        points: [
          [2, 0],
          [20, 0],
          [20, 4],
          [0, 2]
        ]
      },
      {
        code: "T2",
        points: [
          [20, 0],
          [50, 0],
          [50, 4],
          [20, 4]
        ]
      },
      {
        code: "T3",
        points: [
          [50, 0],
          [100, 0],
          [96, 4],
          [50, 4]
        ]
      },
      {
        code: "D1",
        points: [
          [0, 2],
          [20, 4],
          [20, 23],
          [0, 23]
        ]
      },
      {
        code: "D2",
        points: [
          [0, 23],
          [20, 23],
          [96, 4],
          [100, 0],
          [0, 100]
        ]
      }
    ];

    function contains(point, polygon) {
      let inside = false;

      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][0];
        const yi = polygon[i][1];
        const xj = polygon[j][0];
        const yj = polygon[j][1];

        const onSegment =
          Math.abs((point[1] - yi) * (xj - xi) - (point[0] - xi) * (yj - yi)) < 1e-9 &&
          point[0] >= Math.min(xi, xj) - 1e-9 &&
          point[0] <= Math.max(xi, xj) + 1e-9 &&
          point[1] >= Math.min(yi, yj) - 1e-9 &&
          point[1] <= Math.max(yi, yj) + 1e-9;

        if (onSegment) return true;

        const intersects =
          (yi > point[1]) !== (yj > point[1]) &&
          point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;

        if (intersects) inside = !inside;
      }

      return inside;
    }

    for (let i = 0; i < zones.length; i++) {
      if (contains([e, a], zones[i].points)) {
        return zones[i].code;
      }
    }

    return "D2";
  },

  render(svg, sample) {
    const ns = "http://www.w3.org/2000/svg";
    const left = 60;
    const right = 540;
    const baseY = 480;
    const height = 415.692;
    const scale = 4.8;

    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    function element(name, attributes, text) {
      const node = document.createElementNS(ns, name);

      if (attributes) {
        Object.keys(attributes).forEach(function (key) {
          node.setAttribute(key, attributes[key]);
        });
      }

      if (text !== undefined) {
        node.textContent = text;
      }

      svg.appendChild(node);
      return node;
    }

    function pointFromPercent(m, e, a) {
      return {
        x: left + scale * (e + a / 2),
        y: baseY - (height * a) / 100
      };
    }

    function polygonPoints(points) {
      return points
        .map(function (p) {
          const q = pointFromPercent(100 - p[0] - p[1], p[0], p[1]);
          return q.x.toFixed(2) + "," + q.y.toFixed(2);
        })
        .join(" ");
    }

    function centroid(points) {
      let e = 0;
      let a = 0;

      points.forEach(function (p) {
        e += p[0];
        a += p[1];
      });

      e /= points.length;
      a /= points.length;

      return pointFromPercent(100 - e - a, e, a);
    }

    const zones = [
      {
        code: "PD",
        fill: "#d8f3dc",
        points: [
          [0, 0],
          [2, 0],
          [0, 2]
        ]
      },
      {
        code: "T1",
        fill: "#cfe8ff",
        points: [
          [2, 0],
          [20, 0],
          [20, 4],
          [0, 2]
        ]
      },
      {
        code: "T2",
        fill: "#ffe8a3",
        points: [
          [20, 0],
          [50, 0],
          [50, 4],
          [20, 4]
        ]
      },
      {
        code: "T3",
        fill: "#ffb3b3",
        points: [
          [50, 0],
          [100, 0],
          [96, 4],
          [50, 4]
        ]
      },
      {
        code: "D1",
        fill: "#f6d6ff",
        points: [
          [0, 2],
          [20, 4],
          [20, 23],
          [0, 23]
        ]
      },
      {
        code: "D2",
        fill: "#d7d2ff",
        points: [
          [0, 23],
          [20, 23],
          [96, 4],
          [100, 0],
          [0, 100]
        ]
      }
    ];

    element("rect", {
      x: "0",
      y: "0",
      width: "600",
      height: "540",
      fill: "white"
    });

    zones.forEach(function (zone) {
      element("polygon", {
        points: polygonPoints(zone.points),
        fill: zone.fill,
        stroke: "#555",
        "stroke-width": "1.2",
        "stroke-linejoin": "round"
      });
    });

    const triangle = [
      pointFromPercent(100, 0, 0),
      pointFromPercent(0, 100, 0),
      pointFromPercent(0, 0, 100)
    ];

    element("polygon", {
      points: triangle.map(function (p) {
        return p.x + "," + p.y;
      }).join(" "),
      fill: "none",
      stroke: "#111",
      "stroke-width": "2"
    });

    zones.forEach(function (zone) {
      const c = centroid(zone.points);
      const small = zone.code === "PD";

      element(
        "text",
        {
          x: c.x.toFixed(2),
          y: (c.y + (small ? 4 : 5)).toFixed(2),
          "text-anchor": "middle",
          "font-family": "Arial, sans-serif",
          "font-size": small ? "9" : "17",
          "font-weight": "bold",
          fill: "#222"
        },
        zone.code
      );
    });

    for (let value = 0; value <= 100; value += 10) {
      const baseX = left + (right - left) * (value / 100);

      element("line", {
        x1: baseX,
        y1: baseY,
        x2: baseX,
        y2: baseY + 7,
        stroke: "#111",
        "stroke-width": "1"
      });

      if (value < 100) {
        element(
          "text",
          {
            x: baseX,
            y: baseY + 21,
            "text-anchor": "middle",
            "font-family": "Arial, sans-serif",
            "font-size": "10",
            fill: "#222"
          },
          String(value)
        );
      }

      const ch4Point = pointFromPercent(value, 0, 100 - value);
      const ch4TickX = ch4Point.x - 6;
      const ch4TickY = ch4Point.y + 3.5;

      element("line", {
        x1: ch4Point.x,
        y1: ch4Point.y,
        x2: ch4TickX,
        y2: ch4TickY,
        stroke: "#111",
        "stroke-width": "1"
      });

      if (value > 0 && value < 100) {
        element(
          "text",
          {
            x: ch4Point.x - 17,
            y: ch4Point.y + 5,
            "text-anchor": "middle",
            "font-family": "Arial, sans-serif",
            "font-size": "10",
            fill: "#222"
          },
          String(value)
        );
      }

      const aPoint = pointFromPercent(0, 100 - value, value);
      const aTickX = aPoint.x + 6;
      const aTickY = aPoint.y + 3.5;

      element("line", {
        x1: aPoint.x,
        y1: aPoint.y,
        x2: aTickX,
        y2: aTickY,
        stroke: "#111",
        "stroke-width": "1"
      });

      if (value > 0 && value < 100) {
        element(
          "text",
          {
            x: aPoint.x + 18,
            y: aPoint.y + 5,
            "text-anchor": "middle",
            "font-family": "Arial, sans-serif",
            "font-size": "10",
            fill: "#222"
          },
          String(value)
        );
      }
    }

    element(
      "text",
      {
        x: "300",
        y: "525",
        "text-anchor": "middle",
        "font-family": "Arial, sans-serif",
        "font-size": "16",
        "font-weight": "bold",
        fill: "#111"
      },
      "C₂H₄ (%)"
    );

    element(
      "text",
      {
        x: "26",
        y: "295",
        "text-anchor": "middle",
        "font-family": "Arial, sans-serif",
        "font-size": "16",
        "font-weight": "bold",
        fill: "#111",
        transform: "rotate(-60 26 295)"
      },
      "CH₄ (%)"
    );

    element(
      "text",
      {
        x: "574",
        y: "295",
        "text-anchor": "middle",
        "font-family": "Arial, sans-serif",
        "font-size": "16",
        "font-weight": "bold",
        fill: "#111",
        transform: "rotate(60 574 295)"
      },
      "C₂H₂ (%)"
    );

    if (sample !== null && sample !== undefined) {
      const ch4 = sample.ch4;
      const c2h4 = sample.c2h4;
      const c2h2 = sample.c2h2;
      const total = ch4 + c2h4 + c2h2;

      if (
        typeof ch4 === "number" &&
        typeof c2h4 === "number" &&
        typeof c2h2 === "number" &&
        Number.isFinite(ch4) &&
        Number.isFinite(c2h4) &&
        Number.isFinite(c2h2) &&
        ch4 >= 0 &&
        c2h4 >= 0 &&
        c2h2 >= 0 &&
        total > 0
      ) {
        const p = pointFromPercent(
          (ch4 / total) * 100,
          (c2h4 / total) * 100,
          (c2h2 / total) * 100
        );

        element("circle", {
          cx: p.x,
          cy: p.y,
          r: "7",
          fill: "white",
          stroke: "#111",
          "stroke-width": "2"
        });

        element("circle", {
          cx: p.x,
          cy: p.y,
          r: "3.5",
          fill: "#d00000"
        });
      }
    }
  }
};
