const DuvalTriangle = (() => {
  // Plain browser JavaScript (no modules/imports). One global: DuvalTriangle.
  // Implements an approximate Duval Triangle 1 (CH4, C2H4, C2H2).
  // Zones: PD, D1, D2, T1, T2, T3
  // Geometry and classification are self-consistent (classify uses same polygons as render).

  const NS = "http://www.w3.org/2000/svg";

  // Triangle frame (viewBox 0 0 600 540)
  const VBX = 600, VBY = 540;
  const baseY = 500;
  const leftX = 40;
  const side = 520;
  const rightX = leftX + side;
  const apexX = leftX + side / 2;
  const height = Math.sqrt(3) * side / 2;
  const apexY = baseY - height;

  // Main vertices: A=CH4 (bottom-left), B=C2H4 (bottom-right), C=C2H2 (top)
  const V_A = { x: leftX, y: baseY };          // CH4 = 100%
  const V_B = { x: rightX, y: baseY };         // C2H4 = 100%
  const V_C = { x: apexX, y: apexY };          // C2H2 = 100%

  // Helpers: linear interpolation and vector ops
  function lerp(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
  function add(p, q) { return { x: p.x + q.x, y: p.y + q.y }; }
  function sub(p, q) { return { x: p.x - q.x, y: p.y - q.y }; }
  function mul(p, s) { return { x: p.x * s, y: p.y * s }; }
  function dot(a, b) { return a.x * b.x + a.y * b.y; }
  function len(p) { return Math.hypot(p.x, p.y); }
  function norm(p) { const L = len(p) || 1; return { x: p.x / L, y: p.y / L }; }

  // Convert ternary fractions to XY in our frame
  function baryToXY(fracCH4, fracC2H4, fracC2H2) {
    return {
      x: fracCH4 * V_A.x + fracC2H4 * V_B.x + fracC2H2 * V_C.x,
      y: fracCH4 * V_A.y + fracC2H4 * V_B.y + fracC2H2 * V_C.y
    };
  }

  // Given barycentric point defined on edge segments
  function edgePoint(edge, t) {
    // edge: "AB","AC","BC"
    if (edge === "AB") return lerp(V_A, V_B, t);
    if (edge === "AC") return lerp(V_A, V_C, t);
    if (edge === "BC") return lerp(V_B, V_C, t);
    throw new Error("Invalid edge");
  }

  // Intersection of segments p1-p2 and p3-p4
  function intersect(p1, p2, p3, p4) {
    const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
    const x3 = p3.x, y3 = p3.y, x4 = p4.x, y4 = p4.y;
    const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(den) < 1e-9) return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
    const pre = (x1 * y2 - y1 * x2);
    const post = (x3 * y4 - y3 * x4);
    const x = (pre * (x3 - x4) - (x1 - x2) * post) / den;
    const y = (pre * (y3 - y4) - (y1 - y2) * post) / den;
    return { x, y };
  }

  // Point in polygon (inclusive edges), ray casting
  function pointInPolygon(pt, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      // Check if on edge
      const v = sub(poly[i], poly[j]);
      const w = sub(pt, poly[j]);
      const cross = v.x * w.y - v.y * w.x;
      if (Math.abs(cross) < 1e-9) {
        // Colinear; check projection within segment
        const d = dot(w, v) / (dot(v, v) || 1);
        if (d >= -1e-9 && d <= 1 + 1e-9) return true;
      }
      const intersectY = ((yi > pt.y) !== (yj > pt.y));
      if (intersectY) {
        const xint = xi + (pt.y - yi) * (xj - xi) / ((yj - yi) || 1e-12);
        if (xint >= pt.x - 1e-12) inside = !inside;
      }
    }
    return inside;
  }

  // Build zone polygons geometry (XY) that both render() and classify() will use
  function buildZones() {
    // Key points at 15/30/60% along edges as simple, memorable anchors
    const ab15 = edgePoint("AB", 0.15);
    const ab30 = edgePoint("AB", 0.30);
    const ab60 = edgePoint("AB", 0.60);

    const ac15 = edgePoint("AC", 0.15);
    const ac35 = edgePoint("AC", 0.35);
    const ac60 = edgePoint("AC", 0.60);

    const bc35 = edgePoint("BC", 0.35);

    // Internal lines
    const L_d2_a = ac60, L_d2_b = bc35; // bottom of D2
    const L_t1_a = ac35, L_t1_b = ab30; // top of T1
    const L_t3_a = ab60, L_t3_b = bc35; // left boundary of T3

    // Intersection between D2 bottom (ac60-bc35) and T1 top (ac35-ab30)
    const I1 = intersect(ac60, bc35, ac35, ab30);

    // Polygons (clockwise or counter)
    const PD = [V_A, ab15, ac15];

    // T1: trapezoid under L_t1 and above PD along left-bottom
    const T1 = [ab15, ab30, ac35, ac15];

    // D1: between L_t1 and L_d2 on the left-mid
    const D1 = [ac35, ac60, I1, ab30];

    // T2: central-right polygon between T1 (below), D2 (above), and T3 (right)
    const T2 = [ab30, ab60, bc35, I1, ac35];

    // T3: right triangle towards C2H4 corner
    const T3 = [V_B, ab60, bc35];

    // D2: upper triangle towards C2H2 corner
    const D2 = [V_C, ac60, bc35];

    const zones = [
      { code: "PD", poly: PD, fill: "#cdb4db" },
      { code: "D1", poly: D1, fill: "#f4a261" },
      { code: "D2", poly: D2, fill: "#e63946" },
      { code: "T1", poly: T1, fill: "#90caf9" },
      { code: "T2", poly: T2, fill: "#42a5f5" },
      { code: "T3", poly: T3, fill: "#1565c0" }
    ];
    return { zones, points: { ab15, ab30, ab60, ac15, ac35, ac60, bc35, I1 } };
  }

  // Compute polygon centroid (area-weighted)
  function polygonCentroid(poly) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const p = poly[j], q = poly[i];
      const f = p.x * q.y - q.x * p.y;
      a += f;
      cx += (p.x + q.x) * f;
      cy += (p.y + q.y) * f;
    }
    a = a / 2;
    if (Math.abs(a) < 1e-9) {
      // fallback: average of vertices
      let sx = 0, sy = 0;
      for (const p of poly) { sx += p.x; sy += p.y; }
      return { x: sx / poly.length, y: sy / poly.length };
    }
    return { x: cx / (6 * a), y: cy / (6 * a) };
  }

  // Axis ticks along an edge for a gas; returns [{p, dir, value}]
  function buildAxisTicks(edge, nTicks, outwardFrom) {
    const A = outwardFrom.a, B = outwardFrom.b, C = outwardFrom.c; // triangle vertices
    let e0, e1;
    if (edge === "AB") { e0 = V_A; e1 = V_B; }
    else if (edge === "AC") { e0 = V_A; e1 = V_C; }
    else if (edge === "BC") { e0 = V_B; e1 = V_C; }
    else throw new Error("edge?");

    const center = { x: (A.x + B.x + C.x) / 3, y: (A.y + B.y + C.y) / 3 };
    const ticks = [];
    for (let i = 1; i < nTicks; i++) {
      const t = i / nTicks; // 0..1
      const p = lerp(e0, e1, t);
      // outward normal (choose perpendicular that increases distance from centroid)
      const tang = sub(e1, e0);
      const perp1 = norm({ x: -tang.y, y: tang.x });
      const perp2 = { x: -perp1.x, y: -perp1.y };
      const test1 = add(p, mul(perp1, 5));
      const test2 = add(p, mul(perp2, 5));
      const d1 = len(sub(test1, center));
      const d2 = len(sub(test2, center));
      const dir = d1 > d2 ? perp1 : perp2; // farther from center = outward
      ticks.push({ p, dir, value: i * 10 });
    }
    return ticks;
  }

  // Draw text
  function svgText(svg, txt, x, y, opts = {}) {
    const t = document.createElementNS(NS, "text");
    t.setAttribute("x", x);
    t.setAttribute("y", y);
    if (opts.fill) t.setAttribute("fill", opts.fill);
    if (opts.size) t.setAttribute("font-size", opts.size);
    if (opts.weight) t.setAttribute("font-weight", opts.weight);
    if (opts.anchor) t.setAttribute("text-anchor", opts.anchor);
    if (opts.align) t.setAttribute("dominant-baseline", opts.align);
    if (opts.rotate) t.setAttribute("transform", `rotate(${opts.rotate} ${x} ${y})`);
    t.textContent = txt;
    svg.appendChild(t);
    return t;
  }

  // Public API
  function classify(ch4, c2h4, c2h2) {
    const a = Number(ch4), b = Number(c2h4), c = Number(c2h2);
    if (!isFinite(a) || !isFinite(b) || !isFinite(c) || a < 0 || b < 0 || c < 0) {
      throw new Error("Invalid input: non-negative finite numbers required");
    }
    const s = a + b + c;
    if (s <= 0) throw new Error("Invalid input: sum must be > 0");
    const fCH4 = a / s, fC2H4 = b / s, fC2H2 = c / s;
    const pt = baryToXY(fCH4, fC2H4, fC2H2);
    const { zones } = buildZones();

    // Severity priority: D2 > D1 > T3 > T2 > T1 > PD
    const order = ["D2", "D1", "T3", "T2", "T1", "PD"];
    let found = null;
    // Map codes to polys for ordered test
    const map = {};
    for (const z of zones) map[z.code] = z.poly;

    for (const code of order) {
      const poly = map[code];
      if (poly && pointInPolygon(pt, poly)) { found = code; break; }
    }
    if (found) return found;

    // Fallback: nearest polygon centroid
    let best = null, bestD = Infinity;
    for (const z of zones) {
      const ctd = polygonCentroid(z.poly);
      const d = len(sub(pt, ctd));
      if (d < bestD) { bestD = d; best = z.code; }
    }
    return best || "PD";
  }

  function render(svg, sample) {
    if (!(svg && svg.namespaceURI === NS)) {
      throw new Error("render(svg, sample): svg must be an <svg> element (SVG namespace)");
    }
    // Clear svg
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    svg.setAttribute("viewBox", `0 0 ${VBX} ${VBY}`);
    svg.setAttribute("width", VBX);
    svg.setAttribute("height", VBY);
    svg.setAttribute("style", "background:#ffffff");

    // Background
    const bg = document.createElementNS(NS, "rect");
    bg.setAttribute("x", 0); bg.setAttribute("y", 0);
    bg.setAttribute("width", VBX); bg.setAttribute("height", VBY);
    bg.setAttribute("fill", "#ffffff");
    svg.appendChild(bg);

    // Draw main triangle outline
    const tri = document.createElementNS(NS, "polygon");
    tri.setAttribute("points", `${V_A.x},${V_A.y} ${V_B.x},${V_B.y} ${V_C.x},${V_C.y}`);
    tri.setAttribute("fill", "none");
    tri.setAttribute("stroke", "#333");
    tri.setAttribute("stroke-width", "2");
    svg.appendChild(tri);

    // Zones
    const { zones } = buildZones();
    for (const z of zones) {
      const poly = document.createElementNS(NS, "polygon");
      poly.setAttribute("points", z.poly.map(p => `${p.x},${p.y}`).join(" "));
      poly.setAttribute("fill", z.fill);
      poly.setAttribute("fill-opacity", z.code === "T3" ? "0.35" : "0.45");
      poly.setAttribute("stroke", "#555");
      poly.setAttribute("stroke-width", "1");
      svg.appendChild(poly);
    }

    // Zone labels
    for (const z of zones) {
      const ctd = polygonCentroid(z.poly);
      svgText(svg, z.code, ctd.x, ctd.y, {
        fill: "#111",
        size: 16,
        weight: "bold",
        anchor: "middle",
        align: "middle"
      });
    }

    // Axes ticks and labels
    const centerTri = { x: (V_A.x + V_B.x + V_C.x) / 3, y: (V_A.y + V_B.y + V_C.y) / 3 };

    function drawAxis(edge, label, labelPos, labelRotate) {
      const ticks = buildAxisTicks(edge, 10, { a: V_A, b: V_B, c: V_C });
      for (const tk of ticks) {
        const p0 = tk.p;
        const p1 = add(p0, mul(tk.dir, 8));
        const line = document.createElementNS(NS, "line");
        line.setAttribute("x1", p0.x); line.setAttribute("y1", p0.y);
        line.setAttribute("x2", p1.x); line.setAttribute("y2", p1.y);
        line.setAttribute("stroke", "#666");
        line.setAttribute("stroke-width", "1");
        svg.appendChild(line);

        // Label near every 20% (i.e., 20, 40, 60, 80)
        if (tk.value % 20 === 0) {
          const pTxt = add(p1, mul(tk.dir, 10));
          svgText(svg, String(tk.value), pTxt.x, pTxt.y, {
            fill: "#333",
            size: 11,
            anchor: "middle",
            align: "middle"
          });
        }
      }
      svgText(svg, label, labelPos.x, labelPos.y, {
        fill: "#111",
        size: 14,
        weight: "bold",
        anchor: "middle",
        align: "middle",
        rotate: labelRotate || 0
      });
    }

    // Axis labels positioned near midpoints, slightly outside
    // Base AB -> C2H2 (%)
    const abMid = lerp(V_A, V_B, 0.5);
    drawAxis("AB", "C2H2 (%)", add(abMid, { x: 0, y: 28 }), 0);

    // Left edge AC -> C2H4 (%)
    const acMid = lerp(V_A, V_C, 0.5);
    // Outward normal for AC for label
    const acDir = norm({ x: -(V_C.y - V_A.y), y: (V_C.x - V_A.x) });
    const acOut = add(acMid, mul(acDir, 28));
    drawAxis("AC", "C2H4 (%)", acOut, 0);

    // Right edge BC -> CH4 (%)
    const bcMid = lerp(V_B, V_C, 0.5);
    const bcDir = norm({ x: -(V_C.y - V_B.y), y: (V_C.x - V_B.x) });
    const bcOut = add(bcMid, mul(bcDir, 28));
    drawAxis("BC", "CH4 (%)", bcOut, 0);

    // Corner names near vertices
    svgText(svg, "CH4", V_A.x - 16, V_A.y + 14, { size: 14, weight: "bold", anchor: "end" });
    svgText(svg, "C2H4", V_B.x + 16, V_B.y + 14, { size: 14, weight: "bold", anchor: "start" });
    svgText(svg, "C2H2", V_C.x, V_C.y - 12, { size: 14, weight: "bold", anchor: "middle" });

    // Sample point marker
    if (sample && typeof sample === "object" && sample !== null) {
      const a = Number(sample.ch4), b = Number(sample.c2h4), c = Number(sample.c2h2);
      if (isFinite(a) && isFinite(b) && isFinite(c) && a >= 0 && b >= 0 && c >= 0 && a + b + c > 0) {
        const s = a + b + c;
        const fCH4 = a / s, fC2H4 = b / s, fC2H2 = c / s;
        const p = baryToXY(fCH4, fC2H4, fC2H2);

        // Marker
        const mark = document.createElementNS(NS, "circle");
        mark.setAttribute("cx", p.x);
        mark.setAttribute("cy", p.y);
        mark.setAttribute("r", 6);
        mark.setAttribute("fill", "#d32f2f");
        mark.setAttribute("stroke", "#000");
        mark.setAttribute("stroke-width", "1.2");
        svg.appendChild(mark);

        // Classification label
        let code = "N/A";
        try { code = classify(a, b, c) || "N/A"; } catch (_) {}
        const lblBg = document.createElementNS(NS, "rect");
        const tx = p.x + 14, ty = p.y - 14;
        const label = document.createElementNS(NS, "text");
        label.setAttribute("x", tx);
        label.setAttribute("y", ty);
        label.setAttribute("fill", "#111");
        label.setAttribute("font-size", "13");
        label.setAttribute("font-weight", "bold");
        label.setAttribute("text-anchor", "start");
        label.setAttribute("dominant-baseline", "middle");
        label.textContent = code;
        // Background box based on text length approx
        const approxW = 8 * (String(code).length) + 8;
        lblBg.setAttribute("x", tx - 4);
        lblBg.setAttribute("y", ty - 11);
        lblBg.setAttribute("width", approxW);
        lblBg.setAttribute("height", 18);
        lblBg.setAttribute("fill", "rgba(255,255,255,0.8)");
        lblBg.setAttribute("stroke", "#999");
        lblBg.setAttribute("stroke-width", "0.5");
        svg.appendChild(lblBg);
        svg.appendChild(label);
      }
    }
  }

  return {
    classify,
    render
  };
})();
