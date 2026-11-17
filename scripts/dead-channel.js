import { MODULE_ID } from "./constants.js";
import * as Data from "./phone-data.js";
import * as Time from "./time.js";
import * as Maps from "./maps.js";
import * as Social from "./social.js";

/**
 * The Dead Channel (MissingNo).
 *
 * Seven phone glitches the GM can fire by hand or let happen at random:
 *   call     a call from "???" that's silent and cuts out at exactly 8 seconds
 *   photo    a Gallery photo corrupts (baked into the image, so posting it spreads it)
 *   weather  the Weather app shows an impossible reading for a few seconds
 *   deadzone static over a patch of PokéMaps; phones inside it lose signal
 *   dex      a garbled #000 entry flickers into the Pokédex and vanishes when tapped
 *   glitch   the phone screen scrambles, then sometimes opens an app by itself
 *   social   a #deadchannel post from a conspiracy account
 *
 * Everything that happened is written to a GM-only journal ("📼 Dead Channel Log"),
 * along with the random settings, so players never see who's been hit or how often.
 * Dead zones are the one thing in a world setting, because every phone has to draw them.
 *
 * Per-trainer effects wait on the trainer's actor flags (deadchannel.pending) until the
 * player's own client shows them, then that client removes them and tells the GM it was seen.
 */

const F = MODULE_ID;
export const LOG_NAME = "📼 Dead Channel Log";
const MAX_LOG = 500;
const SEEN_SOCKET = "dcSeen";

export const EFFECTS = {
  call: { label: "Dead Channel call", short: "Call", icon: "fa-phone-slash", personal: true, preview: true },
  photo: { label: "Glitched photo", short: "Photo", icon: "fa-image", personal: true, preview: false },
  weather: { label: "Impossible weather", short: "Weather", icon: "fa-temperature-empty", personal: true, preview: true },
  deadzone: { label: "PokéMaps dead zone", short: "Dead zone", icon: "fa-tower-broadcast", personal: false, preview: false },
  dex: { label: "Pokédex #000", short: "Dex #000", icon: "fa-circle-question", personal: true, preview: true },
  glitch: { label: "Screen glitch", short: "Glitch", icon: "fa-tv", personal: true, preview: true },
  social: { label: "#deadchannel post", short: "Post", icon: "fa-hashtag", personal: false, preview: false }
};

export function defaultConfig() {
  return {
    random: false,
    /** Chance (0 to 1) per trainer per in-game day of a personal glitch. */
    chancePerDay: 0.05,
    /** Multiplier on that chance while a trainer's phone is inside a dead zone. */
    zoneMult: 4,
    /** In-game days a trainer is left alone after a random glitch. */
    cooldownDays: 2,
    /** Chance per in-game day that a new dead zone opens somewhere. */
    zoneChancePerDay: 0.04,
    /** Chance per in-game day that a Dead Channel account posts. */
    socialChancePerDay: 0.1,
    /** Which effects random can pick. */
    effects: { call: true, photo: true, weather: true, deadzone: true, dex: true, glitch: true, social: true }
  };
}

/* -------------------------------------------- */
/*  Seeded randomness                           */
/* -------------------------------------------- */

function rng(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const newSeed = () => Math.floor(Math.random() * 2 ** 31);
const pick = (r, list) => list[Math.floor(r() * list.length)];

/* -------------------------------------------- */
/*  The GM-only journal                         */
/* -------------------------------------------- */

export function journal() {
  return game.journal?.find((j) => j.getFlag(F, "deadChannel")) ?? null;
}

export async function ensureJournal() {
  if (!game.user.isGM) return null;
  let j = journal();
  if (j) {
    if ((j.ownership?.default ?? 0) !== CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE) {
      await j.update({ "ownership.default": CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE });
    }
    return j;
  }
  j = await JournalEntry.create({
    name: LOG_NAME,
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
    flags: { [F]: { deadChannel: true, config: defaultConfig(), log: [], last: {} } }
  });
  await j.createEmbeddedDocuments("JournalEntryPage", [{
    name: "Log", type: "text", text: { content: "<p>Nothing yet.</p>" }, flags: { [F]: { dcLogPage: true } }
  }]);
  return j;
}

export function config() {
  const stored = journal()?.getFlag(F, "config") ?? {};
  const base = defaultConfig();
  return { ...base, ...stored, effects: { ...base.effects, ...(stored.effects ?? {}) } };
}

export async function setConfig(changes) {
  const j = await ensureJournal();
  if (!j) return;
  await j.update({ [`flags.${F}.config`]: foundry.utils.mergeObject(config(), changes, { inplace: false }) });
}

export function log() {
  return journal()?.getFlag(F, "log") ?? [];
}

/** How many times each trainer has been touched. */
export function touchedCounts() {
  const counts = {};
  for (const e of log()) if (e.actorId) counts[e.actorId] = (counts[e.actorId] ?? 0) + 1;
  return counts;
}

async function addLog(entry) {
  const j = await ensureJournal();
  if (!j) return entry;
  const full = {
    id: entry.id ?? foundry.utils.randomID(),
    ms: Date.now(),
    wt: Time.now(),
    actorId: null,
    actorName: "",
    place: null,
    seen: null,
    ...entry
  };
  const list = [full, ...log()].slice(0, MAX_LOG);
  const changes = { [`flags.${F}.log`]: list };
  if (full.actorId && full.source === "random") changes[`flags.${F}.last.${full.actorId}`] = Time.now();
  await j.update(changes);
  await writeLogPage();
  return full;
}

async function patchLog(id, changes) {
  const j = journal();
  if (!j) return;
  const list = log().map((e) => (e.id === id ? { ...e, ...changes } : e));
  await j.update({ [`flags.${F}.log`]: list });
  await writeLogPage();
}

export async function clearLog() {
  const j = journal();
  if (!j) return;
  await j.update({ [`flags.${F}.log`]: [], [`flags.${F}.-=last`]: null });
  await writeLogPage();
}

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

export function seenLabel(e) {
  if (e.replaced && !e.seen) return "Replaced";
  if (!e.seen) return EFFECTS[e.kind]?.personal ? "Waiting" : "";
  const outcome = e.seen.outcome ? ` (${e.seen.outcome})` : "";
  return `Seen${outcome}`;
}

/** Keep a readable copy of the log as a page in the journal, newest first. */
async function writeLogPage() {
  const j = journal();
  if (!j) return;
  const page = j.pages.find((p) => p.getFlag(F, "dcLogPage")) ?? j.pages.contents[0];
  const rows = log().map((e) => `<tr>
      <td>${esc(Time.formatShort(e.wt))} ${esc(Time.timeOfDay(e.wt))}</td>
      <td>${esc(e.actorName || "-")}</td>
      <td>${esc(EFFECTS[e.kind]?.label ?? e.kind)}</td>
      <td>${esc(e.detail ?? "")}</td>
      <td>${e.source === "random" ? "Random" : "GM"}</td>
      <td>${esc(seenLabel(e))}</td>
    </tr>`).join("");
  const counts = Object.entries(touchedCounts())
    .map(([id, n]) => `<li>${esc(game.actors.get(id)?.name ?? "Unknown")}: ${n}</li>`).join("");
  const content = `
    <h2>Who's been touched</h2>
    ${counts ? `<ul>${counts}</ul>` : "<p>Nobody yet.</p>"}
    <h2>Everything that's happened</h2>
    ${rows ? `<table><thead><tr><th>When</th><th>Trainer</th><th>What</th><th>Details</th><th>Source</th><th>Seen</th></tr></thead><tbody>${rows}</tbody></table>` : "<p>Nothing yet.</p>"}`;
  if (page) await page.update({ "text.content": content });
  else await j.createEmbeddedDocuments("JournalEntryPage", [{ name: "Log", type: "text", text: { content }, flags: { [F]: { dcLogPage: true } } }]);
}

/* -------------------------------------------- */
/*  Who can be hit                              */
/* -------------------------------------------- */

const isTrainer = (a) => a && a.type !== "pokemon";

/** Player trainers, alphabetical. */
export function targets() {
  return game.actors.filter((a) => isTrainer(a) && a.hasPlayerOwner).sort((a, b) => a.name.localeCompare(b.name));
}

/** NPCs the GM has marked as Dead Channel accounts (conspiracy posters). */
export function accounts() {
  return game.actors.filter((a) => isTrainer(a) && !a.hasPlayerOwner && Data.getPhone(a).dcAccount)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function pendingFor(actor) {
  return actor?.getFlag(F, "deadchannel")?.pending ?? [];
}

/** Why an effect can't happen to this trainer right now, or null if it can. */
export function blocker(kind, actor) {
  const phone = actor ? Data.getPhone(actor) : null;
  switch (kind) {
    case "photo":
      if (!actor) return "Pick a trainer.";
      return phone.gallery.some((g) => !g.dcLog) ? null : "No clean photos in their Gallery.";
    case "weather":
      if (!actor) return "Pick a trainer.";
      return Data.hasApp(phone, "weather") ? null : "They don't have the Weather app (it'll wait until they get it).";
    case "social":
      return accounts().length ? null : "Mark an NPC as a Dead Channel account first (right-click it in Actors).";
    case "deadzone":
      return null;
    default:
      return actor ? null : "Pick a trainer.";
  }
}

/* -------------------------------------------- */
/*  Dead zones (world setting, everyone reads)  */
/* -------------------------------------------- */

export function zones() {
  const t = Time.now();
  return (game.settings.get(F, "deadZones") ?? []).filter((z) => z.until == null || z.until > t);
}

export function inZone(x, y) {
  return zones().some((z) => Math.hypot(z.x - x, z.y - y) <= z.r);
}

/** Is this trainer's phone inside a dead zone right now? */
export function actorInZone(actor) {
  const pin = Maps.pinById(Data.getPhone(actor).location);
  return !!pin && inZone(pin.x, pin.y);
}

async function saveZones(list) {
  await game.settings.set(F, "deadZones", list);
}

export async function removeZone(id) {
  if (!game.user.isGM) return;
  await saveZones((game.settings.get(F, "deadZones") ?? []).filter((z) => z.id !== id));
}

/** GM: drop expired zones. */
export async function pruneZones() {
  if (!Data.isActiveGM()) return;
  const all = game.settings.get(F, "deadZones") ?? [];
  const live = zones();
  if (live.length !== all.length) await saveZones(live);
}

/* -------------------------------------------- */
/*  Glitched pictures                           */
/* -------------------------------------------- */

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't load the photo."));
    img.src = src;
  });
}

/** A pixel-block smear, roughly the shape of something that shouldn't be there. */
function drawShape(ctx, r, W, H, alpha) {
  const block = Math.max(6, Math.round(Math.min(W, H) / 40));
  const cols = 3 + Math.floor(r() * 3);
  const rows = 6 + Math.floor(r() * 5);
  const x0 = Math.floor(W * (0.15 + r() * 0.6));
  const y0 = Math.floor(H * (0.1 + r() * 0.4));
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let cy = 0; cy < rows; cy++) {
    // Narrow at the top, wider below, ragged on the left edge.
    const width = cy < rows / 3 ? Math.max(1, cols - 2) : cols;
    const skip = Math.floor(r() * 2);
    for (let cx = skip; cx < width; cx++) {
      if (r() < 0.12) continue;
      const shade = Math.floor(r() * 4);
      ctx.fillStyle = ["#0b0b0f", "#2a2140", "#e8e0ff", "#5e4b8b"][shade];
      ctx.fillRect(x0 + cx * block, y0 + cy * block, block, block);
    }
  }
  ctx.restore();
}

function glitchCanvas(ctx, W, H, seed, { shape = true } = {}) {
  const r = rng(seed);
  // Torn horizontal slices.
  const slices = 7 + Math.floor(r() * 7);
  for (let i = 0; i < slices; i++) {
    const y = Math.floor(r() * H);
    const h = Math.max(2, Math.floor(r() * H * 0.09));
    const dx = Math.floor((r() - 0.5) * W * 0.45);
    ctx.drawImage(ctx.canvas, 0, y, W, h, dx, y, W, h);
  }
  // Colour channels pulled apart in one band.
  const by = Math.floor(r() * H * 0.8);
  const bh = Math.max(4, Math.floor(H * (0.05 + r() * 0.15)));
  const shift = 6 + Math.floor(r() * 18);
  const band = ctx.getImageData(0, by, W, bh);
  const src = new Uint8ClampedArray(band.data);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const j = (y * W + Math.min(W - 1, x + shift)) * 4;
      band.data[i] = src[j];
      band.data[i + 2] = src[(y * W + Math.max(0, x - shift)) * 4 + 2];
    }
  }
  ctx.putImageData(band, 0, by);
  // Blocky compression rot.
  const bs = Math.max(8, Math.round(W / 60));
  const rx = Math.floor(r() * (W - bs * 10));
  const ry = Math.floor(r() * (H - bs * 6));
  const pal = ctx.getImageData(Math.floor(r() * W), Math.floor(r() * H), 1, 1).data;
  for (let i = 0; i < 40; i++) {
    const x = rx + Math.floor(r() * 10) * bs;
    const y = ry + Math.floor(r() * 6) * bs;
    const k = r();
    ctx.fillStyle = k < 0.33 ? `rgb(${pal[0]},${pal[1]},${pal[2]})` : k < 0.66 ? "#ff00c8" : "#00ffd5";
    ctx.globalAlpha = 0.35 + r() * 0.5;
    ctx.fillRect(x, y, bs, bs);
  }
  ctx.globalAlpha = 1;
  if (shape) drawShape(ctx, r, W, H, 0.45 + r() * 0.3);
  // Scanlines.
  ctx.fillStyle = "rgba(0,0,0,0.07)";
  for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
}

/** A corrupted copy of a photo, as a JPEG data URL. Throws if the browser won't let us read it. */
export async function corruptImage(src, seed) {
  const img = await loadImage(src);
  const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
  const W = Math.round(img.naturalWidth * scale), H = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, W, H);
  glitchCanvas(ctx, W, H, seed);
  return canvas.toDataURL("image/jpeg", 0.85);
}

/** A screen full of static with a channel number, for #deadchannel posts. */
export function staticImage(seed) {
  const r = rng(seed);
  const W = 800, H = 800;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const img = ctx.createImageData(W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(r() * 255);
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // A few colour bars bleeding through.
  const bars = ["#c0c0c0", "#c0c000", "#00c0c0", "#00c000", "#c000c0", "#c00000", "#0000c0"];
  const top = Math.floor(r() * 500);
  ctx.globalAlpha = 0.25 + r() * 0.2;
  bars.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * (W / 7), top, W / 7, 80 + r() * 120); });
  ctx.globalAlpha = 1;
  glitchCanvas(ctx, W, H, seed + 1, { shape: r() < 0.7 });
  ctx.font = "bold 34px monospace";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText(pick(r, ["CH 00", "CH --", "NO SIGNAL", "00:00:08", "CH 0"]), 30, H - 40);
  return canvas.toDataURL("image/jpeg", 0.85);
}

/* -------------------------------------------- */
/*  What each effect says                       */
/* -------------------------------------------- */

const WEATHER_READINGS = [
  { temp: "-273°C", cond: "?????", extra: "Feels like: nothing" },
  { temp: "88°C", cond: "Snow", extra: "Humidity 0% · Rain 404 mm" },
  { temp: "--°C", cond: "DEAD CHANNEL", extra: "Wind 0 km/h, gusts ∞" },
  { temp: "8°C", cond: "Static", extra: "Sunrise 03:33 · Sunset 03:33" },
  { temp: "000°C", cond: "▓▓▓▓▓", extra: "UV index: ▒▒ · Visibility 8 m" },
  { temp: "-0°C", cond: "Clear (it isn't)", extra: "Chance of rain: 808%" }
];

const CAPTIONS = [
  "phone rang at 3am. no caller id. dead silence. cut out at EXACTLY 8 seconds. that's the third time this month #deadchannel",
  "check the corner of this. I didn't take this. it was just in my gallery #deadchannel #glitch",
  "weather app said -273 for about five seconds this arvo. screenshot or it didn't happen, so here's the screenshot #deadchannel",
  "anyone else's dex flash a #000 entry? tapped it and it was gone. not a bug. not a bug. #deadchannel",
  "there's a patch out past the stump where every phone just goes to static. mapped it. it MOVES #deadchannel #deadzone",
  "8 seconds. it's always 8 seconds. why 8 #deadchannel",
  "they'll tell you it's a network fault. ask them why the fault knows your name #deadchannel",
  "found this on a dead phone at the servo. owner never came back for it #deadchannel",
  "if your screen goes like this, DON'T screenshot it, just turn it off #deadchannel",
  "PSA: I've been tracking the dead zones for a year. they're not random #deadchannel #truthisoutthere",
  "rang the number back. it rang for 8 seconds. then my phone hung up on ITSELF #deadchannel",
  "old timer at the pub reckons the Dead Channel was here before phones were. reckons it just moved in #deadchannel",
  "corrupted file came through on a group chat. nobody in the group sent it #deadchannel",
  "not saying it's real. saying I've got 40 of these now #deadchannel #glitchhunters"
];

const POKETUBE_TITLES = ["DEAD CHANNEL caught on camera?!", "8 seconds of nothing (real call recording)", "Mapping the dead zones, part 7", "I tapped #000 so you don't have to"];
const TIKTOGEPI_SOUNDS = ["static (original sound)", "8 seconds of silence", "dial tone - remix"];

/* -------------------------------------------- */
/*  Firing (GM)                                 */
/* -------------------------------------------- */

async function queuePersonal(actor, kind, data, logEntry) {
  // A new one of the same kind replaces one that's still waiting.
  const old = pendingFor(actor).find((p) => p.kind === kind);
  if (old) await patchLog(old.id, { replaced: true });
  const entry = await addLog(logEntry);
  const pending = [...pendingFor(actor).filter((p) => p.kind !== kind), { id: entry.id, kind, at: Date.now(), data }];
  await actor.update({ [`flags.${F}.deadchannel.pending`]: pending });
  return entry;
}

/**
 * GM: make something happen.
 * @param {string} kind one of EFFECTS
 * @param {Actor|null} actor the trainer (optional for deadzone and social)
 * @param {object} opts { source, pinId, radius, days, accountId, platform, caption }
 */
export async function fire(kind, actor = null, opts = {}) {
  if (!game.user.isGM) return { ok: false, error: "GM only." };
  if (!EFFECTS[kind]) return { ok: false, error: "Unknown effect." };
  await ensureJournal();
  const source = opts.source ?? "gm";
  const seed = newSeed();
  const r = rng(seed);
  const base = { kind, source, actorId: actor?.id ?? null, actorName: actor?.name ?? "" };
  if (EFFECTS[kind].personal && !actor) return { ok: false, error: "Pick a trainer." };
  const place = actor ? Maps.pinById(Data.getPhone(actor).location)?.name ?? null : null;

  switch (kind) {
    case "call": {
      const answerBy = 20;
      await queuePersonal(actor, kind, { seed, ring: answerBy }, { ...base, place, detail: "Unknown caller, silent, cuts out at 0:08" });
      return { ok: true };
    }
    case "weather": {
      const reading = pick(r, WEATHER_READINGS);
      await queuePersonal(actor, kind, { seed, ...reading }, { ...base, place, detail: `${reading.temp}, ${reading.cond}` });
      return { ok: true };
    }
    case "dex": {
      await queuePersonal(actor, kind, { seed }, { ...base, place, detail: "#000 ??? appeared in the Pokédex" });
      return { ok: true };
    }
    case "glitch": {
      const opensApp = r() < 0.45;
      await queuePersonal(actor, kind, { seed, opensApp }, { ...base, place, detail: opensApp ? "Screen scrambled, then an app opened by itself" : "Screen scrambled" });
      return { ok: true };
    }
    case "photo": return firePhoto(actor, seed, { ...base, place });
    case "deadzone": return fireZone(actor, r, { ...base, place }, opts);
    case "social": return fireSocial(r, seed, base, opts);
  }
  return { ok: false };
}

async function firePhoto(actor, seed, base) {
  const phone = Data.getPhone(actor);
  const clean = phone.gallery.filter((g) => !g.dcLog);
  if (!clean.length) return { ok: false, error: "No clean photos in their Gallery." };
  const r = rng(seed);
  // Usually one of the last few they took.
  const shot = r() < 0.75 ? clean[Math.floor(r() * Math.min(5, clean.length))] : pick(r, clean);
  const entry = await addLog({ ...base, detail: `Photo from ${Time.formatShort(shot.wt)} corrupted` });
  let changes = { dcLog: entry.id, dcSeen: false };
  try {
    const dataUrl = await corruptImage(shot.src, seed);
    const src = await Data.uploadImage(dataUrl, actor.id, { quiet: true });
    if (!src) throw new Error("upload failed");
    changes = { ...changes, src, dcOrig: shot.src };
  } catch (e) {
    // The browser wouldn't let us redraw that picture (or upload space ran out),
    // so the glitch is drawn on top of it on the phone instead of baked in.
    console.warn(`${MODULE_ID} | Dead Channel: drawing the photo glitch on top instead`, e);
    changes.dcGlitch = 1 + (seed % 4);
    await patchLog(entry.id, { detail: `${entry.detail} (overlay only, so a shared copy looks clean)` });
  }
  const gallery = Data.getPhone(actor).gallery.map((g) => (g.id === shot.id ? { ...g, ...changes } : g));
  await Data.setPhone(actor, "gallery", gallery);
  return { ok: true };
}

/** GM: put a corrupted photo back the way it was. */
export async function restorePhoto(logId) {
  for (const actor of targets()) {
    const gallery = Data.getPhone(actor).gallery;
    const shot = gallery.find((g) => g.dcLog === logId);
    if (!shot) continue;
    const clean = { ...shot, src: shot.dcOrig ?? shot.src };
    for (const k of ["dcLog", "dcSeen", "dcOrig", "dcGlitch"]) delete clean[k];
    await Data.setPhone(actor, "gallery", gallery.map((g) => (g.id === shot.id ? clean : g)));
    await patchLog(logId, { restored: true });
    return true;
  }
  return false;
}

async function fireZone(actor, r, base, { pinId, radius, days } = {}) {
  let pin = pinId ? Maps.pinById(pinId) : null;
  if (!pin && actor && base.source === "gm") pin = Maps.pinById(Data.getPhone(actor).location);
  if (!pin) pin = pick(r, Maps.pins());
  if (!pin) return { ok: false, error: "No places on the map yet." };
  const exact = !!pinId;
  const x = exact ? pin.x : pin.x + Math.round((r() - 0.5) * 50);
  const y = exact ? pin.y : pin.y + Math.round((r() - 0.5) * 50);
  const rad = Number(radius) > 0 ? Number(radius) : 12 + Math.round(r() * 26);
  const d = days === undefined || days === null || days === "" ? 1 + Math.floor(r() * 5) : Number(days);
  const until = d > 0 ? Time.addDays(Time.now(), d) : null;
  const zone = { id: foundry.utils.randomID(), x, y, r: rad, near: pin.name, until, source: base.source };
  await saveZones([...(game.settings.get(F, "deadZones") ?? []), zone]);
  const km = Math.round(rad * (Number(game.settings.get(F, "mapKmPerPixel")) || 4.11));
  await addLog({ ...base, zoneId: zone.id, place: pin.name, detail: `Near ${pin.name}, about ${km} km across${until ? `, until ${Time.formatShort(until)}` : ", no end date"}` });
  return { ok: true, zone };
}

async function fireSocial(r, seed, base, { accountId, platform, caption } = {}) {
  const pool = accounts();
  const author = (accountId && game.actors.get(accountId)) || pick(r, pool);
  if (!author) return { ok: false, error: "Mark an NPC as a Dead Channel account first (right-click it in Actors)." };
  const plat = Social.PLATFORMS[platform] ? platform : pick(r, Object.keys(Social.PLATFORMS));
  const text = String(caption ?? "").trim() || pick(r, CAPTIONS);
  const src = await Data.uploadImage(staticImage(seed), "deadchannel", { quiet: true });
  if (!src) return { ok: false, error: "Couldn't upload the static picture. Check you have upload space." };
  const post = { author: author.id, platform: plat, img: src, caption: text };
  if (plat === "poketube") { post.title = pick(r, POKETUBE_TITLES); post.length = 8 + Math.floor(r() * 600); }
  if (plat === "tiktogepi") post.sound = pick(r, TIKTOGEPI_SOUNDS);
  const ok = await Data.request("post", post);
  if (ok === false) return { ok: false, error: "The post didn't go through." };
  await addLog({ ...base, actorId: null, actorName: author.name, detail: `${Social.PLATFORMS[plat].name}: "${text.slice(0, 80)}${text.length > 80 ? "..." : ""}"` });
  return { ok: true };
}

/** Random wording for the GM's post dialog. */
export function randomCaption() {
  return pick(Math.random, CAPTIONS);
}

/* -------------------------------------------- */
/*  Random (active GM, when the clock moves)    */
/* -------------------------------------------- */

const chanceOver = (perDay, days) => 1 - Math.pow(1 - Math.min(1, Math.max(0, perDay)), Math.max(0, days));

export async function rollRandom(delta) {
  if (!Data.isActiveGM() || !delta || delta <= 0) return;
  const cfg = config();
  if (!cfg.random || !journal()) return;
  const days = delta / Time.secondsPerDay();
  if (days <= 0) return;
  const last = journal().getFlag(F, "last") ?? {};
  const cooldown = (Number(cfg.cooldownDays) || 0) * Time.secondsPerDay();
  const personal = Object.keys(EFFECTS).filter((k) => EFFECTS[k].personal && cfg.effects[k]);

  for (const actor of targets()) {
    if (last[actor.id] && Time.now() - last[actor.id] < cooldown) continue;
    const mult = actorInZone(actor) ? Number(cfg.zoneMult) || 1 : 1;
    if (Math.random() >= chanceOver(cfg.chancePerDay * mult, days)) continue;
    const waiting = new Set(pendingFor(actor).map((p) => p.kind));
    const options = personal.filter((k) => !blocker(k, actor) && !waiting.has(k));
    if (!options.length) continue;
    await fire(pick(Math.random, options), actor, { source: "random" })
      .catch((e) => console.warn(`${MODULE_ID} | Dead Channel random`, e));
  }
  if (cfg.effects.deadzone && Math.random() < chanceOver(cfg.zoneChancePerDay, days)) {
    await fire("deadzone", null, { source: "random" }).catch((e) => console.warn(`${MODULE_ID} | Dead Channel zone`, e));
  }
  if (cfg.effects.social && accounts().length && Math.random() < chanceOver(cfg.socialChancePerDay, days)) {
    await fire("social", null, { source: "random" }).catch((e) => console.warn(`${MODULE_ID} | Dead Channel post`, e));
  }
}

/* -------------------------------------------- */
/*  Seen reports (player -> GM)                 */
/* -------------------------------------------- */

function reportSeen(logId, outcome = null) {
  if (!logId) return;
  const payload = { dc: SEEN_SOCKET, logId, outcome, ms: Date.now() };
  if (Data.isActiveGM()) onSocket(payload);
  else game.socket.emit(Data.SOCKET, payload);
}

export function onSocket(payload) {
  if (payload?.dc !== SEEN_SOCKET || !Data.isActiveGM()) return;
  const e = log().find((x) => x.id === payload.logId);
  if (!e || e.seen) return;
  patchLog(payload.logId, { seen: { ms: payload.ms ?? Date.now(), wt: Time.now(), outcome: payload.outcome ?? null } })
    .then(() => onLogChanged?.());
}

let onLogChanged = null;
export function setLogListener(fn) { onLogChanged = fn; }

/* -------------------------------------------- */
/*  Player side: showing things                 */
/* -------------------------------------------- */

let PhoneRef = null;
const handled = new Set();

export function init(PhoneClass) {
  PhoneRef = PhoneClass;
}

/** This client is the player looking at their own trainer's phone. */
function isViewer(actor) {
  return !game.user.isGM && !!actor?.isOwner;
}

async function consume(actor, id) {
  handled.add(id);
  const left = pendingFor(actor).filter((p) => p.id !== id);
  await actor.update({ [`flags.${F}.deadchannel.pending`]: left }).catch(() => {});
}

/** The window-level layer that survives the phone redrawing underneath it. */
function layer(app) {
  const wc = app.element?.querySelector(".window-content");
  if (!wc) return null;
  wc.classList.add("ap-dc-host");
  return wc;
}

/** Actor flags changed: a call rings even if the phone's closed. */
export function onActorUpdate(actor, changes) {
  if (!isViewer(actor) || !foundry.utils.hasProperty(changes, `flags.${F}.deadchannel`)) return;
  const call = pendingFor(actor).find((p) => p.kind === "call" && !handled.has(p.id));
  if (call) setTimeout(() => ringFor(actor, call), 2500 + Math.random() * 4000);
}

/** After login, anything that came in while the player was away. */
export function onReady() {
  if (game.user.isGM) return;
  for (const actor of game.actors.filter((a) => isTrainer(a) && a.isOwner)) {
    const call = pendingFor(actor).find((p) => p.kind === "call");
    if (call) setTimeout(() => ringFor(actor, call), 15000 + Math.random() * 20000);
  }
}

function ringFor(actor, item, preview = false) {
  if (!preview && (handled.has(item.id) || !pendingFor(actor).some((p) => p.id === item.id))) return;
  if (!preview) handled.add(item.id);
  const app = PhoneRef?.open(actor);
  if (!app) return;
  const go = () => playCall(app, item, preview);
  if (app.rendered) go(); else setTimeout(go, 400);
}

/** Called at the end of every phone render. */
export function onPhoneRender(app) {
  const actor = app.actor;
  // Signal drops out inside a dead zone (everyone sees this, GM included).
  if (actorInZone(actor)) {
    const icons = app.element.querySelector(".ap-statusbar .ap-icons");
    if (icons) {
      icons.classList.add("ap-dc-nosig");
      icons.innerHTML = '<span class="ap-dc-sos">SOS</span><i class="fa-solid fa-wifi"></i><i class="fa-solid fa-battery-quarter"></i>';
    }
  }
  if (app.app === "pokemaps" && !app.cityView) drawZones(app);

  const preview = app._dcPreview ?? null;
  if (preview) app._dcPreview = null;
  const viewer = isViewer(actor);
  const pending = viewer ? pendingFor(actor).filter((p) => !handled.has(p.id)) : [];
  const find = (kind) => (preview?.kind === kind ? preview : pending.find((p) => p.kind === kind));

  const call = find("call");
  if (call && (preview || viewer)) {
    if (preview) playCall(app, call, true); else ringFor(actor, call);
  }

  const glitch = find("glitch");
  if (glitch && !app.minimized) {
    if (!preview) consume(actor, glitch.id).then(() => reportSeen(glitch.id));
    playGlitch(app, glitch);
  }

  if (app.app === "weather") {
    const w = find("weather");
    if (w) {
      if (!preview) consume(actor, w.id).then(() => reportSeen(w.id));
      app._dcWeather = { ...w.data, until: Date.now() + 5500 };
      setTimeout(() => { if (app.rendered) app.render(); }, 5600);
    }
    if (app._dcWeather?.until > Date.now()) drawWeather(app, app._dcWeather);
  }

  if (app.app === "dex" && !app.dexSel) {
    const d = find("dex");
    if (d) {
      if (!preview) consume(actor, d.id).then(() => reportSeen(d.id));
      app._dcDex = { until: Date.now() + 12000 };
    }
    if (app._dcDex?.until > Date.now()) drawDexTile(app);
  }

  if (viewer && (app.app === "gallery" || app.app === "photo")) markPhotosSeen(app);
}

/* ---------- The call ---------- */

function playCall(app, item, preview) {
  const host = layer(app);
  if (!host || host.querySelector(".ap-dc-call")) return;
  const el = document.createElement("div");
  el.className = "ap-dc-call ringing";
  el.innerHTML = `
    <div class="ap-dc-call-top">
      <div class="ap-dc-call-face">?</div>
      <strong class="ap-dc-call-name">???</strong>
      <small class="ap-dc-call-sub">No Caller ID</small>
      <span class="ap-dc-call-time">incoming call</span>
    </div>
    <div class="ap-dc-flat"></div>
    <div class="ap-dc-call-btns">
      <button type="button" class="ap-dc-decline" data-tooltip="Decline"><i class="fa-solid fa-phone-slash"></i></button>
      <button type="button" class="ap-dc-answer" data-tooltip="Answer"><i class="fa-solid fa-phone"></i></button>
    </div>`;
  host.appendChild(el);
  const win = app.element;
  win.classList.add("ap-dc-buzz");

  let ringTimer = null, missTimer = null, clock = null, done = false;
  const ring = () => {
    try {
      if (!game.settings.get(MODULE_ID, "notificationSound")) return;
      const helper = foundry.audio?.AudioHelper ?? globalThis.AudioHelper;
      helper?.play({ src: "sounds/notify.wav", volume: 0.6, autoplay: true, loop: false }, false);
    } catch (e) { /* silence is fine, honestly fitting */ }
  };
  ring();
  ringTimer = setInterval(ring, 1600);

  const end = (outcome, wait = 0) => {
    if (done) return;
    done = true;
    clearInterval(ringTimer); clearTimeout(missTimer); clearInterval(clock);
    win.classList.remove("ap-dc-buzz");
    if (!preview) consume(app.actor, item.id).then(() => reportSeen(item.id, outcome));
    setTimeout(() => {
      el.classList.add("gone");
      setTimeout(() => el.remove(), 500);
    }, wait);
  };

  missTimer = setTimeout(() => {
    el.querySelector(".ap-dc-call-time").textContent = "";
    end("missed");
  }, (item.data?.ring ?? 20) * 1000);

  el.querySelector(".ap-dc-decline").addEventListener("click", () => end("declined"));
  el.querySelector(".ap-dc-answer").addEventListener("click", () => {
    clearInterval(ringTimer); clearTimeout(missTimer);
    win.classList.remove("ap-dc-buzz");
    el.classList.remove("ringing");
    el.classList.add("live");
    el.querySelector(".ap-dc-answer").remove();
    const t = el.querySelector(".ap-dc-call-time");
    let s = 0;
    t.textContent = "00:00";
    clock = setInterval(() => {
      s += 1;
      t.textContent = `00:0${Math.min(s, 8)}`;
      if (s >= 8) {
        clearInterval(clock);
        el.classList.add("cut");
        t.textContent = "Call ended";
        el.querySelector(".ap-dc-call-name").textContent = "???";
        el.querySelector(".ap-dc-call-btns").remove();
        end("answered", 1800);
      }
    }, 1000);
    // Hanging up early still counts as answered.
    el.querySelector(".ap-dc-decline").addEventListener("click", () => end("answered, hung up early"), { once: true });
  }, { once: true });
}

/* ---------- Screen glitch ---------- */

const GLYPHS = "▓▒░█#?0▚▞╳";

function scramble(root, r) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const saved = [];
  let n;
  while ((n = walker.nextNode())) {
    if (!n.nodeValue.trim()) continue;
    saved.push([n, n.nodeValue]);
    n.nodeValue = [...n.nodeValue].map((c) => (c.trim() && r() < 0.45 ? GLYPHS[Math.floor(r() * GLYPHS.length)] : c)).join("");
  }
  return () => saved.forEach(([node, v]) => { node.nodeValue = v; });
}

function playGlitch(app, item) {
  const host = layer(app);
  if (!host || host.querySelector(".ap-dc-static")) return;
  const r = rng(item.data?.seed ?? newSeed());
  const fx = document.createElement("div");
  fx.className = "ap-dc-static";
  host.appendChild(fx);
  host.classList.add("ap-dc-glitching");
  // Re-find the screen each time, since the phone may redraw underneath mid-glitch.
  const screen = () => app.element?.querySelector(".ap-screen");
  let restore = screen() ? scramble(screen(), r) : () => {};
  const again = setInterval(() => { restore(); restore = screen() ? scramble(screen(), r) : () => {}; }, 260);
  setTimeout(() => {
    clearInterval(again);
    restore();
    host.classList.remove("ap-dc-glitching");
    fx.remove();
    if (item.data?.opensApp && app.rendered) {
      const apps = ["gallery", "calendar", "dex", "contacts", "messages"];
      setTimeout(() => app.go(pick(r, apps)), 300);
    }
  }, 2600);
}

/* ---------- Weather ---------- */

function drawWeather(app, w) {
  const box = app.element.querySelector(".ap-weather");
  if (!box || box.querySelector(".ap-dc-weather")) return;
  const el = document.createElement("div");
  el.className = "ap-dc-weather";
  el.innerHTML = `<div class="ap-dc-temp"></div><div class="ap-dc-cond"></div><small></small>`;
  el.querySelector(".ap-dc-temp").textContent = w.temp ?? "--°C";
  el.querySelector(".ap-dc-cond").textContent = w.cond ?? "?????";
  el.querySelector("small").textContent = w.extra ?? "";
  box.prepend(el);
}

/* ---------- Pokédex #000 ---------- */

function drawDexTile(app) {
  const grid = app.element.querySelector(".ap-dex-grid");
  if (!grid || grid.querySelector(".ap-dc-tile")) return;
  const tile = document.createElement("button");
  tile.type = "button";
  tile.className = "ap-dex-tile ap-dc-tile";
  tile.innerHTML = `<span class="ap-dc-sprite"></span><small>#000</small>`;
  tile.addEventListener("click", (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    app._dcDex = null;
    tile.classList.add("gone");
    const host = layer(app);
    if (host) {
      const fx = document.createElement("div");
      fx.className = "ap-dc-static short";
      host.appendChild(fx);
      setTimeout(() => fx.remove(), 450);
    }
    setTimeout(() => tile.remove(), 400);
  });
  grid.prepend(tile);
  const summary = app.element.querySelector(".ap-dex-summary");
  if (summary && !summary.querySelector(".ap-dc-count")) {
    const c = document.createElement("small");
    c.className = "ap-dc-count";
    c.textContent = " +1";
    summary.appendChild(c);
  }
}

/* ---------- PokéMaps ---------- */

function drawZones(app) {
  const wrap = app.element.querySelector(".ap-map-wrap");
  if (!wrap) return;
  for (const z of zones()) {
    const d = document.createElement("div");
    d.className = "ap-dc-zone";
    d.style.left = `${(z.x / Maps.MAP_W) * 100}%`;
    d.style.top = `${(z.y / Maps.MAP_H) * 100}%`;
    d.style.width = `${((z.r * 2) / Maps.MAP_W) * 100}%`;
    d.style.aspectRatio = "1";
    wrap.appendChild(d);
  }
}

/* ---------- Photos ---------- */

async function markPhotosSeen(app) {
  const actor = app.actor;
  const gallery = Data.getPhone(actor).gallery;
  const shown = app.app === "photo" ? gallery.filter((g) => g.id === app.photoId) : gallery;
  const fresh = shown.filter((g) => g.dcLog && !g.dcSeen && !handled.has(`photo-${g.dcLog}`));
  if (!fresh.length) return;
  fresh.forEach((g) => handled.add(`photo-${g.dcLog}`));
  const ids = new Set(fresh.map((g) => g.id));
  await Data.setPhone(actor, "gallery", gallery.map((g) => (ids.has(g.id) ? { ...g, dcSeen: true } : g))).catch(() => {});
  fresh.forEach((g) => reportSeen(g.dcLog));
}

/* -------------------------------------------- */
/*  GM preview                                  */
/* -------------------------------------------- */

/** GM: see an effect on your own screen, on that trainer's phone. Nothing's logged or sent. */
export function preview(kind, actor) {
  if (!game.user.isGM || !EFFECTS[kind]?.preview || !actor) return;
  const seed = newSeed();
  const r = rng(seed);
  const data = kind === "weather" ? { seed, ...pick(r, WEATHER_READINGS) } : { seed, opensApp: kind === "glitch" ? r() < 0.45 : false, ring: 20 };
  const item = { id: `preview-${seed}`, kind, data };
  const app = PhoneRef?.open(actor);
  if (!app) return;
  if (kind === "call") return ringFor(actor, item, true);
  app._dcPreview = item;
  const screen = { weather: "weather", dex: "dex" }[kind];
  if (screen) app.go(screen, screen === "dex" ? { dexSel: null } : {});
  else app.render();
}
