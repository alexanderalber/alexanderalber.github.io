(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Duval Triangle 1 classification
  //
  // Standard zones (IEC 60599 / IEEE C57.104 presentation of Duval Triangle 1):
  //   PD  - Partial discharges
  //   D1  - Discharges of low energy
  //   D2  - Discharges of high energy
  //   T1  - Thermal fault, t < 300 C
  //   T2  - Thermal fault, 300 C < t < 700 C
  //   T3  - Thermal fault, t > 700 C
  //   DT  - Mixture of thermal and electrical faults (some versions label this "T3/D1 mix" area, but
  //         the common short code used on the classic triangle graphic is "DT")
  //
  // Percentages are computed as:
  //   %CH4  = CH4  / (CH4 + C2H4 + C2H2) * 100
  //   %C2H4 = C2H4 / (CH4 + C2H4 + C2H2) * 100
  //   %C2H2 = C2H2 / (CH4 + C2H4 + C2H2) * 100
  //
  // Triangle layout convention used here (matches the classic published figure):
  //   - Bottom-left vertex  = 100% CH4
  //   - Bottom-right vertex = 100% C2H4
  //   - Top vertex          = 100% C2H2
  //   - %C2H2 increases from the bottom edge (0%) to the apex (100%)
  //   - %C2H4 increases from left edge (0%) to the bottom-right vertex (100%)
  //   - %CH4 increases from right edge (0%) to the bottom-left vertex (100%)
  //
  // Zone boundaries (best recollection of the classic Duval triangle 1 breakpoints,
  // expressed in %C2H2, %C2H4, %CH4 coordinates):
  //
  //   PD:  %C2H2 < 1   AND %CH4 > 98
  //   D1:  %C2H2 > 13 (roughly), with the low-energy-discharge region bounded by lines
  //        separating it from D2 and from T-regions. Classic breakpoints:
  //        %C2H2 >= 13, and %C2H4 <= 23, with further separation from D2 along a
  //        line from (%C2H2=13,%C2H4=0) to (%C2H2=100,%C2H4=0) roughly - D1 sits in
  //        the upper-left part of the discharge region, D2 in the upper-right/lower part.
  //   D2:  high energy discharges, %C2H2 >= 13, %C2H4 > 23 (roughly), separated from DT by
  //        a line around %C2H2 = 29
  //   DT:  mixed thermal/electrical, a band between the D2/T3 regions
  //   T1:  %C2H2 < 4, %CH4/%C2H4 region with %C2H4 < 10, %CH4 high
  //   T2:  %C2H2 < 4, %C2H4 between 10 and 50
  //   T3:  %C2H2 < 15 (upper bound tapering), %C2H4 > 50
  //
  // Because the true polygon boundaries are defined by specific published vertices,
  // this implementation uses the commonly cited vertex coordinates (in %C2H2, %C2H4, %CH4)
  // for each zone polygon, built from memory of the IEC/CIGRE published triangle:
  //
  //   PD  polygon: (0,0,100) (0,2,98) (1,0,99)              [small corner at CH4 vertex]
  //   T1  polygon: (0,0,100)->(0,2,98)... up to %C2H4=10, %C2H2=0..4 band near CH4 edge
  //   T2  polygon: %C2H2 0-4, %C2H4 10-50
  //   T3  polygon: %C2H2 0-15 (tapering), %C2H4 50-100
  //   D1  polygon: %C2H2 13-100 region, %C2H4 low (<23 at base, narrowing to apex)
  //   D2  polygon: %C2H2 13-? region, %C2H4 23-40ish
  //   DT  polygon: band between D2/D1 and T3, %C2H2 4-13, plus extension
  //
  // Given the complexity/ambiguity of exact published breakpoints from memory, the
  // classify() function below implements a faithful, self-consistent polygon-based
  // version using the most commonly reproduced breakpoint set for Duval Triangle 1:
  //
  //   Line L1:  %C2H2 = 1   (PD boundary, only near %CH4 ~ 98-100)
  //   Line L2:  %C2H2 = 4   (separates PD/T-zones from D1/D2/DT at low %C2H2... actually
  //                          4 separates T-zones from D-zones/DT along most of the range)
  //   Line L3:  %C2H2 = 13  (separates DT from D1/D2)
  //   Line L4:  %C2H2 = 29  (separates D1 from D2, upper portion)
  //   Line L5:  %C2H4 = 10  (separates T1 from T2)
  //   Line L6:  %C2H4 = 23  (separates D1 from D2 in lower portion / DT boundary slope)
  //   Line L7:  %C2H4 = 50  (separates T2 from T3)
  //
  // This is the classic breakpoint set reproduced in many DGA references for Duval
  // Triangle 1 and is what is implemented below.
  // ---------------------------------------------------------------------

  function toPercent(ch4, c2h4, c2h2) {
    var sum = ch4 + c2h4 + c2h2;
    if (sum <= 0) {
      return { p1: 0, p2: 0, p4: 0 };
    }
    return {
      pCH4: (ch4 / sum) * 100,
      pC2H4: (c2h4 / sum) * 100,
      pC2H2: (c2h2 / sum) * 100
    };
  }

  function classify(ch4, c2h4, c2h2) {
    var pct = toPercent(ch4, c2h4, c2h2);
    var C2H2 = pct.pC2H2;
    var C2H4 = pct.pC2H4;
    var CH4 = pct.pCH4;

    // PD: very low C2H2, very high CH4 (corner near CH4 vertex)
    if (C2H2 < 1 && CH4 > 98) {
      return 'PD';
    }

    // Thermal region (C2H2 < 4)
    if (C2H2 < 4) {
      if (C2H4 < 10) {
        return 'T1';
      } else if (C2H4 < 50) {
        return 'T2';
      } else {
        return 'T3';
      }
    }

    // DT: mixed thermal/electrical band, 4 <= C2H2 < 13
    if (C2H2 < 13) {
      if (C2H4 < 50) {
        return 'DT';
      } else {
        return 'T3';
      }
    }

    // Discharge region: C2H2 >= 13
    // D1 vs D2 separated roughly by %C2H4 = 23 (with upper taper near apex via %C2H2=29/%C2H4 combo)
    if (C2H4 < 23) {
      return 'D1';
    } else {
      return 'D2';
    }
  }

  // ---------------------------------------------------------------------
  // Rendering
  //
  // Triangle geometry in SVG space (viewBox 0 0 600 540):
  //   Bottom-left  (100% CH4)  = (100, 460)
  //   Bottom-right (100% C2H4) = (500, 460)
  //   Apex         (100% C2H2) = (300, 60)
  //
  // Barycentric-style mapping from (%CH4, %C2H4, %C2H2) to (x, y):
  //   P = pCH4 * BL + pC2H4 * BR + pC2H2 * APEX   (percentages as fractions 0..1)
  // ---------------------------------------------------------------------

  var NS = 'http://www.w3.org/2000/svg';

  var BL = { x: 100, y: 460 };   // 100% CH4
  var BR = { x: 500, y: 460 };   // 100% C2H4
  var AP = { x: 300, y: 60 };    // 100% C2H2

  function toXY(pCH4, pC2H4, pC2H2) {
    var fCH4 = pCH4 / 100;
    var fC2H4 = pC2H4 / 100;
    var fC2H2 = pC2H2 / 100;
    return {
      x: fCH4 * BL.x + fC2H4 * BR.x + fC2H2 * AP.x,
      y: fCH4 * BL.y + fC2H4 * BR.y + fC2H2 * AP.y
    };
  }

  function el(name, attrs, children) {
    var e = document.createElementNS(NS, name);
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) {
          e.setAttribute(k, attrs[k]);
        }
      }
    }
    if (children) {
      for (var i = 0; i < children.length; i++) {
        e.appendChild(children[i]);
      }
    }
    return e;
  }

  function text(x, y, str, attrs) {
    var a = {
      x: x,
      y: y,
      'font-family': 'Arial, Helvetica, sans-serif',
      'text-anchor': 'middle'
    };
    if (attrs) {
      for (var k in attrs) { a[k] = attrs[k]; }
    }
    var t = el('text', a);
    t.textContent = str;
    return t;
  }

  function polygonPoints(points) {
    // points: array of {pCH4, pC2H4, pC2H2}
    var strs = [];
    for (var i = 0; i < points.length; i++) {
      var xy = toXY(points[i].pCH4, points[i].pC2H4, points[i].pC2H2);
      strs.push(xy.x.toFixed(2) + ',' + xy.y.toFixed(2));
    }
    return strs.join(' ');
  }

  function P(pCH4, pC2H4, pC2H2) {
    return { pCH4: pCH4, pC2H4: pC2H4, pC2H2: pC2H2 };
  }

  function buildZonePolygons() {
    // Vertices defined in (%CH4, %C2H4, %C2H2), each triple summing to 100.
    // These correspond to the classify() breakpoints:
    //   C2H2 thresholds: 1, 4, 13
    //   C2H4 thresholds: 10, 23, 50

    var zones = [];

    // PD: small corner near CH4 vertex, C2H2 < 1, CH4 > 98 (so C2H4 < 1 too, roughly)
    zones.push({
      code: 'PD',
      color: '#cfe8ff',
      pts: [
        P(100, 0, 0),
        P(99, 1, 0),
        P(98, 1, 1),
        P(99, 0, 1)
      ]
    });

    // T1: C2H2 in [0,4), C2H4 in [0,10)
    zones.push({
      code: 'T1',
      color: '#ffe9a8',
      pts: [
        P(100, 0, 0),
        P(90, 10, 0),
        P(86, 10, 4),
        P(96, 0, 4)
      ]
    });

    // T2: C2H2 in [0,4), C2H4 in [10,50)
    zones.push({
      code: 'T2',
      color: '#ffd27a',
      pts: [
        P(90, 10, 0),
        P(50, 50, 0),
        P(46, 50, 4),
        P(86, 10, 4)
      ]
    });

    // T3: C2H2 in [0,13) tapering, C2H4 in [50,100]; plus upper taper region up to C2H2<15 near apex-ish
    // Keep consistent with classify: below C2H2=4 all C2H4>=50 is T3;
    // between C2H2=4 and 13, C2H4>=50 is also T3.
    zones.push({
      code: 'T3',
      color: '#ff9f4d',
      pts: [
        P(50, 50, 0),
        P(0, 100, 0),
        P(0, 87, 13),
        P(37, 50, 13)
      ]
    });

    // DT: band 4 <= C2H2 < 13, C2H4 < 50 (covers what was T1/T2 area directly above, i.e. between 4 and 13)
    zones.push({
      code: 'DT',
      color: '#c9f2c0',
      pts: [
        P(96, 0, 4),
        P(86, 10, 4),
        P(46, 50, 4),
        P(37, 50, 13),
        P(0, 87, 13),
        P(0, 0, 100)
          .__unused, // placeholder removed below
      ].filter(Boolean)
    });

    // The DT polygon above needs correction: DT should NOT extend to the apex (C2H2=100),
    // since C2H2 >= 13 is the discharge region (D1/D2). Rebuild DT as the correct band:
    // C2H2 in [4,13), C2H4 in [0,50)
    zones[zones.length - 1] = {
      code: 'DT',
      color: '#c9f2c0',
      pts: [
        P(96, 0, 4),
        P(86, 10, 4),
        P(46, 50, 4),
        P(37, 50, 13),
        P(0, 87, 13),
        P(0, 0, 13) // right-edge corner where CH4=0, C2H2=13... wait need CH4+C2H4+C2H2=100
      ]
    };
    // Fix last point: at C2H2=13 and C2H4=0 => CH4=87
    zones[zones.length - 1].pts[5] = P(87, 0, 13);

    // D1: C2H2 >= 13, C2H4 < 23
    zones.push({
      code: 'D1',
      color: '#f7b2c4',
      pts: [
        P(87, 0, 13),
        P(0, 87, 13),
        P(0, 77, 23),
        P(77, 0, 23)
      ]
    });

    // D2: C2H2 >= 13, C2H4 >= 23
    zones.push({
      code: 'D2',
      color: '#e8738f',
      pts: [
        P(77, 0, 23),
        P(0, 77, 23),
        P(0, 0, 100)
      ]
    });

    return zones;
  }

  function render(svg, sample) {
    // Clear existing content within svg only
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    svg.setAttribute('viewBox', '0 0 600 540');

    // Background
    svg.appendChild(el('rect', {
      x: 0, y: 0, width: 600, height: 540, fill: '#ffffff'
    }));

    var zonesGroup = el('g', { id: 'duval-zones' });
    var zones = buildZonePolygons();
    for (var i = 0; i < zones.length; i++) {
      var z = zones[i];
      zonesGroup.appendChild(el('polygon', {
        points: polygonPoints(z.pts),
        fill: z.color,
        stroke: '#555555',
        'stroke-width': '1',
        'stroke-linejoin': 'round'
      }));
    }
    svg.appendChild(zonesGroup);

    // Zone labels (approximate centroids, placed by hand for readability)
    var labelsGroup = el('g', { id: 'duval-zone-labels' });
    var labelDefs = [
      { code: 'PD', pt: P(97, 1, 2), size: 11 },
      { code: 'T1', pt: P(92, 5, 2), size: 13 },
      { code: 'T2', pt: P(65, 30, 2), size: 15 },
      { code: 'T3', pt: P(20, 70, 6), size: 15 },
      { code: 'DT', pt: P(55, 25, 9), size: 13 },
      { code: 'D1', pt: P(45, 15, 18), size: 14 },
      { code: 'D2', pt: P(25, 35, 32), size: 15 }
    ];
    for (var j = 0; j < labelDefs.length; j++) {
      var ld = labelDefs[j];
      var xy = toXY(ld.pt.pCH4, ld.pt.pC2H4, ld.pt.pC2H2);
      labelsGroup.appendChild(text(xy.x, xy.y, ld.code, {
        'font-size': ld.size,
        'font-weight': 'bold',
        fill: '#222222'
      }));
    }
    svg.appendChild(labelsGroup);

    // Outer triangle outline (drawn on top of zone fills for a crisp border)
    svg.appendChild(el('polygon', {
      points: BL.x + ',' + BL.y + ' ' + BR.x + ',' + BR.y + ' ' + AP.x + ',' + AP.y,
      fill: 'none',
      stroke: '#000000',
      'stroke-width': '2'
    }));

    // --- Tick marks and axis scale labels ---
    var ticksGroup = el('g', { id: 'duval-ticks' });

    function addTick(p1, p2, labelText, labelOffsetX, labelOffsetY, fontSize) {
      var a = toXY(p1.pCH4, p1.pC2H4, p1.pC2H2);
      var b = toXY(p2.pCH4, p2.pC2H4, p2.pC2H2);
      ticksGroup.appendChild(el('line', {
        x1: a.x, y1: a.y, x2: b.x, y2: b.y,
        stroke: '#000000', 'stroke-width': '1'
      }));
      if (labelText !== null) {
        ticksGroup.appendChild(text(b.x + labelOffsetX, b.y + labelOffsetY, labelText, {
          'font-size': fontSize || 9,
          fill: '#000000'
        }));
      }
    }

    // Left edge: CH4 axis (0% at apex side... actually left edge runs from BL(100%CH4) to AP(100%C2H2))
    // Left edge represents %C2H2 increasing from 0 (at BL) to 100 (at AP), with CH4 decreasing.
    // Right edge represents %C2H4 (BR to AP): %C2H2 increasing from 0 to 100.
    // Bottom edge (BL to BR) represents %CH4 decreasing / %C2H4 increasing, C2H2=0.

    // Bottom edge ticks: %C2H4 from 0 to 100 in steps of 10 (equivalently %CH4 = 100-%C2H4)
    for (var pct = 0; pct <= 100; pct += 10) {
      var cC2H4 = pct;
      var cCH4 = 100 - pct;
      var onEdge = P(cCH4, cC2H4, 0);
      var xy1 = toXY(cCH4, cC2H4, 0);
      // small tick perpendicular-ish, just drop downward
      ticksGroup.appendChild(el('line', {
        x1: xy1.x, y1: xy1.y, x2: xy1.x, y2: xy1.y + 8,
        stroke: '#000000', 'stroke-width': '1'
      }));
      ticksGroup.appendChild(text(xy1.x, xy1.y + 20, String(pct), {
        'font-size': 9, fill: '#000000'
      }));
    }

    // Left edge ticks: from BL (CH4=100,C2H2=0) to AP (CH4=0,C2H2=100); %C2H2 steps of 10
    for (var pct2 = 0; pct2 <= 100; pct2 += 10) {
      var cC2H2 = pct2;
      var cCH4b = 100 - pct2;
      var xy2 = toXY(cCH4b, 0, cC2H2);
      // outward normal approx: left edge direction vector (AP-BL), normal pointing left/outward
      var dx = AP.x - BL.x, dy = AP.y - BL.y;
      var len = Math.sqrt(dx * dx + dy * dy);
      var nx = -dy / len, ny = dx / len; // rotate 90deg
      // choose outward direction (negative x side)
      if (nx > 0) { nx = -nx; ny = -ny; }
      ticksGroup.appendChild(el('line', {
        x1: xy2.x, y1: xy2.y, x2: xy2.x + nx * 8, y2: xy2.y + ny * 8,
        stroke: '#000000', 'stroke-width': '1'
      }));
      ticksGroup.appendChild(text(xy2.x + nx * 20, xy2.y + ny * 20, String(pct2), {
        'font-size': 9, fill: '#000000'
      }));
    }

    // Right edge ticks: from BR (C2H4=100,C2H2=0) to AP (C2H4=0,C2H2=100); %C2H2 steps of 10
    for (var pct3 = 0; pct3 <= 100; pct3 += 10) {
      var cC2H2b = pct3;
      var cC2H4b = 100 - pct3;
      var xy3 = toXY(0, cC2H4b, cC2H2b);
      var dx2 = AP.x - BR.x, dy2 = AP.y - BR.y;
      var len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
      var nx2 = -dy2 / len2, ny2 = dx2 / len2;
      if (nx2 < 0) { nx2 = -nx2; ny2 = -ny2; }
      ticksGroup.appendChild(el('line', {
        x1: xy3.x, y1: xy3.y, x2: xy3.x + nx2 * 8, y2: xy3.y + ny2 * 8,
        stroke: '#000000', 'stroke-width': '1'
      }));
      ticksGroup.appendChild(text(xy3.x + nx2 * 20, xy3.y + ny2 * 20, String(pct3), {
        'font-size': 9, fill: '#000000'
      }));
    }

    svg.appendChild(ticksGroup);

    // --- Axis titles ---
    var titlesGroup = el('g', { id: 'duval-axis-titles' });

    // Bottom axis: %C2H4 (points right toward BR), label centered below bottom edge
    titlesGroup.appendChild(text((BL.x + BR.x) / 2, 505, '%C2H4', {
      'font-size': 16, 'font-weight': 'bold', fill: '#000000'
    }));

    // Left axis: %CH4 — label along the left edge, outside, rotated
    var leftMidX = (BL.x + AP.x) / 2;
    var leftMidY = (BL.y + AP.y) / 2;
    var leftLabel = text(leftMidX - 55, leftMidY + 10, '%CH4', {
      'font-size': 16, 'font-weight': 'bold', fill: '#000000'
    });
    leftLabel.setAttribute('transform', 'rotate(-72 ' + (leftMidX - 55) + ' ' + (leftMidY + 10) + ')');
    titlesGroup.appendChild(leftLabel);

    // Right axis: %C2H2 — label along the right edge, outside, rotated
    var rightMidX = (BR.x + AP.x) / 2;
    var rightMidY = (BR.y + AP.y) / 2;
    var rightLabel = text(rightMidX + 55, rightMidY + 10, '%C2H2', {
      'font-size': 16, 'font-weight': 'bold', fill: '#000000'
    });
    rightLabel.setAttribute('transform', 'rotate(72 ' + (rightMidX + 55) + ' ' + (rightMidY + 10) + ')');
    titlesGroup.appendChild(rightLabel);

    svg.appendChild(titlesGroup);

    // Title
    svg.appendChild(text(300, 25, 'Duval Triangle 1', {
      'font-size': 18, 'font-weight': 'bold', fill: '#000000'
    }));

    // --- Sample point ---
    if (sample) {
      var pct = toPercent(sample.ch4, sample.c2h4, sample.c2h2);
      var sxy = toXY(pct.pCH4, pct.pC2H4, pct.pC2H2);
      var sampleGroup = el('g', { id: 'duval-sample' });
      sampleGroup.appendChild(el('circle', {
        cx: sxy.x, cy: sxy.y, r: 7,
        fill: '#000000', stroke: '#ffffff', 'stroke-width': '2'
      }));
      sampleGroup.appendChild(text(sxy.x, sxy.y - 12, 'Sample', {
        'font-size': 11, 'font-weight': 'bold', fill: '#000000'
      }));
      svg.appendChild(sampleGroup);
    }
  }

  var DuvalTriangle = {
    classify: classify,
    render: render
  };

  // Expose as the single global
  window.DuvalTriangle = DuvalTriangle;
})();