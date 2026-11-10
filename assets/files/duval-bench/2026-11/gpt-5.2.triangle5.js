const DuvalTriangle5 = (() => {
  const NS = "http://www.w3.org/2000/svg";

  function el(name, attrs) {
    const e = document.createElementNS(NS, name);
    if (attrs) {
      for (const k of Object.keys(attrs)) e.setAttribute(k, String(attrs[k]));
    }
    return e;
  }

  function clear(svg) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
  }

  function assertGas(x, name) {
    if (typeof x !== "number" || !Number.isFinite(x) || x < 0) {
      throw new Error(`${name} must be a non-negative finite number (ppm).`);
    }
  }

  function toPct(ch4, c2h4, c2h6) {
    assertGas(ch4, "ch4");
    assertGas(c2h4, "c2h4");
    assertGas(c2h6, "c2h6");
    const sum = ch4 + c2h4 + c2h6;
    if (!(sum > 0)) throw new Error("Sum of gases must be > 0.");
    return {
      ch4: (100 * ch4) / sum,
      c2h4: (100 * c2h4) / sum,
      c2h6: (100 * c2h6) / sum,
      sum
    };
  }

  function makeGeometry() {
    // Fit an equilateral triangle inside viewBox 0 0 600 540.
    const marginX = 40;
    const baseY = 500;
    const side = 520;
    const height = (side * Math.sqrt(3)) / 2;

    const A = { x: marginX, y: baseY }; // CH4 vertex
    const B = { x: marginX + side, y: baseY }; // C2H4 vertex
    const C = { x: marginX + side / 2, y: baseY - height }; // C2H6 vertex

    return { A, B, C, side, height };
  }

  function ternaryToXY(pct, geom) {
    // pct: {ch4,c2h4,c2h6} in percent summing ~100
    const w1 = pct.ch4 / 100;
    const w2 = pct.c2h4 / 100;
    const w3 = pct.c2h6 / 100;
    const { A, B, C } = geom;
    return {
      x: w1 * A.x + w2 * B.x + w3 * C.x,
      y: w1 * A.y + w2 * B.y + w3 * C.y
    };
  }

  function pctPoint(ch4Pct, c2h4Pct, c2h6Pct, geom) {
    return ternaryToXY({ ch4: ch4Pct, c2h4: c2h4Pct, c2h6: c2h6Pct }, geom);
  }

  function pointsAttr(pts) {
    return pts.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  }

  function centroid(pts) {
    // Simple polygon centroid (non-self-intersecting).
    // Falls back to average if area is tiny.
    let a = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      const cross = p.x * q.y - q.x * p.y;
      a += cross;
      cx += (p.x + q.x) * cross;
      cy += (p.y + q.y) * cross;
    }
    a *= 0.5;
    if (Math.abs(a) < 1e-6) {
      const n = pts.length;
      return {
        x: pts.reduce((s, p) => s + p.x, 0) / n,
        y: pts.reduce((s, p) => s + p.y, 0) / n
      };
    }
    return { x: cx / (6 * a), y: cy / (6 * a) };
  }

  function outwardUnitNormal(p1, p2, insidePoint) {
    // Returns a unit vector normal to edge p1->p2 pointing outward from the triangle.
    const vx = p2.x - p1.x;
    const vy = p2.y - p1.y;
    // Candidate normal (left-hand)
    let nx = -vy;
    let ny = vx;

    // Determine which direction points outward:
    // If normal points toward insidePoint (dot > 0), flip it.
    const mx = (p1.x + p2.x) / 2;
    const my = (p1.y + p2.y) / 2;
    const ix = insidePoint.x - mx;
    const iy = insidePoint.y - my;
    const dot = nx * ix + ny * iy;
    if (dot > 0) {
      nx = -nx;
      ny = -ny;
    }
    const len = Math.hypot(nx, ny) || 1;
    return { x: nx / len, y: ny / len };
  }

  // --- Duval Triangle 5 zones (best recollection; simple straight-line partition) ---
  // Vertices: CH4 (A), C2H4 (B), C2H6 (C).
  // Partition by these constant-percentage lines:
  //   - C2H4 = 40%  => zone T2 on the C2H4-rich side
  //   - C2H6 = 60%  => zone S near the C2H6 vertex (low-temp "stray gassing" area)
  //   - CH4  = 60%  => zone O near the CH4 vertex (overheating/other low-temp thermal)
  // Remaining central quadrilateral => T1.
  function classify(ch4, c2h4, c2h6) {
    const p = toPct(ch4, c2h4, c2h6);
    const eps = 1e-9;

    if (p.c2h4 >= 40 - eps) return "T2";
    if (p.c2h6 >= 60 - eps) return "S";
    if (p.ch4 >= 60 - eps) return "O";
    return "T1";
  }

  function render(svg, sample) {
    if (!svg || svg.namespaceURI !== NS) {
      throw new Error("render(svg, sample): svg must be an <svg> element.");
    }

    clear(svg);

    const geom = makeGeometry();
    const { A, B, C } = geom;

    // Background group
    const g = el("g", { "font-family": "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" });
    svg.appendChild(g);

    // Define zones as ternary percent polygons.
    const P1 = pctPoint(60, 40, 0, geom);   // CH4=60, C2H4=40, C2H6=0
    const P2 = pctPoint(0, 40, 60, geom);   // CH4=0, C2H4=40, C2H6=60
    const P3 = pctPoint(40, 0, 60, geom);   // CH4=40, C2H4=0,  C2H6=60
    const P4 = pctPoint(60, 0, 40, geom);   // CH4=60, C2H4=0,  C2H6=40

    const zones = [
      { code: "S",  color: "#bfe7c6", pts: [C, P2, P3] },
      { code: "O",  color: "#ffd3a6", pts: [A, P4, P1] },
      { code: "T1", color: "#cfe0ff", pts: [P1, P4, P3, P2] },
      { code: "T2", color: "#ffc0c0", pts: [B, P1, P2] }
    ];

    // Draw filled zones
    const gZones = el("g");
    g.appendChild(gZones);

    for (const z of zones) {
      const poly = el("polygon", {
        points: pointsAttr(z.pts),
        fill: z.color,
        stroke: "#2b2b2b",
        "stroke-width": 1,
        "fill-opacity": 0.9
      });
      gZones.appendChild(poly);

      const ctd = centroid(z.pts);
      const label = el("text", {
        x: ctd.x,
        y: ctd.y,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        "font-size": 20,
        "font-weight": 700,
        fill: "#1a1a1a"
      });
      label.textContent = z.code;
      gZones.appendChild(label);
    }

    // Outer triangle border (emphasize)
    g.appendChild(
      el("polygon", {
        points: pointsAttr([A, B, C]),
        fill: "none",
        stroke: "#111",
        "stroke-width": 2
      })
    );

    // Internal boundaries for clarity: CH4=60 (P4-P1) and C2H4=40 (P1-P2) and C2H6=60 (P2-P3)
    const gBound = el("g", { stroke: "#333", "stroke-width": 1.5 });
    g.appendChild(gBound);
    gBound.appendChild(el("line", { x1: P4.x, y1: P4.y, x2: P1.x, y2: P1.y }));
    gBound.appendChild(el("line", { x1: P1.x, y1: P1.y, x2: P2.x, y2: P2.y }));
    gBound.appendChild(el("line", { x1: P2.x, y1: P2.y, x2: P3.x, y2: P3.y }));

    // Axes/ticks along edges
    const gAxes = el("g", { stroke: "#111", "stroke-width": 1, fill: "none" });
    g.appendChild(gAxes);

    const inside = centroid([A, B, C]);

    function drawEdgeTicks(p1, p2, insidePoint, valueAtP1 /* percent */, labelEvery) {
      const n = outwardUnitNormal(p1, p2, insidePoint);
      const tickLen = 6;
      const labelOff = 18;

      // Edge line (already drawn by border, but keep for tick group consistency)
      gAxes.appendChild(el("line", { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }));

      for (let k = 1; k <= 9; k++) {
        const t = k / 10; // from p1->p2
        const x = p1.x + (p2.x - p1.x) * t;
        const y = p1.y + (p2.y - p1.y) * t;

        gAxes.appendChild(
          el("line", {
            x1: x,
            y1: y,
            x2: x + n.x * tickLen,
            y2: y + n.y * tickLen
          })
        );

        const value = Math.round((1 - t) * valueAtP1); // 90..10 if valueAtP1=100
        if (value % labelEvery === 0) {
          const tx = x + n.x * labelOff;
          const ty = y + n.y * labelOff;
          const text = el("text", {
            x: tx,
            y: ty,
            "text-anchor": "middle",
            "dominant-baseline": "middle",
            "font-size": 12,
            fill: "#111",
            stroke: "none"
          });
          text.textContent = String(value);
          g.appendChild(text);
        }
      }
    }

    // Edge AB: label CH4% decreasing from A(100) to B(0)
    drawEdgeTicks(A, B, inside, 100, 20);
    // Edge B->C: label C2H4% decreasing from B(100) to C(0)
    drawEdgeTicks(B, C, inside, 100, 20);
    // Edge C->A: label C2H6% decreasing from C(100) to A(0)
    drawEdgeTicks(C, A, inside, 100, 20);

    // Gas names near vertices
    const gNames = el("g", { fill: "#111", stroke: "none", "font-size": 18, "font-weight": 700 });
    g.appendChild(gNames);

    function labelNearVertex(pt, dx, dy, textStr, anchor) {
      const t = el("text", {
        x: pt.x + dx,
        y: pt.y + dy,
        "text-anchor": anchor || "middle",
        "dominant-baseline": "middle"
      });
      t.textContent = textStr;
      gNames.appendChild(t);
    }

    labelNearVertex(A, -6, 22, "CH₄", "start");
    labelNearVertex(B, 6, 22, "C₂H₄", "end");
    labelNearVertex(C, 0, -18, "C₂H₆", "middle");

    // Title (small)
    const title = el("text", {
      x: 300,
      y: 22,
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      "font-size": 16,
      "font-weight": 700,
      fill: "#111"
    });
    title.textContent = "Duval Triangle 5 (CH₄ / C₂H₄ / C₂H₆)";
    g.appendChild(title);

    // Sample point
    if (sample != null) {
      const p = toPct(sample.ch4, sample.c2h4, sample.c2h6);
      const pt = ternaryToXY(p, geom);
      const code = classify(sample.ch4, sample.c2h4, sample.c2h6);

      const gPt = el("g");
      g.appendChild(gPt);

      gPt.appendChild(
        el("circle", {
          cx: pt.x,
          cy: pt.y,
          r: 6,
          fill: "#000",
          "fill-opacity": 0.85,
          stroke: "#fff",
          "stroke-width": 2
        })
      );

      // Crosshair
      gPt.appendChild(el("line", { x1: pt.x - 10, y1: pt.y, x2: pt.x + 10, y2: pt.y, stroke: "#000", "stroke-width": 1 }));
      gPt.appendChild(el("line", { x1: pt.x, y1: pt.y - 10, x2: pt.x, y2: pt.y + 10, stroke: "#000", "stroke-width": 1 }));

      const tag = el("text", {
        x: pt.x + 10,
        y: pt.y - 12,
        "text-anchor": "start",
        "dominant-baseline": "alphabetic",
        "font-size": 14,
        "font-weight": 700,
        fill: "#000"
      });
      tag.textContent = code;
      gPt.appendChild(tag);
    }
  }

  return { classify, render };
})();
