import { MODULE_ID } from "./constants.js";

/**
 * The Phone Network: one hidden journal that every player owns. Each text, post, profile
 * and queued job is its own page, with the data in the page's flags. Players write to it
 * directly, so the social side of the phone works without a GM online. Likes, comments and
 * follows are saved one key at a time so two people tapping at once can't overwrite each other.
 */

export const NETWORK_NAME = "📱 Pokémon Phone Network";
const F = MODULE_ID;

let cache = null;

export function journal() {
  return game.journal?.find((j) => j.getFlag(F, "network")) ?? null;
}

/** True when this user can read and write the network. */
export function ready() {
  const j = journal();
  return !!j && j.isOwner;
}

export function invalidate() {
  cache = null;
}

function build() {
  const j = journal();
  const c = { msg: [], post: [], profile: new Map(), job: [], byId: new Map() };
  if (!j) return c;
  for (const page of j.pages) {
    const f = page.flags?.[F];
    if (!f?.kind) continue;
    const id = f.d?.id ?? f.actorId;
    if (id) c.byId.set(`${f.kind}:${id}`, page);
    if (f.kind === "msg") c.msg.push(f.d);
    else if (f.kind === "post") {
      c.post.push({
        ...f.d,
        likes: Object.entries(f.likes ?? {}).filter(([, v]) => v).map(([k]) => k),
        comments: Object.values(f.comments ?? {}).filter((x) => x?.id).sort((a, b) => a.ms - b.ms),
        discord: !!f.discord
      });
    } else if (f.kind === "profile") {
      const following = {};
      for (const [plat, map] of Object.entries(f.following ?? {})) following[plat] = Object.entries(map ?? {}).filter(([, v]) => v).map(([k]) => k);
      c.profile.set(f.actorId, { handle: f.handle, bio: f.bio, base: f.base ?? {}, following });
    } else if (f.kind === "job") c.job.push({ ...f.d, result: f.result ?? null, pageId: page.id });
  }
  c.msg.sort((a, b) => a.ms - b.ms);
  c.post.sort((a, b) => b.ms - a.ms);
  c.job.sort((a, b) => a.ms - b.ms);
  return c;
}

function data() {
  cache ??= build();
  return cache;
}

export const messages = () => data().msg;
export const posts = () => data().post;
export const jobs = () => data().job;
export const pageFor = (kind, id) => data().byId.get(`${kind}:${id}`) ?? null;

/** All profiles as { actorId: { handle, bio, base, following } }. */
export function profiles() {
  return Object.fromEntries(data().profile);
}

/* -------------------------------------------- */
/*  Writes                                      */
/* -------------------------------------------- */

export async function create(kind, d, extra = {}) {
  const j = journal();
  if (!j) throw new Error("The phone network isn't set up yet.");
  const [page] = await j.createEmbeddedDocuments("JournalEntryPage", [{
    name: `${kind} ${d?.id ?? extra.actorId ?? ""}`.trim(),
    type: "text",
    text: { content: "" },
    flags: { [F]: { kind, d, ...extra } }
  }]);
  invalidate();
  return page;
}

export async function createMany(records) {
  const j = journal();
  if (!j || !records.length) return [];
  const docs = records.map(({ kind, d, extra = {} }) => ({
    name: `${kind} ${d?.id ?? extra.actorId ?? ""}`.trim(),
    type: "text",
    text: { content: "" },
    flags: { [F]: { kind, d, ...extra } }
  }));
  const out = [];
  for (let i = 0; i < docs.length; i += 100) out.push(...await j.createEmbeddedDocuments("JournalEntryPage", docs.slice(i, i + 100)));
  invalidate();
  return out;
}

/** Update a page's flags. Keys are relative to the module's flags, e.g. { "likes.abc": true }. */
export async function patch(page, changes) {
  if (!page) return null;
  const update = {};
  for (const [k, v] of Object.entries(changes)) update[`flags.${F}.${k}`] = v;
  const res = await page.update(update);
  invalidate();
  return res;
}

export async function remove(pageIds) {
  const j = journal();
  const ids = pageIds.filter((id) => j?.pages.get(id));
  if (!ids.length) return;
  for (let i = 0; i < ids.length; i += 100) await j.deleteEmbeddedDocuments("JournalEntryPage", ids.slice(i, i + 100));
  invalidate();
}

/** The profile page for an actor, created on first use. */
export async function profilePage(actorId) {
  return pageFor("profile", actorId) ?? create("profile", null, { actorId });
}

/* -------------------------------------------- */
/*  GM setup                                    */
/* -------------------------------------------- */

export async function ensureJournal() {
  let j = journal();
  if (j) {
    if ((j.ownership?.default ?? 0) < CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) {
      await j.update({ "ownership.default": CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER });
    }
    return j;
  }
  j = await JournalEntry.create({
    name: NETWORK_NAME,
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
    flags: { [F]: { network: true } }
  });
  invalidate();
  return j;
}

export function isNetworkPage(page) {
  return !!page?.parent?.getFlag?.(F, "network");
}
