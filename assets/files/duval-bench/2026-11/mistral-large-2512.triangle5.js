const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const total = ch4 + c2h4 + c2h6;
    if (total <= 0) return "N";

    const pch4 = (ch4 / total) * 100;
    const pc2h4 = (c2h4 / total) * 100;
    const pc2h6 = (c2h6 / total) * 100;

    // Zone boundaries (approximate from memory)
    if (pc2h4 < 15 && pc2h6 > 90) return "PD";
    if (pc2h4 < 15 && pch4 > 90) return "T1";
    if (pc2h4 < 15 && pc2h6 <= 90 && pch4 <= 90) return "S";
    if (pc2h4 >= 15 && pc2h4 < 50 && pc2h6 > 40) return "T2";
    if (pc2h4 >= 50 && pc2h6 < 30) return "T3";
    if (pc2h4 >= 15 && pc2h4 < 50 && pc2h6 <= 40) return "D1";
    if (pc2h4 >= 50 && pc2h6 >= 30) return "D2";

    return "N";
  },

  render(svg, sample) {
    const width = 600;
    const height = 540;
    const margin = 40;
    const triangleHeight = height - 2 * margin;
    const triangleWidth = (triangleHeight * Math.sqrt(3)) / 2;
    const left = (width - triangleWidth) / 2;

    // Clear SVG
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    // Draw triangle
    const triangle = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    const points = [
      { x: left, y: height - margin },
      { x: left + triangleWidth, y: height - margin },
      { x: left + triangleWidth / 2, y: margin }
    ];
    triangle.setAttribute("points",
      points.map(p => `${p.x},${p.y}`).join(" ")
    );
    triangle.setAttribute("fill", "none");
    triangle.setAttribute("stroke", "black");
    triangle.setAttribute("stroke-width", "2");
    svg.appendChild(triangle);

    // Zone boundaries (approximate)
    const zones = [
      { code: "PD", path: `M${left},${height - margin} L${left + triangleWidth * 0.15},${height - margin} L${left + triangleWidth * 0.15},${height - margin - triangleHeight * 0.1} Z` },
      { code: "T1", path: `M${left + triangleWidth * 0.85},${height - margin} L${left + triangleWidth},${height - margin} L${left + triangleWidth * 0.85},${height - margin - triangleHeight * 0.1} Z` },
      { code: "S", path: `M${left + triangleWidth * 0.15},${height - margin} L${left + triangleWidth * 0.85},${height - margin} L${left + triangleWidth * 0.5},${height - margin - triangleHeight * 0.1} Z` },
      { code: "T2", path: `M${left + triangleWidth * 0.15},${height - margin - triangleHeight * 0.1} L${left + triangleWidth * 0.5},${height - margin - triangleHeight * 0.5} L${left + triangleWidth * 0.5},${height - margin - triangleHeight * 0.1} Z` },
      { code: "D1", path: `M${left + triangleWidth * 0.15},${height - margin - triangleHeight * 0.1} L${left + triangleWidth * 0.5},${height - margin - triangleHeight * 0.5} L${left + triangleWidth * 0.5},${height - margin - triangleHeight * 0.1} Z` },
      { code: "T3", path: `M${left + triangleWidth * 0.5},${margin} L${left + triangleWidth * 0.85},${height - margin - triangleHeight * 0.5} L${left + triangleWidth},${margin} Z` },
      { code: "D2", path: `M${left + triangleWidth * 0.5},${height - margin - triangleHeight * 0.5} L${left + triangleWidth * 0.85},${height - margin - triangleHeight * 0.5} L${left + triangleWidth * 0.5},${margin} Z` }
    ];

    // Fill zones with colors
    const zoneColors = {
      PD: "#aaffaa", T1: "#aaaaff", S: "#ffffaa",
      T2: "#ffaaaa", D1: "#ffaaff", T3: "#ffaa77", D2: "#aaffff"
    };

    zones.forEach(zone => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", zone.path);
      path.setAttribute("fill", zoneColors[zone.code] || "#cccccc");
      path.setAttribute("stroke", "black");
      path.setAttribute("stroke-width", "1");
      svg.appendChild(path);

      // Add zone label
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      const centerX = (points[0].x + points[1].x + points[2].x) / 3;
      const centerY = (points[0].y + points[1].y + points[2].y) / 3;
      let textX, textY;

      if (zone.code === "PD") {
        textX = left + triangleWidth * 0.075;
        textY = height - margin - triangleHeight * 0.05;
      } else if (zone.code === "T1") {
        textX = left + triangleWidth * 0.925;
        textY = height - margin - triangleHeight * 0.05;
      } else if (zone.code === "S") {
        textX = left + triangleWidth * 0.5;
        textY = height - margin - triangleHeight * 0.05;
      } else if (zone.code === "T2") {
        textX = left + triangleWidth * 0.3;
        textY = height - margin - triangleHeight * 0.3;
      } else if (zone.code === "D1") {
        textX = left + triangleWidth * 0.4;
        textY = height - margin - triangleHeight * 0.2;
      } else if (zone.code === "T3") {
        textX = left + triangleWidth * 0.75;
        textY = margin + triangleHeight * 0.1;
      } else if (zone.code === "D2") {
        textX = left + triangleWidth * 0.65;
        textY = height - margin - triangleHeight * 0.4;
      }

      text.setAttribute("x", textX);
      text.setAttribute("y", textY);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("font-size", "16");
      text.setAttribute("font-weight", "bold");
      text.textContent = zone.code;
      svg.appendChild(text);
    });

    // Draw axes and labels
    const axes = [
      { name: "CH4", start: points[0], end: points[2], ticks: 5 },
      { name: "C2H4", start: points[2], end: points[1], ticks: 5 },
      { name: "C2H6", start: points[1], end: points[0], ticks: 5 }
    ];

    axes.forEach(axis => {
      // Draw axis line
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", axis.start.x);
      line.setAttribute("y1", axis.start.y);
      line.setAttribute("x2", axis.end.x);
      line.setAttribute("y2", axis.end.y);
      line.setAttribute("stroke", "black");
      line.setAttribute("stroke-width", "2");
      svg.appendChild(line);

      // Draw ticks and labels
      for (let i = 1; i <= axis.ticks; i++) {
        const ratio = i / axis.ticks;
        const tickX = axis.start.x + (axis.end.x - axis.start.x) * ratio;
        const tickY = axis.start.y + (axis.end.y - axis.start.y) * ratio;

        const tick = document.createElementNS("http://www.w3.org/2000/svg", "line");
        tick.setAttribute("x1", tickX);
        tick.setAttribute("y1", tickY);
        tick.setAttribute("x2", tickX + (axis.end.x - axis.start.x) * 0.02);
        tick.setAttribute("y2", tickY + (axis.end.y - axis.start.y) * 0.02);
        tick.setAttribute("stroke", "black");
        tick.setAttribute("stroke-width", "1");
        svg.appendChild(tick);

        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", tickX);
        label.setAttribute("y", tickY + 15);
        label.setAttribute("text-anchor", "middle");
        label.setAttribute("font-size", "12");
        label.textContent = `${Math.round(100 - ratio * 100)}%`;
        svg.appendChild(label);
      }

      // Axis label
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      const labelX = axis.start.x + (axis.end.x - axis.start.x) * 0.5;
      const labelY = axis.start.y + (axis.end.y - axis.start.y) * 0.5;
      label.setAttribute("x", labelX);
      label.setAttribute("y", labelY);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("font-size", "14");
      label.setAttribute("font-weight", "bold");
      label.textContent = axis.name;
      svg.appendChild(label);
    });

    // Plot sample point if provided
    if (sample) {
      const total = sample.ch4 + sample.c2h4 + sample.c2h6;
      if (total > 0) {
        const pch4 = sample.ch4 / total;
        const pc2h4 = sample.c2h4 / total;
        const pc2h6 = sample.c2h6 / total;

        // Convert to barycentric coordinates
        const x = left + triangleWidth * (0.5 * pc2h4 + pc2h6);
        const y = height - margin - triangleHeight * (Math.sqrt(3)/2 * pc2h4);

        const point = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        point.setAttribute("cx", x);
        point.setAttribute("cy", y);
        point.setAttribute("r", 5);
        point.setAttribute("fill", "red");
        point.setAttribute("stroke", "black");
        point.setAttribute("stroke-width", "1");
        svg.appendChild(point);

        const zone = this.classify(sample.ch4, sample.c2h4, sample.c2h6);
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", x + 10);
        text.setAttribute("y", y - 10);
        text.setAttribute("font-size", "12");
        text.setAttribute("fill", "red");
        text.textContent = zone;
        svg.appendChild(text);
      }
    }
  }
};
