import { MODULE_ID } from "./constants.js";
import * as DC from "./dead-channel.js";
import * as Maps from "./maps.js";
import * as Social from "./social.js";
import * as Time from "./time.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const ROOT = `modules/${MODULE_ID}/templates`;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/**
 * GM: the Dead Channel control room. Fire any of the seven glitches at a trainer,
 * set up the random side, manage dead zones, and read the GM-only log.
 */
export class DeadChannelWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  static current = null;

  constructor() {
    super({ id: "antipodea-dead-channel" });
    DeadChannelWindow.current = this;
    this.actorId = DC.targets()[0]?.id ?? null;
    this.previewMode = false;
    this.message = null;
    this.busy = false;
  }

  static DEFAULT_OPTIONS = {
    classes: ["antipodea-shop", "antipodea-dead-channel"],
    tag: "div",
    window: { title: "Dead Channel", icon: "fa-solid fa-tower-broadcast", resizable: true },
    position: { width: 560, height: 720 },
    actions: {
      dcFire: DeadChannelWindow.#onFire,
      dcRemoveZone: DeadChannelWindow.#onRemoveZone,
      dcRestore: DeadChannelWindow.#onRestore,
      dcClearLog: DeadChannelWindow.#onClearLog,
      dcOpenLog: DeadChannelWindow.#onOpenLog
    }
  };

  static PARTS = { body: { template: `${ROOT}/dead-channel.hbs`, scrollable: [".dc-scroll"] } };

  static open() {
    if (!game.user.isGM) return ui.notifications.warn("Only the GM can tune into the Dead Channel.");
    if (DeadChannelWindow.current?.rendered) { DeadChannelWindow.current.bringToFront?.(); return DeadChannelWindow.current; }
    new DeadChannelWindow().render({ force: true });
    return DeadChannelWindow.current;
  }

  static refresh() {
    if (DeadChannelWindow.current?.rendered) DeadChannelWindow.current.render();
  }

  async _prepareContext() {
    await DC.ensureJournal();
    const trainers = DC.targets();
    if (!trainers.some((a) => a.id === this.actorId)) this.actorId = trainers[0]?.id ?? null;
    const actor = game.actors.get(this.actorId) ?? null;
    const cfg = DC.config();
    const counts = DC.touchedCounts();
    const pending = actor ? DC.pendingFor(actor).map((p) => DC.EFFECTS[p.kind]?.short ?? p.kind) : [];
    const msg = this.message;
    this.message = null;
    const pct = (v) => Math.round((Number(v) || 0) * 1000) / 10;

    return {
      busy: this.busy,
      message: msg,
      previewMode: this.previewMode,
      noTrainers: !trainers.length,
      trainers: trainers.map((a) => ({ id: a.id, name: a.name, selected: a.id === this.actorId, count: counts[a.id] ?? 0 })),
      inZone: actor ? DC.actorInZone(actor) : false,
      pending: pending.join(", "),
      effects: Object.entries(DC.EFFECTS).map(([key, e]) => {
        const block = DC.blocker(key, actor);
        const previewOff = this.previewMode && !e.preview;
        return {
          key, ...e,
          random: !!cfg.effects[key],
          disabled: previewOff || (block && !(key === "weather" && actor)),
          warn: previewOff ? "Can't preview this one, it changes things for real." : block
        };
      }),
      cfg: {
        random: cfg.random,
        chance: pct(cfg.chancePerDay),
        zoneMult: cfg.zoneMult,
        cooldownDays: cfg.cooldownDays,
        zoneChance: pct(cfg.zoneChancePerDay),
        socialChance: pct(cfg.socialChancePerDay)
      },
      zones: DC.zones().map((z) => ({
        id: z.id,
        near: z.near ?? "Somewhere",
        km: Math.round(z.r * 2 * (Number(game.settings.get(MODULE_ID, "mapKmPerPixel")) || 4.11)),
        until: z.until == null ? "No end date" : `Until ${Time.formatShort(z.until)}`,
        random: z.source === "random"
      })),
      accounts: DC.accounts().map((a) => ({ id: a.id, name: a.name, handle: Social.profile(a.id).handle })),
      log: DC.log().slice(0, 60).map((e) => ({
        ...e,
        when: `${Time.formatShort(e.wt)} ${Time.timeOfDay(e.wt)}`,
        what: DC.EFFECTS[e.kind]?.short ?? e.kind,
        icon: DC.EFFECTS[e.kind]?.icon ?? "fa-circle",
        random: e.source === "random",
        seenLabel: DC.seenLabel(e),
        waiting: !e.seen && !e.replaced && DC.EFFECTS[e.kind]?.personal,
        canRestore: e.kind === "photo" && !e.restored,
        canRemoveZone: e.kind === "deadzone" && e.zoneId && DC.zones().some((z) => z.id === e.zoneId)
      })),
      logCount: DC.log().length
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const el = this.element;
    el.querySelector('select[name="trainer"]')?.addEventListener("change", (ev) => { this.actorId = ev.target.value; this.render(); });
    el.querySelector('input[name="preview"]')?.addEventListener("change", (ev) => { this.previewMode = ev.target.checked; this.render(); });
    el.querySelector('input[name="random"]')?.addEventListener("change", (ev) => this.#save({ random: ev.target.checked }));
    el.querySelectorAll("[data-effect-random]").forEach((box) => box.addEventListener("change", () => {
      this.#save({ effects: { [box.dataset.effectRandom]: box.checked } });
    }));
    const num = (name, key, scale = 1) => el.querySelector(`input[name="${name}"]`)?.addEventListener("change", (ev) => {
      const v = Math.max(0, Number(ev.target.value) || 0);
      this.#save({ [key]: scale === 1 ? v : Math.min(1, v / scale) });
    });
    num("chance", "chancePerDay", 100);
    num("zoneMult", "zoneMult");
    num("cooldownDays", "cooldownDays");
    num("zoneChance", "zoneChancePerDay", 100);
    num("socialChance", "socialChancePerDay", 100);
  }

  async #save(changes) {
    await DC.setConfig(changes);
    this.render();
  }

  static async #onFire(event, target) {
    const kind = target.dataset.kind;
    const actor = game.actors.get(this.actorId) ?? null;
    if (this.previewMode) return DC.preview(kind, actor);

    let opts = {};
    if (kind === "deadzone") {
      opts = await zoneDialog(actor);
      if (!opts) return;
    } else if (kind === "social") {
      opts = await socialDialog();
      if (!opts) return;
    }
    this.busy = true; this.render();
    let res;
    try { res = await DC.fire(kind, DC.EFFECTS[kind].personal || kind === "deadzone" ? actor : null, { source: "gm", ...opts }); }
    catch (e) { console.error(`${MODULE_ID} | Dead Channel`, e); res = { ok: false, error: e.message }; }
    this.busy = false;
    const label = DC.EFFECTS[kind].label;
    this.message = res?.ok
      ? { text: DC.EFFECTS[kind].personal ? `${label} queued for ${actor?.name}. It plays next time they look at their phone.` : `${label} done.` }
      : { error: true, text: res?.error ?? "That didn't work." };
    this.render();
  }

  static async #onRemoveZone(event, target) {
    await DC.removeZone(target.dataset.id);
    this.render();
  }

  static async #onRestore(event, target) {
    const ok = await DC.restorePhoto(target.dataset.id);
    this.message = ok ? { text: "Photo put back the way it was." } : { error: true, text: "Couldn't find that photo any more." };
    this.render();
  }

  static async #onClearLog() {
    const ok = await DialogV2.confirm({
      window: { title: "Clear the Dead Channel log" },
      content: "<p>Wipe the whole log, including who's been touched? This can't be undone.</p>",
      rejectClose: false
    });
    if (!ok) return;
    await DC.clearLog();
    this.render();
  }

  static #onOpenLog() {
    DC.journal()?.sheet.render(true);
  }

  async close(options) {
    if (DeadChannelWindow.current === this) DeadChannelWindow.current = null;
    return super.close(options);
  }
}

/** Where to open a dead zone. */
async function zoneDialog(actor) {
  const pins = Maps.pins().slice().sort((a, b) => a.name.localeCompare(b.name));
  const here = actor ? Maps.pinById(actor.getFlag(MODULE_ID, "phone")?.location ?? null) : null;
  const opts = [`<option value="">Somewhere random</option>`,
    ...pins.map((p) => `<option value="${p.id}" ${p.id === here?.id ? "selected" : ""}>${esc(p.name)}</option>`)].join("");
  return DialogV2.prompt({
    window: { title: "Open a dead zone", icon: "fa-solid fa-tower-broadcast" },
    position: { width: 360 },
    content: `
      <div class="form-group"><label>Centred on</label><select name="pinId">${opts}</select></div>
      <div class="form-group"><label>Size (map pixels across, half of it)</label><input type="number" name="radius" value="20" min="4" max="200"></div>
      <div class="form-group"><label>Lasts (in-game days, 0 = until you remove it)</label><input type="number" name="days" value="3" min="0"></div>
      <p class="hint">A radius of 20 is roughly 80 km each way. Phones inside it show SOS instead of bars, and random glitches are more likely there.</p>`,
    ok: {
      label: "Open it",
      icon: "fa-solid fa-tower-broadcast",
      callback: (event, button) => ({
        pinId: button.form.elements.pinId.value || null,
        radius: Number(button.form.elements.radius.value) || 20,
        days: Number(button.form.elements.days.value)
      })
    },
    rejectClose: false
  });
}

/** Who posts, where, and what. */
async function socialDialog() {
  const accounts = DC.accounts();
  if (!accounts.length) {
    ui.notifications.warn("Mark an NPC as a Dead Channel account first (right-click it in the Actors sidebar).");
    return null;
  }
  const accOpts = [`<option value="">Random account</option>`, ...accounts.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`)].join("");
  const platOpts = [`<option value="">Random app</option>`, ...Object.values(Social.PLATFORMS).map((p) => `<option value="${p.key}">${esc(p.name)}</option>`)].join("");
  return DialogV2.prompt({
    window: { title: "#deadchannel post", icon: "fa-solid fa-hashtag" },
    position: { width: 420 },
    content: `
      <div class="form-group"><label>Posted by</label><select name="accountId">${accOpts}</select></div>
      <div class="form-group"><label>App</label><select name="platform">${platOpts}</select></div>
      <div class="form-group stacked"><label>Caption</label><textarea name="caption" rows="4">${esc(DC.randomCaption())}</textarea></div>
      <p class="hint">The picture is generated static. Leave the caption blank for a random one.</p>`,
    ok: {
      label: "Post",
      icon: "fa-solid fa-hashtag",
      callback: (event, button) => ({
        accountId: button.form.elements.accountId.value || null,
        platform: button.form.elements.platform.value || null,
        caption: button.form.elements.caption.value
      })
    },
    rejectClose: false
  });
}
