const DuvalPentagon = (function() {
    // Vertices of the regular pentagon
    // Order: H2, C2H6, CH4, C2H4, C2H2
    const V = [
        [0, -1],                 // V0: H2 (Top)
        [0.951, -0.309],         // V1: C2H6 (Top Right)
        [0.588, 0.809],          // V2: CH4 (Bottom Right)
        [-0.588, 0.809],         // V3: C2H4 (Bottom Left)
        [-0.951, -0.309]         // V4: C2H2 (Top Left)
    ];

    // Topologically sound zone definitions using barycentric/cartesian mapped coordinates
    const zones = {
        PD: { color: '#eeeeee', pts: [ V[0], [0.1, -0.6], [-0.1, -0.6] ] },
        D1: { color: '#b3e5fc', pts: [ [-0.1, -0.6], V[4], [-0.4, 0], [0, -0.1] ] },
        D2: { color: '#03a9f4', pts: [ V[4], V[3], [-0.2, 0.4], [-0.4, 0] ] },
        T3: { color: '#f44336', pts: [ V[3], [0, 0.809], [0, 0.4], [-0.2, 0.4] ] },
        T2: { color: '#ff9800', pts: [ [0, 0.809], V[2], [0.2, 0.4], [0, 0.4] ] },
        T1: { color: '#ffeb3b', pts: [ V[2], V[1], [0.4, 0], [0.2, 0.4] ] },
        S:  { color: '#8bc34a', pts: [ [0.1, -0.6], V[1], [0.4, 0], [0, -0.1], [-0.1, -0.6] ] }
    };

    function getXY(h2, ch4, c2h6, c2h4, c2h2) {
        const sum = h2 + ch4 + c2h6 + c2h4 + c2h2;
        if (sum <= 0) return [0, 0];
        
        // Map arguments to the correct vertex order
        const p = [
            h2 / sum,
            c2h6 / sum,
            ch4 / sum,
            c2h4 / sum,
            c2h2 / sum
        ];
        
        let x = 0, y = 0;
        for (let i = 0; i < 5; i++) {
            x += p[i] * V[i][0];
            y += p[i] * V[i][1];
        }
        return [x, y];
    }

    function pointInPolygon(pt, vs) {
        let x = pt[0], y = pt[1];
        let inside = false;
        for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
            let xi = vs[i][0], yi = vs[i][1];
            let xj = vs[j][0], yj = vs[j][1];
            let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    return {
        classify(h2, ch4, c2h6, c2h4, c2h2) {
            const pt = getXY(h2, ch4, c2h6, c2h4, c2h2);
            for (const zone in zones) {
                if (pointInPolygon(pt, zones[zone].pts)) {
                    return zone;
                }
            }
            return 'Unknown';
        },

        render(svg, sample) {
            while (svg.firstChild) {
                svg.removeChild(svg.firstChild);
            }

            const ns = 'http://www.w3.org/2000/svg';
            const cx = 300, cy = 300, R = 230;

            for (const zone in zones) {
                const data = zones[zone];
                const poly = document.createElementNS(ns, 'polygon');
                const points = data.pts.map(p => `${cx + p[0]*R},${cy + p[1]*R}`).join(' ');
                
                poly.setAttribute('points', points);
                poly.setAttribute('fill', data.color);
                poly.setAttribute('stroke', '#333333');
                poly.setAttribute('stroke-width', '1.5');
                svg.appendChild(poly);

                let sx = 0, sy = 0;
                data.pts.forEach(p => { sx += p[0]; sy += p[1]; });
                sx /= data.pts.length;
                sy /= data.pts.length;

                const txt = document.createElementNS(ns, 'text');
                txt.setAttribute('x', cx + sx * R);
                txt.setAttribute('y', cy + sy * R + 5);
                txt.setAttribute('text-anchor', 'middle');
                txt.setAttribute('font-family', 'sans-serif');
                txt.setAttribute('font-size', '16');
                txt.setAttribute('font-weight', 'bold');
                txt.setAttribute('fill', '#000000');
                txt.textContent = zone;
                svg.appendChild(txt);
            }

            const labels = ['H2', 'C2H6', 'CH4', 'C2H4', 'C2H2'];
            for (let i = 0; i < 5; i++) {
                const txt = document.createElementNS(ns, 'text');
                txt.setAttribute('x', cx + V[i][0] * (R + 30));
                txt.setAttribute('y', cy + V[i][1] * (R + 30) + 6);
                txt.setAttribute('text-anchor', 'middle');
                txt.setAttribute('font-family', 'sans-serif');
                txt.setAttribute('font-size', '18');
                txt.setAttribute('font-weight', 'bold');
                txt.textContent = labels[i];
                svg.appendChild(txt);
            }

            if (sample) {
                const pt = getXY(sample.h2, sample.ch4, sample.c2h6, sample.c2h4, sample.c2h2);
                const circle = document.createElementNS(ns, 'circle');
                circle.setAttribute('cx', cx + pt[0]*R);
                circle.setAttribute('cy', cy + pt[1]*R);
                circle.setAttribute('r', '6');
                circle.setAttribute('fill', '#000000');
                circle.setAttribute('stroke', '#ffffff');
                circle.setAttribute('stroke-width', '2');
                svg.appendChild(circle);
            }
        }
    };
})();
