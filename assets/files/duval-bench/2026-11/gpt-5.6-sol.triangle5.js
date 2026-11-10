const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const total = ch4 + c2h4 + c2h6;

    if (
      !Number.isFinite(ch4) ||
      !Number.isFinite(c2h4) ||
      !Number.isFinite(c2h6) ||
      ch4 < 0 ||
      c2h4 < 0 ||
      c2h6 < 0 ||
      total <= 0
    ) {
      throw new RangeError("Gas concentrations must be finite, non-negative, and have a positive sum.");
    }

    const methane = (100 * ch4) / total;
    const ethylene = (100 * c2h4) / total;

    if (methane >= 98) return "PD";
    if (ethylene >= 50) return "T3";
    if (ethylene >= 10) return "T2";
    if (methane >= 65) return "S";
    return "O";
  },

  render(svg, sample) {
    const NS = "http://www.w3.org/2000/svg";
    const top = { x: 300, y: 40 };
    const right = { x: 540, y: 460 };
    const left = { x: 60, y: 460 };

    svg.textContent = "";

    const element = (name, attributes, text) => {
      const node = document.createElementNS(NS, name);
      for (const key in attributes) {
        node.setAttribute(key, attributes[key]);
      }
      if (text !== undefined) node.textContent = text;
      return node;
    };

    const point = (ch4Percent, c2h4Percent, c2h6Percent) => ({
      x:
        (top.x * ch4Percent +
          right.x * c2h4Percent +
          left.x * c2h6Percent) /
        100,
      y:
        (top.y * ch4Percent +
          right.y * c2h4Percent +
          left.y * c2h6Percent) /
        100
    });

    const pointsAttribute = (vertices) =>
      vertices
        .map((v) => {
          const p = point(v[0], v[1], v[2]);
          return `${p.x},${p.y}`;
        })
        .join(" ");

    const zoneGroup = element("g", {
      "stroke": "#ffffff",
      "stroke-width": "2",
      "stroke-linejoin": "round"
    });

    const zones = [
      {
        code: "O",
        color: "#8ecae6",
        vertices: [
          [0, 0, 100],
          [0, 10, 90],
          [65, 10, 25],
          [65, 0, 35]
        ],
        label: [31, 5, 64]
      },
      {
        code: "S",
        color: "#90be6d",
        vertices: [
          [65, 0, 35],
          [65, 10, 25],
          [90, 10, 0],
          [98, 2, 0],
          [98, 0, 2]
        ],
        label: [79, 5, 16]
      },
      {
        code: "PD",
        color: "#f9c74f",
        vertices: [
          [100, 0, 0],
          [98, 2, 0],
          [98, 0, 2]
        ],
        label: [98.9, 0.55, 0.55]
      },
      {
        code: "T2",
        color: "#f9844a",
        vertices: [
          [0, 10, 90],
          [65, 10, 25],
          [90, 10, 0],
          [50, 50, 0],
          [0, 50, 50]
        ],
        label: [35, 30, 35]
      },
      {
        code: "T3",
        color: "#e63946",
        vertices: [
          [0, 50, 50],
          [50, 50, 0],
          [0, 100, 0]
        ],
        label: [15, 70, 15]
      }
    ];

    for (const zone of zones) {
      zoneGroup.appendChild(
        element("polygon", {
          points: pointsAttribute(zone.vertices),
          fill: zone.color
        })
      );
    }
    svg.appendChild(zoneGroup);

    const labelGroup = element("g", {
      "font-family": "Arial, Helvetica, sans-serif",
      "font-size": "18",
      "font-weight": "700",
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      "fill": "#17202a",
      "pointer-events": "none"
    });

    for (const zone of zones) {
      const p = point(zone.label[0], zone.label[1], zone.label[2]);
      labelGroup.appendChild(
        element(
          "text",
          {
            x: p.x,
            y: p.y,
            fill: zone.code === "T3" ? "#ffffff" : "#17202a",
            "font-size": zone.code === "PD" ? "12" : "18"
          },
          zone.code
        )
      );
    }
    svg.appendChild(labelGroup);

    const axisGroup = element("g", {
      "font-family": "Arial, Helvetica, sans-serif",
      "font-size": "11",
      "fill": "#20252b",
      "stroke": "#20252b"
    });

    axisGroup.appendChild(
      element("polygon", {
        points: `${top.x},${top.y} ${right.x},${right.y} ${left.x},${left.y}`,
        fill: "none",
        "stroke-width": "2.5",
        "stroke-linejoin": "round"
      })
    );

    for (let value = 0; value <= 100; value += 20) {
      const p = point(value, 0, 100 - value);
      axisGroup.appendChild(
        element("line", {
          x1: p.x,
          y1: p.y,
          x2: p.x - 8,
          y2: p.y - 4.5,
          "stroke-width": "1.2"
        })
      );
      axisGroup.appendChild(
        element(
          "text",
          {
            x: p.x - 13,
            y: p.y + 3,
            stroke: "none",
            "text-anchor": "end"
          },
          String(value)
        )
      );
    }

    for (let value = 0; value <= 100; value += 20) {
      const p = point(100 - value, value, 0);
      axisGroup.appendChild(
        element("line", {
          x1: p.x,
          y1: p.y,
          x2: p.x + 8,
          y2: p.y - 4.5,
          "stroke-width": "1.2"
        })
      );
      axisGroup.appendChild(
        element(
          "text",
          {
            x: p.x + 13,
            y: p.y + 3,
            stroke: "none",
            "text-anchor": "start"
          },
          String(value)
        )
      );
    }

    for (let value = 0; value <= 100; value += 20) {
      const p = point(0, 100 - value, value);
      axisGroup.appendChild(
        element("line", {
          x1: p.x,
          y1: p.y,
          x2: p.x,
          y2: p.y + 9,
          "stroke-width": "1.2"
        })
      );
      axisGroup.appendChild(
        element(
          "text",
          {
            x: p.x,
            y: p.y + 23,
            stroke: "none",
            "text-anchor": "middle"
          },
          String(value)
        )
      );
    }

    axisGroup.appendChild(
      element(
        "text",
        {
          x: 150,
          y: 238,
          transform: "rotate(-60 150 238)",
          stroke: "none",
          "font-size": "16",
          "font-weight": "700",
          "text-anchor": "middle"
        },
        "CH₄ (%)"
      )
    );

    axisGroup.appendChild(
      element(
        "text",
        {
          x: 450,
          y: 238,
          transform: "rotate(60 450 238)",
          stroke: "none",
          "font-size": "16",
          "font-weight": "700",
          "text-anchor": "middle"
        },
        "C₂H₄ (%)"
      )
    );

    axisGroup.appendChild(
      element(
        "text",
        {
          x: 300,
          y: 525,
          stroke: "none",
          "font-size": "16",
          "font-weight": "700",
          "text-anchor": "middle"
        },
        "C₂H₆ (%)"
      )
    );

    svg.appendChild(axisGroup);

    if (sample !== null) {
      const total = sample.ch4 + sample.c2h4 + sample.c2h6;

      if (
        !Number.isFinite(sample.ch4) ||
        !Number.isFinite(sample.c2h4) ||
        !Number.isFinite(sample.c2h6) ||
        sample.ch4 < 0 ||
        sample.c2h4 < 0 ||
        sample.c2h6 < 0 ||
        total <= 0
      ) {
        throw new RangeError("Sample concentrations must be finite, non-negative, and have a positive sum.");
      }

      const methane = (100 * sample.ch4) / total;
      const ethylene = (100 * sample.c2h4) / total;
      const ethane = (100 * sample.c2h6) / total;
      const p = point(methane, ethylene, ethane);
      const code = this.classify(sample.ch4, sample.c2h4, sample.c2h6);
      const marker = element("g", {});

      marker.appendChild(
        element("circle", {
          cx: p.x,
          cy: p.y,
          r: "8",
          fill: "#ffffff",
          stroke: "#111111",
          "stroke-width": "3"
        })
      );
      marker.appendChild(
        element("circle", {
          cx: p.x,
          cy: p.y,
          r: "3",
          fill: "#111111"
        })
      );
      marker.appendChild(
        element("line", {
          x1: p.x - 11,
          y1: p.y,
          x2: p.x + 11,
          y2: p.y,
          stroke: "#111111",
          "stroke-width": "1.5"
        })
      );
      marker.appendChild(
        element("line", {
          x1: p.x,
          y1: p.y - 11,
          x2: p.x,
          y2: p.y + 11,
          stroke: "#111111",
          "stroke-width": "1.5"
        })
      );

      const title = element(
        "title",
        {},
        `${code}: CH4 ${methane.toFixed(2)}%, C2H4 ${ethylene.toFixed(2)}%, C2H6 ${ethane.toFixed(2)}%`
      );
      marker.appendChild(title);
      svg.appendChild(marker);
    }
  }
};
