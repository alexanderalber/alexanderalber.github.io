const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const total = ch4 + c2h4 + c2h6;
    if (total <= 0) throw new Error("Invalid gas concentrations: total must be greater than 0.");
    const ch4Rel = (ch4 / total) * 100;
    const c2h4Rel = (c2h4 / total) * 100;
    const c2h6Rel = (c2h6 / total) * 100;

    if (c2h6Rel >= 98) return "DT";
    if (c2h6Rel >= 70 && c2h4Rel <= 15) return "T1";
    if (c2h4Rel >= 20 && ch4Rel <= 15) return "T2";
    if (ch4Rel >= 50 && c2h4Rel >= 15) return "T3";
    if (c2h6Rel >= 40 && c2h4Rel > 15 && c2h4Rel <= 40) return "D1";
    if (c2h4Rel > 40) return "D2";

    return "ND"; // Not Defined, fallback
  },
  
  render(svg, sample) {
    const NS = "http://www.w3.org/2000/svg";

    // Create polygon background
    const zones = [
      { points: "300,20 20,520 580,520", fill: "#FFFFFF", label: null }, // Default triangle
      { points: "300,20 300,220 580,520", fill: "#d9d9f3", label: "T3" },
      { points: "300,20 300,220 20,520", fill: "#b3ffcc", label: "T2" },
    let svgBoundary zones folder moving zones x axis renderSamplelogic normalises Dup innerquery 
 fixedpoint corrections zones relay DupTriangle corrected rest points step through full.
 corrected   helperform calculations d subaxectionclearfix relay completionappenditional missingdefinition duplex helperlocations 
 resetadditional internalvalues.

 Points here and examples relatums <clear.
