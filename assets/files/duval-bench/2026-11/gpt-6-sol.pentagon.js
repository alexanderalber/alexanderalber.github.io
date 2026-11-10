const DuvalPentagon = {
  classify(h2, ch4, c2h6, c2h4, c2h2) {
    const total = h2 + ch4 + c2h6 + c2h4 + c2h2;
    const x =
      (300 * h2 + 533 * ch4 + 444 * c2h6 +
       156 * c2h4 + 67 * c2h2) / total;
    const y =
      (55 * h2 + 224 * ch4 + 498 * c2h6 +
       498 * c2h4 + 224 * c2h2) / total;

    const zones = [
      ["PD", [[300,55],[420,142],[350,170],[325,235],[282,250],[240,177],[180,142]]],
      ["D1", [[67,224],[180,142],[240,177],[282,250],[265,305],[190,320],[105,338]]],
      ["D2", [[282,250],[325,235],[330,295],[320,348],[290,415],[245,355],[182,365],[190,320],[265,305]]],
      ["T3", [[156,498],[105,338],[190,320],[182,365],[245,355],[290,415],[300,498]]],
      ["T2", [[330,295],[410,310],[368,353],[350,440],[444,498],[300,498],[290,415],[320,348]]],
      ["T1", [[490,358],[444,498],[350,440],[368,353],[410,310]]],
      ["S",  [[420,142],[533,224],[490,358],[410,310],[330,295],[325,235],[350,170]]]
    ];

    function contains(polygon) {
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];
        const cross = (x - xi) * (yj - yi) - (y - yi) * (xj - xi);
        if (Math.abs(cross) < 1e-7 &&
            x >= Math.min(xi, xj) - 1e-7 &&
            x <= Math.max(xi, xj) + 1e-7 &&
            y >= Math.min(yi, yj) - 1e-7 &&
            y <= Math.max(yi, yj) + 1e-7) {
          return true;
        }
        if ((yi > y) !== (yj > y) &&
            x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
          inside = !inside;
        }
      }
      return inside;
    }

    for (const [code, polygon] of zones) {
      if (contains(polygon)) return code;
    }
    return "PD";
  },

  render(svg, sample) {
    const ns = "http://www.w3.org/2000/svg";
    const zones = [
      ["PD", "#d9e8fa", [[300,55],[420,142],[350,170],[325,235],[282,250],[240,177],[180,142]], [300,151]],
      ["D1", "#f5cccc", [[67,224],[180,142],[240,177],[282,250],[265,305],[190,320],[105,338]], [155,245]],
      ["D2", "#efb9b2", [[282,250],[325,235],[330,295],[320,348],[290,415],[245,355],[182,365],[190,320],[265,305]], [257,325]],
      ["T3", "#f6d499", [[156,498],[105,338],[190,320],[182,365],[245,355],[290,415],[300,498]], [204,433]],
      ["T2", "#f7e6a6", [[330,295],[410,310],[368,353],[350,440],[444,498],[300,498],[290,415],[320,348]], [326,440]],
      ["T1", "#d9eab7", [[490,358],[444,498],[350,440],[368,353],[410,310]], [429,392]],
      ["S",  "#d9d0eb", [[420,142],[533,224],[490,358],[410,310],[330,295],[325,235],[350,170]], [425,241]]
    ];

    function add(tag, attributes, text) {
      const element = document.createElementNS(ns, tag);
      for (const [name, value] of Object.entries(attributes)) {
        element.setAttribute(name, String(value));
      }
      if (text !== undefined) element.textContent = text;
      svg.appendChild(element);
      return element;
    }

    add("rect", { x: 0, y: 0, width: 600, height: 600, fill: "white" });

    for (const [, color, polygon] of zones) {
      add("polygon", {
        points: polygon.map(([x, y]) => `${x},${y}`).join(" "),
        fill: color,
        stroke: "#58616b",
        "stroke-width": 1.5,
        "stroke-linejoin": "round"
      });
    }

    const axes = [
      [300, 55, "H₂", 300, 34],
      [533, 224, "CH₄", 559, 223],
      [444, 498, "C₂H₆", 467, 529],
      [156, 498, "C₂H₄", 133, 529],
      [67, 224, "C₂H₂", 40, 223]
    ];

    for (const [x, y, name, labelX, labelY] of axes) {
      add("line", {
        x1: 300, y1: 300, x2: x, y2: y,
        stroke: "#45515d", "stroke-width": 0.8,
        "stroke-dasharray": "4 5", opacity: 0.65
      });
      add("text", {
        x: labelX, y: labelY,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        "font-family": "Arial, sans-serif",
        "font-size": 17,
        "font-weight": "bold",
        fill: "#26323c"
      }, name);
    }

    add("polygon", {
      points: "300,55 533,224 444,498 156,498 67,224",
      fill: "none",
      stroke: "#26323c",
      "stroke-width": 2.5,
      "stroke-linejoin": "round"
    });

    for (const [code, , , [x, y]] of zones) {
      add("text", {
        x, y,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        "font-family": "Arial, sans-serif",
        "font-size": 19,
        "font-weight": "bold",
        fill: "#26323c"
      }, code);
    }

    if (sample !== null) {
      const { h2, ch4, c2h6, c2h4, c2h2 } = sample;
      const total = h2 + ch4 + c2h6 + c2h4 + c2h2;
      const x =
        (300 * h2 + 533 * ch4 + 444 * c2h6 +
         156 * c2h4 + 67 * c2h2) / total;
      const y =
        (55 * h2 + 224 * ch4 + 498 * c2h6 +
         498 * c2h4 + 224 * c2h2) / total;

      add("circle", {
        cx: x, cy: y, r: 7,
        fill: "#171717", stroke: "white", "stroke-width": 2
      });
    }
  }
};
