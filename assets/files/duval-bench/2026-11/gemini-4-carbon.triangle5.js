const DuvalTriangle5 = (() => {
  const SVG_NS = "http://www.w3.org/2000/svg";

  const TOP = { x: 300, y: 62 };
  const SIDE = 420;
  const HEIGHT = (SIDE * Math.sqrt(3)) / 2;
  const RIGHT = { x: TOP.x + SIDE / 2, y: TOP.y + HEIGHT };
  const LEFT = { x: TOP.x - SIDE / 2, y: TOP.y + HEIGHT };

  const ZONES = [
    {
      code: "O",
      fill: "#bbf7d0",
      points: [
        [100, 0, 0],
        [90, 10, 0],
        [76, 10, 14],
        [85, 1, 14],
        [97, 1, 2],
        [98, 0, 2]
      ],
      labelAt: [88, 5.5, 6.5]
    },
    {
      code: "PD",
      fill: "#f472b6",
      points: [
        [98, 0, 2],
        [97, 1, 2],
        [85, 1, 14],
        [86, 0, 14]
      ],
      labelAt: [91.5, 0.5, 8],
      calloutOffset: [-48, -18]
    },
    {
      code: "S",
      fill: "#bae6fd",
      points: [
        [86, 0, 14],
        [76, 10, 14],
        [36, 10, 54],
        [46, 0, 54]
      ],
      labelAt: [61, 5, 34]
    },
    {
      code: "O",
      fill: "#bbf7d0",
      points: [
        [46, 0, 54],
        [36, 10, 54],
        [0, 10, 90],
        [0, 0, 100]
      ],
      labelAt: [18, 5, 77]
    },
    {
      code: "T2",
      fill: "#fde047",
      points: [
        [90, 10, 0],
        [65, 35, 0],
        [53, 35, 12],
        [78, 10, 12]
      ],
      labelAt: [71.5, 22.5, 6]
    },
    {
      code: "ND",
      fill: "#e5e7eb",
      points: [
        [60, 10, 30],
        [35, 35, 30],
        [0, 35, 65],
        [0, 10, 90]
      ],
      labelAt: [23, 22.5, 54.5]
    },
    {
      code: "C",
      fill: "#fdba74",
      points: [
        [78, 10, 12],
        [53, 35, 12],
        [51, 35, 14],
        [16, 70, 14],
        [0, 70, 30],
        [0, 35, 65],
        [35, 35, 30],
        [60, 10, 30]
      ],
      labelAt: [30, 46, 24]
    },
    {
      code: "T3",
      fill: "#fca5a5",
      points: [
        [65, 35, 0],
        [0, 100, 0],
        [0, 70, 30],
        [16, 70, 14],
        [51, 35, 14]
      ],
      labelAt: [14, 77, 9]
    }
  ];

  function toXY(mPct, ePct, aPct) {
    const m = mPct / 100;
    const e = ePct / 100;
    const a = aPct / 100;
    return {
      x: m * TOP.x + e * RIGHT.x + a * LEFT.x,
      y: m * TOP.y + e * RIGHT.y + a * LEFT.y
    };
  }

  function el(tag, attrs, parent) {
    const node = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, String(v));
      }
    }
    if (parent) {
      parent.appendChild(node);
    }
    return node;
  }

  function appendGasFormula(textEl, parts) {
    for (const part of parts) {
      if (part.sub) {
        const sub = el("tspan", { "font-size": "9.5", dy: "3" }, textEl);
        sub.textContent = part.text;
        const reset = el("tspan", { dy: "-3" }, textEl);
        reset.textContent = "";
      } else {
        const span = el("tspan", null, textEl);
        span.textContent = part.text;
      }
    }
  }

  function classify(ch4, c2h4, c2h6) {
    const sum = ch4 + c2h4 + c2h6;
    const e = (c2h4 * 100) / sum;
    const a = (c2h6 * 100) / sum;

    if (e < 10) {
      if (e <= 1 && a >= 2 && a <= 14) {
        return "PD";
      }
      if (a <= 14 || a >= 54) {
        return "O";
      }
      return "S";
    }

    if (e < 35) {
      if (a < 12) {
        return "T2";
      }
      if (a < 30) {
        return "C";
      }
      return "ND";
    }

    if (e < 70) {
      if (a <= 14) {
        return "T3";
      }
      return "C";
    }

    return "T3";
  }

  function render(svg, sample) {
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    const fontFamily = "system-ui, -apple-system, 'Segoe UI', Arial, sans-serif";

    el("rect", { x: 0, y: 0, width: 600, height: 540, fill: "#ffffff" }, svg);

    const title = el(
      "text",
      {
        x: 300,
        y: 28,
        "text-anchor": "middle",
        "font-family": fontFamily,
        "font-size": "16",
        "font-weight": "700",
        fill: "#0f172a"
      },
      svg
    );
    title.textContent = "Duval Triangle 5";

    const zonesGroup = el("g", null, svg);
    for (const z of ZONES) {
      const pts = z.points
        .map(([m, e, a]) => {
          const p = toXY(m, e, a);
          return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
        })
        .join(" ");
      el(
        "polygon",
        {
          points: pts,
          fill: z.fill,
          stroke: "#334155",
          "stroke-width": "1",
          "stroke-linejoin": "round"
        },
        zonesGroup
      );
    }

    el(
      "polygon",
      {
        points: `${TOP.x},${TOP.y} ${RIGHT.x.toFixed(2)},${RIGHT.y.toFixed(2)} ${LEFT.x.toFixed(2)},${LEFT.y.toFixed(2)}`,
        fill: "none",
        stroke: "#0f172a",
        "stroke-width": "1.8",
        "stroke-linejoin": "round"
      },
      svg
    );

    const axesGroup = el("g", { "font-family": fontFamily }, svg);
    const cos30 = Math.sqrt(3) / 2;

    const axes = [
      {
        pointAt: (v) => toXY(v, 0, 100 - v),
        normal: { x: -cos30, y: -0.5 },
        labelCenter: toXY(50, 0, 50),
        labelDist: 46,
        rotate: -60,
        formula: [
          { text: "CH" },
          { text: "4", sub: true },
          { text: " (%) \u2192" }
        ]
      },
      {
        pointAt: (v) => toXY(100 - v, v, 0),
        normal: { x: cos30, y: -0.5 },
        labelCenter: toXY(50, 50, 0),
        labelDist: 46,
        rotate: 60,
        formula: [
          { text: "C" },
          { text: "2", sub: true },
          { text: "H" },
          { text: "4", sub: true },
          { text: " (%) \u2192" }
        ]
      },
      {
        pointAt: (v) => toXY(0, 100 - v, v),
        normal: { x: 0, y: 1 },
        labelCenter: toXY(0, 50, 50),
        labelDist: 44,
        rotate: 0,
        formula: [
          { text: "\u2190 C" },
          { text: "2", sub: true },
          { text: "H" },
          { text: "6", sub: true },
          { text: " (%)" }
        ]
      }
    ];

    for (const axis of axes) {
      for (let v = 0; v <= 100; v += 5) {
        const isMajor = v % 10 === 0;
        const tickLen = isMajor ? 6.5 : 3.5;
        const p1 = axis.pointAt(v);
        const p2 = {
          x: p1.x + axis.normal.x * tickLen,
          y: p1.y + axis.normal.y * tickLen
        };
        el(
          "line",
          {
            x1: p1.x.toFixed(2),
            y1: p1.y.toFixed(2),
            x2: p2.x.toFixed(2),
            y2: p2.y.toFixed(2),
            stroke: "#0f172a",
            "stroke-width": isMajor ? "1.2" : "0.8"
          },
          axesGroup
        );

        if (isMajor) {
          const lp = {
            x: p1.x + axis.normal.x * 17,
            y: p1.y + axis.normal.y * 17
          };
          const t = el(
            "text",
            {
              x: lp.x.toFixed(2),
              y: lp.y.toFixed(2),
              "text-anchor": "middle",
              "dominant-baseline": "central",
              "font-size": "10.5",
              fill: "#334155"
            },
            axesGroup
          );
          t.textContent = String(v);
        }
      }

      const ac = {
        x: axis.labelCenter.x + axis.normal.x * axis.labelDist,
        y: axis.labelCenter.y + axis.normal.y * axis.labelDist
      };
      const axisTitle = el(
        "text",
        {
          x: ac.x.toFixed(2),
          y: ac.y.toFixed(2),
          transform: `rotate(${axis.rotate} ${ac.x.toFixed(2)} ${ac.y.toFixed(2)})`,
          "text-anchor": "middle",
          "dominant-baseline": "central",
          "font-size": "13",
          "font-weight": "600",
          fill: "#0f172a"
        },
        axesGroup
      );
      appendGasFormula(axisTitle, axis.formula);
    }

    const labelsGroup = el("g", { "font-family": fontFamily }, svg);
    for (const z of ZONES) {
      const anchor = toXY(z.labelAt[0], z.labelAt[1], z.labelAt[2]);
      if (z.calloutOffset) {
        const target = {
          x: anchor.x + z.calloutOffset[0],
          y: anchor.y + z.calloutOffset[1]
        };
        el(
          "line",
          {
            x1: anchor.x.toFixed(2),
            y1: anchor.y.toFixed(2),
            x2: (target.x + 11).toFixed(2),
            y2: target.y.toFixed(2),
            stroke: "#0f172a",
            "stroke-width": "1"
          },
          labelsGroup
        );
        el(
          "circle",
          {
            cx: anchor.x.toFixed(2),
            cy: anchor.y.toFixed(2),
            r: "1.8",
            fill: "#0f172a"
          },
          labelsGroup
        );
        const lbl = el(
          "text",
          {
            x: target.x.toFixed(2),
            y: target.y.toFixed(2),
            "text-anchor": "middle",
            "dominant-baseline": "central",
            "font-size": "12",
            "font-weight": "700",
            fill: "#0f172a"
          },
          labelsGroup
        );
        lbl.textContent = z.code;
      } else {
        const lbl = el(
          "text",
          {
            x: anchor.x.toFixed(2),
            y: anchor.y.toFixed(2),
            "text-anchor": "middle",
            "dominant-baseline": "central",
            "font-size": "13",
            "font-weight": "700",
            fill: "#0f172a"
          },
          labelsGroup
        );
        lbl.textContent = z.code;
      }
    }

    const legendText = el(
      "text",
      {
        x: 300,
        y: 496,
        "text-anchor": "middle",
        "font-family": fontFamily,
        "font-size": "10.5",
        fill: "#475569"
      },
      svg
    );
    legendText.textContent =
      "PD: Partial discharge  \u00b7  S: Stray gassing  \u00b7  O: Overheating <250\u00b0C  \u00b7  C: Paper carbonization  \u00b7  T2: 300\u2013700\u00b0C  \u00b7  T3: >700\u00b0C  \u00b7  ND: Not determined";

    if (sample && typeof sample === "object") {
      const { ch4, c2h4, c2h6 } = sample;
      const sum = ch4 + c2h4 + c2h6;
      if (sum > 0) {
        const m = (ch4 * 100) / sum;
        const e = (c2h4 * 100) / sum;
        const a = (c2h6 * 100) / sum;
        const pt = toXY(m, e, a);
        const zone = classify(ch4, c2h4, c2h6);

        const sampleGroup = el("g", null, svg);
        const projections = [
          toXY(m, 0, 100 - m),
          toXY(100 - e, e, 0),
          toXY(0, 100 - a, a)
        ];
        for (const proj of projections) {
          el(
            "line",
            {
              x1: pt.x.toFixed(2),
              y1: pt.y.toFixed(2),
              x2: proj.x.toFixed(2),
              y2: proj.y.toFixed(2),
              stroke: "#1e293b",
              "stroke-width": "1",
              "stroke-dasharray": "3,3",
              opacity: "0.6"
            },
            sampleGroup
          );
        }

        el(
          "circle",
          {
            cx: pt.x.toFixed(2),
            cy: pt.y.toFixed(2),
            r: "6.5",
            fill: "#ffffff",
            stroke: "#0f172a",
            "stroke-width": "1.6"
          },
          sampleGroup
        );
        el(
          "circle",
          {
            cx: pt.x.toFixed(2),
            cy: pt.y.toFixed(2),
            r: "3.8",
            fill: "#dc2626"
          },
          sampleGroup
        );

        const readout = el(
          "text",
          {
            x: 300,
            y: 520,
            "text-anchor": "middle",
            "font-family": fontFamily,
            "font-size": "11.5",
            "font-weight": "600",
            fill: "#0f172a"
          },
          sampleGroup
        );
        readout.textContent = `Sample: CH4 ${m.toFixed(1)}%, C2H4 ${e.toFixed(1)}%, C2H6 ${a.toFixed(1)}%  \u2192  Zone ${zone}`;
      }
    }
  }

  return { classify, render };
})();
