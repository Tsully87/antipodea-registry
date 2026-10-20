import { MODULE_ID } from "./constants.js";
import * as Time from "./time.js";

/**
 * Phone data and the GM relay.
 *
 * Shared data (texts, PokéGram posts, calendar events) lives in hidden world settings,
 * which only a GM can write. Players send requests over the module socket and the
 * active GM's client checks them and writes them. Per-phone data (contacts, gallery,
 * reminders, read markers, Rotom) lives on each trainer's actor flags.
 */

export const SOCKET = `module.${MODULE_ID}`;
const MAX_MESSAGES = 1000;
const MAX_POSTS = 200;
const MAX_GALLERY = 200;

const S = (key) => game.settings.get(MODULE_ID, key);

/* -------------------------------------------- */
/*  Addresses                                   */
/* -------------------------------------------- */

export const rotomKey = (actorId) => `rotom:${actorId}`;
export const isRotomKey = (key) => typeof key === "string" && key.startsWith("rotom:");
export const rotomOwner = (key) => key.slice(6);
export const threadKey = (a, b) => [a, b].sort().join("|");

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
    read: {}
  };
}

export function getPhone(actor) {
  const stored = actor?.getFlag(MODULE_ID, "phone") ?? {};
  return foundry.utils.mergeObject(defaultPhone(), foundry.utils.deepClone(stored), { inplace: false });
}

export async function setPhone(actor, key, value) {
  return actor.update({ [`flags.${MODULE_ID}.phone.${key}`]: value });
}

export function canUseApp(phone, app) {
  if (phone.rotom) return true;
  const map = { pokegram: "rotomOnlyPokegram", camera: "rotomOnlyCamera", reminders: "rotomOnlyReminders" };
  return map[app] ? !S(map[app]) : true;
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

export function threadsFor(actor) {
  const me = actor.id;
  const mine = messages().filter((m) => m.from === me || m.to === me);
  const read = getPhone(actor).read;
  const map = new Map();
  for (const m of mine) {
    const other = m.from === me ? m.to : m.from;
    const key = threadKey(me, other);
    const t = map.get(key) ?? { key, other, last: null, unread: 0 };
    t.last = m;
    if (m.to === me && m.ms > (read[key] ?? 0)) t.unread += 1;
    map.set(key, t);
  }
  return [...map.values()].sort((a, b) => b.last.ms - a.last.ms);
}

export function unreadCount(actor) {
  return threadsFor(actor).reduce((n, t) => n + t.unread, 0);
}

export function thread(actor, other) {
  const key = threadKey(actor.id, other);
  return messages().filter((m) => threadKey(m.from, m.to) === key);
}

/** Players mark their own threads read; the GM only does it on NPC phones so peeking doesn't clear a player's badges. */
export async function markRead(actor, other) {
  if (game.user.isGM && actor.hasPlayerOwner) return;
  if (!actor.isOwner) return;
  const key = threadKey(actor.id, other);
  const last = thread(actor, other).at(-1);
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

/** Send a request to the active GM, or handle it here if that's us. */
export async function request(op, data) {
  if (isActiveGM()) return handle(op, data, game.user.id);
  if (!hasSignal()) {
    ui.notifications.warn("No signal. The GM needs to be online for texts, posts and photos to go through.");
    return false;
  }
  game.socket.emit(SOCKET, { op, data, userId: game.user.id });
  return true;
}

export function onSocket(payload) {
  if (!payload?.op || !isActiveGM()) return;
  handle(payload.op, payload.data, payload.userId).catch((e) => console.error(`${MODULE_ID} | relay ${payload.op} failed`, e));
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
    default: return false;
  }
}

async function relayMessage(user, { from, to, text, img }) {
  if (!canAct(user, from)) return false;
  text = String(text ?? "").slice(0, 1000).trim();
  if (!text && !img) return false;
  const sender = who(from);
  const msg = {
    id: foundry.utils.randomID(),
    from, to,
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

async function relayPost(user, { author, caption, img }) {
  if (!canAct(user, author) || isRotomKey(author)) return false;
  if (!img) return false;
  const a = who(author);
  const post = {
    id: foundry.utils.randomID(),
    author,
    authorName: a.name,
    authorImg: a.img,
    caption: String(caption ?? "").slice(0, 500).trim(),
    img,
    likes: [],
    comments: [],
    ms: Date.now(),
    wt: Time.now(),
    user: user.id
  };
  const list = [post, ...posts()].slice(0, MAX_POSTS);
  await game.settings.set(MODULE_ID, "posts", list);
  postToPokegramDiscord(post).catch((e) => console.error(`${MODULE_ID} | PokéGram Discord post failed`, e));
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
  await game.settings.set(MODULE_ID, "posts", posts().filter((x) => x.id !== postId));
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

const MAX_EDGE = 1280;

function shrink(source, width, height) {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const out = document.createElement("canvas");
  out.width = Math.round(width * scale);
  out.height = Math.round(height * scale);
  out.getContext("2d").drawImage(source, 0, 0, out.width, out.height);
  return out.toDataURL("image/jpeg", 0.82);
}

/** Snapshot of what this player can see on the canvas right now. */
export function captureScene() {
  if (!canvas?.ready || !canvas.scene) throw new Error("No scene is open to take a photo of.");
  const app = canvas.app;
  const view = app.view ?? app.canvas;
  // Render and copy in the same tick, before the WebGL buffer is cleared.
  app.renderer.render(app.stage);
  return shrink(view, view.width, view.height);
}

/** Ask the player for an image file from their device. */
export function pickDeviceImage() {
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
        const data = shrink(img, img.naturalWidth, img.naturalHeight);
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
/*  PokéGram to Discord (GM side)               */
/* -------------------------------------------- */

function absolute(src) {
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) return src;
  return null;
}

export async function postToPokegramDiscord(post) {
  if (!game.user.isGM || !S("pokegramToDiscord")) return false;
  const url = (game.settings.get(MODULE_ID, "pokegramWebhookUrl") ?? "").trim();
  if (!url) return false;

  const payload = {
    username: `${post.authorName} on PokéGram`.slice(0, 80),
    allowed_mentions: { parse: [] },
    embeds: [{
      color: 0xc4622d,
      author: { name: `@${post.authorName.replace(/\s+/g, "")}` },
      description: post.caption || undefined,
      footer: { text: `PokéGram | ${Time.formatLong(post.wt)}` }
    }]
  };
  const avatar = absolute(post.authorImg);
  if (avatar) payload.avatar_url = avatar;

  const remote = absolute(post.img);
  let res;
  if (remote) {
    payload.embeds[0].image = { url: remote };
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  } else {
    const blob = await (await fetch(post.img)).blob();
    payload.embeds[0].image = { url: "attachment://photo.jpg" };
    const fd = new FormData();
    fd.append("payload_json", JSON.stringify(payload));
    fd.append("files[0]", blob, "photo.jpg");
    res = await fetch(url, { method: "POST", body: fd });
  }
  if (!res.ok) {
    ui.notifications.warn("Antipodea Phone: couldn't post to the PokéGram Discord channel. Check the webhook URL.");
    return false;
  }
  return true;
}
