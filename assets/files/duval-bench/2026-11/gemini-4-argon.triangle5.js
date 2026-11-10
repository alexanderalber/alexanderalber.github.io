const DuvalTriangle5 = (() => {
  const NS = "http://www.w3.org/2000/svg";

  // Triangle geometry in SVG coordinates (viewBox 0 0 600 540)
  // Top vertex: 100% CH4
  // Right vertex: 100% C2H4
  // Left vertex: 100% C2H6
  const SIDE = 400;
  const H = SIDE * Math.sqrt(3) / 2;
  const V_TOP = { x: 300, y: 65 };
  const V_LEFT = { x: 300 - SIDE / 2, y: 65 + H };
  const V_RIGHT = { x: 300 + SIDE / 2, y: 65 + H };

  // Convert ternary percentages (ch4, c2h4, c2h6 summing to 100) to SVG {x, y}
  // Left axis (bottom-left to top): %CH4 increases from 0 at bottom to 100 at top
  // Right axis (top to bottom-right): %C2H4 increases from 0 at left to 100 at right
  // Bottom axis (bottom-right to bottom-left): %C2H6 increases from 0 at right to 100 at left
  function toXY(pCH4, pC2H4, pC2H6) {
    const fCH4 = pCH4 / 100;
    const fC2H4 = pC2H4 / 100;
    const fC2H6 = pC2H6 / 100;
    return {
      x: V_LEFT.x * fC2H6 + V_TOP.x * fCH4 + V_RIGHT.x * fC2H4,
      y: V_LEFT.y * fC2H6 + V_TOP.y * fCH4 + V_RIGHT.y * fC2H4
    };
  }

  // Zone definitions in ternary coordinates [pCH4, pC2H4, pC2H6]
  // Duval Triangle 5 (CH4, C2H4, C2H6) - IEC 60599 / IEEE C57.104
  const ZONES = [
    {
      code: "PD",
      fill: "#d8b4f8",
      labelPos: [92, 0.5, 7.5],
      labelOffset: { dx: -28, dy: 0 },
      points: [
        [100, 0, 0],
        [99, 1, 0],
        [85, 1, 14],
        [86, 0, 14]
      ]
    },
    {
      code: "S",
      fill: "#93c5fd",
      labelPos: [65, 5, 30],
      points: [
        [86, 0, 14],
        [85, 1, 14],
        [76, 10, 14],
        [36, 10, 54],
        [46, 0, 54]
      ]
    },
    {
      code: "O",
      fill: "#bbf7d0",
      labelPos: [18, 5, 77],
      points: [
        [46, 0, 54],
        [36, 10, 54],
        [0, 10, 90],
        [0, 0, 100]
      ]
    },
    {
      code: "T2",
      fill: "#fef08a",
      labelPos: [84, 13, 3],
      points: [
        [99, 1, 0],
        [90, 10, 0],
        [70, 30, 0],
        [56, 30, 14],
        [76, 10, 14],
        [85, 1, 14]
      ]
    },
    {
      code: "C",
      fill: "#fed7aa",
      labelPos: [30, 38, 32],
      points: [
        [56, 30, 14],
        [46, 40, 14],
        [36, 50, 14],
        [0, 50, 50],
        [0, 70, 30],
        [0, 10, 90],
        [76, 10, 14]
      ]
    },
    {
      code: "T3-1",
      codeReturn: "T3",
      fill: "#fca5a5",
      labelPos: null,
      points: [
        [70, 30, 0],
        [50, 50, 0],
        [36, 50, 14],
        [56, 30, 14]
      ]
    },
    {
      code: "T3-2",
      codeReturn: "T3",
      fill: "#fca5a5",
      labelPos: [25, 68, 7],
      labelText: "T3",
      points: [
        [50, 50, 0],
        [0, 100, 0],
        [0, 70, 30],
        [0, 50, 50],
        [36, 50, 14]
      ]
    }
  ];

  // Clean polygon list for rendering and exact boundary classification
  const RENDER_ZONES = [
    {
      code: "PD",
      fill: "#e0c3fc",
      labelPos: [92.5, 0.5, 7],
      externalLabel: { x: 245, y: 68 },
      points: [
        [100, 0, 0],
        [99, 1, 0],
        [85, 1, 14],
        [86, 0, 14]
      ]
    },
    {
      code: "S",
      fill: "#a3d5ff",
      labelPos: [63, 5, 32],
      points: [
        [86, 0, 14],
        [85, 1, 14],
        [76, 10, 14],
        [36, 10, 54],
        [46, 0, 54]
      ]
    },
    {
      code: "O",
      fill: "#b9fbc0",
      labelPos: [18, 4.5, 77.5],
      points: [
        [46, 0, 54],
        [36, 10, 54],
        [0, 10, 90],
        [0, 0, 100]
      ]
    },
    {
      code: "T2",
      fill: "#fbf8cc",
      labelPos: [76, 17, 7],
      points: [
        [99, 1, 0],
        [70, 30, 0],
        [56, 30, 14],
        [76, 10, 14],
        [85, 1, 14]
      ]
    },
    {
      code: "C",
      fill: "#ffd8be",
      labelPos: [26, 32, 42],
      points: [
        [76, 10, 14],
        [36, 50, 14],
        [0, 50, 50],
        [0, 10, 90]
      ]
    },
    {
      code: "T3",
      fill: "#ffadad",
      labelPos: [22, 66, 12],
      points: [
        [70, 30, 0],
        [0, 100, 0],
        [0, 50, 50],
        [36, 50, 14],
        [56, 30, 14]
      ]
    }
  ];

  function classify(ch4, c2h4, c2h6) {
    const sum = ch4 + c2h4 + c2h6;
    if (sum <= 0) return "ND";
    const pCH4 = (ch4 / sum) * 100;
    const pC2H4 = (c2h4 / sum) * 100;
    const pC2H6 = (c2h6 / sum) * 100;

    if (pC2H4 < 1) {
      if (pC2H6 <= 14) return "PD";
      if (pC2H6 <= 54) return "S";
      return "O";
    }
    if (pC2H4 <= 10) {
      if (pC2H6 <= 14) return "T2";
      if (pC2H6 <= 54) return "S";
      return "O";
    }
    if (pC2H4 <= 30) {
      if (pC2H6 <= 14) return "T2";
      return "C";
    }
    if (pC2H4 <= 50) {
      if (pC2H6 <= 14) return "T3";
      return "C";
    }
    return "T3";
  }

  function createEl(tag, attrs = {}, text = null) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, String(v));
    }
    if (text !== null) {
      el.textContent = text;
    }
    return el;
  }

  function render(svg, sample) {
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    svg.setAttribute("viewBox", "0 0 600 540");
    svg.setAttribute("font-family", "sans-serif");

    // White background
    svg.appendChild(createEl("rect", {
      x: 0, y: 0, width: 600, height: 540, fill: "#ffffff"
    }));

    // Title
    svg.appendChild(createEl("text", {
      x: 300, y: 32,
      "text-anchor": "middle",
      "font-size": "18",
      "font-weight": "bold",
      fill: "#1e293b"
    }, "Duval Triangle 5"));

    // Draw zones
    const zonesGroup = createEl("g");
    for (const z of RENDER_ZONES) {
      const pts = z.points.map(p => {
        const xy = toXY(p[0], p[1], p[2]);
        return `${xy.x.toFixed(2)},${xy.y.toFixed(2)}`;
      }).join(" ");

      zonesGroup.appendChild(createEl("polygon", {
        points: pts,
        fill: z.fill,
        stroke: "#334155",
        "stroke-width": "1.2",
        "stroke-linejoin": "round"
      }));
    }
    svg.appendChild(zonesGroup);

    // Outer triangle border
    svg.appendChild(createEl("polygon", {
      points: `${V_TOP.x},${V_TOP.y} ${V_RIGHT.x},${V_RIGHT.y} ${V_LEFT.x},${V_LEFT.y}`,
      fill: "none",
      stroke: "#0f172a",
      "stroke-width": "2",
      "stroke-linejoin": "round"
    }));

    // Zone labels
    const labelsGroup = createEl("g");
    for (const z of RENDER_ZONES) {
      const pos = toXY(z.labelPos[0], z.labelPos[1], z.labelPos[2]);
      if (z.externalLabel) {
        // Leader line for tiny PD zone
        labelsGroup.appendChild(createEl("line", {
          x1: pos.x, y1: pos.y,
          x2: z.externalLabel.x + 14, y2: z.externalLabel.y - 4,
          stroke: "#334155",
          "stroke-width": "1"
        }));
        labelsGroup.appendChild(createEl("text", {
          x: z.externalLabel.x,
          y: z.externalLabel.y,
          "text-anchor": "middle",
          "dominant-baseline": "middle",
          "font-size": "13",
          "font-weight": "bold",
          fill: "#0f172a"
        }, z.code));
      } else {
        labelsGroup.appendChild(createEl("text", {
          x: pos.x,
          y: pos.y,
          "text-anchor": "middle",
          "dominant-baseline": "middle",
          "font-size": "14",
          "font-weight": "bold",
          fill: "#0f172a"
        }, z.code));
      }
    }
    svg.appendChild(labelsGroup);

    // Axes ticks and grid lines
    const axesGroup = createEl("g");
    const tickLen = 7;

    for (let v = 10; v <= 90; v += 10) {
      // 1. Left axis: % CH4 (0 at V_LEFT to 100 at V_TOP), constant CH4 lines go horizontally to right axis
      const pLeft = toXY(v, 0, 100 - v);
      // Tick direction: horizontal left / perpendicular to left edge
      axesGroup.appendChild(createEl("line", {
        x1: pLeft.x, y1: pLeft.y,
        x2: pLeft.x - tickLen, y2: pLeft.y,
        stroke: "#0f172a", "stroke-width": "1.2"
      }));
      axesGroup.appendChild(createEl("text", {
        x: pLeft.x - tickLen - 5, y: pLeft.y + 4,
        "text-anchor": "end",
        "font-size": "11",
        fill: "#334155"
      }, String(v)));

      // 2. Right axis: % C2H4 (0 at V_TOP to 100 at V_RIGHT)
      // Constant C2H4 lines go parallel to left edge (down-left)
      const pRight = toXY(100 - v, v, 0);
      const dxR = tickLen * Math.cos(-Math.PI / 6);
      const dyR = tickLen * Math.sin(-Math.PI / 6);
      axesGroup.appendChild(createEl("line", {
        x1: pRight.x, y1: pRight.y,
        x2: pRight.x + dxR, y2: pRight.y + dyR,
        stroke: "#0f172a", "stroke-width": "1.2"
      }));
      axesGroup.appendChild(createEl("text", {
        x: pRight.x + dxR + 4, y: pRight.y + dyR + 3,
        "text-anchor": "start",
        "font-size": "11",
        fill: "#334155"
      }, String(v)));

      // 3. Bottom axis: % C2H6 (0 at V_RIGHT to 100 at V_LEFT)
      // Constant C2H6 lines go parallel to right edge (up-left)
      const pBottom = toXY(0, 100 - v, v);
      const dxB = tickLen * Math.cos(2 * Math.PI / 3);
      const dyB = tickLen * Math.sin(2 * Math.PI / 3);
      axesGroup.appendChild(createEl("line", {
        x1: pBottom.x, y1: pBottom.y,
        x2: pBottom.x + dxB, y2: pBottom.y + dyB,
        stroke: "#0f172a", "stroke-width": "1.2"
      }));
      axesGroup.appendChild(createEl("text", {
        x: pBottom.x + dxB - 2, y: pBottom.y + dyB + 12,
        "text-anchor": "middle",
        "font-size": "11",
        fill: "#334155"
      }, String(v)));
    }

    // Vertex 0 / 100 labels
    axesGroup.appendChild(createEl("text", {
      x: V_LEFT.x - 12, y: V_LEFT.y + 4,
      "text-anchor": "end", "font-size": "11", fill: "#334155"
    }, "0"));
    axesGroup.appendChild(createEl("text", {
      x: V_TOP.x - 12, y: V_TOP.y + 4,
      "text-anchor": "end", "font-size": "11", fill: "#334155"
    }, "100"));

    axesGroup.appendChild(createEl("text", {
      x: V_TOP.x + 10, y: V_TOP.y - 2,
      "text-anchor": "start", "font-size": "11", fill: "#334155"
    }, "0"));
    axesGroup.appendChild(createEl("text", {
      x: V_RIGHT.x + 10, y: V_RIGHT.y + 2,
      "text-anchor": "start", "font-size": "11", fill: "#334155"
    }, "100"));

    axesGroup.appendChild(createEl("text", {
      x: V_RIGHT.x - 4, y: V_RIGHT.y + 20,
      "text-anchor": "middle", "font-size": "11", fill: "#334155"
    }, "0"));
    axesGroup.appendChild(createEl("text", {
      x: V_LEFT.x - 4, y: V_LEFT.y + 20,
      "text-anchor": "middle", "font-size": "11", fill: "#334155"
    }, "100"));

    // Axis Gas Titles with arrows
    // Left axis: % CH4
    const leftMid = toXY(50, 0, 50);
    axesGroup.appendChild(createEl("text", {
      x: leftMid.x - 48,
      y: leftMid.y,
      transform: `rotate(-60, ${leftMid.x - 48}, ${leftMid.y})`,
      "text-anchor": "middle",
      "font-size": "15",
      "font-weight": "bold",
      fill: "#0f172a"
    }, "% CH\u2084 \u2192"));

    // Right axis: % C2H4
    const rightMid = toXY(50, 50, 0);
    axesGroup.appendChild(createEl("text", {
      x: rightMid.x + 48,
      y: rightMid.y,
      transform: `rotate(60, ${rightMid.x + 48}, ${rightMid.y})`,
      "text-anchor": "middle",
      "font-size": "15",
      "font-weight": "bold",
      fill: "#0f172a"
    }, "% C\u2082H\u2084 \u2192"));

    // Bottom axis: % C2H6
    const bottomMid = toXY(0, 50, 50);
    axesGroup.appendChild(createEl("text", {
      x: bottomMid.x,
      y: bottomMid.y + 46,
      "text-anchor": "middle",
      "font-size": "15",
      "font-weight": "bold",
      fill: "#0f172a"
    }, "\u2190 % C\u2082H\u2086"));

    svg.appendChild(axesGroup);

    // Sample point plotting
    if (sample && typeof sample === "object") {
      const ch4 = Number(sample.ch4) || 0;
      const c2h4 = Number(sample.c2h4) || 0;
      const c2h6 = Number(sample.c2h6) || 0;
      const sum = ch4 + c2h4 + c2h6;

      if (sum > 0) {
        const pCH4 = (ch4 / sum) * 100;
        const pC2H4 = (c2h4 / sum) * 100;
        const pC2H6 = (c2h6 / sum) * 100;
        const pt = toXY(pCH4, pC2H4, pC2H6);
        const zone = classify(ch4, c2h4, c2h6);

        const sampleGroup = createEl("g");

        // Dashed projection lines to the 3 axes
        const projLeft = toXY(pCH4, 0, 100 - pCH4);
        const projRight = toXY(100 - pC2H4, pC2H4, 0);
        const projBottom = toXY(0, 100 - pC2H6, pC2H6);

        for (const proj of [projLeft, projRight, projBottom]) {
          sampleGroup.appendChild(createEl("line", {
            x1: pt.x, y1: pt.y,
            x2: proj.x, y2: proj.y,
            stroke: "#dc2626",
            "stroke-width": "1",
            "stroke-dasharray": "3,3",
            opacity: "0.75"
          }));
        }

        // Outer halo + marker circle
        sampleGroup.appendChild(createEl("circle", {
          cx: pt.x, cy: pt.y, r: 6.5,
          fill: "#ffffff",
          stroke: "#dc2626",
          "stroke-width": "2"
        }));
        sampleGroup.appendChild(createEl("circle", {
          cx: pt.x, cy: pt.y, r: 3.5,
          fill: "#dc2626"
        }));

        // Info summary at bottom
        const infoText = `Sample: CH\u2084=${ pCH4.toFixed(1) }%, C\u2082H\u2084=${ pC2H4.toFixed(1) }%, C\u2082H\u2086=${ pC2H6.toFixed(1) }%  \u2192  Zone: ${ zone }`;
        sampleGroup.appendChild(createEl("text", {
          x: 300,
          y: 515,
          "text-anchor": "middle",
          "font-size": "13",
          "font-weight": "bold",
          fill: "#dc2626"
        }, infoText));

        svg.appendChild(sampleGroup);
      }
    }
  }

  return { classify, render };
})();
