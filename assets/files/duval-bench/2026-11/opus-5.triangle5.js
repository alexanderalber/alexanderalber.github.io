/* Duval Triangle 5 (low-temperature faults in mineral-oil-filled transformers)
 * Gases: CH4 / C2H4 / C2H6
 * Zones: PD, S, O, ND, C, T2, T3
 *
 * Geometry of the ternary plot:
 *   top vertex        = 100 % CH4
 *   bottom-left       = 100 % C2H6
 *   bottom-right      = 100 % C2H4
 *   left axis   -> % CH4   (0 at bottom-left, 100 at top)
 *   bottom axis -> % C2H6  (100 at bottom-left, 0 at bottom-right)
 *   right axis  -> % C2H4  (0 at top, 100 at bottom-right)
 */
const DuvalTriangle5 = (function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";

  /* pixel positions of the three vertices */
  var VT = [300, 70];    /* 100 % CH4  */
  var VL = [80, 451];    /* 100 % C2H6 */
  var VR = [520, 451];   /* 100 % C2H4 */

  /* ternary (CH4, C2H4, C2H6) -> pixel */
  function proj(m, e, n) {
    var s = m + e + n;
    if (s <= 0) s = 1;
    var a = m / s, b = e / s, c = n / s;
    return [
      a * VT[0] + b * VR[0] + c * VL[0],
      a * VT[1] + b * VR[1] + c * VL[1]
    ];
  }

  /* zone definitions, polygons given as (CH4, C2H4, C2H6) percentages */
  var ZONES = [
    { code: "PD", fill: "#9ecbe8",
      pts: [[100, 0, 0], [98, 2, 0], [98, 0, 2]], external: true },

    { code: "O", fill: "#f2e36a",
      pts: [[98, 0, 2], [98, 2, 0], [90, 10, 0], [75, 10, 15], [85, 0, 15]] },

    { code: "S", fill: "#9fd6a0",
      pts: [[85, 0, 15], [75, 10, 15], [0, 10, 90], [0, 0, 100]] },

    { code: "ND", fill: "#dcdcdc",
      pts: [[90, 10, 0], [80, 20, 0], [65, 20, 15], [75, 10, 15]], small: true },

    { code: "T2", fill: "#f0a24a",
      pts: [[80, 20, 0], [50, 50, 0], [35, 50, 15], [65, 20, 15]] },

    { code: "C", fill: "#b5a6c9",
      pts: [[75, 10, 15], [35, 50, 15], [0, 50, 50], [0, 10, 90]] },

    { code: "T3", fill: "#e2655a",
      pts: [[50, 50, 0], [0, 100, 0], [0, 50, 50]] }
  ];

  var MEANING = [
    ["PD", "partial discharges (corona)"],
    ["S",  "stray gassing of oil"],
    ["O",  "overheating < 250 \u00B0C"],
    ["C",  "hot spot with carbonization of paper (> 300 \u00B0C)"],
    ["T2", "thermal fault 300 - 700 \u00B0C"],
    ["T3", "thermal fault > 700 \u00B0C"],
    ["ND", "not determined"]
  ];

  function mk(name, attrs, text) {
    var e = document.createElementNS(NS, name);
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) {
          e.setAttribute(k, String(attrs[k]));
        }
      }
    }
    if (text !== undefined && text !== null) {
      e.appendChild(document.createTextNode(String(text)));
    }
    return e;
  }

  function polyPoints(pts) {
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      var p = proj(pts[i][0], pts[i][1], pts[i][2]);
      out.push(p[0].toFixed(2) + "," + p[1].toFixed(2));
    }
    return out.join(" ");
  }

  function centroid(pts) {
    var sx = 0, sy = 0;
    for (var i = 0; i < pts.length; i++) {
      var p = proj(pts[i][0], pts[i][1], pts[i][2]);
      sx += p[0]; sy += p[1];
    }
    return [sx / pts.length, sy / pts.length];
  }

  /* ---------------- classification ---------------- */

  function classify(ch4, c2h4, c2h6) {
    var a = Number(ch4) || 0, b = Number(c2h4) || 0, c = Number(c2h6) || 0;
    var s = a + b + c;
    if (!(s > 0)) return "ND";
    var m = 100 * a / s;   /* % CH4  */
    var e = 100 * b / s;   /* % C2H4 */
    var n = 100 * c / s;   /* % C2H6 */

    if (m >= 98) return "PD";
    if (e <= 10) return (n >= 15) ? "S" : "O";
    if (e <= 20) return (n >= 15) ? "C" : "ND";
    if (e <= 50) return (n >= 15) ? "C" : "T2";
    return "T3";
  }

  /* ---------------- rendering ---------------- */

  function render(svg, sample) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var g = mk("g", { "font-family": "Helvetica, Arial, sans-serif" });
    svg.appendChild(g);

    /* title */
    g.appendChild(mk("text", {
      x: 300, y: 32, "text-anchor": "middle",
      "font-size": 19, "font-weight": "bold", fill: "#222"
    }, "Duval Triangle 5"));
    g.appendChild(mk("text", {
      x: 300, y: 50, "text-anchor": "middle",
      "font-size": 11, fill: "#555"
    }, "CH\u2084 \u2013 C\u2082H\u2084 \u2013 C\u2082H\u2086  (low-temperature faults)"));

    /* zones */
    var i, z, cpt;
    for (i = 0; i < ZONES.length; i++) {
      z = ZONES[i];
      g.appendChild(mk("polygon", {
        points: polyPoints(z.pts),
        fill: z.fill,
        stroke: "#333",
        "stroke-width": 1.2,
        "stroke-linejoin": "round"
      }));
    }

    /* zone labels */
    for (i = 0; i < ZONES.length; i++) {
      z = ZONES[i];
      if (z.external) continue;
      cpt = centroid(z.pts);
      g.appendChild(mk("text", {
        x: cpt[0].toFixed(1), y: cpt[1].toFixed(1),
        "text-anchor": "middle", "dominant-baseline": "middle",
        "font-size": z.small ? 11 : 15,
        "font-weight": "bold",
        fill: "#1a1a1a"
      }, z.code));
    }

    /* PD label outside (zone is tiny) */
    var pdAnchor = proj(99, 0.5, 0.5);
    g.appendChild(mk("line", {
      x1: pdAnchor[0].toFixed(1), y1: pdAnchor[1].toFixed(1),
      x2: 372, y2: 72,
      stroke: "#333", "stroke-width": 1
    }));
    g.appendChild(mk("text", {
      x: 376, y: 76, "font-size": 13, "font-weight": "bold", fill: "#1a1a1a"
    }, "PD"));

    /* outer border */
    g.appendChild(mk("polygon", {
      points: polyPoints([[100, 0, 0], [0, 100, 0], [0, 0, 100]]),
      fill: "none", stroke: "#000", "stroke-width": 1.8
    }));

    /* ---- axes: ticks + numbers ---- */
    var k, v, p, q, lab;
    var TICK = 8, TICKMIN = 5, LBL = 16;

    /* left axis: % CH4 (outward normal pointing up-left) */
    var nL = [-0.866, -0.5];
    for (k = 0; k <= 10; k++) {
      v = k * 10;
      p = proj(v, 0, 100 - v);
      var big = (v % 20 === 0);
      var t = big ? TICK : TICKMIN;
      g.appendChild(mk("line", {
        x1: p[0].toFixed(1), y1: p[1].toFixed(1),
        x2: (p[0] + nL[0] * t).toFixed(1), y2: (p[1] + nL[1] * t).toFixed(1),
        stroke: "#000", "stroke-width": big ? 1.4 : 1
      }));
      if (big) {
        g.appendChild(mk("text", {
          x: (p[0] + nL[0] * LBL).toFixed(1),
          y: (p[1] + nL[1] * LBL).toFixed(1),
          "text-anchor": "end", "dominant-baseline": "middle",
          "font-size": 11, fill: "#222"
        }, v));
      }
    }

    /* right axis: % C2H4 (outward normal pointing up-right) */
    var nR = [0.866, -0.5];
    for (k = 0; k <= 10; k++) {
      v = k * 10;
      p = proj(100 - v, v, 0);
      var bigR = (v % 20 === 0);
      g.appendChild(mk("line", {
        x1: p[0].toFixed(1), y1: p[1].toFixed(1),
        x2: (p[0] + nR[0] * (bigR ? TICK : TICKMIN)).toFixed(1),
        y2: (p[1] + nR[1] * (bigR ? TICK : TICKMIN)).toFixed(1),
        stroke: "#000", "stroke-width": bigR ? 1.4 : 1
      }));
      if (bigR) {
        g.appendChild(mk("text", {
          x: (p[0] + nR[0] * LBL).toFixed(1),
          y: (p[1] + nR[1] * LBL).toFixed(1),
          "text-anchor": "start", "dominant-baseline": "middle",
          "font-size": 11, fill: "#222"
        }, v));
      }
    }

    /* bottom axis: % C2H6 (outward normal pointing down) */
    for (k = 0; k <= 10; k++) {
      v = k * 10;
      p = proj(0, 100 - v, v);
      var bigB = (v % 20 === 0);
      g.appendChild(mk("line", {
        x1: p[0].toFixed(1), y1: p[1].toFixed(1),
        x2: p[0].toFixed(1),
        y2: (p[1] + (bigB ? TICK : TICKMIN)).toFixed(1),
        stroke: "#000", "stroke-width": bigB ? 1.4 : 1
      }));
      if (bigB) {
        g.appendChild(mk("text", {
          x: p[0].toFixed(1), y: (p[1] + LBL + 6).toFixed(1),
          "text-anchor": "middle",
          "font-size": 11, fill: "#222"
        }, v));
      }
    }

    /* ---- axis names with direction arrows ---- */
    /* left: % CH4, increasing upwards */
    lab = proj(50, 0, 50);
    g.appendChild(mk("text", {
      x: (lab[0] + nL[0] * 46).toFixed(1),
      y: (lab[1] + nL[1] * 46).toFixed(1),
      "text-anchor": "middle", "font-size": 14, "font-weight": "bold",
      fill: "#111",
      transform: "rotate(-60 " + (lab[0] + nL[0] * 46).toFixed(1) + " " +
                 (lab[1] + nL[1] * 46).toFixed(1) + ")"
    }, "% CH\u2084  \u2192"));

    /* right: % C2H4, increasing downwards to the right */
    lab = proj(50, 50, 0);
    g.appendChild(mk("text", {
      x: (lab[0] + nR[0] * 46).toFixed(1),
      y: (lab[1] + nR[1] * 46).toFixed(1),
      "text-anchor": "middle", "font-size": 14, "font-weight": "bold",
      fill: "#111",
      transform: "rotate(60 " + (lab[0] + nR[0] * 46).toFixed(1) + " " +
                 (lab[1] + nR[1] * 46).toFixed(1) + ")"
    }, "% C\u2082H\u2084  \u2192"));

    /* bottom: % C2H6, increasing to the left */
    lab = proj(0, 50, 50);
    g.appendChild(mk("text", {
      x: lab[0].toFixed(1), y: (lab[1] + 52).toFixed(1),
      "text-anchor": "middle", "font-size": 14, "font-weight": "bold",
      fill: "#111"
    }, "\u2190  % C\u2082H\u2086"));

    /* ---- legend ---- */
    var lx = 10, ly = 60;
    for (i = 0; i < MEANING.length; i++) {
      var zf = "#fff";
      for (k = 0; k < ZONES.length; k++) {
        if (ZONES[k].code === MEANING[i][0]) zf = ZONES[k].fill;
      }
      g.appendChild(mk("rect", {
        x: lx, y: ly + i * 14 - 8, width: 10, height: 10,
        fill: zf, stroke: "#333", "stroke-width": 0.8
      }));
      g.appendChild(mk("text", {
        x: lx + 15, y: ly + i * 14, "font-size": 9.5, fill: "#333"
      }, MEANING[i][0] + " : " + MEANING[i][1]));
    }

    /* ---- sample point ---- */
    if (sample) {
      var a = Number(sample.ch4) || 0;
      var b = Number(sample.c2h4) || 0;
      var c = Number(sample.c2h6) || 0;
      var s = a + b + c;
      if (s > 0) {
        var pm = 100 * a / s, pe = 100 * b / s, pn = 100 * c / s;
        var sp = proj(pm, pe, pn);
        var code = classify(a, b, c);

        g.appendChild(mk("line", {
          x1: (sp[0] - 11).toFixed(1), y1: sp[1].toFixed(1),
          x2: (sp[0] + 11).toFixed(1), y2: sp[1].toFixed(1),
          stroke: "#000", "stroke-width": 1.2
        }));
        g.appendChild(mk("line", {
          x1: sp[0].toFixed(1), y1: (sp[1] - 11).toFixed(1),
          x2: sp[0].toFixed(1), y2: (sp[1] + 11).toFixed(1),
          stroke: "#000", "stroke-width": 1.2
        }));
        g.appendChild(mk("circle", {
          cx: sp[0].toFixed(1), cy: sp[1].toFixed(1), r: 5.5,
          fill: "#000", stroke: "#fff", "stroke-width": 1.6
        }));

        var txt = code + "  (CH\u2084 " + pm.toFixed(1) + "%, C\u2082H\u2084 " +
                  pe.toFixed(1) + "%, C\u2082H\u2086 " + pn.toFixed(1) + "%)";
        var tx = sp[0] + 14, anchor = "start";
        if (tx > 430) { tx = sp[0] - 14; anchor = "end"; }
        g.appendChild(mk("text", {
          x: tx.toFixed(1), y: (sp[1] - 12).toFixed(1),
          "text-anchor": anchor, "font-size": 11.5,
          "font-weight": "bold", fill: "#000",
          stroke: "#fff", "stroke-width": 3, "paint-order": "stroke"
        }, txt));
      }
    }

    return svg;
  }

  return { classify: classify, render: render };
})();
