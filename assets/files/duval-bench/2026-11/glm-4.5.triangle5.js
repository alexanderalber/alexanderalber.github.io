const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const total = ch4 + c2h4 + c2h6;
    if (total <= 0) return null;
    const b = c2h4 / total;
    const c = c2h6 / total;
    if (b >= 0.50) return "T3";
    if (c > 0.50) return "C";
    if (b < 0.04) return "T1";
    return "T2";
  },

  render(svg, sample) {
    const NS = "http://www.w3.org/2000/svg";
    const BL = [60, 480], BR = [540, 480], TP = [300, 60];

    function toXY(b, c) {
      return [
        BL[0] + (BR[0] - BL[0]) * b + (TP[0] - BL[0]) * c,
        BL[1] + (BR[1] - BL[1]) * b + (TP[1] - BL[1]) * c
      ];
    }

    function el(tag, attrs) {
      const e = document.createElementNS(NS, tag);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      return e;
    }

    function txt(x, y, str, color, size, anchor, weight, family) {
      const t = el("text", {
        x: x, y: y,
        "text-anchor": anchor || "middle",
        "dominant-baseline": "middle",
        fill: color || "#333",
        "font-size": size || 12,
        "font-weight": weight || "normal",
        "font-family": family || "sans-serif"
      });
      t.textContent = str;
      svg.appendChild(t);
      return t;
    }

    // Boundary points
    const c50L = toXY(0, 0.50);
    const c50R = toXY(0.50, 0.50);
    const b04B = toXY(0.04, 0);
    const b04R = toXY(0.04, 0.96);
    const b04c50 = toXY(0.04, 0.50);
    const b50B = toXY(0.50, 0);
    const b50R = toXY(0.50, 0.50);

    // Zone fills
    svg.appendChild(el("polygon", {
      points: c50L.join(",") + " " + TP.join(",") + " " + c50R.join(","),
      fill: "#FFF8DC"
    }));
    svg.appendChild(el("polygon", {
      points: BL.join(",") + " " + b04B.join(",") + " " + b04c50.join(",") + " " + c50L.join(","),
      fill: "#E8F0FF"
    }));
    svg.appendChild(el("polygon", {
      points: b04B.join(",") + " " + b50B.join(",") + " " + b50R.join(",") + " " + b04c50.join(","),
      fill: "#FFF0E0"
    }));
    svg.appendChild(el("polygon", {
      points: b50B.join(",") + " " + BR.join(",") + " " + b50R.join(","),
      fill: "#FFE0E0"
    }));

    // Boundary lines
    svg.appendChild(el("line", {
      x1: c50L[0], y1: c50L[1], x2: c50R[0], y2: c50R[1],
      stroke: "#999", "stroke-width": 1, "stroke-dasharray": "5,3"
    }));
    svg.appendChild(el("line", {
      x1: b04B[0], y1: b04B[1], x2: b04R[0], y2: b04R[1],
      stroke: "#999", "stroke-width": 1, "stroke-dasharray": "5,3"
    }));
    svg.appendChild(el("line", {
      x1: b50B[0], y1: b50B[1], x2: b50R[0], y2: b50R[1],
      stroke: "#999", "stroke-width": 1, "stroke-dasharray": "5,3"
    }));

    // Triangle outline
    svg.appendChild(el("polygon", {
      points: BL.join(",") + " " + BR.join(",") + " " + TP.join(","),
      fill: "none", stroke: "#333", "stroke-width": 2
    }));

    // Zone labels
    function zoneLabel(code, desc, x, y, color, sz) {
      txt(x, y, code, color, sz, "middle", "bold");
      txt(x, y + sz * 0.75, desc, color, sz * 0.5, "middle", "normal");
    }
    zoneLabel("C", "Stray gassing", 300, 185, "#996600", 24);
    zoneLabel("T1", "< 300°C", 130, 385, "#336699", 15);
    zoneLabel("T2", "300–700°C", 250, 385, "#CC6600", 22);
    zoneLabel("T3", "> 700°C", 420, 410, "#CC0000", 22);

    // Tick marks
    const ln = [-0.868, -0.496];
    const rn = [0.868, -0.496];

    for (let pct = 0; pct <= 100; pct += 20) {
      // Left: %C2H6
      var lp = toXY(0, pct / 100);
      var le = [lp[0] + 8 * ln[0], lp[1] + 8 * ln[1]];
      svg.appendChild(el("line", {
        x1: lp[0], y1: lp[1], x2: le[0], y2: le[1], stroke: "#333", "stroke-width": 1
      }));
      txt(le[0] + 5 * ln[0], le[1] + 5 * ln[1], pct + "%", "#333", 10, "end");

      // Right: %C2H4
      var rp = toXY(pct / 100, 1 - pct / 100);
      var re = [rp[0] + 8 * rn[0], rp[1] + 8 * rn[1]];
      svg.appendChild(el("line", {
        x1: rp[0], y1: rp[1], x2: re[0], y2: re[1], stroke: "#333", "stroke-width": 1
      }));
      txt(re[0] + 5 * rn[0], re[1] + 5 * rn[1], pct + "%", "#333", 10, "start");

      // Bottom: %CH4
      var bp = toXY(1 - pct / 100, 0);
      svg.appendChild(el("line", {
        x1: bp[0], y1: bp[1], x2: bp[0], y2: bp[1] + 8, stroke: "#333", "stroke-width": 1
      }));
      txt(bp[0], bp[1] + 20, pct + "%", "#333", 10, "middle");
    }

    // Axis labels
    var la = txt(15, 270, "C₂H₆ (%)", "#333", 14, "middle", "bold");
    la.setAttribute("transform", "rotate(-90,15,270)");
    var ra = txt(585, 270, "C₂H₄ (%)", "#333", 14, "middle", "bold");
    ra.setAttribute("transform", "rotate(90,585,270)");
    txt(300, 525, "CH₄ (%)", "#333", 14, "middle", "bold");

    // Title
    txt(300, 28, "Duval Triangle 5", "#333", 16, "middle", "bold");

    // Sample point
    if (sample) {
      var tot = sample.ch4 + sample.c2h4 + sample.c2h6;
      if (tot > 0) {
        var sb = sample.c2h4 / tot;
        var sc = sample.c2h6 / tot;
        var sp = toXY(sb, sc);
        svg.appendChild(el("circle", {
          cx: sp[0], cy: sp[1], r: 7, fill: "#FF0000", stroke: "#000", "stroke-width": 2
        }));
        var zone = this.classify(sample.ch4, sample.c2h4, sample.c2h6);
        txt(sp[0] + 12, sp[1] - 10, zone, "#CC0000", 13, "start", "bold");
      }
    }
  }
};
