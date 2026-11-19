const DuvalTriangle = (function () {
  "use strict";

  // Zone polygons of Duval Triangle 1 (mineral oil).
  // Each point is [x, y, z] = [%CH4, %C2H4, %C2H2].
  var ZONES = [
    { code: "PD", color: "#b39ddb", pts: [[98, 0, 2], [100, 0, 0], [98, 2, 0]] },
    { code: "T1", color: "#fff59d", pts: [[98, 0, 2], [98, 2, 0], [63, 37, 0], [23, 0, 77]] },
    { code: "T2", color: "#ffb74d", pts: [[63, 37, 0], [30, 70, 0], [23, 0, 77]] },
    { code: "T3", color: "#ef9a9a", pts: [[30, 70, 0], [0, 100, 0], [0, 23, 77]] },
    { code: "DT", color: "#c8e6c9", pts: [[23, 0, 77], [4, 2, 94], [0, 23, 77], [30, 70, 0]] },
    { code: "D1", color: "#80deea", pts: [[23, 0, 77], [13, 0, 87], [4, 2, 94]] },
    { code: "D2", color: "#4dd0e1", pts: [[13, 0, 87], [0, 0, 100], [0, 23, 77], [4, 2, 94]] }
  ];

  // Triangle corners in svg user units (viewBox 0 0 600 540)
  var C = [
    { x: 90,  y: 470 }, // 100 % CH4
    { x: 510, y: 470 }, // 100 % C2H4
    { x: 300, y: 106 }  // 100 % C2H2
  ];

  var NS = "http://www.w3.org/2000/svg";

  function pct(ch4, c2h4, c2h2) {
    var t = ch4 + c2h4 + c2h2;
    return [100 * ch4 / t, 100 * c2h4 / t, 100 * c2h2 / t];
  }

  function toXY(p) {
    return {
      x: (p[0] * C[0].x + p[1] * C[1].x + p[2] * C[2].x) / 100,
      y: (p[0] * C[0].y + p[1] * C[1].y + p[2] * C[2].y) / 100
    };
  }

  // Convex polygon test on the (x, y) projection (x+y+z = 100 plane).
  function inPoly(p, pts) {
    var tol = 1e-7, pos = false, neg = false;
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length];
      var cr = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
      if (cr > tol) pos = true; else if (cr < -tol) neg = true;
    }
    return !(pos && neg);
  }

  function classify(ch4, c2h4, c2h2) {
    var p = pct(ch4, c2h4, c2h2), i, j, z;
    for (i = 0; i < ZONES.length; i++) {
      if (inPoly(p, ZONES[i].pts)) return ZONES[i].code;
    }
    // Numerical fallback: nearest zone vertex.
    var best = null, bd = Infinity;
    for (i = 0; i < ZONES.length; i++) {
      z = ZONES[i];
      for (j = 0; j < z.pts.length; j++) {
        var d = 0, k;
        for (k = 0; k < 3; k++) { var e = p[k] - z.pts[j][k]; d += e * e; }
        if (d < bd) { bd = d; best = z.code; }
      }
    }
    return best;
  }

  function mk(name, attrs, parent) {
    var e = document.createElementNS(NS, name), k;
    for (k in attrs) { if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]); }
    if (parent) parent.appendChild(e);
    return e;
  }

  function label(parent, x, y, str, size, anchor, fill, rot) {
    var t = mk("text", {
      x: x, y: y,
      "font-family": "Helvetica, Arial, sans-serif",
      "font-size": size,
      "text-anchor": anchor || "middle",
      fill: fill || "#000"
    }, parent);
    t.textContent = str;
    if (rot) t.setAttribute("transform", "rotate(" + rot.deg + " " + x + " " + y + ")");
    return t;
  }

  function render(svg, sample) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var i, j, z, a, b;

    // Zone polygons
    for (i = 0; i < ZONES.length; i++) {
      z = ZONES[i];
      var d = "";
      for (j = 0; j < z.pts.length; j++) {
        var q = toXY(z.pts[j]);
        d += (j === 0 ? "M" : "L") + q.x.toFixed(2) + " " + q.y.toFixed(2);
      }
      d += "Z";
      mk("path", { d: d, fill: z.color, stroke: "#333", "stroke-width": 1 }, svg);
    }

    // Zone code labels at polygon centroids
    for (i = 0; i < ZONES.length; i++) {
      z = ZONES[i];
      var cx = 0, cy = 0, cz = 0;
      for (j = 0; j < z.pts.length; j++) {
        cx += z.pts[j][0]; cy += z.pts[j][1]; cz += z.pts[j][2];
      }
      var c = toXY([cx / z.pts.length, cy / z.pts.length, cz / z.pts.length]);
      label(svg, c.x, c.y + 4, z.code, z.code === "PD" ? 10 : 13, "middle", "#000");
    }

    // Outer triangle
    mk("path", {
      d: "M" + C[0].x + " " + C[0].y +
         "L" + C[1].x + " " + C[1].y +
         "L" + C[2].x + " " + C[2].y + "Z",
      fill: "none", stroke: "#000", "stroke-width": 2
    }, svg);

    // Ticks + numeric labels on the three axes
    var vals = [20, 40, 60, 80];
    for (i = 0; i < vals.length; i++) {
      var v = vals[i], f, p;

      // Bottom axis: %CH4 (100 at left corner, decreasing to the right)
      f = 1 - v / 100;
      p = { x: C[0].x + f * (C[1].x - C[0].x), y: C[0].y + f * (C[1].y - C[0].y) };
      mk("line", { x1: p.x, y1: p.y, x2: p.x, y2: p.y + 7, stroke: "#000", "stroke-width": 1 }, svg);
      label(svg, p.x, p.y + 20, String(v), 10, "middle");

      // Left axis: %C2H2 (0 at bottom-left corner, increasing upward)
      f = v / 100;
      p = { x: C[0].x + f * (C[2].x - C[0].x), y: C[0].y + f * (C[2].y - C[0].y) };
      mk("line", { x1: p.x, y1: p.y, x2: p.x - 7, y2: p.y, stroke: "#000", "stroke-width": 1 }, svg);
      label(svg, p.x - 11, p.y + 3, String(v), 10, "end");

      // Right axis: %C2H4 (0 at bottom-right corner, increasing upward)
      f = v / 100;
      p = { x: C[1].x + f * (C[2].x - C[1].x), y: C[1].y + f * (C[2].y - C[1].y) };
      mk("line", { x1: p.x, y1: p.y, x2: p.x + 7, y2: p.y, stroke: "#000", "stroke-width": 1 }, svg);
      label(svg, p.x + 11, p.y + 3, String(v), 10, "start");
    }

    // Axis captions (with gas names)
    label(svg, 300, 530, "% CH\u2084", 13, "middle");
    label(svg, 169, 273, "% C\u2082H\u2082", 13, "middle", "#000", { deg: -60 });
    label(svg, 431, 273, "% C\u2082H\u2084", 13, "middle", "#000", { deg: 60 });

    // Corner gas names
    label(svg, 62, 460, "CH\u2084", 15, "middle");
    label(svg, 538, 460, "C\u2082H\u2084", 15, "middle");
    label(svg, 300, 84, "C\u2082H\u2082", 15, "middle");

    // Sample marker
    if (sample && typeof sample.ch4 === "number" &&
        (sample.ch4 + sample.c2h4 + sample.c2h2) > 0) {
      var s = toXY(pct(sample.ch4, sample.c2h4, sample.c2h2));
      mk("line", { x1: s.x - 9, y1: s.y, x2: s.x + 9, y2: s.y, stroke: "#000", "stroke-width": 1 }, svg);
      mk("line", { x1: s.x, y1: s.y - 9, x2: s.x, y2: s.y + 9, stroke: "#000", "stroke-width": 1 }, svg);
      mk("circle", { cx: s.x, cy: s.y, r: 5.5, fill: "#d32f2f", stroke: "#fff", "stroke-width": 1.5 }, svg);
      label(svg, s.x + 10, s.y - 8, classify(sample.ch4, sample.c2h4, sample.c2h2), 12, "start", "#d32f2f");
    }
  }

  return { classify: classify, render: render };
})();
