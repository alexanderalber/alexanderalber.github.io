const DuvalPentagon = (() => {
  const SVG_NS = "http://www.w3.org/2000/svg";

  // Pentagon vertex definitions in canonical coordinates (radius R = 100, center = (0, 0))
  // Vertex 0: H2   (90°)
  // Vertex 1: C2H6 (18°)
  // Vertex 2: CH4  (-54°)
  // Vertex 3: C2H4 (-126°)
  // Vertex 4: C2H2 (162°)
  const DEG2RAD = Math.PI / 180;
  const GAS_VERTICES = {
    h2:   [100 * Math.cos(90 * DEG2RAD),   100 * Math.sin(90 * DEG2RAD)],
    c2h6: [100 * Math.cos(18 * DEG2RAD),   100 * Math.sin(18 * DEG2RAD)],
    ch4:  [100 * Math.cos(-54 * DEG2RAD),  100 * Math.sin(-54 * DEG2RAD)],
    c2h4: [100 * Math.cos(-126 * DEG2RAD), 100 * Math.sin(-126 * DEG2RAD)],
    c2h2: [100 * Math.cos(162 * DEG2RAD),  100 * Math.sin(162 * DEG2RAD)]
  };

  // Outer vertices of the regular pentagon
  const V0 = [0, 100];
  const V1 = [GAS_VERTICES.c2h6[0], GAS_VERTICES.c2h6[1]];
  const V2 = [GAS_VERTICES.ch4[0],  GAS_VERTICES.ch4[1]];
  const V3 = [GAS_VERTICES.c2h4[0], GAS_VERTICES.c2h4[1]];
  const V4 = [GAS_VERTICES.c2h2[0], GAS_VERTICES.c2h2[1]];

  // Boundary transition points along perimeter edges
  const P_PD_S   = [17.12,  87.56];
  const P_S_T1   = [55.16,  59.92];
  const P_T1_T2  = [78.76, -19.41];
  const P_T2_T3  = [-10.0, -80.90];
  const P_T3_D2  = [-76.22, -27.24];
  const P_D2_D1  = [-52.31,  62.00];
  const P_D1_PD  = [-17.12,  87.56];

  // Internal junction points
  const C_PD        = [0, 75];
  const C_CENTER    = [0, 5];
  const J_S_T1_T2   = [35, 5];
  const J_D1_D2_T3  = [-28, 5];

  // Zone polygons in canonical coordinates
  const ZONES = [
    {
      code: "PD",
      name: "Partial Discharge",
      color: "#DDD6FE",
      labelPos: [0, 87],
      polygon: [V0, P_PD_S, C_PD, P_D1_PD]
    },
    {
      code: "D1",
      name: "Low Energy Discharge",
      color: "#BAE6FD",
      labelPos: [-22, 45],
      polygon: [P_D1_PD, C_PD, C_CENTER, J_D1_D2_T3, P_D2_D1]
    },
    {
      code: "D2",
      name: "High Energy Discharge",
      color: "#93C5FD",
      labelPos: [-64, 12],
      polygon: [P_D2_D1, V4, P_T3_D2, J_D1_D2_T3]
    },
    {
      code: "T3",
      name: "Thermal Fault > 700 °C",
      color: "#FECDD3",
      labelPos: [-36, -50],
      polygon: [J_D1_D2_T3, P_T3_D2, V3, P_T2_T3, C_CENTER]
    },
    {
      code: "T2",
      name: "Thermal Fault 300 - 700 °C",
      color: "#FED7AA",
      labelPos: [36, -45],
      polygon: [C_CENTER, P_T2_T3, V2, P_T1_T2, J_S_T1_T2]
    },
    {
      code: "T1",
      name: "Thermal Fault < 300 °C",
      color: "#FEF08A",
      labelPos: [65, 20],
      polygon: [J_S_T1_T2, P_T1_T2, V1, P_S_T1]
    },
    {
      code: "S",
      name: "Stray Gassing",
      color: "#BBF7D0",
      labelPos: [22, 45],
      polygon: [C_PD, P_PD_S, P_S_T1, J_S_T1_T2, C_CENTER]
    }
  ];

  function calculatePoint(h2, ch4, c2h6, c2h4, c2h2) {
    const tot = h2 + ch4 + c2h6 + c2h4 + c2h2;
    if (tot <= 0) return [0, 0];
    const w_h2   = h2   / tot;
    const w_ch4  = ch4  / tot;
    const w_c2h6 = c2h6 / tot;
    const w_c2h4 = c2h4 / tot;
    const w_c2h2 = c2h2 / tot;

    const x = w_h2   * GAS_VERTICES.h2[0] +
              w_ch4  * GAS_VERTICES.ch4[0] +
              w_c2h6 * GAS_VERTICES.c2h6[0] +
              w_c2h4 * GAS_VERTICES.c2h4[0] +
              w_c2h2 * GAS_VERTICES.c2h2[0];

    const y = w_h2   * GAS_VERTICES.h2[1] +
              w_ch4  * GAS_VERTICES.ch4[1] +
              w_c2h6 * GAS_VERTICES.c2h6[1] +
              w_c2h4 * GAS_VERTICES.c2h4[1] +
              w_c2h2 * GAS_VERTICES.c2h2[1];

    return [x, y];
  }

  function pointInPolygon(px, py, vs) {
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      const xi = vs[i][0], yi = vs[i][1];
      const xj = vs[j][0], yj = vs[j][1];
      const intersect = ((yi > py) !== (yj > py)) &&
        (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function polygonCentroid(vs) {
    let sx = 0, sy = 0;
    for (let i = 0; i < vs.length; i++) {
      sx += vs[i][0];
      sy += vs[i][1];
    }
    return [sx / vs.length, sy / vs.length];
  }

  function distSq(p1, p2) {
    const dx = p1[0] - p2[0];
    const dy = p1[1] - p2[1];
    return dx * dx + dy * dy;
  }

  function classifyCoordinates(x, y) {
    for (let i = 0; i < ZONES.length; i++) {
      if (pointInPolygon(x, y, ZONES[i].polygon)) {
        return ZONES[i].code;
      }
    }
    // Fallback for boundary points: nearest zone centroid
    let bestZone = ZONES[0].code;
    let minDist = Infinity;
    for (let i = 0; i < ZONES.length; i++) {
      const c = polygonCentroid(ZONES[i].polygon);
      const d = distSq([x, y], c);
      if (d < minDist) {
        minDist = d;
        bestZone = ZONES[i].code;
      }
    }
    return bestZone;
  }

  return {
    classify(h2, ch4, c2h6, c2h4, c2h2) {
      const [x, y] = calculatePoint(h2, ch4, c2h6, c2h4, c2h2);
      return classifyCoordinates(x, y);
    },

    render(svg, sample) {
      while (svg.firstChild) {
        svg.removeChild(svg.firstChild);
      }

      const CX = 300;
      const CY = 300;
      const SCALE = 2.2; // Map canonical radius 100 to 220 SVG pixels

      function toSvg(pt) {
        return [CX + pt[0] * SCALE, CY - pt[1] * SCALE];
      }

      // Root group for the diagram
      const mainGroup = document.createElementNS(SVG_NS, "g");
      svg.appendChild(mainGroup);

      // Draw zone polygons
      ZONES.forEach(zone => {
        const polygonElem = document.createElementNS(SVG_NS, "polygon");
        const ptsStr = zone.polygon
          .map(pt => toSvg(pt).map(n => n.toFixed(2)).join(","))
          .join(" ");
        polygonElem.setAttribute("points", ptsStr);
        polygonElem.setAttribute("fill", zone.color);
        polygonElem.setAttribute("stroke", "#64748B");
        polygonElem.setAttribute("stroke-width", "1.2");
        polygonElem.setAttribute("stroke-linejoin", "round");

        const titleElem = document.createElementNS(SVG_NS, "title");
        titleElem.textContent = `${zone.code}: ${zone.name}`;
        polygonElem.appendChild(titleElem);

        mainGroup.appendChild(polygonElem);
      });

      // Pentagon outer boundary outline
      const outerPoly = document.createElementNS(SVG_NS, "polygon");
      const outerPtsStr = [V0, V1, V2, V3, V4]
        .map(pt => toSvg(pt).map(n => n.toFixed(2)).join(","))
        .join(" ");
      outerPoly.setAttribute("points", outerPtsStr);
      outerPoly.setAttribute("fill", "none");
      outerPoly.setAttribute("stroke", "#334155");
      outerPoly.setAttribute("stroke-width", "2.5");
      outerPoly.setAttribute("stroke-linejoin", "round");
      mainGroup.appendChild(outerPoly);

      // Center-to-vertex axis lines
      [V0, V1, V2, V3, V4].forEach(v => {
        const line = document.createElementNS(SVG_NS, "line");
        const [vx, vy] = toSvg(v);
        line.setAttribute("x1", CX.toString());
        line.setAttribute("y1", CY.toString());
        line.setAttribute("x2", vx.toFixed(2));
        line.setAttribute("y2", vy.toFixed(2));
        line.setAttribute("stroke", "#94A3B8");
        line.setAttribute("stroke-width", "1");
        line.setAttribute("stroke-dasharray", "3,3");
        mainGroup.appendChild(line);
      });

      // Zone text labels
      ZONES.forEach(zone => {
        const text = document.createElementNS(SVG_NS, "text");
        const [tx, ty] = toSvg(zone.labelPos);
        text.setAttribute("x", tx.toFixed(2));
        text.setAttribute("y", ty.toFixed(2));
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("dominant-baseline", "central");
        text.setAttribute("fill", "#0F172A");
        text.setAttribute("font-family", "system-ui, -apple-system, sans-serif");
        text.setAttribute("font-size", "14");
        text.setAttribute("font-weight", "700");
        text.setAttribute("pointer-events", "none");
        text.textContent = zone.code;
        mainGroup.appendChild(text);
      });

      // Gas vertex axis labels
      const gasLabels = [
        { name: "H₂",   pt: V0, offset: [0, -22],   anchor: "middle" },
        { name: "C₂H₆", pt: V1, offset: [22, -6],   anchor: "start"  },
        { name: "CH₄",  pt: V2, offset: [16, 20],   anchor: "start"  },
        { name: "C₂H₄", pt: V3, offset: [-16, 20],  anchor: "end"    },
        { name: "C₂H₂", pt: V4, offset: [-22, -6],  anchor: "end"    }
      ];

      gasLabels.forEach(lbl => {
        const [vx, vy] = toSvg(lbl.pt);
        const text = document.createElementNS(SVG_NS, "text");
        text.setAttribute("x", (vx + lbl.offset[0]).toFixed(2));
        text.setAttribute("y", (vy + lbl.offset[1]).toFixed(2));
        text.setAttribute("text-anchor", lbl.anchor);
        text.setAttribute("dominant-baseline", "central");
        text.setAttribute("fill", "#0F172A");
        text.setAttribute("font-family", "system-ui, -apple-system, sans-serif");
        text.setAttribute("font-size", "15");
        text.setAttribute("font-weight", "600");
        text.textContent = lbl.name;
        mainGroup.appendChild(text);
      });

      // Sample marker
      if (sample && typeof sample === "object") {
        const h2   = Number(sample.h2)   || 0;
        const ch4  = Number(sample.ch4)  || 0;
        const c2h6 = Number(sample.c2h6) || 0;
        const c2h4 = Number(sample.c2h4) || 0;
        const c2h2 = Number(sample.c2h2) || 0;

        if (h2 + ch4 + c2h6 + c2h4 + c2h2 > 0) {
          const pt = calculatePoint(h2, ch4, c2h6, c2h4, c2h2);
          const [sx, sy] = toSvg(pt);
          const zoneCode = classifyCoordinates(pt[0], pt[1]);

          // Marker halo
          const halo = document.createElementNS(SVG_NS, "circle");
          halo.setAttribute("cx", sx.toFixed(2));
          halo.setAttribute("cy", sy.toFixed(2));
          halo.setAttribute("r", "11");
          halo.setAttribute("fill", "#DC2626");
          halo.setAttribute("fill-opacity", "0.25");
          mainGroup.appendChild(halo);

          // Marker inner dot
          const dot = document.createElementNS(SVG_NS, "circle");
          dot.setAttribute("cx", sx.toFixed(2));
          dot.setAttribute("cy", sy.toFixed(2));
          dot.setAttribute("r", "5.5");
          dot.setAttribute("fill", "#DC2626");
          dot.setAttribute("stroke", "#FFFFFF");
          dot.setAttribute("stroke-width", "2");

          const title = document.createElementNS(SVG_NS, "title");
          title.textContent = `Sample: ${zoneCode} (${sx.toFixed(1)}, ${sy.toFixed(1)})`;
          dot.appendChild(title);
          mainGroup.appendChild(dot);
        }
      }
    }
  };
})();
