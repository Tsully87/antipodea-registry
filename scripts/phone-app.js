import { MODULE_ID, TIERS, ENDORSEMENTS, STATUS_LABELS, OFFENCES, DEFAULT_BADGES } from "./constants.js";
import * as Time from "./time.js";
import * as Registry from "./registry.js";
import { discordEnabled } from "./discord.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const FormDataExt = foundry.applications.ux?.FormDataExtended ?? globalThis.FormDataExtended;
const FilePickerCls = foundry.applications.apps?.FilePicker?.implementation ?? globalThis.FilePicker;

export function badgeNames() {
  const raw = game.settings.get(MODULE_ID, "badgeNames") ?? "";
  const names = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return names.length ? names : DEFAULT_BADGES;
}

export class RegistryPhone extends HandlebarsApplicationMixin(ApplicationV2) {
  static instances = new Map();

  constructor(actor, options = {}) {
    super({ ...options, id: `antipodea-phone-${actor.id}` });
    this.actor = actor;
    this.tab = options.tab ?? "card";
  }

  static DEFAULT_OPTIONS = {
    classes: ["antipodea-phone"],
    tag: "div",
    window: { icon: "fa-solid fa-mobile-screen-button", resizable: false, minimizable: true },
    position: { width: 380, height: 780 },
    actions: {
      tab: RegistryPhone.#onTab,
      share: RegistryPhone.#onShare,
      issueFine: RegistryPhone.#onIssueFine,
      communityService: RegistryPhone.#onCommunityService,
      removeDemerit: RegistryPhone.#onRemoveDemerit,
      clearSuspension: RegistryPhone.#onClearSuspension,
      ridingDays: RegistryPhone.#onRidingDays,
      pickPhoto: RegistryPhone.#onPickPhoto,
      resetUnlicensed: RegistryPhone.#onResetUnlicensed,
      newIds: RegistryPhone.#onNewIds
    }
  };

  static PARTS = {
    phone: { template: `modules/${MODULE_ID}/templates/phone.hbs` }
  };

  get title() {
    return `${this.actor.name}: Phone`;
  }

  /** Open (or bring forward) the phone for an actor. */
  static open(actor, options = {}) {
    if (!actor) return ui.notifications.warn("No trainer found to open a phone for.");
    if (!actor.isOwner && !game.user.isGM) {
      return ui.notifications.warn("You can only open your own trainer's phone.");
    }
    let app = RegistryPhone.instances.get(actor.id);
    if (!app) {
      app = new RegistryPhone(actor, options);
      RegistryPhone.instances.set(actor.id, app);
    } else if (options.tab) {
      app.tab = options.tab;
    }
    app.render({ force: true });
    if (app.rendered) app.bringToFront?.();
    return app;
  }

  static refresh(actorId) {
    if (actorId) RegistryPhone.instances.get(actorId)?.render();
    else RegistryPhone.instances.forEach((app) => app.rendered && app.render());
  }

  async close(options) {
    RegistryPhone.instances.delete(this.actor.id);
    return super.close(options);
  }

  /* -------------------------------------------- */

  async _prepareContext() {
    const record = Registry.getRecord(this.actor);
    const isGM = game.user.isGM;
    const t = Time.now();
    const limit = game.settings.get(MODULE_ID, "demeritLimit");
    const points = Registry.totalPoints(record, t);
    const suspended = Registry.isSuspended(record, t);

    const names = badgeNames();
    const badges = names.map((name, i) => ({ index: i, name, earned: !!record.badges[i] }));

    const endorsements = Object.entries(ENDORSEMENTS).map(([key, def]) => {
      const lic = record.licences[key];
      return {
        key, label: def.label, icon: def.icon,
        status: lic.status,
        statusLabel: STATUS_LABELS[lic.status],
        isFull: lic.status === "full",
        isLearner: lic.status === "learner",
        isNone: lic.status === "none",
        days: lic.days ?? 0,
        daysNeeded: def.daysNeeded,
        daysDone: (lic.days ?? 0) >= def.daysNeeded,
        issued: Time.formatLong(lic.issued),
        office: lic.office,
        options: Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label, selected: value === lic.status }))
      };
    });

    const hasFull = endorsements.some((e) => e.isFull);
    const hasLearner = endorsements.some((e) => e.isLearner);
    const firstIssued = Object.values(record.licences)
      .map((l) => l.issued).filter((x) => x !== null).sort((a, b) => a - b)[0];

    const demerits = Registry.activeDemerits(record, t)
      .sort((a, b) => a.issued - b.issued)
      .map((d) => ({
        ...d,
        issuedLabel: Time.formatShort(d.issued),
        expiresLabel: Time.formatShort(d.expires),
        daysLeft: Time.daysUntil(d.expires)
      }));

    const segments = Array.from({ length: limit }, (_, i) => ({
      filled: i < points,
      danger: i < points && points >= limit - 2
    }));

    const photo = record.photo || this.actor.img || "icons/svg/mystery-man.svg";

    return {
      isGM,
      tab: this.tab,
      tabs: {
        card: this.tab === "card",
        licence: this.tab === "licence",
        admin: this.tab === "admin" && isGM
      },
      clock: Time.clockTime(),
      name: this.actor.name,
      photo,
      card: {
        trainerId: record.trainerId || "-----",
        homeTown: record.homeTown || "Unknown",
        tier: record.tier,
        tierClass: (record.tier || "poke").toLowerCase().replace("é", "e"),
        badges,
        badgeCount: badges.filter((b) => b.earned).length,
        badgeTotal: badges.length
      },
      licence: {
        has: hasFull || hasLearner,
        style: hasFull ? "full" : hasLearner ? "learner" : "none",
        heading: hasFull ? "FULL" : "LEARNER",
        licenceNo: record.licenceNo || "--------",
        issued: Time.formatLong(firstIssued),
        endorsements,
        points, limit, segments,
        suspended,
        suspendedUntil: Time.formatShort(record.suspendedUntil),
        suspendedDaysLeft: Time.daysUntil(record.suspendedUntil),
        demerits
      },
      admin: {
        trainerIdRaw: record.trainerId,
        homeTownRaw: record.homeTown,
        photoRaw: record.photo,
        licenceNoRaw: record.licenceNo,
        tiers: TIERS.map((v) => ({ value: v, selected: v === record.tier })),
        unlicensedFines: record.unlicensedFines,
        discordOn: discordEnabled(),
        allDemerits: record.demerits.map((d) => ({
          ...d,
          issuedLabel: Time.formatShort(d.issued),
          expiresLabel: Time.formatShort(d.expires),
          expired: d.expires <= t
        }))
      }
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    if (!game.user.isGM) return;
    const html = this.element;

    html.querySelectorAll("[data-field]").forEach((el) => {
      el.addEventListener("change", (ev) => this.#onFieldChange(ev));
    });
    html.querySelectorAll("[data-badge]").forEach((el) => {
      el.addEventListener("change", (ev) => this.#onBadgeChange(ev));
    });
    html.querySelectorAll("[data-licence]").forEach((el) => {
      el.addEventListener("change", (ev) => this.#onLicenceChange(ev));
    });
  }

  /* -------------------------------------------- */
  /*  Admin field handlers                        */
  /* -------------------------------------------- */

  async #onFieldChange(ev) {
    const field = ev.currentTarget.dataset.field;
    const value = ev.currentTarget.value;
    await Registry.updateRecord(this.actor, (r) => { r[field] = value; });
  }

  async #onBadgeChange(ev) {
    const i = Number(ev.currentTarget.dataset.badge);
    const checked = ev.currentTarget.checked;
    await Registry.updateRecord(this.actor, (r) => {
      const arr = Array.from({ length: Math.max(r.badges.length, i + 1) }, (_, n) => !!r.badges[n]);
      arr[i] = checked;
      r.badges = arr;
    });
  }

  async #onLicenceChange(ev) {
    const key = ev.currentTarget.dataset.licence;
    const status = ev.currentTarget.value;
    const office = this.element.querySelector("[name=office]")?.value?.trim() ?? "";
    await Registry.setEndorsement(this.actor, key, status, office);
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static #onTab(event, target) {
    this.tab = target.dataset.tab;
    this.render();
  }

  static async #onShare(event, target) {
    const ctx = await this._prepareContext();
    const which = this.tab === "licence" ? "licence" : "card";
    let body;
    if (which === "card") {
      body = `<p><strong>Trainer ID:</strong> ${ctx.card.trainerId}<br>
        <strong>Home Town:</strong> ${foundry.utils.escapeHTML(ctx.card.homeTown)}<br>
        <strong>Tier:</strong> ${ctx.card.tier}<br>
        <strong>Badges:</strong> ${ctx.card.badgeCount} / ${ctx.card.badgeTotal}</p>`;
    } else if (!ctx.licence.has) {
      body = `<p>No riding licence on file.</p>`;
    } else {
      const rows = ctx.licence.endorsements
        .map((e) => `<li><i class="fa-solid ${e.icon}"></i> ${e.label}: ${e.statusLabel}</li>`).join("");
      body = `<p><strong>Licence No:</strong> ${ctx.licence.licenceNo}</p><ul>${rows}</ul>
        <p><strong>Demerit points:</strong> ${ctx.licence.points} / ${ctx.licence.limit}${ctx.licence.suspended ? ` <strong class="ap-red">SUSPENDED until ${ctx.licence.suspendedUntil}</strong>` : ""}</p>`;
    }
    const title = which === "card" ? "Trainer Card" : "Riding Licence";
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<div class="antipodea-chat"><header><img src="${ctx.photo}" width="36" height="36"><h3>${foundry.utils.escapeHTML(this.actor.name)} shows their ${title}</h3></header>${body}</div>`
    });
  }

  static async #onIssueFine() {
    const offenceOpts = Object.entries(OFFENCES)
      .map(([k, o]) => `<option value="${k}">${o.label}${o.kind === "custom" ? "" : ` ($${o.fine.toLocaleString("en-AU")}${o.points ? `, ${o.points} pt${o.points > 1 ? "s" : ""}` : ""})`}</option>`).join("");
    const endOpts = Object.entries(ENDORSEMENTS).map(([k, e]) => `<option value="${k}">${e.label}</option>`).join("");
    const lastTown = game.settings.get(MODULE_ID, "lastTown") ?? "";
    const lastOfficer = game.settings.get(MODULE_ID, "lastOfficer") ?? "";

    const content = `
      <div class="antipodea-fine-form">
        <div class="form-group"><label>Offence</label><select name="offence">${offenceOpts}</select></div>
        <div class="form-group"><label>Endorsement</label><select name="endorsement">${endOpts}</select></div>
        <div class="form-group"><label>Town or city</label><input type="text" name="town" value="${foundry.utils.escapeHTML(lastTown)}" placeholder="Bunya City"></div>
        <div class="form-group"><label>Issuing officer</label><input type="text" name="officer" value="${foundry.utils.escapeHTML(lastOfficer)}" placeholder="Chief Dulcie"></div>
        <fieldset><legend>Other offence only</legend>
          <div class="form-group"><label>Description</label><input type="text" name="note" placeholder="What they did"></div>
          <div class="form-group"><label>Fine ($)</label><input type="number" name="fine" value="0" min="0" step="50"></div>
          <div class="form-group"><label>Demerit points</label><input type="number" name="points" value="0" min="0" step="1"></div>
        </fieldset>
        <p class="hint">Emergency exemption: escaping real danger or saving a life is never an offence. Let them roll Charm or Guile DC 12 first if it's borderline.</p>
      </div>`;

    const data = await DialogV2.prompt({
      window: { title: `Infringement Notice: ${this.actor.name}`, icon: "fa-solid fa-triangle-exclamation" },
      content,
      ok: {
        label: "Issue notice",
        icon: "fa-solid fa-gavel",
        callback: (event, button) => new FormDataExt(button.form).object
      },
      rejectClose: false
    });
    if (!data) return;
    await game.settings.set(MODULE_ID, "lastTown", data.town ?? "");
    await game.settings.set(MODULE_ID, "lastOfficer", data.officer ?? "");
    const result = await Registry.issueOffence(this.actor, data);
    if (result?.message) ui.notifications.info(result.message);
  }

  static async #onCommunityService() {
    await Registry.communityService(this.actor, 1);
  }

  static async #onRemoveDemerit(event, target) {
    const ok = await DialogV2.confirm({
      window: { title: "Remove demerit" },
      content: "<p>Remove this demerit from the record? A Registry update posts to Discord.</p>",
      rejectClose: false
    });
    if (ok) await Registry.removeDemerit(this.actor, target.dataset.id);
  }

  static async #onClearSuspension() {
    await Registry.clearSuspension(this.actor);
  }

  static async #onRidingDays(event, target) {
    await Registry.adjustRidingDays(this.actor, target.dataset.key, Number(target.dataset.delta));
  }

  static #onPickPhoto() {
    const current = Registry.getRecord(this.actor).photo || this.actor.img;
    new FilePickerCls({
      type: "image",
      current,
      callback: (path) => Registry.updateRecord(this.actor, (r) => { r.photo = path; })
    }).render(true);
  }

  static async #onResetUnlicensed() {
    await Registry.updateRecord(this.actor, (r) => { r.unlicensedFines = 0; });
  }

  static async #onNewIds() {
    await Registry.updateRecord(this.actor, (r) => {
      r.trainerId = "";
      r.licenceNo = "";
      Registry.ensureIds(r);
    });
  }
}
