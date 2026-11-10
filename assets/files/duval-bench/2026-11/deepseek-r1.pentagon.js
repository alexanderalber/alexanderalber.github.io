const DuvalPentagon = {
  classify(h2, ch4, c2h6, c2h4, c2h2) {
    const total = h2 + ch4 + c2h6 + c2h4 + c2h2;
    if (total <= 0) return "N/A";
    
    const ph2 = h2 / total * 100;
    const pch4 = ch4 / total * 100;
    const pc2h6 = c2h6 / total * 100;
    const pc2h4 = c2h4 / total * 100;
    const pc2h2 = c2h2 / total * 100;
    
    if (ph2 >= 50) {
      return pc2h2 < 15 ? "PD" : "D1";
    } else if (pc2h2 >= 50) {
      return "D2";
    } else if (pch4 >= 50) {
      return "T3";
    } else if (pc2h4 >= 50) {
      return "T2";
    } else if (pc2h6 >= 50) {
      return "T1";
    } else {
      const percents = [ph2, pch4, pc2h6, pc2h4, pc2h2];
      const maxIdx = percents.indexOf(Math.max(...percents));
      if (maxIdx === 0) return pc2h2 >= 15 ? "D1" : "PD";
      if (maxIdx === 1) return "T3";
      if (maxIdx === 2) return "T1";
      if (maxIdx === 3) return "T2";
      return "D2";
    }
  },

  render(svg, sample) {
    const center = [300, 300];
    const radius = 250;
    const angles = [90, 162, 234, 306, 18];
    const gasNames = ["H₂", "CH₄", "C₂H₆", "C₂H₄", "C₂H₂"];
    const zoneColors = {
      PD: "#ADD8E6", D1: "#90EE90", D2: "#006400",
      T1: "#FFFF00", T2: "#FFA500", T3: "#FF0000"
    };
    
    const vertices = angles.map(deg => {
      const rad = deg * Math.PI / 180;
      return [
        center[0] + radius * Math.cos(rad),
        center[1] - radius * Math.sin(rad)
      ];
    });
    
    const midpoints = vertices.map((v, i) => {
      const next = vertices[(i + 1) % 5];
      return [(v[0] + next[0]) / 2, (v[1] + next[1]) / 2];
    });
    
    const zones = {
      PD: [vertices[0], midpoints[0], midpoints[4]],
      T3: [vertices[1], midpoints[0], midpoints[1]],
      T1: [vertices[2], midpoints[1], midpoints[2]],
      T2: [vertices[3], midpoints[2], midpoints[3]],
      D2: [vertices[4], midpoints[3], midpoints[4]],
      D1: [midpoints[0], midpoints[1], midpoints[2], midpoints[3], midpoints[4]]
    };
    
    Object.entries(zones).forEach(([zone, points]) => {
      const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      polygon.setAttribute("points", points.map(p => p.join(",")).join(" "));
      polygon.setAttribute("fill", zoneColors[zone]);
      polygon.setAttribute("stroke", "black");
      polygon.setAttribute("stroke-width", "1");
      svg.appendChild(polygon);
      
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      let textX, textY;
      if (zone === "D1") {
        textX = center[0];
        textY = center[1];
      } else {
        textX = (points[0][0] + points[1][0] + points[2][0]) / 3;
        textY = (points[0][1] + points[1][1] + points[2][1]) / 3;
      }
      text.setAttribute("x", textX);
      text.setAttribute("y", textY);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "middle");
      text.setAttribute("font-size", "20");
      text.textContent = zone;
      svg.appendChild(text);
    });
    
    const outline = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    outline.setAttribute("points", vertices.map(v => v.join(",")).join(" "));
    outline.setAttribute("fill", "none");
    outline.setAttribute("stroke", "black");
    outline.setAttribute("stroke-width", "2");
    svg.appendChild(outline);
    
    vertices.forEach((v, i) => {
      const axis = document.createElementNS("http://www.w3.org/2000/svg", "line");
      axis.setAttribute("x1", center[0]);
      axis.setAttribute("y1", center[1]);
      axis.setAttribute("x2", v[0]);
      axis.setAttribute("y2", v[1]);
      axis.setAttribute("stroke", "gray");
      axis.setAttribute("stroke-width", "1");
      svg.appendChild(axis);
      
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      const dx = v[0] - center[0];
      const dy = v[1] - center[1];
      const dist = Math.sqrt(dx * dx + dy * dy);
      text.setAttribute("x", center[0] + dx * 1.1);
      text.setAttribute("y", center[1] + dy * 1.1);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "middle");
      text.textContent = gasNames[i];
      svg.appendChild(text);
    });
    
    if (sample) {
      const total = sample.h2 + sample.ch4 + sample.c2h6 + sample.c2h4 + sample.c2h2;
      if (total > 0) {
        const weights = [
          sample.h2 / total,
          sample.ch4 / total,
          sample.c2h6 / total,
          sample.c2h4 / total,
          sample.c2h2 / total
        ];
        const x = vertices.reduce((sum, v, i) => sum + v[0] * weights[i], 0);
        const y = vertices.reduce((sum, v, i) => sum + v[1] * weights[i], 0);
        
        const point = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        point.setAttribute("cx", x);
        point.setAttribute("cy", y);
        point.setAttribute("r", 5);
        point.setAttribute("fill", "black");
        svg.appendChild(point);
      }
    }
  }
};
