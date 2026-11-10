const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const total = ch4 + c2h4 + c2h2;
    const percCH4 = (ch4 / total) * 100;
    const percC2H4 = (c2h4 / total) * 100;
    const percC2H2 = (c2h2 / total) * 100;

    if (percC2H2 > 98) return 'D1';
    if (percC2H2 > 89) return 'D2';
    if (percCH4 > 87) return 'D3';

    if (percC2H4 > 70 && percC2H2 <= 23) return 'T3';
    if (percC2H4 > 40 && percC2H2 <= 23) return 'T2';
    if (percC2H4 > 20 && percC2H2 <= 15) return 'T1';

    if (percCH4 > 70 && percC2H2 <= 4) return 'PD';
    if (percCH4 > 30 && percC2H2 <= 15) return 'DT';

    return 'Normal';
  },
  render(svg, sample) {
    const ns = "http://www.w3.org/2000/svg";

    function drawPolygon(points, fill, label, labelX, labelY) {
      const polygon = document.createElementNS(ns, "polygon");
      polygon.setAttribute("points", points);
      polygon.setAttribute("fill", fill);
      polygon.setAttribute("stroke", "black");
      svg.appendChild(polygon);

      if (label) {
        const text = document.createElementNS(ns, "text");
        text.setAttribute("x", labelX);
        text.setAttribute("y", labelY);
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("dominant-baseline", "middle");
        text.setAttribute("font-size", "12");
        text.textContent = label;
        svg.appendChild(text);
      }
    }

    // Draw triangle zones
    drawPolygon("300,0 0,520 600,520", "#cce5ff", "D1", 450, 150);
    drawPolygon("300,0 300,260 600,520", "#99ccff", "D2", 400, 300);
    drawPolygon("300,0 300,260 0,520", "#66b2ff", "D3", 200, 300);
    drawPolygon("300,260 200,390 400,390", "#ffcccc", "T3", 300, 370);
    drawPolygon("200,390 150,450 450,450 400,390", "#ff9999", "T2", 300, 430);
    drawPolygon("150,450 100,500 500,500 450,450", "#ff6666", "T1", 300, 490);
    drawPolygon("300,260 300,150 250,200 350,200", "#dfffcc", "PD", 300, 210);
    drawPolygon("300,150 250,200 100,500 200,390", "#a2d5ab", "DT", 200, 250);

    // Draw axis labels
    function drawAxis(x1, y1, x2, y2, label, labelX, labelY) {
      const line = document.createElementNS(ns, "line");
      line.setAttribute("x1", x1);
      line.setAttribute("y1", y1);
      line.setAttribute("x2", x2);
      line.setAttribute("y2", y2);
      line.setAttribute("stroke", "black");
      svg.appendChild(line);

      const text = document.createElementNS(ns, "text");
      text.setAttribute("x", labelX);
      text.setAttribute("y", labelY);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "middle");
      text.setAttribute("font-size", "14");
      text.textContent = label;
      svg.appendChild(text);
    }
    drawAxis(300, 0, 0, 520, "C₂H₂", 50, 100);
    drawAxis(0, 520, 600, 520, "CH₄", 300, 540);
    drawAxis(600, 520, 300, 0, "C₂H₄", 550, 100);

    // Plot sample point
    if (sample) {
      const total = sample.ch4 + sample.c2h4 + sample.c2h2;
      const x = 300 + 3 * (sample.c2h4 - sample.ch4) / total * 100;
      const y = 520 - 5.2 * (sample.c2h2 / total * 100);
      const point = document.createElementNS(ns, "circle");
      point.setAttribute("cx", x);
      point.setAttribute("cy", y);
      point.setAttribute("r", "5");
      point.setAttribute("fill", "red");
      svg.appendChild(point);
    }
  }
};
