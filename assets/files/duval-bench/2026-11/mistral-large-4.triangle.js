const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const a = Number(ch4) || 0;
    const b = Number(c2h4) || 0;
    const c = Number(c2h2) || 0;
    const s = a + b + c;
    if (!(s > 0)) return "PD";
    const x = (b / s) * 100; // %C2H4
    const y = (c / s) * 100; // %C2H2
    const Z = [
      { code: "PD", pts: [[0, 0], [20, 0], [23, 3], [0, 2]] },
      { code: "T1", pts: [[20, 0], [50, 0], [40, 15], [23, 3]] },
      { code: "T2", pts: [[50, 0], [80, 0], [80, 20], [40, 15]] },
      { code: "T3", pts: [[80, 0], [100, 0], [80, 20]] },
      { code: "D1", pts: [[0, 2], [23, 3], [40, 15], [29, 29], [0, 13]] },
      { code: "DT", pts: [[40, 15], [80, 20], [50, 50], [29, 29]] },
      { code: "D2", pts: [[0, 13], [29, 29], [50, 50], [0, 100]] }
    ];
    const eps = 1e-9;
    function onSeg(px, py, ax, ay, bx, by) {
      const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
      if (Math.abs(cross) > eps) return false;
      return px >= Math.min(ax, bx) - eps && px <= Math.max(ax, bx) + eps &&
             py >= Math.min(ay, by) - eps && py <= Math.max(ay, by) + eps;
    }
    function inside(poly) {
      let insideFlag = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i][0], yi = poly[i][1];
        const xj = poly[j][0], yj = poly[j][1];
        if (onSeg(x, y, xi, yi, xj, yj)) return true;
        if (((yi > y) !== (yj > y)) &&
            (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) {
          insideFlag = !insideFlag;
        }
      }
      return insideFlag;
    }
    for (const z of Z) {
      if (inside(z.pts)) return z.code;
    }
    return "PD";
  },

  render(svg, sample) {
    const NS = "http://www.w3.org/2000/svg";
    const Z = [
      { code: "PD", pts: [[0, 0], [20, 0], [23, 3], [0, 2]] },
      { code: "T1", pts: [[20, 0], [50, 0], [40, 15], [23, 3]] },
      { code: "T2", pts: [[50, 0], [80, 0], [80, 20], [40, 15]] },
      { code: "T3", pts: [[80, 0], [100, 0], [80, 20]] },
      { code: "D1", pts: [[0, 2], [23, 3], [40, 15], [29, 29], [0, 13]] },
      { code: "DT", pts: [[40, 15], [80, 20], [50, 50], [29, 29]] },
      { code: "D2", pts: [[0, 13], [29, 29], [50, 50], [0, 100]] }
    ];
    const colors = {
      PD: "#9ecae1",
      T1: "#c7e9c0",
      T2: "#ffe082",
      T3: "#ffab91",
      D1: "#f4a6a6",
      DT: "#d7bde2",
      D2: "#ef5350"
    };
    const side = 420;
    const A = [90, 450];                 // CH4 vertex
    const B = [510, 450];                // C2H4 vertex
    const h = side * Math.sqrt(3) / 2;
    const C = [300, 450 - h];            // C2H2 vertex
    const G = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3];

    function el(name, attrs, text) {
      const e = document.createElementNS(NS, name);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      if (text != null) e.textContent = text;
      svg.appendChild(e);
      return e;
    }
    function mp(x, y) {
      return [
        A[0] + (x / 100) * (B[0] - A[0]) + (y / 100) * (C[0] - A[0]),
        A[1] + (x / 100) * (B[1] - A[1]) + (y / 100) * (C[1] - A[1])
      ];
    }
    function polyPoints(pts) {
      return pts.map(p => mp(p[0], p[1]).join(",")).join(" ");
    }

    el("rect", { x: 0, y: 0, width: 600, height: 540, fill: "#ffffff" });

    for (const z of Z) {
      el("polygon", {
        points: polyPoints(z.pts),
        fill: colors[z.code],
        "fill-opacity": 0.88,
        stroke: "#666666",
        "stroke-width": 1.4
      });
      let sx = 0, sy = 0;
      for (const p of z.pts) { sx += p[0]; sy += p[1]; }
      const cp = mp(sx / z.pts.length, sy / z.pts.length);
      el("text", {
        x: cp[0],
        y: cp[1],
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        "font-family": "Arial, sans-serif",
        "font-size": 20,
        "font-weight": "bold",
        fill: "#1b1b1b"
      }, z.code);
    }

    el("path", {
      d: "M " + A[0] + " " + A[1] + " L " + B[0] + " " + B[1] + " L " + C[0] + " " + C[1] + " Z",
      fill: "none",
      stroke: "#222222",
      "stroke-width": 2.5
    });

    const sides = [[A, B], [B, C], [C, A]];
    for (const [P, Q] of sides) {
      for (let f = 0; f <= 100; f += 10) {
        const px = P[0] + (Q[0] - P[0]) * f / 100;
        const py = P[1] + (Q[1] - P[1]) * f / 100;
        let dx = G[0] - px, dy = G[1] - py;
        const len = Math.hypot(dx, dy) || 1;
        el("line", {
          x1: px, y1: py,
          x2: px + (dx / len) * 8, y2: py + (dy / len) * 8,
          stroke: "#555555", "stroke-width": 1
        });
      }
    }

    el("text", { x: C[0], y: C[1] - 38, "text-anchor": "middle", "font-family": "Arial, sans-serif", "font-size": 18, "font-weight": "bold", fill: "#111111" }, "C2H2 (%)");
    el("text", { x: C[0], y: C[1] - 20, "text-anchor": "middle", "font-family": "Arial, sans-serif", "font-size": 12, fill: "#111111" }, "100%");
    el("text", { x: A[0] - 42, y: A[1] + 6, "text-anchor": "middle", "font-family": "Arial, sans-serif", "font-size": 18, "font-weight": "bold", fill: "#111111" }, "CH4 (%)");
    el("text", { x: A[0] - 42, y: A[1] + 24, "text-anchor": "middle", "font-family": "Arial, sans-serif", "font-size": 12, fill: "#111111" }, "100%");
    el("text", { x: B[0] + 42, y: B[1] + 6, "text-anchor": "middle", "font-family": "Arial, sans-serif", "font-size": 18, "font-weight": "bold", fill: "#111111" }, "C2H4 (%)");
    el("text", { x: B[0] + 42, y: B[1] + 24, "text-anchor": "middle", "font-family": "Arial, sans-serif", "font-size": 12, fill: "#111111" }, "100%");

    const midAB = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    const midBC = [(B[0] + C[0]) / 2, (B[1] + C[1]) / 2];
    const midCA = [(C[0] + A[0]) / 2, (C[1] + A[1]) / 2];
    el("text", { x: midAB[0], y: midAB[1] + 30, "text-anchor": "middle", "font-family": "Arial, sans-serif", "font-size": 12, fill: "#333333" }, "C2H2 0%");
    el("text", { x: midBC[0] + 34, y: midBC[1], "text-anchor": "start", "font-family": "Arial, sans-serif", "font-size": 12, fill: "#333333" }, "CH4 0%");
    el("text", { x: midCA[0] - 34, y: midCA[1], "text-anchor": "end", "font-family": "Arial, sans-serif", "font-size": 12, fill: "#333333" }, "C2H4 0%");
    el("text", { x: 300, y: 526, "text-anchor": "middle", "font-family": "Arial, sans-serif", "font-size": 14, fill: "#333333" }, "Duval Triangle 1 — CH4 / C2H4 / C2H2 (%)");

    if (sample) {
      const a = Number(sample.ch4) || 0;
      const b = Number(sample.c2h4) || 0;
      const c = Number(sample.c2h2) || 0;
      const s = a + b + c;
      if (s > 0) {
        const p = mp((b / s) * 100, (c / s) * 100);
        el("circle", { cx: p[0], cy: p[1], r: 7, fill: "#d62728", stroke: "#ffffff", "stroke-width": 2 });
      }
    }
  }
};
