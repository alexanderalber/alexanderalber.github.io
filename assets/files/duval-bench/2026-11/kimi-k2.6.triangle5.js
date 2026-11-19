const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const total = ch4 + c2h4 + c2h6;
    if (total <= 0) return "";
    const c2h4Frac = c2h4 / total;
    const ch4Frac = ch4 / total;
    const c2h6Frac = c2h6 / total;
    if (c2h4Frac >= 0.6) return "T3";
    if (c2h4Frac >= 0.2) return "T2";
    if (ch4Frac > c2h6Frac) return "T1";
    return "S";
  },
  render(svg, sample) {
    const NS = "http://www.w3.org/2000/svg";
    svg.innerHTML = "";
    const xLeft = 50, xRight = 550, xTop = 300;
    const yBase = 487;
    const yTop = 54;
    const height = yBase - yTop;
    const L = { x: xLeft, y: yBase };
    const R = { x: xRight, y: yBase };
    const T = { x: xTop, y: yTop };
    const y20 = yBase - height * 0.2;
    const y60 = yBase - height * 0.6;
    const A = { x: xLeft + (xTop - xLeft) * 0.2, y: y20 };
    const B = { x: xRight - (xRight - xTop) * 0.2, y: y20 };
    const C = { x: xLeft + (xTop - xLeft) * 0.6, y: y60 };
    const D = { x: xRight - (xRight - xTop) * 0.6, y: y60 };
    const M = { x: xTop, y: yBase };
    const V = { x: xTop, y: y20 };
    const zones = [
      { code: "T1", points: [L, M, V, A], color: "#FFF9C4", label: { x: 180, y: 445 } },
      { code: "S",  points: [R, M, V, B], color: "#E1F5FE", label: { x: 420, y: 445 } },
      { code: "T2", points: [A, B, D, C], color: "#FFE0B2", label: { x: 300, y: 315 } },
      { code: "T3", points: [C, D, T],    color: "#FFCDD2", label: { x: 300, y: 170 } }
    ];
    function makePoly(points, fill) {
      const el = document.createElementNS(NS, "polygon");
      el.setAttribute("points", points.map(p => p.x + "," + p.y).join(" "));
      el.setAttribute("fill", fill);
      el.setAttribute("stroke", "none");
      return el;
    }
    function makeText(x, y, content, size, anchor, baseline, weight) {
      const el = document.createElementNS(NS, "text");
      el.setAttribute("x", x);
      el.setAttribute("y", y);
      el.setAttribute("font-family", "Arial, sans-serif");
      el.setAttribute("font-size", size || "14");
      if (anchor) el.setAttribute("text-anchor", anchor);
      if (baseline) el.setAttribute("dominant-baseline", baseline);
      if (weight) el.setAttribute("font-weight", weight);
      el.textContent = content;
      return el;
    }
    zones.forEach(z => {
      svg.appendChild(makePoly(z.points, z.color));
      svg.appendChild(makeText(z.label.x, z.label.y, z.code, "18", "middle", "middle", "bold"));
    });
    const lines = [
      [L, T], [R, T], [L, R],
      [M, V], [A, B], [C, D]
    ];
    lines.forEach(pair => {
      const ln = document.createElementNS(NS, "line");
      ln.setAttribute("x1", pair[0].x);
      ln.setAttribute("y1", pair[0].y);
      ln.setAttribute("x2", pair[1].x);
      ln.setAttribute("y2", pair[1].y);
      ln.setAttribute("stroke", "#222");
      ln.setAttribute("stroke-width", "1.5");
      svg.appendChild(ln);
    });
    const centroid = { x: (L.x + R.x + T.x) / 3, y: (L.y + R.y + T.y) / 3 };
    [[L, T], [R, T], [L, R]].forEach(side => {
      const P0 = side[0], P1 = side[1];
      for (let i = 1; i < 5; i++) {
        const t = i / 5;
        const px = P0.x + (P1.x - P0.x) * t;
        const py = P0.y + (P1.y - P0.y) * t;
        const dx = centroid.x - px;
        const dy = centroid.y - py;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / dist, uy = dy / dist;
        const ln = document.createElementNS(NS, "line");
        ln.setAttribute("x1", px);
        ln.setAttribute("y1", py);
        ln.setAttribute("x2", px + ux * 8);
        ln.setAttribute("y2", py + uy * 8);
        ln.setAttribute("stroke", "#555");
        ln.setAttribute("stroke-width", "1");
        svg.appendChild(ln);
      }
    });
    svg.appendChild(makeText(L.x, L.y + 25, "CH4", "16", "middle", null, "bold"));
    svg.appendChild(makeText(R.x, R.y + 25, "C2H6", "16", "middle", null, "bold"));
    svg.appendChild(makeText(T.x, T.y - 20, "C2H4", "16", "middle", null, "bold"));
    if (sample && typeof sample.ch4 === "number" && typeof sample.c2h4 === "number" && typeof sample.c2h6 === "number") {
      const sum = sample.ch4 + sample.c2h4 + sample.c2h6;
      if (sum > 0) {
        const f_CH4 = sample.ch4 / sum;
        const f_C2H4 = sample.c2h4 / sum;
        const f_C2H6 = sample.c2h6 / sum;
        const sx = L.x * f_CH4 + R.x * f_C2H6 + T.x * f_C2H4;
        const sy = L.y * f_CH4 + R.y * f_C2H6 + T.y * f_C2H4;
        const circle = document.createElementNS(NS, "circle");
        circle.setAttribute("cx", sx);
        circle.setAttribute("cy", sy);
        circle.setAttribute("r", "6");
        circle.setAttribute("fill", "#D32F2F");
        circle.setAttribute("stroke", "black");
        circle.setAttribute("stroke-width", "1.5");
        svg.appendChild(circle);
      }
    }
  }
};
