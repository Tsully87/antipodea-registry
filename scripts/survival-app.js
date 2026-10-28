import { MODULE_ID } from "./constants.js";
import * as Surv from "./survival.js";

/**
 * Survival and Crafting windows: the player-facing Craft/Forage window, and the GM's
 * Drops and End of Day tools. See survival.js for all the rules logic — these classes
 * are just the UI, following the same ApplicationV2 pattern as the Shop and Move Trainers
 * windows (shop-app.js, location.js).
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const ROOT = `modules/${MODULE_ID}/templates`;
const isTrainer = (a) => a && a.type !== "pokemon";

const POKEMON_TYPES = [
  "Normal", "Fire", "Water", "Electric", "Grass", "Ice", "Fighting", "Poison", "Ground",
  "Flying", "Psychic", "Bug", "Rock", "Ghost", "Dragon", "Dark", "Steel", "Fairy"
];

const SKILL_LABELS = { survival: "Survival", athletics: "Athletics", pokemonEd: "Pokémon Ed", focus: "Focus" };

/* -------------------------------------------- */
/*  Player: Craft / Forage window               */
/* -------------------------------------------- */

export class CraftWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  static current = null;

  constructor(actor) {
    super({ id: "antipodea-craft" });
    CraftWindow.current = this;
    this.actorId = actor?.id ?? null;
    this.tab = "craft";
    this.message = null;
  }

  static DEFAULT_OPTIONS = {
    classes: ["antipodea-shop", "antipodea-craft"],
    tag: "div",
    window: { title: "Crafting", icon: "fa-solid fa-fire", resizable: true },
    position: { width: 480, height: 640 },
    actions: {
      cfTab: CraftWindow.#onTab,
      cfMake: CraftWindow.#onMake,
      cfForage: CraftWindow.#onForage
    }
  };

  static PARTS = { body: { template: `${ROOT}/craft.hbs`, scrollable: [".cf-list"] } };

  static open(actor) {
    if (CraftWindow.current?.rendered) {
      if (actor) CraftWindow.current.setActor(actor);
      CraftWindow.current.render({ force: true });
      CraftWindow.current.bringToFront?.();
      return CraftWindow.current;
    }
    new CraftWindow(actor).render({ force: true });
    return CraftWindow.current;
  }

  setActor(actor) {
    if (actor?.id === this.actorId) return;
    this.actorId = actor?.id ?? null;
    this.message = null;
  }

  get actor() {
    return game.actors.get(this.actorId) ?? null;
  }

  trainers() {
    return game.actors.filter((a) => isTrainer(a) && a.isOwner && (game.user.isGM || a.hasPlayerOwner))
      .sort((a, b) => (b.hasPlayerOwner - a.hasPlayerOwner) || a.name.localeCompare(b.name));
  }

  async _prepareContext() {
    const trainers = this.trainers();
    if (!this.actor && trainers.length) this.actorId = trainers[0].id;
    const actor = this.actor;
    const msg = this.message;
    this.message = null;

    const ctx = {
      trainers: trainers.map((a) => ({ id: a.id, name: a.name, selected: a.id === this.actorId })),
      many: trainers.length > 1,
      actor: actor ? { name: actor.name, img: actor.img } : null,
      craft: this.tab === "craft",
      message: msg
    };
    if (!actor) return ctx;

    ctx.outBush = Surv.isOutBush(actor);
    ctx.recipes = Surv.RECIPES.map((r) => {
      const status = Surv.recipeStatus(actor, r);
      return {
        id: r.id,
        name: r.name,
        makes: r.makes,
        dc: r.dc - (status.survivalist ? 2 : 0),
        canMake: status.canMake,
        rankLabel: status.rankLabel,
        rankOk: status.rankOk,
        need: Object.entries(status.need).map(([mat, qty]) => ({ mat, qty, has: status.has[mat] ?? 0, short: (status.has[mat] ?? 0) < qty }))
      };
    });

    const zone = Surv.zoneOf(actor);
    ctx.zone = zone ?? "Nowhere";
    ctx.zoneGroup = zone ? Surv.zoneGroupOf(zone) : null;
    return ctx;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this.element.querySelector('select[name="trainer"]')?.addEventListener("change", (ev) => {
      this.setActor(game.actors.get(ev.target.value));
      this.render();
    });
  }

  static #onTab(event, target) {
    this.tab = target.dataset.tab;
    this.render();
  }

  static async #onMake(event, target) {
    const actor = this.actor;
    if (!actor) return;
    const res = await Surv.craft(actor, target.dataset.recipe);
    if (!res.ok) {
      this.message = { error: true, text: res.wasted ? `Failed badly (${res.total} vs DC ${res.dc}) — the materials are ruined.` : `Didn't make it (${res.total} vs DC ${res.dc}). Materials are safe, try again.` };
    } else {
      this.message = { text: `Crafted it! (${res.total} vs DC ${res.dc})${res.extra > 1 ? " — made two." : ""}` };
    }
    this.render();
  }

  static async #onForage() {
    const actor = this.actor;
    if (!actor) return;
    const res = await Surv.forage(actor);
    this.message = res.ok ? { text: `Found: ${res.summary}.` } : { error: true, text: res.error };
    this.render();
  }

  async close(options) {
    if (CraftWindow.current === this) CraftWindow.current = null;
    return super.close(options);
  }
}

/* -------------------------------------------- */
/*  GM: Pokémon drops                            */
/* -------------------------------------------- */

export class DropsWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  static current = null;

  constructor() {
    super({ id: "antipodea-drops" });
    DropsWindow.current = this;
    this.actorId = null;
    this.ptype = "Normal";
    this.message = null;
  }

  static DEFAULT_OPTIONS = {
    classes: ["antipodea-shop", "antipodea-drops"],
    tag: "div",
    window: { title: "Pokémon Drops", icon: "fa-solid fa-paw", resizable: true },
    position: { width: 420, height: 380 },
    actions: { dpHarvest: DropsWindow.#onHarvest }
  };

  static PARTS = { body: { template: `${ROOT}/drops.hbs` } };

  static open() {
    if (!game.user.isGM) return ui.notifications.warn("Only the GM uses the Drops tool.");
    if (DropsWindow.current?.rendered) { DropsWindow.current.bringToFront?.(); return DropsWindow.current; }
    new DropsWindow().render({ force: true });
    return DropsWindow.current;
  }

  async _prepareContext() {
    const trainers = game.actors.filter(isTrainer).sort((a, b) => a.name.localeCompare(b.name));
    if (!this.actorId && trainers.length) this.actorId = trainers[0].id;
    const drop = Surv.dropFor(this.ptype);
    const msg = this.message;
    this.message = null;
    return {
      trainers: trainers.map((a) => ({ id: a.id, name: a.name, selected: a.id === this.actorId })),
      types: POKEMON_TYPES.map((t) => ({ name: t, selected: t === this.ptype })),
      drop: drop ? { ...drop, skillLabel: SKILL_LABELS[drop.skill] ?? drop.skill } : null,
      message: msg
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this.element.querySelector('select[name="trainer"]')?.addEventListener("change", (ev) => { this.actorId = ev.target.value; });
    this.element.querySelector('select[name="ptype"]')?.addEventListener("change", (ev) => { this.ptype = ev.target.value; this.render(); });
  }

  static async #onHarvest() {
    const actor = game.actors.get(this.actorId);
    if (!actor) return;
    const res = await Surv.harvest(actor, this.ptype);
    this.message = res.ok
      ? { text: `${actor.name} harvested 1 ${res.material} (${res.total} vs DC 10).` }
      : { error: true, text: res.error ?? `No luck (${res.total} vs DC 10).` };
    this.render();
  }

  async close(options) {
    if (DropsWindow.current === this) DropsWindow.current = null;
    return super.close(options);
  }
}

/* -------------------------------------------- */
/*  GM: End of Day                               */
/* -------------------------------------------- */

export class EndOfDayWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  static current = null;

  constructor() {
    super({ id: "antipodea-end-of-day" });
    EndOfDayWindow.current = this;
    this.preview = null;
    this.hazards = {};
    this.busy = false;
    this.done = false;
  }

  static DEFAULT_OPTIONS = {
    classes: ["antipodea-shop", "antipodea-end-of-day"],
    tag: "div",
    window: { title: "End of Day", icon: "fa-solid fa-campground", resizable: true },
    position: { width: 520, height: 640 },
    actions: { edHazard: EndOfDayWindow.#onHazard, edApply: EndOfDayWindow.#onApply }
  };

  static PARTS = { body: { template: `${ROOT}/end-of-day.hbs`, scrollable: [".ed-zones"] } };

  static open() {
    if (!game.user.isGM) return ui.notifications.warn("Only the GM runs End of Day.");
    if (EndOfDayWindow.current?.rendered) { EndOfDayWindow.current.bringToFront?.(); return EndOfDayWindow.current; }
    new EndOfDayWindow().render({ force: true });
    return EndOfDayWindow.current;
  }

  async #load() {
    this.preview = await Surv.endOfDayPreview();
    this.hazards = {};
    for (const z of this.preview) this.hazards[z.zone] = foundry.utils.deepClone(z.hazards);
  }

  async _prepareContext() {
    if (!this.preview) await this.#load();
    return {
      busy: this.busy,
      done: this.done,
      zones: (this.preview ?? []).map((z) => ({
        zone: z.zone,
        trainers: z.trainers.map((t) => t.name).join(", "),
        weather: z.weather ? `${z.weather.sky}, ${z.weather.hi}° / ${z.weather.lo}°` : "No weather data",
        hazards: ["heat", "cold", "wet", "smoke", "tropics"].map((key) => ({
          key,
          label: { heat: "Heat", cold: "Cold", wet: "Wet", smoke: "Smoke/dust", tropics: "Tropics" }[key],
          active: !!this.hazards[z.zone]?.[key]?.active,
          severe: !!this.hazards[z.zone]?.[key]?.severe,
          zone: z.zone
        }))
      })),
      empty: !this.preview?.length
    };
  }

  static #onHazard(event, target) {
    const { zone, key } = target.dataset;
    const h = this.hazards[zone]?.[key];
    if (!h) return;
    if (event.shiftKey) h.severe = !h.severe;
    else h.active = !h.active;
    this.render();
  }

  static async #onApply() {
    if (!this.preview?.length) return;
    this.busy = true; this.render();
    await Surv.applyEndOfDay(this.preview, this.hazards);
    this.busy = false; this.done = true;
    this.render();
  }

  async close(options) {
    if (EndOfDayWindow.current === this) EndOfDayWindow.current = null;
    return super.close(options);
  }
}
