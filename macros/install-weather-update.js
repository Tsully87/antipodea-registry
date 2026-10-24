// =====================================================================
//  INSTALL / UPDATE: Antipodea Weather  (paste into a Script macro, GM only)
//  Pulls the weather macro for this release from GitHub, checks it arrived
//  intact, backs up your current macro, keeps your Discord webhook, and adds
//  the helper macros (Mount Kahikatea, Antipodea Earthquake).
//  Safe to run more than once.
// =====================================================================
const TAG = "1.4.0";
const COMMIT = "14e6d71914e6aceb9ca341851814c62b2a5c471d"; // the exact version that was tested
const SOURCE = `https://raw.githubusercontent.com/Tsully87/antipodea-registry/${COMMIT}/macros/antipodea-weather.js`;
const EXPECTED_SHA256 = "e11c5125a5e3a5c9d635055407242814b3e42ba9bcc08de09982d5a2c5886ce5";

if (!game.user.isGM) return ui.notifications.warn("Only the GM can install the weather macro.");

const sha256 = async (text) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))]
  .map((b) => b.toString(16).padStart(2, "0")).join("");

let src;
try {
  const res = await fetch(SOURCE, { cache: "no-store" });
  if (!res.ok) throw new Error(`GitHub said ${res.status}`);
  src = await res.text();
} catch (e) {
  return ui.notifications.error(`Couldn't download the weather macro: ${e.message}`);
}
if (await sha256(src) !== EXPECTED_SHA256) {
  return ui.notifications.error("The downloaded weather macro didn't match what was expected, so nothing was changed.");
}

const HOOK_RE = /^const DISCORD_WEBHOOK = .*$/m;
let macro = game.macros.getName("Antipodea Weather");
const folder = macro?.folder?.id ?? null;
const report = [];

if (macro) {
  const hookLine = macro.command.match(HOOK_RE)?.[0];
  if (hookLine) src = src.replace(HOOK_RE, () => hookLine);
  if (macro.command === src) {
    report.push("Weather macro was already up to date.");
  } else {
    const stamp = new Date().toISOString().slice(0, 10);
    await Macro.create({ name: `Antipodea Weather (backup ${stamp})`, type: "script", command: macro.command, img: macro.img, folder });
    await macro.update({ command: src });
    report.push(`Weather macro updated (old version saved as "Antipodea Weather (backup ${stamp})").`);
  }
  if (!hookLine || /DISCORD_WEBHOOK = ""/.test(src)) report.push("No Discord webhook was set, so Discord posts are off until you add one.");
} else {
  macro = await Macro.create({ name: "Antipodea Weather", type: "script", command: src, img: "icons/magic/air/weather-clouds-rainbow.webp" });
  report.push("Weather macro created. Paste your Discord webhook into the DISCORD_WEBHOOK line at the top.");
}

// helper macros for the Stream Deck
const helpers = [
  ["Mount Kahikatea", "icons/magic/fire/projectile-meteor-salvo-strong-red.webp", "volcano", "Opens the Mount Kahikatea controls"],
  ["Antipodea Earthquake", "icons/magic/earth/projectile-stone-boulder-brown.webp", "quake", "Opens the earthquake controls"]
];
for (const [name, img, key, what] of helpers) {
  if (game.macros.getName(name)) continue;
  await Macro.create({ name, type: "script", img, folder: macro.folder?.id ?? folder,
    command: `// ${what} in the Antipodea Weather macro\ngame.macros.getName("Antipodea Weather")?.execute({ ${key}: true });` });
  report.push(`Added the "${name}" macro.`);
}

// Sweet As City sits in Snowgum High Country (matches the vault)
const MOD = "antipodea-registry";
if (game.modules.get(MOD)?.active) {
  const pins = game.settings.get(MOD, "mapPins");
  if (Array.isArray(pins) && pins.length) {
    const sweet = pins.find((p) => p.name === "Sweet As City");
    if (sweet && sweet.zone !== "Snowgum High Country") {
      sweet.zone = "Snowgum High Country";
      await game.settings.set(MOD, "mapPins", pins);
      report.push("Moved Sweet As City's PokéMaps pin into Snowgum High Country.");
    }
  }
  // rebuild the phone's saved week of forecasts so the Weather app shows the new version
  try {
    await game.settings.set(MOD, "forecastCache", {});
    const D = await import(`/modules/${MOD}/scripts/phone-data.js`);
    const M = await import(`/modules/${MOD}/scripts/maps.js`);
    await D.refreshForecastCache(M.ZONES);
  } catch (e) { console.warn("Antipodea Weather install | forecast cache", e); }
  if (!game.modules.get(MOD).api?.postAlerts) report.push("The Pokémon Phone module is older than 1.4.0, so phone alerts won't show until you update it.");
} else {
  report.push("The Pokémon Phone module isn't active, so phone alerts and the Weather app are off.");
}

await ChatMessage.create({
  speaker: { alias: "Antipodea Weather" },
  whisper: [game.user.id],
  content: `<h3>Weather macro install (${TAG})</h3><ul>${report.map((r) => `<li>${r}</li>`).join("")}</ul>`
});
ui.notifications.info("Antipodea Weather install finished. Details are in chat.");
