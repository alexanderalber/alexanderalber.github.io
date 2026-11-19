const DuvalPentagon = {
  classify(h2, ch4, c2h6, c2h4, c2h2) {
    const total = h2 + ch4 + c2h6 + c2h4 + c2h2;
    if (total <= 0) return "N";

    const p = {
      h2: h2 / total,
      ch4: ch4 / total,
      c2h6: c2h6 / total,
      c2h4: c2h4 / total,
      c2h2: c2h2 / total
    };

    // Normalize to pentagon coordinates (approximate boundaries from memory)
    const x = 0.5 + 0.4 * (p.c2h4 - p.c2h6 + 0.5 * (p.ch4 - p.h2));
    const y = 0.5 + 0.4 * (Math.sqrt(3)/2 * (p.ch4 + p.h2) - 0.5 * (p.c2h2 + p.c2h4));

    // Zone boundaries (approximate)
    const centerX = 0.5, centerY = 0.5;
    const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);

    // PD zone (partial discharge)
    if (p.h2 > 0.9) return "PD";
    if (p.h2 > 0.5 && p.ch4 < 0.2 && p.c2h2 < 0.1) return "PD";

    // D1 zone (low energy discharge)
    if (p.c2h2 > 0.15 && p.c2h4 < 0.3 && p.h2 < 0.4) return "D1";

    // D2 zone (high energy discharge)
    if (p.c2h2 > 0.1 && p.c2h4 > 0.3 && p.h2 < 0.4) return "D2";

    // T1 zone (thermal < 300°C)
    if (p.c2h4 < 0.2 && p.c2h6 > 0.3 && p.ch4 > 0.2) return "T1";

    // T2 zone (thermal 300-700°C)
    if (p.c2h4 > 0.2 && p.c2h4 < 0.5 && p.c2h6 < 0.3 && p.ch4 > 0.2) return "T2";

    // T3 zone (thermal > 700°C)
    if (p.c2h4 > 0.5 && p.c2h2 < 0.1) return "T3";

    // DT zone (mixed)
    if (p.c2h2 > 0.05 && p.c2h4 > 0.2 && p.h2 > 0.2) return "DT";

    // Default to normal if no clear zone
    return "N";
  },

  render(svg, sample) {
    const width = 600, height = 600;
    const centerX = width / 2, centerY = height / 2;
    const size = Math.min(width, height) * 0.4;

    // Clear SVG
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // Create pentagon points
    const points = [];
    const gasNames = ["H₂", "CH₄", "C₂H₆", "C₂H₄", "C₂H₂"];
    const angles = [90, 18, -54, -126, -198].map(a => a * Math.PI / 180);

    for (let i = 0; i < 5; i++) {
      const x = centerX + size * Math.cos(angles[i]);
      const y = centerY - size * Math.sin(angles[i]);
      points.push({x, y});
    }

    // Draw zones (approximate boundaries)
    const zones = [
      {name: "PD", color: "#aaffaa", points: [points[0], {x: centerX, y: centerY - size * 0.3}, points[1]]},
      {name: "D1", color: "#aaaaff", points: [points[1], {x: centerX + size * 0.2, y: centerY - size * 0.1}, points[2]]},
      {name: "D2", color: "#ffaaaa", points: [points[2], {x: centerX + size * 0.2, y: centerY + size * 0.1}, points[3]]},
      {name: "T3", color: "#ffaaff", points: [points[3], {x: centerX, y: centerY + size * 0.3}, points[4]]},
      {name: "T2", color: "#ffffaa", points: [points[4], {x: centerX - size * 0.2, y: centerY + size * 0.1}, points[0]]},
      {name: "T1", color: "#aaffff", points: [
        points[0], {x: centerX - size * 0.2, y: centerY + size * 0.1},
        {x: centerX - size * 0.3, y: centerY}, points[1]
      ]},
      {name: "DT", color: "#ffaa77", points: [
        {x: centerX, y: centerY},
        {x: centerX + size * 0.1, y: centerY - size * 0.1},
        points[2], points[3], {x: centerX, y: centerY + size * 0.1}
      ]},
      {name: "N", color: "#ffffff", points: [
        {x: centerX - size * 0.1, y: centerY - size * 0.1},
        {x: centerX + size * 0.1, y: centerY - size * 0.1},
        {x: centerX + size * 0.1, y: centerY + size * 0.1},
        {x: centerX - size * 0.1, y: centerY + size * 0.1}
      ]}
    ];

    zones.forEach(zone => {
      const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      poly.setAttribute("points", zone.points.map(p => `${p.x},${p.y}`).join(" "));
      poly.setAttribute("fill", zone.color);
      poly.setAttribute("stroke", "#000");
      poly.setAttribute("stroke-width", "1");
      svg.appendChild(poly);

      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      const textX = zone.points.reduce((sum, p) => sum + p.x, 0) / zone.points.length;
      const textY = zone.points.reduce((sum, p) => sum + p.y, 0) / zone.points.length;
      text.setAttribute("x", textX);
      text.setAttribute("y", textY);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "middle");
      text.setAttribute("font-size", "16");
      text.textContent = zone.name;
      svg.appendChild(text);
    });

    // Draw axes
    for (let i = 0; i < 5; i++) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", centerX);
      line.setAttribute("y1", centerY);
      line.setAttribute("x2", points[i].x);
      line.setAttribute("y2", points[i].y);
      line.setAttribute("stroke", "#000");
      line.setAttribute("stroke-width", "1");
      svg.appendChild(line);

      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      const textX = points[i].x + 15 * Math.cos(angles[i]);
      const textY = points[i].y - 15 * Math.sin(angles[i]);
      text.setAttribute("x", textX);
      text.setAttribute("y", textY);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "middle");
      text.setAttribute("font-size", "14");
      text.textContent = gasNames[i];
      svg.appendChild(text);
    }

    // Draw sample point if provided
    if (sample) {
      const total = sample.h2 + sample.ch4 + sample.c2h6 + sample.c2h4 + sample.c2h2;
      if (total > 0) {
        const p = {
          h2: sample.h2 / total,
          ch4: sample.ch4 / total,
          c2h6: sample.c2h6 / total,
          c2h4: sample.c2h4 / total,
          c2h2: sample.c2h2 / total
        };

        const x = centerX + size * 0.8 * (p.c2h4 - p.c2h6 + 0.5 * (p.ch4 - p.h2));
        const y = centerY - size * 0.8 * (Math.sqrt(3)/2 * (p.ch4 + p.h2) - 0.5 * (p.c2h2 + p.c2h4));

        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", x);
        circle.setAttribute("cy", y);
        circle.setAttribute("r", 5);
        circle.setAttribute("fill", "red");
        svg.appendChild(circle);
      }
    }
  }
};
