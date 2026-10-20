import { MODULE_ID, DEFAULT_BADGES } from "./constants.js";
import * as Registry from "./registry.js";
import * as Time from "./time.js";
import { RegistryPhone } from "./phone-app.js";
import { postToDiscord } from "./discord.js";

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
  game.settings.register(MODULE_ID, "lastTown", { scope: "world", config: false, type: String, default: "" });
  game.settings.register(MODULE_ID, "lastOfficer", { scope: "world", config: false, type: String, default: "" });

  game.keybindings.register(MODULE_ID, "openPhone", {
    name: "Open my phone",
    hint: "Opens your trainer's phone with their Trainer Card and Riding Licence.",
    editable: [{ key: "KeyP", modifiers: ["Shift"] }],
    onDown: () => { openMine(); return true; }
  });
});

Hooks.once("ready", () => {
  const module = game.modules.get(MODULE_ID);
  module.api = {
    /** Open a trainer's phone. tab: "card", "licence" or "admin". */
    open: (actor, tab) => RegistryPhone.open(typeof actor === "string" ? game.actors.get(actor) ?? game.actors.getName(actor) : actor, { tab }),
    openMine,
    getRecord: Registry.getRecord,
    issueOffence: Registry.issueOffence,
    setEndorsement: Registry.setEndorsement,
    communityService: Registry.communityService,
    sweep: Registry.sweep,
    testDiscord: () => postToDiscord("🧪 **Antipodea Trainer Registry** is connected. Notices will post here."),
    time: Time
  };
  queueSweep();
});

/* -------------------------------------------- */
/*  World clock                                 */
/* -------------------------------------------- */

Hooks.on("updateWorldTime", () => {
  queueSweep();
  RegistryPhone.refresh();
});

/* -------------------------------------------- */
/*  Live refresh                                */
/* -------------------------------------------- */

Hooks.on("updateActor", (actor, changes) => {
  if (foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`) || "name" in changes || "img" in changes) {
    RegistryPhone.refresh(actor.id);
  }
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
