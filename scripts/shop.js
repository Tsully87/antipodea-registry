import { MODULE_ID } from "./constants.js";
import * as Time from "./time.js";
import * as Store from "./store.js";
import * as Net from "./network.js";
import * as Maps from "./maps.js";
import { getPhone, isActiveGM, claim } from "./phone-data.js";

/**
 * Shops. Each shop sits in one city or town (a PokéMaps pin) and sells items from the
 * Poké Mart item folder: whichever sections (sub-folders) the GM ticks, minus anything
 * marked out of stock, at the item's cost plus the shop's markup (or a set price).
 *
 * Buying and selling happen on the player's own client, straight onto their sheet, so
 * no GM needs to be online. Each sale leaves a receipt in the Phone Network journal and
 * whichever GM is on posts it to the #poke-mart forum on Discord.
 */

const SETTING = "shops";
const MAX_RECEIPTS = 200;
const S = (key) => game.settings.get(MODULE_ID, key);

/* -------------------------------------------- */
/*  Shops and catalogue                         */
/* -------------------------------------------- */

export function data() {
  const d = foundry.utils.deepClone(S(SETTING) ?? {});
  d.shops ??= {};
  return d;
}

export function shops() {
  return Object.values(data().shops).sort((a, b) => a.name.localeCompare(b.name));
}

export const shopById = (id) => data().shops[id] ?? null;

/** Shops in a place, by PokéMaps pin id. */
export const shopsAt = (pinId) => shops().filter((s) => s.pin === pinId);

export function blankShop(pin = "bunya-city") {
  return {
    id: foundry.utils.randomID(),
    name: "New Shop",
    pin,
    keeper: "",
    blurb: "",
    markup: 0,
    sellRate: 50,
    sections: sections(),
    off: {},
    prices: {},
    discord: null
  };
}

/** GM: save one shop (or delete it with null). */
export async function saveShop(shop, { remove = false } = {}) {
  const d = data();
  if (remove) delete d.shops[shop.id];
  else d.shops[shop.id] = shop;
  await game.settings.set(MODULE_ID, SETTING, d);
}

export async function saveMeta(changes) {
  const d = data();
  Object.assign(d, changes);
  await game.settings.set(MODULE_ID, SETTING, d);
}

function martFolderName() {
  return S("martFolder") || "Poké Mart";
}

/** Items anywhere under the Poké Mart folder, with their section (the sub-folder they sit in). */
export function stockList() {
  const root = martFolderName();
  const out = [];
  for (const item of game.items) {
    let f = item.folder, section = null, inMart = false;
    while (f) {
      if (f.name === root) { inMart = true; break; }
      section = f.name;
      f = f.folder;
    }
    if (!inMart) continue;
    const cost = Number(item.system?.cost) || 0;
    if (cost <= 0) continue;
    out.push({ id: item.id, name: item.name, img: item.img, type: item.type, cost, section: section ?? "General" });
  }
  return out.sort((a, b) => a.section.localeCompare(b.section) || a.name.localeCompare(b.name));
}

/** Section names (sub-folders of the Poké Mart folder that hold items). */
export function sections() {
  return [...new Set(stockList().map((i) => i.section))];
}

export function priceIn(shop, item) {
  const set = Number(shop.prices?.[item.id]);
  if (set > 0) return Math.round(set);
  return Math.round(item.cost * (1 + (Number(shop.markup) || 0) / 100));
}

/** What a shop sells right now, grouped by section. */
export function catalogue(shop) {
  if (!shop) return [];
  const on = new Set(shop.sections ?? []);
  const items = stockList().filter((i) => on.has(i.section) && !shop.off?.[i.id]).map((i) => ({ ...i, price: priceIn(shop, i) }));
  const groups = new Map();
  for (const i of items) {
    if (!groups.has(i.section)) groups.set(i.section, []);
    groups.get(i.section).push(i);
  }
  return [...groups].map(([section, list]) => ({ section, items: list }));
}

export function pinName(pinId) {
  return Maps.pinById(pinId)?.name ?? "Somewhere";
}

/* -------------------------------------------- */
/*  Selling                                     */
/* -------------------------------------------- */

function noSellNames() {
  return String(S("shopNoSell") ?? "").split(/[\r\n,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/** Items on a trainer's sheet this shop will buy, and what it pays for one. */
export function sellable(actor, shop) {
  if (!actor || !shop) return [];
  const blocked = noSellNames();
  const rate = Math.max(0, Number(shop.sellRate ?? 50)) / 100;
  return actor.items
    .filter((i) => ["item", "pokeball"].includes(i.type))
    .filter((i) => (Number(i.system?.cost) || 0) > 0 && (Number(i.system?.quantity) || 0) > 0)
    .filter((i) => !blocked.includes(i.name.toLowerCase()))
    .map((i) => ({ id: i.id, name: i.name, img: i.img, qty: Number(i.system.quantity) || 0, price: Math.floor((Number(i.system.cost) || 0) * rate) }))
    .filter((i) => i.price > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* -------------------------------------------- */
/*  Buying and selling (runs on the player)     */
/* -------------------------------------------- */

const asType = (orig, n) => (typeof orig === "string" ? String(n) : n);

/** Can this user shop for this trainer at this shop? Returns an error string, or "". */
export function checkAccess(actor, shop) {
  if (!actor || !shop) return "That shop's not here.";
  if (!actor.isOwner) return "That's not your trainer.";
  if (game.user.isGM) return "";
  const loc = getPhone(actor).location;
  if (loc !== shop.pin) return `${actor.name} isn't in ${pinName(shop.pin)}.`;
  return "";
}

function ledger(actor, amount, note) {
  const phone = getPhone(actor);
  const entry = { id: foundry.utils.randomID(), other: "shop", amount, note: String(note).slice(0, 80), wt: Time.now(), ms: Date.now() };
  return [entry, ...(phone.ledger ?? [])].slice(0, 100);
}

/**
 * Buy a cart of { itemId, qty }. Takes the money, puts the items on the sheet
 * (stacking with ones already there) and leaves a receipt for Discord.
 */
export async function buy(actor, shopId, cart) {
  const shop = shopById(shopId);
  const err = checkAccess(actor, shop);
  if (err) return { ok: false, error: err };
  const stock = new Map(catalogue(shop).flatMap((g) => g.items).map((i) => [i.id, i]));
  const lines = [];
  for (const { itemId, qty } of cart) {
    const item = stock.get(itemId);
    const n = Math.max(0, Math.min(99, Math.floor(Number(qty) || 0)));
    if (!item) return { ok: false, error: "Something in your basket isn't sold here any more." };
    if (n) lines.push({ item, qty: n, total: item.price * n });
  }
  if (!lines.length) return { ok: false, error: "Your basket's empty." };
  const total = lines.reduce((a, l) => a + l.total, 0);
  const money = Store.money(actor);
  if (money < total) return { ok: false, error: `Not enough money. That's ${Store.fmtMoney(total)} and ${actor.name} has ${Store.fmtMoney(money)}.` };

  const summary = lines.map((l) => `${l.qty} x ${l.item.name}`).join(", ");
  await actor.update({
    "system.money": money - total,
    [`flags.${MODULE_ID}.phone.ledger`]: ledger(actor, -total, `${shop.name}: ${summary}`)
  });
  for (const l of lines) await addItem(actor, l.item.id, l.qty);
  await receipt("buy", actor, shop, lines, total, money - total);
  return { ok: true, total, summary };
}

async function addItem(actor, itemId, qty) {
  const src = game.items.get(itemId);
  if (!src) return;
  const existing = actor.items.find((i) => i.name === src.name && i.type === src.type);
  if (existing && existing.system?.quantity !== undefined) {
    const now = Number(existing.system.quantity) || 0;
    await existing.update({ "system.quantity": asType(existing.system.quantity, now + qty) });
    return;
  }
  const d = src.toObject();
  delete d._id;
  delete d.folder;
  if (d.system?.quantity !== undefined) d.system.quantity = asType(d.system.quantity, qty);
  await actor.createEmbeddedDocuments("Item", [d]);
}

/** Sell a list of { itemId (on the actor), qty } to a shop. */
export async function sell(actor, shopId, list) {
  const shop = shopById(shopId);
  const err = checkAccess(actor, shop);
  if (err) return { ok: false, error: err };
  const offer = new Map(sellable(actor, shop).map((i) => [i.id, i]));
  const lines = [];
  for (const { itemId, qty } of list) {
    const it = offer.get(itemId);
    if (!it) return { ok: false, error: "This shop won't buy one of those." };
    const n = Math.max(0, Math.min(it.qty, Math.floor(Number(qty) || 0)));
    if (n) lines.push({ item: it, qty: n, total: it.price * n });
  }
  if (!lines.length) return { ok: false, error: "Pick something to sell." };
  const total = lines.reduce((a, l) => a + l.total, 0);
  const remove = [];
  for (const l of lines) {
    const doc = actor.items.get(l.item.id);
    const left = (Number(doc.system.quantity) || 0) - l.qty;
    if (left > 0) await doc.update({ "system.quantity": asType(doc.system.quantity, left) });
    else remove.push(doc.id);
  }
  if (remove.length) await actor.deleteEmbeddedDocuments("Item", remove);
  const money = Store.money(actor) + total;
  const summary = lines.map((l) => `${l.qty} x ${l.item.name}`).join(", ");
  await actor.update({
    "system.money": money,
    [`flags.${MODULE_ID}.phone.ledger`]: ledger(actor, total, `Sold to ${shop.name}: ${summary}`)
  });
  await receipt("sell", actor, shop, lines, total, money);
  return { ok: true, total, summary };
}

/* -------------------------------------------- */
/*  Receipts                                    */
/* -------------------------------------------- */

async function receipt(kind, actor, shop, lines, total, balance) {
  if (!Net.ready()) return;
  try {
    await Net.create("receipt", {
      id: foundry.utils.randomID(),
      kind,
      actor: actor.id,
      who: actor.name,
      shop: shop.name,
      place: pinName(shop.pin),
      lines: lines.map((l) => ({ name: l.item.name, qty: l.qty, total: l.total })),
      total,
      balance,
      wt: Time.now(),
      ms: Date.now(),
      user: game.user.id
    }, { discord: false });
  } catch (e) {
    console.warn(`${MODULE_ID} | receipt`, e);
  }
}

function receiptPages() {
  const j = Net.journal();
  if (!j) return [];
  return j.pages.filter((p) => p.flags?.[MODULE_ID]?.kind === "receipt").sort((a, b) => (a.flags[MODULE_ID].d?.ms ?? 0) - (b.flags[MODULE_ID].d?.ms ?? 0));
}

/** Recent receipts, newest first (for the GM's Shop Manager). */
export function recentReceipts(n = 30) {
  return receiptPages().map((p) => ({ ...p.flags[MODULE_ID].d, posted: !!p.flags[MODULE_ID].discord })).reverse().slice(0, n);
}

let working = false;

/** Active GM: send receipts that haven't gone to Discord yet, one GM window only. */
export async function processReceipts() {
  if (!isActiveGM() || working) return;
  working = true;
  try {
    const cutoff = Date.now() - 2 * 24 * 3600 * 1000;
    for (const page of receiptPages()) {
      const f = page.flags[MODULE_ID];
      if (f.discord) continue;
      if ((f.d?.ms ?? 0) < cutoff || !webhook()) { await page.update({ [`flags.${MODULE_ID}.discord`]: true }); continue; }
      if (!await claim(`receipt-${f.d.id}`)) continue;
      if (Net.journal()?.pages.get(page.id)?.flags?.[MODULE_ID]?.discord) continue;
      await page.update({ [`flags.${MODULE_ID}.discord`]: true });
      const ok = await postReceipt(f.d).catch((e) => { console.warn(`${MODULE_ID} | receipt post`, e); return null; });
      const tries = (f.tries ?? 0) + 1;
      if (ok === false && tries < 3) await page.update({ [`flags.${MODULE_ID}.discord`]: false, [`flags.${MODULE_ID}.tries`]: tries });
    }
    const pages = receiptPages();
    if (pages.length > MAX_RECEIPTS * 1.25) await Net.remove(pages.slice(0, pages.length - MAX_RECEIPTS).map((p) => p.id));
  } finally {
    working = false;
  }
}

/* -------------------------------------------- */
/*  Discord (#poke-mart forum, GM only)         */
/* -------------------------------------------- */

function webhook() {
  try { return game.user.isGM ? (S("shopWebhook") ?? "").trim() : ""; }
  catch (e) { return ""; }
}

export const discordReady = () => !!webhook();

function hookUrl(path = "", params = {}) {
  const u = new URL(webhook() + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) u.searchParams.set(k, v);
  return u.toString();
}

async function send(method, path, params, body) {
  const res = await fetch(hookUrl(path, params), {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ allowed_mentions: { parse: [] }, ...body })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn(`${MODULE_ID} | Discord ${res.status}`, text);
    return { ok: false, status: res.status };
  }
  return { ok: true, json: res.status === 204 ? null : await res.json().catch(() => null) };
}

const money = (n) => Store.fmtMoney(n);
const SHOP_COLOR = 0x1c7ed6;

function catalogueEmbeds(shop) {
  const groups = catalogue(shop);
  const fields = groups.map((g) => ({
    name: g.section,
    value: g.items.map((i) => `${i.name} **${money(i.price)}**`).join("\n").slice(0, 1024),
    inline: true
  }));
  const lines = [];
  if (shop.keeper) lines.push(`Run by **${shop.keeper}**`);
  if (shop.blurb) lines.push(shop.blurb);
  lines.push(`Buys items back at **${Number(shop.sellRate ?? 50)}%** of their price.`);
  lines.push("Open the Shop in Foundry (store button on the left, or **Shift+M**) while your trainer is here.");
  return [{
    title: `🛒 ${shop.name}, ${pinName(shop.pin)}`,
    description: lines.join("\n"),
    color: SHOP_COLOR,
    fields: fields.length ? fields.slice(0, 25) : [{ name: "Shelves", value: "Nothing for sale right now." }],
    footer: { text: `Prices as of ${Time.formatLong(Time.now())}` }
  }];
}

/** GM: create or update a shop's catalogue post in the forum. */
export async function publishCatalogue(shopId) {
  const shop = shopById(shopId);
  if (!shop) return { ok: false, error: "No such shop." };
  if (!webhook()) return { ok: false, error: "Add the #poke-mart webhook in module settings first." };
  const embeds = catalogueEmbeds(shop);
  const title = `${shop.name} (${pinName(shop.pin)})`.slice(0, 100);
  if (shop.discord?.thread && shop.discord?.msg) {
    const r = await send("PATCH", `/messages/${shop.discord.msg}`, { thread_id: shop.discord.thread }, { content: "", embeds });
    if (r.ok) return { ok: true, updated: true };
    if (r.status !== 404) return { ok: false, error: `Discord said ${r.status}.` };
  }
  const r = await send("POST", "", { wait: "true" }, { thread_name: title, username: shop.keeper || shop.name, embeds });
  if (!r.ok) return { ok: false, error: `Discord said ${r.status}. Is the webhook in a forum channel?` };
  shop.discord = { thread: r.json?.channel_id, msg: r.json?.id };
  await saveShop(shop);
  return { ok: true, created: true };
}

/** GM: update every shop's post (after price or stock changes to the Poké Mart folder). */
export async function publishAll() {
  const out = [];
  for (const s of shops()) out.push(await publishCatalogue(s.id));
  return out;
}

async function receiptsThread() {
  const d = data();
  if (d.receipts?.thread) return d.receipts.thread;
  const r = await send("POST", "", { wait: "true" }, {
    thread_name: "🧾 Receipts",
    username: "Antipodea Retail",
    content: "Every purchase and sale from the Poké Marts lands here."
  });
  if (!r.ok) return null;
  await saveMeta({ receipts: { thread: r.json?.channel_id } });
  return r.json?.channel_id ?? null;
}

async function postReceipt(rc) {
  if (!webhook()) return false;
  const thread = await receiptsThread();
  if (!thread) return false;
  const buying = rc.kind === "buy";
  const embed = {
    color: buying ? SHOP_COLOR : 0x2f9e44,
    author: { name: `${rc.who} ${buying ? "bought" : "sold"} at ${rc.shop}, ${rc.place}` },
    description: rc.lines.map((l) => `${l.qty} x ${l.name}  ${money(l.total)}`).join("\n"),
    fields: [
      { name: buying ? "Total" : "Paid out", value: money(rc.total), inline: true }
    ],
    footer: { text: Time.formatLong(rc.wt) }
  };
  const r = await send("POST", "", { thread_id: thread }, { username: rc.shop.slice(0, 80), embeds: [embed] });
  if (!r.ok && r.status === 404) await saveMeta({ receipts: null });
  return r.ok;
}
