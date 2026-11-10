const DuvalTriangle = (function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";

  /*
    Duval Triangle 1 zone vertices, recalled as percentages in this order:
      [ CH4, C2H4, C2H2 ]
    Each row sums to 100.
  */
  const ZONES = [
    {
      code: "PD",
      fill: "#d9d2e9",
      label: [99, 0.6, 0.4],
      poly: [
        [100, 0, 0],
        [98, 0, 2],
        [98, 2, 0]
      ]
    },
    {
      code: "D1",
      fill: "#ffe599",
      label: [42, 7, 51],
      poly: [
        [0, 0, 100],
        [0, 23, 77],
        [64, 0, 36],
        [98, 0, 2]
      ]
    },
    {
      code: "D2",
      fill: "#f6b26b",
      label: [23, 36, 41],
      poly: [
        [0, 23, 77],
        [0, 71, 29],
        [31, 40, 29],
        [47, 40, 13],
        [64, 0, 36]
      ]
    },
    {
      code: "T1",
      fill: "#b6d7a8",
      label: [88, 4, 8],
      poly: [
        [98, 2, 0],
        [90, 10, 0],
        [76, 4, 20],
        [80, 0, 20],
        [98, 0, 2]
      ]
    },
    {
      code: "T2",
      fill: "#93c47d",
      label: [72, 22, 6],
      poly: [
        [90, 10, 0],
        [50, 50, 0],
        [76, 4, 20]
      ]
    },
    {
      code: "T3",
      fill: "#e06666",
      label: [20, 72, 8],
      poly: [
        [50, 50, 0],
        [0, 100, 0],
        [0, 85, 15],
        [35, 35, 30]
      ]
    },
    {
      code: "DT",
      fill: "#9fc5e8",
      label: [42, 33, 25],
      poly: [
        [0, 71, 29],
        [0, 85, 15],
        [35, 35, 30],
        [50, 50, 0],
        [76, 4, 20],
        [80, 0, 20],
        [64, 0, 36],
        [47, 40, 13],
        [31, 40, 29]
      ]
    }
  ];

  const V_CH4 = { x: 80, y: 470 };
  const V_C2H4 = { x: 520, y: 470 };
  const V_C2H2 = { x: 300, y: 60 };

  function normalize(ch4, c2h4, c2h2) {
    if (
      typeof ch4 !== "number" || typeof c2h4 !== "number" || typeof c2h2 !== "number" ||
      !isFinite(ch4) || !isFinite(c2h4) || !isFinite(c2h2) ||
      ch4 < 0 || c2h4 < 0 || c2h2 < 0 ||
      ch4 + c2h4 + c2h2 <= 0
    ) {
      throw new RangeError("DuvalTriangle requires non-negative finite gas concentrations with sum greater than zero.");
    }

    const sum = ch4 + c2h4 + c2h2;
    return [100 * ch4 / sum, 100 * c2h4 / sum, 100 * c2h2 / sum];
  }

  function ternaryToSvg(p) {
    const ch4 = p[0] / 100;
    const c2h4 = p[1] / 100;
    const c2h2 = p[2] / 100;

    return {
      x: ch4 * V_CH4.x + c2h4 * V_C2H4.x + c2h2 * V_C2H2.x,
      y: ch4 * V_CH4.y + c2h4 * V_C2H4.y + c2h2 * V_C2H2.y
    };
  }

  function pointString(poly) {
    return poly.map(function (p) {
      const q = ternaryToSvg(p);
      return q.x.toFixed(2) + "," + q.y.toFixed(2);
    }).join(" ");
  }

  function isOnSegment(px, py, ax, ay, bx, by) {
    const eps = 1e-9;
    const cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax);
    if (Math.abs(cross) > eps) return false;

    const dot = (px - ax) * (bx - ax) + (py - ay) * (by - ay);
    if (dot < -eps) return false;

    const len2 = (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
    return dot <= len2 + eps;
  }

  function containsPoint(poly, p) {
    const px = p[0];
    const py = p[1];
    let inside = false;

    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const ax = poly[j][0];
      const ay = poly[j][1];
      const bx = poly[i][0];
      const by = poly[i][1];

      if (isOnSegment(px, py, ax, ay, bx, by)) {
        return true;
      }

      if ((ay > py) !== (by > py)) {
        const xIntersect = ax + (py - ay) * (bx - ax) / (by - ay);
        if (px < xIntersect) {
          inside = !inside;
        }
      }
    }

    return inside;
  }

  function make(name, attrs) {
    const el = document.createElementNS(SVG_NS, name);
    for (const k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k)) {
        el.setAttribute(k, attrs[k]);
      }
    }
    return el;
  }

  function addText(svg, text, x, y, attrs) {
    const el = make("text", attrs || {});
    el.setAttribute("x", x);
    el.setAttribute("y", y);
    el.textContent = text;
    svg.appendChild(el);
    return el;
  }

  function addLine(svg, p1, p2, attrs) {
    const el = make("line", Object.assign({
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y
    }, attrs || {}));
    svg.appendChild(el);
    return el;
  }

  function axisTick(svg, pct, label, textDx, textDy) {
    const p = ternaryToSvg(pct);
    addText(svg, label, p.x + textDx, p.y + textDy, {
      "font-family": "Arial, sans-serif",
      "font-size": "10",
      "fill": "#333",
      "text-anchor": "middle",
      "dominant-baseline": "middle"
    });
  }

  function classify(ch4, c2h4, c2h2) {
    const p = normalize(ch4, c2h4, c2h2);

    for (let i = 0; i < ZONES.length; i++) {
      if (containsPoint(ZONES[i].poly, p)) {
        return ZONES[i].code;
      }
    }

    return "DT";
  }

  function render(svg, sample) {
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    svg.appendChild(make("rect", {
      x: "0",
      y: "0",
      width: "600",
      height: "540",
      fill: "white"
    }));

    for (let i = 0; i < ZONES.length; i++) {
      svg.appendChild(make("polygon", {
        points: pointString(ZONES[i].poly),
        fill: ZONES[i].fill,
        stroke: "#ffffff",
        "stroke-width": "2",
        "stroke-linejoin": "round"
      }));
    }

    svg.appendChild(make("polygon", {
      points: pointString([
        [100, 0, 0],
        [0, 100, 0],
        [0, 0, 100]
      ]),
      fill: "none",
      stroke: "#111",
      "stroke-width": "2.5",
      "stroke-linejoin": "round"
    }));

    for (let j = 0; j < ZONES.length; j++) {
      const zone = ZONES[j];
      const c = ternaryToSvg(zone.label);
      addText(svg, zone.code, c.x, c.y, {
        "font-family": "Arial, sans-serif",
        "font-size": zone.code === "PD" ? "12" : "18",
        "font-weight": "700",
        "fill": "#111",
        "text-anchor": "middle",
        "dominant-baseline": "middle"
      });
    }

    for (let t = 0; t <= 100; t += 20) {
      const pCH4 = ternaryToSvg([t, 0, 100 - t]);
      const pC2H4 = ternaryToSvg([100 - t, t, 0]);
      const pC2H2 = ternaryToSvg([0, 100 - t, t]);

      addLine(svg, { x: pCH4.x - 4, y: pCH4.y + 2 }, { x: pCH4.x + 4, y: pCH4.y - 2 }, {
        stroke: "#111",
        "stroke-width": "1"
      });
      addLine(svg, { x: pC2H4.x, y: pC2H4.y - 5 }, { x: pC2H4.x, y: pC2H4.y + 5 }, {
        stroke: "#111",
        "stroke-width": "1"
      });
      addLine(svg, { x: pC2H2.x - 4, y: pC2H2.y - 2 }, { x: pC2H2.x + 4, y: pC2H2.y + 2 }, {
        stroke: "#111",
        "stroke-width": "1"
      });

      axisTick(svg, [t, 0, 100 - t], String(t), -24, 2);
      axisTick(svg, [100 - t, t, 0], String(t), 0, 22);
      axisTick(svg, [0, 100 - t, t], String(t), 24, 2);
    }

    addText(svg, "CH₄ (%)", V_CH4.x - 24, V_CH4.y + 42, {
      "font-family": "Arial, sans-serif",
      "font-size": "16",
      "font-weight": "700",
      "fill": "#111",
      "text-anchor": "middle"
    });

    addText(svg, "C₂H₄ (%)", V_C2H4.x + 34, V_C2H4.y + 42, {
      "font-family": "Arial, sans-serif",
      "font-size": "16",
      "font-weight": "700",
      "fill": "#111",
      "text-anchor": "middle"
    });

    addText(svg, "C₂H₂ (%)", V_C2H2.x, V_C2H2.y - 24, {
      "font-family": "Arial, sans-serif",
      "font-size": "16",
      "font-weight": "700",
      "fill": "#111",
      "text-anchor": "middle"
    });

    if (sample !== null && sample !== undefined) {
      const p = normalize(sample.ch4, sample.c2h4, sample.c2h2);
      const q = ternaryToSvg(p);
      const code = classify(sample.ch4, sample.c2h4, sample.c2h2);

      const g = make("g", {});
      const circle = make("circle", {
        cx: q.x,
        cy: q.y,
        r: "7",
        fill: "#cc0000",
        stroke: "#111",
        "stroke-width": "2"
      });
      const title = make("title", {});
      title.textContent =
        "Sample: CH4 " + p[0].toFixed(1) +
        "%, C2H4 " + p[1].toFixed(1) +
        "%, C2H2 " + p[2].toFixed(1) +
        "% — " + code;

      circle.appendChild(title);
      g.appendChild(circle);
      svg.appendChild(g);

      addText(svg, code, q.x + 12, q.y - 12, {
        "font-family": "Arial, sans-serif",
        "font-size": "14",
        "font-weight": "700",
        "fill": "#cc0000",
        "stroke": "white",
        "stroke-width": "3",
        "paint-order": "stroke",
        "text-anchor": "start",
        "dominant-baseline": "middle"
      });
    }
  }

  return {
    classify: classify,
    render: render
  };
}());
