const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const gases = [ch4, c2h4, c2h2];
    if (gases.some(value => !Number.isFinite(value) || value < 0)) {
      throw new RangeError("Gas concentrations must be finite, non-negative numbers.");
    }

    // Scaling before summation also handles very large finite concentrations.
    const scale = Math.max(...gases);
    if (scale === 0) {
      throw new RangeError("At least one gas concentration must be positive.");
    }

    const total = ch4 / scale + c2h4 / scale + c2h2 / scale;
    const methane = 100 * (ch4 / scale) / total;
    const ethylene = 100 * (c2h4 / scale) / total;
    const acetylene = 100 * (c2h2 / scale) / total;

    // Shared boundaries are assigned deterministically in the order below.
    // The tolerance compensates only for normalization round-off.
    const epsilon = 1e-10;
    const le = (value, limit) => value <= limit + epsilon;
    const ge = (value, limit) => value >= limit - epsilon;

    if (ge(methane, 98)) return "PD";

    if (le(ethylene, 23) && ge(acetylene, 13)) return "D1";

    if (
      (le(ethylene, 40) && ge(acetylene, 13)) ||
      ge(acetylene, 29)
    ) {
      return "D2";
    }

    if (le(ethylene, 20) && le(acetylene, 4)) return "T1";
    if (le(ethylene, 50) && le(acetylene, 4)) return "T2";
    if (ge(ethylene, 50) && le(acetylene, 15)) return "T3";

    return "DT";
  },

  render(svg, sample) {
    let sampleData = null;

    if (sample !== null && sample !== undefined) {
      const { ch4, c2h4, c2h2 } = sample;
      const zone = DuvalTriangle.classify(ch4, c2h4, c2h2);
      const scale = Math.max(ch4, c2h4, c2h2);
      const total = ch4 / scale + c2h4 / scale + c2h2 / scale;

      sampleData = {
        zone,
        percentages: [
          100 * (ch4 / scale) / total,
          100 * (c2h4 / scale) / total,
          100 * (c2h2 / scale) / total
        ]
      };
    }

    const ns = "http://www.w3.org/2000/svg";
    const make = (name, attributes, parent, text) => {
      const element = document.createElementNS(ns, name);
      for (const [key, value] of Object.entries(attributes || {})) {
        element.setAttribute(key, String(value));
      }
      if (text !== undefined) element.textContent = text;
      if (parent) parent.appendChild(element);
      return element;
    };

    const root = make("g", {
      "font-family": "Arial, Helvetica, sans-serif",
      "font-size": 12,
      "stroke-linejoin": "round",
      role: "img",
      "aria-label": "Duval Triangle 1 dissolved gas analysis"
    });

    make("title", {}, root, "Duval Triangle 1");
    make(
      "desc",
      {},
      root,
      "Mineral-oil transformer DGA. Percentages are normalized using methane, " +
      "ethylene and acetylene only. PD: partial discharges; D1: low-energy " +
      "discharges; D2: high-energy discharges; T1: thermal fault below 300 °C; " +
      "T2: thermal fault from 300 to 700 °C; T3: thermal fault above 700 °C; " +
      "DT: mixture of thermal and electrical faults." +
      (sampleData ? " Sample zone: " + sampleData.zone + "." : "")
    );

    // Vertex order: methane at top, ethylene at right, acetylene at left.
    const top = [300, 55];
    const right = [535, 462];
    const left = [65, 462];

    const point = percentages => {
      const [m, e, a] = percentages;
      return [
        (m * top[0] + e * right[0] + a * left[0]) / 100,
        (m * top[1] + e * right[1] + a * left[1]) / 100
      ];
    };

    const pointsAttribute = vertices =>
      vertices.map(vertex => point(vertex).join(",")).join(" ");

    // All vertices are [CH4 %, C2H4 %, C2H2 %].
    const zones = [
      {
        code: "PD",
        color: "#b6dfbd",
        vertices: [[100, 0, 0], [98, 2, 0], [98, 0, 2]]
      },
      {
        code: "D1",
        color: "#9fc9ee",
        vertices: [[0, 0, 100], [0, 23, 77], [64, 23, 13], [87, 0, 13]]
      },
      {
        code: "D2",
        color: "#bca9dc",
        vertices: [
          [0, 23, 77], [0, 71, 29], [31, 40, 29],
          [47, 40, 13], [64, 23, 13]
        ]
      },
      {
        code: "T1",
        color: "#fff2a8",
        vertices: [
          [98, 0, 2], [98, 2, 0], [80, 20, 0],
          [76, 20, 4], [96, 0, 4]
        ]
      },
      {
        code: "T2",
        color: "#ffc878",
        vertices: [[80, 20, 0], [50, 50, 0], [46, 50, 4], [76, 20, 4]]
      },
      {
        code: "T3",
        color: "#ee9284",
        vertices: [[50, 50, 0], [0, 100, 0], [0, 85, 15], [35, 50, 15]]
      },
      {
        code: "DT",
        color: "#e4cadb",
        vertices: [
          [96, 0, 4], [76, 20, 4], [46, 50, 4], [35, 50, 15],
          [0, 85, 15], [0, 71, 29], [31, 40, 29],
          [47, 40, 13], [87, 0, 13]
        ]
      }
    ];

    make("text", {
      x: 300, y: 22,
      "text-anchor": "middle",
      "font-size": 17,
      "font-weight": "bold",
      fill: "#222"
    }, root, "Duval Triangle 1");

    const fills = make("g", {}, root);
    for (const zone of zones) {
      const polygon = make("polygon", {
        points: pointsAttribute(zone.vertices),
        fill: zone.color
      }, fills);
      make("title", {}, polygon, zone.code);
    }

    const grid = make("g", {
      fill: "none",
      stroke: "#ffffff",
      "stroke-opacity": 0.45,
      "stroke-width": 0.65,
      "pointer-events": "none"
    }, root);

    for (let value = 10; value < 100; value += 10) {
      const remainder = 100 - value;
      const lines = [
        [[value, remainder, 0], [value, 0, remainder]],
        [[remainder, value, 0], [0, value, remainder]],
        [[remainder, 0, value], [0, remainder, value]]
      ];
      for (const vertices of lines) {
        make("polyline", { points: pointsAttribute(vertices) }, grid);
      }
    }

    const boundaries = make("g", {
      fill: "none",
      stroke: "#555",
      "stroke-width": 1,
      "pointer-events": "none"
    }, root);

    for (const zone of zones) {
      make("polygon", {
        points: pointsAttribute(zone.vertices)
      }, boundaries);
    }

    make("polygon", {
      points: [top, right, left].map(vertex => vertex.join(",")).join(" "),
      fill: "none",
      stroke: "#222",
      "stroke-width": 1.6
    }, root);

    const labels = make("g", {
      fill: "#222",
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      "font-weight": "bold",
      "pointer-events": "none"
    }, root);

    const zoneLabel = (code, percentages, angle, size) => {
      const [x, y] = point(percentages);
      make("text", {
        x, y,
        "font-size": size || 15,
        ...(angle ? { transform: `rotate(${angle} ${x} ${y})` } : {})
      }, labels, code);
    };

    zoneLabel("D1", [28, 10, 62]);
    zoneLabel("D2", [20, 44, 36]);
    zoneLabel("DT", [33, 48, 19]);
    zoneLabel("T1", [86, 12, 2], 60, 10);
    zoneLabel("T2", [63, 35, 2], 60, 11);
    zoneLabel("T3", [20, 74, 6]);

    // PD is too small for an internal label; use a short leader.
    const pdPoint = point([99, 0.5, 0.5]);
    make("polyline", {
      points: `${pdPoint.join(",")} 329,69 348,69`,
      fill: "none",
      stroke: "#333",
      "stroke-width": 0.9
    }, root);
    make("text", {
      x: 354, y: 69,
      fill: "#222",
      "font-size": 12,
      "font-weight": "bold",
      "dominant-baseline": "middle"
    }, root, "PD");

    const axes = make("g", {
      fill: "#333",
      "font-size": 10,
      "text-anchor": "middle",
      "dominant-baseline": "middle"
    }, root);

    const ticks = (start, end, normal) => {
      for (let value = 0; value <= 100; value += 10) {
        const fraction = value / 100;
        const x = start[0] + (end[0] - start[0]) * fraction;
        const y = start[1] + (end[1] - start[1]) * fraction;
        make("line", {
          x1: x, y1: y,
          x2: x + normal[0] * 6,
          y2: y + normal[1] * 6,
          stroke: "#333",
          "stroke-width": 1
        }, axes);
        make("text", {
          x: x + normal[0] * 17,
          y: y + normal[1] * 17
        }, axes, String(value));
      }
    };

    ticks(left, top, [-Math.sqrt(3) / 2, -0.5]);   // CH4 increases upward.
    ticks(top, right, [Math.sqrt(3) / 2, -0.5]);   // C2H4 increases downward.
    ticks(right, left, [0, 1]);                   // C2H2 increases leftward.

    const axisTitle = (text, x, y, angle) => {
      make("text", {
        x, y,
        "font-size": 13,
        "font-weight": "bold",
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        fill: "#222",
        ...(angle ? { transform: `rotate(${angle} ${x} ${y})` } : {})
      }, root, text);
    };

    axisTitle("CH\u2084 (%) \u2192", 141, 235, -60);
    axisTitle("C\u2082H\u2084 (%) \u2192", 459, 235, 60);
    axisTitle("\u2190 C\u2082H\u2082 (%)", 300, 510, 0);

    if (sampleData) {
      const [x, y] = point(sampleData.percentages);
      const marker = make("g", {
        "aria-label": "Sample: " + sampleData.zone
      }, root);

      make("title", {}, marker, "Sample: " + sampleData.zone);
      make("circle", {
        cx: x, cy: y, r: 6,
        fill: "#fff",
        stroke: "#111",
        "stroke-width": 1.5
      }, marker);
      make("circle", {
        cx: x, cy: y, r: 2.5,
        fill: "#111"
      }, marker);

      const [m, e, a] = sampleData.percentages;
      make("text", {
        x: 300, y: 534,
        "text-anchor": "middle",
        "font-size": 11,
        fill: "#222"
      }, root,
        `Sample: ${sampleData.zone} — CH\u2084 ${m.toFixed(1)}%, ` +
        `C\u2082H\u2084 ${e.toFixed(1)}%, C\u2082H\u2082 ${a.toFixed(1)}%`
      );
    }

    // Replace only this SVG's contents; no outside nodes or styles are changed.
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.appendChild(root);
  }
};
