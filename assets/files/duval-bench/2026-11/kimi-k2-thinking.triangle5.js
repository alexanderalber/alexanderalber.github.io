const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const total = ch4 + c2h4 + c2h6;
    if (total === 0) return "T1";
    const pCh4 = ch4 / total;
    const pC2h4 = c2h4 / total;
    const pC2h6 = c2h6 / total;
    
    if (pC2h4 >= 0.20) {
      return "T3";
    }
    if (pCh4 > pC2h6) {
      return "T2";
    }
    return "T1";
  },

  render(svg, sample) {
    const ns = "http://www.w3.org/2000/svg";
    
    function create(tag, attrs) {
      const el = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, v);
      }
      return el;
    }
    
    function coord(pCh4, pC2h4, pC2h6) {
      const x = 100 + 200 * pCh4 + 400 * pC2h4;
      const y = 450 - 400 * pCh4;
      return [x, y];
    }
    
    const t1Points = [
      coord(0, 0, 1),
      coord(0, 0.2, 0.8),
      coord(0.4, 0.2, 0.4),
      coord(0.5, 0, 0.5)
    ].map(p => p.join(',')).join(' ');
    
    const t1Poly = create('polygon', {
      points: t1Points,
      fill: '#fffacd',
      stroke: 'black',
      'stroke-width': '1'
    });
    svg.appendChild(t1Poly);
    
    const t2Points = [
      coord(0.5, 0, 0.5),
      coord(0.4, 0.2, 0.4),
      coord(0.8, 0.2, 0),
      coord(1, 0, 0)
    ].map(p => p.join(',')).join(' ');
    
    const t2Poly = create('polygon', {
      points: t2Points,
      fill: '#e6f3ff',
      stroke: 'black',
      'stroke-width': '1'
    });
    svg.appendChild(t2Poly);
    
    const t3Points = [
      coord(0, 0.2, 0.8),
      coord(0, 1, 0),
      coord(0.8, 0.2, 0)
    ].map(p => p.join(',')).join(' ');
    
    const t3Poly = create('polygon', {
      points: t3Points,
      fill: '#ffe4e1',
      stroke: 'black',
      'stroke-width': '1'
    });
    svg.appendChild(t3Poly);
    
    const outerPoints = [
      coord(0, 0, 1),
      coord(0, 1, 0),
      coord(1, 0, 0)
    ].map(p => p.join(',')).join(' ');
    
    const outer = create('polygon', {
      points: outerPoints,
      fill: 'none',
      stroke: 'black',
      'stroke-width': '2'
    });
    svg.appendChild(outer);
    
    const t1Text = create('text', {
      x: '200',
      y: '350',
      'text-anchor': 'middle',
      'font-size': '24',
      'font-family': 'Arial, sans-serif',
      fill: 'black'
    });
    t1Text.textContent = 'T1';
    svg.appendChild(t1Text);
    
    const t2Text = create('text', {
      x: '280',
      y: '200',
      'text-anchor': 'middle',
      'font-size': '24',
      'font-family': 'Arial, sans-serif',
      fill: 'black'
    });
    t2Text.textContent = 'T2';
    svg.appendChild(t2Text);
    
    const t3Text = create('text', {
      x: '370',
      y: '300',
      'text-anchor': 'middle',
      'font-size': '24',
      'font-family': 'Arial, sans-serif',
      fill: 'black'
    });
    t3Text.textContent = 'T3';
    svg.appendChild(t3Text);
    
    const ch4Text = create('text', {
      x: '300',
      y: '35',
      'text-anchor': 'middle',
      'font-size': '20',
      'font-weight': 'bold',
      'font-family': 'Arial, sans-serif',
      fill: 'black'
    });
    ch4Text.textContent = 'CH₄';
    svg.appendChild(ch4Text);
    
    const c2h4Text = create('text', {
      x: '530',
      y: '470',
      'text-anchor': 'middle',
      'font-size': '20',
      'font-weight': 'bold',
      'font-family': 'Arial, sans-serif',
      fill: 'black'
    });
    c2h4Text.textContent = 'C₂H₄';
    svg.appendChild(c2h4Text);
    
    const c2h6Text = create('text', {
      x: '70',
      y: '470',
      'text-anchor': 'middle',
      'font-size': '20',
      'font-weight': 'bold',
      'font-family': 'Arial, sans-serif',
      fill: 'black'
    });
    c2h6Text.textContent = 'C₂H₆';
    svg.appendChild(c2h6Text);
    
    for (let i = 1; i < 10; i++) {
      const t = i / 10;
      const pC2h6 = 1 - t;
      const pCh4 = t;
      const [x, y] = coord(pCh4, 0, pC2h6);
      const [x2, y2] = coord(pCh4 + 0.05, 0, pC2h6 - 0.05);
      const len = 8;
      const dx = (300 - x) / Math.sqrt((300-x)*(300-x) + (300-y)*(300-y)) * len;
      const dy = (300 - y) / Math.sqrt((300-x)*(300-x) + (300-y)*(300-y)) * len;
      
      const tick = create('line', {
        x1: x,
        y1: y,
        x2: x + dx,
        y2: y + dy,
        stroke: 'black',
        'stroke-width': '1'
      });
      svg.appendChild(tick);
      
      if (i % 2 === 0) {
        const num = create('text', {
          x: x + dx * 1.5,
          y: y + dy * 1.5 + 4,
          'text-anchor': 'middle',
          'font-size': '12',
          'font-family': 'Arial, sans-serif',
          fill: 'black'
        });
        num.textContent = (pC2h6 * 100).toFixed(0);
        svg.appendChild(num);
      }
    }
    
    for (let i = 1; i < 10; i++) {
      const t = i / 10;
      const pC2h6 = 1 - t;
      const pC2h4 = t;
      const [x, y] = coord(0, pC2h4, pC2h6);
      
      const tick = create('line', {
        x1: x,
        y1: y,
        x2: x,
        y2: y - 8,
        stroke: 'black',
        'stroke-width': '1'
      });
      svg.appendChild(tick);
      
      if (i % 2 === 0) {
        const num = create('text', {
          x: x,
          y: y + 18,
          'text-anchor': 'middle',
          'font-size': '12',
          'font-family': 'Arial, sans-serif',
          fill: 'black'
        });
        num.textContent = (pC2h4 * 100).toFixed(0);
        svg.appendChild(num);
      }
    }
    
    for (let i = 1; i < 10; i++) {
      const t = i / 10;
      const pC2h4 = 1 - t;
      const pCh4 = t;
      const [x, y] = coord(pCh4, pC2h4, 0);
      const len = 8;
      const dx = (300 - x) / Math.sqrt((300-x)*(300-x) + (300-y)*(300-y)) * len;
      const dy = (300 - y) / Math.sqrt((300-x)*(300-x) + (300-y)*(300-y)) * len;
      
      const tick = create('line', {
        x1: x,
        y1: y,
        x2: x + dx,
        y2: y + dy,
        stroke: 'black',
        'stroke-width': '1'
      });
      svg.appendChild(tick);
      
      if (i % 2 === 0) {
        const num = create('text', {
          x: x + dx * 1.5,
          y: y + dy * 1.5 + 4,
          'text-anchor': 'middle',
          'font-size': '12',
          'font-family': 'Arial, sans-serif',
          fill: 'black'
        });
        num.textContent = (pCh4 * 100).toFixed(0);
        svg.appendChild(num);
      }
    }
    
    if (sample && sample.ch4 !== undefined && sample.c2h4 !== undefined && sample.c2h6 !== undefined) {
      const total = sample.ch4 + sample.c2h4 + sample.c2h6;
      if (total > 0) {
        const pCh4 = sample.ch4 / total;
        const pC2h4 = sample.c2h4 / total;
        const pC2h6 = sample.c2h6 / total;
        const [x, y] = coord(pCh4, pC2h4, pC2h6);
        
        const circle = create('circle', {
          cx: x,
          cy: y,
          r: '7',
          fill: 'red',
          stroke: 'black',
          'stroke-width': '2'
        });
        svg.appendChild(circle);
      }
    }
  }
};
