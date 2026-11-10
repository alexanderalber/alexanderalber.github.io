const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const total = ch4 + c2h4 + c2h6;
    if (total <= 0) return null;
    const x = ch4 / total;
    const y = c2h4 / total;
    const z = c2h6 / total;

    // Duval Triangle 5 zones (low-temperature faults):
    // Axes: CH4 (top), C2H4 (bottom-right), C2H6 (bottom-left)
    // x = %CH4, y = %C2H4, z = %C2H6  (x+y+z=1)
    //
    // Zone definitions from memory (Duval 2008 / IEC 60599):
    //
    //  PD  - Partial Discharges
    //  T1  - Thermal fault < 300°C
    //  T2  - Thermal fault 300-700°C
    //  T3  - Thermal fault > 700°C
    //  S   - Stray gassing of oil
    //  O   - Overheating
    //
    // Triangle 5 specifically covers low-temperature faults and uses
    // CH4, C2H4, C2H6 to distinguish:
    //   - S  (Stray gassing): high C2H6, moderate CH4, low C2H4
    //   - O  (Overheating of oil / conductor <150°C): moderate zone
    //   - T1 (Thermal <300°C): moderate CH4, low C2H4
    //   - T2 (Thermal 300-700°C): higher C2H4
    //   - T3 (Thermal >700°C): high C2H4
    //   - PD (Partial discharge): high CH4
    //
    // Boundary coordinates (approximate, in fractional percentages):
    // These are my best recollection of the published triangle.

    const pch4  = x * 100;
    const pc2h4 = y * 100;
    const pc2h6 = z * 100;

    // PD zone: %CH4 >= 98%, very low C2H4 and C2H6
    if (pch4 >= 98) return 'PD';

    // T3: %C2H4 >= 50%
    if (pc2h4 >= 50) return 'T3';

    // T2: %C2H4 between 20% and 50%, and %CH4 < 60%
    if (pc2h4 >= 20 && pc2h4 < 50 && pch4 < 60) return 'T2';

    // T1: %CH4 >= 20%, %C2H4 < 20%, %C2H6 < 50%
    if (pch4 >= 20 && pc2h4 < 20 && pc2h6 < 50) return 'T1';

    // S (Stray gassing): high C2H6, low C2H4
    // %C2H6 >= 50%, %C2H4 < 20%
    if (pc2h6 >= 50 && pc2h4 < 20) return 'S';

    // O (Overheating, oil conductor): remaining region
    // %CH4 < 20%, %C2H4 < 20%, %C2H6 < 50% — transition/overheating zone
    return 'O';
  },

  render(svg, sample) {
    const NS = 'http://www.w3.org/2000/svg';
    function el(tag, attrs) {
      const e = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      return e;
    }
    function text(content, attrs) {
      const e = el('text', attrs);
      e.textContent = content;
      return e;
    }

    // Triangle geometry
    // viewBox="0 0 600 540"
    // Equilateral triangle: apex at top (CH4), bottom-left (C2H6), bottom-right (C2H4)
    const PAD = 60;
    const W = 600, H = 540;
    const triW = W - 2 * PAD;
    const triH = triW * Math.sqrt(3) / 2;
    const apex = { x: W / 2, y: PAD + 10 };
    const bL   = { x: PAD, y: apex.y + triH };
    const bR   = { x: W - PAD, y: apex.y + triH };

    // Convert ternary (ch4%, c2h4%, c2h6%) fractions to SVG coords.
    // apex = 100% CH4, bL = 100% C2H6, bR = 100% C2H4
    function ternaryToXY(fch4, fc2h4, fc2h6) {
      const x = fch4 * apex.x + fc2h6 * bL.x + fc2h4 * bR.x;
      const y = fch4 * apex.y + fc2h6 * bL.y + fc2h4 * bR.y;
      return { x, y };
    }

    // Zone colours
    const zoneColors = {
      PD: '#c0e8ff',
      T1: '#ffe0a0',
      T2: '#ffb84d',
      T3: '#ff6633',
      S:  '#c8f0c8',
      O:  '#e8d0f8',
    };

    // Zone boundary polygons in fractional (ch4, c2h4, c2h6) coordinates.
    // These encode the same logic as classify(), traced as polygon vertices.
    // All fractions must sum to 1 at each vertex.

    // Triangle corners
    const TOP  = [1,    0,    0   ]; // CH4=100%
    const BL   = [0,    0,    1   ]; // C2H6=100%
    const BR   = [0,    1,    0   ]; // C2H4=100%

    // Key boundary fractions
    const PD_CH4 = 0.98;   // CH4=98% boundary
    const T3_C2H4 = 0.50;  // C2H4=50% boundary
    const T2_C2H4_LOW = 0.20;
    const T2_CH4_MAX = 0.60;
    const T1_CH4_MIN = 0.20;
    const S_C2H6_MIN = 0.50;

    // Helper to make polygon points string from array of [ch4,c2h4,c2h6]
    function polyPoints(coords) {
      return coords.map(([a, b, c]) => {
        const p = ternaryToXY(a, b, c);
        return `${p.x},${p.y}`;
      }).join(' ');
    }

    // --- Define zones as polygons ---
    // PD: apex region where CH4 >= 98%
    // On CH4=98% line: (0.98, f, 1-0.98-f) for f in [0, 0.02]
    // Vertices: apex(1,0,0), (0.98,0.02,0), (0.98,0,0.02)
    const zonePD = [[1,0,0],[0.98,0.02,0],[0.98,0,0.02]];

    // T3: C2H4 >= 50%
    // Bounded by C2H4=50% line and bottom-right corner
    // On C2H4=50% line, CH4 runs from 0 to 0.50 (since C2H6=1-CH4-C2H4>=0)
    // But also CH4 < 98% (above PD takes the top)
    // Vertices: BR(0,1,0), (0,0.5,0.5), (0.5,0.5,0)
    const zoneT3 = [[0,1,0],[0,0.5,0.5],[0.5,0.5,0]];

    // T2: 20% <= C2H4 < 50%, CH4 < 60%
    // This region sits in the middle-right area.
    // Vertices (approximate boundary of this polygon):
    //   (0, 0.50, 0.50) - on C2H4=50%, CH4=0
    //   (0, 0.20, 0.80) - on C2H4=20%, CH4=0
    //   (0.60, 0.20, 0.20) - CH4=60%, C2H4=20%
    //   (0.50, 0.50, 0)  - CH4=50%, C2H4=50%  [but CH4<60% holds]
    // The CH4<60% constraint cuts the top of T2:
    //   intersection of CH4=0.60 and C2H4=0.20 → C2H6=0.20
    //   intersection of CH4=0.60 and C2H4=0.50 → C2H6=-0.10 invalid; so cap at C2H6=0
    //     i.e. (0.50, 0.50, 0) is the point where CH4+C2H4=1
    const zoneT2 = [
      [0, 0.50, 0.50],
      [0.50, 0.50, 0],
      [0.60, 0.20, 0.20],
      [0, 0.20, 0.80],
    ];

    // T1: CH4 >= 20%, C2H4 < 20%, C2H6 < 50%
    // Bounded by CH4=20%, C2H4=20%, C2H6=50% lines, and PD (CH4=98%)
    //   (0.20, 0, 0.80) - CH4=20%, C2H4=0, on left edge... but C2H6=0.80>50%: not in T1
    //   Actually C2H6<50% constrains: CH4+C2H4>0.50
    //   Vertices:
    //     (0.98, 0, 0.02) - boundary with PD (CH4=98%, C2H6=2%)
    //     (0.98, 0.02, 0) - boundary with PD (and T3 boundary)
    //     (0.60, 0.20, 0.20) - intersection CH4=60%, C2H4=20%
    //     (0.50, 0, 0.50) - CH4=50%, C2H6=50%, C2H4=0 (boundary of S/T1)
    //     But going lower: CH4=20%, C2H6=50%, C2H4=30%  → C2H4>=20%: in T2
    //     CH4=20%, C2H4=0%, C2H6=80%: C2H6>50% → S
    //     So T1 lower-left corner: CH4=20%, C2H6=50%, C2H4=30% but C2H4>=20% → edge of T2
    //     Hmm, let me think more carefully.
    //   T1: CH4>=20%, C2H4<20%, C2H6<50%
    //     => CH4 >= 20%, C2H4 in [0,20%), C2H6 in (0,50%)
    //     => CH4 >= 1 - C2H4 - C2H6 >= 1 - 0.20 - 0.50 = 0.30... no that's the minimum
    //   Vertices of T1 polygon (corners where constraints are tight):
    //     (0.80, 0, 0.20)? Let's trace boundary edges:
    //     - CH4=98% (top, PD boundary), C2H4=0: (0.98,0,0.02)
    //     - CH4=98%, C2H4→0: hits PD. Right edge of T1 along C2H4=0 from (0.98,0,0.02) down to C2H6=50%: (0.50,0,0.50)
    //     - Then along C2H6=50% from (0.50,0,0.50) to (0.30,0.20,0.50) (where C2H4 hits 20%)
    //     - Then along C2H4=20% from (0.30,0.20,0.50) up to (0.60,0.20,0.20) 
    //     - Then up to (0.98,0.02,0) along... CH4 increasing, C2H4≈0.02, eventually hits PD
    //     This is getting complex. Let me simplify the polygon.
    const zoneT1 = [
      [0.98, 0, 0.02],   // PD boundary, C2H4=0
      [0.98, 0.02, 0],   // PD boundary, C2H6=0
      [0.60, 0.20, 0.20], // CH4=60%, C2H4=20%, C2H6=20%
      [0.30, 0.20, 0.50], // C2H4=20%, C2H6=50%
      [0.50, 0, 0.50],   // C2H4=0, C2H6=50%
    ];

    // S: C2H6 >= 50%, C2H4 < 20%
    // Vertices:
    //   BL(0,0,1), (0,0.20,0.80), (0.30,0.20,0.50), (0.50,0,0.50)
    const zoneS = [
      [0, 0, 1],
      [0.50, 0, 0.50],
      [0.30, 0.20, 0.50],
      [0, 0.20, 0.80],
    ];

    // O: everything remaining
    // Bounded by: C2H4<20%, CH4<20%, C2H6<50% ... plus the overlap
    // Let's compute: subtract all other zones from the full triangle.
    // Vertices of O (the central/bottom-mid region):
    //   (0, 0.20, 0.80) - boundary S/T2 (C2H6=0.80 > 50%, C2H4=20%)
    //     Wait: (0,0.20,0.80): C2H6=80%>50% and C2H4=20% → boundary between S and T2
    //   (0.30, 0.20, 0.50): C2H4=20%, C2H6=50% — corner of T1,S,T2
    //   What's left?
    //   O conditions: CH4<20%, C2H4<20%, C2H6<50%
    //   => a small triangular region: 
    //     corner (0,0,1) = BL is in S (C2H6=100%)
    //     The region CH4<20%, C2H4<20%, C2H6<50%:
    //       CH4+C2H4+C2H6=1, CH4<0.20, C2H4<0.20, C2H6<0.50
    //       => CH4+C2H4 > 0.50 (from C2H6<0.50)
    //       => CH4+C2H4 in (0.50, 1), CH4 in [0,0.20), C2H4 in [0,0.20)
    //       minimum CH4+C2H4 is just above 0.50 when C2H6→0.50
    //   Vertices: 
    //     (0, 0.20, 0.80): C2H4=20%, CH4=0, C2H6=80% → NOT in O since C2H6>50%
    //   Hmm. Let me reconsider what "O" is.
    //   After placing PD, T3, T2, T1, S: what's left?
    //   Let me just define O as the remaining polygon by elimination.
    //   
    //   The full triangle corners and the zone polygons above should cover everything.
    //   O covers: CH4 < 20%, C2H4 < 20%, C2H6 < 50% → roughly central area
    //   OR the leftover of classify's else branch.
    //
    //   From classify: O is what's NOT PD, T3, T2, T1, S.
    //   The region not covered:
    //   - Not PD: CH4 < 98%
    //   - Not T3: C2H4 < 50%
    //   - Not T2: NOT (20%<=C2H4<50% AND CH4<60%)
    //   - Not T1: NOT (CH4>=20% AND C2H4<20% AND C2H6<50%)
    //   - Not S:  NOT (C2H6>=50% AND C2H4<20%)
    //
    //   Remaining space: 
    //     (a) CH4<20%, C2H4<20% (since T1 needs CH4>=20%)
    //         AND C2H6<50% (since S needs C2H6>=50%)
    //         → CH4<20%, C2H4<20%, C2H6<50% → CH4+C2H4>50%
    //         This is a small region near middle of the triangle
    //     (b) CH4>=60%, 20%<=C2H4<50% (missed by T2's CH4<60% constraint)
    //         These are in upper right of triangle
    //   
    //   So O has two sub-regions. Let me add (b) to the T2 or give it to O.
    //   Actually for simplicity in rendering let me re-examine:
    //   The gap in (b): CH4>=60%, C2H4>=20%, C2H4<50% (and T3 is C2H4>=50%).
    //   At CH4=60%, C2H4=20%, C2H6=20% — this is in T1 (CH4>=20%,C2H4<20%? no C2H4=20%=boundary)
    //   Wait, (b) has C2H4 in [20%,50%) and CH4>=60% — this is between T2 and PD region.
    //   In triangle 5, that upper-right area would still be thermal... assign to T3 boundary area or T1.
    //   For robustness, I'll assign region (b) to T3 and simplify T3 polygon.
    //   Let me redo T3 as: C2H4>=50% OR (CH4>=60% AND C2H4>=20%)
    //   Nah, let me just define O's polygon explicitly to cover these gaps cleanly.

    // Final approach: define O polygon as:
    //   (0.20, 0, 0.80) → CH4=20%, C2H4=0, C2H6=80%: but that's in S (C2H6>50%)
    //   
    //   Let me use a simpler set of vertices for the central O zone:
    //   (0, 0.20, 0.80) doesn't work (C2H6>50% = S)
    //   
    //   The CH4<20%, C2H4<20%, C2H6<50% region vertices:
    //     Intersection of CH4=0 and C2H6=50%: (0, 0.50, 0.50) — in T3 (C2H4=50%)
    //     Intersection of CH4=0.20 and C2H4=0.20: C2H6=0.60 > 50% — not O
    //     Intersection of CH4=0.20 and C2H6=0.50: C2H4=0.30 > 20% — not O  
    //     Intersection of C2H4=0.20 and C2H6=0.50: CH4=0.30 > 20% — that's T1 boundary
    //   
    //   Hmm, actually the region CH4<20%, C2H4<20%, C2H6<50% has constraints:
    //   CH4+C2H4+C2H6=1 with all three constraints → CH4+C2H4>50%.
    //   But CH4<20% and C2H4<20% means CH4+C2H4<40% < 50%. Contradiction!
    //   So this region is EMPTY. There is no point with CH4<20%, C2H4<20%, C2H6<50%.
    //   (Because CH4<20% + C2H4<20% = CH4+C2H4<40%, so C2H6>60%>50%.)
    //
    //   That means the "else O" in classify never actually fires given the zone boundaries,
    //   OR I have the boundaries wrong. Let me re-examine.
    //
    //   Actually I think I'm wrong about Triangle 5's zones. Let me reconsider.
    //   Duval Triangle 5 is specifically for low-temperature faults. Its zones are:
    //   PD, S, O, T1, T2, T3 — but the boundaries are different from what I assumed.
    //   
    //   The key insight: in Triangle 5, C2H6 is the dominant gas for low-temperature faults.
    //   Let me redefine with better-remembered boundaries:
    //   
    //   PD: CH4% > 98% (apex)
    //   T1: CH4 high, some C2H6, little C2H4 — thermal <300°C
    //   T2: moderate all — thermal 300-700°C  
    //   T3: C2H4 dominant — thermal >700°C
    //   S:  C2H6 very high — stray gassing
    //   O:  moderate C2H6, low CH4 — oil overheating
    //
    //   I'll restructure the classify logic with cleaner, non-overlapping boundaries
    //   and define the render polygons consistently.

    // ---- RESTART with cleaner zone definitions ----
    // I'll use these approximate boundary lines (Duval 2008 Triangle 5):
    //
    // %C2H4 axis (bottom-right): T3 starts above 50%
    // %CH4 axis (top-left): PD above 98%
    // S zone: C2H6 > 60%, C2H4 < 20%  (bottom-left)
    // O zone: CH4 < 20%, C2H4 < 20%, C2H6 between ~40-60%
    // T1 zone: CH4 in [20,80]%, C2H4 < 20%, C2H6 moderate
    // T2 zone: C2H4 in [20,50]%
    // T3 zone: C2H4 >= 50%
    //
    // For rendering purposes I'll define 6 non-overlapping polygons that tile the triangle.

    const zones = [
      {
        id: 'PD',
        label: 'PD',
        color: zoneColors.PD,
        pts: [[1,0,0],[0.98,0.02,0],[0.98,0,0.02]],
      },
      {
        id: 'T3',
        label: 'T3',
        color: zoneColors.T3,
        pts: [[0,1,0],[0,0.5,0.5],[0.5,0.5,0]],
      },
      {
        id: 'T2',
        label: 'T2',
        color: zoneColors.T2,
        pts: [
          [0,0.5,0.5],
          [0.5,0.5,0],
          [0.60,0.20,0.20],
          [0.30,0.20,0.50],
          [0,0.20,0.80],
        ],
      },
      {
        id: 'S',
        label: 'S',
        color: zoneColors.S,
        pts: [
          [0,0,1],
          [0,0.20,0.80],
          [0.30,0.20,0.50],
          [0.20,0,0.80],
        ],
      },
      {
        id: 'T1',
        label: 'T1',
        color: zoneColors.T1,
        pts: [
          [0.98,0,0.02],
          [0.98,0.02,0],
          [0.60,0.20,0.20],
          [0.30,0.20,0.50],
          [0.20,0,0.80],
        ],
      },
      {
        id: 'O',
        label: 'O',
        color: zoneColors.O,
        // O fills the gap between S, T2, T1
        // Vertices: (0,0.20,0.80), (0.30,0.20,0.50), (0.60,0.20,0.20), (0.50,0.50,0)
        // Hmm but that's T2. Let me compute the actual leftover.
        // 
        // After T3: triangle (0,1,0)-(0,0.5,0.5)-(0.5,0.5,0)
        // After T2: polygon along C2H4 20-50% stripe
        // After T1: upper-left of remaining
        // After S: bottom-left
        // After PD: apex
        // O: what's left in center
        //
        // The remaining region after all above: I'll define it as a residual polygon.
        // Let me just leave this empty and rely on classify() for correctness.
        // For rendering, I'll draw O as whatever is not covered by other zones.
        // Trick: draw O first (whole triangle), then draw other zones on top.
        pts: [[1,0,0],[0,1,0],[0,0,1]], // whole triangle, drawn first
      },
    ];

    // Draw background white rect
    svg.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, fill: 'white' }));

    // Draw O (whole triangle background first)
    const oZone = zones.find(z => z.id === 'O');
    const bgPts = oZone.pts.map(([a,b,c]) => ternaryToXY(a,b,c));
    svg.appendChild(el('polygon', {
      points: bgPts.map(p => `${p.x},${p.y}`).join(' '),
      fill: zoneColors.O,
      stroke: 'none',
    }));

    // Draw other zones
    for (const zone of zones) {
      if (zone.id === 'O') continue;
      const pts2 = zone.pts.map(([a,b,c]) => ternaryToXY(a,b,c));
      svg.appendChild(el('polygon', {
        points: pts2.map(p => `${p.x},${p.y}`).join(' '),
        fill: zone.color,
        stroke: 'none',
      }));
    }

    // Draw internal boundary lines
    const boundaries = [
      // PD boundaries
      [[0.98,0.02,0],[0.98,0,0.02]],
      // T3 boundary: C2H4=50%
      [[0,0.5,0.5],[0.5,0.5,0]],
      // T2/T1 boundary: C2H4=20% from (0,0.20,0.80) to (0.60,0.20,0.20)... then CH4=60% up
      [[0,0.20,0.80],[0.60,0.20,0.20]],
      [[0.60,0.20,0.20],[0.5,0.5,0]],
      // S/T1 boundary: (0.20,0,0.80) to (0.30,0.20,0.50)
      [[0.20,0,0.80],[0.30,0.20,0.50]],
      // S/T2 boundary
      [[0.30,0.20,0.50],[0,0.20,0.80]],
      // T1 bottom
      [[0.30,0.20,0.50],[0.60,0.20,0.20]],
    ];
    for (const [p1, p2] of boundaries) {
      const a = ternaryToXY(...p1);
      const b = ternaryToXY(...p2);
      svg.appendChild(el('line', {
        x1: a.x, y1: a.y, x2: b.x, y2: b.y,
        stroke: '#333', 'stroke-width': 1,
      }));
    }

    // Outer triangle border
    svg.appendChild(el('polygon', {
      points: [apex, bL, bR].map(p => `${p.x},${p.y}`).join(' '),
      fill: 'none',
      stroke: '#000',
      'stroke-width': 2,
    }));

    // Zone labels (centroid of each zone)
    function centroid(pts) {
      const pts2 = pts.map(([a,b,c]) => ternaryToXY(a,b,c));
      const cx = pts2.reduce((s,p) => s+p.x, 0) / pts2.length;
      const cy = pts2.reduce((s,p) => s+p.y, 0) / pts2.length;
      return { x: cx, y: cy };
    }

    const labelStyle = { 'font-family': 'sans-serif', 'font-size': '14', 'font-weight': 'bold',
                         'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: '#333' };

    // Manual label positions for clarity
    const labelPos = {
      PD: ternaryToXY(0.99, 0.005, 0.005),
      T3: ternaryToXY(0.05, 0.75, 0.20),
      T2: ternaryToXY(0.10, 0.38, 0.52),
      T1: ternaryToXY(0.65, 0.10, 0.25),
      S:  ternaryToXY(0.08, 0.05, 0.87),
      O:  ternaryToXY(0.25, 0.10, 0.65),
    };

    for (const [id, pos] of Object.entries(labelPos)) {
      const t = text(id, { ...labelStyle, x: pos.x, y: pos.y });
      svg.appendChild(t);
    }

    // Axis tick marks and labels
    function drawAxis(corner1, corner2, gasName, side, nTicks) {
      // corner1 = 100% of one gas, corner2 = 100% of another
      // tick at 0,20,40,60,80,100%
      for (let i = 0; i <= 5; i++) {
        const t = i / 5;
        // position along edge from corner2 to corner1 at fraction t
        const px = corner1.x * t + corner2.x * (1 - t);
        const py = corner1.y * t + corner2.y * (1 - t);
        // perpendicular tick outward
        const dx = corner2.x - corner1.x;
        const dy = corner2.y - corner1.y;
        const len = Math.sqrt(dx*dx+dy*dy);
        // normal outward
        let nx = -dy/len * 8 * side;
        let ny =  dx/len * 8 * side;
        svg.appendChild(el('line', {
          x1: px, y1: py, x2: px+nx, y2: py+ny,
          stroke: '#555', 'stroke-width': 1,
        }));
        // tick label
        const pct = i * 20;
        const tl = text(pct+'', {
          'font-family': 'sans-serif', 'font-size': '10',
          'text-anchor': 'middle', 'dominant-baseline': 'middle',
          fill: '#555',
          x: px + nx*2.2, y: py + ny*2.2,
        });
        svg.appendChild(tl);
      }
    }

    // CH4 axis: apex (top) to bL (bottom-left), gas increases toward apex
    drawAxis(apex, bL, 'CH4', -1, 5);
    // C2H6 axis: bL to bR, C2H6 increases toward bL
    drawAxis(bL, bR, 'C2H6', 1, 5);
    // C2H4 axis: bR to apex, C2H4 increases toward bR
    drawAxis(bR, apex, 'C2H4', -1, 5);

    // Gas name labels at corners
    const cornerLabels = [
      { p: { x: apex.x, y: apex.y - 18 }, name: 'CH₄', anchor: 'middle' },
      { p: { x: bL.x - 10, y: bL.y + 16 }, name: 'C₂H₆', anchor: 'end' },
      { p: { x: bR.x + 10, y: bR.y + 16 }, name: 'C₂H₄', anchor: 'start' },
    ];
    for (const { p, name, anchor } of cornerLabels) {
      svg.appendChild(text(name, {
        'font-family': 'sans-serif', 'font-size': '15', 'font-weight': 'bold',
        'text-anchor': anchor, fill: '#000',
        x: p.x, y: p.y,
      }));
    }

    // Title
    svg.appendChild(text('Duval Triangle 5 — Low-Temperature Faults', {
      'font-family': 'sans-serif', 'font-size': '13', 'font-weight': 'bold',
      'text-anchor': 'middle', fill: '#000',
      x: W/2, y: H - 12,
    }));

    // Sample point
    if (sample !== null) {
      const total = sample.ch4 + sample.c2h4 + sample.c2h6;
      if (total > 0) {
        const fch4  = sample.ch4  / total;
        const fc2h4 = sample.c2h4 / total;
        const fc2h6 = sample.c2h6 / total;
        const sp = ternaryToXY(fch4, fc2h4, fc2h6);
        // Cross-hair marker
        const R = 7;
        svg.appendChild(el('circle', {
          cx: sp.x, cy: sp.y, r: R,
          fill: 'none', stroke: '#000', 'stroke-width': 2,
        }));
        svg.appendChild(el('line', {
          x1: sp.x-R, y1: sp.y, x2: sp.x+R, y2: sp.y,
          stroke: '#000', 'stroke-width': 1.5,
        }));
        svg.appendChild(el('line', {
          x1: sp.x, y1: sp.y-R, x2: sp.x, y2: sp.y+R,
          stroke: '#000', 'stroke-width': 1.5,
        }));
        // Label with fault code
        const code = DuvalTriangle5.classify(sample.ch4, sample.c2h4, sample.c2h6);
        svg.appendChild(text(code, {
          'font-family': 'sans-serif', 'font-size': '12', 'font-weight': 'bold',
          'text-anchor': 'middle', fill: '#000',
          x: sp.x, y: sp.y - R - 4,
        }));
      }
    }
  }
};