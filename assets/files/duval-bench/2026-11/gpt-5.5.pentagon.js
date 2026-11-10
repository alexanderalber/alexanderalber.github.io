const DuvalPentagon = (function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var CX = 300, CY = 300, R = 250;

  function rad(d) {
    return d * Math.PI / 180;
  }

  function v(angleDeg) {
    var a = rad(angleDeg);
    return [Math.cos(a), Math.sin(a)];
  }

  /*
    Duval Pentagon 1 construction used here:
      H2 at the top, then clockwise:
      C2H6, CH4, C2H4, C2H2.

    Coordinates are the regular-pentagon gas vertices; a sample is the
    concentration-weighted centroid of the five gas vertices.
  */
  var gasVertices = [
    { name: "H2",    key: "h2",    p: v(90) },
    { name: "C2H6",  key: "c2h6",  p: v(18) },
    { name: "CH4",   key: "ch4",   p: v(-54) },
    { name: "C2H4",  key: "c2h4",  p: v(-126) },
    { name: "C2H2",  key: "c2h2",  p: v(162) }
  ];

  function lerp(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }

  var H2 = gasVertices[0].p;
  var C2H6 = gasVertices[1].p;
  var CH4 = gasVertices[2].p;
  var C2H4 = gasVertices[3].p;
  var C2H2 = gasVertices[4].p;

  var hub = [0.0, 0.12];

  var bD1PD = lerp(C2H2, H2, 0.50);
  var bPDS  = lerp(H2, C2H6, 0.42);
  var bST1  = lerp(C2H6, CH4, 0.56);
  var bT1T2 = lerp(CH4, C2H4, 0.36);
  var bT2T3 = lerp(CH4, C2H4, 0.58);
  var bT3D2 = lerp(C2H4, C2H2, 0.44);
  var bD2D1 = lerp(C2H4, C2H2, 0.74);

  var zones = [
    {
      code: "PD",
      fill: "#fff1a8",
      label: [0.00, 0.66],
      poly: [hub, bD1PD, H2, bPDS]
    },
    {
      code: "S",
      fill: "#c9e8ff",
      label: [0.48, 0.24],
      poly: [hub, bPDS, C2H6, bST1]
    },
    {
      code: "T1",
      fill: "#c7f2c4",
      label: [0.50, -0.38],
      poly: [hub, bST1, CH4, bT1T2]
    },
    {
      code: "T2",
      fill: "#f8d7a4",
      label: [0.02, -0.42],
      poly: [hub, bT1T2, bT2T3]
    },
    {
      code: "T3",
      fill: "#f5a3a3",
      label: [-0.46, -0.46],
      poly: [hub, bT2T3, C2H4, bT3D2]
    },
    {
      code: "D2",
      fill: "#d7b6ff",
      label: [-0.56, -0.13],
      poly: [hub, bT3D2, bD2D1]
    },
    {
      code: "D1",
      fill: "#ffbfd7",
      label: [-0.57, 0.38],
      poly: [hub, bD2D1, C2H2, bD1PD]
    }
  ];

  var classifyOrder = ["T2", "PD", "D1", "D2", "T3", "T1", "S"];

  function zoneByCode(code) {
    for (var i = 0; i < zones.length; i++) {
      if (zones[i].code === code) return zones[i];
    }
    return null;
  }

  function sx(p) {
    return CX + p[0] * R;
  }

  function sy(p) {
    return CY - p[1] * R;
  }

  function pointsAttr(poly) {
    var s = [];
    for (var i = 0; i < poly.length; i++) {
      s.push(sx(poly[i]).toFixed(2) + "," + sy(poly[i]).toFixed(2));
    }
    return s.join(" ");
  }

  function el(name, attrs) {
    var e = document.createElementNS(NS, name);
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) {
          e.setAttribute(k, attrs[k]);
        }
      }
    }
    return e;
  }

  function text(x, y, value, attrs) {
    var t = el("text", attrs || {});
    t.setAttribute("x", x);
    t.setAttribute("y", y);
    t.textContent = value;
    return t;
  }

  function validNumber(n) {
    return typeof n === "number" && isFinite(n) && n >= 0;
  }

  function pointFromGases(h2, ch4, c2h6, c2h4, c2h2) {
    if (!validNumber(h2) || !validNumber(ch4) || !validNumber(c2h6) ||
        !validNumber(c2h4) || !validNumber(c2h2)) {
      throw new RangeError("Gas concentrations must be finite non-negative numbers.");
    }

    var total = h2 + ch4 + c2h6 + c2h4 + c2h2;
    if (!(total > 0)) {
      throw new RangeError("At least one gas concentration must be greater than zero.");
    }

    var vals = [h2, c2h6, ch4, c2h4, c2h2];
    var x = 0, y = 0;
    for (var i = 0; i < 5; i++) {
      x += gasVertices[i].p[0] * vals[i] / total;
      y += gasVertices[i].p[1] * vals[i] / total;
    }
    return [x, y];
  }

  function onSegment(p, a, b) {
    var cross = (p[1] - a[1]) * (b[0] - a[0]) - (p[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(cross) > 1e-10) return false;

    var dot = (p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1]);
    if (dot < -1e-10) return false;

    var len2 = (b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]);
    return dot <= len2 + 1e-10;
  }

  function pointInPolygon(p, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var a = poly[i], b = poly[j];

      if (onSegment(p, a, b)) return true;

      var intersect = ((a[1] > p[1]) !== (b[1] > p[1])) &&
        (p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]);

      if (intersect) inside = !inside;
    }
    return inside;
  }

  function classifyPoint(p) {
    for (var k = 0; k < classifyOrder.length; k++) {
      var z = zoneByCode(classifyOrder[k]);
      if (z && pointInPolygon(p, z.poly)) return z.code;
    }

    var best = zones[0], bestD = Infinity;
    for (var i = 0; i < zones.length; i++) {
      var lp = zones[i].label;
      var dx = p[0] - lp[0], dy = p[1] - lp[1];
      var d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = zones[i];
      }
    }
    return best.code;
  }

  return {
    classify: function (h2, ch4, c2h6, c2h4, c2h2) {
      return classifyPoint(pointFromGases(h2, ch4, c2h6, c2h4, c2h2));
    },

    render: function (svg, sample) {
      while (svg.firstChild) {
        svg.removeChild(svg.firstChild);
      }

      var bg = el("rect", {
        x: "0",
        y: "0",
        width: "600",
        height: "600",
        fill: "white"
      });
      svg.appendChild(bg);

      for (var i = 0; i < zones.length; i++) {
        svg.appendChild(el("polygon", {
          points: pointsAttr(zones[i].poly),
          fill: zones[i].fill,
          stroke: "white",
          "stroke-width": "2"
        }));
      }

      svg.appendChild(el("polygon", {
        points: pointsAttr([H2, C2H6, CH4, C2H4, C2H2]),
        fill: "none",
        stroke: "#222",
        "stroke-width": "3",
        "stroke-linejoin": "round"
      }));

      for (var a = 0; a < gasVertices.length; a++) {
        var gp = gasVertices[a].p;
        svg.appendChild(el("line", {
          x1: CX,
          y1: CY,
          x2: sx(gp),
          y2: sy(gp),
          stroke: "#555",
          "stroke-width": "1",
          "stroke-dasharray": "4 5"
        }));
      }

      for (var b = 0; b < zones.length; b++) {
        var zp = zones[b].label;
        svg.appendChild(text(sx(zp), sy(zp) + 6, zones[b].code, {
          "font-family": "Arial, Helvetica, sans-serif",
          "font-size": "24",
          "font-weight": "700",
          "text-anchor": "middle",
          fill: "#222"
        }));
      }

      for (var g = 0; g < gasVertices.length; g++) {
        var p = gasVertices[g].p;
        var lx = CX + p[0] * 285;
        var ly = CY - p[1] * 285;
        svg.appendChild(text(lx, ly + 5, gasVertices[g].name, {
          "font-family": "Arial, Helvetica, sans-serif",
          "font-size": "18",
          "font-weight": "700",
          "text-anchor": "middle",
          fill: "#111"
        }));
      }

      if (sample !== null && sample !== undefined) {
        var sp = pointFromGases(
          sample.h2,
          sample.ch4,
          sample.c2h6,
          sample.c2h4,
          sample.c2h2
        );

        var code = classifyPoint(sp);
        var px = sx(sp), py = sy(sp);

        svg.appendChild(el("circle", {
          cx: px,
          cy: py,
          r: "8",
          fill: "#000",
          stroke: "white",
          "stroke-width": "3"
        }));

        svg.appendChild(el("line", {
          x1: px - 13,
          y1: py,
          x2: px + 13,
          y2: py,
          stroke: "#000",
          "stroke-width": "2"
        }));

        svg.appendChild(el("line", {
          x1: px,
          y1: py - 13,
          x2: px,
          y2: py + 13,
          stroke: "#000",
          "stroke-width": "2"
        }));

        svg.appendChild(text(px + 14, py - 14, code, {
          "font-family": "Arial, Helvetica, sans-serif",
          "font-size": "16",
          "font-weight": "700",
          fill: "#000"
        }));
      }
    }
  };
}());
