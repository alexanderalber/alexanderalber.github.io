/*  Duval Triangle 1 – very compact, self-contained implementation.
    ────────────────────────────────────────────────────────────────
    NOTE – All numerical boundaries are taken from recollection.
           They are close to the original but not guaranteed exact.            */

const DuvalTriangle = (function () {

  /* ---------- basic geometry helpers ------------------------------------ */

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // triangle apexes (pixels in the required 600 × 540 view-box)
  const P_CH4  = { x:  60, y: 500 };       // CH₄ – bottom left
  const P_C2H4 = { x: 540, y: 500 };       // C₂H₄ – bottom right
  const P_C2H2 = { x: 300, y:  40 };       // C₂H₂ – top

  // convert a gas percentage triplet (must sum 100) to SVG coordinates
  function baryToXY (ch4, c2h4, c2h2) {
    const f = 1 / 100;
    return {
      x: ch4  * f * P_CH4.x  + c2h4 * f * P_C2H4.x + c2h2 * f * P_C2H2.x,
      y: ch4  * f * P_CH4.y  + c2h4 * f * P_C2H4.y + c2h2 * f * P_C2H2.y
    };
  }

  // build an SVG <polygon>
  function makePolygon (pts, fill, stroke) {
    const p = document.createElementNS(SVG_NS, 'polygon');
    p.setAttribute('points',
      pts.map(pt => `${pt.x},${pt.y}`).join(' ')
    );
    p.setAttribute('fill', fill);
    p.setAttribute('stroke', stroke || '#000');
    p.setAttribute('stroke-width', 1);
    return p;
  }

  // simple point-in-polygon (ray casting, 2-D)
  function inside (pt, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect =
        ((yi > pt.y) !== (yj > pt.y)) &&
        (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /* ---------- zone definitions (percentages, from memory) ---------------- */

  // helper – make an array of real SVG points from percentage vertices
  function v (...triples) {
    return triples.map(t => baryToXY(t[0], t[1], t[2]));
  }

  const ZONES = [
    { code : 'PD',
      color: '#ffd447',
      poly : v([100,   0,   0],
               [ 70,  30,   0],
               [ 70,   0,  30]) },

    { code : 'T1',
      color: '#ffec9a',
      poly : v([ 70,  30,   0],
               [ 45,  55,   0],
               [ 45,   0,  55],
               [ 70,   0,  30]) },

    { code : 'T2',
      color: '#ffb77c',
      poly : v([ 45,  55,   0],
               [ 20,  80,   0],
               [ 20,   0,  80],
               [ 45,   0,  55]) },

    { code : 'T3',
      color: '#ff5c33',
      poly : v([ 20,  80,   0],
               [  0, 100,   0],
               [  0,  80,  20],
               [ 20,   0,  80]) },

    { code : 'D1',
      color: '#9ac7ff',
      poly : v([ 70,   0,  30],
               [ 30,   0,  70],
               [  0,  30,  70],
               [  0,  10,  90],
               [ 10,   0,  90]) },

    { code : 'D2',
      color: '#337dff',
      poly : v([ 10,   0,  90],
               [  0,  10,  90],
               [  0,   0, 100]) }
  ];

  /* ---------- public: classify ------------------------------------------ */

  function classify (ch4, c2h4, c2h2) {
    ch4  = Number(ch4  || 0);
    c2h4 = Number(c2h4 || 0);
    c2h2 = Number(c2h2 || 0);

    const total = ch4 + c2h4 + c2h2;
    if (total <= 0) return '';

    const pctCH4  = ch4  * 100 / total;
    const pctC2H4 = c2h4 * 100 / total;
    const pctC2H2 = c2h2 * 100 / total;

    const pt = baryToXY(pctCH4, pctC2H4, pctC2H2);

    for (const zone of ZONES) {
      if (inside(pt, zone.poly)) return zone.code;
    }
    return '';          // outside any remembered zone (should not occur)
  }

  /* ---------- public: render -------------------------------------------- */

  function render (svg, sample) {

    // purge previous content
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // background
    const bg = document.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('x', 0); bg.setAttribute('y', 0);
    bg.setAttribute('width', 600); bg.setAttribute('height', 540);
    bg.setAttribute('fill', '#ffffff');
    svg.appendChild(bg);

    /* draw filled zones */
    for (const zone of ZONES) {
      const poly = makePolygon(zone.poly, zone.color, '#666');
      svg.appendChild(poly);

      // label – centroid (simple average of vertices)
      const cx = zone.poly.reduce((s, p) => s + p.x, 0) / zone.poly.length;
      const cy = zone.poly.reduce((s, p) => s + p.y, 0) / zone.poly.length;

      const txt = document.createElementNS(SVG_NS, 'text');
      txt.setAttribute('x', cx);
      txt.setAttribute('y', cy);
      txt.setAttribute('font-size', '16');
      txt.setAttribute('font-family', 'sans-serif');
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('dominant-baseline', 'middle');
      txt.setAttribute('fill', '#000');
      txt.textContent = zone.code;
      svg.appendChild(txt);
    }

    /* triangle outline */
    const outline = makePolygon(
      [P_CH4, P_C2H4, P_C2H2], 'none', '#000'
    );
    outline.setAttribute('stroke-width', 2);
    svg.appendChild(outline);

    /* axes tick marks & labels (every 10 %) */

    function ticks (start, end, other, label, insideShift) {
      for (let p = 10; p < 100; p += 10) {
        const t = p / 100;
        const x = start.x * (1 - t) + end.x * t;
        const y = start.y * (1 - t) + end.y * t;

        // tiny perpendicular tick (length ~8 px)
        const dx = other.y - start.y;
        const dy = start.x - other.x;
        const len = Math.sqrt(dx*dx + dy*dy);
        const ux = dx / len, uy = dy / len;
        const x1 = x - ux * 4, y1 = y - uy * 4;
        const x2 = x + ux * 4, y2 = y + uy * 4;

        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', x1); line.setAttribute('y1', y1);
        line.setAttribute('x2', x2); line.setAttribute('y2', y2);
        line.setAttribute('stroke', '#000');
        line.setAttribute('stroke-width', 1);
        svg.appendChild(line);

        // text
        const text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('x', x + ux * insideShift + 2);
        text.setAttribute('y', y + uy * insideShift + 2);
        text.setAttribute('font-size', '10');
        text.setAttribute('font-family', 'sans-serif');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.textContent = 100 - p;
        svg.appendChild(text);
      }

      // gas name at apex
      const gasText = document.createElementNS(SVG_NS, 'text');
      gasText.setAttribute('x', other.x + (start.x - other.x) * 0.05);
      gasText.setAttribute('y', other.y + (start.y - other.y) * 0.05);
      gasText.setAttribute('font-size', '14');
      gasText.setAttribute('font-family', 'sans-serif');
      gasText.setAttribute('font-weight', 'bold');
      gasText.setAttribute('text-anchor', 'middle');
      gasText.setAttribute('dominant-baseline', 'middle');
      gasText.textContent = label;
      svg.appendChild(gasText);
    }

    // CH₄ axis (along side P_C2H4 – P_C2H2)
    ticks(P_C2H4, P_C2H2, P_CH4, 'C₂H₄', 14);

    // C₂H₄ axis (along side P_CH4 – P_C2H2)
    ticks(P_CH4, P_C2H2, P_C2H4, 'CH₄', 14);

    // C₂H₂ axis (bottom side P_CH4 – P_C2H4)
    ticks(P_CH4, P_C2H4, P_C2H2, 'C₂H₂', 14);

    /* draw sample if provided */
    if (sample && (sample.ch4 || sample.c2h4 || sample.c2h2)) {
      const total = sample.ch4 + sample.c2h4 + sample.c2h2;
      if (total > 0) {
        const pt = baryToXY(
          sample.ch4  * 100 / total,
          sample.c2h4 * 100 / total,
          sample.c2h2 * 100 / total
        );
        const dot = document.createElementNS(SVG_NS, 'circle');
        dot.setAttribute('cx', pt.x);
        dot.setAttribute('cy', pt.y);
        dot.setAttribute('r', 6);
        dot.setAttribute('fill', '#000');
        dot.setAttribute('stroke', '#fff');
        dot.setAttribute('stroke-width', 2);
        svg.appendChild(dot);
      }
    }
  }

  /* ---------- expose ----------------------------------------------------- */
  return { classify, render };

})();
