const DuvalTriangle5 = {
    classify(ch4, c2h4, c2h6) {
        // Normalize gas concentrations to percentages
        const total = ch4 + c2h4 + c2h6;
        const pctCH4 = (ch4 / total) * 100;
        const pctC2H4 = (c2h4 / total) * 100;
        const pctC2H6 = (c2h6 / total) * 100;

        // Determine the fault zone based on boundaries (approximate recollection)
        if (pctCH4 >= 98) return "PD"; // Partial Discharge
        if (pctCH4 > 85 && pctCH4 < 98) return "T1"; // Thermal Fault <300°C
        if (pctCH4 > 70 && pctC2H6 >= 20) return "T2"; // Thermal Fault 300-700°C
        if (pctC2H4 > 40 && pctCH4 < 70) return "T3"; // Thermal Fault >700°C
        if (pctC2H4 > 50 && pctC2H6 < 15) return "D1"; // Low Energy Discharge
        if (pctC2H4 > 80) return "D2"; // High Energy Discharge

        return "Invalid"; // Should not reach here if input is valid
    },

    render(svg, sample) {
        const xmlns = "http://www.w3.org/2000/svg";
        
        // Clear the SVG element
        while (svg.firstChild) svg.removeChild(svg.firstChild);
        
        // Draw Triangle Boundaries
        const trianglePoints = [
            { x: 300, y: 40 },   // Apex (CH4 100%)
            { x: 50, y: 490 },   // Bottom-Left (C2H6 100%)
            { x: 550, y: 490 }   // Bottom-Right (C2H4 100%)
        ];

        const createPolygon = (points, color, label, labelPos) => {
            const polygon = document.createElementNS(xmlns, "polygon");
            polygon.setAttribute("points", points.map(p => `${p.x},${p.y}`).join(" "));
            polygon.setAttribute("fill", color);
            polygon.setAttribute("stroke", "black");
            polygon.setAttribute("stroke-width", "1");
            svg.appendChild(polygon);

            if (label) {
                const text = document.createElementNS(xmlns, "text");
                text.setAttribute("x", labelPos.x);
                text.setAttribute("y", labelPos.y);
                text.setAttribute("font-size", "14");
                text.setAttribute("font-family", "Arial");
                text.setAttribute("text-anchor", "middle");
                text.textContent = label;
                svg.appendChild(text);
            }
        };

        // Define and render each zone (colors and positions approximate)
        createPolygon([trianglePoints[0], { x: 225, y: 265 }, { x: 300, y: 490 }], "#FFDDC1", "PD", { x: 275, y: 350 });
        createPolygon([{ x: 225, y: 265 }, { x: 150, y: 490 }, trianglePoints[1]], "#D4E157", "T1", { x: 150, y: 380 });
        createPolygon([{ x: 300, y: 490 }, { x: 375, y: 490 }, { x: 300, y: 265 }], "#66BB6A", "T2", { x: 350, y: 405 });
        createPolygon([trianglePoints[1], { x: 300, y: 490 }, { x: 225, y: 265 }], "#29B6F6", "T3", { x: 200, y: 435 });
        createPolygon([{ x: 375, y: 490 }, trianglePoints[2], { x: 300, y: 265 }], "#AB47BC", "D1", { x: 450, y: 400 });
        createPolygon([trianglePoints[0], { x: 300, y: 265 }, trianglePoints[2]], "#EF5350", "D2", { x: 375, y: 300 });

        // Draw Triangle Axes
        const drawLine = (x1, y1, x2, y2, color) => {
            const line = document.createElementNS(xmlns, "line");
            line.setAttribute("x1", x1);
            line.setAttribute("y1", y1);
            line.setAttribute("x2", x2);
            line.setAttribute("y2", y2);
            line.setAttribute("stroke", color || "black");
            line.setAttribute("stroke-width", "2");
            svg.appendChild(line);
        };

        drawLine(trianglePoints[0].x, trianglePoints[0].y, trianglePoints[1].x, trianglePoints[1].y);
        drawLine(trianglePoints[1].x, trianglePoints[1].y, trianglePoints[2].x, trianglePoints[2].y);
        drawLine(trianglePoints[2].x, trianglePoints[2].y, trianglePoints[0].x, trianglePoints[0].y);

        // Add Axis Labels
        const addText = (x, y, textContent) => {
            const text = document.createElementNS(xmlns, "text");
            text.setAttribute("x", x);
            text.setAttribute("y", y);
            text.setAttribute("font-size", "14");
            text.setAttribute("font-family", "Arial");
            text.setAttribute("text-anchor", "middle");
            text.textContent = textContent;
            svg.appendChild(text);
        };

        addText(300, 20, "CH4");
        addText(30, 510, "C2H6");
        addText(570, 510, "C2H4");

        // Plot Sample Point if Provided
        if (sample) {
            const total = sample.ch4 + sample.c2h4 + sample.c2h6;
            const pctCH4 = (sample.ch4 / total) * 100;
            const pctC2H4 = (sample.c2h4 / total) * 100;
            const x = trianglePoints[0].x + (trianglePoints[2].x - trianglePoints[0].x) * (pctC2H4 / 100);
            const y = trianglePoints[0].y + (trianglePoints[1].y - trianglePoints[0].y) * ((100 - pctCH4) / 100);
            
            const circle = document.createElementNS(xmlns, "circle");
            circle.setAttribute("cx", x);
            circle.setAttribute("cy", y);
            circle.setAttribute("r", 5);
            circle.setAttribute("fill", "red");
            svg.appendChild(circle);
        }
    }
};
