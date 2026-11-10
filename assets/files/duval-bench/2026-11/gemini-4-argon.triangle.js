const DuvalTriangle = (function () {
  const NS = "http://www.w3.org/2000/svg";

  // Geometry configuration for viewBox="0 0 600 540"
  const SIDE = 400;
  const HEIGHT = SIDE * Math.sqrt(3) / 2; // ~346.41
  const X_LEFT = 100;
  const Y_BASE = 435;
  const X_RIGHT = X_LEFT + SIDE; // 500
  const X_TOP = X_LEFT + SIDE / 2; // 300
  const Y_TOP = Y_BASE - HEIGHT; // ~88.59

  // Zone definitions in (%CH4, %C2H4, %C2H2)
  // Top vertex: 100% CH4
  // Right vertex: 100% C2H4
  // Left vertex: 100% C2H2
  const ZONES = [
    {
      code: "PD",
      name: "Partial Discharge",
      color: "#d4f1f9",
      points: [
        [100, 0, 0],
        [98, 2, 0],
        [98, 0, 2]
      ],
      labelPos: [99, 0.5, 0.5],
      labelOffset: { dx: 0, dy: -16, line: true }
    },
    {
      code: "T1",
      name: "Thermal Fault < 300 °C",
      color: "#ffeb99",
      points: [
        [98, 2, 0],
        [80, 20, 0],
        [76, 20, 4],
        [96, 0, 4],
        [98, 0, 2]
      ],
      labelPos: [87, 11, 2]
    },
    {
      code: "T2",
      name: "Thermal Fault 300–700 °C",
      color: "#ffb366",
      points: [
        [80, 20, 0],
        [50, 50, 0],
        [46, 50, 4],
        [76, 20, 4]
      ],
      labelPos: [63, 35, 2]
    },
    {
      code: "T3",
      name: "Thermal Fault > 700 °C",
      color: "#ff6666",
      points: [
        [50, 50, 0],
        [0, 100, 0],
        [0, 85, 15],
        [35, 50, 15]
      ],
      labelPos: [18, 75, 7]
    },
    {
      code: "DT",
      name: "Electrical & Thermal Fault",
      color: "#d9b3ff",
      points: [
        [96, 0, 4],
        [76, 20, 4],
        [46, 50, 4],
        [35, 50, 15],
        [0, 85, 15],
        [0, 71, 29],
        [31, 40, 29],
        [47, 40, 13],
        [87, 0, 13]
      ],
      labelPos: [40, 45, 15]
    },
    {
      code: "D2",
      name: "Discharge of High Energy",
      color: "#80bfff",
      points: [
        [47, 40, 13],
        [31, 40, 29],
        [0, 71, 29],
        [0, 23, 77],
        [64, 23, 13]
      ],
      labelPos: [25, 42, 33]
    },
    {
      code: "D1",
      name: "Discharge of Low Energy",
      color: "#b3d9ff",
      points: [
        [87, 0, 13],
        [64, 23, 13],
        [0, 23, 77],
        [0, 0, 100]
      ],
      labelPos: [32, 8, 60]
    }
  ];

  function toPercentages(ch4, c2h4, c2h2) {
    const sum = ch4 + c2h4 + c2h2;
    if (sum <= 0) return [0, 0, 0];
    return [
      (ch4 / sum) * 100,
      (c2h4 / sum) * 100,
      (c2h2 / sum) * 100
    ];
  }

  function ternaryToXY(pCH4, pC2H4, pC2H2) {
    // Left: C2H2 (0,0,100), Right: C2H4 (0,100,0), Top: CH4 (100,0,0)
    const fCH4 = pCH4 / 100;
    const fC2H4 = pC2H4 / 100;
    const x = X_LEFT + SIDE * (fC2H4 + 0.5 * fCH4);
    const y = Y_BASE - HEIGHT * fCH4;
    return [x, y];
  }

  function classify(ch4, c2h4, c2h2) {
    const [pCH4, pC2H4, pC2H2] = toPercentages(ch4, c2h4, c2h2);

    if (pCH4 >= 98) {
      return "PD";
    }
    if (pC2H2 < 4) {
      if (pC2H4 < 20) return "T1";
      if (pC2H4 < 50) return "T2";
      return "T3";
    }
    if (pC2H2 < 15 && pC2H4 >= 50) {
      return "T3";
    }
    if (pC2H2 < 13 && pC2H4 < 40) {
      return "DT";
    }
    if (pC2H2 < 29 && pC2H4 >= 40) {
      return "DT";
    }
    if (pC2H4 < 23) {
      return "D1";
    }
    return "D2";
  }

  function createEl(tag, attrs) {
    const el = document.createElementNS(NS, tag);
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

    svg.setAttribute("viewBox", "0 0 600 540");
    svg.setAttribute("font-family", "system-ui, -apple-system, sans-serif");

    // Background
    svg.appendChild(createEl("rect", {
      x: 0, y: 0, width: 600, height: 540, fill: "#ffffff"
    }));

    // Title
    const title = createEl("text", {
      x: 300, y: 32,
      "text-anchor": "middle",
      "font-size": "18",
      "font-weight": "bold",
      fill: "#222222"
    });
    title.textContent = "Duval Triangle 1";
    svg.appendChild(title);

    // Draw Zones
    const zonesGroup = createEl("g", { id: "duval-zones" });
    for (const zone of ZONES) {
      const pts = zone.points.map(p => ternaryToXY(p[0], p[1], p[2]).join(",")).join(" ");
      const poly = createEl("polygon", {
        points: pts,
        fill: zone.color,
        stroke: "#333333",
        "stroke-width": "1.2",
        "stroke-linejoin": "round"
      });
      zonesGroup.appendChild(poly);
    }
    svg.appendChild(zonesGroup);

    // Outer Triangle Border
    const outerPts = [
      ternaryToXY(100, 0, 0).join(","),
      ternaryToXY(0, 100, 0).join(","),
      ternaryToXY(0, 0, 100).join(",")
    ].join(" ");
    svg.appendChild(createEl("polygon", {
      points: outerPts,
      fill: "none",
      stroke: "#000000",
      "stroke-width": "2",
      "stroke-linejoin": "round"
    }));

    // Axes & Ticks
    const axesGroup = createEl("g", { id: "duval-axes", "font-size": "11", fill: "#333333" });
    const tickLen = 7;

    for (let t = 10; t <= 90; t += 10) {
      // Left axis: %CH4 (from bottom-left 0% to top 100%)
      // Standard ternary tick direction: horizontal (parallel to constant CH4 lines)
      const [lx, ly] = ternaryToXY(t, 0, 100 - t);
      axesGroup.appendChild(createEl("line", {
        x1: lx, y1: ly,
        x2: lx - tickLen, y2: ly,
        stroke: "#000000", "stroke-width": "1.2"
      }));
      const lText = createEl("text", {
        x: lx - tickLen - 4, y: ly + 4,
        "text-anchor": "end"
      });
      lText.textContent = t;
      axesGroup.appendChild(lText);

      // Right axis: %C2H4 (from top 0% to bottom-right 100%)
      // Tick direction: parallel to constant C2H4 lines (up-right at 60 deg)
      const [rx, ry] = ternaryToXY(100 - t, t, 0);
      const rdx = tickLen * 0.5;
      const rdy = -tickLen * (Math.sqrt(3) / 2);
      axesGroup.appendChild(createEl("line", {
        x1: rx, y1: ry,
        x2: rx + rdx, y2: ry + rdy,
        stroke: "#000000", "stroke-width": "1.2"
      }));
      const rText = createEl("text", {
        x: rx + rdx + 4, y: ry + rdy + 3,
        "text-anchor": "start"
      });
      rText.textContent = t;
      axesGroup.appendChild(rText);

      // Bottom axis: %C2H2 (from bottom-right 0% to bottom-left 100%)
      // Tick direction: parallel to constant C2H2 lines (down-right at 60 deg)
      const [bx, by] = ternaryToXY(0, 100 - t, t);
      const bdx = tickLen * 0.5;
      const bdy = tickLen * (Math.sqrt(3) / 2);
      axesGroup.appendChild(createEl("line", {
        x1: bx, y1: by,
        x2: bx + bdx, y2: by + bdy,
        stroke: "#000000", "stroke-width": "1.2"
      }));
      const bText = createEl("text", {
        x: bx + bdx + 2, y: by + bdy + 11,
        "text-anchor": "middle"
      });
      bText.textContent = t;
      axesGroup.appendChild(bText);
    }

    // Axis Gas Titles & Directional Arrows
    // Left Axis Label (% CH4)
    const leftTitleX = X_LEFT + SIDE * 0.25 - 48;
    const leftTitleY = Y_BASE - HEIGHT * 0.5;
    const leftLabel = createEl("text", {
      x: leftTitleX, y: leftTitleY,
      "text-anchor": "middle",
      "font-size": "14",
      "font-weight": "bold",
      fill: "#111111",
      transform: `rotate(-60, ${leftTitleX}, ${leftTitleY})`
    });
    leftLabel.textContent = "% CH\u2084  \u2192";
    axesGroup.appendChild(leftLabel);

    // Right Axis Label (% C2H4)
    const rightTitleX = X_LEFT + SIDE * 0.75 + 48;
    const rightTitleY = Y_BASE - HEIGHT * 0.5;
    const rightLabel = createEl("text", {
      x: rightTitleX, y: rightTitleY,
      "text-anchor": "middle",
      "font-size": "14",
      "font-weight": "bold",
      fill: "#111111",
      transform: `rotate(60, ${rightTitleX}, ${rightTitleY})`
    });
    rightLabel.textContent = "% C\u2082H\u2084  \u2192";
    axesGroup.appendChild(rightLabel);

    // Bottom Axis Label (% C2H2)
    const bottomTitleX = X_LEFT + SIDE * 0.5;
    const bottomTitleY = Y_BASE + 45;
    const bottomLabel = createEl("text", {
      x: bottomTitleX, y: bottomTitleY,
      "text-anchor": "middle",
      "font-size": "14",
      "font-weight": "bold",
      fill: "#111111"
    });
    bottomLabel.textContent = "\u2190  % C\u2082H\u2082";
    axesGroup.appendChild(bottomLabel);

    svg.appendChild(axesGroup);

    // Zone Labels
    const labelsGroup = createEl("g", {
      id: "duval-labels",
      "font-size": "13",
      "font-weight": "bold",
      fill: "#111111"
    });
    for (const zone of ZONES) {
      const [lx, ly] = ternaryToXY(zone.labelPos[0], zone.labelPos[1], zone.labelPos[2]);
      if (zone.labelOffset) {
        const tx = lx + zone.labelOffset.dx;
        const ty = ly + zone.labelOffset.dy;
        if (zone.labelOffset.line) {
          labelsGroup.appendChild(createEl("line", {
            x1: lx, y1: ly,
            x2: tx, y2: ty + 4,
            stroke: "#333333",
            "stroke-width": "1"
          }));
        }
        const txt = createEl("text", {
          x: tx, y: ty,
          "text-anchor": "middle"
        });
        txt.textContent = zone.code;
        labelsGroup.appendChild(txt);
      } else {
        const txt = createEl("text", {
          x: lx, y: ly + 4,
          "text-anchor": "middle"
        });
        txt.textContent = zone.code;
        labelsGroup.appendChild(txt);
      }
    }
    svg.appendChild(labelsGroup);

    // Render Sample Point if provided
    if (sample && typeof sample === "object") {
      const ch4 = Number(sample.ch4) || 0;
      const c2h4 = Number(sample.c2h4) || 0;
      const c2h2 = Number(sample.c2h2) || 0;
      const sum = ch4 + c2h4 + c2h2;

      if (sum > 0) {
        const [pCH4, pC2H4, pC2H2] = toPercentages(ch4, c2h4, c2h2);
        const [sx, sy] = ternaryToXY(pCH4, pC2H4, pC2H2);
        const zoneCode = classify(ch4, c2h4, c2h2);

        const sampleGroup = createEl("g", { id: "duval-sample" });

        // Crosshair / Target
        sampleGroup.appendChild(createEl("circle", {
          cx: sx, cy: sy, r: 6,
          fill: "#e60000",
          stroke: "#ffffff",
          "stroke-width": "2"
        }));
        sampleGroup.appendChild(createEl("circle", {
          cx: sx, cy: sy, r: 2,
          fill: "#ffffff"
        }));

        // Sample readout at bottom
        const infoText = createEl("text", {
          x: 300, y: 515,
          "text-anchor": "middle",
          "font-size": "13",
          "font-weight": "bold",
          fill: "#222222"
        });
        infoText.textContent = `Sample: CH\u2084=${pCH4.toFixed(1)}%, C\u2082H\u2084=${pC2H4.toFixed(1)}%, C\u2082H\u2082=${pC2H2.toFixed(1)}%  \u2192  Zone: ${zoneCode}`;
        sampleGroup.appendChild(infoText);

        svg.appendChild(sampleGroup);
      }
    }
  }

  return {
    classify,
    render
  };
})();
