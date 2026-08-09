/* canvas-text.js -- shared canvas text engine for the alber.me image tools.
 *
 * Everything needed to put a block of text onto a 2D canvas the way the meme
 * and image tools want it:
 *   - wrap(measure, text, maxWidth, size)   greedy word wrap over an injected
 *                                           measuring function
 *   - autoFit(measure, text, box, opts)     largest font size whose wrapped
 *                                           text still fits a box (bisection)
 *   - layout(ctx, spec)                     resolved lines, size and baselines
 *   - draw(ctx, spec)                       shadow / outline / fill three-pass
 *   - ensureFonts(list)                     wait for webfonts before drawing
 *
 * The measuring function is injected rather than taken from a canvas so the
 * geometry is testable under Node: measure(text, size) -> width in px.
 *
 * Plain script, no DOM at module scope, no imports, no async: it must run in
 * the page and under Node (evaluated by the test suite). Everything is
 * attached to globalThis.CanvasText.
 */
(function () {
  "use strict";

  var DEFAULT_LINE_HEIGHT = 1.2;
  var DEFAULT_RELATIVE = {
    outline: 0.055,   // outline half-width as a fraction of the font size
    shadowBlur: 0.12,
    shadowDx: 0.035,
    shadowDy: 0.035
  };

  /* ---------- font strings ---------- */

  /* font = {family, weight, style}; size in px -> a CSS font shorthand.
     Order matters: style, weight, size, family. */
  function fontString(font, size) {
    var f = font || {};
    var parts = [];
    if (f.style && f.style !== "normal") parts.push(f.style);
    if (f.weight && String(f.weight) !== "400") parts.push(String(f.weight));
    parts.push(Math.max(1, size) + "px");
    parts.push(f.family || "sans-serif");
    return parts.join(" ");
  }

  /* A measure function bound to a canvas context and a font. Reassigning
     ctx.font is cheap; measureText is the expensive part either way. */
  function measurer(ctx, font) {
    return function (text, size) {
      ctx.font = fontString(font, size);
      return ctx.measureText(text).width;
    };
  }

  /* ---------- wrapping ---------- */

  /* Break a single word that is wider than maxWidth into chunks of whatever
     still fits. Always emits at least one character per chunk, otherwise a
     box narrower than one glyph would loop forever. */
  function breakWord(measure, word, maxWidth, size) {
    var out = [], cur = "";
    for (var i = 0; i < word.length; i++) {
      var next = cur + word[i];
      if (cur && measure(next, size) > maxWidth) {
        out.push(cur);
        cur = word[i];
      } else {
        cur = next;
      }
    }
    if (cur) out.push(cur);
    return out;
  }

  /* Greedy word wrap. Explicit newlines are hard breaks and are preserved,
     including empty lines. Returns an array of lines (never empty). */
  function wrap(measure, text, maxWidth, size) {
    var src = String(text == null ? "" : text);
    var paragraphs = src.split("\n");
    if (!(maxWidth > 0)) return paragraphs;

    var lines = [];
    for (var p = 0; p < paragraphs.length; p++) {
      var para = paragraphs[p].replace(/^ +| +$/g, "");
      if (para === "") { lines.push(""); continue; }
      var words = para.split(/ +/);
      var cur = "";
      for (var w = 0; w < words.length; w++) {
        var word = words[w];
        var candidate = cur ? cur + " " + word : word;
        if (measure(candidate, size) <= maxWidth) { cur = candidate; continue; }
        if (cur) { lines.push(cur); cur = ""; }
        if (measure(word, size) <= maxWidth) {
          cur = word;
        } else {
          var chunks = breakWord(measure, word, maxWidth, size);
          for (var c = 0; c < chunks.length - 1; c++) lines.push(chunks[c]);
          cur = chunks[chunks.length - 1];
        }
      }
      lines.push(cur);
    }
    return lines.length ? lines : [""];
  }

  function linesWidth(measure, lines, size) {
    var max = 0;
    for (var i = 0; i < lines.length; i++) {
      var w = measure(lines[i], size);
      if (w > max) max = w;
    }
    return max;
  }

  /* ---------- auto sizing ---------- */

  /* Largest integer size in [min, max] whose wrapped text fits box {w, h}.
     Bisection: fitting is monotone in the size for any sane font, and where
     hinting makes it locally non-monotone the result is off by a pixel, which
     nobody can see. Returns the min size if nothing fits, so a caller always
     gets something drawable. */
  function autoFit(measure, text, box, opts) {
    var o = opts || {};
    var lineHeight = o.lineHeight || DEFAULT_LINE_HEIGHT;
    var min = Math.max(1, Math.floor(o.min == null ? 8 : o.min));
    var max = Math.max(min, Math.floor(o.max == null ? 512 : o.max));
    var maxLines = o.maxLines || 0;
    var doWrap = o.wrap === false ? false : true;
    var boxW = box && box.w > 0 ? box.w : 0;
    var boxH = box && box.h > 0 ? box.h : Infinity;

    function linesAt(size) {
      return doWrap ? wrap(measure, text, boxW, size) : String(text == null ? "" : text).split("\n");
    }
    function fits(size) {
      var lines = linesAt(size);
      if (maxLines && lines.length > maxLines) return false;
      if (lines.length * size * lineHeight > boxH) return false;
      if (boxW > 0 && linesWidth(measure, lines, size) > boxW) return false;
      return true;
    }

    if (fits(max)) return { size: max, lines: linesAt(max) };
    var lo = min, hi = max;
    while (lo < hi) {
      var mid = Math.ceil((lo + hi) / 2);
      if (fits(mid)) lo = mid; else hi = mid - 1;
    }
    return { size: lo, lines: linesAt(lo) };
  }

  /* ---------- layout ---------- */

  function resolveRelative(spec, size) {
    var rel = spec.relative || DEFAULT_RELATIVE;
    return function (value, key) {
      if (value !== "auto") return value;
      var r = rel[key];
      if (r == null) r = DEFAULT_RELATIVE[key];
      return size * (r || 0);
    };
  }

  /* spec:
       text        string (may contain \n)
       font        {family, weight, style}
       size        number | 'auto'
       min/max     bounds for 'auto'
       wrap        bool (default true when a box is given, false for an anchor)
       uppercase   bool
       lineHeight  multiple of the size, default 1.2
       box         {x, y, w, h}   -- text is laid out inside this rectangle
       anchor      {x, y}         -- alternative: single point, no wrapping box
       align       'left' | 'center' | 'right'   (horizontal, default center)
       valign      'top' | 'middle' | 'bottom'   (only with box, default middle)

     Returns {size, lines, lineHeight, x, y, width, height, align} where y is
     the top of the first line (ctx.textBaseline is 'top'). */
  function layout(ctx, spec) {
    var font = spec.font || {};
    var measure = measurer(ctx, font);
    var text = String(spec.text == null ? "" : spec.text);
    if (spec.uppercase) text = text.toUpperCase();

    var box = spec.box || null;
    var lineHeight = spec.lineHeight || DEFAULT_LINE_HEIGHT;
    var doWrap = spec.wrap == null ? !!box : !!spec.wrap;
    var size, lines;

    if (spec.size === "auto") {
      var fit = autoFit(measure, text, box || { w: 0, h: Infinity }, {
        lineHeight: lineHeight,
        min: spec.min, max: spec.max, maxLines: spec.maxLines, wrap: doWrap
      });
      size = fit.size; lines = fit.lines;
    } else {
      size = Math.max(1, spec.size || 16);
      lines = doWrap && box ? wrap(measure, text, box.w, size) : text.split("\n");
    }

    var width = linesWidth(measure, lines, size);
    var step = size * lineHeight;
    var height = lines.length * step;
    var align = spec.align || (box ? "center" : "left");

    var x, y;
    if (box) {
      x = align === "left" ? box.x : align === "right" ? box.x + box.w : box.x + box.w / 2;
      var valign = spec.valign || "middle";
      y = valign === "top" ? box.y
        : valign === "bottom" ? box.y + box.h - height
        : box.y + (box.h - height) / 2;
    } else {
      var a = spec.anchor || { x: 0, y: 0 };
      x = a.x; y = a.y;
    }

    return {
      size: size, lines: lines, lineHeight: lineHeight, step: step,
      x: x, y: y, width: width, height: height, align: align
    };
  }

  /* ---------- drawing ---------- */

  function eachLine(ctx, L, method) {
    for (var i = 0; i < L.lines.length; i++) {
      ctx[method](L.lines[i], L.x, L.y + i * L.step);
    }
  }

  /* Shadow, then outline, then fill. The stroke uses lineWidth = w * 2 so that
     w is the visible half sitting outside the glyph, and lineJoin 'round' so
     sharp corners do not grow spikes at large outline widths. */
  function draw(ctx, spec) {
    var L = spec.layout || layout(ctx, spec);
    var rel = resolveRelative(spec, L.size);
    var shadow = spec.shadow || {};
    var outline = spec.outline || {};

    ctx.save();
    ctx.font = fontString(spec.font, L.size);
    ctx.textBaseline = "top";
    ctx.textAlign = L.align;
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;

    if (shadow.on) {
      ctx.save();
      ctx.shadowColor = shadow.color || "rgba(0,0,0,0.6)";
      ctx.shadowBlur = rel(shadow.blur == null ? "auto" : shadow.blur, "shadowBlur");
      ctx.shadowOffsetX = rel(shadow.dx == null ? "auto" : shadow.dx, "shadowDx");
      ctx.shadowOffsetY = rel(shadow.dy == null ? "auto" : shadow.dy, "shadowDy");
      ctx.fillStyle = spec.color || "#fff";
      eachLine(ctx, L, "fillText");
      ctx.restore();
    }

    if (outline.on) {
      var ow = rel(outline.w == null ? "auto" : outline.w, "outline");
      if (ow > 0) {
        ctx.strokeStyle = outline.color || "#000";
        ctx.lineWidth = ow * 2;
        eachLine(ctx, L, "strokeText");
      }
    }

    ctx.fillStyle = spec.color || "#fff";
    eachLine(ctx, L, "fillText");
    ctx.restore();
    return L;
  }

  /* ---------- webfont loading ---------- */

  /* Canvas does not participate in font-display: if the face is not loaded
     when fillText runs, the frame is silently drawn in the fallback and never
     repainted. So every first draw has to wait on this.
     list: [{family, weight, size}] -- size only matters for the load hint. */
  function ensureFonts(list) {
    if (typeof document === "undefined" || !document.fonts) return Promise.resolve(false);
    var jobs = (list || []).map(function (f) {
      return document.fonts.load(fontString(f, f.size || 64), "Ag").catch(function () { return null; });
    });
    return Promise.all(jobs)
      .then(function () { return document.fonts.ready; })
      .then(function () { return true; })
      .catch(function () { return false; });
  }

  var CanvasText = {
    fontString: fontString,
    measurer: measurer,
    wrap: wrap,
    breakWord: breakWord,
    linesWidth: linesWidth,
    autoFit: autoFit,
    layout: layout,
    draw: draw,
    ensureFonts: ensureFonts,
    DEFAULT_LINE_HEIGHT: DEFAULT_LINE_HEIGHT,
    DEFAULT_RELATIVE: DEFAULT_RELATIVE
  };

  if (typeof globalThis !== "undefined") globalThis.CanvasText = CanvasText;
  if (typeof module !== "undefined" && module.exports) module.exports = CanvasText;
})();
