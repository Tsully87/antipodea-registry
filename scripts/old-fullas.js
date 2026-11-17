import { MODULE_ID } from "./constants.js";
import * as Data from "./phone-data.js";
import * as Maps from "./maps.js";
import * as Time from "./time.js";
import * as DC from "./dead-channel.js";

/**
 * Old Fulla sightings: a very small chance that trainers run into one of the Lower
 * Pantheon or the Outsiders where the lore puts them.
 *
 * Automatic: when trainers arrive somewhere (their phone location changes), one roll per
 * Old Fulla whose area that is, for the group that arrived together, at most once per
 * in-game day per trainer per Old Fulla. Manual: the GM rolls for whoever is there.
 *
 * A hit is whispered to the GM only. Every check, hit or miss, goes in a GM-only journal.
 */

const F = MODULE_ID;
export const LOG_NAME = "🌿 Old Fullas Log";
const MAX_LOG = 500;

/**
 * Where each one can turn up. pins and zones are matched by name (PokéMaps places and
 * weather zones); deadZone means anywhere inside a Dead Channel dead zone.
 */
export const OLD_FULLAS = [
  // Lower Pantheon
  { id: "articuno", name: "Old Frostbite", species: "Articuno", band: "Lower Pantheon", pins: ["Silver Fern Plateau"], where: "the high cirques above Silver Fern Plateau", legend: "A glimpse means the mountain approves of you." },
  { id: "zapdos", name: "The Sparkie", species: "Zapdos", band: "Lower Pantheon", pins: ["Huon Pine City", "Leatherwood"], where: "the storm coast off Huon Pine City", legend: "Rough Strait crossings are the Sparkie having a mood." },
  { id: "moltres", name: "Old Scorcher", species: "Moltres", band: "Lower Pantheon", pins: ["Black Stump City"], where: "the heat shimmer past Black Stump City", legend: "The worst heatwaves are Old Scorcher stretching his wings." },
  { id: "raikou", name: "The Lightning Drover", species: "Raikou", band: "Lower Pantheon", zones: ["The Red Heart"], where: "the Overlander's inland roads", legend: "A flash of static just before a big storm front." },
  { id: "entei", name: "Old Firebreak", species: "Entei", band: "Lower Pantheon", zones: ["The Big Wet"], where: "the old droving trails of the Kimberley and the West", legend: "Stops grassfires jumping fence lines they shouldn't." },
  { id: "suicune", name: "Old Clearwater", species: "Suicune", band: "Lower Pantheon", pins: ["Lilly Pilly Town", "Ironbark"], where: "the East Coast rivers around Lilly Pilly Town", legend: "Rivers she walks stay clean." },
  { id: "celebi", name: "The Bunya Ghost", species: "Celebi", band: "Lower Pantheon", pins: ["Bunya City"], where: "the bunya pine forests around Bunya City", legend: "A flash of green in the canopy: the forest needs help, or just got it." },
  { id: "regirock", name: "Old Stoneface", species: "Regirock", band: "Lower Pantheon", pins: ["Black Stump City"], where: "a lost cairn past Black Stump City", legend: "Nobody's found the spot in living memory." },
  { id: "regice", name: "Old Iceblock", species: "Regice", band: "Lower Pantheon", pins: ["Snow Gum City"], where: "a moraine above Snow Gum City", legend: "Only visible after a hard melt." },
  { id: "registeel", name: "Old Ironhide", species: "Registeel", band: "Lower Pantheon", pins: ["Hard Yakka City"], where: "the old mine workings at Hard Yakka City", legend: "Don't work a tunnel that sounds hollow in the wrong way." },
  { id: "jirachi", name: "The Shooting Star", species: "Jirachi", band: "Lower Pantheon", pins: ["Matai Isle"], where: "a meteor-scarred paddock on Matai Isle", legend: "Leave a window open and something nice on the sill." },
  { id: "eon", name: "The Lovebirds", species: "Latias / Latios", band: "Lower Pantheon", pins: ["Miro Sound"], where: "the twin sea stacks off Miro Sound", legend: "A calm crossing means the Lovebirds are in a good mood." },
  { id: "lake", name: "The Quiet Three", species: "Uxie / Mesprit / Azelf", band: "Lower Pantheon", pins: ["Fair Dinkum City"], where: "the linked salt lakes near Fair Dinkum City", legend: "Never swim the deepest lake." },
  { id: "manaphy", name: "The Reef Mother", species: "Manaphy (or Phione)", band: "Lower Pantheon", pins: ["Bonza Bay"], where: "the coral reef off Bonza Bay", legend: "Harming one is the worst luck going." },
  { id: "shaymin", name: "The Mender", species: "Shaymin", band: "Lower Pantheon", zones: ["Snowgum High Country", "Waratah Coast"], where: "wherever the Great Dividing Range last burned", legend: "Early regrowth means she's been through." },
  { id: "swords", name: "The Outback Wardens", species: "Cobalion / Terrakion / Virizion / Keldeo", band: "Lower Pantheon", pins: ["Woop Woop"], where: "the untouched scrub past Woop Woop", legend: "Four riders who stop anyone exploiting the land." },
  { id: "kami", name: "The Weathermakers", species: "Tornadus / Thundurus / Landorus", band: "Lower Pantheon", pins: ["Tōtara Ridge"], where: "Tōtara Ridge and the crossing over Mount Kahikatea", legend: "The volcano's just caught in the middle of their arguments." },
  { id: "meloetta", name: "The Busker", species: "Meloetta", band: "Lower Pantheon", pins: ["Waratah City"], where: "the backstreets and open mics of Waratah City", legend: "One incredible set, never seen again." },
  { id: "diancie", name: "The Lucky Gem", species: "Diancie", band: "Lower Pantheon", pins: ["Galah Flats"], where: "the gem fields near Galah Flats", legend: "Push a lucky vein and the luck sours fast." },
  // Outsiders
  { id: "mewtwo", name: "The Manufactured Men", species: "Mewtwo", band: "Outsiders", zones: ["The Red Heart"], where: "somewhere out past the Red Centre", legend: "Someone's running a breeding program. Nobody's ever proved it." },
  { id: "deoxys", name: "The Falling Star", species: "Deoxys", band: "Outsiders", pins: ["Black Stump City"], where: "the lights in the sky past Black Stump City", legend: "Still signalling each other, the believers say." },
  { id: "genesect", name: "The Old World Predator", species: "Genesect", band: "Outsiders", zones: ["Rainforest Reach", "Huon Isle"], where: "remote bush where something metallic moves through the scrub", legend: "The cryptid hunters' white whale." },
  { id: "missingno", name: "The Dead Channel", species: "MissingNo", band: "Outsiders", deadZone: true, where: "inside a dead zone", legend: "Whatever's reaching through the static." }
];

const byId = new Map(OLD_FULLAS.map((o) => [o.id, o]));
const isTrainer = (a) => a && a.type !== "pokemon";

/** Old Fullas whose area includes this PokéMaps place. */
const norm = (t) => String(t ?? "").normalize("NFC").toLowerCase();

export function candidatesAt(pin) {
  if (!pin) return [];
  const name = norm(pin.name), zone = norm(pin.zone);
  return OLD_FULLAS.filter((o) =>
    (o.pins ?? []).some((p) => norm(p) === name) ||
    (o.zones ?? []).some((z) => norm(z) === zone) ||
    (o.deadZone && DC.inZone(pin.x, pin.y)));
}

export const autoOn = () => !!game.settings.get(F, "oldFullasAuto");
export const autoChance = () => Math.max(0, Number(game.settings.get(F, "oldFullasAutoChance")) || 0);
export const manualChance = () => Math.max(0, Number(game.settings.get(F, "oldFullasManualChance")) || 0);

/* -------------------------------------------- */
/*  GM-only journal                             */
/* -------------------------------------------- */

export function journal() {
  return game.journal?.find((j) => j.getFlag(F, "oldFullas")) ?? null;
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
    flags: { [F]: { oldFullas: true, log: [], checked: {} } }
  });
  await j.createEmbeddedDocuments("JournalEntryPage", [{ name: "Log", type: "text", text: { content: "<p>No checks yet.</p>" }, flags: { [F]: { ofLogPage: true } } }]);
  return j;
}

export const log = () => journal()?.getFlag(F, "log") ?? [];

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const dayKey = () => {
  const d = Time.fromTime(Time.now());
  return d ? `${d.year}-${d.month}-${d.day}` : String(Math.floor(Time.now() / Time.secondsPerDay()));
};

async function writeLog(entries, checkedChanges = {}) {
  const j = await ensureJournal();
  if (!j) return;
  const list = [...entries, ...log()].slice(0, MAX_LOG);
  const changes = { [`flags.${F}.log`]: list };
  for (const [k, v] of Object.entries(checkedChanges)) changes[`flags.${F}.checked.${k}`] = v;
  await j.update(changes);
  const page = j.pages.find((p) => p.getFlag(F, "ofLogPage")) ?? j.pages.contents[0];
  const hits = list.filter((e) => e.hit);
  const row = (e) => `<tr><td>${esc(Time.formatShort(e.wt))} ${esc(Time.timeOfDay(e.wt))}</td><td>${esc(e.place)}</td><td>${esc(e.trainers)}</td><td>${esc(e.name)} (${esc(e.species)})</td><td>${e.auto ? "Auto" : "Manual"}</td><td>${e.roll} vs ${e.chance}%</td><td>${e.hit ? "<strong>HIT</strong>" : "miss"}</td></tr>`;
  const table = (rows) => `<table><thead><tr><th>When</th><th>Where</th><th>Trainers</th><th>Old Fulla</th><th>Check</th><th>Roll</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table>`;
  const content = `<h2>Sightings</h2>${hits.length ? table(hits.map(row).join("")) : "<p>None yet.</p>"}
    <h2>Every check</h2>${list.length ? table(list.map(row).join("")) : "<p>No checks yet.</p>"}`;
  if (page) await page.update({ "text.content": content });
}

/* -------------------------------------------- */
/*  Rolling                                     */
/* -------------------------------------------- */

/** Roll once for a group of trainers at a place against one Old Fulla. */
async function rollOne(fulla, pin, trainers, chance, auto) {
  const roll = Math.floor(Math.random() * 10000) / 100;
  const hit = roll < chance;
  const entry = {
    id: foundry.utils.randomID(), ms: Date.now(), wt: Time.now(),
    fullaId: fulla.id, name: fulla.name, species: fulla.species, band: fulla.band,
    place: pin.name, trainers: trainers.map((a) => a.name).join(", "),
    chance: +chance.toFixed(2), roll: roll.toFixed(2), hit, auto
  };
  if (hit) await whisperHit(fulla, pin, trainers, entry);
  return entry;
}

async function whisperHit(fulla, pin, trainers, entry) {
  const gms = game.users.filter((u) => u.isGM).map((u) => u.id);
  await ChatMessage.create({
    whisper: gms,
    speaker: { alias: "Old Fullas" },
    content: `<div class="antipodea-chat ap-fulla-hit">
      <header><h3>🌿 Old Fulla sighting</h3></header>
      <p><strong>${esc(fulla.name)}</strong> (${esc(fulla.species)}) · <em>${esc(fulla.band)}</em></p>
      <p>${esc(trainers.map((a) => a.name).join(", "))} at <strong>${esc(pin.name)}</strong>, near ${esc(fulla.where)}.</p>
      <p class="hint">"${esc(fulla.legend)}"</p>
      <p class="hint">${entry.auto ? "Automatic check on arrival" : "Manual check"}: rolled ${entry.roll} under ${entry.chance}%. Only you can see this.</p>
    </div>`
  });
}

/**
 * GM: roll for these trainers where they are now, against every Old Fulla whose area it is.
 * Groups trainers by place so a party rolls once, not once each.
 */
export async function manualCheck(actors, chance = manualChance()) {
  if (!game.user.isGM) return [];
  await ensureJournal();
  const groups = groupByPlace(actors);
  const entries = [];
  for (const { pin, trainers } of groups) {
    for (const fulla of candidatesAt(pin)) entries.push(await rollOne(fulla, pin, trainers, chance, false));
  }
  if (entries.length) await writeLog(entries);
  return entries;
}

function groupByPlace(actors) {
  const map = new Map();
  for (const a of actors) {
    const pin = Maps.pinById(Data.getPhone(a).location);
    if (!pin) continue;
    if (!map.has(pin.id)) map.set(pin.id, { pin, trainers: [] });
    map.get(pin.id).trainers.push(a);
  }
  return [...map.values()];
}

/* ---------- Automatic, on arrival ---------- */

const arrivals = new Map(); // pinId -> Set of actor ids
let arrivalTimer = null;

/** Active GM: a trainer's location changed. Trainers moved together get one roll. */
export function onLocationChanged(actor) {
  if (!Data.isActiveGM() || !isTrainer(actor) || !actor.hasPlayerOwner) return;
  const pinId = Data.getPhone(actor).location;
  if (!pinId) return;
  if (!arrivals.has(pinId)) arrivals.set(pinId, new Set());
  arrivals.get(pinId).add(actor.id);
  clearTimeout(arrivalTimer);
  arrivalTimer = setTimeout(() => processArrivals().catch((e) => console.error(`${MODULE_ID} | Old Fullas check failed`, e)), 1500);
}

async function processArrivals() {
  const batch = [...arrivals.entries()];
  arrivals.clear();
  if (!autoOn() || !Data.isActiveGM()) return;
  await ensureJournal();
  const checked = journal()?.getFlag(F, "checked") ?? {};
  const today = dayKey();
  const chance = autoChance();
  const entries = [];
  const marks = {};
  for (const [pinId, ids] of batch) {
    const pin = Maps.pinById(pinId);
    if (!pin) continue;
    const here = [...ids].map((id) => game.actors.get(id)).filter((a) => a && Data.getPhone(a).location === pinId);
    for (const fulla of candidatesAt(pin)) {
      // Once per in-game day per trainer per Old Fulla: skip anyone already checked today.
      const fresh = here.filter((a) => checked[`${a.id}_${fulla.id}`] !== today);
      if (!fresh.length) continue;
      fresh.forEach((a) => { marks[`${a.id}_${fulla.id}`] = today; });
      entries.push(await rollOne(fulla, pin, fresh, chance, true));
    }
  }
  if (!entries.length && !Object.keys(marks).length) return;
  // Forget marks from earlier days so the journal doesn't grow forever.
  const stale = Object.entries(checked).filter(([, v]) => v !== today).map(([k]) => k);
  if (stale.length) await journal().update(Object.fromEntries(stale.map((k) => [`flags.${F}.checked.-=${k}`, null])));
  await writeLog(entries, marks);
}

export function info(id) {
  return byId.get(id) ?? null;
}
