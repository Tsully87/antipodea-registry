import { MODULE_ID } from "./constants.js";

/**
 * PokéMaps data. Pins are stored in pixels on the 1408 x 768 Region Map, so any copy
 * of that map (including the 2x labelled one) lines up. Distance is calibrated the same
 * way as the Antipodea Region scene: mainland Australia is 3,000 km wide.
 */

export const MAP_W = 1408;
export const MAP_H = 768;

export const ZONES = [
  "The Big Wet", "Rainforest Reach", "Bunya Coast", "Waratah Coast", "Gumleaf Coast", "Banksia Coast",
  "The Red Heart", "Snowgum High Country", "Huon Isle", "Pōhutukawa Isle", "Tussock Plains", "Rimu Coast"
];

export const KINDS = {
  start: { label: "Starting city", color: "#f5c518" },
  gym: { label: "Gym city", color: "#d7263d" },
  contest: { label: "Contest city", color: "#8e44ad" },
  both: { label: "Gym and Contest city", color: "#d7263d" },
  league: { label: "Pokémon League", color: "#00b4d8" },
  town: { label: "Town", color: "#ffffff" }
};

const P = (name, x, y, kind, zone) => ({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name, x, y, kind, zone });

export const DEFAULT_PINS = [
  P("Bunya City", 778, 404, "start", "Bunya Coast"),
  P("Paperbark City", 438, 118, "gym", "The Big Wet"),
  P("Boab City", 300, 175, "gym", "The Big Wet"),
  P("Hard Yakka City", 165, 280, "gym", "The Red Heart"),
  P("Jarrah City", 200, 448, "gym", "Banksia Coast"),
  P("Fair Dinkum City", 505, 418, "gym", "The Red Heart"),
  P("Black Stump City", 498, 272, "both", "The Red Heart"),
  P("Bonza Bay", 668, 232, "both", "Rainforest Reach"),
  P("Waratah City", 762, 478, "both", "Waratah Coast"),
  P("Snow Gum City", 708, 548, "gym", "Snowgum High Country"),
  P("Huon Pine City", 676, 662, "gym", "Huon Isle"),
  P("Stoked City", 1240, 292, "both", "Pōhutukawa Isle"),
  P("Kauri City", 1168, 205, "gym", "Pōhutukawa Isle"),
  P("Budgie Beach", 790, 432, "contest", "Bunya Coast"),
  P("Banksia City", 640, 578, "contest", "Gumleaf Coast"),
  P("Kangaroo Paw City", 112, 380, "contest", "Banksia Coast"),
  P("Sweet As City", 1005, 612, "contest", "Snowgum High Country"),
  P("Silver Fern Plateau", 1095, 515, "league", "Tussock Plains"),
  P("Lilly Pilly Town", 765, 375, "town", "Bunya Coast"),
  P("Mangrove Point", 598, 98, "town", "Rainforest Reach"),
  P("Ridgy Didge", 462, 228, "town", "The Big Wet"),
  P("Coolibah Crossing", 612, 318, "town", "The Red Heart"),
  P("Woop Woop", 438, 392, "town", "The Red Heart"),
  P("Servo Siding", 382, 468, "town", "Gumleaf Coast"),
  P("Gidgee Rock", 255, 322, "town", "The Red Heart"),
  P("Galah Flats", 228, 378, "town", "Banksia Coast"),
  P("Marri Vale", 248, 410, "town", "Banksia Coast"),
  P("Billabong Bend", 618, 498, "town", "Gumleaf Coast"),
  P("Ironbark", 728, 438, "town", "Waratah Coast"),
  P("Leatherwood", 690, 690, "town", "Huon Isle"),
  P("Jandal Cove", 1148, 150, "town", "Pōhutukawa Isle"),
  P("Tōtara Ridge", 1205, 372, "town", "Pōhutukawa Isle"),
  P("Rimu Falls", 1278, 352, "town", "Pōhutukawa Isle"),
  P("Kawakawa Harbour", 1212, 432, "town", "Pōhutukawa Isle"),
  P("Gumboot Plains", 1135, 545, "town", "Tussock Plains"),
  P("Miro Sound", 962, 625, "town", "Rimu Coast"),
  P("Matai Isle", 968, 706, "town", "Rimu Coast")
];

/** Kinds of labelled spot on a city map. */
export const SPOT_TYPES = {
  district: { label: "District", icon: "fa-city", color: "#495057" },
  centre: { label: "Pokémon Centre", icon: "fa-kit-medical", color: "#e03131" },
  mart: { label: "Poké Mart / Shop", icon: "fa-store", color: "#1c7ed6" },
  gym: { label: "Gym", icon: "fa-trophy", color: "#d7263d" },
  contest: { label: "Contest Hall", icon: "fa-ribbon", color: "#8e44ad" },
  police: { label: "Police", icon: "fa-shield-halved", color: "#1864ab" },
  registry: { label: "Registry Office", icon: "fa-landmark", color: "#0f4f55" },
  transport: { label: "Transport", icon: "fa-ferry", color: "#0c8599" },
  food: { label: "Food and Drink", icon: "fa-mug-hot", color: "#e8590c" },
  landmark: { label: "Landmark", icon: "fa-star", color: "#f59f00" },
  danger: { label: "Danger / Wild Area", icon: "fa-triangle-exclamation", color: "#c92a2a" },
  other: { label: "Other", icon: "fa-location-dot", color: "#2f9e44" }
};

export function pins() {
  const stored = game.settings.get(MODULE_ID, "mapPins");
  return Array.isArray(stored) && stored.length ? stored : DEFAULT_PINS;
}

export const pinById = (id) => pins().find((p) => p.id === id) ?? null;

/** GM: change one pin (and save the whole list, so the defaults become editable). */
export async function savePin(id, fn) {
  const list = foundry.utils.deepClone(pins());
  const pin = list.find((p) => p.id === id);
  if (!pin) return;
  fn(pin);
  await game.settings.set(MODULE_ID, "mapPins", list);
}

/** Can this phone open that place's city map? GMs always can; trainers once they've been there. */
export function cityUnlocked(phone, pin) {
  if (!pin) return false;
  if (game.user.isGM) return true;
  return phone.location === pin.id || (phone.visited ?? []).includes(pin.id);
}

export function distanceKm(a, b) {
  const kmPerPx = Number(game.settings.get(MODULE_ID, "mapKmPerPixel")) || 4.11;
  return Math.hypot(a.x - b.x, a.y - b.y) * kmPerPx;
}

/**
 * Travel time using the Westmarch rule: 1 point of movement Capability = 1 km/h,
 * 8 hours of travel a day, slow terrain halves speed.
 */
export function travel(km, speed, slow = false) {
  const kph = Math.max(0.1, Number(speed) || 0) / (slow ? 2 : 1);
  const hours = km / kph;
  const days = hours / 8;
  return { km, kph, hours, days };
}

/** Movement Capabilities from a PTR trainer sheet. */
export function speeds(actor) {
  const c = actor?.system?.capabilities ?? {};
  const num = (v) => Number(v?.value ?? v) || 0;
  return { land: num(c.overland), water: num(c.swim), sky: num(c.sky) };
}
