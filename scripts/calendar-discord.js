import { MODULE_ID } from "./constants.js";
import * as Cal from "./calendar.js";
import * as Time from "./time.js";
import * as Data from "./phone-data.js";

/**
 * Discord posting for the Antipodea Calendar: a day-of announcement when a major festival
 * starts, and a weekly heads-up listing what's coming. Founders' Days never post here —
 * phone calendar only, per the locked design.
 */

function webhookUrl() {
  try { return game.settings.get(MODULE_ID, "calendarWebhookUrl")?.trim() ?? ""; }
  catch (e) { return ""; }
}

function enabled() {
  return game.user.isGM && game.settings.get(MODULE_ID, "calendarDiscord") && !!webhookUrl();
}

async function post(content) {
  if (!enabled()) return false;
  try {
    const res = await fetch(webhookUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } })
    });
    if (!res.ok) throw new Error(`Discord replied ${res.status}`);
    return true;
  } catch (err) {
    console.error(`${MODULE_ID} | Calendar Discord post failed`, err);
    ui.notifications.warn("Antipodea Calendar: couldn't post to Discord. Check the calendar webhook URL in module settings.");
    return false;
  }
}

function dateFor(worldTime) {
  const d = game.seasonsStars?.api?.worldTimeToDate?.(worldTime);
  return d ? { year: d.year, month: d.month, day: d.day, weekday: d.weekday ?? 0 } : null;
}

/** Day-of announcements: any major event starting exactly today gets a post, once per in-game day. */
export async function checkDayOf(worldTime) {
  if (!Data.isActiveGM()) return;
  const date = dateFor(worldTime);
  if (!date) return;
  const key = `calendar-dayof:${date.year}-${date.month}-${date.day}`;
  if (!await Data.claim(key)) return;

  const starting = Cal.upcomingMajors(date, 0); // daysOut === 0 => starts today
  for (const { event } of starting) {
    const span = event.duration ? ` (runs ${Cal.durationDays(event)} days)` : "";
    await post(`🎉 **${event.name}** starts today!${span}\n${event.description}`);
  }
}

/** Weekly heads-up: once every 7 in-game days, list majors coming up in the next fortnight. */
export async function checkWeeklyHeadsUp(worldTime) {
  if (!Data.isActiveGM()) return;
  const date = dateFor(worldTime);
  if (!date) return;
  if (date.weekday !== 1) return; // Monday, to land near the weather forecast's cadence
  const key = `calendar-headsup:${date.year}-${weekOf(date)}`;
  if (!await Data.claim(key)) return;

  const upcoming = Cal.upcomingMajors(date, 14).filter((x) => x.daysOut > 0);
  if (!upcoming.length) return;
  const lines = upcoming.map(({ event, daysOut }) =>
    `• **${event.name}** — in ${daysOut} day${daysOut === 1 ? "" : "s"}${event.duration ? ` (${Cal.durationDays(event)} days)` : ""}`
  );
  await post(`📅 **Coming up on the calendar:**\n${lines.join("\n")}`);
}

/** A rough in-world week number, just to key the once-a-week claim. */
function weekOf(date) {
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let n = date.day;
  for (let i = 0; i < date.month - 1; i++) n += days[i];
  return Math.floor(n / 7);
}
