const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const sum = ch4 + c2h4 + c2h2;
    const pCH4 = 100 * ch4 / sum;
    const pC2H4 = 100 * c2h4 / sum;
    const pC2H2 = 100 * c2h2 / sum;
    if (pCH4 >= 98) return "PD";
    if (pC2H2 <= 4) {
      if (pC2H4 <= 20) return "T1";
      if (pC2H4 <= 50) return "T2";
      return "T3";
    }
    if (pC2H4 >= 50 && pC2H2 <= 15) return "T3";
    if (pC2H2 <= 13) return "DT";
    if (pC2H4 <= 23) return "D1";
    if (pC2H2 <= 29 && pC2H4 <= 40) return "DT";
    return "D2";
  },
  render(svg, sample) {
    const ns = "http://www.w3.org/2000/svg";
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const append = (tag, attrs, parent) => {
      const el = document.createElementNS(ns, tag);
      for (const k in attrs) el.setAttribute(k, attrs[k]);
      (parent || svg).appendChild(el);
      return el;
    };
    const side = 500;
    const H = side * Math.sqrt(3) / 2;
    const x0 = 50, y0 = 480;
    const toXY = (pCH4, pC2H4) => {
      const x = x0 + (pC2H4 / 100) * side + (pCH4 / 100) * (side / 2);
      const y = y0 - (pCH4 / 100) * H;
      return [x, y];
    };
    const zones = [
      { code: "PD", color: "#ff99cc", pts: [[100,0,0],[98,2,0],[98,0,2]], lab: [99,0.5] },
      { code: "T1", color: "#ffff66", pts: [[98,2,0],[80,20,0],[76,20,4],[96,0,4],[98,0,2]], lab: [89,7] },
      { code: "T2", color: "#ffcc33", pts: [[80,20,0],[50,50,0],[46,50,4],[76,20,4]], lab: [62,33] },
      { code: "T3", color: "#ff9933", pts: [[50,50,0],[0,100,0],[0,85,15],[35,50,15],[46,50,4]], lab: [22,72] },
      { code: "D1", color: "#66b3ff", pts: [[87,0,13],[0,0,100],[0,23,77],[64,23,13]], lab: [28,6] },
      { code: "D2", color: "#336699", pts: [[47,40,13],[37,50,13],[35,50,15],[0,85,15],[0,23,77],[48,23,29],[31,40,29]], lab: [12,52] },
      { code: "DT", color: "#66cc66", pts: [[96,0,4],[87,0,13],[64,23,13],[48,23,29],[31,40,29],[47,40,13],[37,50,13],[46,50,4],[76,20,4]], lab: [52,24] }
    ];
    for (const z of zones) {
      const ptsStr = z.pts.map(p => {
        const [x, y] = toXY(p[0], p[1]);
        return x + "," + y;
      }).join(" ");
      append("polygon", { points: ptsStr, fill: z.color, stroke: "#222", "stroke-width": "1.2", "fill-opacity": "0.88" });
    }
    const outerPts = [[100,0,0],[0,100,0],[0,0,100]].map(p => {
      const [x, y] = toXY(p[0], p[1]);
      return x + "," + y;
    }).join(" ");
    append("polygon", { points: outerPts, fill: "none", stroke: "#000", "stroke-width": "2.5" });
    for (const z of zones) {
      const [x, y] = toXY(z.lab[0], z.lab[1]);
      const t = append("text", { x: x, y: y, "text-anchor": "middle", "dominant-baseline": "middle", "font-size": "15", "font-weight": "bold", "font-family": "sans-serif", fill: "#000" });
      t.textContent = z.code;
    }
    for (let i = 0; i <= 5; i++) {
      const pct = i * 20;
      const [x, y] = toXY(0, pct);
      append("line", { x1: x, y1: y, x2: x, y2: y + 7, stroke: "#000", "stroke-width": "1" });
      const t = append("text", { x: x, y: y + 20, "text-anchor": "middle", "font-size": "10", "font-family": "sans-serif", fill: "#000" });
      t.textContent = String(pct);
    }
    for (let i = 0; i <= 5; i++) {
      const pct = i * 20;
      const [x, y] = toXY(pct, 0);
      append("line", { x1: x, y1: y, x2: x - 6, y2: y + 3, stroke: "#000", "stroke-width": "1" });
      const t = append("text", { x: x - 10, y: y + 4, "text-anchor": "end", "font-size": "10", "font-family": "sans-serif", fill: "#000" });
      t.textContent = String(pct);
    }
    for (let i = 0; i <= 5; i++) {
      const pct = i * 20;
      const [x, y] = toXY(100 - pct, pct);
      append("line", { x1: x, y1: y, x2: x + 6, y2: y + 3, stroke: "#000", "stroke-width": "1" });
      const t = append("text", { x: x + 10, y: y + 4, "text-anchor": "start", "font-size": "10", "font-family": "sans-serif", fill: "#000" });
      t.textContent = String(pct);
    }
    let t = append("text", { x: "300", y: "28", "text-anchor": "middle", "font-size": "16", "font-weight": "bold", "font-family": "sans-serif", fill: "#000" });
    t.textContent = "CH4";
    t = append("text", { x: "48", y: "515", "text-anchor": "middle", "font-size": "15", "font-weight": "bold", "font-family": "sans-serif", fill: "#000" });
    t.textContent = "C2H2";
    t = append("text", { x: "552", y: "515", "text-anchor": "middle", "font-size": "15", "font-weight": "bold", "font-family": "sans-serif", fill: "#000" });
    t.textContent = "C2H4";
    t = append("text", { x: "300", y: "535", "text-anchor": "middle", "font-size": "11", "font-family": "sans-serif", fill: "#333" });
    t.textContent = "% C2H4";
    if (sample && (sample.ch4 + sample.c2h4 + sample.c2h2) > 0) {
      const s = sample.ch4 + sample.c2h4 + sample.c2h2;
      const pCH4 = 100 * sample.ch4 / s;
      const pC2H4 = 100 * sample.c2h4 / s;
      const [x, y] = toXY(pCH4, pC2H4);
      append("circle", { cx: x, cy: y, r: "7", fill: "#ff0000", stroke: "#000", "stroke-width": "1.5" });
      append("circle", { cx: x, cy: y, r: "2.5", fill: "#fff" });
    }
  }
};
