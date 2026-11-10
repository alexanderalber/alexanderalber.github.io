const DuvalTriangle5 = {
  // Zone polygons expressed in (%C2H4, %C2H6) coordinates.
  // The third gas %CH4 = 100 - %C2H4 - %C2H6.
  _zones: [
    { code: "PD", color: "#f3f39a", poly: [[0, 0], [2, 0], [0, 2]] },
    { code: "S",  color: "#8fe38f", poly: [[0, 15], [40, 15], [40, 60], [0, 100]] },
    { code: "O",  color: "#a9d6ef", poly: [[2, 0], [40, 0], [40, 15], [0, 15], [0, 2]] },
    { code: "C",  color: "#d6b8e0", poly: [[40, 15], [85, 15], [40, 60]] },
    { code: "T2", color: "#ffcf87", poly: [[40, 0], [50, 0], [50, 15], [40, 15]] },
    { code: "T3", color: "#ff9d9d", poly: [[50, 0], [100, 0], [85, 15], [50, 15]] }
  ],

  classify(ch4, c2h4, c2h6) {
    const t = ch4 + c2h4 + c2h6;
    const m = (ch4 / t) * 100;
    const e4 = (c2h4 / t) * 100;
    const e6 = (c2h6 / t) * 100;

    if (m >= 98) return "PD";
    if (e4 <= 40) return e6 >= 15 ? "S" : "O";
    // e4 > 40
    if (e6 >= 15) return "C";
    return e4 > 50 ? "T3" : "T2";
  },

  render(svg, sample) {
    const NS = "http://www.w3.org/2000/svg";

    // Transform (%C2H4, %C2H6) -> screen coordinates.
    // Vertices: CH4=100 at top, C2H4=100 bottom-right, C2H6=100 bottom-left.
    const pt = (e4, e6) => {
      const m = 100 - e4 - e6;
      const x = (m * 300 + e4 * 550 + e6 * 50) / 100;
      const y = (m * 47 + e4 * 480 + e6 * 480) / 100;
      return [x, y];
    };

    const el = (name, attrs) => {
      const e = document.createElementNS(NS, name);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      return e;
    };

    const text = (x, y, str, opts) => {
      opts = opts || {};
      const t = el("text", {
        x: x, y: y,
        "font-family": "Arial, sans-serif",
        "font-size": opts.size || 13,
        "text-anchor": opts.anchor || "middle",
        fill: opts.fill || "#000",
        "font-weight": opts.weight || "normal"
      });
      t.textContent = str;
      svg.appendChild(t);
      return t;
    };

    // Background
    svg.appendChild(el("rect", { x: 0, y: 0, width: 600, height: 540, fill: "#ffffff" }));

    // Zone polygons + labels
    this._zones.forEach(z => {
      const pts = z.poly.map(p => pt(p[0], p[1]));
      const poly = el("polygon", {
        points: pts.map(p => p[0].toFixed(2) + "," + p[1].toFixed(2)).join(" "),
        fill: z.color,
        stroke: "#555",
        "stroke-width": 1
      });
      svg.appendChild(poly);

      // centroid
      let cx = 0, cy = 0;
      pts.forEach(p => { cx += p[0]; cy += p[1]; });
      cx /= pts.length; cy /= pts.length;
      text(cx, cy + 4, z.code, { size: 14, weight: "bold" });
    });

    // Triangle outline
    const Lv = pt(0, 100);   // C2H6 corner (bottom-left)
    const Rv = pt(100, 0);   // C2H4 corner (bottom-right)
    const Tv = pt(0, 0);     // CH4 corner (top)

    const outline = el("polygon", {
      points: [Lv, Rv, Tv].map(p => p[0] + "," + p[1]).join(" "),
      fill: "none",
      stroke: "#000",
      "stroke-width": 2
    });
    svg.appendChild(outline);

    const centroid = [300, (47 + 480 + 480) / 3];

    // Tick marks along an edge
    const drawTicks = (A, B, fn) => {
      for (let i = 1; i < 10; i++) {
        const f = i / 10;
        const px = A[0] + (B[0] - A[0]) * f;
        const py = A[1] + (B[1] - A[1]) * f;
        // outward direction (away from centroid)
        let dx = px - centroid[0];
        let dy = py - centroid[1];
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        dx /= len; dy /= len;
        const tl = (i % 5 === 0) ? 10 : 6;
        svg.appendChild(el("line", {
          x1: px, y1: py,
          x2: px + dx * tl, y2: py + dy * tl,
          stroke: "#000", "stroke-width": 1
        }));
        if (i % 2 === 0) {
          text(px + dx * (tl + 9), py + dy * (tl + 9) + 3, fn(i), { size: 9, fill: "#333" });
        }
      }
    };

    // Bottom edge (C2H6 -> C2H4): %C2H4 increases from left to right
    drawTicks(Lv, Rv, i => (i * 10).toString());
    // Right edge (C2H4 -> CH4): %CH4 increases toward top
    drawTicks(Rv, Tv, i => (i * 10).toString());
    // Left edge (CH4 -> C2H6): %C2H6 increases toward bottom-left
    drawTicks(Tv, Lv, i => (i * 10).toString());

    // Gas name labels
    text(300, 32, "CH4", { size: 16, weight: "bold" });
    text(575, 500, "C2H4", { size: 16, weight: "bold", anchor: "middle" });
    text(28, 500, "C2H6", { size: 16, weight: "bold", anchor: "middle" });

    // Title
    text(300, 525, "Duval Triangle 5", { size: 14, weight: "bold", fill: "#444" });

    // Sample point
    if (sample) {
      const t = sample.ch4 + sample.c2h4 + sample.c2h6;
      if (t > 0) {
        const e4 = (sample.c2h4 / t) * 100;
        const e6 = (sample.c2h6 / t) * 100;
        const p = pt(e4, e6);
        svg.appendChild(el("circle", {
          cx: p[0], cy: p[1], r: 5,
          fill: "#d00000", stroke: "#000", "stroke-width": 1.5
        }));
        const code = this.classify(sample.ch4, sample.c2h4, sample.c2h6);
        text(p[0] + 10, p[1] - 8, code, { size: 12, weight: "bold", anchor: "start", fill: "#d00000" });
      }
    }
  }
};
