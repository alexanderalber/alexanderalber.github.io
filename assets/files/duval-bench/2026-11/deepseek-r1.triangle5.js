const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const total = ch4 + c2h4 + c2h6;
    if (total <= 0) return "PD";
    const pCh4 = (ch4 / total) * 100;
    const pC2h4 = (c2h4 / total) * 100;
    const pC2h6 = (c2h6 / total) * 100;

    if (pC2h6 >= 98) return "PD";
    if (pC2h6 >= 75 && pCh4 <= 23) return "T1";
    if (pCh4 > 23 && pCh4 <= 50 && pC2h6 >= 15 && pC2h6 <= 75) return "T2";
    return "T3";
  },

  render(svg, sample) {
    const ns = "http://www.w3.org/2000/svg";
    const width = 600;
    const height = 540;
    const margin = 20;
    const halfWidth = width / 2;

    // Draw zones with colors
    const zones = [
      { id: "PD", path: "M0,540 L12,529.2 L6,529.2 Z", color: "#FFCCCC" },
      { id: "T1", path: "M12,529.2 L138,540 L69,415.8 L6,529.2 Z", color: "#CCFFCC" },
      { id: "T2", path: "M69,415.8 L531,415.8 L450,270 L150,270 Z", color: "#CCCCFF" },
      { id: "T3", path: "M150,270 L450,270 L300,0 L150,270 Z", color: "#FFFFCC" }
    ];

    zones.forEach(zone => {
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", zone.path);
      path.setAttribute("fill", zone.color);
      svg.appendChild(path);
    });

    // Draw triangle outline
    const outline = document.createElementNS(ns, "path");
    outline.setAttribute("d", "M0,540 L600,540 L300,0 Z");
    outline.setAttribute("fill", "none");
    outline.setAttribute("stroke", "black");
    outline.setAttribute("stroke-width", "2");
    svg.appendChild(outline);

    // Zone labels
    const labels = [
      { text: "PD", x: 6, y: 535 },
      { text: "T1", x: 70, y: 520 },
      { text: "T2", x: 300, y: 350 },
      { text: "T3", x: 300, y: 180 }
    ];

    labels.forEach(label => {
      const text = document.createElementNS(ns, "text");
      text.setAttribute("x", label.x);
      text.setAttribute("y", label.y);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("font-size", "16");
      text.setAttribute("font-weight", "bold");
      text.textContent = label.text;
      svg.appendChild(text);
    });

    // Axes and labels
    const axisLabels = [
      { text: "% CH₄", x: 300, y: margin, anchor: "middle" },
      { text: "% C₂H₆", x: margin, y: height - margin, anchor: "start" },
      { text: "% C₂H₄", x: width - margin, y: height - margin, anchor: "end" }
    ];

    axisLabels.forEach(label => {
      const text = document.createElementNS(ns, "text");
      text.setAttribute("x", label.x);
      text.setAttribute("y", label.y);
      text.setAttribute("text-anchor", label.anchor);
      text.setAttribute("font-size", "14");
      text.textContent = label.text;
      svg.appendChild(text);
    });

    // Tick marks and percentages
    const ticks = [
      { type: "ch4", pos: 0, x: 300, y: height, label: "0%", anchor: "middle" },
      { type: "ch4", pos: 25, x: 225, y: 405, label: "25%", anchor: "middle" },
      { type: "ch4", pos: 50, x: 150, y: 270, label: "50%", anchor: "middle" },
      { type: "ch4", pos: 75, x: 75, y: 135, label: "75%", anchor: "middle" },
      { type: "ch4", pos: 100, x: 0, y: 0, label: "100%", anchor: "middle" },
      
      { type: "c2h4", pos: 0, x: 0, y: height, label: "0%", anchor: "start" },
      { type: "c2h4", pos: 25, x: 150, y: height, label: "25%", anchor: "middle" },
      { type: "c2h4", pos: 50, x: 300, y: height, label: "50%", anchor: "middle" },
      { type: "c2h4", pos: 75, x: 450, y: height, label: "75%", anchor: "middle" },
      { type: "c2h4", pos: 100, x: width, y: height, label: "100%", anchor: "end" },
      
      { type: "c2h6", pos: 0, x: width, y: height, label: "0%", anchor: "end" },
      { type: "c2h6", pos: 25, x: 450, y: 270, label: "25%", anchor: "end" },
      { type: "c2h6", pos: 50, x: 300, y: 0, label: "50%", anchor: "middle" },
      { type: "c2h6", pos: 75, x: 150, y: 0, label: "75%", anchor: "middle" },
      { type: "c2h6", pos: 100, x: 0, y: 0, label: "100%", anchor: "start" }
    ];

    ticks.forEach(tick => {
      const line = document.createElementNS(ns, "line");
      if (tick.type === "ch4") {
        line.setAttribute("x1", tick.x);
        line.setAttribute("y1", tick.y);
        line.setAttribute("x2", tick.x + 10);
        line.setAttribute("y2", tick.y);
      } else if (tick.type === "c2h4") {
        line.setAttribute("x1", tick.x);
        line.setAttribute("y1", tick.y);
        line.setAttribute("x2", tick.x);
        line.setAttribute("y2", tick.y - 10);
      } else { // c2h6
        line.setAttribute("x1", tick.x);
        line.setAttribute("y1", tick.y);
        line.setAttribute("x2", tick.x - 10);
        line.setAttribute("y2", tick.y);
      }
      line.setAttribute("stroke", "black");
      line.setAttribute("stroke-width", "1");
      svg.appendChild(line);

      const text = document.createElementNS(ns, "text");
      text.setAttribute("x", tick.type === "ch4" ? tick.x + 15 : tick.type === "c2h4" ? tick.x : tick.x - 15);
      text.setAttribute("y", tick.type === "ch4" ? tick.y + 4 : tick.type === "c2h4" ? tick.y - 15 : tick.y + 4);
      text.setAttribute("text-anchor", tick.anchor);
      text.setAttribute("font-size", "10");
      text.textContent = tick.label;
      svg.appendChild(text);
    });

    // Draw sample point if provided
    if (sample) {
      const { ch4, c2h4, c2h6 } = sample;
      const total = ch4 + c2h4 + c2h6;
      if (total > 0) {
        const pCh4 = ch4 / total;
        const pC2h4 = c2h4 / total;
        const x = 300 * pCh4 + 600 * pC2h4;
        const y = height * (1 - pCh4);

        const circle = document.createElementNS(ns, "circle");
        circle.setAttribute("cx", x);
        circle.setAttribute("cy", y);
        circle.setAttribute("r", "5");
        circle.setAttribute("fill", "red");
        circle.setAttribute("stroke", "black");
        svg.appendChild(circle);
      }
    }
  }
};
