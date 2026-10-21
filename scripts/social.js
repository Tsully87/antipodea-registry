import { MODULE_ID } from "./constants.js";
import * as Time from "./time.js";

/**
 * Shared engine for the three social apps.
 *
 * Fan engagement is worked out on the fly from each post's age on the world clock,
 * so views, likes, fan comments and follower counts grow as you advance time without
 * anything having to be saved. The same post always gives the same numbers.
 */

export const PLATFORMS = {
  pokegram: {
    key: "pokegram", name: "PokéGram", icon: "fa-camera-retro", color: "#d6336c",
    fans: "followers", follow: "Follow", following: "Following", verb: "posted",
    mult: 1, viral: 0.03, likeRate: [0.06, 0.12], webhook: "pokegramWebhookUrl", lock: "rotomOnlyPokegram"
  },
  poketube: {
    key: "poketube", name: "PokéTube", icon: "fa-play", color: "#e03131",
    fans: "subscribers", follow: "Subscribe", following: "Subscribed", verb: "uploaded",
    mult: 1.4, viral: 0.02, likeRate: [0.03, 0.06], webhook: "poketubeWebhookUrl", lock: "rotomOnlyPoketube"
  },
  tiktogepi: {
    key: "tiktogepi", name: "TikTogepi", icon: "fa-music", color: "#111111",
    fans: "followers", follow: "Follow", following: "Following", verb: "posted",
    mult: 2.2, viral: 0.06, likeRate: [0.08, 0.16], webhook: "tiktogepiWebhookUrl", lock: "rotomOnlyTiktogepi"
  }
};

const S = (key) => game.settings.get(MODULE_ID, key);
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/* -------------------------------------------- */
/*  Seeded randomness                           */
/* -------------------------------------------- */

function hash(str) {
  let h = 2166136261;
  for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

/** Stable 0..1 number for a post id and a salt. */
export function rnd(id, salt) {
  let x = hash(`${id}:${salt}`);
  x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
  return (x % 100000) / 100000;
}

/* -------------------------------------------- */
/*  Profiles                                    */
/* -------------------------------------------- */

export const allProfiles = () => S("social") ?? {};

export function defaultHandle(actor) {
  return (actor?.name ?? "trainer").replace(/[^A-Za-z0-9_]/g, "").slice(0, 20) || "trainer";
}

export function profile(actorId) {
  const p = allProfiles()[actorId] ?? {};
  const actor = game.actors.get(actorId);
  return {
    handle: p.handle || defaultHandle(actor),
    bio: p.bio ?? "",
    base: { pokegram: 0, poketube: 0, tiktogepi: 0, ...(p.base ?? {}) },
    following: { pokegram: [], poketube: [], tiktogepi: [], ...(p.following ?? {}) }
  };
}

export function actorByHandle(handle) {
  const h = String(handle).toLowerCase();
  return game.actors.find((a) => a.type !== "pokemon" && profile(a.id).handle.toLowerCase() === h) ?? null;
}

/** Real trainers who follow this actor on a platform. */
export function realFollowers(actorId, platform) {
  const all = allProfiles();
  return Object.keys(all).filter((id) => (all[id]?.following?.[platform] ?? []).includes(actorId) && game.actors.get(id));
}

export function isFollowing(fromId, toId, platform) {
  return profile(fromId).following[platform].includes(toId);
}

/* -------------------------------------------- */
/*  Posts                                       */
/* -------------------------------------------- */

export const platformOf = (p) => p.platform || "pokegram";
export const allPosts = () => S("posts") ?? [];
export const postsOn = (platform) => allPosts().filter((p) => platformOf(p) === platform);
export const postById = (id) => allPosts().find((p) => p.id === id) ?? null;

export function repostCount(id) {
  return allPosts().filter((p) => p.repostOf === id).length;
}

export function parseTags(text) {
  return [...String(text ?? "").matchAll(/#([A-Za-z0-9_]+)/g)].map((m) => m[1].toLowerCase());
}

export function parseMentions(text) {
  return [...String(text ?? "").matchAll(/@([A-Za-z0-9_]+)/g)].map((m) => m[1]);
}

/** Caption HTML with clickable @mentions and #hashtags. */
export function richText(text) {
  let html = esc(text);
  html = html.replace(/@([A-Za-z0-9_]+)/g, (m, h) => {
    const a = actorByHandle(h);
    return a ? `<a class="ap-mention" data-action="apSocialProfile" data-actor="${a.id}">@${h}</a>` : m;
  });
  html = html.replace(/#([A-Za-z0-9_]+)/g, (m, t) => `<a class="ap-tag" data-action="apSocialTag" data-tag="${t.toLowerCase()}">#${t}</a>`);
  return html;
}

/* -------------------------------------------- */
/*  Fan engagement                              */
/* -------------------------------------------- */

/** Views a post has racked up by world time `at`. Reposts have none of their own. */
export function views(p, at = Time.now()) {
  if (p.repostOf) return 0;
  const def = PLATFORMS[platformOf(p)];
  const ageH = Math.max(0, (at - (p.wt ?? at)) / 3600);
  const reach = 0.3 + 0.5 * rnd(p.id, "reach");
  const engaged = (p.likes?.length ?? 0) * 40 + (p.comments?.length ?? 0) * 60 + repostCount(p.id) * 120;
  let target = ((p.fansAt ?? 0) * reach + 25 + engaged) * def.mult;
  if (rnd(p.id, "viral") < def.viral) target *= 6 + 6 * rnd(p.id, "boom");
  return Math.floor(target * (1 - Math.pow(0.5, ageH / 12)));
}

export function isViral(p) {
  return !p.repostOf && rnd(p.id, "viral") < PLATFORMS[platformOf(p)].viral;
}

export function fanLikes(p, at = Time.now()) {
  const [lo, hi] = PLATFORMS[platformOf(p)].likeRate;
  return Math.floor(views(p, at) * (lo + (hi - lo) * rnd(p.id, "likes")));
}

const FAN_LINES = [
  "so cool!! 😍", "ripper shot mate", "where is this??", "omg the vibes", "fair dinkum legend",
  "need this energy", "🔥🔥🔥", "bonza!", "who else came from the Croc Shed", "sweet as bro",
  "this is everything", "not me watching this 10 times", "living for this", "mate 😂", "goals tbh",
  "drop bears are real btw", "first!", "the Pokémon tho 😭", "underrated", "ok but how"
];
const FAN_NAMES = ["bunya", "wattle", "galah", "croc", "reef", "tussock", "kiwi", "bush", "mudkip", "wooper", "snowgum", "jandal", "ute", "billabong", "dingo"];

/** A few made-up fan comments once a post has enough views. */
export function fanComments(p, at = Time.now()) {
  if (p.repostOf) return [];
  const v = views(p, at);
  const step = 120 + Math.floor(rnd(p.id, "cstep") * 300);
  const n = Math.min(4, Math.floor(v / step));
  return Array.from({ length: n }, (_, i) => ({
    fan: true,
    name: `${FAN_NAMES[Math.floor(rnd(p.id, `fn${i}`) * FAN_NAMES.length)]}_${Math.floor(rnd(p.id, `fd${i}`) * 900 + 10)}`,
    text: FAN_LINES[Math.floor(rnd(p.id, `fl${i}`) * FAN_LINES.length)]
  }));
}

/** Followers or subscribers: GM-set base, real trainers, and fans won from views (3% of views). */
export function fanCount(actorId, platform, at = Time.now()) {
  const won = allPosts()
    .filter((p) => p.author === actorId && platformOf(p) === platform)
    .reduce((n, p) => n + Math.floor(views(p, at) * 0.03), 0);
  return profile(actorId).base[platform] + won + realFollowers(actorId, platform).length;
}

export function compact(n) {
  n = Number(n) || 0;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}K`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

/* -------------------------------------------- */
/*  Trending                                    */
/* -------------------------------------------- */

export function trending(platform, at = Time.now(), days = 7) {
  const since = at - days * Time.secondsPerDay();
  const scores = new Map();
  for (const p of postsOn(platform)) {
    if ((p.wt ?? 0) < since || p.repostOf) continue;
    const score = views(p, at) + 10 * ((p.likes?.length ?? 0) + fanLikes(p, at));
    for (const t of new Set(parseTags(`${p.caption ?? ""} ${p.title ?? ""}`))) {
      const s = scores.get(t) ?? { tag: t, score: 0, posts: 0 };
      s.score += score; s.posts += 1;
      scores.set(t, s);
    }
  }
  return [...scores.values()].sort((a, b) => b.score - a.score).slice(0, 10);
}

/** "1:24" style label from seconds. */
export function duration(secs) {
  secs = Math.max(0, Number(secs) || 0);
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = Math.floor(secs % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export function parseDuration(str) {
  const parts = String(str ?? "").split(":").map((n) => Number(n) || 0);
  return parts.reduce((t, n) => t * 60 + n, 0);
}
