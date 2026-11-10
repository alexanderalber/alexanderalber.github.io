const DuvalPentagon = (function () {
  const SVG_NS = "http://www.w3.org/2000/svg";

  // Geometry and zones (single source of truth for render + classify)
  function buildGeometry() {
    const w = 600, h = 600;
    const cx = w / 2, cy = h / 2;
    const R = 260; // outer radius to vertices
    const innerFrac = 0.45; // radius of inner pentagon as fraction of R
    const capEdgeFrac = 0.30; // how far along each edge the "cap" triangles extend

    // Gas order and angles (clockwise, H2 at top)
    const gases = ["H2", "CH4", "C2H6", "C2H4", "C2H2"];
    const angle0 = -Math.PI / 2; // -90 degrees for H2 (up)
    const vertices = [];
    for (let i = 0; i < 5; i++) {
      const theta = angle0 + i * (2 * Math.PI / 5);
      const x = cx + R * Math.cos(theta);
      const y = cy + R * Math.sin(theta);
      vertices.push({ x, y });
    }

    // Inner pentagon points
    const inner = vertices.map(v => ({
      x: cx + innerFrac * (v.x - cx),
      y: cy + innerFrac * (v.y - cy)
    }));

    // Helpers
    const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    const idx = (i) => (i + 5) % 5;

    // Build "cap" triangles (near selected vertices)
    // We include caps for H2 (PD), CH4 (T1), C2H4 (T3), C2H2 (D2)
    const caps = [];
    function capPolygon(i, code) {
      const a = vertices[i];
      const b = lerp(vertices[i], vertices[idx(i + 1)], capEdgeFrac);
      const c = lerp(vertices[i], vertices[idx(i - 1)], capEdgeFrac);
      caps.push({ code, poly: [a, b, c] });
    }
    capPolygon(0, "PD");  // H2
    capPolygon(1, "T1");  // CH4
    capPolygon(3, "T3");  // C2H4
    capPolygon(4, "D2");  // C2H2

    // Edge quadrilaterals between cap "ends" and inner pentagon
    // Q[i] corresponds to edge (i -> i+1) using symmetric points along that edge.
    const quads = [];
    for (let i = 0; i < 5; i++) {
      const a = lerp(vertices[i], vertices[idx(i + 1)], capEdgeFrac);
      const b = lerp(vertices[idx(i + 1)], vertices[i], capEdgeFrac);
      const c = inner[idx(i + 1)];
      const d = inner[i];
      quads.push({ poly: [a, b, c, d], edge: [i, idx(i + 1)] });
    }

    // Assign the edge quads to zones to fill all remaining area
    // Edge mapping (best recollection, approximate partitioning):
    // - edge H2-CH4 -> PD
    // - edge CH4-C2H6 -> T1
    // - edge C2H6-C2H4 -> T2
    // - edge C2H4-C2H2 -> T3
    // - edge C2H2-H2 -> D1
    const quadZones = [];
    for (let k = 0; k < quads.length; k++) {
      const [i0, i1] = quads[k].edge;
      let code = "T2"; // default mid-thermal
      if ((i0 === 0 && i1 === 1) || (i0 === 1 && i1 === 0)) code = "PD";
      else if ((i0 === 1 && i1 === 2) || (i0 === 2 && i1 === 1)) code = "T1";
      else if ((i0 === 2 && i1 === 3) || (i0 === 3 && i1 === 2)) code = "T2";
      else if ((i0 === 3 && i1 === 4) || (i0 === 4 && i1 === 3)) code = "T3";
      else if ((i0 === 4 && i1 === 0) || (i0 === 0 && i1 === 4)) code = "D1";
      quadZones.push({ code, poly: quads[k].poly });
    }

    // Central polygon -> T2
    const centerZone = { code: "T2", poly: inner };

    // Aggregate shapes; order matters for classification when on exact shared edges
    const shapes = [];
    // Prefer caps first (they represent strong "peaks")
    shapes.push(...caps);
    // Then edge zones
    shapes.push(...quadZones);
    // Finally center zone
    shapes.push(centerZone);

    // Axis unit vectors (for mapping composition to point)
    const unit = vertices.map(v => ({ x: v.x - cx, y: v.y - cy }));

    // Colors for zones (visually distinct)
    const zoneColors = {
      PD: "#2b8cbe",
      D1: "#984ea3",
      D2: "#e41a1c",
      T1: "#4daf4a",
      T2: "#ff7f00",
      T3: "#377eb8"
    };

    return {
      w, h, cx, cy, R,
      gases, vertices, inner, unit,
      shapes, zoneColors
    };
  }

  // Point-in-polygon with boundary-inclusive check
  function pointOnSegment(p, a, b, eps = 1e-6) {
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(cross) > eps) return false;
    const dot = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y);
    if (dot < -eps) return false;
    const len2 = (b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y);
    if (dot - len2 > eps) return false;
    return true;
  }

  function pointInPolygon(p, poly) {
    // Ray casting; inclusive of boundary
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[j], b = poly[i];
      if (pointOnSegment(p, a, b)) return true; // boundary is inside
      const xi = b.x, yi = b.y, xj = a.x, yj = a.y;
      const intersect = ((yi > p.y) !== (yj > p.y)) &&
                        (p.x < (xj - xi) * (p.y - yi) / (yj - yi + 0.0) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Map gas composition to 2D point in pentagon
  function compositionToPoint(h2, ch4, c2h6, c2h4, c2h2, geom) {
    const total = h2 + ch4 + c2h6 + c2h4 + c2h2;
    if (total <= 0) {
      return { x: geom.cx, y: geom.cy };
    }
    const p = [h2 / total, ch4 / total, c2h6 / total, c2h4 / total, c2h2 / total];
    let x = geom.cx, y = geom.cy;
    for (let i = 0; i < 5; i++) {
      x += p[i] * geom.unit[i].x;
      y += p[i] * geom.unit[i].y;
    }
    return { x, y };
  }

  // Fallback classifier (rule-of-thumb if for any reason point misses a polygon)
  function heuristicClassify(h2, ch4, c2h6, c2h4, c2h2) {
    const total = h2 + ch4 + c2h6 + c2h4 + c2h2;
    if (total <= 0) return "PD";
    const pH2 = (h2 / total) * 100;
    const pCH4 = (ch4 / total) * 100;
    const pC2H6 = (c2h6 / total) * 100;
    const pC2H4 = (c2h4 / total) * 100;
    const pC2H2 = (c2h2 / total) * 100;

    // PD: hydrogen dominant, very low acetylene and ethylene
    if (pH2 >= 30 && pC2H2 < 4 && pC2H4 < 10) return "PD";
    // D2: acetylene high and >= others
    if (pC2H2 >= 20 && pC2H2 >= pC2H4 && pC2H2 >= pCH4) return "D2";
    // T3: ethylene dominant, low acetylene
    if (pC2H4 >= 40 && pC2H2 < 10) return "T3";
    // T1: methane + ethane dominate, low ethylene and acetylene
    if ((pCH4 + pC2H6) >= 50 && pC2H4 < 20 && pC2H2 < 5) return "T1";
    // T2: mid ethylene, low acetylene
    if (pC2H4 >= 20 && pC2H4 < 40 && pC2H2 < 10) return "T2";
    // D1: some acetylene but not dominant, with hydrogen elevated
    if (pC2H2 >= 5 && pC2H2 < 20 && pC2H4 >= 10 && pH2 >= 15) return "D1";

    // Default by dominant gas axis
    const arr = [
      { code: "PD", v: pH2 },
      { code: "T1", v: pCH4 + pC2H6 * 0.7 },
      { code: "T1", v: pC2H6 },
      { code: "T3", v: pC2H4 },
      { code: "D2", v: pC2H2 }
    ];
    arr.sort((a, b) => b.v - a.v);
    // If acetylene present but not dominating, bias to D1
    if (pC2H2 >= 5 && arr[0].code !== "D2") return "D1";
    return arr[0].code;
  }

  function classify(h2, ch4, c2h6, c2h4, c2h2) {
    // Validate inputs (non-negative numbers)
    const vals = [h2, ch4, c2h6, c2h4, c2h2];
    for (let i = 0; i < vals.length; i++) {
      if (!(typeof vals[i] === "number") || !(vals[i] >= 0) || !isFinite(vals[i])) {
        throw new Error("All gas concentrations must be finite non-negative numbers.");
      }
    }
    const total = vals.reduce((a, b) => a + b, 0);
    if (total <= 0) throw new Error("Sum of gas concentrations must be greater than zero.");

    const geom = buildGeometry();
    const pt = compositionToPoint(h2, ch4, c2h6, c2h4, c2h2, geom);

    // Find which zone polygon contains the point
    for (let s of geom.shapes) {
      if (pointInPolygon(pt, s.poly)) {
        return s.code;
      }
    }

    // Fallback heuristic (should rarely trigger)
    return heuristicClassify(h2, ch4, c2h6, c2h4, c2h2);
  }

  function render(svg, sample) {
    if (!svg || !(svg instanceof SVGElement) || svg.tagName.toLowerCase() !== "svg") {
      throw new Error("render(svg, sample): svg must be an <svg> element.");
    }

    // Clear svg
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const geom = buildGeometry();

    // Background
    const bg = document.createElementNS(SVG_NS, "rect");
    bg.setAttribute("x", "0");
    bg.setAttribute("y", "0");
    bg.setAttribute("width", String(geom.w));
    bg.setAttribute("height", String(geom.h));
    bg.setAttribute("fill", "#ffffff");
    svg.appendChild(bg);

    // Group for zones
    const gZones = document.createElementNS(SVG_NS, "g");
    svg.appendChild(gZones);

    // Draw zones (filled)
    const zoneOrder = geom.shapes; // already ordered
    const zoneCenters = {};
    for (let z of zoneOrder) {
      const path = document.createElementNS(SVG_NS, "polygon");
      path.setAttribute("points", z.poly.map(p => `${p.x},${p.y}`).join(" "));
      const col = geom.zoneColors[z.code] || "#cccccc";
      path.setAttribute("fill", col);
      path.setAttribute("fill-opacity", "0.82");
      path.setAttribute("stroke", "#ffffff");
      path.setAttribute("stroke-width", "1");
      gZones.appendChild(path);

      // Store centroid for labels
      let cx = 0, cy = 0;
      for (let p of z.poly) { cx += p.x; cy += p.y; }
      cx /= z.poly.length; cy /= z.poly.length;
      if (!zoneCenters[z.code]) zoneCenters[z.code] = [];
      zoneCenters[z.code].push({ x: cx, y: cy });
    }

    // Outer pentagon outline
    const outline = document.createElementNS(SVG_NS, "polygon");
    outline.setAttribute("points", geom.vertices.map(p => `${p.x},${p.y}`).join(" "));
    outline.setAttribute("fill", "none");
    outline.setAttribute("stroke", "#222");
    outline.setAttribute("stroke-width", "2");
    svg.appendChild(outline);

    // Axes
    const gAxes = document.createElementNS(SVG_NS, "g");
    gAxes.setAttribute("stroke", "#666");
    gAxes.setAttribute("stroke-width", "1.2");
    svg.appendChild(gAxes);
    for (let i = 0; i < 5; i++) {
      const ax = document.createElementNS(SVG_NS, "line");
      ax.setAttribute("x1", String(geom.cx));
      ax.setAttribute("y1", String(geom.cy));
      ax.setAttribute("x2", String(geom.vertices[i].x));
      ax.setAttribute("y2", String(geom.vertices[i].y));
      ax.setAttribute("stroke", "#999");
      ax.setAttribute("stroke-dasharray", "3,4");
      gAxes.appendChild(ax);
    }

    // Gas axis labels near vertices
    const gLabels = document.createElementNS(SVG_NS, "g");
    svg.appendChild(gLabels);
    for (let i = 0; i < 5; i++) {
      const v = geom.vertices[i];
      const vx = v.x - geom.cx, vy = v.y - geom.cy;
      const L = Math.hypot(vx, vy);
      const ox = vx / (L || 1) * 18;
      const oy = vy / (L || 1) * 18;
      const tx = v.x + ox;
      const ty = v.y + oy;
      const t = document.createElementNS(SVG_NS, "text");
      t.setAttribute("x", String(tx));
      t.setAttribute("y", String(ty));
      t.setAttribute("font-family", "sans-serif");
      t.setAttribute("font-size", "14");
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("dominant-baseline", "middle");
      t.setAttribute("fill", "#111");
      t.textContent = geom.gases[i];
      gLabels.appendChild(t);
    }

    // Zone labels (codes)
    const gZoneLabels = document.createElementNS(SVG_NS, "g");
    svg.appendChild(gZoneLabels);
    const representativeCenter = (arr) => {
      // average of centroids for zone pieces
      let x = 0, y = 0;
      for (let p of arr) { x += p.x; y += p.y; }
      x /= arr.length; y /= arr.length;
      return { x, y };
    };
    const codes = ["PD", "D1", "D2", "T1", "T2", "T3"];
    for (let code of codes) {
      const arr = zoneCenters[code];
      if (!arr || arr.length === 0) continue;
      const c = representativeCenter(arr);
      const t = document.createElementNS(SVG_NS, "text");
      t.setAttribute("x", String(c.x));
      t.setAttribute("y", String(c.y));
      t.setAttribute("font-family", "sans-serif");
      t.setAttribute("font-weight", "bold");
      t.setAttribute("font-size", "16");
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("dominant-baseline", "middle");
      t.setAttribute("fill", "#000");
      t.textContent = code;
      gZoneLabels.appendChild(t);
    }

    // Optional sample point
    if (sample && typeof sample === "object") {
      const h2 = +sample.h2 || 0;
      const ch4 = +sample.ch4 || 0;
      const c2h6 = +sample.c2h6 || 0;
      const c2h4 = +sample.c2h4 || 0;
      const c2h2 = +sample.c2h2 || 0;
      const total = h2 + ch4 + c2h6 + c2h4 + c2h2;
      if (total > 0) {
        const pt = compositionToPoint(h2, ch4, c2h6, c2h4, c2h2, geom);

        // Mark
        const gMark = document.createElementNS(SVG_NS, "g");
        svg.appendChild(gMark);

        const mark = document.createElementNS(SVG_NS, "circle");
        mark.setAttribute("cx", String(pt.x));
        mark.setAttribute("cy", String(pt.y));
        mark.setAttribute("r", "5.5");
        mark.setAttribute("fill", "#000");
        mark.setAttribute("stroke", "#fff");
        mark.setAttribute("stroke-width", "2");
        gMark.appendChild(mark);

        const h1 = document.createElementNS(SVG_NS, "line");
        h1.setAttribute("x1", String(pt.x - 9));
        h1.setAttribute("y1", String(pt.y));
        h1.setAttribute("x2", String(pt.x + 9));
        h1.setAttribute("y2", String(pt.y));
        h1.setAttribute("stroke", "#000");
        h1.setAttribute("stroke-width", "1.5");
        gMark.appendChild(h1);

        const h2l = document.createElementNS(SVG_NS, "line");
        h2l.setAttribute("x1", String(pt.x));
        h2l.setAttribute("y1", String(pt.y - 9));
        h2l.setAttribute("x2", String(pt.x));
        h2l.setAttribute("y2", String(pt.y + 9));
        h2l.setAttribute("stroke", "#000");
        h2l.setAttribute("stroke-width", "1.5");
        gMark.appendChild(h2l);

        // Classification label near sample
        let cls = "N/A";
        try { cls = classify(h2, ch4, c2h6, c2h4, c2h2); } catch (e) { /* ignore */ }
        const lab = document.createElementNS(SVG_NS, "text");
        lab.setAttribute("x", String(pt.x + 12));
        lab.setAttribute("y", String(pt.y - 12));
        lab.setAttribute("font-family", "sans-serif");
        lab.setAttribute("font-size", "13");
        lab.setAttribute("fill", "#000");
        lab.textContent = `Sample: ${cls}`;
        svg.appendChild(lab);
      }
    }
  }

  return {
    classify,
    render
  };
})();
