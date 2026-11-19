const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const total = ch4 + c2h4 + c2h6;
    if (total <= 0) return "INV";
    const pCH4 = ch4 / total * 100;
    const pC2H4 = c2h4 / total * 100;
    const pC2H6 = c2h6 / total * 100;
    if (pC2H6 >= 46 && pC2H4 <= 24) return "S";
    if (pCH4 >= 82 && pC2H4 <= 10) return "PD";
    if (pC2H4 >= 24 && pC2H6 <= 25) return "T2";
    return "T1";
  },

  render(svg, sample) {
    const NS = "http://www.w3.org/2000/svg";
    const W = 600, H = 540;
    svg.setAttribute("viewBox", "0 0 600 540");
    svg.setAttribute("width", "600");
    svg.setAttribute("height", "540");

    const vC2H4 = { x: 300, y: 105 };
    const vCH4 = { x: 495, y: 495 };
    const vC2H6 = { x: 105, y: 495 };

    function toXY(p6, p4, p2) {
      return {
        x: (p6 * vC2H6.x + p4 * vC2H4.x + p2 * vCH4.x) / 100,
        y: (p6 * vC2H6.y + p4 * vC2H4.y + p2 * vCH4.y) / 100
      };
    }

    const zones = {
      S: [
        { c6: 100, c4: 0, c2: 0 },
        { c6: 46, c4: 54, c2: 0 },
        { c6: 46, c4: 44, c2: 10 },
        { c6: 70, c4: 0, c2: 30 }
      ],
      PD: [
        { c6: 0, c4: 2, c2: 98 },
        { c6: 0, c4: 18, c2: 82 },
        { c6: 8, c4: 10, c2: 82 },
        { c6: 8, c4: 0, c2: 92 }
      ],
      T2: [
        { c6: 0, c4: 54, c2: 46 },
        { c6: 0, c4: 100, c2: 0 },
        { c6: 25, c4: 75, c2: 0 },
        { c6: 25, c4: 54, c2: 21 }
      ],
      T1: [
        { c6: 46, c4: 54, c2: 0 },
        { c6: 25, c4: 54, c2: 21 },
        { c6: 25, c4: 75, c2: 0 },
        { c6: 8, c4: 10, c2: 82 },
        { c6: 0, c4: 18, c2: 82 },
        { c6: 0, c4: 2, c2: 98 },
        { c6: 8, c4: 0, c2: 92 },
        { c6: 70, c4: 0, c2: 30 }
      ]
    };

    const colors = { S: "#d4edda", PD: "#cce5ff", T2: "#fff3cd", T1: "#f8d7da" };
    const labels = { S: { x: 175, y: 420 }, PD: { x: 420, y: 180 }, T2: { x: 380, y: 320 }, T1: { x: 240, y: 260 } };

    Object.keys(zones).forEach(key => {
      const poly = document.createElementNS(NS, "polygon");
      const pts = zones[key].map(p => {
        const pt = toXY(p.c6, p.c4, p.c2);
        return pt.x + "," + pt.y;
      }).join(" ");
      poly.setAttribute("points", pts);
      poly.setAttribute("fill", colors[key]);
      poly.setAttribute("stroke", "#333");
      poly.setAttribute("stroke-width", "1.5");
      svg.appendChild(poly);
    });

    const border = document.createElementNS(NS, "polygon");
    border.setAttribute("points", `${vC2H6.x},${vC2H6.y} ${vCH4.x},${vCH4.y} ${vC2H4.x},${vC2H4.y}`);
    border.setAttribute("fill", "none");
    border.setAttribute("stroke", "#222");
    border.setAttribute("stroke-width", "3");
    svg.appendChild(border);

    const gases = [
      { name: "C₂H₆", pos: { x: 55, y: 495 }, anchor: "end" },
      { name: "CH₄", pos: { x: 545, y: 495 }, anchor: "start" },
      { name: "C₂H₄", pos: { x: 300, y: 65 }, anchor: "middle" }
    ];
    gases.forEach(g => {
      const txt = document.createElementNS(NS, "text");
      txt.setAttribute("x", g.pos.x);
      txt.setAttribute("y", g.pos.y);
      txt.setAttribute("font-size", "18");
      txt.setAttribute("font-weight", "bold");
      txt.setAttribute("text-anchor", g.anchor);
      txt.textContent = g.name;
      svg.appendChild(txt);
    });

    function drawTicks(vA, vB, startPct, reverse) {
      for (let i = 10; i < 100; i += 10) {
        const t = i / 100;
        const px = vA.x + (vB.x - vA.x) * t;
        const py = vA.y + (vB.y - vA.y) * t;
        const dx = vB.x - vA.x;
        const dy = vB.y - vA.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const nx = -dy / len * 8;
        const ny = dx / len * 8;
        const line = document.createElementNS(NS, "line");
        line.setAttribute("x1", px);
        line.setAttribute("y1", py);
        line.setAttribute("x2", px + nx);
        line.setAttribute("y2", py + ny);
        line.setAttribute("stroke", "#222");
        line.setAttribute("stroke-width", "1.5");
        svg.appendChild(line);

        const tx = px + nx * 1.8;
        const ty = py + ny * 1.8;
        const lbl = document.createElementNS(NS, "text");
        lbl.setAttribute("x", tx);
        lbl.setAttribute("y", ty + 4);
        lbl.setAttribute("font-size", "10");
        lbl.setAttribute("text-anchor", "middle");
        lbl.textContent = reverse ? (100 - i) : i;
        svg.appendChild(lbl);
      }
    }

    drawTicks(vC2H6, vC2H4, 0, false);
    drawTicks(vC2H4, vCH4, 0, false);
    drawTicks(vC2H6, vCH4, 0, true);

    Object.keys(labels).forEach(key => {
      const t = document.createElementNS(NS, "text");
      t.setAttribute("x", labels[key].x);
      t.setAttribute("y", labels[key].y);
      t.setAttribute("font-size", "20");
      t.setAttribute("font-weight", "bold");
      t.setAttribute("fill", "#222");
      t.setAttribute("text-anchor", "middle");
      t.textContent = key;
      svg.appendChild(t);
    });

    if (sample && typeof sample.ch4 === "number" && typeof sample.c2h4 === "number" && typeof sample.c2h6 === "number") {
      const tot = sample.ch4 + sample.c2h4 + sample.c2h6;
      if (tot > 0) {
        const p6 = sample.c2h6 / tot * 100;
        const p4 = sample.c2h4 / tot * 100;
        const p2 = sample.ch4 / tot * 100;
        const pt = toXY(p6, p4, p2);
        const dot = document.createElementNS(NS, "circle");
        dot.setAttribute("cx", pt.x);
        dot.setAttribute("cy", pt.y);
        dot.setAttribute("r", "6");
        dot.setAttribute("fill", "#d00");
        dot.setAttribute("stroke", "#300");
        dot.setAttribute("stroke-width", "2");
        svg.appendChild(dot);
      }
    }
  }
};
