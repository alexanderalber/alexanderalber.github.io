const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const total = ch4 + c2h4 + c2h2;
    const m = 100 * ch4 / total;
    const e = 100 * c2h4 / total;
    const a = 100 * c2h2 / total;

    if (m >= 98) return "PD";
    if (a >= 13 && e <= 23) return "D1";
    if (e > 23 && (a >= 29 || (a >= 13 && e <= 40))) return "D2";
    if (e >= 50 && a <= 15) return "T3";
    if (e >= 20 && e < 50 && a <= 4) return "T2";
    if (e < 20 && a <= 4) return "T1";
    return "DT";
  },

  render(svg, sample) {
    const NS = "http://www.w3.org/2000/svg";
    const top = { x: 300, y: 35 };
    const left = { x: 60, y: 455 };
    const right = { x: 540, y: 455 };
    const center = { x: 300, y: 315 };

    const make = (name, attrs, text) => {
      const el = document.createElementNS(NS, name);
      if (attrs) {
        for (const key in attrs) el.setAttribute(key, String(attrs[key]));
      }
      if (text !== undefined) el.textContent = text;
      return el;
    };

    const point = (m, e, a) => ({
      x: (m * top.x + e * right.x + a * left.x) / 100,
      y: (m * top.y + e * right.y + a * left.y) / 100
    });

    const polygonPoints = vertices => vertices.map(v => {
      const p = point(v[0], v[1], v[2]);
      return p.x + "," + p.y;
    }).join(" ");

    const root = make("g", {
      "font-family": "Arial, Helvetica, sans-serif",
      "shape-rendering": "geometricPrecision"
    });
    svg.appendChild(root);

    const zones = [
      {
        code: "PD",
        color: "#d8c7ee",
        vertices: [
          [100, 0, 0],
          [98, 2, 0],
          [98, 0, 2]
        ],
        label: [99.1, 0.45, 0.45],
        size: 7
      },
      {
        code: "T1",
        color: "#fff19a",
        vertices: [
          [98, 2, 0],
          [80, 20, 0],
          [76, 20, 4],
          [96, 0, 4],
          [98, 0, 2]
        ],
        label: [87, 11, 2],
        size: 13
      },
      {
        code: "T2",
        color: "#ffc46b",
        vertices: [
          [80, 20, 0],
          [50, 50, 0],
          [46, 50, 4],
          [76, 20, 4]
        ],
        label: [63, 35, 2],
        size: 14
      },
      {
        code: "T3",
        color: "#ee7770",
        vertices: [
          [50, 50, 0],
          [0, 100, 0],
          [0, 85, 15],
          [35, 50, 15],
          [46, 50, 4]
        ],
        label: [15, 72, 13],
        size: 15
      },
      {
        code: "D1",
        color: "#79bce8",
        vertices: [
          [0, 0, 100],
          [0, 23, 77],
          [64, 23, 13],
          [87, 0, 13]
        ],
        label: [25, 10, 65],
        size: 15
      },
      {
        code: "D2",
        color: "#61d0d0",
        vertices: [
          [0, 23, 77],
          [0, 71, 29],
          [31, 40, 29],
          [47, 40, 13],
          [64, 23, 13]
        ],
        label: [24, 38, 38],
        size: 15
      },
      {
        code: "DT",
        color: "#c8d1d8",
        vertices: [
          [0, 71, 29],
          [0, 85, 15],
          [35, 50, 15],
          [46, 50, 4],
          [76, 20, 4],
          [96, 0, 4],
          [87, 0, 13],
          [64, 23, 13],
          [47, 40, 13],
          [31, 40, 29]
        ],
        label: [35, 45, 20],
        size: 15
      }
    ];

    const zoneLayer = make("g", {
      stroke: "#303840",
      "stroke-width": 1.25,
      "stroke-linejoin": "round"
    });
    root.appendChild(zoneLayer);

    for (const zone of zones) {
      zoneLayer.appendChild(make("polygon", {
        points: polygonPoints(zone.vertices),
        fill: zone.color
      }));
    }

    root.appendChild(make("polygon", {
      points: `${top.x},${top.y} ${right.x},${right.y} ${left.x},${left.y}`,
      fill: "none",
      stroke: "#111820",
      "stroke-width": 2.2,
      "stroke-linejoin": "round"
    }));

    const labelLayer = make("g", {
      fill: "#172027",
      "font-weight": "700",
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      "pointer-events": "none"
    });
    root.appendChild(labelLayer);

    for (const zone of zones) {
      const p = point(zone.label[0], zone.label[1], zone.label[2]);
      labelLayer.appendChild(make("text", {
        x: p.x,
        y: p.y,
        "font-size": zone.size
      }, zone.code));
    }

    const axisLayer = make("g", {
      fill: "#20272c",
      stroke: "#20272c",
      "stroke-width": 1
    });
    root.appendChild(axisLayer);

    const drawAxis = (p0, p1) => {
      const midX = (p0.x + p1.x) / 2;
      const midY = (p0.y + p1.y) / 2;
      let nx = midX - center.x;
      let ny = midY - center.y;
      const length = Math.hypot(nx, ny);
      nx /= length;
      ny /= length;

      for (let value = 0; value <= 100; value += 10) {
        const t = value / 100;
        const x = p0.x + (p1.x - p0.x) * t;
        const y = p0.y + (p1.y - p0.y) * t;
        const tickLength = value % 20 === 0 ? 7 : 4;

        axisLayer.appendChild(make("line", {
          x1: x,
          y1: y,
          x2: x + nx * tickLength,
          y2: y + ny * tickLength
        }));

        if (value % 20 === 0) {
          const tx = x + nx * 17;
          const ty = y + ny * 17;
          axisLayer.appendChild(make("text", {
            x: tx,
            y: ty,
            stroke: "none",
            "font-size": 10,
            "font-weight": "400",
            "text-anchor": "middle",
            "dominant-baseline": "middle"
          }, value));
        }
      }
    };

    drawAxis(left, top);
    drawAxis(top, right);
    drawAxis(right, left);

    const axisTitles = make("g", {
      fill: "#111820",
      stroke: "none",
      "font-size": 15,
      "font-weight": "700",
      "text-anchor": "middle"
    });
    root.appendChild(axisTitles);

    axisTitles.appendChild(make("text", {
      x: 142,
      y: 216,
      transform: "rotate(-60 142 216)"
    }, "CH₄ (%)"));

    axisTitles.appendChild(make("text", {
      x: 458,
      y: 216,
      transform: "rotate(60 458 216)"
    }, "C₂H₄ (%)"));

    axisTitles.appendChild(make("text", {
      x: 300,
      y: 514
    }, "C₂H₂ (%)"));

    if (sample !== null) {
      const total = sample.ch4 + sample.c2h4 + sample.c2h2;
      const m = 100 * sample.ch4 / total;
      const e = 100 * sample.c2h4 / total;
      const a = 100 * sample.c2h2 / total;
      const p = point(m, e, a);
      const code = DuvalTriangle.classify(
        sample.ch4,
        sample.c2h4,
        sample.c2h2
      );

      const marker = make("g");
      marker.appendChild(make("circle", {
        cx: p.x,
        cy: p.y,
        r: 8,
        fill: "#ffffff",
        stroke: "#ffffff",
        "stroke-width": 4
      }));
      marker.appendChild(make("circle", {
        cx: p.x,
        cy: p.y,
        r: 6,
        fill: "#111111",
        stroke: "#ffffff",
        "stroke-width": 1.5
      }));
      marker.appendChild(make("line", {
        x1: p.x - 9,
        y1: p.y,
        x2: p.x + 9,
        y2: p.y,
        stroke: "#111111",
        "stroke-width": 1.5
      }));
      marker.appendChild(make("line", {
        x1: p.x,
        y1: p.y - 9,
        x2: p.x,
        y2: p.y + 9,
        stroke: "#111111",
        "stroke-width": 1.5
      }));
      marker.appendChild(make("title", null,
        `${code}: CH4 ${m.toFixed(1)}%, C2H4 ${e.toFixed(1)}%, C2H2 ${a.toFixed(1)}%`
      ));
      root.appendChild(marker);
    }
  }
};
