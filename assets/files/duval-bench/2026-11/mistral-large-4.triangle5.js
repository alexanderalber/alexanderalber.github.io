const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const cuts = [20, 30, 50, 70];
    const codes = ["T1", "T1+T2", "T2", "T2+T3", "T3"];
    const total = ch4 + c2h4 + c2h6;
    const b = (c2h4 / total) * 100;
    for (let i = 0; i < cuts.length; i++) {
      if (b < cuts[i]) return codes[i];
    }
    return codes[codes.length - 1];
  },

  render(svg, sample) {
    const NS = "http://www.w3.org/2000/svg";
    const mk = (name, attrs) => {
      const el = document.createElementNS(NS, name);
      for (const k in attrs) el.setAttribute(k, attrs[k]);
      return el;
    };

    while (svg.firstChild) svg.removeChild(svg.firstChild);

    svg.appendChild(mk("rect", { x: 0, y: 0, width: 600, height: 540, fill: "#ffffff" }));

    const A = { x: 70, y: 470 };
    const B = { x: 300, y: 80 };
    const C = { x: 530, y: 470 };
    const G = { x: (A.x + B.x + C.x) / 3, y: (A.y + B.y + C.y) / 3 };

    const bary = (a, b, c) => ({
      x: (a * A.x + b * B.x + c * C.x) / 100,
      y: (a * A.y + b * B.y + c * C.y) / 100
    });
    const pts = arr => arr.map(p => p.x.toFixed(2) + "," + p.y.toFixed(2)).join(" ");
    const lerp = (p, q, t) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    const unit = (p, q) => {
      const dx = q.x - p.x, dy = q.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      return { x: dx / len, y: dy / len };
    };

    const cuts = [0, 20, 30, 50, 70, 100];
    const codes = ["T1", "T1+T2", "T2", "T2+T3", "T3"];
    const fills = ["#f7dc6f", "#f0b27a", "#e67e22", "#cd6155", "#922b21"];

    for (let i = 0; i < codes.length; i++) {
      const lo = cuts[i], hi = cuts[i + 1];
      const poly = [
        bary(100 - lo, lo, 0),
        bary(0, lo, 100 - lo),
        bary(0, hi, 100 - hi),
        bary(100 - hi, hi, 0)
      ];
      svg.appendChild(mk("polygon", {
        points: pts(poly),
        fill: fills[i],
        stroke: "#566573",
        "stroke-width": 1.4
      }));
      const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
      const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
      const label = mk("text", {
        x: cx,
        y: cy,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        "font-family": "Arial, sans-serif",
        "font-size": i === 1 ? 15 : 19,
        "font-weight": "bold",
        fill: i === 4 ? "#ffffff" : "#212121"
      });
      label.textContent = codes[i];
      svg.appendChild(label);
    }

    svg.appendChild(mk("polygon", {
      points: pts([A, B, C]),
      fill: "none",
      stroke: "#2c3e50",
      "stroke-width": 3
    }));

    const edges = [
      { p: A, q: B, gas: "CH4" },
      { p: B, q: C, gas: "C2H4" },
      { p: C, q: A, gas: "C2H6" }
    ];
    for (const e of edges) {
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        const p = lerp(e.p, e.q, t);
        const n = unit(p, G);
        svg.appendChild(mk("line", {
          x1: p.x,
          y1: p.y,
          x2: p.x + n.x * 8,
          y2: p.y + n.y * 8,
          stroke: "#2c3e50",
          "stroke-width": 1
        }));
        if (k % 2 === 0) {
          const out = unit(G, p);
          const tx = p.x + out.x * 16;
          const ty = p.y + out.y * 16;
          const num = mk("text", {
            x: tx,
            y: ty,
            "text-anchor": "middle",
            "dominant-baseline": "middle",
            "font-family": "Arial, sans-serif",
            "font-size": 10,
            fill: "#2c3e50"
          });
          num.textContent = String(100 - k * 10);
          svg.appendChild(num);
        }
      }
      const out = unit(G, e.p);
      const name = mk("text", {
        x: e.p.x + out.x * 34,
        y: e.p.y + out.y * 34,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        "font-family": "Arial, sans-serif",
        "font-size": 18,
        "font-weight": "bold",
        fill: "#1b2631"
      });
      name.textContent = e.gas;
      svg.appendChild(name);
    }

    if (sample) {
      const total = sample.ch4 + sample.c2h4 + sample.c2h6;
      const a = (sample.ch4 / total) * 100;
      const b = (sample.c2h4 / total) * 100;
      const c = (sample.c2h6 / total) * 100;
      const p = bary(a, b, c);
      const code = DuvalTriangle5.classify(sample.ch4, sample.c2h4, sample.c2h6);
      svg.appendChild(mk("circle", {
        cx: p.x,
        cy: p.y,
        r: 8,
        fill: "#ff0000",
        stroke: "#ffffff",
        "stroke-width": 2.5
      }));
      const tag = mk("text", {
        x: p.x + 13,
        y: p.y - 13,
        "font-family": "Arial, sans-serif",
        "font-size": 14,
        "font-weight": "bold",
        fill: "#900c3f"
      });
      tag.textContent = code;
      svg.appendChild(tag);
    }
  }
};
