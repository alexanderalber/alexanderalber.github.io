const DuvalPentagon = {
  classify(h2, ch4, c2h6, c2h4, c2h2) {
    const total = h2 + ch4 + c2h6 + c2h4 + c2h2;
    const h2p = h2 / total * 100;
    const ch4p = ch4 / total * 100;
    const c2h6p = c2h6 / total * 100;
    const c2h4p = c2h4 / total * 100;
    const c2h2p = c2h2 / total * 100;

    if (h2p > 100 || ch4p > 100 || c2h6p > 100 || c2h4p > 100 || c2h2p > 100) {
      throw new Error('Invalid input: concentrations must sum to 100%');
    }

    if (c2h2p > 0.5) return 'D1';
    if (c2h4p > 0.5) return 'D2';
    if (c2h6p > 0.5) return 'D3';
    if (h2p > 100 * (1 - (ch4p + c2h6p + c2h4p + c2h2p))) return 'T1';
    if (h2p > 100 * (1 - (ch4p + c2h6p + c2h4p))) return 'T2';
    if (h2p > 100 * (1 - (ch4p + c2h6p))) return 'T3';
    return 'Normal';
  },

  render(svg, sample) {
    const xmlns = 'http://www.w3.org/2000/svg';

    // Draw axes
    const h2Axis = document.createElementNS(xmlns, 'line');
    h2Axis.setAttribute('x1', '300');
    h2Axis.setAttribute('y1', '0');
    h2Axis.setAttribute('x2', '300');
    h2Axis.setAttribute('y2', '600');
    h2Axis.setAttribute('stroke', 'black');
    svg.appendChild(h2Axis);

    const ch4Axis = document.createElementNS(xmlns, 'line');
    ch4Axis.setAttribute('x1', '0');
    ch4Axis.setAttribute('y1', '300');
    ch4Axis.setAttribute('x2', '600');
    ch4Axis.setAttribute('y2', '300');
    ch4Axis.setAttribute('stroke', 'black');
    svg.appendChild(ch4Axis);

    const c2h6Axis = document.createElementNS(xmlns, 'line');
    c2h6Axis.setAttribute('x1', '300');
    c2h6Axis.setAttribute('y1', '600');
    c2h6Axis.setAttribute('x2', '600');
    c2h6Axis.setAttribute('y2', '300');
    c2h6Axis.setAttribute('stroke', 'black');
    svg.appendChild(c2h6Axis);

    const c2h4Axis = document.createElementNS(xmlns, 'line');
    c2h4Axis.setAttribute('x1', '300');
    c2h4Axis.setAttribute('y1', '0');
    c2h4Axis.setAttribute('x2', '0');
    c2h4Axis.setAttribute('y2', '300');
    c2h4Axis.setAttribute('stroke', 'black');
    svg.appendChild(c2h4Axis);

    const c2h2Axis = document.createElementNS(xmlns, 'line');
    c2h2Axis.setAttribute('x1', '0');
    c2h2Axis.setAttribute('y1', '0');
    c2h2Axis.setAttribute('x2', '600');
    c2h2Axis.setAttribute('y2', '600');
    c2h2Axis.setAttribute('stroke', 'black');
    svg.appendChild(c2h2Axis);

    // Draw zone labels
    const normalLabel = document.createElementNS(xmlns, 'text');
    normalLabel.setAttribute('x', '300');
    normalLabel.setAttribute('y', '50');
    normalLabel.setAttribute('text-anchor', 'middle');
    normalLabel.textContent = 'Normal';
    svg.appendChild(normalLabel);

    const t1Label = document.createElementNS(xmlns, 'text');
    t1Label.setAttribute('x', '450');
    t1Label.setAttribute('y', '250');
    t1Label.setAttribute('text-anchor', 'middle');
    t1Label.textContent = 'T1';
    svg.appendChild(t1Label);

    const t2Label = document.createElementNS(xmlns, 'text');
    t2Label.setAttribute('x', '250');
    t2Label.setAttribute('y', '250');
    t2Label.setAttribute('text-anchor', 'middle');
    t2Label.textContent = 'T2';
    svg.appendChild(t2Label);

    const t3Label = document.createElementNS(xmlns, 'text');
    t3Label.setAttribute('x', '150');
    t3Label.setAttribute('y', '250');
    t3Label.setAttribute('text-anchor', 'middle');
    t3Label.textContent = 'T3';
    svg.appendChild(t3Label);

    const d1Label = document.createElementNS(xmlns, 'text');
    d1Label.setAttribute('x', '50');
    d1Label.setAttribute('y', '350');
    d1Label.setAttribute('text-anchor', 'middle');
    d1Label.textContent = 'D1';
    svg.appendChild(d1Label);

    const d2Label = document.createElementNS(xmlns, 'text');
    d2Label.setAttribute('x', '150');
    d2Label.setAttribute('y', '450');
    d2Label.setAttribute('text-anchor', 'middle');
    d2Label.textContent = 'D2';
    svg.appendChild(d2Label);

    const d3Label = document.createElementNS(xmlns, 'text');
    d3Label.setAttribute('x', '250');
    d3Label.setAttribute('y', '550');
    d3Label.setAttribute('text-anchor', 'middle');
    d3Label.textContent = 'D3';
    svg.appendChild(d3Label);

    // Draw zone boundaries
    const t1Boundary = document.createElementNS(xmlns, 'path');
    t1Boundary.setAttribute('d', 'M 300 0 L 600 300 L 450 600 Z');
    t1Boundary.setAttribute('fill', 'none');
    t1Boundary.setAttribute('stroke', 'black');
    svg.appendChild(t1Boundary);

    const t2Boundary = document.createElementNS(xmlns, 'path');
    t2Boundary.setAttribute('d', 'M 300 0 L 300 600 L 250 300 Z');
    t2Boundary.setAttribute('fill', 'none');
    t2Boundary.setAttribute('stroke', 'black');
    svg.appendChild(t2Boundary);

    const t3Boundary = document.createElementNS(xmlns, 'path');
    t3Boundary.setAttribute('d', 'M 0 300 L 300 600 L 150 300 Z');
    t3Boundary.setAttribute('fill', 'none');
    t3Boundary.setAttribute('stroke', 'black');
    svg.appendChild(t3Boundary);

    const d1Boundary = document.createElementNS(xmlns, 'path');
    d1Boundary.setAttribute('d', 'M 0 300 L 0 600 L 50 350 Z');
    d1Boundary.setAttribute('fill', 'none');
    d1Boundary.setAttribute('stroke', 'black');
    svg.appendChild(d1Boundary);

    const d2Boundary = document.createElementNS(xmlns, 'path');
    d2Boundary.setAttribute('d', 'M 0 300 L 150 600 L 150 450 Z');
    d2Boundary.setAttribute('fill', 'none');
    d2Boundary.setAttribute('stroke', 'black');
    svg.appendChild(d2Boundary);

    const d3Boundary = document.createElementNS(xmlns, 'path');
    d3Boundary.setAttribute('d', 'M 0 300 L 300 600 L 250 550 Z');
    d3Boundary.setAttribute('fill', 'none');
    d3Boundary.setAttribute('stroke', 'black');
    svg.appendChild(d3Boundary);

    // Draw sample point
    if (sample) {
      const samplePoint = document.createElementNS(xmlns, 'circle');
      samplePoint.setAttribute('cx', sample.h2 / 100 * 300);
      samplePoint.setAttribute('cy', 600 - sample.ch4 / 100 * 300);
      samplePoint.setAttribute('r', '5');
      samplePoint.setAttribute('fill', 'red');
      svg.appendChild(samplePoint);
    }
  }
};
