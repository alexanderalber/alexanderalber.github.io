/*  DuvalPentagon – very compact, self-contained implementation of
    the “Duval Pentagon 1” used for dissolved-gas analysis (DGA)
    of mineral-oil-filled transformers.

    The code is written from memory; the drawing and the boundaries
    follow the author’s recollection – exact coincidence with every
    published chart is not guaranteed.                            */

const DuvalPentagon = (() => {

  /*---------------------------------------------------------------
    Helper – finite positive number
  ----------------------------------------------------------------*/
  function pos(x) {
    return (typeof x === 'number' && isFinite(x) && x >= 0) ? x : 0;
  }

  /*---------------------------------------------------------------
    CLASSIFICATION (best-effort recollection)
    Returns one of: PD, D1, D2, T1, T2, T3
  ----------------------------------------------------------------*/
  function classify(h2, ch4, c2h6, c2h4, c2h2) {

    h2   = pos(h2);
    ch4  = pos(ch4);
    c2h6 = pos(c2h6);
    c2h4 = pos(c2h4);
    c2h2 = pos(c2h2);

    const sum = h2 + ch4 + c2h6 + c2h4 + c2h2;
    if (sum === 0) return 'T1';               // arbitrary but safe

    /*  normalised percentages (0 … 100)  */
    const fH2   = 100 * h2   / sum;
    const fCH4  = 100 * ch4  / sum;
    const fC2H6 = 100 * c2h6 / sum;
    const fC2H4 = 100 * c2h4 / sum;
    const fC2H2 = 100 * c2h2 / sum;

    /*  simplified, literature-inspired rules  */

    /*  Partial discharges – dominant CH4, little high-energy gases */
    if (fCH4 > 35 &&
        fCH4 >= 2 * fC2H4 &&
        fCH4 >= 2 * fC2H2) {
      return 'PD';
    }

    /*  Arcing faults – appreciable acetylene                       */
    if (fC2H2 >= 15) {
      return 'D2';
    }
    if (fC2H2 >= 4) {
      return 'D1';
    }

    /*  Purely thermal faults – based on total unsaturated C2’s     */
    const hot = fC2H4 + fC2H6;

    if (hot < 20)  return 'T1';   // < 150 °C
    if (hot < 50)  return 'T2';   // 150 … 300 °C
    return 'T3';                  // > 300 °C
  }

  /*---------------------------------------------------------------
    RENDERING
  ----------------------------------------------------------------*/
  function render(svg, sample /* = null | {h2, ch4, c2h6, c2h4, c2h2} */) {

    const NS = 'http://www.w3.org/2000/svg';

    /*  clear the svg completely  */
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    /*  convenience creators  */
    function $el(name, attrs) {
      const n = document.createElementNS(NS, name);
      for (const k in attrs) n.setAttribute(k, attrs[k]);
      return n;
    }

    /*-------------------------------------------------------------
      Geometry – regular pentagon
    --------------------------------------------------------------*/
    const CX = 300, CY = 300;     // viewBox centre
    const R  = 280;               // outer radius

    /*  axis arrangement (clockwise, starting top)  */
    const gases = [
      {key:'H2',   angle:-90,  color:'#cccccc'},
      {key:'CH4',  angle:-18,  color:'#fdae6b'},
      {key:'C2H6', angle: 54,  color:'#bdd7e7'},
      {key:'C2H4', angle:126,  color:'#6baed6'},
      {key:'C2H2', angle:198,  color:'#fb6a4a'}
    ];

    /*  vertex coordinates                                         */
    gases.forEach(g => {
      const rad = g.angle * Math.PI / 180;
      g.vx = CX + R * Math.cos(rad);
      g.vy = CY + R * Math.sin(rad);
    });

    /*-------------------------------------------------------------
      Pre-defined colours for the six principal zones
    --------------------------------------------------------------*/
    const ZCOL = {
      'T1':'#d9f0d3',
      'T2':'#a6dba0',
      'T3':'#5aae61',
      'PD':'#fdae6b',
      'D1':'#f46d43',
      'D2':'#d73027'
    };

    /*-------------------------------------------------------------
      Three concentric pentagons:
        r0 … r1 :  T1
        r1 … r2 :  T2
        r2 … R  :  sector-dependent (PD, D1, D2, T3)
    --------------------------------------------------------------*/
    const r0 = 0;          // centre
    const r1 = R * 0.33;
    const r2 = R * 0.66;

    /*  helper: point at fraction (0…1) on axis i                  */
    function pt(i, frac) {
      return {
        x: CX + frac * (gases[i].vx - CX),
        y: CY + frac * (gases[i].vy - CY)
      };
    }

    /*  draw filled polygon and label                              */
    function drawPoly(points, fill, label) {
      const poly = $el('polygon', {
        points: points.map(p => p.x + ',' + p.y).join(' '),
        fill:  fill,
        stroke:'#000',
        'stroke-width':0.8
      });
      svg.appendChild(poly);

      /*  label in centroid                                         */
      const cx = points.reduce((s,p)=>s+p.x,0)/points.length;
      const cy = points.reduce((s,p)=>s+p.y,0)/points.length;
      const t = $el('text',{
        x:cx, y:cy,
        'font-family':'sans-serif',
        'font-size':'16',
        'text-anchor':'middle',
        'dominant-baseline':'middle'
      });
      t.textContent = label;
      svg.appendChild(t);
    }

    /*---------------- central pentagon (T1) ----------------------*/
    drawPoly(gases.map((g,i)=>pt(i,r1/R)), ZCOL.T1, 'T1');

    /*---------------- middle ring (T2) ---------------------------*/
    for (let i=0;i<5;i++){
      const p  = pt(i,   r1/R);
      const p2 = pt(i+1>4?0:i+1, r1/R);
      const q2 = pt(i+1>4?0:i+1, r2/R);
      const q  = pt(i,   r2/R);
      drawPoly([p,p2,q2,q], ZCOL.T2, 'T2');
    }

    /*---------------- outer ring (various) -----------------------*/
    /*  crude allocation, matching dominate-gases idea             */
    const outerCode = ['T3','PD','D1','T3','D2']; // wedges 0-4
    for (let i=0;i<5;i++){
      const p  = pt(i,   r2/R);
      const p2 = pt(i+1>4?0:i+1, r2/R);
      const q2 = pt(i+1>4?0:i+1, 1);
      const q  = pt(i,   1);
      drawPoly([p,p2,q2,q], ZCOL[ outerCode[i] ], outerCode[i]);
    }

    /*-------------------------------------------------------------
      Axes and gas labels
    --------------------------------------------------------------*/
    gases.forEach(g => {
      /* axis line */
      svg.appendChild($el('line',{
        x1:CX, y1:CY, x2:g.vx, y2:g.vy,
        stroke:'#000', 'stroke-width':1
      }));
      /* gas label */
      const lx = CX + 1.08 * (g.vx - CX);
      const ly = CY + 1.08 * (g.vy - CY);
      svg.appendChild($el('text',{
        x:lx, y:ly,
        'font-family':'sans-serif',
        'font-size':'14',
        'text-anchor':'middle',
        'dominant-baseline':'middle'
      })).textContent = g.key;
    });

    /*-------------------------------------------------------------
      Optional sample marker
    --------------------------------------------------------------*/
    if (sample){
      const total = pos(sample.h2)+pos(sample.ch4)+pos(sample.c2h6)+
                    pos(sample.c2h4)+pos(sample.c2h2) || 1;
      const fracs = [
        pos(sample.h2)   / total,
        pos(sample.ch4)  / total,
        pos(sample.c2h6) / total,
        pos(sample.c2h4) / total,
        pos(sample.c2h2) / total
      ];

      /*  barycentric position  */
      let sx = CX, sy = CY;
      for (let i=0;i<5;i++){
        sx += (gases[i].vx - CX) * fracs[i];
        sy += (gases[i].vy - CY) * fracs[i];
      }

      svg.appendChild($el('circle',{
        cx:sx, cy:sy, r:6,
        fill:'#ff0000', stroke:'#000', 'stroke-width':1
      }));
    }
  }

  /*---------------------------------------------------------------
    public API
  ----------------------------------------------------------------*/
  return { classify, render };

})();
