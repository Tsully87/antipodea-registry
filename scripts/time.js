/**
 * World clock helpers. Prefers Seasons & Stars, falls back to the core v13 calendar,
 * and finally to plain day counts so nothing ever breaks if a calendar module is off.
 */

function ssApi() {
  return game.seasonsStars?.api ?? null;
}

export function now() {
  return game.time.worldTime ?? 0;
}

export function secondsPerDay() {
  try {
    const cal = ssApi()?.getActiveCalendar?.();
    const t = cal?.time;
    if (t?.hoursInDay && t?.minutesInHour && t?.secondsInMinute) {
      return t.hoursInDay * t.minutesInHour * t.secondsInMinute;
    }
  } catch (e) { /* fall through */ }
  try {
    const d = game.time.calendar?.days;
    if (d?.hoursPerDay && d?.minutesPerHour && d?.secondsPerMinute) {
      return d.hoursPerDay * d.minutesPerHour * d.secondsPerMinute;
    }
  } catch (e) { /* fall through */ }
  return 86400;
}

export function addDays(time, days) {
  return time + days * secondsPerDay();
}

/** Returns { day, monthName, monthShort, year } or null. */
function parts(time) {
  const api = ssApi();
  if (api?.worldTimeToDate) {
    try {
      const d = api.worldTimeToDate(time);
      const cal = api.getActiveCalendar?.();
      const m = cal?.months?.[d.month - 1];
      const monthName = m?.name ?? String(d.month);
      const monthShort = m?.abbreviation ?? monthName.slice(0, 3);
      return { day: d.day, monthName, monthShort, year: d.year };
    } catch (e) { /* fall through */ }
  }
  try {
    const cal = game.time.calendar;
    if (cal?.timeToComponents) {
      const c = cal.timeToComponents(time);
      const m = cal.months?.values?.[c.month];
      const monthName = m?.name ? game.i18n.localize(m.name) : String(c.month + 1);
      const monthShort = m?.abbreviation ? game.i18n.localize(m.abbreviation) : monthName.slice(0, 3);
      return { day: c.dayOfMonth + 1, monthName, monthShort, year: c.year };
    }
  } catch (e) { /* fall through */ }
  return null;
}

/** "14 Nov" */
export function formatShort(time) {
  if (time === null || time === undefined) return "";
  const p = parts(time);
  if (!p) return `Day ${Math.floor(time / secondsPerDay())}`;
  return `${p.day} ${p.monthShort}`;
}

/** "14 Nov 2026" */
export function formatLong(time) {
  if (time === null || time === undefined) return "";
  const p = parts(time);
  if (!p) return `Day ${Math.floor(time / secondsPerDay())}`;
  return `${p.day} ${p.monthShort} ${p.year}`;
}

/** Whole days left until a time, rounded up. */
export function daysUntil(time) {
  if (time === null || time === undefined) return 0;
  return Math.max(0, Math.ceil((time - now()) / secondsPerDay()));
}

/* -------------------------------------------- */
/*  Calendar helpers for the Calendar app       */
/* -------------------------------------------- */

function coreCal() {
  const cal = game.time.calendar;
  return cal?.timeToComponents && cal?.componentsToTime && cal?.months?.values?.length ? cal : null;
}

/** Month and weekday names from whichever calendar is running, or null. */
export function calendarMeta() {
  const api = ssApi();
  try {
    const cal = api?.getActiveCalendar?.();
    if (cal?.months?.length && api.worldTimeToDate && api.dateToWorldTime) {
      return {
        source: "ss",
        months: cal.months.map((m) => ({ name: m.name, short: m.abbreviation ?? m.name.slice(0, 3) })),
        weekdays: (cal.weekdays ?? []).map((w) => w.abbreviation ?? w.name.slice(0, 3))
      };
    }
  } catch (e) { /* fall through */ }
  const core = coreCal();
  if (core) {
    const loc = (s) => (s ? game.i18n.localize(s) : "");
    return {
      source: "core",
      months: core.months.values.map((m) => ({ name: loc(m.name), short: loc(m.abbreviation) || loc(m.name).slice(0, 3) })),
      weekdays: (core.days?.values ?? []).map((w) => loc(w.abbreviation) || loc(w.name).slice(0, 3))
    };
  }
  return null;
}

/** World time -> { year, month (1-based), day (1-based), weekday (0-based) } or null. */
export function fromTime(time) {
  const meta = calendarMeta();
  if (!meta) return null;
  try {
    if (meta.source === "ss") {
      const d = ssApi().worldTimeToDate(time);
      return { year: d.year, month: d.month, day: d.day, weekday: d.weekday ?? 0 };
    }
    const c = coreCal().timeToComponents(time);
    return { year: c.year, month: c.month + 1, day: c.dayOfMonth + 1, weekday: c.dayOfWeek ?? 0 };
  } catch (e) { return null; }
}

/** { year, month (1-based), day (1-based) } at 00:00 -> world time, or null. */
export function toTime(year, month, day) {
  const meta = calendarMeta();
  if (!meta) return null;
  try {
    if (meta.source === "ss") {
      return ssApi().dateToWorldTime({ year, month, day, weekday: 0, time: { hour: 0, minute: 0, second: 0 } });
    }
    const cal = coreCal();
    const leap = cal.isLeapYear?.(year) ?? false;
    let doy = day - 1;
    for (let i = 0; i < month - 1; i++) {
      const m = cal.months.values[i];
      doy += leap && m.leapDays ? m.leapDays : m.days;
    }
    return cal.componentsToTime({ year, day: doy, hour: 0, minute: 0, second: 0 });
  } catch (e) { return null; }
}

/** Start of the day that contains this time. */
export function dayStart(time) {
  const d = fromTime(time);
  const t = d ? toTime(d.year, d.month, d.day) : null;
  if (t !== null && t <= time) return t;
  const spd = secondsPerDay();
  return Math.floor(time / spd) * spd;
}

/**
 * A month grid for the Calendar app.
 * @param {number} offset months from the current one
 */
export function monthView(offset = 0) {
  const meta = calendarMeta();
  const cur = fromTime(now());
  if (!meta || !cur) return null;
  const count = meta.months.length;
  let idx = cur.month - 1 + offset;
  let year = cur.year + Math.floor(idx / count);
  idx = ((idx % count) + count) % count;
  const month = idx + 1;

  const start = toTime(year, month, 1);
  const nextIdx = (idx + 1) % count;
  const next = toTime(nextIdx === 0 ? year + 1 : year, nextIdx + 1, 1);
  if (start === null || next === null) return null;
  const spd = secondsPerDay();
  const days = Math.max(1, Math.round((next - start) / spd));
  const firstWeekday = fromTime(start)?.weekday ?? 0;
  const todayStart = dayStart(now());

  const cells = [];
  for (let d = 1; d <= days; d++) {
    const s = start + (d - 1) * spd;
    cells.push({ day: d, start: s, isToday: s === todayStart });
  }
  return {
    title: `${meta.months[idx].name} ${year}`,
    weekdays: meta.weekdays,
    blanks: Array.from({ length: firstWeekday }, () => ({})),
    cells,
    spd
  };
}

/** "Tue 14 Nov" style label for a day start. */
export function dayLabel(time) {
  const meta = calendarMeta();
  const d = fromTime(time);
  if (!meta || !d) return formatShort(time);
  const wd = meta.weekdays[d.weekday] ?? "";
  return `${wd} ${d.day} ${meta.months[d.month - 1]?.short ?? d.month}`.trim();
}

/** "09:30" from seconds into the day. */
export function timeOfDay(time) {
  const secs = time - dayStart(time);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "13:45" for the phone status bar. */
export function clockTime() {
  const api = ssApi();
  try {
    const d = api?.getCurrentDate?.();
    if (d?.time) return `${String(d.time.hour).padStart(2, "0")}:${String(d.time.minute).padStart(2, "0")}`;
  } catch (e) { /* fall through */ }
  const secs = ((now() % secondsPerDay()) + secondsPerDay()) % secondsPerDay();
  const h = Math.floor(secs / 3600) % 24;
  const m = Math.floor((secs % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
