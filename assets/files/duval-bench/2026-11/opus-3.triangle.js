const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const total = ch4 + c2h4 + c2h2;
    if (total === 0) {
      throw new Error('Invalid input: total gas concentration is zero');
    }
    
    const pch4 = ch4 / total * 100;
    const pc2h4 = c2h4 / total * 100;
    const pc2h2 = c2h2 / total * 100;
    
    if (pch4 >= 98) return 'PD'; 
    if (pc2h4 >= 98) return 'D2';
    if (pc2h2 >= 98) return 'D1';
    if (pc2h4 >= 50 && pc2h2 >= 20 && pc2h2 <= 50) return 'T3';
    if (pch4 >= 50 && pc2h4 >= 23 && pc2h4 <= 50 && pc2h2 <= 20) return 'T2';
    if (pch4 >= 50 && pc2h4 >= 50) return 'T1';
    if (pch4 >= 50 && pc2h4 <= 23 && pc2h2 <= 20) return 'DT';
    if (pc2h2 < 4 && pch4 >= 50 && pc2h4 < 23) return 'DT';
    if (pch4 < 50 && pch4 >= 16 && pc2h4 >= 50) return 'D3';
    if (pc2h2 > 50 && pc2h4 <= 50) return 'D1';
    if (pch4 < 50 && pch4 >= 16 && pc2h4 < 50 && pc2h2 >= 23) return 'D2';
    if (pch4 < 16 && pc2h4 <= 50 && pc2h2 >= 13) return 'D1';
    if (pch4 < 50 && pch4 >= 16 && pc2h2 > 4 && pc2h2 <= 23 && pc2h4 < 50) return 'DT';
    if (pch4 < 16 && pc2h4 <= 23 && pc2h2 < 13) return 'ND';
    return 'ND';
  },

  render(svg, sample) {
    const NS = 'http://www.w3.org/2000/svg';

    function polygon(points, fill) {
      const el = document.createElementNS(NS, 'polygon');  
      el.setAttributeNS(null, 'points', points);
      el.setAttributeNS(null, 'fill', fill);
      el.setAttributeNS(null, 'stroke', 'black');
      svg.appendChild(el);
    }

    function text(x, y, str) {
      const el = document.createElementNS(NS, 'text');
      el.setAttributeNS(null, 'x', x);
      el.setAttributeNS(null, 'y', y);
      el.setAttributeNS(null, 'font-size', '14px');
      el.textContent = str;  
      svg.appendChild(el);
    }

    function line(x1, y1, x2, y2) {
      const el = document.createElementNS(NS, 'line');
      el.setAttributeNS(null, 'x1', x1);
      el.setAttributeNS(null, 'y1', y1); 
      el.setAttributeNS(null, 'x2', x2);
      el.setAttributeNS(null, 'y2', y2);
      el.setAttributeNS(null, 'stroke', 'black');
      svg.appendChild(el);      
    }

    function plotPoint(x, y) {
      const el = document.createElementNS(NS, 'circle');
      el.setAttributeNS(null, 'cx', x);  
      el.setAttributeNS(null, 'cy', y);
      el.setAttributeNS(null, 'r', 4);
      el.setAttributeNS(null, 'fill', 'red');
      svg.appendChild(el);
    }
    
    // Triangle outline
    polygon('20,500 300,20 580,500', 'white');

    // Zone fills  
    polygon('440,410 300,195 300,410', '#ffe599'); // DT
    polygon('300,195 300,410 160,410', '#ffaf40'); // T1 
    polygon('440,410 440,320 300,195', '#a0522d'); // T2
    polygon('440,320 300,195 490,195', '#ff3300'); // T3
    polygon('440,410 440,320 490,195 490,410', '#ff704d'); // D1
    polygon('490,195 580,500 490,410', '#f9cb9c'); // D2
    polygon('300,195 160,410 160,195', '#c1ffc1'); // D3 
    polygon('160,195 160,410 20,500 20,195', '#e6ffe6'); // PD
    polygon('20,195 160,195 300,20 160,20', '#ffffff'); // ND
    
    // Zone labels
    text(360, 360, 'DT');
    text(240, 330, 'T1');
    text(390, 270, 'T2');  
    text(450, 250, 'T3');
    text(470, 330, 'D1');
    text(530, 390, 'D2'); 
    text(210, 300, 'D3');
    text(90, 360, 'PD');
    text(150, 120, 'ND');

    // Axes
    line(20, 500, 300, 20);
    line(300, 20, 580, 500); 
    line(20, 500, 580, 500);

    // Tick marks      
    for (let i = 0; i <= 100; i += 10) {
      const x = 20 + i * 5.6;
      line(x, 500, x, 510);
      if (i > 0) text(x, 530, i + '%');
    }

    // Axis labels  
    text(80, 540, '%CH4');
    text(340, 60, '%C2H4');
    text(520, 540, '%C2H2');

    // Sample point  
    if (sample) {
      const total = sample.ch4 + sample.c2h4 + sample.c2h2;
      if (total > 0) {
        const pch4 = sample.ch4 / total;
        const pc2h4 = sample.c2h4 / total;
        const x = 20 + 560 * (1 - pch4 - pc2h4 / 2);
        const y = 500 - 480 * pc2h4;
        plotPoint(x, y);  
      }
    }
  }
};