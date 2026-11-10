const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const values = [ch4, c2h4, c2h2];

    if (!values.every(v => typeof v === "number" && Number.isFinite(v) && v >= 0)) {
      throw new RangeError("Gas concentrations must be finite, non-negative numbers.");
    }

    const total = ch4 + c2h4 + c2h2;
    if (!(total > 0) || !Number.isFinite(total)) {
      throw new RangeError("The sum of gas concentrations must be greater than zero.");
    }

    // Coordinates are percentages: [C2H4, C2H2].
    // CH4 is the remainder. The polygons form a complete partition
    // of the ternary triangle using the classic seven fault zones.
    const u = 100 * c2h4 / total;
    const v = 100 * c2h2 / total;

    const zones = [
      {
        code: "PD",
        polygon: [[0, 0], [2, 0], [0, 2]]
      },
      {
        code: "T1",
        polygon: [[2, 0], [20, 0], [20, 4], [0, 4], [0, 2]]
      },
      {
        code: "T2",
        polygon: [[20, 0], [50, 0], [50, 15], [20, 4]]
      },
      {
        code: "T3",
        polygon: [[50, 0], [100, 0], [85, 15], [50, 15]]
      },
      {
        code: "D1",
        polygon: [[0, 4], [0, 29], [25, 35], [35, 25], [50, 15], [20, 4]]
      },
      {
        code: "D2",
        polygon: [[0, 100], [0, 29], [25, 35], [50, 50], [75, 25]]
      },
      {
        code: "DT",
        polygon: [[35, 25], [25, 35], [50, 50], [75, 25], [85, 15], [50, 15]]
      }
    ];

    function pointInPolygon(x, y, polygon) {
      let inside = false;
      const eps = 1e-9;

      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[j];
        const b = polygon[i];

        const cross = (x - a[0]) * (b[1] - a[1]) -
                      (y - a[1]) * (b[0] - a[0]);

        const dot = (x - a[0]) * (b[0] - a[0]) +
                    (y - a[1]) * (b[1] - a[1]);

        const lengthSquared = (b[0] - a[0]) ** 2 +
                              (b[1] - a[1]) ** 2;

        if (Math.abs(cross) <= eps &&
            dot >= -eps &&
            dot <= lengthSquared + eps) {
          return true;
        }

        if ((a[1] > y) !== (b[1] > y)) {
          const intersectionX =
            a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]);

          if (x < intersectionX) {
            inside = !inside;
          }
        }
      }

      return inside;
    }

    for (const zone of zones) {
      if (pointInPolygon(u, v, zone.polygon)) {
        return zone.code;
      }
    }

    // A valid ternary point should always belong to a zone.
    return "DT";
  },

  render(svg, sample) {
    const NS = "http://www.w3.org/2000/svg";
    const doc = document;

    const zones = [
      {
        code: "PD",
        color: "#e8d5f5",
        polygon: [[0, 0], [2, 0], [0, 2]]
      },
      {
        code: "T1",
        color: "#d9e8f5",
        polygon: [[2, 0], [20, 0], [20, 4], [0, 4], [0, 2]]
      },
      {
        code: "T2",
        color: "#a8d5c4",
        polygon: [[20, 0], [50, 0], [50, 15], [20, 4]]
      },
      {
        code: "T3",
        color: "#80b9d7",
        polygon: [[50, 0], [100, 0], [85, 15], [50, 15]]
      },
      {
        code: "D1",
        color: "#f4b183",
        polygon: [[0, 4], [0, 29], [25, 35], [35, 25], [50, 15], [20, 4]]
      },
      {
        code: "D2",
        color: "#e88989",
        polygon: [[0, 100], [0, 29], [25, 35], [50, 50], [75, 25]]
      },
      {
        code: "DT",
        color: "#f5d58a",
        polygon: [[35, 25], [25, 35], [50, 50], [75, 25], [85, 15], [50, 15]]
      }
    ];

    const M = { x: 70, y: 470 };
    const E = { x: 530, y: 470 };
    const A = { x: 300, y: 71.6 };

    function xy(u, v) {
      return {
        x: M.x + 4.6 * u + 2.3 * v,
        y: M.y - 3.984 * v
      };
    }

    function append(parent, name, attributes, content) {
      const node = doc.createElementNS(NS, name);

      if (attributes) {
        for (const key of Object.keys(attributes)) {
          node.setAttribute(key, String(attributes[key]));
        }
      }

      if (content !== undefined && content !== null) {
        node.textContent = String(content);
      }

      parent.appendChild(node);
      return node;
    }

    function line(parent, x1, y1, x2, y2, attributes = {}) {
      return append(parent, "line", {
        x1, y1, x2, y2,
        ...attributes
      });
    }

    function addText(parent, content, x, y, attributes = {}) {
      return append(parent, "text", {
        x,
        y,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        "font-family": "Arial, Helvetica, sans-serif",
        "font-size": 12,
        fill: "#242424",
        ...attributes
      }, content);
    }

    function polygonPoints(vertices) {
      return vertices.map(([u, v]) => {
        const p = xy(u, v);
        return `${p.x},${p.y}`;
      }).join(" ");
    }

    // Clear only the contents of the supplied SVG.
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    append(svg, "rect", {
      x: 0,
      y: 0,
      width: 600,
      height: 540,
      fill: "#ffffff"
    });

    addText(svg, "Duval Triangle 1", 300, 19, {
      "font-size": 17,
      "font-weight": "bold"
    });

    // Draw all seven fault zones.
    for (const zone of zones) {
      append(svg, "polygon", {
        points: polygonPoints(zone.polygon),
        fill: zone.color,
        stroke: "#ffffff",
        "stroke-width": 2,
        "stroke-linejoin": "round"
      });
    }

    // Ternary grid lines, at 10% intervals.
    const grid = append(svg, "g", {
      fill: "none",
      stroke: "#a5a5a5",
      "stroke-width": 0.65,
      "stroke-opacity": 0.55
    });

    for (let p = 10; p < 100; p += 10) {
      // Constant C2H4.
      let a = xy(p, 0);
      let b = xy(p, 100 - p);
      line(grid, a.x, a.y, b.x, b.y);

      // Constant C2H2.
      a = xy(0, p);
      b = xy(100 - p, p);
      line(grid, a.x, a.y, b.x, b.y);

      // Constant CH4.
      a = xy(0, 100 - p);
      b = xy(100 - p, 0);
      line(grid, a.x, a.y, b.x, b.y);
    }

    // Triangle outline.
    append(svg, "polygon", {
      points: `${M.x},${M.y} ${E.x},${E.y} ${A.x},${A.y}`,
      fill: "none",
      stroke: "#202020",
      "stroke-width": 2.2,
      "stroke-linejoin": "round"
    });

    // Methane scale along the left edge: 100% at M, 0% at A.
    const leftVector = {
      x: A.x - M.x,
      y: A.y - M.y
    };
    const leftLength = Math.hypot(leftVector.x, leftVector.y);
    const leftNormal = {
      x: leftVector.y / leftLength,
      y: -leftVector.x / leftLength
    };

    for (let value = 10; value < 100; value += 10) {
      const p = xy(0, 100 - value);
      const tx = p.x + leftNormal.x * 6;
      const ty = p.y + leftNormal.y * 6;

      line(svg, p.x, p.y, tx, ty, {
        stroke: "#202020",
        "stroke-width": 1.1
      });

      addText(
        svg,
        value,
        p.x + leftNormal.x * 18,
        p.y + leftNormal.y * 18,
        {
          "font-size": 9.5,
          "text-anchor": "end"
        }
      );
    }

    // Ethylene scale along the right edge: 0% at A, 100% at E.
    const rightVector = {
      x: E.x - A.x,
      y: E.y - A.y
    };
    const rightLength = Math.hypot(rightVector.x, rightVector.y);
    const rightNormal = {
      x: rightVector.y / rightLength,
      y: -rightVector.x / rightLength
    };

    for (let value = 10; value < 100; value += 10) {
      const p = xy(value, 100 - value);
      const tx = p.x + rightNormal.x * 6;
      const ty = p.y + rightNormal.y * 6;

      line(svg, p.x, p.y, tx, ty, {
        stroke: "#202020",
        "stroke-width": 1.1
      });

      addText(
        svg,
        value,
        p.x + rightNormal.x * 18,
        p.y + rightNormal.y * 18,
        {
          "font-size": 9.5,
          "text-anchor": "start"
        }
      );
    }

    // Acetylene scale along the vertical median.
    line(svg, A.x, A.y, 300, 470, {
      stroke: "#555555",
      "stroke-width": 0.9,
      "stroke-dasharray": "3 4",
      "stroke-opacity": 0.8
    });

    for (let value = 10; value < 100; value += 10) {
      const p = xy((100 - value) / 2, value);

      line(svg, p.x - 5, p.y, p.x + 5, p.y, {
        stroke: "#202020",
        "stroke-width": 1.1
      });

      addText(svg, value, p.x - 9, p.y, {
        "font-size": 9.5,
        "text-anchor": "end"
      });
    }

    // Axis names and vertex labels.
    addText(svg, "C₂H₂ (%)", 300, 48, {
      "font-size": 12,
      "font-weight": "bold"
    });

    addText(svg, "CH₄ (%)", 27, 270, {
      "font-size": 12,
      "font-weight": "bold",
      transform: "rotate(-60 27 270)"
    });

    addText(svg, "C₂H₄ (%)", 573, 270, {
      "font-size": 12,
      "font-weight": "bold",
      transform: "rotate(60 573 270)"
    });

    addText(svg, "CH₄ 100%", 66, 492, {
      "font-size": 10,
      "text-anchor": "end"
    });

    addText(svg, "C₂H₄ 100%", 534, 492, {
      "font-size": 10,
      "text-anchor": "start"
    });

    addText(svg, "C₂H₂ 100%", 300, 68, {
      "font-size": 9.5,
      "font-weight": "bold"
    });

    // Zone labels.
    const labels = {
      T1: { x: 116, y: 459, size: 12 },
      T2: { x: 242, y: 449, size: 14 },
      T3: { x: 450, y: 440, size: 14 },
      D1: { x: 218, y: 392, size: 15 },
      D2: { x: 316, y: 280, size: 15 },
      DT: { x: 379, y: 359, size: 15 }
    };

    for (const zone of zones) {
      if (zone.code === "PD") {
        continue;
      }

      const label = labels[zone.code];

      addText(svg, zone.code, label.x, label.y, {
        "font-size": label.size,
        "font-weight": "bold",
        stroke: "#ffffff",
        "stroke-width": 2.5,
        "paint-order": "stroke"
      });
    }

    // PD is very small, so use a leader line to keep its label legible.
    const pdCenter = xy(2 / 3, 2 / 3);

    line(svg, 84, 451, pdCenter.x, pdCenter.y, {
      stroke: "#554264",
      "stroke-width": 1.1
    });

    addText(svg, "PD", 89, 447, {
      "font-size": 11,
      "font-weight": "bold",
      fill: "#554264",
      "text-anchor": "start",
      stroke: "#ffffff",
      "stroke-width": 2,
      "paint-order": "stroke"
    });

    // Optional sample marker.
    if (sample !== null && sample !== undefined) {
      const { ch4, c2h4, c2h2 } = sample;
      const total = ch4 + c2h4 + c2h2;

      if (
        ![ch4, c2h4, c2h2].every(
          value => typeof value === "number" &&
                   Number.isFinite(value) &&
                   value >= 0
        ) ||
        !(total > 0) ||
        !Number.isFinite(total)
      ) {
        throw new RangeError("Sample concentrations must be finite, non-negative numbers with a positive sum.");
      }

      const u = 100 * c2h4 / total;
      const v = 100 * c2h2 / total;
      const p = xy(u, v);
      const fault = DuvalTriangle.classify(ch4, c2h4, c2h2);

      const marker = append(svg, "g", {
        "aria-label": `Sample point, classified as ${fault}`
      });

      append(marker, "circle", {
        cx: p.x,
        cy: p.y,
        r: 10,
        fill: "none",
        stroke: "#202020",
        "stroke-width": 1.5
      });

      append(marker, "circle", {
        cx: p.x,
        cy: p.y,
        r: 5.5,
        fill: "#202020",
        stroke: "#ffffff",
        "stroke-width": 1.7
      });

      append(marker, "title", null,
        `Sample: ${fault} (CH4 ${ch4} ppm, C2H4 ${c2h4} ppm, C2H2 ${c2h2} ppm)`
      );
    }
  }
};