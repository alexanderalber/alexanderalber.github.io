const DuvalTriangle = (() => {
  const NS = "http://www.w3.org/2000/svg";

  // Triangle vertices in SVG space (equilateral-ish, fits 600x540)
  const V_CH4  = [300, 70];   // top vertex    : 100% CH4
  const V_C2H4 = [535, 477];  // bottom right  : 100% C2H4
  const V_C2H2 = [65, 477];   // bottom left   : 100% C2H2

  function toXY(m, e, a) { // m=%CH4, e=%C2H4, a=%C2H2 (sum 100)
    return [
      (m * V_CH4[0] + e * V_C2H4[0] + a * V_C2H2[0]) / 100,
      (m * V_CH4[1] + e * V_C2H4[1] + a * V_C2H2[1]) / 100
    ];
  }

  function pcts(ch4, c2h4, c2h2) {
    const s = ch4 + c2h4 + c2h2;
    return [100 * ch4 / s, 100 * c2h4 / s, 100 * c2h2 / s];
  }

  function mk(parent, name, attrs, text) {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (text !== undefined) n.textContent = text;
    parent.appendChild(n);
    return n;
  }

  // Zone polygons, vertices as [%CH4, %C2H4, %C2H2]
  const ZONES = [
    { code: "D1", color: "#bfe3f7",
      pts: [[87,0,13],[64,23,13],[0,23,77],[0,0,100]],
      label: [37.75, 11.5, 50.75] },
    { code: "D2", color: "#7fc4ec",
      pts: [[64,23,13],[47,40,13],[31,40,29],[0,71,29],[0,23,77]],
      label: [28.4, 39.4, 32.2] },
    { code: "DT", color: "#d9c2ec",
      pts: [[96,0,4],[87,0,13],[47,40,13],[31,40,29],[0,71,29],[0,85,15],[35,50,15],[46,50,4]],
      label: [42.75, 42, 15.25] },
    { code: "T3", color: "#f4a460",
      pts: [[50,50,0],[35,50,15],[0,85,15],[0,100,0]],
      label: [21, 71, 8] },
    { code: "T2", color: "#ffd27f",
      pts: [[80,20,0],[76,20,4],[46,50,4],[50,50,0]],
      label: [63, 35, 2] },
    { code: "T1", color: "#fff2b3",
      pts: [[98,2,0],[98,0,2],[96,0,4],[76,20,4],[80,20,0]],
      label: [89.6, 8.4, 2] },
    { code: "PD", color: "#c8f7c5",
      pts: [[98,2,0],[100,0,0],[98,0,2]],
      label: null } // labelled with a leader line
  ];

  function classify(ch4, c2h4, c2h2) {
    const [m, e, a] = pcts(ch4, c2h4, c2h2);
    if (m >= 98) return "PD";
    if (a < 4) {
      if (e < 20) return "T1";
      if (e < 50) return "T2";
      return "T3";
    }
    if (a <= 15 && e >= 50) return "T3";
    if (a >= 13) {
      if (e <= 23) return "D1";
      if (e <= 40 || a >= 29) return "D2";
      return "DT";
    }
    return "DT";
  }

  function render(svg, sample) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const g = mk(svg, "g", {});

    // Title
    mk(g, "text", { x: 300, y: 32, "text-anchor": "middle",
      "font-family": "sans-serif", "font-size": 18, "font-weight": "bold",
      fill: "#222" }, "Duval Triangle 1");

    // Zone fills
    for (const z of ZONES) {
      const d = z.pts.map(p => toXY(p[0], p[1], p[2]).join(",")).join(" ");
      mk(g, "polygon", { points: d, fill: z.color, stroke: "#555", "stroke-width": 1 });
    }

    // Light 10% grid lines (three directions)
    for (let k = 10; k <= 90; k += 10) {
      const lines = [
        [toXY(k, 100 - k, 0), toXY(k, 0, 100 - k)],       // const CH4
        [toXY(100 - k, k, 0), toXY(0, k, 100 - k)],       // const C2H4
        [toXY(100 - k, 0, k), toXY(0, 100 - k, k)]        // const C2H2
      ];
      for (const [p1, p2] of lines) {
        mk(g, "line", { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1],
          stroke: "#000", "stroke-opacity": 0.12, "stroke-width": 0.7 });
      }
    }

    // Outer triangle
    mk(g, "polygon", {
      points: [V_CH4, V_C2H4, V_C2H2].map(p => p.join(",")).join(" "),
      fill: "none", stroke: "#222", "stroke-width": 2 });

    // Ticks + numeric labels
    const sides = [
      { from: V_C2H2, to: V_CH4, out: [-0.866, -0.5] },  // %CH4 : 0 at bottom-left, 100 at top
      { from: V_CH4, to: V_C2H4, out: [0.866, -0.5] },   // %C2H4: 0 at top, 100 at bottom-right
      { from: V_C2H4, to: V_C2H2, out: [0, 1] }          // %C2H2: 0 at bottom-right, 100 at bottom-left
    ];
    for (const s of sides) {
      for (let v = 10; v <= 90; v += 10) {
        const f = v / 100;
        const px = s.from[0] + f * (s.to[0] - s.from[0]);
        const py = s.from[1] + f * (s.to[1] - s.from[1]);
        mk(g, "line", { x1: px, y1: py,
          x2: px + 9 * s.out[0], y2: py + 9 * s.out[1],
          stroke: "#222", "stroke-width": 1.5 });
        if (v % 20 === 0) {
          mk(g, "text", { x: px + 24 * s.out[0], y: py + 24 * s.out[1] + 3,
            "text-anchor": "middle", "font-family": "sans-serif",
            "font-size": 11, fill: "#333" }, String(v));
        }
      }
    }

    // Axis titles
    mk(g, "text", { x: 138, y: 248, "text-anchor": "middle",
      "font-family": "sans-serif", "font-size": 15, "font-weight": "bold",
      fill: "#222", transform: "rotate(-60 138 248)" }, "% CH\u2084");
    mk(g, "text", { x: 462, y: 248, "text-anchor": "middle",
      "font-family": "sans-serif", "font-size": 15, "font-weight": "bold",
      fill: "#222", transform: "rotate(60 462 248)" }, "% C\u2082H\u2084");
    mk(g, "text", { x: 300, y: 522, "text-anchor": "middle",
      "font-family": "sans-serif", "font-size": 15, "font-weight": "bold",
      fill: "#222" }, "% C\u2082H\u2082");

    // Zone labels
    for (const z of ZONES) {
      if (!z.label) continue;
      const [x, y] = toXY(z.label[0], z.label[1], z.label[2]);
      const small = (z.code === "T1" || z.code === "T2");
      mk(g, "text", { x: x, y: y + 4, "text-anchor": "middle",
        "font-family": "sans-serif", "font-size": small ? 10 : 14,
        "font-weight": "bold", fill: "#222" }, z.code);
    }
    // PD label with leader line (zone too small)
    const pdPt = toXY(99, 0.5, 0.5);
    mk(g, "line", { x1: pdPt[0] + 4, y1: pdPt[1], x2: 358, y2: 62,
      stroke: "#222", "stroke-width": 1 });
    mk(g, "text", { x: 363, y: 66, "font-family": "sans-serif",
      "font-size": 13, "font-weight": "bold", fill: "#222" }, "PD");

    // Sample point
    if (sample) {
      const [m, e, a] = pcts(sample.ch4, sample.c2h4, sample.c2h2);
      const [x, y] = toXY(m, e, a);
      const code = classify(sample.ch4, sample.c2h4, sample.c2h2);
      mk(g, "circle", { cx: x, cy: y, r: 6, fill: "#e60000",
        stroke: "#fff", "stroke-width": 2 });
      mk(g, "text", { x: x + 11, y: y - 9, "font-family": "sans-serif",
        "font-size": 13, "font-weight": "bold", fill: "#b30000" }, code);
    }
  }

  return { classify: classify, render: render };
})();
