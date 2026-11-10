const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const total = ch4 + c2h4 + c2h2;
    const pCh4 = (ch4 / total) * 100;
    const pC2H4 = (c2h4 / total) * 100;
    const pC2H2 = (c2h2 / total) * 100;

    // Zone boundaries from memory
    if (pC2H2 >= 98) return "PD";
    if (pC2H2 <= 15) {
      if (pCh4 <= 23) return "T1";
      if (pCh4 <= 40) return "T2";
      return "T3";
    }
    if (pC2H2 <= 29) {
      if (pCh4 <= 23) return "D1";
      return "T2";
    }
    if (pC2H2 <= 50) {
      if (pCh4 <= 40) return "D1";
      return "D2";
    }
    if (pC2H2 <= 70) {
      if (pCh4 <= 25) return "D1";
      return "D2";
    }
    if (pC2H2 <= 98) {
      if (pCh4 <= 13) return "D1";
      if (pCh4 <= 25) return "D2";
    }
    return "D2";
  },

  render(svg, sample) {
    const ns = "http://www.w3.org/2000/svg";
    
    // Triangle vertices
    const top = { x: 300, y: 30 };    // CH4 (100%)
    const left = { x: 60, y: 510 };   // C2H4 (100%)
    const right = { x: 540, y: 510 }; // C2H2 (100%)
    
    // Zone polygons
    const zones = {
      PD: [{x: 540, y: 510}, {x: 532, y: 510}, {x: 532, y: 485}, {x: 540, y: 465}],
      D1: [{x: 532, y: 510}, {x: 420, y: 510}, {x: 300, y: 290}, {x: 300, y: 170}, {x: 340, y: 110}, {x: 440, y: 110}, {x: 532, y: 485}],
      D2: [{x: 300, y: 290}, {x: 180, y: 110}, {x: 340, y: 110}, {x: 300, y: 170}],
      T3: [{x: 180, y: 110}, {x: 300, y: 290}, {x: 60, y: 510}, {x: 60, y: 415}, {x: 100, y: 340}],
      T2: [{x: 60, y: 415}, {x: 60, y: 510}, {x: 300, y: 510}, {x: 200, y: 360}],
      T1: [{x: 200, y: 360}, {x: 300, y: 510}, {x: 420, y: 510}, {x: 300, y: 290}]
    };
    
    // Zone colors and labels
    const zoneInfo = [
      { id: "PD", color: "#ff9999", label: "PD", pos: { x: 520, y: 495 } },
      { id: "D1", color: "#ffcc99", label: "D1", pos: { x: 460, y: 400 } },
      { id: "D2", color: "#ffff99", label: "D2", pos: { x: 250, y: 200 } },
      { id: "T3", color: "#99ff99", label: "T3", pos: { x: 150, y: 200 } },
      { id: "T2", color: "#99ffff", label: "T2", pos: { x: 180, y: 430 } },
      { id: "T1", color: "#9999ff", label: "T1", pos: { x: 380, y: 430 } }
    ];
    
    // Draw zones
    zoneInfo.forEach(info => {
      const poly = document.createElementNS(ns, "polygon");
      poly.setAttribute("points", zones[info.id].map(p => `${p.x},${p.y}`).join(" "));
      poly.setAttribute("fill", info.color);
      poly.setAttribute("stroke", "#000");
      poly.setAttribute("stroke-width", "1");
      svg.appendChild(poly);
      
      const text = document.createElementNS(ns, "text");
      text.setAttribute("x", info.pos.x);
      text.setAttribute("y", info.pos.y);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("font-size", "20");
      text.setAttribute("font-weight", "bold");
      text.textContent = info.label;
      svg.appendChild(text);
    });
    
    // Draw triangle outline
    const outline = document.createElementNS(ns, "polygon");
    outline.setAttribute("points", `${top.x},${top.y} ${left.x},${left.y} ${right.x},${right.y}`);
    outline.setAttribute("fill", "none");
    outline.setAttribute("stroke", "#000");
    outline.setAttribute("stroke-width", "3");
    svg.appendChild(outline);
    
    // Draw axes and labels
    const axes = [
      { start: top, end: left, label: "C₂H₄", offset: { x: -30, y: 20 }, ticks: 5 },
      { start: left, end: right, label: "C₂H₂", offset: { x: 0, y: 30 }, ticks: 5 },
      { start: right, end: top, label: "CH₄", offset: { x: 30, y: 20 }, ticks: 5 }
    ];
    
    axes.forEach(axis => {
      const line = document.createElementNS(ns, "line");
      line.setAttribute("x1", axis.start.x);
      line.setAttribute("y1", axis.start.y);
      line.setAttribute("x2", axis.end.x);
      line.setAttribute("y2", axis.end.y);
      line.setAttribute("stroke", "#000");
      line.setAttribute("stroke-width", "2");
      line.setAttribute("stroke-dasharray", "5,5");
      svg.appendChild(line);
      
      const midX = (axis.start.x + axis.end.x) / 2;
      const midY = (axis.start.y + axis.end.y) / 2;
      const text = document.createElementNS(ns, "text");
      text.setAttribute("x", midX + axis.offset.x);
      text.setAttribute("y", midY + axis.offset.y);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("font-size", "18");
      text.setAttribute("font-weight", "bold");
      text.textContent = axis.label;
      svg.appendChild(text);
      
      // Draw ticks
      for (let i = 1; i <= axis.ticks; i++) {
        const t = i / (axis.ticks + 1);
        const tickX = axis.start.x + (axis.end.x - axis.start.x) * t;
        const tickY = axis.start.y + (axis.end.y - axis.start.y) * t;
        
        const tick = document.createElementNS(ns, "line");
        const angle = Math.atan2(axis.end.y - axis.start.y, axis.end.x - axis.start.x);
        const dx = Math.sin(angle) * 10;
        const dy = -Math.cos(angle) * 10;
        
        tick.setAttribute("x1", tickX - dx);
        tick.setAttribute("y1", tickY - dy);
        tick.setAttribute("x2", tickX + dx);
        tick.setAttribute("y2", tickY + dy);
        tick.setAttribute("stroke", "#000");
        tick.setAttribute("stroke-width", "1");
        svg.appendChild(tick);
        
        const perc = document.createElementNS(ns, "text");
        perc.setAttribute("x", tickX - dx * 1.5);
        perc.setAttribute("y", tickY - dy * 1.5);
        perc.setAttribute("text-anchor", "middle");
        perc.setAttribute("font-size", "12");
        perc.textContent = `${(100 - i * 20)}%`;
        svg.appendChild(perc);
      }
    });
    
    // Draw sample point if provided
    if (sample) {
      const total = sample.ch4 + sample.c2h4 + sample.c2h2;
      const pCh4 = sample.ch4 / total;
      const pC2H4 = sample.c2h4 / total;
      const pC2H2 = sample.c2h2 / total;
      
      // Barycentric coordinates to Cartesian
      const x = top.x * pCh4 + left.x * pC2H4 + right.x * pC2H2;
      const y = top.y * pCh4 + left.y * pC2H4 + right.y * pC2H2;
      
      const point = document.createElementNS(ns, "circle");
      point.setAttribute("cx", x);
      point.setAttribute("cy", y);
      point.setAttribute("r", "8");
      point.setAttribute("fill", "#ff0000");
      point.setAttribute("stroke", "#000");
      point.setAttribute("stroke-width", "2");
      svg.appendChild(point);
      
      const label = document.createElementNS(ns, "text");
      label.setAttribute("x", x + 15);
      label.setAttribute("y", y - 15);
      label.setAttribute("font-size", "14");
      label.setAttribute("font-weight", "bold");
      label.textContent = this.classify(sample.ch4, sample.c2h4, sample.c2h2);
      svg.appendChild(label);
    }
  }
};
