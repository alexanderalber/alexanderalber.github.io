const DuvalPentagon = {
  classify(h2, ch4, c2h6, c2h4, c2h2) {
    const gases = [h2, ch4, c2h6, c2h4, c2h2];
    if (!gases.every(Number.isFinite) || gases.some(value => value < 0)) {
      throw new RangeError("Gas concentrations must be finite, non-negative numbers.");
    }

    const total = gases.reduce((sum, value) => sum + value, 0);
    if (total <= 0) {
      throw new RangeError("The sum of gas concentrations must be greater than zero.");
    }

    // The five normalized gas axes are the vertices of a regular pentagon.
    const vertices = [
      [0, -1],
      [0.9510565163, -0.3090169944],
      [0.5877852523, 0.8090169944],
      [-0.5877852523, 0.8090169944],
      [-0.9510565163, -0.3090169944]
    ];
    const point = [0, 0];

    for (let i = 0; i < gases.length; i++) {
      const proportion = gases[i] / total;
      point[0] += proportion * vertices[i][0];
      point[1] += proportion * vertices[i][1];
    }

    // Representative positions for the standard Pentagon 1 fault zones.
    const zones = [
      { code: "PD", center: [0, -0.78] },
      { code: "D1", center: [-0.48, -0.48] },
      { code: "D2", center: [-0.82, -0.18] },
      { code: "T1", center: [0.75, -0.24] },
      { code: "T2", center: [0.46, 0.63] },
      { code: "T3", center: [-0.46, 0.63] },
      { code: "DT", center: [0, 0] }
    ];

    let closest = zones[0];
    let closestDistance = Infinity;
    for (const zone of zones) {
      const dx = point[0] - zone.center[0];
      const dy = point[1] - zone.center[1];
      const distance = dx * dx + dy * dy;
      if (distance < closestDistance) {
        closest = zone;
        closestDistance = distance;
      }
    }
    return closest.code;
  },

  render(svg, sample) {
    const namespace = "http://www.w3.org/2000/svg";
    const make = (name, attributes, text) => {
      const element = document.createElementNS(namespace, name);
      for (const [key, value] of Object.entries(attributes || {})) {
        element.setAttribute(key, String(value));
      }
      if (text !== undefined) element.textContent = text;
      return element;
    };

    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const center = [300, 300];
    const scale = 205;
    const vertices = [
      [0, -1],
      [0.9510565163, -0.3090169944],
      [0.5877852523, 0.8090169944],
      [-0.5877852523, 0.8090169944],
      [-0.9510565163, -0.3090169944]
    ];
    const gasNames = ["H₂", "CH₄", "C₂H₆", "C₂H₄", "C₂H₂"];
    const zones = [
      { code: "PD", center: [0, -0.78], color: "#d9eaf7" },
      { code: "D1", center: [-0.48, -0.48], color: "#f5d2d2" },
      { code: "D2", center: [-0.82, -0.18], color: "#e9b6b6" },
      { code: "T1", center: [0.75, -0.24], color: "#f8edbd" },
      { code: "T2", center: [0.46, 0.63], color: "#f4d79c" },
      { code: "T3", center: [-0.46, 0.63], color: "#edbd8e" },
      { code: "DT", center: [0, 0], color: "#d9e5c5" }
    ];

    const toScreen = point => [
      center[0] + point[0] * scale,
      center[1] + point[1] * scale
    ];
    const polygonPoints = points =>
      points.map(point => toScreen(point).join(",")).join(" ");

    svg.appendChild(make("rect", {
      x: 0, y: 0, width: 600, height: 600, fill: "#ffffff"
    }));

    // Clip the pentagon into Voronoi regions around the zone representatives.
    for (const zone of zones) {
      let polygon = vertices.map(point => point.slice());

      for (const other of zones) {
        if (other === zone) continue;
        const nx = 2 * (other.center[0] - zone.center[0]);
        const ny = 2 * (other.center[1] - zone.center[1]);
        const limit =
          other.center[0] ** 2 + other.center[1] ** 2 -
          zone.center[0] ** 2 - zone.center[1] ** 2;

        const clipped = [];
        for (let i = 0; i < polygon.length; i++) {
          const a = polygon[i];
          const b = polygon[(i + 1) % polygon.length];
          const da = nx * a[0] + ny * a[1] - limit;
          const db = nx * b[0] + ny * b[1] - limit;
          const insideA = da <= 1e-10;
          const insideB = db <= 1e-10;

          if (insideA) clipped.push(a);
          if (insideA !== insideB) {
            const t = da / (da - db);
            clipped.push([
              a[0] + t * (b[0] - a[0]),
              a[1] + t * (b[1] - a[1])
            ]);
          }
        }
        polygon = clipped;
        if (!polygon.length) break;
      }

      if (polygon.length) {
        svg.appendChild(make("polygon", {
          points: polygonPoints(polygon),
          fill: zone.color,
          stroke: "#687078",
          "stroke-width": 1.2
        }));

        const labelPoint = polygon.reduce(
          (sum, point) => [sum[0] + point[0] / polygon.length, sum[1] + point[1] / polygon.length],
          [0, 0]
        );
        const [x, y] = toScreen(labelPoint);
        svg.appendChild(make("text", {
          x, y,
          "text-anchor": "middle",
          "dominant-baseline": "middle",
          "font-family": "Arial, sans-serif",
          "font-size": 16,
          "font-weight": "bold",
          fill: "#263238"
        }, zone.code));
      }
    }

    // Light reference pentagons and the five gas axes.
    for (const fraction of [0.2, 0.4, 0.6, 0.8]) {
      const ring = vertices.map(point => [point[0] * fraction, point[1] * fraction]);
      svg.appendChild(make("polygon", {
        points: polygonPoints(ring),
        fill: "none",
        stroke: "#aab2b8",
        "stroke-width": 0.8,
        "stroke-dasharray": "3 3"
      }));
    }

    for (let i = 0; i < vertices.length; i++) {
      const endpoint = toScreen(vertices[i]);
      svg.appendChild(make("line", {
        x1: center[0], y1: center[1], x2: endpoint[0], y2: endpoint[1],
        stroke: "#58636b", "stroke-width": 1
      }));

      const labelPoint = toScreen([vertices[i][0] * 1.24, vertices[i][1] * 1.24]);
      svg.appendChild(make("text", {
        x: labelPoint[0],
        y: labelPoint[1],
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        "font-family": "Arial, sans-serif",
        "font-size": 15,
        "font-weight": "bold",
        fill: "#20272b"
      }, gasNames[i]));
    }

    svg.appendChild(make("polygon", {
      points: polygonPoints(vertices),
      fill: "none",
      stroke: "#263238",
      "stroke-width": 2
    }));

    if (sample !== null && sample !== undefined) {
      const gases = [sample.h2, sample.ch4, sample.c2h6, sample.c2h4, sample.c2h2];
      if (!gases.every(Number.isFinite) || gases.some(value => value < 0)) {
        throw new RangeError("Sample gas concentrations must be finite, non-negative numbers.");
      }
      const total = gases.reduce((sum, value) => sum + value, 0);
      if (total <= 0) {
        throw new RangeError("The sum of sample gas concentrations must be greater than zero.");
      }

      const point = [0, 0];
      for (let i = 0; i < gases.length; i++) {
        const proportion = gases[i] / total;
        point[0] += proportion * vertices[i][0];
        point[1] += proportion * vertices[i][1];
      }

      const [x, y] = toScreen(point);
      svg.appendChild(make("circle", {
        cx: x, cy: y, r: 7,
        fill: "#111111",
        stroke: "#ffffff",
        "stroke-width": 2
      }));
      svg.appendChild(make("line", {
        x1: x - 10, y1: y, x2: x + 10, y2: y,
        stroke: "#111111", "stroke-width": 1
      }));
      svg.appendChild(make("line", {
        x1: x, y1: y - 10, x2: x, y2: y + 10,
        stroke: "#111111", "stroke-width": 1
      }));
    }
  }
};
