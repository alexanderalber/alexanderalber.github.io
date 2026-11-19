const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const total = ch4 + c2h4 + c2h6;
    if (total <= 0 || ch4 < 0 || c2h4 < 0 || c2h6 < 0) return "INVALID";
    const pCH4 = (ch4 / total) * 100;
    const pC2H4 = (c2h4 / total) * 100;
    const pC2H6 = (c2h6 / total) * 100;
    if (pC2H4 > 35) return "T3";
    if (pC2H4 > 15) return "T2";
    if (pC2H4 > 4) return "T1";
    if (pCH4 > 82) return "PD";
    if (pC2H6 > 78 && pC2H4 < 3) return "S";
    return "O";
  },
  render(svg, sample) {
    const ns = "http://www.w3.org/2000/svg";
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const side = 480;
    const triH = Math.sqrt(3) / 2 * side;
    const x0 = 60;
    const yBase = 495;
    const corners = {
      C2H4: {x: x0 + side / 2, y: yBase - triH},   // top
      C2H6: {x: x0, y: yBase},                      // bottom left
      CH4:  {x: x0 + side, y: yBase}                // bottom right
    };

    function el(tag) { return document.createElementNS(ns, tag); }

    // background triangle
    const bg = el("polygon");
    bg.setAttribute("points",
      `${corners.C2H4.x},${corners.C2H4.y} ` +
      `${corners.C2H6.x},${corners.C2H6.y} ` +
      `${corners.CH4.x},${corners.CH4.y}`);
    bg.setAttribute("fill", "#f9f7f0");
    bg.setAttribute("stroke", "#1a2a44");
    bg.setAttribute("stroke-width", "8");
    svg.appendChild(bg);

    // zone polygons (approximate boundaries committed from memory)
    const zones = [
      {code:"PD", color:"#81d4fa", pts:[corners.CH4, {x:corners.CH4.x-38,y:corners.CH4.y}, {x:415,y:390}, {x:495,y:390}]},
      {code:"S",  color:"#a5d6a7", pts:[corners.C2H6, {x:corners.C2H6.x+42,y:corners.C2H6.y}, {x:125,y:395}, {x:195,y:395}]},
      {code:"O",  color:"#c5e1a5", pts:[{x:195,y:395},{x:125,y:395},{x:168,y:305},{x:310,y:260}]},
      {code:"T1", color:"#ffe082", pts:[{x:310,y:260},{x:168,y:305},{x:195,y:170},{x:355,y:155}]},
      {code:"T2", color:"#ffab91", pts:[{x:355,y:155},{x:195,y:170},{x:225,y:85},{x:370,y:75}]},
      {code:"T3", color:"#ef9a9a", pts:[{x:370,y:75},{x:225,y:85},{x:corners.C2H4.x-5,y:corners.C2H4.y+8},{x:corners.C2H4.x+5,y:corners.C2H4.y+8}]}
    ];

    zones.forEach(z => {
      const p = el("polygon");
      p.setAttribute("points", z.pts.map(pt => `${pt.x},${pt.y}`).join(" "));
      p.setAttribute("fill", z.color);
      p.setAttribute("stroke", "#263549");
      p.setAttribute("stroke-width", "1.5");
      svg.appendChild(p);
    });

    // zone labels
    const zoneLabels = [
      {txt:"PD", x:465, y:425, size:21},
      {txt:"S",  x:145, y:425, size:21},
      {txt:"O",  x:265, y:375, size:19},
      {txt:"T1", x:275, y:265, size:23},
      {txt:"T2", x:315, y:175, size:23},
      {txt:"T3", x:300, y:68,  size:23}
    ];
    zoneLabels.forEach(l => {
      const t = el("text");
      t.setAttribute("x", l.x);
      t.setAttribute("y", l.y);
      t.setAttribute("fill", "#263549");
      t.setAttribute("font-size", l.size);
      t.setAttribute("font-weight", "700");
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("dominant-baseline", "middle");
      t.textContent = l.txt;
      svg.appendChild(t);
    });

    // gas names
    const gasNames = [
      {txt:"CH₄", x:corners.CH4.x+12, y:corners.CH4.y+38, anchor:"end", rot:0},
      {txt:"C₂H₆", x:corners.C2H6.x-12, y:corners.C2H6.y+38, anchor:"start", rot:0},
      {txt:"C₂H₄", x:corners.C2H4.x, y:corners.C2H4.y-22, anchor:"middle", rot:0}
    ];
    gasNames.forEach(g => {
      const t = el("text");
      t.setAttribute("x", g.x);
      t.setAttribute("y", g.y);
      t.setAttribute("fill", "#1a2a44");
      t.setAttribute("font-size", "21");
      t.setAttribute("font-weight", "700");
      t.setAttribute("text-anchor", g.anchor);
      t.textContent = g.txt;
      svg.appendChild(t);
    });

    // axis tick marks & percentage numbers (every 20%)
    const axes = [
      // base C2H6→CH4 (C2H4 = 0)
      {p1:corners.C2H6, p2:corners.CH4, step:20, offset:-18, textOffset:22, perpendicular:{x:0,y:-1}},
      // left C2H6→C2H4
      {p1:corners.C2H6, p2:corners.C2H4, step:20, offset:18, textOffset:-26, perpendicular:{x:0.866,y:0.5}},
      // right CH4→C2H4
      {p1:corners.CH4, p2:corners.C2H4, step:20, offset:18, textOffset:-26, perpendicular:{x:-0.866,y:0.5}}
    ];

    axes.forEach(ax => {
      for (let i = 20; i < 100; i += 20) {
        const t = i / 100;
        const x = ax.p1.x + t * (ax.p2.x - ax.p1.x);
        const y = ax.p1.y + t * (ax.p2.y - ax.p1.y);
        const tick = el("line");
        tick.setAttribute("x1", x);
        tick.setAttribute("y1", y);
        tick.setAttribute("x2", x + ax.perpendicular.x * ax.offset);
        tick.setAttribute("y2", y + ax.perpendicular.y * ax.offset);
        tick.setAttribute("stroke", "#263549");
        tick.setAttribute("stroke-width", "2.5");
        svg.appendChild(tick);

        const num = el("text");
        num.setAttribute("x", x + ax.perpendicular.x * ax.textOffset);
        num.setAttribute("y", y + ax.perpendicular.y * ax.textOffset + 4);
        num.setAttribute("fill", "#263549");
        num.setAttribute("font-size", "10");
        num.setAttribute("text-anchor", "middle");
        num.textContent = i.toString();
        svg.appendChild(num);
      }
    });

    // sample point
    if (sample && sample.ch4 != null && sample.c2h4 != null && sample.c2h6 != null) {
      const tot = sample.ch4 + sample.c2h4 + sample.c2h6;
      if (tot > 0) {
        const wCH4 = sample.ch4 / tot;
        const wC2H4 = sample.c2h4 / tot;
        const wC2H6 = sample.c2h6 / tot;
        const px = wC2H6 * corners.C2H6.x + wCH4 * corners.CH4.x + wC2H4 * corners.C2H4.x;
        const py = wC2H6 * corners.C2H6.y + wCH4 * corners.CH4.y + wC2H4 * corners.C2H4.y;

        const dot = el("circle");
        dot.setAttribute("cx", px);
        dot.setAttribute("cy", py);
        dot.setAttribute("r", "7.5");
        dot.setAttribute("fill", "#c62828");
        dot.setAttribute("stroke", "#111");
        dot.setAttribute("stroke-width", "2.5");
        svg.appendChild(dot);

        const ring = el("circle");
        ring.setAttribute("cx", px);
        ring.setAttribute("cy", py);
        ring.setAttribute("r", "11");
        ring.setAttribute("fill", "none");
        ring.setAttribute("stroke", "#c62828");
        ring.setAttribute("stroke-width", "1.5");
        svg.appendChild(ring);
      }
    }

    // title
    const title = el("text");
    title.setAttribute("x", "300");
    title.setAttribute("y", "28");
    title.setAttribute("text-anchor", "middle");
    title.setAttribute("fill", "#1a2a44");
    title.setAttribute("font-size", "15");
    title.setAttribute("font-weight", "600");
    title.textContent = "DUVAL TRIANGLE 5 — LOW-TEMPERATURE FAULTS";
    svg.appendChild(title);

    // corner percentage labels
    const zeroLabels = [
      {txt:"100 %", x:corners.C2H4.x, y:corners.C2H4.y-2},
      {txt:"100 %", x:corners.C2H6.x-4, y:corners.C2H6.y+18},
      {txt:"100 %", x:corners.CH4.x+4, y:corners.CH4.y+18}
    ];
    zeroLabels.forEach(z => {
      const t = el("text");
      t.setAttribute("x", z.x);
      t.setAttribute("y", z.y);
      t.setAttribute("fill", "#263549");
      t.setAttribute("font-size", "11");
      t.setAttribute("font-weight", "500");
      t.setAttribute("text-anchor", "middle");
      t.textContent = z.txt;
      svg.appendChild(t);
    });
  }
};
