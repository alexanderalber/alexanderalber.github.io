const DuvalTriangle5 = (function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var W = 600, H = 540;
  var LEFT = 60, RIGHT = 540, BOTTOM = 470;
  var SIDE = RIGHT - LEFT;
  var TRI_H = SIDE * Math.sqrt(3) / 2;
  var TOP_Y = BOTTOM - TRI_H;
  var EPS = 1e-9;

  var zones = [
    {
      code: "S",
      fill: "#f7d7d7",
      poly: [[100, 0, 0], [46, 0, 54], [46, 10, 44], [90, 10, 0]],
      label: [74, 5, 21]
    },
    {
      code: "O",
      fill: "#d8ead2",
      poly: [[46, 0, 54], [0, 0, 100], [0, 10, 90], [46, 10, 44]],
      label: [20, 5, 75]
    },
    {
      code: "C",
      fill: "#fff2cc",
      poly: [[46, 10, 44], [0, 10, 90], [0, 35, 65], [25, 35, 40]],
      label: [16, 23, 61]
    },
    {
      code: "T2",
      fill: "#d9e2f3",
      poly: [[90, 10, 0], [46, 10, 44], [25, 35, 40], [0, 35, 65], [0, 50, 50], [50, 50, 0]],
      label: [42, 32, 26]
    },
    {
      code: "T3",
      fill: "#e4d7f5",
      poly: [[50, 50, 0], [0, 50, 50], [0, 100, 0]],
      label: [18, 72, 10]
    }
  ];

  function pct(ch4, c2h4, c2h6) {
    ch4 = Number(ch4);
    c2h4 = Number(c2h4);
    c2h6 = Number(c2h6);

    if (!isFinite(ch4) || !isFinite(c2h4) || !isFinite(c2h6) ||
        ch4 < 0 || c2h4 < 0 || c2h6 < 0 || ch4 + c2h4 + c2h6 <= 0) {
      throw new Error("DuvalTriangle5 requires non-negative finite gas concentrations with sum greater than zero.");
    }

    var s = ch4 + c2h4 + c2h6;
    return [100 * ch4 / s, 100 * c2h4 / s, 100 * c2h6 / s];
  }

  function xy(t) {
    var ch4 = t[0] / 100;
    var c2h4 = t[1] / 100;
    var c2h6 = t[2] / 100;
    return {
      x: LEFT + SIDE * (c2h6 + 0.5 * c2h4),
      y: BOTTOM - TRI_H * c2h4
    };
  }

  function el(name, attrs) {
    var n = document.createElementNS(NS, name);
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) {
          n.setAttribute(k, attrs[k]);
        }
      }
    }
    return n;
  }

  function append(svg, name, attrs) {
    var n = el(name, attrs);
    svg.appendChild(n);
    return n;
  }

  function text(svg, x, y, s, attrs) {
    attrs = attrs || {};
    attrs.x = x;
    attrs.y = y;
    var n = append(svg, "text", attrs);
    n.textContent = s;
    return n;
  }

  function pathData(poly) {
    var d = "";
    for (var i = 0; i < poly.length; i++) {
      var p = xy(poly[i]);
      d += (i ? "L" : "M") + p.x.toFixed(3) + " " + p.y.toFixed(3);
    }
    return d + "Z";
  }

  function lineData(a, b) {
    var p = xy(a), q = xy(b);
    return "M" + p.x.toFixed(3) + " " + p.y.toFixed(3) +
           "L" + q.x.toFixed(3) + " " + q.y.toFixed(3);
  }

  function pointOnSegment(p, a, b) {
    var cross = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
    if (Math.abs(cross) > 1e-7) return false;

    var dot = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y);
    if (dot < -1e-7) return false;

    var len2 = (b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y);
    return dot <= len2 + 1e-7;
  }

  function inside(poly, t) {
    var p = xy(t);
    var pts = [];
    var i, j;

    for (i = 0; i < poly.length; i++) pts.push(xy(poly[i]));

    for (i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      if (pointOnSegment(p, pts[j], pts[i])) return true;
    }

    var c = false;
    for (i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      if (((pts[i].y > p.y) !== (pts[j].y > p.y)) &&
          (p.x < (pts[j].x - pts[i].x) * (p.y - pts[i].y) / (pts[j].y - pts[i].y) + pts[i].x)) {
        c = !c;
      }
    }
    return c;
  }

  function classifyPoint(t) {
    for (var i = 0; i < zones.length; i++) {
      if (inside(zones[i].poly, t)) return zones[i].code;
    }

    var b = t[1];
    var a = t[0];

    if (b >= 50 - EPS) return "T3";
    if (b >= 10 - EPS) {
      var boundary = 46 - (21 / 25) * (b - 10);
      return a <= boundary + EPS && b <= 35 + EPS ? "C" : "T2";
    }
    return a >= 46 - EPS ? "S" : "O";
  }

  function clear(svg) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
  }

  function drawTick(svg, p, nx, ny, label, tx, ty, anchor) {
    append(svg, "line", {
      x1: p.x,
      y1: p.y,
      x2: p.x + nx * 8,
      y2: p.y + ny * 8,
      stroke: "#222",
      "stroke-width": "1"
    });

    text(svg, p.x + tx, p.y + ty, label, {
      "font-family": "Arial, sans-serif",
      "font-size": "11",
      fill: "#333",
      "text-anchor": anchor || "middle",
      "dominant-baseline": "middle"
    });
  }

  return {
    classify: function (ch4, c2h4, c2h6) {
      return classifyPoint(pct(ch4, c2h4, c2h6));
    },

    render: function (svg, sample) {
      clear(svg);

      append(svg, "rect", {
        x: "0",
        y: "0",
        width: String(W),
        height: String(H),
        fill: "white"
      });

      for (var i = 0; i < zones.length; i++) {
        append(svg, "path", {
          d: pathData(zones[i].poly),
          fill: zones[i].fill,
          stroke: "#555",
          "stroke-width": "1.2",
          "stroke-linejoin": "round"
        });
      }

      for (var g = 20; g <= 80; g += 20) {
        append(svg, "path", {
          d: lineData([g, 0, 100 - g], [g, 100 - g, 0]),
          fill: "none",
          stroke: "#ffffff",
          "stroke-width": "0.8",
          opacity: "0.75"
        });
        append(svg, "path", {
          d: lineData([0, g, 100 - g], [100 - g, g, 0]),
          fill: "none",
          stroke: "#ffffff",
          "stroke-width": "0.8",
          opacity: "0.75"
        });
        append(svg, "path", {
          d: lineData([0, 100 - g, g], [100 - g, 0, g]),
          fill: "none",
          stroke: "#ffffff",
          "stroke-width": "0.8",
          opacity: "0.75"
        });
      }

      append(svg, "path", {
        d: pathData([[100, 0, 0], [0, 0, 100], [0, 100, 0]]),
        fill: "none",
        stroke: "#111",
        "stroke-width": "2",
        "stroke-linejoin": "round"
      });

      for (var z = 0; z < zones.length; z++) {
        var lp = xy(zones[z].label);
        text(svg, lp.x, lp.y, zones[z].code, {
          "font-family": "Arial, sans-serif",
          "font-size": zones[z].code.length === 1 ? "22" : "20",
          "font-weight": "700",
          fill: "#222",
          "text-anchor": "middle",
          "dominant-baseline": "middle"
        });
      }

      for (var t = 0; t <= 100; t += 20) {
        var pBase = xy([100 - t, 0, t]);
        drawTick(svg, pBase, 0, 1, String(t), 0, 20, "middle");

        var pLeft = xy([100 - t, t, 0]);
        drawTick(svg, pLeft, -0.866, -0.5, String(t), -22, -12, "middle");

        var pRight = xy([0, 100 - t, t]);
        drawTick(svg, pRight, 0.866, -0.5, String(t), 22, -12, "middle");
      }

      var vCH4 = xy([100, 0, 0]);
      var vC2H6 = xy([0, 0, 100]);
      var vC2H4 = xy([0, 100, 0]);

      text(svg, vCH4.x - 38, vCH4.y + 42, "CH4", {
        "font-family": "Arial, sans-serif",
        "font-size": "18",
        "font-weight": "700",
        fill: "#111",
        "text-anchor": "middle"
      });

      text(svg, vC2H6.x + 42, vC2H6.y + 42, "C2H6", {
        "font-family": "Arial, sans-serif",
        "font-size": "18",
        "font-weight": "700",
        fill: "#111",
        "text-anchor": "middle"
      });

      text(svg, vC2H4.x, vC2H4.y - 24, "C2H4", {
        "font-family": "Arial, sans-serif",
        "font-size": "18",
        "font-weight": "700",
        fill: "#111",
        "text-anchor": "middle"
      });

      text(svg, 300, 522, "Duval Triangle 5", {
        "font-family": "Arial, sans-serif",
        "font-size": "14",
        fill: "#555",
        "text-anchor": "middle"
      });

      if (sample !== null && sample !== undefined) {
        var sp = pct(sample.ch4, sample.c2h4, sample.c2h6);
        var pp = xy(sp);
        var code = classifyPoint(sp);

        append(svg, "circle", {
          cx: pp.x,
          cy: pp.y,
          r: "7",
          fill: "#111",
          stroke: "white",
          "stroke-width": "2"
        });

        append(svg, "circle", {
          cx: pp.x,
          cy: pp.y,
          r: "11",
          fill: "none",
          stroke: "#111",
          "stroke-width": "1.5"
        });

        text(svg, pp.x + 15, pp.y - 15, code, {
          "font-family": "Arial, sans-serif",
          "font-size": "13",
          "font-weight": "700",
          fill: "#111",
          "text-anchor": "start",
          "dominant-baseline": "middle"
        });
      }
    }
  };
}());
