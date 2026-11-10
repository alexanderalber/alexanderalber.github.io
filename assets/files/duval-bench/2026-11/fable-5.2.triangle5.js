// Duval Triangle 5 (low-temperature faults, mineral oil): CH4, C2H4, C2H6.
// Zones: PD, O, S, T2, T3, C, ND. Written from memory.
const DuvalTriangle5 = (function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  // Triangle corners in the 600 x 540 viewBox.
  var TOP = { x: 300, y: 45 };     // 100 % CH4
  var RIGHT = { x: 540, y: 460.7 }; // 100 % C2H4
  var LEFT = { x: 60, y: 460.7 };   // 100 % C2H6

  // Zone polygons as [CH4 %, C2H4 %, C2H6 %].
  var ZONES = [
    { code: 'O', fill: '#f6d98a', label: [80, 5, 15],
      pts: [[100, 0, 0], [98, 0, 2], [97, 1, 2], [85, 1, 14], [86, 0, 14], [46, 0, 54], [36, 10, 54], [90, 10, 0]] },
    { code: 'PD', fill: '#9fd3f0', label: null,
      pts: [[98, 0, 2], [97, 1, 2], [85, 1, 14], [86, 0, 14]] },
    { code: 'S', fill: '#c9b6e4', label: [20, 5, 75],
      pts: [[46, 0, 54], [0, 0, 100], [0, 10, 90], [36, 10, 54]] },
    { code: 'T2', fill: '#f4a460', label: [72, 22, 6],
      pts: [[90, 10, 0], [65, 35, 0], [53, 35, 12], [78, 10, 12]] },
    { code: 'C', fill: '#b9a07e', label: [45, 34, 21],
      pts: [[78, 10, 12], [53, 35, 12], [51, 35, 14], [16, 70, 14], [0, 70, 30], [60, 10, 30]] },
    { code: 'ND', fill: '#d9d9d9', label: [28, 22, 50],
      pts: [[60, 10, 30], [35, 35, 30], [0, 35, 65], [0, 10, 90]] },
    { code: 'T3', fill: '#e8736a', label: [22, 72, 6],
      pts: [[65, 35, 0], [0, 100, 0], [0, 70, 30], [16, 70, 14], [51, 35, 14]] },
    { code: 'T3', fill: '#e8736a', label: [12, 47, 41],
      pts: [[35, 35, 30], [0, 70, 30], [0, 35, 65]] }
  ];

  function toXY(ch4, c2h4, c2h6) {
    var s = ch4 + c2h4 + c2h6;
    return {
      x: (ch4 * TOP.x + c2h4 * RIGHT.x + c2h6 * LEFT.x) / s,
      y: (ch4 * TOP.y + c2h4 * RIGHT.y + c2h6 * LEFT.y) / s
    };
  }

  function classify(ch4, c2h4, c2h6) {
    var s = ch4 + c2h4 + c2h6;
    var e = 100 * c2h4 / s; // % C2H4
    var a = 100 * c2h6 / s; // % C2H6

    if (e < 10) {
      if (a >= 54) return 'S';
      if (e < 1 && a >= 2 && a < 14) return 'PD';
      return 'O';
    }
    if (e < 35) {
      if (a < 12) return 'T2';
      if (a < 30) return 'C';
      return 'ND';
    }
    if (e < 70) {
      if (a >= 14 && a < 30) return 'C';
      return 'T3';
    }
    return 'T3';
  }

  function el(svg, name, attrs, text) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
    }
    if (text !== undefined) n.textContent = text;
    svg.appendChild(n);
    return n;
  }

  function f(v) { return Math.round(v * 100) / 100; }

  function render(svg, sample) {
    var i, j, p, q;
    var FONT = 'Arial, Helvetica, sans-serif';

    // Zones.
    for (i = 0; i < ZONES.length; i++) {
      var z = ZONES[i];
      var str = [];
      for (j = 0; j < z.pts.length; j++) {
        p = toXY(z.pts[j][0], z.pts[j][1], z.pts[j][2]);
        str.push(f(p.x) + ',' + f(p.y));
      }
      el(svg, 'polygon', {
        points: str.join(' '), fill: z.fill, stroke: '#333', 'stroke-width': 1, 'stroke-linejoin': 'round'
      });
    }

    // Triangle outline.
    el(svg, 'polygon', {
      points: TOP.x + ',' + TOP.y + ' ' + RIGHT.x + ',' + RIGHT.y + ' ' + LEFT.x + ',' + LEFT.y,
      fill: 'none', stroke: '#111', 'stroke-width': 2, 'stroke-linejoin': 'round'
    });

    // Zone labels.
    for (i = 0; i < ZONES.length; i++) {
      if (!ZONES[i].label) continue;
      p = toXY(ZONES[i].label[0], ZONES[i].label[1], ZONES[i].label[2]);
      el(svg, 'text', {
        x: f(p.x), y: f(p.y), 'text-anchor': 'middle', 'dominant-baseline': 'middle',
        'font-family': FONT, 'font-size': 16, 'font-weight': 'bold', fill: '#111'
      }, ZONES[i].code);
    }
    // PD is a thin sliver: label outside with a leader line.
    p = toXY(92, 0.5, 7.5);
    el(svg, 'line', { x1: f(p.x), y1: f(p.y), x2: f(p.x - 62), y2: f(p.y - 18), stroke: '#111', 'stroke-width': 1 });
    el(svg, 'text', {
      x: f(p.x - 66), y: f(p.y - 20), 'text-anchor': 'end', 'dominant-baseline': 'middle',
      'font-family': FONT, 'font-size': 16, 'font-weight': 'bold', fill: '#111'
    }, 'PD');

    // Ticks and tick labels every 10 %.
    var T = 7;       // tick length
    var s60 = Math.sqrt(3) / 2;
    for (i = 0; i <= 100; i += 10) {
      // CH4 on the left side, rising from bottom-left (0) to top (100).
      p = toXY(i, 0, 100 - i);
      el(svg, 'line', { x1: f(p.x), y1: f(p.y), x2: f(p.x - T), y2: f(p.y), stroke: '#111', 'stroke-width': 1 });
      el(svg, 'text', {
        x: f(p.x - T - 3), y: f(p.y), 'text-anchor': 'end', 'dominant-baseline': 'middle',
        'font-family': FONT, 'font-size': 11, fill: '#111'
      }, String(i));

      // C2H4 on the right side, rising from top (0) to bottom-right (100).
      q = toXY(100 - i, i, 0);
      el(svg, 'line', {
        x1: f(q.x), y1: f(q.y), x2: f(q.x + T * 0.5), y2: f(q.y - T * s60), stroke: '#111', 'stroke-width': 1
      });
      el(svg, 'text', {
        x: f(q.x + T * 0.5 + 3), y: f(q.y - T * s60 - 2), 'text-anchor': 'start', 'dominant-baseline': 'middle',
        'font-family': FONT, 'font-size': 11, fill: '#111'
      }, String(i));

      // C2H6 on the base, rising from bottom-right (0) to bottom-left (100).
      q = toXY(0, 100 - i, i);
      el(svg, 'line', {
        x1: f(q.x), y1: f(q.y), x2: f(q.x + T * 0.5), y2: f(q.y + T * s60), stroke: '#111', 'stroke-width': 1
      });
      el(svg, 'text', {
        x: f(q.x + T * 0.5 + 2), y: f(q.y + T * s60 + 9), 'text-anchor': 'middle', 'dominant-baseline': 'middle',
        'font-family': FONT, 'font-size': 11, fill: '#111'
      }, String(i));
    }

    // Axis names.
    var m = toXY(50, 0, 50);
    el(svg, 'text', {
      x: f(m.x - 48), y: f(m.y - 8), 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      transform: 'rotate(-60 ' + f(m.x - 48) + ' ' + f(m.y - 8) + ')',
      'font-family': FONT, 'font-size': 15, 'font-weight': 'bold', fill: '#111'
    }, '% CH4 →');
    m = toXY(50, 50, 0);
    el(svg, 'text', {
      x: f(m.x + 48), y: f(m.y - 8), 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      transform: 'rotate(60 ' + f(m.x + 48) + ' ' + f(m.y - 8) + ')',
      'font-family': FONT, 'font-size': 15, 'font-weight': 'bold', fill: '#111'
    }, '% C2H4 →');
    m = toXY(0, 50, 50);
    el(svg, 'text', {
      x: f(m.x), y: f(m.y + 48), 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'font-family': FONT, 'font-size': 15, 'font-weight': 'bold', fill: '#111'
    }, '← % C2H6');

    // Title.
    el(svg, 'text', {
      x: 14, y: 22, 'text-anchor': 'start', 'font-family': FONT, 'font-size': 14, 'font-weight': 'bold', fill: '#111'
    }, 'Duval Triangle 5');

    // Sample point.
    if (sample && typeof sample === 'object') {
      var a = Number(sample.ch4) || 0, b = Number(sample.c2h4) || 0, c = Number(sample.c2h6) || 0;
      if (a + b + c > 0) {
        p = toXY(a, b, c);
        el(svg, 'circle', {
          cx: f(p.x), cy: f(p.y), r: 6, fill: '#d00000', stroke: '#ffffff', 'stroke-width': 2
        });
        el(svg, 'circle', {
          cx: f(p.x), cy: f(p.y), r: 7.5, fill: 'none', stroke: '#111', 'stroke-width': 1
        });
        el(svg, 'text', {
          x: 586, y: 22, 'text-anchor': 'end', 'font-family': FONT, 'font-size': 13, fill: '#111'
        }, 'Sample: ' + classify(a, b, c));
      }
    }
  }

  return { classify: classify, render: render };
})();
