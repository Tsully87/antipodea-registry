import { MODULE_ID } from "./constants.js";
import * as OF from "./old-fullas.js";
import * as Data from "./phone-data.js";
import * as Maps from "./maps.js";
import * as Time from "./time.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const ROOT = `modules/${MODULE_ID}/templates`;

/** GM: roll for an Old Fulla sighting wherever the player trainers are right now. */
export class OldFullasWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  static current = null;

  constructor() {
    super({ id: "antipodea-old-fullas" });
    OldFullasWindow.current = this;
    this.chance = null;
    this.message = null;
  }

  static DEFAULT_OPTIONS = {
    classes: ["antipodea-shop", "antipodea-old-fullas"],
    tag: "div",
    window: { title: "Old Fullas", icon: "fa-solid fa-feather-pointed", resizable: true },
    position: { width: 500, height: 620 },
    actions: { ofRoll: OldFullasWindow.#onRoll, ofRollAll: OldFullasWindow.#onRollAll, ofOpenLog: OldFullasWindow.#onOpenLog }
  };

  static PARTS = { body: { template: `${ROOT}/old-fullas.hbs`, scrollable: [".of-scroll"] } };

  static open() {
    if (!game.user.isGM) return ui.notifications.warn("Only the GM rolls for Old Fullas.");
    if (OldFullasWindow.current?.rendered) { OldFullasWindow.current.render(); OldFullasWindow.current.bringToFront?.(); return OldFullasWindow.current; }
    new OldFullasWindow().render({ force: true });
    return OldFullasWindow.current;
  }

  static refresh() {
    if (OldFullasWindow.current?.rendered) OldFullasWindow.current.render();
  }

  #trainers() {
    return game.actors.filter((a) => a.type !== "pokemon" && a.hasPlayerOwner);
  }

  async _prepareContext() {
    await OF.ensureJournal();
    const groups = new Map();
    const nowhere = [];
    for (const a of this.#trainers()) {
      const pin = Maps.pinById(Data.getPhone(a).location);
      if (!pin) { nowhere.push(a.name); continue; }
      if (!groups.has(pin.id)) groups.set(pin.id, { pin, names: [] });
      groups.get(pin.id).names.push(a.name);
    }
    const msg = this.message;
    this.message = null;
    return {
      message: msg,
      chance: this.chance ?? OF.manualChance(),
      autoOn: OF.autoOn(),
      autoChance: OF.autoChance(),
      places: [...groups.values()].sort((a, b) => a.pin.name.localeCompare(b.pin.name)).map(({ pin, names }) => {
        const fullas = OF.candidatesAt(pin);
        return {
          id: pin.id, name: pin.name, zone: pin.zone, trainers: names.join(", "),
          fullas: fullas.map((f) => ({ name: f.name, species: f.species, outsider: f.band === "Outsiders" })),
          none: !fullas.length
        };
      }),
      nowhere: nowhere.join(", "),
      recent: OF.log().slice(0, 15).map((e) => ({ ...e, when: `${Time.formatShort(e.wt)} ${Time.timeOfDay(e.wt)}` }))
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const el = this.element;
    el.querySelector('input[name="chance"]')?.addEventListener("change", (ev) => { this.chance = Math.max(0, Number(ev.target.value) || 0); });
    el.querySelector('input[name="autoOn"]')?.addEventListener("change", (ev) => game.settings.set(MODULE_ID, "oldFullasAuto", ev.target.checked));
    el.querySelector('input[name="autoChance"]')?.addEventListener("change", (ev) => game.settings.set(MODULE_ID, "oldFullasAutoChance", Math.max(0, Number(ev.target.value) || 0)));
  }

  async #roll(actors) {
    const chance = this.chance ?? OF.manualChance();
    const entries = await OF.manualCheck(actors, chance);
    const hits = entries.filter((e) => e.hit);
    this.message = !entries.length
      ? { text: "No Old Fullas live there, so there was nothing to roll." }
      : hits.length
        ? { hit: true, text: `Sighting! ${hits.map((h) => `${h.name} at ${h.place}`).join("; ")}. Details whispered to you in chat.` }
        : { text: `${entries.length} check${entries.length === 1 ? "" : "s"} at ${chance}%, nothing this time.` };
    this.render();
  }

  static async #onRoll(event, target) {
    const pinId = target.dataset.pin;
    await this.#roll(this.#trainers().filter((a) => Data.getPhone(a).location === pinId));
  }

  static async #onRollAll() {
    await this.#roll(this.#trainers());
  }

  static #onOpenLog() {
    OF.journal()?.sheet.render(true);
  }

  async close(options) {
    if (OldFullasWindow.current === this) OldFullasWindow.current = null;
    return super.close(options);
  }
}
