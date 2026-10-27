import { MODULE_ID } from "./constants.js";
import * as Maps from "./maps.js";
import { getPhone, setLocation, isActiveGM } from "./phone-data.js";
import { isOutBush, setOutBush } from "./survival.js";

/**
 * Where trainers are. Three ways for the GM to move them without opening phones:
 *  - the Move Party window (tick trainers, pick a place)
 *  - scenes tagged with a place: activating the scene, or dropping a trainer token on it,
 *    moves those trainers there
 *  - the location button on a trainer token's HUD
 */

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const ROOT = `modules/${MODULE_ID}/templates`;
const isTrainer = (a) => a && a.type !== "pokemon";
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** Places for a dropdown, cities first then towns, alphabetical. */
export function placeOptions(selected) {
  const rank = (p) => (p.kind === "town" ? 1 : 0);
  return Maps.pins().slice().sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
    .map((p) => ({ id: p.id, name: p.name, town: p.kind === "town", selected: p.id === selected }));
}

function optionsHtml(selected, blank = "Nowhere") {
  const opts = placeOptions(selected);
  const group = (label, list) => list.length
    ? `<optgroup label="${label}">${list.map((p) => `<option value="${p.id}" ${p.selected ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</optgroup>`
    : "";
  return `<option value="">${blank}</option>${group("Cities", opts.filter((p) => !p.town))}${group("Towns", opts.filter((p) => p.town))}`;
}

/** Move trainers that aren't already there. Returns how many moved. */
export async function moveAll(actors, pinId) {
  let n = 0;
  for (const a of actors) {
    if (!isTrainer(a)) continue;
    if ((getPhone(a).location ?? null) === (pinId || null)) continue;
    await setLocation(a, pinId || null);
    n++;
  }
  return n;
}

/* -------------------------------------------- */
/*  Move Party window                           */
/* -------------------------------------------- */

export class MoveParty extends HandlebarsApplicationMixin(ApplicationV2) {
  static current = null;

  constructor() {
    super({ id: "antipodea-move-party" });
    MoveParty.current = this;
    this.picked = new Set();
    this.showNpcs = false;
    this.dest = "";
  }

  static DEFAULT_OPTIONS = {
    classes: ["antipodea-shop", "antipodea-move"],
    tag: "div",
    window: { title: "Move Trainers", icon: "fa-solid fa-route", resizable: true },
    position: { width: 440, height: 600 },
    actions: {
      mvToggle: MoveParty.#onToggle,
      mvAll: MoveParty.#onAll,
      mvNpcs: MoveParty.#onNpcs,
      mvGo: MoveParty.#onGo,
      mvHere: MoveParty.#onHere,
      mvBush: MoveParty.#onBush
    }
  };

  static PARTS = { body: { template: `${ROOT}/move-party.hbs`, scrollable: [".mv-list"] } };

  static open() {
    if (!game.user.isGM) return ui.notifications.warn("Only the GM can move trainers.");
    if (MoveParty.current?.rendered) { MoveParty.current.bringToFront?.(); return MoveParty.current; }
    new MoveParty().render({ force: true });
    return MoveParty.current;
  }

  static refresh() {
    if (MoveParty.current?.rendered) MoveParty.current.render();
  }

  async _prepareContext() {
    const all = game.actors.filter(isTrainer).filter((a) => this.showNpcs || a.hasPlayerOwner)
      .sort((a, b) => (b.hasPlayerOwner - a.hasPlayerOwner) || a.name.localeCompare(b.name));
    const rows = all.map((a) => {
      const loc = getPhone(a).location;
      const owner = game.users.find((u) => !u.isGM && u.character?.id === a.id)?.name
        ?? game.users.find((u) => !u.isGM && a.testUserPermission(u, "OWNER"))?.name ?? "";
      return { id: a.id, name: a.name, img: a.img, owner, npc: !a.hasPlayerOwner, place: loc ? Maps.pinById(loc)?.name ?? loc : "Nowhere", nowhere: !loc, picked: this.picked.has(a.id), outBush: isOutBush(a) };
    });
    // Group by where they are now, so parties stand out
    const groups = new Map();
    for (const r of rows) {
      if (!groups.has(r.place)) groups.set(r.place, []);
      groups.get(r.place).push(r);
    }
    const scenePlace = canvas?.scene?.getFlag(MODULE_ID, "place") ?? "";
    return {
      groups: [...groups].sort((a, b) => (a[0] === "Nowhere") - (b[0] === "Nowhere") || a[0].localeCompare(b[0]))
        .map(([place, list]) => ({ place, list, count: list.length })),
      count: this.picked.size,
      showNpcs: this.showNpcs,
      places: optionsHtml(this.dest, "Choose a place"),
      dest: this.dest,
      scenePlace: scenePlace ? Maps.pinById(scenePlace)?.name : null,
      sceneName: canvas?.scene?.name ?? ""
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this.element.querySelector('select[name="dest"]')?.addEventListener("change", (ev) => {
      this.dest = ev.target.value;
      this.element.querySelector('[data-action="mvGo"]').disabled = !this.dest || !this.picked.size;
    });
  }

  static #onToggle(event, target) {
    const id = target.dataset.actor;
    if (this.picked.has(id)) this.picked.delete(id); else this.picked.add(id);
    this.render();
  }

  /** Tick or untick everyone in a group ("Bunya City", "Nowhere"...). */
  static #onAll(event, target) {
    const ids = [...this.element.querySelectorAll(`[data-group="${CSS.escape(target.dataset.group)}"] [data-actor]`)].map((e) => e.dataset.actor);
    const allOn = ids.every((id) => this.picked.has(id));
    for (const id of ids) allOn ? this.picked.delete(id) : this.picked.add(id);
    this.render();
  }

  static #onNpcs() {
    this.showNpcs = !this.showNpcs;
    this.render();
  }

  static async #onBush(event, target) {
    event.stopPropagation();
    const actor = game.actors.get(target.dataset.actor);
    if (!actor) return;
    await setOutBush(actor, !isOutBush(actor));
    this.render();
  }

  static async #onGo() {
    if (!this.dest || !this.picked.size) return;
    const actors = [...this.picked].map((id) => game.actors.get(id)).filter(Boolean);
    const n = await moveAll(actors, this.dest);
    ui.notifications.info(`Moved ${n} trainer${n === 1 ? "" : "s"} to ${Maps.pinById(this.dest)?.name}.`);
    this.picked.clear();
    this.render();
  }

  /** Tick the trainers whose tokens are on the current scene. */
  static #onHere() {
    const ids = (canvas?.tokens?.placeables ?? []).map((t) => t.actor).filter(isTrainer).map((a) => a.id);
    for (const id of ids) this.picked.add(id);
    if (ids.some((id) => !game.actors.get(id)?.hasPlayerOwner)) this.showNpcs = true;
    const place = canvas?.scene?.getFlag(MODULE_ID, "place");
    if (place && !this.dest) this.dest = place;
    this.render();
  }

  async close(options) {
    if (MoveParty.current === this) MoveParty.current = null;
    return super.close(options);
  }
}

/* -------------------------------------------- */
/*  One trainer (token HUD, sidebar)            */
/* -------------------------------------------- */

export async function pickFor(actor) {
  if (!game.user.isGM || !isTrainer(actor)) return;
  const current = getPhone(actor).location ?? "";
  const pin = await DialogV2.prompt({
    window: { title: `Where is ${actor.name}?`, icon: "fa-solid fa-location-dot" },
    content: `<div class="form-group"><label>Location</label><select name="pin">${optionsHtml(current)}</select></div>`,
    ok: { label: "Move", icon: "fa-solid fa-route", callback: (event, button) => button.form.elements.pin.value },
    rejectClose: false
  });
  if (pin === null || pin === undefined || pin === current) return;
  await setLocation(actor, pin || null);
  ui.notifications.info(pin ? `${actor.name} is now in ${Maps.pinById(pin)?.name}.` : `${actor.name} is now nowhere on the map.`);
}

/* -------------------------------------------- */
/*  Scenes tagged with a place                  */
/* -------------------------------------------- */

export function scenePlace(scene) {
  return scene?.getFlag(MODULE_ID, "place") || null;
}

/** Move every trainer with a token on a tagged scene to that place. */
export async function syncScene(scene) {
  const place = scenePlace(scene);
  if (!place || !isActiveGM()) return 0;
  const actors = [...new Set(scene.tokens.map((t) => t.actor).filter(isTrainer))];
  const n = await moveAll(actors, place);
  if (n) ui.notifications.info(`${n} trainer${n === 1 ? "" : "s"} moved to ${Maps.pinById(place)?.name} (from the scene).`);
  return n;
}

/** Add a "PokéMaps place" picker to the Scene Config's Basics tab. */
export function injectSceneConfig(app, element) {
  const scene = app.document ?? app.object;
  const root = element instanceof HTMLElement ? element : element?.[0];
  if (!scene || !root || root.querySelector(".antipodea-scene-place")) return;
  const current = scenePlace(scene) ?? "";
  const group = document.createElement("div");
  group.className = "form-group antipodea-scene-place";
  group.innerHTML = `
    <label>Antipodea place</label>
    <div class="form-fields"><select name="flags.${MODULE_ID}.place">${optionsHtml(current, "None (doesn't move anyone)")}</select></div>
    <p class="hint">Trainers on this scene are moved here (for PokéMaps and the Poké Mart) when you activate it or drop their token on it.</p>`;
  const anchor = root.querySelector('[data-tab="basics"] .form-group:last-of-type, .tab[data-tab="basics"] .form-group:last-of-type')
    ?? root.querySelector('input[name="navName"]')?.closest(".form-group")
    ?? root.querySelector("form .form-group:last-of-type");
  if (anchor) anchor.after(group);
  else root.querySelector("form")?.append(group);
}
