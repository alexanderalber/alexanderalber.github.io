const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const total = ch4 + c2h4 + c2h6;
    const p = [(ch4 / total) * 100, (c2h4 / total) * 100, (c2h6 / total) * 100];
    
    // Zone boundaries for Duval Triangle 5 (CH4, C2H4, C2H6)
    // PD: Partial Discharge - high CH4
    if (p[0] >= 80) return "PD";
    
    // T1: Thermal <250°C - high C2H6
    if (p[2] >= 65) return "T1";
    
    // D2: High energy discharge - very high C2H4, low C2H6
    if (p[1] >= 70 && p[2] <= 15) return "D2";
    
    // T3: Thermal >400°C - high C2H4 and C2H6
    if (p[1] >= 50 && p[2] >= 25) return "T3";
    if (p[1] >= 60 && p[2] >= 15 && p[2] < 25) return "T3";
    
    // T2: Thermal 250-400°C - moderate to high C2H6
    if (p[2] >= 45 && p[2] < 65) return "T2";
    
    // D1: Low energy discharge - high CH4 and C2H4
    if (p[0] >= 50 && p[0] < 80 && p[1] >= 20) return "D1";
    if (p[0] >= 40 && p[0] < 50 && p[1] >= 30 && p[1] < 50) return "D1";
    
    // DT: Mixed thermal and electrical
    return "DT";
  },

  render(svg, sample) {
    const NS = "http://www.w3.org/2000/svg";
    
    const top = {x: 300, y: 50};
    const left = {x: 50, y: 470};
    const right = {x: 550, y: 470};
    
    function ternaryToXY(ch4, c2h4, c2h6) {
      const t = ch4 + c2h4 + c2h6;
      const pCH4 = ch4 / t;
      const pC2H4 = c2h4 / t;
      const pC2H6 = c2h6 / t;
      return {
        x: top.x * pCH4 + right.x * pC2H4 + left.x * pC2H6,
        y: top.y * pCH4 + right.y * pC2H4 + left.y * pC2H6
      };
    }
    
    function makePolygon(points, fill, label) {
      const poly = document.createElementNS(NS, "polygon");
      const pts = points.map(p => {
        const xy = ternaryToXY(p[0], p[1], p[2]);
        return `${xy.x},${xy.y}`;
      }).join(" ");
      poly.setAttribute("points", pts);
      poly.setAttribute("fill", fill);
      poly.setAttribute("stroke", "#333");
      poly.setAttribute("stroke-width", "1.5");
      svg.appendChild(poly);
      
      const centroid = points.reduce((acc, p) => {
        const xy = ternaryToXY(p[0], p[1], p[2]);
        return {x: acc.x + xy.x / points.length, y: acc.y + xy.y / points.length};
      }, {x: 0, y: 0});
      
      const text = document.createElementNS(NS, "text");
      text.setAttribute("x", centroid.x);
      text.setAttribute("y", centroid.y);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "middle");
      text.setAttribute("font-size", "16");
      text.setAttribute("font-weight", "bold");
      text.textContent = label;
      svg.appendChild(text);
    }
    
    makePolygon([[100,0,0], [80,20,0], [80,0,20]], "#E6F2FF", "PD");
    makePolygon([[80,20,0], [50,50,0], [50,30,20], [80,0,20]], "#FFFACD", "D1");
    makePolygon([[50,50,0], [0,100,0], [0,85,15], [30,70,0]], "#FFB6C6", "D2");
    makePolygon([[0,85,15], [0,60,40], [30,45,25], [30,70,0]], "#FF9999", "T3");
    makePolygon([[0,60,40], [0,35,65], [25,30,45], [30,45,25]], "#FFC999", "T2");
    makePolygon([[0,35,65], [0,0,100], [35,0,65], [25,30,45]], "#FFE6CC", "T1");
    makePolygon([[80,0,20], [50,30,20], [30,45,25], [25,30,45], [35,0,65]], "#E6E6FA", "DT");
    
    const outline = document.createElementNS(NS, "polygon");
    outline.setAttribute("points", `${top.x},${top.y} ${right.x},${right.y} ${left.x},${left.y}`);
    outline.setAttribute("fill", "none");
    outline.setAttribute("stroke", "#000");
    outline.setAttribute("stroke-width", "3");
    svg.appendChild(outline);
    
    for (let i = 0; i <= 10; i++) {
      const pct = i * 10;
      
      const p1 = ternaryToXY(100 - pct, pct, 0);
      const p2 = ternaryToXY(0, pct, 100 - pct);
      const line1 = document.createElementNS(NS, "line");
      line1.setAttribute("x1", p1.x);
      line1.setAttribute("y1", p1.y);
      line1.setAttribute("x2", p2.x);
      line1.setAttribute("y2", p2.y);
      line1.setAttribute("stroke", "#999");
      line1.setAttribute("stroke-width", "0.5");
      svg.appendChild(line1);
      
      const p3 = ternaryToXY(100 - pct, 0, pct);
      const p4 = ternaryToXY(pct, 100 - pct, 0);
      const line2 = document.createElementNS(NS, "line");
      line2.setAttribute("x1", p3.x);
      line2.setAttribute("y1", p3.y);
      line2.setAttribute("x2", p4.x);
      line2.setAttribute("y2", p4.y);
      line2.setAttribute("stroke", "#999");
      line2.setAttribute("stroke-width", "0.5");
      svg.appendChild(line2);
      
      const p5 = ternaryToXY(pct, 100 - pct, 0);
      const p6 = ternaryToXY(pct, 0, 100 - pct);
      const line3 = document.createElementNS(NS, "line");
      line3.setAttribute("x1", p5.x);
      line3.setAttribute("y1", p5.y);
      line3.setAttribute("x2", p6.x);
      line3.setAttribute("y2", p6.y);
      line3.setAttribute("stroke", "#999");
      line3.setAttribute("stroke-width", "0.5");
      svg.appendChild(line3);
    }
    
    const labelCH4 = document.createElementNS(NS, "text");
    labelCH4.setAttribute("x", top.x);
    labelCH4.setAttribute("y", top.y - 15);
    labelCH4.setAttribute("text-anchor", "middle");
    labelCH4.setAttribute("font-size", "18");
    labelCH4.setAttribute("font-weight", "bold");
    labelCH4.textContent = "CH₄";
    svg.appendChild(labelCH4);
    
    const labelC2H4 = document.createElementNS(NS, "text");
    labelC2H4.setAttribute("x", right.x + 10);
    labelC2H4.setAttribute("y", right.y + 25);
    labelC2H4.setAttribute("text-anchor", "start");
    labelC2H4.setAttribute("font-size", "18");
    labelC2H4.setAttribute("font-weight", "bold");
    labelC2H4.textContent = "C₂H₄";
    svg.appendChild(labelC2H4);
    
    const labelC2H6 = document.createElementNS(NS, "text");
    labelC2H6.setAttribute("x", left.x - 10);
    labelC2H6.setAttribute("y", left.y + 25);
    labelC2H6.setAttribute("text-anchor", "end");
    labelC2H6.setAttribute("font-size", "18");
    labelC2H6.setAttribute("font-weight", "bold");
    labelC2H6.textContent = "C₂H₆";
    svg.appendChild(labelC2H6);
    
    if (sample) {
      const pt = ternaryToXY(sample.ch4, sample.c2h4, sample.c2h6);
      const circle = document.createElementNS(NS, "circle");
      circle.setAttribute("cx", pt.x);
      circle.setAttribute("cy", pt.y);
      circle.setAttribute("r", "6");
      circle.setAttribute("fill", "red");
      circle.setAttribute("stroke", "black");
      circle.setAttribute("stroke-width", "2");
      svg.appendChild(circle);
    }
  }
};
