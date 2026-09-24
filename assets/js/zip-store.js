/* zip-store.js: an uncompressed ("stored") ZIP archive from a list of files.
   For downloads that are several files at once, such as the bodies of a
   multi-part print. No deflate: the payloads here are meshes and images that
   compress poorly or are small, and a stored archive is a few dozen lines
   anyone can check against the spec (PKWARE APPNOTE 4.3, sections 4.3.7,
   4.3.12 and 4.3.16). File names are marked UTF-8 (general purpose bit 11).

   ZipStore.build([{ name, data: Uint8Array }], { date }) -> Uint8Array
   ZipStore.crc32(Uint8Array) -> unsigned 32 bit CRC (IEEE, as zip and PNG use) */
(function (root) {
  'use strict';
  var TABLE = null;
  function crc32(bytes) {
    if (!TABLE) {
      TABLE = new Uint32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        TABLE[n] = c >>> 0;
      }
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) crc = TABLE[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function utf8(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    return new Uint8Array(Buffer.from(s, 'utf8'));
  }

  // MS-DOS date and time as zip stores them, local time, two-second steps
  function dosTime(d) {
    var y = Math.max(1980, d.getFullYear());
    return {
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
      date: ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
    };
  }

  function build(files, opts) {
    var dt = dosTime((opts && opts.date) || new Date());
    var entries = files.map(function (f) {
      var data = f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data);
      return { name: utf8(f.name), data: data, crc: crc32(data) };
    });
    var size = 22;
    entries.forEach(function (e) { size += 30 + e.name.length + e.data.length + 46 + e.name.length; });
    var out = new Uint8Array(size), dv = new DataView(out.buffer), o = 0;
    function u16(v) { dv.setUint16(o, v, true); o += 2; }
    function u32(v) { dv.setUint32(o, v >>> 0, true); o += 4; }
    function common(e) {
      u16(20); u16(0x0800); u16(0); u16(dt.time); u16(dt.date);
      u32(e.crc); u32(e.data.length); u32(e.data.length); u16(e.name.length); u16(0);
    }
    entries.forEach(function (e) {
      e.offset = o;
      u32(0x04034b50); common(e);
      out.set(e.name, o); o += e.name.length;
      out.set(e.data, o); o += e.data.length;
    });
    var cd = o;
    entries.forEach(function (e) {
      u32(0x02014b50); u16(20); common(e);
      u16(0); u16(0); u16(0); u32(0); u32(e.offset);
      out.set(e.name, o); o += e.name.length;
    });
    var cdSize = o - cd;
    u32(0x06054b50); u16(0); u16(0); u16(entries.length); u16(entries.length); u32(cdSize); u32(cd); u16(0);
    return out;
  }

  var api = { build: build, crc32: crc32 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ZipStore = api;
})(typeof self !== 'undefined' ? self : this);
