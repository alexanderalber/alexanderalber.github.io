const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const total = ch4 + c2h4 + c2h6;
    if (total === 0) return "PD";
    
    const x = c2h4 / total * 100;
    const y = ch4 / total * 100;
    const z = c2h6 / total * 100;
    
    // Duval Triangle 5 zones for low temperature faults
    // PD: Partial Discharge (bottom left region)
    // T1: Thermal fault < 300°C (top region)
    // T2: Thermal fault 300-700°C (middle-right region)
    // T3: Thermal fault > 700°C (bottom region, high C2H4)
    
    // Check PD zone first (high C2H6, low CH4, low C2H4)
    if (z > 90 && y < 10 && x < 10) return "PD";
    
    // Check T1 zone (high CH4, moderate C2H6, low C2H4)
    if (y > 50 && x < 30 && z > 20) return "T1";
    
    // Check T2 zone (moderate CH4, increasing C2H4)
    if (x >= 20 && x < 50 && y > 20 && z > 20) return "T2";
    
    // Check T3 zone (high C2H4, low C2H6)
    if (x > 50 && z < 30) return "T3";
    
    // Check boundary regions
    if (y > 40 && x < 20) return "T1";
    if (x > 40 && y > 30 && z > 20) return "T2";
    if (x > 40 && z < 40) return "T3";
    
    // Default classifications based on dominant gas
    if (z > 50) return "PD";
    if (y > 40) return "T1";
    if (x > 50) return "T3";
    
    return "T2";
  },
  
  render(svg, sample) {
    const ns = "http://www.w3.org/2000/svg";
    
    // Triangle vertices (equilateral-ish)
    const top = {x: 300, y: 60};
    const bottomLeft = {x: 60, y: 480};
    const bottomRight = {x: 540, y: 480};
    
    // Helper to create element
    function create(tag, attrs) {
      const el = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, v);
      }
      return el;
    }
    
    // Helper to convert barycentric to cartesian
    function baryToCart(ch4, c2h4, c2h6) {
      const total = ch4 + c2h4 + c2h6;
      if (total === 0) return null;
      const a = c2h6 / total; // bottom left vertex weight
      const b = ch4 / total;  // top vertex weight
      const c = c2h4 / total; // bottom right vertex weight
      
      return {
        x: a * bottomLeft.x + b * top.x + c * bottomRight.x,
        y: a * bottomLeft.y + b * top.y + c * bottomRight.y
      };
    }
    
    // Background
    svg.appendChild(create("rect", {
      x: 0, y: 0, width: 600, height: 540, fill: "white"
    }));
    
    // Zone definitions and colors
    const zones = [
      // PD zone (bottom left, high C2H6)
      {name: "PD", color: "#E8F4E8", path: [
        bottomLeft,
        {x: bottomLeft.x + (bottomRight.x - bottomLeft.x) * 0.15, y: bottomLeft.y},
        {x: top.x + (bottomLeft.x - top.x) * 0.1, y: top.y + (bottomLeft.y - top.y) * 0.9},
        {x: top.x + (bottomLeft.x - top.x) * 0.3, y: top.y + (bottomLeft.y - top.y) * 0.7},
        bottomLeft
      ]},
      // T1 zone (top, high CH4)
      {name: "T1", color: "#FFE4B5", path: [
        top,
        {x: top.x + (bottomLeft.x - top.x) * 0.3, y: top.y + (bottomLeft.y - top.y) * 0.7},
        {x: top.x + (bottomRight.x - top.x) * 0.2, y: top.y + (bottomRight.y - top.y) * 0.7},
        {x: top.x + (bottomRight.x - top.x) * 0.5, y: top.y + (bottomRight.y - top.y) * 0.5},
        {x: top.x + (bottomLeft.x - top.x) * 0.5, y: top.y + (bottomLeft.y - top.y) * 0.5},
        top
      ]},
      // T2 zone (middle right)
      {name: "T2", color: "#FFDAB9", path: [
        {x: top.x + (bottomLeft.x - top.x) * 0.5, y: top.y + (bottomLeft.y - top.y) * 0.5},
        {x: top.x + (bottomRight.x - top.x) * 0.5, y: top.y + (bottomRight.y - top.y) * 0.5},
        {x: top.x + (bottomRight.x - top.x) * 0.8, y: top.y + (bottomRight.y - top.y) * 0.2},
        {x: bottomRight.x - (bottomRight.x - bottomLeft.x) * 0.3, y: bottomRight.y - (bottomRight.y - top.y) * 0.3},
        {x: bottomLeft.x + (bottomRight.x - bottomLeft.x) * 0.4, y: bottomLeft.y - (bottomLeft.y - top.y) * 0.3},
        {x: top.x + (bottomLeft.x - top.x) * 0.3, y: top.y + (bottomLeft.y - top.y) * 0.7},
        {x: top.x + (bottomLeft.x - top.x) * 0.5, y: top.y + (bottomLeft.y - top.y) * 0.5}
      ]},
      // T3 zone (bottom right, high C2H4)
      {name: "T3", color: "#FFB6C1", path: [
        {x: top.x + (bottomRight.x - top.x) * 0.5, y: top.y + (bottomRight.y - top.y) * 0.5},
        bottomRight,
        {x: bottomRight.x - (bottomRight.x - bottomLeft.x) * 0.15, y: bottomRight.y},
        {x: top.x + (bottomRight.x - top.x) * 0.8, y: top.y + (bottomRight.y - top.y) * 0.2},
        {x: top.x + (bottomRight.x - top.x) * 0.5, y: top.y + (bottomRight.y - top.y) * 0.5}
      ]}
    ];
    
    // Draw zone fills
    zones.forEach(zone => {
      const d = zone.path.map((p, i) => (i === 0 ? "M" : "L") + p.x + "," + p.y).join(" ") + " Z";
      svg.appendChild(create("path", {
        d: d,
        fill: zone.color,
        stroke: "none"
      }));
    });
    
    // Draw triangle outline
    const outline = create("path", {
      d: `M${top.x},${top.y} L${bottomLeft.x},${bottomLeft.y} L${bottomRight.x},${bottomRight.y} Z`,
      fill: "none",
      stroke: "black",
      "stroke-width": 2
    });
    svg.appendChild(outline);
    
    // Draw zone boundaries
    // PD-T1 boundary
    svg.appendChild(create("line", {
      x1: bottomLeft.x + (bottomRight.x - bottomLeft.x) * 0.15, y1: bottomLeft.y,
      x2: top.x + (bottomLeft.x - top.x) * 0.3, y2: top.y + (bottomLeft.y - top.y) * 0.7,
      stroke: "black", "stroke-width": 1
    }));
    
    // T1-T2 boundary
    svg.appendChild(create("line", {
      x1: top.x + (bottomLeft.x - top.x) * 0.5, y1: top.y + (bottomLeft.y - top.y) * 0.5,
      x2: top.x + (bottomRight.x - top.x) * 0.5, y2: top.y + (bottomRight.y - top.y) * 0.5,
      stroke: "black", "stroke-width": 1
    }));
    
    // T2-T3 boundary
    svg.appendChild(create("line", {
      x1: top.x + (bottomRight.x - top.x) * 0.5, y1: top.y + (bottomRight.y - top.y) * 0.5,
      x2: bottomRight.x - (bottomRight.x - bottomLeft.x) * 0.3, y2: bottomRight.y - (bottomRight.y - top.y) * 0.3,
      stroke: "black", "stroke-width": 1
    }));
    
    // T2-PD/T3 boundary
    svg.appendChild(create("line", {
      x1: top.x + (bottomLeft.x - top.x) * 0.3, y1: top.y + (bottomLeft.y - top.y) * 0.7,
      x2: bottomLeft.x + (bottomRight.x - bottomLeft.x) * 0.4, y2: bottomLeft.y - (bottomLeft.y - top.y) * 0.3,
      stroke: "black", "stroke-width": 1
    }));
    
    // Draw tick marks and labels on axes
    // Left axis (C2H6 %)
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const x = bottomLeft.x + (top.x - bottomLeft.x) * t;
      const y = bottomLeft.y + (top.y - bottomLeft.y) * t;
      const tx = bottomLeft.x + (top.x - bottomLeft.x) * t + (bottomRight.x - bottomLeft.x) * (1-t) * 0.1;
      const ty = bottomLeft.y + (top.y - bottomLeft.y) * t;
      
      // Tick mark perpendicular to axis
      const dx = (bottomRight.x - bottomLeft.x) * 0.03;
      const dy = (bottomRight.y - bottomLeft.y) * 0.03;
      svg.appendChild(create("line", {
        x1: x - dy, y1: y + dx,
        x2: x + dy, y2: y - dx,
        stroke: "black", "stroke-width": 1
      }));
      
      if (i % 2 === 0 && i < 10) {
        const label = create("text", {
          x: x - 25, y: y + 5,
          "font-size": 10,
          "text-anchor": "middle",
          fill: "black"
        });
        label.textContent = (100 - i * 10) + "%";
        svg.appendChild(label);
      }
    }
    
    // Right axis (C2H4 %)
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const x = bottomRight.x + (top.x - bottomRight.x) * t;
      const y = bottomRight.y + (top.y - bottomRight.y) * t;
      
      const dx = (bottomLeft.x - bottomRight.x) * 0.03;
      const dy = (bottomLeft.y - bottomRight.y) * 0.03;
      svg.appendChild(create("line", {
        x1: x - dy, y1: y + dx,
        x2: x + dy, y2: y - dx,
        stroke: "black", "stroke-width": 1
      }));
      
      if (i % 2 === 0 && i < 10) {
        const label = create("text", {
          x: x + 25, y: y + 5,
          "font-size": 10,
          "text-anchor": "middle",
          fill: "black"
        });
        label.textContent = (i * 10) + "%";
        svg.appendChild(label);
      }
    }
    
    // Bottom axis (CH4 %, read from right to left)
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const x = bottomLeft.x + (bottomRight.x - bottomLeft.x) * t;
      const y = bottomLeft.y;
      
      svg.appendChild(create("line", {
        x1: x, y1: y - 8,
        x2: x, y2: y + 8,
        stroke: "black", "stroke-width": 1
      }));
      
      if (i % 2 === 0 && i > 0 && i < 10) {
        const label = create("text", {
          x: x, y: y + 20,
          "font-size": 10,
          "text-anchor": "middle",
          fill: "black"
        });
        label.textContent = (100 - i * 10) + "%";
        svg.appendChild(label);
      }
    }
    
    // Axis labels
    const c2h6Label = create("text", {
      x: bottomLeft.x - 40, y: bottomLeft.y - 20,
      "font-size": 12, "font-weight": "bold",
      "text-anchor": "middle",
      fill: "black"
    });
    c2h6Label.textContent = "C₂H₆";
    svg.appendChild(c2h6Label);
    
    const ch4Label = create("text", {
      x: 300, y: 520,
      "font-size": 12, "font-weight": "bold",
      "text-anchor": "middle",
      fill: "black"
    });
    ch4Label.textContent = "CH₄";
    svg.appendChild(ch4Label);
    
    const c2h4Label = create("text", {
      x: bottomRight.x + 40, y: bottomRight.y - 20,
      "font-size": 12, "font-weight": "bold",
      "text-anchor": "middle",
      fill: "black"
    });
    c2h4Label.textContent = "C₂H₄";
    svg.appendChild(c2h4Label);
    
    // Zone labels
    const pdLabel = create("text", {
      x: bottomLeft.x + 35, y: bottomLeft.y - 30,
      "font-size": 14, "font-weight": "bold",
      "text-anchor": "middle",
      fill: "darkgreen"
    });
    pdLabel.textContent = "PD";
    svg.appendChild(pdLabel);
    
    const t1Label = create("text", {
      x: 300, y: 150,
      "font-size": 14, "font-weight": "bold",
      "text-anchor": "middle",
      fill: "darkorange"
    });
    t1Label.textContent = "T1";
    svg.appendChild(t1Label);
    
    const t2Label = create("text", {
      x: 380, y: 280,
      "font-size": 14, "font-weight": "bold",
      "text-anchor": "middle",
      fill: "darkred"
    });
    t2Label.textContent = "T2";
    svg.appendChild(t2Label);
    
    const t3Label = create("text", {
      x: 460, y: 420,
      "font-size": 14, "font-weight": "bold",
      "text-anchor": "middle",
      fill: "purple"
    });
    t3Label.textContent = "T3";
    svg.appendChild(t3Label);
    
    // Title
    const title = create("text", {
      x: 300, y: 30,
      "font-size": 16, "font-weight": "bold",
      "text-anchor": "middle",
      fill: "black"
    });
    title.textContent = "Duval Triangle 5 - Low Temperature Faults";
    svg.appendChild(title);
    
    // Draw sample point if provided
    if (sample && sample.ch4 !== undefined && sample.c2h4 !== undefined && sample.c2h6 !== undefined) {
      const pt = baryToCart(sample.ch4, sample.c2h4, sample.c2h6);
      if (pt) {
        // Check if point is inside triangle
        const dot = create("circle", {
          cx: pt.x, cy: pt.y, r: 6,
          fill: "red",
          stroke: "black",
          "stroke-width": 2
        });
        svg.appendChild(dot);
        
        // Sample label
        const sampLabel = create("text", {
          x: pt.x + 10, y: pt.y - 10,
          "font-size": 11,
          fill: "red"
        });
        sampLabel.textContent = "● sample";
        svg.appendChild(sampLabel);
      }
    }
  }
};
