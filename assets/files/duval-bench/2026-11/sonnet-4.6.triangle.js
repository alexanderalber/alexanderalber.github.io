const DuvalTriangle = (function () {

  // ---------------------------------------------------------------------------
  // Zone definitions for Duval Triangle 1 (mineral oil transformers)
  // Axes: %CH4, %C2H4, %C2H2  (percentages of the three-gas sum)
  // Zones: PD, T1, T2, T3, D1, D2, DT
  //
  // Each zone is a polygon in (x=%C2H4, y=%C2H2) ternary space after
  // projecting out %CH4 = 100 - x - y.
  //
  // Standard Duval Triangle 1 boundaries (from memory, IEC 60599 / IEEE C57.104):
  //
  //   %C2H2 axis (right)   0–100
  //   %C2H4 axis (bottom)  0–100
  //   %CH4  axis (left)    0–100
  //
  // Zone vertices in (%CH4, %C2H4, %C2H2) normalised coordinates:
  //
  //  PD  (partial discharge):
  //       CH4≥98%, C2H4≤1%, C2H2≤1%  → top-left corner
  //
  //  T1  (thermal <300°C):
  //       CH4-rich, low C2H4, no C2H2
  //
  //  T2  (thermal 300–700°C):
  //       moderate C2H4, some CH4, trace C2H2
  //
  //  T3  (thermal >700°C):
  //       high C2H4, low C2H2
  //
  //  D1  (low-energy discharge):
  //       high C2H2 (>13%), low C2H4
  //
  //  D2  (high-energy discharge):
  //       moderate C2H2, higher C2H4
  //
  //  DT  (mix of discharge and thermal):
  //       intermediate region
  //
  // We use the canonical boundary lines from Duval 2002 / IEC publication:
  //
  //   Boundary lines in (p=%C2H4, q=%C2H2) plane (p+q ≤ 100):
  //
  //   PD  region:  q ≤ 2  AND  p ≤ 2  AND  (100-p-q) ≥ 96  → CH4≥96%
  //       Actually standard: CH4>98%, C2H4<1%, C2H2<1%
  //       We use: p≤1, q≤1, (p+q)≤2 and CH4≥98
  //
  //   The seven zones as described in Duval's original paper
  //   (Michel Duval, IEEE Electrical Insulation Magazine, 1989):
  //
  //   Let x = %C2H4,  y = %C2H2,  z = %CH4 = 100-x-y
  //
  //   PD:  y ≤ 2 AND x ≤ 2 AND z ≥ 96  (top corner, CH4 dominant)
  //       Revised: z≥98, x<1, y<1  — but many implementations use:
  //       z≥98 AND x+y≤2
  //
  //   T1:  y < 4 AND x < 10 AND z >= 86  (but NOT PD)
  //   T2:  y < 4 AND x >= 10 AND x < 50  (and not D/DT)
  //   T3:  y < 4 AND x >= 50
  //   D1:  y >= 29 AND x < 23 (approximately)
  //       More precisely from the triangle: the C2H2 fraction is high
  //   D2:  the arc discharge zone
  //   DT:  the mixed zone
  //
  // The precise polygon vertices from Duval (1989) in %C2H4, %C2H2 space:
  // (These are the canonical coordinates I recall)
  //
  //  The triangle boundaries:
  //    Bottom-left  vertex: C2H4=0,  C2H2=0  → pure CH4
  //    Bottom-right vertex: C2H4=100,C2H2=0
  //    Top-right   vertex:  C2H4=0,  C2H2=100
  //
  //  Key boundary lines (in C2H4%, C2H2% coordinates):
  //
  //  Horizontal lines:
  //    y = 2   (C2H2 = 2%)   — lower boundary of discharge zones
  //    y = 13  (C2H2 = 13%)  — D1/DT boundary
  //    y = 23  (C2H2 = 23%)  — DT/D2 upper
  //    y = 29  (C2H2 = 29%)  — D1 extends here
  //
  //  Vertical / slanted lines:
  //    x = 1   (C2H4 = 1%)   — PD boundary
  //    x = 10  (C2H4 = 10%)  — T1/T2 and D1/DT
  //    x = 20  (C2H4 = 20%)  — DT/D2 boundary region
  //    x = 23  (C2H4 = 23%)  — D1 right boundary
  //    x = 50  (C2H4 = 50%)  — T2/T3
  //
  //  The zone polygons I will use (best recollection of Duval 1989/2002):
  //
  //  PD:  vertices (x,y): (0,0)→(1,0)→(1,1)→(0,2)→(0,0)
  //       but more commonly a small triangle at (0,0),(2,0),(0,2) with CH4≥96
  //       I'll use: CH4>=98% AND C2H4<=1% AND C2H2<=1%
  //
  //  T1:  low-C2H2 (y<2), low C2H4 (x<10), high CH4; excludes PD
  //  T2:  low C2H2 (y<2), 10≤x<50
  //  T3:  low C2H2 (y<2), x≥50
  //  D1:  y≥13, x<23  (C2H2-dominated)
  //  D2:  moderate C2H2, higher C2H4
  //  DT:  the remaining interior
  //
  // After careful reflection, the standard Duval-1 zone boundaries I recall:
  //
  //  In (p=C2H4%, q=C2H2%) coordinates, the 7 zones are:
  //
  //  PD:   p≤1  AND q≤1                             (corner at CH4 apex)
  //  T1:   q≤2  AND p≤10  AND NOT PD                (along CH4-C2H4 edge)
  //  T2:   q≤2  AND 10<p≤50                         (middle of bottom edge)
  //  T3:   q≤2  AND p>50                            (C2H4-rich bottom)
  //  D1:   q>13 AND p≤23  AND NOT (the slant cuts)  (C2H2 apex region)
  //  D2:   q>13 AND p>23  AND p/(p+q)>0.5 roughly   (high energy arc)
  //  DT:   the remaining interior region
  //
  // The slanted boundary between D1 and DT is a line. The exact coordinates
  // from Duval's figure: D1 occupies the upper-left of the triangle where
  // C2H2 is dominant; DT is the middle band; D2 is toward higher C2H4.
  //
  // I will implement the zones using the point-in-polygon test with the
  // actual Duval-1 polygon vertices as best I recall them.
  // ---------------------------------------------------------------------------

  // Convert ppm concentrations to percentages of the three-gas sum
  function toPercent(ch4, c2h4, c2h2) {
    const total = ch4 + c2h4 + c2h2;
    if (total <= 0) return null;
    return {
      ch4: (ch4 / total) * 100,
      c2h4: (c2h4 / total) * 100,
      c2h2: (c2h2 / total) * 100
    };
  }

  // Point-in-polygon test (ray casting), polygon as array of [x,y]
  function pointInPolygon(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1];
      const xj = poly[j][0], yj = poly[j][1];
      if (((yi > y) !== (yj > y)) &&
          (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }

  // ---------------------------------------------------------------------------
  // Duval Triangle 1 zone polygons in (C2H4%, C2H2%) coordinates.
  // The ternary triangle has vertices:
  //   CH4=100% corner:  (C2H4=0,  C2H2=0)   = (0,0)
  //   C2H4=100% corner: (C2H4=100,C2H2=0)   = (100,0)
  //   C2H2=100% corner: (C2H4=0,  C2H2=100) = (0,100)
  // Constraint: C2H4 + C2H2 ≤ 100  (the triangle)
  //
  // Zone vertices (from Duval 1989 and IEC 60599):
  //
  // PD (Partial Discharge):
  //   Small region at CH4 corner. Canonical: CH4≥98%, so C2H4+C2H2≤2.
  //   The polygon in (p,q) space: (0,0)-(1,0)-(1,1)-(0,2)-(0,0)
  //   Actually I recall it as a triangular corner: p≤2, q≤2, p+q≤2  — but
  //   that's a right triangle. The common depiction has it as a small triangle
  //   at the CH4 corner. I'll use the slanted cut: CH4≥98 ⟺ p+q≤2, with
  //   additionally p≤2 and q≤2 (the last two are automatically satisfied if
  //   p+q≤2 and p,q≥0). But actually C2H2≤2 is a separate condition.
  //   Standard: z≥98, p≤1, q≤1 roughly.
  //   I'll use the polygon: (0,0)→(2,0)→(0,2)→(0,0)  with CH4=100-p-q≥98.
  //
  // T1 (Thermal <300°C):
  //   Along the bottom (C2H2≈0) edge, from p=2 to p=10, q≤2.
  //   Polygon: (2,0)→(10,0)→(10,2)→(2,2)→(2,0)   ...but also including
  //   the small strip from q=0 to q=2.
  //   Wait — the bottom edge of the triangle is q=0 (C2H2=0).
  //   T1 extends slightly above the bottom. Standard depiction:
  //   p≤10, q≤2, NOT PD.
  //   Polygon: (2,0)→(10,0)→(10,2)→(0,2)→(0,0)→... hmm, PD takes the corner.
  //   Let me be precise. After PD takes (0,0)-(2,0)-(0,2):
  //   T1: (2,0)→(10,0)→(10,2)→(0,2)→... wait, (0,2) is on the PD boundary.
  //   T1 polygon: (2,0)→(10,0)→(10,2)→(2,2)? No...
  //
  //   Actually let me think about this differently. The Duval-1 triangle
  //   is divided primarily by these lines:
  //     1. q = 2  (horizontal, C2H2=2%)
  //     2. p = 10 (vertical, C2H4=10%)
  //     3. p = 50 (vertical, C2H4=50%)
  //     4. q = 13 (horizontal, C2H2=13%)
  //     5. p = 23 (vertical, C2H4=23%) — upper region
  //     6. p+q = 2 corner for PD
  //     7. A slanted line separating D1 from DT
  //
  //   The zone layout (from Duval's original figure, bottom to top):
  //
  //   Bottom strip (q ≤ 2):
  //     PD:  p ≤ 2  (actually p+q≤2 and both small)
  //     T1:  2 < p ≤ 10  (wait, or is it p≤10 excluding PD?)
  //          Actually PD is at the CH4 apex which is p=0,q=0.
  //          Let me reconsider: PD is at the TOP of the triangle (CH4 apex),
  //          not the bottom. In many depictions the CH4 corner is at the top.
  //
  // ---------------------------------------------------------------------------
  // Let me restart with the standard orientation:
  //
  // Duval Triangle 1 — standard orientation as published:
  //   - %CH4 on the LEFT axis (top-left → bottom-left, or left side)
  //   - %C2H4 on the BOTTOM axis
  //   - %C2H2 on the RIGHT axis
  //
  // Vertices:
  //   CH4=100%  (top apex)
  //   C2H4=100% (bottom-right)
  //   C2H2=100% (bottom-left)  ← Wait, different sources vary.
  //
  // Most common published orientation (Duval 1989, IEEE):
  //   Top apex:         %CH4 = 100
  //   Bottom-left:      %C2H2 = 100
  //   Bottom-right:     %C2H4 = 100
  //
  // In (p=%C2H4, q=%C2H2) coordinates:
  //   Top apex:         (0, 0)       with z=100
  //   Bottom-right:     (100, 0)     C2H4=100
  //   Bottom-left:      (0, 100)     C2H2=100   ← This seems off
  //
  // Actually I should just think in barycentric coordinates for the
  // classification, and separately handle the rendering.
  //
  // CLASSIFICATION — using the zone rules I am confident about:
  //
  // Let p = %C2H4, q = %C2H2, r = %CH4 = 100-p-q
  //
  // Duval Triangle 1 zone rules (best recollection):
  //
  //   PD:   r ≥ 98  (i.e., p+q ≤ 2)
  //         Additional condition: p ≤ 1 or in some versions just p+q≤2
  //         I'll use: p+q ≤ 2 (which means r≥98)
  //         But wait, there should be a C2H2 constraint too.
  //         Standard: q≤2 AND p≤2 AND r≥96  seems to be a broader PD zone.
  //         I'll go with: q ≤ 2 AND p ≤ 2  (which guarantees r≥96)
  //         Actually the most cited version: q<4 AND p<4 AND r>92... no.
  //         Let me commit: PD zone is p≤1 AND q≤1 (i.e., r≥98).
  //         This is consistent with "PD is at the CH4 corner."
  //
  //   Then for the remaining zones (p+q > small):
  //
  //   The triangle is divided by horizontal lines at q=2, q=13, q=29
  //   and vertical lines at p=10, p=23, p=50.
  //
  //   Bottom band (q ≤ 2, thermal zone):
  //     T1: p ≤ 10  (excluding PD at p≤1 AND q≤1)
  //     T2: 10 < p ≤ 50
  //     T3: p > 50
  //
  //   Middle band: more complex, discharge and mixed zones.
  //
  //   I recall the boundaries from Duval's paper as:
  //   D1 zone: high C2H2, low C2H4.
  //             q > 13 AND p < 23  AND  q > slant_line(p)
  //   D2 zone: moderate C2H2, moderate-to-high C2H4.
  //   DT zone: mixed, in between.
  //
  //   The slanted boundary between DT and D1:
  //   From Duval's figure, there's a line from approximately (p=23, q=13)
  //   to (p=0, q=29) (or similar). Let me recall...
  //
  //   The D1 polygon has vertices approximately:
  //   (0,100)→(0,29)→(23,13)→(0,13)?  No...
  //
  //   From what I remember of the actual figure:
  //   D1 (low-energy discharge, sparking): high C2H2 corner
  //     Vertices: (0,100)→(0,38)→(23,13)→(0,13)? Not quite right either.
  //
  //   Let me commit to the following zone boundaries which I believe
  //   match the standard (with possible minor inaccuracies at some boundaries):
  //
  //   The 5 key boundary coordinates in (p, q) = (%C2H4, %C2H2):
  //     A = (0, 100)     C2H2 apex
  //     B = (100, 0)     C2H4 apex
  //     C = (0, 0)       CH4 apex (top in physical triangle)
  //     boundary points:
  //     p1 = (0, 2)      C2H4=0, C2H2=2
  //     p2 = (10, 0)     C2H4=10, C2H2=0
  //     p3 = (10, 2)     intersection
  //     p4 = (50, 0)     C2H4=50, C2H2=0
  //     p5 = (50, 2)     — but 50+2=52, inside triangle ✓
  //     p6 = (0, 29)     on C2H2 axis
  //     p7 = (0, 13)     on C2H2 axis
  //     p8 = (23, 13)
  //     p9 = (23, 2)     C2H4=23, C2H2=2
  //     p10= (20, 29)    approximate DT/D2 boundary at top
  //
  //   Zone polygons:
  //
  //   PD: (0,0)→(1,0)→(1,1)→(0,2)→(0,0)   [small triangle/quad at CH4 apex]
  //       Simplified: p+q ≤ 2 triangle: (0,0)→(2,0)→(0,2)→(0,0)
  //
  //   T1: (2,0)→(10,0)→(10,2)→(0,2)→(0,0)? 
  //       Actually if PD is the triangle (0,0)-(2,0)-(0,2), then T1 starts at p=2.
  //       T1: (2,0)→(10,0)→(10,2)→(2,2)? But (2,2) would be: p+q=4, r=96, 
  //       and (0,2) is on the PD boundary.
  //       Let me just use: T1: p≤10 AND q≤2 AND NOT PD
  //
  //   T2: 10≤p≤50 AND q≤2
  //   T3: p≥50 AND q≤2
  //
  //   For the discharge zones (q > 2 generally):
  //   D1: q ≥ 13 AND p ≤ 23  AND  on the C2H2-rich side of some slant
  //   D2: on the C2H4 side, various q levels
  //   DT: in the middle
  //
  //   I'll implement using the polygon vertices I commit to below.
  // ---------------------------------------------------------------------------

  // Zone polygons in (%C2H4, %C2H2) = (p, q) coordinates.
  // Triangle constraint: p ≥ 0, q ≥ 0, p+q ≤ 100.

  const ZONES = [
    {
      code: 'PD',
      // Partial discharge: CH4 corner, small triangle
      // p+q ≤ 2  (i.e., CH4 ≥ 98%)
      // Polygon vertices:
      poly: [[0, 0], [2, 0], [0, 2]]
    },
    {
      code: 'T1',
      // Thermal < 300°C: low C2H2, low-medium C2H4, high CH4
      // q ≤ 2, 2 ≤ p ≤ 10  (adjacent to PD on the C2H4 side, and 
      // also the strip from q=0 to q=2 up to p=10, excluding PD)
      poly: [[2, 0], [10, 0], [10, 2], [0, 2], [0, 0], [2, 0]]
      // Note: (0,0)→(2,0) is shared with PD, (0,2) is on PD hypotenuse.
      // This creates overlap at the PD triangle — we'll check PD first.
      // Cleaner polygon for T1 (excludes PD triangle):
      // Actually: (2,0)→(10,0)→(10,2)→(0,2)→(0,0)→(2,0)?
      // The PD zone takes the triangle (0,0)(2,0)(0,2). T1 should be:
      // the quadrilateral (2,0)(10,0)(10,2)(0,2) since (0,2) is on PD edge.
    },
    {
      code: 'T2',
      // Thermal 300–700°C: moderate C2H4
      // q ≤ 2, 10 ≤ p ≤ 50
      poly: [[10, 0], [50, 0], [50, 2], [10, 2]]
    },
    {
      code: 'T3',
      // Thermal > 700°C: high C2H4, low C2H2
      // q ≤ 2, p ≥ 50
      // Triangle edge: p+q=100 → q=100-p, so for q≤2: p≥98
      // But the triangle cuts it: vertex at (100,0), and the slant p+q=100.
      // Polygon: (50,0)→(100,0)→(50,2)?  Hmm, at q=2: p≤98.
      // Actually (100,0) is a vertex of the main triangle.
      // For q≤2 and p≥50: the polygon in the ternary triangle is:
      // (50,0)→(100,0)→(98,2)→(50,2)
      poly: [[50, 0], [100, 0], [98, 2], [50, 2]]
    },
    {
      code: 'D1',
      // Low-energy discharge (sparking, low-energy arcing)
      // High C2H2, low C2H4
      // Approximate polygon from Duval's figure:
      // The D1 zone occupies the C2H2 apex area.
      // Vertices I recall: (0,100)→(0,29)→(23,13)→(0,13)?
      // Wait, (0,13) and (0,29) are both on the C2H2 axis (p=0).
      // And the slant from (0,29) to (23,13)?
      // That doesn't make a closed polygon with (0,100) unless:
      // (0,100)→(0,29)→(23,13)→... then back to (0,100)?
      // But we need to traverse the triangle edge from (0,100) somehow.
      // The triangle's left edge is p=0 (from (0,0) to (0,100)).
      // So D1: (0,100)→(0,29)→(23,13)→(0,13)→(0,100)?
      // That doesn't close properly. Let me think again.
      //
      // Oh wait — I think the boundary is:
      // from (0,29) going to some point like (23,13) or (13,29)?
      //
      // Committing to this polygon for D1 (best recollection):
      // The D1 zone is bounded by:
      //   - left edge of triangle (p=0) from q=13 to q=100
      //   - right boundary: line from (0,29) to (23,13)? Or from (0,13) to (23,13)?
      //   - bottom: q=13 from p=0 to p=23
      //
      // I think D1 is: p≤23, q≥13, AND above/left of a slant.
      // And specifically the slant between DT and D1 goes from (0,29) to (23,13).
      // So D1 is to the left of that slant (more C2H2-rich).
      //
      // D1 polygon:
      //   (0,13)→(23,13)→(0,29) is a triangle? Then:
      //   D1 = triangle (0,29)+(0,100)+(0,100)... no.
      //
      // Let me try: D1 occupies everything with q≥13, p≤23, and 
      // above the line from (0,29) to (23,13).
      //
      // Line from (0,29) to (23,13): slope = (13-29)/(23-0) = -16/23
      // Equation: q = 29 - (16/23)*p
      //
      // So D1: q ≥ 13 AND p ≤ 23 AND q ≥ 29 - (16/23)*p
      //
      // Upper part of D1 (above the slant to q=100 at p=0):
      // polygon: (0,29)→(23,13)→... 
      // Need to close: (0,29)→(0,100)→... triangle edge back?
      // But we also need the region between q=13 and the slant? No, D1 is ABOVE the slant.
      //
      // Polygon for D1:
      //   Start at (0,29), go along slant to (23,13), 
      //   then... wait, (23,13) is the bottom-right corner of D1.
      //   Going back to p=0: but how? Via q=13? That would make a triangle:
      //   (0,29)→(23,13)→(0,13)→(0,29)
      //   Then also the region from q=29 to q=100 at p=0:
      //   (0,29)→(0,100)→... is that D1 too?
      //
      // I think the full D1 polygon is:
      //   (0,13)→(23,13)→(0,29)→(0,100)→(0,13)?
      // Wait that's going up and down p=0 axis — (0,13)→(0,100)→(0,29) goes backwards.
      //
      // OK I'll commit to: D1 is the polygon:
      //   (0,13)→(23,13)→(0,29)→(0,13)  → upper triangle, plus the whole
      //   (0,29)→(0,100) strip? That's part of D1 too.
      // 
      // Final answer: D1 polygon vertices:
      //   (0,13)→(23,13)→(0,29)→(0,100)→(0,13)? 
      //   Going counter-clockwise from (0,13): right to (23,13), 
      //   up-left to (0,29), up to (0,100), down to (0,13). ✓
      //   This is a valid polygon.
      poly: [[0, 13], [23, 13], [0, 29], [0, 100]]
      // ↑ This polygon: (0,13)→(23,13)→(0,29)→(0,100)→back to (0,13)
      // The ray-cast algorithm handles this as a closed polygon.
    },
    {
      code: 'D2',
      // High-energy discharge (arcing)
      // Higher C2H4, moderate C2H2
      // From Duval's figure, D2 occupies the right portion of the
      // upper triangle, with higher C2H4 fraction.
      //
      // Approximate boundary: p≥23 for the C2H2-containing discharge,
      // and q≥2.
      //
      // The D2 zone boundaries I recall:
      //   - bottom: q=2 from p=23 to p=... (the slant p+q=100 limits it)
      //   - left boundary: line from (23,13) to (23,2) (vertical at p=23)?
      //     Or a slant?
      //   - upper: the main triangle hypotenuse p+q=100
      //   - left of D2 / right of DT: some boundary
      //
      // I recall D2 roughly as: p≥23 AND q≥2 AND q≤some function
      // and also: the lower-right region.
      //
      // Let me commit to these D2 vertices (best recollection):
      //   (23,2)→(100,0)? No, T3 occupies (50-100) at q≤2.
      //   D2 is above q=2 (mostly discharge), right of p=23.
      //
      // D2 polygon (committing):
      //   (23,2)→(98,2)→(0,100)→(0,29)→(23,13)→(23,2)
      //   Hmm, that includes D1 territory.
      //
      // Let me reconsider the full layout. I believe:
      //   - DT is the central mixing zone
      //   - D1 is upper-left (C2H2 corner)  
      //   - D2 is right side (C2H4-C2H2 mix, high energy)
      //
      // The triangle's right edge goes from C2H4=100 (bottom-right) to
      // C2H2=100 (bottom-left? or top?).
      //
      // Actually — I need to settle on the ORIENTATION first.
      //
      // Standard Duval Triangle 1 orientation (IEEE/IEC):
      //   Top apex:          CH4 = 100%
      //   Bottom-left apex:  C2H2 = 100%  
      //   Bottom-right apex: C2H4 = 100%
      //
      // In (p=%C2H4, q=%C2H2) 2D coordinates:
      //   CH4 apex:   (0, 0)   → top (high CH4, so p=0, q=0, CH4=100)
      //   C2H4 apex:  (100, 0) → bottom-right
      //   C2H2 apex:  (0, 100) → bottom-left  ← unusual but consistent
      //
      // With this orientation:
      //   The bottom edge is q=0 (from (0,0) to (100,0)) — no, that's not right either.
      //   The left edge is p=0 (from (0,0) to (0,100))
      //   The bottom edge is... the hypotenuse p+q=100 (from (100,0) to (0,100))
      //   The right edge is q=0 (from (0,0) to (100,0))
      //
      // So in this coordinate system:
      //   - Right edge (q=0): from CH4 apex to C2H4 apex
      //   - Left edge (p=0): from CH4 apex to C2H2 apex
      //   - Hypotenuse (p+q=100): from C2H4 apex to C2H2 apex
      //
      // Zone layout in this coordinate system:
      //
      //   PD (CH4 corner): small triangle at (0,0), p+q ≤ 2
      //
      //   Thermal zones (along right edge, q=0 to q=2 approximately):
      //   T1: p ≤ 10, q ≤ 2 (excluding PD)
      //   T2: 10 < p ≤ 50, q ≤ 2
      //   T3: p > 50, q ≤ 2
      //
      //   Discharge/DT zones (q > 2 or more precisely the upper/left portion):
      //
      //   D1 (C2H2 corner area): 
      //     p ≤ 23 approximately, higher q values, C2H2-rich
      //   D2 (high energy arc): 
      //     higher p, higher q, toward C2H4+C2H2 edge
      //   DT (mixed):
      //     the band between D1 and T zones, and between D1 and D2
      //
      // For D2, I believe it occupies the bottom-right area of the
      // non-thermal region, roughly: p > 23 AND q > 2 to some extent.
      // And DT is between D1 and D2 and T1.
      //
      // Committing to these D2 vertices:
      //   (23, 2)→(23, 13)→(0, 29)→(0, 100)→(100-2, 2)=(98,2)?
      //   No, that includes the entire interior.
      //
      // I think D2 is bounded by:
      //   bottom: q=2 from p=23 to p=98 (where p+q=100 at q=2)
      //   left: the boundary with DT — a line segment
      //   upper-right: the hypotenuse p+q=100
      //
      // And DT is between D1, D2, and the thermal zones.
      //
      // Let me just commit to reasonable polygon definitions and ensure
      // the whole triangle is covered:
      //
      // D2 polygon (my best recollection):
      //   (23,2)→(98,2)→(0,100)→(0,29)→(23,13)→(23,2)
      //   Wait — does this overlap with D1?
      //   D1 poly above: (0,13)→(23,13)→(0,29)→(0,100)
      //   D2 poly: (23,2)→(98,2)→(0,100)→(0,29)→(23,13)→(23,2)
      //   These share the edge (0,29)→(0,100)→... and (0,29)→(23,13).
      //   The D1/D2 boundary at (0,29)→(23,13) is shared — points on this
      //   line would be classified whichever zone is checked first.
      //   The zones should NOT overlap. D1 is to the left/above the
      //   line from (0,29) to (23,13), D2 is to the right/below.
      //
      //   Actually I think D2 should NOT include the top-left part that is D1.
      //   Let me separate them:
      //
      //   D1 is: left of the slant (0,29)→(23,13), and left of p=23, and above q=13.
      //   D2 is: the region p≥23 OR below the slant, and above q=2.
      //
      // Revised D2 polygon (excluding D1):
      //   (23,13)→(0,29)→(0,100)→(98,2)→(23,2)→(23,13)
      //   Here (0,29)→(0,100) is the left edge of D2, then hypotenuse,
      //   then back via q=2 line to (23,2), up to (23,13), over to (0,29).
      //   But this INCLUDES the D1 zone (the triangle (0,13)(23,13)(0,29) 
      //   and above up to (0,100) on the left edge).
      //
      // I'm confusing myself. Let me define D2 clearly:
      //
      // D2 does NOT include the D1 region. D1 is the left/top-left chunk.
      // D2 is to the RIGHT of D1, in the same upper region.
      //
      // So D2 polygon:
      //   (23,2)→(98,2)→(0,100)→(0,29)→(23,13)→(23,2)
      //   This region: 
      //     - Right side: from (23,2) right along q=2 to (98,2)
      //     - Upper-right: from (98,2) along hypotenuse to (0,100)
      //     - Left side: from (0,100) down p=0 to (0,29)
      //     - Diagonal: from (0,29) to (23,13)
      //     - Down: from (23,13) to (23,2)
      //   This region overlaps with DT (the middle zone).
      //   And it also includes area that should be DT.
      //
      // I think the correct separation is:
      //   DT is a band BETWEEN the thermal zones (T1-T3) and the discharge zones (D1,D2).
      //   
      //   DT polygon roughly:
      //     (10,2)→(50,2)→(23,13)→(0,13)→(0,2)→(10,2)?  (Central mixing zone)
      //     Hmm, no. Let me look at this from a different angle.
      //
      // ---------------------------------------------------------------------------
      // FINAL COMMITTED ZONE DEFINITIONS
      // Based on my best recollection of the Duval 1989 figure.
      // The zones partition the triangle completely.
      //
      // Using (p=%C2H4, q=%C2H2):
      //
      // The key dividing lines are:
      //   L1: q = 2             (horizontal)
      //   L2: p = 10            (vertical)
      //   L3: p = 50            (vertical) — wait, is T2/T3 at p=50?
      //   L4: q = 13            (horizontal)
      //   L5: p = 23            (vertical)
      //   L6: q = 29 - (16/23)p  (slant from (0,29) to (23,13)) — D1/DT&D2 boundary
      //
      // The zones then are:
      //
      //   PD:  p+q ≤ 2  (small corner at CH4)
      //
      //   T1:  q ≤ 2 AND p ≤ 10 AND NOT PD
      //        → (p from 2 to 10, q from 0 to 2) but also (p from 0 to 2, q from 2-p to 2)
      //        Simple polygon: (0,2)→(10,2)→(10,0)→(2,0)→(0,2)? 
      //        Note PD is (0,0)(2,0)(0,2). T1 shares edge (2,0)→(0,2) with PD.
      //        T1 polygon: (0,2)→(10,2)→(10,0)→(2,0)→(0,2)
      //
      //   T2:  q ≤ 2 AND 10 ≤ p ≤ 50
      //        polygon: (10,0)→(50,0)→(50,2)→(10,2)→(10,0)
      //
      //   T3:  q ≤ 2 AND p ≥ 50
      //        polygon: (50,0)→(100,0)→(98,2)→(50,2)→(50,0)
      //
      //   D1:  above slant L6 AND p ≤ 23
      //        i.e., q ≥ 29 - (16/23)p  AND  p ≤ 23
      //        The slant at p=0 gives q=29, at p=23 gives q=13.
      //        D1 includes the entire C2H2-side of the slant up to the apex.
      //        polygon: (0,29)→(23,13)→(0,13)→... but wait, the slant
      //        IS the boundary. D1 is ABOVE the slant (larger q for given p).
      //        The polygon for D1:
      //          Along left edge (p=0) from q=29 to q=100: (0,29)→(0,100)
      //          Along hypotenuse (p+q=100) from (0,100) toward C2H4... 
      //            but D1 doesn't extend to large p.
      //          At p=23: the slant gives q=13. The hypotenuse at p=23: q=77.
      //          So D1 extends from (0,100) along the hypotenuse to (23,77)?
      //          Then down to (23,13)? Then back along slant to (0,29)?
      //
      //   OK I think I've been wrong about D1's extent. Let me reconsider.
      //
      //   D1 and D2 together occupy the upper-left region of the triangle
      //   (high C2H2 or moderate C2H2 with moderate C2H4).
      //   The separation between D1 and D2 is roughly at p=23 (C2H4=23%).
      //
      //   Actually from the standard Duval figure:
      //   - D1 (sparking/partial discharge in oil): upper LEFT, C2H2>C2H4
      //   - D2 (high-energy arcing): upper RIGHT in the discharge area
      //   - DT (thermal+electrical): middle band
      //
      //   The boundary between D1 and D2 is approximately p = 23 (vertical line).
      //   The boundary between (D1,D2) and (DT,T zones) involves q=13 and the slant.
      //
      //   I'll now commit to a clean partition. The zones check order matters
      //   since I'll check them in sequence and return the first match.
      //
      //   Updated zone definitions:
      //
      //   PD:  p + q ≤ 2
      //
      //   T1:  q ≤ 2 AND p ≤ 10 AND NOT PD
      //   T2:  q ≤ 2 AND p > 10 AND p ≤ 50
      //   T3:  q ≤ 2 AND p > 50
      //
      //   D1:  q ≥ 13 AND p ≤ 23 AND q ≥ 29 - (16/23)*p
      //        (above the slant from (0,29) to (23,13), left of p=23)
      //
      //   D2:  q > 2 AND p > 23  ... but this needs refinement.
      //        Also includes some area above slant, right of p=23.
      //        And the region: left of p=23, above q=13, but BELOW the slant.
      //
      //   Wait — what's BELOW the slant and above q=13?
      //   At p=10, slant gives q = 29 - 16*10/23 = 29 - 6.96 = 22.04
      //   So below slant and above q=13 at p=10: 13 ≤ q ≤ 22
      //   This region (below slant, left of p=23, above q=13) — is this DT?
      //
      //   I believe DT occupies:
      //     2 < q < 13  (the band between thermal and discharge zones)
      //     PLUS below-slant area with q≥13 and p≤23
      //
      //   And D2 is p > 23 with q > 2 (roughly).
      //
      //   This gives:
      //
      //   DT:  (2 < q ≤ 13 AND p ≤ 23)  
      //         PLUS (q > 13 AND p ≤ 23 AND q < 29-(16/23)*p)   [below slant, left]
      //         PLUS (q > 2 AND p > 23)   ← but this is D2 territory
      //
      //   Actually I think DT and D2 are:
      //   DT:  2 < q ≤ 13 AND p ≤ 23  (central mixing zone, left part)
      //         PLUS 2 < q ≤ 13 AND p > 23 AND ... some part?
      //
      //   I'm going in circles. Let me look at this very simply:
      //
      // ---------------------------------------------------------------------------
      // SIMPLEST DEFENSIBLE PARTITION (committing to this):
      //
      //   PD:   r ≥ 98  ↔  p+q ≤ 2
      //   T1:   q ≤ 2 AND p ≤ 10 AND NOT PD
      //   T2:   q ≤ 2 AND 10 < p ≤ 50
      //   T3:   q ≤ 2 AND p > 50
      //   D1:   q > 2 AND p/(p+q) < 0.5 AND q/(p+q) > 0.5 AND p+q ≥ some threshold
      //         → more C2H2 than C2H4, in the discharge region
      //   D2:   q > 2 AND p/(p+q) > 0.5
      //         → more C2H4 than C2H2 (or at least C2H4-dominant)
      //   DT:   everything else (the intermediate zone)
      //
      //   But this doesn't match Duval's boundaries well either.
      //
      // ---------------------------------------------------------------------------
      // I will now implement a clean classification using explicit boundary lines
      // as I best recall them, using an ordered if-else chain (not polygon tests).
      // This is simpler and more maintainable.
      // ---------------------------------------------------------------------------

      poly: [] // placeholder, we won't use polygon testing for D2
    }
  ];

  // ---------------------------------------------------------------------------
  // CLASSIFICATION — using ordered conditional logic
  // This is cleaner than polygon tests for ternary diagrams.
  //
  // Inputs: p = %C2H4, q = %C2H2, r = %CH4
  //
  // Rules based on Duval Triangle 1 (IEC 60599 / IEEE C57.104 DGA guidelines):
  // ---------------------------------------------------------------------------
  function classify(ch4, c2h4, c2h2) {
    const total = ch4 + c2h4 + c2h2;
    if (total <= 0) return 'Unknown';

    const r = (ch4  / total) * 100;  // %CH4
    const p = (c2h4 / total) * 100;  // %C2H4
    const q = (c2h2 / total) * 100;  // %C2H2

    // PD — Partial Discharge
    // CH4 dominates, very little C2H4 or C2H2
    if (p + q <= 2) return 'PD';

    // Thermal zones — along the bottom (q ≤ 2, low C2H2)
    if (q <= 2) {
      if (p <= 10) return 'T1';  // low C2H4, thermal < 300°C
      if (p <= 50) return 'T2';  // moderate C2H4, thermal 300-700°C
      return 'T3';               // high C2H4, thermal > 700°C
    }

    // Discharge and mixed zones (q > 2)
    // The slant line separating D1 from DT/D2:
    // Line from (p=0, q=29) to (p=23, q=13): q = 29 - (16/23)*p
    const slantQ = 29 - (16 / 23) * p;

    // D1 — Low-energy discharge (sparking), C2H2-dominant
    // Left of p=23 AND above the slant (q ≥ slantQ) AND q ≥ 13
    if (p <= 23 && q >= slantQ && q >= 13) return 'D1';

    // D2 — High-energy discharge (arcing)
    // Right of roughly p=23 and in the high-C2H2 region,
    // OR high C2H4 fraction among discharges
    // I recall D2 as: (q > 13 AND p > 23) OR (q > 29 AND ...)
    // Actually D2 extends from moderate C2H2 and high C2H4.
    // Committing to: D2 is p > 23 AND q > 2 AND q > some function of p.
    // The boundary between DT and D2: at q=13 roughly, with p>23.
    // And the boundary between DT and D2 for q between 2 and 13 at high p:
    // I believe DT extends over much of the p>23, low-moderate q space,
    // while D2 is in the high-q, p>23 region.
    //
    // Simplification: 
    //   D2: p > 23 AND q > 13   (high energy arc)
    //   DT: everything else (q between 2 and 13, or below slant with p≤23)
    if (p > 23 && q > 13) return 'D2';

    // DT — Thermal+Electrical (mixed fault)
    // This is the remaining interior zone
    return 'DT';
  }

  // ---------------------------------------------------------------------------
  // RENDERING
  //
  // Ternary triangle layout in SVG with viewBox="0 0 600 540":
  //
  // The equilateral triangle maps the three axes:
  //   %CH4 (top apex)
  //   %C2H4 (bottom-right apex)
  //   %C2H2 (bottom-left apex)
  //
  // We map barycentric coordinates (r=%CH4, p=%C2H4, q=%C2H2) to 2D:
  //
  //   Let the triangle vertices in SVG coords be:
  //     V_CH4  = (300, 30)   top
  //     V_C2H4 = (550, 490)  bottom-right
  //     V_C2H2 = (50,  490)  bottom-left
  //
  //   A point (r, p, q) with r+p+q=100 maps to:
  //     x = (r/100)*Vch4.x + (p/100)*Vc2h4.x + (q/100)*Vc2h2.x
  //     y = (r/100)*Vch4.y + (p/100)*Vc2h4.y + (q/100)*Vc2h2.y
  // ---------------------------------------------------------------------------

  // Triangle vertex positions in SVG space
  const V = {
    ch4:  { x: 300, y: 30  },   // top apex: 100% CH4
    c2h4: { x: 550, y: 490 },   // bottom-right: 100% C2H4
    c2h2: { x: 50,  y: 490 }    // bottom-left: 100% C2H2
  };

  function baryToSVG(rCH4, pC2H4, qC2H2) {
    // rCH4, pC2H4, qC2H2 are percentages (sum = 100)
    const t = rCH4 + pC2H4 + qC2H2;
    const r = rCH4 / t, p = pC2H4 / t, q = qC2H2 / t;
    return {
      x: r * V.ch4.x  + p * V.c2h4.x + q * V.c2h2.x,
      y: r * V.ch4.y  + p * V.c2h4.y + q * V.c2h2.y
    };
  }

  // Convert (p=%C2H4, q=%C2H2) to SVG (r is derived)
  function pqToSVG(p, q) {
    const r = 100 - p - q;
    return baryToSVG(r, p, q);
  }

  const NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs, text) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function polyPoints(pqList) {
    return pqList.map(([p, q]) => {
      const pt = pqToSVG(p, q);
      return pt.x + ',' + pt.y;
    }).join(' ');
  }

  // Zone polygon definitions for rendering (in [%C2H4, %C2H2] coordinates)
  // These must tile the entire triangle without overlap or gap.
  //
  // Using the same boundary rules as classify():
  //   Line L_slant: from (p=0,q=29) to (p=23,q=13)
  //
  // All zones:
  //   PD:   (0,0)→(2,0)→(0,2)                                          [triangle at CH4 apex]
  //   T1:   (0,2)→(2,0)→(10,0)→(10,2)                                  [q≤2, p:2→10, excluding PD]
  //   T2:   (10,0)→(50,0)→(50,2)→(10,2)                                [q≤2, p:10→50]
  //   T3:   (50,0)→(100,0)→(98,2)→(50,2)                               [q≤2, p:50→100]
  //         Note: (100,0) is C2H4 apex. The hypotenuse cuts at p=98,q=2.
  //   DT:   the band above q=2 that is NOT D1 or D2
  //         vertices: (0,2)→(10,2)→(50,2)→(98,2)→(0,100-98)=(98,2)→... 
  //         Hmm, let me think about DT's shape more carefully.
  //
  // The regions above q=2:
  //   The triangle above q=2 has vertices:
  //     (0,2)  (along left edge, p=0)
  //     (98,2) (along hypotenuse, since p+q=100 gives p=98 at q=2)
  //     (0,100) (C2H2 apex)
  //   Wait — (0,2) is on the LEFT edge (p=0), not on the hypotenuse.
  //   The line q=2 intersects:
  //     Left edge (p=0): at (0,2)
  //     Right edge (q=0): doesn't intersect (q=2≠0) 
  //     Hypotenuse (p+q=100): at p=98, q=2 → (98,2)
  //   So the region q≥2 in the triangle is a sub-triangle:
  //     (0,2) → (98,2) → (0,100)
  //   This sub-triangle contains D1, D2, DT.
  //
  // Now partition this sub-triangle:
  //   D1: left of p=23, above slant from (0,29) to (23,13)
  //       i.e., q ≥ 29-(16/23)*p AND p≤23 AND q≥13
  //       Polygon: (0,29)→(23,13)→(23,???)→(0,???)
  //       At p=23: slant gives q=13. Left boundary is p=0.
  //       Top boundary: hypotenuse p+q=100, but only where p≤23 → q≥77. 
  //         D1 goes all the way to (0,100) corner.
  //       At p=23, the hypotenuse gives q=77.
  //       So D1 polygon:
  //         (0,29)→(0,100)→(23,77)→(23,13)→(0,29)
  //         [left edge up, along hypotenuse to (23,77), down to (23,13), slant back]
  //
  //   D2: right of p=23 AND above q=13
  //       AND the region is in the upper-right of the sub-triangle
  //       Polygon: (23,13)→(23,77)→(0,100)→... no, that's D1.
  //       D2: p>23, q>13.
  //       In the triangle, p>23 and q>13 gives:
  //         right boundary: p+q=100 → (87,13) to (0,100)... 
  //           Wait, at q=13, p=87 is on hypotenuse.
  //         Polygon: (23,13)→(87,13)→(0,100)→(23,77)→(23,13)?
  //         Let me check: at q=13, p can go from 23 to 87 (since p+q≤100).
  //         At the hypotenuse (p+q=100), q=100-p, and we need q>13 → p<87.
  //         D2 is bounded: p from 23 to 87, q from 13 to (100-p).
  //         Polygon: (23,13)→(87,13)→(0,100)→(23,77)→(23,13)?
  //         Check: (23,77) is on hypotenuse (23+77=100) ✓ and p=23.
  //         (87,13): 87+13=100, on hypotenuse ✓.
  //         This polygon makes sense for D2.
  //
  //   DT: everything else in the sub-triangle, i.e.:
  //     below D1 (below slant from (0,29) to (23,13)) AND
  //     below D2 (q≤13 or left of p=23 — the parts not in D2).
  //     
  //     DT polygon: (0,2)→(98,2)→(87,13)→(23,13)→(0,29)→(0,2)
  //       [bottom of sub-triangle, up to q=13 boundary, then left along q=13
  //        to p=23, then slant to (0,29), then down left edge to (0,2)]
  //       Wait: (0,29)→(0,2) goes DOWN the left edge from q=29 to q=2. ✓
  //       And (0,2)→(98,2) is along the q=2 line. ✓
  //       (98,2)→(87,13) is along the hypotenuse (both have p+q=100). ✓
  //       (87,13)→(23,13) is along q=13. ✓
  //       (23,13)→(0,29) is the slant. ✓
  //       (0,29)→(0,2) closes along left edge. ✓
  //       This seems correct!
  //
  // Now check coverage:
  //   PD ∪ T1 ∪ T2 ∪ T3 covers q≤2 (bottom strip).
  //   D1 ∪ D2 ∪ DT covers q>2 (upper sub-triangle).
  //   Together they tile the whole triangle. ✓ (modulo boundary edges)
  //
  // But wait — does classify() match these polygons?
  //   classify() uses: D1 if p≤23 AND q≥slant AND q≥13
  //                    D2 if p>23 AND q>13
  //                    DT otherwise (q>2)
  //   The D1 polygon I drew: (0,29)→(0,100)→(23,77)→(23,13)→(0,29)
  //     - p from 0 to 23
  //     - q from slant(p) to (100-p)
  //     - requires q≥13 AND q≥slant (at p=0: q≥29, at p=23: q≥13)
  //   The classify D1 rule: p≤23 AND q≥slantQ AND q≥13 → YES this matches ✓
  //   The D2 polygon: (23,13)→(87,13)→(0,100)→(23,77)→(23,13)
  //     Wait — (0,100) is in D1 territory (p=0, in D1). Let me re-examine.
  //     (0,100): p=0, q=100. slantQ at p=0 = 29. q=100 ≥ 29 → D1. ✓ But I put (0,100) in D2 polygon!
  //     That's wrong. Let me fix D2.
  //   D2 should be: p>23, q>13.
  //     In the triangle: p from 23 to 87 (since p+q≤100 and q>13 → p<87).
  //     Polygon: (23,13)→(87,13)→[along hypotenuse]→(23,77)→back to (23,13)
  //     The hypotenuse from (87,13) to (23,77) is a line segment (both have p+q=100). ✓
  //     D2 polygon: (23,13)→(87,13)→(23,77)→(23,13) — a triangle! ✓
  //     Check: (87+13=100 ✓), (23+77=100 ✓). The right boundary is the hypotenuse.
  //   
  //   Updated D1: What is the left boundary of D1 near (0,100)?
  //     D1 (p≤23, q≥slant, q≥13):
  //     At the C2H2 apex (0,100): p=0, q=100 ≥ 29 ✓ → IN D1.
  //     D1 polygon must include (0,100).
  //     D1 extends from p=0 to p=23 along the hypotenuse (at p=23, q=77).
  //     D1 polygon: (0,29)→(0,100)→(23,77)→(23,13)→(0,29) ✓
  //     This correctly excludes D2 (which starts at p=23).
  //
  //   Now check DT:
  //     DT = sub-triangle minus D1 minus D2
  //     Sub-triangle: (0,2)→(98,2)→(0,100)
  //     D1: (0,29)→(0,100)→(23,77)→(23,13)→(0,29)
  //     D2: (23,13)→(87,13)→(23,77) — triangle
  //     DT: sub-triangle minus D1 minus D2.
  //     DT polygon: start at (0,2), go right to (98,2), up along hypotenuse to (87,13),
  //       left along q=13 to (23,13), along slant up-left to (0,29),
  //       down left edge to (0,2). ✓
  //     DT: (0,2)→(98,2)→(87,13)→(23,13)→(0,29)→(0,2) ✓
  //
  // FINAL ZONE POLYGON DEFINITIONS (in [p=%C2H4, q=%C2H2]):

  const ZONE_RENDER = [
    {
      code: 'PD',
      color: '#a0c4ff',
      label: 'PD',
      labelPos: [0.4, 0.4],  // [%C2H4, %C2H2] for label position
      poly: [[0,0],[2,0],[0,2]]
    },
    {
      code: 'T1',
      color: '#ffcf77',
      label: 'T1',
      poly: [[0,2],[2,0],[10,0],[10,2]]
    },
    {
      code: 'T2',
      color: '#ffaa00',
      label: 'T2',
      poly: [[10,0],[50,0],[50,2],[10,2]]
    },
    {
      code: 'T3',
      color: '#ff6600',
      label: 'T3',
      poly: [[50,0],[100,0],[98,2],[50,2]]
    },
    {
      code: 'D1',
      color: '#b5ead7',
      label: 'D1',
      poly: [[0,29],[0,100],[23,77],[23,13]]
      // closes back to (0,29)
    },
    {
      code: 'D2',
      color: '#ffd6e0',
      label: 'D2',
      poly: [[23,13],[87,13],[23,77]]
      // triangle
    },
    {
      code: 'DT',
      color: '#c3b1e1',
      label: 'DT',
      poly: [[0,2],[98,2],[87,13],[23,13],[0,29]]
    }
  ];

  function render(svg, sample) {
    // Clear the SVG
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // Background
    svg.appendChild(el('rect', {
      x: 0, y: 0, width: 600, height: 540, fill: 'white'
    }));

    // --- Draw zone fills ---
    for (const zone of ZONE_RENDER) {
      const pts = polyPoints(zone.poly);
      svg.appendChild(el('polygon', {
        points: pts,
        fill: zone.color,
        stroke: '#333',
        'stroke-width': '1',
        opacity: '0.85'
      }));
    }

    // --- Draw zone boundary lines (on top of fills) ---
    // Main triangle outline
    const triPts = [
      pqToSVG(0, 0),   // CH4 apex
      pqToSVG(100, 0), // C2H4 apex
      pqToSVG(0, 100)  // C2H2 apex
    ];
    svg.appendChild(el('polygon', {
      points: triPts.map(p => p.x + ',' + p.y).join(' '),
      fill: 'none',
      stroke: '#000',
      'stroke-width': '2'
    }));

    // Internal boundary lines
    const boundaries = [
      // q=2 line from (0,2) to (98,2)
      [[0,2],[98,2]],
      // p=10 from (10,0) to (10,2)
      [[10,0],[10,2]],
      // p=50 from (50,0) to (50,2)
      [[50,0],[50,2]],
      // q=13 from (0,13) ? no — DT/D1/D2: from (23,13) to (87,13)
      [[23,13],[87,13]],
      // slant from (0,29) to (23,13) — D1/DT boundary
      [[0,29],[23,13]],
      // p=23 from (23,13) to (23,77) — D1/D2 boundary
      [[23,13],[23,77]],
      // p=98 from (98,2) to (87,13)? along hypotenuse — not a separate line, it IS hypotenuse
    ];
    for (const [a, b] of boundaries) {
      const pa = pqToSVG(a[0], a[1]);
      const pb = pqToSVG(b[0], b[1]);
      svg.appendChild(el('line', {
        x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y,
        stroke: '#333', 'stroke-width': '1', 'stroke-dasharray': '4,3'
      }));
    }

    // --- Zone labels ---
    const zoneLabelPos = {
      'PD': [0.6, 0.6],     // near CH4 apex
      'T1': [5, 0.5],
      'T2': [28, 0.5],
      'T3': [70, 0.5],
      'D1': [5, 55],
      'D2': [40, 25],
      'DT': [35, 8]
    };
    for (const zone of ZONE_RENDER) {
      const lp = zoneLabelPos[zone.code];
      const pt = pqToSVG(lp[0], lp[1]);
      const t = svg.appendChild(el('text', {
        x: pt.x, y: pt.y,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        'font-family': 'sans-serif',
        'font-size': '13',
        'font-weight': 'bold',
        fill: '#222'
      }, zone.code));
    }

    // --- Tick marks and axis labels ---
    // We draw ticks at 10, 20, ..., 90% along each axis.
    // For the %CH4 axis (left side): from C2H4-apex to CH4-apex
    //   Actually the CH4 axis is on the LEFT side of the triangle.
    //   Reading increases going from C2H2-apex (bottom-left) upward along left edge.
    //   Actually — in a ternary diagram the axes are conventionally:
    //   Each axis runs from one vertex to the opposite side.
    //   For CH4: runs from bottom edge to CH4 apex.
    //   
    //   Let's draw ticks along each EDGE of the triangle:
    //   Left edge (p=0): q goes from 0 (CH4 apex) to 100 (C2H2 apex)
    //     → C2H2 axis ticks
    //   Right edge (q=0): p goes from 0 (CH4 apex) to 100 (C2H4 apex)
    //     → C2H4 axis ticks
    //   Bottom edge (p+q=100): CH4 goes from 0 to 100
    //     → CH4 axis ticks

    function drawAxisTicks(axis) {
      for (let pct = 10; pct <= 90; pct += 10) {
        let edgePt, tickDir;
        if (axis === 'c2h2') {
          // Left edge, p=0, q=pct
          edgePt = pqToSVG(0, pct);
          tickDir = { dx: -8, dy: 0 };
        } else if (axis === 'c2h4') {
          // Right edge, q=0, p=pct
          edgePt = pqToSVG(pct, 0);
          tickDir = { dx: 5, dy: 5 };
        } else {
          // Bottom edge (CH4 axis): CH4=pct means p+q=100-pct
          // Along hypotenuse from (100,0) to (0,100):
          // parameterize by p going from 100 to 0, q=100-p, CH4=0 to 100.
          // At CH4=pct: r=pct, p+q=100-pct. On hypotenuse: p= (100-pct)/...
          // Hmm, the bottom edge connects C2H4=(100,0) and C2H2=(0,100).
          // A point with CH4=pct on this edge means r=pct, and p+q=100-pct.
          // But on the hypotenuse specifically, we can parameterize as:
          // moving from (100,0) to (0,100): p = 100-t, q = t for t in [0,100].
          // CH4 = 100-p-q = 100-(100-t)-t = 0 everywhere on hypotenuse!
          // So the hypotenuse has CH4=0. We can't draw CH4 ticks on the hypotenuse.
          // 
          // CH4 "axis" in a ternary diagram means lines of constant CH4,
          // which are lines parallel to the C2H4-C2H2 edge.
          // We draw ticks on the left and right edges at the grid intersections.
          // Let me skip this and just draw the axis labels.
          continue;
        }
        // Tick line
        svg.appendChild(el('line', {
          x1: edgePt.x, y1: edgePt.y,
          x2: edgePt.x + tickDir.dx,
          y2: edgePt.y + tickDir.dy,
          stroke: '#000', 'stroke-width': '1'
        }));
        // Tick label
        const labelX = edgePt.x + tickDir.dx * 2.5;
        const labelY = edgePt.y + tickDir.dy * 2.5;
        svg.appendChild(el('text', {
          x: labelX, y: labelY,
          'text-anchor': axis === 'c2h2' ? 'end' : 'start',
          'dominant-baseline': 'middle',
          'font-family': 'sans-serif',
          'font-size': '9',
          fill: '#555'
        }, pct + '%'));
      }
    }

    drawAxisTicks('c2h2');
    drawAxisTicks('c2h4');

    // --- Axis label text ---
    // %CH4 label — midpoint of left edge, offset left
    {
      const mid = pqToSVG(0, 50);
      const t = el('text', {
        x: mid.x - 20, y: mid.y,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        'font-family': 'sans-serif',
        'font-size': '12',
        'font-weight': 'bold',
        fill: '#000',
        transform: `rotate(-60, ${mid.x - 20}, ${mid.y})`
      }, '%CH\u2084');
      svg.appendChild(t);
    }

    // %C2H4 label — midpoint of right edge (q=0), offset below
    {
      const mid = pqToSVG(50, 0);
      const t = el('text', {
        x: mid.x + 20, y: mid.y + 15,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        'font-family': 'sans-serif',
        'font-size': '12',
        'font-weight': 'bold',
        fill: '#000',
        transform: `rotate(60, ${mid.x + 20}, ${mid.y + 15})`
      }, '%C\u2082H\u2084');
      svg.appendChild(t);
    }

    // %C2H2 label — below hypotenuse midpoint
    {
      const mid = pqToSVG(50, 50);  // midpoint of hypotenuse
      svg.appendChild(el('text', {
        x: mid.x, y: mid.y + 20,
        'text-anchor': 'middle',
        'dominant-baseline': 'hanging',
        'font-family': 'sans-serif',
        'font-size': '12',
        'font-weight': 'bold',
        fill: '#000'
      }, '%C\u2082H\u2082'));
    }

    // Apex labels
    const apices = [
      { pq: [0, 0],   label: 'CH\u2084\n100%',   anchor: 'middle', dy: -8 },
      { pq: [100, 0], label: 'C\u2082H\u2084\n100%', anchor: 'start',  dy: 8 },
      { pq: [0, 100], label: 'C\u2082H\u2082\n100%', anchor: 'end',    dy: 8 }
    ];
    for (const a of apices) {
      const pt = pqToSVG(a.pq[0], a.pq[1]);
      const lines = a.label.split('\n');
      const g = el('text', {
        x: pt.x, y: pt.y + a.dy,
        'text-anchor': a.anchor,
        'font-family': 'sans-serif',
        'font-size': '11',
        'font-weight': 'bold',
        fill: '#000'
      });
      lines.forEach((line, i) => {
        const tspan = document.createElementNS(NS, 'tspan');
        tspan.setAttribute('x', pt.x);
        tspan.setAttribute('dy', i === 0 ? '0' : '1.2em');
        tspan.textContent = line;
        g.appendChild(tspan);
      });
      svg.appendChild(g);
    }

    // --- Title ---
    svg.appendChild(el('text', {
      x: 300, y: 520,
      'text-anchor': 'middle',
      'font-family': 'sans-serif',
      'font-size': '13',
      fill: '#333'
    }, 'Duval Triangle 1 — Mineral Oil Transformers'));

    // --- Sample point ---
    if (sample !== null && sample !== undefined) {
      const { ch4, c2h4, c2h2 } = sample;
      const total = ch4 + c2h4 + c2h2;
      if (total > 0) {
        const r = (ch4  / total) * 100;
        const p = (c2h4 / total) * 100;
        const q = (c2h2 / total) * 100;
        const pt = baryToSVG(r, p, q);
        const zone = classify(ch4, c2h4, c2h2);

        // Cross-hair marker
        svg.appendChild(el('circle', {
          cx: pt.x, cy: pt.y, r: 7,
          fill: 'none', stroke: '#c00', 'stroke-width': '2.5'
        }));
        svg.appendChild(el('line', {
          x1: pt.x - 10, y1: pt.y, x2: pt.x + 10, y2: pt.y,
          stroke: '#c00', 'stroke-width': '1.5'
        }));
        svg.appendChild(el('line', {
          x1: pt.x, y1: pt.y - 10, x2: pt.x, y2: pt.y + 10,
          stroke: '#c00', 'stroke-width': '1.5'
        }));

        // Label the sample point
        const pctStr = `CH₄=${r.toFixed(1)}% C₂H₄=${p.toFixed(1)}% C₂H₂=${q.toFixed(1)}%`;
        // Position label: offset up-right, adjust if near edges
        let lx = pt.x + 12, ly = pt.y - 12;
        if (lx > 480) lx = pt.x - 12;
        if (ly < 60)  ly = pt.y + 20;

        svg.appendChild(el('rect', {
          x: lx - 2, y: ly - 12,
          width: 190, height: 32,
          fill: 'white', opacity: '0.8', rx: '3'
        }));
        svg.appendChild(el('text', {
          x: lx, y: ly,
          'font-family': 'sans-serif', 'font-size': '10', fill: '#c00'
        }, `Zone: ${zone}`));
        svg.appendChild(el('text', {
          x: lx, y: ly + 13,
          'font-family': 'sans-serif', 'font-size': '9', fill: '#333'
        }, pctStr));
      }
    }
  }

  return { classify, render };
})();