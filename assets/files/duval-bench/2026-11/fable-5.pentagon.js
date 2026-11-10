/* DuvalPentagon - Duval Pentagon 1 for dissolved gas analysis (DGA)
 * Gas axes (counter-clockwise): H2 at 90deg, C2H6 at 162deg, CH4 at 234deg,
 * C2H4 at 306deg, C2H2 at 18deg. Each axis runs 0..40 (%).
 * The sample point is the centroid of the irregular polygon formed by the
 * five relative-percentage points on the axes.
 */
const DuvalPentagon = (function () {
  "use strict";

  var DEG = Math.PI / 180;

  // order: h2, c2h6, ch4, c2h4, c2h2
  var AXES = [
    { key: "h2",   label: "H2",   angle: 90 },
    { key: "c2h6", label: "C2H6", angle: 162 },
    { key: "ch4",  label: "CH4",  angle: 234 },
    { key: "c2h4", label: "C2H4", angle: 306 },
    { key: "c2h2", label: "C2H2", angle: 18 }
  ];

  // Zone polygons in pentagon coordinates (x right, y up, units = %)
  var ZONES = [
    { code: "PD", color: "#f4b6c2", label: [-7, 28.6],
      pts: [[0, 24.5], [0, 33], [-1, 33], [-1, 24.5]] },
    { code: "S",  color: "#bcd9ea", label: [-15, 15],
      pts: [[0, 1.5], [0, 24.5], [-1, 24.5], [-1, 33], [0, 33], [0, 40],
            [-38, 12.4], [-35, 3.1]] },
    { code: "T1", color: "#fff2b2", label: [-19, -11],
      pts: [[0, 1.5], [-35, 3.1], [-23.5, -32.4], [-22.5, -32.4],
            [-6, -4], [-1, -2]] },
    { code: "T2", color: "#ffd59e", label: [-9, -24],
      pts: [[-6, -4], [-22.5, -32.4], [1, -32.4]] },
    { code: "T3", color: "#ffb380", label: [10, -22],
      pts: [[-1, -2], [-6, -4], [1, -32.4], [23.5, -32.4], [24.3, -30]] },
    { code: "D2", color: "#c9b3e6", label: [13, -4],
      pts: [[0, 1.5], [-1, -2], [24.3, -30], [32, -6.1], [4.1, 16]] },
    { code: "D1", color: "#b5e3b5", label: [15, 18],
      pts: [[0, 1.5], [4.1, 16], [32, -6.1], [38, 12.4], [0, 40]] }
  ];

  function gasPoints(h2, ch4, c2h6, c2h4, c2h2) {
    var v = { h2: h2, ch4: ch4, c2h6: c2h6, c2h4: c2h4, c2h2: c2h2 };
    var sum = 0, i;
    for (i = 0; i < AXES.length; i++) sum += Math.max(0, v[AXES[i].key] || 0);
    if (!(sum > 0)) throw new Error("Sum of gas concentrations must be > 0");
    var pts = [];
    for (i = 0; i < AXES.length; i++) {
      var pct = 100 * Math.max(0, v[AXES[i].key] || 0) / sum;
      var a = AXES[i].angle * DEG;
      pts.push([pct * Math.cos(a), pct * Math.sin(a)]);
    }
    return pts;
  }

  function polygonCentroid(pts) {
    var a = 0, cx = 0, cy = 0, n = pts.length, i;
    for (i = 0; i < n; i++) {
      var p = pts[i], q = pts[(i + 1) % n];
      var cr = p[0] * q[1] - q[0] * p[1];
      a += cr;
      cx += (p[0] + q[0]) * cr;
      cy += (p[1] + q[1]) * cr;
    }
    if (Math.abs(a) < 1e-9) { // degenerate polygon: fall back to mean
      cx = 0; cy = 0;
      for (i = 0; i < n; i++) { cx += pts[i][0]; cy += pts[i][1]; }
      return [cx / n, cy / n];
    }
    a *= 0.5;
    return [cx / (6 * a), cy / (6 * a)];
  }

  function distToSegment(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var len2 = dx * dx + dy * dy;
    var t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    var x = ax + t * dx, y = ay + t * dy;
    return Math.hypot(px - x, py - y);
  }

  function pointInPolygon(x, y, pts) {
    var inside = false, n = pts.length, i, j;
    for (i = 0, j = n - 1; i < n; j = i++) {
      if (distToSegment(x, y, pts[j][0], pts[j][1], pts[i][0], pts[i][1]) < 1e-9)
        return true; // on boundary counts as inside
      var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if ((yi > y) !== (yj > y) &&
          x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  function samplePoint(h2, ch4, c2h6, c2h4, c2h2) {
    return polygonCentroid(gasPoints(h2, ch4, c2h6, c2h4, c2h2));
  }

  function classify(h2, ch4, c2h6, c2h4, c2h2) {
    var c = samplePoint(h2, ch4, c2h6, c2h4, c2h2);
    var i;
    for (i = 0; i < ZONES.length; i++) {
      if (pointInPolygon(c[0], c[1], ZONES[i].pts)) return ZONES[i].code;
    }
    // numeric fallback: nearest zone boundary
    var best = ZONES[0].code, bestD = Infinity;
    for (i = 0; i < ZONES.length; i++) {
      var pts = ZONES[i].pts, n = pts.length, j;
      for (j = 0; j < n; j++) {
        var k = (j + 1) % n;
        var d = distToSegment(c[0], c[1], pts[j][0], pts[j][1], pts[k][0], pts[k][1]);
        if (d < bestD) { bestD = d; best = ZONES[i].code; }
      }
    }
    return best;
  }

  // ---------- rendering ----------
  var CX = 300, CY = 300, SCALE = 6; // 40% -> 240 px

  function tx(p) { return CX + p[0] * SCALE; }
  function ty(p) { return CY - p[1] * SCALE; }

  var SVGNS = "http://www.w3.org/2000/svg";

  function el(svg, name, attrs, text) {
    var e = document.createElementNS(SVGNS, name);
    for (var k in attrs) if (attrs.hasOwnProperty(k)) e.setAttribute(k, attrs[k]);
    if (text != null) e.appendChild(document.createTextNode(text));
    svg.appendChild(e);
    return e;
  }

  function ptsAttr(pts) {
    var s = [];
    for (var i = 0; i < pts.length; i++) s.push(tx(pts[i]) + "," + ty(pts[i]));
    return s.join(" ");
  }

  function render(svg, sample) {
    var i;

    // zones
    for (i = 0; i < ZONES.length; i++) {
      el(svg, "polygon", {
        points: ptsAttr(ZONES[i].pts),
        fill: ZONES[i].color,
        stroke: "#555",
        "stroke-width": 1,
        "stroke-linejoin": "round"
      });
    }

    // outer pentagon
    var outer = [];
    for (i = 0; i < AXES.length; i++) {
      var a = AXES[i].angle * DEG;
      outer.push([40 * Math.cos(a), 40 * Math.sin(a)]);
    }
    el(svg, "polygon", {
      points: ptsAttr(outer),
      fill: "none",
      stroke: "#000",
      "stroke-width": 2,
      "stroke-linejoin": "round"
    });

    // axes from centre to vertices + gas labels + 40% ticks
    for (i = 0; i < AXES.length; i++) {
      var ang = AXES[i].angle * DEG;
      var vx = 40 * Math.cos(ang), vy = 40 * Math.sin(ang);
      el(svg, "line", {
        x1: CX, y1: CY, x2: tx([vx, vy]), y2: ty([vx, vy]),
        stroke: "#333", "stroke-width": 1, "stroke-dasharray": "4,4",
        opacity: 0.6
      });
      var lx = 46.5 * Math.cos(ang), ly = 46.5 * Math.sin(ang);
      el(svg, "text", {
        x: tx([lx, ly]), y: ty([lx, ly]) + 5,
        "text-anchor": "middle",
        "font-family": "sans-serif",
        "font-size": 18,
        "font-weight": "bold",
        fill: "#000"
      }, AXES[i].label);
      el(svg, "text", {
        x: tx([42.5 * Math.cos(ang), 42.5 * Math.sin(ang)]),
        y: ty([42.5 * Math.cos(ang), 42.5 * Math.sin(ang)]) + 4,
        "text-anchor": "middle",
        "font-family": "sans-serif",
        "font-size": 11,
        fill: "#555"
      }, "40%");
    }

    // zone labels (PD gets a leader line, zone is too narrow)
    for (i = 0; i < ZONES.length; i++) {
      var z = ZONES[i];
      if (z.code === "PD") {
        el(svg, "line", {
          x1: tx([z.label[0] + 1.6, z.label[1]]), y1: ty([z.label[0] + 1.6, z.label[1]]),
          x2: tx([-0.9, 28.7]), y2: ty([-0.9, 28.7]),
          stroke: "#333", "stroke-width": 1
        });
      }
      el(svg, "text", {
        x: tx(z.label), y: ty(z.label) + 5,
        "text-anchor": "middle",
        "font-family": "sans-serif",
        "font-size": 15,
        "font-weight": "bold",
        fill: "#222"
      }, z.code);
    }

    // sample point
    if (sample) {
      var c = samplePoint(sample.h2, sample.ch4, sample.c2h6,
                          sample.c2h4, sample.c2h2);
      var code = classify(sample.h2, sample.ch4, sample.c2h6,
                          sample.c2h4, sample.c2h2);
      el(svg, "circle", {
        cx: tx(c), cy: ty(c), r: 6,
        fill: "#d40000", stroke: "#fff", "stroke-width": 2
      });
      el(svg, "text", {
        x: tx(c) + 10, y: ty(c) - 8,
        "font-family": "sans-serif",
        "font-size": 14,
        "font-weight": "bold",
        fill: "#d40000"
      }, code);
    }

    // title
    el(svg, "text", {
      x: 300, y: 28,
      "text-anchor": "middle",
      "font-family": "sans-serif",
      "font-size": 18,
      "font-weight": "bold",
      fill: "#000"
    }, "Duval Pentagon 1");
  }

  return {
    classify: classify,
    render: render
  };
})();
