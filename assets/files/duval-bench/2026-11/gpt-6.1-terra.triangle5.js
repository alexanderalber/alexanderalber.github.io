const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const values = [ch4, c2h4, c2h6];
    if (
      values.some(v => typeof v !== "number" || !Number.isFinite(v) || v < 0)
    ) {
      throw new RangeError("Gas concentrations must be finite non-negative numbers.");
    }

    const scale = Math.max(...values);
    if (scale === 0) {
      throw new RangeError("At least one gas concentration must be positive.");
    }

    const total = ch4 / scale + c2h4 / scale + c2h6 / scale;
    const ethylene = 100 * (c2h4 / scale) / total;
    const ethane = 100 * (c2h6 / scale) / total;

    if (ethylene >= 50) return "T3";
    if (ethylene >= 10 && ethane < 10) return "C";
    if (ethylene >= 20) return "T2";
    if (ethane >= 35) return "S";
    return "O";
  },

  render(svg, sample) {
    const ns = "http://www.w3.org/2000/svg";
    let samplePoint = null;

    if (sample !== null) {
      DuvalTriangle5.classify(sample.ch4, sample.c2h4, sample.c2h6);
      const scale = Math.max(sample.ch4, sample.c2h4, sample.c2h6);
      const total =
        sample.ch4 / scale + sample.c2h4 / scale + sample.c2h6 / scale;
      samplePoint = [
        100 * (sample.c2h4 / scale) / total,
        100 * (sample.c2h6 / scale) / total
      ];
    }

    function element(name, attributes, text) {
      const node = document.createElementNS(ns, name);
      for (const [key, value] of Object.entries(attributes)) {
        node.setAttribute(key, String(value));
      }
      if (text !== undefined) node.textContent = text;
      svg.appendChild(node);
      return node;
    }

    // Coordinates are [ethylene %, ethane %]; methane is the remainder.
    function point(ethylene, ethane) {
      return [
        300 + 2.5 * (ethylene - ethane),
        42 + 4.4 * (ethylene + ethane)
      ];
    }

    function polygon(coordinates, fill) {
      element("polygon", {
        points: coordinates.map(([e, h]) => point(e, h).join(",")).join(" "),
        fill,
        stroke: "#333",
        "stroke-width": 1.2,
        "stroke-linejoin": "round"
      });
    }

    function line(x1, y1, x2, y2, width = 1) {
      element("line", {
        x1, y1, x2, y2,
        stroke: "#222",
        "stroke-width": width
      });
    }

    function label(x, y, text, attributes = {}) {
      element("text", {
        x, y,
        fill: "#111",
        "font-family": "Arial, sans-serif",
        "text-anchor": "middle",
        ...attributes
      }, text);
    }

    svg.replaceChildren();

    polygon([[0, 0], [10, 0], [10, 10], [20, 10], [20, 35], [0, 35]], "#d9edcf");
    polygon([[0, 35], [20, 35], [20, 80], [0, 100]], "#d5e8f7");
    polygon([[10, 0], [50, 0], [50, 10], [20, 10], [10, 10]], "#f5d3d0");
    polygon([[20, 10], [50, 10], [50, 50], [20, 80]], "#fff0b3");
    polygon([[50, 0], [100, 0], [50, 50]], "#f7c99d");

    const zoneLabels = [
      ["O", 5, 20],
      ["S", 8, 55],
      ["C", 27, 5],
      ["T2", 30, 30],
      ["T3", 65, 15]
    ];
    for (const [name, e, h] of zoneLabels) {
      const [x, y] = point(e, h);
      label(x, y + 5, name, { "font-size": 18, "font-weight": "bold" });
    }

    // Outline and outward-facing ticks.
    line(300, 42, 50, 482, 2);
    line(300, 42, 550, 482, 2);
    line(50, 482, 550, 482, 2);

    for (let n = 0; n <= 100; n += 10) {
      // Methane increases from the lower-left corner to the apex.
      let [x, y] = point(0, 100 - n);
      line(x, y, x - 7, y - 4);
      if (n > 0 && n < 100) {
        label(x - 16, y - 5, n, { "font-size": 11 });
      }

      // Ethylene increases from the apex to the lower-right corner.
      [x, y] = point(n, 0);
      line(x, y, x + 7, y - 4);
      if (n > 0 && n < 100) {
        label(x + 16, y - 5, n, { "font-size": 11 });
      }

      // Ethane increases from the lower-right to the lower-left corner.
      [x, y] = point(100 - n, n);
      line(x, y, x, y + 7);
      label(x, y + 20, n, { "font-size": 11 });
    }

    label(128, 236, "CH₄ (%)", {
      "font-size": 14,
      "font-weight": "bold",
      transform: "rotate(-60.4 128 236)"
    });
    label(472, 236, "C₂H₄ (%)", {
      "font-size": 14,
      "font-weight": "bold",
      transform: "rotate(60.4 472 236)"
    });
    label(300, 528, "C₂H₆ (%)", {
      "font-size": 14,
      "font-weight": "bold"
    });

    if (samplePoint) {
      const [x, y] = point(...samplePoint);
      const marker = element("circle", {
        cx: x,
        cy: y,
        r: 5,
        fill: "#111",
        stroke: "#fff",
        "stroke-width": 2
      });
      const title = document.createElementNS(ns, "title");
      title.textContent = DuvalTriangle5.classify(
        sample.ch4, sample.c2h4, sample.c2h6
      );
      marker.appendChild(title);
    }
  }
};
