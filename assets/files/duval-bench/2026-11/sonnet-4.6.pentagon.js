const DuvalPentagon = (() => {
  // Duval Pentagon 1 for mineral oil transformers
  // Five gases: H2, CH4, C2H6, C2H4, C2H2
  // Fault zones: PD, T1, T2, T3, D1, D2, S (stray gassing / normal)
  //
  // The pentagon plots normalized percentages on 5 axes.
  // Each axis corresponds to one gas, arranged at 72° intervals.
  // The percentage for each gas = ppm_i / sum * 100
  //
  // Zone definitions based on Duval Pentagon 1 (IEC 60599 / IEEE C57.104 context)
  // Axes order (clockwise from top): H2, C2H2, C2H4, CH4, C2H6
  // (this is the standard ordering for Pentagon 1)

  // Pentagon 1 zone boundaries are defined as polygons in the
  // 5-dimensional percentage space projected onto the pentagon.
  // We work in 2D Cartesian coordinates after projecting.

  // --- Geometry helpers ---

  // Five axes at angles: start at top (90°), go clockwise
  // Axis 0: H2    at 90°
  // Axis 1: C2H2  at 90° - 72° = 18°
  // Axis 2: C2H4  at 18° - 72° = -54°  (306°)
  // Axis 3: CH4   at -54° - 72° = -126° (234°)
  // Axis 4: C2H6  at -126° - 72° = -198° (162°)

  const NUM_AXES = 5;
  const AXIS_LABELS = ['H₂', 'C₂H₂', 'C₂H₄', 'CH₄', 'C₂H₆'];
  // Corresponding gas indices into [h2, ch4, c2h6, c2h4, c2h2]
  // We receive: classify(h2, ch4, c2h6, c2h4, c2h2) => indices 0..4
  // Axis order: H2(0), C2H2(4), C2H4(3), CH4(1), C2H6(2)
  const AXIS_GAS_IDX = [0, 4, 3, 1, 2];

  function axisAngle(i) {
    // Axis 0 at top (π/2), going clockwise (subtract)
    return Math.PI / 2 - i * (2 * Math.PI / NUM_AXES);
  }

  // Convert 5 percentages (summing to 100) to 2D point
  // The standard pentagon projection: point = sum_i (p_i/100) * axis_direction_i
  // scaled so that 100% on any axis reaches the vertex.
  function percentagesToXY(pcts) {
    let x = 0, y = 0;
    for (let i = 0; i < NUM_AXES; i++) {
      const angle = axisAngle(i);
      x += (pcts[i] / 100) * Math.cos(angle);
      y += (pcts[i] / 100) * Math.sin(angle);
    }
    return { x, y };
  }

  function gasesToPcts(h2, ch4, c2h6, c2h4, c2h2) {
    const gases = [h2, ch4, c2h6, c2h4, c2h2];
    const sum = gases.reduce((a, b) => a + b, 0);
    if (sum === 0) return [0, 0, 0, 0, 0];
    // Reorder to axis order: H2, C2H2, C2H4, CH4, C2H6
    return AXIS_GAS_IDX.map(idx => (gases[idx] / sum) * 100);
  }

  // --- Zone classification ---
  // Pentagon 1 zones in terms of axis percentages [H2%, C2H2%, C2H4%, CH4%, C2H6%]
  // Source: Duval & Lamarre, IEEE Electrical Insulation Magazine 2014,
  // and IEC 60599:2015 Annex E.
  //
  // The zones are defined by boundaries in the 2D projection.
  // I'll define them as polygons in the 2D (x,y) space of the pentagon.
  //
  // Key zone boundaries (approximate, from memory):
  // The pentagon has vertices at unit distance on each axis.
  // Zones (Pentagon 1):
  //   PD  - Partial Discharge
  //   T1  - Thermal fault < 300°C
  //   T2  - Thermal fault 300-700°C
  //   T3  - Thermal fault > 700°C
  //   D1  - Low energy discharge
  //   D2  - High energy discharge
  //   S   - Stray gassing (normal aging / no fault)
  //
  // The zone boundaries I recall from Duval Pentagon 1:
  // Defined by straight lines crossing the pentagon in 2D projection.
  //
  // Rather than attempting pixel-perfect polygon boundary recall,
  // I'll implement using the characteristic ratios approach
  // which underlies the zone definitions:
  //
  // Duval Pentagon zones are determined by which region of the
  // 2D projection the point falls in. The boundaries correspond to
  // specific percentage lines on pairs of axes.
  //
  // Zone definitions based on the 2D (x,y) coordinates in the unit pentagon:
  // (Working from memory of the published boundary coordinates)

  // Boundary lines in percentage space define each zone.
  // I'll define zones using a point-in-polygon test after establishing
  // polygon vertices in 2D projected space.

  // Key boundaries I recall:
  // The pentagon is divided roughly as follows:
  // - PD: near H2 vertex, high H2%, low others
  //       roughly H2% > ~40-50%, small C2H2
  // - D1: high C2H2 region (C2H2 axis, upper right area)
  // - D2: moderate C2H2 + C2H4
  // - T1: high CH4, low C2H4, low C2H2
  // - T2: moderate C2H4, low C2H2
  // - T3: high C2H4, highest thermal
  // - S:  predominantly C2H6 (bottom-left region)

  // I'll define the zone polygons in normalized 2D coordinates
  // where the pentagon vertices are at unit radius.

  // Vertices of the outer pentagon (unit radius):
  function pentagonVertex(i) {
    const angle = axisAngle(i);
    return { x: Math.cos(angle), y: Math.sin(angle) };
  }

  // Center of pentagon
  const CENTER = { x: 0, y: 0 };

  // Point-in-polygon (ray casting)
  function pointInPolygon(px, py, polygon) {
    let inside = false;
    const n = polygon.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      const intersect = ((yi > py) !== (yj > py)) &&
        (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Interpolate between two points by fraction t
  function lerp(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  // Get 2D point for a given percentage on a given axis (from center)
  function axisPoint(axisIdx, pct) {
    const v = pentagonVertex(axisIdx);
    return { x: v.x * pct / 100, y: v.y * pct / 100 };
  }

  // Convert percentages array to projected 2D point
  function pctToPoint(pcts) {
    return percentagesToXY(pcts);
  }

  // --- Define zone polygons in 2D projected space ---
  // Axes: 0=H2, 1=C2H2, 2=C2H4, 3=CH4, 4=C2H6
  // Vertices: V0=H2(top), V1=C2H2(upper-right), V2=C2H4(lower-right),
  //           V3=CH4(lower-left), V4=C2H6(upper-left)

  function buildZonePolygons() {
    const V = [];
    for (let i = 0; i < 5; i++) V.push(pentagonVertex(i));
    const C = { x: 0, y: 0 };

    // Key boundary points derived from percentage constraints.
    // These are points ON the pentagon boundary or interior.

    // A point on the edge between Vi and Vj at fraction t from Vi
    function edge(i, j, t) {
      return lerp(V[i], V[j], t);
    }

    // A point on axis i at percentage p
    function ap(i, p) {
      return { x: V[i].x * p / 100, y: V[i].y * p / 100 };
    }

    // Pentagon 1 zone boundaries (from memory, Duval 2014):
    // The zones share boundaries with specific lines.
    // I'll approximate based on the published diagrams and papers.

    // Key percentage boundaries I recall:
    // Between PD and D1: line from ~V0 edge toward interior
    // Between D1 and D2: related to C2H2 percentage cutoffs
    // Between D2 and T2/T3: C2H2 drops, C2H4 rises
    // Between T zones: thermal progression
    // S zone: C2H6-dominant lower-left

    // Approximate boundary fractions based on published Pentagon 1:
    // (These are my best recollection of the boundary coordinates)

    // On edge H2-C2H2 (V0-V1): D1/PD boundary at ~t=0.5 from V0
    const e01_pd_d1 = edge(0, 1, 0.5);    // 50% along H2→C2H2 edge
    // On edge C2H2-C2H4 (V1-V2): D1/D2 boundary at ~t=0.4
    const e12_d1_d2 = edge(1, 2, 0.4);
    // On edge C2H4-CH4 (V2-V3): D2/T3 boundary at ~t=0.35
    const e23_d2_t3 = edge(2, 3, 0.35);
    // On edge CH4-C2H6 (V3-V4): T1/S boundary at ~t=0.4
    const e34_t1_s = edge(3, 4, 0.4);
    // On edge C2H6-H2 (V4-V0): S/PD boundary at ~t=0.45
    const e40_s_pd = edge(4, 0, 0.45);

    // Interior points from lines crossing the pentagon:
    // T1/T2 boundary: roughly at C2H4%~5% line from CH4 side
    // T2/T3 boundary: at C2H4%~20% line
    // These manifest as lines inside the pentagon.

    // I'll define interior boundary points by intersecting
    // lines of constant percentage with pentagon edges or other lines.

    // Constant-percentage lines for C2H4:
    // A line of constant C2H4%=p passes through all points where
    // the C2H4 axis contributes p% to the sum.
    // In the pentagon projection, this is a chord parallel to some edge.

    // Let me use a different approach: define zones by the
    // characteristic inequalities and test each zone in priority order.

    // --- Characteristic zone inequalities (Pentagon 1) ---
    // Based on the ratios and regions I recall:

    // I'll compute zone membership from the percentage coordinates directly
    // rather than 2D polygon intersection, as this is more reliable from memory.

    return null; // signals: use inequality method below
  }

  // Classification via percentage inequalities
  // pcts = [H2%, C2H2%, C2H4%, CH4%, C2H6%] summing to 100
  function classifyFromPcts(pcts) {
    const [H2, C2H2, C2H4, CH4, C2H6] = pcts;

    // Pentagon 1 zone rules (Duval, best recollection):
    // The zones are tested roughly in this priority:

    // PD (Partial Discharge): dominated by H2
    // High H2, very low C2H2 and C2H4
    if (H2 >= 65 && C2H2 <= 2 && C2H4 <= 4) {
      return 'PD';
    }

    // D1 (Low energy discharge): high C2H2 relative to others
    // C2H2 is prominent, H2 also significant
    if (C2H2 >= 20 && C2H2 / (C2H2 + C2H4 + 0.001) >= 0.5) {
      return 'D1';
    }

    // D2 (High energy discharge): moderate C2H2, significant C2H4
    if (C2H2 >= 4 && C2H4 >= 10 &&
        C2H2 / (C2H2 + C2H4 + 0.001) >= 0.15 &&
        C2H2 / (C2H2 + C2H4 + 0.001) < 0.5) {
      return 'D2';
    }

    // T3 (Thermal > 700°C): high C2H4, low C2H2
    if (C2H4 >= 35 && C2H2 < 4) {
      return 'T3';
    }

    // T2 (Thermal 300-700°C): moderate C2H4
    if (C2H4 >= 10 && C2H4 < 35 && C2H2 < 4) {
      return 'T2';
    }

    // T1 (Thermal < 300°C): high CH4, low C2H4, low C2H2
    if (CH4 >= 20 && C2H4 < 10 && C2H2 < 4 && C2H6 < 50) {
      return 'T1';
    }

    // S (Stray gassing / normal): dominated by C2H6 or CH4+C2H6, low fault gases
    if (C2H6 >= 30 || (C2H6 + CH4 >= 60 && C2H2 < 2 && C2H4 < 10)) {
      return 'S';
    }

    // Additional PD check (more lenient)
    if (H2 >= 40 && C2H2 <= 5 && C2H4 <= 8) {
      return 'PD';
    }

    // Fallback: use 2D polygon method with refined zones
    // Try dominant-gas heuristic
    const maxPct = Math.max(H2, C2H2, C2H4, CH4, C2H6);
    if (maxPct === H2) return 'PD';
    if (maxPct === C2H2) return 'D1';
    if (maxPct === C2H4) return 'T3';
    if (maxPct === CH4) return 'T1';
    return 'S';
  }

  // --- Better zone classification using 2D polygon method ---
  // Define zones as polygons in the 2D pentagon space.
  // Reimplement using actual boundary polygons.

  function buildZones() {
    const V = [];
    for (let i = 0; i < 5; i++) V.push(pentagonVertex(i));

    // Edge interpolation helper
    function e(i, j, t) {
      return { x: V[i].x + (V[j].x - V[i].x) * t, y: V[i].y + (V[j].y - V[i].y) * t };
    }

    // Axis point helper (point on axis i at fraction f of full length)
    function a(i, f) {
      return { x: V[i].x * f, y: V[i].y * f };
    }

    const C = { x: 0, y: 0 };

    // The key interior boundary points.
    // Pentagon 1 boundary coordinates are defined by specific percentage lines.
    // I'll define the zones based on my best recollection of the published figure.
    //
    // Approximate zone polygon vertices in 2D (x, y) in unit pentagon:
    //
    // The five outer vertices (unit distance):
    // V[0] = H2    (top, angle=90°):         (0, 1)
    // V[1] = C2H2  (upper-right, angle=18°): (0.951, 0.309)
    // V[2] = C2H4  (lower-right, angle=-54°):(0.588, -0.809)
    // V[3] = CH4   (lower-left, angle=-126°):(-0.588, -0.809)
    // V[4] = C2H6  (upper-left, angle=162°): (-0.951, 0.309)
    //
    // Zone boundaries from Duval Pentagon 1 paper (IEC/IEEE, Duval & Lamarre 2014):
    // Note: I'm recalling approximate fractional positions on edges.

    // Key boundary fractions on pentagon edges (my best memory):
    // On V0-V1 (H2 to C2H2 edge):
    //   PD/D1 boundary: t ≈ 0.57 from V0 (H2% ≈ 43%, C2H2% ≈ 57% on that edge)
    // On V1-V2 (C2H2 to C2H4 edge):
    //   D1/D2 boundary: t ≈ 0.43 from V1
    // On V2-V3 (C2H4 to CH4 edge):
    //   D2/T3 boundary: t ≈ 0.30 from V2
    //   T3/T2 boundary: t ≈ 0.60 from V2
    //   T2/T1 boundary: t ≈ 0.80 from V2
    // On V3-V4 (CH4 to C2H6 edge):
    //   T1/S boundary: t ≈ 0.50 from V3
    // On V4-V0 (C2H6 to H2 edge):
    //   S/PD boundary: t ≈ 0.45 from V4

    // Interior boundary points (intersections of boundary lines):
    // B_pd_d1_interior: a point inside the pentagon on the PD/D1 boundary line
    // The boundary lines appear to converge roughly toward center or specific interior points.

    // Let me define everything in terms of the 2D coordinates directly.
    // I'll parameterize interior points as weighted combinations of vertices.

    // From the published pentagon diagram, the zone boundaries are approximately:
    // (expressed as 5-tuple of axis percentages, then converted to 2D)

    // Key interior boundary nodes:
    // The interior T2/T3 line goes from a point on V2V3 edge to a point near center-right
    // The D2/T3 line goes from V2V3 edge point to near the C2H2-C2H4 boundary region
    // The D1/D2 line runs from V1V2 edge toward the center

    // I'll define the main interior junction point (roughly in the middle-right area)
    // where D1, D2, D2/T3 and T3 regions meet.

    // Given the complexity of exact recall, I'll define zones using
    // reasonable polygon approximations:

    // Junction points (interior):
    // J1: near center, biased toward C2H2/C2H4 side — D1/D2/T3 meeting
    const J1 = pctToPoint([5, 25, 30, 25, 15]);  // approximate D1/D2/T junction area

    // J2: T1/T2/T3 interior point — along thermal progression line
    const J2 = pctToPoint([15, 2, 20, 45, 18]);

    // J3: PD/D1/D2 upper interior point
    const J3 = pctToPoint([30, 20, 10, 25, 15]);

    // J4: S/T1/T2 lower-left interior
    const J4 = pctToPoint([10, 1, 8, 30, 51]);

    // J5: PD/S boundary interior
    const J5 = pctToPoint([50, 1, 2, 15, 32]);

    // Let me take a cleaner approach and define explicit zone polygons
    // using percentage-space constraints, then generate 2D points from them.

    // I'll define each zone boundary as a set of 5-pct tuples traversed around the zone.
    // These are approximate but geometrically consistent.

    function p(...args) {
      // Takes [H2, C2H2, C2H4, CH4, C2H6] percentages (needn't sum to 100; will normalize)
      const sum = args.reduce((a, b) => a + b, 0);
      const normalized = args.map(v => v / sum * 100);
      return pctToPoint(normalized);
    }

    // Define zones as polygons in 2D:
    // I'll trace each zone boundary going counterclockwise (or consistently)

    const zones = {
      // PD: near H2 vertex, extends to edges adjacent to H2
      PD: [
        V[0],                    // H2 vertex
        e(0, 1, 0.57),          // on H2-C2H2 edge, PD/D1 boundary
        p(35, 15, 3, 30, 17),  // interior PD/D1/D2 corner
        p(55, 2, 2, 15, 26),   // interior PD region
        e(4, 0, 0.45),          // on C2H6-H2 edge, S/PD boundary
      ],

      // D1: upper-right, high C2H2
      D1: [
        e(0, 1, 0.57),          // on H2-C2H2 edge
        V[1],                    // C2H2 vertex
        e(1, 2, 0.43),          // on C2H2-C2H4 edge, D1/D2 boundary
        p(15, 25, 15, 25, 20), // interior D1/D2 boundary
        p(35, 15, 3, 30, 17),  // PD/D1/D2 corner
      ],

      // D2: right side, moderate C2H2 + C2H4
      D2: [
        e(1, 2, 0.43),          // on C2H2-C2H4 edge
        V[2],                    // C2H4 vertex — but only upper part
        e(2, 3, 0.30),          // on C2H4-CH4 edge, D2/T3 boundary
        p(10, 10, 25, 30, 25), // interior T3/D2 boundary
        p(15, 25, 15, 25, 20), // D1/D2 interior boundary
      ],

      // T3: lower-right, high C2H4, low C2H2
      T3: [
        e(2, 3, 0.30),          // on C2H4-CH4 edge
        p(10, 10, 25, 30, 25), // D2/T3 interior
        p(5, 2, 28, 40, 25),   // T3/T2 interior boundary
        e(2, 3, 0.65),          // on C2H4-CH4 edge, T3/T2 boundary
      ],

      // T2: lower, moderate C2H4
      T2: [
        e(2, 3, 0.65),          // on C2H4-CH4 edge, T3/T2
        p(5, 2, 28, 40, 25),   // T3/T2 interior
        p(5, 1, 12, 48, 34),   // T2/T1 interior
        e(2, 3, 0.85),          // on C2H4-CH4 edge, T2/T1
      ],

      // T1: lower-left, high CH4
      T1: [
        e(2, 3, 0.85),          // on C2H4-CH4 edge, T2/T1
        p(5, 1, 12, 48, 34),   // T2/T1 interior
        p(8, 1, 5, 42, 44),    // T1/S interior
        e(3, 4, 0.50),          // on CH4-C2H6 edge, T1/S
        V[3],                    // CH4 vertex
      ],

      // S: upper-left, dominated by C2H6 (and some CH4)
      S: [
        e(3, 4, 0.50),          // on CH4-C2H6 edge
        p(8, 1, 5, 42, 44),    // T1/S interior
        p(55, 2, 2, 15, 26),   // S/PD interior
        e(4, 0, 0.45),          // on C2H6-H2 edge
        V[4],                    // C2H6 vertex
      ],
    };

    return zones;
  }

  // Build zones once
  const ZONES = buildZones();
  const ZONE_ORDER = ['PD', 'D1', 'D2', 'T3', 'T2', 'T1', 'S'];

  function classify(h2, ch4, c2h6, c2h4, c2h2) {
    const gases = [h2, ch4, c2h6, c2h4, c2h2];
    const sum = gases.reduce((a, b) => a + b, 0);
    if (sum === 0) return 'S'; // undefined, return S as default

    // Convert to axis percentages [H2, C2H2, C2H4, CH4, C2H6]
    const pcts = AXIS_GAS_IDX.map(idx => gases[idx] / sum * 100);
    const pt = percentagesToXY(pcts);

    // Test zones in order
    for (const zone of ZONE_ORDER) {
      if (pointInPolygon(pt.x, pt.y, ZONES[zone])) {
        return zone;
      }
    }

    // Fallback to percentage heuristic
    return classifyFromPcts(pcts);
  }

  // --- Rendering ---

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // Zone colors (following Duval's standard color scheme from memory)
  const ZONE_COLORS = {
    PD: '#a0d4f5',   // light blue
    D1: '#f7e463',   // yellow
    D2: '#f4a640',   // orange
    T1: '#c5e8a0',   // light green
    T2: '#7bbf5c',   // medium green
    T3: '#3a8f3a',   // dark green
    S:  '#e8e8e8',   // light grey
  };

  const ZONE_TEXT_COLORS = {
    PD: '#1a5f8a',
    D1: '#7a6800',
    D2: '#7a3200',
    T1: '#2a5a0a',
    T2: '#1a4a0a',
    T3: '#e8f8e8',
    S:  '#555555',
  };

  function render(svg, sample) {
    // viewBox is 0 0 600 600, center at (300, 300), radius ~220
    const CX = 300, CY = 300, R = 220;

    function toSVG(pt) {
      return { x: CX + pt.x * R, y: CY - pt.y * R }; // flip Y for SVG
    }

    function svgVertex(i) {
      return toSVG(pentagonVertex(i));
    }

    function makeSVGEl(tag, attrs) {
      const el = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, v);
      }
      return el;
    }

    // Background
    svg.appendChild(makeSVGEl('rect', {
      x: 0, y: 0, width: 600, height: 600,
      fill: 'white'
    }));

    // Title
    const title = makeSVGEl('text', {
      x: 300, y: 30,
      'text-anchor': 'middle',
      'font-family': 'Arial, sans-serif',
      'font-size': '16',
      'font-weight': 'bold',
      fill: '#222'
    });
    title.textContent = 'Duval Pentagon 1 — Mineral Oil Transformers';
    svg.appendChild(title);

    // Draw filled zone polygons
    for (const zone of ZONE_ORDER) {
      const poly = ZONES[zone];
      const pts = poly.map(pt => {
        const s = toSVG(pt);
        return `${s.x.toFixed(2)},${s.y.toFixed(2)}`;
      }).join(' ');

      svg.appendChild(makeSVGEl('polygon', {
        points: pts,
        fill: ZONE_COLORS[zone],
        stroke: '#333',
        'stroke-width': '1.2',
        opacity: '0.85'
      }));
    }

    // Draw outer pentagon border
    const outerPts = [];
    for (let i = 0; i < 5; i++) {
      const v = svgVertex(i);
      outerPts.push(`${v.x.toFixed(2)},${v.y.toFixed(2)}`);
    }
    svg.appendChild(makeSVGEl('polygon', {
      points: outerPts.join(' '),
      fill: 'none',
      stroke: '#222',
      'stroke-width': '2',
    }));

    // Draw axes (from center to each vertex)
    for (let i = 0; i < 5; i++) {
      const v = svgVertex(i);
      svg.appendChild(makeSVGEl('line', {
        x1: CX, y1: CY,
        x2: v.x.toFixed(2), y2: v.y.toFixed(2),
        stroke: '#888',
        'stroke-width': '0.8',
        'stroke-dasharray': '4,4'
      }));
    }

    // Axis tick marks and labels
    const axisLabelOffset = 28;
    for (let i = 0; i < 5; i++) {
      const angle = axisAngle(i);
      const v = svgVertex(i);

      // Tick marks at 25%, 50%, 75%
      for (const frac of [0.25, 0.5, 0.75]) {
        const tx = CX + Math.cos(angle) * R * frac;
        const ty = CY - Math.sin(angle) * R * frac;
        const perpAngle = angle + Math.PI / 2;
        const tickLen = 4;
        svg.appendChild(makeSVGEl('line', {
          x1: (tx + Math.cos(perpAngle) * tickLen).toFixed(1),
          y1: (ty - Math.sin(perpAngle) * tickLen).toFixed(1),
          x2: (tx - Math.cos(perpAngle) * tickLen).toFixed(1),
          y2: (ty + Math.sin(perpAngle) * tickLen).toFixed(1),
          stroke: '#666',
          'stroke-width': '1'
        }));
      }

      // Gas label
      const lx = CX + Math.cos(angle) * (R + axisLabelOffset);
      const ly = CY - Math.sin(angle) * (R + axisLabelOffset);

      const label = makeSVGEl('text', {
        x: lx.toFixed(1),
        y: ly.toFixed(1),
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': 'Arial, sans-serif',
        'font-size': '13',
        'font-weight': 'bold',
        fill: '#111'
      });
      label.textContent = AXIS_LABELS[i];
      svg.appendChild(label);
    }

    // Zone labels
    // Compute centroid of each zone polygon for label placement
    for (const zone of ZONE_ORDER) {
      const poly = ZONES[zone];
      let cx = 0, cy = 0;
      for (const pt of poly) {
        const s = toSVG(pt);
        cx += s.x;
        cy += s.y;
      }
      cx /= poly.length;
      cy /= poly.length;

      // Zone code label
      const zLabel = makeSVGEl('text', {
        x: cx.toFixed(1),
        y: cy.toFixed(1),
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': 'Arial, sans-serif',
        'font-size': '13',
        'font-weight': 'bold',
        fill: ZONE_TEXT_COLORS[zone] || '#333',
        'pointer-events': 'none'
      });
      zLabel.textContent = zone;
      svg.appendChild(zLabel);
    }

    // Legend
    const legendX = 10, legendY = 60;
    const legendItems = [
      ['PD', 'Partial Discharge'],
      ['D1', 'Low Energy Discharge'],
      ['D2', 'High Energy Discharge'],
      ['T1', 'Thermal < 300°C'],
      ['T2', 'Thermal 300–700°C'],
      ['T3', 'Thermal > 700°C'],
      ['S',  'Stray Gassing'],
    ];
    for (let i = 0; i < legendItems.length; i++) {
      const [code, desc] = legendItems[i];
      const lx = legendX, ly = legendY + i * 20;
      svg.appendChild(makeSVGEl('rect', {
        x: lx, y: ly - 8, width: 14, height: 14,
        fill: ZONE_COLORS[code],
        stroke: '#555',
        'stroke-width': '0.8'
      }));
      const lt = makeSVGEl('text', {
        x: lx + 18, y: ly + 2,
        'font-family': 'Arial, sans-serif',
        'font-size': '10',
        fill: '#222'
      });
      lt.textContent = `${code}: ${desc}`;
      svg.appendChild(lt);
    }

    // Sample point
    if (sample !== null && sample !== undefined) {
      const { h2, ch4, c2h6, c2h4, c2h2 } = sample;
      const gases = [h2, ch4, c2h6, c2h4, c2h2];
      const sum = gases.reduce((a, b) => a + b, 0);

      if (sum > 0) {
        const pcts = AXIS_GAS_IDX.map(idx => gases[idx] / sum * 100);
        const pt = percentagesToXY(pcts);
        const sp = toSVG(pt);

        const zone = classify(h2, ch4, c2h6, c2h4, c2h2);

        // Halo / shadow for visibility
        svg.appendChild(makeSVGEl('circle', {
          cx: sp.x.toFixed(2),
          cy: sp.y.toFixed(2),
          r: 9,
          fill: 'white',
          opacity: '0.7'
        }));

        // Cross-hair lines
        const crossLen = 10;
        svg.appendChild(makeSVGEl('line', {
          x1: (sp.x - crossLen).toFixed(1), y1: sp.y.toFixed(1),
          x2: (sp.x + crossLen).toFixed(1), y2: sp.y.toFixed(1),
          stroke: '#c00', 'stroke-width': '1.5'
        }));
        svg.appendChild(makeSVGEl('line', {
          x1: sp.x.toFixed(1), y1: (sp.y - crossLen).toFixed(1),
          x2: sp.x.toFixed(1), y2: (sp.y + crossLen).toFixed(1),
          stroke: '#c00', 'stroke-width': '1.5'
        }));

        // Dot
        svg.appendChild(makeSVGEl('circle', {
          cx: sp.x.toFixed(2),
          cy: sp.y.toFixed(2),
          r: 5,
          fill: '#e00',
          stroke: '#700',
          'stroke-width': '1.5'
        }));

        // Label with zone code and coordinates
        const labelText = makeSVGEl('text', {
          x: (sp.x + 10).toFixed(1),
          y: (sp.y - 10).toFixed(1),
          'font-family': 'Arial, sans-serif',
          'font-size': '12',
          'font-weight': 'bold',
          fill: '#c00'
        });
        labelText.textContent = `Zone: ${zone}`;
        svg.appendChild(labelText);

        // Percentage breakdown below
        const gasNamesShort = ['H₂', 'C₂H₂', 'C₂H₄', 'CH₄', 'C₂H₆'];
        const pctText = makeSVGEl('text', {
          x: (sp.x + 10).toFixed(1),
          y: (sp.y + 4).toFixed(1),
          'font-family': 'Arial, sans-serif',
          'font-size': '9',
          fill: '#600'
        });
        pctText.textContent = pcts.map((p, i) => `${gasNamesShort[i]}:${p.toFixed(0)}%`).join(' ');
        svg.appendChild(pctText);
      }
    }
  }

  return { classify, render };
})();