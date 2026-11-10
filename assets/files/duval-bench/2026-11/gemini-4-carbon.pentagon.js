const DuvalPentagon = (() => {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const DEG = Math.PI / 180;

  // Axis order counter-clockwise starting from top (H2 at 90 degrees)
  const AXES = [
    { key: "h2", angle: 90 * DEG, parts: ["H", "2"] },
    { key: "c2h6", angle: 162 * DEG, parts: ["C", "2", "H", "6"] },
    { key: "ch4", angle: 234 * DEG, parts: ["CH", "4"] },
    { key: "c2h4", angle: 306 * DEG, parts: ["C", "2", "H", "4"] },
    { key: "c2h2", angle: 18 * DEG, parts: ["C", "2", "H", "2"] }
  ];

  const R_MAX = 40;
  const V_H2 = [0, R_MAX];
  const V_C2H6 = [R_MAX * Math.cos(162 * DEG), R_MAX * Math.sin(162 * DEG)];
  const V_CH4 = [R_MAX * Math.cos(234 * DEG), R_MAX * Math.sin(234 * DEG)];
  const V_C2H4 = [R_MAX * Math.cos(306 * DEG), R_MAX * Math.sin(306 * DEG)];
  const V_C2H2 = [R_MAX * Math.cos(18 * DEG), R_MAX * Math.sin(18 * DEG)];

  function pointOnEdgeAtY(a, b, y) {
    const t = (y - a[1]) / (b[1] - a[1]);
    return [a[0] + t * (b[0] - a[0]), y];
  }

  // Outer perimeter split points snapped onto exact regular pentagon edges
  const E_ST1 = pointOnEdgeAtY(V_C2H6, V_CH4, 3.1);      // (-35.03, 3.1)
  const E_T1T2 = [-22.5, V_CH4[1]];                      // (-22.5, -32.36)
  const E_T2T3 = [-6, V_CH4[1]];                         // (-6, -32.36)
  const E_T3D2 = pointOnEdgeAtY(V_C2H4, V_C2H2, -30);    // (24.28, -30)
  const E_D2D1 = pointOnEdgeAtY(V_C2H4, V_C2H2, -6.1);   // (32.04, -6.1)

  // Interior vertices of Duval Pentagon 1
  const PD_TR = [0, 33];
  const PD_TL = [-1, 33];
  const PD_BL = [-1, 24.5];
  const PD_BR = [0, 24.5];
  const J_TOP = [0, 1.5];
  const J_PEAK = [4, 16];
  const J_BOT = [0, -3];
  const J_T2 = [-6, -4];

  const ZONES = [
    {
      code: "PD",
      color: "#ffe082",
      labelPos: [-5.8, 28.75],
      leader: [[-0.5, 28.75], [-3.3, 28.75]],
      poly: [PD_TR, PD_TL, PD_BL, PD_BR]
    },
    {
      code: "S",
      color: "#c8e6c9",
      labelPos: [-18, 16],
      poly: [V_H2, V_C2H6, E_ST1, J_TOP, PD_BR, PD_BL, PD_TL, PD_TR]
    },
    {
      code: "D1",
      color: "#bbdefb",
      labelPos: [18, 18],
      poly: [V_H2, J_TOP, J_PEAK, E_D2D1, V_C2H2]
    },
    {
      code: "D2",
      color: "#90caf9",
      labelPos: [14, -6],
      poly: [J_TOP, J_BOT, E_T3D2, E_D2D1, J_PEAK]
    },
    {
      code: "T3",
      color: "#ef9a9a",
      labelPos: [8.5, -22],
      poly: [J_BOT, E_T2T3, V_C2H4, E_T3D2]
    },
    {
      code: "T2",
      color: "#ffcc80",
      labelPos: [-10.2, -22],
      poly: [J_BOT, J_T2, E_T1T2, E_T2T3]
    },
    {
      code: "T1",
      color: "#fff3b0",
      labelPos: [-17, -14],
      poly: [J_TOP, E_ST1, V_CH4, E_T1T2, J_T2, J_BOT]
    }
  ];

  function computeCentroid(h2, ch4, c2h6, c2h4, c2h2) {
    const vals = [
      Math.max(0, Number(h2) || 0),
      Math.max(0, Number(c2h6) || 0),
      Math.max(0, Number(ch4) || 0),
      Math.max(0, Number(c2h4) || 0),
      Math.max(0, Number(c2h2) || 0)
    ];
    const total = vals[0] + vals[1] + vals[2] + vals[3] + vals[4];
    if (total <= 0) {
      return [0, 0];
    }

    const p = vals.map((v) => (v / total) * 100);
    const pts = p.map((pct, i) => [
      pct * Math.cos(AXES[i].angle),
      pct * Math.sin(AXES[i].angle)
    ]);

    let area2 = 0;
    let cx6 = 0;
    let cy6 = 0;
    for (let i = 0; i < 5; i++) {
      const j = (i + 1) % 5;
      const cross = pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
      area2 += cross;
      cx6 += (pts[i][0] + pts[j][0]) * cross;
      cy6 += (pts[i][1] + pts[j][1]) * cross;
    }

    // Exact continuous limit when only 1 gas or 2 non-adjacent gases are non-zero
    if (Math.abs(area2) <= 1e-12) {
      let lx = 0;
      let ly = 0;
      for (let i = 0; i < 5; i++) {
        lx += p[i] * pts[i][0];
        ly += p[i] * pts[i][1];
      }
      return [lx / 300, ly / 300];
    }

    return [cx6 / (3 * area2), cy6 / (3 * area2)];
  }

  function distToSegmentSq(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
      return (px - ax) * (px - ax) + (py - ay) * (py - ay);
    }
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const projX = ax + t * dx;
    const projY = ay + t * dy;
    return (px - projX) * (px - projX) + (py - projY) * (py - projY);
  }

  function pointInPolygon(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0];
      const yi = poly[i][1];
      const xj = poly[j][0];
      const yj = poly[j][1];

      if (distToSegmentSq(px, py, xj, yj, xi, yi) <= 1e-16) {
        return true;
      }

      const intersect =
        yi > py !== yj > py &&
        px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function classifyPoint(cx, cy) {
    for (let i = 0; i < ZONES.length; i++) {
      if (pointInPolygon(cx, cy, ZONES[i].poly)) {
        return ZONES[i].code;
      }
    }

    let bestCode = ZONES[0].code;
    let bestDist = Infinity;
    for (let i = 0; i < ZONES.length; i++) {
      const poly = ZONES[i].poly;
      for (let j = 0; j < poly.length; j++) {
        const k = (j + 1) % poly.length;
        const d = distToSegmentSq(cx, cy, poly[j][0], poly[j][1], poly[k][0], poly[k][1]);
        if (d < bestDist) {
          bestDist = d;
          bestCode = ZONES[i].code;
        }
      }
    }
    return bestCode;
  }

  function classify(h2, ch4, c2h6, c2h4, c2h2) {
    const [cx, cy] = computeCentroid(h2, ch4, c2h6, c2h4, c2h2);
    return classifyPoint(cx, cy);
  }

  function createSvgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, String(v));
      }
    }
    return el;
  }

  function render(svg, sample) {
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    const CX = 300;
    const CY = 315;
    const SCALE = 5.8;

    const toSvgX = (x) => CX + x * SCALE;
    const toSvgY = (y) => CY - y * SCALE;
    const polyPointsAttr = (pts) =>
      pts.map((p) => `${toSvgX(p[0]).toFixed(2)},${toSvgY(p[1]).toFixed(2)}`).join(" ");

    const root = createSvgEl("g", {
      "font-family": "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    });
    svg.appendChild(root);

    // Draw filled fault zones (draw PD on top of S/D1 border for crisp visibility)
    const drawOrder = ["S", "D1", "D2", "T3", "T2", "T1", "PD"];
    const zoneByCode = Object.fromEntries(ZONES.map((z) => [z.code, z]));

    for (const code of drawOrder) {
      const z = zoneByCode[code];
      root.appendChild(
        createSvgEl("polygon", {
          points: polyPointsAttr(z.poly),
          fill: z.color,
          stroke: "#374151",
          "stroke-width": 1.4,
          "stroke-linejoin": "round"
        })
      );
    }

    // Outer pentagon border
    root.appendChild(
      createSvgEl("polygon", {
        points: polyPointsAttr([V_H2, V_C2H6, V_CH4, V_C2H4, V_C2H2]),
        fill: "none",
        stroke: "#111827",
        "stroke-width": 2,
        "stroke-linejoin": "round"
      })
    );

    // Five gas axes, tick marks, and chemical gas labels
    const axisGroup = createSvgEl("g");
    root.appendChild(axisGroup);

    for (let i = 0; i < AXES.length; i++) {
      const ax = AXES[i];
      const cos = Math.cos(ax.angle);
      const sin = Math.sin(ax.angle);
      const nx = -sin;
      const ny = cos;

      const xEnd = R_MAX * cos;
      const yEnd = R_MAX * sin;

      axisGroup.appendChild(
        createSvgEl("line", {
          x1: toSvgX(0).toFixed(2),
          y1: toSvgY(0).toFixed(2),
          x2: toSvgX(xEnd).toFixed(2),
          y2: toSvgY(yEnd).toFixed(2),
          stroke: "#4b5563",
          "stroke-width": 1,
          "stroke-dasharray": "4,3"
        })
      );

      for (const tick of [10, 20, 30, 40]) {
        const tx = tick * cos;
        const ty = tick * sin;
        const tickHalf = 0.65;
        axisGroup.appendChild(
          createSvgEl("line", {
            x1: toSvgX(tx - nx * tickHalf).toFixed(2),
            y1: toSvgY(ty - ny * tickHalf).toFixed(2),
            x2: toSvgX(tx + nx * tickHalf).toFixed(2),
            y2: toSvgY(ty + ny * tickHalf).toFixed(2),
            stroke: "#374151",
            "stroke-width": 1.1
          })
        );

        if (i === 0 && tick < 40) {
          const pctLabel = createSvgEl("text", {
            x: toSvgX(tx + 1.4).toFixed(2),
            y: (toSvgY(ty) + 3.5).toFixed(2),
            fill: "#4b5563",
            "font-size": 10,
            "text-anchor": "start"
          });
          pctLabel.textContent = String(tick);
          axisGroup.appendChild(pctLabel);
        }
      }

      const labelR = 45.2;
      const lx = toSvgX(labelR * cos);
      const ly = toSvgY(labelR * sin);

      let anchor = "middle";
      if (cos > 0.25) anchor = "start";
      else if (cos < -0.25) anchor = "end";

      const gasText = createSvgEl("text", {
        x: lx.toFixed(2),
        y: (ly + (sin < -0.5 ? 10 : sin > 0.8 ? -2 : 4)).toFixed(2),
        fill: "#111827",
        "font-size": 15,
        "font-weight": "700",
        "text-anchor": anchor
      });

      let subOffsetOpen = false;
      for (const part of ax.parts) {
        const isSub = /^\d+$/.test(part);
        const tspan = createSvgEl("tspan", {
          "font-size": isSub ? 11 : 15,
          dy: isSub ? 3.5 : subOffsetOpen ? -3.5 : 0
        });
        tspan.textContent = part;
        gasText.appendChild(tspan);
        subOffsetOpen = isSub;
      }
      axisGroup.appendChild(gasText);
    }

    // Zone labels
    const labelGroup = createSvgEl("g");
    root.appendChild(labelGroup);

    for (const z of ZONES) {
      if (z.leader) {
        labelGroup.appendChild(
          createSvgEl("line", {
            x1: toSvgX(z.leader[0][0]).toFixed(2),
            y1: toSvgY(z.leader[0][1]).toFixed(2),
            x2: toSvgX(z.leader[1][0]).toFixed(2),
            y2: toSvgY(z.leader[1][1]).toFixed(2),
            stroke: "#1f2937",
            "stroke-width": 1.1
          })
        );
      }

      const txt = createSvgEl("text", {
        x: toSvgX(z.labelPos[0]).toFixed(2),
        y: (toSvgY(z.labelPos[1]) + 5).toFixed(2),
        fill: "#111827",
        "font-size": 14,
        "font-weight": "700",
        "text-anchor": "middle"
      });
      txt.textContent = z.code;
      labelGroup.appendChild(txt);
    }

    // Sample point marker if sample is provided
    if (sample !== null && sample !== undefined) {
      const [cx, cy] = computeCentroid(
        sample.h2,
        sample.ch4,
        sample.c2h6,
        sample.c2h4,
        sample.c2h2
      );
      const zone = classifyPoint(cx, cy);
      const sx = toSvgX(cx);
      const sy = toSvgY(cy);

      const markerGroup = createSvgEl("g");
      markerGroup.appendChild(
        createSvgEl("circle", {
          cx: sx.toFixed(2),
          cy: sy.toFixed(2),
          r: 8,
          fill: "none",
          stroke: "#111827",
          "stroke-width": 1.8
        })
      );
      markerGroup.appendChild(
        createSvgEl("circle", {
          cx: sx.toFixed(2),
          cy: sy.toFixed(2),
          r: 5,
          fill: "#dc2626",
          stroke: "#ffffff",
          "stroke-width": 1.8
        })
      );

      const readout = createSvgEl("text", {
        x: CX,
        y: 576,
        fill: "#111827",
        "font-size": 13,
        "font-weight": "600",
        "text-anchor": "middle"
      });
      readout.textContent = `Fault Zone: ${zone} (${cx.toFixed(1)}, ${cy.toFixed(1)})`;
      markerGroup.appendChild(readout);

      root.appendChild(markerGroup);
    }
  }

  return { classify, render };
})();
