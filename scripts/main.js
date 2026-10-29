import { MODULE_ID, DEFAULT_BADGES } from "./constants.js";
import * as Registry from "./registry.js";
import * as Time from "./time.js";
import { RegistryPhone, APP_PARTIALS, TEMPLATE_ROOT } from "./phone-app.js";
import { postToDiscord } from "./discord.js";
import * as Data from "./phone-data.js";
import * as Notify from "./notify.js";
import * as Net from "./network.js";
import { ZONES } from "./maps.js";
import * as Shop from "./shop.js";
import { ShopWindow, ShopManager } from "./shop-app.js";
import * as Loc from "./location.js";
import * as DexJournal from "./dex-journal.js";
import * as DexDiscord from "./dex-discord.js";
import * as Surv from "./survival.js";
import { CraftWindow, DropsWindow, EndOfDayWindow } from "./survival-app.js";
import * as Cal from "./calendar.js";
import * as CalDiscord from "./calendar-discord.js";

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

const isTrainer = (actor) => actor && actor.type !== "pokemon";

function isActiveGM() {
  if (!game.user.isGM) return false;
  const active = game.users.activeGM;
  return active ? active.isSelf : true;
}

/** Best guess at which trainer a player means: controlled token, then assigned character, then first owned trainer. */
function myTrainer() {
  const controlled = canvas?.tokens?.controlled?.map((t) => t.actor).find((a) => isTrainer(a) && a.isOwner);
  if (controlled) return controlled;
  if (isTrainer(game.user.character)) return game.user.character;
  return game.actors.find((a) => isTrainer(a) && a.isOwner && a.hasPlayerOwner) ?? null;
}

async function openMine(tab) {
  if (game.user.isGM) return gmPhonePicker(tab);
  const owned = game.actors.filter((a) => isTrainer(a) && a.isOwner);
  const guess = myTrainer();
  if (guess) return RegistryPhone.open(guess, { tab });
  if (!owned.length) return ui.notifications.warn("No trainers to open a phone for.");
  if (owned.length === 1) return RegistryPhone.open(owned[0], { tab });

  const options = owned.map((a) => `<option value="${a.id}">${foundry.utils.escapeHTML(a.name)}</option>`).join("");
  const id = await foundry.applications.api.DialogV2.prompt({
    window: { title: "Whose phone?", icon: "fa-solid fa-mobile-screen-button" },
    content: `<div class="form-group"><label>Trainer</label><select name="actor">${options}</select></div>`,
    ok: { label: "Open", callback: (event, button) => button.form.elements.actor.value },
    rejectClose: false
  });
  if (id) RegistryPhone.open(game.actors.get(id), { tab });
}

/** GM: one selected trainer token asks for just them, otherwise the Move Trainers window. */
function moveTrainers() {
  if (!game.user.isGM) return;
  const sel = canvas?.tokens?.controlled?.map((t) => t.actor).filter(isTrainer) ?? [];
  if (sel.length === 1) return Loc.pickFor(sel[0]);
  return Loc.MoveParty.open();
}

/* Scenes tagged with a place move the trainers on them */
Hooks.on("renderSceneConfig", (app, element) => Loc.injectSceneConfig(app, element));
Hooks.on("updateScene", (scene, changes) => {
  if (changes.active === true || foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.place`)) {
    if (scene.active) Loc.syncScene(scene).catch((e) => console.warn(`${MODULE_ID} | scene place`, e));
  }
});
Hooks.on("createToken", (token) => {
  const scene = token.parent;
  if (!Data.isActiveGM() || !Loc.scenePlace(scene) || !isTrainer(token.actor)) return;
  Loc.moveAll([token.actor], Loc.scenePlace(scene)).then((n) => {
    if (n) ui.notifications.info(`${token.actor.name} moved to ${scene.name}'s place.`);
  });
});

/* A location button on trainer tokens' HUD (GM) */
Hooks.on("renderTokenHUD", (hud, element) => {
  const root = element instanceof HTMLElement ? element : element?.[0];
  const actor = hud.object?.actor ?? hud.document?.actor;
  if (!game.user.isGM || !root || !isTrainer(actor)) return;
  const col = root.querySelector(".col.right") ?? root.querySelector(".right");
  if (!col || col.querySelector(".antipodea-loc")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "control-icon antipodea-loc";
  btn.title = "Set location (PokéMaps / Poké Mart)";
  btn.innerHTML = '<i class="fa-solid fa-location-dot"></i>';
  btn.addEventListener("click", (ev) => { ev.preventDefault(); ev.stopPropagation(); Loc.pickFor(actor); });
  col.append(btn);
});

/** Open the shop for the player's trainer (or the selected token's, for the GM). */
function openShop(actor) {
  if (!actor) {
    const controlled = canvas?.tokens?.controlled?.map((t) => t.actor).find((a) => isTrainer(a) && a.isOwner);
    actor = controlled ?? (game.user.isGM ? null : myTrainer());
  }
  return ShopWindow.open(actor);
}

function openCraft(actor) {
  if (!actor) {
    const controlled = canvas?.tokens?.controlled?.map((t) => t.actor).find((a) => isTrainer(a) && a.isOwner);
    actor = controlled ?? (game.user.isGM ? null : myTrainer());
  }
  return CraftWindow.open(actor);
}

/** First time: set up Vinnie's in Bunya City so there's a shop to start with. */
async function seedShops() {
  if (!game.user.isGM || Shop.shops().length || Shop.data().seeded) return;
  const shop = Shop.blankShop("bunya-city");
  Object.assign(shop, {
    name: "Central Poké Mart",
    keeper: "Vinnie Costa",
    blurb: "Bunya City's busiest Mart. Ask Vinnie about the free Potion for new arrivals."
  });
  await Shop.saveShop(shop);
  await Shop.saveMeta({ seeded: true });
}

for (const hook of ["createItem", "updateItem", "deleteItem"]) {
  Hooks.on(hook, (item) => {
    if (item.parent?.id && ShopWindow.current?.actorId === item.parent.id) ShopWindow.refresh();
  });
}

/* -------------------------------------------- */
/*  GM: quick phone picker (players and NPCs)   */
/* -------------------------------------------- */

const RECENT_KEY = "recentPhones";
function recentPhones() {
  try { return game.settings.get(MODULE_ID, RECENT_KEY) ?? []; } catch (e) { return []; }
}
function rememberPhone(actor) {
  if (!game.user.isGM || !actor) return;
  const list = [actor.id, ...recentPhones().filter((id) => id !== actor.id)].slice(0, 8);
  game.settings.set(MODULE_ID, RECENT_KEY, list).catch(() => {});
}

/**
 * GM: a selected trainer token opens straight away. Otherwise a searchable list of every
 * trainer, with recent phones first, then players, then NPCs by folder.
 */
async function gmPhonePicker(tab) {
  const controlled = canvas?.tokens?.controlled?.map((t) => t.actor).filter(isTrainer) ?? [];
  if (controlled.length === 1) {
    rememberPhone(controlled[0]);
    return RegistryPhone.open(controlled[0], { tab });
  }
  const all = game.actors.filter(isTrainer).sort((a, b) => a.name.localeCompare(b.name));
  if (!all.length) return ui.notifications.warn("No trainers to open a phone for.");
  const esc = (t) => foundry.utils.escapeHTML(String(t ?? ""));
  const recent = recentPhones().map((id) => game.actors.get(id)).filter(isTrainer);
  const groups = [];
  if (recent.length) groups.push(["Recent", recent]);
  groups.push(["Players", all.filter((a) => a.hasPlayerOwner)]);
  const npcs = all.filter((a) => !a.hasPlayerOwner);
  const byFolder = new Map();
  // Each NPC usually sits in a folder of its own name (with its Pokémon), so group by the
  // first folder above that, e.g. "The Croc Shed" or "Police". Top-level ones go in "Other".
  const groupOf = (a) => {
    let f = a.folder;
    while (f && f.name === a.name) f = f.folder;
    return f?.folder ? f.name : "Other";
  };
  for (const a of npcs) {
    const f = groupOf(a);
    if (!byFolder.has(f)) byFolder.set(f, []);
    byFolder.get(f).push(a);
  }
  const order = [...byFolder].sort((x, y) => (x[0] === "Other") - (y[0] === "Other") || x[0].localeCompare(y[0]));
  for (const [f, list] of order) groups.push([`NPCs: ${f}`, list]);

  const opt = (a) => `<option value="${a.id}" data-name="${esc(a.name.toLowerCase())}">${esc(a.name)}</option>`;
  const html = groups.filter(([, l]) => l.length)
    .map(([label, list]) => `<optgroup label="${esc(label)}">${list.map(opt).join("")}</optgroup>`).join("");
  const content = `
    <div class="form-group"><label>Search</label><input type="text" name="q" placeholder="Type a name" autofocus></div>
    <div class="form-group"><select name="actor" size="12" style="width:100%;height:auto">${html}</select></div>
    <p class="hint">Tip: select an NPC's token first to skip this list.</p>`;

  const id = await foundry.applications.api.DialogV2.prompt({
    window: { title: "Whose phone?", icon: "fa-solid fa-mobile-screen-button" },
    position: { width: 360 },
    content,
    render: (event, dialog) => {
      const root = dialog.element ?? event?.target?.element;
      const q = root?.querySelector('input[name="q"]');
      const sel = root?.querySelector('select[name="actor"]');
      if (!q || !sel) return;
      sel.selectedIndex = 0;
      q.addEventListener("input", () => {
        const term = q.value.trim().toLowerCase();
        let first = null;
        for (const o of sel.querySelectorAll("option")) {
          const hit = !term || o.dataset.name.includes(term);
          o.hidden = !hit;
          if (hit && !first) first = o;
        }
        for (const g of sel.querySelectorAll("optgroup")) g.hidden = ![...g.children].some((o) => !o.hidden);
        if (first) first.selected = true;
      });
      q.addEventListener("keydown", (e) => { if (e.key === "ArrowDown") { e.preventDefault(); sel.focus(); } });
      sel.addEventListener("dblclick", () => root.querySelector('button[data-action="ok"]')?.click());
    },
    ok: { label: "Open", icon: "fa-solid fa-mobile-screen-button", callback: (event, button) => button.form.elements.actor.value },
    rejectClose: false
  });
  const actor = id ? game.actors.get(id) : null;
  if (!actor) return;
  rememberPhone(actor);
  RegistryPhone.open(actor, { tab });
}

function resolveActor(a) {
  if (!a) return null;
  if (typeof a !== "string") return a;
  return game.actors.get(a) ?? game.actors.getName(a) ?? null;
}

function resolveKey(k) {
  if (typeof k === "string" && Data.isRotomKey(k)) return k;
  return resolveActor(k)?.id ?? k;
}

/* -------------------------------------------- */
/*  Phone Network                               */
/* -------------------------------------------- */

async function startNetwork() {
  if (game.user.isGM) {
    await Net.ensureJournal();
    await Data.migrateFromSettings();
  }
  Net.invalidate();
  Notify.init(RegistryPhone);
  Notify.onAlerts();
  RegistryPhone.refresh();
  if (Data.isActiveGM()) {
    await Data.processBacklog();
    await Data.prune();
    await seedShops();
    await Shop.seedSales();
    Shop.checkShelves().catch((e) => console.warn(`${MODULE_ID} | shop shelves`, e));
    DexJournal.seedMissing().catch((e) => console.warn(`${MODULE_ID} | dex journal seed`, e));
    Shop.processReceipts().catch((e) => console.warn(`${MODULE_ID} | receipts`, e));
    Data.refreshForecastCache(ZONES).catch((e) => console.warn(`${MODULE_ID} | forecast cache`, e));
  } else {
    await Data.checkMyJobs();
  }
}

let netTimer = null;
const netDirty = new Set();
function onNetworkPage(page, action) {
  if (!Net.isNetworkPage(page)) return;
  Net.invalidate();
  netDirty.add(page.flags?.[MODULE_ID]?.kind ?? "?");
  if (action === "delete") netDirty.add("refresh");
  clearTimeout(netTimer);
  netTimer = setTimeout(() => {
    const kinds = new Set(netDirty);
    netDirty.clear();
    if (kinds.has("msg")) Notify.onMessagesChanged();
    if (kinds.has("post")) Notify.onPostsChanged();
    if (kinds.has("profile")) Notify.onSocialChanged();
    if (kinds.has("job")) {
      if (Data.isActiveGM()) Data.processBacklog();
      else Data.checkMyJobs();
    }
    if (kinds.has("post") && Data.isActiveGM()) Data.processBacklog();
    if (kinds.has("receipt")) {
      if (Data.isActiveGM()) Shop.processReceipts();
      ShopManager.refresh();
    }
    RegistryPhone.refresh();
  }, 150);
}

Hooks.on("createJournalEntryPage", (page) => onNetworkPage(page, "create"));
Hooks.on("updateJournalEntryPage", (page) => onNetworkPage(page, "update"));
Hooks.on("deleteJournalEntryPage", (page) => onNetworkPage(page, "delete"));

// When a GM (you, or a bot GM later) comes online, they pick up whatever queued while nobody was on.
Hooks.on("userConnected", () => {
  setTimeout(() => {
    if (Data.isActiveGM()) { Data.processBacklog(); Shop.processReceipts(); }
    RegistryPhone.refresh();
  }, 1500);
});

let sweepTimer = null;
function queueSweep() {
  if (!isActiveGM()) return;
  clearTimeout(sweepTimer);
  sweepTimer = setTimeout(() => Registry.sweep().catch((e) => console.error(`${MODULE_ID} | sweep failed`, e)), 750);
}

/* -------------------------------------------- */
/*  Init                                        */
/* -------------------------------------------- */

Hooks.once("init", () => {
  const userScope = CONST.SETTING_SCOPES?.USER ?? "client";

  game.settings.register(MODULE_ID, "demeritLimit", {
    name: "Demerit point limit",
    hint: "Reaching this many active points suspends all riding endorsements.",
    scope: "world", config: true, type: Number, default: 6,
    onChange: () => RegistryPhone.refresh()
  });
  game.settings.register(MODULE_ID, "suspensionDays", {
    name: "Suspension length (in-game days)",
    scope: "world", config: true, type: Number, default: 14
  });
  game.settings.register(MODULE_ID, "expiryDays", {
    name: "Demerit points expire after (in-game days)",
    scope: "world", config: true, type: Number, default: 30
  });
  game.settings.register(MODULE_ID, "badgeNames", {
    name: "Badge names",
    hint: "Separate with commas, in slot order. These label the badge slots on the Trainer Card.",
    scope: "world", config: true, type: String, default: DEFAULT_BADGES.join(", "),
    onChange: () => RegistryPhone.refresh()
  });
  game.settings.register(MODULE_ID, "postToDiscord", {
    name: "Post Registry notices to Discord",
    hint: "Licences, fines, suspensions and cleared points post to #mount-registry through the webhook below.",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(MODULE_ID, "webhookUrl", {
    name: "Discord webhook URL (#mount-registry)",
    hint: "Stored on your user account only, so players never see it. Paste the webhook from the channel's Integrations settings.",
    scope: userScope, config: true, type: String, default: "",
    restricted: true
  });
  // Phone
  game.settings.register(MODULE_ID, "defaultContacts", {
    name: "Phone: default contacts",
    hint: "Actor names every phone starts with, separated by commas.",
    scope: "world", config: true, type: String, default: "Professor Manuka",
    onChange: () => RegistryPhone.refresh()
  });
  game.settings.register(MODULE_ID, "rotomOnlyPokegram", {
    name: "Phone: PokéGram needs a Rotom Phone",
    scope: "world", config: true, type: Boolean, default: false,
    onChange: () => RegistryPhone.refresh()
  });
  game.settings.register(MODULE_ID, "rotomOnlyPoketube", {
    name: "Phone: PokéTube needs a Rotom Phone",
    scope: "world", config: true, type: Boolean, default: false,
    onChange: () => RegistryPhone.refresh()
  });
  game.settings.register(MODULE_ID, "rotomOnlyTiktogepi", {
    name: "Phone: TikTogepi needs a Rotom Phone",
    scope: "world", config: true, type: Boolean, default: false,
    onChange: () => RegistryPhone.refresh()
  });
  game.settings.register(MODULE_ID, "rotomOnlyCamera", {
    name: "Phone: Camera needs a Rotom Phone",
    scope: "world", config: true, type: Boolean, default: false,
    onChange: () => RegistryPhone.refresh()
  });
  game.settings.register(MODULE_ID, "rotomOnlyReminders", {
    name: "Phone: Calendar reminders need a Rotom Phone",
    hint: "Everyone can still see the calendar and your public events.",
    scope: "world", config: true, type: Boolean, default: true,
    onChange: () => RegistryPhone.refresh()
  });
  game.settings.register(MODULE_ID, "hidePtrDex", {
    name: "Phone: Pokédex replaces PTR's Dex button for players",
    hint: "Removes the trainer sheet's \"Dex\" header button (PTR's own blank seen/owned screen) for players, since the Phone's Pokédex shows the real information instead. GMs still see PTR's button too.",
    scope: "world", config: true, type: Boolean, default: true,
    onChange: () => {
      for (const app of Object.values(ui.windows)) {
        if (isTrainer(app.actor)) app.render();
      }
    }
  });
  game.settings.register(MODULE_ID, "dexDiscord", {
    name: "Pokédex: post new entries to Discord",
    hint: "When a trainer sees or catches an Antipodea species for the first time, a line posts through the webhook below. Covers scans and the GM's manual seen/owned toggle on the Pokédex.",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(MODULE_ID, "dexWebhookUrl", {
    name: "Pokédex: Discord webhook URL",
    hint: "Stored on your user account only. Make a webhook in whichever channel you want new dex entries posted to.",
    scope: userScope, config: true, type: String, default: "",
    restricted: true
  });
  game.settings.register(MODULE_ID, "pokegramToDiscord", {
    name: "Phone: post social apps to Discord",
    hint: "New PokéGram, PokéTube and TikTogepi posts are copied to Discord through the webhooks below. Leave a webhook blank to skip that app.",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(MODULE_ID, "pokegramWebhookUrl", {
    name: "Phone: PokéGram Discord webhook URL",
    hint: "Stored on your user account only. Make a webhook in the channel you want PokéGram posts in.",
    scope: userScope, config: true, type: String, default: "",
    restricted: true
  });
  game.settings.register(MODULE_ID, "poketubeWebhookUrl", {
    name: "Phone: PokéTube Discord webhook URL",
    hint: "Stored on your user account only.",
    scope: userScope, config: true, type: String, default: "",
    restricted: true
  });
  game.settings.register(MODULE_ID, "tiktogepiWebhookUrl", {
    name: "Phone: TikTogepi Discord webhook URL",
    hint: "Stored on your user account only.",
    scope: userScope, config: true, type: String, default: "",
    restricted: true
  });

  // App Store
  game.settings.register(MODULE_ID, "appPrices", {
    name: "App Store: prices",
    hint: "Change any price with key=amount, separated by commas. Keys: translator, weather, procamera, pokemaps, pokepay, mart.",
    scope: "world", config: true, type: String,
    default: "translator=1500, weather=500, procamera=1000, pokemaps=750, pokepay=250, mart=500",
    onChange: () => RegistryPhone.refresh()
  });
  game.settings.register(MODULE_ID, "translatorLanguages", {
    name: "Translator: languages",
    hint: "Languages the Translator app offers, separated by commas.",
    scope: "world", config: true, type: String,
    default: "Kantonian, Johtonian, Hoennian, Sinnohan, Unovan, Kalosian, Alolan, Galarian, Paldean"
  });
  game.settings.register(MODULE_ID, "weatherMacro", {
    name: "Weather: macro name",
    hint: "The weather macro the Weather app asks for forecasts. It needs the forecast block from the README.",
    scope: "world", config: true, type: String, default: "ANTIPODEA WEATHER"
  });
  game.settings.register(MODULE_ID, "mapImage", {
    name: "PokéMaps: map image",
    hint: "Your Antipodea Region Map (any size copy of the 1408 x 768 map lines up with the pins).",
    scope: "world", config: true, type: String, default: "", filePicker: "image",
    onChange: () => RegistryPhone.refresh()
  });
  game.settings.register(MODULE_ID, "mapKmPerPixel", {
    name: "PokéMaps: km per map pixel",
    hint: "Measured on the 1408 px wide map. 4.11 makes mainland Australia 3,000 km wide, matching the Antipodea Region scene.",
    scope: "world", config: true, type: Number, default: 4.11,
    onChange: () => RegistryPhone.refresh()
  });
  game.settings.register(MODULE_ID, "mapPins", {
    scope: "world", config: false, type: Array, default: [],
    onChange: () => RegistryPhone.refresh()
  });
  game.settings.register(MODULE_ID, "martFolder", {
    name: "Mart Express: item folder",
    hint: "Items in this Items folder (and its subfolders) can be ordered. Their price is the item's cost.",
    scope: "world", config: true, type: String, default: "Poké Mart",
    onChange: () => RegistryPhone.refresh()
  });
  game.settings.register(MODULE_ID, "martMarkup", {
    name: "Mart Express: delivery markup (%)",
    scope: "world", config: true, type: Number, default: 25,
    onChange: () => RegistryPhone.refresh()
  });
  game.settings.register(MODULE_ID, "martDeliveryDays", {
    name: "Mart Express: delivery time (in-game days)",
    scope: "world", config: true, type: Number, default: 1
  });
  game.settings.register(MODULE_ID, "social", {
    scope: "world", config: false, type: Object, default: {},
    // Old storage, kept only so 1.3 can move it into the Phone Network.
  });

  game.settings.register(MODULE_ID, "pokegramToasts", {
    name: "Phone: pop up new social posts",
    hint: "Show a notification on your screen when someone posts.",
    scope: "client", config: true, type: Boolean, default: true
  });
  game.settings.register(MODULE_ID, "notificationSound", {
    name: "Phone: notification sound",
    scope: "client", config: true, type: Boolean, default: true
  });
  game.settings.register(MODULE_ID, "networkMigrated", { scope: "world", config: false, type: Boolean, default: false });
  game.settings.register(MODULE_ID, "forecastCache", {
    scope: "world", config: false, type: Object, default: {},
    onChange: () => RegistryPhone.refresh()
  });
  game.settings.register(MODULE_ID, "messages", {
    scope: "world", config: false, type: Array, default: [],
    // Old storage, kept only for the move.
  });
  game.settings.register(MODULE_ID, "posts", {
    scope: "world", config: false, type: Array, default: [],
    // Old storage, kept only for the move.
  });
  game.settings.register(MODULE_ID, "weatherAlerts", {
    // Emergency alerts from the Antipodea Weather macro: { day, alerts: [{ id, zone, kind, title, body, icon }] }
    scope: "world", config: false, type: Object, default: {},
    onChange: () => Notify.onAlerts()
  });
  game.settings.register(MODULE_ID, "events", {
    scope: "world", config: false, type: Array, default: [],
    onChange: () => RegistryPhone.refresh()
  });

  game.settings.register(MODULE_ID, "shops", {
    scope: "world", config: false, type: Object, default: {},
    onChange: () => { ShopWindow.refresh(); ShopManager.refresh(); }
  });
  game.settings.registerMenu(MODULE_ID, "shopManagerMenu", {
    name: "Poké Mart: shops",
    label: "Open Shop Manager",
    hint: "Set up shops in each city: what they sell, markups and buy-back rates, and their #poke-mart posts on Discord.",
    icon: "fa-solid fa-store",
    type: ShopManager,
    restricted: true
  });
  game.settings.register(MODULE_ID, "shopWebhook", {
    name: "Poké Mart: Discord webhook URL (#poke-mart forum)",
    hint: "Stored on your user account only. Make a webhook in the #poke-mart forum channel. Shop price lists and receipts post there.",
    scope: userScope, config: true, type: String, default: ""
  });
  game.settings.register(MODULE_ID, "shopNoSell", {
    name: "Poké Mart: items shops won't buy",
    hint: "Item names, separated by commas. Key items like the Pokédex.",
    scope: "world", config: true, type: String, default: "Pokédex, Basic Phone, Rotom Phone",
    onChange: () => ShopWindow.refresh()
  });
  game.settings.register(MODULE_ID, RECENT_KEY, { scope: "client", config: false, type: Array, default: [] });
  game.settings.register(MODULE_ID, "autoWeather", {
    name: "Weather: run the weather macro when the day changes",
    hint: "Only one GM window runs it, so players never get a permission pop-up. Turn off the old Hook Macros entry if you still have one.",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(MODULE_ID, "autoEndOfDay", {
    name: "Survival: pop up End of Day when the day changes",
    hint: "Only opens if at least one trainer is tagged Out Bush in Move Trainers. Turn off to run End of Day manually from the token controls.",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(MODULE_ID, "lastTown", { scope: "world", config: false, type: String, default: "" });
  game.settings.register(MODULE_ID, "lastOfficer", { scope: "world", config: false, type: String, default: "" });

  game.settings.register(MODULE_ID, "calendarDiscord", {
    name: "Calendar: post festivals to Discord",
    hint: "The 15 major Antipodea Calendar festivals post a day-of announcement and a weekly heads-up through the webhook below. Founders' Days never post here — phone calendar only.",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(MODULE_ID, "calendarWebhookUrl", {
    name: "Calendar: Discord webhook URL",
    hint: "Stored on your user account only. Make a webhook in whichever channel you want calendar announcements in.",
    scope: userScope, config: true, type: String, default: "",
    restricted: true
  });

  game.keybindings.register(MODULE_ID, "moveTrainers", {
    name: "Move trainers (GM)",
    hint: "Opens the Move Trainers window. With one trainer token selected, asks where just that trainer is.",
    editable: [{ key: "KeyL", modifiers: ["Shift"] }],
    restricted: true,
    onDown: () => { moveTrainers(); return true; }
  });
  game.keybindings.register(MODULE_ID, "openShop", {
    name: "Open the Poké Mart",
    hint: "Opens the shop for wherever your trainer is.",
    editable: [{ key: "KeyM", modifiers: ["Shift"] }],
    onDown: () => { openShop(); return true; }
  });
  game.keybindings.register(MODULE_ID, "openPhone", {
    name: "Open my phone",
    hint: "Opens your trainer's phone.",
    editable: [{ key: "KeyP", modifiers: ["Shift"] }],
    onDown: () => { openMine(); return true; }
  });

  const load = foundry.applications.handlebars?.loadTemplates ?? globalThis.loadTemplates;
  load([`${TEMPLATE_ROOT}/phone.hbs`, ...APP_PARTIALS]);
});

Hooks.once("ready", () => {
  const module = game.modules.get(MODULE_ID);
  module.api = {
    /** Open a trainer's phone. app: "home", "messages", "pokegram", "camera", "gallery", "calendar", "card", "licence" or "admin". */
    open: (actor, app) => RegistryPhone.open(resolveActor(actor), { app }),
    openMine,
    /** Open the shop for a trainer (defaults to the player's own). GMs see every shop. */
    openShop: (actor) => openShop(resolveActor(actor)),
    /** GM: the Move Trainers window. */
    moveTrainers: () => Loc.MoveParty.open(),
    /** GM: move trainers (actors, names or ids) to a place id, e.g. moveTo(["Jamie", "Kuroi"], "budgie-beach"). */
    moveTo: (actors, pinId) => Loc.moveAll([].concat(actors).map(resolveActor).filter(Boolean), pinId),
    /** GM: the Shop Manager. */
    manageShops: () => ShopManager.open(),
    /** GM: open the Antipodea Dex Entries journal to rewrite flavour text in Manuka's voice. */
    openDexEntries: () => DexJournal.journal()?.sheet.render(true),
    /** GM: add a journal page (seeded with PTR's stock text) for any Antipodea species missing one. */
    seedDexEntries: () => DexJournal.seedMissing(),
    shops: Shop,
    /** Open the Crafting window (Craft/Forage) for a trainer (defaults to the player's own). */
    openCraft: (actor) => openCraft(resolveActor(actor)),
    /** GM: the Pokémon Drops tool. */
    drops: () => DropsWindow.open(),
    /** GM: the End of Day tool (also pops up itself when the day changes, if anyone's out bush). */
    endOfDay: () => EndOfDayWindow.open(),
    survival: Surv,
    calendar: Cal,
    /** GM: (re)install the Antipodea Calendar into Seasons & Stars — real-world holidays out, homebrew events in. */
    installCalendar: () => Cal.install(),
    /** GM: the quick phone picker (a selected trainer token opens straight away). */
    pickPhone: (app) => gmPhonePicker(app),
    getRecord: Registry.getRecord,
    issueOffence: Registry.issueOffence,
    setEndorsement: Registry.setEndorsement,
    communityService: Registry.communityService,
    sweep: Registry.sweep,
    /**
     * GM: post emergency alerts (from the Antipodea Weather macro). Each alert is
     * { id, zone, kind, title, body, icon }. Every phone whose location is in that zone gets a pop-up.
     */
    postAlerts: async (alerts, day = "") => {
      if (!game.user.isGM) return false;
      await game.settings.set(MODULE_ID, "weatherAlerts", { day, at: Date.now(), alerts: Array.isArray(alerts) ? alerts : [] });
      return true;
    },
    testDiscord: () => postToDiscord("🧪 **Antipodea Trainer Registry** is connected. Notices will post here."),
    /** Text a trainer as any actor (or as their Rotom with "rotom:<actorId>"). GM only. */
    text: (from, to, text) => Data.request("message", { from: resolveKey(from), to: resolveKey(to), text }),
    rotomSay: (actor, text) => {
      const a = resolveActor(actor);
      return a ? Data.request("message", { from: Data.rotomKey(a.id), to: a.id, text }) : false;
    },
    time: Time
  };
  game.socket.on(Data.SOCKET, Data.onSocket);
  startNetwork().catch((e) => console.error(`${MODULE_ID} | network start failed`, e));
  queueSweep();
  if (Data.isActiveGM()) Cal.install().catch((e) => console.error(`${MODULE_ID} | calendar install failed`, e));
});

/* -------------------------------------------- */
/*  World clock                                 */
/* -------------------------------------------- */

let deliverTimer = null;
let weatherTimer = null;
const dayOf = (t) => {
  const d = game.seasonsStars?.api?.worldTimeToDate?.(t);
  return d ? `${d.year}-${d.month}-${d.day}` : null;
};

/** Run the weather macro once per new day, from a single GM window. */
async function autoWeather(worldTime) {
  if (!game.settings.get(MODULE_ID, "autoWeather") || !Data.isActiveGM()) return;
  const day = dayOf(worldTime);
  if (!day) return;
  if (!await Data.claim(`weather:${day}`)) return;
  const name = game.settings.get(MODULE_ID, "weatherMacro") || "Antipodea Weather";
  const macro = game.macros.getName(name) ?? game.macros.getName("Antipodea Weather");
  if (!macro) return console.warn(`${MODULE_ID} | no weather macro called ${name}`);
  try { await macro.execute({ auto: "true" }); }
  catch (e) { console.error(`${MODULE_ID} | weather macro failed`, e); }
}

let endOfDayTimer = null;

/** Pop up the End of Day tool once per new day, from a single GM window, if anyone's out bush. */
async function autoEndOfDay(worldTime) {
  if (!game.settings.get(MODULE_ID, "autoEndOfDay") || !Data.isActiveGM()) return;
  const day = dayOf(worldTime);
  if (!day) return;
  if (!game.actors.some((a) => isTrainer(a) && Surv.isOutBush(a))) return;
  if (!await Data.claim(`endofday:${day}`)) return;
  EndOfDayWindow.open();
}

let calendarTimer = null;
let shelfTimer = null;
let lastShelfDay = null;

Hooks.on("updateWorldTime", (worldTime, delta) => {
  queueSweep();
  if (Data.isActiveGM()) {
    clearTimeout(weatherTimer);
    weatherTimer = setTimeout(() => autoWeather(worldTime), 1200);
    Data.refreshForecastCache(ZONES).catch(() => {});
    clearTimeout(deliverTimer);
    deliverTimer = setTimeout(() => Data.deliverOrders().catch((e) => console.error(`${MODULE_ID} | deliveries failed`, e)), 900);
    clearTimeout(endOfDayTimer);
    endOfDayTimer = setTimeout(() => autoEndOfDay(worldTime).catch((e) => console.error(`${MODULE_ID} | End of Day popup failed`, e)), 1500);
    clearTimeout(calendarTimer);
    calendarTimer = setTimeout(() => {
      CalDiscord.checkDayOf(worldTime).catch((e) => console.error(`${MODULE_ID} | calendar day-of post failed`, e));
      CalDiscord.checkWeeklyHeadsUp(worldTime).catch((e) => console.error(`${MODULE_ID} | calendar heads-up post failed`, e));
    }, 1700);
    clearTimeout(shelfTimer);
    shelfTimer = setTimeout(() => Shop.checkShelves().catch((e) => console.error(`${MODULE_ID} | shop shelves failed`, e)), 1900);
  }
  // Seasonal stock and sales follow the calendar, so open shop windows redraw on a new day.
  const shelfDay = dayOf(worldTime);
  if (shelfDay !== lastShelfDay) { lastShelfDay = shelfDay; ShopWindow.refresh(); }
  Notify.onTimeChanged(worldTime, delta);
  RegistryPhone.refresh();
});

/* -------------------------------------------- */
/*  Live refresh                                */
/* -------------------------------------------- */

// Pokédex: stash seen/owned just before a dex-touching update, so the updateActor hook
// below can diff against it. The same `options` object is passed to both hooks.
Hooks.on("preUpdateActor", (actor, changes, options) => {
  if (isTrainer(actor) && foundry.utils.hasProperty(changes, "system.dex")) {
    options.antipodeaDexBefore = {
      seen: [...(actor.system.dex?.seen ?? [])],
      owned: [...(actor.system.dex?.owned ?? [])]
    };
  }
});

Hooks.on("updateActor", (actor, changes, options) => {
  if (foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.phone.location`)) Loc.MoveParty.refresh();
  if (ShopWindow.current?.actorId === actor.id) ShopWindow.refresh();
  if (foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`) || "name" in changes || "img" in changes || foundry.utils.hasProperty(changes, "system.money") || foundry.utils.hasProperty(changes, "system.dex")) {
    RegistryPhone.refresh(actor.id);
  }
  if (foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.phone`)) Notify.onPhoneChanged(actor);
  if (options.antipodeaDexBefore) {
    DexDiscord.announceDexChanges(actor, options.antipodeaDexBefore, actor.system.dex ?? {})
      .catch((e) => console.warn(`${MODULE_ID} | dex discord`, e));
  }
});

/* -------------------------------------------- */
/*  Ways in                                     */
/* -------------------------------------------- */

// Actor sheet header button, ApplicationV1 sheets.
Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => {
  const actor = sheet.actor;
  // The Phone's Pokédex replaces PTR's own "Dex" button (PTUDexSheet) for players, since
  // that screen shows no info for seen/owned Pokémon. GMs keep it, in case it's ever needed.
  if (isTrainer(actor) && !game.user.isGM && game.settings.get(MODULE_ID, "hidePtrDex")) {
    const i = buttons.findIndex((b) => b.class === "dex-screen");
    if (i !== -1) buttons.splice(i, 1);
  }
  if (!isTrainer(actor) || !(actor.isOwner || game.user.isGM)) return;
  buttons.unshift({
    label: "Phone",
    class: "antipodea-phone-btn",
    icon: "fa-solid fa-mobile-screen-button",
    onclick: () => RegistryPhone.open(actor)
  });
});

// Actor sheet header control, ApplicationV2 sheets.
Hooks.on("getHeaderControlsActorSheetV2", (sheet, controls) => {
  const actor = sheet.actor ?? sheet.document;
  if (!isTrainer(actor) || !(actor.isOwner || game.user.isGM)) return;
  controls.unshift({
    icon: "fa-solid fa-mobile-screen-button",
    label: "Phone",
    action: "antipodeaPhone",
    onClick: () => RegistryPhone.open(actor)
  });
});

// Right-click an actor in the sidebar.
Hooks.on("getActorContextOptions", (app, options) => {
  options.push({
    name: "Set Location",
    icon: '<i class="fa-solid fa-location-dot"></i>',
    condition: (li) => game.user.isGM && isTrainer(game.actors.get(li.dataset?.entryId ?? li.dataset?.documentId)),
    callback: (li) => Loc.pickFor(game.actors.get(li.dataset?.entryId ?? li.dataset?.documentId))
  });
  options.push({
    name: "Open Phone",
    icon: '<i class="fa-solid fa-mobile-screen-button"></i>',
    condition: (li) => {
      const actor = game.actors.get(li.dataset?.entryId ?? li.dataset?.documentId);
      return isTrainer(actor) && (actor.isOwner || game.user.isGM);
    },
    callback: (li) => RegistryPhone.open(game.actors.get(li.dataset?.entryId ?? li.dataset?.documentId))
  });
});

// A phone button in the token controls for everyone.
Hooks.on("getSceneControlButtons", (controls) => {
  const tokens = controls.tokens ?? controls.token;
  if (!tokens?.tools) return;
  tokens.tools.antipodeaPhone = {
    name: "antipodeaPhone",
    title: "Open Phone",
    icon: "fa-solid fa-mobile-screen-button",
    order: Object.keys(tokens.tools).length,
    button: true,
    visible: true,
    onChange: () => openMine()
  };
  tokens.tools.antipodeaMove = {
    name: "antipodeaMove",
    title: "Move Trainers",
    icon: "fa-solid fa-route",
    order: Object.keys(tokens.tools).length,
    button: true,
    visible: game.user.isGM,
    onChange: () => Loc.MoveParty.open()
  };
  tokens.tools.antipodeaShop = {
    name: "antipodeaShop",
    title: "Poké Mart",
    icon: "fa-solid fa-store",
    order: Object.keys(tokens.tools).length,
    button: true,
    visible: true,
    onChange: () => openShop()
  };
  tokens.tools.antipodeaCraft = {
    name: "antipodeaCraft",
    title: "Crafting",
    icon: "fa-solid fa-fire",
    order: Object.keys(tokens.tools).length,
    button: true,
    visible: true,
    onChange: () => openCraft()
  };
  tokens.tools.antipodeaDrops = {
    name: "antipodeaDrops",
    title: "Pokémon Drops",
    icon: "fa-solid fa-paw",
    order: Object.keys(tokens.tools).length,
    button: true,
    visible: game.user.isGM,
    onChange: () => DropsWindow.open()
  };
  tokens.tools.antipodeaEndOfDay = {
    name: "antipodeaEndOfDay",
    title: "End of Day",
    icon: "fa-solid fa-campground",
    order: Object.keys(tokens.tools).length,
    button: true,
    visible: game.user.isGM,
    onChange: () => EndOfDayWindow.open()
  };
});
