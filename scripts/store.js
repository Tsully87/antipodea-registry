import { MODULE_ID } from "./constants.js";

/** The App Store catalogue and Poké Mart helpers. */

export const PAID_APPS = {
  translator: {
    label: "Translator", icon: "fa-language", color: "#1971c2", price: 1500,
    blurb: "Basic translation between human languages. Speak through your phone and it comes out in theirs."
  },
  weather: {
    label: "Weather", icon: "fa-cloud-sun-rain", color: "#1c7ed6", price: 500,
    blurb: "Today's weather and an accurate forecast for tomorrow, wherever you are."
  },
  procamera: {
    label: "Pro Camera", icon: "fa-camera-retro", color: "#343a40", price: 1000,
    blurb: "Rotom films from up to 15 metres away, sharper photos and filters. +1 to Contest Introduction rolls when used for promo content."
  },
  pokemaps: {
    label: "PokéMaps", icon: "fa-map-location-dot", color: "#2f9e44", price: 750,
    blurb: "The Antipodea map with your location, every town, and how long it takes to get there."
  },
  pokepay: {
    label: "PokéPay", icon: "fa-wallet", color: "#f59f00", price: 250,
    blurb: "Check your balance and send money to other trainers."
  },
  mart: {
    label: "Mart Express", icon: "fa-truck-fast", color: "#0c8599", price: 500,
    blurb: "Order Poké Mart stock from anywhere. Delivered to you, for a delivery markup."
  }
};

/** Prices with the GM's overrides from settings ("translator=1500, weather=500"). */
export function price(key) {
  const raw = String(game.settings.get(MODULE_ID, "appPrices") ?? "");
  for (const part of raw.split(/[\r\n,]+/)) {
    const [k, v] = part.split("=").map((s) => s?.trim());
    if (k === key && v !== undefined && !Number.isNaN(Number(v))) return Number(v);
  }
  return PAID_APPS[key]?.price ?? 0;
}

export function money(actor) {
  return Number(actor?.system?.money ?? 0) || 0;
}

export const fmtMoney = (n) => `$${Math.round(Number(n) || 0).toLocaleString("en-AU")}`;

/* -------------------------------------------- */
/*  Poké Mart                                   */
/* -------------------------------------------- */

function inFolder(doc, name) {
  let f = doc.folder;
  while (f) {
    if (f.name === name) return true;
    f = f.folder;
  }
  return false;
}

/** Items in the Mart folder (and its subfolders), with the delivery markup added. */
export function martCatalog() {
  const folder = game.settings.get(MODULE_ID, "martFolder") || "Poké Mart";
  const markup = Number(game.settings.get(MODULE_ID, "martMarkup")) || 0;
  return game.items
    .filter((i) => inFolder(i, folder))
    .map((i) => {
      const cost = Number(i.system?.cost) || 0;
      return {
        id: i.id, name: i.name, img: i.img, cost,
        price: Math.round(cost * (1 + markup / 100)),
        section: i.folder?.name !== folder ? i.folder?.name : ""
      };
    })
    .filter((i) => i.cost > 0)
    .sort((a, b) => (a.section || "").localeCompare(b.section || "") || a.name.localeCompare(b.name));
}

/** GM side: put a delivered item onto the trainer, stacking with one they already have. */
export async function deliver(actor, itemId, qty) {
  const src = game.items.get(itemId);
  if (!src) return false;
  const existing = actor.items.find((i) => i.name === src.name && i.type === src.type);
  const asType = (orig, n) => (typeof orig === "string" ? String(n) : n);
  if (existing && existing.system?.quantity !== undefined) {
    const now = Number(existing.system.quantity) || 0;
    await existing.update({ "system.quantity": asType(existing.system.quantity, now + qty) });
  } else {
    const data = src.toObject();
    delete data._id;
    delete data.folder;
    if (data.system?.quantity !== undefined) data.system.quantity = asType(data.system.quantity, qty);
    await actor.createEmbeddedDocuments("Item", [data]);
  }
  return true;
}
