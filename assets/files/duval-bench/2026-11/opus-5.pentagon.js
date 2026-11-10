/* =====================================================================
   Duval Pentagon 1  (DGA of mineral-oil-filled transformers)
   ---------------------------------------------------------------------
   Axes (clockwise from top):  H2 (90deg), C2H2 (18deg), C2H4 (-54deg),
                               CH4 (-126deg), C2H6 (162deg)
   The sample point is the centroid of the irregular pentagon whose five
   vertices sit on the axes at a distance equal to the relative
   percentage of each gas (so 100 % of one gas = distance 100).
   Because the centroid of such a figure can never leave a radius of
   100/3 = 33.3, the zone map is drawn on a pentagon of "radius 40".
   ===================================================================== */

const DuvalPentagon = (function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var D2R = Math.PI / 180;

  /* axis unit directions, order = clockwise around the pentagon */
  var AXES = [
    { key: "h2",   formula: "H2",   ang:   90 },
    { key: "c2h2", formula: "C2H2", ang:   18 },
    { key: "c2h4", formula: "C2H4", ang:  -54 },
    { key: "ch4",  formula: "CH4",  ang: -126 },
    { key: "c2h6", formula: "C2H6", ang:  162 }
  ];

  /* ---- outer pentagon used for drawing (radius 40 on each gas axis) ---- */
  var OUTER = AXES.map(function (a) {
    return [40 * Math.cos(a.ang * D2R), 40 * Math.sin(a.ang * D2R)];
  });

  /* ------------------------- fault zones ------------------------------ */
  var ZONES = [
    { code: "PD", name: "Partial discharges",
      fill: "#cbb2e0", text: "#000",
      pts: [[-1, 24.5], [0, 24.5], [0, 33], [-1, 33]],
      label: [-9.5, 29], leader: [[-6.5, 29], [-1.6, 28.5]] },

    { code: "S", name: "Stray gassing of oil",
      fill: "#b7e08a", text: "#000",
      pts: [[0, 40], [-38, 12.4], [-35, 3.1], [0, 1.5],
            [0, 24.5], [-1, 24.5], [-1, 33], [0, 33]],
      label: [-20, 16] },

    { code: "D1", name: "Low energy discharges",
      fill: "#9ecae1", text: "#000",
      pts: [[0, 40], [38, 12.4], [32, -6.1], [4, 16], [0, 1.5]],
      label: [13, 21] },

    { code: "D2", name: "High energy discharges",
      fill: "#2f7fbd", text: "#fff",
      pts: [[0, 1.5], [4, 16], [32, -6.1], [24, -30], [-1, -2]],
      label: [15.5, -3] },

    { code: "T3", name: "Thermal fault > 700 C",
      fill: "#d7301f", text: "#fff",
      pts: [[-1, -2], [24, -30], [23.5, -32.4], [1, -32.4]],
      label: [10, -22] },

    { code: "T2", name: "Thermal fault 300-700 C",
      fill: "#fd8d3c", text: "#000",
      pts: [[-6, -4], [-1, -2], [1, -32.4], [-6, -32.4]],
      label: [-2.6, -19] },

    { code: "T1", name: "Thermal fault < 300 C",
      fill: "#ffeda0", text: "#000",
      pts: [[0, 1.5], [-1, -2], [-6, -4], [-6, -32.4],
            [-23.5, -32.4], [-35, 3.1]],
      label: [-16, -15] }
  ];

  /* ------------------------ geometry helpers -------------------------- */

  function polygonCentroid(pts) {
    var a = 0, cx = 0, cy = 0, i, j, cr, n = pts.length;
    for (i = 0; i < n; i++) {
      j = (i + 1) % n;
      cr = pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
      a += cr;
      cx += (pts[i][0] + pts[j][0]) * cr;
      cy += (pts[i][1] + pts[j][1]) * cr;
    }
    a = a / 2;
    if (Math.abs(a) < 1e-9) return null;        /* degenerate */
    return [cx / (6 * a), cy / (6 * a)];
  }

  /* relative percentages -> pentagon point (x,y) */
  function samplePoint(h2, ch4, c2h6, c2h4, c2h2) {
    var g = {
      h2:   Math.max(0, +h2   || 0),
      ch4:  Math.max(0, +ch4  || 0),
      c2h6: Math.max(0, +c2h6 || 0),
      c2h4: Math.max(0, +c2h4 || 0),
      c2h2: Math.max(0, +c2h2 || 0)
    };
    var sum = g.h2 + g.ch4 + g.c2h6 + g.c2h4 + g.c2h2;
    if (!(sum > 0)) return null;

    var pts = AXES.map(function (a) {
      var pct = 100 * g[a.key] / sum;
      return [pct * Math.cos(a.ang * D2R), pct * Math.sin(a.ang * D2R)];
    });

    var c = polygonCentroid(pts);
    if (c) return c;

    /* degenerate case (one or two gases only): centroid of the
       triangle origin-A-B, i.e. the sum of the points divided by 3  */
    var sx = 0, sy = 0;
    pts.forEach(function (p) { sx += p[0]; sy += p[1]; });
    return [sx / 3, sy / 3];
  }

  function pointInPolygon(p, poly) {
    var inside = false, i, j, xi, yi, xj, yj;
    for (i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      xi = poly[i][0]; yi = poly[i][1];
      xj = poly[j][0]; yj = poly[j][1];
      if (((yi > p[1]) !== (yj > p[1])) &&
          (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }

  function distToSegment(p, a, b) {
    var vx = b[0] - a[0], vy = b[1] - a[1];
    var wx = p[0] - a[0], wy = p[1] - a[1];
    var L2 = vx * vx + vy * vy, t = 0;
    if (L2 > 0) t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / L2));
    var dx = p[0] - (a[0] + t * vx), dy = p[1] - (a[1] + t * vy);
    return Math.sqrt(dx * dx + dy * dy);
  }

  function distToPolygon(p, poly) {
    if (pointInPolygon(p, poly)) return 0;
    var d = Infinity, i, j;
    for (i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      d = Math.min(d, distToSegment(p, poly[j], poly[i]));
    }
    return d;
  }

  function zoneOfPoint(p) {
    var i;
    for (i = 0; i < ZONES.length; i++) {
      if (pointInPolygon(p, ZONES[i].pts)) {
        /* the PD rectangle is a thin strip just under the H2 axis tip;
           numerical limit of a pure-H2 sample is (0, 33.33)           */
        if (ZONES[i].code === "S" &&
            p[0] >= -1 && p[0] <= 0 && p[1] >= 24.5) return "PD";
        return ZONES[i].code;
      }
    }
    /* on a boundary / rounding: take the nearest zone */
    var best = ZONES[0].code, bd = Infinity, d;
    for (i = 0; i < ZONES.length; i++) {
      d = distToPolygon(p, ZONES[i].pts);
      if (d < bd) { bd = d; best = ZONES[i].code; }
    }
    return best;
  }

  /* --------------------------- drawing -------------------------------- */

  var CX = 300, CY = 300, SC = 5.4;      /* zone units -> pixels */
  function px(x) { return CX + x * SC; }
  function py(y) { return CY - y * SC; }

  function el(name, attrs) {
    var e = document.createElementNS(NS, name), k;
    for (k in attrs) if (attrs.hasOwnProperty(k)) {
      e.setAttribute(k, attrs[k]);
    }
    return e;
  }

  function polyPoints(pts) {
    return pts.map(function (p) {
      return px(p[0]).toFixed(2) + "," + py(p[1]).toFixed(2);
    }).join(" ");
  }

  function textNode(parent, x, y, str, attrs) {
    var t = el("text", attrs || {});
    t.setAttribute("x", x);
    t.setAttribute("y", y);
    t.appendChild(document.createTextNode(str));
    parent.appendChild(t);
    return t;
  }

  /* chemical formula with subscripts */
  function formulaNode(parent, x, y, formula, attrs) {
    var t = el("text", attrs || {});
    t.setAttribute("x", x);
    t.setAttribute("y", y);
    var i, ch, sub = false, span;
    for (i = 0; i < formula.length; i++) {
      ch = formula.charAt(i);
      if (ch >= "0" && ch <= "9") {
        span = el("tspan", { dy: sub ? 0 : 4, "font-size": "11" });
        sub = true;
      } else {
        span = el("tspan", { dy: sub ? -4 : 0 });
        sub = false;
      }
      span.appendChild(document.createTextNode(ch));
      t.appendChild(span);
    }
    parent.appendChild(t);
    return t;
  }

  /* ----------------------------- API ---------------------------------- */

  return {

    classify: function (h2, ch4, c2h6, c2h4, c2h2) {
      var p = samplePoint(h2, ch4, c2h6, c2h4, c2h2);
      if (!p) return null;
      return zoneOfPoint(p);
    },

    render: function (svg, sample) {
      if (!svg) return;
      var g = el("g", { "font-family": "Helvetica, Arial, sans-serif" });
      svg.appendChild(g);

      /* title */
      textNode(g, 300, 30, "Duval Pentagon 1",
        { "text-anchor": "middle", "font-size": "20", "font-weight": "bold",
          fill: "#222" });
      textNode(g, 300, 48, "mineral-oil-filled transformers",
        { "text-anchor": "middle", "font-size": "12", fill: "#555" });

      /* zone polygons */
      ZONES.forEach(function (z) {
        g.appendChild(el("polygon", {
          points: polyPoints(z.pts),
          fill: z.fill,
          stroke: "#333",
          "stroke-width": "1",
          "stroke-linejoin": "round"
        }));
      });

      /* outer pentagon outline */
      g.appendChild(el("polygon", {
        points: polyPoints(OUTER),
        fill: "none",
        stroke: "#000",
        "stroke-width": "2",
        "stroke-linejoin": "round"
      }));

      /* axes + ticks */
      AXES.forEach(function (a) {
        var ux = Math.cos(a.ang * D2R), uy = Math.sin(a.ang * D2R);
        g.appendChild(el("line", {
          x1: px(0), y1: py(0),
          x2: px(40 * ux), y2: py(40 * uy),
          stroke: "#444", "stroke-width": "0.8",
          "stroke-dasharray": "4 3", opacity: "0.7"
        }));
        /* ticks every 10 % */
        for (var v = 10; v <= 40; v += 10) {
          var tx = px(v * ux), ty = py(v * uy);
          g.appendChild(el("line", {
            x1: tx - 3 * uy * 1, y1: ty - 3 * ux * 1,
            x2: tx + 3 * uy * 1, y2: ty + 3 * ux * 1,
            stroke: "#444", "stroke-width": "0.8", opacity: "0.7"
          }));
        }
        /* gas name just outside the vertex */
        var lx = px(45.5 * ux), ly = py(45.5 * uy);
        var anchor = "middle";
        if (ux > 0.3) anchor = "start";
        else if (ux < -0.3) anchor = "end";
        var dy = uy > 0.3 ? -2 : (uy < -0.3 ? 12 : 4);
        formulaNode(g, lx, ly + dy, a.formula, {
          "text-anchor": anchor, "font-size": "15",
          "font-weight": "bold", fill: "#000"
        });
      });

      /* percentage numbers along the H2 axis */
      for (var v = 10; v <= 40; v += 10) {
        textNode(g, px(0) + 5, py(v) + 4, String(v),
          { "font-size": "9", fill: "#444" });
      }

      /* zone labels */
      ZONES.forEach(function (z) {
        if (z.leader) {
          g.appendChild(el("line", {
            x1: px(z.leader[0][0]), y1: py(z.leader[0][1]),
            x2: px(z.leader[1][0]), y2: py(z.leader[1][1]),
            stroke: "#000", "stroke-width": "0.8"
          }));
        }
        textNode(g, px(z.label[0]), py(z.label[1]), z.code, {
          "text-anchor": "middle", "font-size": "15",
          "font-weight": "bold", fill: z.text
        });
      });

      /* ---------------------- sample point ------------------------- */
      if (sample) {
        var p = samplePoint(sample.h2, sample.ch4, sample.c2h6,
                            sample.c2h4, sample.c2h2);
        if (p) {
          var code = zoneOfPoint(p);
          var X = px(p[0]), Y = py(p[1]);

          g.appendChild(el("line", {
            x1: X - 12, y1: Y, x2: X + 12, y2: Y,
            stroke: "#000", "stroke-width": "1.3"
          }));
          g.appendChild(el("line", {
            x1: X, y1: Y - 12, x2: X, y2: Y + 12,
            stroke: "#000", "stroke-width": "1.3"
          }));
          g.appendChild(el("circle", {
            cx: X, cy: Y, r: 6,
            fill: "#ffffff", stroke: "#000", "stroke-width": "2"
          }));

          var sum = Math.max(0, +sample.h2 || 0) + Math.max(0, +sample.ch4 || 0) +
                    Math.max(0, +sample.c2h6 || 0) + Math.max(0, +sample.c2h4 || 0) +
                    Math.max(0, +sample.c2h2 || 0);
          var pc = function (v) { return (100 * Math.max(0, +v || 0) / sum).toFixed(1); };

          textNode(g, 300, 555,
            "H2 " + pc(sample.h2) + "%   CH4 " + pc(sample.ch4) +
            "%   C2H6 " + pc(sample.c2h6) + "%   C2H4 " + pc(sample.c2h4) +
            "%   C2H2 " + pc(sample.c2h2) + "%",
            { "text-anchor": "middle", "font-size": "12", fill: "#333" });

          var zinfo = ZONES.filter(function (z) { return z.code === code; })[0];
          textNode(g, 300, 578,
            "Zone: " + code + (zinfo ? "  (" + zinfo.name + ")" : ""),
            { "text-anchor": "middle", "font-size": "14",
              "font-weight": "bold", fill: "#000" });

          textNode(g, X + 10, Y - 10, code,
            { "font-size": "13", "font-weight": "bold", fill: "#000",
              stroke: "#fff", "stroke-width": "3", "paint-order": "stroke" });
        }
      }
    }
  };
})();
