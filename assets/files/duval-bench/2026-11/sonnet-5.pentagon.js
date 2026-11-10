(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // Duval Pentagon 1 — fault zones (IEC 60599 / CIGRE TB 771 style)
  //
  // Gases: H2, CH4, C2H6, C2H4, C2H2
  // Percentages are computed on the sum of these five gases, then each
  // gas is plotted on its own axis of a regular pentagon and the
  // resulting 5-point polygon's centroid (in % space, mapped through the
  // same per-axis geometry Duval uses) is used to look up the zone.
  //
  // Zones: PD, D1, D2, T1, T2, T3, DT, S (Stray gassing / "S" zone near
  // the centre in some versions is omitted/folded into T1-T2-T3 — here we
  // implement the commonly published 7-zone pentagon: PD, D1, D2, DT,
  // T1, T2, T3, plus the small PD zone at the H2 vertex).
  //
  // Axis order (clockwise from top, standard Duval Pentagon 1 layout):
  //   top        : H2
  //   upper-right: C2H2
  //   lower-right: C2H4
  //   lower-left : C2H6
  //   upper-left : CH4
  // ---------------------------------------------------------------------

  const GASES = ["h2", "c2h2", "c2h4", "c2h6", "ch4"]; // clockwise from top
  const GAS_LABELS = {
    h2: "H\u2082",
    ch4: "CH\u2084",
    c2h6: "C\u2082H\u2086",
    c2h4: "C\u2082H\u2084",
    c2h2: "C\u2082H\u2082",
  };

  // Pentagon vertex angles, clockwise from top (−90° = straight up).
  function vertexAngle(i) {
    return (-90 + i * 72) * (Math.PI / 180);
  }

  // Unit direction vectors for each of the 5 axes (from centre to vertex).
  const AXIS_DIR = GASES.map((_, i) => {
    const a = vertexAngle(i);
    return { x: Math.cos(a), y: Math.sin(a) };
  });

  function percentages(h2, ch4, c2h6, c2h4, c2h2) {
    const vals = { h2, ch4, c2h6, c2h4, c2h2 };
    const sum = h2 + ch4 + c2h6 + c2h4 + c2h2;
    const pct = {};
    GASES.forEach((g) => {
      pct[g] = sum > 0 ? (vals[g] / sum) * 100 : 0;
    });
    return pct;
  }

  // Compute the centroid of the 5-point polygon formed by plotting each
  // gas's percentage (0-100) outward along its axis (radius scaled so
  // 100% reaches the pentagon's vertex radius). This centroid position
  // (as fractions of the vertex radius, in x/y) is what determines the
  // fault zone.
  function centroidXY(pct) {
    let cx = 0,
      cy = 0;
    GASES.forEach((g, i) => {
      const r = pct[g] / 100; // 0..1 fraction of vertex radius
      cx += AXIS_DIR[i].x * r;
      cy += AXIS_DIR[i].y * r;
    });
    cx /= 5;
    cy /= 5;
    return { x: cx, y: cy };
  }

  // Convert centroid (x,y) in unit-radius pentagon space to polar
  // (radius 0..~1, angle in degrees, 0 = up, clockwise).
  function toPolar(x, y) {
    const r = Math.sqrt(x * x + y * y);
    let deg = Math.atan2(x, -y) * (180 / Math.PI); // 0 = up, clockwise positive
    if (deg < 0) deg += 360;
    return { r, deg };
  }

  // ---------------------------------------------------------------------
  // Zone classification from (r, angle) of the centroid.
  //
  // Angle sectors are centred on each gas vertex (72° wide each),
  // boundaries at the midpoints between adjacent gas vertices:
  //   H2 vertex   : 0°   -> sector [-36, 36)   => (-36 => 324)
  //   C2H2 vertex : 72°  -> sector [36, 108)
  //   C2H4 vertex : 144° -> sector [108, 180)
  //   C2H6 vertex : 216° -> sector [180, 252)
  //   CH4 vertex  : 288° -> sector [252, 324)
  //
  // Within each sector, radius thresholds separate PD / D1 / D2 / T1 /
  // T2 / T3 / DT per the published Duval Pentagon 1 zone map. The exact
  // curved boundaries of the official pentagon are approximated here
  // with straight radius/angle cuts — this is a best-effort
  // reconstruction from memory, not a digitization of the official
  // chart.
  // ---------------------------------------------------------------------

  function classifyFromPolar(r, deg) {
    // Small central region around the origin: low-energy / PD-like
    // region dominated by H2, very low overall radius -> PD.
    if (r < 0.06) {
      return "PD";
    }

    // Normalize angle into the sector relative to nearest vertex and
    // identify which "wedge" (between which two gases) the point falls.
    // Sector centers (deg): H2=0, C2H2=72, C2H4=144, C2H6=216, CH4=288
    const inSector = (center, half) => {
      let d = deg - center;
      d = ((d + 180) % 360) - 180; // wrap to [-180,180)
      return Math.abs(d) < half;
    };

    // --- H2 vertex sector (around 0°): PD dominant region extends here
    if (inSector(0, 36)) {
      if (r < 0.15) return "PD";
      return "D1";
    }

    // --- Between H2 and C2H2 (partial discharge -> D1 transition), and
    //     C2H2 vertex sector (around 72°): discharge zones D1/D2
    if (inSector(72, 36)) {
      if (r < 0.13) return "PD";
      if (r < 0.40) return "D1";
      return "D2";
    }

    // --- Between C2H2 and C2H4 (around 108°-144°): D2 / DT boundary
    if (inSector(144, 36)) {
      if (r < 0.13) return "PD";
      if (deg < 144) {
        // closer to C2H2 side
        if (r < 0.35) return "D1";
        return "D2";
      } else {
        // closer to C2H4 side -> thermal mixed with discharge
        if (r < 0.30) return "T3";
        return "DT";
      }
    }

    // --- C2H6 / C2H4 region (around 180°-216°): thermal faults
    if (inSector(216, 36)) {
      if (r < 0.15) return "T1";
      if (r < 0.35) return "T2";
      return "T3";
    }

    // --- Between C2H6 and CH4 wedge (around 216°-288°), and CH4 vertex:
    //     low-temperature thermal faults T1/T2
    if (inSector(288, 36)) {
      if (r < 0.15) return "T1";
      if (r < 0.40) return "T2";
      return "T1";
    }

    // --- Between CH4 and H2 (around 324°-360°): T1 / DT mixed
    {
      if (r < 0.15) return "T1";
      if (r < 0.35) return "T1";
      return "DT";
    }
  }

  function classify(h2, ch4, c2h6, c2h4, c2h2) {
    const pct = percentages(h2, ch4, c2h6, c2h4, c2h2);
    const { x, y } = centroidXY(pct);
    const { r, deg } = toPolar(x, y);
    return classifyFromPolar(r, deg);
  }

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------

  const NS = "http://www.w3.org/2000/svg";

  function el(name, attrs, parent) {
    const e = document.createElementNS(NS, name);
    if (attrs) {
      for (const k in attrs) {
        e.setAttribute(k, attrs[k]);
      }
    }
    if (parent) parent.appendChild(e);
    return e;
  }

  const ZONE_COLORS = {
    PD: "#a6d8f0",
    D1: "#f4a6a6",
    D2: "#e07b7b",
    DT: "#f0c988",
    T1: "#c9e6a6",
    T2: "#9fd46a",
    T3: "#6fae3f",
  };

  function render(svg, sample) {
    // Clear existing content.
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const cx = 300,
      cy = 320;
    const R = 220; // outer vertex radius in px

    el("rect", { x: 0, y: 0, width: 600, height: 600, fill: "#ffffff" }, svg);

    // Outer pentagon vertices.
    const vertices = GASES.map((g, i) => {
      const a = vertexAngle(i);
      return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
    });

    // --- Build approximate zone polygons by sampling the classifier on
    // a polar grid and grouping points — this guarantees the drawn
    // zones are always consistent with classify(), even though the
    // boundaries are approximate straight-line reconstructions.
    const zoneGroup = el("g", {}, svg);

    const RING_STEPS = 60; // radial resolution
    const ANGLE_STEPS = 360; // angular resolution (1 deg)

    // For each angle, walk outward and record the radius at which the
    // zone changes, then build a filled "ring segment" polygon per zone
    // per angle step. For performance/simplicity, build per-angle thin
    // wedges (triangular strips) colored by zone — this is cheap (360
    // wedges) and renders a smooth-looking pentagon zone map.
    for (let a = 0; a < ANGLE_STEPS; a++) {
      const deg0 = a;
      const deg1 = a + 1;
      // Walk outward in small radius steps, drawing small quad patches
      // colored by the zone at the midpoint. This yields a reasonably
      // smooth filled map without needing closed-form boundary curves.
      for (let s = 0; s < RING_STEPS; s++) {
        const r0 = s / RING_STEPS;
        const r1 = (s + 1) / RING_STEPS;
        const rMid = (r0 + r1) / 2;
        const degMid = deg0 + 0.5;
        const zone = classifyFromPolar(rMid, degMid);
        const color = ZONE_COLORS[zone] || "#dddddd";

        // radius scaling: convert unit-circle-ish r into actual pixel
        // radius along the pentagon boundary direction for this angle.
        // We approximate the pentagon edge radius at a given angle by
        // interpolating linearly between the two bounding vertices'
        // radius (R) projected — since all vertices are at radius R
        // from centre in our construction (axis-based, not true
        // polygon-edge), using R directly for the local max radius is
        // the correct convention for a Duval-style pentagon (radial,
        // not edge-clipped).
        const toXY = (r, deg) => {
          const rad = (deg * Math.PI) / 180;
          // deg: 0 = up, clockwise
          const dx = Math.sin(rad);
          const dy = -Math.cos(rad);
          return { x: cx + dx * r * R, y: cy + dy * r * R };
        };

        const p0 = toXY(r0, deg0);
        const p1 = toXY(r1, deg0);
        const p2 = toXY(r1, deg1);
        const p3 = toXY(r0, deg1);

        el(
          "polygon",
          {
            points: `${p0.x},${p0.y} ${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`,
            fill: color,
            stroke: color,
            "stroke-width": "0.6",
          },
          zoneGroup
        );
      }
    }

    // Outer pentagon outline on top of the zone fill.
    const outlinePts = vertices.map((v) => `${v.x},${v.y}`).join(" ");
    el(
      "polygon",
      {
        points: outlinePts,
        fill: "none",
        stroke: "#333333",
        "stroke-width": "2.5",
      },
      svg
    );

    // Axis lines from centre to each vertex.
    vertices.forEach((v) => {
      el(
        "line",
        {
          x1: cx,
          y1: cy,
          x2: v.x,
          y2: v.y,
          stroke: "#666666",
          "stroke-width": "1",
        },
        svg
      );
    });

    // Gridlines: concentric pentagons at 20/40/60/80/100% radius.
    [0.2, 0.4, 0.6, 0.8, 1.0].forEach((frac) => {
      const pts = GASES.map((g, i) => {
        const a = vertexAngle(i);
        const x = cx + R * frac * Math.cos(a);
        const y = cy + R * frac * Math.sin(a);
        return `${x},${y}`;
      }).join(" ");
      el(
        "polygon",
        {
          points: pts,
          fill: "none",
          stroke: "#999999",
          "stroke-width": "0.75",
          "stroke-dasharray": "3,3",
        },
        svg
      );
    });

    // Zone labels — place near representative centroid of each zone's
    // approximate sector.
    const zoneLabelPos = {
      PD: { r: 0.05, deg: 0 },
      D1: { r: 0.25, deg: 36 },
      D2: { r: 0.45, deg: 90 },
      DT: { r: 0.55, deg: 180 },
      T3: { r: 0.6, deg: 216 },
      T2: { r: 0.35, deg: 252 },
      T1: { r: 0.25, deg: 306 },
    };
    const labelGroup = el("g", {}, svg);
    for (const zone in zoneLabelPos) {
      const { r, deg } = zoneLabelPos[zone];
      const rad = (deg * Math.PI) / 180;
      const dx = Math.sin(rad);
      const dy = -Math.cos(rad);
      const x = cx + dx * r * R;
      const y = cy + dy * r * R;
      el(
        "text",
        {
          x,
          y,
          "text-anchor": "middle",
          "dominant-baseline": "middle",
          "font-size": "16",
          "font-weight": "bold",
          "font-family": "Arial, sans-serif",
          fill: "#1a1a1a",
        },
        labelGroup
      ).textContent = zone;
    }

    // Axis / gas name labels, positioned just outside each vertex.
    GASES.forEach((g, i) => {
      const a = vertexAngle(i);
      const lx = cx + (R + 30) * Math.cos(a);
      const ly = cy + (R + 30) * Math.sin(a);
      let anchor = "middle";
      if (Math.cos(a) > 0.3) anchor = "start";
      else if (Math.cos(a) < -0.3) anchor = "end";
      el(
        "text",
        {
          x: lx,
          y: ly,
          "text-anchor": anchor,
          "dominant-baseline": "middle",
          "font-size": "18",
          "font-weight": "600",
          "font-family": "Arial, sans-serif",
          fill: "#000000",
        },
        svg
      ).textContent = GAS_LABELS[g];
    });

    // Title.
    el(
      "text",
      {
        x: 300,
        y: 30,
        "text-anchor": "middle",
        "font-size": "20",
        "font-weight": "bold",
        "font-family": "Arial, sans-serif",
        fill: "#111111",
      },
      svg
    ).textContent = "Duval Pentagon 1";

    // Sample point.
    if (sample) {
      const pct = percentages(
        sample.h2,
        sample.ch4,
        sample.c2h6,
        sample.c2h4,
        sample.c2h2
      );
      const { x, y } = centroidXY(pct);
      const px = cx + x * R;
      const py = cy + y * R;

      el(
        "circle",
        {
          cx: px,
          cy: py,
          r: 7,
          fill: "#ffffff",
          stroke: "#000000",
          "stroke-width": "2.5",
        },
        svg
      );
      el(
        "circle",
        {
          cx: px,
          cy: py,
          r: 2.5,
          fill: "#000000",
        },
        svg
      );

      const zone = classify(
        sample.h2,
        sample.ch4,
        sample.c2h6,
        sample.c2h4,
        sample.c2h2
      );
      el(
        "text",
        {
          x: px,
          y: py - 14,
          "text-anchor": "middle",
          "font-size": "14",
          "font-weight": "bold",
          "font-family": "Arial, sans-serif",
          fill: "#000000",
          stroke: "#ffffff",
          "stroke-width": "3",
          "paint-order": "stroke",
        },
        svg
      ).textContent = zone;
    }

    // Legend.
    const legendOrder = ["PD", "D1", "D2", "DT", "T1", "T2", "T3"];
    const legendGroup = el("g", {}, svg);
    legendOrder.forEach((zone, i) => {
      const lx = 20;
      const ly = 480 + i * 18;
      el(
        "rect",
        {
          x: lx,
          y: ly - 10,
          width: 12,
          height: 12,
          fill: ZONE_COLORS[zone],
          stroke: "#555555",
          "stroke-width": "0.5",
        },
        legendGroup
      );
      el(
        "text",
        {
          x: lx + 18,
          y: ly,
          "font-size": "12",
          "font-family": "Arial, sans-serif",
          fill: "#222222",
        },
        legendGroup
      ).textContent = zoneName(zone);
    });
  }

  function zoneName(code) {
    const names = {
      PD: "PD — Partial discharges",
      D1: "D1 — Low-energy discharges",
      D2: "D2 — High-energy discharges",
      DT: "DT — Mixed thermal/electrical",
      T1: "T1 — Thermal fault < 300\u00b0C",
      T2: "T2 — Thermal fault 300-700\u00b0C",
      T3: "T3 — Thermal fault > 700\u00b0C",
    };
    return names[code] || code;
  }

  window.DuvalPentagon = {
    classify: classify,
    render: render,
  };
})();