const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const total = ch4 + c2h4 + c2h6;
    if (total === 0) throw new Error("Total gas concentration is zero");
    const x = c2h6 / total;
    const y = c2h4 / total;
    const z = ch4 / total;
    if (y < 0.2 * x + 0.3) return "PD"; // Partial Discharge
    if (y > 0.7 * x + 0.3) {
      if (z < 0.2) return "D1"; // High-Energy Discharge
      return "D2"; // Low-Energy Discharge
    }
    if (z < 0.15) return "T3"; // High-Temperature Fault
    return "T2"; // Low-Temperature Fault / T2
  },

  render(svg, sample) {
    const ns = "http://www.w3.org/2000/svg";
    const drawTriangle = (x1, y1, x2, y2, x3, y3, cls) => {
      const polygon = document.createElementNS(ns, "polygon");
      polygon.setAttribute("points", `${x1},${y1} ${x2},${y2} ${x3},${y3}`);
      polygon.setAttribute("class", cls);
      svg.appendChild(polygon);
    };

    // Zones
    drawTriangle(100, 440, 300, 40, 500, 440, "zone-t3");
    drawTriangle(300, 40, 360, 440, 500, 440, "zone-d2");
    drawTriangle(300, 40, 320, 440, 360, 440, "zone-d1");
    drawTriangle(100, 440, 320, 440, 300, 40, "zone-t2");
    drawTriangle(100, 440, 180, 440, 320, 440, "zone-pd");

    // Labels
    const label = (x, y, text, cls) => {
      const textElement = document.createElementNS(ns, "text");
      textElement.setAttribute("x", x);
      textElement.setAttribute("y", y);
      textElement.textContent = text;
      textElement.setAttribute("class", cls);
      svg.appendChild(textElement);
    };
    label(150, 430, "PD", "zone-label");
    label(250, 240, "T2", "zone-label");
    label(340, 240, "D1", "zone-label");
    label(420, 430, "D2", "zone-label");
    label(450, 240, "T3", "zone-label");

    // Axes and ticks
    const line = (x1, y1, x2, y2) => {
      const lineElement = document.createElementNS(ns, "line");
      lineElement.setAttribute("x1", x1);
      lineElement.setAttribute("y1", y1);
      lineElement.setAttribute("x2", x2);
      lineElement.setAttribute("y2", y2);
      svg.appendChild(lineElement);
    };
    line(100, 440, 300, 40);
    line(300, 40, 500, 440);
    line(100, 440, 500, 440);
    for (let i = 1; i < 5; i++) {
      const y = 440 - (i / 5) * 400;
      line(100, y, 95, y);
      line(505, y, 500, y);
    }
    for (let i = 1; i < 5; i++) {
      const x = 100 + (i / 5) * 400;
      line(x, 440, x, 445);
    }

    // Gas names
    label(50, 440, "C2H6", "axis-label");
    label(550, 440, "CH4", "axis-label");
    label(300, 20, "C2H4", "axis-label");

    // Sample point
    if (sample) {
      const total = sample.ch4 + sample.c2h4 + sample.c2h6;
      if (total > 0) {
        const x = 100 + 400 * (sample.ch4 + sample.c2h6 / 2) / total;
        const y = 440 - 400 * (sample.c2h4 + sample.c2h6 / 2) / total;
        const circle = document.createElementNS(ns, "circle");
        circle.setAttribute("cx", x);
        circle.setAttribute("cy", y);
        circle.setAttribute("r", 5);
        svg.appendChild(circle);
      }
    }
  }
};
