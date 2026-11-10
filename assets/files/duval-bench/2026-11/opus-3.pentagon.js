const DuvalPentagon = {
  
  classify(h2, ch4, c2h6, c2h4, c2h2) {
    const total = h2 + ch4 + c2h6 + c2h4 + c2h2;
    if (total === 0) {
      return 'INVALID';
    }
    const percents = {
      h2:   h2   / total * 100, 
      ch4:  ch4  / total * 100,
      c2h6: c2h6 / total * 100, 
      c2h4: c2h4 / total * 100,
      c2h2: c2h2 / total * 100
    };
    
    if (percents.c2h2 >= 13) {
      return 'D1';
    } else if (percents.c2h4 >= 50) {
      return 'D2';
    } else if (percents.c2h4 >= 20 && percents.c2h4 < 50) {
      return 'T1';
    } else if (percents.c2h4 < 20) {
      if (percents.c2h2 < 13 && percents.ch4 < 50 && percents.c2h6 < 20) {
        return 'PD';
      } else if (percents.c2h6 >= 20 && percents.ch4 < 50) {
        return 'T2';
      } else if (percents.ch4 >= 50 && percents.c2h6 < 20) {
        return 'T3';
      } else if (percents.ch4 >= 50 && percents.c2h6 >= 20) {
        return 'DT';
      } 
    }
    
    return 'INVALID'; // catch-all for unclassifiable samples
  },

  render(svg, sample) {
    const NS = 'http://www.w3.org/2000/svg';
    const size = 600;
    const center = size / 2;

    // Duval zone coordinates (relative to center)
    const zones = [
      {code: 'PD', points: [[0,0], [40,18], [32,44], [17,40]]},
      {code: 'D1', points: [[40,18], [46,0], [98,0], [98,38], [68,48]]},
      {code: 'D2', points: [[68,48], [98,38], [98,98], [48,98], [40,58]]},
      {code: 'T1', points: [[40,58], [48,98], [0,98], [0,52]]},
      {code: 'T2', points: [[32,44], [40,58], [0,52], [0,44]]},      
      {code: 'T3', points: [[17,40], [32,44], [0,44], [0,34]]},
      {code: 'DT', points: [[0,0], [17,40], [0,34]]}
    ];

    // Render zones
    for (let zone of zones) {
      let polygon = document.createElementNS(NS, 'polygon');
      let points = zone.points.map(p => `${p[0]+center},${center-p[1]}`).join(' ');
      polygon.setAttributeNS(null, 'points', points);
      polygon.setAttributeNS(null, 'fill', 'none');
      polygon.setAttributeNS(null, 'stroke', 'black');
      svg.appendChild(polygon);

      let text = document.createElementNS(NS, 'text');
      let [x, y] = computeZoneLabelPosition(zone.points);
      text.setAttributeNS(null, 'x', x);  
      text.setAttributeNS(null, 'y', y);
      text.setAttributeNS(null, 'text-anchor', 'middle');
      text.textContent = zone.code;
      svg.appendChild(text);
    }
      
    // Render axes  
    const gases = ['H2', 'CH4', 'C2H6', 'C2H4', 'C2H2'];
    for (let i = 0; i < 5; i++) {
      let line = document.createElementNS(NS, 'line');
      let angle = i * Math.PI * 0.4;
      let x2 = center + Math.cos(angle) * center;
      let y2 = center - Math.sin(angle) * center;
      line.setAttributeNS(null, 'x1', center);
      line.setAttributeNS(null, 'y1', center);
      line.setAttributeNS(null, 'x2', x2);    
      line.setAttributeNS(null, 'y2', y2);
      line.setAttributeNS(null, 'stroke', 'black');
      svg.appendChild(line);

      let text = document.createElementNS(NS, 'text');
      text.setAttributeNS(null, 'x', x2);
      text.setAttributeNS(null, 'y', y2);      
      text.setAttributeNS(null, 'text-anchor', 'middle');
      text.setAttributeNS(null, 'alignment-baseline', 'middle');
      text.textContent = gases[i];
      svg.appendChild(text);
    }
    
    // Render sample point  
    if (sample) {
      const {h2, ch4, c2h6, c2h4, c2h2} = sample;
      const total = h2 + ch4 + c2h6 + c2h4 + c2h2;
      const coords = gases.map((_, i) => {
        const angle = i * Math.PI * 0.4;
        const value = sample[_.toLowerCase()] / total * center * 0.98;
        const x = center + Math.cos(angle) * value;
        const y = center - Math.sin(angle) * value; 
        return [x, y];
      });
      
      let polygon = document.createElementNS(NS, 'polygon');
      let points = coords.map(p => p.join(',')).join(' ');
      polygon.setAttributeNS(null, 'points', points);
      polygon.setAttributeNS(null, 'fill', 'black');
      svg.appendChild(polygon);
    }
  }
};
  
// Helper to compute label positions  
function computeZoneLabelPosition(points) {
  // Average of zone's bounding points
  let x = 0, y = 0;
  for (let p of points) {
    x += p[0];
    y += p[1];
  }
  return [x/points.length + 300, 300 - y/points.length];
}