const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const total = ch4 + c2h4 + c2h2;
    if (total <= 0) return "N";

    const pch4 = (ch4 / total) * 100;
    const pc2h4 = (c2h4 / total) * 100;
    const pc2h2 = (c2h2 / total) * 100;

    if (pc2h2 >= 98) return "D2";
    if (pc2h2 >= 15 && pc2h4 < 20 && pch4 < 4) return "D1";
    if (pc2h2 >= 4 && pc2h4 >= 20 && pch4 < 4) return "DT";
    if (pc2h4 >= 98) return "T3";
    if (pc2h4 >= 23 && pc2h4 + pch4 >= 98) return "T2";
    if (pc2h4 >= 20 && pch4 >= 4 && pc2h4 + pch4 >= 90) return "T1";
    if (pch4 >= 98) return "PD";
    if (pch4 >= 90 && pc2h4 < 4) return "S";
    if (pch4 >= 4 && pc2h4 < 20 && pc2h2 < 4) return "O";
    if (pch4 >= 40 && pc2h4 >= 20 && pc2h4 + pch4 < 90) return "C";

    return "N";
  },

  render(svg, sample) {
    const width = 600;
    const height = 540;
    const margin = 40;
    const triangleHeight = height - 2 * margin;
    const triangleWidth = (triangleHeight * Math.sqrt(3)) / 2;
    const leftX = (width - triangleWidth) / 2;
    const topY = margin;

    // Clear SVG
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    // Draw triangle background
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    bg.setAttribute("points",
      `${leftX},${topY + triangleHeight} ` +
      `${leftX + triangleWidth / 2},${topY} ` +
      `${leftX + triangleWidth},${topY + triangleHeight}`
    );
    bg.setAttribute("fill", "white");
    bg.setAttribute("stroke", "black");
    bg.setAttribute("stroke-width", "2");
    svg.appendChild(bg);

    // Zone boundaries (approximate from memory)
    const zones = [
      { code: "PD", points: `${leftX},${topY + triangleHeight} ${leftX + triangleWidth * 0.15},${topY + triangleHeight * 0.85} ${leftX + triangleWidth * 0.15},${topY + triangleHeight}` },
      { code: "S", points: `${leftX + triangleWidth * 0.15},${topY + triangleHeight * 0.85} ${leftX + triangleWidth * 0.3},${topY + triangleHeight * 0.7} ${leftX + triangleWidth * 0.3},${topY + triangleHeight}` },
      { code: "O", points: `${leftX + triangleWidth * 0.3},${topY + triangleHeight * 0.7} ${leftX + triangleWidth * 0.5},${topY + triangleHeight * 0.5} ${leftX + triangleWidth * 0.5},${topY + triangleHeight}` },
      { code: "C", points: `${leftX + triangleWidth * 0.5},${topY + triangleHeight * 0.5} ${leftX + triangleWidth * 0.7},${topY + triangleHeight * 0.3} ${leftX + triangleWidth * 0.7},${topY + triangleHeight}` },
      { code: "T1", points: `${leftX + triangleWidth * 0.7},${topY + triangleHeight * 0.3} ${leftX + triangleWidth * 0.85},${topY + triangleHeight * 0.15} ${leftX + triangleWidth * 0.85},${topY + triangleHeight}` },
      { code: "T2", points: `${leftX + triangleWidth * 0.85},${topY + triangleHeight * 0.15} ${leftX + triangleWidth * 0.95},${topY + triangleHeight * 0.05} ${leftX + triangleWidth},${topY + triangleHeight}` },
      { code: "T3", points: `${leftX + triangleWidth * 0.95},${topY + triangleHeight * 0.05} ${leftX + triangleWidth},${topY} ${leftX + triangleWidth},${topY + triangleHeight}` },
      { code: "DT", points: `${leftX + triangleWidth * 0.5},${topY} ${leftX + triangleWidth * 0.7},${topY + triangleHeight * 0.1} ${leftX + triangleWidth * 0.85},${topY + triangleHeight * 0.15} ${leftX + triangleWidth * 0.7},${topY + triangleHeight * 0.3}` },
      { code: "D1", points: `${leftX + triangleWidth * 0.3},${topY} ${leftX + triangleWidth * 0.5},${topY + triangleHeight * 0.1} ${leftX + triangleWidth * 0.5},${topY + triangleHeight * 0.5} ${leftX + triangleWidth * 0.3},${topY + triangleHeight * 0.7}` },
      { code: "D2", points: `${leftX},${topY} ${leftX + triangleWidth * 0.15},${topY + triangleHeight * 0.15} ${leftX + triangleWidth * 0.3},${topY}` }
    ];

    // Draw zones with different colors
    const zoneColors = {
      "PD": "#FFCCCC", "S": "#FFE5CC", "O": "#FFFFCC",
      "C": "#E5FFCC", "T1": "#CCFFCC", "T2": "#CCFFE5",
      "T3": "#CCFFFF", "DT": "#CCE5FF", "D1": "#CCCCFF", "D2": "#E5CCFF"
    };

    zones.forEach(zone => {
      const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      poly.setAttribute("points", zone.points);
      poly.setAttribute("fill", zoneColors[zone.code] || "#FFFFFF");
      poly.setAttribute("stroke", "#000000");
      poly.setAttribute("stroke-width", "1");
      svg.appendChild(poly);

      // Add zone label
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      const points = zone.points.split(" ").map(p => p.split(",").map(Number));
      const centerX = points.reduce((sum, p) => sum + p[0], 0) / points.length;
      const centerY = points.reduce((sum, p) => sum + p[1], 0) / points.length;
      text.setAttribute("x", centerX);
      text.setAttribute("y", centerY);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "middle");
      text.setAttribute("font-size", "16");
      text.setAttribute("font-weight", "bold");
      text.textContent = zone.code;
      svg.appendChild(text);
    });

    // Draw axes and labels
    const axisLabels = [
      { text: "CH4", x: leftX + triangleWidth / 2, y: topY + triangleHeight + 30, angle: 0 },
      { text: "C2H4", x: leftX - 20, y: topY + triangleHeight + 10, angle: -60 },
      { text: "C2H2", x: leftX + triangleWidth + 20, y: topY + triangleHeight + 10, angle: 60 }
    ];

    axisLabels.forEach(label => {
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", label.x);
      text.setAttribute("y", label.y);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("font-size", "18");
      text.setAttribute("font-weight", "bold");
      text.setAttribute("transform", `rotate(${label.angle}, ${label.x}, ${label.y})`);
      text.textContent = label.text;
      svg.appendChild(text);
    });

    // Draw tick marks and percentage labels
    const tickCount = 5;
    for (let i = 0; i <= tickCount; i++) {
      const ratio = i / tickCount;

      // CH4 axis (bottom)
      const ch4X = leftX + triangleWidth * ratio;
      const ch4Y = topY + triangleHeight;
      const tick = document.createElementNS("http://www.w3.org/2000/svg", "line");
      tick.setAttribute("x1", ch4X);
      tick.setAttribute("y1", ch4Y);
      tick.setAttribute("x2", ch4X);
      tick.setAttribute("y2", ch4Y + 10);
      tick.setAttribute("stroke", "black");
      tick.setAttribute("stroke-width", "1");
      svg.appendChild(tick);

      if (i > 0 && i < tickCount) {
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", ch4X);
        text.setAttribute("y", ch4Y + 25);
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("font-size", "12");
        text.textContent = `${Math.round(ratio * 100)}%`;
        svg.appendChild(text);
      }

      // C2H4 axis (left)
      const c2h4X = leftX + triangleWidth * (1 - ratio) * 0.5;
      const c2h4Y = topY + triangleHeight * ratio;
      const tick2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
      tick2.setAttribute("x1", c2h4X);
      tick2.setAttribute("y1", c2h4Y);
      tick2.setAttribute("x2", c2h4X - 10);
      tick2.setAttribute("y2", c2h4Y);
      tick2.setAttribute("stroke", "black");
      tick2.setAttribute("stroke-width", "1");
      svg.appendChild(tick2);

      if (i > 0 && i < tickCount) {
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", c2h4X - 15);
        text.setAttribute("y", c2h4Y + 5);
        text.setAttribute("text-anchor", "end");
        text.setAttribute("font-size", "12");
        text.textContent = `${Math.round(ratio * 100)}%`;
        svg.appendChild(text);
      }

      // C2H2 axis (right)
      const c2h2X = leftX + triangleWidth * (0.5 + ratio * 0.5);
      const c2h2Y = topY + triangleHeight * ratio;
      const tick3 = document.createElementNS("http://www.w3.org/2000/svg", "line");
      tick3.setAttribute("x1", c2h2X);
      tick3.setAttribute("y1", c2h2Y);
      tick3.setAttribute("x2", c2h2X + 10);
      tick3.setAttribute("y2", c2h2Y);
      tick3.setAttribute("stroke", "black");
      tick3.setAttribute("stroke-width", "1");
      svg.appendChild(tick3);

      if (i > 0 && i < tickCount) {
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", c2h2X + 15);
        text.setAttribute("y", c2h2Y + 5);
        text.setAttribute("text-anchor", "start");
        text.setAttribute("font-size", "12");
        text.textContent = `${Math.round(ratio * 100)}%`;
        svg.appendChild(text);
      }
    }

    // Plot sample point if provided
    if (sample) {
      const { ch4, c2h4, c2h2 } = sample;
      const total = ch4 + c2h4 + c2h2;
      if (total > 0) {
        const pch4 = ch4 / total;
        const pc2h4 = c2h4 / total;
        const pc2h2 = c2h2 / total;

        // Convert to triangle coordinates
        const x = leftX + triangleWidth * (0.5 * pc2h4 + pc2h2);
        const y = topY + triangleHeight * (1 - pc2h4 * Math.sqrt(3) / 2 - pc2h2 * Math.sqrt(3) / 2);

        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", x);
        circle.setAttribute("cy", y);
        circle.setAttribute("r", 6);
        circle.setAttribute("fill", "red");
        circle.setAttribute("stroke", "black");
        circle.setAttribute("stroke-width", "1");
        svg.appendChild(circle);

        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", x + 10);
        text.setAttribute("y", y - 10);
        text.setAttribute("font-size", "14");
        text.setAttribute("font-weight", "bold");
        text.textContent = this.classify(ch4, c2h4, c2h2);
        svg.appendChild(text);
      }
    }
  }
};
