const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const sum = ch4 + c2h4 + c2h2;
    if (sum <= 0) return "";
    const pCH4 = ch4 / sum * 100;
    const pC2H4 = c2h4 / sum * 100;
    const pC2H2 = c2h2 / sum * 100;
    if (pC2H2 <= 2 && pC2H4 <= 10) return "PD";
    if (pC2H2 <= 2 && pC2H4 < 24) return "T1";
    if (pC2H2 <= 2 && pC2H4 < 40) return "T2";
    if (pC2H2 <= 2) return "T3";
    if (pC2H2 >= 29 && pC2H4 <= 60) return "D2";
    if (pC2H2 >= 13 && pC2H4 >= 23 && pC2H2 <= 29 && pC2H4 <= 40) return "DT";
    if (pC2H2 > 4 && pC2H4 < 23) return "D1";
    return "DT";
  },
  render(svg, sample) {
    const NS = "http://www.w3.org/2000/svg";
    const W = 600, H = 540;
    svg.setAttribute("viewBox", "0 0 600 540");
    svg.setAttribute("width", "600");
    svg.setAttribute("height", "540");
    const A = {x: 300, y: 45};
    const B = {x: 65, y: 495};
    const C = {x: 535, y: 495};
    function pt(pCH4, pC2H2, pC2H4) {
      return {
        x: (pC2H2 * B.x + pC2H4 * C.x + pCH4 * A.x) / 100,
        y: (pC2H2 * B.y + pC2H4 * C.y + pCH4 * A.y) / 100
      };
    }
    function poly(pts, fill) {
      const el = document.createElementNS(NS, "polygon");
      el.setAttribute("points", pts.map(p => p.x + "," + p.y).join(" "));
      el.setAttribute("fill", fill);
      el.setAttribute("stroke", "#333");
      el.setAttribute("stroke-width", "1");
      svg.appendChild(el);
    }
    poly([A, B, C], "#fff");
    const zones = {
      PD: ["#e3f2fd", [pt(98,2,0), pt(98,0,2), pt(90,0,10), pt(90,10,0)]],
      T1: ["#fff3e0", [pt(90,10,0), pt(90,0,10), pt(76,0,24), pt(76,24,0)]],
      T2: ["#ffe0b2", [pt(76,24,0), pt(76,0,24), pt(60,0,40), pt(60,40,0)]],
      T3: ["#ffcc80", [pt(60,40,0), pt(60,0,40), pt(0,0,100), pt(0,2,98)]],
      D1: ["#fce4ec", [pt(90,10,0), pt(76,24,0), pt(64,36,0), pt(87,13,0)]],
      D2: ["#f8bbd9", [pt(40,60,0), pt(0,100,0), pt(0,71,29), pt(40,40,20)]],
      DT: ["#fffde7", [pt(76,24,0), pt(60,40,0), pt(40,40,20), pt(60,20,20), pt(76,24,0)]]
    };
    for (const k in zones) {
      const z = zones[k];
      poly(z[1], z[0]);
    }
    const outer = document.createElementNS(NS, "polygon");
    outer.setAttribute("points", [A, B, C].map(p => p.x+","+p.y).join(" "));
    outer.setAttribute("fill", "none");
    outer.setAttribute("stroke", "#222");
    outer.setAttribute("stroke-width", "2.5");
    svg.appendChild(outer);
    function sideTicks(p1, p2, gas, dir) {
      for (let i = 0; i <= 100; i += 10) {
        const t = i / 100;
        const x = p1.x + (p2.x - p1.x) * t;
        const y = p1.y + (p2.y - p1.y) * t;
        const tx = x + dir.x * 14;
        const ty = y + dir.y * 14;
        const ln = document.createElementNS(NS, "line");
        ln.setAttribute("x1", x);
        ln.setAttribute("y1", y);
        ln.setAttribute("x2", x + dir.x * 5);
        ln.setAttribute("y2", y + dir.y * 5);
        ln.setAttribute("stroke", "#222");
        ln.setAttribute("stroke-width", "1.5");
        svg.appendChild(ln);
        if (i % 20 === 0) {
          const txt = document.createElementNS(NS, "text");
          txt.setAttribute("x", tx);
          txt.setAttribute("y", ty);
          txt.setAttribute("font-size", "10");
          txt.setAttribute("fill", "#222");
          txt.setAttribute("text-anchor", "middle");
          txt.textContent = i;
          svg.appendChild(txt);
        }
      }
    }
    sideTicks(A, B, "C2H2", {x: -0.9, y: 0.4});
    sideTicks(A, C, "C2H4", {x: 0.9, y: 0.4});
    sideTicks(B, C, "CH4", {x: 0, y: 1.1});
    const labels = [
      {p: pt(96,2,2), t: "PD"},
      {p: pt(82,9,9), t: "T1"},
      {p: pt(67,17,16), t: "T2"},
      {p: pt(25,5,70), t: "T3"},
      {p: pt(82,15,3), t: "D1"},
      {p: pt(25,55,20), t: "D2"},
      {p: pt(58,25,17), t: "DT"}
    ];
    labels.forEach(l => {
      const txt = document.createElementNS(NS, "text");
      txt.setAttribute("x", l.p.x);
      txt.setAttribute("y", l.p.y);
      txt.setAttribute("font-size", "13");
      txt.setAttribute("font-weight", "bold");
      txt.setAttribute("fill", "#222");
      txt.setAttribute("text-anchor", "middle");
      txt.textContent = l.t;
      svg.appendChild(txt);
    });
    const vLabels = [
      {x: A.x, y: A.y - 18, t: "CH4"},
      {x: B.x - 22, y: B.y + 6, t: "C2H2"},
      {x: C.x + 22, y: C.y + 6, t: "C2H4"}
    ];
    vLabels.forEach(l => {
      const txt = document.createElementNS(NS, "text");
      txt.setAttribute("x", l.x);
      txt.setAttribute("y", l.y);
      txt.setAttribute("font-size", "14");
      txt.setAttribute("font-weight", "bold");
      txt.setAttribute("fill", "#111");
      txt.setAttribute("text-anchor", "middle");
      txt.textContent = l.t;
      svg.appendChild(txt);
    });
    if (sample) {
      const sum = sample.ch4 + sample.c2h4 + sample.c2h2;
      if (sum > 0) {
        const p = pt(
          sample.ch4 / sum * 100,
          sample.c2h2 / sum * 100,
          sample.c2h4 / sum * 100
        );
        const circ = document.createElementNS(NS, "circle");
        circ.setAttribute("cx", p.x);
        circ.setAttribute("cy", p.y);
        circ.setAttribute("r", "5.5");
        circ.setAttribute("fill", "#d32f2f");
        circ.setAttribute("stroke", "#fff");
        circ.setAttribute("stroke-width", "1.5");
        svg.appendChild(circ);
      }
    }
  }
};
