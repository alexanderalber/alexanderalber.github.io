const DuvalPentagon = (function() {
  // Namespace for SVG elements
  const SVG_NS = "http://www.w3.org/2000/svg";

  // Gas names in order of axes (clockwise from top)
  const GAS_NAMES = ["H2", "CH4", "C2H6", "C2H4", "C2H2"];

  // Each vertex corresponds to an axis direction in degrees (starting from top, clockwise)
  // We will put H2 at 90°, then each subsequent gas 72° apart clockwise
  const AXIS_ANGLES = [90, 18, 306, 234, 162]; // degrees

  // Helper: convert degrees to radians
  function d2r(d) {
    return d * Math.PI / 180;
  }

  // Normalize the gas concentrations to sum=1 (if sum>0)
  function normalizeGases(h2, ch4, c2h6, c2h4, c2h2) {
    let sum = h2 + ch4 + c2h6 + c2h4 + c2h2;
    return sum > 0 ? [h2/sum, ch4/sum, c2h6/sum, c2h4/sum, c2h2/sum] : [0,0,0,0,0];
  }

  // The pentagon shape is regular, with radius R.
  // We'll scale radius=250, centered at (300,300)
  const CENTER = {x:300, y:300};
  const RADIUS = 250;

  // Compute polygon points for the pentagon (axes vertices)
  const pentagonPoints = AXIS_ANGLES.map(a => {
    let rad = d2r(a);
    return {
      x: CENTER.x + RADIUS * Math.cos(rad),
      y: CENTER.y - RADIUS * Math.sin(rad)
    };
  });

  // Polygon vertex to gas index map (ordered as GAS_NAMES)
  // pentagonPoints[i] corresponds to GAS_NAMES[i]

  // Each axis is along the vector from center to vertex i

  // Zones as per Duval pentagon:
  // 5 zones plus normal
  // Zones code and their major gas ratios (from memory):
  //
  // Zone T (Thermal fault): high ethylene (C2H4) and ethane (C2H6)
  // Zone PD (Partial Discharge): high hydrogen (H2) and methane (CH4)
  // Zone D1 (Discharge type 1 - low energy): mainly methane and hydrogen, but ratio differs from PD
  // Zone D2 (Discharge type 2 - high energy): acetylene (C2H2) high
  // Zone DT (Thermal + Discharge mixed): mixed gases
  //
  // We'll treat as standard with these codes:
  // "T", "PD", "D1", "D2", "DT"
  //
  // Since this is from memory without exact boundaries,
  // we'll base classification on key ratios according to standard Duval pentagon logic,
  // working with relative fractions of gases: mainly ratios of CH4/H2 and C2H4/C2H6 and presence of C2H2.

  // We'll use approximate rules from memory simplified:

  // Pseudocode (approximate):

  // Compute ratios:
  // r1 = CH4 / (H2 + CH4)
  // r2 = C2H4 / (C2H4 + C2H6)
  // r3 = C2H2 / sum_all

  // If C2H2 is significantly high (> 0.1 of total), zone D2

  // Else if r2 > ~0.5 and C2H6 > C2H4 => zone T (thermal)

  // Else if r1 < ~0.5 => zone PD (partial discharge)

  // Else if r1 >= 0.5 => zone D1

  // If mixed or uncertain (e.g. moderate C2H2 and moderate C2H4 and C2H6), zone DT

  // We'll encode these rules below.

  function classify(h2, ch4, c2h6, c2h4, c2h2) {
    // Validate inputs non-negative and sum positive
    let gases = [h2, ch4, c2h6, c2h4, c2h2];
    if (gases.some(x => x < 0)) throw new Error("Gas concentrations must be non-negative");
    let sum = gases.reduce((a,b) => a+b, 0);
    if (sum <= 0) throw new Error("Sum of gas concentrations must be > 0");

    let [H2, CH4, C2H6, C2H4, C2H2] = gases;

    // Key sums for ratios
    let sumHC = H2 + CH4;
    let sumE = C2H6 + C2H4;
    let sumAll = sum;

    // Ratios (safe division)
    let r1 = sumHC > 0 ? CH4 / sumHC : 0;        // CH4 / (H2+CH4)
    let r2 = sumE > 0 ? C2H4 / sumE : 0;         // C2H4 / (C2H6 + C2H4)
    let r3 = C2H2 / sumAll;                       // acetylene fraction of total

    // Thresholds (approx from memory)
    const acetylene_high = 0.1;
    const acetylene_low = 0.01;

    // Classification logic

    if (r3 >= acetylene_high) {
      // High acetylene => D2 (high energy discharge)
      return "D2";
    }
    else if (r3 >= acetylene_low) {
      // Moderate acetylene presence => mixed zone DT (thermal + discharge)
      return "DT";
    }
    else {
      // No significant acetylene

      if (r2 > 0.6) {
        // High ethylene fraction: thermal
        return "T";
      }
      else {
        // Check methane/hydrogen ratio for PD vs D1
        if (r1 < 0.5) {
          return "PD";
        }
        else {
          return "D1";
        }
      }
    }
  }

  // Rendering helpers
  function createText(text, x, y, options={}) {
    const t = document.createElementNS(SVG_NS, "text");
    t.textContent = text;
    t.setAttribute("x", x);
    t.setAttribute("y", y);
    t.setAttribute("font-family", "Arial, sans-serif");
    if (options.bold) t.setAttribute("font-weight", "bold");
    if (options.size) t.setAttribute("font-size", options.size);
    else t.setAttribute("font-size", 16);
    if (options.fill) t.setAttribute("fill", options.fill);
    if (options.anchor) t.setAttribute("text-anchor", options.anchor);
    else t.setAttribute("text-anchor", "middle");
    if (options.dy) t.setAttribute("dy", options.dy);
    return t;
  }

  function createPolygon(points, options={}) {
    const poly = document.createElementNS(SVG_NS, "polygon");
    let pts = points.map(p => `${p.x},${p.y}`).join(" ");
    poly.setAttribute("points", pts);
    if (options.fill) poly.setAttribute("fill", options.fill);
    else poly.setAttribute("fill", "none");
    if (options.stroke) poly.setAttribute("stroke", options.stroke);
    else poly.setAttribute("stroke", "black");
    if (options.strokeWidth) poly.setAttribute("stroke-width", options.strokeWidth);
    else poly.setAttribute("stroke-width", 1);
    if (options.opacity !== undefined) poly.setAttribute("opacity", options.opacity);
    return poly;
  }

  function createLine(x1,y1,x2,y2, options={}) {
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y2);
    if (options.stroke) line.setAttribute("stroke", options.stroke);
    else line.setAttribute("stroke", "black");
    if (options.strokeWidth) line.setAttribute("stroke-width", options.strokeWidth);
    else line.setAttribute("stroke-width", 1);
    if (options.dasharray) line.setAttribute("stroke-dasharray", options.dasharray);
    return line;
  }

  // Colors for zones (approx)
  const ZONE_COLOR = {
    "T": "#ffcf9f",   // warm yellow-orange (thermal)
    "PD": "#b3d9ff",  // light blue (partial discharge)
    "D1": "#c2f0c2",  // light green (discharge low energy)
    "D2": "#ff9999",  // pinkish red (discharge high energy)
    "DT": "#d1b3ff",  // light purple (mixed)
  };

  // Pentagon zones: each zone is polygon formed by center and two adjacent gas vertices (approximation)
  // The pentagon pentagons zones roughly correspond to areas around each axis vertex.
  // We'll create "zone polygons" as triangles center-vertex-vertex+1 for T, PD, D1, D2, DT
  // Zone order assigned for visual clarity (approx):
  // 0: T - between C2H6(2) and C2H4(3)
  // 1: PD - between H2(0) and CH4(1)
  // 2: D1 - between CH4(1) and C2H6(2)
  // 3: D2 - between C2H4(3) and C2H2(4)
  // 4: DT - between C2H2(4) and H2(0)

  // We'll define zones as polygons:
  // For pentagon points indices [0..4]:
  // T = triangle(center, pentagonPoints[2], pentagonPoints[3])
  // PD = triangle(center, pentagonPoints[0], pentagonPoints[1])
  // D1 = triangle(center, pentagonPoints[1], pentagonPoints[2])
  // D2 = triangle(center, pentagonPoints[3], pentagonPoints[4])
  // DT = triangle(center, pentagonPoints[4], pentagonPoints[0])

  // Render method implementation:

  function render(svg, sample) {
    // Clear svg
    while(svg.firstChild) svg.removeChild(svg.firstChild);

    // White background rect
    const bg = document.createElementNS(SVG_NS, "rect");
    bg.setAttribute("x", 0);
    bg.setAttribute("y", 0);
    bg.setAttribute("width", 600);
    bg.setAttribute("height", 600);
    bg.setAttribute("fill", "white");
    svg.appendChild(bg);

    // Draw zones polygons filled

    const zones = [
      {code:"T", verts:[2,3], color:ZONE_COLOR.T, label:"T"},
      {code:"PD", verts:[0,1], color:ZONE_COLOR.PD, label:"PD"},
      {code:"D1", verts:[1,2], color:ZONE_COLOR.D1, label:"D1"},
      {code:"D2", verts:[3,4], color:ZONE_COLOR.D2, label:"D2"},
      {code:"DT", verts:[4,0], color:ZONE_COLOR.DT, label:"DT"},
    ];

    zones.forEach(z => {
      let pts = [
        CENTER,
        pentagonPoints[z.verts[0]],
        pentagonPoints[z.verts[1]],
      ];
      let poly = createPolygon(pts, {fill: z.color, stroke: "black", strokeWidth:1, opacity:0.6});
      svg.appendChild(poly);

      // Label position - midpoint between the two verts, shifted inward a bit
      let midX = (pentagonPoints[z.verts[0]].x + pentagonPoints[z.verts[1]].x) / 2;
      let midY = (pentagonPoints[z.verts[0]].y + pentagonPoints[z.verts[1]].y) / 2;

      // Vector from center to midpoint
      let vx = midX - CENTER.x;
      let vy = midY - CENTER.y;
      // Move label 40px toward center for legibility
      let labelX = midX - vx * 0.15;
      let labelY = midY - vy * 0.15;

      let text = createText(z.label, labelX, labelY, {bold:true, size:24, fill:"black"});
      svg.appendChild(text);
    });

    // Draw pentagon outline
    let pentOutline = createPolygon(pentagonPoints, {fill:"none", stroke:"black", strokeWidth:3});
    svg.appendChild(pentOutline);

    // Draw radius axes lines from center to each vertex
    for(let i=0; i<5; i++){
      let pt = pentagonPoints[i];
      let axisLine = createLine(CENTER.x, CENTER.y, pt.x, pt.y, {stroke:"black", strokeWidth:2, dasharray:"4 2"});
      svg.appendChild(axisLine);
    }

    // Axis labels at vertices, slightly outside pentagon (offset 30 px outward)
    for(let i=0; i<5; i++){
      let pt = pentagonPoints[i];
      let angleRad = d2r(AXIS_ANGLES[i]);
      let labelX = CENTER.x + (RADIUS + 30)*Math.cos(angleRad);
      let labelY = CENTER.y - (RADIUS + 30)*Math.sin(angleRad);

      // Anchor depends on quadrant
      let anchor="middle";
      if (AXIS_ANGLES[i] === 90) anchor="middle";
      else if (AXIS_ANGLES[i] < 90 || AXIS_ANGLES[i] > 270) anchor = "start";
      else anchor = "end";

      let label = createText(GAS_NAMES[i], labelX, labelY, {bold:true, size:20, fill:"black", anchor: anchor});
      svg.appendChild(label);
    }

    // Draw center circle
    let centerCircle = document.createElementNS(SVG_NS, "circle");
    centerCircle.setAttribute("cx", CENTER.x);
    centerCircle.setAttribute("cy", CENTER.y);
    centerCircle.setAttribute("r", 5);
    centerCircle.setAttribute("fill", "black");
    svg.appendChild(centerCircle);

    // If sample given, plot point on pentagon

    if(sample && typeof sample === "object"){
      let {h2, ch4, c2h6, c2h4, c2h2} = sample;
      let gases = [h2, ch4, c2h6, c2h4, c2h2];
      if (gases.some(x => x < 0)) throw new Error("Gas ppm must be non-negative");
      let sum = gases.reduce((a,b) => a+b, 0);
      if (sum <= 0) return; // no meaningful point

      // Normalize
      let norm = normalizeGases(h2, ch4, c2h6, c2h4, c2h2);

      // Compute point inside pentagon as weighted sum of vertices by norm[]
      // This is a barycentric combo in 5-fold:
      // P = sum_i norm[i] * pentagonPoints[i]

      let px = 0;
      let py = 0;
      for(let i=0;i<5;i++){
        px += norm[i]*pentagonPoints[i].x;
        py += norm[i]*pentagonPoints[i].y;
      }

      // Plot sample point
      let samplePoint = document.createElementNS(SVG_NS, "circle");
      samplePoint.setAttribute("cx", px);
      samplePoint.setAttribute("cy", py);
      samplePoint.setAttribute("r", 8);
      samplePoint.setAttribute("fill", "red");
      samplePoint.setAttribute("stroke", "black");
      samplePoint.setAttribute("stroke-width", 1.5);
      svg.appendChild(samplePoint);

      // Also show classification near sample
      let code = classify(h2, ch4, c2h6, c2h4, c2h2);

      let label = createText(code, px, py - 12, {bold:true, size:20, fill:"red", anchor:"middle"});
      svg.appendChild(label);
    }
  }


  return {classify, render};
})();
