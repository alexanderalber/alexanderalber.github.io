const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const total = ch4 + c2h4 + c2h2;
    const r_ch4 = (ch4 / total) * 100;
    const r_c2h4 = (c2h4 / total) * 100;
    const r_c2h2 = (c2h2 / total) * 100;

    if (r_c2h2 > 29) return "T3";
    if (r_c2h2 >= 16) return "T2";
    if (r_c2h4 > 28) return "D2";
    if (r_c2h4 >= 12) return "D1";
    if (r_ch4 > 98) return "PD";
    if (r_ch4 >= 87) return "T1";
    return "DT";
  },

  render(svg, sample) {
    const xmlns = "http://www.w3.org/2000/svg";

    function createZone(points, color, label) {
      const zone = document.createElementNS(xmlns, "polygon");
      zone.setAttribute("points", points.join(" "));
      zone.setAttribute("fill", color);
      zone.setAttribute("opacity", "0.5");
      svg.appendChild(zone);

      const centroid = points.reduce(
        (acc, p) => {
          acc[0] += p[0];
          acc[1] += p[1];
          return acc;
        },
        [0, 0]
      ).map((v) => v / points.length);

      const text = document.createElementNS(xmlns, "text");
      text.setAttribute("x", centroid[0]);
      text.setAttribute("y", centroid[1]);
      text.textContent = label;
      text.setAttribute("font-size", "14");
      text.setAttribute("text-anchor", "middle");
      svg.appendChild(text);
    }

    // Coordinates for triangles (example, approximate)
    createZone(
      [
        [100, 460],
        [300, 60],
        [500, 460],
      ],
      "red",
      "T3"
    );
    createZone(
      [
        [100, 460],
        [300, 60],
        [280, 460],
        [300, 460],
      ],
      "orange",
      "T2"
    );
    createZone(
      [
        [500, 460],
        [300, 60],
        [320, 460],
        [280, 460],
      ],
      "yellow",
      "D2"
    );
    createZone(
      [
        [100, 460],
        [200, 280],
        [300, 460],
      ],
      "lightblue",
      "D1"
    );
    createZone(
      [
        [300, 60],
        [320, 460],
        [380, 60],
      ],
      "green",
      "PD"
    );
    createZone(
      [
        [300, 60],
        [300, 460],
        [320, 460],
      ],
      "blue",
      "T1"
    );
    createZone(
      [
        [300, 460],
        [200, 280],
        [300, 60],
      ],
      "purple",
      "DT"
    );

    // Axes and labels
    function createAxis(x1, y1, x2, y2, label) {
      const line = document.createElementNS(xmlns, "line");
      line.setAttribute("x1", x1);
      line.setAttribute("y1", y1);
      line.setAttribute("x2", x2);
      line.setAttribute("y2", y2);
      line.setAttribute("stroke", "black");
      svg.appendChild(line);

      const text = document.createElementNS(xmlns, "text");
      text.setAttribute("x", (x1 + x2) / 2);
      text.setAttribute("y", (y1 + y2) / 2 - 10);
      text.textContent = label;
      text.setAttribute("font-size", "12");
      text.setAttribute("text-anchor", "middle");
      svg.appendChild(text);

      // Ticks
      for (let i = 1; i <= 9; i++) {
        const x = x1 + (x2 - x1) * (i / 10);
        const y = y1 + (y2 - y1) * (i / 10);
        const tick = document.createElementNS(xmlns, "line");
        tick.setAttribute("x1", x);
        tick.setAttribute("y1", y);
        tick.setAttribute("x2", x + (y2 === y1 ? 5 : 0));
        tick.setAttribute("y2", y + (x2 === x1 ? 5 : 0));
        tick.setAttribute("stroke", "black");
        svg.appendChild(tick);
      }
    }

    createAxis(100, 460, 500, 460, "CH4");
    createAxis(300, 60, 500, 460, "C2H4");
    createAxis(100, 460, 300, 60, "C2H2");

    // Plot sample point
    if (sample) {
      const total = sample.ch4 + sample.c2h4 + sample.c2h2;
      const r_ch4 = (sample.ch4 / total) * 100;
      const r_c2h4 = (sample.c2h4 / total) * 100;
      const r_c2h2 = (sample.c2h2 / total) * 100;

      const x = 100 + r_c2h4 * 4;
      const y = 460 - r_c2h2 * 4;

      const circle = document.createElementNS(xmlns, "circle");
      circle.setAttribute("cx", x);
      circle.setAttribute("cy", y);
      circle.setAttribute("r", 5);
      circle.setAttribute("fill", "black");
      svg.appendChild(circle);
    }
  },
};
