import * as DexData from "./dex-data.js";
import * as DexJournal from "./dex-journal.js";

/**
 * The Pokédex app. Runs as methods on the phone window (`this` is the RegistryPhone),
 * same pattern as the other app files.
 */

const title = (slug) => (slug ?? "").split("-").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");

const TYPE_COLORS = {
  Normal: "#9a9d7a", Fire: "#e0702f", Water: "#4a90d9", Electric: "#e0c23d", Grass: "#5fa84e",
  Ice: "#6fc7c7", Fighting: "#c0493a", Poison: "#9757a3", Ground: "#c7a23e", Flying: "#8aa5e0",
  Psychic: "#e0598a", Bug: "#9bb23f", Rock: "#aa9a4f", Ghost: "#6a5a9c", Dragon: "#5b5fd1",
  Dark: "#6b5a4a", Steel: "#8f9ab0", Fairy: "#e096c2"
};
const typeChip = (t) => ({ name: t, color: TYPE_COLORS[t] ?? "#777" });

function abilityList(group) {
  return (group ?? []).map((a) => title(a.slug));
}

function statRows(stats) {
  const order = [["hp", "HP"], ["atk", "Attack"], ["def", "Defense"], ["spatk", "Sp. Attack"], ["spdef", "Sp. Defense"], ["spd", "Speed"]];
  return order.map(([key, label]) => ({ label, value: stats?.[key] ?? 0 }));
}

function capabilityRows(cap) {
  if (!cap) return [];
  const order = [["overland", "Overland"], ["sky", "Sky"], ["swim", "Swim"], ["levitate", "Levitate"], ["burrow", "Burrow"], ["highJump", "High Jump"], ["longJump", "Long Jump"], ["power", "Power"]];
  return order.filter(([key]) => cap[key]).map(([key, label]) => ({ label, value: cap[key] }));
}

function buildDetail(entry, doc) {
  const s = doc?.system ?? {};
  const base = {
    slug: entry.slug,
    number: entry.number,
    name: entry.name,
    sprite: DexData.spriteUrl(entry.number),
    types: entry.types.map(typeChip),
    owned: entry.status === "owned",
    sizeClass: s.size?.sizeClass ?? "",
    heightLabel: s.size ? `${s.size.height} m` : "",
    weightLabel: s.size ? `${s.size.weight} kg` : "",
    habitats: s.habitats ?? [],
    dexentry: DexJournal.entryFor(entry.slug) ?? s.dexentry ?? ""
  };
  if (base.owned) {
    Object.assign(base, {
      stats: statRows(s.stats),
      abilities: {
        basic: abilityList(s.abilities?.basic),
        advanced: abilityList(s.abilities?.advanced),
        high: abilityList(s.abilities?.high)
      },
      capabilities: capabilityRows(s.capabilities),
      eggGroups: s.breeding?.eggGroups ?? [],
      diet: s.diet ?? [],
      moves: [...(s.moves?.level ?? [])].sort((a, b) => a.level - b.level).map((m) => ({ level: m.level, name: title(m.slug) }))
    });
  }
  return base;
}

const STATUS_FILTERS = [
  { key: "owned", label: "Owned" },
  { key: "seen", label: "Seen only" },
  { key: "unknown", label: "Not found" }
];
/** Standard Pokédex type order, trimmed to whatever types actually turn up in Antipodea. */
const TYPE_ORDER = Object.keys(TYPE_COLORS);

/**
 * Only entries the trainer has actually found are name- or type-searchable, so filters
 * can't be used to peek at what a "???" entry is.
 */
function matches(entry, q, status, type) {
  if (status && entry.status !== status) return false;
  if (type && (entry.status === "unknown" || !entry.types.includes(type))) return false;
  if (!q) return true;
  if (String(entry.number).includes(q)) return true;
  return entry.status !== "unknown" && entry.name.toLowerCase().includes(q);
}

export async function dexContext(phone) {
  const q = (this._drafts["dex-search"] ?? "").trim().toLowerCase();
  const status = this.dexFilterStatus ?? "";
  const type = this.dexFilterType ?? "";
  const all = await DexData.dexList(this.actor);
  const seenCount = all.filter((e) => e.status !== "unknown").length;
  const ownedCount = all.filter((e) => e.status === "owned").length;
  const typesPresent = new Set(all.flatMap((e) => e.types));

  let detail = null;
  if (this.dexSel) {
    const entry = all.find((e) => e.slug === this.dexSel);
    if (entry?.status === "unknown") {
      detail = { unknown: true, number: entry.number };
    } else if (entry) {
      const doc = await DexData.speciesDoc(entry.slug);
      detail = buildDetail(entry, doc);
    }
  }

  return {
    dex: {
      total: DexData.TOTAL_SPECIES,
      seenCount,
      ownedCount,
      search: this._drafts["dex-search"] ?? "",
      statusFilters: STATUS_FILTERS.map((f) => ({ ...f, active: f.key === status })),
      typeOptions: TYPE_ORDER.filter((t) => typesPresent.has(t)).map((t) => ({ name: t, selected: t === type })),
      type,
      entries: all.filter((e) => matches(e, q, status, type)).map((e) => ({
        slug: e.slug,
        number: e.number,
        name: e.status === "unknown" ? "???" : e.name,
        sprite: DexData.spriteUrl(e.number),
        status: e.status,
        selected: e.slug === this.dexSel
      })),
      detail
    }
  };
}

export const dexActions = {
  apDexSelect(event, target) {
    this.dexSel = this.dexSel === target.dataset.slug ? null : target.dataset.slug;
    this.render();
  },
  apDexClear() {
    this.dexSel = null;
    this.render();
  },
  apDexFilterStatus(event, target) {
    const key = target.dataset.status;
    this.dexFilterStatus = this.dexFilterStatus === key ? null : key;
    this.render();
  }
};
