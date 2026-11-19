const DuvalPentagon = (function () {
  // Duval Pentagon 1 (mineral oil). Relative percentages of H2, C2H6, CH4,
  // C2H4 and C2H2 are placed on axes 72° apart and summed as vectors.
  // H2 at the top; clockwise: C2H6, CH4, C2H4, C2H2.
  const RAD = Math.PI / 180;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const CX = 300;
  const CY = 302;
  const SCALE = 190;

  function vertex(deg) {
    return [Math.cos(deg * RAD), Math.sin(deg * RAD)];
  }

  const A = vertex(90);    // H2
  const B = vertex(18);    // C2H6
  const C = vertex(-54);   // CH4
  const D = vertex(-126);  // C2H4
  const E = vertex(162);   // C2H2

  function lerp(P, Q, t) {
    return [P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t];
  }

  // Edge cuts and interior junctions. Zones tile the pentagon.
  // Vertex assignment: H2→PD, C2H6→S, CH4→T1, C2H4→T3, C2H2→D1.
  const pAB = lerp(A, B, 0.26);
  const pBC = lerp(B, C, 0.46);
  const pCD1 = lerp(C, D, 0.30);
  const pCD2 = lerp(C, D, 0.62);
  const pDE1 = lerp(D, E, 0.32);
  const pDE2 = lerp(D, E, 0.66);
  const pEA = lerp(E, A, 0.82);
  const u = [0.04, 0.36];
  const l = [-0.06, 0.08];
  const r = [0.16, -0.02];
  const c3 = [0.06, -0.20];
  const c4 = [-0.10, -0.34];

  const ZONES = [
    { code: "PD", fill: "#1565c0", text: "#ffffff", points: [A, pAB, u, pEA] },
    { code: "S", fill: "#bdbdbd", text: "#212121", points: [pAB, B, pBC, r, l, u] },
    { code: "D1", fill: "#7e57c2", text: "#ffffff", points: [pEA, u, l, pDE2, E] },
    { code: "D2", fill: "#6a1b9a", text: "#ffffff", points: [pDE2, l, r, c3, c4, pDE1] },
    { code: "T3", fill: "#c62828", text: "#ffffff", points: [pCD2, D, pDE1, c4] },
    { code: "T2", fill: "#ef6c00", text: "#212121", points: [pCD1, pCD2, c4, c3] },
    { code: "T1", fill: "#fdd835", text: "#212121", points: [pBC, C, pCD1, c3, r] }
  ];

  const AXES = [
    { name: "H₂", v: A },
    { name: "C₂H₆", v: B },
    { name: "CH₄", v: C },
    { name: "C₂H₄", v: D },
    { name: "C₂H₂", v: E }
  ];

  function xy(h2, ch4, c2h6, c2h4, c2h2) {
    const sum = h2 + ch4 + c2h6 + c2h4 + c2h2;
    if (!(sum > 0)) return null;
    const w = [h2 / sum, c2h6 / sum, ch4 / sum, c2h4 / sum, c2h2 / sum];
    const ang = [90, 18, -54, -126, 162];
    let x = 0;
    let y = 0;
    for (let i = 0; i < 5; i++) {
      x += w[i] * Math.cos(ang[i] * RAD);
      y += w[i] * Math.sin(ang[i] * RAD);
    }
    return [x, y];
  }

  function pointInPoly(x, y, poly) {
    const n = poly.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = poly[i][0], yi = poly[i][1];
      const xj = poly[j][0], yj = poly[j][1];
      const dx = xj - xi, dy = yj - yi;
      const len2 = dx * dx + dy * dy;
      if (len2 > 0) {
        let t = ((x - xi) * dx + (y - yi) * dy) / len2;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        const px = xi + t * dx, py = yi + t * dy;
        const dist2 = (x - px) * (x - px) + (y - py) * (y - py);
        if (dist2 <= 1e-10) return true;
      }
    }
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = poly[i][0], yi = poly[i][1];
      const xj = poly[j][0], yj = poly[j][1];
      const intersect = (yi > y) !== (yj > y) &&
        x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function centroid(poly) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const cross = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
      a += cross;
      cx += (poly[j][0] + poly[i][0]) * cross;
      cy += (poly[j][1] + poly[i][1]) * cross;
    }
    a *= 0.5;
    if (Math.abs(a) < 1e-12) {
      let sx = 0, sy = 0;
      for (let i = 0; i < poly.length; i++) {
        sx += poly[i][0];
        sy += poly[i][1];
      }
      return [sx / poly.length, sy / poly.length];
    }
    return [cx / (6 * a), cy / (6 * a)];
  }

  function zoneAt(x, y) {
    for (let i = 0; i < ZONES.length; i++) {
      if (pointInPoly(x, y, ZONES[i].points)) return ZONES[i].code;
    }
    let best = ZONES[0].code;
    let bestD = Infinity;
    for (let i = 0; i < ZONES.length; i++) {
      const c = centroid(ZONES[i].points);
      const d = (c[0] - x) * (c[0] - x) + (c[1] - y) * (c[1] - y);
      if (d < bestD) {
        bestD = d;
        best = ZONES[i].code;
      }
    }
    return best;
  }

  function svgEl(name, attrs, parent) {
    const node = document.createElementNS(SVG_NS, name);
    if (attrs) {
      const keys = Object.keys(attrs);
      for (let i = 0; i < keys.length; i++) {
        node.setAttribute(keys[i], String(attrs[keys[i]]));
      }
    }
    if (parent) parent.appendChild(node);
    return node;
  }

  function toSvg(x, y) {
    return [CX + x * SCALE, CY - y * SCALE];
  }

  function ptsAttr(poly) {
    const parts = [];
    for (let i = 0; i < poly.length; i++) {
      const s = toSvg(poly[i][0], poly[i][1]);
      parts.push(s[0].toFixed(2) + "," + s[1].toFixed(2));
    }
    return parts.join(" ");
  }

  function addText(parent, x, y, str, attrs) {
    const t = svgEl("text", attrs, parent);
    t.setAttribute("x", x.toFixed(2));
    t.setAttribute("y", y.toFixed(2));
    t.textContent = str;
    return t;
  }

  function render(svg, sample) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const root = svgEl("g", {
      "font-family": "Arial, Helvetica, sans-serif"
    }, svg);

    svgEl("rect", {
      x: 0, y: 0, width: 600, height: 600, fill: "#ffffff"
    }, root);

    for (let i = 0; i < ZONES.length; i++) {
      svgEl("polygon", {
        points: ptsAttr(ZONES[i].points),
        fill: ZONES[i].fill,
        stroke: "#263238",
        "stroke-width": 1,
        "stroke-linejoin": "round"
      }, root);
    }

    svgEl("polygon", {
      points: ptsAttr([A, B, C, D, E]),
      fill: "none",
      stroke: "#212121",
      "stroke-width": 2,
      "stroke-linejoin": "round"
    }, root);

    for (let i = 0; i < AXES.length; i++) {
      const v = AXES[i].v;
      const end = toSvg(v[0], v[1]);
      const origin = toSvg(0, 0);
      svgEl("line", {
        x1: origin[0].toFixed(2), y1: origin[1].toFixed(2),
        x2: end[0].toFixed(2), y2: end[1].toFixed(2),
        stroke: "#ffffff", "stroke-width": 3
      }, root);
      svgEl("line", {
        x1: origin[0].toFixed(2), y1: origin[1].toFixed(2),
        x2: end[0].toFixed(2), y2: end[1].toFixed(2),
        stroke: "#37474f", "stroke-width": 1
      }, root);
      const px = -v[1], py = v[0];
      for (let k = 1; k <= 4; k++) {
        const t = k * 0.2;
        const bx = v[0] * t, by = v[1] * t;
        const a1 = toSvg(bx + px * 0.028, by + py * 0.028);
        const a2 = toSvg(bx - px * 0.028, by - py * 0.028);
        svgEl("line", {
          x1: a1[0].toFixed(2), y1: a1[1].toFixed(2),
          x2: a2[0].toFixed(2), y2: a2[1].toFixed(2),
          stroke: "#ffffff", "stroke-width": 3
        }, root);
        svgEl("line", {
          x1: a1[0].toFixed(2), y1: a1[1].toFixed(2),
          x2: a2[0].toFixed(2), y2: a2[1].toFixed(2),
          stroke: "#37474f", "stroke-width": 1
        }, root);
      }
    }

    const oc = toSvg(0, 0);
    svgEl("circle", {
      cx: oc[0].toFixed(2), cy: oc[1].toFixed(2), r: 2.2, fill: "#37474f"
    }, root);

    for (let i = 0; i < ZONES.length; i++) {
      const c = centroid(ZONES[i].points);
      const s = toSvg(c[0], c[1]);
      const halo = ZONES[i].text === "#ffffff" ? "#000000" : "#ffffff";
      addText(root, s[0], s[1], ZONES[i].code, {
        fill: ZONES[i].text,
        stroke: halo,
        "stroke-width": 3,
        "paint-order": "stroke",
        "stroke-linejoin": "round",
        "font-size": 16,
        "font-weight": 700,
        "text-anchor": "middle",
        "dominant-baseline": "central"
      });
    }

    for (let i = 0; i < AXES.length; i++) {
      const v = AXES[i].v;
      const s = toSvg(v[0] * 1.18, v[1] * 1.18);
      addText(root, s[0], s[1], AXES[i].name, {
        fill: "#212121",
        stroke: "#ffffff",
        "stroke-width": 4,
        "paint-order": "stroke",
        "stroke-linejoin": "round",
        "font-size": 15,
        "font-weight": 700,
        "text-anchor": "middle",
        "dominant-baseline": "central"
      });
    }

    if (sample) {
      const p = xy(+sample.h2, +sample.ch4, +sample.c2h6, +sample.c2h4, +sample.c2h2);
      if (p) {
        const s = toSvg(p[0], p[1]);
        const code = zoneAt(p[0], p[1]);
        const marker = svgEl("g", null, root);
        svgEl("circle", {
          cx: s[0].toFixed(2), cy: s[1].toFixed(2),
          r: 9, fill: "none", stroke: "#b71c1c", "stroke-width": 1.5
        }, marker);
        svgEl("circle", {
          cx: s[0].toFixed(2), cy: s[1].toFixed(2),
          r: 4.5, fill: "#d50000", stroke: "#ffffff", "stroke-width": 1.5
        }, marker);
        const title = svgEl("title", null, marker);
        title.textContent = code;
        addText(root, s[0] + 12, s[1] - 12, code, {
          fill: "#b71c1c",
          stroke: "#ffffff",
          "stroke-width": 3,
          "paint-order": "stroke",
          "stroke-linejoin": "round",
          "font-size": 13,
          "font-weight": 700,
          "text-anchor": "start",
          "dominant-baseline": "central"
        });
      }
    }
  }

  return {
    classify: function (h2, ch4, c2h6, c2h4, c2h2) {
      const p = xy(+h2, +ch4, +c2h6, +c2h4, +c2h2);
      if (!p) return "";
      return zoneAt(p[0], p[1]);
    },
    render: render
  };
})();
