const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const total = ch4 + c2h4 + c2h2;
    if (total <= 0) return 'T3';
    const x = (ch4 / total) * 100;
    const y = (c2h4 / total) * 100;
    const z = (c2h2 / total) * 100;

    if (z >= 98) return 'PD';
    if (x >= 98) return 'T1';
    if (z >= 23 && z <= 40 && x <= 40) return 'D1';
    if (z >= 40 && z < 98 && x <= 15) return 'D2';
    if (y >= 50 && z <= 15) return 'T2';
    return 'T3';
  },

  render(svg, sample) {
    const xmlns = 'http://www.w3.org/2000/svg';
    const triangleHeight = Math.sqrt(3) * 300;

    // Clear SVG
    while (svg.firstChild) svg.firstChild.remove();

    // Outer triangle
    const triangle = document.createElementNS(xmlns, 'polygon');
    triangle.setAttribute('points', `0,540 600,540 300,${540 - triangleHeight}`);
    triangle.setAttribute('stroke', '#000');
    triangle.setAttribute('fill', 'none');
    svg.appendChild(triangle);

    // Gas labels
    const gases = [
      { x: 5, y: 520, text: 'CH4' },
      { x: 580, y: 520, text: 'C2H4' },
      { x: 300, y: 25, text: 'C2H2' }
    ];
    
    gases.forEach(gas => {
      const text = document.createElementNS(xmlns, 'text');
      text.setAttribute('x', gas.x);
      text.setAttribute('y', gas.y);
      text.textContent = gas.text;
      text.setAttribute('font-family', 'Arial, sans-serif');
      text.setAttribute('font-size', '16');
      if (gas.text === 'C2H2') text.setAttribute('text-anchor', 'middle');
      svg.appendChild(text);
    });

    // Axes ticks and percentages
    const tickInfo = [
      { axis: 'y', positions: [0.2, 0.4, 0.6, 0.8] },
      { axis: 'x', positions: [0.2, 0.4, 0.6, 0.8] },
      { axis: 'z', positions: [0.2, 0.4, 0.6, 0.8] }
    ];

    tickInfo.forEach(info => {
      info.positions.forEach(pos => {
        let x, y;
        if (info.axis === 'y') {
          // C2H4 axis (bottom right)
          const length = 8;
          x = 600 - 600 * pos;
          y = 540;
          const tick = document.createElementNS(xmlns, 'line');
          tick.setAttribute('x1', x);
          tick.setAttribute('y1', y);
          tick.setAttribute('x2', x);
          tick.setAttribute('y2', y - length);
          tick.setAttribute('stroke', '#000');
          svg.appendChild(tick);
          
          const label = document.createTextNode(`${Math.round(pos * 100)}%`);
          const text = document.createElementNS(xmlns, 'text');
          text.setAttribute('x', x);
          text.setAttribute('y', y - length - 5);
          text.setAttribute('text-anchor', 'middle');
          text.appendChild(label);
          svg.appendChild(text);
        } else if (info.axis === 'x') {
          // CH4 axis (bottom left)
          const length = 8;
          x = 600 * pos;
          y = 540;
          const tick = document.createElementNS(xmlns, 'line');
          tick.setAttribute('x1', x);
          tick.setAttribute('y1', y);
          tick.setAttribute('x2', x);
          tick.setAttribute('y2', y - length);
          tick.setAttribute('stroke', '#000');
          svg.appendChild(tick);
          
          // Inverted percentages for CH4
          const label = document.createTextNode(`${Math.round(100 - pos * 100)}%`);
          const text = document.createElementNS(xmlns, 'text');
          text.setAttribute('x', x);
          text.setAttribute('y', y - length - 5);
          text.setAttribute('text-anchor', 'middle');
          text.appendChild(label);
          svg.appendChild(text);
        } else if (info.axis === 'z') {
          // C2H2 axis (top right to left)
          const length = 8;
          x = 300 * (1 + pos);
          y = 540 - triangleHeight * pos;
          const px = 300 * pos;
          const py = triangleHeight * (1 - pos) + 540 - triangleHeight;
          const tick = document.createElementNS(xmlns, 'line');
          tick.setAttribute('x1', x);
          tick.setAttribute('y1', y);
          tick.setAttribute('x2', x - length * Math.cos(Math.PI/6));
          tick.setAttribute('y2', y + length * Math.sin(Math.PI/6));
          tick.setAttribute('stroke', '#000');
          svg.appendChild(tick);
          
          const label = document.createTextNode(`${Math.round(pos * 100)}%`);
          const text = document.createElementNS(xmlns, 'text');
          text.setAttribute('x', x + 10);
          text.setAttribute('y', y + 5);
          text.appendChild(label);
          svg.appendChild(text);
        }
      });
    });

    // Zone labels
    const zones = [
      { x: 500, y: 120, text: 'D1', fill: '#ff9999' },
      { x: 400, y: 60, text: 'D2', fill: '#fc9a1c' },
      { x: 200, y: 500, text: 'T1', fill: '#ccffaa' },
      { x: 400, y: 500, text: 'T2', fill: '#9de0ff' },
      { x: 100, y: 200, text: 'PD', fill: '#f9d8e6' },
      { x: 320, y: 300, text: 'T3', fill: '#ffffc0' }
    ];
    
    zones.forEach(zone => {
      const text = document.createElementNS(xmlns, 'text');
      text.setAttribute('x', zone.x);
      text.setAttribute('y', zone.y);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-weight', 'bold');
      text.textContent = zone.text;
      text.setAttribute('fill', '#111');
      svg.appendChild(text);
    });

    // Draw sample point if provided
    if (sample && typeof sample === 'object') {
      const { ch4, c2h4, c2h2 } = sample;
      const total = ch4 + c2h4 + c2h2;
      if (total > 0) {
        const x = ch4 / total;
        const y = c2h4 / total;
        const z = c2h2 / total;
        
        const coordX = 600 * y + 300 * z;
        const coordY = 540 - triangleHeight * z;
        
        if (!isNaN(coordX) && !isNaN(coordY)) {
          const circle = document.createElementNS(xmlns, 'circle');
          circle.setAttribute('cx', coordX);
          circle.setAttribute('cy', coordY);
          circle.setAttribute('r', '6');
          circle.setAttribute('fill', '#ff0000');
          circle.setAttribute('stroke', '#000');
          svg.appendChild(circle);
        }
      }
    }
  }
};
