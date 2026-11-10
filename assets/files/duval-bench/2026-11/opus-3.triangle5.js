const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const total = ch4 + c2h4 + c2h6;
    if (total <= 0) {
      throw new Error('Invalid concentrations');
    }
    
    const pch4 = 100 * ch4 / total;
    const pc2h4 = 100 * c2h4 / total;
    const pc2h6 = 100 * c2h6 / total;

    if (pch4 >= 98) return 'PD';
    if (pc2h4 >= 98) return 'D2';
    if (pc2h6 >= 98) return 'D1';
    if (pch4 >= 50 && pch4 + pc2h6 >= 96) return 'ND'; 
    if (pch4 >= 50 && pch4 + pc2h4 >= 96) return 'D2';
    if (pc2h6 >= 85 && pc2h6 + pch4 <= 96) return 'D1';
    if (pc2h4 >= 50 && pc2h4 + pch4 <= 96) return 'D2';
    if (pch4 >= 50 && pc2h6 <= 34) return 'DT';
    return 'T1';
  },

  render(svg, sample) {
    const NS = 'http://www.w3.org/2000/svg';

    function drawTriangle() {
      const polygon = document.createElementNS(NS, 'polygon');
      polygon.setAttribute('points', '300,18 18,522 582,522');
      polygon.setAttribute('fill', 'none');
      polygon.setAttribute('stroke', 'black');
      svg.appendChild(polygon);
    }

    function drawAxes() {
      const axes = [
        { gas: '%CH₄', points: '300,18 300,522' },
        { gas: '%C₂H₄', points: '582,522 300,522' },
        { gas: '%C₂H₆', points: '300,522 18,522' }
      ];
      
      for (const { gas, points } of axes) {
        const line = document.createElementNS(NS, 'polyline');
        line.setAttribute('points', points);
        line.setAttribute('stroke', 'black');
        svg.appendChild(line);

        const label = document.createElementNS(NS, 'text');
        const [x, y] = points.split(' ')[1].split(',');
        label.setAttribute('x', x);
        label.setAttribute('y', Number(y) + 15);
        label.setAttribute('text-anchor', 'middle');
        label.textContent = gas;
        svg.appendChild(label);
      }
    }
    
    function drawZones() {
      const zones = [
        { id: 'PD', points: '300,18 426,102 174,102' },
        { id: 'D1', points: '18,522 174,438 174,102 18,186' },    
        { id: 'D2', points: '582,522 426,438 426,102 582,186' },
        { id: 'ND', points: '174,102 300,18 426,102 300,186' },
        { id: 'DT', points: '426,102 300,186 300,354 426,438 582,186 582,522 300,522 174,438 18,522 18,186 174,102' },
        { id: 'T1', points: '174,438 300,354 426,438' }
      ];

      for (const { id, points } of zones) {
        const polygon = document.createElementNS(NS, 'polygon');
        polygon.setAttribute('points', points);
        polygon.setAttribute('fill', 'none');
        polygon.setAttribute('stroke', 'black');
        svg.appendChild(polygon);
        
        const label = document.createElementNS(NS, 'text');
        const [x, y] = points.split(' ')[0].split(',');
        label.setAttribute('x', x);
        label.setAttribute('y', Number(y) - 5);
        label.textContent = id;
        svg.appendChild(label);
      }
    }

    function drawSample(sample) {
      const { ch4, c2h4, c2h6 } = sample;
      const total = ch4 + c2h4 + c2h6;
      if (total <= 0) return;

      const pch4 = ch4 / total;
      const pc2h6 = c2h6 / total;
      
      const x = 300 * (1 - pch4 - pc2h6 / 2);
      const y = 540 * pc2h6;

      const circle = document.createElementNS(NS, 'circle');
      circle.setAttribute('cx', x);
      circle.setAttribute('cy', y);
      circle.setAttribute('r', 4);
      circle.setAttribute('fill', 'red');
      svg.appendChild(circle);
    }

    drawTriangle();
    drawAxes();
    drawZones();
    if (sample) drawSample(sample);
  }
};