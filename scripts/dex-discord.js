import { MODULE_ID } from "./constants.js";
import * as Data from "./phone-data.js";
import * as DexData from "./dex-data.js";

/**
 * Discord notice for a trainer's first sighting or capture of an Antipodea species.
 * Separate webhook and setting from the others (#mount-registry, #poke-mart, the social
 * apps), since this likely wants its own channel. Only the active GM's client posts, so
 * a GM with more than one window open doesn't double-post (same guard as the weather and
 * delivery jobs in main.js).
 */

function webhookUrl() {
  try { return game.user.isGM ? (game.settings.get(MODULE_ID, "dexWebhookUrl") ?? "").trim() : ""; }
  catch (e) { return ""; }
}

export const discordEnabled = () =>
  game.user.isGM && game.settings.get(MODULE_ID, "dexDiscord") && !!webhookUrl();

async function post(content) {
  try {
    const res = await fetch(webhookUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } })
    });
    if (!res.ok) throw new Error(`Discord replied ${res.status}`);
    return true;
  } catch (err) {
    console.error(`${MODULE_ID} | Dex Discord post failed`, err);
    return false;
  }
}

async function announceOne(actor, slug, kind) {
  const entry = await DexData.indexEntry(slug);
  if (!entry) return;
  const line = kind === "owned"
    ? `🔴 **${actor.name}** caught **${entry.name}** (#${entry.number}). New Pokédex entry: owned.`
    : `📘 **${actor.name}** encountered **${entry.name}** (#${entry.number}). New Pokédex entry: seen.`;
  await post(line);
}

/**
 * Compares a trainer's `system.dex` before and after a change (the `updateActor` hook
 * hands this the snapshot `preUpdateActor` stashed on `options`, and the actor's current
 * dex) and posts one line per species newly seen or newly caught. Works the same whether
 * the change came from a PTR scan, the GM's manual seen/owned toggle, or anything else
 * that touches `system.dex` the same way.
 */
export async function announceDexChanges(actor, before, after) {
  if (!discordEnabled() || !Data.isActiveGM()) return;
  const seenBefore = new Set(before?.seen ?? []);
  const ownedBefore = new Set(before?.owned ?? []);
  const newOwned = (after?.owned ?? []).filter((s) => !ownedBefore.has(s));
  const newOwnedSet = new Set(newOwned);
  const newSeenOnly = (after?.seen ?? []).filter((s) => !seenBefore.has(s) && !newOwnedSet.has(s));

  for (const slug of newOwned) await announceOne(actor, slug, "owned");
  for (const slug of newSeenOnly) await announceOne(actor, slug, "seen");
}
