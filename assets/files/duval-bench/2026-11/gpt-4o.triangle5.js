const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const total = ch4 + c2h4 + c2h6;
    const ch4_percent = (ch4 / total) * 100;
    const c2h4_percent = (c2h4 / total) * 100;
    const c2h6_percent = (c2h6 / total) * 100;

    if (ch4_percent > 98) return 'S';
    if (c2h6_percent > 59) return 'PD';
    if (c2h4_percent > 30) return 'T2';
    if (c2h6_percent > 9) return 'T1';
    return 'D1';
  },
  
  render(svg, sample) {
    const xmlns = "http://www.w3.org/2000/svg";
    
    function createPolygon(points, color, label) {
      const polygon = document.createElementNS(xmlns, "polygon");
      polygon.setAttribute("points", points);
      polygon.setAttribute("style", `fill:${color};stroke:black;stroke-width:1`);
      svg.appendChild(polygon);

      if (label) {
        const text = document.createElementNS(xmlns, "text");
        text.setAttribute("x", "50%");
        text.setAttribute("y", "50%");
        text.setAttribute("dominant-baseline", "middle");
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("fill", "black");
        text.textContent = label;
        svg.appendChild(text);
      }
    }
    
    svg.setAttribute("xmlns", xmlns);

    // Draw zones
    createPolygon("0,520 300,20 600,520", "#ffcccc"); // Background
    createPolygon("0,520 300,20 300,520", "#ff9999", "D1");
    createPolygon("0,520 300,20 300,520 0,300", "#ff6666", "T1");
    createPolygon("600,520 300,20 300,520", "#ff3333", "T2");
    createPolygon("600,520 300,20 600,300", "#cc0000", "PD");
    createPolygon("0,20 300,20 0,520", "#990000", "S");
    
    // Axes and labels
    const axis_styles = "stroke:black;stroke-width:2";
    
    function createLine(x1, y1, x2, y2) {
      const line = document.createElementNS(xmlns, "line");
      line.setAttribute("x1", x1);
      line.setAttribute("y1", y1);
      line.setAttribute("x2", x2);
      line.setAttribute("y2", y2);
      line.setAttribute("style", axis_styles);
      svg.appendChild(line);
    }
    
    function createText(x, y, textContent) {
      const text = document.createElementNS(xmlns, "text");
      text.setAttribute("x", x);
      text.setAttribute("y", y);
      text.setAttribute("dominant-baseline", "middle");
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("fill", "black");
      text.textContent = textContent;
      svg.appendChild(text);
    }
    
    createLine(0, 520, 300, 20);
    createLine(300, 20, 600, 520);
    createLine(0, 520, 600, 520);

    createText(0, 540, "CH4");
    createText(300, 540, "C2H4");
    createText(600, 540, "C2H6");

    // Sample point
    if (sample) {
      const total = sample.ch4 + sample.c2h4 + sample.c2h6;
      const x = (sample.ch4 / total) * 300 + (sample.c2h4 / total) * 600;
      const y = 520 - (sample.ch4 / total) * 500;

      const circle = document.createElementNS(xmlns, "circle");
      circle.setAttribute("cx", x);
      circle.setAttribute("cy", y);
      circle.setAttribute("r", 5);
      circle.setAttribute("style", "fill:blue;stroke:black;stroke-width:1");
      svg.appendChild(circle);
    }
  }
};
