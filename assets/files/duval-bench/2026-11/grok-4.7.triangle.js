const DuvalTriangle = (function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";

  // Duval Triangle 1 zone limits (percent of CH4+C2H4+C2H2):
  // PD  CH4 >= 98
  // T1  C2H2 <= 4  and C2H4 <= 20
  // T2  C2H2 <= 4  and 20 < C2H4 < 50
  // T3  C2H4 >= 50 and C2H2 <= 15
  // D1  C2H2 >= 13 and C2H4 <= 23
  // D2  (23 < C2H4 <= 40 and C2H2 >= 13) or
  //     (40 < C2H4 < 50 and C2H2 >= 29) or
  //     (C2H4 >= 50 and C2H2 > 15)
  // DT  everything else
  function classifyPercents(pCH4, pC2H4, pC2H2) {
    if (pCH4 >= 98) return "PD";
    if (pC2H2 <= 4 && pC2H4 <= 20) return "T1";
    if (pC2H2 <= 4 && pC2H4 < 50) return "T2";
    if (pC2H4 >= 50 && pC2H2 <= 15) return "T3";
    if (pC2H2 >= 13 && pC2H4 <= 23) return "D1";
    if (pC2H4 > 23 && pC2H4 <= 40 && pC2H2 >= 13) return "D2";
    if (pC2H4 > 40 && pC2H4 < 50 && pC2H2 >= 29) return "D2";
    if (pC2H4 >= 50 && pC2H2 > 15) return "D2";
    return "DT";
  }

  function percents(ch4, c2h4, c2h2) {
    var s = ch4 + c2h4 + c2h2;
    return [100 * ch4 / s, 100 * c2h4 / s, 100 * c2h2 / s];
  }

  function el(parent, name, attrs) {
    var node = document.createElementNS(NS, name);
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) {
          node.setAttribute(k, String(attrs[k]));
        }
      }
    }
    if (parent) parent.appendChild(node);
    return node;
  }

  return {
    classify: function (ch4, c2h4, c2h2) {
      var p = percents(ch4, c2h4, c2h2);
      return classifyPercents(p[0], p[1], p[2]);
    },

    render: function (svg, sample) {
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      var side = 380;
      var height = side * Math.sqrt(3) / 2;
      var cx = 305;
      var baseY = 458;
      var apex = { x: cx, y: baseY - height };
      var vC2H2 = { x: cx - side / 2, y: baseY };
      var vC2H4 = { x: cx + side / 2, y: baseY };
      var center = {
        x: (apex.x + vC2H2.x + vC2H4.x) / 3,
        y: (apex.y + vC2H2.y + vC2H4.y) / 3
      };

      function xy(pCH4, pC2H4, pC2H2) {
        var a = pCH4 / 100, b = pC2H4 / 100, c = pC2H2 / 100;
        return {
          x: a * apex.x + b * vC2H4.x + c * vC2H2.x,
          y: a * apex.y + b * vC2H4.y + c * vC2H2.y
        };
      }

      function pointsAttr(pts) {
        var parts = [];
        for (var i = 0; i < pts.length; i++) {
          var p = xy(pts[i][0], pts[i][1], pts[i][2]);
          parts.push(p.x.toFixed(2) + "," + p.y.toFixed(2));
        }
        return parts.join(" ");
      }

      function outwardNormal(a, b) {
        var dx = b.x - a.x, dy = b.y - a.y;
        var len = Math.sqrt(dx * dx + dy * dy);
        var nx = dy / len, ny = -dx / len;
        var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        if (nx * (center.x - mx) + ny * (center.y - my) > 0) {
          nx = -nx;
          ny = -ny;
        }
        return { x: nx, y: ny };
      }

      var root = el(svg, "g", {
        "font-family": "Arial, Helvetica, sans-serif",
        "shape-rendering": "geometricPrecision"
      });

      el(root, "rect", { x: 0, y: 0, width: 600, height: 540, fill: "#ffffff" });

      var zones = [
        {
          code: "PD",
          desc: "Partial discharges",
          fill: "#e53935",
          ink: "#ffffff",
          pts: [[98, 2, 0], [100, 0, 0], [98, 0, 2]],
          label: null
        },
        {
          code: "T1",
          desc: "Thermal fault < 300°C",
          fill: "#fb8c00",
          ink: "#1a1a1a",
          pts: [[98, 2, 0], [80, 20, 0], [76, 20, 4], [96, 0, 4], [98, 0, 2]],
          label: [88, 9, 3],
          size: 12
        },
        {
          code: "T2",
          desc: "Thermal fault 300–700°C",
          fill: "#fdd835",
          ink: "#1a1a1a",
          pts: [[80, 20, 0], [50, 50, 0], [46, 50, 4], [76, 20, 4]],
          label: [63, 35, 2],
          size: 11
        },
        {
          code: "T3",
          desc: "Thermal fault > 700°C",
          fill: "#fff3b0",
          ink: "#1a1a1a",
          pts: [[50, 50, 0], [0, 100, 0], [0, 85, 15], [35, 50, 15]],
          label: [16, 74, 10],
          size: 16
        },
        {
          code: "DT",
          desc: "Mix of thermal and electrical faults",
          fill: "#ba68c8",
          ink: "#1a1a1a",
          pts: [
            [96, 0, 4], [76, 20, 4], [46, 50, 4], [35, 50, 15], [21, 50, 29],
            [31, 40, 29], [47, 40, 13], [64, 23, 13], [87, 0, 13]
          ],
          label: [64, 26, 10],
          size: 15
        },
        {
          code: "D1",
          desc: "Discharges of low energy",
          fill: "#42a5f5",
          ink: "#1a1a1a",
          pts: [[87, 0, 13], [0, 0, 100], [0, 23, 77], [64, 23, 13]],
          label: [36, 12, 52],
          size: 16
        },
        {
          code: "D2",
          desc: "Discharges of high energy",
          fill: "#1565c0",
          ink: "#ffffff",
          pts: [
            [64, 23, 13], [47, 40, 13], [31, 40, 29], [21, 50, 29],
            [35, 50, 15], [0, 85, 15], [0, 23, 77]
          ],
          label: [18, 36, 46],
          size: 16
        }
      ];

      for (var i = 0; i < zones.length; i++) {
        var z = zones[i];
        var poly = el(root, "polygon", {
          points: pointsAttr(z.pts),
          fill: z.fill,
          stroke: "#222222",
          "stroke-width": 0.8,
          "stroke-linejoin": "round"
        });
        var tip = el(poly, "title");
        tip.textContent = z.code + " — " + z.desc;
      }

      el(root, "polygon", {
        points: pointsAttr([[100, 0, 0], [0, 100, 0], [0, 0, 100]]),
        fill: "none",
        stroke: "#111111",
        "stroke-width": 1.6,
        "stroke-linejoin": "round"
      });

      // Light percentage grid (20% steps) so the ticks can be read across the triangle.
      var grid = el(root, "g", {
        stroke: "#000000",
        "stroke-opacity": 0.13,
        "stroke-width": 0.7,
        fill: "none"
      });
      var gstep;
      for (gstep = 20; gstep <= 80; gstep += 20) {
        var h1 = xy(gstep, 100 - gstep, 0);
        var h2 = xy(gstep, 0, 100 - gstep);
        el(grid, "line", { x1: h1.x, y1: h1.y, x2: h2.x, y2: h2.y });
        var e1 = xy(100 - gstep, gstep, 0);
        var e2 = xy(0, gstep, 100 - gstep);
        el(grid, "line", { x1: e1.x, y1: e1.y, x2: e2.x, y2: e2.y });
        var a1 = xy(100 - gstep, 0, gstep);
        var a2 = xy(0, 100 - gstep, gstep);
        el(grid, "line", { x1: a1.x, y1: a1.y, x2: a2.x, y2: a2.y });
      }

      function addAxis(p0, p1, title) {
        var n = outwardNormal(p0, p1);
        var t;
        for (t = 10; t <= 90; t += 10) {
          var f = t / 100;
          var x = p0.x + (p1.x - p0.x) * f;
          var y = p0.y + (p1.y - p0.y) * f;
          el(root, "line", {
            x1: x, y1: y,
            x2: x + n.x * 7, y2: y + n.y * 7,
            stroke: "#222222",
            "stroke-width": 1
          });
          var lab = el(root, "text", {
            x: x + n.x * 16,
            y: y + n.y * 16,
            "text-anchor": "middle",
            "dominant-baseline": "middle",
            "font-size": 10,
            fill: "#222222"
          });
          lab.textContent = String(t);
        }
        var mx = (p0.x + p1.x) / 2 + n.x * 44;
        var my = (p0.y + p1.y) / 2 + n.y * 44;
        var ang = Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180 / Math.PI;
        if (ang > 90) ang -= 180;
        if (ang < -90) ang += 180;
        var axis = el(root, "text", {
          x: mx,
          y: my,
          "text-anchor": "middle",
          "dominant-baseline": "middle",
          "font-size": 13,
          "font-weight": "bold",
          fill: "#111111",
          transform: "rotate(" + ang.toFixed(2) + " " + mx.toFixed(2) + " " + my.toFixed(2) + ")"
        });
        axis.textContent = title;
      }

      // Right side: %CH4, 0 at the C2H4 vertex, 100 at the apex.
      addAxis(vC2H4, apex, "%CH₄");
      // Left side: %C2H2, 0 at the apex, 100 at the C2H2 vertex.
      addAxis(apex, vC2H2, "%C₂H₂");
      // Base: %C2H4, 0 at the C2H2 vertex, 100 at the C2H4 vertex.
      addAxis(vC2H2, vC2H4, "%C₂H₄");

      function vertexName(x, y, text, anchor) {
        var t = el(root, "text", {
          x: x,
          y: y,
          "text-anchor": anchor,
          "dominant-baseline": "middle",
          "font-size": 15,
          "font-weight": "bold",
          fill: "#111111"
        });
        t.textContent = text;
      }
      vertexName(apex.x, apex.y - 30, "CH₄", "middle");
      vertexName(vC2H2.x - 14, vC2H2.y + 16, "C₂H₂", "end");
      vertexName(vC2H4.x + 14, vC2H4.y + 16, "C₂H₄", "start");

      // PD is only the top 2% of the altitude, so its label sits just above the tip.
      var pdLab = el(root, "text", {
        x: apex.x,
        y: apex.y - 13,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        "font-size": 11,
        "font-weight": "bold",
        fill: "#b71c1c"
      });
      pdLab.textContent = "PD";

      for (var j = 0; j < zones.length; j++) {
        var zone = zones[j];
        if (!zone.label) continue;
        var lp = xy(zone.label[0], zone.label[1], zone.label[2]);
        var zt = el(root, "text", {
          x: lp.x,
          y: lp.y,
          "text-anchor": "middle",
          "dominant-baseline": "middle",
          "font-size": zone.size,
          "font-weight": "bold",
          fill: zone.ink,
          stroke: zone.ink === "#ffffff" ? "#0d47a1" : "#ffffff",
          "stroke-width": 3,
          "paint-order": "stroke",
          "stroke-linejoin": "round"
        });
        zt.textContent = zone.code;
      }

      if (sample && (sample.ch4 + sample.c2h4 + sample.c2h2) > 0) {
        var sp = percents(sample.ch4, sample.c2h4, sample.c2h2);
        var loc = xy(sp[0], sp[1], sp[2]);
        var code = classifyPercents(sp[0], sp[1], sp[2]);
        var marker = el(root, "g");
        el(marker, "circle", {
          cx: loc.x,
          cy: loc.y,
          r: 6.5,
          fill: "#ffffff",
          stroke: "none"
        });
        var dot = el(marker, "circle", {
          cx: loc.x,
          cy: loc.y,
          r: 4.2,
          fill: "#b00020",
          stroke: "#111111",
          "stroke-width": 1
        });
        var mt = el(dot, "title");
        mt.textContent = code +
          "  (CH4 " + sp[0].toFixed(1) + "%, C2H4 " + sp[1].toFixed(1) +
          "%, C2H2 " + sp[2].toFixed(1) + "%)";
      }
    }
  };
})();
