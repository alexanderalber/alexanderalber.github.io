/* hikyaku-flight.js -- hybrid flight physics for the Hikyaku courier.
 *
 * sixdof.js is a spaceship: no gravity, no air, no mass, every thruster as
 * strong as every other. Hikyaku keeps that 6DOF control scheme and gives the
 * attitude a meaning again (notes/tools/hikyaku/HANDOFF.md, section 2):
 *
 *   - gravity acts in the world, along world -y;
 *   - the thrust budget is set per body axis AND sign (strong lift fans,
 *     equal lateral and fore/aft fans, reversed fans in between), plus the
 *     old sixdof main engine as a boost along the nose (off by default since
 *     2026-10-26, the forward fans took over its job); defaults in ISO;
 *   - a switchable flight assist cancels gravity out of whatever budget the
 *     current attitude offers, and the pilot gets the rest;
 *   - drag is F = 1/2 rho c_d A(v) |v|^2 with A taken exactly from the convex
 *     collision hull by Cauchy's projection formula, mixed toward the
 *     isotropic mean (ISO.dragMix): flat into the wind is still the better
 *     air brake and nose first the arrow, but sideways flight no longer
 *     collapses;
 *   - an optional, weak drag torque about the centre of pressure.
 *
 * Built on top of SixDOF (a global, assets/js/sixdof.js must load first) and
 * deliberately additive: sixdof.js stays untouched, so asteroid-corridor and
 * spaceship-6dof keep flying exactly as before.
 *
 * Units are SI throughout: metres, seconds, kilograms, radians. Body frame as
 * in sixdof: nose at -z, +x starboard, +y up, origin at the centre of mass.
 * Mass finally matters here, because drag does not scale with it. Thrust is
 * still specified as an acceleration (m/s^2), so the mass only enters through
 * drag. Inertia I is SPECIFIC (per unit mass, m^2), exactly as in sixdof, so
 * every torque handed to SixDOF.rk4 is a specific torque (m^2/s^2).
 *
 * Pure functions, no DOM, no three.js, no React. Tested by
 * notes/dev/hikyaku-flight.test.mjs, which evaluates this file as a string.
 */
var HikyakuFlight = (function () {
  'use strict';

  var SD = globalThis.SixDOF;
  if (!SD) throw new Error('hikyaku-flight.js needs SixDOF (assets/js/sixdof.js) loaded first');
  var add = SD.add, sub = SD.sub, mul = SD.mul, dot = SD.dot, cross = SD.cross, len = SD.len;
  var qRot = SD.qRot, qConj = SD.qConj;

  var G0 = 9.81;          /* standard gravity, m/s^2 */
  var RHO = 1.225;        /* sea-level air density, kg/m^3 */

  /* ---- ISO: the isotropy knobs (owner feedback 2026-10-26, point 9) -----
     Before this set the craft was strongly anisotropic: 1 g sideways and
     backwards against 3 g up, a drag area that varied 7.4 : 1 between nose
     first and belly first, and rotation authority from 1.0 (yaw) to 3.0
     (roll). Everything below is a default of makeCraft. hikyaku.html passes
     its own budget and rotation values from its DEF and the stored config,
     so a change here reaches the page only where the page does not override
     it (today: dragMix, dragKeepNose and vNose).

     Second round, same day (owner, point 18): the boost is gone. On the
     Space Mouse it sat on a button, and pressing it meant taking the hand
     off the cap. Forward gets more acceleration instead, and the top speed
     is set by the drag (vNose), not by the thrust.

       xp xn zp     lateral and aft fans, g each way. Equal, so the craft
                    translates the same sideways and backwards.
       zn           forward fans, g. The strongest horizontal channel, for
                    the punch out of a corner; it no longer sets the top
                    speed, vNose does.
       yp           lift fans, g. Stays the strongest: with gravity on the
                    lift fans carry the hover, and yp - 1 g is the climb.
       yn           reversed fans, g. Raised to 2 so an inverted hover keeps
                    a full g of reserve.
       boost        main engine, g, on top of zn. 0 since point 18; the
                    channel stays for callers that still pass aBoost.
       pitch yaw roll  rotation authority, rad/s^2. Pitch and yaw equal, roll
                    slightly faster (the axis a pilot corrects most).
       dragMix      0 = drag area exactly the Cauchy area of the hull,
                    1 = the same area in every direction. In between the
                    area is (1 - k) A_hull(d) + k A_mean, with A_mean the
                    mean silhouette over all directions (Cauchy: surface/4).
       dragKeepNose rescale the mixed area so the nose-first area stays the
                    hull's. That keeps the nose-first top speed a function
                    of zn alone and makes dragMix move only the OTHER
                    directions: sideways and belly first get less drag.
                    Only used when vNose is 0.
       vNose        nose-first top speed at full forward thrust, m/s. The
                    whole (mixed) area is scaled so that
                    1/2 rho c_d A_nose vNose^2 = m zn. The shape of A(d) is
                    untouched, so every other top speed scales with it:
                    v(d) = vNose sqrt(a(d) / zn * A_nose / A(d)). 75 m/s sits
                    at the upper end of what the tightest route curve
                    (137 m) allows at full thrust (67 to 74 m/s), so the
                    pilot eases off there and nowhere else. A forward budget
                    slider on the page then changes the punch, not the top
                    speed. */
  var ISO = {
    xp: 1.6, xn: 1.6, zp: 1.6, zn: 2.5, yp: 3.0, yn: 2.0, boost: 0,
    pitch: 2.0, yaw: 2.0, roll: 2.5,
    dragMix: 0.5, dragKeepNose: true, vNose: 75
  };

  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
  function num(x, d) { return typeof x === 'number' && isFinite(x) ? x : d; }

  /* ---- hull preprocessing ----------------------------------------------
     Input: a closed convex triangle hull { verts, faces } in the body frame.
     Winding is checked, not trusted: a negative enclosed volume means the
     faces point inwards and every one of them is flipped, the same rule
     SixDOF.buildHull uses. Degenerate triangles (zero area) are dropped, they
     carry no normal and contribute nothing to any of the sums below.

     Per face: unit outward normal n, area A, centroid c. The identity
     sum(n_i A_i) = 0 holds for every closed surface, and it is what makes
     the windward sum below equal the projected area. */
  function prepHull(h) {
    var verts = h.verts, faces = h.faces, i, k;
    var vol = 0, i0;
    for (i = 0; i < faces.length; i++) {
      var f0 = faces[i];
      vol += dot(verts[f0[0]], cross(verts[f0[1]], verts[f0[2]])) / 6;
    }
    var flip = vol < 0;
    var n = [], area = [], cen = [], fs = [], total = 0;
    var cv = [0, 0, 0];
    for (i = 0; i < faces.length; i++) {
      var f = flip ? [faces[i][0], faces[i][2], faces[i][1]] : faces[i];
      var a = verts[f[0]], b = verts[f[1]], c = verts[f[2]];
      var nn = cross(sub(b, a), sub(c, a));
      var l = len(nn);
      var tv = dot(a, cross(b, c)) / 6;
      cv = add(cv, mul(add(add(a, b), c), tv / 4));
      if (!(l > 1e-12)) continue;
      fs.push(f);
      n.push(mul(nn, 1 / l));
      area.push(l / 2);
      cen.push(mul(add(add(a, b), c), 1 / 3));
      total += l / 2;
    }
    vol = Math.abs(vol);
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (i = 0; i < verts.length; i++) {
      for (k = 0; k < 3; k++) {
        if (verts[i][k] < lo[k]) lo[k] = verts[i][k];
        if (verts[i][k] > hi[k]) hi[k] = verts[i][k];
      }
    }
    i0 = vol > 1e-12 ? 1 / vol : 0;
    return {
      verts: verts, faces: fs, n: n, area: area, c: cen,
      surface: total, volume: vol,
      centroid: mul(cv, i0),   /* volume centroid; ~0 for a hull already on its centre of mass */
      min: lo, max: hi, extent: sub(hi, lo)
    };
  }

  /* ---- projected area, Cauchy ------------------------------------------
     For a convex body, every line along d crosses the surface exactly twice,
     once going in and once going out, so the silhouette area is half the sum
     of all face areas projected onto the plane normal to d:
       A(d) = 1/2 sum |n_i . d| A_i.
     Exact for a convex hull, continuous in d, symmetric under d -> -d. For a
     non-convex hull it over-counts (lines cross four times or more), which is
     why the drag uses the convex COLLISION hull, never the visual mesh.
     d is a unit vector in the body frame. */
  function projectedArea(hull, d) {
    var s = 0;
    for (var i = 0; i < hull.n.length; i++) s += Math.abs(dot(hull.n[i], d)) * hull.area[i];
    return 0.5 * s;
  }

  /* Windward half of the same sum, and the centre of pressure with it. The
     faces the air hits are those whose outward normal faces INTO the oncoming
     flow. With v the body velocity relative to the air, the flow comes from
     the +v side, so a face is windward when n . v > 0. Its weight
     (n . v) A is its projected area, and because sum(n_i A_i) = 0 the windward
     weights add up to exactly A(v): the leeward half carries the other copy.
     The centre of pressure is the weight-averaged face centroid. That is the
     Newtonian (flat-plate) picture, crude but cheap and smooth in v. */
  /* The drag area actually used, with the ISO mix (see the top of the file).
     p carries dragMix and dragScale (makeCraft sets both); without them the
     area is the plain Cauchy area. Returns the total area and the hull part
     alone, already scaled, because only the hull part has a centre of
     pressure off the centre of mass. */
  function mixArea(hull, aHull, p) {
    var k = clamp(num(p && p.dragMix, 0), 0, 1), sc = num(p && p.dragScale, 1);
    var hullPart = sc * (1 - k) * aHull;
    return { area: hullPart + sc * k * hull.surface / 4, hullPart: hullPart };
  }
  /* The same for a craft and any body direction d (need not be unit). */
  function dragArea(craft, d) {
    return mixArea(craft.hull, projectedArea(craft.hull, mul(d, 1 / len(d))), craft).area;
  }

  function windward(hull, d) {
    var w = 0, cp = [0, 0, 0];
    for (var i = 0; i < hull.n.length; i++) {
      var k = dot(hull.n[i], d);
      if (k <= 0) continue;
      var wi = k * hull.area[i];
      w += wi;
      cp[0] += wi * hull.c[i][0]; cp[1] += wi * hull.c[i][1]; cp[2] += wi * hull.c[i][2];
    }
    return { area: w, cp: w > 0 ? mul(cp, 1 / w) : [0, 0, 0] };
  }

  /* ---- drag -------------------------------------------------------------
     F = -1/2 rho c_d A(v_hat) |v| v, world frame, v relative to the air
     (env.wind is the air velocity in the world, default still air).
     Returns
       F   force, newtons, world frame
       Fb  the same force in body axes
       torque  r_cp x Fb, N m, body frame, already scaled by dragTorque
       T   torque / mass, the SPECIFIC torque SixDOF.rk4 expects
       area, cp, speed, decel (|F|/m, m/s^2)
     At rest (|v| < 1e-9 m/s) everything is zero and the direction is left
     undefined rather than divided by zero.

     dragTorque scales the moment, 0 = off, 1 = the full flat-plate value.
     The default is 0.3: the Newtonian centre-of-pressure model is the
     crudest part of this file (it ignores flow separation entirely, and on a
     box it is exactly neutral), so at full strength it would claim a
     precision the model does not have. At 0.3 the weathervane effect is felt
     at speed without ever out-muscling the pilot's own torque authority.

     With the ISO mix the area is split in two: the hull part keeps its
     centre of pressure, the isotropic part acts like a sphere about the
     centre of mass and carries no moment. So dragMix 0.5 also halves the
     weathervane and the flat-plate pitch-up (times dragScale). */
  function drag(hull, s, env, params) {
    var e = env || {}, p = params || {};
    var rho = num(e.rho, num(p.rho, RHO)), cd = num(p.cd, 0.9), m = num(p.mass, 3000);
    var kT = num(p.dragTorque, 0.3);
    var wind = e.wind || [0, 0, 0];
    var vr = sub(s.v, wind);
    var u = len(vr);
    var zero = { F: [0, 0, 0], Fb: [0, 0, 0], torque: [0, 0, 0], T: [0, 0, 0],
      area: 0, cp: [0, 0, 0], speed: u, decel: 0 };
    if (!(u > 1e-9)) {
      zero.area = mixArea(hull, projectedArea(hull, [0, 0, -1]), p).area;   /* readout only: nose first */
      return zero;
    }
    var qc = qConj(s.q);
    var dB = mul(qRot(qc, vr), 1 / u);
    var ww = windward(hull, dB);
    var mx = mixArea(hull, ww.area, p);              /* ww.area equals projectedArea(hull, dB) */
    var A = mx.area;
    var mag = 0.5 * rho * cd * A * u * u;
    var Fb = mul(dB, -mag);
    var torque = mul(cross(ww.cp, mul(dB, -0.5 * rho * cd * mx.hullPart * u * u)), kT);
    return {
      F: mul(vr, -mag / u), Fb: Fb, torque: torque, T: mul(torque, 1 / m),
      area: A, cp: ww.cp, speed: u, decel: mag / m
    };
  }

  /* ---- thrust budget ----------------------------------------------------
     Budget in m/s^2 per body axis and sign:
       xp starboard, xn port, yp up (lift fans), yn down (reversed fans),
       zp aft (+z), zn forward (-z, towards the nose),
     plus aBoost, the sixdof main engine, forward only.
     cmd has the shape of SixDOF.wrench's: right (+x), up (+y), fwd (+ is
     towards the nose, -z), each -1..1, main 0..1, pitch/yaw/roll -1..1.

     Channels are numbered by axis, the command for axis i is c[i], and the
     z command is -fwd because fwd points along -z. */
  var DEF_BUDGET = { xp: ISO.xp * G0, xn: ISO.xn * G0, yp: ISO.yp * G0, yn: ISO.yn * G0, zp: ISO.zp * G0, zn: ISO.zn * G0 };
  function caps(b) { return { p: [b.xp, b.yp, b.zp], n: [b.xn, b.yn, b.zn] }; }
  function cmdVec(cmd) {
    return [clamp(num(cmd.right, 0), -1, 1), clamp(num(cmd.up, 0), -1, 1), -clamp(num(cmd.fwd, 0), -1, 1)];
  }

  /* ---- flight assist ----------------------------------------------------
     Frame maths. Gravity is g = (0, -g, 0) in the WORLD. To hover, thrust
     must supply the opposite, +g y_hat, also in the world. q rotates body to
     world, so the same vector in BODY axes is
       need = q^-1 (0, g, 0) q = qRot(qConj(q), [0, g, 0]).
     Upright that is (0, g, 0): all on the lift fans. Inverted it is
     (0, -g, 0): all on the weaker reversed fans. Nose up it is (0, 0, -g):
     on the forward thrusters. Banked by phi it splits into g sin(phi) on x and
     g cos(phi) on y.
     Each component is then clamped to the budget of ITS sign. The forward
     channel overflows into the boost engine, because the boost is just a
     bigger forward thruster (with the ISO budget the forward fans alone hold
     a nose-up hover; the overflow matters for weaker forward budgets). Whatever cannot be covered is missing, the craft
     sinks by that much, and info.saturated says so.

     The pilot then flies on what is LEFT. Per axis the net thrust is one
     number in [-cap_n, +cap_p] (reversible fans), and with the assist holding
     u, the command c in [-1, 1] interpolates from u to the edge:
       c >= 0: u + c (cap_p - u),    c < 0: u + c (cap_n + u).
     Full up on an upright hover therefore gives exactly cap_p, a net climb of
     yp - g, and full down gives -cap_n, a dive at g + yn: gravity as tactics.
     With the assist off u = 0 and the same formula is plain c times the
     budget of c's sign. */
  function assist(craft, q, g) {
    var need = qRot(qConj(q), [0, g, 0]);
    var cp = caps(craft.budget), u = [0, 0, 0], miss = 0;
    for (var i = 0; i < 3; i++) {
      u[i] = need[i] >= 0 ? Math.min(need[i], cp.p[i]) : Math.max(need[i], -cp.n[i]);
    }
    var boost = 0;
    if (need[2] < -cp.n[2]) boost = Math.min(-need[2] - cp.n[2], craft.aBoost);
    var got = [u[0], u[1], u[2] - boost];
    miss = len(sub(need, got));
    return { need: need, u: u, boost: boost, missing: miss, saturated: miss > 1e-6 * Math.max(1, g) };
  }

  /* Body-frame thrust acceleration for a command, on top of an optional
     assist hold (the result of assist()). Also the pilot torque, through
     SixDOF.wrench so the rotation channels stay exactly the old ones. */
  function thrust(cmd, craft, hold) {
    var c = cmdVec(cmd || {}), cp = caps(craft.budget);
    var u = hold ? hold.u : [0, 0, 0], b0 = hold ? hold.boost : 0;
    var a = [0, 0, 0];
    for (var i = 0; i < 3; i++) {
      a[i] = c[i] >= 0 ? u[i] + c[i] * (cp.p[i] - u[i]) : u[i] + c[i] * (cp.n[i] + u[i]);
    }
    var main = clamp(num(cmd && cmd.main, 0), 0, 1);
    var boost = b0 + main * (craft.aBoost - b0);
    a[2] -= boost;
    var rc = {
      right: 0, up: 0, fwd: 0, main: 0,
      pitch: clamp(num(cmd && cmd.pitch, 0), -1, 1),
      yaw: clamp(num(cmd && cmd.yaw, 0), -1, 1),
      roll: clamp(num(cmd && cmd.roll, 0), -1, 1)
    };
    var T = SD.wrench(rc, { aLat: 0, aFwd: 0, aPitch: craft.aPitch, aYaw: craft.aYaw, aRoll: craft.aRoll, I: craft.I }).T;
    return { a: a, T: T, boost: boost };
  }

  /* ---- craft ------------------------------------------------------------
     Defaults: budget, boost and rotational authority from ISO at the top of
     the file (until 2026-10-26: yp 3 g, yn 1.5 g, x and z 1 g each way,
     boost 2 g, pitch 1.5, yaw 1.0, roll 3.0 rad/s^2); mass 3000 kg;
     cd 0.9 (middle of the 0.8 to 1.0 range); rho 1.225; dragTorque 0.3;
     assist on. rateDamp is SixDOF.dampTorque's gain, 0 off.
     dragMix, vNose and dragKeepNose (defaults from ISO) set the drag area;
     makeCraft turns them into dragScale. vNose 0 falls back to
     dragKeepNose; a craft without air (rho or cd 0) gets scale 1.
     Inertia: I given wins (specific moments, [pitch x, yaw y, roll z]). Else
     a given hull is principalized (recentred on its centre of mass, rotated
     onto its principal axes) and I is taken from it. With neither, the hull
     is the 15 x 8.5 x 2.7 m box and I follows the courier's ratios
     roll:pitch:yaw = 0.24 : 0.80 : 1.00 at a yaw moment of 25 m^2, which is
     what that box itself gives (24.8 m^2). */
  var COURIER_RATIO = [0.80, 1.00, 0.24];
  function makeCraft(o) {
    o = o || {};
    var hullIn = o.hull, I = o.I ? o.I.slice() : null, verts, faces;
    if (!hullIn) {
      var bx = SD.buildHull('box', 15, 8.5, 2.7);
      verts = bx.verts; faces = bx.faces;
      if (!I) I = [COURIER_RATIO[0] * 25, COURIER_RATIO[1] * 25, COURIER_RATIO[2] * 25];
    } else {
      verts = hullIn.verts; faces = hullIn.faces;
      if (!I) {
        var pr = SD.principalize(verts, faces);
        verts = pr.verts; I = pr.I;
      }
    }
    var b = {}, k;
    for (k in DEF_BUDGET) b[k] = num(o.budget && o.budget[k], DEF_BUDGET[k]);
    var hull = hullIn && hullIn.n && o.I ? hullIn : prepHull({ verts: verts, faces: faces });
    /* dragScale. The mixed nose-first area is (1 - k) A_nose + k A_mean.
       With vNose it is scaled to the area that balances full forward thrust
       at vNose; else, with dragKeepNose, back to the hull's A_nose. */
    var mix = clamp(num(o.dragMix, ISO.dragMix), 0, 1);
    var keep = o.dragKeepNose == null ? ISO.dragKeepNose : !!o.dragKeepNose;
    var vNose = Math.max(0, num(o.vNose, ISO.vNose));
    var mass = num(o.mass, 3000), cd = num(o.cd, 0.9), rho = num(o.rho, RHO);
    var aNose = projectedArea(hull, [0, 0, -1]);
    var aMix = (1 - mix) * aNose + mix * hull.surface / 4;
    var scale = 1;
    if (aMix > 0 && vNose > 0 && rho * cd > 0 && b.zn > 0) scale = 2 * mass * b.zn / (rho * cd * vNose * vNose) / aMix;
    else if (aMix > 0 && keep) scale = aNose / aMix;
    return {
      hull: hull,
      mass: mass, I: I, budget: b,
      aBoost: num(o.aBoost, ISO.boost * G0),
      aPitch: num(o.aPitch, ISO.pitch), aYaw: num(o.aYaw, ISO.yaw), aRoll: num(o.aRoll, ISO.roll),
      dragMix: mix, dragScale: scale, vNose: vNose,
      cd: cd, rho: rho,
      assist: o.assist == null ? true : !!o.assist,
      dragTorque: clamp(num(o.dragTorque, 0.3), 0, 1),
      rateDamp: num(o.rateDamp, 0)
    };
  }

  /* ---- one evaluation ---------------------------------------------------
     a      world acceleration: gravity + rotated thrust + drag / mass
     aBody  the same in body axes. SixDOF.rk4 takes its a in BODY axes (it
            rotates a by the state's q itself), so this is the one to feed it:
            SixDOF.rk4(s, aBody, T, craft.I, dt). step() below does better.
     T      specific body torque: pilot + drag torque (+ rate damping)
     info   HUD readouts. info.fwdUse is the share of the forward capacity
            (zn + aBoost) the thrust uses right now, pilot and assist
            together, 0..1: what the rear nozzle glow follows. */
  function accel(craft, s, cmd, env) {
    var e = env || {};
    var g = num(e.g, G0);
    var hold = craft.assist ? assist(craft, s.q, g) : null;
    var th = thrust(cmd || {}, craft, hold);
    var dr = drag(craft.hull, s, e, craft);
    var aW = add(add([0, -g, 0], qRot(s.q, th.a)), mul(dr.F, 1 / craft.mass));
    var T = add(th.T, dr.T);
    if (craft.rateDamp > 0) T = add(T, SD.dampTorque(s.w, cmd || {}, craft, craft.rateDamp));

    var cp = caps(craft.budget), use = {}, reserve = {}, names = ['x', 'y', 'z'];
    for (var i = 0; i < 3; i++) {
      var ui = hold ? hold.u[i] : 0;
      use[names[i] + 'p'] = ui > 0 ? ui / cp.p[i] : 0;
      use[names[i] + 'n'] = ui < 0 ? -ui / cp.n[i] : 0;
      reserve[names[i] + 'p'] = cp.p[i] - ui;          /* m/s^2 the pilot can still add on +axis */
      reserve[names[i] + 'n'] = cp.n[i] + ui;          /* ... and on -axis */
    }
    var fwdCap = craft.budget.zn + craft.aBoost;
    use.boost = hold && craft.aBoost > 0 ? hold.boost / craft.aBoost : 0;
    reserve.boost = craft.aBoost - (hold ? hold.boost : 0);
    return {
      a: aW, aBody: qRot(qConj(s.q), aW), T: T,
      thrustBody: th.a, gravity: g, dragAccel: mul(dr.F, 1 / craft.mass),
      info: {
        airspeed: dr.speed, area: dr.area,
        dragDecel: dr.decel, cp: dr.cp, dragTorque: dr.torque,
        assist: !!hold, assistUse: use, reserve: reserve,
        saturated: hold ? hold.saturated : false, missing: hold ? hold.missing : 0,
        fwdUse: fwdCap > 0 ? clamp(-th.a[2] / fwdCap, 0, 1) : 0
      }
    };
  }

  /* ---- integration ------------------------------------------------------
     Split per substep h:
       rotation    SixDOF.rk4 on Euler's equation with the torque from the
                   start of the substep (the translation part of that call is
                   discarded);
       translation semi-implicit in the drag. Drag is -k u v_rel with
                   k = rho c_d A / (2 m) and u = |v_rel|; freezing k u at the
                   start of the substep and solving the rest implicitly gives
                     v_rel' = (v_rel + h a0) / (1 + h k u),
                   a0 = gravity + thrust. Its fixed point is exactly
                   k u v_rel = a0, i.e. the true terminal velocity, at any h,
                   and the factor 1 / (1 + h k u) never overshoots, so the
                   speed cannot oscillate about terminal however coarse the
                   frame. Position takes the trapezoid of the two velocities,
                   which is exact for constant acceleration, so a drag-free
                   ballistic arc conserves energy to round-off.
     At least two substeps, and never longer than 1/120 s. */
  function step(craft, s, cmd, env, dt, nSub) {
    var e = env || {};
    var n = Math.max(nSub || 2, Math.ceil(dt * 120 - 1e-9));
    var h = dt / n, info = null;
    var wind = e.wind || [0, 0, 0];
    var cur = { p: s.p.slice(), v: s.v.slice(), q: s.q.slice(), w: s.w.slice() };
    for (var i = 0; i < n; i++) {
      var r = accel(craft, cur, cmd, e);
      info = r.info;
      var rot = SD.rk4(cur, [0, 0, 0], r.T, craft.I, h);   /* q renormalized inside */
      var a0 = sub(r.a, r.dragAccel);
      var vr = sub(cur.v, wind);
      var u = len(vr);
      var ku = u > 1e-9 ? 0.5 * num(e.rho, craft.rho) * craft.cd * r.info.area * u / craft.mass : 0;
      var vrN = mul(add(vr, mul(a0, h)), 1 / (1 + h * ku));
      var vN = add(vrN, wind);
      cur = {
        p: add(cur.p, mul(add(cur.v, vN), h / 2)),
        v: vN, q: SD.qNorm(rot.q), w: rot.w
      };
    }
    return { state: cur, info: info };
  }

  /* ---- analytic helpers -------------------------------------------------
     Equilibrium speed when a constant acceleration a (m/s^2) pushes the
     craft along the body direction dir: 1/2 rho c_d A(dir) v^2 = m a. */
  function terminalSpeed(craft, dir, a, rho) {
    var A = dragArea(craft, dir);
    var r = num(rho, craft.rho);
    if (!(A > 0) || !(a > 0)) return a > 0 ? Infinity : 0;
    return Math.sqrt(2 * craft.mass * a / (r * craft.cd * A));
  }

  /* The three numbers of the handoff, for the HUD and the tuning page:
     nose first at full forward RCS, nose first at full RCS plus boost (the
     same number while aBoost is 0), and a flat (belly down) fall with no
     thrust at all. Since the ISO round also sideways (full starboard RCS)
     and backwards (full aft RCS). */
  function speeds(craft, g) {
    var gg = num(g, G0);
    return {
      noseFirst: terminalSpeed(craft, [0, 0, -1], craft.budget.zn),
      boost: terminalSpeed(craft, [0, 0, -1], craft.budget.zn + craft.aBoost),
      flatFall: terminalSpeed(craft, [0, -1, 0], gg),
      side: terminalSpeed(craft, [1, 0, 0], craft.budget.xp),
      back: terminalSpeed(craft, [0, 0, 1], craft.budget.zp)
    };
  }

  return {
    G0: G0, RHO: RHO, ISO: ISO, DEF_BUDGET: DEF_BUDGET, COURIER_RATIO: COURIER_RATIO,
    prepHull: prepHull, projectedArea: projectedArea, dragArea: dragArea, windward: windward, drag: drag,
    assist: assist, thrust: thrust, makeCraft: makeCraft,
    accel: accel, step: step, terminalSpeed: terminalSpeed, speeds: speeds
  };
})();
if (typeof globalThis !== 'undefined') globalThis.HikyakuFlight = HikyakuFlight;
