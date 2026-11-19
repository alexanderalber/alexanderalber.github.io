const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const total = ch4 + c2h4 + c2h2;
    const ch4Pct = (ch4 / total) * 100;
    const c2h4Pct = (c2h4 / total) * 100;
    const c2h2Pct = (c2h2 / total) * 100;

    if (c2h2Pct < 0.1) {
      if (c2h4Pct < 0.1) {
        return 'T1';
      } else if (c2h4Pct < 1) {
        return 'T2';
      } else if (c2h4Pct < 4) {
        return 'T3';
      } else {
        return 'T4';
      }
    } else if (c2h2Pct < 1) {
      if (c2h4Pct < 0.1) {
        return 'D1';
      } else if (c2h4Pct < 1) {
        return 'D2';
      } else {
        return 'T4';
      }
    } else {
      if (c2h4Pct < 0.1) {
        return 'D1';
      } else {
        return 'D2';
      }
    }
  },
  render(svg, sample) {
    const ns = 'http://www.w3.org/2000/svg';

    // Draw axes
    const x1 = 50;
    const y1 = 490;
    const x2 = 550;
    const y2 = 490;
    const x3 = 300;
    const y3 = 50;
    const axis1 = document.createElementNS(ns, 'line');
    axis1.setAttribute('x1', x1);
    axis1.setAttribute('y1', y1);
    axis1.setAttribute('x2', x2);
    axis1.setAttribute('y2', y2);
    axis1.setAttribute('stroke', 'black');
    axis1.setAttribute('stroke-width', 2);
    svg.appendChild(axis1);
    const axis2 = document.createElementNS(ns, 'line');
    axis2.setAttribute('x1', x2);
    axis2.setAttribute('y1', y2);
    axis2.setAttribute('x2', x3);
    axis2.setAttribute('y2', y3);
    axis2.setAttribute('stroke', 'black');
    axis2.setAttribute('stroke-width', 2);
    svg.appendChild(axis2);
    const axis3 = document.createElementNS(ns, 'line');
    axis3.setAttribute('x1', x1);
    axis3.setAttribute('y1', y1);
    axis3.setAttribute('x2', x3);
    axis3.setAttribute('y2', y3);
    axis3.setAttribute('stroke', 'black');
    axis3.setAttribute('stroke-width', 2);
    svg.appendChild(axis3);

    // Draw tick marks
    const tick1 = document.createElementNS(ns, 'line');
    tick1.setAttribute('x1', x1 + 50);
    tick1.setAttribute('y1', y1 - 5);
    tick1.setAttribute('x2', x1 + 50);
    tick1.setAttribute('y2', y1 + 5);
    tick1.setAttribute('stroke', 'black');
    tick1.setAttribute('stroke-width', 1);
    svg.appendChild(tick1);
    const tick2 = document.createElementNS(ns, 'line');
    tick2.setAttribute('x1', x2 - 50);
    tick2.setAttribute('y1', y2 - 5);
    tick2.setAttribute('x2', x2 - 50);
    tick2.setAttribute('y2', y2 + 5);
    tick2.setAttribute('stroke', 'black');
    tick2.setAttribute('stroke-width', 1);
    svg.appendChild(tick2);
    const tick3 = document.createElementNS(ns, 'line');
    tick3.setAttribute('x1', x3 - 5);
    tick3.setAttribute('y1', y3 + 50);
    tick3.setAttribute('x2', x3 + 5);
    tick3.setAttribute('y2', y3 + 50);
    tick3.setAttribute('stroke', 'black');
    tick3.setAttribute('stroke-width', 1);
    svg.appendChild(tick3);

    // Draw gas names
    const ch4Text = document.createElementNS(ns, 'text');
    ch4Text.setAttribute('x', x1 + 20);
    ch4Text.setAttribute('y', y1 - 20);
    ch4Text.textContent = 'CH4';
    svg.appendChild(ch4Text);
    const c2h4Text = document.createElementNS(ns, 'text');
    c2h4Text.setAttribute('x', x2 - 40);
    c2h4Text.setAttribute('y', y2 - 20);
    c2h4Text.textContent = 'C2H4';
    svg.appendChild(c2h4Text);
    const c2h2Text = document.createElementNS(ns, 'text');
    c2h2Text.setAttribute('x', x3 - 30);
    c2h2Text.setAttribute('y', y3 + 70);
    c2h2Text.textContent = 'C2H2';
    svg.appendChild(c2h2Text);

    // Draw zones
    const zoneT1 = document.createElementNS(ns, 'polygon');
    zoneT1.setAttribute('points', `${x1},${y1} ${x1 + 50},${y1} ${x3 - 50},${y3 + 50}`);
    zoneT1.setAttribute('fill', 'green');
    zoneT1.setAttribute('opacity', 0.5);
    svg.appendChild(zoneT1);
    const zoneT2 = document.createElementNS(ns, 'polygon');
    zoneT2.setAttribute('points', `${x1 + 50},${y1} ${x1 + 100},${y1} ${x3 - 50},${y3 + 50}`);
    zoneT2.setAttribute('fill', 'yellow');
    zoneT2.setAttribute('opacity', 0.5);
    svg.appendChild(zoneT2);
    const zoneT3 = document.createElementNS(ns, 'polygon');
    zoneT3.setAttribute('points', `${x1 + 100},${y1} ${x1 + 200},${y1} ${x3 - 50},${y3 + 50}`);
    zoneT3.setAttribute('fill', 'orange');
    zoneT3.setAttribute('opacity', 0.5);
    svg.appendChild(zoneT3);
    const zoneT4 = document.createElementNS(ns, 'polygon');
    zoneT4.setAttribute('points', `${x1 + 200},${y1} ${x2},${y2} ${x3 - 50},${y3 + 50}`);
    zoneT4.setAttribute('fill', 'red');
    zoneT4.setAttribute('opacity', 0.5);
    svg.appendChild(zoneT4);
    const zoneD1 = document.createElementNS(ns, 'polygon');
    zoneD1.setAttribute('points', `${x1},${y1} ${x1 + 50},${y1} ${x3 - 50},${y3 + 50} ${x3 - 100},${y3 + 100}`);
    zoneD1.setAttribute('fill', 'blue');
    zoneD1.setAttribute('opacity', 0.5);
    svg.appendChild(zoneD1);
    const zoneD2 = document.createElementNS(ns, 'polygon');
    zoneD2.setAttribute('points', `${x1 + 50},${y1} ${x1 + 100},${y1} ${x3 - 50},${y3 + 50} ${x3 - 100},${y3 + 100}`);
    zoneD2.setAttribute('fill', 'purple');
    zoneD2.setAttribute('opacity', 0.5);
    svg.appendChild(zoneD2);

    // Draw zone labels
    const zoneT1Label = document.createElementNS(ns, 'text');
    zoneT1Label.setAttribute('x', x1 + 25);
    zoneT1Label.setAttribute('y', y1 - 40);
    zoneT1Label.textContent = 'T1';
    svg.appendChild(zoneT1Label);
    const zoneT2Label = document.createElementNS(ns, 'text');
    zoneT2Label.setAttribute('x', x1 + 75);
    zoneT2Label.setAttribute('y', y1 - 40);
    zoneT2Label.textContent = 'T2';
    svg.appendChild(zoneT2Label);
    const zoneT3Label = document.createElementNS(ns, 'text');
    zoneT3Label.setAttribute('x', x1 + 150);
    zoneT3Label.setAttribute('y', y1 - 40);
    zoneT3Label.textContent = 'T3';
    svg.appendChild(zoneT3Label);
    const zoneT4Label = document.createElementNS(ns, 'text');
    zoneT4Label.setAttribute('x', x1 + 250);
    zoneT4Label.setAttribute('y', y1 - 40);
    zoneT4Label.textContent = 'T4';
    svg.appendChild(zoneT4Label);
    const zoneD1Label = document.createElementNS(ns, 'text');
    zoneD1Label.setAttribute('x', x3 - 75);
    zoneD1Label.setAttribute('y', y3 + 120);
    zoneD1Label.textContent = 'D1';
    svg.appendChild(zoneD1Label);
    const zoneD2Label = document.createElementNS(ns, 'text');
    zoneD2Label.setAttribute('x', x3 - 25);
    zoneD2Label.setAttribute('y', y3 + 120);
    zoneD2Label.textContent = 'D2';
    svg.appendChild(zoneD2Label);

    // Mark sample point
    if (sample) {
      const x = x1 + (sample.ch4 / (sample.ch4 + sample.c2h4 + sample.c2h2)) * 500;
      const y = y1 - (sample.c2h2 / (sample.ch4 + sample.c2h4 + sample.c2h2)) * 440;
      const point = document.createElementNS(ns, 'circle');
      point.setAttribute('cx', x);
      point.setAttribute('cy', y);
      point.setAttribute('r', 5);
      point.setAttribute('fill', 'black');
      svg.appendChild(point);
    }
  }
};
