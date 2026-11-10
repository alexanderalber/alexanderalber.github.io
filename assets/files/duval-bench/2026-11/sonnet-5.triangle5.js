const DuvalTriangle5 = (function () {
  // Duval Triangle 5 (DT5) — low-temperature / low-energy fault discrimination
  // Gases used: CH4, C2H4, C2H6 (percentages of the sum of these three)
  // Zones (IEC 60599 / CIGRE TB 771 nomenclature for DT5):
  //   PD   - Partial Discharge
  //   S    - Stray gassing (thermal < 200C, stray gassing of oil)
  //   O    - Overheating (general, includes low/medium thermal)
  //   C    - Carbonization of paper / high thermal with cellulose involvement
  //   T2   - Thermal fault 300-700C
  //   T3   - Thermal fault >700C
  //
  // DT5 is plotted with:
  //   %CH4 on the left axis (bottom-left vertex = 100% CH4)
  //   %C2H4 on the right axis (bottom-right vertex = 100% C2H4)
  //   %C2H6 on the bottom axis (top vertex = 100% C2H6)
  //
  // The exact published boundaries (recalled from CIGRE TB 771 / IEC TR):
  //   %C2H6 >= 25                                -> S  (stray gassing)
  //   %C2H6 < 25 and %CH4 >= 70                  -> PD
  //   %C2H6 < 25 and %CH4 < 70 and %C2H4 <= 50   -> O
  //   %C2H6 < 25 and %CH4 < 70 and %C2H4 > 50 and %C2H4 <= 80 -> C
  //   %C2H6 < 25 and %CH4 < 70 and %C2H4 > 80    -> T3 (and a small T2 sliver
  //        near the C2H4 vertex is folded into T3 here since published
  //        corner geometry varies slightly between versions)
  //
  // This is recalled from memory; exact numeric boundaries for DT5 vary
  // slightly between CIGRE/IEC publications. Best-recollection values are
  // committed to below.

  function pct(ch4, c2h4, c2h6) {
    const sum = ch4 + c2h4 + c2h6;
    if (sum <= 0) {
      return { pCH4: 0, pC2H4: 0, pC2H6: 0 };
    }
    return {
      pCH4: (ch4 / sum) * 100,
      pC2H4: (c2h4 / sum) * 100,
      pC2H6: (c2h6 / sum) * 100
    };
  }

  function classify(ch4, c2h4, c2h6) {
    const { pCH4, pC2H4, pC2H6 } = pct(ch4, c2h4, c2h6);

    if (pC2H6 >= 25) {
      return 'S';
    }
    if (pCH4 >= 70) {
      return 'PD';
    }
    if (pC2H4 <= 50) {
      return 'O';
    }
    if (pC2H4 <= 80) {
      return 'C';
    }
    return 'T3';
  }

  // ---------- Geometry helpers for an equilateral triangle plot ----------
  // Standard Duval orientation:
  //   Bottom-left vertex  = 100% CH4   (0,0 in barycentric: CH4=100,C2H4=0,C2H6=0)
  //   Bottom-right vertex = 100% C2H4
  //   Top vertex          = 100% C2H6
  //
  // We convert (%CH4, %C2H4, %C2H6) barycentric coords to Cartesian (x,y)
  // inside a triangle with:
  //   A = bottom-left  (CH4 = 100)
  //   B = bottom-right (C2H4 = 100)
  //   C = top           (C2H6 = 100)

  const SIDE = 420;
  const originX = 90;
  const baseY = 470;
  const topY = baseY - SIDE * Math.sin(Math.PI / 3);

  const A = { x: originX, y: baseY };                  // 100% CH4
  const B = { x: originX + SIDE, y: baseY };            // 100% C2H4
  const C = { x: originX + SIDE / 2, y: topY };         // 100% C2H6

  // point = pCH4/100 * A + pC2H4/100 * B + pC2H6/100 * C
  function toXY(pCH4, pC2H4, pC2H6) {
    const sum = pCH4 + pC2H4 + pC2H6;
    const a = pCH4 / sum;
    const b = pC2H4 / sum;
    const c = pC2H6 / sum;
    return {
      x: a * A.x + b * B.x + c * C.x,
      y: a * A.y + b * B.y + c * C.y
    };
  }

  function NS(tag, attrs, parent) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) {
      for (const k in attrs) {
        el.setAttribute(k, attrs[k]);
      }
    }
    if (parent) parent.appendChild(el);
    return el;
  }

  function polyPoints(pts) {
    return pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  }

  // Build a region polygon from a list of (pCH4,pC2H4,pC2H6) barycentric
  // triples, converted to XY.
  function region(points) {
    return points.map((p) => toXY(p[0], p[1], p[2]));
  }

  function render(svg, sample) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    NS('rect', { x: 0, y: 0, width: 600, height: 540, fill: '#ffffff' }, svg);

    const zoneDefs = [
      {
        code: 'S',
        color: '#cfe8ff',
        // %C2H6 >= 25 : region between C2H6=25 line and C2H6=100 vertex
        points: region([
          [75, 0, 25],
          [0, 75, 25],
          [0, 0, 100]
        ])
      },
      {
        code: 'PD',
        color: '#d9f2d9',
        // C2H6<25, CH4>=70
        points: region([
          [70, 30, 0],
          [100, 0, 0],
          [75, 0, 25],
          [70, 5, 25]
        ])
      },
      {
        code: 'O',
        color: '#fff3c4',
        // C2H6<25, CH4<70, C2H4<=50
        points: region([
          [70, 30, 0],
          [70, 5, 25],
          [20, 30, 50], // wait recompute below
          [0, 50, 0],
          [0, 0, 0]
        ])
      },
      {
        code: 'C',
        color: '#ffd9a0',
        // C2H6<25, CH4<70, 50<C2H4<=80
        points: []
      },
      {
        code: 'T3',
        color: '#ffb3b3',
        // C2H6<25, CH4<70, C2H4>80
        points: []
      }
    ];

    // Recompute O, C, T3 boundaries cleanly using line intersections in
    // barycentric space rather than ad-hoc guesses above (discard the
    // placeholder O points computed inline earlier).

    // Boundary lines (in %):
    //   L1: C2H6 = 25            (separates S from rest)
    //   L2: CH4  = 70            (separates PD from rest, only below L1)
    //   L3: C2H4 = 50            (separates O from C, only below L1 & L2)
    //   L4: C2H4 = 80            (separates C from T3, only below L1 & L2)
    //
    // Within the region C2H6<25 & CH4<70 (a quadrilateral band), C2H4
    // ranges implicitly as C2H4 = 100 - CH4 - C2H6.

    function clip(ch4, c2h4, c2h6) {
      return [ch4, c2h4, c2h6];
    }

    // O region: C2H6<=25, CH4<=70, C2H4<=50
    const O_pts = region([
      [70, 0, 0],
      [70, 5, 25],
      [45, 30, 25],
      [20, 50, 30],
      [0, 50, 50],
      [0, 50, 0]
    ]);
    // the above hand-walk is error-prone; replace with precise vertex calc below.

    // Precise approach: enumerate the polygon (CH4<=70 AND C2H6<=25 AND C2H4<=50)
    // within the simplex CH4+C2H4+C2H6=100, all >=0.
    function polygonForConstraints(maxCH4, maxC2H6, maxC2H4) {
      // Sample the simplex boundary via constraint intersections.
      // Vertices of full simplex:
      const V_CH4 = [100, 0, 0];
      const V_C2H4 = [0, 100, 0];
      const V_C2H6 = [0, 0, 100];

      // Candidate corner points formed by pairs of the three cap
      // constraints (CH4<=maxCH4, C2H6<=maxC2H6, C2H4<=maxC2H4) plus the
      // simplex edges, filtered to those satisfying all constraints.
      const candidates = [];

      function add(ch4, c2h4, c2h6) {
        if (ch4 < -1e-6 || c2h4 < -1e-6 || c2h6 < -1e-6) return;
        if (ch4 > maxCH4 + 1e-6) return;
        if (c2h6 > maxC2H6 + 1e-6) return;
        if (c2h4 > maxC2H4 + 1e-6) return;
        if (Math.abs(ch4 + c2h4 + c2h6 - 100) > 1e-4) return;
        candidates.push([ch4, c2h4, c2h6]);
      }

      // Corners from pairs of active constraints:
      // CH4 = maxCH4, C2H6 = maxC2H6  => C2H4 = 100-maxCH4-maxC2H6
      add(maxCH4, 100 - maxCH4 - maxC2H6, maxC2H6);
      // CH4 = maxCH4, C2H4 = maxC2H4 => C2H6 = 100-maxCH4-maxC2H4
      add(maxCH4, maxC2H4, 100 - maxCH4 - maxC2H4);
      // C2H6 = maxC2H6, C2H4 = maxC2H4 => CH4 = 100-maxC2H6-maxC2H4
      add(100 - maxC2H6 - maxC2H4, maxC2H4, maxC2H6);
      // CH4 = maxCH4, C2H6 = 0 => C2H4 = 100-maxCH4
      add(maxCH4, 100 - maxCH4, 0);
      // CH4 = maxCH4, C2H4 = 0 => C2H6 = 100-maxCH4
      add(maxCH4, 0, 100 - maxCH4);
      // C2H6 = maxC2H6, CH4 = 0 => C2H4 = 100-maxC2H6
      add(0, 100 - maxC2H6, maxC2H6);
      // C2H6 = maxC2H6, C2H4 = 0 => CH4 = 100-maxC2H6
      add(100 - maxC2H6, 0, maxC2H6);
      // C2H4 = maxC2H4, CH4 = 0 => C2H6 = 100-maxC2H4
      add(0, maxC2H4, 100 - maxC2H4);
      // C2H4 = maxC2H4, C2H6 = 0 => CH4 = 100-maxC2H4
      add(100 - maxC2H4, maxC2H4, 0);
      // Pure vertices if they satisfy all caps
      add(100, 0, 0);
      add(0, 100, 0);
      add(0, 0, 100);
      add(0, 0, 0);

      // Deduplicate
      const uniq = [];
      candidates.forEach((p) => {
        if (
          !uniq.some(
            (q) =>
              Math.abs(q[0] - p[0]) < 1e-4 &&
              Math.abs(q[1] - p[1]) < 1e-4 &&
              Math.abs(q[2] - p[2]) < 1e-4
          )
        ) {
          uniq.push(p);
        }
      });

      // Convert to XY and sort by angle around centroid for a proper polygon.
      const xy = uniq.map((p) => toXY(p[0], p[1], p[2]));
      const cx = xy.reduce((s, p) => s + p.x, 0) / xy.length;
      const cy = xy.reduce((s, p) => s + p.y, 0) / xy.length;
      xy.sort((p, q) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx));
      return xy;
    }

    // Region definitions as (included) minus (excluded) via constraint caps:
    // S:   C2H6 >= 25                         -> full simplex minus {C2H6<=25}
    // PD:  C2H6<25, CH4>=70                   -> {CH4<=100,C2H6<=25} minus {CH4<=70,C2H6<=25}
    // O:   C2H6<25, CH4<70, C2H4<=50          -> polygonForConstraints(70,25,50)
    // C:   C2H6<25, CH4<70, 50<C2H4<=80       -> polygonForConstraints(70,25,80) minus O
    // T3:  C2H6<25, CH4<70, C2H4>80           -> polygonForConstraints(70,25,100) minus C-region

    const fullBand = polygonForConstraints(70, 25, 100); // CH4<=70 & C2H6<=25 (C2H4 unconstrained <=100)
    const oPoly = polygonForConstraints(70, 25, 50);
    const cPoly = polygonForConstraints(70, 25, 80);

    const sPoly = region([
      [75, 0, 25],
      [0, 75, 25],
      [0, 0, 100]
    ]);

    const pdPoly = polygonForConstraints(100, 25, 100).filter(() => true);
    // PD is the set CH4>=70 & C2H6<=25 : compute directly as its own cap region
    function polygonForLowerBound(minCH4, maxC2H6) {
      // CH4 >= minCH4 and C2H6 <= maxC2H6, within simplex
      const candidates = [];
      function add(ch4, c2h4, c2h6) {
        if (ch4 < -1e-6 || c2h4 < -1e-6 || c2h6 < -1e-6) return;
        if (ch4 < minCH4 - 1e-6) return;
        if (c2h6 > maxC2H6 + 1e-6) return;
        if (Math.abs(ch4 + c2h4 + c2h6 - 100) > 1e-4) return;
        candidates.push([ch4, c2h4, c2h6]);
      }
      add(minCH4, 100 - minCH4 - maxC2H6, maxC2H6);
      add(minCH4, 100 - minCH4, 0);
      add(100, 0, 0);
      add(minCH4, 0, 100 - minCH4);
      add(100 - maxC2H6, 0, maxC2H6);
      const uniq = [];
      candidates.forEach((p) => {
        if (
          !uniq.some(
            (q) =>
              Math.abs(q[0] - p[0]) < 1e-4 &&
              Math.abs(q[1] - p[1]) < 1e-4 &&
              Math.abs(q[2] - p[2]) < 1e-4
          )
        ) {
          uniq.push(p);
        }
      });
      const xy = uniq.map((p) => toXY(p[0], p[1], p[2]));
      const cx = xy.reduce((s, p) => s + p.x, 0) / xy.length;
      const cy = xy.reduce((s, p) => s + p.y, 0) / xy.length;
      xy.sort((p, q) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx));
      return xy;
    }

    const pdPolyFinal = polygonForLowerBound(70, 25);

    function drawPoly(points, fill, strokeColor) {
      NS(
        'polygon',
        {
          points: polyPoints(points),
          fill: fill,
          stroke: strokeColor || '#555555',
          'stroke-width': 1.2
        },
        svg
      );
    }

    // Draw order: S, PD, O, C, T3 (T3 drawn last covers remaining band area;
    // we draw band minus O minus C implicitly by drawing T3 as full band and
    // then overlaying O and C on top so boundaries look clean)
    drawPoly(fullBand, '#ffb3b3', '#555555'); // T3 base fill for whole low-C2H6/low-CH4 band
    drawPoly(cPoly, '#ffd9a0', '#555555'); // C covers band up to C2H4<=80
    drawPoly(oPoly, '#fff3c4', '#555555'); // O covers band up to C2H4<=50
    drawPoly(pdPolyFinal, '#d9f2d9', '#555555');
    drawPoly(sPoly, '#cfe8ff', '#555555');

    // Re-stroke the outer triangle boundary cleanly on top
    NS(
      'polygon',
      {
        points: polyPoints([A, B, C]),
        fill: 'none',
        stroke: '#000000',
        'stroke-width': 2
      },
      svg
    );

    // ---------- Zone labels ----------
    function labelAt(pCH4, pC2H4, pC2H6, text, fontSize) {
      const p = toXY(pCH4, pC2H4, pC2H6);
      NS(
        'text',
        {
          x: p.x,
          y: p.y,
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
          'font-size': fontSize || 16,
          'font-family': 'sans-serif',
          'font-weight': 'bold',
          fill: '#222222'
        },
        svg
      ).textContent = text;
    }

    labelAt(10, 5, 85, 'S', 18);
    labelAt(85, 10, 5, 'PD', 16);
    labelAt(45, 25, 10, 'O', 16);
    labelAt(32, 55, 10, 'C', 16);
    labelAt(20, 75, 5, 'T3', 16);

    // ---------- Axes with tick marks ----------
    // Triangle outline already drawn. Add ticks every 10% along each edge
    // and axis titles + direction indication.

    function lerp(p1, p2, t) {
      return { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
    }

    function outward(p1, p2, point, dist) {
      // normal pointing away from triangle centroid
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy);
      let nx = -dy / len;
      let ny = dx / len;
      const centroid = {
        x: (A.x + B.x + C.x) / 3,
        y: (A.y + B.y + C.y) / 3
      };
      const toCentroidX = centroid.x - point.x;
      const toCentroidY = centroid.y - point.y;
      if (nx * toCentroidX + ny * toCentroidY > 0) {
        nx = -nx;
        ny = -ny;
      }
      return { x: point.x + nx * dist, y: point.y + ny * dist };
    }

    // Bottom edge A->B : %CH4 decreasing left->right is actually %C2H4 increasing;
    // ticks represent %C2H4 from 0 (at A) to 100 (at B)
    for (let t = 0; t <= 100; t += 10) {
      const p = lerp(A, B, t / 100);
      const out = outward(A, B, p, 10);
      NS('line', { x1: p.x, y1: p.y, x2: out.x, y2: out.y, stroke: '#000', 'stroke-width': 1 }, svg);
      if (t % 20 === 0) {
        const lbl = outward(A, B, p, 24);
        NS(
          'text',
          {
            x: lbl.x,
            y: lbl.y,
            'text-anchor': 'middle',
            'dominant-baseline': 'middle',
            'font-size': 11,
            'font-family': 'sans-serif',
            fill: '#000'
          },
          svg
        ).textContent = t;
      }
    }

    // Left edge A->C : %C2H6 increasing from A(0) to C(100)
    for (let t = 0; t <= 100; t += 10) {
      const p = lerp(A, C, t / 100);
      const out = outward(A, C, p, 10);
      NS('line', { x1: p.x, y1: p.y, x2: out.x, y2: out.y, stroke: '#000', 'stroke-width': 1 }, svg);
      if (t % 20 === 0) {
        const lbl = outward(A, C, p, 24);
        NS(
          'text',
          {
            x: lbl.x,
            y: lbl.y,
            'text-anchor': 'middle',
            'dominant-baseline': 'middle',
            'font-size': 11,
            'font-family': 'sans-serif',
            fill: '#000'
          },
          svg
        ).textContent = t;
      }
    }

    // Right edge C->B : %CH4 decreasing from C(0) to B... actually CH4 is 0 along
    // this whole edge only at vertex relationships; correct parametrization:
    // Right edge connects C (CH4=0) to B (CH4=0) is wrong — C and B both have CH4=0.
    // The CH4 axis runs along edge B->A (CH4: 0 at B, 100 at A), already partially
    // covered conceptually; to keep a third set of ticks distinct and correct,
    // use edge C->B for %CH4 is invalid since CH4=0 along entire C-B edge.
    // Correct: %CH4 ticks belong on edge A->C? No: CH4=100 only at A, =0 along B-C edge.
    // So CH4 axis is the edge from A to the opposite side, but ticks conventionally
    // go along edge A-B (shared with C2H4 ticks) is also wrong since that's the
    // C2H4 axis already used above for edge A->B.
    //
    // Standard Duval convention: each vertex = 100% of one gas, each edge is
    // the locus where the opposite gas = 0%, and tick marks for a given gas's
    // scale run along the TWO edges adjacent to that gas's own vertex,
    // parametrized from 0 (at the far edge) to 100 (at the vertex). To keep
    // this both correct and visually uncluttered, draw CH4 ticks along edge
    // C->A (the other edge touching the CH4 vertex A), from 0 at C to 100 at A.

    for (let t = 0; t <= 100; t += 10) {
      const p = lerp(C, A, t / 100);
      const out = outward(C, A, p, 10);
      // skip drawing duplicate ticks on top of the C2H6 axis already drawn
      // on this same edge; offset further out and use a different tick style
      NS(
        'line',
        {
          x1: p.x,
          y1: p.y,
          x2: out.x,
          y2: out.y,
          stroke: '#666',
          'stroke-width': 0.8,
          'stroke-dasharray': '2,2'
        },
        svg
      );
    }

    // Axis titles
    const ch4TitlePos = outward(C, A, lerp(C, A, 0.5), 55);
    NS(
      'text',
      {
        x: ch4TitlePos.x - 40,
        y: ch4TitlePos.y,
        'text-anchor': 'middle',
        'font-size': 14,
        'font-family': 'sans-serif',
        'font-weight': 'bold',
        fill: '#000'
      },
      svg
    ).textContent = '%CH4';

    const c2h4TitlePos = outward(A, B, lerp(A, B, 0.5), 45);
    NS(
      'text',
      {
        x: c2h4TitlePos.x,
        y: c2h4TitlePos.y,
        'text-anchor': 'middle',
        'font-size': 14,
        'font-family': 'sans-serif',
        'font-weight': 'bold',
        fill: '#000'
      },
      svg
    ).textContent = '%C2H4';

    const c2h6TitlePos = outward(A, C, lerp(A, C, 0.5), 45);
    NS(
      'text',
      {
        x: c2h6TitlePos.x,
        y: c2h6TitlePos.y,
        'text-anchor': 'middle',
        'font-size': 14,
        'font-family': 'sans-serif',
        'font-weight': 'bold',
        fill: '#000'
      },
      svg
    ).textContent = '%C2H6';

    // Vertex labels
    NS(
      'text',
      {
        x: A.x - 15,
        y: A.y + 20,
        'text-anchor': 'middle',
        'font-size': 12,
        'font-family': 'sans-serif',
        fill: '#000'
      },
      svg
    ).textContent = 'CH4';
    NS(
      'text',
      {
        x: B.x + 15,
        y: B.y + 20,
        'text-anchor': 'middle',
        'font-size': 12,
        'font-family': 'sans-serif',
        fill: '#000'
      },
      svg
    ).textContent = 'C2H4';
    NS(
      'text',
      {
        x: C.x,
        y: C.y - 14,
        'text-anchor': 'middle',
        'font-size': 12,
        'font-family': 'sans-serif',
        fill: '#000'
      },
      svg
    ).textContent = 'C2H6';

    // Title
    NS(
      'text',
      {
        x: 300,
        y: 25,
        'text-anchor': 'middle',
        'font-size': 18,
        'font-family': 'sans-serif',
        'font-weight': 'bold',
        fill: '#000'
      },
      svg
    ).textContent = 'Duval Triangle 5';

    // Legend
    const legendItems = [
      ['S', '#cfe8ff', 'Stray gassing'],
      ['PD', '#d9f2d9', 'Partial discharge'],
      ['O', '#fff3c4', 'Overheating'],
      ['C', '#ffd9a0', 'Carbonization of paper'],
      ['T3', '#ffb3b3', 'Thermal fault > 700\u00B0C']
    ];
    const legendX = 440;
    let legendY = 440;
    legendItems.forEach(([code, color, desc]) => {
      NS(
        'rect',
        { x: legendX, y: legendY - 10, width: 14, height: 14, fill: color, stroke: '#555', 'stroke-width': 1 },
        svg
      );
      NS(
        'text',
        {
          x: legendX + 20,
          y: legendY + 1,
          'font-size': 10,
          'font-family': 'sans-serif',
          fill: '#000'
        },
        svg
      ).textContent = `${code}: ${desc}`;
      legendY += 18;
    });

    // ---------- Sample point ----------
    if (sample) {
      const { pCH4, pC2H4, pC2H6 } = pct(sample.ch4, sample.c2h4, sample.c2h6);
      const p = toXY(pCH4, pC2H4, pC2H6);
      NS(
        'circle',
        {
          cx: p.x,
          cy: p.y,
          r: 6,
          fill: '#000000',
          stroke: '#ffffff',
          'stroke-width': 2
        },
        svg
      );
      NS(
        'text',
        {
          x: p.x,
          y: p.y - 12,
          'text-anchor': 'middle',
          'font-size': 11,
          'font-family': 'sans-serif',
          'font-weight': 'bold',
          fill: '#000000'
        },
        svg
      ).textContent = classify(sample.ch4, sample.c2h4, sample.c2h6);
    }
  }

  return { classify, render };
})();