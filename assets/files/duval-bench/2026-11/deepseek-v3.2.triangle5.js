const DuvalTriangle5 = (function () {
  var SVG_NS = "http://www.w3.org/2000/svg";

  // Best-recollection low-temperature Duval Triangle 5 zone boundaries.
  // The zones are separated by the ethylene/ethane proportion:
  //   C2H4 / (C2H4 + C2H6) <= 0.25  -> T1
  //   <= 0.75                         -> T2
  //   otherwise                       -> T3
  // If no C2H4 and no C2H6 are present, the sample is assigned to T1.
  var T1_T2 = 0.25;
  var T2_T3 = 0.75;

  var P_CH4 = [100, 0, 0];
  var P_C2H4 = [0, 100, 0];
  var P_C2H6 = [0, 0, 100];

  var P_B12 = [0, T1_T2 * 100, (1 - T1_T2) * 100];
  var P_B23 = [0, T2_T3 * 100, (1 - T2_T3) * 100];

  var SVG_TOP = { x: 300, y: 60 };   // CH4
  var SVG_RIGHT = { x: 520, y: 450 }; // C2H4
  var SVG_LEFT = { x: 80, y: 450 };   // C2H6
  var CENTROID = { x: (SVG_TOP.x + SVG_RIGHT.x + SVG_LEFT.x) / 3, y: (SVG_TOP.y + SVG_RIGHT.y + SVG_LEFT.y) / 3 };

  function safeNonNegative(value) {
    var n = Number(value);
    return isFinite(n) && n > 0 ? n : 0;
  }

  function toPercentages(ch4, c2h4, c2h6) {
    var a = safeNonNegative(ch4);
    var b = safeNonNegative(c2h4);
    var c = safeNonNegative(c2h6);
    var sum = a + b + c;

    if (sum <= 0) {
      return [33.333333, 33.333333, 33.333333];
    }

    return [100 * a / sum, 100 * b / sum, 100 * c / sum];
  }

  function percentToXY(percent) {
    var pCh4 = percent[0];
    var pC2H4 = percent[1];
    var pC2H6 = percent[2];

    return {
      x: (pCh4 * SVG_TOP.x + pC2H4 * SVG_RIGHT.x + pC2H6 * SVG_LEFT.x) / 100,
      y: (pCh4 * SVG_TOP.y + pC2H4 * SVG_RIGHT.y + pC2H6 * SVG_LEFT.y) / 100
    };
  }

  function r2(n) {
    return Math.round(n * 100) / 100;
  }

  function polygonPointsString(percentPoly) {
    var parts = [];
    for (var i = 0; i < percentPoly.length; i++) {
      var xy = percentToXY(percentPoly[i]);
      parts.push(r2(xy.x) + "," + r2(xy.y));
    }
    return parts.join(" ");
  }

  function makeElement(parent, tagName, attrs) {
    var el = document.createElementNS(SVG_NS, tagName);

    if (attrs) {
      for (var key in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, key)) {
          el.setAttribute(key, attrs[key]);
        }
      }
    }

    parent.appendChild(el);
    return el;
  }

  function makeText(parent, attrs, str) {
    var el = makeElement(parent, "text", attrs);
    el.textContent = str;
    return el;
  }

  function classify(ch4, c2h4, c2h6) {
    var a = safeNonNegative(ch4);
    var b = safeNonNegative(c2h4);
    var c = safeNonNegative(c2h6);

    if (a + b + c <= 0) {
      return "T1";
    }

    var hydrocarbonHeatPortion = b + c;
    if (hydrocarbonHeatPortion <= 0) {
      return "T1";
    }

    var ratio = b / hydrocarbonHeatPortion;

    if (ratio <= T1_T2) return "T1";
    if (ratio <= T2_T3) return "T2";
    return "T3";
  }

  var zones = [
    {
      code: "T1",
      fill: "#dbeafe",
      percentPoly: [P_CH4, P_B12, P_C2H6],
      labelPercent: [33.333333, 8.333333, 58.333333]
    },
    {
      code: "T2",
      fill: "#fef9c3",
      percentPoly: [P_CH4, P_B23, P_B12],
      labelPercent: [33.333333, 50, 16.666667]
    },
    {
      code: "T3",
      fill: "#fee2e2",
      percentPoly: [P_CH4, P_C2H4, P_B23],
      labelPercent: [33.333333, 58.333333, 8.333333]
    }
  ];

  function addSideTicks(parent, aPercent, bPercent) {
    var a = percentToXY(aPercent);
    var b = percentToXY(bPercent);

    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;

    var nx = -dy / len;
    var ny = dx / len;

    // Make the normal point outward from the triangle centroid.
    var mx = (a.x + b.x) / 2;
    var my = (a.y + b.y) / 2;
    var vx = mx - CENTROID.x;
    var vy = my - CENTROID.y;

    if (nx * vx + ny * vy < 0) {
      nx = -nx;
      ny = -ny;
    }

    for (var f = 0.2; f <= 0.8001; f += 0.2) {
      var px = a.x + dx * f;
      var py = a.y + dy * f;
      var half = 7;

      makeElement(parent, "line", {
        x1: r2(px - half * nx),
        y1: r2(py - half * ny),
        x2: r2(px + half * nx),
        y2: r2(py + half * ny),
        stroke: "#111",
        "stroke-width": 1
      });
    }
  }

  function drawAxis(parent, gasName, vertexPercent, oppositeMidPercent, labelX, labelY, anchor) {
    var start = percentToXY(vertexPercent);
    var end = percentToXY(oppositeMidPercent);

    makeElement(parent, "line", {
      x1: r2(start.x),
      y1: r2(start.y),
      x2: r2(end.x),
      y2: r2(end.y),
      stroke: "#444",
      "stroke-width": 1.25,
      "stroke-dasharray": "5 4"
    });

    var dx = end.x - start.x;
    var dy = end.y - start.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;

    var nx = -dy / len;
    var ny = dx / len;

    for (var v = 0; v <= 100; v += 20) {
      var f = v / 100;
      var px = start.x + dx * f;
      var py = start.y + dy * f;
      var half = (v === 0 || v === 100) ? 8 : 5;

      makeElement(parent, "line", {
        x1: r2(px - half * nx),
        y1: r2(py - half * ny),
        x2: r2(px + half * nx),
        y2: r2(py + half * ny),
        stroke: "#222",
        "stroke-width": (v === 0 || v === 100) ? 1.6 : 1
      });
    }

    makeText(parent, {
      x: labelX,
      y: labelY,
      "font-size": 18,
      "font-weight": "bold",
      "text-anchor": anchor,
      fill: "#000"
    }, gasName);
  }

  function render(svg, sample) {
    if (!svg) return;

    var gZones = makeElement(svg, "g", {});
    var gFrame = makeElement(svg, "g", {});
    var gTicks = makeElement(svg, "g", {});
    var gAxes = makeElement(svg, "g", {});
    var gSample = makeElement(svg, "g", {});

    // Zones.
    for (var i = 0; i < zones.length; i++) {
      var zone = zones[i];

      makeElement(gZones, "polygon", {
        points: polygonPointsString(zone.percentPoly),
        fill: zone.fill,
        "fill-opacity": 0.88,
        stroke: "#555",
        "stroke-width": 1,
        "stroke-linejoin": "round"
      });

      var labelXY = percentToXY(zone.labelPercent);

      makeText(gZones, {
        x: r2(labelXY.x),
        y: r2(labelXY.y),
        "font-size": 20,
        "font-weight": "bold",
        "text-anchor": "middle",
        fill: "#111"
      }, zone.code);
    }

    // Outer triangle frame.
    makeElement(gFrame, "polygon", {
      points: polygonPointsString([P_CH4, P_C2H4, P_C2H6]),
      fill: "none",
      stroke: "#000",
      "stroke-width": 2,
      "stroke-linejoin": "round"
    });

    // Tick marks on the three axes / sides.
    addSideTicks(gTicks, P_C2H6, P_C2H4); // bottom side
    addSideTicks(gTicks, P_C2H6, P_CH4);  // left side
    addSideTicks(gTicks, P_CH4, P_C2H4);  // right side

    // Median axes showing each gas percentage from its vertex to the opposite side.
    drawAxis(gAxes, "CH4", P_CH4, [0, 50, 50], 300, 38, "middle");
    drawAxis(gAxes, "C2H6", P_C2H6, [50, 50, 0], 80, 488, "middle");
    drawAxis(gAxes, "C2H4", P_C2H4, [50, 0, 50], 520, 488, "middle");

    // Optional sample point.
    if (sample && typeof sample === "object") {
      var p = toPercentages(sample.ch4, sample.c2h4, sample.c2h6);
      var point = percentToXY(p);

      // Halo.
      makeElement(gSample, "circle", {
        cx: r2(point.x),
        cy: r2(point.y),
        r: 9,
        fill: "#ffffff",
        stroke: "none"
      });

      // Marker.
      makeElement(gSample, "circle", {
        cx: r2(point.x),
        cy: r2(point.y),
        r: 5,
        fill: "#dc2626",
        stroke: "#000",
        "stroke-width": 1.6
      });

      var code = classify(sample.ch4, sample.c2h4, sample.c2h6);

      var labelX = point.x + 13;
      var labelY = point.y - 11;
      var labelAnchor = "start";

      if (labelX > 555) {
        labelX = point.x - 13;
        labelAnchor = "end";
      }

      if (labelY < 28) {
        labelY = point.y + 28;
      }

      makeText(gSample, {
        x: r2(labelX),
        y: r2(labelY),
        "font-size": 16,
        "font-weight": "bold",
        "text-anchor": labelAnchor,
        fill: "#000"
      }, code);
    }
  }

  return {
    classify: classify,
    render: render
  };
})();
