import { MODULE_ID } from "./constants.js";
import * as Data from "./phone-data.js";
import * as Social from "./social.js";
import * as Store from "./store.js";

/** Phone-style banners that slide in on screen, plus the logic for who gets them. */

let seenMessages = new Set();
let seenPosts = new Map(); // postId -> comment count
let seenFollowers = new Map(); // "actorId:platform" -> Set of follower ids
let seenPhone = new Map(); // actorId -> { ledger: Set, delivered: Set }
let RegistryPhoneRef = null;
let started = false;

function followerSnapshot() {
  const map = new Map();
  for (const a of game.actors) {
    if (a.type === "pokemon") continue;
    for (const k of Object.keys(Social.PLATFORMS)) map.set(`${a.id}:${k}`, new Set(Social.realFollowers(a.id, k)));
  }
  return map;
}

function phoneSnapshot(actor) {
  const ph = Data.getPhone(actor);
  return { ledger: new Set(ph.ledger.map((l) => l.id)), delivered: new Set(ph.orders.filter((o) => o.delivered === true).map((o) => o.id)) };
}

export function init(PhoneClass) {
  RegistryPhoneRef = PhoneClass;
  seenMessages = new Set(Data.messages().map((m) => m.id));
  seenPosts = new Map(Data.posts().map((p) => [p.id, p.comments.length]));
  seenFollowers = followerSnapshot();
  seenPhone = new Map(game.actors.filter((a) => a.type !== "pokemon").map((a) => [a.id, phoneSnapshot(a)]));
  started = true;
}

function container() {
  let el = document.getElementById("antipodea-toasts");
  if (!el) {
    el = document.createElement("div");
    el.id = "antipodea-toasts";
    document.body.appendChild(el);
  }
  return el;
}

function playSound() {
  try {
    if (!game.settings.get(MODULE_ID, "notificationSound")) return;
    const helper = foundry.audio?.AudioHelper ?? globalThis.AudioHelper;
    helper?.play({ src: "sounds/notify.wav", volume: 0.5, autoplay: true, loop: false }, false);
  } catch (e) { /* no sound is fine */ }
}

/**
 * @param {object} o { title, body, img, rotom, icon, onClick }
 */
export function toast(o) {
  const el = document.createElement("div");
  el.className = `ap-toast${o.rotom ? " rotom" : ""}`;
  const pic = o.rotom
    ? `<span class="ap-rotom-face small"><i></i><i></i></span>`
    : o.img ? `<img src="${o.img}" alt="">` : `<span class="ap-toast-icon"><i class="fa-solid ${o.icon ?? "fa-mobile-screen-button"}"></i></span>`;
  el.innerHTML = `${pic}<div class="ap-toast-text"><strong></strong><span></span></div>`;
  el.querySelector("strong").textContent = o.title ?? "";
  el.querySelector(".ap-toast-text span").textContent = o.body ?? "";
  el.addEventListener("click", () => { o.onClick?.(); el.remove(); });
  container().appendChild(el);
  playSound();
  setTimeout(() => el.classList.add("out"), 6000);
  setTimeout(() => el.remove(), 6600);
}

/** Should this client hear about something sent to this address? */
function listensTo(key) {
  if (Data.isRotomKey(key)) return game.user.isGM;
  const a = game.actors.get(key);
  if (!a) return false;
  if (game.user.isGM) return !a.hasPlayerOwner;
  return a.isOwner;
}

function phoneOf(key) {
  return Data.isRotomKey(key) ? game.actors.get(Data.rotomOwner(key)) : game.actors.get(key);
}

export function onMessagesChanged() {
  if (!started) return;
  const list = Data.messages();
  for (const m of list) {
    if (seenMessages.has(m.id)) continue;
    seenMessages.add(m.id);
    if (m.user === game.user.id || !listensTo(m.to)) continue;
    const owner = phoneOf(m.to);
    if (!owner) continue;
    const other = Data.isRotomKey(m.to) ? m.to : m.from;
    const ch = m.ch || "sms";
    if (RegistryPhoneRef?.isViewingThread(owner.id, other, ch)) continue;
    const sender = Data.who(m.from, { name: m.fromName, img: m.fromImg });
    const ownerName = game.user.isGM || game.actors.filter((a) => a.isOwner && a.type !== "pokemon").length > 1 ? ` (to ${owner.name})` : "";
    const via = ch !== "sms" ? ` on ${Social.PLATFORMS[ch]?.name ?? ch}` : "";
    toast({
      title: `${sender.name}${via}${ownerName}`,
      body: m.text || "📷 Photo",
      img: sender.img,
      rotom: sender.rotom,
      onClick: () => RegistryPhoneRef?.open(owner, { app: "thread", other, ch })
    });
  }
  RegistryPhoneRef?.refresh();
}

/** My trainers mentioned in some text (by @handle). */
function mentionedMine(text) {
  const handles = new Set(Social.parseMentions(text).map((h) => h.toLowerCase()));
  if (!handles.size) return [];
  return game.actors.filter((a) => a.type !== "pokemon" && listensTo(a.id) && handles.has(Social.profile(a.id).handle.toLowerCase()));
}

export function onPostsChanged() {
  if (!started) return;
  const list = Data.posts();
  for (const p of list) {
    const app = Social.platformOf(p);
    const def = Social.PLATFORMS[app];
    const known = seenPosts.get(p.id);
    if (known === undefined) {
      seenPosts.set(p.id, p.comments.length);
      if (p.user === game.user.id) continue;
      if (p.repostOf) {
        const orig = Social.postById(p.repostOf);
        const author = orig && game.actors.get(orig.author);
        if (author && listensTo(author.id)) {
          toast({ title: `${p.authorName} reposted you`, body: `on ${def.name}`, img: p.authorImg, icon: "fa-retweet", onClick: () => RegistryPhoneRef?.open(author, { app }) });
        }
        continue;
      }
      const tagged = mentionedMine(`${p.caption ?? ""} ${p.title ?? ""}`);
      for (const a of tagged) {
        toast({ title: `${p.authorName} tagged ${a.name}`, body: p.caption || p.title || def.name, img: p.authorImg, icon: "fa-at", onClick: () => RegistryPhoneRef?.open(a, { app }) });
      }
      if (tagged.length || !game.settings.get(MODULE_ID, "pokegramToasts")) continue;
      toast({
        title: `${p.authorName} ${def.verb} on ${def.name}`,
        body: p.title || p.caption || "New post",
        img: p.authorImg,
        icon: def.icon,
        onClick: () => openMyPhone(app)
      });
      continue;
    }
    if (p.comments.length > known) {
      const fresh = p.comments.slice(known);
      seenPosts.set(p.id, p.comments.length);
      const author = game.actors.get(p.author);
      for (const c of fresh) {
        if (c.user === game.user.id) continue;
        const tagged = mentionedMine(c.text);
        for (const a of tagged) {
          toast({ title: `${c.name} mentioned ${a.name}`, body: c.text, img: Data.who(c.actorId).img, icon: "fa-at", onClick: () => RegistryPhoneRef?.open(a, { app }) });
        }
        if (!author || !listensTo(p.author) || tagged.includes(author)) continue;
        toast({
          title: `${c.name} commented`,
          body: c.text,
          img: Data.who(c.actorId).img,
          icon: "fa-comment",
          onClick: () => RegistryPhoneRef?.open(author, { app })
        });
      }
    }
  }
  RegistryPhoneRef?.refresh();
}

/** New real followers on any of my trainers. */
export function onSocialChanged() {
  if (!started) return;
  const now = followerSnapshot();
  for (const [key, set] of now) {
    const before = seenFollowers.get(key) ?? new Set();
    const [actorId, app] = key.split(":");
    if (!listensTo(actorId)) continue;
    for (const id of set) {
      if (before.has(id)) continue;
      const fan = game.actors.get(id);
      const def = Social.PLATFORMS[app];
      toast({
        title: `${fan?.name ?? "Someone"} ${app === "poketube" ? "subscribed" : "followed you"}`,
        body: `@${Social.profile(id).handle} on ${def.name}`,
        img: fan?.img, icon: "fa-user-plus",
        onClick: () => RegistryPhoneRef?.open(game.actors.get(actorId), { app })
      });
    }
  }
  seenFollowers = now;
  RegistryPhoneRef?.refresh();
}

/** Money in and parcels delivered. */
export function onPhoneChanged(actor) {
  if (!started) return;
  const before = seenPhone.get(actor.id) ?? { ledger: new Set(), delivered: new Set() };
  const now = phoneSnapshot(actor);
  seenPhone.set(actor.id, now);
  if (!listensTo(actor.id)) return;
  const ph = Data.getPhone(actor);
  for (const l of ph.ledger) {
    if (before.ledger.has(l.id) || l.amount <= 0) continue;
    const from = game.actors.get(l.other);
    toast({
      title: `PokéPay: ${Store.fmtMoney(l.amount)} received`,
      body: `From ${from?.name ?? "someone"}${l.note ? `: ${l.note}` : ""}`,
      icon: "fa-wallet",
      onClick: () => RegistryPhoneRef?.open(actor, { app: "pokepay" })
    });
  }
  for (const o of ph.orders) {
    if (o.delivered !== true || before.delivered.has(o.id)) continue;
    toast({
      title: "Mart Express: delivered!",
      body: `${o.qty} x ${o.name} is in ${actor.name}'s bag.`,
      img: o.img, icon: "fa-box",
      onClick: () => RegistryPhoneRef?.open(actor, { app: "mart" })
    });
  }
}

function openMyPhone(app) {
  const mine = game.actors.find((a) => a.type !== "pokemon" && a.isOwner && (game.user.isGM ? !a.hasPlayerOwner && Data.getPhone(a).listed : true));
  if (mine) RegistryPhoneRef?.open(mine, { app });
}

/** Called when the world clock moves: fire reminders and public events that just came due. */
export function onTimeChanged(worldTime, delta) {
  if (!delta || delta <= 0) return;
  const from = worldTime - delta;
  const due = (t) => t > from && t <= worldTime;

  for (const actor of game.actors) {
    if (actor.type === "pokemon" || !actor.isOwner) continue;
    if (game.user.isGM && actor.hasPlayerOwner) continue;
    const phone = Data.getPhone(actor);
    for (const r of phone.reminders) {
      if (r.done || !due(r.due)) continue;
      toast({
        title: phone.rotom ? `${phone.rotomName || "Rotom"}` : "Reminder",
        body: phone.rotom ? `Oi! Don't forget: ${r.text}` : r.text,
        rotom: phone.rotom,
        icon: "fa-bell",
        onClick: () => RegistryPhoneRef?.open(actor, { app: "calendar" })
      });
    }
  }

  for (const e of Data.events()) {
    if (!due(e.due)) continue;
    toast({ title: "Today in Antipodea", body: e.title, icon: "fa-calendar-day", onClick: () => openMyPhone("calendar") });
  }
}
