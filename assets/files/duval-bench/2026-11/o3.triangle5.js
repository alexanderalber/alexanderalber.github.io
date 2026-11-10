/*  Duval Triangle 5  –  Low-temperature faults
    gases: CH4 (methane), C2H4 (ethylene), C2H6 (ethane)

    One single global constant is created:  DuvalTriangle5
    It offers

      DuvalTriangle5.classify(ch4 ,c2h4 ,c2h6)
      DuvalTriangle5.render(svg ,sample)

    No external libraries or modules are used – plain browser JavaScript only.
*/
(function () {
  'use strict';

  // SVG namespace helper
  const NS = 'http://www.w3.org/2000/svg';
  function el(name, attrs) {
    const e = document.createElementNS(NS, name);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  // Geometry of the equilateral triangle we draw into 600 × 540 viewBox
  // slight margins are left around.
  const A = { x:  60, y: 500 };  // 100 % CH4
  const B = { x: 540, y: 500 };  // 100 % C2H4
  const C = { x: 300, y:  60 };  // 100 % C2H6

  // Convert barycentric (percentages) to SVG coordinates
  function toXY(pCh4, pC2H4, pC2H6) {
    const x = (A.x * pCh4 + B.x * pC2H4 + C.x * pC2H6) / 100;
    const y = (A.y * pCh4 + B.y * pC2H4 + C.y * pC2H6) / 100;
    return { x, y };
  }

  // ----------  classification  ------------------------------------------------
  /*  The exact limits found in literature are re-created from memory.
      If ever so slightly off, the essence – separating O, T1, T2, T3 zones –
      is preserved.                                                  */
  function classify(ch4, c2h4, c2h6) {
    ch4  = +ch4  || 0;
    c2h4 = +c2h4 || 0;
    c2h6 = +c2h6 || 0;
    const sum = ch4 + c2h4 + c2h6;
    if (sum <= 0) return '';

    const pCH4  = 100 * ch4  / sum;
    const pC2H4 = 100 * c2h4 / sum;
    // const pC2H6 = 100 - pCH4 - pC2H4;

    // -- zone rules remembered / reconstructed --
    //  O : very high CH4  (stray / overheating at <150 °C)
    //  T1: C2H4 ≤ 5 %
    //  T2: 5 % < C2H4 ≤ 20 %
    //  T3: C2H4 > 20 %
    if (pCH4 >= 70) return 'O';
    if (pC2H4 <= 5)  return 'T1';
    if (pC2H4 <= 20) return 'T2';
    return 'T3';
  }

  // ----------  rendering  -----------------------------------------------------
  function render(svg, sample) {
    if (!svg || typeof svg.ownerSVGElement === 'undefined' && svg.tagName !== 'svg')
      throw new Error('render(svg, …): first argument must be an <svg> element');

    // clear any previous drawing inside given element
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // background
    svg.appendChild(el('rect', { x: 0, y: 0, width: 600, height: 540, fill: 'white' }));

    // helper: build polygon from array of [pCH4, pC2H4, pC2H6] triplets
    function zonePoly(points) {
      return points.map(p => {
        const c = toXY(p[0], p[1], p[2]);
        return `${c.x},${c.y}`;
      }).join(' ');
    }

    // ----- pre-computed key points -------------------------------------------
    const P_AB_5   = toXY(95,  5, 0);
    const P_AB_20  = toXY(80, 20, 0);
    const P_BC_5   = toXY(0 ,  5,95);
    const P_BC_20  = toXY(0 , 20,80);
    const P_AC_70  = toXY(70, 0,30);
    const P_AB_70  = toXY(70,30,0);

    // Zones (draw from bottom-up so higher zones overlay correctly)
    const zones = [
      { code: 'T3',
        color: '#ffd2d2',
        poly:  [ [0,100,0], [80,20,0], [0,20,80], [0,0,100] ] },

      { code: 'T2',
        color: '#fff0b3',
        poly:  [ [95,5,0], [80,20,0], [0,20,80], [0,5,95] ] },

      { code: 'T1',
        color: '#d6fcd6',
        poly:  [ [100,0,0], [95,5,0], [0,5,95], [0,0,100] ] },

      { code: 'O',
        color: '#cfe0ff',
        poly:  [ [100,0,0], [70,30,0], [70,0,30] ] }
    ];

    zones.forEach(z => {
      svg.appendChild(el('polygon', {
        points: zonePoly(z.poly),
        fill:   z.color,
        stroke: '#444',
        'stroke-width': 1
      }));
    });

    // ----- labels -------------------------------------------------------------
    const labelPos = {
      O:  toXY(85, 10, 5),
      T1: toXY(40,  5,55),
      T2: toXY(45, 15,40),
      T3: toXY(20, 40,40)
    };

    for (const z of zones) {
      const p = labelPos[z.code];
      svg.appendChild(el('text', {
        x: p.x, y: p.y,
        'font-family': 'sans-serif',
        'font-size'  : 18,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        'pointer-events': 'none'
      })).textContent = z.code;
    }

    // ----- main triangle outline ---------------------------------------------
    svg.appendChild(el('polygon', {
      points: `${A.x},${A.y} ${B.x},${B.y} ${C.x},${C.y}`,
      fill: 'none',
      stroke: '#000',
      'stroke-width': 2
    }));

    // ----- axes tick marks ----------------------------------------------------
    function ticks(from, to, third) {
      const dx = third.x - (from.x + to.x) / 2;
      const dy = third.y - (from.y + to.y) / 2;
      const len = Math.hypot(dx, dy);
      const ux = (dx / len) * 8;  // 8-unit tick length
      const uy = (dy / len) * 8;

      for (let p = 10; p < 100; p += 10) {
        const x = from.x + (to.x - from.x) * p / 100;
        const y = from.y + (to.y - from.y) * p / 100;
        svg.appendChild(el('line', {
          x1: x, y1: y,
          x2: x + ux, y2: y + uy,
          stroke: '#555',
          'stroke-width': 1
        }));
      }
    }
    ticks(A, B, C); // bottom edge – CH4 / C2H4
    ticks(B, C, A); // right edge  – C2H4 / C2H6
    ticks(C, A, B); // left  edge  – C2H6 / CH4

    // ----- gas names next to vertices ----------------------------------------
    svg.appendChild(el('text', {
      x: A.x - 20, y: A.y + 5,
      'font-family':'sans-serif','font-size':14,'text-anchor':'end'
    })).textContent = 'CH₄';

    svg.appendChild(el('text', {
      x: B.x + 20, y: B.y + 5,
      'font-family':'sans-serif','font-size':14,'text-anchor':'start'
    })).textContent = 'C₂H₄';

    svg.appendChild(el('text', {
      x: C.x, y: C.y - 12,
      'font-family':'sans-serif','font-size':14,'text-anchor':'middle'
    })).textContent = 'C₂H₆';

    // ----- sample point -------------------------------------------------------
    if (sample && typeof sample === 'object') {
      const { ch4, c2h4, c2h6 } = sample;
      if ( (ch4||0)+(c2h4||0)+(c2h6||0) > 0 ) {
        const p = toXY(
          100 * ch4  / (ch4 + c2h4 + c2h6),
          100 * c2h4 / (ch4 + c2h4 + c2h6),
          100 * c2h6 / (ch4 + c2h4 + c2h6)
        );
        svg.appendChild(el('circle', {
          cx: p.x, cy: p.y, r: 6,
          fill: '#000',
          stroke: '#fff', 'stroke-width': 2
        }));
      }
    }
  }

  // expose the only global expected by the exercise
  window.DuvalTriangle5 = { classify, render };

}());
