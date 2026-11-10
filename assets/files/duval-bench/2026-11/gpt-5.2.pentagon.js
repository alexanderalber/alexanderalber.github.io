const DuvalPentagon = (() => {
  const NS = "http://www.w3.org/2000/svg";

  // Gas order used throughout:
  // 0 H2, 1 CH4, 2 C2H6, 3 C2H4, 4 C2H2
  const GAS_KEYS = ["h2", "ch4", "c2h6", "c2h4", "c2h2"];
  const GAS_LABELS = ["H₂", "CH₄", "C₂H₆", "C₂H₄", "C₂H₂"];

  function isFiniteNonNeg(x) {
    return typeof x === "number" && Number.isFinite(x) && x >= 0;
  }

  function toPcts(h2, ch4, c2h6, c2h4, c2h2) {
    const xs = [h2, ch4, c2h6, c2h4, c2h2];
    for (const v of xs) {
      if (!isFiniteNonNeg(v)) throw new Error("All gas inputs must be finite non-negative numbers.");
    }
    const sum = xs.reduce((a, b) => a + b, 0);
    if (!(sum > 0)) throw new Error("Sum of gases must be > 0.");
    return xs.map(v => (100 * v) / sum);
  }

  function makeVertices(cx, cy, r) {
    // Place H2 at the top, then clockwise.
    const verts = [];
    for (let i = 0; i < 5; i++) {
      const ang = (-90 + i * 72) * (Math.PI / 180);
      verts.push([cx + r * Math.cos(ang), cy + r * Math.sin(ang)]);
    }
    return verts;
  }

  function pctsToXY(pcts, verts) {
    // Convex combination of the 5 vertices.
    let x = 0, y = 0;
    for (let i = 0; i < 5; i++) {
      const w = (pcts[i] || 0) / 100;
      x += w * verts[i][0];
      y += w * verts[i][1];
    }
    return [x, y];
  }

  function pointInPoly(pt, poly) {
    // Ray casting; poly is array of [x,y].
    const [x, y] = pt;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1];
      const xj = poly[j][0], yj = poly[j][1];
      const intersect = ((yi > y) !== (yj > y)) &&
        (x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function centroid(poly) {
    // Simple average of vertices (adequate for labeling).
    let x = 0, y = 0;
    for (const p of poly) { x += p[0]; y += p[1]; }
    return [x / poly.length, y / poly.length];
  }

  function el(name, attrs) {
    const e = document.createElementNS(NS, name);
    if (attrs) {
      for (const k of Object.keys(attrs)) e.setAttribute(k, String(attrs[k]));
    }
    return e;
  }

  function clearSvg(svg) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
  }

  // Zone polygons (approximate, from memory).
  // Each point is [H2, CH4, C2H6, C2H4, C2H2] percentages summing to 100.
  // Note: Duval Pentagon 1 exact boundaries are standardized; these are best-effort recollections.
  const ZONES = [
    {
      code: "PD",
      label: "PD",
      fill: "#b3e5fc",
      stroke: "#0288d1",
      pts5: [
        [100, 0, 0, 0, 0],
        [80, 20, 0, 0, 0],
        [60, 25, 10, 5, 0],
        [60, 10, 0, 20, 10],
        [80, 0, 0, 10, 10]
      ]
    },
    {
      code: "S",
      label: "S",
      fill: "#e8f5e9",
      stroke: "#2e7d32",
      pts5: [
        [0, 100, 0, 0, 0],
        [10, 80, 10, 0, 0],
        [20, 60, 20, 0, 0],
        [20, 40, 40, 0, 0],
        [10, 50, 40, 0, 0],
        [0, 70, 30, 0, 0]
      ]
    },
    {
      code: "T1",
      label: "T1",
      fill: "#fff9c4",
      stroke: "#f9a825",
      pts5: [
        [0, 20, 80, 0, 0],
        [0, 0, 100, 0, 0],
        [10, 10, 70, 10, 0],
        [20, 10, 60, 10, 0],
        [20, 20, 50, 10, 0],
        [10, 30, 50, 10, 0]
      ]
    },
    {
      code: "T2",
      label: "T2",
      fill: "#ffe0b2",
      stroke: "#ef6c00",
      pts5: [
        [0, 0, 60, 40, 0],
        [0, 0, 30, 70, 0],
        [10, 10, 20, 60, 0],
        [20, 10, 20, 50, 0],
        [10, 0, 40, 50, 0],
        [0, 10, 50, 40, 0]
      ]
    },
    {
      code: "T3",
      label: "T3",
      fill: "#ffccbc",
      stroke: "#d84315",
      pts5: [
        [0, 0, 0, 100, 0],
        [0, 0, 20, 80, 0],
        [10, 0, 10, 80, 0],
        [20, 10, 0, 70, 0],
        [10, 20, 0, 70, 0],
        [0, 10, 0, 90, 0]
      ]
    },
    {
      code: "D1",
      label: "D1",
      fill: "#e1bee7",
      stroke: "#6a1b9a",
      pts5: [
        [50, 30, 0, 0, 20],
        [40, 40, 0, 0, 20],
        [30, 40, 0, 10, 20],
        [20, 40, 0, 20, 20],
        [20, 30, 0, 20, 30],
        [30, 20, 0, 10, 40],
        [40, 20, 0, 0, 40],
        [50, 20, 0, 0, 30]
      ]
    },
    {
      code: "DT",
      label: "DT",
      fill: "#d7ccc8",
      stroke: "#5d4037",
      pts5: [
        [0, 0, 0, 60, 40],
        [10, 0, 0, 50, 40],
        [20, 0, 0, 40, 40],
        [20, 10, 0, 40, 30],
        [10, 20, 0, 40, 30],
        [0, 10, 0, 50, 40]
      ]
    },
    {
      code: "D2",
      label: "D2",
      fill: "#ffcdd2",
      stroke: "#c62828",
      pts5: [
        [0, 0, 0, 0, 100],
        [10, 0, 0, 0, 90],
        [20, 0, 0, 10, 70],
        [20, 10, 0, 20, 50],
        [10, 20, 0, 10, 60],
        [0, 20, 0, 0, 80]
      ]
    }
  ];

  function buildZonePolys2D(verts) {
    return ZONES.map(z => {
      const poly2 = z.pts5.map(p5 => pctsToXY(p5, verts));
      return { ...z, poly2 };
    });
  }

  function classify(h2, ch4, c2h6, c2h4, c2h2) {
    const pcts = toPcts(h2, ch4, c2h6, c2h4, c2h2);

    // Use same geometry as render (viewBox 0..600).
    const cx = 300, cy = 300, r = 240;
    const verts = makeVertices(cx, cy, r);
    const pt = pctsToXY(pcts, verts);

    const zones2D = buildZonePolys2D(verts);

    // Priority: strong acetylene zones first, then mixed, then thermal, then stray, then PD.
    // (Best-effort ordering.)
    const order = ["D2", "DT", "D1", "T3", "T2", "T1", "S", "PD"];
    for (const code of order) {
      const z = zones2D.find(zz => zz.code === code);
      if (z && pointInPoly(pt, z.poly2)) return z.code;
    }

    // Fallback: choose the first zone that contains the point (in case of ordering changes),
    // otherwise unknown.
    for (const z of zones2D) {
      if (pointInPoly(pt, z.poly2)) return z.code;
    }
    return "UN";
  }

  function render(svg, sample) {
    if (!svg || typeof svg !== "object" || !svg.setAttribute) {
      throw new Error("render(svg, sample): svg must be an <svg> element.");
    }
    clearSvg(svg);

    // Geometry for viewBox 0 0 600 600
    const cx = 300, cy = 300, r = 240;
    const verts = makeVertices(cx, cy, r);
    const zones2D = buildZonePolys2D(verts);

    // Background (keep within svg only)
    svg.appendChild(el("rect", { x: 0, y: 0, width: 600, height: 600, fill: "#ffffff" }));

    const gAll = el("g");
    svg.appendChild(gAll);

    // Title
    gAll.appendChild(el("text", {
      x: 300, y: 28, "text-anchor": "middle",
      "font-size": 18, "font-family": "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
      fill: "#111"
    })).textContent = "Duval Pentagon 1 (DGA)";

    // Zones (filled)
    const gZones = el("g", { id: "zones" });
    gAll.appendChild(gZones);

    // Draw zones first so outlines/axes are on top
    for (const z of zones2D) {
      const d = z.poly2.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(2) + "," + p[1].toFixed(2)).join(" ") + " Z";
      const path = el("path", {
        d,
        fill: z.fill,
        "fill-opacity": 0.55,
        stroke: z.stroke,
        "stroke-width": 1.2
      });
      gZones.appendChild(path);

      // Label at centroid
      const [lx, ly] = centroid(z.poly2);
      const t = el("text", {
        x: lx, y: ly,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        "font-size": 16,
        "font-weight": 700,
        "font-family": "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
        fill: "#111"
      });
      t.textContent = z.label;
      gZones.appendChild(t);
    }

    // Outer pentagon outline
    const outlinePts = verts.map(p => p[0].toFixed(2) + "," + p[1].toFixed(2)).join(" ");
    gAll.appendChild(el("polygon", {
      points: outlinePts,
      fill: "none",
      stroke: "#111",
      "stroke-width": 2
    }));

    // Center point
    gAll.appendChild(el("circle", { cx, cy, r: 2.5, fill: "#111" }));

    // Axes and gas labels
    const gAxes = el("g", { id: "axes" });
    gAll.appendChild(gAxes);

    for (let i = 0; i < 5; i++) {
      const [vx, vy] = verts[i];
      gAxes.appendChild(el("line", {
        x1: cx, y1: cy, x2: vx, y2: vy,
        stroke: "#333",
        "stroke-width": 1.5
      }));

      // Label slightly outside vertex
      const dx = vx - cx, dy = vy - cy;
      const len = Math.hypot(dx, dy) || 1;
      const lx = vx + (dx / len) * 22;
      const ly = vy + (dy / len) * 22;

      // Anchor based on direction
      let anchor = "middle";
      if (Math.abs(dx) > 0.45 * len) anchor = dx > 0 ? "start" : "end";

      const lab = el("text", {
        x: lx, y: ly,
        "text-anchor": anchor,
        "dominant-baseline": "middle",
        "font-size": 16,
        "font-weight": 600,
        "font-family": "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
        fill: "#111"
      });
      lab.textContent = GAS_LABELS[i];
      gAxes.appendChild(lab);
    }

    // Sample point
    if (sample != null) {
      const vals = GAS_KEYS.map(k => sample[k]);
      for (const v of vals) {
        if (!isFiniteNonNeg(v)) throw new Error("Sample gases must be finite non-negative numbers.");
      }
      const pcts = toPcts(sample.h2, sample.ch4, sample.c2h6, sample.c2h4, sample.c2h2);
      const pt = pctsToXY(pcts, verts);
      const code = classify(sample.h2, sample.ch4, sample.c2h6, sample.c2h4, sample.c2h2);

      const gSample = el("g", { id: "sample" });
      gAll.appendChild(gSample);

      // Halo
      gSample.appendChild(el("circle", { cx: pt[0], cy: pt[1], r: 9, fill: "#000", "fill-opacity": 0.10 }));
      // Point
      gSample.appendChild(el("circle", { cx: pt[0], cy: pt[1], r: 5.2, fill: "#000" }));
      // Label
      const t = el("text", {
        x: pt[0] + 10, y: pt[1] - 10,
        "text-anchor": "start",
        "dominant-baseline": "alphabetic",
        "font-size": 14,
        "font-weight": 700,
        "font-family": "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
        fill: "#000",
        stroke: "#fff",
        "stroke-width": 3,
        "paint-order": "stroke"
      });
      t.textContent = code;
      gSample.appendChild(t);
    }

    // Small legend note (kept within svg only)
    const note = el("text", {
      x: 300, y: 590, "text-anchor": "middle",
      "font-size": 12,
      "font-family": "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
      fill: "#444"
    });
    note.textContent = "Zones/boundaries are best-effort (memory-based) approximations of Duval Pentagon 1.";
    gAll.appendChild(note);
  }

  return { classify, render };
})();
