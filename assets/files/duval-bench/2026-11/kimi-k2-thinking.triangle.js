const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const total = ch4 + c2h4 + c2h2;
    if (total === 0) return "Invalid";
    const pCh4 = (ch4 / total) * 100;
    const pC2h4 = (c2h4 / total) * 100;
    const pC2h2 = (c2h2 / total) * 100;
    
    if (pC2h2 < 2) {
      if (pC2h4 < 5) return "PD";
      if (pC2h4 < 20) return "T1";
      if (pC2h4 < 50) return "T2";
      return "T3";
    } else if (pC2h2 < 30) {
      return pC2h4 > 70 ? "DT" : "D1";
    } else {
      return pC2h4 > 40 ? "DT" : "D2";
    }
  },
  
  render(svg, sample) {
    const ns = "http://www.w3.org/2000/svg";
    
    function create(tag, attrs) {
      const el = document.createElementNS(ns, tag);
      for (const [key, val] of Object.entries(attrs)) {
        el.setAttribute(key, val);
      }
      return el;
    }
    
    function baryToCart(pch4, pc2h4, pc2h2) {
      const x = (pch4 * 100 + pc2h4 * 500 + pc2h2 * 300) / 100;
      const y = (pch4 * 480 + pc2h4 * 480 + pc2h2 * 80) / 100;
      return [x, y];
    }
    
    const zones = [
      {name: "PD", coords: [[100,0,0], [98,0,2], [94,6,0]], color: "#E0F7FA", label: [112, 477]},
      {name: "T1", coords: [[94,6,0], [98,0,2], [78,20,2], [80,20,0]], color: "#FFF9C4", label: [148, 476]},
      {name: "T2", coords: [[80,20,0], [78,20,2], [48,50,2], [50,50,0]], color: "#FFE0B2", label: [242, 476]},
      {name: "T3", coords: [[50,50,0], [48,50,2], [0,98,2], [0,100,0]], color: "#FFCCBC", label: [400, 476]},
      {name: "D1", coords: [[98,0,2], [96,0,4], [70,0,30], [0,70,30], [0,98,2], [78,20,2]], color: "#E1BEE7", label: [282, 435]},
      {name: "D2", coords: [[70,0,30], [0,0,100], [0,70,30]], color: "#CE93D8", label: [300, 266]},
      {name: "DT", coords: [[0,98,2], [0,70,30], [0,100,0]], color: "#D7CCC8", label: [479, 437]}
    ];
    
    zones.forEach(zone => {
      const pts = zone.coords.map(c => {
        const [x, y] = baryToCart(c[0], c[1], c[2]);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(" ");
      
      const poly = create("polygon", {
        points: pts,
        fill: zone.color,
        stroke: "#555",
        "stroke-width": "1",
        "stroke-linejoin": "round"
      });
      svg.appendChild(poly);
      
      const txt = create("text", {
        x: zone.label[0],
        y: zone.label[1],
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        "font-size": "13",
        "font-weight": "bold",
        fill: "#333",
        "pointer-events": "none"
      });
      txt.textContent = zone.name;
      svg.appendChild(txt);
    });
    
    for (let i = 0; i <= 10; i++) {
      const pct = i * 10;
      const [x1, y1] = baryToCart(100 - pct, pct, 0);
      const tick = create("line", {
        x1: x1, y1: y1,
        x2: x1, y2: y1 - 8,
        stroke: "#333", "stroke-width": "1"
      });
      svg.appendChild(tick);
      
      if (i % 5 === 0) {
        const num = create("text", {
          x: x1, y: y1 + 12,
          "text-anchor": "middle",
          "font-size": "9",
          fill: "#333"
        });
        num.textContent = pct.toString();
        svg.appendChild(num);
      }
    }
    
    for (let i = 1; i <= 10; i++) {
      const pct = i * 10;
      const [x1, y1] = baryToCart(100 - pct, 0, pct);
      const tick = create("line", {
        x1: x1, y1: y1,
        x2: x1 + 6, y2: y1 + 3,
        stroke: "#333", "stroke-width": "1"
      });
      svg.appendChild(tick);
    }
    
    for (let i = 1; i <= 10; i++) {
      const pct = i * 10;
      const [x1, y1] = baryToCart(0, 100 - pct, pct);
      const tick = create("line", {
        x1: x1, y1: y1,
        x2: x1 - 6, y2: y1 + 3,
        stroke: "#333", "stroke-width": "1"
      });
      svg.appendChild(tick);
    }
    
    const gasLabels = [
      {text: "CH4", pos: [100, 480], off: [-35, 5]},
      {text: "C2H4", pos: [500, 480], off: [35, 5]},
      {text: "C2H2", pos: [300, 80], off: [0, -25]}
    ];
    
    gasLabels.forEach(g => {
      const txt = create("text", {
        x: g.pos[0] + g.off[0],
        y: g.pos[1] + g.off[1],
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        "font-size": "14",
        "font-weight": "bold",
        fill: "#000"
      });
      txt.textContent = g.text;
      svg.appendChild(txt);
    });
    
    if (sample && typeof sample.ch4 === 'number' && typeof sample.c2h4 === 'number' && typeof sample.c2h2 === 'number') {
      const sum = sample.ch4 + sample.c2h4 + sample.c2h2;
      if (sum > 0) {
        const [sx, sy] = baryToCart(sample.ch4, sample.c2h4, sample.c2h2);
        const circ = create("circle", {
          cx: sx, cy: sy, r: 5,
          fill: "#F44336",
          stroke: "#000",
          "stroke-width": "1.5"
        });
        svg.appendChild(circ);
      }
    }
  }
};
