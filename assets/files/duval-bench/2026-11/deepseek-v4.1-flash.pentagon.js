const DuvalPentagon = {
  classify(h2, ch4, c2h6, c2h4, c2h2) {
    const total = h2 + ch4 + c2h6 + c2h4 + c2h2;
    if (total <= 0) return 'PD';
    const p = [h2 / total, ch4 / total, c2h6 / total, c2h4 / total, c2h2 / total];

    const V_H2 = [-0.5877852523, -0.8090169944];
    const V_CH4 = [0, 1];
    const V_C2H6 = [-0.9510565163, 0.3090169944];
    const V_C2H4 = [0.9510565163, 0.3090169944];
    const V_C2H2 = [0.5877852523, -0.8090169944];

    const x = p[0] * V_H2[0] + p[1] * V_CH4[0] + p[2] * V_C2H6[0] + p[3] * V_C2H4[0] + p[4] * V_C2H2[0];
    const y = p[0] * V_H2[1] + p[1] * V_CH4[1] + p[2] * V_C2H6[1] + p[3] * V_C2H4[1] + p[4] * V_C2H2[1];
    const pt = [x, y];

    const O = [0, 0];
    const A = [0, -0.8090169944];
    const B = [0.7694208843, -0.25];
    const C = [0.4755282581, 0.6545084972];
    const D = [-0.4755282581, 0.6545084972];
    const E = [-0.7694208843, -0.25];

    const zones = [
      { code: 'PD', poly: [O, E, V_H2] },
      { code: 'D1', poly: [O, V_H2, A, V_C2H2] },
      { code: 'D2', poly: [O, V_C2H2, B, V_C2H4] },
      { code: 'T3', poly: [O, V_C2H4, C] },
      { code: 'T2', poly: [O, C, V_CH4] },
      { code: 'T1', poly: [O, V_CH4, D] },
      { code: 'S', poly: [O, D, V_C2H6, E] }
    ];

    function pip(point, poly) {
      let x = point[0], y = point[1];
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i][0], yi = poly[i][1];
        const xj = poly[j][0], yj = poly[j][1];
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    }

    for (const z of zones) {
      if (pip(pt, z.poly)) return z.code;
    }
    return 'PD';
  },

  render(svg, sample) {
    const NS = 'http://www.w3.org/2000/svg';
    const V_H2 = [-0.5877852523, -0.8090169944];
    const V_CH4 = [0, 1];
    const V_C2H6 = [-0.9510565163, 0.3090169944];
    const V_C2H4 = [0.9510565163, 0.3090169944];
    const V_C2H2 = [0.5877852523, -0.8090169944];
    const O = [0, 0];
    const A = [0, -0.8090169944];
    const B = [0.7694208843, -0.25];
    const C = [0.4755282581, 0.6545084972];
    const D = [-0.4755282581, 0.6545084972];
    const E = [-0.7694208843, -0.25];

    const zones = [
      { code: 'PD', color: '#ffcccc', poly: [O, E, V_H2] },
      { code: 'D1', color: '#ff9999', poly: [O, V_H2, A, V_C2H2] },
      { code: 'D2', color: '#ff6666', poly: [O, V_C2H2, B, V_C2H4] },
      { code: 'T3', color: '#ff9966', poly: [O, V_C2H4, C] },
      { code: 'T2', color: '#ffcc66', poly: [O, C, V_CH4] },
      { code: 'T1', color: '#ffff99', poly: [O, V_CH4, D] },
      { code: 'S', color: '#99ccff', poly: [O, D, V_C2H6, E] }
    ];

    const map = (p) => [300 + p[0] * 220, 300 - p[1] * 220];

    for (const z of zones) {
      const points = z.poly.map(p => map(p).join(',')).join(' ');
      const polyEl = document.createElementNS(NS, 'polygon');
      polyEl.setAttribute('points', points);
      polyEl.setAttribute('fill', z.color);
      polyEl.setAttribute('stroke', '#333');
      polyEl.setAttribute('stroke-width', '1');
      svg.appendChild(polyEl);

      let cx = 0, cy = 0;
      for (const p of z.poly) {
        cx += p[0];
        cy += p[1];
      }
      cx /= z.poly.length;
      cy /= z.poly.length;
      const [sx, sy] = map([cx, cy]);
      const textEl = document.createElementNS(NS, 'text');
      textEl.setAttribute('x', sx);
      textEl.setAttribute('y', sy);
      textEl.setAttribute('text-anchor', 'middle');
      textEl.setAttribute('dominant-baseline', 'middle');
      textEl.setAttribute('font-family', 'sans-serif');
      textEl.setAttribute('font-size', '14');
      textEl.setAttribute('font-weight', 'bold');
      textEl.setAttribute('fill', '#000');
      textEl.textContent = z.code;
      svg.appendChild(textEl);
    }

    const gases = [
      { name: 'H2', v: V_H2 },
      { name: 'CH4', v: V_CH4 },
      { name: 'C2H6', v: V_C2H6 },
      { name: 'C2H4', v: V_C2H4 },
      { name: 'C2H2', v: V_C2H2 }
    ];

    for (const g of gases) {
      const [x1, y1] = map(O);
      const [x2, y2] = map(g.v);
      const lineEl = document.createElementNS(NS, 'line');
      lineEl.setAttribute('x1', x1);
      lineEl.setAttribute('y1', y1);
      lineEl.setAttribute('x2', x2);
      lineEl.setAttribute('y2', y2);
      lineEl.setAttribute('stroke', '#666');
      lineEl.setAttribute('stroke-width', '1');
      lineEl.setAttribute('stroke-dasharray', '4,2');
      svg.appendChild(lineEl);

      const offset = 1.15;
      const [lx, ly] = map([g.v[0] * offset, g.v[1] * offset]);
      const textEl = document.createElementNS(NS, 'text');
      textEl.setAttribute('x', lx);
      textEl.setAttribute('y', ly);
      textEl.setAttribute('text-anchor', 'middle');
      textEl.setAttribute('dominant-baseline', 'middle');
      textEl.setAttribute('font-family', 'sans-serif');
      textEl.setAttribute('font-size', '16');
      textEl.setAttribute('font-weight', 'bold');
      textEl.setAttribute('fill', '#000');
      textEl.textContent = g.name;
      svg.appendChild(textEl);
    }

    if (sample) {
      const total = sample.h2 + sample.ch4 + sample.c2h6 + sample.c2h4 + sample.c2h2;
      if (total > 0) {
        const p = [
          sample.h2 / total,
          sample.ch4 / total,
          sample.c2h6 / total,
          sample.c2h4 / total,
          sample.c2h2 / total
        ];
        const x = p[0] * V_H2[0] + p[1] * V_CH4[0] + p[2] * V_C2H6[0] + p[3] * V_C2H4[0] + p[4] * V_C2H2[0];
        const y = p[0] * V_H2[1] + p[1] * V_CH4[1] + p[2] * V_C2H6[1] + p[3] * V_C2H4[1] + p[4] * V_C2H2[1];
        const [sx, sy] = map([x, y]);
        const circleEl = document.createElementNS(NS, 'circle');
        circleEl.setAttribute('cx', sx);
        circleEl.setAttribute('cy', sy);
        circleEl.setAttribute('r', '5');
        circleEl.setAttribute('fill', 'red');
        circleEl.setAttribute('stroke', 'black');
        circleEl.setAttribute('stroke-width', '1');
        svg.appendChild(circleEl);
      }
    }
  }
};
