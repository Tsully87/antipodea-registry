import { MODULE_ID } from "./constants.js";
import * as Shop from "./shop.js";
import * as Store from "./store.js";
import * as Maps from "./maps.js";
import { getPhone } from "./phone-data.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const ROOT = `modules/${MODULE_ID}/templates`;
const isTrainer = (a) => a && a.type !== "pokemon";

/* -------------------------------------------- */
/*  Player shop window                          */
/* -------------------------------------------- */

export class ShopWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  static current = null;

  constructor(actor, options = {}) {
    super({ id: "antipodea-shop" });
    this.actorId = actor?.id ?? null;
    this.shopId = options.shopId ?? null;
    this.mode = "buy";
    this.cart = new Map();
    this.selling = new Map();
    this.message = null;
  }

  static DEFAULT_OPTIONS = {
    classes: ["antipodea-shop"],
    tag: "div",
    window: { title: "Poké Mart", icon: "fa-solid fa-store", resizable: true },
    position: { width: 560, height: 680 },
    actions: {
      shMode: ShopWindow.#onMode,
      shShop: ShopWindow.#onShop,
      shStep: ShopWindow.#onStep,
      shClear: ShopWindow.#onClear,
      shCheckout: ShopWindow.#onCheckout,
      shManage: () => ShopManager.open()
    }
  };

  static PARTS = { body: { template: `${ROOT}/shop.hbs`, scrollable: [".sh-shelves"] } };

  /** Open for a trainer (or the player's best guess). */
  static open(actor, options = {}) {
    if (ShopWindow.current?.rendered) {
      if (actor) ShopWindow.current.setActor(actor);
      if (options.shopId) ShopWindow.current.shopId = options.shopId;
      ShopWindow.current.render({ force: true });
      ShopWindow.current.bringToFront?.();
      return ShopWindow.current;
    }
    ShopWindow.current = new ShopWindow(actor, options);
    ShopWindow.current.render({ force: true });
    return ShopWindow.current;
  }

  static refresh() {
    if (ShopWindow.current?.rendered) ShopWindow.current.render();
  }

  setActor(actor) {
    if (actor?.id === this.actorId) return;
    this.actorId = actor?.id ?? null;
    this.cart.clear();
    this.selling.clear();
    this.shopId = null;
  }

  get actor() {
    return game.actors.get(this.actorId) ?? null;
  }

  trainers() {
    return game.actors.filter((a) => isTrainer(a) && a.isOwner && (game.user.isGM || a.hasPlayerOwner))
      .sort((a, b) => (b.hasPlayerOwner - a.hasPlayerOwner) || a.name.localeCompare(b.name));
  }

  async _prepareContext() {
    const isGM = game.user.isGM;
    const trainers = this.trainers();
    if (!this.actor && trainers.length) this.actorId = trainers[0].id;
    const actor = this.actor;
    const location = actor ? getPhone(actor).location : null;
    const here = isGM ? Shop.shops() : Shop.shopsAt(location);
    if (!here.find((s) => s.id === this.shopId)) {
      this.shopId = (here.find((s) => s.pin === location) ?? here[0])?.id ?? null;
      this.cart.clear();
      this.selling.clear();
    }
    const shop = Shop.shopById(this.shopId);
    const fmt = Store.fmtMoney;

    let groups = [], total = 0, count = 0, sellRows = [];
    if (shop && actor) {
      groups = Shop.catalogue(shop).map((g) => ({
        section: g.section,
        items: g.items.map((i) => {
          const qty = this.cart.get(i.id) ?? 0;
          if (this.mode === "buy") { total += qty * i.price; count += qty; }
          return { ...i, priceLabel: fmt(i.price), qty, owned: ownedQty(actor, i.name) };
        })
      }));
      sellRows = Shop.sellable(actor, shop).map((i) => {
        const qty = Math.min(this.selling.get(i.id) ?? 0, i.qty);
        if (this.mode === "sell") { total += qty * i.price; count += qty; }
        return { ...i, priceLabel: fmt(i.price), sellQty: qty };
      });
      // Drop anything from the basket that's no longer sold
      const live = new Set(groups.flatMap((g) => g.items.map((i) => i.id)));
      for (const id of [...this.cart.keys()]) if (!live.has(id)) this.cart.delete(id);
    }
    const balance = actor ? Store.money(actor) : 0;
    const after = this.mode === "buy" ? balance - total : balance + total;
    const msg = this.message;
    this.message = null;
    return {
      isGM,
      trainers: trainers.map((a) => ({ id: a.id, name: a.name, selected: a.id === this.actorId })),
      many: trainers.length > 1,
      actor: actor ? { name: actor.name, img: actor.img } : null,
      place: location ? Shop.pinName(location) : "Nowhere yet",
      noLocation: !location,
      shops: here.map((s) => ({ id: s.id, name: s.name, place: Shop.pinName(s.pin), active: s.id === this.shopId })),
      shop: shop ? { ...shop, place: Shop.pinName(shop.pin), rate: Number(shop.sellRate ?? 50) } : null,
      buying: this.mode === "buy",
      groups,
      sellRows,
      count,
      total: fmt(total),
      balance: fmt(balance),
      after: fmt(after),
      short: this.mode === "buy" && after < 0,
      message: msg
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this.element.querySelector('select[name="trainer"]')?.addEventListener("change", (ev) => {
      this.setActor(game.actors.get(ev.target.value));
      this.render();
    });
  }

  static #onMode(event, target) {
    this.mode = target.dataset.mode === "sell" ? "sell" : "buy";
    this.render();
  }

  static #onShop(event, target) {
    if (target.dataset.shop === this.shopId) return;
    this.shopId = target.dataset.shop;
    this.cart.clear();
    this.selling.clear();
    this.render();
  }

  static #onStep(event, target) {
    const id = target.dataset.item;
    const d = Number(target.dataset.d) || 0;
    if (this.mode === "buy") {
      const n = Math.max(0, Math.min(99, (this.cart.get(id) ?? 0) + d));
      if (n) this.cart.set(id, n); else this.cart.delete(id);
    } else {
      const max = Number(target.dataset.max) || 0;
      const n = Math.max(0, Math.min(max, (this.selling.get(id) ?? 0) + d));
      if (n) this.selling.set(id, n); else this.selling.delete(id);
    }
    this.render();
  }

  static #onClear() {
    if (this.mode === "buy") this.cart.clear(); else this.selling.clear();
    this.render();
  }

  static async #onCheckout() {
    const actor = this.actor;
    if (!actor || !this.shopId) return;
    const list = [...(this.mode === "buy" ? this.cart : this.selling)].map(([itemId, qty]) => ({ itemId, qty }));
    if (!list.length) return;
    const res = this.mode === "buy" ? await Shop.buy(actor, this.shopId, list) : await Shop.sell(actor, this.shopId, list);
    if (!res.ok) {
      ui.notifications.warn(res.error);
      this.message = { error: true, text: res.error };
      return this.render();
    }
    if (this.mode === "buy") this.cart.clear(); else this.selling.clear();
    const verb = this.mode === "buy" ? "Bought" : "Sold";
    this.message = { text: `${verb} ${res.summary} for ${Store.fmtMoney(res.total)}.` };
    ui.notifications.info(`${actor.name}: ${verb.toLowerCase()} ${res.summary} for ${Store.fmtMoney(res.total)}.`);
    this.render();
  }

  async close(options) {
    if (ShopWindow.current === this) ShopWindow.current = null;
    return super.close(options);
  }
}

function ownedQty(actor, name) {
  const it = actor.items.find((i) => i.name === name && ["item", "pokeball"].includes(i.type));
  return it ? Number(it.system?.quantity) || 0 : 0;
}

/* -------------------------------------------- */
/*  GM Shop Manager                             */
/* -------------------------------------------- */

export class ShopManager extends HandlebarsApplicationMixin(ApplicationV2) {
  static current = null;

  constructor() {
    super({ id: "antipodea-shop-manager" });
    ShopManager.current = this;
    this.shopId = Shop.shops()[0]?.id ?? null;
    this.draft = null;
    this.busy = false;
  }

  static DEFAULT_OPTIONS = {
    classes: ["antipodea-shop", "antipodea-shop-manager"],
    tag: "form",
    window: { title: "Shop Manager", icon: "fa-solid fa-store", resizable: true },
    position: { width: 820, height: 720 },
    form: { handler: ShopManager.#onSubmit, submitOnChange: false, closeOnSubmit: false },
    actions: {
      smPick: ShopManager.#onPick,
      smNew: ShopManager.#onNew,
      smDelete: ShopManager.#onDelete,
      smPublish: ShopManager.#onPublish,
      smPublishAll: ShopManager.#onPublishAll,
      smAll: ShopManager.#onAll
    }
  };

  static PARTS = { body: { template: `${ROOT}/shop-manager.hbs`, scrollable: [".sm-items", ".sm-list"] } };

  static open() {
    if (!game.user.isGM) return ui.notifications.warn("Only the GM can manage shops.");
    if (ShopManager.current?.rendered) { ShopManager.current.bringToFront?.(); return ShopManager.current; }
    ShopManager.current = new ShopManager();
    ShopManager.current.render({ force: true });
    return ShopManager.current;
  }

  static refresh() {
    if (ShopManager.current?.rendered && !ShopManager.current.draft) ShopManager.current.render();
  }

  get shop() {
    return this.draft ?? Shop.shopById(this.shopId);
  }

  async _prepareContext() {
    const shop = this.shop;
    const all = Shop.shops();
    const sections = Shop.sections();
    const stock = Shop.stockList();
    const pins = Maps.pins().slice().sort((a, b) => a.name.localeCompare(b.name));
    const ctx = {
      shops: all.map((s) => ({ id: s.id, name: s.name, place: Shop.pinName(s.pin), active: s.id === shop?.id, posted: !!s.discord?.msg })),
      shop: null,
      discordReady: Shop.discordReady(),
      busy: this.busy,
      receipts: Shop.recentReceipts(15).map((r) => ({
        ...r,
        verb: r.kind === "buy" ? "bought" : "sold",
        what: r.lines.map((l) => `${l.qty} x ${l.name}`).join(", "),
        total: Store.fmtMoney(r.total)
      })),
      folder: game.settings.get(MODULE_ID, "martFolder") || "Poké Mart",
      empty: !stock.length
    };
    if (!shop) return ctx;
    const on = new Set(shop.sections ?? []);
    ctx.shop = {
      ...shop,
      isNew: !Shop.shopById(shop.id),
      pins: pins.map((p) => ({ id: p.id, name: p.name, selected: p.id === shop.pin })),
      sections: sections.map((name) => ({
        name,
        on: on.has(name),
        items: stock.filter((i) => i.section === name).map((i) => ({
          ...i,
          inStock: !shop.off?.[i.id],
          setPrice: shop.prices?.[i.id] ?? "",
          price: Store.fmtMoney(Shop.priceIn(shop, i))
        }))
      }))
    };
    return ctx;
  }

  /** Read the form into a shop object. */
  #readForm() {
    const shop = foundry.utils.deepClone(this.shop);
    if (!shop) return null;
    const f = this.element;
    const val = (n) => f.querySelector(`[name="${n}"]`)?.value ?? "";
    shop.name = val("name").trim() || "Shop";
    shop.pin = val("pin") || shop.pin;
    shop.keeper = val("keeper").trim();
    shop.blurb = val("blurb").trim();
    shop.markup = Number(val("markup")) || 0;
    shop.sellRate = Math.max(0, Math.min(100, Number(val("sellRate")) || 0));
    shop.sections = [...f.querySelectorAll('input[name="section"]:checked')].map((i) => i.value);
    shop.off = {};
    for (const box of f.querySelectorAll('input[name="stock"]')) if (!box.checked) shop.off[box.value] = true;
    shop.prices = {};
    for (const inp of f.querySelectorAll('input[name="price"]')) {
      const n = Number(inp.value);
      if (inp.value !== "" && n > 0) shop.prices[inp.dataset.item] = Math.round(n);
    }
    return shop;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    // Keep unsaved edits when a section is ticked on or off (it shows or hides its items).
    for (const box of this.element.querySelectorAll('input[name="section"]')) {
      box.addEventListener("change", () => { this.draft = this.#readForm(); this.render(); });
    }
  }

  static async #onSubmit() {
    const shop = this.#readForm();
    if (!shop) return;
    await Shop.saveShop(shop);
    this.draft = null;
    this.shopId = shop.id;
    ui.notifications.info(`Saved ${shop.name}.`);
    if (shop.discord?.msg && Shop.discordReady()) {
      const r = await Shop.publishCatalogue(shop.id);
      if (!r.ok) ui.notifications.warn(`Saved, but the Discord post didn't update: ${r.error}`);
    }
    this.render();
  }

  static #onPick(event, target) {
    this.draft = null;
    this.shopId = target.dataset.shop;
    this.render();
  }

  static #onNew() {
    this.draft = Shop.blankShop(Shop.shopById(this.shopId)?.pin ?? "bunya-city");
    this.shopId = this.draft.id;
    this.render();
  }

  static async #onDelete() {
    const shop = this.shop;
    if (!shop) return;
    if (!Shop.shopById(shop.id)) { this.draft = null; this.shopId = Shop.shops()[0]?.id ?? null; return this.render(); }
    const ok = await DialogV2.confirm({
      window: { title: "Delete shop" },
      content: `<p>Delete <strong>${foundry.utils.escapeHTML(shop.name)}</strong>? Players won't be able to shop there. Its Discord post stays up until you remove it.</p>`
    });
    if (!ok) return;
    await Shop.saveShop(shop, { remove: true });
    this.draft = null;
    this.shopId = Shop.shops()[0]?.id ?? null;
    this.render();
  }

  static async #onPublish() {
    const shop = this.#readForm();
    if (!shop) return;
    await Shop.saveShop(shop);
    this.draft = null;
    this.shopId = shop.id;
    this.busy = true; this.render();
    const r = await Shop.publishCatalogue(shop.id);
    this.busy = false;
    if (r.ok) ui.notifications.info(r.created ? `Posted ${shop.name} to #poke-mart.` : `Updated ${shop.name} on #poke-mart.`);
    else ui.notifications.warn(r.error);
    this.render();
  }

  static async #onPublishAll() {
    this.busy = true; this.render();
    const res = await Shop.publishAll();
    this.busy = false;
    const bad = res.filter((r) => !r.ok);
    if (bad.length) ui.notifications.warn(`${bad.length} shop post(s) failed: ${bad[0].error}`);
    else ui.notifications.info(`Updated ${res.length} shop post(s) on #poke-mart.`);
    this.render();
  }

  /** Tick or untick every item in a section. */
  static #onAll(event, target) {
    const sec = target.dataset.section;
    const boxes = [...this.element.querySelectorAll(`input[name="stock"][data-section="${CSS.escape(sec)}"]`)];
    const turnOn = boxes.some((b) => !b.checked);
    for (const b of boxes) b.checked = turnOn;
  }

  async close(options) {
    if (ShopManager.current === this) ShopManager.current = null;
    return super.close(options);
  }
}
