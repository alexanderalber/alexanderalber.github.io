const DuvalTriangle5 = {

  classify(ch4, c2h4, c2h6) {
    var t = ch4 + c2h4 + c2h6;
    var pE = 100 * c2h4 / t;   // %C2H4
    var pM = 100 * ch4 / t;    // %CH4
    if (pE >= 50) return 'T3';
    if (pE >= 20) return 'T2';
    if (pE >= 4)  return 'C';
    if (pM >= 40) return 'S';
    return 'O';
  },

  render(svg, sample) {
    var NS = 'http://www.w3.org/2000/svg';

    // Equilateral triangle vertices (CH4 top, C2H4 bottom-right, C2H6 bottom-left)
    var Ax = 300, Ay = 52;    // CH4 = 100%
    var Bx = 546, By = 478;   // C2H4 = 100%
    var Cx = 54,  Cy = 478;   // C2H6 = 100%

    function el(tag, attrs, parent) {
      var e = document.createElementNS(NS, tag);
      if (attrs) {
        var keys = Object.keys(attrs);
        for (var i = 0; i < keys.length; i++) e.setAttribute(keys[i], String(attrs[keys[i]]));
      }
      (parent || svg).appendChild(e);
      return e;
    }

    function txt(x, y, str, extra) {
      var a = { x: x, y: y, 'font-family': 'Arial,Helvetica,sans-serif' };
      if (extra) { var k = Object.keys(extra); for (var i = 0; i < k.length; i++) a[k[i]] = extra[k[i]]; }
      var t = el('text', a);
      t.textContent = str;
      return t;
    }

    // Ternary → pixel
    function toXY(ch4, c2h4, c2h6) {
      return [
        (ch4 * Ax + c2h4 * Bx + c2h6 * Cx) / 100,
        (ch4 * Ay + c2h4 * By + c2h6 * Cy) / 100
      ];
    }

    // Zone definitions: [ch4%, c2h4%, c2h6%] vertices
    var zones = [
      { code: 'T3', color: '#d94f4f',
        poly: [[50,50,0],[0,100,0],[0,50,50]] },
      { code: 'T2', color: '#e8923f',
        poly: [[80,20,0],[50,50,0],[0,50,50],[0,20,80]] },
      { code: 'C',  color: '#c9a86c',
        poly: [[96,4,0],[80,20,0],[0,20,80],[0,4,96]] },
      { code: 'S',  color: '#5aafe6',
        poly: [[100,0,0],[96,4,0],[40,4,56],[40,0,60]] },
      { code: 'O',  color: '#7ed6a5',
        poly: [[40,0,60],[40,4,56],[0,4,96],[0,0,100]] }
    ];

    // Background rect
    el('rect', { x: 0, y: 0, width: 600, height: 540, fill: '#ffffff' });

    // Draw filled zone polygons
    var i, j, z, pts, p;
    for (i = 0; i < zones.length; i++) {
      z = zones[i];
      pts = '';
      for (j = 0; j < z.poly.length; j++) {
        p = toXY(z.poly[j][0], z.poly[j][1], z.poly[j][2]);
        pts += (j ? ' ' : '') + p[0].toFixed(1) + ',' + p[1].toFixed(1);
      }
      el('polygon', { points: pts, fill: z.color, stroke: '#444', 'stroke-width': 1.2,
                       'stroke-linejoin': 'round' });
    }

    // Triangle outline
    el('polygon', {
      points: Ax+','+Ay+' '+Bx+','+By+' '+Cx+','+Cy,
      fill: 'none', stroke: '#000', 'stroke-width': 2.5
    });

    // Zone labels at polygon centroids
    for (i = 0; i < zones.length; i++) {
      z = zones[i];
      var ca = 0, cb = 0, cc = 0, n = z.poly.length;
      for (j = 0; j < n; j++) { ca += z.poly[j][0]; cb += z.poly[j][1]; cc += z.poly[j][2]; }
      p = toXY(ca / n, cb / n, cc / n);
      txt(p[0], p[1], z.code, {
        'text-anchor': 'middle', 'dominant-baseline': 'central',
        'font-size': 22, 'font-weight': 'bold', fill: '#1a1a1a'
      });
    }

    // --- Tick marks and % labels on each edge ---
    var tickLen = 7;

    // Left edge  A→C : %CH4 axis (100 at A, 0 at C)
    var ldx = Cx - Ax, ldy = Cy - Ay, ll = Math.hypot(ldx, ldy);
    var lnx = -ldy / ll, lny = ldx / ll;           // outward normal (away from B)
    for (var v = 10; v <= 90; v += 10) {
      var t = (100 - v) / 100;                      // parameter along A→C
      var px = Ax + t * ldx, py = Ay + t * ldy;
      el('line', { x1: px, y1: py, x2: px + tickLen * lnx, y2: py + tickLen * lny,
                   stroke: '#000', 'stroke-width': 1 });
      if (v % 20 === 0) {
        txt(px + 19 * lnx, py + 19 * lny + 4, String(v), {
          'text-anchor': 'middle', 'font-size': 11, fill: '#333'
        });
      }
    }

    // Right edge  A→B : %C2H4 axis (0 at A, 100 at B)
    var rdx = Bx - Ax, rdy = By - Ay, rl = Math.hypot(rdx, rdy);
    var rnx = rdy / rl, rny = -rdx / rl;            // outward normal (away from C)
    for (v = 10; v <= 90; v += 10) {
      t = v / 100;
      px = Ax + t * rdx; py = Ay + t * rdy;
      el('line', { x1: px, y1: py, x2: px + tickLen * rnx, y2: py + tickLen * rny,
                   stroke: '#000', 'stroke-width': 1 });
      if (v % 20 === 0) {
        txt(px + 19 * rnx, py + 19 * rny + 4, String(v), {
          'text-anchor': 'middle', 'font-size': 11, fill: '#333'
        });
      }
    }

    // Bottom edge  C→B : %C2H6 axis (100 at C, 0 at B)
    for (v = 10; v <= 90; v += 10) {
      t = (100 - v) / 100;                           // parameter along C→B
      px = Cx + t * (Bx - Cx); py = Cy;
      el('line', { x1: px, y1: py, x2: px, y2: py + tickLen,
                   stroke: '#000', 'stroke-width': 1 });
      if (v % 20 === 0) {
        txt(px, py + 20, String(v), {
          'text-anchor': 'middle', 'font-size': 11, fill: '#333'
        });
      }
    }

    // Axis name labels (rotated along edges)
    var lmx = (Ax + Cx) / 2 + 42 * lnx;
    var lmy = (Ay + Cy) / 2 + 42 * lny;
    var lAng = Math.atan2(ldy, ldx) * 180 / Math.PI + 180;   // readable direction
    txt(lmx, lmy, '% CH\u2084', {
      'text-anchor': 'middle', 'font-size': 14, 'font-weight': 'bold',
      transform: 'rotate(' + lAng + ',' + lmx.toFixed(1) + ',' + lmy.toFixed(1) + ')'
    });

    var rmx = (Ax + Bx) / 2 + 42 * rnx;
    var rmy = (Ay + By) / 2 + 42 * rny;
    var rAng = Math.atan2(rdy, rdx) * 180 / Math.PI;
    txt(rmx, rmy, '% C\u2082H\u2084', {
      'text-anchor': 'middle', 'font-size': 14, 'font-weight': 'bold',
      transform: 'rotate(' + rAng + ',' + rmx.toFixed(1) + ',' + rmy.toFixed(1) + ')'
    });

    txt((Cx + Bx) / 2, Cy + 38, '% C\u2082H\u2086', {
      'text-anchor': 'middle', 'font-size': 14, 'font-weight': 'bold'
    });

    // Title
    txt(300, 22, 'Duval Triangle 5', {
      'text-anchor': 'middle', 'font-size': 16, 'font-weight': 'bold', fill: '#000'
    });

    // Sample point
    if (sample) {
      var st = sample.ch4 + sample.c2h4 + sample.c2h6;
      var sp = toXY(100 * sample.ch4 / st, 100 * sample.c2h4 / st, 100 * sample.c2h6 / st);
      el('circle', { cx: sp[0], cy: sp[1], r: 8, fill: '#111', stroke: '#fff', 'stroke-width': 2.5 });
      el('circle', { cx: sp[0], cy: sp[1], r: 3, fill: '#fff' });
    }
  }

};