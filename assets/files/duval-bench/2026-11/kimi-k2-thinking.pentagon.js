const DuvalPentagon = {
  classify(h2, ch4, c2h6, c2h4, c2h2) {
    const total = h2 + ch4 + c2h6 + c2h4 + c2h2;
    if (total === 0) return "N/A";
    
    const pH2 = (h2 / total) * 100;
    const pCH4 = (ch4 / total) * 100;
    const pC2H6 = (c2h6 / total) * 100;
    const pC2H4 = (c2h4 / total) * 100;
    const pC2H2 = (c2h2 / total) * 100;
    
    if (pH2 > 90) return "PD";
    
    if (pC2H2 > 35) {
      if (pC2H4 > 15 || pCH4 > 15) return "DT";
      return "D2";
    }
    
    if (pC2H2 > 8) return "D1";
    
    if (pC2H4 > 50) return "T3";
    if (pC2H4 > 20) return "T2";
    if (pCH4 > 35 || pC2H6 > 35) return "T1";
    
    return "DT";
  },
  
  render(svg, sample) {
    const ns = "http://www.w3.org/2000/svg";
    const cx = 300, cy = 300, r = 250;
    
    const deg = Math.PI / 180;
    const vertices = [
      {name: "H2", x: cx + r * Math.cos(90 * deg), y: cy - r * Math.sin(90 * deg)},
      {name: "CH4", x: cx + r * Math.cos(18 * deg), y: cy - r * Math.sin(18 * deg)},
      {name: "C2H6", x: cx + r * Math.cos(-54 * deg), y: cy - r * Math.sin(-54 * deg)},
      {name: "C2H4", x: cx + r * Math.cos(234 * deg), y: cy - r * Math.sin(234 * deg)},
      {name: "C2H2", x: cx + r * Math.cos(162 * deg), y: cy - r * Math.sin(162 * deg)}
    ];
    
    const center = {x: cx, y: cy};
    
    function interp(v1, v2, t) {
      return {x: v1.x + (v2.x - v1.x) * t, y: v1.y + (v2.y - v1.y) * t};
    }
    
    const m = [
      interp(vertices[0], vertices[1], 0.5),
      interp(vertices[1], vertices[2], 0.5),
      interp(vertices[2], vertices[3], 0.5),
      interp(vertices[3], vertices[4], 0.5),
      interp(vertices[4], vertices[0], 0.5)
    ];
    
    const zones = [
      {code: "PD", color: "#E6F3FF", points: [vertices[0], interp(vertices[0], vertices[1], 0.15), interp(vertices[0], vertices[4], 0.15)]},
      {code: "D2", color: "#E6E6FA", points: [vertices[4], interp(vertices[4], vertices[3], 0.15), interp(vertices[4], vertices[0], 0.15)]},
      {code: "T3", color: "#FFE4E1", points: [vertices[3], interp(vertices[3], vertices[2], 0.15), interp(vertices[3], vertices[4], 0.15)]},
      {code: "T1", color: "#FFFACD", points: [vertices[1], vertices[2], interp(vertices[2], vertices[3], 0.3), center, interp(vertices[1], vertices[0], 0.3)]},
      {code: "T2", color: "#FFE4B5", points: [interp(vertices[2], vertices[3], 0.3), vertices[3], interp(vertices[3], vertices[4], 0.3), center]},
      {code: "D1", color: "#F0E6FA", points: [interp(vertices[0], vertices[4], 0.15), vertices[4], interp(vertices[4], vertices[3], 0.15), interp(vertices[3], center, 0.5), center, interp(vertices[0], center, 0.5)]},
      {code: "DT", color: "#E6F5E6", points: [center, interp(vertices[1], center, 0.5), interp(vertices[2], center, 0.5), interp(vertices[3], center, 0.5), interp(vertices[4], center, 0.5)]}
    ];
    
    zones.forEach(z => {
      const poly = document.createElementNS(ns, "polygon");
      const pts = z.points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
      poly.setAttribute("points", pts);
      poly.setAttribute("fill", z.color);
      poly.setAttribute("stroke", "#666");
      poly.setAttribute("stroke-width", "1");
      svg.appendChild(poly);
      
      const lbl = document.createElementNS(ns, "text");
      const centroid = z.points.reduce((a, b) => ({x: a.x + b.x, y: a.y + b.y}), {x: 0, y: 0});
      lbl.setAttribute("x", (centroid.x / z.points.length).toFixed(1));
      lbl.setAttribute("y", (centroid.y / z.points.length).toFixed(1));
      lbl.setAttribute("text-anchor", "middle");
      lbl.setAttribute("dominant-baseline", "middle");
      lbl.setAttribute("font-size", "14");
      lbl.setAttribute("font-weight", "bold");
      lbl.setAttribute("fill", "#333");
      lbl.textContent = z.code;
      svg.appendChild(lbl);
    });
    
    const outline = document.createElementNS(ns, "polygon");
    const outerPts = vertices.map(v => `${v.x.toFixed(1)},${v.y.toFixed(1)}`).join(" ");
    outline.setAttribute("points", outerPts);
    outline.setAttribute("fill", "none");
    outline.setAttribute("stroke", "#000");
    outline.setAttribute("stroke-width", "2");
    svg.appendChild(outline);
    
    vertices.forEach((v, i) => {
      const line = document.createElementNS(ns, "line");
      line.setAttribute("x1", cx);
      line.setAttribute("y1", cy);
      line.setAttribute("x2", v.x);
      line.setAttribute("y2", v.y);
      line.setAttribute("stroke", "#999");
      line.setAttribute("stroke-width", "1");
      svg.appendChild(line);
      
      const text = document.createElementNS(ns, "text");
      const dx = v.x - cx;
      const dy = v.y - cy;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const tx = v.x + (dx / dist) * 30;
      const ty = v.y + (dy / dist) * 30;
      text.setAttribute("x", tx);
      text.setAttribute("y", ty);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "middle");
      text.setAttribute("font-size", "16");
      text.setAttribute("font-weight", "bold");
      text.textContent = v.name;
      svg.appendChild(text);
    });
    
    if (sample) {
      const total = sample.h2 + sample.ch4 + sample.c2h6 + sample.c2h4 + sample.c2h2;
      if (total > 0) {
        const p = [
          sample.h2 / total,
          sample.ch4 / total,
          sample.c2h6 / total,
          sample.c2h4 / total,
          sample.c2h2 / total
        ];
        
        let px = 0, py = 0;
        for (let i = 0; i < 5; i++) {
          px += p[i] * vertices[i].x;
          py += p[i] * vertices[i].y;
        }
        
        const circle = document.createElementNS(ns, "circle");
        circle.setAttribute("cx", px);
        circle.setAttribute("cy", py);
        circle.setAttribute("r", "8");
        circle.setAttribute("fill", "red");
        circle.setAttribute("stroke", "black");
        circle.setAttribute("stroke-width", "2");
        svg.appendChild(circle);
      }
    }
  }
};
