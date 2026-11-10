const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const total = ch4 + c2h4 + c2h2;
    const m = ch4 / total * 100;
    const e = c2h4 / total * 100;
    const a = c2h2 / total * 100;

    if (a > 90) return "T3";
    if (m > 98) return "PD";
    
    if (e > 20 && e <= 50 && a > 15 && a <= 50) {
      if (m < 50) return "T2";
      if (m >= 50 && e < m) return "T2";
    }
    
    if (e > 50 && a <= 15 && m <= 50) return "T1";
    if (e > 50 && a <= 15 && m > 50) return "T1";
    
    if (a <= 15) {
      if (e > 23 && e <= 40 && m > 30 && m <= 70) return "D2";
      if (e > 40 && e <= 80 && m > 20 && m <= 70) return "D1";
      if (e > 80 && e <= 100) return "D1";
    }
    
    if (e <= 5 && m > 95) return "PD";
    if (e <= 20 && m > 80 && m <= 95) return "O";
    if (e <= 15 && m <= 80) return "S";
    
    return "ND";
  },

  render(svg, sample) {
    const xmlns = "http://www.w3.org/2000/svg";
    
    // Draw triangle frame
    const triangle = document.createElementNS(xmlns, "polygon");
    triangle.setAttribute("points", "300,0 0,519.615 600,519.615");
    triangle.setAttribute("fill", "none");
    triangle.setAttribute("stroke", "black");
    triangle.setAttribute("stroke-width", "2");
    svg.appendChild(triangle);
    
    // Draw zone boundaries and fill colors
    const zones = [
      { points: [300,0, 0,519.615, 0,458.349], fill: "#FFCCCC", code: "PD" },
      { points: [300,0, 0,458.349, 30,433.013, 45,389.711, 0,330.402], fill: "#FFE5CC", code: "O" },
      { points: [300,0, 0,330.402, 45,389.711, 120,311.769, 210,207.846], fill: "#FFFFCC", code: "S" },
      { points: [300,0, 210,207.846, 300,103.923, 390,207.846], fill: "#E5FFCC", code: "D1" },
      { points: [300,0, 390,207.846, 480,103.923, 570,207.846, 600,103.923], fill: "#CCFFCC", code: "D2" },
      { points: [300,0, 600,103.923, 600,0], fill: "#CCFFE5", code: "T1" },
      { points: [300,103.923, 390,207.846, 480,311.769, 555,389.711, 570,207.846, 600,103.923, 390,207.846], fill: "#CCE5FF", code: "T2" },
      { points: [480,311.769, 555,389.711, 600,330.402, 600,311.769], fill: "#CCCCFF", code: "T3" },
      { points: [0,519.615, 0,330.402, 120,311.769, 210,207.846, 300,103.923, 390,207.846, 480,103.923, 570,207.846, 600,103.923, 600,519.615], fill: "#E5E5FF", code: "ND" }
    ];
    
    zones.forEach(zone => {
      const polygon = document.createElementNS(xmlns, "polygon");
      polygon.setAttribute("points", zone.points.join(","));
      polygon.setAttribute("fill", zone.fill);
      polygon.setAttribute("stroke", "black");
      polygon.setAttribute("stroke-width", "0.5");
      svg.appendChild(polygon);
      
      // Add zone labels
      const labelPositions = {
        "PD": [50, 480],
        "O": [40, 390],
        "S": [150, 280],
        "D1": [300, 150],
        "D2": [450, 190],
        "T1": [550, 50],
        "T2": [500, 250],
        "T3": [550, 350],
        "ND": [300, 400]
      };
      
      const text = document.createElementNS(xmlns, "text");
      text.setAttribute("x", labelPositions[zone.code][0]);
      text.setAttribute("y", labelPositions[zone.code][1]);
      text.setAttribute("font-size", "16");
      text.setAttribute("font-weight", "bold");
      text.textContent = zone.code;
      svg.appendChild(text);
    });
    
    // Add axis labels
    const axisLabels = [
      { x: 300, y: 30, text: "CH₄" },
      { x: 120, y: 470, text: "C₂H₂" },
      { x: 480, y: 470, text: "C₂H₄" }
    ];
    
    axisLabels.forEach(label => {
      const text = document.createElementNS(xmlns, "text");
      text.setAttribute("x", label.x);
      text.setAttribute("y", label.y);
      text.setAttribute("font-size", "20");
      text.setAttribute("font-weight", "bold");
      text.textContent = label.text;
      svg.appendChild(text);
    });
    
    // Draw sample point if provided
    if (sample) {
      const { ch4, c2h4, c2h2 } = sample;
      const total = ch4 + c2h4 + c2h2;
      const m = ch4 / total;
      const e = c2h4 / total;
      const a = c2h2 / total;
      
      // Convert to Cartesian coordinates
      const x = 600 * e + 300 * m;
      const y = 519.615 * (1 - m);
      
      const point = document.createElementNS(xmlns, "circle");
      point.setAttribute("cx", x);
      point.setAttribute("cy", y);
      point.setAttribute("r", 5);
      point.setAttribute("fill", "red");
      svg.appendChild(point);
    }
  }
};
