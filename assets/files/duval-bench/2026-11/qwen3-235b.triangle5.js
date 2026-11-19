const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const total = ch4 + c2h4 + c2h6;
    if (total === 0) return 'ND'; // No gas detected
    
    const pCH4 = (ch4 / total) * 100;
    const pC2H4 = (c2h4 / total) * 100;
    const pC2H6 = (c2h6 / total) * 100;
    
    // Duval Triangle 5: CH4, C2H4, C2H6 for low temperature faults
    // Triangle with CH4 at top, C2H4 at bottom left, C2H6 at bottom right
    
    // Zone boundaries (based on memory of Duval Triangle 5)
    if (pCH4 <= 35 && pC2H4 <= 55 && pC2H6 >= 15) {
      return 'LDT'; // Low temperature overheating (below 300°C)
    } else if (pC2H6 >= 70) {
      return 'LDT';
    } else if (pC2H4 >= 60) {
      return 'HDT'; // High temperature overheating (above 700°C)
    } else if (pCH4 >= 70) {
      return 'PD'; // Partial discharge
    } else if (pC2H4 >= 30 && pCH4 <= 30 && pC2H6 <= 40) {
      return 'HDT';
    } else {
      // Intermediate or mixed zones
      if (pCH4 > pC2H6 && pCH4 > pC2H4) {
        return 'MDT'; // Medium temperature overheating (300-700°C)
      } else if (pC2H6 > pC2H4 && pC2H6 > pCH4) {
        return 'LDT';
      } else {
        return 'HDT';
      }
    }
  },
  
  render(svg, sample) {
    // Set up SVG namespace
    const NS = "http://www.w3.org/2000/svg";
    
    // Clear the SVG
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }
    
    // Define triangle points (in pixels)
    const height = 540;
    const width = 600;
    const margin = 50;
    const topX = width / 2;
    const topY = margin;
    const bottomLeftX = margin;
    const bottomLeftY = height - margin;
    const bottomRightX = width - margin;
    const bottomRightY = height - margin;
    
    // Create the main triangle
    const triangle = document.createElementNS(NS, "polygon");
    triangle.setAttribute("points", `${topX},${topY} ${bottomLeftX},${bottomLeftY} ${bottomRightX},${bottomRightY}`);
    triangle.setAttribute("fill", "none");
    triangle.setAttribute("stroke", "black");
    triangle.setAttribute("stroke-width", "2");
    svg.appendChild(triangle);
    
    // Define zone boundaries for Duval Triangle 5 (approximate from memory)
    // LDT zone: near C2H6 corner
    const ldtPolygon = document.createElementNS(NS, "polygon");
    ldtPolygon.setAttribute("points", `${bottomRightX},${bottomRightY} ${width/2 + 80},${height - 120} ${width/2 + 120},${margin + 80} ${topX},${topY}`);
    ldtPolygon.setAttribute("fill", "#dfffdf");
    ldtPolygon.setAttribute("stroke", "black");
    ldtPolygon.setAttribute("stroke-width", "1");
    svg.appendChild(ldtPolygon);
    
    // HDT zone: near C2H4 corner
    const hdtPolygon = document.createElementNS(NS, "polygon");
    hdtPolygon.setAttribute("points", `${bottomLeftX},${bottomLeftY} ${width/2 - 80},${height - 120} ${width/2 - 120},${margin + 80} ${topX},${topY}`);
    hdtPolygon.setAttribute("fill", "#ffdfff");
    hdtPolygon.setAttribute("stroke", "black");
    hdtPolygon.setAttribute("stroke-width", "1");
    svg.appendChild(hdtPolygon);
    
    // PD zone: near CH4 corner
    const pdPolygon = document.createElementNS(NS, "polygon");
    pdPolygon.setAttribute("points", `${topX},${topY} ${width/2 - 100},${margin + 100} ${width/2 + 100},${margin + 100} ${topX},${topY}`);
    pdPolygon.setAttribute("fill", "#ffffdf");
    pdPolygon.setAttribute("stroke", "black");
    pdPolygon.setAttribute("stroke-width", "1");
    svg.appendChild(pdPolygon);
    
    // Label the zones
    const ldtLabel = document.createElementNS(NS, "text");
    ldtLabel.setAttribute("x", width/2 + 80);
    ldtLabel.setAttribute("y", height - 80);
    ldtLabel.setAttribute("text-anchor", "middle");
    ldtLabel.setAttribute("font-size", "16");
    ldtLabel.setAttribute("fill", "black");
    ldtLabel.textContent = "LDT";
    svg.appendChild(ldtLabel);
    
    const hdtLabel = document.createElementNS(NS, "text");
    hdtLabel.setAttribute("x", width/2 - 80);
    hdtLabel.setAttribute("y", height - 80);
    hdtLabel.setAttribute("text-anchor", "middle");
    hdtLabel.setAttribute("font-size", "16");
    hdtLabel.setAttribute("fill", "black");
    hdtLabel.textContent = "HDT";
    svg.appendChild(hdtLabel);
    
    const pdLabel = document.createElementNS(NS, "text");
    pdLabel.setAttribute("x", width/2);
    pdLabel.setAttribute("y", margin + 60);
    pdLabel.setAttribute("text-anchor", "middle");
    pdLabel.setAttribute("font-size", "16");
    pdLabel.setAttribute("fill", "black");
    pdLabel.textContent = "PD";
    svg.appendChild(pdLabel);
    
    // Draw and label the axes
    // CH4 axis (from top to bottom center)
    const ch4Axis = document.createElementNS(NS, "line");
    ch4Axis.setAttribute("x1", topX);
    ch4Axis.setAttribute("y1", topY);
    ch4Axis.setAttribute("x2", width/2);
    ch4Axis.setAttribute("y2", height - margin);
    ch4Axis.setAttribute("stroke", "gray");
    ch4Axis.setAttribute("stroke-width", "1");
    ch4Axis.setAttribute("stroke-dasharray", "5,5");
    svg.appendChild(ch4Axis);
    
    // C2H4 axis (from bottom left to top right center)
    const c2h4Axis = document.createElementNS(NS, "line");
    c2h4Axis.setAttribute("x1", bottomLeftX);
    c2h4Axis.setAttribute("y1", bottomLeftY);
    c2h4Axis.setAttribute("x2", width/2 + (width/2 - margin)/2, margin + (height - 2*margin)/2);
    c2h4Axis.setAttribute("stroke", "gray");
    c2h4Axis.setAttribute("stroke-width", "1");
    c2h4Axis.setAttribute("stroke-dasharray", "5,5");
    svg.appendChild(c2h4Axis);
    
    // C2H6 axis (from bottom right to top left center)
    const c2h6Axis = document.createElementNS(NS, "line");
    c2h6Axis.setAttribute("x1", bottomRightX);
    c2h6Axis.setAttribute("y1", bottomRightY);
    c2h6Axis.setAttribute("x2", width/2 - (width/2 - margin)/2, margin + (height - 2*margin)/2);
    c2h6Axis.setAttribute("stroke", "gray");
    c2h6Axis.setAttribute("stroke-width", "1");
    c2h6Axis.setAttribute("stroke-dasharray", "5,5");
    svg.appendChild(c2h6Axis);
    
    // Add tick marks and labels for percentages (0-100%)
    const numTicks = 10;
    for (let i = 1; i <= numTicks; i++) {
      const pct = i * 10;
      const ratio = i / numTicks;
      
      // Tick mark on CH4 axis (vertical)
      const ch4X = topX;
      const ch4Y = topY + ratio * (bottomLeftY - topY);
      const ch4Tick = document.createElementNS(NS, "line");
      ch4Tick.setAttribute("x1", ch4X - 5);
      ch4Tick.setAttribute("y1", ch4Y);
      ch4Tick.setAttribute("x2", ch4X + 5);
      ch4Tick.setAttribute("y2", ch4Y);
      ch4Tick.setAttribute("stroke", "black");
      ch4Tick.setAttribute("stroke-width", "1");
      svg.appendChild(ch4Tick);
      
      if (i % 2 === 0) { // Every 20%
        const ch4TickLabel = document.createElementNS(NS, "text");
        ch4TickLabel.setAttribute("x", ch4X - 10);
        ch4TickLabel.setAttribute("y", ch4Y + 4);
        ch4TickLabel.setAttribute("text-anchor", "end");
        ch4TickLabel.setAttribute("font-size", "12");
        ch4TickLabel.setAttribute("fill", "black");
        ch4TickLabel.textContent = `${pct}%`;
        svg.appendChild(ch4TickLabel);
      }
      
      // Tick mark on C2H4 axis (bottom left to top)
      const c2h4X = bottomLeftX + ratio * (topX - bottomLeftX);
      const c2h4Y = bottomLeftY - ratio * (bottomLeftY - topY);
      const c2h4Tick = document.createElementNS(NS, "line");
      c2h4Tick.setAttribute("x1", c2h4X);
      c2h4Tick.setAttribute("y1", c2h4Y);
      c2h4Tick.setAttribute("x2", c2h4X + 6);
      c2h4Tick.setAttribute("y2", c2h4Y + 3);
      c2h4Tick.setAttribute("stroke", "black");
      c2h4Tick.setAttribute("stroke-width", "1");
      svg.appendChild(c2h4Tick);
      
      if (i % 2 === 0) {
        const c2h4TickLabel = document.createElementNS(NS, "text");
        c2h4TickLabel.setAttribute("x", c2h4X + 15);
        c2h4TickLabel.setAttribute("y", c2h4Y + 5);
        c2h4TickLabel.setAttribute("text-anchor", "start");
        c2h4TickLabel.setAttribute("font-size", "12");
        c2h4TickLabel.setAttribute("fill", "black");
        c2h4TickLabel.textContent = `${pct}%`;
        svg.appendChild(c2h4TickLabel);
      }
      
      // Tick mark on C2H6 axis (bottom right to top)
      const c2h6X = bottomRightX - ratio * (bottomRightX - topX);
      const c2h6Y = bottomRightY - ratio * (bottomRightY - topY);
      const c2h6Tick = document.createElementNS(NS, "line");
      c2h6Tick.setAttribute("x1", c2h6X);
      c2h6Tick.setAttribute("y1", c2h6Y);
      c2h6Tick.setAttribute("x2", c2h6X - 6);
      c2h6Tick.setAttribute("y2", c2h6Y + 3);
      c2h6Tick.setAttribute("stroke", "black");
      c2h6Tick.setAttribute("stroke-width", "1");
      svg.appendChild(c2h6Tick);
      
      if (i % 2 === 0) {
        const c2h6TickLabel = document.createElementNS(NS, "text");
        c2h6TickLabel.setAttribute("x", c2h6X - 15);
        c2h6TickLabel.setAttribute("y", c2h6Y + 5);
        c2h6TickLabel.setAttribute("text-anchor", "end");
        c2h6TickLabel.setAttribute("font-size", "12");
        c2h6TickLabel.setAttribute("fill", "black");
        c2h6TickLabel.textContent = `${pct}%`;
        svg.appendChild(c2h6TickLabel);
      }
    }
    
    // Label the corners
    const ch4Label = document.createElementNS(NS, "text");
    ch4Label.setAttribute("x", topX);
    ch4Label.setAttribute("y", topY - 10);
    ch4Label.setAttribute("text-anchor", "middle");
    ch4Label.setAttribute("font-size", "16");
    ch4Label.setAttribute("font-weight", "bold");
    ch4Label.setAttribute("fill", "black");
    ch4Label.textContent = "CH₄";
    svg.appendChild(ch4Label);
    
    const c2h4Label = document.createElementNS(NS, "text");
    c2h4Label.setAttribute("x", bottomLeftX - 10);
    c2h4Label.setAttribute("y", bottomLeftY + 10);
    c2h4Label.setAttribute("text-anchor", "end");
    c2h4Label.setAttribute("font-size", "16");
    c2h4Label.setAttribute("font-weight", "bold");
    c2h4Label.setAttribute("fill", "black");
    c2h4Label.textContent = "C₂H₄";
    svg.appendChild(c2h4Label);
    
    const c2h6Label = document.createElementNS(NS, "text");
    c2h6Label.setAttribute("x", bottomRightX + 10);
    c2h6Label.setAttribute("y", bottomRightY + 10);
    c2h6Label.setAttribute("text-anchor", "start");
    c2h6Label.setAttribute("font-size", "16");
    c2h6Label.setAttribute("font-weight", "bold");
    c2h6Label.setAttribute("fill", "black");
    c2h6Label.textContent = "C₂H₆";
    svg.appendChild(c2h6Label);
    
    // Mark the sample point if provided
    if (sample) {
      const total = sample.ch4 + sample.c2h4 + sample.c2h6;
      if (total > 0) {
        const pCH4 = sample.ch4 / total;
        const pC2H4 = sample.c2h4 / total;
        const pC2H6 = sample.c2h6 / total;
        
        // Convert percentages to coordinates
        // Using barycentric coordinates
        const pointX = pC2H4 * bottomLeftX + pC2H6 * bottomRightX + pCH4 * topX;
        const pointY = pC2H4 * bottomLeftY + pC2H6 * bottomRightY + pCH4 * topY;
        
        // Draw the point
        const point = document.createElementNS(NS, "circle");
        point.setAttribute("cx", pointX);
        point.setAttribute("cy", pointY);
        point.setAttribute("r", 6);
        point.setAttribute("fill", "red");
        point.setAttribute("stroke", "black");
        point.setAttribute("stroke-width", "2");
        svg.appendChild(point);
        
        // Add a label with the classification
        const classification = this.classify(sample.ch4, sample.c2h4, sample.c2h6);
        const label = document.createElementNS(NS, "text");
        label.setAttribute("x", pointX);
        label.setAttribute("y", pointY - 15);
        label.setAttribute("text-anchor", "middle");
        label.setAttribute("font-size", "14");
        label.setAttribute("font-weight", "bold");
        label.setAttribute("fill", "red");
        label.textContent = classification;
        svg.appendChild(label);
      }
    }
  }
};
