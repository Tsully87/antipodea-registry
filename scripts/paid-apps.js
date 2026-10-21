import { MODULE_ID } from "./constants.js";
import * as Data from "./phone-data.js";
import * as Store from "./store.js";
import * as Maps from "./maps.js";
import * as Time from "./time.js";

/**
 * The App Store and the paid apps. These run as methods on the phone window
 * (`this` is the RegistryPhone).
 */

export const PAID_KEYS = Object.keys(Store.PAID_APPS);
/** Paid apps that get their own icon (Pro Camera upgrades the Camera instead). */
export const PAID_SCREENS = ["translator", "weather", "pokemaps", "pokepay", "mart"];

const S = (key) => game.settings.get(MODULE_ID, key);
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/* -------------------------------------------- */
/*  Contexts                                    */
/* -------------------------------------------- */

export function storeContext(phone) {
  return {
    balance: Store.fmtMoney(Store.money(this.actor)),
    storeApps: PAID_KEYS.map((key) => ({
      key, ...Store.PAID_APPS[key],
      price: Store.fmtMoney(Store.price(key)),
      installed: phone.installed.includes(key)
    }))
  };
}

export function translatorContext() {
  const langs = String(S("translatorLanguages") ?? "").split(/[\r\n,]+/).map((s) => s.trim()).filter(Boolean);
  return {
    languages: langs.map((l) => ({ name: l, selected: l === this.lang })),
    translateDraft: this._drafts.translate ?? ""
  };
}

function myPin(phone) {
  return phone.location ? Maps.pinById(phone.location) : null;
}

export function weatherContext(phone) {
  const here = myPin(phone);
  const zone = this.weatherZone ?? here?.zone ?? "Bunya Coast";
  return {
    hereName: here?.name ?? null,
    zones: Maps.ZONES.map((z) => ({ name: z, selected: z === zone })),
    zone,
    forecast: this.forecast?.zone === zone ? this.forecast : null
  };
}

/** One city's map with its labelled spots. */
function cityContext(phone) {
  const pin = Maps.pinById(this.cityView);
  const unlocked = Maps.cityUnlocked(phone, pin);
  const zoom = this.cityZoom ?? 1;
  const spots = (pin?.spots ?? []).map((s) => {
    const t = Maps.SPOT_TYPES[s.type] ?? Maps.SPOT_TYPES.other;
    return { ...s, icon: t.icon, color: t.color, typeLabel: t.label, left: (+s.x).toFixed(2), top: (+s.y).toFixed(2), selected: s.id === this.citySpot };
  });
  const spot = spots.find((s) => s.selected) ?? null;
  const here = phone.location === pin?.id;
  return {
    city: {
      pin, unlocked, here,
      image: pin?.cityMap ?? "",
      zoom, canZoomOut: zoom > 1, width: 352 * zoom,
      spots, spot,
      edit: !!this.cityEdit && game.user.isGM,
      legend: Object.entries(Maps.SPOT_TYPES)
        .filter(([k]) => spots.some((s) => s.type === k))
        .map(([k, t]) => ({ key: k, ...t }))
    }
  };
}

export function mapsContext(phone) {
  if (this.cityView) return cityContext.call(this, phone);
  const all = Maps.pins();
  const here = myPin(phone);
  const sel = all.find((p) => p.id === this.mapSel) ?? null;
  const sp = Maps.speeds(this.actor);
  const mode = this.mapMode ?? "land";
  const speed = Number(this.mapSpeed) || sp[mode] || 0;
  let route = null;
  if (here && sel && here.id !== sel.id) {
    const t = Maps.travel(Maps.distanceKm(here, sel), speed, !!this.mapSlow);
    route = {
      km: Math.round(t.km).toLocaleString("en-AU"),
      hours: t.hours < 100 ? t.hours.toFixed(1) : Math.round(t.hours).toLocaleString("en-AU"),
      days: t.days.toFixed(1),
      kph: +t.kph.toFixed(1),
      noSpeed: !speed
    };
  }
  const zoom = this.mapZoom ?? 1;
  const q = (this._drafts["map-search"] ?? "").toLowerCase();
  return {
    mapImage: S("mapImage") || "",
    zoom,
    canZoomOut: zoom > 1,
    mapWidth: 352 * zoom,
    pins: all.map((p) => ({
      ...p,
      left: (p.x / Maps.MAP_W * 100).toFixed(2),
      top: (p.y / Maps.MAP_H * 100).toFixed(2),
      color: Maps.KINDS[p.kind]?.color ?? "#fff",
      here: here?.id === p.id,
      selected: sel?.id === p.id
    })),
    here,
    sel: sel ? {
      ...sel,
      kindLabel: Maps.KINDS[sel.kind]?.label ?? "",
      hasCity: !!sel.cityMap,
      cityOpen: !!sel.cityMap && Maps.cityUnlocked(phone, sel),
      cityLocked: !!sel.cityMap && !Maps.cityUnlocked(phone, sel)
    } : null,
    route,
    modes: [
      { key: "land", label: `On foot (Overland ${sp.land})`, selected: mode === "land" },
      { key: "water", label: `Swimming (Swim ${sp.water})`, selected: mode === "water" },
      { key: "sky", label: `Flying (Sky ${sp.sky})`, selected: mode === "sky" }
    ],
    mapSpeed: this.mapSpeed ?? "",
    mapSlow: !!this.mapSlow,
    mapEdit: !!this.mapEdit && game.user.isGM,
    placeList: all.filter((p) => !q || p.name.toLowerCase().includes(q)).map((p) => ({ id: p.id, name: p.name, here: here?.id === p.id })),
    mapSearch: this._drafts["map-search"] ?? "",
    zoneOptions: Maps.ZONES,
    kindOptions: Object.entries(Maps.KINDS).map(([k, v]) => ({ key: k, label: v.label }))
  };
}

export function payContext(phone) {
  const name = (id) => (id === "mart" ? "Mart Express" : game.actors.get(id)?.name ?? "Someone");
  return {
    balance: Store.fmtMoney(Store.money(this.actor)),
    ledger: phone.ledger.map((l) => ({
      ...l,
      name: name(l.other),
      amountLabel: `${l.amount < 0 ? "-" : "+"}${Store.fmtMoney(Math.abs(l.amount))}`,
      incoming: l.amount > 0,
      date: Time.formatShort(l.wt)
    })),
    payees: Data.contactsFor(this.actor),
    payAmount: this._drafts["pay-amount"] ?? "",
    payNote: this._drafts["pay-note"] ?? ""
  };
}

export function martContext(phone) {
  const markup = Number(S("martMarkup")) || 0;
  const days = Number(S("martDeliveryDays")) || 1;
  let lastSection = null;
  const catalog = Store.martCatalog().map((i) => {
    const head = i.section !== lastSection ? (i.section || "Stock") : null;
    lastSection = i.section;
    return { ...i, head, priceLabel: Store.fmtMoney(i.price) };
  });
  return {
    balance: Store.fmtMoney(Store.money(this.actor)),
    catalog,
    martFolder: S("martFolder") || "Poké Mart",
    markup,
    deliveryDays: days,
    deliveryLabel: `${days} day${days === 1 ? "" : "s"}`,
    orders: phone.orders.slice(0, 15).map((o) => ({
      ...o,
      total: Store.fmtMoney(o.total),
      status: o.delivered === true ? "Delivered" : o.delivered === "failed" ? "Lost in transit (tell the GM)" : `Arriving ${Time.dayLabel(o.due)}`,
      done: o.delivered === true
    }))
  };
}

/* -------------------------------------------- */
/*  Actions                                     */
/* -------------------------------------------- */

export const paidActions = {
  async apBuyApp(event, target) {
    const key = target.dataset.app;
    const app = Store.PAID_APPS[key];
    const phone = this.phone;
    if (!app || phone.installed.includes(key)) return;
    if (!phone.rotom) return ui.notifications.info("The App Store needs a Rotom Phone.");
    const cost = Store.price(key);
    const have = Store.money(this.actor);
    if (have < cost) return ui.notifications.warn(`Not enough money. ${app.label} costs ${Store.fmtMoney(cost)} and you have ${Store.fmtMoney(have)}.`);
    const { DialogV2 } = foundry.applications.api;
    const ok = await DialogV2.confirm({
      window: { title: `Buy ${app.label}?`, icon: `fa-solid ${app.icon}` },
      content: `<p><strong>${esc(app.label)}</strong> for <strong>${Store.fmtMoney(cost)}</strong>.</p><p>You'll have ${Store.fmtMoney(have - cost)} left.</p>`,
      rejectClose: false
    });
    if (!ok) return;
    await this.actor.update({
      "system.money": have - cost,
      [`flags.${MODULE_ID}.phone.installed`]: [...phone.installed, key],
      [`flags.${MODULE_ID}.phone.purchases`]: [{ app: key, price: cost, wt: Time.now(), ms: Date.now() }, ...phone.purchases]
    });
    ui.notifications.info(`${app.label} installed. ${Store.fmtMoney(cost)} paid.`);
  },

  async apTranslate() {
    const text = this.draft("translate");
    const lang = this.element.querySelector("[data-lang]")?.value;
    if (!text || !lang) return;
    this.lang = lang;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<div class="antipodea-translate"><span><i class="fa-solid fa-language"></i> Rotom translates into ${esc(lang)}</span><p>${esc(text)}</p></div>`
    });
    this.draft("translate", true);
  },

  async apForecast() {
    const zone = this.element.querySelector("[data-zone]")?.value ?? "Bunya Coast";
    this.weatherZone = zone;
    // The GM's browser saves a week of forecasts, so this works with nobody else online.
    let days = Data.cachedForecast(zone);
    if (!days) {
      const res = await this.withBusy("Checking the radar...", () => Data.ask("forecast", { zone }));
      if (!res?.ok) return ui.notifications.warn(res?.error ?? "No forecast available. Try again when the GM's online.");
      days = res.days;
    }
    this.forecast = { zone, days: days.map((html, i) => ({ label: i === 0 ? "Today" : "Tomorrow", html })) };
    this.render();
  },

  apMapPin(event, target) {
    this.mapSel = target.dataset.id;
    this.render();
  },

  apMapZoom(event, target) {
    this.mapZoom = Math.max(1, Math.min(4, (this.mapZoom ?? 1) + Number(target.dataset.delta)));
    this.render();
  },

  apMapEdit() {
    this.mapEdit = !this.mapEdit;
    this.render();
  },

  async apMapSetHere() {
    if (!game.user.isGM || !this.mapSel) return;
    await Data.setLocation(this.actor, this.mapSel);
  },

  /* ---------- City maps ---------- */

  apCityOpen(event, target) {
    const id = target.dataset.id ?? this.mapSel;
    const pin = Maps.pinById(id);
    if (!pin?.cityMap && !game.user.isGM) return;
    if (!Maps.cityUnlocked(this.phone, pin)) return ui.notifications.info(`Visit ${pin.name} to unlock its map.`);
    this.cityView = id;
    this.citySpot = null;
    this.cityZoom = 1;
    this.cityEdit = false;
    this._scroll = null;
    this.render();
  },

  apCitySpot(event, target) {
    this.citySpot = this.citySpot === target.dataset.id ? null : target.dataset.id;
    this.render();
  },

  apCityZoom(event, target) {
    this.cityZoom = Math.max(1, Math.min(4, (this.cityZoom ?? 1) + Number(target.dataset.delta)));
    this.render();
  },

  apCityEdit() {
    this.cityEdit = !this.cityEdit;
    this.render();
  },

  apCityImage() {
    if (!game.user.isGM) return;
    const id = this.cityView ?? this.mapSel;
    const pin = Maps.pinById(id);
    if (!pin) return;
    const FP = foundry.applications.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
    new FP({
      type: "image",
      current: pin.cityMap ?? "",
      callback: async (path) => {
        await Maps.savePin(id, (p) => { p.cityMap = path; p.spots ??= []; });
        this.cityView = id;
        this.render();
      }
    }).render(true);
  },

  async apCityDeleteSpot() {
    if (!game.user.isGM || !this.cityView || !this.citySpot) return;
    const spotId = this.citySpot;
    this.citySpot = null;
    await Maps.savePin(this.cityView, (p) => { p.spots = (p.spots ?? []).filter((s) => s.id !== spotId); });
  },

  async apMapDeletePin() {
    if (!game.user.isGM || !this.mapSel) return;
    const list = Maps.pins().filter((p) => p.id !== this.mapSel);
    this.mapSel = null;
    await game.settings.set(MODULE_ID, "mapPins", list);
  },

  async apPay() {
    const to = this.element.querySelector("[data-pay-to]")?.value;
    const amount = Number(this.draft("pay-amount"));
    const note = this.draft("pay-note");
    if (!to || !amount) return ui.notifications.warn("Pick who to pay and how much.");
    const name = game.actors.get(to)?.name ?? "them";
    const { DialogV2 } = foundry.applications.api;
    const ok = await DialogV2.confirm({ window: { title: "Send money?" }, content: `<p>Send <strong>${Store.fmtMoney(amount)}</strong> to <strong>${esc(name)}</strong>?</p>`, rejectClose: false });
    if (!ok) return;
    const res = await this.withBusy("Sending...", () => Data.ask("pay", { from: this.actor.id, to, amount, note }));
    if (!res?.ok) return ui.notifications.warn(res?.error ?? "Payment failed.");
    if (res.queued) {
      this.draft("pay-amount", true);
      this.draft("pay-note", true);
      return ui.notifications.info(`Payment to ${name} is queued. It goes through when the GM's next online.`);
    }
    this.draft("pay-amount", true);
    this.draft("pay-note", true);
    ui.notifications.info(`Sent ${Store.fmtMoney(amount)} to ${name}.`);
  },

  async apOrder(event, target) {
    const id = target.dataset.item;
    const qty = Number(this.element.querySelector(`[data-qty="${id}"]`)?.value) || 1;
    const item = Store.martCatalog().find((i) => i.id === id);
    if (!item) return;
    const { DialogV2 } = foundry.applications.api;
    const ok = await DialogV2.confirm({
      window: { title: "Place order?" },
      content: `<p>${qty} x <strong>${esc(item.name)}</strong> for <strong>${Store.fmtMoney(item.price * qty)}</strong>, delivered in ${Number(S("martDeliveryDays")) || 1} day(s).</p>`,
      rejectClose: false
    });
    if (!ok) return;
    const res = await this.withBusy("Placing order...", () => Data.ask("order", { actorId: this.actor.id, itemId: id, qty }));
    if (!res?.ok) return ui.notifications.warn(res?.error ?? "Order failed.");
    if (res.queued) return ui.notifications.info(`Order for ${qty} x ${item.name} is queued. It's placed (and paid) when the GM's next online.`);
    ui.notifications.info(`Ordered ${qty} x ${item.name}. Arriving ${Time.dayLabel(res.due)}.`);
  }
};

/** GM map editing: click the map in edit mode to drop a new pin. */
export async function addPinAt(x, y) {
  const { DialogV2 } = foundry.applications.api;
  const kinds = Object.entries(Maps.KINDS).map(([k, v]) => `<option value="${k}" ${k === "town" ? "selected" : ""}>${v.label}</option>`).join("");
  const zones = Maps.ZONES.map((z) => `<option>${z}</option>`).join("");
  const data = await DialogV2.prompt({
    window: { title: "New map pin", icon: "fa-solid fa-location-dot" },
    content: `<div class="form-group"><label>Name</label><input type="text" name="name" autofocus></div>
      <div class="form-group"><label>Type</label><select name="kind">${kinds}</select></div>
      <div class="form-group"><label>Weather zone</label><select name="zone">${zones}</select></div>`,
    ok: { label: "Add pin", callback: (ev, button) => ({ name: button.form.elements.name.value.trim(), kind: button.form.elements.kind.value, zone: button.form.elements.zone.value }) },
    rejectClose: false
  });
  if (!data?.name) return null;
  const id = `${data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${foundry.utils.randomID(4)}`;
  await game.settings.set(MODULE_ID, "mapPins", [...Maps.pins(), { id, name: data.name, x: Math.round(x), y: Math.round(y), kind: data.kind, zone: data.zone }]);
  return id;
}

/** GM city editing: click the city map in edit mode to add a labelled spot. x and y are percentages. */
export async function addSpotAt(pinId, x, y) {
  const { DialogV2 } = foundry.applications.api;
  const types = Object.entries(Maps.SPOT_TYPES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("");
  const data = await DialogV2.prompt({
    window: { title: "New spot", icon: "fa-solid fa-location-dot" },
    content: `<div class="form-group"><label>Name</label><input type="text" name="name" autofocus placeholder="The Gully"></div>
      <div class="form-group"><label>Type</label><select name="type">${types}</select></div>
      <div class="form-group"><label>Note</label><input type="text" name="note" placeholder="What players see when they tap it"></div>`,
    ok: { label: "Add spot", callback: (ev, button) => ({ name: button.form.elements.name.value.trim(), type: button.form.elements.type.value, note: button.form.elements.note.value.trim() }) },
    rejectClose: false
  });
  if (!data?.name) return null;
  const id = foundry.utils.randomID();
  await Maps.savePin(pinId, (p) => {
    p.spots ??= [];
    p.spots.push({ id, name: data.name, type: data.type, note: data.note, x: +x.toFixed(2), y: +y.toFixed(2) });
  });
  return id;
}
