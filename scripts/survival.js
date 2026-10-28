import { MODULE_ID } from "./constants.js";
import * as Time from "./time.js";
import * as Maps from "./maps.js";
import * as Shop from "./shop.js";
import { getPhone, isActiveGM, claim } from "./phone-data.js";

/**
 * Survival and Crafting (homebrew). Weather exposure, food and water, foraging,
 * harvesting Pokémon drops, and bush-craft recipes — the rules live in the vault
 * note "Survival and Crafting". Everything here reads/writes actor flags under
 * flags.antipodea-registry.survival, and items on the Poké Mart folder's
 * Travel and Camping / Food and Water / Materials sections (see maps.js's shop code).
 */

const isTrainer = (a) => a && a.type !== "pokemon";
const S = (actor) => foundry.utils.mergeObject(
  { outBush: false, wornDown: 0, streak: { food: 0, water: 0 }, lastEndOfDay: null },
  foundry.utils.deepClone(actor?.getFlag(MODULE_ID, "survival") ?? {}),
  { inplace: false }
);

/* -------------------------------------------- */
/*  In town / out bush, Worn Down                */
/* -------------------------------------------- */

export const isOutBush = (actor) => !!S(actor).outBush;
export const wornDown = (actor) => Math.min(3, Math.max(0, Number(S(actor).wornDown) || 0));
export const streak = (actor, kind) => Number(S(actor).streak?.[kind]) || 0;

export async function setOutBush(actor, value) {
  return actor.setFlag(MODULE_ID, "survival.outBush", !!value);
}

export async function addWornDown(actor) {
  const n = Math.min(3, wornDown(actor) + 1);
  return actor.setFlag(MODULE_ID, "survival.wornDown", n);
}

export async function clearWornDown(actor) {
  return actor.setFlag(MODULE_ID, "survival.wornDown", 0);
}

async function setStreak(actor, kind, value) {
  return actor.setFlag(MODULE_ID, `survival.streak.${kind}`, Math.max(0, value));
}

/* -------------------------------------------- */
/*  Skill checks (this system: roll {dice}d6 + modifier vs a DC)          */
/* -------------------------------------------- */

/** Roll one of a trainer's skills (slug per system.skills, e.g. "survival", "focus", "athletics", "pokemonEd")
 *  against a DC. Posts a chat card and returns { ok, total, dc }. */
export async function rollCheck(actor, slug, dc, { flavor = "" } = {}) {
  const sk = actor?.system?.skills?.[slug];
  const dice = Number(sk?.value?.total ?? sk?.value?.value ?? 2) || 2;
  const mod = Number(sk?.modifier?.total ?? sk?.modifier?.value ?? 0) || 0;
  const roll = await new Roll(`${dice}d6 + ${mod}`).evaluate();
  const ok = roll.total >= dc;
  const label = sk?.label ?? slug;
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `${flavor ? `${flavor}<br>` : ""}<b>${label} check</b> vs DC ${dc} — ${ok ? "<b style='color:#2f9e44'>Pass</b>" : "<b style='color:#c92a2a'>Fail</b>"}`
  });
  return { ok, total: roll.total, dc };
}

/** A Pokémon (no skills data) rolling Survival-equivalent: straight 2d6, no stat bonus, for weather exposure. */
export async function rollPokemonExposure(pokemon, dc, flavor) {
  const roll = await new Roll("2d6").evaluate();
  const ok = roll.total >= dc;
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor: pokemon }),
    flavor: `${flavor ? `${flavor}<br>` : ""}<b>Exposure check</b> vs DC ${dc} — ${ok ? "<b style='color:#2f9e44'>Pass</b>" : "<b style='color:#c92a2a'>Fail</b>"}`
  });
  return { ok, total: roll.total, dc };
}

/* -------------------------------------------- */
/*  Inventory helpers (give / take named items)  */
/* -------------------------------------------- */

const asType = (orig, n) => (typeof orig === "string" ? String(n) : n);

/** The Poké Mart Item document for a stocked material/gear name (Materials / Food and Water / Travel and Camping). */
function martItem(name) {
  const stocked = Shop.stockList().find((i) => i.name === name);
  return stocked ? game.items.get(stocked.id) : null;
}

/** How many of a named item a trainer is carrying. */
export function have(actor, name) {
  return actor.items.filter((i) => i.name === name).reduce((n, i) => n + (Number(i.system?.quantity) || 0), 0);
}

/** Take `qty` of a named item off a trainer (across stacks as needed). Returns true if it had enough. */
export async function take(actor, name, qty) {
  let left = qty;
  const stacks = actor.items.filter((i) => i.name === name).sort((a, b) => (Number(a.system?.quantity) || 0) - (Number(b.system?.quantity) || 0));
  const have_ = stacks.reduce((n, i) => n + (Number(i.system?.quantity) || 0), 0);
  if (have_ < qty) return false;
  const updates = [], removes = [];
  for (const doc of stacks) {
    if (left <= 0) break;
    const q = Number(doc.system?.quantity) || 0;
    if (q <= left) { removes.push(doc.id); left -= q; }
    else { updates.push({ _id: doc.id, "system.quantity": asType(doc.system.quantity, q - left) }); left = 0; }
  }
  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  if (removes.length) await actor.deleteEmbeddedDocuments("Item", removes);
  return true;
}

/** Give a trainer `qty` of an item that exists in the Poké Mart folder (materials, found gear). */
export async function give(actor, name, qty = 1) {
  const src = martItem(name);
  if (!src) { console.warn(`${MODULE_ID} | survival: no mart item called "${name}"`); return false; }
  const existing = actor.items.find((i) => i.name === src.name && i.type === src.type);
  if (existing && existing.system?.quantity !== undefined) {
    const now = Number(existing.system.quantity) || 0;
    await existing.update({ "system.quantity": asType(existing.system.quantity, now + qty) });
    return true;
  }
  const d = src.toObject();
  delete d._id; delete d.folder;
  if (d.system?.quantity !== undefined) d.system.quantity = asType(d.system.quantity, qty);
  await actor.createEmbeddedDocuments("Item", [d]);
  return true;
}

/* -------------------------------------------- */
/*  Zones                                        */
/* -------------------------------------------- */

const ZONE_GROUPS = {
  Tropical: ["The Big Wet", "Rainforest Reach"],
  Coast: ["Bunya Coast", "Waratah Coast", "Gumleaf Coast", "Banksia Coast", "Rimu Coast"],
  Outback: ["The Red Heart"],
  Alpine: ["Snowgum High Country", "Tussock Plains"],
  "Island forest": ["Huon Isle", "Pōhutukawa Isle"]
};

export function zoneGroupOf(zoneName) {
  return Object.entries(ZONE_GROUPS).find(([, list]) => list.includes(zoneName))?.[0] ?? "Coast";
}

/** The zone a trainer is in, from their phone location pin. */
export function zoneOf(actor) {
  const loc = getPhone(actor).location;
  return loc ? Maps.pinById(loc)?.zone ?? null : null;
}

/* -------------------------------------------- */
/*  Weather (from the Antipodea Weather macro's scope.hazard)             */
/* -------------------------------------------- */

function weatherMacro() {
  const name = game.settings.get(MODULE_ID, "weatherMacro") || "Antipodea Weather";
  return game.macros.getName(name) ?? game.macros.getName("Antipodea Weather") ?? null;
}

/** Today's raw weather numbers for a zone, or null if the macro isn't set up. */
export async function hazardFor(zoneName) {
  const macro = weatherMacro();
  if (!macro || !zoneName) return null;
  try { return await macro.execute({ hazard: { zone: zoneName } }); }
  catch (e) { console.warn(`${MODULE_ID} | survival: hazard lookup failed`, e); return null; }
}

/** Best-guess hazard flags from the raw weather, for the GM to tick/untick before Apply. */
export function suggestHazards(w) {
  if (!w) return { heat: false, cold: false, wet: false, smoke: false, tropics: false };
  const heatSevere = w.hi >= 40 || w.extras.some((e) => /Severe heatwave|Extreme heatwave/.test(e));
  const coldSevere = /Blizzard/.test(w.sky) || w.lo <= -5;
  const wetSevere = (w.cat ?? 0) >= 3 || /Severe thunderstorm|Driving rain/.test(w.sky) || w.windIdx >= 4;
  const smokeSevere = (w.bfLevel ?? -1) >= 1 || (w.ashDrift ?? 0) >= 2;
  return {
    heat: { active: w.hi >= 35, severe: heatSevere },
    cold: { active: w.lo <= 0 || /Snow|Sleet|Blizzard/.test(w.sky), severe: coldSevere },
    wet: { active: w.wet && !/Light showers/.test(w.sky), severe: wetSevere },
    smoke: { active: w.bfLevel != null || w.fire === "Catastrophic" || /Dust storm/.test(w.sky) || (w.ashDrift ?? 0) > 0, severe: smokeSevere },
    tropics: { active: !!w.tropical, severe: false }
  };
}

/* -------------------------------------------- */
/*  End of Day                                   */
/* -------------------------------------------- */

const POKEMON_COVERED = {
  cold: ["Fire", "Ice"],
  wet: ["Water", "Grass"],
  smoke: ["Ground", "Rock", "Steel"]
};

function outBushTrainers() {
  return game.actors.filter((a) => isTrainer(a) && isOutBush(a));
}

/** Group out-bush trainers by zone, with today's weather and suggested hazards per zone. */
export async function endOfDayPreview() {
  const trainers = outBushTrainers();
  const byZone = new Map();
  for (const a of trainers) {
    const zone = zoneOf(a) ?? "Somewhere";
    if (!byZone.has(zone)) byZone.set(zone, []);
    byZone.get(zone).push(a);
  }
  const zones = [];
  for (const [zone, actors] of byZone) {
    const w = zone !== "Somewhere" ? await hazardFor(zone) : null;
    zones.push({ zone, weather: w, hazards: suggestHazards(w), trainers: actors.map((a) => ({ id: a.id, name: a.name })) });
  }
  return zones;
}

/**
 * Apply End of Day for one trainer, given the GM's confirmed hazard flags for their zone.
 * Returns a short log of what happened, for the chat summary.
 */
async function applyOne(actor, hazards) {
  const lines = [];
  const name = actor.name;

  // Step 1: food. Eat a Ration if they have one; otherwise push through on Focus.
  const fed = await take(actor, "Ration", 1);
  if (!fed) {
    const dc = 10 + streak(actor, "food") * 5;
    const r = await rollCheck(actor, "focus", dc, { flavor: `${name} has no Ration today.` });
    if (r.ok) { lines.push(`${name}: no food, pushed through (Focus ${r.total} vs DC ${dc}).`); await setStreak(actor, "food", streak(actor, "food") + 1); }
    else { lines.push(`${name}: no food, Worn Down (Focus ${r.total} vs DC ${dc}).`); await addWornDown(actor); await setStreak(actor, "food", streak(actor, "food") + 1); }
  } else {
    lines.push(`${name}: ate a Ration.`);
    await setStreak(actor, "food", 0);
  }

  // Step 1b: water. Carrying any water container counts as covered for the day.
  const waterNeeded = hazards?.heat?.active ? 2 : 1;
  const hadWater = have(actor, "Canteen") > 0 || have(actor, "Water Bladder") > 0 || have(actor, "Jerry Can") > 0;
  if (!hadWater) {
    const dc = 15 + streak(actor, "water") * 5;
    const r = await rollCheck(actor, "focus", dc, { flavor: `${name} has no water today.` });
    if (r.ok) { lines.push(`${name}: no water, pushed through (Focus ${r.total} vs DC ${dc}).`); await setStreak(actor, "water", streak(actor, "water") + 1); }
    else { lines.push(`${name}: no water, Worn Down (Focus ${r.total} vs DC ${dc}).`); await addWornDown(actor); await setStreak(actor, "water", streak(actor, "water") + 1); }
  } else {
    lines.push(`${name}: had water${waterNeeded > 1 ? " (double, Heat day)" : ""}.`);
    await setStreak(actor, "water", 0);
  }

  // Step 2: weather exposure
  if (hazards) {
    for (const [key, label, covers] of [
      ["heat", "Heat", ["Sun Kit", "Akubra"]],
      ["cold", "Cold", ["Thermal Layers", "Swanndri"]],
      ["wet", "Wet", ["Oilskin Coat", "Swanndri"]],
      ["smoke", "Smoke and dust", ["Dust Mask (x3)", "Gas Mask"]],
      ["tropics", "Tropics", ["Mozzie Spray"]]
    ]) {
      const h = hazards[key];
      if (!h?.active) continue;
      const covered = covers.some((item) => have(actor, item) > 0);
      if (covered) { lines.push(`${name}: covered for ${label}.`); continue; }
      const dc = h.severe ? 14 : 10;
      const r = await rollCheck(actor, "survival", dc, { flavor: `${name} isn't covered for ${label}${h.severe ? " (Severe)" : ""}.` });
      if (r.ok) lines.push(`${name}: toughed out ${label} (Survival ${r.total} vs DC ${dc}).`);
      else {
        lines.push(`${name}: Worn Down from ${label}${h.severe ? " + 1 Injury" : ""} (Survival ${r.total} vs DC ${dc}).`);
        await addWornDown(actor);
        if (h.severe) await actor.setFlag(MODULE_ID, "survival.pendingInjury", (actor.getFlag(MODULE_ID, "survival.pendingInjury") ?? 0) + 1);
      }
    }
  }

  return lines;
}

/** GM: apply End of Day across every zone in the confirmed preview. hazardsByZone: { [zone]: hazards }. */
export async function applyEndOfDay(preview, hazardsByZone) {
  if (!isActiveGM()) return [];
  const dayKey = `${game.seasonsStars?.api?.worldTimeToDate?.(Time.now())?.year}-${game.seasonsStars?.api?.worldTimeToDate?.(Time.now())?.month}-${game.seasonsStars?.api?.worldTimeToDate?.(Time.now())?.day}` || String(Time.now());
  const allLines = [];
  for (const zoneGroup of preview) {
    const hazards = hazardsByZone[zoneGroup.zone] ?? zoneGroup.hazards;
    for (const t of zoneGroup.trainers) {
      const actor = game.actors.get(t.id);
      if (!actor) continue;
      if (actor.getFlag(MODULE_ID, "survival.lastEndOfDay") === dayKey) continue;
      const lines = await applyOne(actor, hazards);
      await actor.setFlag(MODULE_ID, "survival.lastEndOfDay", dayKey);
      allLines.push(...lines);
    }
  }
  if (allLines.length) {
    await ChatMessage.create({
      speaker: { alias: "End of Day" },
      content: `<div><b>🏕️ End of Day</b><br>${allLines.join("<br>")}</div>`
    });
  }
  return allLines;
}

/* -------------------------------------------- */
/*  Foraging                                     */
/* -------------------------------------------- */

const FORAGE_TABLES = {
  Tropical: ["Timber", "Plant Fibre", "Plant Fibre", "Bush Herbs", "Berry", "Apricorn"],
  Coast: ["Timber", "Plant Fibre", "Stone", "Bush Herbs", "Berry", "Scrap Metal"],
  Outback: ["Stone", "Stone", "Plant Fibre", "Timber", "Bush Herbs", "Shard"],
  Alpine: ["Stone", "Timber", "Bush Herbs", "Plant Fibre", "Berry", "Shard"],
  "Island forest": ["Timber", "Timber", "Plant Fibre", "Bush Herbs", "Apricorn", "Berry"]
};

/** Trainer forages for about an hour out bush. Rolls Survival; every die >=4 finds 1 material. */
export async function forage(actor, extraDie = false) {
  if (!isOutBush(actor)) return { ok: false, error: `${actor.name} isn't out bush.` };
  const zoneName = zoneOf(actor);
  const group = zoneGroupOf(zoneName ?? "Bunya Coast");
  const table = FORAGE_TABLES[group];
  const sk = actor.system?.skills?.survival;
  let dice = (Number(sk?.value?.total) || 2) + (extraDie ? 1 : 0);
  const mod = Number(sk?.modifier?.total) || 0;
  const roll = await new Roll(`${dice}d6`).evaluate();
  const faces = roll.terms[0]?.results?.map((r) => r.result) ?? [];
  const finds = faces.filter((f) => f >= 4);
  const got = {};
  for (const f of finds) {
    const name = table[Math.min(5, Math.max(0, f - 1))];
    got[name] = (got[name] ?? 0) + 1;
  }
  const special = ["Berry", "Apricorn", "Shard"];
  for (const [name, qty] of Object.entries(got)) {
    if (special.includes(name)) continue; // not stocked in the mart as a generic item; GM hands these out from compendium stock if used
    await give(actor, name, qty);
  }
  const summary = Object.entries(got).map(([n, q]) => `${q} x ${n}`).join(", ") || "nothing";
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<b>🌿 Foraging (${group})</b><br>Rolled ${faces.join(", ")} + ${mod}<br>Found: ${summary}`
  });
  return { ok: true, got, summary };
}

/* -------------------------------------------- */
/*  Pokémon drops (harvested, not automatic)     */
/* -------------------------------------------- */

export const DROP_TABLE = [
  { types: ["Normal", "Flying"], material: "Fluff", skill: "pokemonEd" },
  { types: ["Ground", "Rock"], material: "Stone", skill: "athletics" },
  { types: ["Grass"], material: "Plant Fibre", skill: "survival" },
  { types: ["Steel", "Electric"], material: "Scrap Metal", skill: "athletics" },
  { types: ["Bug"], material: "Silk", skill: "pokemonEd" },
  { types: ["Fire"], material: "Timber", skill: "survival" },
  { types: ["Water", "Ice"], material: "Hide", skill: "pokemonEd" },
  { types: ["Fighting", "Dark", "Dragon"], material: "Hide", skill: "pokemonEd" },
  { types: ["Fairy", "Psychic", "Ghost", "Poison"], material: "Shard", skill: "pokemonEd" }
];

export function dropFor(firstType) {
  return DROP_TABLE.find((d) => d.types.includes(firstType)) ?? null;
}

/** A trainer spends a few minutes harvesting a defeated/caught wild Pokémon. */
export async function harvest(actor, firstType) {
  const drop = dropFor(firstType);
  if (!drop) return { ok: false, error: `No drop known for type ${firstType}.` };
  const r = await rollCheck(actor, drop.skill, 10, { flavor: `${actor.name} harvests a ${firstType}-type Pokémon.` });
  if (r.ok && drop.material !== "Shard") await give(actor, drop.material, 1);
  return { ok: r.ok, material: drop.material, skill: drop.skill, total: r.total };
}

/* -------------------------------------------- */
/*  Crafting recipes                             */
/* -------------------------------------------- */

export const RECIPES = [
  { id: "torch", name: "Torch", materials: { Timber: 1, "Plant Fibre": 1 }, dc: 6, makes: "lights 5m for 1 hour" },
  { id: "campfire", name: "Campfire", materials: { Timber: 2 }, dc: 6, makes: "a campfire for the night (+2 to Cold checks)" },
  { id: "bush-rope", name: "Bush Rope", materials: { "Plant Fibre": 3 }, dc: 8, makes: "Basic Rope", result: "Basic Rope" },
  { id: "dust-mask", name: "Dust Mask", materials: { "Plant Fibre": 1, Silk: 1 }, dc: 8, makes: "Dust Mask (1 day)", result: "Dust Mask (x3)" },
  { id: "fishing-line", name: "Fishing Line", materials: { Timber: 1, Silk: 1 }, dc: 8, makes: "fish for encounters (and a meal) at water" },
  { id: "crude-spear", name: "Crude Spear", materials: { Timber: 2, Stone: 1 }, dc: 8, makes: "a Crude Weapon (PTU)" },
  { id: "bush-shelter", name: "Bush Shelter", materials: { Timber: 3, "Plant Fibre": 2 }, dc: 10, rank: "novice", makes: "shelter for 2 for one night (not Severe Cold/Wet)" },
  { id: "charcoal-filter", name: "Charcoal Filter", materials: { Timber: 1, Stone: 1, "Plant Fibre": 1 }, dc: 10, rank: "novice", makes: "purifies 3 days of bush water" },
  { id: "bush-remedy", name: "Bush Remedy", materials: { "Bush Herbs": 2 }, dc: 10, rank: "novice", makes: "heals 15 HP (half on Pokémon)" },
  { id: "splint", name: "Splint", materials: { Timber: 1, "Plant Fibre": 1 }, dc: 12, rank: "novice", makes: "Bandages", result: "Bandages" },
  { id: "hide-oilskin", name: "Hide Oilskin", materials: { Hide: 2, Silk: 1 }, dc: 14, rank: "adept", makes: "Oilskin Coat", result: "Oilskin Coat" },
  { id: "fur-layers", name: "Fur Layers", materials: { Hide: 2, Fluff: 2 }, dc: 14, rank: "adept", makes: "Thermal Layers", result: "Thermal Layers" },
  { id: "bush-swag", name: "Bush Swag", materials: { Hide: 3, Fluff: 2, "Plant Fibre": 2 }, dc: 16, rank: "expert", makes: "Swag", result: "Swag" }
];

/** Skill rank order, lowest to highest, as this system's actors store it (actor.system.skills.<slug>.rank). */
const RANK_ORDER = ["pathetic", "untrained", "novice", "adept", "expert", "master", "virtuoso"];
const RANK_LABEL = { novice: "Novice", adept: "Adept", expert: "Expert" };

/** Does this actor's Survival rank meet or beat the given minimum rank? No minimum always passes. */
function meetsRank(actor, minRank) {
  if (!minRank) return true;
  const have = actor?.system?.skills?.survival?.rank ?? "untrained";
  const haveIdx = RANK_ORDER.indexOf(have);
  const needIdx = RANK_ORDER.indexOf(minRank);
  if (needIdx < 0) return true;
  return haveIdx >= needIdx;
}

/** What a trainer has vs needs for a recipe, with the Survivalist discount applied if they have it,
 *  and whether their Survival rank is high enough to attempt it at all. */
export function recipeStatus(actor, recipe) {
  const survivalist = !!actor.items.find((i) => /survivalist/i.test(i.name));
  const need = {};
  for (const [mat, qty] of Object.entries(recipe.materials)) {
    need[mat] = survivalist ? Math.max(1, qty - 1) : qty;
  }
  const has = Object.fromEntries(Object.keys(need).map((m) => [m, have(actor, m)]));
  const hasMaterials = Object.entries(need).every(([m, q]) => (has[m] ?? 0) >= q);
  const rankOk = meetsRank(actor, recipe.rank);
  return {
    need, has, survivalist, rankOk,
    rankLabel: recipe.rank ? RANK_LABEL[recipe.rank] ?? recipe.rank : null,
    canMake: hasMaterials && rankOk
  };
}

/** Craft a recipe: rolls Survival, consumes materials on a pass, posts the result to chat. */
export async function craft(actor, recipeId) {
  const recipe = RECIPES.find((r) => r.id === recipeId);
  if (!recipe) return { ok: false, error: "No such recipe." };
  const status = recipeStatus(actor, recipe);
  if (!status.rankOk) return { ok: false, error: `You need at least ${status.rankLabel} Survival to attempt this.` };
  if (!status.canMake) return { ok: false, error: "You don't have what this recipe needs." };
  const dc = recipe.dc - (status.survivalist ? 2 : 0);
  const r = await rollCheck(actor, "survival", dc, { flavor: `${actor.name} tries to craft a ${recipe.name}.` });
  const beatBy = r.total - dc;
  if (!r.ok) {
    if (beatBy <= -5) {
      for (const [mat, qty] of Object.entries(status.need)) await take(actor, mat, qty);
      return { ok: false, wasted: true, total: r.total, dc };
    }
    return { ok: false, wasted: false, total: r.total, dc };
  }
  for (const [mat, qty] of Object.entries(status.need)) await take(actor, mat, qty);
  let extra = 1;
  if (beatBy >= 5) extra = 2;
  if (recipe.result) await give(actor, recipe.result, extra);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<b>🔨 Crafted ${recipe.name}</b>${extra > 1 ? " (x2, beat the DC by 5+)" : ""} — ${recipe.makes}.`
  });
  return { ok: true, total: r.total, dc, extra };
}
