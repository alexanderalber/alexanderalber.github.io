const DuvalTriangle = (() => {
  const SVG_NS = "http://www.w3.org/2000/svg";

  // Triangle vertices in SVG coords
  // We'll put the triangle with base horizontal:
  // A (CH4) on left bottom, B (C2H4) bottom right, C (C2H2) top apex
  // ViewBox 600x540, padding around ~40

  const W = 600, H = 540;
  const PAD = 40;
  const Ax = PAD, Ay = H - PAD;
  const Bx = W - PAD, By = H - PAD;
  const Cx = W / 2, Cy = PAD;

  // Zones of Duval Triangle 1 (Classic)
  // Zone codes and approximate polygon vertices (barycentric coords)
  // The zones correspond to different fault types:
  // T1: PD (Partial Discharge)
  // T2: TD (Thermal 150-300°C)
  // T3: T3 (Thermal > 700°C)
  // T4: T4 (Thermal 300-700°C)
  // T5: T5 (Discharges in oil)
  // The boundaries are defined in barycentric coordinates (CH4, C2H4, C2H2) sum=1

  // From memory, approximate vertex barycentric points per zone (fractions):
  // The triangle corners represent pure gases:
  // CH4 corner: (1,0,0)
  // C2H4 corner: (0,1,0)
  // C2H2 corner: (0,0,1)

  // Approximate vertices for each zone polygon: given as array of [CH4, C2H4, C2H2]

  // These polygon corners are approximate, based on best recollection.

  // Zone T1 - Partial Discharge (PD): near CH4 corner, low C2H2
  const zoneT1 = [
    [1,0,0],
    [0.75,0,0.25],       // between CH4 and C2H2
    [0.6,0.4,0],         // between CH4 and C2H4
    [0.8,0.2,0],         // approx border
  ];
  // We'll reorder points for the polygon shape properly later.

  // Zone T2 - Thermal 150-300°C: middle bottom zone leaning towards C2H4
  const zoneT2 = [
    [0.6,0.4,0],        // previously used
    [0.4,0.6,0],        // more C2H4
    [0.25,0.5,0.25],    // center bottom
  ];

  // Zone T3 - Thermal > 700°C: near C2H2 corner
  const zoneT3 = [
    [0, 0, 1],
    [0, 0.25, 0.75],  // near C2H2/C2H4 edge
    [0.4, 0, 0.6],    // near C2H2/CH4 edge
  ];

  // Zone T4 - Thermal 300-700°C: center-top zone leaning towards C2H4 and C2H2
  // Larger polygon roughly covering the upper middle zone
  const zoneT4 = [
    [0.25, 0.5, 0.25],
    [0, 0.25, 0.75],
    [0, 1, 0],
    [0.4, 0.6, 0],
    [0.6, 0.4, 0],
  ];

  // Zone T5 - Discharges in oil: near C2H4 corner, low C2H2
  const zoneT5 = [
    [0,1,0],
    [0.25,0.5,0.25],
    [0.4,0.6,0],
    [0,1,0],
  ];

  // From my best recall, the zones overlap slightly, so better to define boundaries via inequality rules.
  // Duval Triangle 1 zones classification rules from standard references are typically defined by comparing gas ratios.

  // Instead of polygons, we'll do the standard approach:
  // Calculate percentages of each gas (normalized concentrations)
  // x=CH4%, y=C2H4%, z=C2H2%, with x+y+z=100%

  // Rules (approximate best recollection):

  // Zone 1 (T1) - Partial Discharge (PD):
  // C2H2% <= 4%
  // CH4% >= C2H4%
  // and CH4% dominant or near equal to C2H4%
  // (Basically CH4 is dominant, C2H2 very low)
  
  // Zone 2 (T2) - Thermal fault 150-300°C:
  // C2H4% between 20 and 75% approx
  // C2H2% low (0-3-5%)
  // CH4% less than C2H4%
  // (Moderate C2H4, low C2H2)

  // Zone 3 (T3) - Thermal > 700 °C
  // C2H2% dominant (more than 60-70%)
  // CH4% low
  // C2H4% low
  // (C2H2 high)

  // Zone 4 (T4) - Thermal 300-700 °C
  // Intermediate C2H4 and C2H2 ratios
  // C2H4% and C2H2% relatively similar and > 10%
  // CH4% lower or moderate

  // Zone 5 (T5) - Discharges in oil:
  // C2H4 dominant (>50%)
  // C2H2 low or moderate
  // CH4 low
  // (High C2H4, low or moderate C2H2 and CH4)

  // To implement robustly, we can follow this logic (committed best memory):

  // Compute % of each gas:

  function toPercentages(ch4,c2h4,c2h2){
    const sum = ch4 + c2h4 + c2h2;
    return [ch4*100/sum, c2h4*100/sum, c2h2*100/sum];
  }

  // Classification function following the above rules:

  function classify(ch4,c2h4,c2h2){
    if(ch4<0||c2h4<0||c2h2<0) throw new Error("Gas concentrations must be non-negative");
    const sum = ch4+c2h4+c2h2;
    if(sum===0) throw new Error("Sum of gas concentrations must be > 0");

    const [x,y,z] = toPercentages(ch4,c2h4,c2h2);
    // x=CH4%,y=C2H4%,z=C2H2%

    // Zone 3 (T3) - Thermal >700°C
    if(z > 60 && x < 20 && y < 20) return "T3";

    // Zone 1 (T1) - Partial Discharge (PD)
    // C2H2 low (<=4), CH4 >= C2H4
    if(z <= 4 && x >= y) return "T1";

    // Zone 5 (T5) - Discharges in oil
    // High C2H4 (>50), lower C2H2 and CH4
    if(y > 50 && z < 10) return "T5";

    // Zone 2 (T2) - Thermal 150-300°C
    // Moderate C2H4 (20-75), low C2H2 (<=5), CH4 < C2H4
    if(y >= 20 && y <= 75 && z <= 5 && x < y) return "T2";

    // Zone 4 (T4) - Thermal 300-700°C
    // Intermediate values
    // If none of above matched, classify as T4
    return "T4";
  }

  // Helper: convert barycentric coords (p,q,r) to SVG xy
  // p,q,r correspond to CH4,C2H4,C2H2 weights.
  // p+q+r=1

  function baryToXY([p,q,r]){
    // Interpolate point = p*A + q*B + r*C
    const x = p*Ax + q*Bx + r*Cx;
    const y = p*Ay + q*By + r*Cy;
    return [x,y];
  }

  // We'll draw the 5 zones as colored polygons, with some transparency
  // Colors chosen arbitrarily but distinct

  const zones = [
    { code:"T1", name:"Partial Discharge", color:"#ffd700", vertices:[
      [1,0,0],
      [0.75,0,0.25],
      [0.6,0.4,0],
      [0.8,0.2,0],
    ]},
    { code:"T2", name:"Thermal 150-300°C", color:"#ff4500", vertices:[
      [0.6,0.4,0],
      [0.4,0.6,0],
      [0.25,0.5,0.25],
    ]},
    { code:"T3", name:"Thermal >700°C", color:"#8b0000", vertices:[
      [0,0,1],
      [0,0.25,0.75],
      [0.4,0,0.6],
    ]},
    { code:"T4", name:"Thermal 300-700°C", color:"#1e90ff", vertices:[
      [0.25,0.5,0.25],
      [0,0.25,0.75],
      [0,1,0],
      [0.4,0.6,0],
      [0.6,0.4,0],
    ]},
    { code:"T5", name:"Discharges in oil", color:"#32cd32", vertices:[
      [0,1,0],
      [0.25,0.5,0.25],
      [0.4,0.6,0],
    ]},
  ];

  // Function to create SVG element with attributes
  function createSVG(name, attrs){
    const el = document.createElementNS(SVG_NS, name);
    for(const k in attrs) {
      el.setAttribute(k, attrs[k]);
    }
    return el;
  }

  // Draw axis lines with ticks and labels
  function drawAxes(svg){
    // Draw triangle edges as lines, black
    const lines = [
      [Ax,Ay,Bx,By],
      [Bx,By,Cx,Cy],
      [Cx,Cy,Ax,Ay]
    ];
    lines.forEach(([x1,y1,x2,y2]) => {
      const line = createSVG("line",{x1,y1,x2,y2,stroke:"#000", "stroke-width":"2"});
      svg.appendChild(line);
    });

    // Axis labels (gas names) at vertices
    const labels = [
      {x:Ax-30, y:Ay+10, text:"CH\u2084"},
      {x:Bx+20, y:By+10, text:"C\u2082H\u2084"},
      {x:Cx, y:Cy-20, text:"C\u2082H\u2082"},
    ];
    labels.forEach(({x,y,text})=>{
      const t = createSVG("text",{x,y,"font-family":"Arial","font-size":"18","font-weight":"bold",fill:"#000"});
      t.textContent = text;
      svg.appendChild(t);
    });

    // Draw tick marks on each side, with 5 ticks at 20% intervals
    function interp(x1,y1,x2,y2,t){
      return [x1 + (x2-x1)*t, y1 + (y2-y1)*t];
    }
    const nTicks = 5;

    // Bottom edge CH4-C2H4
    for(let i=1;i<nTicks;i++){
      const t = i/nTicks;
      const [x,y] = interp(Ax,Ay,Bx,By,t);
      const tick = createSVG("line",{x1:x,y1:y,x2:x,y2:y+8,stroke:"#000","stroke-width":"1"});
      svg.appendChild(tick);
      const label = createSVG("text",{x:x,y:y+22,"font-family":"Arial","font-size":"12","text-anchor":"middle",fill:"#000"});
      label.textContent = `${i*20}%`;
      svg.appendChild(label);
    }

    // Right edge C2H4-C2H2
    for(let i=1;i<nTicks;i++){
      const t = i/nTicks;
      const [x,y] = interp(Bx,By,Cx,Cy,t);
      const dx = (Cy-By), dy = (Bx-Cx);
      // tick perpendicular approx: rotate line about edge +90 deg
      // Edge vector:
      const ex = Cx-Bx, ey = Cy-By;
      // Perp vector normalized length 8:
      const len = Math.sqrt(ex*ex+ey*ey);
      const px = -ey/len*8;
      const py = ex/len*8;
      const tick = createSVG("line",{x1:x,y1:y,x2:x+px,y2:y+py,stroke:"#000","stroke-width":"1"});
      svg.appendChild(tick);

      const label = createSVG("text",{x:x+px*2,y:y+py*2,"font-family":"Arial","font-size":"12","fill":"#000"});
      label.textContent = `${i*20}%`;
      svg.appendChild(label);
    }

    // Left edge C2H2-CH4
    for(let i=1;i<nTicks;i++){
      const t = i/nTicks;
      const [x,y] = interp(Cx,Cy,Ax,Ay,t);
      const ex = Ax-Cx, ey = Ay-Cy;
      const len = Math.sqrt(ex*ex+ey*ey);
      const px = -ey/len*8;
      const py = ex/len*8;
      const tick = createSVG("line",{x1:x,y1:y,x2:x+px,y2:y+py,stroke:"#000","stroke-width":"1"});
      svg.appendChild(tick);

      const label = createSVG("text",{x:x+px*2,y:y+py*2,"font-family":"Arial","font-size":"12","fill":"#000"});
      label.textContent = `${i*20}%`;
      svg.appendChild(label);
    }
  }

  // Draw zones polygons with fill and label at centroid
  function drawZones(svg){
    zones.forEach(zone=>{
      const pts = zone.vertices.map(baryToXY)
        .map(p=>p.join(","))
        .join(" ");
      const poly = createSVG("polygon",{
        points: pts,
        fill: zone.color,
        "fill-opacity":"0.3",
        stroke: zone.color,
        "stroke-width":"2",
      });
      svg.appendChild(poly);

      // Label: place at average of vertices with slight offset towards center
      let cx=0, cy=0;
      zone.vertices.forEach(v=>{
        const [x,y] = baryToXY(v);
        cx += x; cy += y;
      });
      cx /= zone.vertices.length;
      cy /= zone.vertices.length;

      // Slightly shift label towards triangle center point (center roughly at centroid)
      const centerX = (Ax + Bx + Cx)/3;
      const centerY = (Ay + By + Cy)/3;
      const lx = cx + (centerX - cx)*0.3;
      const ly = cy + (centerY - cy)*0.3;

      const label = createSVG("text",{
        x: lx,
        y: ly,
        "font-family":"Arial",
        "font-size":"20",
        "font-weight":"bold",
        fill:zone.color,
        "text-anchor":"middle",
        "pointer-events":"none",
        "paint-order": "stroke",
        "stroke":"white",
        "stroke-width":2,
      });
      label.textContent = zone.code;
      svg.appendChild(label);
    });
  }

  // Given gas sample, plot marker point inside triangle
  function drawSample(svg, sample){
    if(!sample) return;
    let {ch4,c2h4,c2h2} = sample;
    if(ch4<0||c2h4<0||c2h2<0) throw new Error("Negative gas concentration not allowed");
    const sum = ch4+c2h4+c2h2;
    if(sum===0) return; // no valid point
    const p = ch4/sum, q = c2h4/sum, r = c2h2/sum;
    const [x,y] = baryToXY([p,q,r]);

    // Draw a red circle
    const circle = createSVG("circle",{
      cx: x, cy: y,
      r: 8,
      fill: "red",
      stroke: "black",
      "stroke-width": 2,
      "pointer-events":"none",
    });
    svg.appendChild(circle);

    // Draw black outline again for strong contrast
    // Draw small label with percentages below marker
    const [xp,yp] = [x,y+20];
    const [xper,yper,zper] = toPercentages(ch4,c2h4,c2h2).map(v=>v.toFixed(1)+"%");

    const label = createSVG("text",{
      x: xp,
      y: yp,
      "font-family":"Arial",
      "font-size":"14",
      "font-weight":"bold",
      fill:"black",
      "text-anchor":"middle",
      "pointer-events":"none",
      "paint-order": "stroke",
      "stroke":"white",
      "stroke-width":2,
    });
    label.textContent = `CH4:${xper} C2H4:${yper} C2H2:${zper}`;
    svg.appendChild(label);
  }

  function render(svg, sample){
    // Clear svg content
    while(svg.firstChild) svg.removeChild(svg.firstChild);

    // Set white background rect
    const bg = createSVG("rect",{
      x:0, y:0, width:W, height:H,
      fill:"white"
    });
    svg.appendChild(bg);

    drawZones(svg);
    drawAxes(svg);
    drawSample(svg, sample);
  }

  return { classify, render };
})();
