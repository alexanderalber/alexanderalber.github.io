const DuvalPentagon = {
  gases: ['H2', 'C2H6', 'CH4', 'C2H4', 'C2H2'],
  angles: [90, 162, 234, 306, 18],
  zones: [
    { code: 'PD', color: '#a0d8ef', poly: [[-0.15,0.35],[-0.35,0.15],[-0.25,-0.05],[-0.05,0.05],[0.05,0.25]] },
    { code: 'T1', color: '#90ee90', poly: [[-0.35,0.15],[-0.55,0.25],[-0.75,0.05],[-0.55,-0.25],[-0.25,-0.05]] },
    { code: 'T2', color: '#adff2f', poly: [[-0.55,-0.25],[-0.75,0.05],[-0.65,-0.35],[-0.35,-0.55],[-0.25,-0.05]] },
    { code: 'T3', color: '#ffd700', poly: [[-0.35,-0.55],[-0.65,-0.35],[-0.45,-0.65],[0.05,-0.75],[0.15,-0.45]] },
    { code: 'D1', color: '#ffb6c1', poly: [[0.55,0.25],[0.75,0.05],[0.65,-0.25],[0.35,-0.15],[0.35,0.15]] },
    { code: 'D2', color: '#ff6347', poly: [[0.75,0.05],[0.95,0.25],[0.85,-0.15],[0.65,-0.25],[0.65,-0.05]] },
    { code: 'DT', color: '#da70d6', poly: [[0.35,-0.15],[0.65,-0.25],[0.45,-0.55],[0.05,-0.75],[-0.25,-0.55],[-0.35,-0.15]] }
  ],
  _pointInPolygon(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1];
      const xj = poly[j][0], yj = poly[j][1];
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  },
  classify(h2, ch4, c2h6, c2h4, c2h2) {
    const vals = [h2, ch4, c2h6, c2h4, c2h2];
    const total = vals.reduce((a, b) => a + b, 0);
    if (total <= 0) return 'Invalid';
    const p = {};
    this.gases.forEach((g, i) => { p[g] = vals[i] / total; });
    let x = 0, y = 0;
    for (let i = 0; i < 5; i++) {
      const rad = this.angles[i] * Math.PI / 180;
      x += p[this.gases[i]] * Math.cos(rad);
      y += p[this.gases[i]] * Math.sin(rad);
    }
    for (const z of this.zones) {
      if (this._pointInPolygon(x, y, z.poly)) return z.code;
    }
    if (x > 0.2 && y > 0) return 'D2';
    if (x < -0.2 && y < -0.2) return 'T3';
    return 'DT';
  },
  render(svg, sample) {
    const NS = 'http://www.w3.org/2000/svg';
    const cx = 300, cy = 300, R = 240;
    const rads = this.angles.map(a => a * Math.PI / 180);
    const verts = rads.map(r => [cx + R * Math.cos(r), cy - R * Math.sin(r)]);
    this.zones.forEach(z => {
      const path = document.createElementNS(NS, 'path');
      let d = z.poly.map((pt, i) => {
        const px = cx + pt[0] * R * 0.95;
        const py = cy - pt[1] * R * 0.95;
        return (i === 0 ? 'M' : 'L') + px + ',' + py;
      }).join(' ') + 'Z';
      path.setAttribute('d', d);
      path.setAttribute('fill', z.color);
      path.setAttribute('stroke', '#333');
      path.setAttribute('stroke-width', '1');
      svg.appendChild(path);
    });
    const outer = document.createElementNS(NS, 'path');
    let od = verts.map((v, i) => (i === 0 ? 'M' : 'L') + v[0] + ',' + v[1]).join(' ') + 'Z';
    outer.setAttribute('d', od);
    outer.setAttribute('fill', 'none');
    outer.setAttribute('stroke', '#000');
    outer.setAttribute('stroke-width', '2');
    svg.appendChild(outer);
    for (let i = 0; i < 5; i++) {
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', cx);
      line.setAttribute('y1', cy);
      line.setAttribute('x2', verts[i][0]);
      line.setAttribute('y2', verts[i][1]);
      line.setAttribute('stroke', '#555');
      line.setAttribute('stroke-width', '1');
      svg.appendChild(line);
      const tx = cx + (verts[i][0] - cx) * 1.12;
      const ty = cy + (verts[i][1] - cy) * 1.12;
      const label = document.createElementNS(NS, 'text');
      label.setAttribute('x', tx);
      label.setAttribute('y', ty);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'middle');
      label.setAttribute('font-size', '14');
      label.setAttribute('font-weight', 'bold');
      label.textContent = this.gases[i];
      svg.appendChild(label);
    }
    const centroids = this.zones.map(z => {
      let sx = 0, sy = 0;
      z.poly.forEach(pt => { sx += pt[0]; sy += pt[1]; });
      return [sx / z.poly.length, sy / z.poly.length];
    });
    this.zones.forEach((z, i) => {
      const lx = cx + centroids[i][0] * R * 0.6;
      const ly = cy - centroids[i][1] * R * 0.6;
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', lx);
      t.setAttribute('y', ly);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('font-size', '13');
      t.setAttribute('font-weight', 'bold');
      t.textContent = z.code;
      svg.appendChild(t);
    });
    if (sample) {
      const vals = [sample.h2, sample.ch4, sample.c2h6, sample.c2h4, sample.c2h2];
      const total = vals.reduce((a, b) => a + b, 0);
      if (total > 0) {
        const p = {};
        this.gases.forEach((g, i) => { p[g] = vals[i] / total; });
        let x = 0, y = 0;
        for (let i = 0; i < 5; i++) {
          const r = rads[i];
          x += p[this.gases[i]] * Math.cos(r);
          y += p[this.gases[i]] * Math.sin(r);
        }
        const px = cx + x * R * 0.95;
        const py = cy - y * R * 0.95;
        const mark = document.createElementNS(NS, 'circle');
        mark.setAttribute('cx', px);
        mark.setAttribute('cy', py);
        mark.setAttribute('r', '6');
        mark.setAttribute('fill', '#000');
        mark.setAttribute('stroke', '#fff');
        mark.setAttribute('stroke-width', '2');
        svg.appendChild(mark);
      }
    }
  }
};
