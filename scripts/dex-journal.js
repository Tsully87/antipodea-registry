import { MODULE_ID } from "./constants.js";
import { ANTIPODEA_SPECIES_SLUGS } from "./dex-species.js";

/**
 * Antipodea's own dex entries. One journal, one page per Antipodea species, so the GM
 * can rewrite any entry in Manuka's voice straight in Foundry's normal journal editor,
 * no code involved. Every page starts seeded with PTR's stock flavour text (via
 * seedMissing below) so the Pokédex never shows a blank entry while they're gradually
 * rewritten; whatever's in the page's text replaces PTR's own dexentry once it differs.
 */

export const JOURNAL_NAME = "📖 Antipodea Dex Entries";
const F = MODULE_ID;

let cache = null;

export function journal() {
  return game.journal?.find((j) => j.getFlag(F, "dexJournal")) ?? null;
}

export function invalidate() {
  cache = null;
}

function build() {
  const j = journal();
  const map = new Map();
  if (!j) return map;
  for (const page of j.pages) {
    const slug = page.getFlag(F, "slug");
    if (!slug) continue;
    const html = (page.text?.content ?? "").trim();
    if (html) map.set(slug, html);
  }
  return map;
}

function data() {
  cache ??= build();
  return cache;
}

/** Antipodea's own entry for a species, stripped of markup, or null if that page's still blank. */
export function entryFor(slug) {
  const html = data().get(slug);
  if (!html) return null;
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent ?? "").trim() || null;
}

/** GM: the journal, creating it (empty) if it doesn't exist yet. */
export async function ensureJournal() {
  let j = journal();
  if (j) return j;
  j = await JournalEntry.create({
    name: JOURNAL_NAME,
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER },
    flags: { [F]: { dexJournal: true } }
  });
  invalidate();
  return j;
}

const title = (slug) => slug.split("-").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");

/**
 * GM: add a page (seeded with PTR's own flavour text) for every Antipodea species that
 * doesn't have one yet. Safe to run more than once — existing pages are left alone, so
 * nothing already rewritten in Manuka's voice gets overwritten. Returns how many pages
 * were added.
 */
export async function seedMissing() {
  if (!game.user.isGM) return 0;
  const j = await ensureJournal();
  const have = new Set(j.pages.map((p) => p.getFlag(F, "slug")).filter(Boolean));
  const todo = ANTIPODEA_SPECIES_SLUGS.filter((s) => !have.has(s));
  if (!todo.length) return 0;

  const pack = game.packs.get("ptu.species");
  const index = await pack.getIndex({ fields: ["system.slug", "system.dexentry", "system.number"] });
  const bySlug = new Map(index.contents.filter((e) => e.system?.slug).map((e) => [e.system.slug, e]));

  const pages = todo.map((slug) => {
    const entry = bySlug.get(slug);
    const text = entry?.system?.dexentry?.trim() || "No Antipodea entry yet.";
    return {
      name: title(slug),
      sort: (entry?.system?.number ?? 0) * 10,
      text: { content: `<p>${foundry.utils.escapeHTML(text)}</p>`, format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML },
      flags: { [F]: { slug } }
    };
  });
  await j.createEmbeddedDocuments("JournalEntryPage", pages);
  invalidate();
  return pages.length;
}

Hooks.on("createJournalEntryPage", (page) => { if (page.parent?.getFlag(F, "dexJournal")) invalidate(); });
Hooks.on("updateJournalEntryPage", (page) => { if (page.parent?.getFlag(F, "dexJournal")) invalidate(); });
Hooks.on("deleteJournalEntryPage", (page) => { if (page.parent?.getFlag(F, "dexJournal")) invalidate(); });
