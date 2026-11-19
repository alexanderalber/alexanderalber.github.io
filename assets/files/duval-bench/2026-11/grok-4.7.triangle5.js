const DuvalTriangle5 = (function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";

  // Duval Triangle 5 (mineral oil, low-temperature faults).
  // Percentages of CH4 + C2H4 + C2H6. Limits follow the Triangle 5
  // partition: PD at the methane corner, T2/T3 by ethylene as in
  // Triangle 1, paper carbonization above 54% ethane (as in Triangle 4)
  // and where ethane stays high beside moderate ethylene, stray gassing
  // along the low-ethylene side.
  var PD_CH4 = 98;
  var T3_C2H4 = 50;
  var T2_C2H4 = 20;
  var T2_C2H6_MAX = 30;
  var C_C2H6 = 54;
  var S_C2H4_MAX = 10;
  var S_C2H6_MIN = 15;

  var ZONE_INFO = {
    PD: { name: "Partial discharges", fill: "#ce93d8" },
    S:  { name: "Stray gassing of oil", fill: "#fff59d" },
    O:  { name: "Overheating < 250°C", fill: "#90caf9" },
    C:  { name: "Paper carbonization", fill: "#ffcc80" },
    T2: { name: "Thermal fault 300–700°C", fill: "#a5d6a7" },
    T3: { name: "Thermal fault > 700°C", fill: "#ef9a9a" }
  };

  function classify(ch4, c2h4, c2h6) {
    var sum = Number(ch4) + Number(c2h4) + Number(c2h6);
    if (!(sum > 0) || !isFinite(sum)) return "O";
    var a = 100 * Number(ch4) / sum;
    var b = 100 * Number(c2h4) / sum;
    var c = 100 * Number(c2h6) / sum;
    var E = 1e-6;
    if (a >= PD_CH4 - E) return "PD";
    if (b >= T3_C2H4 - E) return "T3";
    if (b >= T2_C2H4 - E && c <= T2_C2H6_MAX + E) return "T2";
    if (c >= C_C2H6 - E || (b >= T2_C2H4 - E && c >= T2_C2H6_MAX - E)) return "C";
    if (b <= S_C2H4_MAX + E && c >= S_C2H6_MIN - E) return "S";
    return "O";
  }

  function render(svg, sample) {
    var SIDE = 370;
    var HEIGHT = SIDE * Math.sqrt(3) / 2;
    var BL = { x: 115, y: 400 };
    var BR = { x: 115 + SIDE, y: 400 };
    var TOP = { x: 115 + SIDE / 2, y: 400 - HEIGHT };

    function el(name, attrs) {
      var node = document.createElementNS(NS, name);
      if (attrs) {
        for (var k in attrs) {
          if (Object.prototype.hasOwnProperty.call(attrs, k) && attrs[k] != null) {
            node.setAttribute(k, String(attrs[k]));
          }
        }
      }
      return node;
    }

    function add(parent, node) {
      parent.appendChild(node);
      return node;
    }

    function text(parent, str, attrs) {
      var t = el("text", attrs);
      t.textContent = str;
      parent.appendChild(t);
      return t;
    }

    function toXY(ch4, c2h4, c2h6) {
      var s = ch4 + c2h4 + c2h6;
      var pa = ch4 / s;
      var pb = c2h4 / s;
      var pc = c2h6 / s;
      return {
        x: BL.x * pa + BR.x * pb + TOP.x * pc,
        y: BL.y * pa + BR.y * pb + TOP.y * pc
      };
    }

    function pointsAttr(pts) {
      var out = [];
      for (var i = 0; i < pts.length; i++) {
        var p = toXY(pts[i][0], pts[i][1], pts[i][2]);
        out.push(p.x.toFixed(2) + "," + p.y.toFixed(2));
      }
      return out.join(" ");
    }

    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Duval Triangle 5");

    var root = add(svg, el("g", {
      "font-family": "Segoe UI, Helvetica, Arial, sans-serif"
    }));

    add(root, el("rect", { x: 0, y: 0, width: 600, height: 540, fill: "#ffffff" }));

    text(root, "Duval Triangle 5", {
      x: 300, y: 28, "text-anchor": "middle",
      "font-size": 18, "font-weight": 700, fill: "#1a1a1a"
    });
    text(root, "Low-temperature faults in mineral oil", {
      x: 300, y: 48, "text-anchor": "middle",
      "font-size": 12, fill: "#546e7a"
    });

    // Zone polygons as [CH4, C2H4, C2H6] percent, built from the classify limits.
    var polyO = [
      [PD_CH4, 100 - PD_CH4, 0],
      [100 - T2_C2H4, T2_C2H4, 0],
      [100 - T2_C2H4 - C_C2H6, T2_C2H4, C_C2H6],
      [100 - C_C2H6 - S_C2H4_MAX, S_C2H4_MAX, C_C2H6],
      [100 - S_C2H6_MIN - S_C2H4_MAX, S_C2H4_MAX, S_C2H6_MIN],
      [100 - S_C2H6_MIN, 0, S_C2H6_MIN],
      [PD_CH4, 0, 100 - PD_CH4]
    ];
    var polyS = [
      [100 - S_C2H6_MIN, 0, S_C2H6_MIN],
      [100 - C_C2H6, 0, C_C2H6],
      [100 - C_C2H6 - S_C2H4_MAX, S_C2H4_MAX, C_C2H6],
      [100 - S_C2H6_MIN - S_C2H4_MAX, S_C2H4_MAX, S_C2H6_MIN]
    ];
    var polyC1 = [
      [100 - C_C2H6, 0, C_C2H6],
      [0, 0, 100],
      [0, 100 - C_C2H6, C_C2H6]
    ];
    var polyC2 = [
      [100 - T2_C2H4 - T2_C2H6_MAX, T2_C2H4, T2_C2H6_MAX],
      [100 - T3_C2H4 - T2_C2H6_MAX, T3_C2H4, T2_C2H6_MAX],
      [0, T3_C2H4, 100 - T3_C2H4],
      [0, 100 - C_C2H6, C_C2H6],
      [100 - T2_C2H4 - C_C2H6, T2_C2H4, C_C2H6]
    ];
    var polyT2 = [
      [100 - T2_C2H4, T2_C2H4, 0],
      [100 - T3_C2H4, T3_C2H4, 0],
      [100 - T3_C2H4 - T2_C2H6_MAX, T3_C2H4, T2_C2H6_MAX],
      [100 - T2_C2H4 - T2_C2H6_MAX, T2_C2H4, T2_C2H6_MAX]
    ];
    var polyT3 = [
      [100 - T3_C2H4, T3_C2H4, 0],
      [0, 100, 0],
      [0, T3_C2H4, 100 - T3_C2H4]
    ];
    var polyPD = [
      [100, 0, 0],
      [PD_CH4, 100 - PD_CH4, 0],
      [PD_CH4, 0, 100 - PD_CH4]
    ];

    var shapes = [
      { code: "O", polys: [polyO], labels: [[77, 15, 8]] },
      { code: "S", polys: [polyS], labels: [[55, 5, 40]] },
      { code: "C", polys: [polyC1, polyC2], labels: [[14, 8, 78], [27, 33, 40]] },
      { code: "T2", polys: [polyT2], labels: [[46, 36, 18]] },
      { code: "T3", polys: [polyT3], labels: [[12, 73, 15]] },
      { code: "PD", polys: [polyPD], labels: [] }
    ];

    var zi, pi, li, z, info, poly, tip, lp, xy;
    for (zi = 0; zi < shapes.length; zi++) {
      z = shapes[zi];
      info = ZONE_INFO[z.code];
      for (pi = 0; pi < z.polys.length; pi++) {
        poly = add(root, el("polygon", {
          points: pointsAttr(z.polys[pi]),
          fill: info.fill,
          stroke: "#455a64",
          "stroke-width": 1.15,
          "stroke-linejoin": "round"
        }));
        tip = add(poly, el("title"));
        tip.textContent = z.code + " — " + info.name;
      }
      for (li = 0; li < z.labels.length; li++) {
        lp = z.labels[li];
        xy = toXY(lp[0], lp[1], lp[2]);
        text(root, z.code, {
          x: xy.x.toFixed(2),
          y: xy.y.toFixed(2),
          "text-anchor": "middle",
          "dominant-baseline": "middle",
          "font-size": 15,
          "font-weight": 700,
          fill: "#1a1a1a",
          stroke: "#ffffff",
          "stroke-width": 3.5,
          "paint-order": "stroke",
          "stroke-linejoin": "round"
        });
      }
    }

    add(root, el("polygon", {
      points: pointsAttr([[100, 0, 0], [0, 100, 0], [0, 0, 100]]),
      fill: "none",
      stroke: "#263238",
      "stroke-width": 1.8,
      "stroke-linejoin": "round"
    }));

    var pdPt = toXY(99, 0.5, 0.5);
    var pdLab = { x: BL.x - 50, y: BL.y - 26 };
    add(root, el("line", {
      x1: pdLab.x + 22,
      y1: pdLab.y + 4,
      x2: pdPt.x,
      y2: pdPt.y,
      stroke: "#6a1b9a",
      "stroke-width": 1
    }));
    text(root, "PD", {
      x: pdLab.x,
      y: pdLab.y,
      "text-anchor": "end",
      "dominant-baseline": "middle",
      "font-size": 13,
      "font-weight": 700,
      fill: "#6a1b9a"
    });

    function outward(p0, p1) {
      var dx = p1.x - p0.x;
      var dy = p1.y - p0.y;
      var len = Math.sqrt(dx * dx + dy * dy);
      var n1 = { x: -dy / len, y: dx / len };
      var n2 = { x: dy / len, y: -dx / len };
      var mx = (p0.x + p1.x) / 2;
      var my = (p0.y + p1.y) / 2;
      var cx = (BL.x + BR.x + TOP.x) / 3;
      var cy = (BL.y + BR.y + TOP.y) / 3;
      var d1 = (mx + n1.x - cx) * (mx + n1.x - cx) + (my + n1.y - cy) * (my + n1.y - cy);
      var d2 = (mx + n2.x - cx) * (mx + n2.x - cx) + (my + n2.y - cy) * (my + n2.y - cy);
      return d1 > d2 ? n1 : n2;
    }

    function drawAxis(p0, p1, title, valueAtT) {
      var n = outward(p0, p1);
      var dx = p1.x - p0.x;
      var dy = p1.y - p0.y;
      var v, t, px, py, tick, mx, my, ang;
      for (v = 10; v < 100; v += 10) {
        t = valueAtT(v);
        px = p0.x + dx * t;
        py = p0.y + dy * t;
        tick = v === 50 ? 12 : 7;
        add(root, el("line", {
          x1: px,
          y1: py,
          x2: px + n.x * tick,
          y2: py + n.y * tick,
          stroke: "#37474f",
          "stroke-width": 1
        }));
        text(root, String(v), {
          x: px + n.x * 20,
          y: py + n.y * 20,
          "text-anchor": "middle",
          "dominant-baseline": "middle",
          "font-size": 11,
          fill: "#37474f"
        });
      }
      mx = (p0.x + p1.x) / 2 + n.x * 48;
      my = (p0.y + p1.y) / 2 + n.y * 48;
      ang = Math.atan2(dy, dx) * 180 / Math.PI;
      if (ang > 90) ang -= 180;
      if (ang < -90) ang += 180;
      text(root, title, {
        x: mx,
        y: my,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        "font-size": 13,
        "font-weight": 600,
        fill: "#1a1a1a",
        transform: "rotate(" + ang.toFixed(2) + " " + mx.toFixed(2) + " " + my.toFixed(2) + ")"
      });
    }

    // Values at the tick equal the gas percentage on that side.
    drawAxis(BL, TOP, "% CH₄", function (v) { return (100 - v) / 100; });
    drawAxis(BL, BR, "% C₂H₄", function (v) { return v / 100; });
    drawAxis(BR, TOP, "% C₂H₆", function (v) { return v / 100; });

    text(root, "CH₄", {
      x: BL.x - 10,
      y: BL.y + 5,
      "text-anchor": "end",
      "dominant-baseline": "middle",
      "font-size": 15,
      "font-weight": 700,
      fill: "#1a1a1a"
    });
    text(root, "C₂H₄", {
      x: BR.x + 10,
      y: BR.y + 5,
      "text-anchor": "start",
      "dominant-baseline": "middle",
      "font-size": 15,
      "font-weight": 700,
      fill: "#1a1a1a"
    });
    text(root, "C₂H₆", {
      x: TOP.x,
      y: TOP.y - 14,
      "text-anchor": "middle",
      "font-size": 15,
      "font-weight": 700,
      fill: "#1a1a1a"
    });

    add(root, el("line", {
      x1: 36, y1: 466, x2: 564, y2: 466,
      stroke: "#cfd8dc", "stroke-width": 1
    }));

    var legend = [
      ["PD", "Partial discharges"],
      ["S", "Stray gassing of oil"],
      ["O", "Overheating < 250°C"],
      ["C", "Paper carbonization"],
      ["T2", "Thermal 300–700°C"],
      ["T3", "Thermal > 700°C"]
    ];
    var i, col, row, lx, ly;
    for (i = 0; i < legend.length; i++) {
      col = i % 3;
      row = Math.floor(i / 3);
      lx = 36 + col * 188;
      ly = 484 + row * 22;
      add(root, el("rect", {
        x: lx,
        y: ly - 9,
        width: 12,
        height: 12,
        fill: ZONE_INFO[legend[i][0]].fill,
        stroke: "#455a64",
        "stroke-width": 0.8
      }));
      text(root, legend[i][0] + "  " + legend[i][1], {
        x: lx + 18,
        y: ly,
        "font-size": 11,
        fill: "#263238",
        "dominant-baseline": "middle"
      });
    }

    if (sample && typeof sample === "object") {
      var sch4 = Number(sample.ch4);
      var sc2h4 = Number(sample.c2h4);
      var sc2h6 = Number(sample.c2h6);
      var ssum = sch4 + sc2h4 + sc2h6;
      if (ssum > 0 && isFinite(ssum)) {
        var sp = toXY(sch4, sc2h4, sc2h6);
        var code = classify(sch4, sc2h4, sc2h6);
        var marker = add(root, el("g"));
        var st = add(marker, el("title"));
        st.textContent = code + " — " + ZONE_INFO[code].name +
          " (" + (100 * sch4 / ssum).toFixed(1) + "% CH₄, " +
          (100 * sc2h4 / ssum).toFixed(1) + "% C₂H₄, " +
          (100 * sc2h6 / ssum).toFixed(1) + "% C₂H₆)";
        add(marker, el("circle", {
          cx: sp.x, cy: sp.y, r: 6.5,
          fill: "#ffffff", stroke: "#212121", "stroke-width": 1
        }));
        add(marker, el("circle", {
          cx: sp.x, cy: sp.y, r: 4,
          fill: "#d50000", stroke: "#ffffff", "stroke-width": 1.25
        }));
        text(marker, code, {
          x: sp.x + 10,
          y: sp.y - 12,
          "font-size": 11,
          "font-weight": 700,
          fill: "#b71c1c",
          stroke: "#ffffff",
          "stroke-width": 3,
          "paint-order": "stroke",
          "stroke-linejoin": "round"
        });
      }
    }
  }

  return { classify: classify, render: render };
})();
