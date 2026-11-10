const DuvalTriangle = (() => {
  const NS = "http://www.w3.org/2000/svg";

  // ViewBox 0 0 600 540 (given by prompt); triangle geometry with margins.
  const TRI = {
    A: { x: 80, y: 480 },  // CH4 = 100%
    B: { x: 520, y: 480 }, // C2H4 = 100%
    C: { x: 300, y: 60 },  // C2H2 = 100%
  };
  const TRI_CTR = {
    x: (TRI.A.x + TRI.B.x + TRI.C.x) / 3,
    y: (TRI.A.y + TRI.B.y + TRI.C.y) / 3,
  };

  function clampNonNeg(n) {
    n = Number(n);
    return Number.isFinite(n) && n >= 0 ? n : NaN;
  }

  function toPercents(ch4, c2h4, c2h2) {
    ch4 = clampNonNeg(ch4);
    c2h4 = clampNonNeg(c2h4);
    c2h2 = clampNonNeg(c2h2);
    if (!Number.isFinite(ch4) || !Number.isFinite(c2h4) || !Number.isFinite(c2h2)) return null;
    const s = ch4 + c2h4 + c2h2;
    if (!(s > 0)) return null;
    return {
      ch4: (ch4 * 100) / s,
      c2h4: (c2h4 * 100) / s,
      c2h2: (c2h2 * 100) / s,
    };
  }

  function baryToXY(p) {
    // p components sum to 100
    const a = p.ch4 / 100, b = p.c2h4 / 100, c = p.c2h2 / 100;
    return {
      x: TRI.A.x * a + TRI.B.x * b + TRI.C.x * c,
      y: TRI.A.y * a + TRI.B.y * b + TRI.C.y * c,
    };
  }

  function vec(x, y) { return { x, y }; }
  function add(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
  function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
  function mul(a, s) { return { x: a.x * s, y: a.y * s }; }
  function dot(a, b) { return a.x * b.x + a.y * b.y; }
  function len(a) { return Math.hypot(a.x, a.y); }
  function norm(a) { const L = len(a) || 1; return { x: a.x / L, y: a.y / L }; }
  function perp(a) { return { x: -a.y, y: a.x }; }

  function outwardNormal(p1, p2, ctr) {
    const v = sub(p2, p1);
    const n1 = norm(perp(v));
    const mid = mul(add(p1, p2), 0.5);
    const toMid = sub(mid, ctr);
    return dot(n1, toMid) > 0 ? n1 : mul(n1, -1);
  }

  function pointInPoly(pt, poly) {
    // ray casting; poly is array of {x,y}
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;

      const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
        (pt.x < (xj - xi) * (pt.y - yi) / ((yj - yi) || 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function polyXYFromBary(points) {
    return points.map(([ch4, c2h4, c2h2]) => baryToXY({ ch4, c2h4, c2h2 }));
  }

  // Duval Triangle 1 zones (best recollection; committed boundaries).
  // Coordinates are (CH4%, C2H4%, C2H2%), summing to 100.
  const ZONES = [
    {
      code: "PD",
      color: "#b9d9ff",
      pts: [
        [100, 0, 0],
        [96, 0, 4],
        [76, 20, 4],
        [80, 20, 0],
      ],
    },
    {
      code: "T1",
      color: "#c9f7c9",
      pts: [
        [80, 20, 0],
        [50, 50, 0],
        [46, 50, 4],
        [76, 20, 4],
      ],
    },
    {
      code: "T2",
      color: "#7fe07f",
      pts: [
        [50, 50, 0],
        [20, 80, 0],
        [16, 80, 4],
        [46, 50, 4],
      ],
    },
    {
      code: "T3",
      color: "#3aa84a",
      pts: [
        [20, 80, 0],
        [0, 100, 0],
        [0, 96, 4],
        [16, 80, 4],
      ],
    },
    {
      code: "D1",
      color: "#ffd08a",
      pts: [
        [96, 0, 4],
        [76, 20, 4],
        [56, 40, 4],
        [47, 40, 13],
        [87, 0, 13],
      ],
    },
    {
      code: "DT",
      color: "#c7a6ff",
      pts: [
        [56, 40, 4],
        [16, 80, 4],
        [0, 96, 4],
        [0, 87, 13],
        [0, 71, 29],
        [31, 40, 29],
        [47, 40, 13],
      ],
    },
    {
      code: "D2",
      color: "#ff9a9a",
      pts: [
        [87, 0, 13],
        [47, 40, 13],
        [31, 40, 29],
        [0, 71, 29],
        [0, 0, 100],
        [71, 0, 29],
      ],
    },
  ];

  // Precompute XY polygons for hit testing/rendering.
  const ZONES_XY = ZONES.map(z => ({
    code: z.code,
    color: z.color,
    poly: polyXYFromBary(z.pts),
    bary: z.pts
  }));

  function classify(ch4, c2h4, c2h2) {
    const p = toPercents(ch4, c2h4, c2h2);
    if (!p) return null;

    const pt = baryToXY(p);

    // Prefer polygon-based classification.
    for (const z of ZONES_XY) {
      if (pointInPoly(pt, z.poly)) return z.code;
    }

    // Fallback heuristic (should rarely trigger).
    const a = p.c2h2, e = p.c2h4, m = p.ch4;

    if (a >= 29) return "D2";
    if (a >= 13) return (e >= 40 ? "DT" : "D2");
    if (a >= 4) return (e >= 40 ? "DT" : "D1");

    // a < 4 : PD/T zones
    if (e < 20 && m >= 80) return "PD";
    if (e < 50) return "T1";
    if (e < 80) return "T2";
    return "T3";
  }

  function render(svg, sample) {
    if (!svg || typeof svg !== "object" || typeof svg.appendChild !== "function") return;

    // Clear svg
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    function el(name, attrs, parent) {
      const node = document.createElementNS(NS, name);
      if (attrs) {
        for (const k of Object.keys(attrs)) node.setAttribute(k, String(attrs[k]));
      }
      if (parent) parent.appendChild(node);
      return node;
    }

    // Background
    el("rect", { x: 0, y: 0, width: 600, height: 540, fill: "white" }, svg);

    const gZones = el("g", {}, svg);
    const gAxes = el("g", {}, svg);
    const gLabels = el("g", { "font-family": "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" }, svg);
    const gSample = el("g", {}, svg);

    // Draw zones filled
    for (const z of ZONES_XY) {
      const d = z.poly.map((p, i) => (i ? "L" : "M") + p.x.toFixed(2) + " " + p.y.toFixed(2)).join(" ") + " Z";
      el("path", {
        d,
        fill: z.color,
        stroke: "white",
        "stroke-width": 2,
        "shape-rendering": "geometricPrecision"
      }, gZones);

      // Label at centroid (average of vertices)
      const c = z.poly.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
      c.x /= z.poly.length; c.y /= z.poly.length;

      el("text", {
        x: c.x,
        y: c.y,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        "font-size": 18,
        fill: "rgba(0,0,0,0.75)",
        "pointer-events": "none",
        "font-weight": 700
      }, gLabels).textContent = z.code;
    }

    // Outer triangle border
    el("path", {
      d: `M ${TRI.A.x} ${TRI.A.y} L ${TRI.B.x} ${TRI.B.y} L ${TRI.C.x} ${TRI.C.y} Z`,
      fill: "none",
      stroke: "#111",
      "stroke-width": 2.5
    }, gAxes);

    // Axes with ticks:
    // Base: C2H4 from 0 (A) to 100 (B)
    // Left side A->C: CH4 from 100 (A) down to 0 (C)
    // Right side B->C: C2H2 from 0 (B) to 100 (C)
    const sides = [
      { p1: TRI.A, p2: TRI.B, name: "C2H4 (%)", valueAtT: t => Math.round(t * 100), labelEvery: 20 },
      { p1: TRI.A, p2: TRI.C, name: "CH4 (%)",  valueAtT: t => Math.round((1 - t) * 100), labelEvery: 20 },
      { p1: TRI.B, p2: TRI.C, name: "C2H2 (%)", valueAtT: t => Math.round(t * 100), labelEvery: 20 },
    ];

    for (const side of sides) {
      const v = sub(side.p2, side.p1);
      const n = outwardNormal(side.p1, side.p2, TRI_CTR);
      const tickSmall = 7;
      const tickLarge = 10;

      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        const p = add(side.p1, mul(v, t));
        const val = side.valueAtT(t);
        const isMajor = (val % side.labelEvery) === 0;

        const L = isMajor ? tickLarge : tickSmall;
        const p2 = add(p, mul(n, L));

        el("line", {
          x1: p.x, y1: p.y,
          x2: p2.x, y2: p2.y,
          stroke: "#111",
          "stroke-width": isMajor ? 1.5 : 1
        }, gAxes);

        if (isMajor) {
          const tp = add(p, mul(n, L + 14));
          const tx = el("text", {
            x: tp.x,
            y: tp.y,
            "text-anchor": "middle",
            "dominant-baseline": "middle",
            "font-size": 12,
            fill: "#111"
          }, gLabels);
          tx.textContent = String(val);
        }
      }

      // Axis name at midpoint
      const mid = add(side.p1, mul(v, 0.5));
      const pos = add(mid, mul(n, 34));
      const angle = Math.atan2(v.y, v.x) * 180 / Math.PI;

      const tnode = el("text", {
        x: pos.x,
        y: pos.y,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        "font-size": 16,
        "font-weight": 700,
        fill: "#111"
      }, gLabels);
      // Rotate label along side for slanted edges; keep base label horizontal.
      if (!(side.p1 === TRI.A && side.p2 === TRI.B)) {
        tnode.setAttribute("transform", `rotate(${angle.toFixed(3)} ${pos.x.toFixed(2)} ${pos.y.toFixed(2)})`);
      }
      tnode.textContent = side.name;
    }

    // Vertex labels (gas names)
    el("text", {
      x: TRI.A.x - 10, y: TRI.A.y + 28,
      "text-anchor": "start",
      "dominant-baseline": "middle",
      "font-size": 14,
      "font-weight": 700,
      fill: "#111"
    }, gLabels).textContent = "CH4";

    el("text", {
      x: TRI.B.x - 10, y: TRI.B.y + 28,
      "text-anchor": "end",
      "dominant-baseline": "middle",
      "font-size": 14,
      "font-weight": 700,
      fill: "#111"
    }, gLabels).textContent = "C2H4";

    el("text", {
      x: TRI.C.x, y: TRI.C.y - 24,
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      "font-size": 14,
      "font-weight": 700,
      fill: "#111"
    }, gLabels).textContent = "C2H2";

    // Sample point
    if (sample && typeof sample === "object") {
      const p = toPercents(sample.ch4, sample.c2h4, sample.c2h2);
      if (p) {
        const pt = baryToXY(p);
        const zone = classify(sample.ch4, sample.c2h4, sample.c2h2);

        // Marker
        el("circle", {
          cx: pt.x, cy: pt.y, r: 6.5,
          fill: "#111",
          stroke: "white",
          "stroke-width": 2
        }, gSample);

        el("circle", {
          cx: pt.x, cy: pt.y, r: 3.2,
          fill: "#fff"
        }, gSample);

        // Label next to sample
        const label = el("text", {
          x: pt.x + 10,
          y: pt.y - 10,
          "text-anchor": "start",
          "dominant-baseline": "baseline",
          "font-size": 14,
          "font-weight": 800,
          fill: "#111",
          "paint-order": "stroke",
          stroke: "white",
          "stroke-width": 4
        }, gSample);
        label.textContent = zone ? zone : "";
        label.setAttribute("stroke-linejoin", "round");
      }
    }
  }

  return { classify, render };
})();
