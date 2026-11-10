const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const total = ch4 + c2h4 + c2h6;
    const m = 100 * ch4 / total;
    const e = 100 * c2h4 / total;
    const zones = [
      { code: "PD", m: 78, e: 8 },
      { code: "S",  m: 20, e: 5 },
      { code: "C",  m: 12, e: 32 },
      { code: "T1", m: 10, e: 15 },
      { code: "T2", m: 28, e: 35 },
      { code: "T3", m: 15, e: 72 },
      { code: "D1", m: 55, e: 20 },
      { code: "D2", m: 43, e: 52 }
    ];

    let best = zones[0];
    let bestDistance = Infinity;
    for (const zone of zones) {
      const dm = m - zone.m;
      const de = e - zone.e;
      const distance = dm * dm + de * de;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = zone;
      }
    }
    return best.code;
  },

  render(svg, sample) {
    const ns = "http://www.w3.org/2000/svg";
    const left = 80;
    const right = 510;
    const top = 55;
    const bottom = 440;
    const width = right - left;
    const height = bottom - top;

    const zones = [
      { code: "PD", m: 78, e: 8,  color: "#f3a6a6" },
      { code: "S",  m: 20, e: 5,  color: "#c7e6a3" },
      { code: "C",  m: 12, e: 32, color: "#f5d58b" },
      { code: "T1", m: 10, e: 15, color: "#a9d8ef" },
      { code: "T2", m: 28, e: 35, color: "#f2b66d" },
      { code: "T3", m: 15, e: 72, color: "#df9ac4" },
      { code: "D1", m: 55, e: 20, color: "#b8aae0" },
      { code: "D2", m: 43, e: 52, color: "#ed8d63" }
    ];

    const make = (name, attrs, text) => {
      const el = document.createElementNS(ns, name);
      for (const key in attrs) el.setAttribute(key, attrs[key]);
      if (text !== undefined) el.textContent = text;
      return el;
    };

    const toScreen = ([m, e]) => ({
      x: left + (e + m / 2) * width / 100,
      y: bottom - m * height / 100
    });

    const pointString = polygon =>
      polygon.map(p => {
        const q = toScreen(p);
        return `${q.x},${q.y}`;
      }).join(" ");

    const clip = (polygon, A, B, C) => {
      const result = [];
      if (!polygon.length) return result;

      const inside = p => A * p[0] + B * p[1] <= C + 1e-9;
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        const ia = inside(a);
        const ib = inside(b);

        if (ia) result.push(a);
        if (ia !== ib) {
          const da = A * a[0] + B * a[1] - C;
          const db = A * b[0] + B * b[1] - C;
          const t = da / (da - db);
          result.push([
            a[0] + t * (b[0] - a[0]),
            a[1] + t * (b[1] - a[1])
          ]);
        }
      }
      return result;
    };

    svg.appendChild(make("rect", {
      x: 0, y: 0, width: 600, height: 540, fill: "#ffffff"
    }));

    const triangle = [[0, 0], [0, 100], [100, 0]];
    for (const zone of zones) {
      let polygon = triangle.slice();
      for (const other of zones) {
        if (other === zone) continue;
        const A = 2 * (other.m - zone.m);
        const B = 2 * (other.e - zone.e);
        const C = other.m * other.m + other.e * other.e -
                  zone.m * zone.m - zone.e * zone.e;
        polygon = clip(polygon, A, B, C);
        if (!polygon.length) break;
      }
      if (polygon.length) {
        svg.appendChild(make("polygon", {
          points: pointString(polygon),
          fill: zone.color,
          stroke: "#333333",
          "stroke-width": 1
        }));

        const center = polygon.reduce(
          (sum, p) => [sum[0] + p[0] / polygon.length, sum[1] + p[1] / polygon.length],
          [0, 0]
        );
        const q = toScreen(center);
        svg.appendChild(make("text", {
          x: q.x,
          y: q.y,
          "text-anchor": "middle",
          "dominant-baseline": "middle",
          "font-family": "Arial, sans-serif",
          "font-size": 14,
          "font-weight": "bold",
          fill: "#222222"
        }, zone.code));
      }
    }

    for (let k = 20; k < 100; k += 20) {
      for (const line of [
        [[k, 0], [k, 100 - k]],
        [[0, k], [100 - k, k]],
        [[0, 100 - k], [100 - k, 0]]
      ]) {
        const a = toScreen(line[0]);
        const b = toScreen(line[1]);
        svg.appendChild(make("line", {
          x1: a.x, y1: a.y, x2: b.x, y2: b.y,
          stroke: "#777777",
          "stroke-width": 0.6,
          "stroke-opacity": 0.45
        }));
      }
    }

    const vertices = [toScreen([100, 0]), toScreen([0, 100]), toScreen([0, 0])];
    svg.appendChild(make("polygon", {
      points: vertices.map(p => `${p.x},${p.y}`).join(" "),
      fill: "none",
      stroke: "#222222",
      "stroke-width": 2
    }));

    for (let k = 0; k <= 100; k += 20) {
      const tick = 4;
      const mLeft = toScreen([k, 0]);
      svg.appendChild(make("line", {
        x1: mLeft.x - tick, y1: mLeft.y + tick / 2,
        x2: mLeft.x + tick, y2: mLeft.y - tick / 2,
        stroke: "#222222", "stroke-width": 1
      }));
      if (k > 0 && k < 100) {
        svg.appendChild(make("text", {
          x: mLeft.x - 17, y: mLeft.y + 4,
          "text-anchor": "end",
          "font-family": "Arial, sans-serif",
          "font-size": 10,
          fill: "#222222"
        }, String(k)));
      }

      const eRight = toScreen([0, k]);
      svg.appendChild(make("line", {
        x1: eRight.x - tick, y1: eRight.y - tick / 2,
        x2: eRight.x + tick, y2: eRight.y + tick / 2,
        stroke: "#222222", "stroke-width": 1
      }));
      if (k > 0 && k < 100) {
        svg.appendChild(make("text", {
          x: eRight.x + 16, y: eRight.y + 4,
          "text-anchor": "start",
          "font-family": "Arial, sans-serif",
          "font-size": 10,
          fill: "#222222"
        }, String(k)));
      }

      const base = toScreen([0, 100 - k]);
      svg.appendChild(make("line", {
        x1: base.x, y1: base.y - tick,
        x2: base.x, y2: base.y + tick,
        stroke: "#222222", "stroke-width": 1
      }));
      if (k > 0 && k < 100) {
        svg.appendChild(make("text", {
          x: base.x, y: base.y + 15,
          "text-anchor": "middle",
          "font-family": "Arial, sans-serif",
          "font-size": 10,
          fill: "#222222"
        }, String(k)));
      }
    }

    svg.appendChild(make("text", {
      x: vertices[0].x, y: vertices[0].y - 16,
      "text-anchor": "middle",
      "font-family": "Arial, sans-serif",
      "font-size": 14,
      "font-weight": "bold"
    }, "CH₄"));

    svg.appendChild(make("text", {
      x: vertices[1].x - 8, y: vertices[1].y + 27,
      "text-anchor": "start",
      "font-family": "Arial, sans-serif",
      "font-size": 14,
      "font-weight": "bold"
    }, "C₂H₄"));

    svg.appendChild(make("text", {
      x: vertices[2].x + 8, y: vertices[2].y + 27,
      "text-anchor": "end",
      "font-family": "Arial, sans-serif",
      "font-size": 14,
      "font-weight": "bold"
    }, "C₂H₆"));

    if (sample) {
      const total = sample.ch4 + sample.c2h4 + sample.c2h6;
      if (total > 0) {
        const m = 100 * sample.ch4 / total;
        const e = 100 * sample.c2h4 / total;
        const p = toScreen([m, e]);
        svg.appendChild(make("circle", {
          cx: p.x, cy: p.y, r: 6,
          fill: "#ffffff",
          stroke: "#111111",
          "stroke-width": 2
        }));
        svg.appendChild(make("circle", {
          cx: p.x, cy: p.y, r: 2,
          fill: "#111111"
        }));
      }
    }
  }
};
