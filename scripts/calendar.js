import { ANTIPODEA_EVENTS, MAJOR_EVENTS } from "./calendar-data.js";

/**
 * Installs the Antipodea Calendar: a Seasons & Stars calendar that keeps the Gregorian
 * month/weekday names, structure, and timekeeping, but carries none of S&S's built-in
 * real-world holidays — only the homebrew events in calendar-data.js.
 *
 * S&S's API has no "get calendar definition by id" call, so the Gregorian structure below
 * is a fixed copy of S&S's own built-in gregorian.json (months, weekdays, year, leap rule,
 * solar anchors, time, moons) — stable, built-in data that doesn't change. Seasons are
 * flipped to the Southern Hemisphere mapping the calendar design assumes (summer = Dec/Jan/Feb).
 */

export const CALENDAR_ID = "antipodea-gregorian";

/** "3d" -> 3. Exported so other modules can show a human duration without reaching into internals. */
export function durationDays(event) {
  const m = /^(\d+)d$/.exec(event?.duration ?? "");
  return m ? Math.max(1, parseInt(m[1], 10)) : 1;
}

const GREGORIAN_BASE = {
  year: { epoch: 0, currentYear: 2024, prefix: "", suffix: "", startDay: 6 },
  leapYear: { rule: "gregorian", month: "February", extraDays: 1 },
  months: [
    { name: "January", abbreviation: "Jan", days: 31 },
    { name: "February", abbreviation: "Feb", days: 28 },
    { name: "March", abbreviation: "Mar", days: 31 },
    { name: "April", abbreviation: "Apr", days: 30 },
    { name: "May", abbreviation: "May", days: 31 },
    { name: "June", abbreviation: "Jun", days: 30 },
    { name: "July", abbreviation: "Jul", days: 31 },
    { name: "August", abbreviation: "Aug", days: 31 },
    { name: "September", abbreviation: "Sep", days: 30 },
    { name: "October", abbreviation: "Oct", days: 31 },
    { name: "November", abbreviation: "Nov", days: 30 },
    { name: "December", abbreviation: "Dec", days: 31 }
  ],
  weekdays: [
    { name: "Sunday", abbreviation: "Sun" },
    { name: "Monday", abbreviation: "Mon" },
    { name: "Tuesday", abbreviation: "Tue" },
    { name: "Wednesday", abbreviation: "Wed" },
    { name: "Thursday", abbreviation: "Thu" },
    { name: "Friday", abbreviation: "Fri" },
    { name: "Saturday", abbreviation: "Sat" }
  ],
  intercalary: [],
  // Southern Hemisphere mapping, matching the calendar design's "summer = Dec/Jan/Feb" assumption.
  seasons: [
    { name: "Summer", startMonth: 12, endMonth: 2, icon: "summer", description: "The warmest season, long days on the coast." },
    { name: "Autumn", startMonth: 3, endMonth: 5, icon: "fall", description: "Harvest season, cooling down." },
    { name: "Winter", startMonth: 6, endMonth: 8, icon: "winter", description: "The cold season, snow in the alpine zones." },
    { name: "Spring", startMonth: 9, endMonth: 11, icon: "spring", description: "Wildflowers and renewal as things warm up again." }
  ],
  solarAnchors: [
    { id: "winter-solstice", label: "Winter Solstice", type: "solstice", subtype: "winter", month: 6, day: 21, sunrise: "07:23", sunset: "16:44" },
    { id: "vernal-equinox", label: "Vernal Equinox", type: "equinox", subtype: "vernal", month: 9, day: 22, sunrise: "06:53", sunset: "19:04" },
    { id: "summer-solstice", label: "Summer Solstice", type: "solstice", subtype: "summer", month: 12, day: 21, sunrise: "05:42", sunset: "20:36" },
    { id: "autumnal-equinox", label: "Autumnal Equinox", type: "equinox", subtype: "autumnal", month: 3, day: 20, sunrise: "07:11", sunset: "19:20" }
  ],
  time: { hoursInDay: 24, minutesInHour: 60, secondsInMinute: 60, amPmNotation: { am: "AM", pm: "PM" } },
  moons: [
    {
      name: "Luna", cycleLength: 29.53059,
      firstNewMoon: { year: 2024, month: 1, day: 11 },
      phases: [
        { name: "New Moon", length: 1, singleDay: true, icon: "new" },
        { name: "Waxing Crescent", length: 6.3826475, singleDay: false, icon: "waxing-crescent" },
        { name: "First Quarter", length: 1, singleDay: true, icon: "first-quarter" },
        { name: "Waxing Gibbous", length: 6.3826475, singleDay: false, icon: "waxing-gibbous" },
        { name: "Full Moon", length: 1, singleDay: true, icon: "full" },
        { name: "Waning Gibbous", length: 6.3826475, singleDay: false, icon: "waning-gibbous" },
        { name: "Last Quarter", length: 1, singleDay: true, icon: "last-quarter" },
        { name: "Waning Crescent", length: 6.3826475, singleDay: false, icon: "waning-crescent" }
      ],
      color: "#f0f0f0"
    }
  ]
};

function ssApi() {
  return game.seasonsStars?.api ?? null;
}

function buildCalendar() {
  const cal = foundry.utils.deepClone(GREGORIAN_BASE);
  cal.id = CALENDAR_ID;
  cal.translations = {
    en: {
      label: "Antipodea Calendar",
      description: "Gregorian month and weekday names, homebrew events only — no real-world holidays.",
      setting: "Antipodea"
    }
  };
  cal.sources = [];
  cal.events = foundry.utils.deepClone(ANTIPODEA_EVENTS);
  return cal;
}

/** GM only: load/refresh the Antipodea Calendar and make it active if it isn't already. */
export async function install() {
  if (!game.user.isGM) return false;
  const api = ssApi();
  if (!api) return false;
  try {
    api.loadCalendar(buildCalendar());
    const active = api.getActiveCalendar();
    if (active?.id !== CALENDAR_ID) await api.setActiveCalendar(CALENDAR_ID);
    return true;
  } catch (e) {
    console.error("antipodea-registry | calendar install failed", e);
    return false;
  }
}

/** Events (major + Founders' Days) whose span covers this { year, month, day }. */
export function eventsOnDate(date) {
  if (!date) return [];
  return ANTIPODEA_EVENTS.filter((e) => spanContains(e, date));
}

/** Major events (not Founders' Days) starting within the next `days` days, soonest first. */
export function upcomingMajors(fromDate, days) {
  return upcomingEvents(fromDate, days, MAJOR_EVENTS);
}

/** Any event (majors + Founders' Days, unless given a narrower list) starting within the next `days` days. */
export function upcomingEvents(fromDate, days, from = ANTIPODEA_EVENTS) {
  if (!fromDate) return [];
  return from
    .map((e) => ({ event: e, daysOut: nextStartOffset(e, fromDate) }))
    .filter((x) => x.daysOut !== null && x.daysOut >= 0 && x.daysOut <= days)
    .sort((a, b) => a.daysOut - b.daysOut);
}

/** Day-of-year ordinal (1-365/366), ignoring leap-day edge cases — fine for day-distance math within a year. */
function toOrdinal({ month, day }) {
  const days = GREGORIAN_BASE.months.map((m) => m.days);
  let n = day;
  for (let i = 0; i < month - 1; i++) n += days[i];
  return n;
}

const YEAR_LENGTH = GREGORIAN_BASE.months.reduce((n, m) => n + m.days, 0);

/** Days from `fromDate` until this event's next start (0 = starts today), or null if not a fixed-date event. */
function nextStartOffset(event, fromDate) {
  if (event.recurrence?.type !== "fixed") return null;
  const startOrd = toOrdinal({ month: event.recurrence.month, day: event.recurrence.day });
  const fromOrd = toOrdinal(fromDate);
  let diff = startOrd - fromOrd;
  if (diff < 0) diff += YEAR_LENGTH;
  return diff;
}

/** Does this event's span (start date + duration) cover `date`? Same-year only. */
function spanContains(event, date) {
  if (event.recurrence?.type !== "fixed") return false;
  const startOrd = toOrdinal({ month: event.recurrence.month, day: event.recurrence.day });
  const dateOrd = toOrdinal(date);
  const len = durationDays(event);
  return dateOrd >= startOrd && dateOrd < startOrd + len;
}
