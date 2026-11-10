const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const sum = ch4 + c2h4 + c2h6;
    const fCH4 = ch4 / sum;
    const fC2H4 = c2h4 / sum;
    const fC2H6 = c2h6 / sum;
    // Duval Triangle 5 for low-temperature faults (mineral oil)
    // Zones: S (stray gassing), PD (partial discharge), T1 (thermal <300°C), T2 (thermal 300-700°C)
    // Boundary lines: C2H4 = 2%, C2H4 = 15%, C2H6 = 30%
    if (fC2H4 <= 0.02) {
      if (fC2H6 >= 0.30) return "S";
      else return "PD";
    } else if (fC2H4 <= 0.15) {
      return "T1";
    } else {
      return "T2";
    }
  },

  render(svg, sample) {
    // --- triangle vertices ---
    const T = {x: 300, y: 64.3};   // 100% CH4
    const L = {x: 60, y: 480};     // 100% C2H6
    const R = {x: 540, y: 480};    // 100% C2H4

    // helper: create SVG element with attributes
    function el(tag, attrs) {
      const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
      for (let k in attrs) e.setAttribute(k, attrs[k]);
      return e;
    }

    // ---------- zone polygons ----------
    const zones = [
      { name: "S",  color: "#d9d9d9",
        pts: [ L, {x:69.6,y:480}, {x:232.8,y:197.324}, {x:228,y:189.01} ] },
      { name: "PD", color: "#ffff00",
        pts: [ T, {x:304.8,y:72.614}, {x:232.8,y:197.324}, {x:228,y:189.01} ] },
      { name: "T1", color: "#ff9900",
        pts: [ {x:69.6,y:480}, {x:132,y:480}, {x:336,y:126.655}, {x:304.8,y:72.614} ] },
      { name: "T2", color: "#ff0000",
        pts: [ {x:132,y:480}, R, {x:336,y:126.655} ] }
    ];

    zones.forEach(z => {
      const pts = z.pts.map(p => p.x + "," + p.y).join(" ");
      svg.appendChild(el("polygon", { points: pts, fill: z.color, stroke: "#000", "stroke-width": "1" }));
    });

    // triangle outline
    svg.appendChild(el("polygon", {
      points: `${T.x},${T.y} ${L.x},${L.y} ${R.x},${R.y}`,
      fill: "none", stroke: "#000", "stroke-width": "2"
    }));

    // zone labels at polygon centroids
    zones.forEach(z => {
      const n = z.pts.length;
      const cx = z.pts.reduce((s,p) => s + p.x, 0) / n;
      const cy = z.pts.reduce((s,p) => s + p.y, 0) / n;
      const txt = el("text", {
        x: cx, y: cy, "text-anchor": "middle", "dominant-baseline": "central",
        "font-size": "16", "font-weight": "bold", fill: "#000"
      });
      txt.appendChild(document.createTextNode(z.name));
      svg.appendChild(txt);
    });

    // ---------- axes ----------
    function ticks(A, B, fractions, label, dir) {
      const dx = B.x - A.x, dy = B.y - A.y;
      fractions.forEach(f => {
        const x = A.x + dx * f, y = A.y + dy * f;
        let tx, ty, ta;
        if (dir === "left")        { tx = x - 7; ty = y - 4; ta = "end"; }
        else if (dir === "right")  { tx = x + 7; ty = y - 4; ta = "start"; }
        else if (dir === "bottom") { tx = x; ty = y + 7; ta = "middle"; }
        svg.appendChild(el("line", { x1:x, y1:y, x2:tx, y2:ty, stroke:"#000", "stroke-width":"1" }));
        const t = el("text", { x: tx + (dir==="left"?-2:dir==="right"?2:0),
                               y: ty + (dir==="bottom"?5:0),
                               "text-anchor": ta, "dominant-baseline": "central",
                               "font-size": "10", fill: "#000" });
        t.appendChild(document.createTextNode(Math.round(f*100) + "%"));
        svg.appendChild(t);
      });

      const lp = el("text", { x: label.x, y: label.y, "text-anchor": "middle",
                              "font-size": "14", "font-weight": "bold", fill: "#000" });
      lp.appendChild(document.createTextNode(label.text));
      svg.appendChild(lp);
    }

    // left axis (C2H6)
    ticks(T, L, [0.2,0.4,0.6,0.8], {x:30, y:300, text:"C2H6"}, "left");
    // right axis (C2H4)
    ticks(T, R, [0.2,0.4,0.6,0.8], {x:570, y:300, text:"C2H4"}, "right");
    // CH4 axis (vertical altitude from base centre to top)
    const baseC = {x:300, y:480};
    [0.2,0.4,0.6,0.8].forEach(f => {
      const y = 480 - (480 - 64.3) * f;
      svg.appendChild(el("line", { x1:294, y1:y, x2:306, y2:y, stroke:"#000", "stroke-width":"1" }));
      const t = el("text", { x:312, y:y, "text-anchor":"start", "dominant-baseline":"central",
                             "font-size":"10", fill:"#000" });
      t.appendChild(document.createTextNode(Math.round(f*100) + "%"));
      svg.appendChild(t);
    });
    (() => { const t = el("text", { x:300, y:46, "text-anchor":"middle", "font-size":"14", "font-weight":"bold", fill:"#000" });
             t.appendChild(document.createTextNode("CH4")); svg.appendChild(t); })();

    // vertex labels
    [ {x:60, y:500, text:"C2H6", ta:"end"},
      {x:540, y:500, text:"C2H4", ta:"start"} ].forEach(v => {
        const t = el("text", { x:v.x, y:v.y, "text-anchor":v.ta, "font-size":"14", "font-weight":"bold", fill:"#000" });
        t.appendChild(document.createTextNode(v.text));
        svg.appendChild(t);
    });

    // ---------- sample point ----------
    if (sample) {
      const sum = sample.ch4 + sample.c2h4 + sample.c2h6;
      if (sum > 0) {
        const fCH4 = sample.ch4 / sum;
        const fC2H4 = sample.c2h4 / sum;
        const fC2H6 = sample.c2h6 / sum;
        const px = fCH4 * T.x + fC2H4 * R.x + fC2H6 * L.x;
        const py = fCH4 * T.y + fC2H4 * R.y + fC2H6 * L.y;
        svg.appendChild(el("circle", { cx:px, cy:py, r:5, fill:"blue", stroke:"#000", "stroke-width":"1.5" }));
      }
    }
  }
};
