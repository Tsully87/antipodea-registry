import { MODULE_ID, TIERS, ENDORSEMENTS, STATUS_LABELS, OFFENCES, DEFAULT_BADGES } from "./constants.js";
import * as Time from "./time.js";
import * as Registry from "./registry.js";
import * as Data from "./phone-data.js";
import { discordEnabled } from "./discord.js";
import * as Social from "./social.js";
import * as Store from "./store.js";
import * as Maps from "./maps.js";
import { SOCIAL_APPS, isSocial, socialContext, socialActions, socialBack } from "./social-app.js";
import { ShopWindow } from "./shop-app.js";
import { PAID_SCREENS, storeContext, translatorContext, weatherContext, mapsContext, payContext, martContext, paidActions, addPinAt, addSpotAt } from "./paid-apps.js";
import { dexContext, dexActions } from "./dex-app.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const FormDataExt = foundry.applications.ux?.FormDataExtended ?? globalThis.FormDataExtended;
const FilePickerCls = foundry.applications.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

export const TEMPLATE_ROOT = `modules/${MODULE_ID}/templates`;
export const APP_PARTIALS = ["home", "card", "licence", "admin", "messages", "thread", "contacts", "social", "camera", "gallery", "photo", "calendar",
  "store", "translator", "weather", "pokemaps", "pokepay", "mart", "dex"]
  .map((n) => `${TEMPLATE_ROOT}/apps/${n}.hbs`);

/** App icons on the home screen, in order. */
const HOME_APPS = [
  { app: "messages", label: "Messages", icon: "fa-comment", color: "#2fb34a" },
  { app: "contacts", label: "Contacts", icon: "fa-address-book", color: "#7a7f87" },
  { app: "pokegram", label: "PokéGram", icon: "fa-camera-retro", color: "#d6336c", lock: "pokegram" },
  { app: "poketube", label: "PokéTube", icon: "fa-play", color: "#e03131", lock: "poketube" },
  { app: "tiktogepi", label: "TikTogepi", icon: "fa-music", color: "#212529", lock: "tiktogepi" },
  { app: "camera", label: "Camera", icon: "fa-camera", color: "#3d3f44", lock: "camera" },
  { app: "gallery", label: "Gallery", icon: "fa-images", color: "#f08c00" },
  { app: "calendar", label: "Calendar", icon: "fa-calendar-days", color: "#e03131" },
  { app: "dex", label: "Pokédex", icon: "fa-book-open", color: "#2b6cb0" },
  { app: "card", label: "Trainer Card", icon: "fa-id-badge", color: "#c4622d" },
  { app: "licence", label: "Licence", icon: "fa-id-card", color: "#1f7a7a" },
  { app: "store", label: "App Store", icon: "fa-bag-shopping", color: "#4263eb", lock: "store" },
  { app: "shop", label: "Poké Mart", icon: "fa-store", color: "#c4622d" }
];

const APP_TITLES = {
  messages: "Messages", thread: "", contacts: "Contacts", pokegram: "PokéGram", poketube: "PokéTube", tiktogepi: "TikTogepi",
  store: "App Store", translator: "Translator", weather: "Weather", pokemaps: "PokéMaps", pokepay: "PokéPay", mart: "Mart Express",
  camera: "Camera", gallery: "Gallery", photo: "Photo", calendar: "Calendar",
  card: "Trainer Card", licence: "Riding Licence", admin: "Registry", dex: "Pokédex"
};

/** Where the back arrow goes from each app. */
const PARENT = { thread: "messages", photo: "gallery" };

export function badgeNames() {
  const raw = game.settings.get(MODULE_ID, "badgeNames") ?? "";
  const names = raw.split(/[\r\n,]+/).map((s) => s.trim()).filter(Boolean);
  return names.length ? names : DEFAULT_BADGES;
}

function ago(ms) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export class RegistryPhone extends HandlebarsApplicationMixin(ApplicationV2) {
  static instances = new Map();

  constructor(actor, options = {}) {
    super({ id: `antipodea-phone-${actor.id}` });
    this.actor = actor;
    this.app = "home";
    this.other = null;
    this.threadCh = "sms";
    this.threadBack = null;
    this.sv = null;
    this.camFilter = "none";
    this.photoId = null;
    this.calOffset = 0;
    this.calDay = null;
    this.dexSel = null;
    this.dexFilterStatus = null;
    this.dexFilterType = null;
    this.feedAuthor = null;
    this.composeImg = null;
    this.attachImg = null;
    this.showAttach = false;
    this.busy = null;
    this._drafts = {};
    this._focus = null;
    this._scroll = null;
    this.#navigate(options);
  }

  static DEFAULT_OPTIONS = {
    classes: ["antipodea-phone"],
    tag: "div",
    window: { icon: "fa-solid fa-mobile-screen-button", resizable: false, minimizable: true },
    position: { width: 380, height: 780 },
    actions: {
      apGo: RegistryPhone.#onGo,
      apHome: RegistryPhone.#onHome,
      apBack: RegistryPhone.#onBack,
      // Messages
      apOpenThread: RegistryPhone.#onOpenThread,
      apSend: RegistryPhone.#onSend,
      apAttachToggle: RegistryPhone.#onAttachToggle,
      apAttachPick: RegistryPhone.#onAttachPick,
      apAttachClear: RegistryPhone.#onAttachClear,
      apAddContact: RegistryPhone.#onAddContact,
      apRemoveContact: RegistryPhone.#onRemoveContact,
      // Social apps, paid apps and the Pokédex live in their own files
      ...socialActions,
      ...paidActions,
      ...dexActions,
      apCamFilter: RegistryPhone.#onCamFilter,
      // Camera and Gallery
      apSnap: RegistryPhone.#onSnap,
      apUpload: RegistryPhone.#onUpload,
      apViewPhoto: RegistryPhone.#onViewPhoto,
      apPhotoPost: RegistryPhone.#onPhotoPost,
      apPhotoSend: RegistryPhone.#onPhotoSend,
      apPhotoDelete: RegistryPhone.#onPhotoDelete,
      apPhotoFull: RegistryPhone.#onPhotoFull,
      // Calendar
      apCalShift: RegistryPhone.#onCalShift,
      apCalDay: RegistryPhone.#onCalDay,
      apAddReminder: RegistryPhone.#onAddReminder,
      apToggleReminder: RegistryPhone.#onToggleReminder,
      apDeleteReminder: RegistryPhone.#onDeleteReminder,
      apAddEvent: RegistryPhone.#onAddEvent,
      apDeleteEvent: RegistryPhone.#onDeleteEvent,
      // Card and licence
      share: RegistryPhone.#onShare,
      // Registry (GM)
      issueFine: RegistryPhone.#onIssueFine,
      communityService: RegistryPhone.#onCommunityService,
      removeDemerit: RegistryPhone.#onRemoveDemerit,
      clearSuspension: RegistryPhone.#onClearSuspension,
      ridingDays: RegistryPhone.#onRidingDays,
      pickPhoto: RegistryPhone.#onPickPhoto,
      resetUnlicensed: RegistryPhone.#onResetUnlicensed,
      newIds: RegistryPhone.#onNewIds,
      apRotomSay: RegistryPhone.#onRotomSay
    }
  };

  static PARTS = {
    phone: { template: `${TEMPLATE_ROOT}/phone.hbs` }
  };

  get title() {
    return `${this.actor.name}: Phone`;
  }

  get phone() {
    return Data.getPhone(this.actor);
  }

  /* -------------------------------------------- */
  /*  Opening and navigation                      */
  /* -------------------------------------------- */

  /**
   * Open (or bring forward) a trainer's phone.
   * @param {Actor} actor
   * @param {object} [options] { app, other, tab } (tab is the old name for app)
   */
  static open(actor, options = {}) {
    if (!actor) return ui.notifications.warn("No trainer found to open a phone for.");
    if (!actor.isOwner && !game.user.isGM) {
      return ui.notifications.warn("You can only open your own trainer's phone.");
    }
    let app = RegistryPhone.instances.get(actor.id);
    if (!app) {
      app = new RegistryPhone(actor, options);
      RegistryPhone.instances.set(actor.id, app);
    } else {
      app.#navigate(options);
    }
    app.render({ force: true });
    if (app.rendered) app.bringToFront?.();
    return app;
  }

  static refresh(actorId) {
    if (actorId) {
      const app = RegistryPhone.instances.get(actorId);
      if (app?.rendered) app.render();
    } else {
      RegistryPhone.instances.forEach((app) => app.rendered && app.render());
    }
  }

  /** True if this client has that thread open on screen right now. */
  static isViewingThread(actorId, other, ch = "sms") {
    const app = RegistryPhone.instances.get(actorId);
    return !!(app?.rendered && !app.minimized && app.app === "thread" && app.other === other && app.threadCh === ch);
  }

  #navigate({ app, tab, other, ch } = {}) {
    const target = app ?? (tab === "admin" ? "admin" : tab);
    if (!target) return;
    this.app = target;
    if (other !== undefined) this.other = other;
    if (target === "thread") {
      this.threadCh = ch ?? "sms";
      this.threadBack = this.threadCh === "sms" ? null : this.threadCh;
      if (this.other) Data.markRead(this.actor, this.other, this.threadCh);
    }
    if (isSocial(target)) this.sv = null;
  }

  /** Switch screens. Used by the action handlers in this file and the app files. */
  go(app, extra = {}) {
    if (app !== "pokemaps") { this.cityView = null; this.citySpot = null; this.cityEdit = false; }
    if (app !== "dex") this.dexSel = null;
    this.app = app;
    Object.assign(this, extra);
    if (app === "thread" && this.other) Data.markRead(this.actor, this.other, this.threadCh);
    this.render();
  }

  async close(options) {
    RegistryPhone.instances.delete(this.actor.id);
    return super.close(options);
  }

  /* -------------------------------------------- */
  /*  Context                                     */
  /* -------------------------------------------- */

  async _prepareContext() {
    const isGM = game.user.isGM;
    const phone = this.phone;
    const record = Registry.getRecord(this.actor);
    const photo = record.photo || this.actor.img || "icons/svg/mystery-man.svg";
    const app = this.app === "admin" && !isGM ? "home" : this.app;
    const locked = (key) => key && !Data.canUseApp(phone, key);

    const ctx = {
      isGM,
      app,
      view: { [app]: true, social: isSocial(app) },
      title: app === "pokemaps" && this.cityView ? (Maps.pinById(this.cityView)?.name ?? "City map") : app === "thread" ? Data.who(this.other).name + (this.threadCh !== "sms" ? ` · ${Social.PLATFORMS[this.threadCh]?.name ?? ""}` : "") : APP_TITLES[app] ?? "",
      clock: Time.clockTime(),
      name: this.actor.name,
      actorId: this.actor.id,
      photo,
      rotom: phone.rotom,
      rotomName: phone.rotomName || "Rotom",
      signal: Data.hasSignal(),
      gmOnline: Data.gmOnline(),
      dmCh: app === "thread" && this.threadCh !== "sms" ? this.threadCh : null,
      busy: this.busy
    };

    switch (app) {
      case "home": Object.assign(ctx, this.#homeContext(phone, locked)); break;
      case "messages": ctx.threads = this.#threadList(); break;
      case "thread": Object.assign(ctx, this.#threadContext(phone)); break;
      case "contacts": Object.assign(ctx, this.#contactsContext()); break;
      case "pokegram":
      case "poketube":
      case "tiktogepi": Object.assign(ctx, socialContext.call(this, app, phone)); break;
      case "store": Object.assign(ctx, storeContext.call(this, phone)); break;
      case "translator": Object.assign(ctx, translatorContext.call(this, phone)); break;
      case "weather": Object.assign(ctx, weatherContext.call(this, phone)); break;
      case "pokemaps": Object.assign(ctx, mapsContext.call(this, phone)); break;
      case "pokepay": Object.assign(ctx, payContext.call(this, phone)); break;
      case "mart": Object.assign(ctx, martContext.call(this, phone)); break;
      case "dex": Object.assign(ctx, await dexContext.call(this, phone)); break;
      case "camera": {
        ctx.canSnap = !!canvas?.ready && !!canvas.scene;
        ctx.pro = Data.hasApp(phone, "procamera");
        ctx.filters = Object.entries(Data.FILTERS).map(([key, f]) => ({ key, label: f.label, css: f.css, selected: key === this.camFilter }));
        break;
      }
      case "gallery": ctx.gallery = phone.gallery.map((g) => ({ ...g, label: Time.formatShort(g.wt) })); break;
      case "photo": Object.assign(ctx, this.#photoContext(phone, locked)); break;
      case "calendar": Object.assign(ctx, this.#calendarContext(phone, locked)); break;
      case "card":
      case "licence":
      case "admin": Object.assign(ctx, this.#registryContext(record, phone)); break;
    }
    return ctx;
  }

  #homeContext(phone, locked) {
    const unread = Data.unreadCount(this.actor);
    const meta = Time.calendarMeta();
    const d = Time.fromTime(Time.now());
    const dateLabel = meta && d ? `${meta.weekdays[d.weekday] ?? ""} ${d.day} ${meta.months[d.month - 1]?.name ?? ""}`.trim() : Time.formatLong(Time.now());
    const apps = HOME_APPS.map((a) => ({
      ...a,
      locked: locked(a.lock),
      badge: a.app === "messages" ? unread : isSocial(a.app) ? Data.unreadCount(this.actor, a.app) : 0
    }));
    for (const key of PAID_SCREENS) {
      if (!Data.hasApp(phone, key)) continue;
      const def = Store.PAID_APPS[key];
      apps.push({ app: key, label: def.label, icon: def.icon, color: def.color });
    }
    if (game.user.isGM) apps.push({ app: "admin", label: "Registry", icon: "fa-user-shield", color: "#0f4f55" });

    let bubble = null;
    if (phone.rotom) {
      const key = Data.rotomKey(this.actor.id);
      const t = Data.threadsFor(this.actor).find((x) => x.other === key);
      if (t?.unread && t.last.from === key) bubble = t.last.text || "📷 Look at this!";
    }
    const upcoming = this.#agenda(phone, Time.dayStart(Time.now()), 3);
    return { apps, dateLabel, bubble, upcoming };
  }

  #threadList() {
    const phone = this.phone;
    const list = Data.threadsFor(this.actor).map((t) => {
      const w = Data.who(t.other, { name: t.last.from === t.other ? t.last.fromName : undefined, img: t.last.from === t.other ? t.last.fromImg : undefined });
      return {
        other: t.other,
        name: w.name,
        img: w.img,
        rotom: w.rotom,
        preview: t.last.text || "📷 Photo",
        mine: t.last.from === this.actor.id,
        time: ago(t.last.ms),
        unread: t.unread
      };
    });
    // Rotom phones always have their Rotom pinned at the top.
    if (phone.rotom) {
      const key = Data.rotomKey(this.actor.id);
      if (!list.some((t) => t.other === key)) {
        list.unshift({ other: key, name: phone.rotomName || "Rotom", rotom: true, preview: "Tap to chat", time: "", unread: 0 });
      } else {
        const i = list.findIndex((t) => t.other === key);
        list.unshift(list.splice(i, 1)[0]);
      }
    }
    return list;
  }

  #threadContext(phone) {
    const me = this.actor.id;
    let lastDay = null;
    const msgs = Data.thread(this.actor, this.other, this.threadCh).map((m) => {
      const day = Time.formatShort(m.wt);
      const showDay = day !== lastDay;
      lastDay = day;
      return { ...m, mine: m.from === me, day, showDay, time: Time.timeOfDay(m.wt) };
    });
    const w = Data.who(this.other);
    return {
      other: this.other,
      otherWho: w,
      otherNumber: w.rotom ? "" : this.threadCh === "sms" ? Data.phoneNumber(this.other) : `@${Social.profile(this.other).handle}`,
      dmApp: this.threadCh !== "sms" ? Social.PLATFORMS[this.threadCh]?.name : null,
      msgs,
      draft: this._drafts[`msg-${this.other}`] ?? "",
      attachImg: this.attachImg,
      showAttach: this.showAttach,
      galleryStrip: phone.gallery.slice(0, 30)
    };
  }

  #contactsContext() {
    const contacts = Data.contactsFor(this.actor);
    const have = new Set(contacts.map((c) => c.id));
    const directory = Data.directory()
      .filter((a) => a.id !== this.actor.id && !have.has(a.id))
      .map((a) => ({ id: a.id, name: a.name, img: a.img }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { contacts, directory, myNumber: Data.phoneNumber(this.actor.id) };
  }

  #photoContext(phone, locked) {
    const p = phone.gallery.find((g) => g.id === this.photoId);
    if (!p) return { photo404: true };
    return {
      shot: { ...p, label: Time.formatLong(p.wt) },
      shareTo: SOCIAL_APPS.filter((k) => !locked(k)).map((k) => ({ key: k, name: Social.PLATFORMS[k].name, icon: Social.PLATFORMS[k].icon })),
      sendTo: Data.contactsFor(this.actor)
    };
  }

  #agenda(phone, fromStart, days) {
    const spd = Time.secondsPerDay();
    const end = fromStart + days * spd;
    const items = [
      ...phone.reminders.filter((r) => r.due >= fromStart && r.due < end).map((r) => ({ ...r, kind: "reminder" })),
      ...Data.events().filter((e) => e.due >= fromStart && e.due < end).map((e) => ({ ...e, text: e.title, kind: "event" }))
    ].sort((a, b) => a.due - b.due);
    return items.map((i) => ({ ...i, when: `${Time.dayLabel(i.due)}, ${Time.timeOfDay(i.due)}`, isEvent: i.kind === "event" }));
  }

  #calendarContext(phone, locked) {
    const grid = Time.monthView(this.calOffset);
    const spd = Time.secondsPerDay();
    const today = Time.dayStart(Time.now());
    const selected = this.calDay ?? today;
    const remindersAllowed = !locked("reminders");
    const busyDays = new Set([
      ...phone.reminders.map((r) => Time.dayStart(r.due)),
      ...Data.events().map((e) => Time.dayStart(e.due))
    ]);
    if (grid) {
      grid.cells = grid.cells.map((c) => ({ ...c, selected: c.start === selected, dot: busyDays.has(c.start) }));
    }
    const dayItems = this.#agenda(phone, selected, 1);
    return {
      grid,
      selectedLabel: Time.dayLabel(selected),
      selectedStart: selected,
      dayItems,
      remindersAllowed,
      upcoming: this.#agenda(phone, today, 14).slice(0, 8),
      spd
    };
  }

  #registryContext(record, phone) {
    const t = Time.now();
    const limit = game.settings.get(MODULE_ID, "demeritLimit");
    const points = Registry.totalPoints(record, t);
    const suspended = Registry.isSuspended(record, t);
    const badges = badgeNames().map((name, i) => ({ index: i, name, earned: !!record.badges[i] }));

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
    const firstIssued = Object.values(record.licences).map((l) => l.issued).filter((x) => x !== null).sort((a, b) => a - b)[0];
    const demerits = Registry.activeDemerits(record, t).sort((a, b) => a.issued - b.issued).map((d) => ({
      ...d, issuedLabel: Time.formatShort(d.issued), expiresLabel: Time.formatShort(d.expires), daysLeft: Time.daysUntil(d.expires)
    }));
    const segments = Array.from({ length: limit }, (_, i) => ({ filled: i < points, danger: i < points && points >= limit - 2 }));

    return {
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
        isLearnerStyle: !hasFull && hasLearner,
        heading: hasFull ? "FULL" : "LEARNER",
        licenceNo: record.licenceNo || "--------",
        issued: Time.formatLong(firstIssued),
        endorsements, points, limit, segments, suspended,
        suspendedUntil: Time.formatShort(record.suspendedUntil),
        suspendedDaysLeft: Time.daysUntil(record.suspendedUntil),
        suspendedPlural: Time.daysUntil(record.suspendedUntil) !== 1,
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
        isNpc: !this.actor.hasPlayerOwner,
        listed: phone.listed,
        rotomName: phone.rotomName,
        rotomDraft: this._drafts.rotomSay ?? "",
        apps: Object.entries(Store.PAID_APPS).map(([key, a]) => ({ key, label: a.label, on: phone.installed.includes(key) })),
        purchases: phone.purchases.slice(0, 8).map((p) => ({ label: Store.PAID_APPS[p.app]?.label ?? p.app, price: Store.fmtMoney(p.price), date: Time.formatShort(p.wt) })),
        locations: Maps.pins().map((p) => ({ id: p.id, name: p.name, selected: p.id === phone.location })),
        noLocation: !phone.location,
        handle: Social.profile(this.actor.id).handle,
        fanBases: SOCIAL_APPS.map((k) => ({ key: k, name: Social.PLATFORMS[k].name, value: Social.profile(this.actor.id).base[k] })),
        allDemerits: record.demerits.map((d) => ({
          ...d, issuedLabel: Time.formatShort(d.issued), expiresLabel: Time.formatShort(d.expires), expired: d.expires <= t
        }))
      }
    };
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** Keep half-typed text, focus and scroll when the phone re-renders. */
  async _preRender(context, options) {
    await super._preRender?.(context, options);
    const el = this.element;
    if (!el) return;
    el.querySelectorAll("[data-draft]").forEach((i) => { this._drafts[i.dataset.draft] = i.value; });
    const active = document.activeElement;
    this._focus = active && el.contains(active) && active.dataset?.draft ? active.dataset.draft : null;
    const content = el.querySelector(".ap-content");
    if (content) this._scroll = { app: content.dataset.app, top: content.scrollTop };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const html = this.element;

    // Drafts, focus, scroll.
    html.querySelectorAll("[data-draft]").forEach((i) => {
      const v = this._drafts[i.dataset.draft];
      if (v !== undefined) i.value = v;
      i.addEventListener("input", () => { this._drafts[i.dataset.draft] = i.value; });
    });
    if (this._focus) {
      const f = html.querySelector(`[data-draft="${CSS.escape(this._focus)}"]`);
      if (f) { f.focus(); f.setSelectionRange?.(f.value.length, f.value.length); }
    }
    const content = html.querySelector(".ap-content");
    if (content) {
      if (this.app === "thread") content.scrollTop = content.scrollHeight;
      else if (this._scroll?.app === this.app) content.scrollTop = this._scroll.top;
    }

    // Enter to send.
    html.querySelectorAll("[data-enter]").forEach((i) => {
      i.addEventListener("keydown", (ev) => {
        if (ev.key !== "Enter" || ev.shiftKey) return;
        ev.preventDefault();
        html.querySelector(`[data-action="${i.dataset.enter}"]${i.dataset.post ? `[data-post="${i.dataset.post}"]` : ""}`)?.click();
      });
    });

    // Pokédex: filter the list as you type, debounced so every keystroke isn't a full re-render.
    html.querySelector('[data-draft="dex-search"]')?.addEventListener("input", () => {
      clearTimeout(this._dexSearchTimer);
      this._dexSearchTimer = setTimeout(() => this.render(), 200);
    });

    // Photo send picker.
    html.querySelector("[data-photo-send]")?.addEventListener("change", (ev) => {
      if (ev.currentTarget.value) html.querySelector("[data-action=apPhotoSend]")?.removeAttribute("disabled");
    });

    // Selects and checkboxes that only change what this phone is showing.
    html.querySelectorAll("[data-state]").forEach((el) => {
      el.addEventListener("change", () => {
        this[el.dataset.state] = el.type === "checkbox" ? el.checked : el.value;
        this.render();
      });
    });

    // PokéMaps: GM clicks the map in edit mode to drop a pin.
    const map = html.querySelector(".ap-map-img");
    if (map && this.mapEdit && game.user.isGM) {
      map.addEventListener("click", async (ev) => {
        const r = map.getBoundingClientRect();
        const x = (ev.clientX - r.left) / r.width * Maps.MAP_W;
        const y = (ev.clientY - r.top) / r.height * Maps.MAP_H;
        const id = await addPinAt(x, y);
        if (id) { this.mapSel = id; this.render(); }
      });
    }

    // City maps: GM clicks the city in edit mode to drop a labelled spot.
    const city = html.querySelector(".ap-city-img");
    if (city && this.cityEdit && game.user.isGM) {
      city.addEventListener("click", async (ev) => {
        const r = city.getBoundingClientRect();
        const x = (ev.clientX - r.left) / r.width * 100;
        const y = (ev.clientY - r.top) / r.height * 100;
        const id = await addSpotAt(this.cityView, x, y);
        if (id) { this.citySpot = id; this.render(); }
      });
    }

    if (!game.user.isGM) return;
    html.querySelectorAll("[data-app-grant]").forEach((el) => el.addEventListener("change", async () => {
      const key = el.dataset.appGrant;
      const list = new Set(this.phone.installed);
      if (el.checked) list.add(key); else list.delete(key);
      await Data.setPhone(this.actor, "installed", [...list]);
    }));
    html.querySelector("[data-location]")?.addEventListener("change", async (ev) => {
      await Data.setLocation(this.actor, ev.currentTarget.value || null);
    });
    html.querySelectorAll("[data-fan-base]").forEach((el) => el.addEventListener("change", async () => {
      const n = Math.max(0, Math.floor(Number(el.value) || 0));
      await Data.ask("profile", { actorId: this.actor.id, base: { [el.dataset.fanBase]: n } });
    }));
    html.querySelector("[data-admin-handle]")?.addEventListener("change", async (ev) => {
      const res = await Data.ask("profile", { actorId: this.actor.id, handle: ev.currentTarget.value });
      if (res?.ok === false) ui.notifications.warn(res.error);
    });
    html.querySelectorAll("[data-field]").forEach((el) => el.addEventListener("change", (ev) => this.#onFieldChange(ev)));
    html.querySelectorAll("[data-badge]").forEach((el) => el.addEventListener("change", (ev) => this.#onBadgeChange(ev)));
    html.querySelectorAll("[data-licence]").forEach((el) => el.addEventListener("change", (ev) => this.#onLicenceChange(ev)));
    html.querySelectorAll("[data-phone-field]").forEach((el) => el.addEventListener("change", (ev) => this.#onPhoneField(ev)));
  }

  /** Read (and optionally clear) a text box on the phone. */
  draft(key, clear = false) {
    const el = this.element?.querySelector(`[data-draft="${CSS.escape(key)}"]`);
    const v = (el?.value ?? this._drafts[key] ?? "").trim();
    if (clear) { this._drafts[key] = ""; if (el) el.value = ""; }
    return v;
  }

  /** Show a little "working" banner while something runs. */
  async withBusy(label, fn) {
    this.busy = label;
    this.render();
    try { return await fn(); }
    finally { this.busy = null; this.render(); }
  }

  /* -------------------------------------------- */
  /*  Navigation actions                          */
  /* -------------------------------------------- */

  static #onGo(event, target) {
    const app = target.dataset.app;
    if (app === "shop") return ShopWindow.open(this.actor);
    const phone = this.phone;
    if (["camera", "store", ...SOCIAL_APPS].includes(app) && !Data.canUseApp(phone, app)) {
      return ui.notifications.info("That app needs a Rotom Phone.");
    }
    if (PAID_SCREENS.includes(app) && !Data.hasApp(phone, app)) {
      return ui.notifications.info("Get that one from the App Store first.");
    }
    const extra = {};
    if (isSocial(app)) extra.sv = null;
    if (app === "calendar") { extra.calOffset = 0; extra.calDay = null; }
    if (app === "messages") { extra.threadCh = "sms"; extra.threadBack = null; }
    this.go(app, extra);
  }

  static #onHome() { this.go("home"); }

  static #onBack() {
    if (isSocial(this.app) && socialBack.call(this)) return;
    if (this.app === "pokemaps" && this.cityView) {
      this.cityView = null;
      this.citySpot = null;
      return this.render();
    }
    if (this.app === "dex" && this.dexSel) {
      this.dexSel = null;
      return this.render();
    }
    if (this.app === "thread" && this.threadBack) {
      const platform = this.threadBack;
      this.app = platform;
      this.sv = { platform, view: "dms" };
      return this.render();
    }
    this.go(PARENT[this.app] ?? "home");
  }

  /* -------------------------------------------- */
  /*  Messages                                    */
  /* -------------------------------------------- */

  static #onOpenThread(event, target) {
    this.attachImg = null;
    this.showAttach = false;
    const ch = target.dataset.ch ?? "sms";
    this.go("thread", { other: target.dataset.other, threadCh: ch, threadBack: ch === "sms" ? null : ch });
  }

  static async #onSend() {
    const key = `msg-${this.other}`;
    const text = this.draft(key);
    if (!text && !this.attachImg) return;
    const ok = await Data.request("message", { from: this.actor.id, to: this.other, text, img: this.attachImg, ch: this.threadCh });
    if (ok === false) return;
    this.draft(key, true);
    this.attachImg = null;
    this.showAttach = false;
    this.render();
  }

  static #onAttachToggle() { this.showAttach = !this.showAttach; this.render(); }
  static #onAttachPick(event, target) { this.attachImg = target.dataset.src; this.showAttach = false; this.render(); }
  static #onAttachClear() { this.attachImg = null; this.render(); }

  static async #onAddContact(event, target) {
    const id = target.dataset.id;
    const contacts = [...new Set([...this.phone.contacts, id])];
    await Data.setPhone(this.actor, "contacts", contacts);
  }

  static async #onRemoveContact(event, target) {
    const id = target.dataset.id;
    await Data.setPhone(this.actor, "contacts", this.phone.contacts.filter((c) => c !== id));
  }

  /* -------------------------------------------- */
  /*  Camera and Gallery                          */
  /* -------------------------------------------- */

  /** Options for the Pro Camera upgrade: bigger photos and filters. */
  cameraOpts() {
    const pro = Data.hasApp(this.phone, "procamera");
    return { maxEdge: pro ? 2048 : 1280, filter: pro ? this.camFilter : "none" };
  }

  static #onCamFilter(event, target) {
    this.camFilter = target.dataset.filter;
    this.render();
  }

  async savePhoto(dataUrl) {
    if (!dataUrl) return;
    const res = await this.withBusy("Saving photo...", () => Data.savePhoto(this.actor, dataUrl));
    if (res?.queued) ui.notifications.info("Photo saved to send. It'll land in your Gallery once the network's back up.");
    else if (res && res.ok === false) ui.notifications.warn(res.error ?? "The photo didn't save.");
    this.go("gallery");
  }

  static async #onSnap() {
    let data;
    try {
      // Take the shot with the phone out of the way.
      this.element.style.visibility = "hidden";
      await new Promise((r) => requestAnimationFrame(() => r()));
      data = Data.captureScene(this.cameraOpts());
    } catch (e) {
      ui.notifications.warn(e.message);
    } finally {
      this.element.style.visibility = "";
    }
    if (data) await this.savePhoto(data);
  }

  static async #onUpload() {
    const data = await Data.pickDeviceImage(this.cameraOpts());
    if (data) await this.savePhoto(data);
  }

  static #onViewPhoto(event, target) { this.go("photo", { photoId: target.dataset.id }); }

  #currentShot() { return this.phone.gallery.find((g) => g.id === this.photoId); }

  static #onPhotoPost(event, target) {
    const p = this.#currentShot();
    const platform = target.dataset.platform ?? "pokegram";
    if (!p) return;
    for (const k of ["soc-caption", "soc-title", "soc-sound"]) this._drafts[k] = "";
    this.go(platform, { sv: { platform, view: "compose", img: p.src } });
  }

  static async #onPhotoSend() {
    const p = this.#currentShot();
    const to = this.element.querySelector("[data-photo-send]")?.value;
    if (!p || !to) return;
    const ok = await Data.request("message", { from: this.actor.id, to, text: "", img: p.src });
    if (ok !== false) this.go("thread", { other: to, threadCh: "sms", threadBack: null });
  }

  static async #onPhotoDelete() {
    const p = this.#currentShot();
    if (!p) return;
    const ok = await DialogV2.confirm({ window: { title: "Delete photo" }, content: "<p>Delete this photo from the gallery?</p>", rejectClose: false });
    if (!ok) return;
    await Data.setPhone(this.actor, "gallery", this.phone.gallery.filter((g) => g.id !== p.id));
    this.go("gallery");
  }

  static #onPhotoFull(event, target) {
    const src = target.dataset.src;
    try {
      const Popout = foundry.applications.apps?.ImagePopout ?? globalThis.ImagePopout;
      new Popout({ src, window: { title: this.actor.name } }).render({ force: true });
    } catch (e) {
      window.open(src, "_blank");
    }
  }

  /* -------------------------------------------- */
  /*  Calendar                                    */
  /* -------------------------------------------- */

  static #onCalShift(event, target) {
    const d = Number(target.dataset.delta);
    if (d === 0) { this.calOffset = 0; this.calDay = null; }
    else this.calOffset += d;
    this.render();
  }

  static #onCalDay(event, target) { this.calDay = Number(target.dataset.start); this.render(); }

  #timeInput() {
    const v = this.element.querySelector("[data-reminder-time]")?.value || "09:00";
    const [h, m] = v.split(":").map((n) => Number(n) || 0);
    return (this.calDay ?? Time.dayStart(Time.now())) + h * 3600 + m * 60;
  }

  static async #onAddReminder() {
    if (!Data.canUseApp(this.phone, "reminders")) return ui.notifications.info("Reminders need a Rotom Phone.");
    const text = this.draft("reminder");
    if (!text) return;
    const reminders = [...this.phone.reminders, { id: foundry.utils.randomID(), text, due: this.#timeInput(), done: false }]
      .sort((a, b) => a.due - b.due);
    this.draft("reminder", true);
    await Data.setPhone(this.actor, "reminders", reminders);
  }

  static async #onToggleReminder(event, target) {
    const reminders = this.phone.reminders.map((r) => (r.id === target.dataset.id ? { ...r, done: !r.done } : r));
    await Data.setPhone(this.actor, "reminders", reminders);
  }

  static async #onDeleteReminder(event, target) {
    await Data.setPhone(this.actor, "reminders", this.phone.reminders.filter((r) => r.id !== target.dataset.id));
  }

  static async #onAddEvent() {
    if (!game.user.isGM) return;
    const title = this.draft("event");
    if (!title) return;
    const list = [...Data.events(), { id: foundry.utils.randomID(), title, due: this.#timeInput() }].sort((a, b) => a.due - b.due);
    this.draft("event", true);
    await game.settings.set(MODULE_ID, "events", list);
  }

  static async #onDeleteEvent(event, target) {
    if (!game.user.isGM) return;
    await game.settings.set(MODULE_ID, "events", Data.events().filter((e) => e.id !== target.dataset.id));
  }

  /* -------------------------------------------- */
  /*  Trainer Card and Licence                    */
  /* -------------------------------------------- */

  static async #onShare() {
    const ctx = await this._prepareContext();
    if (!ctx.card) return;
    const which = this.app === "licence" ? "licence" : "card";
    let body;
    if (which === "card") {
      body = `<p><strong>Trainer ID:</strong> ${ctx.card.trainerId}<br>
        <strong>Home Town:</strong> ${esc(ctx.card.homeTown)}<br>
        <strong>Tier:</strong> ${ctx.card.tier}<br>
        <strong>Badges:</strong> ${ctx.card.badgeCount} / ${ctx.card.badgeTotal}</p>`;
    } else if (!ctx.licence.has) {
      body = `<p>No riding licence on file.</p>`;
    } else {
      const rows = ctx.licence.endorsements.map((e) => `<li><i class="fa-solid ${e.icon}"></i> ${e.label}: ${e.statusLabel}</li>`).join("");
      body = `<p><strong>Licence No:</strong> ${ctx.licence.licenceNo}</p><ul>${rows}</ul>
        <p><strong>Demerit points:</strong> ${ctx.licence.points} / ${ctx.licence.limit}${ctx.licence.suspended ? ` <strong class="ap-red">SUSPENDED until ${ctx.licence.suspendedUntil}</strong>` : ""}</p>`;
    }
    const title = which === "card" ? "Trainer Card" : "Riding Licence";
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<div class="antipodea-chat"><header><img src="${ctx.photo}" width="36" height="36"><h3>${esc(this.actor.name)} shows their ${title}</h3></header>${body}</div>`
    });
  }

  /* -------------------------------------------- */
  /*  Registry (GM)                               */
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

  async #onPhoneField(ev) {
    const el = ev.currentTarget;
    const key = el.dataset.phoneField;
    const value = el.type === "checkbox" ? el.checked : el.value.trim();
    await Data.setPhone(this.actor, key, value);
  }

  static async #onRotomSay() {
    const text = this.draft("rotomSay");
    if (!text) return;
    const ok = await Data.request("message", { from: Data.rotomKey(this.actor.id), to: this.actor.id, text });
    if (ok !== false) this.draft("rotomSay", true);
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
        <div class="form-group"><label>Town or city</label><input type="text" name="town" value="${esc(lastTown)}" placeholder="Bunya City"></div>
        <div class="form-group"><label>Issuing officer</label><input type="text" name="officer" value="${esc(lastOfficer)}" placeholder="Chief Dulcie"></div>
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
      ok: { label: "Issue notice", icon: "fa-solid fa-gavel", callback: (event, button) => new FormDataExt(button.form).object },
      rejectClose: false
    });
    if (!data) return;
    await game.settings.set(MODULE_ID, "lastTown", data.town ?? "");
    await game.settings.set(MODULE_ID, "lastOfficer", data.officer ?? "");
    const result = await Registry.issueOffence(this.actor, data);
    if (result?.message) ui.notifications.info(result.message);
  }

  static async #onCommunityService() { await Registry.communityService(this.actor, 1); }

  static async #onRemoveDemerit(event, target) {
    const ok = await DialogV2.confirm({
      window: { title: "Remove demerit" },
      content: "<p>Remove this demerit from the record? A Registry update posts to Discord.</p>",
      rejectClose: false
    });
    if (ok) await Registry.removeDemerit(this.actor, target.dataset.id);
  }

  static async #onClearSuspension() { await Registry.clearSuspension(this.actor); }

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

  static async #onResetUnlicensed() { await Registry.updateRecord(this.actor, (r) => { r.unlicensedFines = 0; }); }

  static async #onNewIds() {
    await Registry.updateRecord(this.actor, (r) => {
      r.trainerId = "";
      r.licenceNo = "";
      Registry.ensureIds(r);
    });
  }
}
