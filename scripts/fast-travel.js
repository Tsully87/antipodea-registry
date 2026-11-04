import * as Time from "./time.js";

/**
 * Antipodea's four fast-travel services: Swellow Air, The Rhyhorn Express,
 * The Wailord Line and The Mantine Line. Fares, routes and running days match
 * the "Fast Travel" section of Antipodea.md exactly — this file is the game
 * mechanics for that lore, not a separate source of truth.
 */

export const HUB = "bunya-city";
const DAILY = [0, 1, 2, 3, 4, 5, 6];

/** Three standard departures a day for services that run more than once daily. */
const STANDARD_SLOTS = [
  { time: 7 * 3600, label: "07:00", mult: 0.9, tag: "Early bird" },
  { time: 12 * 3600, label: "12:00", mult: 1.15, tag: "Midday" },
  { time: 17 * 3600, label: "17:00", mult: 1 }
];

/* -------------------------------------------- */
/*  Swellow Air                                 */
/* -------------------------------------------- */

export const SWELLOW = {
  key: "swellow",
  label: "Swellow Air",
  icon: "fa-plane",
  color: "#1c7ed6",
  slots: STANDARD_SLOTS,
  spokes: [
    { pin: "budgie-beach", fare: 600, hours: 0.75 },
    { pin: "waratah-city", fare: 700, hours: 1 },
    { pin: "snow-gum-city", fare: 900, hours: 1.5 },
    { pin: "banksia-city", fare: 1000, hours: 2 },
    { pin: "bonza-bay", fare: 1300, hours: 2.5 },
    { pin: "paperbark-city", fare: 1600, hours: 3.5 },
    { pin: "boab-city", fare: 1700, hours: 4 },
    { pin: "hard-yakka-city", fare: 1600, hours: 4 },
    { pin: "kangaroo-paw-city", fare: 1500, hours: 3.5 },
    { pin: "jarrah-city", fare: 1400, hours: 3 },
    { pin: "black-stump-city", fare: 1200, hours: 2.5 },
    { pin: "fair-dinkum-city", fare: 1300, hours: 2.5 },
    { pin: "kauri-city", fare: 2800, hours: 6, days: [0, 2, 4, 6], note: "Tasman crossing" },
    { pin: "stoked-city", fare: 2800, hours: 6, days: [0, 2, 4, 6], note: "Tasman crossing" }
  ]
};

/* -------------------------------------------- */
/*  The Rhyhorn Express                         */
/* -------------------------------------------- */

export const RHYHORN = {
  key: "rhyhorn",
  label: "The Rhyhorn Express",
  icon: "fa-train",
  color: "#9c6b1f",
  days: [0, 2, 4, 6],
  departure: 8 * 3600,
  legFare: 250,
  stops: [
    { pin: "bunya-city", day: 0, fare: 0 },
    { pin: "black-stump-city", day: 1, fare: 350 },
    { pin: "hard-yakka-city", day: 2, fare: 700 },
    { pin: "boab-city", day: 3, fare: 950 },
    { pin: "paperbark-city", day: 4, fare: 1200 }
  ]
};

/* -------------------------------------------- */
/*  The Wailord Line                            */
/* -------------------------------------------- */

export const WAILORD = {
  key: "wailord",
  label: "The Wailord Line",
  icon: "fa-ship",
  color: "#0b5394",
  crossings: [
    { id: "tasman", label: "Tasman crossing", from: "waratah-city", to: "kawakawa-harbour", fare: 500, hours: 18, days: [0, 3, 5], departure: 20 * 3600, overnight: true },
    { id: "strait", label: "Strait crossing", from: "banksia-city", to: "huon-pine-city", fare: 350, hours: 6, days: DAILY, slots: [{ time: 8 * 3600, label: "08:00", mult: 0.9 }, { time: 15 * 3600, label: "15:00", mult: 1.1 }] },
    { id: "interisland", label: "Inter-island crossing", from: "kawakawa-harbour", to: "gumboot-plains", fare: 500, hours: 12, days: [1, 3, 5], departure: 21 * 3600, overnight: true },
    { id: "southern", label: "Southern crossing", from: "huon-pine-city", to: "miro-sound", fare: 600, hours: 24, days: [0, 4], departure: 18 * 3600, overnight: true }
  ]
};

/* -------------------------------------------- */
/*  The Mantine Line                            */
/* -------------------------------------------- */

export const MANTINE = {
  key: "mantine",
  label: "The Mantine Line",
  icon: "fa-water",
  color: "#0c8599",
  hopFare: 200,
  hopHours: 3,
  slots: STANDARD_SLOTS,
  stops: ["waratah-city", "budgie-beach", "bunya-city"]
};

export const ALL_PINS = new Set([
  HUB, ...SWELLOW.spokes.map((s) => s.pin), ...RHYHORN.stops.map((s) => s.pin),
  ...WAILORD.crossings.flatMap((c) => [c.from, c.to]), ...MANTINE.stops
]);

/* -------------------------------------------- */
/*  Scheduling                                  */
/* -------------------------------------------- */

function weekLen() {
  return Time.calendarMeta()?.weekdays?.length ?? 7;
}

/** Does a service with this running-days pattern go on this weekday? Falls back to daily on a non-7-day calendar. */
function runsOn(days, weekday) {
  if (!days || weekday === null || weekday === undefined) return true;
  if (weekLen() !== 7) return true;
  return days.includes(weekday);
}

/**
 * The next few departures (world-time timestamps) for a leg that runs on `days`
 * at the given `slots` (each { time, label, mult }). Looks up to 21 days ahead.
 */
function nextDepartures(days, slots, count = 3) {
  const spd = Time.secondsPerDay();
  const todayStart = Time.dayStart(Time.now());
  const out = [];
  for (let i = 0; out.length < count && i < 21; i++) {
    const ds = todayStart + i * spd;
    const d = Time.fromTime(ds);
    if (!runsOn(days, d?.weekday)) continue;
    for (const slot of slots) {
      const dep = ds + slot.time;
      if (dep < Time.now()) continue;
      out.push({ time: dep, dayLabel: Time.dayLabel(ds), clock: slot.label, mult: slot.mult ?? 1, tag: slot.tag ?? null });
      if (out.length >= count) break;
    }
  }
  return out;
}

function formatClock(seconds) {
  const h = Math.floor(seconds / 3600) % 24;
  const m = Math.floor((seconds % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function fmtHours(h) {
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (Number.isInteger(h)) return `${h} hr`;
  return `${h} hr`;
}

/** One normalized departure option: { service, legId, toPin, label, icon, color, baseFare, hours, note, overnight, departures }. */
function buildLeg(service, legId, toPin, { label, icon, color, baseFare, hours, note, overnight, days, slots }) {
  return {
    service, legId, toPin, label, icon, color, baseFare, hours,
    hoursLabel: fmtHours(hours), note: note ?? null, overnight: !!overnight,
    departures: nextDepartures(days, slots)
  };
}

/** All fast-travel legs departing from a given map pin, across all four services. */
export function legsFrom(pinId) {
  const legs = [];

  // Swellow Air: hub <-> spoke, both directions through Bunya City.
  if (pinId === HUB) {
    for (const s of SWELLOW.spokes) {
      legs.push(buildLeg("swellow", s.pin, s.pin, {
        label: SWELLOW.label, icon: SWELLOW.icon, color: SWELLOW.color, baseFare: s.fare, hours: s.hours,
        note: s.note, days: s.days ?? DAILY, slots: SWELLOW.slots
      }));
    }
  } else {
    const s = SWELLOW.spokes.find((x) => x.pin === pinId);
    if (s) {
      legs.push(buildLeg("swellow", HUB, HUB, {
        label: SWELLOW.label, icon: SWELLOW.icon, color: SWELLOW.color, baseFare: s.fare, hours: s.hours,
        note: s.note, days: s.days ?? DAILY, slots: SWELLOW.slots
      }));
    }
  }

  // Rhyhorn Express: any stop to any other stop on the line.
  const ri = RHYHORN.stops.findIndex((x) => x.pin === pinId);
  if (ri !== -1) {
    for (let j = 0; j < RHYHORN.stops.length; j++) {
      if (j === ri) continue;
      const from = RHYHORN.stops[ri], to = RHYHORN.stops[j];
      const fare = from.pin === HUB ? to.fare : to.pin === HUB ? from.fare : RHYHORN.legFare * Math.abs(j - ri);
      const days = Math.abs(to.day - from.day);
      legs.push(buildLeg("rhyhorn", `${to.pin}`, to.pin, {
        label: RHYHORN.label, icon: RHYHORN.icon, color: RHYHORN.color, baseFare: fare, hours: Math.max(1, days) * 24,
        days: RHYHORN.days, slots: [{ time: RHYHORN.departure, label: formatClock(RHYHORN.departure), mult: 1 }]
      }));
    }
  }

  // The Wailord Line: fixed crossings, both directions.
  for (const c of WAILORD.crossings) {
    if (c.from === pinId || c.to === pinId) {
      const toPin = c.from === pinId ? c.to : c.from;
      legs.push(buildLeg("wailord", c.id, toPin, {
        label: WAILORD.label, icon: WAILORD.icon, color: WAILORD.color, baseFare: c.fare, hours: c.hours,
        note: c.label, overnight: c.overnight, days: c.days,
        slots: c.slots ?? [{ time: c.departure, label: formatClock(c.departure), mult: 1 }]
      }));
    }
  }

  // The Mantine Line: coastal hops, any stop to any other.
  const mi = MANTINE.stops.indexOf(pinId);
  if (mi !== -1) {
    for (let j = 0; j < MANTINE.stops.length; j++) {
      if (j === mi) continue;
      const n = Math.abs(j - mi);
      legs.push(buildLeg("mantine", MANTINE.stops[j], MANTINE.stops[j], {
        label: MANTINE.label, icon: MANTINE.icon, color: MANTINE.color, baseFare: MANTINE.hopFare * n, hours: MANTINE.hopHours * n,
        days: DAILY, slots: MANTINE.slots
      }));
    }
  }

  return legs;
}

/** Re-derive a leg's base fare/hours server-side from (service, fromPin, toPin) — never trust the client's numbers. */
export function findLeg(fromPin, service, toPin) {
  return legsFrom(fromPin).find((l) => l.service === service && l.toPin === toPin) ?? null;
}
