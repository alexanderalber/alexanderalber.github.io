const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const sum = ch4 + c2h4 + c2h2;
    if (sum <= 0 || isNaN(sum)) return "INVALID";
    const m = ch4 / sum * 100;
    const e = c2h4 / sum * 100;
    const a = c2h2 / sum * 100;
    if (a > 13) {
      if (e <= 23) return "D1";
      return "D2";
    }
    if (a < 2 && e < 20) return "PD";
    if (e > 50) return "T3";
    if (e > 23) return "T2";
    if (a < 4) return "T1";
    return "DT";
  },

  render(svg, sample) {
    const ns = "http://www.w3.org/2000/svg";
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const BL = { x: 72, y: 475 };   // CH4 100%
    const BR = { x: 528, y: 475 };  // C2H4 100%
    const TP = { x: 300, y: 68 };   // C2H2 100%

    function bary(m, e, a) {
      const x = (m * BL.x + e * BR.x + a * TP.x) / 100;
      const y = (m * BL.y + e * BR.y + a * TP.y) / 100;
      return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
    }

    // outer triangle
    const outer = document.createElementNS(ns, "polygon");
    outer.setAttribute("points", `${BL.x},${BL.y} ${BR.x},${BR.y} ${TP.x},${TP.y}`);
    outer.setAttribute("fill", "#f8f8f8");
    outer.setAttribute("stroke", "#222");
    outer.setAttribute("stroke-width", "8");
    svg.appendChild(outer);

    // zones (approximate boundaries from memory - best recollection)
    const zones = [
      // PD
      { code: "PD", fill: "#bae6fd", pts: [bary(100,0,0), bary(98,0,2), bary(85,13,2), bary(80,20,0)] },
      // T1
      { code: "T1", fill: "#a7f3a7", pts: [bary(80,20,0), bary(85,13,2), bary(55,43,2), bary(47,53,0)] },
      // T2
      { code: "T2", fill: "#fef08c", pts: [bary(47,53,0), bary(55,43,2), bary(23,75,2), bary(20,80,0)] },
      // T3
      { code: "T3", fill: "#fed7aa", pts: [bary(20,80,0), bary(0,100,0), bary(0,77,23), bary(23,55,22)] },
      // DT
      { code: "DT", fill: "#e0c2ff", pts: [bary(55,43,2), bary(40,37,23), bary(23,47,30), bary(23,75,2)] },
      // D1
      { code: "D1", fill: "#bfdbfe", pts: [bary(98,0,2), bary(75,0,25), bary(48,27,25), bary(85,13,2)] },
      // D2
      { code: "D2", fill: "#fca5a5", pts: [bary(0,0,100), bary(0,35,65), bary(23,47,30), bary(48,27,25), bary(75,0,25)] }
    ];

    zones.forEach(z => {
      const poly = document.createElementNS(ns, "polygon");
      const str = z.pts.map(p => p.x + "," + p.y).join(" ");
      poly.setAttribute("points", str);
      poly.setAttribute("fill", z.fill);
      poly.setAttribute("stroke", "#333");
      poly.setAttribute("stroke-width", "2");
      svg.appendChild(poly);
    });

    // zone labels (placed approximately in zone centers)
    const labelData = [
      { txt: "PD", x: 145, y: 385, size: "21" },
      { txt: "T1", x: 175, y: 445, size: "21" },
      { txt: "T2", x: 295, y: 445, size: "21" },
      { txt: "T3", x: 455, y: 435, size: "21" },
      { txt: "DT", x: 265, y: 325, size: "21" },
      { txt: "D1", x: 225, y: 205, size: "21" },
      { txt: "D2", x: 415, y: 165, size: "21" }
    ];
    labelData.forEach(l => {
      const t = document.createElementNS(ns, "text");
      t.setAttribute("x", l.x);
      t.setAttribute("y", l.y);
      t.setAttribute("fill", "#1e2937");
      t.setAttribute("font-family", "Arial,sans-serif");
      t.setAttribute("font-size", l.size);
      t.setAttribute("font-weight", "700");
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("dominant-baseline", "middle");
      t.textContent = l.txt;
      svg.appendChild(t);
    });

    // gas names at vertices
    const names = [
      { txt: "CH₄", x: 38, y: 505, anchor: "start" },
      { txt: "C₂H₄", x: 562, y: 505, anchor: "end" },
      { txt: "C₂H₂", x: 300, y: 38, anchor: "middle" }
    ];
    names.forEach(n => {
      const t = document.createElementNS(ns, "text");
      t.setAttribute("x", n.x);
      t.setAttribute("y", n.y);
      t.setAttribute("fill", "#111");
      t.setAttribute("font-family", "Arial,sans-serif");
      t.setAttribute("font-size", "19");
      t.setAttribute("font-weight", "700");
      t.setAttribute("text-anchor", n.anchor);
      t.textContent = n.txt;
      svg.appendChild(t);
    });

    // tick marks + percentage labels (every 20%)
    // bottom (CH4-C2H4)
    for (let i = 0; i <= 5; i++) {
      const frac = i / 5;
      const x = BL.x + (BR.x - BL.x) * frac;
      const tick = document.createElementNS(ns, "line");
      tick.setAttribute("x1", x); tick.setAttribute("y1", 480);
      tick.setAttribute("x2", x); tick.setAttribute("y2", 492);
      tick.setAttribute("stroke", "#222"); tick.setAttribute("stroke-width", "2.5");
      svg.appendChild(tick);

      if (i > 0 && i < 5) {
        const txt = document.createElementNS(ns, "text");
        txt.setAttribute("x", x);
        txt.setAttribute("y", 510);
        txt.setAttribute("text-anchor", "middle");
        txt.setAttribute("font-size", "9");
        txt.setAttribute("fill", "#333");
        txt.textContent = (i * 20);
        svg.appendChild(txt);
      }
    }

    // left side (CH4-C2H2)
    for (let i = 1; i < 5; i++) {
      const p = bary(100 - i * 20, 0, i * 20);
      const dx = -12;
      const dy = -7;
      const tick = document.createElementNS(ns, "line");
      tick.setAttribute("x1", p.x); tick.setAttribute("y1", p.y);
      tick.setAttribute("x2", p.x + dx); tick.setAttribute("y2", p.y + dy);
      tick.setAttribute("stroke", "#222"); tick.setAttribute("stroke-width", "2.5");
      svg.appendChild(tick);
    }

    // right side (C2H4-C2H2)
    for (let i = 1; i < 5; i++) {
      const p = bary(0, 100 - i * 20, i * 20);
      const dx = 12;
      const dy = -7;
      const tick = document.createElementNS(ns, "line");
      tick.setAttribute("x1", p.x); tick.setAttribute("y1", p.y);
      tick.setAttribute("x2", p.x + dx); tick.setAttribute("y2", p.y + dy);
      tick.setAttribute("stroke", "#222"); tick.setAttribute("stroke-width", "2.5");
      svg.appendChild(tick);
    }

    // sample point
    if (sample && typeof sample.ch4 === "number" && typeof sample.c2h4 === "number" && typeof sample.c2h2 === "number") {
      const sum = sample.ch4 + sample.c2h4 + sample.c2h2;
      if (sum > 0) {
        const m = sample.ch4 / sum * 100;
        const e = sample.c2h4 / sum * 100;
        const a = sample.c2h2 / sum * 100;
        const pt = bary(m, e, a);

        const circ = document.createElementNS(ns, "circle");
        circ.setAttribute("cx", pt.x);
        circ.setAttribute("cy", pt.y);
        circ.setAttribute("r", "7");
        circ.setAttribute("fill", "#b91c1c");
        circ.setAttribute("stroke", "#fff");
        circ.setAttribute("stroke-width", "2.5");
        svg.appendChild(circ);

        const code = this.classify(sample.ch4, sample.c2h4, sample.c2h2);
        const t = document.createElementNS(ns, "text");
        t.setAttribute("x", pt.x + 14);
        t.setAttribute("y", pt.y - 10);
        t.setAttribute("fill", "#b91c1c");
        t.setAttribute("font-family", "Arial,sans-serif");
        t.setAttribute("font-size", "14");
        t.setAttribute("font-weight", "700");
        t.textContent = code;
        svg.appendChild(t);
      }
    }
  }
};
