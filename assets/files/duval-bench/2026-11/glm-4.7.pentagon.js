const DuvalPentagon = (function() {
    const svgNS = "http://www.w3.org/2000/svg";

    // Pentagon vertices (normalized to radius 1, center 0,0)
    // C2H2 (top), C2H4 (top right), CH4 (bottom right), H2 (bottom left), C2H6 (top left)
    const v1 = [0, 1];
    const v2 = [0.951, 0.309];
    const v3 = [0.588, -0.809];
    const v4 = [-0.588, -0.809];
    const v5 = [-0.951, 0.309];
    const O = [0, 0];

    // Zone boundary points
    const p1 = [0.38, 0.58];  // C2H2-C2H4 edge
    const p2 = [0.78, -0.32]; // C2H4-CH4 edge
    const p3 = [0, -0.809];   // CH4-H2 edge
    const p4 = [-0.78, -0.32]; // H2-C2H6 edge
    const p5 = [-0.66, 0.51];  // C2H6-C2H2 edge (lower)
    const p6 = [-0.28, 0.81];  // C2H6-C2H2 edge (upper)

    const zones = [
        { code: "PD", poly: [O, p3, v4, p4], color: "#66E0FF", labelPos: [-0.34, -0.47] },
        { code: "D1", poly: [O, p5, p6], color: "#E066FF", labelPos: [-0.31, 0.44] },
        { code: "D2", poly: [O, p6, v1, p1], color: "#6680FF", labelPos: [0.025, 0.6] },
        { code: "T3", poly: [O, p1, v2, p2], color: "#FF9966", labelPos: [0.5, 0.14] },
        { code: "T1", poly: [O, p2, v3, p3], color: "#66FF80", labelPos: [0.34, -0.48] },
        { code: "T2", poly: [O, p4, v5, p5], color: "#FFFF66", labelPos: [-0.6, 0.12] }
    ];

    function pointInPolygon(poly, p) {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            let xi = poly[i][0], yi = poly[i][1];
            let xj = poly[j][0], yj = poly[j][1];
            let intersect = ((yi > p[1]) !== (yj > p[1])) &&
                (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    function getPoint(h2, ch4, c2h6, c2h4, c2h2) {
        const total = h2 + ch4 + c2h6 + c2h4 + c2h2;
        if (total <= 0) return null;
        const pH2 = h2 / total;
        const pCH4 = ch4 / total;
        const pC2H6 = c2h6 / total;
        const pC2H4 = c2h4 / total;
        const pC2H2 = c2h2 / total;

        const x = 0 * pC2H2 + 0.951 * pC2H4 + 0.588 * pCH4 - 0.588 * pH2 - 0.951 * pC2H6;
        const y = 1 * pC2H2 + 0.309 * pC2H4 - 0.809 * pCH4 - 0.809 * pH2 + 0.309 * pC2H6;
        return [x, y];
    }

    function classify(h2, ch4, c2h6, c2h4, c2h2) {
        const p = getPoint(h2, ch4, c2h6, c2h4, c2h2);
        if (!p) return "N/A";
        for (const z of zones) {
            if (pointInPolygon(z.poly, p)) return z.code;
        }
        if (p[1] > 0.5) return "D2";
        if (p[1] < -0.5) return "PD";
        if (p[0] > 0.5) return "T3";
        if (p[0] < -0.5) return "T2";
        return "T1";
    }

    function render(svg, sample) {
        while (svg.firstChild) svg.removeChild(svg.firstChild);
        
        function el(tag, attrs) {
            const e = document.createElementNS(svgNS, tag);
            for (const k in attrs) e.setAttribute(k, attrs[k]);
            return e;
        }
        
        function polyStr(pts) {
            return pts.map(p => `${300 + 250 * p[0]},${300 - 250 * p[1]}`).join(' ');
        }
        
        svg.appendChild(el('rect', { x: 0, y: 0, width: 600, height: 600, fill: 'white' }));
        
        const axes = [v1, v2, v3, v4, v5];
        for (const v of axes) {
            svg.appendChild(el('line', {
                x1: 300, y1: 300,
                x2: 300 + 250 * v[0], y2: 300 - 250 * v[1],
                stroke: '#333', 'stroke-width': 1
            }));
        }
        
        for (const z of zones) {
            svg.appendChild(el('polygon', {
                points: polyStr(z.poly),
                fill: z.color,
                stroke: '#333',
                'stroke-width': 1,
                'fill-opacity': 0.7
            }));
            const lx = 300 + 250 * z.labelPos[0];
            const ly = 300 - 250 * z.labelPos[1];
            const text = el('text', {
                x: lx, y: ly,
                'text-anchor': 'middle',
                'dominant-baseline': 'middle',
                'font-family': 'sans-serif',
                'font-size': 18,
                'font-weight': 'bold',
                fill: '#222'
            });
            text.textContent = z.code;
            svg.appendChild(text);
        }
        
        svg.appendChild(el('polygon', {
            points: polyStr(axes),
            fill: 'none',
            stroke: '#333',
            'stroke-width': 2
        }));
        
        const gasLabels = [
            { name: 'C2H2', pos: [0, 1], anchor: 'middle', offset: [0, -20] },
            { name: 'C2H4', pos: [0.951, 0.309], anchor: 'start', offset: [10, 5] },
            { name: 'CH4', pos: [0.588, -0.809], anchor: 'start', offset: [10, 15] },
            { name: 'H2', pos: [-0.588, -0.809], anchor: 'end', offset: [-10, 15] },
            { name: 'C2H6', pos: [-0.951, 0.309], anchor: 'end', offset: [-10, 5] }
        ];
        for (const g of gasLabels) {
            const x = 300 + 250 * g.pos[0] + g.offset[0];
            const y = 300 - 250 * g.pos[1] + g.offset[1];
            const text = el('text', {
                x: x, y: y,
                'text-anchor': g.anchor,
                'dominant-baseline': 'middle',
                'font-family': 'sans-serif',
                'font-size': 16,
                'font-weight': 'bold',
                fill: '#111'
            });
            text.textContent = g.name;
            svg.appendChild(text);
        }
        
        if (sample) {
            const p = getPoint(sample.h2, sample.ch4, sample.c2h6, sample.c2h4, sample.c2h2);
            if (p) {
                const cx = 300 + 250 * p[0];
                const cy = 300 - 250 * p[1];
                svg.appendChild(el('circle', { cx: cx, cy: cy, r: 6, fill: '#000', stroke: '#fff', 'stroke-width': 2 }));
            }
        }
    }

    return { classify, render };
})();
