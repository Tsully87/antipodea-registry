// =====================================================================
//  ANTIPODEA WEATHER v2  (Foundry VTT v13 script macro, GM only)
//  Reads the date from Seasons & Stars and rolls weather for each
//  Antipodea zone from real climate averages, now with:
//    - weather systems that last several days and travel between zones
//      (cyclones, monsoon bursts, heatwaves, cold fronts, east coast lows)
//    - floods that build up from days of heavy rain and drain away slowly
//    - bushfires that can break out on bad fire days, burn for days and
//      send smoke to neighbouring zones
//    - severity levels: Category 1-5 cyclones, bushfire size (grass fire to
//      firestorm), and levels for east coast lows, monsoons, fronts and cold snaps
//    - Mount Kahikatea ("Old Grumbler") on Tōtara Ridge, Pōhutukawa Isle:
//      random tremors, steam, ash puffs and unrest alerts, plus eruptions the
//      GM triggers (Minor, Moderate or Major) with ash drifting downwind
//    - earthquakes: small ones roll on their own (most on the Kiwi isles),
//      strong and severe ones only when the GM triggers them, with aftershocks,
//      tsunami warnings and a link to Mount Kahikatea
//    - emergency alerts that pop up on players' Pokémon Phones in that zone
//    - a 7-day forecast that gets less reliable the further out it goes
//  Outputs: scene weather effect, Foundry chat, Discord, and the
//  Pokémon Phone Weather app.
//  Same zone + same date always gives the same weather, and a forecast
//  issued on a given day is always the same, so re-running is safe.
// =====================================================================

// ---- SETTINGS: edit these ------------------------------------------
const DISCORD_WEBHOOK = ""; // paste your Discord webhook URL between the quotes
const DISCORD_NAME = "Antipodea Weather Service";
const TEMP_SWING = 3;        // how wild day-to-day temps get (degrees C)
const REROLL_SALT = "";      // change to any text to get a fresh set of rolls
const FORECAST_DAYS = 7;     // how many days ahead the forecast goes (max 7)

// What happens AUTOMATICALLY when the day ticks over (via VTT Hook Macros)
const AUTO_SCENES = true;    // update weather on every scene you've assigned a zone to
const AUTO_CHAT = true;      // post the day's weather in Foundry chat
const AUTO_DISCORD = true;   // send the day's weather to Discord
const AUTO_REGION = true;    // true = all 12 zones as one bulletin, false = only zones your scenes use
const AUTO_FORECAST = true;  // add the 7-day forecast to the daily post
// --------------------------------------------------------------------

// Monthly values Jan..Dec: hi/lo in C, rd = rain days per month,
// mm = average rain on a wet day, floodAt = how much recent rain it takes to flood,
// smokeTo = zones that get smoke when a bushfire burns here
const ZONES = {
  "top-end": {
    name: "The Big Wet",
    hi: [32, 31, 32, 33, 32, 31, 31, 31, 33, 33, 33, 33],
    lo: [25, 25, 25, 24, 22, 20, 19, 20, 23, 25, 25, 25],
    rd: [20, 19, 18, 7, 2, 1, 0.5, 1, 1, 5, 11, 16],
    mm: [15, 15, 13, 6, 4, 3, 3, 3, 5, 7, 10, 13],
    tropical: true, storms: [10, 11, 12, 1, 2, 3, 4], fire: true, wind: 0,
    floodAt: 160, smokeTo: ["outback"]
  },
  "far-north": {
    name: "Rainforest Reach",
    hi: [32, 31, 31, 29, 28, 26, 26, 27, 28, 30, 31, 31],
    lo: [24, 24, 23, 22, 20, 18, 17, 17, 19, 21, 22, 23],
    rd: [15, 16, 17, 12, 9, 5, 4, 3, 3, 4, 6, 10],
    mm: [22, 23, 21, 12, 7, 5, 4, 4, 4, 6, 10, 15],
    tropical: true, storms: [11, 12, 1, 2, 3], fire: false, wind: 0.5,
    floodAt: 200, smokeTo: []
  },
  "subtropical": {
    name: "Bunya Coast",
    hi: [30, 30, 29, 27, 24, 22, 22, 23, 25, 27, 28, 29],
    lo: [22, 21, 20, 17, 14, 11, 10, 11, 14, 16, 18, 20],
    rd: [11, 11, 11, 8, 7, 6, 5, 4, 5, 7, 8, 10],
    mm: [14, 15, 13, 10, 9, 9, 8, 7, 7, 9, 10, 13],
    storms: [10, 11, 12, 1, 2, 3], fire: true, wind: 0, fog: true,
    floodAt: 95, smokeTo: ["temperate-east"]
  },
  "temperate-east": {
    name: "Waratah Coast",
    hi: [27, 26, 25, 23, 20, 18, 17, 19, 21, 23, 24, 26],
    lo: [20, 20, 19, 16, 13, 10, 9, 10, 12, 14, 16, 18],
    rd: [8, 9, 10, 8, 8, 9, 6, 6, 6, 7, 8, 8],
    mm: [12, 13, 13, 12, 11, 13, 9, 9, 8, 9, 10, 9],
    storms: [11, 12, 1, 2], fire: true, wind: 0.3, fog: true,
    floodAt: 110, smokeTo: ["subtropical"]
  },
  "southern-coast": {
    name: "Gumleaf Coast",
    hi: [26, 26, 24, 21, 17, 15, 14, 15, 17, 20, 22, 24],
    lo: [15, 15, 14, 11, 9, 7, 6, 7, 8, 10, 11, 13],
    rd: [6, 5, 6, 7, 9, 9, 10, 10, 10, 9, 8, 7],
    mm: [8, 8, 7, 8, 6, 6, 5, 5, 6, 7, 8, 8],
    storms: [11, 12, 1], fire: true, wind: 0.6, fog: true,
    floodAt: 70, smokeTo: ["alpine", "tasmania"]
  },
  "west": {
    name: "Banksia Coast",
    hi: [32, 32, 30, 26, 22, 19, 18, 19, 20, 23, 27, 29],
    lo: [18, 18, 17, 14, 11, 9, 8, 8, 9, 11, 14, 16],
    rd: [1, 1, 2, 4, 8, 11, 13, 11, 9, 5, 3, 1],
    mm: [8, 8, 7, 7, 10, 10, 9, 9, 7, 6, 6, 6],
    storms: [], fire: true, wind: 0.6,
    floodAt: 80, smokeTo: ["southern-coast"]
  },
  "outback": {
    name: "The Red Heart",
    hi: [36, 35, 33, 28, 23, 20, 20, 23, 28, 31, 34, 35],
    lo: [22, 21, 18, 13, 8, 5, 4, 6, 10, 14, 18, 20],
    rd: [4, 4, 3, 2, 2, 2, 1, 1, 2, 3, 4, 4],
    mm: [10, 11, 10, 7, 8, 7, 6, 4, 4, 6, 8, 9],
    storms: [11, 12, 1, 2], fire: true, dust: true, wind: 0.3,
    floodAt: 50, smokeTo: ["subtropical", "temperate-east"]
  },
  "alpine": {
    name: "Snowgum High Country",
    hi: [21, 21, 18, 14, 10, 6, 5, 6, 9, 12, 15, 18],
    lo: [6, 6, 4, 1, -1, -3, -5, -4, -2, 0, 2, 4],
    rd: [10, 9, 10, 11, 13, 14, 16, 16, 15, 14, 12, 11],
    mm: [9, 8, 8, 9, 10, 11, 11, 11, 11, 10, 9, 9],
    storms: [12, 1, 2], fire: false, alpine: true, wind: 1,
    floodAt: 100, smokeTo: []
  },
  "tasmania": {
    name: "Huon Isle",
    hi: [23, 23, 21, 18, 16, 13, 13, 14, 16, 18, 20, 21],
    lo: [12, 12, 11, 9, 7, 5, 5, 5, 6, 8, 9, 11],
    rd: [9, 8, 9, 10, 10, 10, 11, 12, 12, 12, 11, 10],
    mm: [5, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5],
    storms: [], fire: true, wind: 0.7, fog: true,
    floodAt: 70, smokeTo: ["nz-west"]
  },
  "nz-north": {
    name: "Pōhutukawa Isle",
    hi: [24, 24, 23, 21, 18, 16, 15, 16, 17, 18, 20, 22],
    lo: [16, 17, 15, 13, 11, 9, 8, 8, 10, 11, 13, 15],
    rd: [8, 7, 9, 10, 13, 15, 17, 15, 13, 12, 10, 9],
    mm: [9, 9, 9, 9, 9, 9, 9, 9, 8, 7, 7, 8],
    storms: [1, 2, 3], fire: false, wind: 0.6, fog: true,
    floodAt: 90, smokeTo: []
  },
  "nz-south-east": {
    name: "Tussock Plains",
    hi: [23, 22, 20, 18, 14, 12, 11, 12, 15, 17, 19, 21],
    lo: [12, 12, 10, 8, 5, 2, 2, 3, 5, 7, 9, 11],
    rd: [7, 6, 7, 7, 8, 8, 9, 8, 7, 8, 7, 8],
    mm: [7, 7, 8, 7, 8, 8, 7, 7, 6, 6, 7, 7],
    storms: [], fire: true, wind: 0.8, fog: true,
    floodAt: 70, smokeTo: []
  },
  "nz-west": {
    name: "Rimu Coast",
    hi: [20, 20, 19, 17, 15, 13, 12, 13, 14, 15, 16, 18],
    lo: [12, 12, 11, 9, 6, 4, 3, 4, 6, 8, 9, 11],
    rd: [13, 11, 13, 13, 14, 13, 13, 14, 15, 17, 15, 15],
    mm: [16, 15, 15, 15, 15, 15, 14, 15, 13, 13, 14, 15],
    storms: [], fire: false, wind: 0.6,
    floodAt: 220, smokeTo: []
  }
};

// ---------- weather effects a system has on a zone, per day ----------
// pAdd = extra rain chance, mm = rain multiplier, hi/lo = temp change, wind = minimum wind level
const FX = {
  cycloneOuter: { pAdd: 0.55, mm: 2.2, hi: -2, lo: 0, wind: 3 },
  cyclone:      { pAdd: 0.95, mm: 4.5, hi: -4, lo: 0, wind: 4 },
  exTropLow:    { pAdd: 0.7, mm: 2.6, hi: -3, lo: 1, wind: 2 },
  monsoon:      { pAdd: 0.45, mm: 1.6, hi: -2, lo: 0, wind: 2 },
  trough:       { pAdd: 0.4, mm: 1.7, hi: -1, lo: 1, wind: 1, storm: true },
  heat:         { pAdd: -0.3, mm: 1, hi: 5.5, lo: 3.5, wind: 1 },
  change:       { pAdd: 0.3, mm: 1, hi: -6, lo: -2, wind: 3, storm: true },
  front:        { pAdd: 0.5, mm: 1.3, hi: -4, lo: -2, wind: 3 },
  coldSnap:     { pAdd: -0.05, mm: 1, hi: -4, lo: -4, wind: 1 },
  ecl:          { pAdd: 0.75, mm: 3.2, hi: -2, lo: 1, wind: 3 },
  cleanup:      { pAdd: 0, mm: 1, hi: 0, lo: 0, wind: 0 }
};

// ---------- weather systems ----------
// p = chance per day of one starting (Jan..Dec), vis = how many days before it starts
// forecasters can see it coming, build() lays out which zones it reaches, when and for how long.
const rep = (x, n) => Array(Math.max(0, n)).fill(x);
const SYSTEMS = [
  {
    id: "cycloneBW", vis: 2, cyclone: true,
    p: [0.009, 0.009, 0.008, 0.004, 0, 0, 0, 0, 0, 0, 0.003, 0.006],
    build(r, month, cat) {
      const len = 2 + Math.floor(r() * 3);
      return [
        { z: "top-end", lag: 0, days: ["cycloneOuter", ...rep("cyclone", len - 1), "exTropLow", ...rep("cleanup", cat >= 3 ? cat - 1 : 0)], reach: 1 },
        { z: "outback", lag: len + 1, days: ["exTropLow", "exTropLow"], reach: 0.35 }
      ];
    }
  },
  {
    id: "cycloneRR", vis: 2, cyclone: true,
    p: [0.008, 0.009, 0.008, 0.004, 0, 0, 0, 0, 0, 0, 0.002, 0.005],
    build(r, month, cat) {
      const len = 2 + Math.floor(r() * 3);
      return [
        { z: "far-north", lag: 0, days: ["cycloneOuter", ...rep("cyclone", len - 1), "exTropLow", ...rep("cleanup", cat >= 3 ? cat - 1 : 0)], reach: 1 },
        { z: "subtropical", lag: len + 1, days: ["exTropLow", "exTropLow", "trough"], reach: 0.35 },
        { z: "outback", lag: len + 1, days: ["exTropLow", "exTropLow"], reach: 0.2 }
      ];
    }
  },
  {
    id: "monsoon", vis: 3,
    p: [0.03, 0.03, 0.02, 0.004, 0, 0, 0, 0, 0, 0, 0.002, 0.015],
    build(r) {
      const len = 4 + Math.floor(r() * 5);
      return [
        { z: "top-end", lag: 0, days: rep("monsoon", len), reach: 1 },
        { z: "far-north", lag: 1, days: rep("monsoon", len - 1), reach: 0.75 },
        { z: "outback", lag: 2, days: rep("monsoon", 2 + Math.floor(r() * 2)), reach: 0.4 },
        { z: "subtropical", lag: 4, days: ["trough", "trough"], reach: 0.2 }
      ];
    }
  },
  {
    id: "heat", vis: 4,
    p: [0.02, 0.018, 0.009, 0.002, 0, 0, 0, 0, 0.002, 0.007, 0.014, 0.02],
    build(r) {
      const len = 3 + Math.floor(r() * 4);
      const n = (k) => Math.max(2, len - k);
      return [
        { z: "outback", lag: 0, days: rep("heat", len), reach: 1 },
        { z: "west", lag: 1, days: [...rep("heat", n(1)), "change"], reach: 0.65 },
        { z: "southern-coast", lag: 1, days: [...rep("heat", n(1)), "change"], reach: 0.7 },
        { z: "alpine", lag: 2, days: [...rep("heat", n(2)), "change"], reach: 0.45 },
        { z: "tasmania", lag: 2, days: ["heat", "heat", "change"], reach: 0.4 },
        { z: "temperate-east", lag: 2, days: [...rep("heat", n(2)), "change"], reach: 0.5 },
        { z: "subtropical", lag: 2, days: [...rep("heat", n(2)), "trough"], reach: 0.4 },
        { z: "nz-south-east", lag: 4, days: ["heat", "heat"], reach: 0.15 }
      ];
    }
  },
  {
    id: "front", vis: 3,
    p: [0.04, 0.04, 0.05, 0.07, 0.09, 0.11, 0.11, 0.11, 0.09, 0.07, 0.05, 0.04],
    build(r, month) {
      const winter = month >= 5 && month <= 9 && r() < 0.5;
      const snap = winter ? rep("coldSnap", 1 + Math.floor(r() * 3)) : [];
      return [
        { z: "west", lag: 0, days: ["front"], reach: 1 },
        { z: "southern-coast", lag: 1, days: ["front", ...snap], reach: 0.9 },
        { z: "tasmania", lag: 2, days: ["front", ...snap], reach: 0.85 },
        { z: "alpine", lag: 2, days: ["front", ...snap], reach: 0.85 },
        { z: "temperate-east", lag: 2, days: ["change"], reach: 0.55 },
        { z: "nz-west", lag: 3, days: ["front"], reach: 0.8 },
        { z: "nz-south-east", lag: 4, days: ["front", ...snap], reach: 0.7 },
        { z: "nz-north", lag: 4, days: ["front"], reach: 0.5 }
      ];
    }
  },
  {
    id: "ecl", vis: 1,
    p: [0, 0, 0, 0.003, 0.008, 0.012, 0.01, 0.006, 0.002, 0, 0, 0],
    build(r) {
      const len = 2 + Math.floor(r() * 2);
      return [
        { z: "subtropical", lag: 0, days: rep("ecl", len), reach: 0.6 },
        { z: "temperate-east", lag: 0, days: rep("ecl", len), reach: 0.85 },
        { z: "nz-north", lag: 2, days: rep("ecl", len), reach: 0.4 }
      ];
    }
  }
];
const SPAN = 16; // longest any system lasts from start to finish

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WINDS = ["Calm", "Light breeze", "Breezy", "Strong winds", "Gale force winds"];

// ---------- helpers ----------
function getDate() {
  const ss = game.seasonsStars?.api?.getCurrentDate?.();
  if (ss && ss.month) return { year: ss.year, month: ss.month, day: ss.day };
  const c = game.time?.components ?? {};
  return { year: c.year ?? 0, month: (c.month ?? 0) + 1, day: (c.dayOfMonth ?? 0) + 1 };
}

// dates as whole day numbers so we can count forwards and back easily
function toDn({ year, month, day }) {
  const dt = new Date(Date.UTC(2000, month - 1, day));
  dt.setUTCFullYear(year);
  return Math.round(dt.getTime() / 86400000);
}
function fromDn(n) {
  const dt = new Date(n * 86400000);
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate(), dow: dt.getUTCDay() };
}

function makeRng(seedText) {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rngFor = (...parts) => makeRng([REROLL_SALT, ...parts].join("|"));
const gauss = rng => (rng() + rng() + rng() - 1.5) * 2; // roughly -3..3, centred on 0
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

const MEMO = new Map();
function memo(key, fn) {
  if (!MEMO.has(key)) MEMO.set(key, fn());
  return MEMO.get(key);
}

function seasonName(z, m) {
  if (z.tropical) return (m >= 11 || m <= 4) ? "Wet Season" : "Dry Season";
  if (m === 12 || m <= 2) return "Summer";
  if (m <= 5) return "Autumn";
  if (m <= 8) return "Winter";
  return "Spring";
}

// ---------- weather systems: which ones touch a zone on a day ----------
function systemStart(sys, n) {
  return memo(`sys|${sys.id}|${n}`, () => {
    const d = fromDn(n);
    const r = rngFor("sys", sys.id, n);
    if (r() >= sys.p[d.month - 1]) return null;
    let strength = 0.75 + r() * 0.55;
    const x = (strength - 0.75) / 0.55;
    let level;
    if (sys.cyclone) {
      // Category 1 to 5: weaker ones are much more common, like the real thing
      level = x < 0.3 ? 1 : x < 0.58 ? 2 : x < 0.8 ? 3 : x < 0.93 ? 4 : 5;
      strength = 0.7 + 0.15 * level;
    } else {
      level = x < 0.55 ? 1 : x < 0.88 ? 2 : 3; // the worst ones are rare
    }
    const stops = sys.build(r, d.month, level).map(s => ({ ...s, reached: s.reach >= 1 || r() < s.reach }));
    return { sys, start: n, strength, level, stops };
  });
}

// every system stop over this zone on day n (reached or not, so forecasts can show near misses)
function stopsOn(zk, n) {
  return memo(`stops|${zk}|${n}`, () => {
    const out = [];
    for (const sys of SYSTEMS) {
      for (let back = 0; back <= SPAN; back++) {
        const inst = systemStart(sys, n - back);
        if (!inst) continue;
        for (const st of inst.stops) {
          if (st.z !== zk) continue;
          const idx = back - st.lag;
          if (idx < 0 || idx >= st.days.length) continue;
          let run = 0, runIdx = 0;
          for (let k = 0; k < st.days.length; k++) {
            if (st.days[k] === st.days[idx]) { if (k <= idx) runIdx++; run++; }
          }
          out.push({
            fx: st.days[idx], s: inst.strength, lvl: inst.level, reached: st.reached, sysId: sys.id, vis: sys.vis,
            start: inst.start, stopStart: inst.start + st.lag, dayNo: idx + 1, days: st.days.length,
            run, runIdx
          });
        }
      }
    }
    return out;
  });
}
const eventsOn = (zk, n) => stopsOn(zk, n).filter(e => e.reached);

function sumFx(evs) {
  let pAdd = 0, mmMul = 1, dHi = 0, dLo = 0, wind = 0, storm = false;
  for (const e of evs) {
    const f = FX[e.fx];
    pAdd += f.pAdd;
    mmMul *= 1 + (f.mm - 1) * e.s;
    dHi += f.hi * e.s; dLo += f.lo * e.s;
    wind = Math.max(wind, Math.min(4, f.wind + (e.lvl >= 3 && (e.fx === "ecl" || e.fx === "front") ? 1 : 0)));
    if (f.storm) storm = true;
  }
  return { pAdd, mmMul, dHi, dLo, wind, storm };
}

// ---------- the raw day: rain, temps, wind ----------
function climP(z, m) { return Math.min(0.9, z.rd[m - 1] / 30.4); }

function base(zk, n) {
  return memo(`base|${zk}|${n}`, () => {
    const z = ZONES[zk];
    const d = fromDn(n), i = d.month - 1;
    const ev = eventsOn(zk, n);
    const fx = sumFx(ev);

    // yesterday's raw rain roll nudges today (keeps wet and dry spells together)
    const yd = fromDn(n - 1);
    const yP = clamp(climP(z, yd.month) + sumFx(eventsOn(zk, n - 1)).pAdd, 0.02, 0.95);
    const yWet = rngFor("w", zk, n - 1)() < yP;
    let p = climP(z, d.month);
    p = yWet ? Math.min(0.92, p + 0.25) : Math.max(0.02, p - 0.06);
    p = clamp(p + fx.pAdd, 0.02, 0.97);

    const wet = rngFor("w", zk, n)() < p;
    let mm = 0;
    if (wet) {
      const u = rngFor("mm", zk, n)();
      mm = Math.max(0.4, z.mm[i] * -Math.log(1 - u * 0.995) * fx.mmMul);
      mm = Math.round(Math.min(mm, 400) * 10) / 10;
    }

    // temps drift over a few days instead of jumping around
    const noise = k => gauss(rngFor("t", zk, n - k));
    const anomaly = (0.55 * noise(0) + 0.3 * noise(1) + 0.15 * noise(2)) * TEMP_SWING;
    const rt = rngFor("t2", zk, n);
    let hi = z.hi[i] + anomaly + fx.dHi;
    let lo = z.lo[i] + anomaly * 0.7 + gauss(rt) * 0.6 + fx.dLo;
    if (wet && mm >= 2) { hi -= 1.5 + rt() * 2; lo += 0.5; }
    hi = Math.min(hi, z.hi[i] + 11, 48); lo = Math.min(lo, z.lo[i] + 9);
    hi = Math.round(hi); lo = Math.round(Math.min(lo, hi - 3));

    const windRoll = Math.max(0, rngFor("wind", zk, n)() - (z.wind ?? 0) * 0.12);
    let windIdx = windRoll < 0.04 ? 4 : windRoll < 0.15 ? 3 : windRoll < 0.45 ? 2 : windRoll < 0.85 ? 1 : 0;
    windIdx = Math.max(windIdx, fx.wind);

    return { zk, n, wet, mm, hi, lo, windIdx, ev, storm: fx.storm, p };
  });
}

// ---------- slow things: dryness, soil, floods, fire ----------
function dryDays(zk, n) {
  let c = 0;
  for (let k = 1; k <= 21; k++) { if (base(zk, n - k).mm >= 2) break; c++; }
  return c;
}
function soil(zk, n) {
  let s = 0;
  for (let a = 0; a < 10; a++) s += base(zk, n - a).mm * Math.pow(0.85, a);
  return s;
}
function floodLevel(zk, n) {
  const s = soil(zk, n), t = ZONES[zk].floodAt;
  return s >= t * 2.4 ? "Major" : s >= t * 1.6 ? "Moderate" : s >= t ? "Minor" : null;
}

function fireScore(hi, windIdx, dd, wetSoil) {
  return (hi - 28) / 4 + windIdx * 0.8 + (dd >= 7 ? 1 : 0) + (dd >= 14 ? 0.5 : 0) - (wetSoil ? 1 : 0);
}
function ratingFrom(score) {
  return score >= 6 ? "Catastrophic" : score >= 4.5 ? "Extreme" : score >= 3 ? "High" : "Moderate";
}
function fireRating(zk, n) {
  return memo(`fire|${zk}|${n}`, () => {
    const z = ZONES[zk], b = base(zk, n);
    if (!z.fire || b.mm >= 2 || b.hi < 28) return null;
    return ratingFrom(fireScore(b.hi, b.windIdx, dryDays(zk, n), soil(zk, n - 1) > 40));
  });
}

// a bushfire can start on a bad fire day; how big it gets depends on how bad the day was.
// Bigger fires burn longer, need more rain to put out, and send smoke further.
// A fire can flare up a size on later Catastrophic days.
const FIRE_SIZES = ["Grass fire", "Bushfire", "Major bushfire", "Firestorm"];
const FIRE_ODDS = { High: [0.6, 0.3, 0.09, 0.01], Extreme: [0.35, 0.4, 0.2, 0.05], Catastrophic: [0.15, 0.35, 0.32, 0.18] };
const FIRE_DAYS = [[1, 3], [3, 7], [6, 12], [10, 20]];
const FIRE_OUT_MM = [10, 25, 40, 60];
const FIRE_SMOKE = [0, 0.3, 0.75, 1];
function bushfire(zk, n) {
  return memo(`bf|${zk}|${n}`, () => {
    const IGN = { High: 0.015, Extreme: 0.08, Catastrophic: 0.22 };
    for (let s = n; s >= n - 22; s--) {
      const r = fireRating(zk, s);
      const rng = rngFor("bf", zk, s);
      if (!(rng() < (IGN[r] ?? 0))) continue;
      let u = rng(), size = 0;
      for (const p of FIRE_ODDS[r]) { if (u < p) break; u -= p; size++; }
      size = Math.min(size, 3);
      let dur = FIRE_DAYS[size][0] + Math.floor(rng() * (FIRE_DAYS[size][1] - FIRE_DAYS[size][0] + 1));
      const smokes = rng() < FIRE_SMOKE[size];
      let out = false, flared = false;
      for (let t = s + 1; t <= n; t++) {
        if (base(zk, t).mm >= FIRE_OUT_MM[size]) { out = true; break; }
        flared = false;
        if (size < 3 && fireRating(zk, t) === "Catastrophic" && rngFor("grow", zk, s, t)() < 0.35) {
          size++; dur += 3; flared = true;
        }
      }
      if (out || n - s >= dur) continue;
      return { start: s, age: n - s, dur, size, name: FIRE_SIZES[size], smokes: smokes || size >= 2, flared };
    }
    return null;
  });
}
function smokeFrom(zk, n) {
  const out = [];
  for (const k of Object.keys(ZONES)) {
    if (!ZONES[k].smokeTo.includes(zk)) continue;
    const f = bushfire(k, n);
    if (f?.smokes && f.size >= 1 && (f.size >= 2 || f.age <= 4)) out.push({ name: ZONES[k].name, size: f.size });
  }
  return out;
}

// ---------- Mount Kahikatea ("Old Grumbler"), Tōtara Ridge, Pōhutukawa Isle ----------
// Random unrest happens on its own. Eruptions only happen when the GM triggers one
// (the 🌋 button in the macro), and are saved on this macro so every run sees them.
const VOLCANO = { name: "Mount Kahikatea", nick: "Old Grumbler", where: "Tōtara Ridge", zone: "nz-north", ashTo: ["nz-south-east", "nz-west"] };
const VAL = ["No volcanic unrest", "Minor volcanic unrest", "Moderate to heightened volcanic unrest",
  "Minor volcanic eruption", "Moderate volcanic eruption", "Major volcanic eruption"];
const ERUPT_NAME = ["", "Minor eruption", "Moderate eruption", "MAJOR ERUPTION"];
const ERUPT_TEXT = ["",
  "ash fall near Tōtara Ridge, crater area closed, Sky riding grounded on the isle",
  "ash fall across the isle, roads slick with ash, Sky riding grounded, wear a mask outdoors",
  "ash cloud over the isle, evacuations around Tōtara Ridge, all travel near the ridge closed, Sky riding grounded across the isle"];
const ERUPT_DAYS = [null, [2, 3], [4, 6], [7, 12]];
const POST_DAYS = [0, 3, 5, 10];
const SELF_MACRO = (typeof Macro !== "undefined" && this instanceof Macro) ? this
  : (typeof game !== "undefined" ? (game.macros?.getName?.("Antipodea Weather") ?? null) : null);
let ERUPTIONS = scope?.__eruptions ?? SELF_MACRO?.getFlag?.("world", "kahikatea") ?? [];

function eruptionOn(n) {
  for (const e of ERUPTIONS) {
    const r = rngFor("erupt", e.start, e.size);
    const [a, b] = ERUPT_DAYS[e.size];
    const dur = a + Math.floor(r() * (b - a + 1));
    const age = n - e.start;
    if (age >= 0 && age < dur) return { ...e, age, dur, phase: "erupt" };
    if (age >= dur && age < dur + POST_DAYS[e.size]) return { ...e, age, dur, phase: "post", postDay: age - dur + 1, postDur: POST_DAYS[e.size] };
    const lead = Math.min(5, e.start - (e.triggered ?? e.start));
    if (age < 0 && -age <= lead) return { ...e, age, dur, phase: "pre" };
  }
  return null;
}
function unrestOn(n) {
  return memo(`unrest|${n}`, () => {
    for (let s = n; s >= n - 10; s--) {
      const r = rngFor("unrest", s);
      if (r() >= 0.01) continue; // about three or four unrest episodes a year
      const dur = 3 + Math.floor(r() * 8);
      if (n - s >= dur) continue;
      return { start: s, dur, day: n - s + 1, level: r() < 0.4 ? 2 : 1 };
    }
    return null;
  });
}
function volcano(n) {
  return memo(`volc|${n}`, () => {
    const er = eruptionOn(n), un = unrestOn(n);
    const r = rngFor("volc", n);
    // a big quake on the isle in the last 5 days stirs the mountain up
    let stirred = 0;
    for (let back = 0; back <= 5; back++) {
      const q = mainQuake(VOLCANO.zone, n - back);
      if (q && q.mag >= 5) stirred = Math.max(stirred, q.mag >= 6 ? 2 : 1);
    }
    const lines = [];
    let level = 0, ash = 0; // ash: 0 none, 1 light, 2 heavy, 3 very heavy
    const V = VOLCANO.name;
    if (er?.phase === "erupt") {
      level = 2 + er.size;
      ash = Math.max(1, er.size - (er.age >= er.dur / 2 ? 1 : 0));
      lines.push(er.age === 0
        ? `${ERUPT_NAME[er.size]} at ${V}: ${ERUPT_TEXT[er.size]}`
        : `${V} still erupting, day ${er.age + 1} of ${er.dur} (${["", "light", "heavy", "very heavy"][ash]} ash): ${ERUPT_TEXT[er.size]}`);
    } else if (er?.phase === "post") {
      level = 2;
      lines.push(`${V} settling after the eruption (day ${er.postDay} of ${er.postDur}): ash clean-up under way, crater area still closed`);
    } else if (er?.phase === "pre") {
      level = 2;
      lines.push(`${V}: swarms of tremors and rising gas around ${VOLCANO.where}, scientists watching closely`);
      if (r() < 0.5) lines.push(`${V}: steam and gas venting, sulphur smell downwind, crater area closed`);
    } else {
      level = Math.max(un?.level ?? 0, stirred);
      if (stirred && (un?.level ?? 0) < stirred) lines.push(`${V}: unrest stirred up by the recent earthquake`);
      const L2 = level >= 2;
      if (r() < (un ? (L2 ? 0.6 : 0.35) : 0.02)) lines.push(`${V}: small volcanic tremors felt around ${VOLCANO.where}`);
      if (r() < (un ? (L2 ? 0.5 : 0.25) : 0.03)) lines.push(`${V}: steam and gas venting, sulphur smell downwind, crater area closed today`);
      if (L2 && r() < 0.25) { ash = 1; lines.push(`${V}: minor ash emission, light ash near ${VOLCANO.where}, Sky riding not advised nearby`); }
    }
    if (er?.phase === "pre" || er?.phase === "post") level = Math.max(level, stirred);
    if (level >= 1) lines.unshift(`🌋 ${V} Volcanic Alert Level ${level}: ${VAL[level]}`);
    return { level, lines, ash, er, un };
  });
}
// ash only drifts off the isle in Moderate and Major eruptions, one wind direction a day
function ashDrift(zk, n) {
  if (!VOLCANO.ashTo.includes(zk)) return null;
  const er = eruptionOn(n);
  if (er?.phase !== "erupt" || er.size < 2) return null;
  const r = rngFor("ashwind", n)();
  if (zk === "nz-south-east" && r < (er.size === 3 ? 0.45 : 0.3)) return er.size;
  if (zk === "nz-west" && r > (er.size === 3 ? 0.6 : 0.85)) return er.size;
  return null;
}

// ---------- Earthquakes ----------
// Small and moderate quakes roll on their own, weighted to where the real-world twin of each
// zone shakes. Strong and severe quakes only happen when the GM triggers one (🌍 button).
const QUAKE_RATE = { // felt quakes (M3.5+) a year
  "nz-north": 8, "nz-west": 6, "nz-south-east": 5, "temperate-east": 1, "west": 1, "outback": 1,
  "southern-coast": 0.8, "alpine": 0.6, "top-end": 0.3, "tasmania": 0.3, "subtropical": 0.3, "far-north": 0.2
};
const RANDOM_QUAKE_MAX = 5.5; // anything bigger is GM only
const QUAKE_PLACES = {
  "top-end": ["Paperbark City", "Boab City", "Ridgy Didge"],
  "far-north": ["Bonza Bay", "Mangrove Point"],
  "subtropical": ["Bunya City", "Lilly Pilly Town", "Budgie Beach", "Ironbark"],
  "temperate-east": ["Waratah City"],
  "alpine": ["Snow Gum City", "Silver Fern Plateau", "Sweet As City"],
  "southern-coast": ["Banksia City", "Billabong Bend", "Servo Siding"],
  "west": ["Jarrah City", "Kangaroo Paw City", "Galah Flats", "Marri Vale"],
  "outback": ["Black Stump City", "Fair Dinkum City", "Hard Yakka City", "Coolibah Crossing", "Woop Woop", "Gidgee Rock"],
  "tasmania": ["Huon Pine City", "Leatherwood"],
  "nz-north": ["Kauri City", "Stoked City", "Jandal Cove", "Tōtara Ridge", "Rimu Falls", "Kawakawa Harbour"],
  "nz-south-east": ["Gumboot Plains", "Matai Isle"],
  "nz-west": ["Miro Sound"]
};
const TSUNAMI_NEAR = { // coasts that share the same stretch of sea, for the biggest offshore quakes
  "nz-north": ["nz-south-east"], "nz-south-east": ["nz-north"], "nz-west": ["nz-south-east"],
  "temperate-east": ["subtropical"], "subtropical": ["temperate-east"], "far-north": ["subtropical"],
  "top-end": [], "west": [], "southern-coast": ["tasmania"], "tasmania": ["southern-coast"], "outback": [], "alpine": []
};
const LANDLOCKED = ["outback"];
const FELT_NEAR = { // neighbours that feel a big quake (M6.5+), one shaking level lighter
  "nz-north": ["nz-south-east"], "nz-west": ["nz-south-east", "alpine"], "nz-south-east": ["nz-west", "nz-north"],
  "alpine": ["nz-west", "nz-south-east"], "temperate-east": ["subtropical", "alpine"], "subtropical": ["temperate-east"],
  "southern-coast": ["tasmania", "alpine"], "tasmania": ["southern-coast"], "west": ["outback"], "outback": ["west", "top-end"],
  "top-end": ["outback"], "far-north": ["subtropical"]
};
const NZ_LEAGUE = ["Silver Fern Plateau", "Sweet As City", "Gumboot Plains", "Matai Isle"];
const SHAKE = [
  ["Weak", "felt by a few people, no damage"],
  ["Light", "windows rattle, a few things knocked over"],
  ["Moderate", "things fall off shelves, minor cracks, check gas and water"],
  ["Strong", "damage to older buildings, roads cracked, landslips on hill roads, some routes closed"],
  ["Severe", "buildings damaged, bridges and roads closed for days, power out"]
];
const shakeOf = m => m < 4 ? 0 : m < 4.8 ? 1 : m < 5.6 ? 2 : m < 6.5 ? 3 : 4;
const afterDays = m => m >= 7 ? 14 : m >= 6 ? 7 : m >= 5 ? 3 : 0;
let QUAKES = scope?.__quakes ?? SELF_MACRO?.getFlag?.("world", "quakes") ?? [];

function randomQuake(zk, n) {
  return memo(`rq|${zk}|${n}`, () => {
    const r = rngFor("quake", zk, n);
    if (r() >= (QUAKE_RATE[zk] ?? 0) / 365) return null;
    // lots of small ones, very few big ones
    const mag = Math.round(Math.min(RANDOM_QUAKE_MAX, 3.5 - Math.log10(1 - r() * 0.999)) * 10) / 10;
    const places = QUAKE_PLACES[zk];
    return { id: `q|${zk}|${n}`, zone: zk, n, mag, place: places[Math.floor(r() * places.length)], offshore: false, gm: false };
  });
}
function gmQuake(zk, n) {
  const q = QUAKES.find(q => q.zone === zk && q.start === n);
  return q ? { id: `gq|${zk}|${n}|${q.mag}`, zone: zk, n, mag: q.mag, place: q.place, offshore: !!q.offshore, gm: true } : null;
}
const mainQuake = (zk, n) => gmQuake(zk, n) ?? randomQuake(zk, n);

// the most recent quake big enough for aftershocks that's still in its aftershock window
function aftershockParent(zk, n) {
  for (let back = 1; back <= 14; back++) {
    const q = mainQuake(zk, n - back);
    if (q && q.mag >= 5 && back <= afterDays(q.mag)) return { ...q, age: back, window: afterDays(q.mag) };
  }
  return null;
}
function tsunamiOn(zk, n) {
  for (const q of QUAKES) {
    if (!q.offshore || q.mag < 6.5) continue;
    const age = n - q.start;
    const land = q.mag >= 7.5;
    if (age < 0 || age > (land ? 1 : 0)) continue;
    if (q.zone === zk || (land && (TSUNAMI_NEAR[q.zone] ?? []).includes(zk))) {
      if (LANDLOCKED.includes(zk)) continue;
      return { land, mag: q.mag, place: q.place, age };
    }
  }
  return null;
}
function quakeDay(zk, n) {
  return memo(`qd|${zk}|${n}`, () => {
    const lines = [];
    const main = mainQuake(zk, n);
    let shake = -1, after = null;
    if (main) {
      shake = shakeOf(main.mag);
      lines.push(`M${main.mag.toFixed(1)} earthquake ${main.offshore ? "offshore from" : "near"} ${main.place} (${SHAKE[shake][0]} shaking): ${SHAKE[shake][1]}`);
    }
    // a big quake next door
    let nearby = null;
    for (const [src, near] of Object.entries(FELT_NEAR)) {
      if (src === zk || !near.includes(zk)) continue;
      const q = gmQuake(src, n);
      if (q && q.mag >= 6.5) { nearby = q; break; }
    }
    if (nearby && !main) {
      const sh = shakeOf(nearby.mag) - 1;
      shake = Math.max(shake, sh);
      lines.push(`Shaking felt from the M${nearby.mag.toFixed(1)} quake ${nearby.offshore ? "offshore from" : "near"} ${nearby.place} in ${ZONES[nearby.zone].name} (${SHAKE[sh][0]} shaking here): ${SHAKE[sh][1]}`);
    }
    const parent = aftershockParent(zk, n);
    if (parent) {
      const r = rngFor("after", zk, n);
      const felt = r() < 0.95 / (1 + parent.age * 0.5);
      const mag = Math.round((parent.mag - 1.2 + Math.log10(1 - r() * 0.99)) * 10) / 10;
      after = { parent, felt, mag: felt ? Math.max(3, mag) : null };
      let t = `Aftershocks continuing after the M${parent.mag.toFixed(1)} quake (day ${parent.age + 1} of ${parent.window + 1})`;
      if (felt && mag >= 3.5) t += `, largest M${Math.max(3.5, mag).toFixed(1)} (${SHAKE[shakeOf(mag)][0]} shaking)`;
      if (parent.mag >= 5.6) t += ". Battles: aftershock rule in play";
      lines.push(t);
      if (felt) shake = Math.max(shake, shakeOf(mag));
    }
    const tsunami = tsunamiOn(zk, n);
    if (tsunami) {
      lines.push(tsunami.land
        ? `TSUNAMI WARNING, land threat: move to high ground away from the coast now, do not wait for official sirens`
        : `Tsunami warning, marine threat: stay out of the water and off beaches and wharves, boats stay in port`);
    }
    // the League cable car stops for safety checks after a decent shake nearby
    const nearLeague = q => q && (q.zone === "nz-south-east" || NZ_LEAGUE.includes(q.place));
    const y = mainQuake(zk, n - 1);
    if ((nearLeague(main) && main.mag >= 4.8) || (nearLeague(y) && y.mag >= 5.6)
      || (nearLeague(parent) && after?.felt && after.mag >= 4.8)
      || (nearby && nearby.zone.startsWith("nz") && (zk === "nz-south-east" || zk === "alpine"))) {
      lines.push("League cable car at Gumboot Plains closed for safety checks");
    }
    return { main, nearby, after, tsunami, shake, lines };
  });
}

// ---------- the full day, ready to show ----------
const CYCLONE_TEXT = {
  1: "damaging gales, trees and caravans damaged, shelter indoors",
  2: "destructive winds, trees down, minor house damage, power out, no travel",
  3: "very destructive winds, roofs off, routes cut, shelter in place",
  4: "significant structural damage, towns cut off, shelter in place",
  5: "extremely dangerous, widespread destruction, get to a cyclone shelter"
};
const cycCat = e => (e.runIdx === 1 && e.run >= 2) ? Math.max(1, e.lvl - 1) : e.lvl; // builds up to its peak
const ECL_NAME = ["East coast low", "Severe east coast low", "Destructive east coast low"];
const ECL_TEXT = ["gusty winds, heavy rain, big surf", "damaging winds, heavy rain, dangerous surf, coastal flooding",
  "destructive winds, flooding rain, beaches eroded, power out, stay off the roads"];
const MONSOON_NAME = ["Weak monsoon burst", "Active monsoon", "Strong monsoon surge"];
const MONSOON_TEXT = ["humid with scattered heavy showers", "widespread heavy rain", "torrential rain, rivers rising fast"];
const FRONT_NAME = ["Cold front", "Strong cold front", "Severe cold front"];
const FRONT_TEXT = ["gusty change, rain then cooler", "damaging gusts, heavy showers, small hail",
  "destructive winds, hail, snow to low levels"];
const SNAP_NAME = ["Cold snap", "Severe cold snap", "Polar blast"];
const SNAP_TEXT = ["chilly days and cold nights", "hard frosts, bitterly cold nights", "snow to low levels, black ice on roads"];
const L = e => Math.max(0, Math.min(2, (e.lvl ?? 1) - 1));

const FX_TEXT = {
  cyclone: e => `Category ${cycCat(e)} tropical cyclone: ${CYCLONE_TEXT[cycCat(e)]} (day ${e.runIdx} of ${e.run})`,
  cycloneOuter: e => `Category ${e.lvl} cyclone approaching: secure gear, stay off the coast`,
  exTropLow: () => "Ex-tropical low: widespread heavy rain",
  cleanup: e => `Cyclone clean-up: debris on roads, power still out in places (day ${e.runIdx} of ${e.run})`,
  monsoon: e => `${MONSOON_NAME[L(e)]}: ${MONSOON_TEXT[L(e)]} (day ${e.runIdx} of ${e.run})`,
  heat: e => e.run >= 3 ? null : "Hot spell", // heatwaves get their own line below
  change: () => "Cool change later: sudden gusty winds and a temperature drop",
  front: e => `${FRONT_NAME[L(e)]}: ${FRONT_TEXT[L(e)]}`,
  coldSnap: e => `${SNAP_NAME[L(e)]}: ${SNAP_TEXT[L(e)]} (day ${e.runIdx} of ${e.run})`,
  ecl: e => `${ECL_NAME[L(e)]}: ${ECL_TEXT[L(e)]} (day ${e.runIdx} of ${e.run})`,
  trough: () => "Humid and unsettled, storms likely"
};

function rollDay(zoneKey, date) {
  const n = typeof date === "number" ? date : toDn(date);
  return memo(`day|${zoneKey}|${n}`, () => {
    const z = ZONES[zoneKey], b = base(zoneKey, n), d = fromDn(n), m = d.month;
    const rs = rngFor("s", zoneKey, n);
    const has = fx => b.ev.find(e => e.fx === fx);
    const { hi, lo, mm, wet } = b;
    let windIdx = b.windIdx;
    let sky, icon = "☀️", sceneFx = "", ptu = "", cat = null;
    const extras = [];
    if (has("cyclone") && !wet) cat = cycCat(has("cyclone"));

    if (wet) {
      const r = rs();
      const stormy = b.storm || (z.storms ?? []).includes(m);
      if (has("cyclone")) {
        cat = cycCat(has("cyclone"));
        sky = `CATEGORY ${cat} CYCLONE`; icon = "🌀"; sceneFx = "rainStorm"; ptu = "Rainy";
      } else if (has("cycloneOuter")) {
        sky = "Cyclone rain bands and squalls"; icon = "🌀"; sceneFx = "rainStorm"; ptu = "Rainy";
      } else if (has("ecl")) {
        sky = "Driving rain and gales"; icon = "🌧️"; sceneFx = "rainStorm"; ptu = "Rainy";
      } else if (z.alpine && hi <= 7) {
        if (r > 0.8 && windIdx >= 3) { sky = "Blizzard"; icon = "🌨️"; sceneFx = "blizzard"; }
        else { sky = mm >= 8 ? "Heavy snow" : "Snow flurries"; icon = "❄️"; sceneFx = "snow"; }
        ptu = "Hail";
      } else if (lo <= 1 && hi <= 9) {
        sky = "Sleet and icy showers"; icon = "🌨️"; sceneFx = "snow"; ptu = "Hail";
      } else if (stormy && (r < 0.35 || (b.storm && r < 0.6))) {
        const severe = r < 0.08 || mm >= 35;
        sky = severe ? "Severe thunderstorm with hail" : "Afternoon thunderstorms";
        icon = "⛈️"; sceneFx = "rainStorm"; ptu = severe ? "Hail" : "Rainy";
        windIdx = Math.max(windIdx, 3);
      } else if (mm < 3) {
        sky = "Light showers"; icon = "🌦️"; sceneFx = "rain";
      } else if (mm < 12) {
        sky = "Steady rain"; icon = "🌧️"; sceneFx = "rain"; ptu = mm >= 8 ? "Rainy" : "";
      } else if (mm < 30) {
        sky = "Rain, heavy at times"; icon = "🌧️"; sceneFx = "rainStorm"; ptu = "Rainy";
      } else {
        sky = "Heavy rain"; icon = "🌧️"; sceneFx = "rainStorm"; ptu = "Rainy";
      }
      if (mm >= 40) extras.push("Flash flooding on low roads and creek crossings");
    } else {
      const r = rs();
      if (r < 0.5) { sky = "Clear and sunny"; icon = "☀️"; }
      else if (r < 0.8) { sky = "Partly cloudy"; icon = "⛅"; }
      else { sky = "Overcast"; icon = "☁️"; }
      if (has("heat") && sky === "Overcast") { sky = "Hot and hazy"; icon = "🌤️"; }
      if (has("change") || has("front")) { sky = "Gusty change, dry"; icon = "💨"; }

      const coldMonth = m >= 5 && m <= 8;
      if (z.fog && coldMonth && rs() < 0.15) {
        extras.push("Thick morning fog until mid-morning"); sceneFx = "fog";
      }
      if (z.dust && windIdx >= 3 && rs() < 0.4) {
        sky = "Dust storm"; icon = "🌪️"; ptu = "Sandstorm"; sceneFx = "fog";
      }
      if (hi >= 32 && (sky === "Clear and sunny" || sky === "Hot and hazy")) ptu = "Sunny";
      if (!sceneFx && windIdx >= 2 && m >= 3 && m <= 5 && !z.tropical) sceneFx = "leaves";
    }

    // multi-day systems
    const seen = new Set();
    for (const e of b.ev) {
      if (seen.has(e.fx)) continue;
      seen.add(e.fx);
      const t = FX_TEXT[e.fx]?.(e);
      if (t) extras.push(t);
    }
    const hw = has("heat");
    if (hw && hw.run >= 3) {
      const over = hi - z.hi[m - 1];
      const level = over >= 9 ? "Extreme heatwave" : over >= 6 ? "Severe heatwave" : "Heatwave";
      extras.push(`${level} (day ${hw.runIdx} of ${hw.run}): water and shade, avoid travel at midday`);
    } else if (hi >= 40) extras.push("Extreme heat: water and shade, avoid travel at midday");
    else if (hi >= 35) extras.push("Scorcher: carry plenty of water");
    if (lo <= 2 && !wet) extras.push("Frosty start");

    // floods
    const flood = floodLevel(zoneKey, n);
    if (flood) {
      const fl = { Minor: "Minor flood warning: some low roads and crossings cut",
        Moderate: "Moderate flood warning: routes cut, low-lying areas going under",
        Major: "MAJOR FLOOD WARNING: towns cut off, travel by land is not possible" }[flood];
      extras.push(fl);
    }

    // fire
    const fire = fireRating(zoneKey, n);
    if (fire === "Catastrophic" || fire === "Extreme") icon = "🔥";
    const bf = bushfire(zoneKey, n);
    let bfLevel = null;
    if (bf) {
      const LV = ["Advice", "Watch and Act", "Emergency Warning"];
      const danger = fire === "Catastrophic" || fire === "Extreme" ? 2 : fire === "High" ? 1 : 0;
      bfLevel = clamp(danger, [0, 0, 1, 2][bf.size], [1, 2, 2, 2][bf.size]);
      const lvl = LV[bfLevel];
      const what = [
        "small and contained, local roads may close",
        "roads near the fireground closed",
        "routes through the area closed, towns on alert",
        "out of control, evacuate, area closed to all travel, Sky riding grounded"
      ][bf.size];
      extras.push(bf.age === 0 ? `NEW ${bf.name.toUpperCase()} (${lvl}): ${what}`
        : bf.flared ? `${bf.name} flared up overnight, day ${bf.age + 1} (${lvl}): ${what}`
        : `${bf.name} still burning, day ${bf.age + 1} (${lvl}): ${what}`);
      if (!wet) { sky = sky === "Clear and sunny" ? "Smoky" : sky; sceneFx = sceneFx || "fog"; }
    }
    const smoke = smokeFrom(zoneKey, n);
    if (smoke.length && !bf) {
      const thick = smoke.some(x => x.size >= 3);
      extras.push(thick
        ? `Thick smoke from fires in ${smoke.map(x => x.name).join(" and ")}: poor visibility, Sky riding not advised`
        : `Smoke haze drifting in from fires in ${smoke.map(x => x.name).join(" and ")}`);
      if (!wet && !sceneFx) sceneFx = "fog";
    }

    // Mount Kahikatea
    let volc = null;
    if (zoneKey === VOLCANO.zone) {
      volc = volcano(n);
      extras.push(...volc.lines);
      if (volc.ash >= 2) {
        sky = wet ? "Muddy ash rain" : "Ash fall"; icon = "🌋"; sceneFx = "fog"; ptu = "Sandstorm";
      } else if (volc.ash === 1 && !sceneFx) sceneFx = "fog";
    }
    // earthquakes
    const qd = quakeDay(zoneKey, n);
    extras.push(...qd.lines.map(l => `🌍 ${l}`));

    const drift = ashDrift(zoneKey, n);
    if (drift) {
      extras.push(`Volcanic ash drifting in from ${VOLCANO.name}: Sky riding not advised, cover water tanks`);
      if (drift >= 3 && !wet) { sky = "Ash haze"; icon = "🌋"; }
      if (!sceneFx) sceneFx = "fog";
    }

    return {
      zoneKey, zone: z, date: d, n, season: seasonName(z, m), wet,
      hi, lo, mm, sky, icon, windIdx, wind: WINDS[windIdx], extras, fire, ptu, sceneFx,
      flood, bushfire: bf, bfLevel, cat, volcano: volc, quake: qd
    };
  });
}

// ---------- forecasting ----------
// ACC = chance the forecaster reads the rain call right, CONF = how firmly they say it
const ACC = [1, 0.92, 0.88, 0.84, 0.8, 0.76, 0.72, 0.68];
const CONF = [1, 0.8, 0.7, 0.6, 0.5, 0.42, 0.35, 0.28];
const TEMP_ERR = [0, 1.3, 1.6, 2, 2.4, 2.8, 3.2, 3.6];
const FC_NAME = {
  cyclone: "Cyclone", cycloneOuter: "Cyclone", exTropLow: "Heavy rain", monsoon: "Monsoon rain",
  heat: "Heatwave", change: "Cool change", front: "Cold front", coldSnap: "Cold snap",
  ecl: "East coast low", trough: null, cleanup: null
};

function forecastDay(zk, issueN, targetN) {
  return memo(`fc|${zk}|${issueN}|${targetN}`, () => {
    const k = targetN - issueN;
    const z = ZONES[zk], t = rollDay(zk, targetN), b = base(zk, targetN), d = fromDn(targetN), m = d.month;
    const r = rngFor("fc", zk, issueN, targetN);
    const kk = Math.min(k, ACC.length - 1);

    // what the forecaster can see: systems already on the charts by the issue date
    const all = stopsOn(zk, targetN);
    const seenEv = all.filter(e => e.start - issueN <= e.vis);
    const known = seenEv.filter(e => e.reached);
    const unseen = b.ev.filter(e => !(e.start - issueN <= e.vis));
    const fxKnown = sumFx(known), fxUnseen = sumFx(unseen);

    // rain chance
    let pKnown = clamp(climP(z, m) + fxKnown.pAdd, 0.03, 0.95);
    if (k === 1) pKnown = clamp(pKnown + (rollDay(zk, issueN).wet ? 0.15 : -0.04), 0.03, 0.95);
    // the forecaster's read of the day: right most of the time, less so further out,
    // and badly caught out by systems that aren't on the charts yet
    const acc = ACC[kk] * (fxUnseen.pAdd > 0.3 ? 0.8 : 1);
    const truth = t.mm >= 1 ? 1 : 0;
    const signal = r() < acc ? truth : 1 - truth;
    let pc = CONF[kk] * signal + (1 - CONF[kk]) * pKnown + (r() - 0.5) * 0.16;
    if (known.some(e => ["cyclone", "cycloneOuter", "ecl", "exTropLow"].includes(e.fx))) pc = Math.max(pc, 0.8);
    pc = clamp(Math.round(pc * 10) * 10, 5, 95);

    // temps: true temps, minus surprise systems, plus error that grows with lead time
    const err = TEMP_ERR[kk];
    const hi = Math.round(t.hi - fxUnseen.dHi + gauss(r) * err);
    const lo = Math.round(Math.min(t.lo - fxUnseen.dLo + gauss(r) * err * 0.8, hi - 3));

    // sky
    let icon, text;
    const stormy = (z.storms ?? []).includes(m) || fxKnown.storm;
    if (pc >= 60) {
      if (signal && t.mm >= 1) {
        icon = t.icon === "🔥" ? "🌧️" : t.icon;
        text = shortSky(t);
      } else if (z.alpine && hi <= 7) { icon = "❄️"; text = "Snow"; }
      else { icon = stormy ? "⛈️" : "🌧️"; text = stormy ? "Storms" : "Rain"; }
    } else if (pc >= 30) {
      if (z.alpine && hi <= 7) { icon = "🌨️"; text = "Possible snow"; }
      else { icon = stormy ? "⛈️" : "🌦️"; text = stormy ? "Possible storm" : "Possible shower"; }
    } else if (!t.wet && !["Windy", "Dust storm"].includes(shortSky(t)) || (!t.wet && k <= 2)) {
      icon = t.icon === "🔥" ? "☀️" : t.icon; text = shortSky(t);
      if (text === "Smoky" && !bushfire(zk, issueN)) text = "Sunny"; // can't forecast a fire that hasn't started
    } else {
      icon = r() < 0.5 ? "🌤️" : "⛅"; text = icon === "🌤️" ? "Mostly sunny" : "Partly cloudy";
    }

    // nobody can forecast an eruption that hasn't started
    const erNow = eruptionOn(issueN);
    if ((/\bash\b/i.test(text) || icon === "🌋") && erNow?.phase !== "erupt") {
      icon = pc >= 30 ? "🌦️" : "⛅"; text = pc >= 30 ? "Possible shower" : "Partly cloudy";
    }

    // warnings the forecaster would put out
    const warns = [];
    if (zk === VOLCANO.zone) {
      const vi = volcano(issueN), vt = volcano(targetN);
      if (erNow?.phase === "erupt" && vt.ash >= 1) warns.push(k <= 3 ? "Ash fall likely" : "Ash fall possible");
      else if (vi.level >= 2 && k <= 3) warns.push("Volcanic unrest, eruption possible");
      else if (vi.level === 1 && k <= 2) warns.push("Volcanic unrest");
    } else if (VOLCANO.ashTo.includes(zk) && erNow?.phase === "erupt" && erNow.size >= 2
      && targetN - erNow.start < erNow.dur && k <= 2) {
      warns.push("Volcanic ash possible");
    }
    const ap = aftershockParent(zk, targetN);
    if (ap && ap.n <= issueN) warns.push(k <= 2 && ap.age <= 3 ? "Aftershocks likely" : "Aftershocks possible");
    const seenNames = new Set();
    // further out, the forecaster can be a level off on how bad it'll be
    const est = (e, max) => {
      if (k <= 1) return e.lvl;
      const u = rngFor("lvl", zk, issueN, e.start, e.fx)();
      return clamp(e.lvl + (u < 0.25 ? -1 : u > 0.75 ? 1 : 0), 1, max);
    };
    const lvlName = (e) => {
      const i = est(e, 3) - 1;
      return { ecl: ECL_NAME[i], front: FRONT_NAME[i], monsoon: MONSOON_NAME[i], coldSnap: SNAP_NAME[i] }[e.fx];
    };
    for (const e of seenEv) {
      let nm = FC_NAME[e.fx];
      if (!nm || seenNames.has(nm)) continue;
      if (nm === "Heatwave" && e.run < 3) continue;
      if (e.reached) {
        if (nm === "Cyclone") {
          const c = est({ ...e, lvl: e.fx === "cyclone" ? cycCat(e) : e.lvl }, 5);
          warns.push(k <= 1 ? `Category ${c} cyclone warning` : `Cyclone watch, up to Category ${c}`);
        } else if (nm === "Heatwave") {
          const over = hi - z.hi[m - 1];
          const hw = over >= 9 ? "Extreme heatwave" : over >= 6 ? "Severe heatwave" : "Heatwave";
          warns.push(k <= 1 ? `${hw} warning` : `${hw} likely`);
        } else {
          const full = lvlName(e) ?? nm;
          warns.push(k <= 1 ? `${full} warning` : `${full} likely`);
        }
      } else if (k >= 2 && rngFor("miss", zk, issueN, targetN, e.fx)() < 0.6) {
        warns.push(`${nm} possible`);
      } else continue;
      seenNames.add(nm);
    }
    if (k <= 3 && t.flood && (pc >= 60 || floodLevel(zk, issueN))) {
      warns.push(k <= 1 ? `${t.flood} flood warning` : "Flood watch");
    }
    const fireNow = bushfire(zk, issueN);
    if (fireNow && k <= 3 && fireNow.dur - fireNow.age > k) warns.push(`${fireNow.name} still burning`);
    if (k <= 4 && z.fire && pc < 50 && hi >= 28) {
      const fr = ratingFrom(fireScore(hi, t.windIdx, dryDays(zk, issueN) + k, soil(zk, issueN) > 40));
      if (fr !== "Moderate") warns.push(`Fire danger ${fr}`);
    }

    return { k, date: d, n: targetN, icon, text, hi, lo, pc, warns };
  });
}

function shortSky(t) {
  const s = t.sky;
  if (s.includes("CYCLONE")) return `Cyclone (Cat ${t.cat})`;
  if (s.startsWith("Cyclone")) return "Cyclone";
  if (s.startsWith("Severe")) return "Severe storms";
  if (s.includes("thunder")) return "Storms";
  if (s === "Driving rain and gales") return "Heavy rain, gales";
  if (s.includes("snow") || s === "Blizzard" || s.startsWith("Snow")) return s === "Blizzard" ? "Blizzard" : "Snow";
  if (s.startsWith("Sleet")) return "Sleet";
  if (s === "Light showers") return "Showers";
  if (s === "Steady rain") return "Rain";
  if (s.startsWith("Rain") || s === "Heavy rain") return "Heavy rain";
  if (s === "Clear and sunny") return "Sunny";
  if (s === "Gusty change, dry") return "Windy";
  return s;
}

function forecastFor(zk, issueN, days = FORECAST_DAYS) {
  const out = [];
  for (let k = 1; k <= Math.min(days, 7); k++) out.push(forecastDay(zk, issueN, issueN + k));
  return out;
}

// ---------- output builders ----------
const dateText = d => `${d.day} ${MONTHS[d.month - 1]} ${d.year}`;
const fcLine = f => {
  let s = `${DOW[f.date.dow]} ${f.icon} ${f.text}, ${f.hi}°/${f.lo}°, rain ${f.pc}%`;
  if (f.warns.length) s += ` ⚠️ ${f.warns.join(", ")}`;
  return s;
};

function lineFor(w) {
  let s = `${w.icon} **${w.sky}**, ${w.hi}°C / ${w.lo}°C, ${w.wind}`;
  if (w.mm >= 1) s += `, ${Math.round(w.mm)}mm`;
  if (w.fire && w.fire !== "Moderate") s += `\n🔥 Fire danger: ${w.fire}`;
  if (w.ptu) s += `\n⚔️ PTU field weather: ${w.ptu}`;
  for (const e of w.extras) s += `\n⚠️ ${e}`;
  return s;
}

function bigWarnings(list) {
  const out = [];
  for (const w of list) {
    for (const e of w.extras) {
      if (/cyclone|flood warning|bushfire|firestorm|heatwave|east coast low|blizzard|severe cold front|polar blast|thick smoke|eruption|erupting|Alert Level [2-5]|volcanic ash|(Moderate|Strong|Severe) shaking|tsunami|cable car/i.test(e)
        && !/^Minor|^Cyclone clean-up|^Weak/.test(e)) {
        out.push(`${w.zone.name}: ${e}`);
      }
    }
  }
  return out;
}

function zoneCard(w) {
  const bits = [`<b>${w.icon} ${w.sky}</b>`, `${w.hi}°C / ${w.lo}°C`, w.wind];
  if (w.mm >= 1) bits.push(`🌧️ ${Math.round(w.mm)}mm`);
  if (w.fire && w.fire !== "Moderate") bits.push(`🔥 Fire danger: <b>${w.fire}</b>`);
  if (w.ptu) bits.push(`⚔️ PTU field weather: <b>${w.ptu}</b>`);
  for (const e of w.extras) bits.push(`⚠️ ${e}`);
  return `<div style="margin:6px 0;padding:6px;border-left:3px solid #2e7d6b;background:rgba(46,125,107,0.08)">
      <div style="font-weight:bold">${w.zone.name} <span style="font-weight:normal;opacity:.7">(${w.season})</span></div>
      <div>${bits.join("<br>")}</div></div>`;
}

function forecastTable(zk, issueN, withName = true) {
  const rows = forecastFor(zk, issueN).map(f => `<tr>
      <td style="padding:2px 4px;white-space:nowrap">${DOW[f.date.dow]} ${f.date.day}</td>
      <td style="padding:2px 4px">${f.icon} ${f.text}${f.warns.length ? `<br><span style="color:#b3541e;font-size:11px">⚠️ ${f.warns.join(", ")}</span>` : ""}</td>
      <td style="padding:2px 4px;white-space:nowrap">${f.hi}° / ${f.lo}°</td>
      <td style="padding:2px 4px;white-space:nowrap">💧${f.pc}%</td></tr>`).join("");
  return `<div style="margin:4px 0">${withName ? `<div style="font-weight:bold">${ZONES[zk].name}</div>` : ""}
    <table style="width:100%;font-size:12px;border-collapse:collapse">${rows}</table></div>`;
}

function chatCard(list, title, { forecast = false, issueN = null } = {}) {
  const warn = bigWarnings(list);
  const warnBox = warn.length
    ? `<div style="margin:4px 0;padding:6px;border:2px solid #c0392b;background:rgba(192,57,43,0.1)"><b>🚨 Warnings</b><br>${warn.join("<br>")}</div>`
    : "";
  const rows = list.map(zoneCard).join("");
  const fc = forecast && issueN != null
    ? `<details style="margin-top:6px"><summary style="cursor:pointer;font-weight:bold">📅 ${FORECAST_DAYS}-day forecast</summary>
        ${list.map(w => forecastTable(w.zoneKey, issueN, list.length > 1)).join("")}
        <p style="opacity:.7;font-size:11px;margin:4px 0">Forecasts get less reliable the further out they go.</p></details>`
    : "";
  return `<div><h3 style="margin:0 0 4px">${title}</h3>${warnBox}${rows}${fc}</div>`;
}

// Discord: split fields over embeds and messages so we stay under Discord's limits
async function postDiscord(embeds) {
  if (!DISCORD_WEBHOOK) {
    ui.notifications.warn("No Discord webhook set at the top of the macro, skipped Discord.");
    return;
  }
  const size = e => (e.title?.length ?? 0) + (e.description?.length ?? 0) + (e.footer?.text?.length ?? 0)
    + (e.fields ?? []).reduce((a, f) => a + f.name.length + f.value.length, 0);
  const batches = [];
  let cur = [], curSize = 0;
  for (const e of embeds) {
    const s = size(e);
    if (cur.length && (curSize + s > 5800 || cur.length >= 10)) { batches.push(cur); cur = []; curSize = 0; }
    cur.push(e); curSize += s;
  }
  if (cur.length) batches.push(cur);
  let ok = true;
  for (const b of batches) {
    const fd = new FormData();
    fd.append("payload_json", JSON.stringify({ username: DISCORD_NAME, embeds: b }));
    try {
      const res = await fetch(DISCORD_WEBHOOK, { method: "POST", body: fd });
      if (!res.ok) { ok = false; ui.notifications.error(`Discord rejected the post (${res.status}). Check the webhook URL.`); }
    } catch (err) {
      ok = false;
      console.warn("Antipodea Weather | Discord", err);
      ui.notifications.warn("Couldn't confirm the Discord post. Check the channel, it may still have gone through.");
    }
  }
  if (ok) ui.notifications.info("Weather sent to Discord.");
}

function chunkFields(fields, title, color, footer) {
  const embeds = [];
  let cur = null, curSize = 0;
  for (const f of fields) {
    const s = f.name.length + f.value.length;
    if (!cur || cur.fields.length >= 25 || curSize + s > 5000) {
      cur = { color, fields: [] };
      if (!embeds.length) cur.title = title;
      embeds.push(cur); curSize = 0;
    }
    cur.fields.push(f); curSize += s;
  }
  if (embeds.length && footer) embeds[embeds.length - 1].footer = { text: footer };
  return embeds;
}

async function sendDiscord(list, title, { forecast = false, issueN = null } = {}) {
  const embeds = [];
  const warn = bigWarnings(list);
  if (warn.length) embeds.push({ title: "🚨 Weather warnings", color: 0xc0392b, description: warn.join("\n").slice(0, 4000) });
  embeds.push(...chunkFields(list.map(w => ({
    name: `${w.zone.name} (${w.season})`, value: lineFor(w).slice(0, 1024), inline: list.length > 1
  })), title, 0x2e7d6b, "Antipodea Weather Service"));
  if (forecast && issueN != null) {
    embeds.push(...chunkFields(list.map(w => ({
      name: w.zone.name, value: forecastFor(w.zoneKey, issueN).map(fcLine).join("\n").slice(0, 1024), inline: false
    })), `📅 ${FORECAST_DAYS}-day forecast`, 0x3b6ea5, "Forecasts get less reliable the further out they go."));
  }
  await postDiscord(embeds);
}

// ---------- Emergency alerts for the Pokémon Phone ----------
// Pop-ups go to every phone in the zone. Only new or escalated alerts go out each day,
// so a week-long cyclone doesn't buzz players every morning.
const cap1 = t => t.charAt(0).toUpperCase() + t.slice(1);
function rawAlerts(n) {
  return memo(`ra|${n}`, () => {
    const out = [];
    for (const zk of Object.keys(ZONES)) {
      const w = rollDay(zk, n), q = w.quake, z = ZONES[zk].name;
      const add = (kind, tier, title, body, icon) => out.push({ key: `${zk}|${kind}|${tier}`, zone: z, kind, title, body, icon });
      if (q.main && shakeOf(q.main.mag) >= 2) {
        const s = SHAKE[shakeOf(q.main.mag)];
        add("quake", q.main.id, `Earthquake: M${q.main.mag.toFixed(1)} ${q.main.offshore ? "offshore from" : "near"} ${q.main.place}`, `${s[0]} shaking. ${cap1(s[1])}. Drop, cover and hold on in aftershocks.`, "fa-house-crack");
      }
      if (q.nearby && !q.main && shakeOf(q.nearby.mag) - 1 >= 2) {
        const s = SHAKE[shakeOf(q.nearby.mag) - 1];
        add("quake", q.nearby.id, `Earthquake felt: M${q.nearby.mag.toFixed(1)} in ${ZONES[q.nearby.zone].name}`, `${s[0]} shaking here. ${cap1(s[1])}.`, "fa-house-crack");
      }
      if (q.after?.felt && q.after.mag >= 4.8) {
        add("aftershock", n, `Strong aftershock in ${z}`, `M${q.after.mag.toFixed(1)} aftershock. More are likely. Drop, cover and hold on.`, "fa-house-crack");
      }
      if (q.tsunami) {
        add("tsunami", q.tsunami.land ? 2 : 1, q.tsunami.land ? "TSUNAMI WARNING" : "Tsunami warning",
          q.tsunami.land ? "Land threat. Move to high ground or inland now. Do not go to the beach to look."
            : "Marine threat. Stay out of the water and away from beaches, rivers and wharves.", "fa-water");
      }
      const ev = eventsOn(zk, n);
      const cyc = ev.find(e => e.fx === "cyclone" || e.fx === "cycloneOuter");
      if (cyc) {
        const c = cyc.fx === "cyclone" ? cycCat(cyc) : cyc.lvl;
        add("cyclone", `warn${c}`, `Category ${c} cyclone warning`, cyc.fx === "cyclone" ? `${cap1(CYCLONE_TEXT[c])}.` : "Cyclone approaching. Secure gear, stay off the coast, get ready to shelter.", "fa-hurricane");
      } else {
        for (let d = 1; d <= 2; d++) {
          const up = stopsOn(zk, n + d).find(e => e.reached && (e.fx === "cyclone" || e.fx === "cycloneOuter") && e.start - n <= e.vis);
          if (up) { add("cyclone", "watch", "Cyclone watch", `A Category ${up.lvl} cyclone could reach ${z} in the next ${d === 1 ? "day" : "two days"}. Get ready now.`, "fa-hurricane"); break; }
        }
      }
      const ecl = ev.find(e => e.fx === "ecl" && e.lvl >= 2);
      if (ecl) add("ecl", ecl.lvl, ECL_NAME[L(ecl)], `${cap1(ECL_TEXT[L(ecl)])}.`, "fa-wind");
      if (w.bushfire && w.bfLevel >= 1) {
        add("fire", `${w.bushfire.start}|${w.bfLevel}`, `${w.bfLevel === 2 ? "Emergency Warning" : "Watch and Act"}: ${w.bushfire.name}`,
          w.bfLevel === 2 ? "Leave now if you're near the fire. Roads in the area are closed." : "A fire is burning nearby. Get ready to leave and avoid the area.", "fa-fire");
      }
      if (w.extras.some(e => /^Thick smoke/.test(e))) add("smoke", 1, "Thick smoke", "Poor visibility from bushfire smoke. Sky riding not advised. Stay indoors if you can.", "fa-smog");
      if (w.volcano && w.volcano.level >= 2) {
        const lv = w.volcano.level;
        add("volcano", lv, `${VOLCANO.name}: Volcanic Alert Level ${lv}`, lv >= 3 ? `${cap1(ERUPT_TEXT[lv - 2])}.` : "Heightened unrest. An eruption is possible. Stay away from the crater area.", "fa-volcano");
      }
      if (w.flood === "Moderate" || w.flood === "Major") {
        add("flood", w.flood, `${w.flood} flood warning`, w.flood === "Major" ? "Towns are cut off. Don't travel by land. Never drive or ride into floodwater." : "Routes are cut and low areas are going under. Never cross floodwater.", "fa-house-flood-water");
      }
      const hw = w.extras.find(e => /^(Severe|Extreme) heatwave/.test(e));
      if (hw) add("heat", hw.split(" ")[0], hw.split(" (")[0], "Drink plenty of water, stay in the shade and avoid travel in the middle of the day.", "fa-temperature-high");
    }
    return out;
  });
}
function alertsFor(n) {
  const before = new Set(rawAlerts(n - 1).map(a => a.key));
  return rawAlerts(n).filter(a => !before.has(a.key)).map(({ key, ...a }) => ({ id: `${n}|${key}`, ...a }));
}
async function publishAlerts(n) {
  const api = game.modules.get("antipodea-registry")?.api;
  if (!api?.postAlerts) return; // phone module not updated yet
  try { await api.postAlerts(alertsFor(n), dateText(fromDn(n))); }
  catch (e) { console.warn("Antipodea Weather | phone alerts", e); }
}

// ---------- which mode? ----------
const isAuto = String(scope?.auto ?? "") === "true";
const date = getDate();
const todayN = toDn(date);

// ---------- Pokémon Phone: Weather app ----------
// The phone runs this macro with scope.forecast = { zone, dates } and shows one card per date.
// Today gets the actual weather plus the 7-day outlook; later days get the forecast as issued today.
if (scope?.forecast) {
  const key = Object.keys(ZONES).find((k) => ZONES[k].name === scope.forecast.zone) ?? "subtropical";
  return (scope.forecast.dates ?? [date]).map((d) => {
    const n = d?.month ? toDn(d) : todayN;
    if (n <= todayN) {
      const w = rollDay(key, n);
      return `${zoneCard(w)}<div style="margin-top:6px;font-weight:bold">📅 ${FORECAST_DAYS}-day forecast</div>${forecastTable(key, n, false)}`;
    }
    const f = forecastDay(key, todayN, n);
    return `<div style="padding:6px;border-left:3px solid #3b6ea5;background:rgba(59,110,165,0.08)">
      <b>${f.icon} ${f.text}</b><br>${f.hi}°C / ${f.lo}°C<br>💧 Chance of rain ${f.pc}%
      ${f.warns.map(x => `<br>⚠️ ${x}`).join("")}
      <div style="opacity:.6;font-size:11px">Forecast issued ${dateText(fromDn(todayN))}</div></div>`;
  });
}

// ---------- Mount Kahikatea controls (GM) ----------
async function refreshEverything(zoneKeys, title) {
  MEMO.clear();
  ERUPTIONS = SELF_MACRO?.getFlag("world", "kahikatea") ?? [];
  QUAKES = SELF_MACRO?.getFlag("world", "quakes") ?? [];
  for (const s of game.scenes.filter(s => zoneKeys.includes(s.getFlag("world", "antipodeaZone")))) {
    const w = rollDay(s.getFlag("world", "antipodeaZone"), todayN);
    const fx = w.sceneFx && CONFIG.weatherEffects?.[w.sceneFx] ? w.sceneFx : "";
    if ((s.weather ?? "") !== fx) await s.update({ weather: fx });
  }
  // the Pokémon Phone keeps a saved week of forecasts, rebuild it so it shows the change
  try {
    await game.settings.set("antipodea-registry", "forecastCache", {});
    const D = await import("/modules/antipodea-registry/scripts/phone-data.js");
    const M = await import("/modules/antipodea-registry/scripts/maps.js");
    await D.refreshForecastCache(M.ZONES);
  } catch (e) { console.warn("Antipodea Weather | phone forecast refresh", e); }
  if (title) {
    const list = zoneKeys.map(k => rollDay(k, todayN));
    const opts = { forecast: true, issueN: todayN };
    await ChatMessage.create({ speaker: { alias: "Antipodea Weather" }, content: chatCard(list, title, opts) });
    await sendDiscord(list, title, opts);
    await publishAlerts(todayN);
  }
}

async function volcanoDialog() {
  if (!game.user.isGM) return ui.notifications.warn("Only the GM can control the volcano.");
  if (!SELF_MACRO) return ui.notifications.error('Couldn\'t find the "Antipodea Weather" macro to save the eruption on.');
  const saved = (SELF_MACRO.getFlag("world", "kahikatea") ?? []).filter(e => e.start + 40 > todayN);
  const v = volcano(todayN);
  const fmt = n => dateText(fromDn(n));
  const plan = saved.length
    ? saved.map(e => `<li>${ERUPT_NAME[e.size].replace("MAJOR ERUPTION", "Major eruption")} ${e.start > todayN ? "starts" : "started"} ${fmt(e.start)}</li>`).join("")
    : "<li>None</li>";
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: `🌋 ${VOLCANO.name} ("${VOLCANO.nick}")` },
    content: `
      <p><b>Today:</b> Volcanic Alert Level ${v.level}, ${VAL[v.level]}</p>
      <p><b>Eruptions set:</b></p><ul style="margin-top:0">${plan}</ul>
      <div class="form-group"><label>Size</label>
        <select name="size"><option value="1">Minor</option><option value="2" selected>Moderate</option><option value="3">Major</option></select></div>
      <div class="form-group"><label>When</label>
        <select name="lead"><option value="0">Today</option><option value="1">Tomorrow</option><option value="3">In 3 days</option><option value="7">In 7 days</option></select></div>
      <p style="opacity:.75;font-size:12px">Setting it a few days ahead builds up tremors and unrest first (up to 5 days), without telling players an eruption is coming.
      An eruption starting today posts a bulletin to chat and Discord straight away.</p>`,
    buttons: [
      { action: "erupt", label: "Set eruption", icon: "fa-solid fa-volcano", default: true,
        callback: (ev, btn) => ({ go: "erupt", ...new foundry.applications.ux.FormDataExtended(btn.form).object }) },
      { action: "clear", label: "Cancel all eruptions", icon: "fa-solid fa-ban", callback: () => ({ go: "clear" }) }
    ],
    rejectClose: false
  });
  if (!choice) return;
  const zones = [VOLCANO.zone, ...VOLCANO.ashTo];
  if (choice.go === "clear") {
    await SELF_MACRO.setFlag("world", "kahikatea", []);
    await refreshEverything(zones, null);
    return ui.notifications.info(`${VOLCANO.name}: eruptions cancelled. Random unrest carries on as normal.`);
  }
  const size = Number(choice.size), lead = Number(choice.lead);
  const next = [...saved, { triggered: todayN, start: todayN + lead, size }];
  await SELF_MACRO.setFlag("world", "kahikatea", next);
  if (lead === 0) {
    await refreshEverything(zones, `🌋 Volcano alert: ${VOLCANO.name}, ${dateText(date)}`);
  } else {
    await refreshEverything(zones, null);
  }
  ui.notifications.info(`${VOLCANO.name}: ${ERUPT_NAME[size].toLowerCase()} set for ${dateText(fromDn(todayN + lead))}.`);
}

// ---------- Earthquake controls (GM) ----------
async function quakeDialog() {
  if (!game.user.isGM) return ui.notifications.warn("Only the GM can set off earthquakes.");
  if (!SELF_MACRO) return ui.notifications.error('Couldn\'t find the "Antipodea Weather" macro to save the earthquake on.');
  const saved = (SELF_MACRO.getFlag("world", "quakes") ?? []).filter(q => q.start + 20 > todayN);
  const fmt = n => dateText(fromDn(n));
  const plan = saved.length
    ? saved.map(q => `<li>M${q.mag.toFixed(1)} ${q.offshore ? "offshore from" : "near"} ${q.place}, ${q.start > todayN ? "set for" : "hit"} ${fmt(q.start)}</li>`).join("")
    : "<li>None</li>";
  const placeOpts = Object.entries(QUAKE_PLACES).map(([zk, list]) =>
    `<optgroup label="${ZONES[zk].name}">${list.map(p => `<option value="${zk}|${p}">${p}</option>`).join("")}</optgroup>`).join("");
  const mags = [[5.0, "M5.0 Moderate"], [5.8, "M5.8 Strong"], [6.3, "M6.3 Strong"], [6.8, "M6.8 Severe"], [7.2, "M7.2 Severe"], [7.8, "M7.8 Severe, the Big One"]];
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: "🌍 Earthquake" },
    content: `
      <p><b>Earthquakes set:</b></p><ul style="margin-top:0">${plan}</ul>
      <div class="form-group"><label>Near</label><select name="where">${placeOpts}</select></div>
      <div class="form-group"><label>Size</label>
        <select name="mag">${mags.map(([m, t]) => `<option value="${m}" ${m === 6.3 ? "selected" : ""}>${t}</option>`).join("")}</select></div>
      <div class="form-group"><label>Offshore (tsunami risk)</label><input type="checkbox" name="offshore"></div>
      <div class="form-group"><label>When</label>
        <select name="lead"><option value="0">Today</option><option value="1">Tomorrow</option><option value="3">In 3 days</option><option value="7">In 7 days</option></select></div>
      <p style="opacity:.75;font-size:12px">Earthquakes give no warning, so nothing shows in forecasts before it hits.
      Offshore quakes of M6.5+ bring a tsunami warning for that coast, M7.5+ for nearby coasts too.
      M5+ quakes have aftershocks for days afterwards. A quake today posts to chat, Discord and players' phones straight away.</p>`,
    buttons: [
      { action: "go", label: "Set earthquake", icon: "fa-solid fa-house-crack", default: true,
        callback: (ev, btn) => ({ go: "set", ...new foundry.applications.ux.FormDataExtended(btn.form).object }) },
      { action: "clear", label: "Cancel all earthquakes", icon: "fa-solid fa-ban", callback: () => ({ go: "clear" }) }
    ],
    rejectClose: false
  });
  if (!choice) return;
  if (choice.go === "clear") {
    await SELF_MACRO.setFlag("world", "quakes", []);
    await refreshEverything(Object.keys(ZONES), null);
    return ui.notifications.info("Earthquakes cancelled. Small random quakes carry on as normal.");
  }
  const [zone, place] = String(choice.where).split("|");
  const mag = Number(choice.mag), lead = Number(choice.lead), offshore = !!choice.offshore;
  const next = [...saved.filter(q => !(q.zone === zone && q.start === todayN + lead)), { triggered: todayN, start: todayN + lead, zone, place, mag, offshore }];
  await SELF_MACRO.setFlag("world", "quakes", next);
  const hit = [zone, ...(offshore && mag >= 7.5 ? (TSUNAMI_NEAR[zone] ?? []) : []), ...(mag >= 6.5 ? (FELT_NEAR[zone] ?? []) : [])];
  if (lead === 0) await refreshEverything([...new Set(hit)], `🌍 Earthquake: M${mag.toFixed(1)} near ${place}, ${dateText(date)}`);
  else await refreshEverything([...new Set(hit)], null);
  ui.notifications.info(`M${mag.toFixed(1)} earthquake near ${place} set for ${dateText(fromDn(todayN + lead))}.`);
}

if (scope?.quake) return quakeDialog();

if (scope?.volcano) return volcanoDialog();

if (isAuto) {
  // only one client (the active GM) does the work, everyone else ignores the hook
  if (game.user !== game.users.activeGM) return;

  // the hook fires on every time change (+15 min etc), so only act once per new day
  const macroDoc = SELF_MACRO;
  const dayKey = `${date.year}-${date.month}-${date.day}`;
  if (macroDoc?.getFlag("world", "lastAutoDay") === dayKey) return;
  await macroDoc?.setFlag("world", "lastAutoDay", dayKey);

  const zoned = game.scenes.filter(s => ZONES[s.getFlag("world", "antipodeaZone")]);

  if (AUTO_SCENES) {
    for (const s of zoned) {
      const w = rollDay(s.getFlag("world", "antipodeaZone"), date);
      const fx = w.sceneFx && CONFIG.weatherEffects?.[w.sceneFx] ? w.sceneFx : "";
      if ((s.weather ?? "") !== fx) await s.update({ weather: fx });
    }
  }

  const keys = AUTO_REGION ? Object.keys(ZONES)
    : [...new Set(zoned.map(s => s.getFlag("world", "antipodeaZone")))];
  if (!keys.length) return;
  const list = keys.map(k => rollDay(k, date));
  const title = `🌏 Antipodea Weather: ${dateText(date)}`;
  const opts = { forecast: AUTO_FORECAST, issueN: todayN };
  if (AUTO_CHAT) await ChatMessage.create({ speaker: { alias: "Antipodea Weather" }, content: chatCard(list, title, opts) });
  if (AUTO_DISCORD) await sendDiscord(list, title, opts);
  await publishAlerts(todayN);
  return;
}

// ---------- manual mode (you clicked the macro) ----------
if (!game.user.isGM) return ui.notifications.warn("Only the GM can run the weather.");
const scene = canvas.scene;
const savedZone = scene?.getFlag("world", "antipodeaZone") ?? "subtropical";
const zoneOptions = Object.entries(ZONES).map(([k, z]) =>
  `<option value="${k}" ${k === savedZone ? "selected" : ""}>${z.name}</option>`).join("");

const choice = await foundry.applications.api.DialogV2.wait({
  window: { title: `Antipodea Weather: ${dateText(date)}` },
  content: `
    <div class="form-group"><label>Zone for this scene</label>
      <select name="zone">${zoneOptions}</select></div>
    <div class="form-group"><label>Apply effect to current scene</label>
      <input type="checkbox" name="toScene" checked></div>
    <div class="form-group"><label>Post to Foundry chat</label>
      <input type="checkbox" name="toChat" checked></div>
    <div class="form-group"><label>Send to Discord</label>
      <input type="checkbox" name="toDiscord" checked></div>
    <div class="form-group"><label>Include ${FORECAST_DAYS}-day forecast</label>
      <input type="checkbox" name="withForecast" checked></div>
    <p style="opacity:.75;font-size:12px">"Whole region" posts every zone's weather for the day (the scene still uses the zone above).</p>`,
  buttons: [
    { action: "zone", label: "This zone", default: true,
      callback: (ev, btn) => ({ mode: "zone", ...new foundry.applications.ux.FormDataExtended(btn.form).object }) },
    { action: "region", label: "Whole region",
      callback: (ev, btn) => ({ mode: "region", ...new foundry.applications.ux.FormDataExtended(btn.form).object }) },
    { action: "volcano", label: "🌋 Volcano", callback: () => ({ mode: "volcano" }) },
    { action: "quake", label: "🌍 Earthquake", callback: () => ({ mode: "quake" }) }
  ],
  rejectClose: false
});
if (!choice) return;
if (choice.mode === "volcano") return volcanoDialog();
if (choice.mode === "quake") return quakeDialog();

// ---------- run ----------
const here = rollDay(choice.zone, date);
const list = choice.mode === "region" ? Object.keys(ZONES).map(k => rollDay(k, date)) : [here];
const title = choice.mode === "region"
  ? `🌏 Antipodea Regional Weather: ${dateText(date)}`
  : `🌦️ Weather: ${here.zone.name}, ${dateText(date)}`;
const opts = { forecast: !!choice.withForecast, issueN: todayN };

if (scene) await scene.setFlag("world", "antipodeaZone", choice.zone);

if (choice.toScene && scene) {
  const fx = here.sceneFx && CONFIG.weatherEffects?.[here.sceneFx] ? here.sceneFx : "";
  await scene.update({ weather: fx });
}

if (choice.toChat) {
  await ChatMessage.create({ speaker: { alias: "Antipodea Weather" }, content: chatCard(list, title, opts) });
}

if (choice.toDiscord) await sendDiscord(list, title, opts);
