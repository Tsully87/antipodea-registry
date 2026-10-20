import { MODULE_ID } from "./constants.js";
import * as Data from "./phone-data.js";

/** Phone-style banners that slide in on screen, plus the logic for who gets them. */

let seenMessages = new Set();
let seenPosts = new Map(); // postId -> comment count
let RegistryPhoneRef = null;

export function init(PhoneClass) {
  RegistryPhoneRef = PhoneClass;
  seenMessages = new Set(Data.messages().map((m) => m.id));
  seenPosts = new Map(Data.posts().map((p) => [p.id, p.comments.length]));
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
  const list = Data.messages();
  for (const m of list) {
    if (seenMessages.has(m.id)) continue;
    seenMessages.add(m.id);
    if (m.user === game.user.id || !listensTo(m.to)) continue;
    const owner = phoneOf(m.to);
    if (!owner) continue;
    const other = Data.isRotomKey(m.to) ? m.to : m.from;
    if (RegistryPhoneRef?.isViewingThread(owner.id, other)) continue;
    const sender = Data.who(m.from, { name: m.fromName, img: m.fromImg });
    const ownerName = game.user.isGM || game.actors.filter((a) => a.isOwner && a.type !== "pokemon").length > 1 ? ` (to ${owner.name})` : "";
    toast({
      title: `${sender.name}${ownerName}`,
      body: m.text || "📷 Photo",
      img: sender.img,
      rotom: sender.rotom,
      onClick: () => RegistryPhoneRef?.open(owner, { app: "thread", other })
    });
  }
  RegistryPhoneRef?.refresh();
}

export function onPostsChanged() {
  const list = Data.posts();
  for (const p of list) {
    const known = seenPosts.get(p.id);
    if (known === undefined) {
      seenPosts.set(p.id, p.comments.length);
      if (p.user === game.user.id) continue;
      if (!game.settings.get(MODULE_ID, "pokegramToasts")) continue;
      toast({
        title: `${p.authorName} posted on PokéGram`,
        body: p.caption || "New photo",
        img: p.authorImg,
        icon: "fa-camera-retro",
        onClick: () => openMyPhone("pokegram")
      });
      continue;
    }
    if (p.comments.length > known) {
      const fresh = p.comments.slice(known);
      seenPosts.set(p.id, p.comments.length);
      const author = game.actors.get(p.author);
      if (!author || !listensTo(p.author)) continue;
      for (const c of fresh) {
        if (c.user === game.user.id) continue;
        toast({
          title: `${c.name} commented`,
          body: c.text,
          img: Data.who(c.actorId).img,
          icon: "fa-comment",
          onClick: () => RegistryPhoneRef?.open(author, { app: "pokegram" })
        });
      }
    }
  }
  RegistryPhoneRef?.refresh();
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
