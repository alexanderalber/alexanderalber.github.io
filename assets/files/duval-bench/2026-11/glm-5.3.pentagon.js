/* Duval Pentagon 1 — self-contained implementation.
   Zone boundaries are from best recollection of the Duval Pentagon 1
   construction and may be approximate. */

const GASES = ["h2", "c2h2", "c2h4", "c2h6", "ch4"]; // pentagon vertex order (clockwise from top)
const CX = 300, CY = 330, R = 250;

function pentagonPoint(pcts) {
  // pcts: [h2, c2h2, c2h4, c2h6, ch4] percentages; barycentric on pentagon vertices.
  let x = 0, y = 0;
  for (let i = 0; i < 5; i++) {
    const a = (90 - 72 * i) * Math.PI / 180;
    x += (pcts[i] / 100) * (CX + R * Math.cos(a));
    y += (pcts[i] / 100) * (CY - R * Math.sin(a));
  }
  return [x, y];
}

const ZONES = [
  { code: "PD",  color: "#b388ff", poly: [[97,2,1,0,0],[70,20,5,4,1],[45,30,15,8,2],[55,25,12,6,2],[60,15,8,15,2]] },
  { code: "D1",  color: "#ffb74d", poly: [[40,10,5,10,35],[25,15,5,20,35],[15,10,5,25,45],[10,5,5,15,65],[18,25,10,15,32]] },
  { code: "D2",  color: "#e53935", poly: [[15,5,5,10,65],[8,5,5,20,62],[5,10,10,25,50],[10,15,10,15,50],[12,8,4,10,56]] },
  { code: "T1",  color: "#a1887f", poly: [[5,55,30,8,2],[10,50,25,12,3],[25,45,20,8,2],[15,45,25,13,2],[5,58,32,3,2]] },
  { code: "T2",  color: "#fb8c00", poly: [[5,25,15,50,5],[10,20,8,55,7],[15,15,5,55,10],[8,30,10,45,7],[5,40,15,35,5]] },
  { code: "T3",  color: "#d32f2f", poly: [[2,10,5,80,3],[5,15,8,70,2],[10,8,5,75,2],[3,15,12,65,5],[8,20,10,58,4]] },
  { code: "DT",  color: "#c0ca33", poly: [[13,25,10,45,7],[10,30,10,40,10],[15,25,15,35,10],[8,40,15,30,7],[13,32,12,35,8]] },
];

const DuvalPentagon = {
  classify(h2, ch4, c2h6, c2h4, c2h2) {
    const tot = h2 + ch4 + c2h6 + c2h4 + c2h2;
    if (!(tot > 0)) throw new Error("gas sum must be > 0");
    const pH = 100 * h2 / tot, pM = 100 * ch4 / tot, pE6 = 100 * c2h6 / tot,
          pE4 = 100 * c2h4 / tot, pA = 100 * c2h2 / tot;
    // Best-recollection decision tree (percentages of the five gases):
    if (pH >= 85 && pA <= 2 && pM <= 10) return "PD";         // corona, mostly H2
    if (pA < 4) {                                             // little acetylene: thermal
      if (pE4 < 15) return "T1";
      if (pE4 < 45) return "T2";
      return "T3";
    }
    if (pA < 13) return "DT";                                 // mixed thermal/electrical
    if (pA < 30) return (pE4 > pH) ? "DT" : "D1";             // low-energy arcing vs mixed
    return "D2";                                               // high-energy arcing
  },

  render(svg, sample) {
    const NS = "http://www.w3.org/2000/svg";
    const el = (tag, attrs, parent) => {
      const e = document.createElementNS(NS, tag);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      (parent || svg).appendChild(e);
      return e;
    };

    // Zone polygons
    for (const z of ZONES) {
      const pts = z.poly.map(p => pentagonPoint(p).map(v => v.toFixed(1)).join(",")).join(" ");
      el("polygon", { points: pts, fill: z.color, "fill-opacity": 0.75,
                      stroke: "#ffffff", "stroke-width": 1 });
    }

    // Pentagon outline
    const vs = [];
    for (let i = 0; i < 5; i++) vs.push(pentagonPoint([i === 0 ? 100 : 0, 0, 0, 0, 0].map((_, j) => j === 0 && i === 0 ? 100 : 0) && pentagonPoint(pctsFor(i))));
    function pctsFor(i) { const a = [0,0,0,0,0]; a[i] = 100; return a; }
    const outline = [];
    for (let i = 0; i < 5; i++) outline.push(pentagonPoint(pctsFor(i)).map(v => v.toFixed(1)).join(","));
    el("polygon", { points: outline.join(" "), fill: "none", stroke: "#333", "stroke-width": 2 });

    // Axes and gas labels
    const LABELS = ["H2", "C2H2", "C2H4", "C2H6", "CH4"];
    for (let i = 0; i < 5; i++) {
      const a = (90 - 72 * i) * Math.PI / 180;
      const vx = CX + R * Math.cos(a), vy = CY - R * Math.sin(a);
      el("line", { x1: CX, y1: CY, x2: vx, y2: vy, stroke: "#666", "stroke-width": 1 });
      const lx = CX + (R + 30) * Math.cos(a), ly = CY - (R + 30) * Math.sin(a);
      const t = el("text", { x: lx, y: ly + 5, "text-anchor": "middle",
        "font-family": "sans-serif", "font-size": "18", "font-weight": "bold", fill: "#111" });
      t.textContent = LABELS[i];
    }

    // Zone labels at polygon centroids
    for (const z of ZONES) {
      let cx = 0, cy = 0;
      const pts = z.poly.map(pentagonPoint);
      for (const p of pts) { cx += p[0]; cy += p[1]; }
      cx /= pts.length; cy /= pts.length;
      const t = el("text", { x: cx, y: cy, "text-anchor": "middle", "dominant-baseline": "middle",
        "font-family": "sans-serif", "font-size": "16", "font-weight": "bold", fill: "#000", opacity: "0.55" });
      t.textContent = z.code;
    }

    // Sample point
    if (sample) {
      const pcts = [
        sample.h2, sample.c2h2, sample.c2h4, sample.c2h6, sample.ch4
      ].map(v => v || 0);
      const tot = pcts.reduce((a, b) => a + b, 0);
      if (tot > 0) {
        const [x, y] = pentagonPoint(pcts.map(v => 100 * v / tot));
        el("circle", { cx: x, cy: y, r: 8, fill: "#000", stroke: "#fff", "stroke-width": 2 });
        const code = DuvalPentagon.classify(sample.h2, sample.ch4, sample.c2h6, sample.c2h4, sample.c2h2);
        const t = el("text", { x: x + 12, y: y - 10, "font-family": "sans-serif",
          "font-size": "18", "font-weight": "bold", fill: "#000" });
        t.textContent = code;
      }
    }
  }
};
