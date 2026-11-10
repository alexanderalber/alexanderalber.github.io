const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const total = ch4 + c2h4 + c2h6;
    const pctC2H4 = (c2h4 / total) * 100;
    const pctC2H6 = (c2h6 / total) * 100;

    if (pctC2H4 > 50) return 'T3';
    if (pctC2H4 > 13) return 'T2';
    if (pctC2H6 >= 85 && pctC2H4 <= 2) return 'S';
    if (pctC2H6 >= 60) return 'O';
    return 'C';
  },

  render(svg, sample) {
    const NS = 'http://www.w3.org/2000/svg';

    const A = { x: 300, y: 20 };
    const B = { x: 30, y: 500 };
    const C = { x: 570, y: 500 };

    function toXY(ch4, c2h4, c2h6) {
      return {
        x: (ch4 / 100) * A.x + (c2h4 / 100) * C.x + (c2h6 / 100) * B.x,
        y: (ch4 / 100) * A.y + (c2h4 / 100) * C.y + (c2h6 / 100) * B.y
      };
    }

    const zones = [
      { code: 'S', color: '#98FB98', vertices: [[0,0,100],[0,2,98],[13,2,85],[15,0,85]] },
      { code: 'O', color: '#FFFACD', vertices: [[0,2,98],[0,13,87],[27,13,60],[40,0,60],[15,0,85],[13,2,85]] },
      { code: 'C', color: '#FFDAB9', vertices: [[100,0,0],[40,0,60],[27,13,60],[87,13,0]] },
      { code: 'T2', color: '#FFA07A', vertices: [[0,13,87],[0,50,50],[50,50,0],[87,13,0]] },
      { code: 'T3', color: '#FA8072', vertices: [[0,50,50],[0,100,0],[50,50,0]] }
    ];

    zones.forEach(zone => {
      const polygon = document.createElementNS(NS, 'polygon');
      const points = zone.vertices.map(v => {
        const pt = toXY(v[0], v[1], v[2]);
        return `${pt.x},${pt.y}`;
      }).join(' ');
      polygon.setAttribute('points', points);
      polygon.setAttribute('fill', zone.color);
      polygon.setAttribute('stroke', '#333');
      polygon.setAttribute('stroke-width', '1');
      svg.appendChild(polygon);
    });

    zones.forEach(zone => {
      let cx = 0, cy = 0;
      zone.vertices.forEach(v => {
        const pt = toXY(v[0], v[1], v[2]);
        cx += pt.x;
        cy += pt.y;
      });
      cx /= zone.vertices.length;
      cy /= zone.vertices.length;

      const label = document.createElementNS(NS, 'text');
      label.setAttribute('x', cx);
      label.setAttribute('y', cy);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'middle');
      label.setAttribute('font-size', '18');
      label.setAttribute('font-weight', 'bold');
      label.setAttribute('fill', '#000');
      label.textContent = zone.code;
      svg.appendChild(label);
    });

    const outline = document.createElementNS(NS, 'polygon');
    outline.setAttribute('points', `${A.x},${A.y} ${B.x},${B.y} ${C.x},${C.y}`);
    outline.setAttribute('fill', 'none');
    outline.setAttribute('stroke', '#000');
    outline.setAttribute('stroke-width', '2');
    svg.appendChild(outline);

    function drawTicks(p1, p2, labelSide, gasName) {
      const tickLen = 8;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const nx = -dy / len * tickLen * labelSide;
      const ny = dx / len * tickLen * labelSide;

      for (let i = 0; i <= 100; i += 10) {
        const t = i / 100;
        const x = p1.x + t * dx;
        const y = p1.y + t * dy;

        const tick = document.createElementNS(NS, 'line');
        tick.setAttribute('x1', x);
        tick.setAttribute('y1', y);
        tick.setAttribute('x2', x + nx);
        tick.setAttribute('y2', y + ny);
        tick.setAttribute('stroke', '#000');
        tick.setAttribute('stroke-width', '1');
        svg.appendChild(tick);

        if (i % 20 === 0) {
          const text = document.createElementNS(NS, 'text');
          text.setAttribute('x', x + nx * 2.5);
          text.setAttribute('y', y + ny * 2.5);
          text.setAttribute('text-anchor', 'middle');
          text.setAttribute('dominant-baseline', 'middle');
          text.setAttribute('font-size', '10');
          text.textContent = i;
          svg.appendChild(text);
        }
      }

      const midX = (p1.x + p2.x) / 2 + nx * 5;
      const midY = (p1.y + p2.y) / 2 + ny * 5;
      const nameLabel = document.createElementNS(NS, 'text');
      nameLabel.setAttribute('x', midX);
      nameLabel.setAttribute('y', midY);
      nameLabel.setAttribute('text-anchor', 'middle');
      nameLabel.setAttribute('dominant-baseline', 'middle');
      nameLabel.setAttribute('font-size', '14');
      nameLabel.setAttribute('font-weight', 'bold');
      nameLabel.textContent = gasName;
      svg.appendChild(nameLabel);
    }

    drawTicks(B, C, 1, '%C₂H₄');
    drawTicks(C, A, 1, '%CH₄');
    drawTicks(A, B, -1, '%C₂H₆');

    const cornerLabels = [
      { text: 'CH₄', x: A.x, y: A.y - 25, anchor: 'middle' },
      { text: 'C₂H₆', x: B.x - 20, y: B.y + 20, anchor: 'middle' },
      { text: 'C₂H₄', x: C.x + 20, y: C.y + 20, anchor: 'middle' }
    ];

    cornerLabels.forEach(lbl => {
      const text = document.createElementNS(NS, 'text');
      text.setAttribute('x', lbl.x);
      text.setAttribute('y', lbl.y);
      text.setAttribute('text-anchor', lbl.anchor);
      text.setAttribute('font-size', '14');
      text.setAttribute('font-weight', 'bold');
      text.textContent = lbl.text;
      svg.appendChild(text);
    });

    if (sample) {
      const total = sample.ch4 + sample.c2h4 + sample.c2h6;
      const pt = toXY(
        (sample.ch4 / total) * 100,
        (sample.c2h4 / total) * 100,
        (sample.c2h6 / total) * 100
      );

      const marker = document.createElementNS(NS, 'circle');
      marker.setAttribute('cx', pt.x);
      marker.setAttribute('cy', pt.y);
      marker.setAttribute('r', '8');
      marker.setAttribute('fill', '#FF0000');
      marker.setAttribute('stroke', '#000');
      marker.setAttribute('stroke-width', '2');
      svg.appendChild(marker);
    }
  }
};
