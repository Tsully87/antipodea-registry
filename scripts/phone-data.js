import { MODULE_ID } from "./constants.js";
import * as Time from "./time.js";
import * as Social from "./social.js";
import * as Store from "./store.js";

/**
 * Phone data and the GM relay.
 *
 * Shared data (texts, social posts, profiles, calendar events) lives in hidden world settings,
 * which only a GM can write. Players send requests over the module socket and the
 * active GM's client checks them and writes them. Per-phone data (contacts, gallery,
 * reminders, read markers, Rotom, apps, wallet, orders) lives on each trainer's actor flags.
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
    location: null
  };
}

export function getPhone(actor) {
  const stored = actor?.getFlag(MODULE_ID, "phone") ?? {};
  return foundry.utils.mergeObject(defaultPhone(), foundry.utils.deepClone(stored), { inplace: false });
}

export async function setPhone(actor, key, value) {
  return actor.update({ [`flags.${MODULE_ID}.phone.${key}`]: value });
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
/*  Shared data                                 */
/* -------------------------------------------- */

export const messages = () => S("messages") ?? [];
export const posts = () => S("posts") ?? [];
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
/*  Relay                                       */
/* -------------------------------------------- */

export function isActiveGM() {
  if (!game.user.isGM) return false;
  const active = game.users.activeGM;
  return active ? active.isSelf : true;
}

export function hasSignal() {
  return !!game.users.activeGM;
}

const pending = new Map();

/** Send a request to the active GM, or handle it here if that's us. */
export async function request(op, data) {
  if (isActiveGM()) return handle(op, data, game.user.id);
  if (!hasSignal()) {
    ui.notifications.warn("No signal. The GM needs to be online for that to go through.");
    return false;
  }
  game.socket.emit(SOCKET, { op, data, userId: game.user.id });
  return true;
}

/** Like request, but waits for the GM's answer (used for forecasts, payments and orders). */
export async function ask(op, data, timeout = 8000) {
  if (isActiveGM()) return handle(op, data, game.user.id);
  if (!hasSignal()) {
    ui.notifications.warn("No signal. The GM needs to be online for that to go through.");
    return { ok: false, error: "No signal" };
  }
  const reqId = foundry.utils.randomID();
  return new Promise((resolve) => {
    const timer = setTimeout(() => { pending.delete(reqId); resolve({ ok: false, error: "No answer from the network. Try again." }); }, timeout);
    pending.set(reqId, (result) => { clearTimeout(timer); resolve(result); });
    game.socket.emit(SOCKET, { op, data, userId: game.user.id, reqId });
  });
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
    case "message": return relayMessage(user, data);
    case "post": return relayPost(user, data);
    case "like": return relayLike(user, data);
    case "comment": return relayComment(user, data);
    case "deletePost": return relayDeletePost(user, data);
    case "photo": return relayPhoto(user, data);
    case "profile": return relayProfile(user, data);
    case "follow": return relayFollow(user, data);
    case "pay": return relayPay(user, data);
    case "order": return relayOrder(user, data);
    case "forecast": return relayForecast(user, data);
    default: return false;
  }
}

async function relayMessage(user, { from, to, text, img, ch }) {
  if (!canAct(user, from)) return false;
  text = String(text ?? "").slice(0, 1000).trim();
  if (!text && !img) return false;
  const sender = who(from);
  const msg = {
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
  };
  const list = [...messages(), msg].slice(-MAX_MESSAGES);
  await game.settings.set(MODULE_ID, "messages", list);
  return true;
}

async function relayPost(user, data) {
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
    likes: [],
    comments: [],
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
  if (platform === "tiktogepi" && !original) {
    post.sound = String(data.sound ?? "").slice(0, 80).trim();
  }
  if (data.pro) post.pro = true;
  const list = [post, ...posts()].slice(0, MAX_POSTS);
  await game.settings.set(MODULE_ID, "posts", list);
  if (!original) postToSocialDiscord(post).catch((e) => console.error(`${MODULE_ID} | Discord post failed`, e));
  return true;
}

async function relayLike(user, { postId, actorId }) {
  if (!canAct(user, actorId)) return false;
  const list = foundry.utils.deepClone(posts());
  const p = list.find((x) => x.id === postId);
  if (!p) return false;
  p.likes = p.likes.includes(actorId) ? p.likes.filter((x) => x !== actorId) : [...p.likes, actorId];
  await game.settings.set(MODULE_ID, "posts", list);
  return true;
}

async function relayComment(user, { postId, actorId, text }) {
  if (!canAct(user, actorId)) return false;
  text = String(text ?? "").slice(0, 300).trim();
  if (!text) return false;
  const list = foundry.utils.deepClone(posts());
  const p = list.find((x) => x.id === postId);
  if (!p) return false;
  const a = who(actorId);
  p.comments.push({ id: foundry.utils.randomID(), actorId, name: a.name, text, ms: Date.now(), user: user.id });
  await game.settings.set(MODULE_ID, "posts", list);
  return true;
}

async function relayDeletePost(user, { postId }) {
  const p = posts().find((x) => x.id === postId);
  if (!p || !canAct(user, p.author)) return false;
  await game.settings.set(MODULE_ID, "posts", posts().filter((x) => x.id !== postId && x.repostOf !== postId));
  return true;
}

async function relayPhoto(user, { actorId, dataUrl }) {
  if (!canAct(user, actorId)) return false;
  const actor = game.actors.get(actorId);
  if (!actor || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) return false;
  const src = await uploadImage(dataUrl, actorId);
  if (!src) return false;
  const gallery = [{ id: foundry.utils.randomID(), src, ms: Date.now(), wt: Time.now() }, ...getPhone(actor).gallery].slice(0, MAX_GALLERY);
  await setPhone(actor, "gallery", gallery);
  return true;
}

/* -------------------------------------------- */
/*  Social profiles                             */
/* -------------------------------------------- */

async function saveProfile(actorId, fn) {
  const all = foundry.utils.deepClone(Social.allProfiles());
  const cur = all[actorId] ?? {};
  fn(cur);
  all[actorId] = cur;
  await game.settings.set(MODULE_ID, "social", all);
}

async function relayProfile(user, { actorId, handle, bio, base }) {
  if (!canAct(user, actorId)) return { ok: false, error: "Not your profile." };
  if (handle !== undefined) {
    handle = String(handle).replace(/[^A-Za-z0-9_]/g, "").slice(0, 20);
    if (!handle) return { ok: false, error: "Handles can only use letters, numbers and _." };
    const taken = Social.actorByHandle(handle);
    if (taken && taken.id !== actorId) return { ok: false, error: `@${handle} is taken.` };
  }
  await saveProfile(actorId, (p) => {
    if (handle !== undefined) p.handle = handle;
    if (bio !== undefined) p.bio = String(bio).slice(0, 160);
    if (base && user.isGM) p.base = { ...(p.base ?? {}), ...base };
  });
  return { ok: true };
}

async function relayFollow(user, { actorId, targetId, platform }) {
  if (!canAct(user, actorId) || actorId === targetId || !Social.PLATFORMS[platform]) return false;
  await saveProfile(actorId, (p) => {
    p.following ??= {};
    const list = new Set(p.following[platform] ?? []);
    if (list.has(targetId)) list.delete(targetId); else list.add(targetId);
    p.following[platform] = [...list];
  });
  return true;
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
/*  Weather (GM side)                           */
/* -------------------------------------------- */

/**
 * Asks the GM's Antipodea Weather macro for a forecast. The macro needs the small
 * forecast block from the module README, which returns chat-card HTML for each date.
 */
async function relayForecast(user, { zone }) {
  const name = S("weatherMacro") || "ANTIPODEA WEATHER";
  const macro = game.macros.find((m) => m.name === name) ?? game.macros.find((m) => m.command?.includes(name));
  if (!macro) return { ok: false, error: "The weather service is down (no weather macro found)." };
  const api = game.seasonsStars?.api;
  const dates = [Time.now(), Time.addDays(Time.now(), 1)].map((t) => api?.worldTimeToDate?.(t) ?? null);
  try {
    const result = await macro.execute({ forecast: { zone, dates } });
    if (!Array.isArray(result)) return { ok: false, error: "The weather macro needs the forecast block added (see the module README)." };
    return { ok: true, days: result.map((html) => String(html ?? "")) };
  } catch (e) {
    return { ok: false, error: `Forecast failed: ${e.message}` };
  }
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

export async function uploadImage(dataUrl, actorId) {
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
    ui.notifications.error("Antipodea Phone: the photo couldn't be uploaded. Check you have file upload space.");
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
    ui.notifications.warn(`Antipodea Phone: couldn't post to the ${def.name} Discord channel. Check the webhook URL.`);
    return false;
  }
  return true;
}
