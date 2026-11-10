const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const gases = [ch4, c2h4, c2h6];
    if (!gases.every(v => typeof v === "number" && Number.isFinite(v) && v >= 0)) {
      throw new RangeError("Gas concentrations must be finite, non-negative numbers.");
    }

    // Scale first so that even very large finite concentrations normalize safely.
    const scale = Math.max(...gases);
    if (scale === 0) {
      throw new RangeError("The sum of the gas concentrations must be positive.");
    }
    const sum = ch4 / scale + c2h4 / scale + c2h6 / scale;
    const m = 100 * (ch4 / scale) / sum;
    const e = 100 * (c2h4 / scale) / sum;
    const a = 100 * (c2h6 / scale) / sum;
    const eps = 1e-10;

    // Shared boundaries belong to the first matching zone.
    if (m >= 98 - eps) return "PD";
    if (e <= 10 + eps) {
      if (a <= 2 + eps || a >= 54 - eps) return "O";
      return "S";
    }
    if (e <= 35 + eps && a <= 12 + eps) return "T2-H";
    if (
      (e >= 35 - eps && a <= 12 + eps) ||
      (e >= 50 - eps && a <= 30 + eps)
    ) {
      return "T3-H";
    }
    return "C";
  },

  render(svg, sample) {
    const ns = "http://www.w3.org/2000/svg";
    if (!svg || svg.namespaceURI !== ns || svg.localName !== "svg") {
      throw new TypeError("render requires an SVG element.");
    }

    let normalizedSample = null;
    let sampleZone = null;
    if (sample != null) {
      sampleZone = DuvalTriangle5.classify(sample.ch4, sample.c2h4, sample.c2h6);
      const scale = Math.max(sample.ch4, sample.c2h4, sample.c2h6);
      const values = [sample.ch4 / scale, sample.c2h4 / scale, sample.c2h6 / scale];
      const total = values.reduce((sum, v) => sum + v, 0);
      normalizedSample = values.map(v => 100 * v / total);
    }

    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute("viewBox", "0 0 600 540");
    svg.setAttribute("role", "img");
    svg.setAttribute(
      "aria-label",
      "Duval Triangle 5" + (sampleZone ? "; sample zone " + sampleZone : "")
    );

    function element(name, attributes, parent, text) {
      const node = document.createElementNS(ns, name);
      for (const key in attributes) node.setAttribute(key, attributes[key]);
      if (text !== undefined) node.textContent = text;
      (parent || svg).appendChild(node);
      return node;
    }

    // Barycentric order throughout: CH4, C2H4, C2H6.
    const top = [300, 45];
    const right = [535, 450];
    const left = [65, 450];

    function point(values) {
      const [m, e, a] = values;
      return [
        (m * top[0] + e * right[0] + a * left[0]) / 100,
        (m * top[1] + e * right[1] + a * left[1]) / 100
      ];
    }

    function line(p, q, attributes, parent) {
      return element("line", Object.assign({
        x1: p[0], y1: p[1], x2: q[0], y2: q[1]
      }, attributes), parent);
    }

    function text(x, y, value, attributes, parent) {
      return element("text", Object.assign({
        x, y,
        "font-family": "Arial, Helvetica, sans-serif",
        "font-size": 13,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        fill: "#17212b"
      }, attributes), parent, value);
    }

    element("title", {}, svg, "Duval Triangle 5");
    element(
      "desc", {}, svg,
      "Normalized methane, ethylene and ethane concentrations. " +
      "PD: partial discharge; O: overheating; S: stray gassing; " +
      "C: possible paper carbonization; T2-H and T3-H: thermal faults in oil."
    );

    const zones = [
      {
        code: "PD", color: "#cbb7e8",
        vertices: [[100, 0, 0], [98, 2, 0], [98, 0, 2]]
      },
      {
        code: "O", color: "#99d7f0",
        vertices: [[98, 2, 0], [90, 10, 0], [88, 10, 2], [98, 0, 2]]
      },
      {
        code: "S", color: "#b7df9c",
        vertices: [[98, 0, 2], [88, 10, 2], [36, 10, 54], [46, 0, 54]]
      },
      {
        code: "O", color: "#99d7f0",
        vertices: [[46, 0, 54], [36, 10, 54], [0, 10, 90], [0, 0, 100]]
      },
      {
        code: "T2-H", color: "#f6ce78",
        vertices: [[90, 10, 0], [65, 35, 0], [53, 35, 12], [78, 10, 12]]
      },
      {
        code: "T3-H", color: "#f19a8e",
        vertices: [
          [65, 35, 0], [0, 100, 0], [0, 70, 30],
          [20, 50, 30], [38, 50, 12], [53, 35, 12]
        ]
      },
      {
        code: "C", color: "#eee49b",
        vertices: [
          [78, 10, 12], [53, 35, 12], [38, 50, 12],
          [20, 50, 30], [0, 70, 30], [0, 10, 90],
          [36, 10, 54]
        ]
      }
    ];

    const fills = element("g", {}, svg);
    for (const zone of zones) {
      const polygon = element("polygon", {
        points: zone.vertices.map(v => point(v).join(",")).join(" "),
        fill: zone.color
      }, fills);
      element("title", {}, polygon, zone.code);
    }

    const grid = element("g", {
      stroke: "#34495e",
      "stroke-width": 0.65,
      "stroke-opacity": 0.23,
      "stroke-dasharray": "2 3",
      "pointer-events": "none"
    }, svg);

    for (let p = 10; p < 100; p += 10) {
      line(point([p, 0, 100 - p]), point([p, 100 - p, 0]), {}, grid);
      line(point([0, p, 100 - p]), point([100 - p, p, 0]), {}, grid);
      line(point([0, 100 - p, p]), point([100 - p, 0, p]), {}, grid);
    }

    const boundaries = element("g", {
      fill: "none",
      stroke: "#374151",
      "stroke-width": 1.1,
      "stroke-linejoin": "round",
      "pointer-events": "none"
    }, svg);

    // Draw each shared boundary only once.
    const drawnEdges = new Set();
    for (const zone of zones) {
      for (let i = 0; i < zone.vertices.length; i++) {
        const a = zone.vertices[i];
        const b = zone.vertices[(i + 1) % zone.vertices.length];
        const key = [a.join(","), b.join(",")].sort().join("|");
        if (!drawnEdges.has(key)) {
          drawnEdges.add(key);
          line(point(a), point(b), {}, boundaries);
        }
      }
    }

    element("polygon", {
      points: [top, right, left].map(p => p.join(",")).join(" "),
      fill: "none",
      stroke: "#17212b",
      "stroke-width": 1.8
    }, svg);

    const axes = element("g", {}, svg);
    for (let value = 0; value <= 100; value += 10) {
      // CH4 increases up the left edge.
      let p = point([value, 0, 100 - value]);
      line(p, [p[0] - 7, p[1] - 4], { stroke: "#17212b" }, axes);
      text(p[0] - 21, p[1] - 11, String(value), { "font-size": 10 }, axes);

      // C2H4 increases down the right edge.
      p = point([100 - value, value, 0]);
      line(p, [p[0] + 7, p[1] - 4], { stroke: "#17212b" }, axes);
      text(p[0] + 21, p[1] - 11, String(value), { "font-size": 10 }, axes);

      // C2H6 increases from right to left along the base.
      p = point([0, 100 - value, value]);
      line(p, [p[0], p[1] + 7], { stroke: "#17212b" }, axes);
      text(p[0], p[1] + 21, String(value), { "font-size": 10 }, axes);
    }

    text(300, 17, "Duval Triangle 5", {
      "font-size": 17, "font-weight": "bold"
    });

    text(130, 235, "CH₄ (%) →", {
      "font-size": 15,
      transform: "rotate(-59.87 130 235)"
    }, axes);
    text(470, 235, "C₂H₄ (%) →", {
      "font-size": 15,
      transform: "rotate(59.87 470 235)"
    }, axes);
    text(300, 503, "← C₂H₆ (%)", { "font-size": 15 }, axes);

    const labels = element("g", { "pointer-events": "none" }, svg);
    function zoneLabel(code, composition) {
      const p = point(composition);
      text(p[0], p[1], code, {
        "font-size": 14,
        "font-weight": "bold"
      }, labels);
    }

    zoneLabel("S", [70, 5, 25]);
    zoneLabel("O", [18, 4, 78]);
    zoneLabel("C", [36, 30, 34]);
    zoneLabel("T2-H", [74, 20, 6]);
    zoneLabel("T3-H", [24, 65, 11]);

    // The two small apex regions need external labels.
    function callout(code, composition, x, y) {
      const p = point(composition);
      line(p, [x - 15, y], {
        stroke: "#17212b",
        "stroke-width": 0.9
      }, labels);
      text(x, y, code, {
        "font-size": 13,
        "font-weight": "bold",
        "paint-order": "stroke",
        stroke: "white",
        "stroke-width": 3,
        "stroke-linejoin": "round"
      }, labels);
    }

    callout("PD", [99, 0.5, 0.5], 389, 43);
    callout("O", [94, 5, 1], 410, 78);

    if (normalizedSample) {
      const p = point(normalizedSample);
      const marker = element("g", {
        "aria-label": "Sample: " + sampleZone
      }, svg);

      element("title", {}, marker,
        "Sample: " + sampleZone + "\n" +
        "CH₄: " + sample.ch4 + " ppm (" + normalizedSample[0].toFixed(2) + "%)\n" +
        "C₂H₄: " + sample.c2h4 + " ppm (" + normalizedSample[1].toFixed(2) + "%)\n" +
        "C₂H₆: " + sample.c2h6 + " ppm (" + normalizedSample[2].toFixed(2) + "%)"
      );

      element("circle", {
        cx: p[0], cy: p[1], r: 6,
        fill: "white", stroke: "#111827", "stroke-width": 2
      }, marker);
      line([p[0] - 10, p[1]], [p[0] + 10, p[1]], {
        stroke: "#111827", "stroke-width": 1.5
      }, marker);
      line([p[0], p[1] - 10], [p[0], p[1] + 10], {
        stroke: "#111827", "stroke-width": 1.5
      }, marker);
      element("circle", {
        cx: p[0], cy: p[1], r: 2.1, fill: "#111827"
      }, marker);
    }
  }
};
