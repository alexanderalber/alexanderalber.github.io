const DuvalPentagon = {
  classify(h2, ch4, c2h6, c2h4, c2h2) {
    const values = [h2, ch4, c2h6, c2h4, c2h2];

    if (!values.every(v => typeof v === "number" && Number.isFinite(v) && v >= 0)) {
      throw new TypeError("Gas concentrations must be finite, non-negative numbers.");
    }

    const max = Math.max(...values);
    if (max === 0) {
      throw new RangeError("The sum of gas concentrations must be greater than zero.");
    }

    const scaled = values.map(v => v / max);
    const sum = scaled.reduce((a, b) => a + b, 0);
    const fractions = scaled.map(v => v / sum);

    // Regular pentagon, clockwise from H2:
    // H2, CH4, C2H6, C2H4, C2H2.
    const vertices = Array.from({ length: 5 }, (_, i) => {
      const angle = (-90 + i * 72) * Math.PI / 180;
      return { x: Math.cos(angle), y: Math.sin(angle) };
    });

    const midpoint = (a, b) => ({
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2
    });

    // Representative positions for the six fault zones.
    const sites = [
      { code: "PD", point: vertices[0] },
      { code: "D1", point: midpoint(vertices[0], vertices[4]) },
      { code: "D2", point: midpoint(vertices[4], vertices[3]) },
      { code: "T3", point: vertices[3] },
      { code: "T2", point: midpoint(vertices[3], vertices[2]) },
      { code: "T1", point: midpoint(vertices[2], vertices[1]) }
    ];

    const point = fractions.reduce(
      (p, fraction, i) => ({
        x: p.x + fraction * vertices[i].x,
        y: p.y + fraction * vertices[i].y
      }),
      { x: 0, y: 0 }
    );

    let nearest = sites[0];
    let nearestDistance = Infinity;

    for (const site of sites) {
      const dx = point.x - site.point.x;
      const dy = point.y - site.point.y;
      const distance = dx * dx + dy * dy;

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = site;
      }
    }

    return nearest.code;
  },

  render(svg, sample) {
    const NS = "http://www.w3.org/2000/svg";
    const cx = 300;
    const cy = 300;
    const radius = 205;

    const create = (name, attributes, parent = svg, text = null) => {
      const element = document.createElementNS(NS, name);

      if (attributes) {
        for (const [key, value] of Object.entries(attributes)) {
          element.setAttribute(key, String(value));
        }
      }

      if (text !== null) {
        element.textContent = text;
      }

      parent.appendChild(element);
      return element;
    };

    const vertices = Array.from({ length: 5 }, (_, i) => {
      const angle = (-90 + i * 72) * Math.PI / 180;
      return {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle)
      };
    });

    const midpoint = (a, b) => ({
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2
    });

    const zones = [
      {
        code: "PD",
        color: "#DCEBFA",
        point: vertices[0]
      },
      {
        code: "D1",
        color: "#F5D0B5",
        point: midpoint(vertices[0], vertices[4])
      },
      {
        code: "D2",
        color: "#F0B0AA",
        point: midpoint(vertices[4], vertices[3])
      },
      {
        code: "T3",
        color: "#B7DCC5",
        point: vertices[3]
      },
      {
        code: "T2",
        color: "#E5D9A8",
        point: midpoint(vertices[3], vertices[2])
      },
      {
        code: "T1",
        color: "#F1E6B9",
        point: midpoint(vertices[2], vertices[1])
      }
    ];

    // Each zone is clipped to the pentagon and to the half-planes
    // defining the nearest representative point.
    const clipHalfPlane = (polygon, a, b, c) => {
      if (polygon.length === 0) return [];

      const result = [];
      const value = p => a * p.x + b * p.y - c;
      const inside = v => v <= 1e-9;

      for (let i = 0; i < polygon.length; i++) {
        const current = polygon[i];
        const previous = polygon[(i + polygon.length - 1) % polygon.length];

        const currentValue = value(current);
        const previousValue = value(previous);
        const currentInside = inside(currentValue);
        const previousInside = inside(previousValue);

        if (currentInside !== previousInside) {
          const t = previousValue / (previousValue - currentValue);
          result.push({
            x: previous.x + t * (current.x - previous.x),
            y: previous.y + t * (current.y - previous.y)
          });
        }

        if (currentInside) {
          result.push(current);
        }
      }

      return result;
    };

    const cellFor = site => {
      let polygon = vertices.map(p => ({ x: p.x, y: p.y }));

      for (const other of zones) {
        if (other === site) continue;

        // Points closer to site.point than to other.point satisfy:
        // 2(other - site) . x <= |other|^2 - |site|^2.
        const a = 2 * (other.point.x - site.point.x);
        const b = 2 * (other.point.y - site.point.y);
        const c =
          other.point.x * other.point.x +
          other.point.y * other.point.y -
          site.point.x * site.point.x -
          site.point.y * site.point.y;

        polygon = clipHalfPlane(polygon, a, b, c);
      }

      return polygon;
    };

    const polygonCentroid = polygon => {
      let area2 = 0;
      let x = 0;
      let y = 0;

      for (let i = 0; i < polygon.length; i++) {
        const p = polygon[i];
        const q = polygon[(i + 1) % polygon.length];
        const cross = p.x * q.y - q.x * p.y;

        area2 += cross;
        x += (p.x + q.x) * cross;
        y += (p.y + q.y) * cross;
      }

      if (Math.abs(area2) < 1e-9) {
        return {
          x: polygon.reduce((s, p) => s + p.x, 0) / polygon.length,
          y: polygon.reduce((s, p) => s + p.y, 0) / polygon.length
        };
      }

      return {
        x: x / (3 * area2),
        y: y / (3 * area2)
      };
    };

    // White drawing background.
    create("rect", {
      x: 0,
      y: 0,
      width: 600,
      height: 600,
      fill: "#FFFFFF"
    });

    // Filled fault-zone polygons and their labels.
    for (const zone of zones) {
      const polygon = cellFor(zone);

      if (polygon.length < 3) continue;

      create("polygon", {
        points: polygon.map(p => `${p.x},${p.y}`).join(" "),
        fill: zone.color,
        stroke: "#FFFFFF",
        "stroke-width": 1.5,
        "stroke-linejoin": "round"
      });

      const label = polygonCentroid(polygon);

      create("text", {
        x: label.x,
        y: label.y,
        fill: "#263238",
        "font-family": "Arial, Helvetica, sans-serif",
        "font-size": 17,
        "font-weight": "bold",
        "text-anchor": "middle",
        "dominant-baseline": "middle"
      }, svg, zone.code);
    }

    // Five radial gas axes and their tick marks.
    for (const vertex of vertices) {
      const dx = vertex.x - cx;
      const dy = vertex.y - cy;
      const length = Math.hypot(dx, dy);
      const ux = dx / length;
      const uy = dy / length;
      const tx = -uy;
      const ty = ux;

      create("line", {
        x1: cx,
        y1: cy,
        x2: vertex.x,
        y2: vertex.y,
        stroke: "#66737D",
        "stroke-width": 1.15,
        "stroke-opacity": 0.8
      });

      for (const fraction of [0.2, 0.4, 0.6, 0.8]) {
        const x = cx + dx * fraction;
        const y = cy + dy * fraction;
        const half = 4;

        create("line", {
          x1: x - tx * half,
          y1: y - ty * half,
          x2: x + tx * half,
          y2: y + ty * half,
          stroke: "#66737D",
          "stroke-width": 1
        });
      }
    }

    // Pentagon outline.
    create("polygon", {
      points: vertices.map(p => `${p.x},${p.y}`).join(" "),
      fill: "none",
      stroke: "#263238",
      "stroke-width": 2.2,
      "stroke-linejoin": "round"
    });

    // Gas names at the five axis ends.
    const gasNames = ["H2", "CH4", "C2H6", "C2H4", "C2H2"];

    for (let i = 0; i < vertices.length; i++) {
      const angle = (-90 + i * 72) * Math.PI / 180;
      const labelRadius = 258;
      const x = cx + labelRadius * Math.cos(angle);
      const y = cy + labelRadius * Math.sin(angle);

      create("text", {
        x,
        y,
        fill: "#17232B",
        "font-family": "Arial, Helvetica, sans-serif",
        "font-size": 16,
        "font-weight": "bold",
        "text-anchor": "middle",
        "dominant-baseline": "middle"
      }, svg, gasNames[i]);
    }

    // Mark the centre of the pentagon.
    create("circle", {
      cx,
      cy,
      r: 2.5,
      fill: "#263238"
    });

    // Optional sample point.
    if (sample !== null && sample !== undefined) {
      const values = [
        sample.h2,
        sample.ch4,
        sample.c2h6,
        sample.c2h4,
        sample.c2h2
      ];

      const code = DuvalPentagon.classify(...values);
      const max = Math.max(...values);
      const scaled = values.map(v => v / max);
      const sum = scaled.reduce((a, b) => a + b, 0);
      const fractions = scaled.map(v => v / sum);

      const point = fractions.reduce(
        (p, fraction, i) => ({
          x: p.x + fraction * vertices[i].x,
          y: p.y + fraction * vertices[i].y
        }),
        { x: 0, y: 0 }
      );

      create("circle", {
        cx: point.x,
        cy: point.y,
        r: 9,
        fill: "none",
        stroke: "#17232B",
        "stroke-width": 1.5
      });

      create("circle", {
        cx: point.x,
        cy: point.y,
        r: 5,
        fill: "#17232B",
        stroke: "#FFFFFF",
        "stroke-width": 1.5
      });

      const placeRight = point.x < 480;
      const labelX = point.x + (placeRight ? 13 : -13);
      const labelY = point.y - 13;

      create("text", {
        x: labelX,
        y: labelY,
        fill: "#17232B",
        stroke: "#FFFFFF",
        "stroke-width": 3,
        "paint-order": "stroke",
        "font-family": "Arial, Helvetica, sans-serif",
        "font-size": 13,
        "font-weight": "bold",
        "text-anchor": placeRight ? "start" : "end",
        "dominant-baseline": "middle"
      }, svg, code);
    }
  }
};