const DuvalPentagon = {
  classify(h2, ch4, c2h6, c2h4, c2h2) {
    const total = h2 + ch4 + c2h6 + c2h4 + c2h2;
    const h2_pct = (h2 / total) * 100;
    const ch4_pct = (ch4 / total) * 100;
    const c2h6_pct = (c2h6 / total) * 100;
    const c2h4_pct = (c2h4 / total) * 100;
    const c2h2_pct = (c2h2 / total) * 100;

    if (c2h4_pct > 35 && c2h2_pct > 35) return "D1";
    if (c2h6_pct > 35 && ch4_pct > 20 && h2_pct > 15 && c2h6_pct > h2_pct) return "T2";
    if (c2h6_pct > 35 && ch4_pct > 20 && h2_pct > 15 && c2h6_pct <= h2_pct) return "T3";
    if (c2h6_pct > 35 && h2_pct > 30 && c2h6_pct > h2_pct) return "DT";
    if (c2h4_pct > 25 && c2h6_pct < 35 && c2h2_pct <= 2) return "D2";
    if (ch4_pct > 70) return "T1";
    if (h2_pct > 30 && c2h6_pct > 25 && c2h6_pct < 35) return "DT";
    if (c2h2_pct > 3 && c2h4_pct > 25) return "D1";
    return "PD";
  },

  render(svg, sample) {
    const pentagonPoints = [
      [300, 50],
      [550, 150],
      [450, 500],
      [150, 500],
      [50, 150]
    ];
    const gasLabels = ["H₂", "CH₄", "C₂H₆", "C₂H₄", "C₂H₂"];
    
    const createPolygon = (points, fill, stroke) => {
      const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      polygon.setAttribute("points", points.map(p => p.join(",")).join(" "));
      polygon.setAttribute("fill", fill);
      polygon.setAttribute("stroke", stroke);
      svg.appendChild(polygon);
    };
    
    // Draw pentagon
    createPolygon(pentagonPoints, "none", "black");

    // Draw gas axes
    pentagonPoints.forEach((point, index) => {
      const axis = document.createElementNS("http://www.w3.org/2000/svg", "line");
      axis.setAttribute("x1", 300);
      axis.setAttribute("y1", 300);
      axis.setAttribute("x2", point[0]);
      axis.setAttribute("y2", point[1]);
      axis.setAttribute("stroke", "gray");
      svg.appendChild(axis);

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", point[0]);
      label.setAttribute("y", point[1]);
      label.setAttribute("text-anchor", "middle");
      label.textContent = gasLabels[index];
      svg.appendChild(label);
    });

    // Draw zones for simplicity each zone is not exact
    createPolygon([[300, 50], [550, 150], [300, 300]], "rgba(255, 0, 0, 0.5)", "none"); // D1
    createPolygon([[300, 300], [550, 150], [450, 500]], "rgba(0, 255, 0, 0.5)", "none"); // T2-T3
    createPolygon([[450, 500], [300, 300], [150, 500]], "rgba(0, 0, 255, 0.5)", "none"); // DT-D2
    createPolygon([[150, 500], [300, 300], [50, 150]], "rgba(255, 255, 0, 0.5)", "none"); // T1
    createPolygon([[50, 150], [300, 300], [300, 50]], "rgba(255, 0, 255, 0.5)", "none"); // PD

    // Mark sample point
    if (sample) {
      const total = sample.h2 + sample.ch4 + sample.c2h6 + sample.c2h4 + sample.c2h2;
      const sampleX = 300 + 150 * (sample.h2 / total - sample.c2h2 / total);
      const sampleY = 300 + 150 * (sample.ch4 / total - sample.c2h4 / total);
      const samplePoint = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      samplePoint.setAttribute("cx", sampleX);
      samplePoint.setAttribute("cy", sampleY);
      samplePoint.setAttribute("r", 5);
      samplePoint.setAttribute("fill", "black");
      svg.appendChild(samplePoint);
    }
  }
};
