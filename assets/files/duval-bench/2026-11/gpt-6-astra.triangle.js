const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const gases = [ch4, c2h4, c2h2];
    if (
      gases.some(value =>
        typeof value !== "number" || !Number.isFinite(value) || value < 0
      ) ||
      Math.max(ch4, c2h4, c2h2) === 0
    ) {
      throw new RangeError("Gas concentrations must be finite, non-negative numbers with a positive sum.");
    }

    // Scale before summing to avoid overflow for large concentrations.
    const scale = Math.max(ch4, c2h4, c2h2);
    const a = ch4 / scale;
    const b = c2h4 / scale;
    const c = c2h2 / scale;
    const sum = a + b + c;
    const methane = 100 * (a / sum);
    const ethylene = 100 * (b / sum);
    const acetylene = 100 * (c / sum);
    const epsilon = 1e-10;

    // Shared boundaries belong to the first matching zone below.
    if (methane >= 98 - epsilon) return "PD";
    if (acetylene <= 4 + epsilon && ethylene <= 20 + epsilon) return "T1";
    if (acetylene <= 4 + epsilon && ethylene <= 50 + epsilon) return "T2";
    if (acetylene <= 15 + epsilon && ethylene >= 50 - epsilon) return "T3";
    if (acetylene >= 13 - epsilon && ethylene <= 23 + epsilon) return "D1";
    if (
      acetylene >= 29 - epsilon ||
      (acetylene >= 13 - epsilon && ethylene <= 40 + epsilon)
    ) return "D2";
    return "DT";
  },

  render(svg, sample) {
    const namespace = "http://www.w3.org/2000/svg";
    let normalizedSample = null;

    // Validate before changing the SVG.
    if (sample != null) {
      const zone = DuvalTriangle.classify(sample.ch4, sample.c2h4, sample.c2h2);
      const scale = Math.max(sample.ch4, sample.c2h4, sample.c2h2);
      const a = sample.ch4 / scale;
      const b = sample.c2h4 / scale;
      const c = sample.c2h2 / scale;
      const sum = a + b + c;
      normalizedSample = {
        gases: [100 * a / sum, 100 * b / sum, 100 * c / sum],
        zone: zone
      };
    }

    function element(name, attributes, parent) {
      const node = document.createElementNS(namespace, name);
      Object.keys(attributes || {}).forEach(key => {
        node.setAttribute(key, String(attributes[key]));
      });
      (parent || svg).appendChild(node);
      return node;
    }

    function text(x, y, value, attributes, parent) {
      const node = element("text", Object.assign({
        x: x,
        y: y,
        fill: "#20252b",
        "font-size": 12,
        "text-anchor": "middle",
        "dominant-baseline": "middle"
      }, attributes || {}), parent);
      node.textContent = value;
      return node;
    }

    const top = { x: 300, y: 50 };
    const height = 235 * Math.sqrt(3);
    const left = { x: 65, y: top.y + height };
    const right = { x: 535, y: top.y + height };

    // Barycentric coordinates, ordered CH4, C2H4, C2H2.
    function point(gases) {
      return {
        x: (gases[0] * top.x + gases[1] * right.x + gases[2] * left.x) / 100,
        y: (gases[0] * top.y + gases[1] * right.y + gases[2] * left.y) / 100
      };
    }

    function line(p, q, attributes, parent) {
      return element("line", Object.assign({
        x1: p.x,
        y1: p.y,
        x2: q.x,
        y2: q.y,
        stroke: "#343a40",
        "stroke-width": 1
      }, attributes || {}), parent);
    }

    const zones = [
      {
        code: "PD",
        name: "Partial discharges",
        color: "#c9a3df",
        vertices: [[100, 0, 0], [98, 2, 0], [98, 0, 2]]
      },
      {
        code: "T1",
        name: "Thermal fault below 300 °C",
        color: "#ffe69a",
        vertices: [
          [98, 0, 2], [98, 2, 0], [80, 20, 0],
          [76, 20, 4], [96, 0, 4]
        ],
        label: [88, 10, 2],
        rotation: 60
      },
      {
        code: "T2",
        name: "Thermal fault from 300 to 700 °C",
        color: "#ffbd75",
        vertices: [[80, 20, 0], [50, 50, 0], [46, 50, 4], [76, 20, 4]],
        label: [64, 34, 2],
        rotation: 60
      },
      {
        code: "T3",
        name: "Thermal fault above 700 °C",
        color: "#ef8e87",
        vertices: [[50, 50, 0], [0, 100, 0], [0, 85, 15], [35, 50, 15]],
        label: [22, 70, 8]
      },
      {
        code: "D1",
        name: "Discharges of low energy",
        color: "#a6d8ef",
        vertices: [[0, 0, 100], [0, 23, 77], [64, 23, 13], [87, 0, 13]],
        label: [30, 8, 62]
      },
      {
        code: "D2",
        name: "Discharges of high energy",
        color: "#adb9e5",
        vertices: [
          [0, 23, 77], [0, 71, 29], [31, 40, 29],
          [47, 40, 13], [64, 23, 13]
        ],
        label: [24, 40, 36]
      },
      {
        code: "DT",
        name: "Mixture of thermal and electrical faults",
        color: "#cbd6a0",
        vertices: [
          [96, 0, 4], [46, 50, 4], [35, 50, 15], [0, 85, 15],
          [0, 71, 29], [31, 40, 29], [47, 40, 13], [87, 0, 13]
        ],
        label: [53, 39, 8]
      }
    ];

    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute("viewBox", "0 0 600 540");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Duval Triangle 1" +
      (normalizedSample ? "; sample classified as " + normalizedSample.zone : ""));
    svg.setAttribute("font-family", "Arial, Helvetica, sans-serif");

    element("title").textContent = "Duval Triangle 1";
    element("desc").textContent =
      "Dissolved gas analysis of mineral-oil-filled transformers. " +
      "Coordinates are percentages of the sum of methane, ethylene, and acetylene. " +
      "The triangle assigns a fault type; it does not establish whether a fault exists.";

    const fills = element("g");
    zones.forEach(zone => {
      zone.points = zone.vertices.map(gases => {
        const p = point(gases);
        return p.x + "," + p.y;
      }).join(" ");
      const polygon = element("polygon", {
        points: zone.points,
        fill: zone.color
      }, fills);
      element("title", {}, polygon).textContent = zone.code + ": " + zone.name;
    });

    // Ten-percent grid lines in all three barycentric directions.
    const grid = element("g", { "pointer-events": "none" });
    for (let percent = 10; percent < 100; percent += 10) {
      const rest = 100 - percent;
      [
        [[percent, 0, rest], [percent, rest, 0]],
        [[0, percent, rest], [rest, percent, 0]],
        [[0, rest, percent], [rest, 0, percent]]
      ].forEach(segment => {
        line(point(segment[0]), point(segment[1]), {
          stroke: "#34404b",
          "stroke-opacity": 0.15,
          "stroke-width": 0.65
        }, grid);
      });
    }

    const boundaries = element("g", {
      fill: "none",
      stroke: "#42474c",
      "stroke-width": 1.1,
      "stroke-linejoin": "round",
      "pointer-events": "none"
    });
    zones.forEach(zone => {
      element("polygon", { points: zone.points }, boundaries);
    });
    element("polygon", {
      points: [top, right, left].map(p => p.x + "," + p.y).join(" "),
      fill: "none",
      stroke: "#20252b",
      "stroke-width": 1.8
    });

    const labels = element("g", { "pointer-events": "none" });
    zones.forEach(zone => {
      if (!zone.label) return;
      const p = point(zone.label);
      const attributes = {
        "font-size": zone.rotation ? 13 : 20,
        "font-weight": "bold"
      };
      if (zone.rotation) {
        attributes.transform = "rotate(" + zone.rotation + " " + p.x + " " + p.y + ")";
      }
      text(p.x, p.y, zone.code, attributes, labels);
    });

    // PD is too small for an internal label.
    const pdPoint = point([98.7, 0.65, 0.65]);
    line({ x: 300, y: 24 }, pdPoint, {
      stroke: "#4e3264",
      "stroke-width": 1.1
    }, labels);
    text(300, 13, "PD", { "font-size": 14, "font-weight": "bold" }, labels);

    const axes = element("g");
    const cosine30 = Math.sqrt(3) / 2;
    const axisDefinitions = [
      {
        position: percent => point([percent, 0, 100 - percent]),
        normal: { x: -cosine30, y: -0.5 },
        label: "CH₄ (%) →",
        midpoint: { x: (left.x + top.x) / 2, y: (left.y + top.y) / 2 },
        rotation: -60
      },
      {
        position: percent => point([100 - percent, percent, 0]),
        normal: { x: cosine30, y: -0.5 },
        label: "C₂H₄ (%) →",
        midpoint: { x: (top.x + right.x) / 2, y: (top.y + right.y) / 2 },
        rotation: 60
      },
      {
        position: percent => point([0, 100 - percent, percent]),
        normal: { x: 0, y: 1 },
        label: "← C₂H₂ (%)",
        midpoint: { x: 300, y: left.y },
        rotation: 0
      }
    ];

    axisDefinitions.forEach(axis => {
      for (let percent = 0; percent <= 100; percent += 10) {
        const p = axis.position(percent);
        const tickLength = percent % 20 === 0 ? 7 : 5;
        line(p, {
          x: p.x + axis.normal.x * tickLength,
          y: p.y + axis.normal.y * tickLength
        }, {}, axes);
        text(
          p.x + axis.normal.x * 19,
          p.y + axis.normal.y * 19,
          String(percent),
          { "font-size": 11 },
          axes
        );
      }

      const offset = axis.rotation === 0 ? 55 : 51;
      const x = axis.midpoint.x + axis.normal.x * offset;
      const y = axis.midpoint.y + axis.normal.y * offset;
      text(x, y, axis.label, {
        "font-size": 16,
        "font-weight": "bold",
        transform: "rotate(" + axis.rotation + " " + x + " " + y + ")"
      }, axes);
    });

    if (normalizedSample) {
      const p = point(normalizedSample.gases);
      const marker = element("g", {
        "aria-label": "Sample: " + normalizedSample.zone
      });
      element("title", {}, marker).textContent =
        "Sample: " + normalizedSample.zone +
        "\nCH₄: " + sample.ch4 + " ppm (" + normalizedSample.gases[0].toFixed(2) + "%)" +
        "\nC₂H₄: " + sample.c2h4 + " ppm (" + normalizedSample.gases[1].toFixed(2) + "%)" +
        "\nC₂H₂: " + sample.c2h2 + " ppm (" + normalizedSample.gases[2].toFixed(2) + "%)";
      element("circle", {
        cx: p.x,
        cy: p.y,
        r: 6,
        fill: "#ffffff",
        stroke: "#111111",
        "stroke-width": 2
      }, marker);
      element("circle", {
        cx: p.x,
        cy: p.y,
        r: 2.5,
        fill: "#111111"
      }, marker);
    }
  }
};
