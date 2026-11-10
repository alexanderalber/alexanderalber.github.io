const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const sum = ch4 + c2h4 + c2h6;
    if (sum <= 0) return "PD"; // degenerate; choose PD arbitrarily
    const f_ch4 = ch4 / sum;
    const f_c2h4 = c2h4 / sum;
    const f_c2h6 = c2h6 / sum;

    if (f_ch4 >= 0.9) return "PD";

    const denom = f_c2h4 + f_c2h6;
    if (denom <= 0) return "PD";
    const r = f_c2h4 / denom;
    if (r >= 0.8) return "T3";
    if (r <= 0.2) return "T1";
    return "T2";
  },

  render(svg, sample) {
    const NS = "http://www.w3.org/2000/svg";

    function el(tag, attrs) {
      const node = document.createElementNS(NS, tag);
      for (const key in attrs) {
        if (key === "text") {
          node.textContent = attrs[key];
        } else {
          node.setAttribute(key, attrs[key]);
        }
      }
      return node;
    }

    // clear svg (in case it wasn't empty)
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // white background
    svg.appendChild(el("rect", { x: 0, y: 0, width: 600, height: 540, fill: "#ffffff" }));

    // vertices in pixel coordinates
    const T  = { x: 300, y: 40 };   // CH4
    const BL = { x: 60,  y: 480 };  // C2H4
    const BR = { x: 540, y: 480 };  // C2H6

    // helper: ternary fractions -> pixel
    function toXY(f_ch4, f_c2h4, f_c2h6) {
      return {
        x: 300 * f_ch4 + 60 * f_c2h4 + 540 * f_c2h6,
        y: 40 * f_ch4 + 480 * f_c2h4 + 480 * f_c2h6
      };
    }

    // zone polygons
    const pdL = toXY(0.9, 0.1, 0); // left point of PD base
    const pdR = toXY(0.9, 0, 0.1); // right point of PD base
    const L1 = toXY(0, 0.8, 0.2);  // base point for T3/T2 boundary
    const L2 = toXY(0, 0.2, 0.8);  // base point for T2/T1 boundary

    const zones = [
      { code: "T3", points: [BL, L1, T], fill: "#ffc0c0", labelPos: { x: 180, y: 330 } },
      { code: "T2", points: [L1, L2, T], fill: "#c0e0c0", labelPos: { x: 300, y: 320 } },
      { code: "T1", points: [L2, BR, T], fill: "#fff0a0", labelPos: { x: 420, y: 330 } },
      { code: "PD", points: [T, pdL, pdR], fill: "#c0c0ff", labelPos: { x: 300, y: 75 } }
    ];

    // draw filled zones
    for (const zone of zones) {
      const pts = zone.points.map(p => `${p.x},${p.y}`).join(" ");
      svg.appendChild(el("polygon", {
        points: pts,
        fill: zone.fill,
        stroke: "#000",
        "stroke-width": 0.5
      }));
      svg.appendChild(el("text", {
        x: zone.labelPos.x,
        y: zone.labelPos.y,
        "font-size": 16,
        "font-weight": "bold",
        "text-anchor": "middle",
        fill: "#000",
        text: zone.code
      }));
    }

    // triangle outline
    const outline = `${T.x},${T.y} ${BL.x},${BL.y} ${BR.x},${BR.y} ${T.x},${T.y}`;
    svg.appendChild(el("polygon", {
      points: outline,
      fill: "none",
      stroke: "#000",
      "stroke-width": 1.5
    }));

    // vertex labels
    svg.appendChild(el("text", { x: 300, y: 25, "font-size": 15, "font-weight": "bold", "text-anchor": "middle", text: "CH4" }));
    svg.appendChild(el("text", { x: 40, y: 500, "font-size": 15, "font-weight": "bold", "text-anchor": "middle", text: "C2H4" }));
    svg.appendChild(el("text", { x: 560, y: 500, "font-size": 15, "font-weight": "bold", "text-anchor": "middle", text: "C2H6" }));

    // tick marks
    function drawTick(p, from, to, label, offset) {
      const v = {
        x: from.x + (to.x - from.x) * p,
        y: from.y + (to.y - from.y) * p
      };
      // small circle as tick mark
      svg.appendChild(el("circle", { cx: v.x, cy: v.y, r: 3, fill: "#000" }));
      if (label) {
        svg.appendChild(el("text", {
          x: v.x + offset.x,
          y: v.y + offset.y,
          "font-size": 10,
          "text-anchor": "middle",
          fill: "#000",
          text: label
        }));
      }
    }

    // ticks on left side (T-BL): labels for C2H4
    for (let p = 0.2; p <= 0.8; p += 0.2) {
      const pt = toXY(1 - p, p, 0);
      drawTick(p, T, BL, null, { x: -18, y: 5 });
      svg.appendChild(el("text", { x: pt.x - 20, y: pt.y + 4, "font-size": 10, "text-anchor": "end", text: Math.round(p * 100) }));
    }

    // ticks on right side (T-BR): labels for C2H6
    for (let p = 0.2; p <= 0.8; p += 0.2) {
      const pt = toXY(1 - p, 0, p);
      drawTick(p, T, BR, null, { x: 18, y: 5 });
      svg.appendChild(el("text", { x: pt.x + 20, y: pt.y + 4, "font-size": 10, "text-anchor": "start", text: Math.round(p * 100) }));
    }

    // ticks on base (BL-BR): labels for C2H4 on left half, C2H6 on right half
    for (let p = 0.2; p <= 0.8; p += 0.2) {
      const pt = toXY(0, p, 1 - p);
      drawTick(p, BL, BR, null, { x: 0, y: 15 });
      svg.appendChild(el("text", { x: pt.x, y: pt.y + 22, "font-size": 10, "text-anchor": "middle", text: Math.round(p * 100) }));
    }

    // sample point
    if (sample && typeof sample.ch4 === "number" && typeof sample.c2h4 === "number" && typeof sample.c2h6 === "number") {
      const s = sample.ch4 + sample.c2h4 + sample.c2h6;
      if (s > 0) {
        const f_ch4 = sample.ch4 / s;
        const f_c2h4 = sample.c2h4 / s;
        const f_c2h6 = sample.c2h6 / s;
        const sp = toXY(f_ch4, f_c2h4, f_c2h6);

        svg.appendChild(el("circle", {
          cx: sp.x,
          cy: sp.y,
          r: 5,
          fill: "#ff0000",
          stroke: "#000",
          "stroke-width": 1
        }));
        svg.appendChild(el("text", {
          x: sp.x,
          y: sp.y - 10,
          "font-size": 12,
          "font-weight": "bold",
          "text-anchor": "middle",
          fill: "#ff0000",
          text: "Sample"
        }));
      }
    }
  }
};
