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
