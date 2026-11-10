/*
 * Duval Triangle 5 (low-temperature faults, mineral-oil transformers)
 * Gases: CH4 (methane), C2H4 (ethylene), C2H6 (ethane)
 *
 * Zones (relative percentages of the three gases):
 *   PD : partial discharges            -> %CH4  >= 98
 *   T3 : thermal fault > 700 C         -> %C2H4 >= 70
 *   T2 : thermal fault 300-700 C       -> 35 <= %C2H4 < 70
 *   C  : possible paper carbonization  -> 10 <= %C2H4 < 35
 *   O  : overheating < 250 C           -> %C2H4 < 10 and %C2H6 < 14
 *   S  : stray gassing of oil          -> %C2H4 < 10 and %C2H6 >= 14
 */
const DuvalTriangle5 = {

  classify(ch4, c2h4, c2h6) {
    const total = ch4 + c2h4 + c2h6;
    const pCH4 = 100 * ch4 / total;
    const pC2H4 = 100 * c2h4 / total;
    const pC2H6 = 100 * c2h6 / total;

    if (pCH4 >= 98) return "PD";
    if (pC2H4 >= 70) return "T3";
    if (pC2H4 >= 35) return "T2";
    if (pC2H4 >= 10) return "C";
    return (pC2H6 < 14) ? "O" : "S";
  },

  render(svg, sample) {
    const NS = "http://www.w3.org/2000/svg";

    // Triangle geometry (equilateral).
    // Corners: top = 100% CH4, bottom-right = 100% C2H4, bottom-left = 100% C2H6
    const BL = { x: 75, y: 455 };
    const BR = { x: 525, y: 455 };
    const TOP = { x: 300, y: 455 - 225 * Math.sqrt(3) };
    const CENTROID = {
      x: (BL.x + BR.x + TOP.x) / 3,
      y: (BL.y + BR.y + TOP.y) / 3
    };

    function el(name, attrs, parent, text) {
      const e = document.createElementNS(NS, name);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      if (text !== undefined) e.textContent = text;
      (parent || svg).appendChild(e);
      return e;
    }

    // ternary (percentages, sum 100) -> xy
    function tern(ch4, c2h4, c2h6) {
      return {
        x: (ch4 * TOP.x + c2h4 * BR.x + c2h6 * BL.x) / 100,
        y: (ch4 * TOP.y + c2h4 * BR.y + c2h6 * BL.y) / 100
      };
    }

    function ptsAttr(ternList) {
      return ternList.map(t => {
        const p = tern(t[0], t[1], t[2]);
        return p.x.toFixed(2) + "," + p.y.toFixed(2);
      }).join(" ");
    }

    // Title
    el("text", {
      x: 300, y: 24, "text-anchor": "middle",
      "font-family": "sans-serif", "font-size": 18, "font-weight": "bold",
      fill: "#222"
    }, svg, "Duval Triangle 5 (CH\u2084 / C\u2082H\u2084 / C\u2082H\u2086)");

    // ----- zones -----
    const zones = [
      { name: "PD", color: "#ff8a8a",
        poly: [[100,0,0],[98,2,0],[98,0,2]] },
      { name: "O",  color: "#fff3a6",
        poly: [[98,2,0],[90,10,0],[76,10,14],[86,0,14],[98,0,2]] },
      { name: "S",  color: "#b8e6b8",
        poly: [[86,0,14],[76,10,14],[0,10,90],[0,0,100]] },
      { name: "C",  color: "#d8b88a",
        poly: [[90,10,0],[65,35,0],[0,35,65],[0,10,90]] },
      { name: "T2", color: "#f6b26b",
        poly: [[65,35,0],[30,70,0],[0,70,30],[0,35,65]] },
      { name: "T3", color: "#d9a6e0",
        poly: [[30,70,0],[0,100,0],[0,70,30]] }
    ];

    zones.forEach(z => {
      el("polygon", {
        points: ptsAttr(z.poly),
        fill: z.color,
        stroke: "#555",
        "stroke-width": 1
      });
    });

    // outer border
    el("polygon", {
      points: ptsAttr([[100,0,0],[0,100,0],[0,0,100]]),
      fill: "none", stroke: "#000", "stroke-width": 2
    });

    // ----- zone labels -----
    const zoneLabels = [
      { t: [86, 4, 10],  s: "O"  },
      { t: [40, 4, 56],  s: "S"  },
      { t: [40, 22, 38], s: "C"  },
      { t: [28, 52, 20], s: "T2" },
      { t: [10, 83, 7],  s: "T3" }
    ];
    zoneLabels.forEach(l => {
      const p = tern(l.t[0], l.t[1], l.t[2]);
      el("text", {
        x: p.x, y: p.y + 5, "text-anchor": "middle",
        "font-family": "sans-serif", "font-size": 16, "font-weight": "bold",
        fill: "#333"
      }, svg, l.s);
    });

    // PD leader line + label (zone too small to label inside)
    const pdPt = tern(99, 1, 0.5);
    el("line", {
      x1: pdPt.x, y1: pdPt.y, x2: pdPt.x + 48, y2: pdPt.y - 14,
      stroke: "#333", "stroke-width": 1
    });
    el("text", {
      x: pdPt.x + 52, y: pdPt.y - 10,
      "font-family": "sans-serif", "font-size": 14, "font-weight": "bold",
      fill: "#333"
    }, svg, "PD");

    // ----- axes: ticks, numbers, gas names -----
    // axis: value 0 at point a, value 100 at point b
    function drawAxis(a, b, label) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      let nx = dy / len, ny = -dx / len;          // a normal
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      // make normal point away from centroid
      if (nx * (mid.x - CENTROID.x) + ny * (mid.y - CENTROID.y) < 0) {
        nx = -nx; ny = -ny;
      }
      for (let v = 10; v <= 90; v += 10) {
        const f = v / 100;
        const px = a.x + dx * f, py = a.y + dy * f;
        el("line", {
          x1: px, y1: py,
          x2: px + nx * 7, y2: py + ny * 7,
          stroke: "#000", "stroke-width": 1.5
        });
        el("text", {
          x: px + nx * 19, y: py + ny * 19 + 4,
          "text-anchor": "middle",
          "font-family": "sans-serif", "font-size": 11, fill: "#000"
        }, svg, String(v));
      }
      // gas name, rotated along the axis
      let ang = Math.atan2(dy, dx) * 180 / Math.PI;
      if (ang > 90 || ang < -90) ang += 180;
      const lx = mid.x + nx * 44, ly = mid.y + ny * 44;
      el("text", {
        x: lx, y: ly, "text-anchor": "middle",
        "font-family": "sans-serif", "font-size": 15, "font-weight": "bold",
        fill: "#000",
        transform: "rotate(" + ang.toFixed(1) + " " + lx.toFixed(1) + " " + ly.toFixed(1) + ")"
      }, svg, label);
    }

    drawAxis(BL, TOP, "% CH\u2084");    // left side: CH4 increases upward
    drawAxis(TOP, BR, "% C\u2082H\u2084"); // right side: C2H4 increases downward
    drawAxis(BR, BL, "% C\u2082H\u2086"); // bottom: C2H6 increases leftward

    // ----- sample point -----
    if (sample) {
      const total = sample.ch4 + sample.c2h4 + sample.c2h6;
      if (total > 0) {
        const p = tern(
          100 * sample.ch4 / total,
          100 * sample.c2h4 / total,
          100 * sample.c2h6 / total
        );
        el("circle", {
          cx: p.x, cy: p.y, r: 6,
          fill: "#d00000", stroke: "#fff", "stroke-width": 1.5
        });
        el("circle", {
          cx: p.x, cy: p.y, r: 2, fill: "#fff"
        });
        const zone = this.classify(sample.ch4, sample.c2h4, sample.c2h6);
        el("text", {
          x: p.x + 10, y: p.y - 8,
          "font-family": "sans-serif", "font-size": 13, "font-weight": "bold",
          fill: "#d00000", stroke: "#fff", "stroke-width": 3,
          "paint-order": "stroke"
        }, svg, zone);
      }
    }
  }
};
