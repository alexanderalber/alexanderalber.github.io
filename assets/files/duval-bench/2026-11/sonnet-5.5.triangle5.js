const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const s = ch4 + c2h4 + c2h6;
    const a = 100 * ch4 / s, b = 100 * c2h4 / s, c = 100 * c2h6 / s;
    if (a >= 98) return "PD";
    if (b >= 70) return "T3-H";
    if (b >= 50) return "C";
    if (b < 12 && c >= 40) return "O";
    return "S";
  },

  render(svg, sample) {
    const NS = "http://www.w3.org/2000/svg";
    const mk = (n, at, p) => {
      const e = document.createElementNS(NS, n);
      for (const k in at) e.setAttribute(k, at[k]);
      (p || svg).appendChild(e);
      return e;
    };
    const colors = { PD: "#f4a6c8", O: "#9ec9f0", S: "#b9e3a0", C: "#f2c47a", "T3-H": "#e07b6a" };
    const V = { ch4: [70, 470], c2h4: [300, 72], c2h6: [530, 470] };
    const pt = (a, b, c) => {
      const s = a + b + c;
      return [(a * V.ch4[0] + b * V.c2h4[0] + c * V.c2h6[0]) / s,
              (a * V.ch4[1] + b * V.c2h4[1] + c * V.c2h6[1]) / s];
    };
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    mk("rect", { x: 0, y: 0, width: 600, height: 540, fill: "#fff" });
    const g = mk("g", { "shape-rendering": "crispEdges" });
    const N = 100, sums = {};
    const cl = (a, b, c) => this.classify(a + 0.001, b + 0.001, c + 0.001);
    const cell = (a, b, c, up) => {
      // a,b,c integers on lattice; up=true triangle (a,b,c),(a-1,b+1,c),(a-1,b,c+1) style
      let pts, ca, cb, cc;
      if (up) {
        pts = [[a, b, c], [a - 1, b + 1, c], [a - 1, b, c + 1]];
      } else {
        pts = [[a, b, c], [a - 1, b + 1, c], [a, b + 1, c - 1]];
      }
      ca = (pts[0][0] + pts[1][0] + pts[2][0]) / 3;
      cb = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
      cc = (pts[0][2] + pts[1][2] + pts[2][2]) / 3;
      const z = cl(ca, cb, cc);
      const q = sums[z] || (sums[z] = [0, 0, 0]);
      const m = pt(ca, cb, cc);
      q[0] += m[0]; q[1] += m[1]; q[2]++;
      const d = pts.map(p => pt(p[0], p[1], p[2]).map(v => v.toFixed(2)).join(",")).join(" ");
      mk("polygon", { points: d, fill: colors[z], stroke: colors[z], "stroke-width": 0.4 }, g);
    };
    for (let b = 0; b < N; b++) {
      for (let c = 0; c + b <= N; c++) {
        const a = N - b - c;
        if (a >= 1) cell(a, b, c, true);
        if (c >= 1 && a >= 0) cell(a, b, c, false);
      }
    }
    // zone outlines are implicit by color; draw triangle frame
    const tri = [V.ch4, V.c2h4, V.c2h6].map(p => p.join(",")).join(" ");
    mk("polygon", { points: tri, fill: "none", stroke: "#222", "stroke-width": 1.5 });
    // labels
    const pos = { PD: [-8, 0], O: [0, 0], S: [0, 0], C: [0, 0], "T3-H": [0, 0] };
    for (const z in sums) {
      const q = sums[z];
      const t = mk("text", {
        x: (q[0] / q[2] + pos[z][0]).toFixed(1), y: (q[1] / q[2] + 5 + pos[z][1]).toFixed(1),
        "text-anchor": "middle", "font-family": "Arial, sans-serif", "font-size": 15,
        "font-weight": "bold", fill: "#111"
      });
      t.textContent = z;
    }
    // axes: CH4 along left edge? CH4 ticks on bottom edge (ch4 grows toward left), C2H6 on right edge, C2H4 on left edge
    for (let i = 10; i < 100; i += 10) {
      const f = i / 100;
      // C2H4 on left edge: from ch4 vertex (0) to c2h4 vertex (100)
      let p = pt(100 - i, i, 0);
      mk("line", { x1: p[0], y1: p[1], x2: p[0] - 7, y2: p[1] + 4, stroke: "#222" });
      let t = mk("text", { x: p[0] - 10, y: p[1] + 8, "text-anchor": "end", "font-size": 11, "font-family": "Arial, sans-serif", fill: "#222" });
      t.textContent = i;
      // C2H6 on right edge: from c2h4 vertex (0) to c2h6 vertex (100)
      p = pt(0, 100 - i, i);
      mk("line", { x1: p[0], y1: p[1], x2: p[0] + 7, y2: p[1] + 4, stroke: "#222" });
      t = mk("text", { x: p[0] + 10, y: p[1] + 8, "text-anchor": "start", "font-size": 11, "font-family": "Arial, sans-serif", fill: "#222" });
      t.textContent = i;
      // CH4 on bottom edge: 100 at left, 0 at right
      p = pt(100 - i, 0, i);
      mk("line", { x1: p[0], y1: p[1], x2: p[0] - 3, y2: p[1] + 8, stroke: "#222" });
      t = mk("text", { x: p[0] - 4, y: p[1] + 21, "text-anchor": "middle", "font-size": 11, "font-family": "Arial, sans-serif", fill: "#222" });
      t.textContent = 100 - i;
    }
    const lab = (x, y, s, rot) => {
      const t = mk("text", { x, y, "text-anchor": "middle", "font-size": 15, "font-weight": "bold", "font-family": "Arial, sans-serif", fill: "#111" });
      if (rot) t.setAttribute("transform", `rotate(${rot} ${x} ${y})`);
      t.textContent = s;
    };
    lab(300, 515, "% CH4  (100 at left, 0 at right)", 0);
    lab(125, 255, "% C2H4", -60);
    lab(475, 255, "% C2H6", 60);
    lab(300, 56, "Duval Triangle 5 (CH4, C2H4, C2H6)", 0);
    if (sample) {
      const s = sample.ch4 + sample.c2h4 + sample.c2h6;
      if (s > 0) {
        const p = pt(sample.ch4 / s, sample.c2h4 / s, sample.c2h6 / s);
        mk("circle", { cx: p[0], cy: p[1], r: 6, fill: "#fff", stroke: "#000", "stroke-width": 2.5 });
        mk("circle", { cx: p[0], cy: p[1], r: 2, fill: "#000" });
      }
    }
  }
};
