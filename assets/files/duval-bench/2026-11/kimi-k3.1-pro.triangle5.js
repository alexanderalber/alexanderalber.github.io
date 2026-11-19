const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const total = ch4 + c2h4 + c2h6;
    const m = 100 * ch4 / total;
    const x = 100 * c2h4 / total;
    const y = 100 * c2h6 / total;

    if (m >= 98) return "PD";
    if (m >= 80 && x + y <= 20) return "S";

    if (x <= 20) return y > 50 ? "T2" : "T1";
    if (x <= 50) return y > 40 ? "T3" : "DT";
    return y > 40 ? "D1" : "D2";
  },

  render(svg, sample) {
    const NS = "http://www.w3.org/2000/svg";

    function element(name, attributes, parent) {
      const node = document.createElementNS(NS, name);
      for (const key in attributes) {
        node.setAttribute(key, attributes[key]);
      }
      (parent || svg).appendChild(node);
      return node;
    }

    function label(x, y, value, size, weight, anchor, fill) {
      const node = element("text", {
        x: x,
        y: y,
        "font-family": "Arial, Helvetica, sans-serif",
        "font-size": size || 12,
        "font-weight": weight || "normal",
        "text-anchor": anchor || "middle",
        fill: fill || "#17202a"
      });
      node.textContent = value;
      return node;
    }

    // Coordinates are percentages in the order CH4, C2H4, C2H6.
    function point(p) {
      const m = p[0] / 100;
      const x = p[1] / 100;
      const y = p[2] / 100;
      return [
        80 + 440 * x + 220 * y,
        455 - 425 * y
      ];
    }

    function polygon(points, fill) {
      element("polygon", {
        points: points.map(function (p) {
          return point(p).join(",");
        }).join(" "),
        fill: fill,
        stroke: "#46545f",
        "stroke-width": 1.15,
        "stroke-linejoin": "round"
      });
    }

    label(300, 16, "Duval Triangle 5 — low-temperature faults", 15, "bold");

    const zones = [
      {
        code: "T1",
        color: "#ffe28a",
        points: [[80, 0, 20], [50, 0, 50], [30, 20, 50], [80, 20, 0]]
      },
      {
        code: "T2",
        color: "#ffc06e",
        points: [[50, 0, 50], [0, 0, 100], [0, 20, 80], [30, 20, 50]]
      },
      {
        code: "T3",
        color: "#ff987c",
        points: [[30, 20, 50], [0, 20, 80], [0, 50, 50], [10, 50, 40], [30, 20, 40]]
      },
      {
        code: "DT",
        color: "#d6a6e8",
        points: [[80, 20, 0], [30, 20, 50], [30, 20, 40], [10, 50, 40], [50, 50, 0]]
      },
      {
        code: "D1",
        color: "#83b9ec",
        points: [[0, 50, 50], [0, 100, 0], [50, 50, 0], [10, 50, 40]]
      },
      {
        code: "D2",
        color: "#70d2c5",
        points: [[80, 20, 0], [50, 50, 0], [0, 100, 0], [0, 0, 0]]
      }
    ];

    // D2 is the lower-right triangle; its unused fourth coordinate is
    // replaced explicitly to keep all polygon coordinates unambiguous.
    zones[5].points = [[50, 50, 0], [0, 100, 0], [10, 50, 40]];
    polygon([[80, 20, 0], [50, 50, 0], [10, 50, 40]], "#70d2c5");

    for (let i = 0; i < zones.length; i++) {
      if (i !== 5) polygon(zones[i].points, zones[i].color);
    }
    polygon([[50, 50, 0], [0, 100, 0], [10, 50, 40]], "#70d2c5");

    polygon([[98, 0, 2], [80, 0, 20], [80, 4, 16], [98, 2, 0]], "#b8dc83");
    polygon([[100, 0, 0], [98, 0, 2], [98, 2, 0]], "#8fc7ea");

    // Light decade grid.
    for (let v = 10; v < 100; v += 10) {
      const a = point([100 - v, v, 0]);
      const b = point([0, v, 100 - v]);
      const c = point([100 - v, 0, v]);
      const d = point([0, 100 - v, v]);
      const e = point([100 - v, v, 0]);
      const f = point([100 - v, 0, v]);
      element("line", {
        x1: a[0], y1: a[1], x2: b[0], y2: b[1],
        stroke: "#ffffff", "stroke-width": 0.65, opacity: 0.42
      });
      element("line", {
        x1: c[0], y1: c[1], x2: d[0], y2: d[1],
        stroke: "#ffffff", "stroke-width": 0.65, opacity: 0.42
      });
      element("line", {
        x1: e[0], y1: e[1], x2: f[0], y2: f[1],
        stroke: "#ffffff", "stroke-width": 0.65, opacity: 0.42
      });
    }

    element("polygon", {
      points: [[80, 455], [520, 455], [300, 30]].map(function (p) {
        return p.join(",");
      }).join(" "),
      fill: "none",
      stroke: "#26343d",
      "stroke-width": 2
    });

    // Axes, decade ticks, and gas names.
    for (let v = 0; v <= 100; v += 10) {
      const bottom = point([100 - v, v, 0]);
      element("line", {
        x1: bottom[0], y1: bottom[1],
        x2: bottom[0], y2: bottom[1] + 6,
        stroke: "#26343d", "stroke-width": 1
      });
      label(bottom[0], bottom[1] + 20, String(v), 10);

      const left = point([v, 0, 100 - v]);
      element("line", {
        x1: left[0], y1: left[1],
        x2: left[0] - 6, y2: left[1],
        stroke: "#26343d", "stroke-width": 1
      });
      label(left[0] - 10, left[1] + 3, String(v), 10, "normal", "end");

      const right = point([0, 100 - v, v]);
      element("line", {
        x1: right[0], y1: right[1],
        x2: right[0] + 6, y2: right[1],
        stroke: "#26343d", "stroke-width": 1
      });
      label(right[0] + 10, right[1] + 3, String(v), 10, "normal", "start");
    }

    label(300, 520, "C2H4 (%)", 14, "bold");
    const methaneLabel = label(28, 250, "CH4 (%)", 14, "bold");
    methaneLabel.setAttribute("transform", "rotate(-60 28 250)");
    const ethaneLabel = label(570, 250, "C2H6 (%)", 14, "bold");
    ethaneLabel.setAttribute("transform", "rotate(60 570 250)");

    const zoneLabels = {
      T1: [192, 329],
      T2: [244, 151],
      T3: [340, 239],
      DT: [271, 389],
      D1: [439, 302],
      D2: [456, 411],
      S: [126, 416]
    };

    for (const code in zoneLabels) {
      label(zoneLabels[code][0], zoneLabels[code][1], code,
        code === "S" ? 11 : 15, "bold");
    }

    const pd = point([99, 0.5, 0.5]);
    element("polyline", {
      points: [pd, [101, 441], [111, 441]].map(function (p) {
        return p.join(",");
      }).join(" "),
      fill: "none",
      stroke: "#26343d",
      "stroke-width": 0.8
    });
    label(115, 444, "PD", 10, "bold", "start");

    if (sample !== null) {
      const total = sample.ch4 + sample.c2h4 + sample.c2h6;
      const p = point([
        100 * sample.ch4 / total,
        100 * sample.c2h4 / total,
        100 * sample.c2h6 / total
      ]);

      element("circle", {
        cx: p[0], cy: p[1], r: 6,
        fill: "#ffffff", stroke: "#ffffff", "stroke-width": 2, opacity: 0.9
      });
      element("circle", {
        cx: p[0], cy: p[1], r: 4,
        fill: "#111111", stroke: "#ffffff", "stroke-width": 1
      });

      const anchor = p[0] > 425 ? "end" : "start";
      const tx = p[0] + (anchor === "end" ? -10 : 10);
      const ty = Math.max(42, p[1] - 10);
      const sampleLabel = label(
        tx,
        ty,
        this.classify(sample.ch4, sample.c2h4, sample.c2h6),
        12,
        "bold",
        anchor,
        "#111111"
      );
      sampleLabel.setAttribute("stroke", "#ffffff");
      sampleLabel.setAttribute("stroke-width", "3");
      sampleLabel.setAttribute("paint-order", "stroke");
    }
  }
};
