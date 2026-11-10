const DuvalPentagon = (function () {
  const DEG2RAD = Math.PI / 180;

  // Gas axes in counter-clockwise order: H2, C2H6, CH4, C2H4, C2H2
  const AXES = [
    { name: "H2", label: "H\u2082", angle: 90 },
    { name: "C2H6", label: "C\u2082H\u2086", angle: 162 },
    { name: "CH4", label: "CH\u2084", angle: 234 },
    { name: "C2H4", label: "C\u2082H\u2084", angle: 306 },
    { name: "C2H2", label: "C\u2082H\u2082", angle: 18 }
  ].map(axis => ({
    ...axis,
    cos: Math.cos(axis.angle * DEG2RAD),
    sin: Math.sin(axis.angle * DEG2RAD),
    vx: 40 * Math.cos(axis.angle * DEG2RAD),
    vy: 40 * Math.sin(axis.angle * DEG2RAD)
  }));

  // Outer vertices in CCW order: V0(H2), V1(C2H6), V2(CH4), V3(C2H4), V4(C2H2)
  const V = AXES.map(a => [a.vx, a.vy]);

  // Duval Pentagon 1 zone definitions in centroid coordinate space (-40 to +40)
  const ZONES = [
    {
      code: "PD",
      name: "Corona Partial Discharges",
      color: "#d8b4f8",
      labelPos: [-0.5, 28.5],
      poly: [
        [0, 33],
        [-1, 33],
        [-1, 24.5],
        [0, 24.5]
      ]
    },
    {
      code: "S",
      name: "Stray Gassing",
      color: "#bae6fd",
      labelPos: [-16, 12],
      poly: [
        V[0],
        V[1],
        [-23.5, -12.4],
        [-3.5, -3.0],
        [0, 1.5],
        [0, 24.5],
        [-1, 24.5],
        [-1, 33],
        [0, 33]
      ]
    },
    {
      code: "T1",
      name: "Thermal Faults < 300 \u00b0C",
      color: "#fef08a",
      labelPos: [-14, -14],
      poly: [
        [-23.5, -12.4],
        V[2],
        [-6.0, -32.4],
        [-22.5, -3.2],
        [-3.5, -3.0]
      ]
    },
    {
      code: "T2",
      name: "Thermal Faults 300\u2013700 \u00b0C",
      color: "#fdba74",
      labelPos: [-5, -24],
      poly: [
        [-22.5, -3.2],
        [-6.0, -32.4],
        [1.0, -32.4]
      ]
    },
    {
      code: "T3",
      name: "Thermal Faults > 700 \u00b0C",
      color: "#f87171",
      labelPos: [9, -17],
      poly: [
        [-3.5, -3.0],
        [-22.5, -3.2],
        [1.0, -32.4],
        V[3],
        [24.3, -3.0],
        [0, -3.0]
      ]
    },
    {
      code: "D2",
      name: "Discharges of High Energy",
      color: "#86efac",
      labelPos: [12, 1],
      poly: [
        [0, 1.5],
        [-3.5, -3.0],
        [0, -3.0],
        [24.3, -3.0],
        [32.0, 6.2],
        [4.0, 16.0]
      ]
    },
    {
      code: "D1",
      name: "Discharges of Low Energy",
      color: "#6ee7b7",
      labelPos: [15, 16],
      poly: [
        V[0],
        [0, 1.5],
        [4.0, 16.0],
        [32.0, 6.2],
        V[4]
      ]
    }
  ];

  function computeCentroid(h2, ch4, c2h6, c2h4, c2h2) {
    const vals = [h2, c2h6, ch4, c2h4, c2h2].map(v => Math.max(0, Number(v) || 0));
    const sum = vals.reduce((a, b) => a + b, 0);
    if (sum <= 0) return { x: 0, y: 0, pcts: [0, 0, 0, 0, 0] };

    const pcts = vals.map(v => (v / sum) * 100);
    const pts = pcts.map((p, i) => [p * AXES[i].cos, p * AXES[i].sin]);

    let A = 0;
    let cx = 0;
    let cy = 0;

    for (let i = 0; i < 5; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % 5];
      const cross = x0 * y1 - x1 * y0;
      A += cross;
      cx += (x0 + x1) * cross;
      cy += (y0 + y1) * cross;
    }

    A *= 0.5;

    if (Math.abs(A) < 1e-7) {
      // Fallback to weighted average if polygon is degenerate (e.g. single gas or collinear)
      let wx = 0;
      let wy = 0;
      for (let i = 0; i < 5; i++) {
        wx += pts[i][0];
        wy += pts[i][1];
      }
      return { x: wx * 0.4, y: wy * 0.4, pcts, pts };
    }

    cx /= 6 * A;
    cy /= 6 * A;
    return { x: cx, y: cy, pcts, pts };
  }

  function pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1];
      const xj = poly[j][0], yj = poly[j][1];
      const intersect = ((yi > y) !== (yj > y)) &&
        (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function distToSegmentSq(px, py, x1, y1, x2, y2) {
    const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
    if (l2 === 0) return (px - x1) ** 2 + (py - y1) ** 2;
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    const projX = x1 + t * (x2 - x1);
    const projY = y1 + t * (y2 - y1);
    return (px - projX) ** 2 + (py - projY) ** 2;
  }

  function classifyPoint(x, y) {
    // Check PD first since it is nested/adjacent inside S
    for (let i = 0; i < ZONES.length; i++) {
      if (pointInPoly(x, y, ZONES[i].poly)) {
        return ZONES[i].code;
      }
    }
    // If on boundary or slightly outside due to numerical precision, pick closest zone edge
    let bestCode = "S";
    let minDist = Infinity;
    for (const zone of ZONES) {
      const poly = zone.poly;
      for (let i = 0; i < poly.length; i++) {
        const [x1, y1] = poly[i];
        const [x2, y2] = poly[(i + 1) % poly.length];
        const d = distToSegmentSq(x, y, x1, y1, x2, y2);
        if (d < minDist) {
          minDist = d;
          bestCode = zone.code;
        }
      }
    }
    return bestCode;
  }

  function classify(h2, ch4, c2h6, c2h4, c2h2) {
    const { x, y } = computeCentroid(h2, ch4, c2h6, c2h4, c2h2);
    return classifyPoint(x, y);
  }

  function render(svg, sample) {
    const NS = "http://www.w3.org/2000/svg";
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    const CX = 300;
    const CY = 315;
    const SCALE = 5.4; // 40 units -> 216 px radius

    function toScreen(x, y) {
      return [CX + x * SCALE, CY - y * SCALE];
    }

    function createEl(tag, attrs = {}, text = null) {
      const el = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, v);
      }
      if (text !== null) {
        el.textContent = text;
      }
      return el;
    }

    // Background
    svg.appendChild(createEl("rect", {
      x: 0, y: 0, width: 600, height: 600, fill: "#ffffff"
    }));

    // Title
    svg.appendChild(createEl("text", {
      x: 300, y: 36,
      "text-anchor": "middle",
      "font-family": "sans-serif",
      "font-size": "20",
      "font-weight": "bold",
      fill: "#1e293b"
    }, "Duval Pentagon 1"));

    // Draw Zones
    const zonesGroup = createEl("g");
    for (const zone of ZONES) {
      const ptsStr = zone.poly
        .map(([x, y]) => toScreen(x, y).map(n => n.toFixed(2)).join(","))
        .join(" ");
      zonesGroup.appendChild(createEl("polygon", {
        points: ptsStr,
        fill: zone.color,
        stroke: "#334155",
        "stroke-width": "1.5",
        "stroke-linejoin": "round"
      }));
    }
    svg.appendChild(zonesGroup);

    // Grid / Axes from origin to vertices
    const axesGroup = createEl("g");
    for (let level = 10; level <= 30; level += 10) {
      const ringPts = AXES.map(a =>
        toScreen(level * a.cos, level * a.sin).map(n => n.toFixed(1)).join(",")
      ).join(" ");
      axesGroup.appendChild(createEl("polygon", {
        points: ringPts,
        fill: "none",
        stroke: "#475569",
        "stroke-width": "0.6",
        "stroke-dasharray": "3,3",
        opacity: "0.45"
      }));
    }

    for (const axis of AXES) {
      const [xEnd, yEnd] = toScreen(axis.vx, axis.vy);
      axesGroup.appendChild(createEl("line", {
        x1: CX, y1: CY,
        x2: xEnd.toFixed(2), y2: yEnd.toFixed(2),
        stroke: "#475569",
        "stroke-width": "1",
        "stroke-dasharray": "4,4",
        opacity: "0.7"
      }));

      // Vertex dot
      axesGroup.appendChild(createEl("circle", {
        cx: xEnd.toFixed(2), cy: yEnd.toFixed(2),
        r: "3",
        fill: "#1e293b"
      }));

      // Axis Gas Label
      const [lx, ly] = toScreen(46.5 * axis.cos, 46.5 * axis.sin);
      axesGroup.appendChild(createEl("text", {
        x: lx.toFixed(2),
        y: (ly + 5).toFixed(2),
        "text-anchor": "middle",
        "font-family": "sans-serif",
        "font-size": "15",
        "font-weight": "bold",
        fill: "#0f172a"
      }, `${axis.label} (100%)`));
    }

    // Center origin cross
    axesGroup.appendChild(createEl("circle", {
      cx: CX, cy: CY, r: "2.5", fill: "#334155"
    }));
    svg.appendChild(axesGroup);

    // Zone Labels
    const labelsGroup = createEl("g");
    for (const zone of ZONES) {
      const [lx, ly] = toScreen(zone.labelPos[0], zone.labelPos[1]);
      if (zone.code === "PD") {
        // Callout line for small PD zone
        const [px, py] = toScreen(-0.5, 28.5);
        labelsGroup.appendChild(createEl("line", {
          x1: px.toFixed(1), y1: py.toFixed(1),
          x2: (px - 28).toFixed(1), y2: (py - 8).toFixed(1),
          stroke: "#1e293b",
          "stroke-width": "1.2"
        }));
        labelsGroup.appendChild(createEl("text", {
          x: (px - 32).toFixed(1),
          y: (py - 4).toFixed(1),
          "text-anchor": "end",
          "font-family": "sans-serif",
          "font-size": "13",
          "font-weight": "bold",
          fill: "#1e293b"
        }, "PD"));
      } else {
        labelsGroup.appendChild(createEl("text", {
          x: lx.toFixed(2),
          y: (ly + 5).toFixed(2),
          "text-anchor": "middle",
          "font-family": "sans-serif",
          "font-size": "15",
          "font-weight": "bold",
          fill: "#1e293b"
        }, zone.code));
      }
    }
    svg.appendChild(labelsGroup);

    // Plot Sample if provided
    if (sample && typeof sample === "object") {
      const h2 = sample.h2 ?? sample.H2 ?? 0;
      const ch4 = sample.ch4 ?? sample.CH4 ?? 0;
      const c2h6 = sample.c2h6 ?? sample.C2H6 ?? 0;
      const c2h4 = sample.c2h4 ?? sample.C2H4 ?? 0;
      const c2h2 = sample.c2h2 ?? sample.C2H2 ?? 0;
      const sum = h2 + ch4 + c2h6 + c2h4 + c2h2;

      if (sum > 0) {
        const { x, y } = computeCentroid(h2, ch4, c2h6, c2h4, c2h2);
        const zoneCode = classifyPoint(x, y);
        const [sx, sy] = toScreen(x, y);

        const sampleGroup = createEl("g");

        // Outer pulse/ring
        sampleGroup.appendChild(createEl("circle", {
          cx: sx.toFixed(2), cy: sy.toFixed(2),
          r: "8",
          fill: "none",
          stroke: "#dc2626",
          "stroke-width": "2"
        }));

        // Inner marker
        sampleGroup.appendChild(createEl("circle", {
          cx: sx.toFixed(2), cy: sy.toFixed(2),
          r: "4.5",
          fill: "#dc2626",
          stroke: "#ffffff",
          "stroke-width": "1.5"
        }));

        // Coordinate & classification readout at bottom
        const infoText = `Sample: H\u2082=${h2}, C\u2082H\u2086=${c2h6}, CH\u2084=${ch4}, C\u2082H\u2084=${c2h4}, C\u2082H\u2082=${c2h2} ppm  \u2192  Zone: ${zoneCode} (${x.toFixed(1)}, ${y.toFixed(1)})`;
        sampleGroup.appendChild(createEl("text", {
          x: 300, y: 578,
          "text-anchor": "middle",
          "font-family": "sans-serif",
          "font-size": "13",
          "font-weight": "bold",
          fill: "#0f172a"
        }, infoText));

        svg.appendChild(sampleGroup);
      }
    }
  }

  return {
    classify,
    render
  };
})();
