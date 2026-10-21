import { MODULE_ID } from "./constants.js";
import * as Time from "./time.js";
import * as Social from "./social.js";
import * as Store from "./store.js";
import * as Net from "./network.js";

/**
 * Phone data.
 *
 * Texts, posts and profiles live in the Phone Network journal (see network.js), which
 * players write to directly, so they work with no GM online. Money, deliveries, Discord
 * posts and live forecasts need a GM: they go over the socket to the active GM, or wait
 * in the network queue until one logs in. Per-phone data (contacts, gallery, reminders,
 * read markers, Rotom, apps, wallet, orders) lives on each trainer's actor flags.
 */

export const SOCKET = `module.${MODULE_ID}`;
const MAX_MESSAGES = 1000;
const MAX_POSTS = 200;
const MAX_GALLERY = 200;
const MAX_LEDGER = 100;

const S = (key) => game.settings.get(MODULE_ID, key);

/* -------------------------------------------- */
/*  Addresses                                   */
/* -------------------------------------------- */

export const rotomKey = (actorId) => `rotom:${actorId}`;
export const isRotomKey = (key) => typeof key === "string" && key.startsWith("rotom:");
export const rotomOwner = (key) => key.slice(6);
/** Thread id. Texts keep the old "a|b" form; social DMs are prefixed with the app. */
export const threadKey = (a, b, ch = "sms") => (ch === "sms" ? "" : `${ch}:`) + [a, b].sort().join("|");
const chOf = (m) => m.ch || "sms";

/** Fake but stable Aussie mobile number from an actor id. */
export function phoneNumber(actorId) {
  let h = 0;
  for (const c of String(actorId)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const n = String(h).padStart(8, "0").slice(-8);
  return `04${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5, 8)}`;
}

/* -------------------------------------------- */
/*  Per-phone data                              */
/* -------------------------------------------- */

export function defaultPhone() {
  return {
    rotom: false,
    rotomName: "Rotom",
    listed: false,
    contacts: [],
    gallery: [],
    reminders: [],
    read: {},
    installed: [],
    purchases: [],
    ledger: [],
    orders: [],
    location: null,
    visited: []
  };
}

export function getPhone(actor) {
  const stored = actor?.getFlag(MODULE_ID, "phone") ?? {};
  return foundry.utils.mergeObject(defaultPhone(), foundry.utils.deepClone(stored), { inplace: false });
}

export async function setPhone(actor, key, value) {
  return actor.update({ [`flags.${MODULE_ID}.phone.${key}`]: value });
}

/** GM: move a trainer to a place. Places they've been unlock that city's map. */
export async function setLocation(actor, pinId) {
  const phone = getPhone(actor);
  const visited = pinId ? [...new Set([...phone.visited, pinId])] : phone.visited;
  return actor.update({
    [`flags.${MODULE_ID}.phone.location`]: pinId || null,
    [`flags.${MODULE_ID}.phone.visited`]: visited
  });
}

const ROTOM_ONLY = {
  pokegram: "rotomOnlyPokegram",
  poketube: "rotomOnlyPoketube",
  tiktogepi: "rotomOnlyTiktogepi",
  camera: "rotomOnlyCamera",
  reminders: "rotomOnlyReminders"
};

/** Built-in apps that the GM can lock to Rotom Phones. The App Store is always Rotom only. */
export function canUseApp(phone, app) {
  if (app === "store") return !!phone.rotom;
  if (phone.rotom) return true;
  return ROTOM_ONLY[app] ? !S(ROTOM_ONLY[app]) : true;
}

/** Paid apps need a Rotom Phone and to have been bought (or granted by the GM). */
export function hasApp(phone, key) {
  return !!phone.rotom && phone.installed.includes(key);
}

/** Name and picture for an address (actor id or rotom key). */
export function who(key, fallback = {}) {
  if (isRotomKey(key)) {
    const owner = game.actors.get(rotomOwner(key));
    return { name: owner ? getPhone(owner).rotomName || "Rotom" : "Rotom", img: null, rotom: true };
  }
  const a = game.actors.get(key);
  return {
    name: a?.name ?? fallback.name ?? "Unknown number",
    img: a?.img ?? fallback.img ?? "icons/svg/mystery-man.svg",
    rotom: false
  };
}

/** Every trainer anyone can text: player trainers plus NPCs the GM has listed. */
export function directory() {
  return game.actors.filter((a) => a.type !== "pokemon" && (a.hasPlayerOwner || getPhone(a).listed));
}

export function defaultContactIds() {
  const raw = S("defaultContacts") ?? "";
  return raw.split(/[\r\n,]+/).map((s) => s.trim()).filter(Boolean)
    .map((n) => game.actors.getName(n)?.id).filter(Boolean);
}

/** Contacts shown on a phone: saved ones, the defaults, and anyone they've texted. */
export function contactsFor(actor) {
  const phone = getPhone(actor);
  const ids = new Set([...defaultContactIds(), ...phone.contacts]);
  for (const m of messages()) {
    if (chOf(m) !== "sms") continue;
    if (m.from === actor.id && !isRotomKey(m.to)) ids.add(m.to);
    if (m.to === actor.id && !isRotomKey(m.from)) ids.add(m.from);
  }
  ids.delete(actor.id);
  return [...ids].filter((id) => game.actors.get(id)).map((id) => ({
    id,
    ...who(id),
    number: phoneNumber(id),
    saved: phone.contacts.includes(id)
  })).sort((a, b) => a.name.localeCompare(b.name));
}

/* -------------------------------------------- */
/*  Shared data (the Phone Network journal)     */
/* -------------------------------------------- */

export const messages = () => Net.messages();
export const posts = () => Net.posts();
export const events = () => S("events") ?? [];

export function threadsFor(actor, ch = "sms") {
  const me = actor.id;
  const mine = messages().filter((m) => chOf(m) === ch && (m.from === me || m.to === me));
  const read = getPhone(actor).read;
  const map = new Map();
  for (const m of mine) {
    const other = m.from === me ? m.to : m.from;
    const key = threadKey(me, other, ch);
    const t = map.get(key) ?? { key, other, last: null, unread: 0 };
    t.last = m;
    if (m.to === me && m.ms > (read[key] ?? 0)) t.unread += 1;
    map.set(key, t);
  }
  return [...map.values()].sort((a, b) => b.last.ms - a.last.ms);
}

export function unreadCount(actor, ch = "sms") {
  return threadsFor(actor, ch).reduce((n, t) => n + t.unread, 0);
}

export function thread(actor, other, ch = "sms") {
  const key = threadKey(actor.id, other, ch);
  return messages().filter((m) => chOf(m) === ch && threadKey(m.from, m.to, ch) === key);
}

/** Players mark their own threads read; the GM only does it on NPC phones so peeking doesn't clear a player's badges. */
export async function markRead(actor, other, ch = "sms") {
  if (game.user.isGM && actor.hasPlayerOwner) return;
  if (!actor.isOwner) return;
  const key = threadKey(actor.id, other, ch);
  const last = thread(actor, other, ch).at(-1);
  if (!last) return;
  const current = getPhone(actor).read[key] ?? 0;
  if (last.ms <= current) return;
  await actor.update({ [`flags.${MODULE_ID}.phone.read.${key}`]: last.ms });
}

/* -------------------------------------------- */
/*  Who handles what                            */
/* -------------------------------------------- */

export function isActiveGM() {
  if (!game.user.isGM) return false;
  const active = game.users.activeGM;
  return active ? active.isSelf : true;
}

/** A GM is logged in somewhere (needed for money, deliveries, Discord and live forecasts). */
export function gmOnline() {
  return !!game.users.activeGM;
}

/** The phone network is set up and this user can use it. Texts and socials only need this. */
export function hasSignal() {
  return Net.ready();
}

/** Things players' phones do themselves, straight into the network journal. */
const NETWORK_OPS = new Set(["message", "post", "like", "comment", "deletePost", "profile", "follow"]);
/** Things only a GM can do. If no GM is on, these wait in a queue. */
const QUEUE_OPS = new Set(["pay", "order", "photo"]);

const pending = new Map();

function noNetwork() {
  ui.notifications.warn("The phone network isn't set up yet. The GM needs to log in once after updating the module.");
  return false;
}

/**
 * Do something on the phone. Network ops run right here; GM ops go to the active GM,
 * or into the queue when nobody's on. Returns true/false, or a result object for ask().
 */
export async function request(op, data) {
  if (NETWORK_OPS.has(op)) {
    if (!Net.ready()) return noNetwork();
    return handle(op, data, game.user.id);
  }
  if (isActiveGM()) return handle(op, data, game.user.id);
  if (gmOnline()) {
    game.socket.emit(SOCKET, { op, data, userId: game.user.id });
    return true;
  }
  if (QUEUE_OPS.has(op)) return queue(op, data);
  ui.notifications.warn("That needs the GM online.");
  return false;
}

/** Like request, but waits for an answer. Queued jobs answer { ok: true, queued: true }. */
export async function ask(op, data, timeout = 8000) {
  if (NETWORK_OPS.has(op)) {
    if (!Net.ready()) { noNetwork(); return { ok: false, error: "No network" }; }
    return handle(op, data, game.user.id);
  }
  if (isActiveGM()) return handle(op, data, game.user.id);
  if (!gmOnline()) {
    if (QUEUE_OPS.has(op)) return queue(op, data);
    return { ok: false, error: "That needs the GM online." };
  }
  const reqId = foundry.utils.randomID();
  return new Promise((resolve) => {
    const timer = setTimeout(() => { pending.delete(reqId); resolve({ ok: false, error: "No answer from the network. Try again." }); }, timeout);
    pending.set(reqId, (result) => { clearTimeout(timer); resolve(result); });
    game.socket.emit(SOCKET, { op, data, userId: game.user.id, reqId });
  });
}

/** Park a GM-only job in the network until a GM logs in. */
async function queue(op, data) {
  if (!Net.ready()) { noNetwork(); return { ok: false, error: "No network" }; }
  await Net.create("job", { id: foundry.utils.randomID(), op, data, user: game.user.id, ms: Date.now() });
  return { ok: true, queued: true };
}

export function onSocket(payload) {
  if (!payload?.op) return;
  if (payload.op === "reply") {
    if (payload.userId !== game.user.id) return;
    pending.get(payload.reqId)?.(payload.result);
    pending.delete(payload.reqId);
    return;
  }
  if (!isActiveGM()) return;
  handle(payload.op, payload.data, payload.userId)
    .then((result) => {
      if (payload.reqId) game.socket.emit(SOCKET, { op: "reply", reqId: payload.reqId, userId: payload.userId, result });
    })
    .catch((e) => {
      console.error(`${MODULE_ID} | relay ${payload.op} failed`, e);
      if (payload.reqId) game.socket.emit(SOCKET, { op: "reply", reqId: payload.reqId, userId: payload.userId, result: { ok: false, error: e.message } });
    });
}

function canAct(user, key) {
  if (!user) return false;
  if (user.isGM) return true;
  if (isRotomKey(key)) return false;
  const a = game.actors.get(key);
  return !!a?.testUserPermission(user, "OWNER");
}

async function handle(op, data, userId) {
  const user = game.users.get(userId);
  switch (op) {
    case "message": return netMessage(user, data);
    case "post": return netPost(user, data);
    case "like": return netLike(user, data);
    case "comment": return netComment(user, data);
    case "deletePost": return netDeletePost(user, data);
    case "profile": return netProfile(user, data);
    case "follow": return netFollow(user, data);
    case "photo": return relayPhoto(user, data);
    case "pay": return relayPay(user, data);
    case "order": return relayOrder(user, data);
    case "forecast": return relayForecast(user, data);
    default: return false;
  }
}

/* -------------------------------------------- */
/*  Network writes (any client)                 */
/* -------------------------------------------- */

async function netMessage(user, { from, to, text, img, ch }) {
  if (!canAct(user, from)) return false;
  text = String(text ?? "").slice(0, 1000).trim();
  if (!text && !img) return false;
  const sender = who(from);
  await Net.create("msg", {
    id: foundry.utils.randomID(),
    from, to,
    ch: ch && ch !== "sms" ? ch : undefined,
    fromName: sender.name,
    fromImg: sender.img,
    text,
    img: img || null,
    ms: Date.now(),
    wt: Time.now(),
    user: user.id
  });
  return true;
}

async function netPost(user, data) {
  const { author } = data;
  if (!canAct(user, author) || isRotomKey(author)) return false;
  const platform = Social.PLATFORMS[data.platform] ? data.platform : "pokegram";
  const original = data.repostOf ? Social.postById(data.repostOf) : null;
  if (data.repostOf && !original) return false;
  if (!original && !data.img) return false;
  const a = who(author);
  const post = {
    id: foundry.utils.randomID(),
    platform,
    author,
    authorName: a.name,
    authorImg: a.img,
    caption: String(data.caption ?? "").slice(0, 500).trim(),
    img: original ? null : data.img,
    ms: Date.now(),
    wt: Time.now(),
    user: user.id,
    fansAt: Social.fanCount(author, platform)
  };
  if (original) post.repostOf = original.id;
  if (platform === "poketube" && !original) {
    post.title = String(data.title ?? "").slice(0, 100).trim() || "Untitled video";
    post.length = Math.max(1, Math.min(36000, Number(data.length) || 60));
  }
  if (platform === "tiktogepi" && !original) post.sound = String(data.sound ?? "").slice(0, 80).trim();
  if (data.pro) post.pro = true;
  // Reposts never go to Discord; originals get mirrored by whichever GM is on.
  await Net.create("post", post, { discord: !!original });
  return true;
}

async function netLike(user, { postId, actorId }) {
  if (!canAct(user, actorId)) return false;
  const page = Net.pageFor("post", postId);
  if (!page) return false;
  const liked = !!page.flags?.[MODULE_ID]?.likes?.[actorId];
  await Net.patch(page, liked ? { [`likes.-=${actorId}`]: null } : { [`likes.${actorId}`]: true });
  return true;
}

async function netComment(user, { postId, actorId, text }) {
  if (!canAct(user, actorId)) return false;
  text = String(text ?? "").slice(0, 300).trim();
  if (!text) return false;
  const page = Net.pageFor("post", postId);
  if (!page) return false;
  const id = foundry.utils.randomID();
  await Net.patch(page, { [`comments.${id}`]: { id, actorId, name: who(actorId).name, text, ms: Date.now(), user: user.id } });
  return true;
}

async function netDeletePost(user, { postId }) {
  const p = Social.postById(postId);
  if (!p || !canAct(user, p.author)) return false;
  const ids = [Net.pageFor("post", postId)?.id, ...Net.posts().filter((x) => x.repostOf === postId).map((x) => Net.pageFor("post", x.id)?.id)];
  await Net.remove(ids.filter(Boolean));
  return true;
}

async function netProfile(user, { actorId, handle, bio, base }) {
  if (!canAct(user, actorId)) return { ok: false, error: "Not your profile." };
  const changes = {};
  if (handle !== undefined) {
    handle = String(handle).replace(/[^A-Za-z0-9_]/g, "").slice(0, 20);
    if (!handle) return { ok: false, error: "Handles can only use letters, numbers and _." };
    const taken = Social.actorByHandle(handle);
    if (taken && taken.id !== actorId) return { ok: false, error: `@${handle} is taken.` };
    changes.handle = handle;
  }
  if (bio !== undefined) changes.bio = String(bio).slice(0, 160);
  if (base && user.isGM) for (const [k, v] of Object.entries(base)) changes[`base.${k}`] = Math.max(0, Math.floor(Number(v) || 0));
  if (!Object.keys(changes).length) return { ok: true };
  await Net.patch(await Net.profilePage(actorId), changes);
  return { ok: true };
}

async function netFollow(user, { actorId, targetId, platform }) {
  if (!canAct(user, actorId) || actorId === targetId || !Social.PLATFORMS[platform]) return false;
  const page = await Net.profilePage(actorId);
  const on = !!page.flags?.[MODULE_ID]?.following?.[platform]?.[targetId];
  await Net.patch(page, on ? { [`following.${platform}.-=${targetId}`]: null } : { [`following.${platform}.${targetId}`]: true });
  return true;
}

/* -------------------------------------------- */
/*  Photos                                      */
/* -------------------------------------------- */

/** Save a photo: upload it ourselves if allowed, otherwise via the GM (or the queue). */
export async function savePhoto(actor, dataUrl) {
  if (game.user.isGM || game.user.can?.("FILES_UPLOAD")) {
    try {
      const src = await uploadImage(dataUrl, actor.id, { quiet: !game.user.isGM });
      if (src) {
        await addToGallery(actor, src);
        return { ok: true };
      }
    } catch (e) {
      console.warn(`${MODULE_ID} | direct upload failed, handing it to the GM`, e);
    }
  }
  return ask("photo", { actorId: actor.id, dataUrl }, 20000);
}

async function addToGallery(actor, src) {
  const gallery = [{ id: foundry.utils.randomID(), src, ms: Date.now(), wt: Time.now() }, ...getPhone(actor).gallery].slice(0, MAX_GALLERY);
  await setPhone(actor, "gallery", gallery);
}

async function relayPhoto(user, { actorId, dataUrl }) {
  if (!canAct(user, actorId)) return { ok: false, error: "Not your phone." };
  const actor = game.actors.get(actorId);
  if (!actor || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) return { ok: false, error: "That isn't a picture." };
  const src = await uploadImage(dataUrl, actorId);
  if (!src) return { ok: false, error: "Upload failed." };
  await addToGallery(actor, src);
  return { ok: true };
}

/* -------------------------------------------- */
/*  PokéPay and Mart Express (GM side)          */
/* -------------------------------------------- */

/** Westmarch rule: no moving money between characters owned by the same player. */
function sameOwner(a, b) {
  return game.users.some((u) => !u.isGM && a.testUserPermission(u, "OWNER") && b.testUserPermission(u, "OWNER"));
}

function ledgerEntry(other, amount, note) {
  return { id: foundry.utils.randomID(), other, amount, note: String(note ?? "").slice(0, 80), wt: Time.now(), ms: Date.now() };
}

async function relayPay(user, { from, to, amount, note }) {
  const a = game.actors.get(from), b = game.actors.get(to);
  amount = Math.floor(Number(amount) || 0);
  if (!a || !b || a === b) return { ok: false, error: "Pick someone to pay." };
  if (!canAct(user, from)) return { ok: false, error: "That's not your wallet." };
  if (amount <= 0) return { ok: false, error: "Enter an amount." };
  if (!hasApp(getPhone(a), "pokepay")) return { ok: false, error: "PokéPay isn't installed." };
  if (sameOwner(a, b)) return { ok: false, error: "You can't send money between your own characters." };
  if (Store.money(a) < amount) return { ok: false, error: "Not enough money." };
  const pa = getPhone(a), pb = getPhone(b);
  await a.update({
    "system.money": Store.money(a) - amount,
    [`flags.${MODULE_ID}.phone.ledger`]: [ledgerEntry(to, -amount, note), ...pa.ledger].slice(0, MAX_LEDGER)
  });
  await b.update({
    "system.money": Store.money(b) + amount,
    [`flags.${MODULE_ID}.phone.ledger`]: [ledgerEntry(from, amount, note), ...pb.ledger].slice(0, MAX_LEDGER)
  });
  return { ok: true };
}

async function relayOrder(user, { actorId, itemId, qty }) {
  const actor = game.actors.get(actorId);
  qty = Math.max(1, Math.min(99, Math.floor(Number(qty) || 1)));
  if (!actor || !canAct(user, actorId)) return { ok: false, error: "That's not your account." };
  if (!hasApp(getPhone(actor), "mart")) return { ok: false, error: "Mart Express isn't installed." };
  const item = Store.martCatalog().find((i) => i.id === itemId);
  if (!item) return { ok: false, error: "That item isn't stocked." };
  const total = item.price * qty;
  if (Store.money(actor) < total) return { ok: false, error: `Not enough money. That's ${Store.fmtMoney(total)}.` };
  const days = Number(S("martDeliveryDays")) || 1;
  const phone = getPhone(actor);
  const order = { id: foundry.utils.randomID(), itemId, name: item.name, img: item.img, qty, total, wt: Time.now(), due: Time.addDays(Time.now(), days), delivered: false };
  await actor.update({
    "system.money": Store.money(actor) - total,
    [`flags.${MODULE_ID}.phone.orders`]: [order, ...phone.orders].slice(0, 50),
    [`flags.${MODULE_ID}.phone.ledger`]: [ledgerEntry("mart", -total, `${qty} x ${item.name}`), ...phone.ledger].slice(0, MAX_LEDGER)
  });
  return { ok: true, due: order.due };
}

/** GM side: hand over any orders whose delivery time has passed. */
export async function deliverOrders() {
  const t = Time.now();
  for (const actor of game.actors) {
    if (actor.type === "pokemon") continue;
    const phone = getPhone(actor);
    if (!phone.orders.some((o) => !o.delivered && o.due <= t)) continue;
    const orders = foundry.utils.deepClone(phone.orders);
    for (const o of orders) {
      if (o.delivered || o.due > t) continue;
      const ok = await Store.deliver(actor, o.itemId, o.qty);
      o.delivered = ok ? true : "failed";
    }
    await setPhone(actor, "orders", orders);
  }
}

/* -------------------------------------------- */
/*  The GM's background jobs                    */
/* -------------------------------------------- */

let working = false;

/** Run queued jobs, send any posts that haven't gone to Discord yet. Active GM only. */
export async function processBacklog() {
  if (!isActiveGM() || working || !Net.journal()) return;
  working = true;
  try {
    for (const job of Net.jobs()) {
      if (job.result) continue;
      const page = Net.journal().pages.get(job.pageId);
      let result;
      try { result = await handle(job.op, job.data, job.user); }
      catch (e) { result = { ok: false, error: e.message }; }
      if (result === true || result?.ok) await Net.remove([job.pageId]);
      else await Net.patch(page, { result: { ok: false, error: result?.error ?? "It didn't go through.", op: job.op } });
    }
    const cutoff = Date.now() - 2 * 24 * 3600 * 1000;
    for (const p of Net.posts()) {
      if (p.discord || p.repostOf) continue;
      const page = Net.pageFor("post", p.id);
      if (p.ms < cutoff) { await Net.patch(page, { discord: true }); continue; }
      const sent = await postToSocialDiscord(p).catch(() => false);
      if (sent || !socialDiscordOn(p)) await Net.patch(page, { discord: true });
    }
  } finally {
    working = false;
  }
}

/** Players: show (and clear) results of their queued jobs that failed. */
export async function checkMyJobs() {
  for (const job of Net.jobs()) {
    if (job.user !== game.user.id || !job.result) continue;
    const what = { pay: "PokéPay payment", order: "Mart Express order", photo: "Photo" }[job.op] ?? "Request";
    ui.notifications.warn(`${what} didn't go through: ${job.result.error}`);
    await Net.remove([job.pageId]);
  }
}

/** GM: keep the network a sensible size. */
export async function prune() {
  if (!isActiveGM()) return;
  const msgs = Net.messages();
  if (msgs.length > MAX_MESSAGES * 1.5) {
    await Net.remove(msgs.slice(0, msgs.length - MAX_MESSAGES).map((m) => Net.pageFor("msg", m.id)?.id).filter(Boolean));
  }
  const ps = Net.posts();
  if (ps.length > MAX_POSTS * 1.5) {
    const old = ps.slice(MAX_POSTS);
    const ids = new Set(old.map((p) => p.id));
    const gone = [...old, ...ps.filter((p) => p.repostOf && ids.has(p.repostOf))];
    await Net.remove(gone.map((p) => Net.pageFor("post", p.id)?.id).filter(Boolean));
  }
}

/** GM, once: move texts, posts and profiles from the old world settings into the network. */
export async function migrateFromSettings() {
  if (!game.user.isGM || S("networkMigrated")) return;
  const oldMsgs = S("messages") ?? [];
  const oldPosts = S("posts") ?? [];
  const oldSocial = S("social") ?? {};
  const records = [];
  for (const m of oldMsgs) records.push({ kind: "msg", d: m });
  for (const p of oldPosts) {
    const { likes = [], comments = [], ...d } = p;
    records.push({
      kind: "post", d,
      extra: {
        discord: true,
        likes: Object.fromEntries(likes.map((id) => [id, true])),
        comments: Object.fromEntries(comments.map((c) => [c.id ?? foundry.utils.randomID(), { ...c, id: c.id ?? foundry.utils.randomID() }]))
      }
    });
  }
  for (const [actorId, prof] of Object.entries(oldSocial)) {
    const following = {};
    for (const [plat, list] of Object.entries(prof.following ?? {})) following[plat] = Object.fromEntries((list ?? []).map((id) => [id, true]));
    records.push({ kind: "profile", d: null, extra: { actorId, handle: prof.handle, bio: prof.bio, base: prof.base ?? {}, following } });
  }
  await Net.createMany(records);
  await game.settings.set(MODULE_ID, "networkMigrated", true);
  if (records.length) {
    await game.settings.set(MODULE_ID, "messages", []);
    await game.settings.set(MODULE_ID, "posts", []);
    await game.settings.set(MODULE_ID, "social", {});
    ui.notifications.info(`Pokémon Phone: moved ${oldMsgs.length} texts, ${oldPosts.length} posts and ${Object.keys(oldSocial).length} profiles into the Phone Network.`);
  }
}

/* -------------------------------------------- */
/*  Weather                                     */
/* -------------------------------------------- */

function weatherMacro() {
  const name = S("weatherMacro") || "ANTIPODEA WEATHER";
  return game.macros.find((m) => m.name === name) ?? game.macros.find((m) => m.command?.includes(name)) ?? null;
}

const dateKey = (d) => (d ? `${d.year}-${d.month}-${d.day}` : null);

function dateAt(t) {
  const api = game.seasonsStars?.api;
  return api?.worldTimeToDate?.(t) ?? null;
}

/**
 * Asks the GM's Antipodea Weather macro for a forecast. The macro needs the small
 * forecast block from the module README, which returns chat-card HTML for each date.
 */
async function relayForecast(user, { zone }) {
  const macro = weatherMacro();
  if (!macro) return { ok: false, error: "The weather service is down (no weather macro found)." };
  const dates = [Time.now(), Time.addDays(Time.now(), 1)].map(dateAt);
  try {
    const result = await macro.execute({ forecast: { zone, dates } });
    if (!Array.isArray(result)) return { ok: false, error: "The weather macro needs the forecast block added (see the module README)." };
    return { ok: true, days: result.map((html) => String(html ?? "")) };
  } catch (e) {
    return { ok: false, error: `Forecast failed: ${e.message}` };
  }
}

/** GM: save the next week's forecast for every zone so the Weather app works with no GM on. */
export async function refreshForecastCache(zones, days = 7) {
  if (!isActiveGM()) return;
  const macro = weatherMacro();
  if (!macro) return;
  const today = dateAt(Time.now());
  if (!today) return;
  const cache = S("forecastCache") ?? {};
  if (cache.from === dateKey(today) && cache.days >= days) return;
  const dates = Array.from({ length: days }, (_, i) => dateAt(Time.addDays(Time.now(), i)));
  const out = { from: dateKey(today), days, zones: {} };
  for (const zone of zones) {
    try {
      const result = await macro.execute({ forecast: { zone, dates } });
      if (!Array.isArray(result)) return;
      out.zones[zone] = Object.fromEntries(dates.map((d, i) => [dateKey(d), String(result[i] ?? "")]));
    } catch (e) {
      console.warn(`${MODULE_ID} | forecast cache failed for ${zone}`, e);
    }
  }
  await game.settings.set(MODULE_ID, "forecastCache", out);
}

/** Today's and tomorrow's forecast from the saved cache, if it has them. */
export function cachedForecast(zone) {
  const cache = S("forecastCache") ?? {};
  const z = cache.zones?.[zone];
  if (!z) return null;
  const keys = [Time.now(), Time.addDays(Time.now(), 1)].map((t) => dateKey(dateAt(t)));
  if (keys.some((k) => !k || !z[k])) return null;
  return keys.map((k) => z[k]);
}

/* -------------------------------------------- */
/*  Uploads (GM side)                           */
/* -------------------------------------------- */

function filePicker() {
  return foundry.applications.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
}

function uploadSource() {
  return (typeof ForgeVTT !== "undefined" && ForgeVTT?.usingTheForge) ? "forgevtt" : "data";
}

async function ensureDir(FP, source, path) {
  try { await FP.createDirectory(source, path, {}); } catch (e) { /* already exists */ }
}

export async function uploadImage(dataUrl, actorId, { quiet = false } = {}) {
  const FP = filePicker();
  const source = uploadSource();
  const root = "antipodea-phone";
  const dir = `${root}/${actorId}`;
  await ensureDir(FP, source, root);
  await ensureDir(FP, source, dir);
  const blob = await (await fetch(dataUrl)).blob();
  const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
  const file = new File([blob], `${Date.now()}.${ext}`, { type: blob.type });
  const res = await FP.upload(source, dir, file, {}, { notify: false });
  if (!res?.path) {
    if (!quiet) ui.notifications.error("Pokémon Phone: the photo couldn't be uploaded. Check you have file upload space.");
    return null;
  }
  return res.path;
}

/* -------------------------------------------- */
/*  Client-side image helpers                   */
/* -------------------------------------------- */

export const FILTERS = {
  none: { label: "None", css: "none" },
  vivid: { label: "Vivid", css: "saturate(1.5) contrast(1.1)" },
  warm: { label: "Warm", css: "sepia(.25) saturate(1.3) hue-rotate(-10deg)" },
  noir: { label: "Noir", css: "grayscale(1) contrast(1.25)" },
  vintage: { label: "Vintage", css: "sepia(.55) contrast(.9) brightness(1.05)" },
  drama: { label: "Drama", css: "contrast(1.4) saturate(1.2) brightness(.9)" }
};

function shrink(source, width, height, { maxEdge = 1280, filter = "none" } = {}) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const out = document.createElement("canvas");
  out.width = Math.round(width * scale);
  out.height = Math.round(height * scale);
  const ctx = out.getContext("2d");
  const css = FILTERS[filter]?.css ?? "none";
  if (css !== "none") ctx.filter = css;
  ctx.drawImage(source, 0, 0, out.width, out.height);
  return out.toDataURL("image/jpeg", maxEdge > 1280 ? 0.9 : 0.82);
}

/** Snapshot of what this player can see on the canvas right now. */
export function captureScene(opts = {}) {
  if (!canvas?.ready || !canvas.scene) throw new Error("No scene is open to take a photo of.");
  const app = canvas.app;
  const view = app.view ?? app.canvas;
  // Render and copy in the same tick, before the WebGL buffer is cleared.
  app.renderer.render(app.stage);
  return shrink(view, view.width, view.height, opts);
}

/** Ask the player for an image file from their device. */
export function pickDeviceImage(opts = {}) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const data = shrink(img, img.naturalWidth, img.naturalHeight, opts);
        URL.revokeObjectURL(url);
        resolve(data);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
    input.click();
  });
}

/* -------------------------------------------- */
/*  Social posts to Discord (GM side)           */
/* -------------------------------------------- */

function absolute(src) {
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) return src;
  return null;
}

/** Is Discord mirroring set up on this GM for that post's app? */
export function socialDiscordOn(post) {
  const def = Social.PLATFORMS[Social.platformOf(post)];
  return !!(game.user.isGM && S("pokegramToDiscord") && (game.settings.get(MODULE_ID, def.webhook) ?? "").trim());
}

export async function postToSocialDiscord(post) {
  const def = Social.PLATFORMS[Social.platformOf(post)];
  if (!game.user.isGM || !S("pokegramToDiscord")) return false;
  const url = (game.settings.get(MODULE_ID, def.webhook) ?? "").trim();
  if (!url) return false;

  const handle = Social.profile(post.author).handle;
  const embed = {
    color: parseInt(def.color.slice(1), 16),
    author: { name: `@${handle}` },
    description: post.caption || undefined,
    footer: { text: `${def.name} | ${Time.formatLong(post.wt)}` }
  };
  if (post.title) embed.title = `▶ ${post.title} (${Social.duration(post.length)})`;
  if (post.sound) embed.footer.text = `🎵 ${post.sound} | ${embed.footer.text}`;
  const payload = { username: `${post.authorName} on ${def.name}`.slice(0, 80), allowed_mentions: { parse: [] }, embeds: [embed] };
  const avatar = absolute(post.authorImg);
  if (avatar) payload.avatar_url = avatar;

  const remote = absolute(post.img);
  let res;
  if (remote) {
    embed.image = { url: remote };
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  } else {
    const blob = await (await fetch(post.img)).blob();
    embed.image = { url: "attachment://photo.jpg" };
    const fd = new FormData();
    fd.append("payload_json", JSON.stringify(payload));
    fd.append("files[0]", blob, "photo.jpg");
    res = await fetch(url, { method: "POST", body: fd });
  }
  if (!res.ok) {
    ui.notifications.warn(`Pokémon Phone: couldn't post to the ${def.name} Discord channel. Check the webhook URL.`);
    return false;
  }
  return true;
}
