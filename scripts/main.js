import { MODULE_ID, DEFAULT_BADGES } from "./constants.js";
import * as Registry from "./registry.js";
import * as Time from "./time.js";
import { RegistryPhone, APP_PARTIALS, TEMPLATE_ROOT } from "./phone-app.js";
import { postToDiscord } from "./discord.js";
import * as Data from "./phone-data.js";
import * as Notify from "./notify.js";
import * as Net from "./network.js";
import { ZONES } from "./maps.js";

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
  const owned = game.actors.filter((a) => isTrainer(a) && a.isOwner && (game.user.isGM ? a.hasPlayerOwner : true));
  const guess = myTrainer();
  if (guess && !game.user.isGM) return RegistryPhone.open(guess, { tab });
  if (owned.length <= 1 && guess) return RegistryPhone.open(guess, { tab });
  if (!owned.length) return ui.notifications.warn("No trainers to open a phone for.");

  const options = owned.map((a) => `<option value="${a.id}">${foundry.utils.escapeHTML(a.name)}</option>`).join("");
  const id = await foundry.applications.api.DialogV2.prompt({
    window: { title: "Whose phone?", icon: "fa-solid fa-mobile-screen-button" },
    content: `<div class="form-group"><label>Trainer</label><select name="actor">${options}</select></div>`,
    ok: { label: "Open", callback: (event, button) => button.form.elements.actor.value },
    rejectClose: false
  });
  if (id) RegistryPhone.open(game.actors.get(id), { tab });
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
  RegistryPhone.refresh();
  if (Data.isActiveGM()) {
    await Data.processBacklog();
    await Data.prune();
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
    RegistryPhone.refresh();
  }, 150);
}

Hooks.on("createJournalEntryPage", (page) => onNetworkPage(page, "create"));
Hooks.on("updateJournalEntryPage", (page) => onNetworkPage(page, "update"));
Hooks.on("deleteJournalEntryPage", (page) => onNetworkPage(page, "delete"));

// When a GM (you, or a bot GM later) comes online, they pick up whatever queued while nobody was on.
Hooks.on("userConnected", () => {
  setTimeout(() => {
    if (Data.isActiveGM()) Data.processBacklog();
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
  game.settings.register(MODULE_ID, "events", {
    scope: "world", config: false, type: Array, default: [],
    onChange: () => RegistryPhone.refresh()
  });

  game.settings.register(MODULE_ID, "lastTown", { scope: "world", config: false, type: String, default: "" });
  game.settings.register(MODULE_ID, "lastOfficer", { scope: "world", config: false, type: String, default: "" });

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
    getRecord: Registry.getRecord,
    issueOffence: Registry.issueOffence,
    setEndorsement: Registry.setEndorsement,
    communityService: Registry.communityService,
    sweep: Registry.sweep,
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
});

/* -------------------------------------------- */
/*  World clock                                 */
/* -------------------------------------------- */

let deliverTimer = null;
Hooks.on("updateWorldTime", (worldTime, delta) => {
  queueSweep();
  if (Data.isActiveGM()) {
    Data.refreshForecastCache(ZONES).catch(() => {});
    clearTimeout(deliverTimer);
    deliverTimer = setTimeout(() => Data.deliverOrders().catch((e) => console.error(`${MODULE_ID} | deliveries failed`, e)), 900);
  }
  Notify.onTimeChanged(worldTime, delta);
  RegistryPhone.refresh();
});

/* -------------------------------------------- */
/*  Live refresh                                */
/* -------------------------------------------- */

Hooks.on("updateActor", (actor, changes) => {
  if (foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`) || "name" in changes || "img" in changes || foundry.utils.hasProperty(changes, "system.money")) {
    RegistryPhone.refresh(actor.id);
  }
  if (foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.phone`)) Notify.onPhoneChanged(actor);
});

/* -------------------------------------------- */
/*  Ways in                                     */
/* -------------------------------------------- */

// Actor sheet header button, ApplicationV1 sheets.
Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => {
  const actor = sheet.actor;
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
});
