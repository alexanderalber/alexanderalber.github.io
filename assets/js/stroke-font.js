/* stroke-font.js: a single-stroke font and its line layout, for lettering
   that is cut as grooves rather than filled as shapes. Used by the Trophy
   Sculptor (plinth engraving) and Print Nest (lid lettering).

   StrokeFont.glyph(ch) -> { w, strokes: [[x0, y0, x1, y1, ...], ...] }
   StrokeFont.layoutText(lines, k) -> { segs: [x1, y1, x2, y2, ...], bbox }
     in font units: capitals 21 high, baseline y = 0, LINE_PITCH 32 between
     lines, each line centred on x = 0; k narrows the letters (1: as drawn).
   Plain script: works in a page, in a worker via importScripts, and in Node
   via eval. */
(function (root) {
  'use strict';

  /* Hershey's Simplex, the single-stroke font A. V. Hershey drew at the US
     National Bureau of Standards in 1967, public domain. One string per
     ASCII character from 32 on: the first char is the advance, then pairs of
     (x, y) coded as char - 65 and char - 77, a space lifts the pen. Units:
     capitals are 21 high, the baseline is y = 0. A stroke font suits an
     engraving tool: every stroke is a groove, and a groove is what a V-cut
     turns into a printable channel. */
  var FONT = ["Q","KFbFT FOENFMGNFO","QEbE[ MbM[","VLfEF RfKF EYSY DSRS","UIfII MfMI R_PaMbIbFaD_D]E[FZHYNWPVQURSRPPNMMIMFNDP","YVbDM IbK`K^J\\H[F[D]D_EaGbIbKaN`Q`TaVb RTPSOQOOQMSMUNVPVRTTRT","[XYXZW[V[UZTXRSPPNNLMHMFNEODQDSEUFVMZN[O]O_NaLbJaI_I]JZLWQPSNUMWMXNXO","KF`EaFbGaG_F]E\\","OLfJdHaF]EXETFOHKJHLF","ODfFdHaJ]KXKTJOHKFHDF","QIbIV D_NY N_DY","[N_NM EVWV","KGNFMENFOGNGLFJEI","[EVWV","KFOENFMGNFO","WUfCF","UJbGaE^DYDVEQGNJMLMONQQRVRYQ^OaLbJb","UG^I_LbLM","UE]E^F`GaIbMbOaP`Q^Q\\PZNWDMRM","UFbQbKZNZPYQXRURSQPONLMIMFNEODQ","UNbDTST NbNM","UPbFbEYFZI[L[OZQXRURSQPONLMIMFNEODQ","UQ_PaMbKbHaF^EYETFPHNKMLMONQPRSRTQWOYLZKZHYFWET","URbHM DbRb","UIbFaE_E]F[HZLYOXQVRTRQQOPNMMIMFNEODQDTEVGXJYNZP[Q]Q_PaMbIb","UQ[PXNVKUJUGVEXD[D\\E_GaJbKbNaP_Q[QVPQNNKMIMFNEP","KF[EZFYGZF[ FOENFMGNFO","KF[EZFYGZF[ GNFMENFOGNGLFJEI","YU_EVUM","[EYWY ESWS","YE_UVEM","SD]D^E`FaHbLbNaO`P^P\\OZNYJWJT JOINJMKNJO","\\SZR\\P]M]K\\J[IXIUJSLRORQSRU M]K[JXJUKSLR S]RURSTRVRXTYWYYX\\W^U`SaPbMbJaH`F^E\\DYDVESFQHOJNMMPMSNUOVP T]SUSSTR","SJbBM JbRM ETOT","VEbEM EbNbQaR`S^S\\RZQYNX EXNXQWRVSTSQROQNNMEM","VS]R_PaNbJbHaF_E]DZDUERFPHNJMNMPNRPSR","VEbEM EbLbOaQ_R]SZSURRQPONLMEM","TEbEM EbRb EXMX EMRM","SEbEM EbRb EXMX","VS]R_PaNbJbHaF_E]DZDUERFPHNJMNMPNRPSRSU NUSU","WEbEM SbSM EXSX","IEbEM","QMbMRLOKNIMGMENDOCRCT","VEbEM SbET JYSM","REbEM EMQM","YEbEM EbMM UbMM UbUM","WEbEM EbSM SbSM","WJbHaF_E]DZDUERFPHNJMNMPNRPSRTUTZS]R_PaNbJb","VEbEM EbNbQaR`S^S[RYQXNWEW","WJbHaF_E]DZDUERFPHNJMNMPNRPSRTUTZS]R_PaNbJb MQSK","VEbEM EbNbQaR`S^S\\RZQYNXEX LXSM","UR_PaMbIbFaD_D]E[FZHYNWPVQURSRPPNMMIMFNDP","QIbIM BbPb","WEbESFPHNKMMMPNRPSSSb","SBbJM RbJM","YCbHM MbHM MbRM WbRM","UDbRM RbDM","SBbJXJM RbJX","URbDM DbRb DMRM","OEfEF FfFF EfLf EFLF","OAbOJ","OJfJF KfKF DfKf DFKF","QG\\I_K\\ DYI^NY I^IM","QAKQK","KGbFaE_E]F\\G]F^","TP[PM PXNZL[I[GZEXDUDSEPGNIMLMNNPP","TEbEM EXGZI[L[NZPXQUQSPPNNLMIMGNEP","SPXNZL[I[GZEXDUDSEPGNIMLMNNPP","TPbPM PXNZL[I[GZEXDUDSEPGNIMLMNNPP","SDUPUPWOYNZL[I[GZEXDUDSEPGNIMLMNNPP","MKbIbGaF^FM C[J[","TP[PKOHNGLFIFGG PXNZL[I[GZEXDUDSEPGNIMLMNNPP","TEbEM EWHZJ[M[OZPWPM","IDbEaFbEcDb E[EM","KFbGaHbGcFb G[GJFGDFBF","REbEM O[EQ IUPM","IEbEM","_E[EM EWHZJ[M[OZPWPM PWSZU[X[ZZ[W[M","TE[EM EWHZJ[M[OZPWPM","TI[GZEXDUDSEPGNIMLMNNPPQSQUPXNZL[I[","TE[EF EXGZI[L[NZPXQUQSPPNNLMIMGNEP","TP[PF PXNZL[I[GZEXDUDSEPGNIMLMNNPP","NE[EM EUFXHZJ[M[","ROXNZK[H[EZDXEVGULTNSOQOPNNKMHMENDP","MFbFQGNIMKM C[J[","TE[EQFNHMKMMNPQ P[PM","QC[IM O[IM","WD[HM L[HM L[PM T[PM","RD[OM O[DM","QC[IM O[IMGIEGCFBF","RO[DM D[O[ DMOM","OJfHeGdFbF`G^H]I[IYGW HeGcGaH_I^J\\JZIXEVITJRJPINHMGKGIHG GUISIQHOGNFLFJGHHGJF","IEfEF","OFfHeIdJbJ`I^H]G[GYIW HeIcIaH_G^F\\FZGXKVGTFRFPGNHMIKIIHG IUGSGQHOINJLJJIHHGFF","YDSDUEXGYIYKXOUQTSTUUVW DUEWGXIXKWOTQSSSUTVWVY"];
  var UMLAUT = { 'ä': 'a', 'ö': 'o', 'ü': 'u', 'Ä': 'A', 'Ö': 'O', 'Ü': 'U' };
  var SZ = [[5, 0, 5, 15, 6, 18, 8, 20, 10, 21, 12, 21, 14, 20, 15, 18, 15, 16, 14, 14, 11, 13, 14, 12, 16, 10, 16, 5, 15, 2, 13, 0, 10, 0, 8, 1]];

  function decodeGlyph(code) {
    var s = FONT[code - 32], strokes = [], cur = null;
    for (var i = 1; i < s.length;) {
      if (s[i] === ' ') { cur = null; i++; continue; }
      if (!cur) strokes.push(cur = []);
      cur.push(s.charCodeAt(i) - 65, s.charCodeAt(i + 1) - 77);
      i += 2;
    }
    return { w: s.charCodeAt(0) - 65, strokes: strokes };
  }
  function glyph(ch) {
    if (ch === 'ß') return { w: 20, strokes: SZ };
    if (UMLAUT[ch]) {
      var g = decodeGlyph(UMLAUT[ch].charCodeAt(0)), lo = 99, hi = -99, top = 0;
      g.strokes.forEach(function (st) {
        for (var i = 0; i < st.length; i += 2) { lo = Math.min(lo, st[i]); hi = Math.max(hi, st[i]); top = Math.max(top, st[i + 1]); }
      });
      var c = (lo + hi) / 2, y = top + 3;
      return { w: g.w, strokes: g.strokes.concat([[c - 3, y, c - 3, y + 1], [c + 3, y, c + 3, y + 1]]) };
    }
    var code = ch.charCodeAt(0);
    if (code >= 32 && code < 127) return decodeGlyph(code);
    var base = ch.normalize ? ch.normalize('NFD').replace(/[̀-ͯ]/g, '') : '';
    if (base.length === 1 && base.charCodeAt(0) >= 32 && base.charCodeAt(0) < 127) return decodeGlyph(base.charCodeAt(0));
    return decodeGlyph(63);  // '?'
  }

  var LINE_PITCH = 32;
  /* A glyph narrowed to share k of its width: the ink squeezes about its
     left edge and the bearings keep their width, because the gap between two
     letters has to hold a groove whatever the letters do. A word space has
     no ink and narrows as a whole. */
  function condense(g, k) {
    if (k === 1) return g;
    if (!g.strokes.length) return { w: g.w * k, strokes: [] };
    var lo = Infinity, hi = -Infinity;
    g.strokes.forEach(function (st) { for (var i = 0; i < st.length; i += 2) { lo = Math.min(lo, st[i]); hi = Math.max(hi, st[i]); } });
    return {
      w: g.w - (1 - k) * (hi - lo),
      strokes: g.strokes.map(function (st) { return st.map(function (c, i) { return i % 2 ? c : lo + k * (c - lo); }); })
    };
  }
  // lines of text -> segments [x1, y1, x2, y2, ...] in font units, each line centred on x = 0; k narrows the letters
  function layoutText(lines, k) {
    var segs = [], bb = [Infinity, Infinity, -Infinity, -Infinity];
    k = k == null ? 1 : k;
    lines.forEach(function (line, li) {
      var adv = 0, gl = Array.from(line).map(function (c) { var g = condense(glyph(c), k); adv += g.w; return g; });
      var x = -adv / 2, y0 = -li * LINE_PITCH;
      gl.forEach(function (g) {
        g.strokes.forEach(function (st) {
          for (var i = 0; i + 3 < st.length; i += 2) segs.push(x + st[i], y0 + st[i + 1], x + st[i + 2], y0 + st[i + 3]);
          for (var j = 0; j < st.length; j += 2) {
            bb[0] = Math.min(bb[0], x + st[j]); bb[2] = Math.max(bb[2], x + st[j]);
            bb[1] = Math.min(bb[1], y0 + st[j + 1]); bb[3] = Math.max(bb[3], y0 + st[j + 1]);
          }
        });
        x += g.w;
      });
    });
    return { segs: segs, bbox: bb };
  }

  root.StrokeFont = { glyph: glyph, layoutText: layoutText, condense: condense, LINE_PITCH: LINE_PITCH };
})(typeof self !== 'undefined' ? self : globalThis);
