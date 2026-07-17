# Pharmakokinetik-Parameter für ein Konzentrations-/Wirkungs-Visualisierungstool

## TL;DR
- Für ~11 der 18 Substanzen genügt ein **Ein-Kompartiment-Modell mit first-order Absorption** (single exponential rise/decay): MPH-IR, Amphetamin-IR, Levodopa-IR, Valproat-Standard, Levetiracetam-IR, Ibuprofen, Paracetamol-IR, Coffein sowie – mit sehr flacher Tageskurve bzw. nur im Steady State sinnvoll – Levothyroxin, Sertralin, Citalopram und Metoprolol-Tartrat.
- Für die **retardierten/biphasischen Formulierungen** (Medikinet retard 50:50, Equasym XL 30:70, Concerta 22:78 OROS, OxyContin, Adderall XR, ER-Formulierungen von Valproat/Levetiracetam/Metoprolol-Succinat, Melatonin-Retard, Paracetamol MR 31:69) brauchst du ein **Zwei-Phasen-Absorptionsmodell** (zwei ka bzw. IR-Bolus + verzögerte Phase); Concerta erfordert zusätzlich ein *aufsteigendes* Freisetzungsprofil, das mit einer einfachen Decay-Kurve nicht abbildbar ist.
- Bei **Stimulanzien und Levodopa** weicht die klinische Wirkung zeitlich von der Plasmakonzentration ab (Wirkverzögerung über ein Effekt-Kompartiment, akute Toleranz/Hysterese, aktive Metaboliten bei Lisdexamfetamin) – hier braucht das Tool ein separates Effekt-Kompartiment/PD-Layer; bei Insulin sind ohnehin nur Wirkprofile (Onset/Peak/Dauer), keine PK-Kurven, sinnvoll.

## Key Findings
Die 18 Substanzen lassen sich in drei Modellklassen einteilen, die die Tool-Architektur bestimmen:

1. **Klasse A – einfaches 1-Kompartiment-First-order-Modell** ausreichend (Plasma-PK ≈ Wirkung): MPH-IR, Amphetamin-IR, Levodopa-IR (nur PK), Valproat-Standard, Levetiracetam-IR, Ibuprofen, Paracetamol-IR, Coffein.
2. **Klasse B – biphasisches/Zwei-Phasen-Absorptionsmodell** nötig (IR-Fraktion + verzögerte Fraktion, jeweils eigene ka): alle retardierten MPH-Präparate, Adderall XR, OxyContin, Paracetamol MR, Melatonin-SR, ER-Valproat/-Levetiracetam/-Metoprolol.
3. **Klasse C – PK ≠ PD** (Effekt-Kompartiment/Hysterese/aktive Metaboliten/Steady-State-Akkumulation): Lisdexamfetamin (Prodrug), Levodopa (Hysterese, SDR/LDR), Insulin (Wirkprofil), SSRIs Sertralin/Citalopram (Mehrtages-Akkumulation), Levothyroxin (Steady State über Wochen).

---

## Details

### 1. Methylphenidat IR (Ritalin, Medikinet unretardiert)
- **ka / Absorptions-t½:** rasche Absorption, t½,abs < 0,5 h.
- **tmax:** ~1–2 h.
- **Elimination-t½:** ca. 2–3 h (racemisches MPH); d-MPH ~3,5 h.
- **F:** ~11–52 % mit hoher interindividueller Variabilität (First-pass); d-MPH deutlich höhere Bioverfügbarkeit als l-MPH; F steigt mit Nahrung.
- **Modell:** 1-Kompartiment mit first-order Absorption **ausreichend** (single exponential rise/decay; Bateman-Funktion).
- **PK vs. PD:** Wirkdauer ~2–4 h. Wichtig: **akute Toleranz** (Swanson et al. 1999, Clin Pharmacol Ther 66:295–305; doppelblinde Laborschul-Studie) – bei flachem Plasmaspiegel fällt die Wirkung über den Tag ab; die Wirkung ist von der Anstiegsgeschwindigkeit („rate of rise"/ramp) abhängig. Modellierter Toleranz-t½ (SKAMP-Aufmerksamkeit) ~54 min. Für einen einzelnen IR-Puls ist die Hysterese gering (Hysek/Liechti 2014, Int J Neuropsychopharmacol 17:371), bei eng aufeinanderfolgenden Dosen aber klinisch relevant.
- **Quellen:** FDA-Label MPH ER Chewable (NDA 207960); Swanson 1999; Sekundärübersicht (Wikipedia) für die F-Spanne.

### 2. Methylphenidat ER / biphasisch (Medikinet retard, Equasym XL)
- **Medikinet retard:** 50 % IR-Pellets + 50 % magensaftresistente ER-Pellets (Freisetzung erst bei pH > 5,5); Einnahme mit/nach dem Frühstück empfohlen → biphasisches Profil mit erhöhter Gesamtexposition. Zwei Peaks (Metadate-CD-Typ: ≈1,5 h und ≈4,5 h). Wirkdauer 7–8 h.
- **Equasym XL / Metadate CD:** 30 % IR + 70 % ER (Diffucaps-Technologie). Zwei Peaks: scharfer Anstieg ~1 h und zweiter Peak ~6 h post-dose. Wirkdauer ~8 h.
- **Ritalin LA:** 50:50 IR/ER (SODAS), zweite Dosis-Freisetzung ~4 h später.
- **Elimination-t½/F:** wie MPH-IR; die ER-Kinetik ist absorptionslimitiert („flip-flop").
- **Modell:** **Zwei-Phasen-Absorptionsmodell erforderlich** – Bolus 1 (IR-Fraktion, lag 0) + verzögerte first-order Phase (ER-Fraktion, lag ~3–4 h). Getrennte ka je Phase sind selten explizit publiziert; praktisch als zwei überlagerte Bateman-Terme mit gemeinsamer ke modellierbar; die zweite ka aus dem tmax der zweiten Phase ableiten.
- **Quellen:** Maldonado, Expert Opin Drug Metab Toxicol 2013;9(8) (Review PK/klinische Wirksamkeit neuer ER-MPH); PBPK-Modell Yang/Duan/Fisher, PMC5056674; systematischer Head-to-head-Review PMC3852277.

### 3. Methylphenidat OROS (Concerta) – osmotisches Pumpsystem
- **Freisetzung:** 22 % IR (wasserlösliche Außenschicht) + 78 % ER-Kern über OROS-Osmosepumpe. Wasser dringt durch die semipermeable Membran ein, das Push-Kompartiment quillt und drückt den Wirkstoff durch lasergebohrte Öffnungen → charakteristische **aufsteigende** Plasmakurve.
- **Kinetik (FDA-Label Concerta 021121s038, PK-Studie gesunder Erwachsener):** *„plasma methylphenidate concentrations reached an initial maximum concentration at about 1 hour, followed by gradual ascending concentrations over the next 5 to 9 hours, after which a gradual decrease begins. Mean times to reach peak plasma concentrations across all doses of CONCERTA occurred between 6 and 10 hours."* Mittlere Halbwertszeit ~3,6 h; 12 h Wirkdauer.
- **Biphasische Absorptions-t½:** initiale Anstiegsrate entspricht einer IR-Dosis, danach langsame, sogar zunehmende Freisetzung.
- **F:** MPH-typisch; relative BV 100 % vs. IR TID.
- **Modell:** **NICHT** als einfacher single-exponential rise/decay darstellbar. Erfordert IR-Bolus + zeitverzögertes, *ansteigendes* (zunehmendes Zero-Order-artiges) Freisetzungsprofil mit tmax 6–10 h. Standard-PBPK-Absorptionsmodelle konnten Concerta wegen des osmotischen Mechanismus nicht abbilden (Tablette wandert als Ganzes durch den GI-Trakt).
- **PK vs. PD:** Das aufsteigende Profil wurde bewusst designt, um akute Toleranz zu überwinden (Swanson 1999; Swanson et al. 2003, Arch Gen Psychiatry 60:46–63) – flacher Spiegel → nachlassende Wirkung; ansteigender Spiegel → gleichbleibende Nachmittagswirkung.
- **Quellen:** FDA-Label Concerta (021121s014, 021121s038); Swanson 2003; Bioäquivalenzstudie PMC4317218.

### 4. Lisdexamfetamin (Elvanse/Vyvanse) – Prodrug
- **Muttersubstanz LDX (inaktiv):** tmax ~1 h; sehr kurze t½ – Ermer et al. (PMC4823324): *„declined rapidly (mean elimination half-life [t½], 0,4–0,9 h)"* (In-vitro-Vollblut 1,13–1,36 h). Hydrolyse durch Erythrozyten (nicht CYP-abhängig) zu d-Amphetamin + L-Lysin.
- **Aktiver Metabolit d-Amphetamin:** Vyvanse-FDA-Label (021977): *„In 18 pediatric patients (aged 6 to 12) with ADHD, the Tmax of dextroamphetamine was approximately 3.5 hours following single-dose oral administration of lisdexamfetamine dimesylate either 30 mg, 50 mg, or 70 mg after an 8-hour overnight fast."* **t½ des d-Amphetamins ~8,6–15,0 h** (Ermer et al.: *„d-amphetamine was cleared more slowly (mean t½, 8.6–15.0 h)"*; häufig zusammengefasst als ~10 h). Steady State nach ~5 Tagen, keine Akkumulation.
- **F:** d-Amphetamin-Exposition dosisproportional; PK-Profil des Metaboliten ähnlich bei oraler, intranasaler und i.v. Gabe (ratenlimitierende Hydrolyse → geringere Missbrauchsanfälligkeit).
- **Wirkdauer:** Ermer et al.: *„The therapeutic action of LDX extends to at least 13 h post-dose in children and 14 h post-dose in adults, longer than that reported for any other long-acting formulation."*
- **Modell:** **Prodrug-Kettenmodell** – LDX (schnelle Absorption + schnelle Umwandlung) → d-Amphetamin (ratenlimitierte „Absorption" via Hydrolyse, dann lange Elimination). Das Tool sollte die **Metaboliten-Kurve** (tmax 3,5 h, t½ ~10 h) darstellen, nicht die LDX-Kurve.
- **Quellen:** FDA-Label Vyvanse (021977); Ermer et al., PMC4823324; Erythrozyten-Hydrolyse-Studie PMC4937656.

### 5. Amphetamin IR und XR (Dexamphetamin / Amphetaminsalze)
- **IR (Adderall):** Adderall-XR-FDA-Label (021303): *„Following administration of ADDERALL (immediate-release), the peak plasma concentrations occurred in about 3 hours."* Elimination-t½ d-Amphetamin ~10 h, l-Amphetamin ~13 h (Erwachsene). Salzverhältnis d:l = 3:1.
- **XR (Adderall XR):** Dual-bead 50:50, zweiter Peak simuliert IR-Dosis 4 h später. FDA-Label: *„The time to reach maximum plasma concentration (Tmax) for ADDERALL XR is about 7 hours, which is about 4 hours longer compared to ADDERALL (immediate-release)."* Zwei Peaks: ~1,5–3 h und ~6–7 h. Nahrung: *„Food does not affect the extent of absorption … but prolongs Tmax by 2.5 hours (from 5.2 hrs at fasted state to 7.7 hrs after a high-fat meal) for d-amphetamine."* Absolute BV nahezu vollständig.
- **Modell:** IR = 1-Kompartiment first-order ausreichend. XR = **Zwei-Phasen-Modell** (zwei IR-äquivalente Boli, lag 4 h).
- **PK vs. PD:** aktive Enantiomere; Harn-pH beeinflusst Elimination stark (saurer Harn → beschleunigte Clearance).
- **Quellen:** FDA-Label Adderall XR (021303s005/s026); RxList Adderall XR.

### 6. Levothyroxin (L-T4)
- **tmax:** ~2–3 h (euthyreot; bei Hypothyreose ~3 h); baseline-korrigiert median ~2,5 h.
- **Elimination-t½:** **~7 Tage (ca. 6–7,5 Tage; gemessen 172–205 h)**.
- **F:** ~70–80 % oral (nüchtern); reduziert durch Nahrung, Ca/Fe/Antazida, PPI. Absorption v.a. Jejunum/Ileum (OATP2B1).
- **Modell:** 1-Kompartiment first-order möglich, aber wegen der sehr langen t½ ist die **Tageskurve praktisch flach**; klinisch relevant ist nur der **Steady State** (erreicht nach ~4–6 Wochen). Endogene T4-Baseline muss abgezogen/berücksichtigt werden.
- **PK vs. PD:** Wirkung (TSH-Suppression) folgt den T4-Spiegeln mit Verzögerung von Wochen. Für ein Tagesverlaufs-Tool ist die Einzeldosis-Kurve nahezu irrelevant – Steady-State-Darstellung wählen.
- **Quellen:** „Administration and Pharmacokinetics of Levothyroxine" (NCBI Bookshelf NBK585644, *70 Years of Levothyroxine*, 2021); Tanguay et al. 2019, Clin Pharmacol Drug Dev 8:521.

### 7. Levodopa/Carbidopa (Standard und retardiert)
- **Levodopa allein:** t½ ~50 min. **Mit Carbidopa/Benserazid: t½ ~1,5 h** (präzise gemessen: 1,5 ± 0,19 h, Othman et al., LCIG-PK-Studie, PMC3675750).
- **tmax IR (Sinemet):** ~0,5 h. **F IR:** ~99 %.
- **CR/retard (Sinemet CR):** tmax ~2 h; **F nur ~70–75 %** der IR-Form (höhere Tagesdosen nötig); Freisetzung über 4–6 h; erratische, unvorhersehbare Absorption.
- **Rytary/Numient ER:** multipartikuläre Kapsel aus IR-Beads + SR-Beads.
- **Absorptionsbesonderheit:** enges **Absorptionsfenster** im oberen Dünndarm; sättigbarer LAT (großes-neutrale-Aminosäuren-Transporter), Konkurrenz mit Nahrungsproteinen; verzögerte Magenentleerung mindert Absorption.
- **Modell:** IR = 1-Kompartiment first-order. CR schwer modellierbar (erratisch – keine saubere geschlossene Formel).
- **PK vs. PD – kritisch, ausgeprägte Hysterese via Effekt-Kompartiment:**
  - Effekt-Kompartiment-Äquilibrations-t½: **173 min (mild, Hoehn&Yahr 1) → 43,3 min (schwer, H&Y 4)** (Triggs et al. 1996, Eur J Clin Pharmacol; NONMEM-Populationsmodell); 0,4–0,59 h für UPDRS-III/Tapping (Mao et al. 2013, J Clin Pharmacol); **ke0 ~1,37–1,80 h⁻¹** (Contreras et al. 2016, Eur J Clin Pharmacol; Mao 2013).
  - **EC50 (Tapping) ~1,5 µg/mL (1530–1590 ng/mL)**, steigt mit Krankheitsprogression (0,35 → 1,4 µg/mL, Triggs 1996); Emax ~93 Taps/min.
  - Contin et al. 1993/1994 (Neurology): Plasma-PK identisch zwischen stabilen und fluktuierenden Patienten, aber die **Äquilibrations-t½ ist bei Fluktuierenden ~5-fach kürzer** und korreliert mit der Dauer der Tapping-Antwort; EC50 steigt longitudinal.
  - **Kurzzeit-Antwort (SDR, t½ Minuten–Stunden)** vs. **Langzeit-Antwort (LDR, t½ Tage–Wochen)** (Nutt & Holford 1996, Ann Neurol 39:561); Chan/Nutt/Holford 2004 modellierten drei Effekt-Kompartimente (schnell/langsam/Dopa-Synthese).
  - **Wearing-off:** SDR verkürzt sich → Spiegel/Effekt-Site fällt vor der nächsten Dosis unter die motorische Schwelle. **On-off** durch Absorptions-/Transportschwankungen (Nutt et al. 1984, NEJM 310:483 – kontinuierliche i.v.-Infusion erzeugt stabilen Zustand; Proteinmahlzeiten heben Wirkung ohne Spiegelabfall auf). Fluktuierende Patienten brauchen ~2× höhere Konzentration für Effekt.
- **Quellen:** Othman et al. (PMC3675750); Contin et al. 1993/1994 Neurology; Triggs et al. 1996; Nutt et al. 1984/1987/1992; Mao et al. 2013.

### 8. Oxycodon IR und XR (OxyContin)
- **IR:** Absorptions-t½ ~0,4 h (monoexponentiell mit lag); tmax ~1–1,5 h; Elimination-t½ ~3,2 h.
- **XR (OxyContin) – publiziertes biphasisches Absorptionsmodell** (Mandema et al. 1996, Br J Clin Pharmacol; PMID 8971431 / PMC2042713): *„a rapid absorption component (t1/2abs = 37 min) accounting for 38% of the available dose and a slow absorption phase (t1/2abs = 6.2 h) accounting for 62% of the available dose."* Die Disposition ist ein **Ein-Kompartiment-Modell**, die IR-Lösung mono-exponentiell, die CR-Tablette bi-exponentiell absorbiert. (FDA-Label nennt alternativ zwei Absorptions-t½ von 0,6 h und 6,9 h.) Elimination-t½ ~4,5 h (XR).
- **F:** oral 60–87 % (niedriger First-pass); relative BV XR vs. IR = 100 %. Steady State 24–36 h, keine Akkumulation.
- **Modell:** IR = 1-Kompartiment mit mono-exponentieller Absorption. XR = **1-Kompartiment-Disposition + bi-exponentielle Absorption (38 %/62 %)** – direkt mit den publizierten Parametern umsetzbar.
- **PK vs. PD:** Analgesiebeginn <1 h (schnelle Phase); mediane Onset-Zeit ~46 min. Aktiver Metabolit Oxymorphon (quantitativ gering).
- **Quellen:** Mandema et al. 1996; FDA-Label OxyContin (020553s060); JPSM 1999 (S0885-3924(99)00079-2).

### 9. Valproat (Depakine) Standard und retardiert
- **Standard-Tabletten:** tmax ~1–2 h (Peak ~1 h); enteric-coated verzögert (lag ~2 h, Peak ~6 h).
- **Elimination-t½:** ~10–16 h (Monotherapie Erwachsene); 6–8 h bei enzyminduzierender Komedikation; kürzer bei Kindern.
- **F:** ~100 %, formulierungsunabhängig; Absorptions-t½ < 30 min bis 3–4 h je nach Präparat.
- **ER (Divalproex-ER / Depakine Chrono):** Freisetzung über > 18 h; geringe Peak-Trough-Fluktuation → beschrieben über eine **funktionelle t½ ~40 h** (nicht Elimination!) (Dutta et al., Medscape/Clin Pharmacokinet).
- **Besonderheit:** nicht-lineare (sättigbare) Plasmaproteinbindung → freie Fraktion steigt bei höheren Konzentrationen; Dosis-Konzentration curvilinear.
- **Modell:** Standard = 1-Kompartiment first-order ausreichend. ER = verlängerte Zero-/Mixed-Order-Absorption; für die Tageskurve am besten über funktionelle t½ / geglättetes Profil.
- **Quellen:** Zaccara et al. 1988, Clin Pharmacokinet 15:367; PK-Review Springer 1980; Levy/Nau (Einzeldosis-Formulierungsvergleich, PMID 6421770; monoexponentieller Abfall, terminale t½ 14,9 h).

### 10. Levetiracetam (Keppra) Standard und retardiert
- **IR:** tmax ~1 h; **Elimination-t½ ~6–8 h** (5 h bei Kindern; +2,5 h bei Älteren wegen reduzierter renaler Clearance). F ~92–100 % (nahezu vollständig, linear, nahrungsunabhängig).
- **XR (Keppra XR):** tmax ~4–4,5 h; bioäquivalent zu IR bzgl. AUC/Cmax; median tmax von 0,9 h (IR) auf 4 h (XR) verzögert; dosisproportional 1000–3000 mg.
- **Modell:** IR = 1-Kompartiment first-order ausreichend. XR = verlängerte first-order Absorption (kleineres ka) – **kein echtes biphasisches Profil nötig**, nur langsamere Absorption.
- **Besonderheit:** minimaler Metabolismus, überwiegend renale Elimination unveränderter Substanz; kaum Proteinbindung; keine aktiven Metaboliten.
- **Quellen:** FDA-Label Keppra (021035) und Keppra XR (022285s034); Rouits et al., Epilepsy Res 2009 (LEV XR PK, Bioäquivalenz/Food-Effect).

### 11. Insulin – schnell- vs. langwirkend (Zeit-Wirkungs-Profile, subkutan)
Hier ist das **Wirkprofil (glukosesenkend, PD)** relevant, nicht die Plasma-Insulin-PK; die publizierten Kurven sind Wirkkurven (Glukose-Clamp).
- **Schnellwirkende Analoga (Lispro/Aspart/Glulisin):** Onset 10–15 min; Peak ~1–3 h (bzw. 45–90 min); Dauer 3–5 h (dosisabhängig).
- **Normalinsulin (Regular):** Onset ~30–60 min; Peak 2–4 h; Dauer 5–8 h.
- **NPH:** Onset 1–2 h; Peak 4–12 h; Dauer 14–24 h.
- **Glargin U100 (Lantus/Basaglar):** Onset ~2–4 h; **kein ausgeprägter Peak**; Dauer bis 24 h. Glargin U300 (Toujeo): Onset ~6 h, Dauer bis 36 h.
- **Degludec (Tresiba):** flach, stabil; **Dauer > 42 h**; Plasma-t½ ~25 h (bildet subkutane Multi-Hexamer-Depots).
- **Detemir (Levemir):** Onset ~1 h; Dauer bis 24 h (dosisabhängig; Albuminbindung).
- **Modell:** Nicht mit klassischem oralem 1-Kompartiment-Schema darstellbar. Für das Tool als **Wirkprofil-Kurven** (Onset/Peak/Dauer) hinterlegen, kein PK-Rise/Decay.
- **Quellen:** Cleveland Clinic „Injectable Insulin" Chart; UCSF Diabetes Teaching Center; Tresiba SmPC; Medscape Insulin Types.

### 12. Melatonin IR vs. Retard
- **IR:** tmax ~0,75–0,9 h (15–90 min dosisabhängig); **Elimination-t½ ~0,75–1 h** (~45 min in mehreren Studien, z.B. Harpsøe et al. 2015). Sehr kurze Wirkung.
- **SR/Retard:** tmax ~1,26–1,5 h; **t½ ~5,1 h** (≈5-fach verlängert vs. IR); niedrigeres Cmax (Thanawala et al. 2024, Pharmaceutics 16:1248, Cross-over).
- **F:** niedrig und variabel (hoher First-pass).
- **Modell:** IR = 1-Kompartiment first-order, sehr steiler rise/decay. SR = verlängerte Absorption (flip-flop: ka < ke → apparente t½ absorptionsdominiert).
- **PK vs. PD (Timing):** Für den Schlaf ist das **Timing des Anstiegs** relevant – IR wirkt schnell auf die Einschlaflatenz, SR eher auf das Durchschlafen. Marker: 6-Sulfatoxymelatonin (6-SMT).
- **Quellen:** Thanawala et al. 2024; Harpsøe et al. 2015; Drugs R&D 2023 (PR-Tablette vs. IR-Spray, PMC10439092).

### 13. Ibuprofen
- **tmax:** ~1–2 h (nüchtern schneller). **Elimination-t½ ~2 h.**
- **F:** hoch (~90–100 %; relative BV ~96 %). Proteinbindung ~99 %; extensive Lebermetabolisierung zu inaktiven Metaboliten.
- **Modell:** 1-Kompartiment first-order **ausreichend**; klassischer single-exponential rise/decay.
- **PK vs. PD:** analgetische/antiphlogistische Wirkung folgt dem Plasmaspiegel eng; keine relevanten aktiven Metaboliten.
- **Quellen:** BMC Clin Pharmacol 2010;10:10 (FDC-Tablette); Biomed Pharmacol J 2021 (BE-Studie 400 mg).

### 14. Paracetamol (Standard und retardiert)
- **IR:** tmax ~0,5–1 h (0,94 h im Overdose-Modell); **Elimination-t½ ~1,5–2,5 h** (gemessen 1,65–1,69 h).
- **F:** hoch (~90 %+; relative BV ~94 %). Proteinbindung niedrig (~20 %).
- **MR (Panadol Extend/Osteo):** 665-mg-Bilayer-Tablette = **31 % IR + 69 % Slow-release** (Panadol Osteo: 33 % IR / 66 % SR); HPMC/PVP-Matrix. tmax verzögert ~2,8–2,9 h vs. ~0,9–1,4 h (IR); niedrigeres Cmax; Elimination-t½ unverändert (~1,65 h); Absorption nach ~4 h vollständig.
- **Modell:** IR = 1-Kompartiment first-order. MR = **Zwei-Phasen-Absorption (31 % IR + 69 % verzögert)** – direkt parametrisierbar.
- **Quellen:** Tan et al. 2006 & Chiew et al. 2010, Emerg Med Australas (Panadol Extend PK, Overdose-Modell); US-Patent 7,943,170 (Bilayer-Formulierung).

### 15. Coffein
- **tmax:** ~30–75 min (bis 2 h). **Elimination-t½ ~4–5 h** (Range 3–7 h; verlängert in Schwangerschaft [bis ~15 h], durch CYP1A2-Inhibitoren wie Fluvoxamin).
- **ka:** K01 ~0,33 min⁻¹; Absorption im Dünndarm; **F ~99 %** nach ~45 min, kein relevanter First-pass. Vd 0,5–0,75 L/kg; Proteinbindung 10–30 %.
- **Modell:** In der Literatur **explizit als offenes 1-Kompartiment-Modell mit first-order Absorption und first-order Elimination beschrieben** (Alsabri et al. 2018, J Caffeine Adenosine Res) – idealer single-exponential rise/decay.
- **PK vs. PD:** Wirkung folgt dem Spiegel eng; Metabolit Paraxanthin teils aktiv.
- **Quellen:** Alsabri et al. 2018; Blanchard & Sawers 1983, Eur J Clin Pharmacol (absolute BV).

### 16. Sertralin (SSRI) – Steady-State-Akkumulation
- **tmax:** ~4,5–8,4 h (mit Nahrung ~5,5 h). **Elimination-t½ ~26 h** (Range 22–36 h).
- **F:** oral (absolut nicht etabliert; Tablette ≈ Lösung). Extensiver First-pass.
- **Akkumulation:** **~2-fach; Steady State nach ~1 Woche** einmal täglicher Gabe (FDA-Label Zoloft: *„approximately two-fold accumulation up to steady-state concentrations, which are achieved after one week of once-daily dosing"*).
- **Aktiver Metabolit:** N-Desmethylsertralin, t½ 62–104 h, deutlich schwächer wirksam, akkumuliert stärker als die Muttersubstanz (5–9-fache Zunahme Tag 1 → Tag 14).
- **Modell:** Für den Tagesverlauf **nicht** die akute Einzeldosiskurve, sondern **Multi-Dose-Akkumulation über Tage** darstellen (1-Kompartiment first-order mit Superposition über ~1 Woche). Klinischer Effekt tritt erst nach ~2 Wochen ein; keine belastbare PK-Wirk-Korrelation (kein Routine-TDM).
- **Quellen:** FDA-Label Zoloft (019839s080); DeVane et al. 2002, Clin Pharmacokinet 41 (Clinical PK of Sertraline).

### 17. Citalopram (SSRI) – gleiche Fragestellung
- **tmax:** ~4 h (40-mg-Tablette; Kapsel ~3,5 h). **Elimination-t½ ~35 h** (24–48 h; verlängert bei Älteren, Leberinsuffizienz, CYP2C19-Poor-Metabolizern; Leberinsuffizienz: t½ verdoppelt, Clearance −37 %).
- **F:** ~80 % (absolut, vs. i.v.); nahrungsunabhängig. Proteinbindung ~80 %; Vd ~12 L/kg.
- **Akkumulation:** Steady State nach ~1 Woche; **~2,5-fache Akkumulation** vs. Einzeldosis. Linear/dosisproportional 10–60 mg/Tag.
- **Metaboliten:** Demethyl- (DCT) und Didemethylcitalopram (DDCT), klinisch wenig aktiv.
- **Modell:** wie Sertralin – Mehrtages-Akkumulationskurve (1-Kompartiment first-order mit Superposition). Keine akute Wirk-Korrelation.
- **Quellen:** FDA-Label Celexa (020822s052); StatPearls Citalopram (NBK482222); PharmGKB PMC3349993.

### 18. Metoprolol Standard (Tartrat) und retardiert (Succinat)
- **Tartrat (IR):** tmax ~1–2 h; **Elimination-t½ ~3–5 h**; **F ~50 %** (hoher First-pass, CYP2D6-Polymorphismus). Peak i.v. 2–3 min.
- **Succinat ER (Toprol-XL / Beloc-ZOK / Selo-Zok):** CR/ZOK = mehrere hundert membranumhüllte Pellets, jede Mikrokapsel setzt ~konstant über ~20 h frei (pH-/nahrungsunabhängig). **F ~77 %** relativ zu konventionellem Metoprolol (FDA-Label Succinat ER); BV der CR-Form um ~20–30 % reduziert vs. konventioneller Tablette. Niedrigere Peaks, 3–4× höhere Talspiegel, gleichmäßige β1-Blockade über 24 h.
- **Modell:** Tartrat = 1-Kompartiment first-order ausreichend. Succinat ER = verlängerte (nahezu Zero-Order) Absorption über ~20 h. CYP2D6-Polymorphismus → große interindividuelle Variabilität.
- **PK vs. PD:** β1-Blockade (Herzfrequenzsenkung) korreliert besser mit dem gleichmäßigen ER-Profil als mit Peak-Spiegeln; die Wirkung überdauert den Plasmaspiegel (Rezeptorkinetik).
- **Quellen:** FDA-Label Metoprolol Succinate ER (019962s032/s036); Sandberg et al. 1990, J Clin Pharmacol 30:S2 (CR/ZOK-Review); Wikstrand et al. 2003, J Cardiovasc Pharmacol 41:151.

---

## Recommendations

**Modellarchitektur für das Tool – dreistufig implementieren:**

**1. Klasse A – einfaches 1-Kompartiment, first-order Absorption + Elimination.**
Substanzen: MPH-IR, Amphetamin-IR, Levodopa-IR (PK-Layer), Ibuprofen, Paracetamol-IR, Coffein, Levetiracetam-IR, Valproat-Standard.
Parameter je Substanz: ka (aus t½,abs = ln2/ka), ke (aus Elimination-t½), F, tmax. Nutze die Bateman-Funktion:
C(t) = (F·Dose·ka)/(V·(ka−ke)) · (e^(−ke·t) − e^(−ka·t)).

**2. Klasse B – Zwei-Phasen-/biphasische Absorption.**
Zwei überlagerte Bateman-Terme mit Fraktionsgewichten:
- Medikinet retard: 50 % (ka schnell, lag 0) + 50 % (ka langsam, lag ~3–4 h).
- Equasym XL/Metadate CD: 30 % + 70 % (zweiter Peak ~6 h).
- Adderall XR: 50 % + 50 % (lag 4 h; Gesamt-tmax ~7 h).
- **OxyContin: 38 % (t½,abs 37 min) + 62 % (t½,abs 6,2 h)** – beste publizierte Parameter, direkt verwendbar.
- Paracetamol MR: 31 % + 69 % (tmax der SR-Phase ~2,8 h).
- Melatonin SR, Valproat-ER, Levetiracetam-XR, Metoprolol-Succinat: als verlängerte first-order Absorption (kleines ka) oder zweiphasig.
- **Concerta (Sonderfall):** IR-Bolus 22 % + *ansteigende* Freisetzung 78 % mit tmax 6–10 h; modelliere die ER-Phase als ansteigende (zunehmende) Zero-Order-Rate oder empirische aufsteigende Funktion, **nicht** als einfachen Decay.

**3. Klasse C – PK ≠ PD (Effekt-Kompartiment/aktiver Metabolit/Akkumulation):**
- **Lisdexamfetamin:** Prodrug-Kette → zeige die d-Amphetamin-Kurve (tmax 3,5 h, t½ ~10 h), nicht die LDX-Kurve.
- **Levodopa:** ergänze ein Effekt-Kompartiment (ke0 ~1,4–1,8 h⁻¹, Äquilibrations-t½ 43–173 min je nach Schwere), EC50 ~1,5 µg/mL, Emax-Hill-Funktion; SDR vs. LDR als getrennte Layer; motorische Schwelle für Wearing-off/On-off.
- **Stimulanzien allgemein:** optionaler akuter-Toleranz-Term (Swanson 1999; Toleranz-t½ ~54 min) für Mehrfachdosen und zur Rechtfertigung der Concerta-Aufstiegskurve.
- **Insulin:** hinterlege Wirkprofile (Onset/Peak/Dauer), keine PK-Kurve.
- **SSRIs (Sertralin, Citalopram):** zeige **Mehrtages-Akkumulation** (Superposition bis Steady State nach ~1 Woche), nicht die akute Tageskurve.
- **Levothyroxin:** zeige Steady State / flache Kurve, nicht die Einzeldosis.

**Benchmarks/Schwellen, die die Empfehlung ändern:** Wenn du nur *qualitative* Kurvenformen brauchst, genügt für alle ER-Präparate ein zweiphasiges Absorptionsmodell. Wenn *quantitative* Genauigkeit gefragt ist (z.B. Cmax-Vorhersage einzelner Formulierungen), nutze für Concerta und Levodopa-CR publizierte PBPK-/populationskinetische Modelle statt geschlossener Bateman-Formeln. Wenn Nutzer Nahrungseffekte visualisieren wollen, hinterlege für Adderall XR, Medikinet retard und Levodopa separate „fed/fasted"-Parameter.

## Caveats
- **F-Werte für MPH** (11–52 %) stammen teils aus Sekundärquellen mit großer Spannbreite; für exakte Werte primäre Bioäquivalenzstudien konsultieren.
- **MPH-IR Elimination-t½** wird in FDA-Vergleichsstudien teils niedrig/verzerrt angegeben (methodisch durch den ER-Vergleich bedingt); Standardwert 2–3 h (racemisch), ~3,5 h (d-MPH).
- **Hysterese-Richtung bei MPH:** Swanson 1999 spricht im Modell wörtlich von „counterclockwise hysteresis", während die akute-Toleranz-Phänomenologie sonst als „clockwise" bezeichnet wird – echte Terminologie-Inkonsistenz in der Literatur; in einem Einzeldosis-Erwachsenen-Setting zeigte MPH kaum Hysterese (Hysek/Liechti 2014).
- **d-Amphetamin-t½ nach LDX** wird mit großer Spanne angegeben (8,6–15,0 h, Ermer et al.); der oft zitierte „~10 h"-Wert ist eine Mittelung.
- **Levodopa-CR und Concerta** sind mit geschlossenen Bateman-Formeln nicht sauber abbildbar (erratische bzw. osmotische Freisetzung).
- **Insulin-, SSRI- und Levothyroxin-Kurven** gehören nicht in ein akutes Tagesverlaufs-PK-Schema – separat behandeln (Wirkprofil bzw. Steady State/Akkumulation).
- Viele **retardierte MPH-Parameter** (getrennte ka je Phase) sind nicht als explizite Zahlen publiziert, sondern nur als Freisetzungsanteile + Peak-Zeiten; die zweite ka muss aus dem tmax der zweiten Phase abgeleitet werden.
- Einige Angaben (Insulin-Profile, MPH-Wirkdauer, F-Spannen) stammen aus klinischen Übersichten/Herstellerangaben, nicht aus einzelnen peer-reviewten PK-Studien – für regulatorisch belastbare Werte SmPC/FDA-Label als Primärquelle verwenden.
- **Valproat funktionelle t½ (~40 h)** ist ausdrücklich *keine* Eliminations-t½, sondern ein Steady-State-Fluktuationsmaß – nicht in ein Einzeldosis-Decay-Modell übernehmen.