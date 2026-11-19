const DuvalPentagon = {
  classify(h2, ch4, c2h6, c2h4, c2h2) {
    const total = h2 + ch4 + c2h6 + c2h4 + c2h2;
    if (!Number.isFinite(total) || total <= 0) {
      throw new RangeError("Gas concentrations must have a positive finite sum.");
    }

    const H2 = 100 * h2 / total;
    const C2H4 = 100 * c2h4 / total;
    const C2H2 = 100 * c2h2 / total;
    const eps = 1e-9;

    if (H2 >= 98 - eps) return "PD";
    if (C2H2 >= 13 - eps) return "D2";
    if (C2H2 >= 4 - eps) return "D1";
    if (H2 >= 77 - eps) return "S";
    if (C2H4 >= 50 - eps) return "T3";
    if (C2H4 >= 20 - eps) return "T2";
    return "T1";
  },

  render(svg, sample) {
    const NS = "http://www.w3.org/2000/svg";
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    function element(name, attributes, parent) {
      const node = document.createElementNS(NS, name);
      for (const key in attributes) {
        node.setAttribute(key, String(attributes[key]));
      }
      (parent || svg).appendChild(node);
      return node;
    }

    const center = { x: 300, y: 310 };
    const radius = 225;
    const gases = ["H2", "C2H2", "C2H4", "C2H6", "CH4"];
    const vertices = gases.map((gas, i) => {
      const angle = (-90 + 72 * i) * Math.PI / 180;
      return {
        gas,
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle)
      };
    });

    const outer = vertices.map(v => [v.x, v.y]);

    function compositionPoint(f) {
      let x = 0;
      let y = 0;
      for (let i = 0; i < 5; i++) {
        x += f[i] * vertices[i].x;
        y += f[i] * vertices[i].y;
      }
      return [x, y];
    }

    function clip(poly, inside, intersect) {
      if (!poly.length) return [];
      const result = [];
      let a = poly[poly.length - 1];
      let aInside = inside(a);

      for (const b of poly) {
        const bInside = inside(b);
        if (bInside !== aInside) result.push(intersect(a, b));
        if (bInside) result.push(b);
        a = b;
        aInside = bInside;
      }
      return result;
    }

    function gasCut(poly, gasIndex, limit, keepGreater) {
      function value(p) {
        const f = p.f;
        return f[gasIndex] * 100;
      }
      return clip(
        poly,
        p => keepGreater ? value(p) >= limit - 1e-8 : value(p) <= limit + 1e-8,
        (a, b) => {
          const va = value(a) - limit;
          const vb = value(b) - limit;
          const t = va / (va - vb);
          const f = a.f.map((v, i) => v + t * (b.f[i] - v));
          const xy = compositionPoint(f);
          return { x: xy[0], y: xy[1], f };
        }
      );
    }

    const domain = outer.map((xy, i) => {
      const f = [0, 0, 0, 0, 0];
      f[i] = 1;
      return { x: xy[0], y: xy[1], f };
    });

    function makeZone(cuts) {
      let poly = domain;
      for (const cut of cuts) {
        poly = gasCut(poly, cut[0], cut[1], cut[2]);
      }
      return poly;
    }

    // Composition order: H2, C2H2, C2H4, C2H6, CH4.
    const definitions = [
      {
        code: "PD", color: "#76a9e0",
        cuts: [[0, 98, true]]
      },
      {
        code: "S", color: "#b9e3ed",
        cuts: [[0, 98, false], [0, 77, true], [1, 4, false]]
      },
      {
        code: "D1", color: "#a8d89c",
        cuts: [[1, 4, true], [1, 13, false]]
      },
      {
        code: "D2", color: "#c7a0d8",
        cuts: [[1, 13, true]]
      },
      {
        code: "T1", color: "#f4e58b",
        cuts: [[0, 77, false], [1, 4, false], [2, 20, false]]
      },
      {
        code: "T2", color: "#f3bd73",
        cuts: [[0, 77, false], [1, 4, false], [2, 20, true], [2, 50, false]]
      },
      {
        code: "T3", color: "#ed9185",
        cuts: [[0, 77, false], [1, 4, false], [2, 50, true]]
      }
    ];

    element("rect", {
      x: 0, y: 0, width: 600, height: 600, fill: "#ffffff"
    });

    element("text", {
      x: 300, y: 25, "text-anchor": "middle",
      "font-family": "Arial, Helvetica, sans-serif",
      "font-size": 18, "font-weight": "bold", fill: "#222222"
    }).textContent = "Duval Pentagon 1";

    for (const zone of definitions) {
      const poly = makeZone(zone.cuts);
      if (!poly.length) continue;

      element("polygon", {
        points: poly.map(p => p.x.toFixed(3) + "," + p.y.toFixed(3)).join(" "),
        fill: zone.color,
        stroke: "#555555",
        "stroke-width": 1.1,
        "stroke-linejoin": "round"
      });

      let cx = 0;
      let cy = 0;
      let twiceArea = 0;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        const cross = a.x * b.y - b.x * a.y;
        twiceArea += cross;
        cx += (a.x + b.x) * cross;
        cy += (a.y + b.y) * cross;
      }

      if (Math.abs(twiceArea) > 1e-7) {
        cx /= 3 * twiceArea;
        cy /= 3 * twiceArea;
      } else {
        cx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
        cy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
      }

      if (zone.code === "PD") {
        element("line", {
          x1: cx, y1: cy, x2: 352, y2: 102,
          stroke: "#333333", "stroke-width": 0.8
        });
        cx = 358;
        cy = 106;
      }

      element("text", {
        x: cx, y: cy + 5,
        "text-anchor": "middle",
        "font-family": "Arial, Helvetica, sans-serif",
        "font-size": zone.code === "PD" ? 12 : 16,
        "font-weight": "bold",
        fill: "#202020",
        "paint-order": "stroke",
        stroke: "#ffffff",
        "stroke-width": 2.5,
        "stroke-linejoin": "round"
      }).textContent = zone.code;
    }

    for (const v of vertices) {
      element("line", {
        x1: center.x, y1: center.y, x2: v.x, y2: v.y,
        stroke: "#ffffff", "stroke-width": 1,
        "stroke-opacity": 0.75,
        "stroke-dasharray": "4 4"
      });

      const dx = v.x - center.x;
      const dy = v.y - center.y;
      const length = Math.hypot(dx, dy);
      const lx = v.x + 28 * dx / length;
      const ly = v.y + 28 * dy / length;

      element("text", {
        x: lx, y: ly + 5,
        "text-anchor": "middle",
        "font-family": "Arial, Helvetica, sans-serif",
        "font-size": 16,
        "font-weight": "bold",
        fill: "#222222"
      }).textContent = v.gas;
    }

    element("polygon", {
      points: outer.map(p => p.join(",")).join(" "),
      fill: "none",
      stroke: "#222222",
      "stroke-width": 2,
      "stroke-linejoin": "round"
    });

    if (sample !== null && sample !== undefined) {
      const values = [
        Number(sample.h2),
        Number(sample.c2h2),
        Number(sample.c2h4),
        Number(sample.c2h6),
        Number(sample.ch4)
      ];
      const total = values.reduce((s, v) => s + v, 0);

      if (values.every(v => Number.isFinite(v) && v >= 0) && total > 0) {
        const p = compositionPoint(values.map(v => v / total));

        element("circle", {
          cx: p[0], cy: p[1], r: 8,
          fill: "#ffffff", stroke: "#111111", "stroke-width": 2
        });
        element("circle", {
          cx: p[0], cy: p[1], r: 3.5,
          fill: "#d7191c", stroke: "#111111", "stroke-width": 0.8
        });
        element("line", {
          x1: p[0] - 12, y1: p[1], x2: p[0] + 12, y2: p[1],
          stroke: "#111111", "stroke-width": 1
        });
        element("line", {
          x1: p[0], y1: p[1] - 12, x2: p[0], y2: p[1] + 12,
          stroke: "#111111", "stroke-width": 1
        });
      }
    }
  }
};
