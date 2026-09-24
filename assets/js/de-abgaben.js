/* de-abgaben.js -- deutsches Steuer-, Sozialversicherungs- und Transferrecht
 * fuer einen Haushalt mit Erwerbseinkommen, Rechtsstand 2026.
 *
 * Entstanden 2026-09-25 fuer tax-wedge.html. Der Einkommensteuertarif und die
 * Idee der Vorsorgepauschale stammen aus dem egcore-Block des
 * Elterngeld-Planers; CLAUDE.md verlangt fuer Logik, die ein zweites Tool
 * braucht, ein Modul statt einer Kopie.
 *
 * Alle Zahlen stehen in PARAMS[2026] und sind aus Primaerquellen abgeschrieben,
 * nicht aus dem Gedaechtnis:
 *   Tarif           § 32a EStG (Fassung VZ 2026)
 *   Soli            § 3 Abs. 3, § 4 SolZG 1995
 *   SV-Saetze, BBG  Rechengroessen 2026, Faktor F 0,6619, Uebergangsbereich
 *                   603,01 bis 2.000 Euro (§ 20a SGB IV)
 *   Grundsicherung  § 11b SGB II, Regelbedarfe 2026 (Nullrunde, wie 2024/25)
 *   Wohngeld        § 19 und Anlagen 2/3 WoGG, Hoechstbetraege ab 1.1.2025
 *                   (gelten 2026 unveraendert), § 12 Abs. 6/7, §§ 16, 17
 *   Kinderzuschlag  § 6a BKGG, DA-KiZ Stand 20.02.2026 (Wohnanteile C.3.1.2)
 *
 * Bewusste Vereinfachungen, damit die Kurve eine Kurve bleibt: ein
 * Arbeitsverhaeltnis je Erwachsenem, gesetzlich versichert, keine weiteren
 * Einkunftsarten, Werbungskosten pauschal, Kirchensteuer ohne Kappung und
 * ohne Sonderausgabenabzug, Miete gilt als angemessen, kein Unterhalt und
 * kein Unterhaltsvorschuss, kein Vermoegen. U1/U2 und Unfallversicherung
 * fehlen in den Arbeitgeberkosten, weil sie vom Betrieb abhaengen.
 *
 * Kein DOM, kein Import: laeuft im Browser und unter Node, wo die Tests die
 * Datei als String auswerten. Alles haengt an globalThis.DeAbgaben.
 */
(function () {
  'use strict';

  const P2026 = Object.freeze({
    year: 2026,
    // Einkommensteuer
    grundfreibetrag: 12348,
    kfbPerChild: 9756,          // Kinderfreibetrag + BEA, beide Elternteile zusammen
    kindergeld: 259,            // je Kind und Monat
    werbungskosten: 1230,       // Arbeitnehmer-Pauschbetrag
    sonderausgaben: 36,
    entlastungAE: 4260,         // § 24b EStG, erstes Kind
    entlastungAEPlus: 240,      // je weiteres Kind
    vorsorgeSonstigeMax: 1900,  // § 10 Abs. 4 EStG, Arbeitnehmer
    soliFreigrenze: 20350,      // Einzelveranlagung; Splitting doppelt
    soliRate: 0.055,
    soliMilderung: 0.119,
    // Sozialversicherung (Monatswerte)
    bbgRV: 8450,
    bbgKV: 5812.5,
    rv: 0.186, av: 0.026, kvGeneral: 0.146, kvZusatzAvg: 0.029,
    pv: 0.036, pvChildless: 0.006, pvAbatePerChild: 0.0025, pvAbateMaxChildren: 4,
    insolvenz: 0.0015,
    miniMax: 603,
    midiMax: 2000,
    faktorF: 0.6619,
    miniKV: 0.13, miniRV: 0.15, miniTax: 0.02, miniRvAN: 0.036,
    // Grundsicherung (Monatswerte)
    rbSingle: 563, rbPartner: 506,
    rbChild: [[5, 357], [13, 390], [17, 471], [24, 451]],   // [bis Alter, Betrag]
    fbGrund: 100,
    fbSteps: [[520, 0.20], [1000, 0.30]],   // Obergrenze, Satz; darueber 10 % bis fbCap
    fbCap: 1200, fbCapWithMinor: 1500,
    // Wohngeld
    wgCoeff: [                   // Anlage 2, [a, b, c] fuer 1..12 Mitglieder
      [4.000e-2, 4.797e-4, 4.080e-5], [3.000e-2, 3.571e-4, 3.040e-5],
      [2.000e-2, 2.917e-4, 2.450e-5], [1.000e-2, 2.163e-4, 1.760e-5],
      [0, 1.907e-4, 1.720e-5], [-1.000e-2, 1.722e-4, 1.660e-5],
      [-2.000e-2, 1.592e-4, 1.650e-5], [-3.000e-2, 1.583e-4, 1.650e-5],
      [-4.000e-2, 1.376e-4, 1.660e-5], [-6.000e-2, 1.249e-4, 1.660e-5],
      [-9.000e-2, 1.141e-4, 1.960e-5], [-1.200e-1, 1.107e-4, 2.210e-5],
    ],
    wgMin: [                     // Anlage 3, Mindestwerte [M, Y] fuer 1..12
      [54, 396], [67, 679], [79, 906], [92, 1132], [103, 1358], [103, 1585],
      [115, 1811], [128, 2037], [140, 2264], [152, 2490], [187, 2717], [298, 2943],
    ],
    wgMax: [                     // Anlage 1 ab 1.1.2025, Mietenstufe I..VII
      [361, 408, 456, 511, 562, 615, 677],
      [437, 493, 551, 619, 680, 745, 820],
      [521, 587, 657, 737, 809, 887, 975],
      [608, 686, 766, 858, 946, 1035, 1139],
      [694, 782, 875, 982, 1080, 1183, 1302],
    ],
    wgMaxPlus: [82, 94, 106, 119, 129, 149, 163],
    wgHeat: [110.40, 142.60, 170.20, 197.80, 225.40], wgHeatPlus: 27.60,
    wgClimate: [19.20, 24.80, 29.60, 34.40, 39.20], wgClimatePlus: 4.80,
    wgWK: 1230,
    wgFbAE: 1320,
    wgMinPayout: 10,
    // Kinderzuschlag
    kizMax: 297,
    kizMinIncomeCouple: 900, kizMinIncomeSingle: 600,
    kizWithdraw: 0.45,
    kizShareSingle: [77, 63, 53, 46, 40, 36, 33, 30, 27, 25],   // Prozent, 1..10 Kinder
    kizShareCouple: [83, 71, 62, 55, 50, 45, 41, 38, 35, 33],
  });

  const PARAMS = { 2026: P2026 };

  /* ===== Einkommensteuer ===== */

  // § 32a Abs. 1 EStG 2026, Grundtarif; Ergebnis auf volle Euro abgerundet
  function estTarif(x) {
    x = Math.floor(x);
    let t;
    if (x <= 12348) t = 0;
    else if (x <= 17799) { const y = (x - 12348) / 10000; t = (914.51 * y + 1400) * y; }
    else if (x <= 69878) { const z = (x - 17799) / 10000; t = (173.10 * z + 2397) * z + 1034.87; }
    else if (x <= 277825) t = 0.42 * x - 11135.63;
    else t = 0.45 * x - 19470.38;
    return Math.floor(t);
  }
  const estSplit = (x) => 2 * estTarif(x / 2);

  // SolZG: 5,5 % oberhalb der Freigrenze, in der Milderungszone hoechstens
  // 11,9 % des Ueberhangs. Das erzeugt die Zacke im Grenzsteuersatz.
  function soli(base, splitting, P) {
    const fg = P.soliFreigrenze * (splitting ? 2 : 1);
    if (base <= fg) return 0;
    return Math.min(P.soliRate * base, P.soliMilderung * (base - fg));
  }

  /* ===== Sozialversicherung, Monatswerte je Beschaeftigung =====
     kind: 'none' | 'mini' | 'midi' | 'regular'. Im Uebergangsbereich gilt
     § 20a SGB IV: der Gesamtbeitrag laeuft auf BE_ges, der AN-Anteil auf der
     reduzierten BE_AN, der AG traegt die Differenz. Der Kinderlosenzuschlag
     und die Kinderabschlaege treffen nur den AN-Anteil. */
  function socialMonthly(g, o, P) {
    const z = { kind: 'none', an: { rv: 0, kv: 0, pv: 0, av: 0 },
                ag: { rv: 0, kv: 0, pv: 0, av: 0, umlage: 0, pausch: 0 } };
    if (!(g > 0)) return z;
    const kvTot = P.kvGeneral + o.kvZusatz;
    const pvAN = P.pv / 2 - o.pvAbate + (o.childless ? P.pvChildless : 0);
    if (g <= P.miniMax) {
      z.kind = 'mini';
      z.an.rv = o.miniRvExempt ? 0 : P.miniRvAN * g;
      z.ag.rv = P.miniRV * g;
      z.ag.kv = P.miniKV * g;
      z.ag.pausch = P.miniTax * g;
      z.ag.umlage = P.insolvenz * g;
      return z;
    }
    if (g < P.midiMax) {
      z.kind = 'midi';
      const G = P.miniMax, OG = P.midiMax, F = P.faktorF;
      const beGes = F * G + (OG / (OG - G) - G / (OG - G) * F) * (g - G);
      const beAN = OG / (OG - G) * (g - G);
      z.an.rv = beAN * P.rv / 2;   z.ag.rv = beGes * P.rv - z.an.rv;
      z.an.av = beAN * P.av / 2;   z.ag.av = beGes * P.av - z.an.av;
      z.an.kv = beAN * kvTot / 2;  z.ag.kv = beGes * kvTot - z.an.kv;
      z.ag.pv = beGes * P.pv - beAN * P.pv / 2;
      z.an.pv = beAN * pvAN;
      z.ag.umlage = P.insolvenz * g;
      return z;
    }
    z.kind = 'regular';
    const bR = Math.min(g, P.bbgRV), bK = Math.min(g, P.bbgKV);
    z.an.rv = z.ag.rv = bR * P.rv / 2;
    z.an.av = z.ag.av = bR * P.av / 2;
    z.an.kv = z.ag.kv = bK * kvTot / 2;
    z.ag.pv = bK * P.pv / 2;
    z.an.pv = bK * pvAN;
    z.ag.umlage = P.insolvenz * bR;
    return z;
  }

  // Abziehbare Vorsorge im Jahr: RV-AN-Anteil voll, dazu die Basis-KV (um 4 %
  // gekuerzt wegen Krankengeld) plus PV, oder, falls hoeher, alle sonstigen
  // Vorsorgeaufwendungen bis 1.900 Euro. Bei Pflichtversicherten gewinnt fast
  // immer die Basis, deshalb wirkt die AV praktisch nie steuermindernd.
  function vorsorgeYear(an, P) {
    const basis = 0.96 * an.kv + an.pv;
    const sonst = Math.min(P.vorsorgeSonstigeMax / 12, an.kv + an.pv + an.av);
    return 12 * (an.rv + Math.max(basis, sonst));
  }

  /* ===== Grundsicherung: Erwerbstaetigenfreibetrag § 11b Abs. 2, 3 SGB II ===== */
  function sgb2Freibetrag(g, withMinor, P) {
    if (!(g > 0)) return 0;
    let fb = Math.min(g, P.fbGrund), lo = P.fbGrund;
    for (const [hi, r] of P.fbSteps) {
      if (g > lo) fb += r * (Math.min(g, hi) - lo);
      lo = hi;
    }
    const cap = withMinor ? P.fbCapWithMinor : P.fbCap;
    if (g > lo) fb += 0.10 * (Math.min(g, cap) - lo);
    return fb;
  }

  const childRB = (age, P) => { for (const [a, v] of P.rbChild) if (age <= a) return v; return 0; };

  // Mehrbedarf Alleinerziehende, § 21 Abs. 3 SGB II, als Anteil am Regelbedarf
  function mehrbedarfAE(ages) {
    const minors = ages.filter((a) => a < 18).length;
    if (!minors) return 0;
    const u7 = ages.filter((a) => a < 7).length, u16 = ages.filter((a) => a < 16).length;
    const flat = (u7 >= 1 || u16 === 2 || u16 === 3) ? 0.36 : 0;
    return Math.max(flat, Math.min(0.60, 0.12 * minors));
  }

  /* ===== Wohngeld, § 19 WoGG, Monatswert ===== */
  function wohngeld(n, rentCold, Ymonth, stufe, P) {
    if (n < 1) return 0;
    const k = Math.min(n, 12);
    const s = Math.max(1, Math.min(7, stufe)) - 1;
    const extra = Math.max(0, n - 5);
    const row = P.wgMax[Math.min(n, 5) - 1];
    const cap = row[s] + extra * P.wgMaxPlus[s]
      + P.wgClimate[Math.min(n, 5) - 1] + extra * P.wgClimatePlus;
    const heat = P.wgHeat[Math.min(n, 5) - 1] + extra * P.wgHeatPlus;
    let M = Math.min(rentCold, cap) + heat;
    let Y = Ymonth;
    const [mM, mY] = P.wgMin[k - 1];
    if (M < mM) M = mM;
    if (Y < mY) Y = mY;
    const [a, b, c] = P.wgCoeff[k - 1];
    const w = 1.15 * (M - (a + b * M + c * Y) * Y);
    const r = Math.floor(w + 0.5);
    if (r < P.wgMinPayout) return 0;
    return Math.min(r, M);
  }

  /* ===== Haushalt =====
     h = {
       adults:   [{ gross }]        1 oder 2 Erwachsene, Monatsbrutto je Job
       married:  bool               nur mit 2 Erwachsenen wirksam
       kids:     [Alter, ...]       Kinder mit Kindergeld, 0..24
       kvZusatz: 0.029              Zusatzbeitrag der eigenen Kasse
       church:   0 | 0.08 | 0.09
       parentPV: bool               Elterneigenschaft auch ohne Kind in der Liste
       miniRvExempt: bool
       transfers: bool, rentCold, heat, stufe
     }
     Rueckgabe in Euro pro Monat. est ist die Einkommensteuer NACH
     Familienleistungsausgleich, also abzueglich Kindergeld: der Gesetzgeber
     behandelt das Kindergeld als Steuerverguetung (§ 31 EStG), und nur so
     bleibt die Guenstigerpruefung eine stetige Groesse statt zwei Kurven. */
  function household(h, P) {
    P = P || P2026;
    const kids = (h.kids || []).filter((a) => a >= 0 && a <= 24);
    const nK = kids.length;
    const nA = Math.max(1, Math.min(2, h.adults.length));
    const adults = h.adults.slice(0, nA);
    const married = nA === 2 && !!h.married;
    const single = nA === 1;
    const kvZusatz = h.kvZusatz == null ? P.kvZusatzAvg : h.kvZusatz;
    const parent = nK > 0 || !!h.parentPV;
    const pvAbate = nK >= 2 ? Math.min(P.pvAbateMaxChildren, nK - 1) * P.pvAbatePerChild : 0;
    const svOpt = { kvZusatz, childless: !parent, pvAbate, miniRvExempt: !!h.miniRvExempt };

    const sv = adults.map((a) => socialMonthly(a.gross, svOpt, P));
    const sum = (o) => o.rv + o.kv + o.pv + o.av;

    // --- Einkommensteuer (Jahr) ---
    const zvE = adults.map((a, i) => {
      if (sv[i].kind === 'none' || sv[i].kind === 'mini') return 0;
      const gy = 12 * a.gross;
      return gy - Math.min(P.werbungskosten, gy) - P.sonderausgaben - vorsorgeYear(sv[i].an, P);
    });
    const kgYear = 12 * P.kindergeld * nK;
    let estEff = 0, estKfb = 0, soliY = 0, splitting = false;
    if (married) {
      splitting = true;
      const z = Math.max(0, zvE[0] + zvE[1]);
      const no = estSplit(z), withK = estSplit(Math.max(0, z - nK * P.kfbPerChild));
      estEff = Math.min(no, withK + kgYear);
      estKfb = withK;
      soliY = soli(withK, true, P);
    } else {
      // Unverheiratet: jede Person fuer sich, bei zwei Eltern je halber
      // Kinderfreibetrag und halbes Kindergeld in der Guenstigerpruefung.
      // Allein: voller Freibetrag (Uebertragung unterstellt) und Entlastungsbetrag.
      const kfbShare = single ? 1 : 0.5;
      zvE.forEach((z0, i) => {
        let z = z0;
        if (single && nK > 0) z -= P.entlastungAE + (nK - 1) * P.entlastungAEPlus;
        z = Math.max(0, z);
        const no = estTarif(z);
        const withK = estTarif(Math.max(0, z - kfbShare * nK * P.kfbPerChild));
        estEff += Math.min(no, withK + kfbShare * kgYear);
        estKfb += withK;
        soliY += soli(withK, false, P);
      });
    }
    const kistY = (h.church || 0) * estKfb;

    // --- Monatswerte ---
    const grossM = adults.reduce((s, a) => s + Math.max(0, a.gross), 0);
    const an = { rv: 0, kv: 0, pv: 0, av: 0 };
    const ag = { rv: 0, kv: 0, pv: 0, av: 0, umlage: 0, pausch: 0 };
    for (const s of sv) {
      for (const k in an) an[k] += s.an[k];
      for (const k in ag) ag[k] += s.ag[k];
    }
    const agSum = sum(ag) + ag.umlage + ag.pausch;
    const taxM = (estEff + soliY + kistY) / 12;
    const netLohn = grossM - taxM - sum(an);
    const kgM = kgYear / 12;

    const r = {
      gross: grossM, agCost: grossM + agSum,
      est: (estEff - kgYear) / 12, soli: soliY / 12, kist: kistY / 12,
      rvAN: an.rv, kvAN: an.kv, pvAN: an.pv, avAN: an.av,
      ag: agSum, agParts: ag,
      gs: 0, wg: 0, kiz: 0,
      kindergeld: kgM, netLohn, disposable: netLohn + kgM,
      regime: 'none', kinds: sv.map((s) => s.kind), zvE,
    };
    if (!h.transfers) return r;

    // --- Transfers ---
    const rentCold = Math.max(0, h.rentCold || 0), heat = Math.max(0, h.heat || 0);
    const kdu = rentCold + heat;
    const minors = kids.filter((a) => a < 18).length;
    const rbAdults = single ? P.rbSingle : 2 * P.rbPartner;
    const mb = single ? mehrbedarfAE(kids) * P.rbSingle : 0;
    const need = rbAdults + mb + kids.reduce((s, a) => s + childRB(a, P), 0) + kdu;
    const fb = adults.reduce((s, a) => s + sgb2Freibetrag(a.gross, minors > 0, P), 0);
    const incFB = Math.max(0, netLohn - fb);

    // Wohngeld-Einkommen: Brutto minus Werbungskosten, je 10 % fuer Steuer,
    // KV/PV und RV, soweit tatsaechlich gezahlt (§ 16 WoGG).
    let yYear = 0;
    adults.forEach((a, i) => {
      if (!(a.gross > 0)) return;
      const gy = 12 * a.gross;
      let pct = 0;
      if (sv[i].kind !== 'mini' && estEff > 0) pct += 0.10;
      if (sv[i].an.kv > 0) pct += 0.10;
      if (sv[i].an.rv > 0) pct += 0.10;
      yYear += Math.max(0, gy - Math.min(P.wgWK, gy)) * (1 - pct);
    });
    if (single && minors > 0) yYear -= P.wgFbAE;
    const wg = wohngeld(nA + nK, rentCold, Math.max(0, yYear) / 12, h.stufe || 4, P);

    // Kinderzuschlag, § 6a BKGG
    let kiz = 0;
    if (nK > 0 && grossM >= (single ? P.kizMinIncomeSingle : P.kizMinIncomeCouple)) {
      const share = (single ? P.kizShareSingle : P.kizShareCouple)[Math.min(nK, 10) - 1] / 100;
      const parentNeed = rbAdults + mb + share * kdu;
      kiz = Math.max(0, nK * P.kizMax - P.kizWithdraw * Math.max(0, incFB - parentNeed));
    }

    // Vorrang: Deckt Einkommen plus Wohngeld plus Kinderzuschlag den
    // SGB-II-Bedarf, gibt es diese beiden und keine Grundsicherung. Sonst
    // Grundsicherung, und Wohngeld wie Kinderzuschlag entfallen. Der erweiterte
    // Zugang (Luecke bis 100 Euro) fehlt mit Absicht: dort stellt die
    // Grundsicherung den Haushalt immer besser, und die Kurve zeigt das Geld.
    if (incFB + kgM + wg + kiz >= need) {
      r.wg = wg; r.kiz = kiz;
      r.regime = (wg > 0 || kiz > 0) ? 'wgkiz' : 'none';
    } else {
      r.gs = Math.max(0, need - incFB - kgM);
      r.regime = 'gs';
    }
    r.need = need;
    r.disposable = netLohn + kgM + r.gs + r.wg + r.kiz;
    return r;
  }

  globalThis.DeAbgaben = {
    PARAMS, P2026, estTarif, estSplit, soli, socialMonthly, vorsorgeYear,
    sgb2Freibetrag, mehrbedarfAE, wohngeld, household,
  };
})();
