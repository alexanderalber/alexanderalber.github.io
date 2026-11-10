const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const gases = [ch4, c2h4, c2h6];
    if (gases.some(v => typeof v !== "number" || !Number.isFinite(v) || v < 0)) {
      throw new RangeError("Gas concentrations must be finite, non-negative numbers.");
    }

    // Scale before summing so that large, finite concentrations cannot overflow.
    const scale = Math.max(...gases);
    if (scale === 0) {
      throw new RangeError("At least one gas concentration must be positive.");
    }

    const total = ch4 / scale + c2h4 / scale + c2h6 / scale;
    const ethylene = 100 * (c2h4 / scale) / total;
    const ethane = 100 * (c2h6 / scale) / total;

    // Shared boundaries belong to the first matching zone.
    if (ethylene <= 1 && ethane <= 2) return "PD";
    if (ethylene <= 10 && ethane <= 2) return "S";
    if (ethylene <= 10) return "O";
    if (ethylene <= 35 && ethane <= 12) return "T2-H";
    if (
      ethane <= 12 ||
      (ethylene >= 50 && ethane <= 14) ||
      ethylene >= 70
    ) {
      return "T3-H";
    }
    return "C";
  },

  render(svg, sample) {
    const NS = "http://www.w3.org/2000/svg";

    // Validate the sample before changing the SVG.
    let sampleZone = null;
    let samplePercent = null;
    if (sample !== null && sample !== undefined) {
      sampleZone = DuvalTriangle5.classify(
        sample.ch4, sample.c2h4, sample.c2h6
      );
      const scale = Math.max(sample.ch4, sample.c2h4, sample.c2h6);
      const total =
        sample.ch4 / scale + sample.c2h4 / scale + sample.c2h6 / scale;
      samplePercent = {
        ch4: 100 * (sample.ch4 / scale) / total,
        c2h4: 100 * (sample.c2h4 / scale) / total,
        c2h6: 100 * (sample.c2h6 / scale) / total
      };
    }

    const root = document.createElementNS(NS, "g");
    root.setAttribute("font-family", "Arial, Helvetica, sans-serif");
    root.setAttribute("font-size", "12");
    root.setAttribute("fill", "#17212b");

    function element(name, attributes, parent = root, content) {
      const node = document.createElementNS(NS, name);
      for (const [key, value] of Object.entries(attributes || {})) {
        node.setAttribute(key, String(value));
      }
      if (content !== undefined) node.textContent = content;
      parent.appendChild(node);
      return node;
    }

    // Equilateral triangle: CH4 at the top, C2H6 at bottom left,
    // C2H4 at bottom right. Arguments are percentages of ethane/ethylene.
    function point(ethane, ethylene) {
      return [
        300 + 2.4 * (ethylene - ethane),
        56 + 4.16 * (ethane + ethylene)
      ];
    }

    function line(x1, y1, x2, y2, attributes = {}, parent = root) {
      return element("line", {
        x1, y1, x2, y2,
        stroke: "#263238",
        "stroke-width": 1,
        ...attributes
      }, parent);
    }

    function text(x, y, content, attributes = {}, parent = root) {
      return element("text", {
        x, y,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        ...attributes
      }, parent, content);
    }

    function polygon(vertices, fill) {
      return element("polygon", {
        points: vertices.map(v => point(v[0], v[1]).join(",")).join(" "),
        fill,
        stroke: "#37474f",
        "stroke-width": 1.1,
        "stroke-linejoin": "round"
      });
    }

    function label(ethane, ethylene, content, size = 17) {
      const p = point(ethane, ethylene);
      return text(p[0], p[1], content, {
        "font-size": size,
        "font-weight": "bold",
        "paint-order": "stroke",
        stroke: "#ffffff",
        "stroke-width": 3,
        "stroke-linejoin": "round"
      });
    }

    element("title", {}, root, "Duval Triangle 5");
    element("desc", {}, root,
      "Mineral-oil DGA triangle normalized to methane, ethylene and ethane. " +
      "Zones: PD, S, O, C, T2-H and T3-H." +
      (sampleZone ? " Sample zone: " + sampleZone + "." : "")
    );

    // Coordinates below are [C2H6 %, C2H4 %].
    polygon([[0, 0], [2, 0], [2, 1], [0, 1]], "#d9c9f0"); // PD
    polygon([[0, 1], [2, 1], [2, 10], [0, 10]], "#bce4ed"); // S
    polygon([[2, 0], [100, 0], [90, 10], [2, 10]], "#c9e7bb"); // O
    polygon([[0, 10], [12, 10], [12, 35], [0, 35]], "#ffe09a"); // T2-H
    polygon([
      [12, 10], [90, 10], [30, 70],
      [14, 70], [14, 50], [12, 50]
    ], "#f5b6b0"); // C
    polygon([
      [0, 35], [12, 35], [12, 50],
      [14, 50], [14, 70], [30, 70], [0, 100]
    ], "#efa66d"); // T3-H

    // Outer border.
    element("polygon", {
      points: "300,56 60,472 540,472",
      fill: "none",
      stroke: "#17212b",
      "stroke-width": 1.8,
      "stroke-linejoin": "round"
    });

    // CH4 axis: bottom-left to top.
    // C2H4 axis: top to bottom-right.
    // C2H6 axis: bottom-right to bottom-left.
    const tickLength = 6;
    const nx = Math.sqrt(3) / 2;
    for (let percentage = 0; percentage <= 100; percentage += 10) {
      const t = percentage / 100;

      let x = 60 + 240 * t;
      let y = 472 - 416 * t;
      line(x, y, x - nx * tickLength, y - tickLength / 2);
      text(x - 17, y - 9, percentage, {
        "font-size": 10,
        "text-anchor": "end"
      });

      x = 300 + 240 * t;
      y = 56 + 416 * t;
      line(x, y, x + nx * tickLength, y - tickLength / 2);
      text(x + 17, y - 9, percentage, {
        "font-size": 10,
        "text-anchor": "start"
      });

      x = 540 - 480 * t;
      y = 472;
      line(x, y, x, y + tickLength);
      text(x, y + 18, percentage, { "font-size": 10 });
    }

    text(300, 22, "CH₄ (%)", {
      "font-size": 17,
      "font-weight": "bold"
    });
    text(62, 518, "C₂H₆ (%)", {
      "font-size": 17,
      "font-weight": "bold"
    });
    text(538, 518, "C₂H₄ (%)", {
      "font-size": 17,
      "font-weight": "bold"
    });

    label(49, 4.7, "O", 20);
    label(34, 30, "C", 20);
    label(6, 23, "T2-H", 13);
    label(8, 73, "T3-H", 16);

    // Leader labels keep the two very small apex zones readable.
    const pd = point(1, 0.5);
    element("polyline", {
      points: `${pd[0]},${pd[1]} 268,66 245,66`,
      fill: "none",
      stroke: "#263238",
      "stroke-width": 1
    });
    text(237, 66, "PD", {
      "text-anchor": "end",
      "font-size": 13,
      "font-weight": "bold"
    });

    const s = point(1, 6);
    element("polyline", {
      points: `${s[0]},${s[1]} 347,77 362,77`,
      fill: "none",
      stroke: "#263238",
      "stroke-width": 1
    });
    text(370, 77, "S", {
      "text-anchor": "start",
      "font-size": 13,
      "font-weight": "bold"
    });

    if (samplePercent) {
      const p = point(samplePercent.c2h6, samplePercent.c2h4);
      const marker = element("g", {
        "aria-label": "Sample: " + sampleZone
      });
      element("title", {}, marker,
        `Sample: ${sampleZone}\n` +
        `CH₄: ${samplePercent.ch4.toFixed(2)}%\n` +
        `C₂H₄: ${samplePercent.c2h4.toFixed(2)}%\n` +
        `C₂H₆: ${samplePercent.c2h6.toFixed(2)}%`
      );
      element("circle", {
        cx: p[0], cy: p[1], r: 6,
        fill: "#ffffff",
        stroke: "#111111",
        "stroke-width": 2
      }, marker);
      line(p[0] - 9, p[1], p[0] + 9, p[1],
        { stroke: "#111111", "stroke-width": 1.5 }, marker);
      line(p[0], p[1] - 9, p[0], p[1] + 9,
        { stroke: "#111111", "stroke-width": 1.5 }, marker);
      element("circle", {
        cx: p[0], cy: p[1], r: 2,
        fill: "#111111"
      }, marker);
    }

    svg.replaceChildren(root);
  }
};
