const DuvalTriangle5 = {
  classify: function(ch4, c2h4, c2h6) {
    const total = ch4 + c2h4 + c2h6;
    if (total <= 0) return "";

    const pCH4 = (ch4 / total) * 100;
    const pC2H4 = (c2h4 / total) * 100;
    const pC2H6 = (c2h6 / total) * 100;

    // Duval Triangle 5 Logic (IEC 60599)
    // Zones: S, T1, D1, D2, DT
    
    if (pC2H4 < 10) {
      // Right side of the triangle (Low C2H4)
      if (pC2H6 > 50) {
        return "S"; // Stray Gassing
      } else {
        return "T1"; // Thermal < 300C
      }
    } else {
      // Left side of the triangle (High C2H4)
      if (pC2H4 > 50) {
        return "D2"; // High Energy Discharge
      } else {
        // Middle band of the left side
        if (pCH4 > pC2H6) {
          return "D1"; // Low Energy Discharge
        } else {
          return "DT"; // Discharge + Thermal
        }
      }
    }
  },

  render: function(svg, sample) {
    // Clear SVG
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    const NS = "http://www.w3.org/2000/svg";
    const width = 600;
    const height = 540;

    // Vertices for Equilateral Triangle
    // Top: CH4, Left: C2H4, Right: C2H6
    // Adjusted to fit 600x540 viewBox nicely
    const vCH4 = { x: 300, y: 84 };
    const vC2H4 = { x: 60, y: 500 };
    const vC2H6 = { x: 540, y: 500 };

    // Helper to convert percentages to Cartesian coordinates
    const getPoint = (pCH4, pC2H4, pC2H6) => {
      const fCH4 = pCH4 / 100;
      const fC2H4 = pC2H4 / 100;
      const fC2H6 = pC2H6 / 100;
      return {
        x: fCH4 * vCH4.x + fC2H4 * vC2H4.x + fC2H6 * vC2H6.x,
        y: fCH4 * vCH4.y + fC2H4 * vC2H4.y + fC2H6 * vC2H6.y
      };
    };

    // Define Key Points based on boundaries (10%, 50%, median)
    const p90_10_0 = getPoint(90, 10, 0);   // On Left Edge, 10% C2H4
    const p0_10_90 = getPoint(0, 10, 90);   // On Bottom Edge, 10% C2H4
    const p50_50_0 = getPoint(50, 50, 0);   // Mid Left Edge
    const p0_50_50 = getPoint(0, 50, 50);   // Mid Bottom Edge
    const p50_0_50 = getPoint(50, 0, 50);   // Mid Right Edge
    const p45_10_45 = getPoint(45, 10, 45); // Intersection 10% C2H4 & CH4=C2H6
    const p40_10_50 = getPoint(40, 10, 50); // Intersection 10% C2H4 & C2H6=50%
    const p25_50_25 = getPoint(25, 50, 25); // Intersection 50% C2H4 & CH4=C2H6

    // Zone Colors
    const colors = {
      S: "#6699FF",   // Blue
      T1: "#66CC66",  // Green
      D1: "#FFCC00",  // Yellow
      D2: "#FF6666",  // Red
      DT: "#FF9933"   // Orange
    };

    // Draw Zones
    const zones = [
      { id: "D2", points: [vC2H4, p50_50_0, p0_50_50] },
      { id: "D1", points: [p50_50_0, p90_10_0, p45_10_45, p25_50_25] },
      { id: "DT", points: [p25_50_25, p45_10_45, p40_10_50, p0_50_50] },
      { id: "S",  points: [p40_10_50, p0_10_90, vC2H6, p50_0_50] },
      { id: "T1", points: [vCH4, p90_10_0, p40_10_50, p50_0_50] }
    ];

    zones.forEach(zone => {
      const poly = document.createElementNS(NS, "polygon");
      const ptsStr = zone.points.map(p => `${p.x},${p.y}`).join(" ");
      poly.setAttribute("points", ptsStr);
      poly.setAttribute("fill", colors[zone.id]);
      poly.setAttribute("stroke", "#FFFFFF");
      poly.setAttribute("stroke-width", "2");
      svg.appendChild(poly);

      // Label Zone
      // Calculate centroid for label
      let cx = 0, cy = 0;
      zone.points.forEach(p => { cx += p.x; cy += p.y; });
      cx /= zone.points.length;
      cy /= zone.points.length;

      const text = document.createElementNS(NS, "text");
      text.setAttribute("x", cx);
      text.setAttribute("y", cy);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "middle");
      text.setAttribute("font-family", "Arial, sans-serif");
      text.setAttribute("font-size", "20");
      text.setAttribute("font-weight", "bold");
      text.setAttribute("fill", "#333333");
      text.textContent = zone.id;
      svg.appendChild(text);
    });

    // Draw Triangle Outline
    const outline = document.createElementNS(NS, "polygon");
    outline.setAttribute("points", `${vCH4.x},${vCH4.y} ${vC2H4.x},${vC2H4.y} ${vC2H6.x},${vC2H6.y}`);
    outline.setAttribute("fill", "none");
    outline.setAttribute("stroke", "#000000");
    outline.setAttribute("stroke-width", "3");
    svg.appendChild(outline);

    // Draw Axes Labels
    const labels = [
      { text: "CH4", x: vCH4.x, y: vCH4.y - 20 },
      { text: "C2H4", x: vC2H4.x - 40, y: vC2H4.y + 30 },
      { text: "C2H6", x: vC2H6.x + 10, y: vC2H6.y + 30 }
    ];

    labels.forEach(l => {
      const t = document.createElementNS(NS, "text");
      t.setAttribute("x", l.x);
      t.setAttribute("y", l.y);
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("font-family", "Arial, sans-serif");
      t.setAttribute("font-size", "18");
      t.setAttribute("font-weight", "bold");
      t.textContent = l.text;
      svg.appendChild(t);
    });

    // Draw Ticks (Simplified)
    const drawTicks = (p1, p2, labelFn) => {
      for (let i = 20; i < 100; i += 20) {
        const ratio = i / 100;
        const x = p1.x + (p2.x - p1.x) * ratio;
        const y = p1.y + (p2.y - p1.y) * ratio;
        
        // Tick line
        const line = document.createElementNS(NS, "line");
        // Simple perpendicular approximation or just small line
        line.setAttribute("x1", x - 5); line.setAttribute("y1", y);
        line.setAttribute("x2", x + 5); line.setAttribute("y2", y);
        line.setAttribute("stroke", "#000");
        svg.appendChild(line);

        // Tick label
        const t = document.createElementNS(NS, "text");
        t.setAttribute("x", x);
        t.setAttribute("y", y - 10);
        t.setAttribute("text-anchor", "middle");
        t.setAttribute("font-size", "12");
        t.textContent = i;
        svg.appendChild(t);
      }
    };

    // Left Edge (CH4 -> C2H4)
    drawTicks(vCH4, vC2H4);
    // Right Edge (CH4 -> C2H6)
    drawTicks(vCH4, vC2H6);
    // Bottom Edge (C2H4 -> C2H6)
    drawTicks(vC2H4, vC2H6);

    // Draw Sample Point
    if (sample) {
      const total = sample.ch4 + sample.c2h4 + sample.c2h6;
      if (total > 0) {
        const pCH4 = (sample.ch4 / total) * 100;
        const pC2H4 = (sample.c2h4 / total) * 100;
        const pC2H6 = (sample.c2h6 / total) * 100;
        const pt = getPoint(pCH4, pC2H4, pC2H6);

        const circle = document.createElementNS(NS, "circle");
        circle.setAttribute("cx", pt.x);
        circle.setAttribute("cy", pt.y);
        circle.setAttribute("r", "8");
        circle.setAttribute("fill", "#FFFFFF");
        circle.setAttribute("stroke", "#FF0000");
        circle.setAttribute("stroke-width", "3");
        svg.appendChild(circle);
      }
    }
  }
};
