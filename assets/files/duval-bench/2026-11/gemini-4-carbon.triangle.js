const DuvalTriangle = (function () {
  const NS = "http://www.w3.org/2000/svg";

  // Standard Duval Triangle 1 zone definitions in (%CH4, %C2H4, %C2H2)
  // Top vertex: 100% CH4
  // Right vertex: 100% C2H4
  // Left vertex: 100% C2H2
  const ZONES = [
    {
      code: "PD",
      color: "#d4edfc",
      points: [
        [100, 0, 0],
        [98, 2, 0],
        [98, 0, 2]
      ],
      labelOffset: [-34, -10],
      leader: true
    },
    {
      code: "T1",
      color: "#fceec7",
      points: [
        [98, 2, 0],
        [80, 20, 0],
        [76, 20, 4],
        [96, 0, 4],
        [98, 0, 2]
      ]
    },
    {
      code: "T2",
      color: "#fbd199",
      points: [
        [80, 20, 0],
        [50, 50, 0],
        [46, 50, 4],
        [76, 20, 4]
      ]
    },
    {
      code: "T3",
      color: "#f79f79",
      points: [
        [50, 50, 0],
        [0, 100, 0],
        [0, 85, 15],
        [35, 50, 15],
        [46, 50, 4]
      ]
    },
    {
      code: "DT",
      color: "#d9c2e9",
      points: [
        [96, 0, 4],
        [46, 50, 4],
        [35, 50, 15],
        [0, 85, 15],
        [0, 71, 29],
        [31, 40, 29],
        [47, 40, 13],
        [87, 0, 13]
      ]
    },
    {
      code: "D2",
      color: "#f4a7b9",
      points: [
        [87, 0, 13],
        [47, 40, 13],
        [31, 40, 29],
        [0, 71, 29],
        [0, 23, 77],
        [64, 23, 13],
        [87, 0, 13]
      ].slice(0, 6) // Exact vertices: (87,0,13), (47,40,13), (31,40,29), (0,71,29), (0,23,77), (64,23,13) -> wait: (64,23,13) sum is 100, C2H2=13! Let's fix D1/D2 boundary!
    }
  ];

  // Re-verify D1 and D2 exact vertices:
  // D1 is %C2H2 >= 13 and %C2H4 <= 23.
  // Vertices of D1:
  // 1. %C2H4 = 0, %C2H2 = 13 => CH4 = 87 -> [87, 0, 13]
  // 2. %C2H4 = 23, %C2H2 = 13 => CH4 = 64 -> [64, 23, 13]
  // 3. %CH4 = 0, %C2H4 = 23 => C2H2 = 77 -> [0, 23, 77]
  // 4. %CH4 = 0, %C2H4 = 0 => C2H2 = 100 -> [0, 0, 100]
  //
  // Therefore, D2 is bounded by:
  // - D1 boundary: [64, 23, 13] to [0, 23, 77]
  // - DT boundary: [64, 23, 13] -> [47, 40, 13] -> [31, 40, 29] -> [0, 71, 29]
  // - Bottom axis (%CH4 = 0): [0, 71, 29] to [0, 23, 77]
  ZONES[5] = {
    code: "D2",
    color: "#f4a7b9",
    points: [
      [64, 23, 13],
      [47, 40, 13],
      [31, 40, 29],
      [0, 71, 29],
      [0, 23, 77]
    ]
  };

  ZONES.push({
    code: "D1",
    color: "#a8e6cf",
    points: [
      [87, 0, 13],
      [64, 23, 13],
      [0, 23, 77],
      [0, 0, 100]
    ]
  });

  // Geometry constants for SVG (viewBox 0 0 600 540)
  const SIDE = 420;
  const HEIGHT = SIDE * Math.sqrt(3) / 2; // ~363.73
  const LEFT_X = (600 - SIDE) / 2;        // 90
  const RIGHT_X = LEFT_X + SIDE;          // 510
  const TOP_X = 300;
  const BOTTOM_Y = 460;
  const TOP_Y = BOTTOM_Y - HEIGHT;        // ~96.27

  function toXY(pCh4, pC2h4, pC2h2) {
    const fCh4 = pCh4 / 100;
    const fC2h4 = pC2h4 / 100;
    const fC2h2 = pC2h2 / 100;
    const x = fC2h2 * LEFT_X + fCh4 * TOP_X + fC2h4 * RIGHT_X;
    const y = fC2h2 * BOTTOM_Y + fCh4 * TOP_Y + fC2h4 * BOTTOM_Y;
    return [x, y];
  }

  function el(tag, attrs, textContent) {
    const node = document.createElementNS(NS, tag);
    if (attrs) {
      for (const k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) {
          node.setAttribute(k, String(attrs[k]));
        }
      }
    }
    if (textContent !== undefined) {
      node.textContent = textContent;
    }
    return node;
  }

  function classify(ch4, c2h4, c2h2) {
    const sum = ch4 + c2h4 + c2h2;
    if (!(sum > 0)) {
      return "";
    }
    const pCh4 = (ch4 / sum) * 100;
    const pC2h4 = (c2h4 / sum) * 100;
    const pC2h2 = (c2h2 / sum) * 100;

    if (pCh4 >= 98) {
      return "PD";
    }
    if (pC2h2 < 4) {
      if (pC2h4 < 20) return "T1";
      if (pC2h4 < 50) return "T2";
      return "T3";
    }
    if (pC2h2 < 13) {
      if (pC2h4 >= 50) return "T3";
      return "DT";
    }
    if (pC2h2 < 15 && pC2h4 >= 50) {
      return "T3";
    }
    if (pC2h2 < 29 && pC2h4 >= 40) {
      return "DT";
    }
    if (pC2h4 < 23) {
      return "D1";
    }
    return "D2";
  }

  function polygonCentroid(pts) {
    let area = 0;
    let cx = 0;
    let cy = 0;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % n];
      const cross = x0 * y1 - x1 * y0;
      area += cross;
      cx += (x0 + x1) * cross;
      cy += (y0 + y1) * cross;
    }
    area *= 0.5;
    if (Math.abs(area) < 1e-6) {
      let sx = 0, sy = 0;
      for (let i = 0; i < n; i++) { sx += pts[i][0]; sy += pts[i][1]; }
      return [sx / n, sy / n];
    }
    return [cx / (6 * area), cy / (6 * area)];
  }

  function render(svg, sample) {
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    svg.setAttribute("viewBox", "0 0 600 540");

    // White background rect
    svg.appendChild(el("rect", {
      x: 0,
      y: 0,
      width: 600,
      height: 540,
      fill: "#ffffff"
    }));

    // Title
    svg.appendChild(el("text", {
      x: 300,
      y: 36,
      "text-anchor": "middle",
      "font-family": "sans-serif",
      "font-size": 18,
      "font-weight": "bold",
      fill: "#222222"
    }, "Duval Triangle 1"));

    const zonesGroup = el("g", { "stroke-linejoin": "round" });
    const labelsGroup = el("g", {
      "font-family": "sans-serif",
      "font-size": 13,
      "font-weight": "bold",
      fill: "#1a1a1a"
    });

    // Draw zones and zone labels
    for (let i = 0; i < ZONES.length; i++) {
      const z = ZONES[i];
      const xyPts = z.points.map(p => toXY(p[0], p[1], p[2]));
      const ptsAttr = xyPts.map(pt => pt[0].toFixed(2) + "," + pt[1].toFixed(2)).join(" ");

      zonesGroup.appendChild(el("polygon", {
        points: ptsAttr,
        fill: z.color,
        stroke: "#333333",
        "stroke-width": 1.2
      }));

      const [cx, cy] = polygonCentroid(xyPts);
      if (z.leader) {
        const lx = cx + z.labelOffset[0];
        const ly = cy + z.labelOffset[1];
        labelsGroup.appendChild(el("line", {
          x1: cx.toFixed(2),
          y1: cy.toFixed(2),
          x2: (lx + 10).toFixed(2),
          y2: (ly + 2).toFixed(2),
          stroke: "#333333",
          "stroke-width": 1
        }));
        labelsGroup.appendChild(el("text", {
          x: lx.toFixed(2),
          y: (ly + 4).toFixed(2),
          "text-anchor": "end",
          "font-size": 12
        }, z.code));
      } else {
        labelsGroup.appendChild(el("text", {
          x: cx.toFixed(2),
          y: (cy + 4).toFixed(2),
          "text-anchor": "middle"
        }, z.code));
      }
    }

    svg.appendChild(zonesGroup);

    // Outer triangle border
    const outerPts = [
      toXY(100, 0, 0),
      toXY(0, 100, 0),
      toXY(0, 0, 100)
    ].map(pt => pt[0].toFixed(2) + "," + pt[1].toFixed(2)).join(" ");

    svg.appendChild(el("polygon", {
      points: outerPts,
      fill: "none",
      stroke: "#111111",
      "stroke-width": 2,
      "stroke-linejoin": "round"
    }));

    // Axes ticks & grid tick directions
    // Standard ternary orientation:
    // Left edge (C2H4 = 0): %CH4 goes from 0 (bottom-left) to 100 (top). Constant CH4 lines are horizontal (towards right).
    // Right edge (C2H2 = 0): %C2H4 goes from 0 (top) to 100 (bottom-right). Constant C2H4 lines go down-left (parallel to left edge).
    // Bottom edge (CH4 = 0): %C2H2 goes from 0 (bottom-right) to 100 (bottom-left). Constant C2H2 lines go up-left (parallel to right edge).
    const axesGroup = el("g", {
      "font-family": "sans-serif",
      "font-size": 11,
      fill: "#222222"
    });

    const tickLen = 7;

    for (let v = 0; v <= 100; v += 10) {
      // 1. %CH4 axis along Left Edge: from (0,0,100) to (100,0,0)
      // Outward tick direction aligned with constant CH4 lines (horizontal, pointing left: [-1, 0])
      {
        const [x, y] = toXY(v, 0, 100 - v);
        const tx = x - tickLen;
        const ty = y;
        axesGroup.appendChild(el("line", {
          x1: x.toFixed(2),
          y1: y.toFixed(2),
          x2: tx.toFixed(2),
          y2: ty.toFixed(2),
          stroke: "#111111",
          "stroke-width": 1.2
        }));
        axesGroup.appendChild(el("text", {
          x: (tx - 4).toFixed(2),
          y: (ty + 3.5).toFixed(2),
          "text-anchor": "end"
        }, String(v)));
      }

      // 2. %C2H4 axis along Right Edge: from (100,0,0) to (0,100,0)
      // Constant C2H4 lines run parallel to Left Edge (direction [1/2, -sqrt(3)/2] outward up-right)
      {
        const [x, y] = toXY(100 - v, v, 0);
        const dx = 0.5 * tickLen;
        const dy = -(Math.sqrt(3) / 2) * tickLen;
        const tx = x + dx;
        const ty = y + dy;
        axesGroup.appendChild(el("line", {
          x1: x.toFixed(2),
          y1: y.toFixed(2),
          x2: tx.toFixed(2),
          y2: ty.toFixed(2),
          stroke: "#111111",
          "stroke-width": 1.2
        }));
        axesGroup.appendChild(el("text", {
          x: (tx + 4).toFixed(2),
          y: (ty + 1).toFixed(2),
          "text-anchor": "start"
        }, String(v)));
      }

      // 3. %C2H2 axis along Bottom Edge: from (0,100,0) to (0,0,100)
      // Constant C2H2 lines run parallel to Right Edge (outward direction down-right: [1/2, sqrt(3)/2])
      {
        const [x, y] = toXY(0, 100 - v, v);
        const dx = 0.5 * tickLen;
        const dy = (Math.sqrt(3) / 2) * tickLen;
        const tx = x + dx;
        const ty = y + dy;
        axesGroup.appendChild(el("line", {
          x1: x.toFixed(2),
          y1: y.toFixed(2),
          x2: tx.toFixed(2),
          y2: ty.toFixed(2),
          stroke: "#111111",
          "stroke-width": 1.2
        }));
        axesGroup.appendChild(el("text", {
          x: (tx + 2).toFixed(2),
          y: (ty + 11).toFixed(2),
          "text-anchor": "middle"
        }, String(v)));
      }
    }

    // Axis Gas Names & Arrows
    // Left axis label: % CH4
    {
      const [mx, my] = toXY(50, 0, 50);
      const lx = mx - 46;
      const ly = my;
      axesGroup.appendChild(el("text", {
        x: lx.toFixed(2),
        y: ly.toFixed(2),
        "text-anchor": "middle",
        "font-size": 14,
        "font-weight": "bold",
        transform: "rotate(-60 " + lx.toFixed(2) + " " + ly.toFixed(2) + ")"
      }, "% CH\u2084 \u2192"));
    }

    // Right axis label: % C2H4
    {
      const [mx, my] = toXY(50, 50, 0);
      const lx = mx + 46;
      const ly = my;
      axesGroup.appendChild(el("text", {
        x: lx.toFixed(2),
        y: ly.toFixed(2),
        "text-anchor": "middle",
        "font-size": 14,
        "font-weight": "bold",
        transform: "rotate(60 " + lx.toFixed(2) + " " + ly.toFixed(2) + ")"
      }, "% C\u2082H\u2084 \u2192"));
    }

    // Bottom axis label: % C2H2
    {
      const [mx, my] = toXY(0, 50, 50);
      axesGroup.appendChild(el("text", {
        x: mx.toFixed(2),
        y: (my + 44).toFixed(2),
        "text-anchor": "middle",
        "font-size": 14,
        "font-weight": "bold"
      }, "\u2190 % C\u2082H\u2082"));
    }

    svg.appendChild(axesGroup);
    svg.appendChild(labelsGroup);

    // Plot sample if provided
    if (sample !== null && sample !== undefined) {
      const { ch4, c2h4, c2h2 } = sample;
      const sum = ch4 + c2h4 + c2h2;
      if (sum > 0) {
        const pCh4 = (ch4 / sum) * 100;
        const pC2h4 = (c2h4 / sum) * 100;
        const pC2h2 = (c2h2 / sum) * 100;
        const [sx, sy] = toXY(pCh4, pC2h4, pC2h2);
        const zoneCode = classify(ch4, c2h4, c2h2);

        const sampleGroup = el("g", {});

        // Crosshair lines
        sampleGroup.appendChild(el("line", {
          x1: (sx - 9).toFixed(2),
          y1: sy.toFixed(2),
          x2: (sx + 9).toFixed(2),
          y2: sy.toFixed(2),
          stroke: "#d90429",
          "stroke-width": 1.5
        }));
        sampleGroup.appendChild(el("line", {
          x1: sx.toFixed(2),
          y1: (sy - 9).toFixed(2),
          x2: sx.toFixed(2),
          y2: (sy + 9).toFixed(2),
          stroke: "#d90429",
          "stroke-width": 1.5
        }));

        // Point marker
        sampleGroup.appendChild(el("circle", {
          cx: sx.toFixed(2),
          cy: sy.toFixed(2),
          r: 5,
          fill: "#d90429",
          stroke: "#ffffff",
          "stroke-width": 1.5
        }));

        // Info readout at bottom
        const infoText = "Sample: CH\u2084=" + pCh4.toFixed(1) + "%, C\u2082H\u2084=" + pC2h4.toFixed(1) + "%, C\u2082H\u2082=" + pC2h2.toFixed(1) + "%  \u2192  Zone: " + zoneCode;
        sampleGroup.appendChild(el("text", {
          x: 300,
          y: 526,
          "text-anchor": "middle",
          "font-family": "sans-serif",
          "font-size": 12,
          "font-weight": "bold",
          fill: "#d90429"
        }, infoText));

        svg.appendChild(sampleGroup);
      }
    }
  }

  return {
    classify: classify,
    render: render
  };
})();
