const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const total = ch4 + c2h4 + c2h2;
    const pC2H4 = (c2h4 / total) * 100;
    const pC2H2 = (c2h2 / total) * 100;

    if (pC2H2 < 4) {
      if (pC2H4 < 23) return "PD";
      if (pC2H4 < 50) return "T1";
      if (pC2H4 < 80) return "T2";
      return "T3";
    }
    if (pC2H2 < 13) {
      if (pC2H4 < 23) return "D1";
      if (pC2H4 < 40) return "D1";
      const boundary = 40 + (pC2H2 - 4) * (50 - 40) / (13 - 4);
      if (pC2H4 < boundary) return "D1";
      return "DT";
    }
    if (pC2H2 < 29) {
      const d1Boundary = 40 - (pC2H2 - 13) * (40 - 35) / (29 - 13);
      if (pC2H4 < d1Boundary) return "D1";
      return "D2";
    }
    return "D2";
  },

  render(svg, sample) {
    const ns = "http://www.w3.org/2000/svg";

    const Ax = 300, Ay = 30;
    const Bx = 50, By = 500;
    const Cx = 550, Cy = 500;

    function toXY(ch4, c2h4, c2h2) {
      const total = ch4 + c2h4 + c2h2;
      const pCH4 = ch4 / total;
      const pC2H4 = c2h4 / total;
      const pC2H2 = c2h2 / total;
      return {
        x: pCH4 * Ax + pC2H4 * Bx + pC2H2 * Cx,
        y: pCH4 * Ay + pC2H4 * By + pC2H2 * Cy
      };
    }

    function createPolygon(points, fill, stroke) {
      const poly = document.createElementNS(ns, "polygon");
      poly.setAttribute("points", points.map(p => {
        const pt = toXY(p[0], p[1], p[2]);
        return pt.x + "," + pt.y;
      }).join(" "));
      poly.setAttribute("fill", fill);
      poly.setAttribute("stroke", stroke || "#333");
      poly.setAttribute("stroke-width", "1");
      return poly;
    }

    function createText(x, y, text, fontSize, anchor) {
      const t = document.createElementNS(ns, "text");
      t.setAttribute("x", x);
      t.setAttribute("y", y);
      t.setAttribute("font-size", fontSize || 14);
      t.setAttribute("text-anchor", anchor || "middle");
      t.setAttribute("font-family", "sans-serif");
      t.textContent = text;
      return t;
    }

    const zones = [
      {
        name: "PD",
        color: "#a0d8ef",
        points: [[100, 0, 0], [96, 0, 4], [73, 23, 4], [77, 23, 0]]
      },
      {
        name: "T1",
        color: "#ffe4b5",
        points: [[77, 23, 0], [73, 23, 4], [46, 50, 4], [50, 50, 0]]
      },
      {
        name: "T2",
        color: "#ffcc80",
        points: [[50, 50, 0], [46, 50, 4], [16, 80, 4], [20, 80, 0]]
      },
      {
        name: "T3",
        color: "#ff9966",
        points: [[20, 80, 0], [16, 80, 4], [0, 96, 4], [0, 100, 0]]
      },
      {
        name: "D1",
        color: "#b8d4e3",
        points: [[96, 0, 4], [87, 0, 13], [47, 40, 13], [37, 50, 13], [46, 50, 4], [73, 23, 4]]
      },
      {
        name: "D2",
        color: "#d4a5a5",
        points: [[87, 0, 13], [71, 0, 29], [0, 71, 29], [0, 87, 13], [37, 50, 13], [47, 40, 13]]
      },
      {
        name: "DT",
        color: "#c4b7a6",
        points: [[37, 50, 13], [0, 87, 13], [0, 96, 4], [16, 80, 4], [46, 50, 4]]
      },
      {
        name: "D2b",
        color: "#d4a5a5",
        points: [[71, 0, 29], [0, 0, 100], [0, 71, 29]]
      }
    ];

    zones.forEach(zone => {
      svg.appendChild(createPolygon(zone.points, zone.color, "#333"));
    });

    const outline = document.createElementNS(ns, "polygon");
    outline.setAttribute("points", `${Ax},${Ay} ${Bx},${By} ${Cx},${Cy}`);
    outline.setAttribute("fill", "none");
    outline.setAttribute("stroke", "#000");
    outline.setAttribute("stroke-width", "2");
    svg.appendChild(outline);

    const labels = [
      { zone: "PD", pos: [88, 10, 2] },
      { zone: "T1", pos: [62, 36, 2] },
      { zone: "T2", pos: [32, 66, 2] },
      { zone: "T3", pos: [8, 90, 2] },
      { zone: "D1", pos: [65, 25, 10] },
      { zone: "D2", pos: [30, 35, 35] },
      { zone: "DT", pos: [15, 75, 10] }
    ];

    labels.forEach(label => {
      const pt = toXY(label.pos[0], label.pos[1], label.pos[2]);
      svg.appendChild(createText(pt.x, pt.y, label.zone, 16, "middle"));
    });

    svg.appendChild(createText(Ax, Ay - 12, "CH₄", 14, "middle"));
    svg.appendChild(createText(Bx - 25, By + 10, "C₂H₄", 14, "middle"));
    svg.appendChild(createText(Cx + 25, Cy + 10, "C₂H₂", 14, "middle"));

    for (let i = 0; i <= 10; i++) {
      const pct = i * 10;

      let p1 = toXY(100 - pct, pct, 0);
      let p2 = toXY(100 - pct, 0, pct);
      if (i > 0 && i < 10) {
        const tick = document.createElementNS(ns, "line");
        tick.setAttribute("x1", p1.x);
        tick.setAttribute("y1", p1.y);
        tick.setAttribute("x2", p1.x - 5);
        tick.setAttribute("y2", p1.y + 3);
        tick.setAttribute("stroke", "#000");
        tick.setAttribute("stroke-width", "1");
        svg.appendChild(tick);
        const tickLabel = createText(p1.x - 15, p1.y + 5, pct, 10, "middle");
        svg.appendChild(tickLabel);
      }

      p1 = toXY(0, 100 - pct, pct);
      p2 = toXY(100 - pct, 0, pct);
      if (i > 0 && i < 10) {
        const tick = document.createElementNS(ns, "line");
        tick.setAttribute("x1", p1.x);
        tick.setAttribute("y1", p1.y);
        tick.setAttribute("x2", p1.x + 5);
        tick.setAttribute("y2", p1.y + 3);
        tick.setAttribute("stroke", "#000");
        tick.setAttribute("stroke-width", "1");
        svg.appendChild(tick);
        const tickLabel = createText(p1.x + 15, p1.y + 5, pct, 10, "middle");
        svg.appendChild(tickLabel);
      }

      p1 = toXY(pct, 100 - pct, 0);
      p2 = toXY(0, 100 - pct, pct);
      if (i > 0 && i < 10) {
        const tick = document.createElementNS(ns, "line");
        const px = (p1.x + p2.x) / 2;
        tick.setAttribute("x1", p1.x);
        tick.setAttribute("y1", p1.y);
        tick.setAttribute("x2", p1.x);
        tick.setAttribute("y2", p1.y + 8);
        tick.setAttribute("stroke", "#000");
        tick.setAttribute("stroke-width", "1");
        svg.appendChild(tick);
        const tickLabel = createText(p1.x, p1.y + 18, pct, 10, "middle");
        svg.appendChild(tickLabel);
      }
    }

    const c2h4Label = createText(175, By + 35, "%C₂H₄", 12, "middle");
    svg.appendChild(c2h4Label);

    const c2h2Label = createText(425, By + 35, "%C₂H₂", 12, "middle");
    svg.appendChild(c2h2Label);

    const ch4Label = createText(175, 250, "%CH₄", 12, "middle");
    ch4Label.setAttribute("transform", "rotate(-60, 175, 250)");
    svg.appendChild(ch4Label);

    if (sample) {
      const pt = toXY(sample.ch4, sample.c2h4, sample.c2h2);
      const circle = document.createElementNS(ns, "circle");
      circle.setAttribute("cx", pt.x);
      circle.setAttribute("cy", pt.y);
      circle.setAttribute("r", 6);
      circle.setAttribute("fill", "#e00");
      circle.setAttribute("stroke", "#000");
      circle.setAttribute("stroke-width", "2");
      svg.appendChild(circle);
    }
  }
};
