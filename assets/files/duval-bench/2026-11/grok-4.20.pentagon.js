<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Duval Pentagon 1</title>
</head>
<body>
<script>
const DuvalPentagon = {
  classify(h2, ch4, c2h6, c2h4, c2h2) {
    const total = h2 + ch4 + c2h6 + c2h4 + c2h2;
    if (total <= 0) return "ND";
    const ph2 = h2 / total * 100;
    const pch4 = ch4 / total * 100;
    const pc2h6 = c2h6 / total * 100;
    const pc2h4 = c2h4 / total * 100;
    const pc2h2 = c2h2 / total * 100;

    if (ph2 > 75) return "PD";
    if (pc2h2 > 65) return "D1";
    if (pc2h2 > 25 && pc2h4 > 15) return "D2";
    if (pc2h4 > 65) return "T3";
    if (pc2h4 > 35 && pc2h6 > 15) return "T2";
    if (pch4 > 55 || (pch4 > 40 && pc2h6 > 25)) return "T1";
    if ((ph2 > 30 && pc2h2 > 15) || (pc2h4 > 20 && pc2h2 > 15 && pch4 > 15)) return "DT";
    return "DT";
  },

  render(svg, sample) {
    const ns = "http://www.w3.org/2000/svg";
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const cx = 300;
    const cy = 295;
    const r = 195;

    const gasDefs = [
      { key: "h2",   label: "H₂",   ang: -Math.PI / 2 },
      { key: "ch4",  label: "CH₄",  ang: -Math.PI / 2 + 2 * Math.PI / 5 },
      { key: "c2h6", label: "C₂H₆", ang: -Math.PI / 2 + 4 * Math.PI / 5 },
      { key: "c2h4", label: "C₂H₄", ang: -Math.PI / 2 + 6 * Math.PI / 5 },
      { key: "c2h2", label: "C₂H₂", ang: -Math.PI / 2 + 8 * Math.PI / 5 }
    ];

    function coords(perc) {
      let dx = 0, dy = 0;
      for (let g of gasDefs) {
        const v = perc[g.key] || 0;
        dx += v * Math.cos(g.ang);
        dy += v * Math.sin(g.ang);
      }
      return {
        x: cx + r * dx / 100,
        y: cy + r * dy / 100
      };
    }

    function axisPoint(key, percent) {
      const p = { h2: 0, ch4: 0, c2h6: 0, c2h4: 0, c2h2: 0 };
      p[key] = percent;
      return coords(p);
    }

    const vertices = gasDefs.map(g => {
      const p = { h2: 0, ch4: 0, c2h6: 0, c2h4: 0, c2h2: 0 };
      p[g.key] = 100;
      return coords(p);
    });

    const pointsStr = vertices.map(v => `${v.x.toFixed(1)},${v.y.toFixed(1)}`).join(" ");

    const outer = document.createElementNS(ns, "polygon");
    outer.setAttribute("points", pointsStr);
    outer.setAttribute("fill", "#f1f5f9");
    outer.setAttribute("stroke", "#1e2937");
    outer.setAttribute("stroke-width", "12");
    svg.appendChild(outer);

    const innerPent = document.createElementNS(ns, "polygon");
    const innerPts = vertices.map((v, i) => {
      const fx = cx + (v.x - cx) * 0.22;
      const fy = cy + (v.y - cy) * 0.22;
      return `${fx.toFixed(1)},${fy.toFixed(1)}`;
    }).join(" ");
    innerPent.setAttribute("points", innerPts);
    innerPent.setAttribute("fill", "#e0f2fe");
    innerPent.setAttribute("stroke", "none");
    svg.appendChild(innerPent);

    gasDefs.forEach((g, i) => {
      const end = vertices[i];
      const line = document.createElementNS(ns, "line");
      line.setAttribute("x1", cx);
      line.setAttribute("y1", cy);
      line.setAttribute("x2", end.x);
      line.setAttribute("y2", end.y);
      line.setAttribute("stroke", "#334155");
      line.setAttribute("stroke-width", "2.5");
      svg.appendChild(line);
    });

    const zonePolys = [
      { code: "PD",  fill: "#bae6fd", points: [
        vertices[0],
        axisPoint("h2", 68),
        axisPoint("h2", 52),
        axisPoint("c2h2", 38),
        axisPoint("c2h2", 22)
      ]},
      { code: "D1",  fill: "#fecaca", points: [
        vertices[4],
        axisPoint("c2h2", 75),
        axisPoint("c2h2", 55),
        axisPoint("c2h4", 32),
        axisPoint("c2h4", 12)
      ]},
      { code: "D2",  fill: "#fed7aa", points: [
        axisPoint("c2h2", 55),
        axisPoint("c2h4", 55),
        axisPoint("c2h4", 75),
        vertices[3],
        axisPoint("c2h4", 32),
        axisPoint("c2h2", 22)
      ]},
      { code: "T3",  fill: "#a5f3fc", points: [
        vertices[3],
        axisPoint("c2h4", 78),
        axisPoint("c2h6", 45),
        axisPoint("c2h6", 22)
      ]},
      { code: "T2",  fill: "#86efac", points: [
        axisPoint("c2h4", 45),
        axisPoint("c2h6", 55),
        axisPoint("ch4", 35),
        axisPoint("ch4", 18)
      ]},
      { code: "T1",  fill: "#fde047", points: [
        vertices[1],
        axisPoint("ch4", 72),
        axisPoint("c2h6", 65),
        axisPoint("c2h6", 22),
        axisPoint("ch4", 18)
      ]},
      { code: "DT",  fill: "#ddd6fe", points: [
        axisPoint("h2", 52),
        axisPoint("c2h2", 38),
        axisPoint("c2h4", 32),
        axisPoint("c2h4", 45),
        axisPoint("c2h6", 45),
        axisPoint("ch4", 35),
        axisPoint("ch4", 18),
        axisPoint("h2", 22)
      ]}
    ];

    for (let zone of zonePolys) {
      const poly = document.createElementNS(ns, "polygon");
      const str = zone.points.map(pt => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ");
      poly.setAttribute("points", str);
      poly.setAttribute("fill", zone.fill);
      poly.setAttribute("opacity", "0.65");
      poly.setAttribute("stroke", "#1e2937");
      poly.setAttribute("stroke-width", "1.5");
      svg.appendChild(poly);
    }

    const zoneLabels = [
      { code: "PD",  x: 295, y: 92,  color: "#0e7490" },
      { code: "D1",  x: 495, y: 165, color: "#b91c1c" },
      { code: "D2",  x: 475, y: 325, color: "#c2410c" },
      { code: "T3",  x: 390, y: 465, color: "#0e7490" },
      { code: "T2",  x: 165, y: 425, color: "#166534" },
      { code: "T1",  x: 105, y: 215, color: "#854d0e" },
      { code: "DT",  x: 300, y: 325, color: "#4338ca" }
    ];

    for (let z of zoneLabels) {
      const bg = document.createElementNS(ns, "rect");
      bg.setAttribute("x", z.x - 19);
      bg.setAttribute("y", z.y - 14);
      bg.setAttribute("width", 38);
      bg.setAttribute("height", 27);
      bg.setAttribute("rx", 4);
      bg.setAttribute("fill", "#f8fafc");
      bg.setAttribute("opacity", "0.85");
      svg.appendChild(bg);

      const txt = document.createElementNS(ns, "text");
      txt.setAttribute("x", z.x);
      txt.setAttribute("y", z.y + 3);
      txt.setAttribute("text-anchor", "middle");
      txt.setAttribute("dominant-baseline", "middle");
      txt.setAttribute("font-family", "Arial, Helvetica, sans-serif");
      txt.setAttribute("font-size", "15");
      txt.setAttribute("font-weight", "700");
      txt.setAttribute("fill", z.color);
      txt.textContent = z.code;
      svg.appendChild(txt);
    }

    gasDefs.forEach((g, i) => {
      const labelPt = coords({
        h2:   g.key === "h2"   ? 118 : 0,
        ch4:  g.key === "ch4"  ? 118 : 0,
        c2h6: g.key === "c2h6" ? 118 : 0,
        c2h4: g.key === "c2h4" ? 118 : 0,
        c2h2: g.key === "c2h2" ? 118 : 0
      });

      const t = document.createElementNS(ns, "text");
      t.setAttribute("x", labelPt.x);
      t.setAttribute("y", labelPt.y);
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("dominant-baseline", "middle");
      t.setAttribute("font-family", "Arial, Helvetica, sans-serif");
      t.setAttribute("font-size", "17");
      t.setAttribute("font-weight", "700");
      t.setAttribute("fill", "#1e2937");
      t.textContent = g.label;
      svg.appendChild(t);
    });

    const title = document.createElementNS(ns, "text");
    title.setAttribute("x", 300);
    title.setAttribute("y", 42);
    title.setAttribute("text-anchor", "middle");
    title.setAttribute("font-family", "Arial, Helvetica, sans-serif");
    title.setAttribute("font-size", "21");
    title.setAttribute("font-weight", "700");
    title.setAttribute("fill", "#1e2937");
    title.textContent = "DUVAL PENTAGON 1";
    svg.appendChild(title);

    const subtitle = document.createElementNS(ns, "text");
    subtitle.setAttribute("x", 300);
    subtitle.setAttribute("y", 64);
    subtitle.setAttribute("text-anchor", "middle");
    subtitle.setAttribute("font-family", "Arial, Helvetica, sans-serif");
    subtitle.setAttribute("font-size", "11");
    subtitle.setAttribute("fill", "#64748b");
    subtitle.textContent = "DGA Fault Zone Identification";
    svg.appendChild(subtitle);

    if (sample) {
      const total = sample.h2 + sample.ch4 + sample.c2h6 + sample.c2h4 + sample.c2h2;
      if (total > 0) {
        const perc = {
          h2: sample.h2 / total * 100,
          ch4: sample.ch4 / total * 100,
          c2h6: sample.c2h6 / total * 100,
          c2h4: sample.c2h4 / total * 100,
          c2h2: sample.c2h2 / total * 100
        };
        const pt = coords(perc);

        const dot = document.createElementNS(ns, "circle");
        dot.setAttribute("cx", pt.x);
        dot.setAttribute("cy", pt.y);
        dot.setAttribute("r", "9");
        dot.setAttribute("fill", "#b91c1c");
        dot.setAttribute("stroke", "#fff");
        dot.setAttribute("stroke-width", "3.5");
        svg.appendChild(dot);

        const ring = document.createElementNS(ns, "circle");
        ring.setAttribute("cx", pt.x);
        ring.setAttribute("cy", pt.y);
        ring.setAttribute("r", "13");
        ring.setAttribute("fill", "none");
        ring.setAttribute("stroke", "#b91c1c");
        ring.setAttribute("stroke-width", "1.5");
        svg.appendChild(ring);
      }
    }
  }
};
</script>
</body>
</html>
