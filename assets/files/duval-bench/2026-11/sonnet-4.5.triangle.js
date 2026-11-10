const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const total = ch4 + c2h4 + c2h2;
    const pCH4 = (ch4 / total) * 100;
    const pC2H4 = (c2h4 / total) * 100;
    const pC2H2 = (c2h2 / total) * 100;
    
    // Zone boundaries based on percentages
    // PD: high CH4 (>98%)
    if (pCH4 >= 98) return "PD";
    
    // D2: high C2H2 (>29%)
    if (pC2H2 > 29) return "D2";
    
    // D1: moderate C2H2 (13-29%)
    if (pC2H2 >= 13 && pC2H2 <= 29) {
      if (pC2H4 < 23) return "D1";
    }
    
    // T3: high C2H4 (>50%) with low C2H2
    if (pC2H4 > 50 && pC2H2 < 15) return "T3";
    
    // T2: C2H4 20-50%, low C2H2
    if (pC2H4 >= 20 && pC2H4 <= 50 && pC2H2 < 15) return "T2";
    
    // T1: remaining thermal region
    if (pC2H2 < 4 && pC2H4 < 20) return "T1";
    
    // DT: mixed region between thermal and discharge
    if (pC2H2 >= 4 && pC2H2 < 13 && pC2H4 > 23) return "DT";
    if (pC2H2 >= 13 && pC2H4 >= 23) return "DT";
    if (pC2H2 >= 4 && pC2H2 < 15 && pC2H4 >= 15 && pC2H4 <= 23) return "DT";
    
    // Default cases
    if (pC2H2 < 13) {
      if (pC2H4 > 40) return "T3";
      if (pC2H4 > 20) return "T2";
      return "T1";
    }
    
    return "D1";
  },

  render(svg, sample) {
    const NS = "http://www.w3.org/2000/svg";
    
    // Triangle vertices in SVG coordinates
    const top = { x: 300, y: 50 };      // 100% CH4
    const left = { x: 50, y: 500 };     // 100% C2H4
    const right = { x: 550, y: 500 };   // 100% C2H2
    
    // Convert ternary percentages to x,y coordinates
    const ternaryToXY = (pCH4, pC2H4, pC2H2) => {
      const p1 = pCH4 / 100;
      const p2 = pC2H4 / 100;
      const p3 = pC2H2 / 100;
      return {
        x: top.x * p1 + left.x * p2 + right.x * p3,
        y: top.y * p1 + left.y * p2 + right.y * p3
      };
    };
    
    // Define zones as polygons (CH4%, C2H4%, C2H2%)
    const zones = [
      { code: "PD", color: "#87CEEB", points: [[100,0,0], [98,0,2], [98,2,0]] },
      { code: "T1", color: "#FFE4B5", points: [[98,2,0], [98,0,2], [77,20,3], [77,23,0]] },
      { code: "T2", color: "#FFD700", points: [[77,23,0], [77,20,3], [50,46,4], [50,50,0]] },
      { code: "T3", color: "#FF8C00", points: [[50,50,0], [50,46,4], [0,85,15], [0,100,0]] },
      { code: "DT", color: "#90EE90", points: [[50,46,4], [77,20,3], [64,23,13], [37,40,23], [0,85,15]] },
      { code: "D1", color: "#FFB6C1", points: [[64,23,13], [77,20,3], [77,0,23], [58,13,29], [37,40,23]] },
      { code: "D2", color: "#FF69B4", points: [[77,0,23], [100,0,0], [98,0,2], [71,0,29], [58,13,29]] }
    ];
    
    // Adjust zone boundaries
    zones[6].points = [[58,13,29], [71,0,29], [0,0,100], [0,71,29], [37,40,23]];
    zones[4].points = [[37,40,23], [58,13,29], [64,23,13], [50,46,4], [0,85,15], [0,71,29]];
    zones[5].points = [[64,23,13], [58,13,29], [77,20,3]];
    
    // Simplified zone definitions
    const finalZones = [
      { code: "PD", color: "#B0E0E6", points: [[100,0,0], [98,0,2], [98,2,0]] },
      { code: "T1", color: "#FFFACD", points: [[98,2,0], [98,0,2], [76,4,20], [80,20,0]] },
      { code: "T2", color: "#FFD700", points: [[80,20,0], [76,4,20], [50,15,35], [50,50,0]] },
      { code: "T3", color: "#FF8C00", points: [[50,50,0], [50,15,35], [20,65,15], [0,100,0]] },
      { code: "DT", color: "#98FB98", points: [[20,65,15], [50,15,35], [35,42,23], [20,57,23]] },
      { code: "D1", color: "#FFB6C1", points: [[35,42,23], [50,15,35], [76,4,20], [71,0,29], [29,42,29]] },
      { code: "D2", color: "#FF1493", points: [[71,0,29], [100,0,0], [0,0,100], [29,42,29]] }
    ];
    
    // Draw zones
    finalZones.forEach(zone => {
      const path = document.createElementNS(NS, "path");
      const coords = zone.points.map(p => ternaryToXY(p[0], p[1], p[2]));
      const d = "M " + coords.map(c => `${c.x},${c.y}`).join(" L ") + " Z";
      path.setAttribute("d", d);
      path.setAttribute("fill", zone.color);
      path.setAttribute("stroke", "#333");
      path.setAttribute("stroke-width", "1.5");
      svg.appendChild(path);
      
      // Label
      const centroid = coords.reduce((acc, c) => ({ x: acc.x + c.x / coords.length, y: acc.y + c.y / coords.length }), {x:0, y:0});
      const text = document.createElementNS(NS, "text");
      text.setAttribute("x", centroid.x);
      text.setAttribute("y", centroid.y);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "middle");
      text.setAttribute("font-size", "18");
      text.setAttribute("font-weight", "bold");
      text.textContent = zone.code;
      svg.appendChild(text);
    });
    
    // Draw triangle outline
    const outline = document.createElementNS(NS, "polygon");
    outline.setAttribute("points", `${top.x},${top.y} ${left.x},${left.y} ${right.x},${right.y}`);
    outline.setAttribute("fill", "none");
    outline.setAttribute("stroke", "#000");
    outline.setAttribute("stroke-width", "3");
    svg.appendChild(outline);
    
    // Draw axes labels
    const labels = [
      { text: "CH₄", x: top.x, y: 30, anchor: "middle" },
      { text: "C₂H₄", x: left.x - 20, y: left.y + 20, anchor: "middle" },
      { text: "C₂H₂", x: right.x + 20, y: right.y + 20, anchor: "middle" }
    ];
    
    labels.forEach(label => {
      const text = document.createElementNS(NS, "text");
      text.setAttribute("x", label.x);
      text.setAttribute("y", label.y);
      text.setAttribute("text-anchor", label.anchor);
      text.setAttribute("font-size", "20");
      text.setAttribute("font-weight", "bold");
      text.textContent = label.text;
      svg.appendChild(text);
    });
    
    // Draw tick marks and percentages
    for (let i = 0; i <= 10; i++) {
      const pct = i * 10;
      
      // Bottom axis ticks (C2H2)
      const pos = { x: left.x + (right.x - left.x) * i / 10, y: left.y };
      const tick = document.createElementNS(NS, "line");
      tick.setAttribute("x1", pos.x);
      tick.setAttribute("y1", pos.y);
      tick.setAttribute("x2", pos.x);
      tick.setAttribute("y2", pos.y + 8);
      tick.setAttribute("stroke", "#000");
      tick.setAttribute("stroke-width", "2");
      svg.appendChild(tick);
      
      if (i % 2 === 0) {
        const text = document.createElementNS(NS, "text");
        text.setAttribute("x", pos.x);
        text.setAttribute("y", pos.y + 25);
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("font-size", "12");
        text.textContent = pct;
        svg.appendChild(text);
      }
    }
    
    // Draw sample point
    if (sample) {
      const total = sample.ch4 + sample.c2h4 + sample.c2h2;
      const pCH4 = (sample.ch4 / total) * 100;
      const pC2H4 = (sample.c2h4 / total) * 100;
      const pC2H2 = (sample.c2h2 / total) * 100;
      const pos = ternaryToXY(pCH4, pC2H4, pC2H2);
      
      const circle = document.createElementNS(NS, "circle");
      circle.setAttribute("cx", pos.x);
      circle.setAttribute("cy", pos.y);
      circle.setAttribute("r", "6");
      circle.setAttribute("fill", "red");
      circle.setAttribute("stroke", "#000");
      circle.setAttribute("stroke-width", "2");
      svg.appendChild(circle);
    }
  }
};
