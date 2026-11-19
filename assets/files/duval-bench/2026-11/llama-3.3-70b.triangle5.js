const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const total = ch4 + c2h4 + c2h6;
    const ch4Ratio = ch4 / total;
    const c2h4Ratio = c2h4 / total;
    const c2h6Ratio = c2h6 / total;

    if (c2h6Ratio < 0.1) {
      if (c2h4Ratio < 0.1) {
        return 'T1';
      } else if (c2h4Ratio < 0.3) {
        return 'T2';
      } else {
        return 'T3';
      }
    } else if (c2h6Ratio < 0.3) {
      if (c2h4Ratio < 0.1) {
        return 'T2';
      } else if (c2h4Ratio < 0.3) {
        return 'D1';
      } else {
        return 'D2';
      }
    } else {
      if (c2h4Ratio < 0.1) {
        return 'D1';
      } else if (c2h4Ratio < 0.3) {
        return 'D2';
      } else {
        return 'D3';
      }
    }
  },
  render(svg, sample) {
    // Clear existing content
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    // Draw axes
    const xAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    xAxis.setAttribute('x1', '50');
    xAxis.setAttribute('y1', '490');
    xAxis.setAttribute('x2', '550');
    xAxis.setAttribute('y2', '490');
    xAxis.setAttribute('stroke', 'black');
    svg.appendChild(xAxis);

    const yAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    yAxis.setAttribute('x1', '50');
    yAxis.setAttribute('y1', '50');
    yAxis.setAttribute('x2', '50');
    yAxis.setAttribute('y2', '490');
    yAxis.setAttribute('stroke', 'black');
    svg.appendChild(yAxis);

    const zAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    zAxis.setAttribute('x1', '50');
    zAxis.setAttribute('y1', '490');
    zAxis.setAttribute('x2', '300');
    zAxis.setAttribute('y2', '50');
    zAxis.setAttribute('stroke', 'black');
    svg.appendChild(zAxis);

    // Draw tick marks and labels
    const tickMark = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    tickMark.setAttribute('x1', '50');
    tickMark.setAttribute('y1', '480');
    tickMark.setAttribute('x2', '50');
    tickMark.setAttribute('y2', '500');
    tickMark.setAttribute('stroke', 'black');
    svg.appendChild(tickMark.cloneNode(true));

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', '40');
    label.setAttribute('y', '515');
    label.textContent = 'CH4';
    svg.appendChild(label);

    const tickMark2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    tickMark2.setAttribute('x1', '40');
    tickMark2.setAttribute('y1', '50');
    tickMark2.setAttribute('x2', '60');
    tickMark2.setAttribute('y2', '50');
    tickMark2.setAttribute('stroke', 'black');
    svg.appendChild(tickMark2.cloneNode(true));

    const label2 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label2.setAttribute('x', '70');
    label2.setAttribute('y', '65');
    label2.textContent = 'C2H4';
    svg.appendChild(label2);

    const tickMark3 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    tickMark3.setAttribute('x1', '300');
    tickMark3.setAttribute('y1', '60');
    tickMark3.setAttribute('x2', '300');
    tickMark3.setAttribute('y2', '40');
    tickMark3.setAttribute('stroke', 'black');
    svg.appendChild(tickMark3.cloneNode(true));

    const label3 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label3.setAttribute('x', '310');
    label3.setAttribute('y', '25');
    label3.textContent = 'C2H6';
    svg.appendChild(label3);

    // Draw zones
    const zone1 = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    zone1.setAttribute('points', '50,490 150,490 100,350');
    zone1.setAttribute('fill', 'blue');
    zone1.setAttribute('opacity', '0.5');
    svg.appendChild(zone1);

    const zone2 = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    zone2.setAttribute('points', '150,490 250,490 200,350');
    zone2.setAttribute('fill', 'red');
    zone2.setAttribute('opacity', '0.5');
    svg.appendChild(zone2);

    const zone3 = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    zone3.setAttribute('points', '250,490 350,490 300,350');
    zone3.setAttribute('fill', 'green');
    zone3.setAttribute('opacity', '0.5');
    svg.appendChild(zone3);

    const zone4 = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    zone4.setAttribute('points', '50,350 150,350 100,210');
    zone4.setAttribute('fill', 'yellow');
    zone4.setAttribute('opacity', '0.5');
    svg.appendChild(zone4);

    const zone5 = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    zone5.setAttribute('points', '150,350 250,350 200,210');
    zone5.setAttribute('fill', 'orange');
    zone5.setAttribute('opacity', '0.5');
    svg.appendChild(zone5);

    const zone6 = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    zone6.setAttribute('points', '250,350 350,350 300,210');
    zone6.setAttribute('fill', 'purple');
    zone6.setAttribute('opacity', '0.5');
    svg.appendChild(zone6);

    const zone7 = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    zone7.setAttribute('points', '50,210 150,210 100,70');
    zone7.setAttribute('fill', 'pink');
    zone7.setAttribute('opacity', '0.5');
    svg.appendChild(zone7);

    const zone8 = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    zone8.setAttribute('points', '150,210 250,210 200,70');
    zone8.setAttribute('fill', 'brown');
    zone8.setAttribute('opacity', '0.5');
    svg.appendChild(zone8);

    const zone9 = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    zone9.setAttribute('points', '250,210 350,210 300,70');
    zone9.setAttribute('fill', 'gray');
    zone9.setAttribute('opacity', '0.5');
    svg.appendChild(zone9);

    // Draw zone labels
    const labelZone1 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    labelZone1.setAttribute('x', '100');
    labelZone1.setAttribute('y', '450');
    labelZone1.textContent = 'T1';
    svg.appendChild(labelZone1);

    const labelZone2 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    labelZone2.setAttribute('x', '200');
    labelZone2.setAttribute('y', '450');
    labelZone2.textContent = 'T2';
    svg.appendChild(labelZone2);

    const labelZone3 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    labelZone3.setAttribute('x', '300');
    labelZone3.setAttribute('y', '450');
    labelZone3.textContent = 'T3';
    svg.appendChild(labelZone3);

    const labelZone4 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    labelZone4.setAttribute('x', '100');
    labelZone4.setAttribute('y', '310');
    labelZone4.textContent = 'D1';
    svg.appendChild(labelZone4);

    const labelZone5 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    labelZone5.setAttribute('x', '200');
    labelZone5.setAttribute('y', '310');
    labelZone5.textContent = 'D2';
    svg.appendChild(labelZone5);

    const labelZone6 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    labelZone6.setAttribute('x', '300');
    labelZone6.setAttribute('y', '310');
    labelZone6.textContent = 'D3';
    svg.appendChild(labelZone6);

    // Mark sample point
    if (sample) {
      const point = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      point.setAttribute('cx', 50 + (sample.ch4 / (sample.ch4 + sample.c2h4 + sample.c2h6)) * 500);
      point.setAttribute('cy', 490 - (sample.c2h4 / (sample.ch4 + sample.c2h4 + sample.c2h6)) * 440);
      point.setAttribute('r', 5);
      point.setAttribute('fill', 'black');
      svg.appendChild(point);
    }
  }
};
