const DuvalTriangle5 = {
  zones: [
    { id: 'T3', name: 'T3', color: '#ff6666', points: [[0, 50, 50], [50, 50, 0], [0, 100, 0]] },
    { id: 'T2', name: 'T2', color: '#ffb366', points: [[0, 35, 65], [65, 35, 0], [50, 50, 0], [0, 50, 50]] },
    { id: 'C', name: 'C', color: '#ffff66', points: [[86, 14, 0], [65, 35, 0], [20, 35, 45], [30, 14, 56]] },
    { id: 'O', name: 'O', color: '#ccffcc', points: [[100, 0, 0], [86, 14, 0], [30, 14, 56], [20, 35, 45], [0, 35, 65], [0, 0, 100]] }
  ],

  to2D(ch4, c2h4, c2h6) {
    const sum = ch4 + c2h4 + c2h6;
    if (sum <= 0) return { x: 300, y: 40 };
    const pCH4 = ch4 / sum;
    const pC2H4 = c2h4 / sum;
    const pC2H6 = c2h6 / sum;
    // Map to triangle: Top(300,40)=CH4, BottomRight(550,473)=C2H4, BottomLeft(50,473)=C2H6
    const x = pCH4 * 300 + pC2H4 * 550 + pC2H6 * 50;
    const y = pCH4 * 40 + pC2H4 * 473 + pC2H6 * 473;
    return { x, y };
  },

  pointInPolygon(point, vs) {
    let x = point.x, y = point.y;
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      let xi = vs[i].x, yi = vs[i].y;
      let xj = vs[j].x, yj = vs[j].y;
      let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  },

  classify(ch4, c2h4, c2h6) {
    if (ch4 + c2h4 + c2h6 <= 0) return 'ND';
    const pt = this.to2D(ch4, c2h4, c2h6);
    for (const zone of this.zones) {
      const poly = zone.points.map(p => this.to2D(p[0], p[1], p[2]));
      if (this.pointInPolygon(pt, poly)) return zone.id;
    }
    return 'ND';
  },

  render(svg, sample) {
    const ns = 'http://www.w3.org/2000/svg';
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // Draw Zones
    for (const zone of this.zones) {
      const poly = zone.points.map(p => this.to2D(p[0], p[1], p[2]));
      const polygon = document.createElementNS(ns, 'polygon');
      polygon.setAttribute('points', poly.map(p => `${p.x},${p.y}`).join(' '));
      polygon.setAttribute('fill', zone.color);
      polygon.setAttribute('stroke', '#333');
      polygon.setAttribute('stroke-width', '1');
      svg.appendChild(polygon);

      // Label
      let cx = 0, cy = 0;
      poly.forEach(p => { cx += p.x; cy += p.y; });
      cx /= poly.length;
      cy /= poly.length;
      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', cx);
      text.setAttribute('y', cy + 5);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-family', 'sans-serif');
      text.setAttribute('font-size', '16');
      text.setAttribute('font-weight', 'bold');
      text.setAttribute('fill', '#000');
      text.textContent = zone.name;
      svg.appendChild(text);
    }

    // Axes Ticks and Labels
    const drawAxis = (p1, p2, label, align, dx, dy, isBottom) => {
      for (let i = 10; i < 100; i += 10) {
        const t = i / 100;
        const tx = p1.x * (1 - t) + p2.x * t;
        const ty = p1.y * (1 - t) + p2.y * t;
        const tick = document.createElementNS(ns, 'line');
        tick.setAttribute('x1', tx);
        tick.setAttribute('y1', ty);
        tick.setAttribute('x2', tx + dx);
        tick.setAttribute('y2', ty + dy);
        tick.setAttribute('stroke', '#000');
        tick.setAttribute('stroke-width', '1');
        svg.appendChild(tick);
      }
      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', (p1.x + p2.x) / 2 + (dx * 3));
      text.setAttribute('y', (p1.y + p2.y) / 2 + (dy * 3) + (isBottom ? 10 : 0));
      text.setAttribute('text-anchor', align);
      text.setAttribute('font-family', 'sans-serif');
      text.setAttribute('font-size', '16');
      text.setAttribute('font-weight', 'bold');
      text.textContent = label;
      svg.appendChild(text);
    };

    const top = { x: 300, y: 40 };
    const br = { x: 550, y: 473 };
    const bl = { x: 50, y: 473 };

    // Left Axis: %CH4
    drawAxis(bl, top, '% CH4', 'end', -10, 5, false);
    // Right Axis: %C2H4
    drawAxis(top, br, '% C2H4', 'start', 10, 5, false);
    // Bottom Axis: %C2H6
    drawAxis(br, bl, '% C2H6', 'middle', 0, 10, true);

    // Plot sample
    if (sample && (sample.ch4 + sample.c2h4 + sample.c2h6 > 0)) {
      const pt = this.to2D(sample.ch4, sample.c2h4, sample.c2h6);
      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', pt.x);
      circle.setAttribute('cy', pt.y);
      circle.setAttribute('r', '6');
      circle.setAttribute('fill', 'blue');
      circle.setAttribute('stroke', 'white');
      circle.setAttribute('stroke-width', '2');
      svg.appendChild(circle);
    }
  }
};
