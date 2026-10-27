import { MODULE_ID } from "./constants.js";
import { ANTIPODEA_SPECIES_SLUGS } from "./dex-species.js";

/**
 * The Pokédex app reads straight off the data PTR already tracks: each trainer's
 * `system.dex.seen` / `system.dex.owned` arrays of species slugs, and the `ptu.species`
 * compendium for everything about a species (stats, abilities, moves, habitats, the
 * PTR flavour entry). Nothing here writes to either of those; seen/owned still gets
 * marked the same way it always has.
 */

const PACK_ID = "ptu.species";
const SLUG_SET = new Set(ANTIPODEA_SPECIES_SLUGS);

let indexPromise = null;
const docCache = new Map();

/** The Antipodea-legal slice of the species compendium index, keyed by slug. Loaded once per session. */
function loadIndex() {
  if (!indexPromise) {
    indexPromise = (async () => {
      const pack = game.packs.get(PACK_ID);
      const map = new Map();
      if (!pack) {
        console.warn(`${MODULE_ID} | Pokédex: compendium "${PACK_ID}" not found.`);
        return map;
      }
      const index = await pack.getIndex({ fields: ["system.slug", "system.number", "system.types"] });
      for (const e of index.contents) {
        const slug = e.system?.slug;
        if (slug && SLUG_SET.has(slug)) {
          map.set(slug, { id: e._id, slug, name: e.name, number: e.system?.number ?? 0, types: e.system?.types ?? [] });
        }
      }
      return map;
    })();
  }
  return indexPromise;
}

/**
 * The full Antipodea dex, in dex-number order, with each entry's status for this
 * trainer: "owned", "seen" or "unknown".
 */
export async function dexList(actor) {
  const index = await loadIndex();
  const dex = actor?.system?.dex ?? {};
  const seen = new Set(dex.seen ?? []);
  const owned = new Set(dex.owned ?? []);
  const entries = [...index.values()].map((e) => ({
    ...e,
    status: owned.has(e.slug) ? "owned" : seen.has(e.slug) ? "seen" : "unknown"
  }));
  entries.sort((a, b) => a.number - b.number || a.name.localeCompare(b.name));
  return entries;
}

/** Bare index info (name, number, types) for one slug, with no compendium document fetch. */
export async function indexEntry(slug) {
  const index = await loadIndex();
  return index.get(slug) ?? null;
}

/** The full species Item (stats, moves, habitats, dex entry, etc.) for the detail view. */
export async function speciesDoc(slug) {
  const index = await loadIndex();
  const entry = index.get(slug);
  if (!entry) return null;
  if (!docCache.has(slug)) {
    const pack = game.packs.get(PACK_ID);
    docCache.set(slug, pack.getDocument(entry.id));
  }
  return docCache.get(slug);
}

/**
 * PokéAPI's sprite CDN, keyed by National Dex number (which the species item already
 * has). Unseen entries render the same sprite blacked out in CSS rather than a second
 * fetch. Alt forms (Megas, regional forms, size/colour variants) don't all have a
 * matching sprite there, so they fall back to showing the base species' look.
 */
export function spriteUrl(number) {
  return number ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${number}.png` : "";
}

export const TOTAL_SPECIES = ANTIPODEA_SPECIES_SLUGS.length;
