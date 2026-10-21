import * as Social from "./social.js";
import * as Data from "./phone-data.js";
import * as Time from "./time.js";

/**
 * Screens and buttons for PokéGram, PokéTube and TikTogepi. These run as methods on the
 * phone window (`this` is the RegistryPhone), using its go(), draft() and render().
 */

export const SOCIAL_APPS = Object.keys(Social.PLATFORMS);
export const isSocial = (app) => SOCIAL_APPS.includes(app);

function ago(ms) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** When a post went up, on the world clock ("3h", "2d"), falling back to real time. */
function when(p) {
  const secs = Time.now() - (p.wt ?? Time.now());
  if (secs <= 0) return ago(p.ms);
  if (secs < 3600) return `${Math.max(1, Math.floor(secs / 60))}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

export function socialState(app) {
  this.sv ??= {};
  if (this.sv.platform !== app) this.sv = { platform: app, view: "feed" };
  return this.sv;
}

function card(p, me, drafts) {
  const isRepost = !!p.repostOf;
  const src = isRepost ? Social.postById(p.repostOf) : p;
  if (!src) return null;
  const prof = Social.profile(src.author);
  const realLikes = src.likes?.length ?? 0;
  const fanL = Social.fanLikes(src);
  const fanC = Social.fanComments(src);
  const comments = [
    ...(src.comments ?? []).map((c) => ({ name: Social.profile(c.actorId).handle, actorId: c.actorId, html: Social.richText(c.text), when: ago(c.ms) })),
    ...fanC.map((c) => ({ name: c.name, fan: true, html: Social.richText(c.text) }))
  ];
  const views = Social.views(src);
  return {
    id: src.id,
    cardId: p.id,
    isRepost,
    repostBy: isRepost ? { id: p.author, handle: Social.profile(p.author).handle } : null,
    repostCaption: isRepost && p.caption ? Social.richText(p.caption) : "",
    author: src.author,
    handle: prof.handle,
    authorName: src.authorName,
    authorImg: Data.who(src.author, { img: src.authorImg }).img,
    img: src.img,
    captionHtml: Social.richText(src.caption),
    hasCaption: !!src.caption,
    title: src.title ?? "",
    lengthLabel: src.length ? Social.duration(src.length) : "",
    sound: src.sound || `original sound - @${prof.handle}`,
    views: Social.compact(views),
    likes: Social.compact(realLikes + fanL),
    liked: (src.likes ?? []).includes(me),
    commentCount: Social.compact(comments.length),
    comments,
    lastComments: comments.slice(-2),
    moreComments: comments.length > 2,
    reposts: Social.compact(Social.repostCount(src.id)),
    reposted: Social.allPosts().some((x) => x.repostOf === src.id && x.author === me),
    canDelete: game.user.isGM || p.author === me,
    when: when(p),
    viral: Social.isViral(src),
    pro: !!src.pro,
    draft: drafts[`comment-${src.id}`] ?? ""
  };
}

export function socialContext(app, phone) {
  const sv = socialState.call(this, app);
  const def = Social.PLATFORMS[app];
  const me = this.actor.id;
  const all = Social.postsOn(app);
  const ctx = {
    soc: { ...def, [app]: true },
    sv: { ...sv, [sv.view]: true },
    socialDmUnread: Data.unreadCount(this.actor, app),
    myHandle: Social.profile(me).handle
  };
  const cards = (list) => list.map((p) => card(p, me, this._drafts)).filter(Boolean);

  switch (sv.view) {
    case "feed": {
      const following = new Set(Social.profile(me).following[app]);
      const list = sv.followingOnly ? all.filter((p) => following.has(p.author) || p.author === me) : all;
      ctx.feed = cards(list);
      break;
    }
    case "post": {
      const p = Social.postById(sv.postId);
      ctx.post = p ? card(p, me, this._drafts) : null;
      break;
    }
    case "profile": {
      const id = sv.actor ?? me;
      const a = game.actors.get(id);
      const prof = Social.profile(id);
      const theirs = all.filter((p) => p.author === id);
      ctx.profile = {
        id,
        name: a?.name ?? "Unknown",
        img: a?.img ?? "icons/svg/mystery-man.svg",
        handle: prof.handle,
        bio: prof.bio,
        fans: Social.compact(Social.fanCount(id, app)),
        following: prof.following[app].length,
        postCount: theirs.length,
        isMe: id === me,
        amFollowing: Social.isFollowing(me, id, app),
        grid: theirs.map((p) => {
          const src = p.repostOf ? Social.postById(p.repostOf) : p;
          return src ? { id: src.id, img: src.img, repost: !!p.repostOf, views: Social.compact(Social.views(src)), title: src.title ?? "" } : null;
        }).filter(Boolean),
        base: prof.base[app],
        handleDraft: this._drafts["soc-handle"] ?? prof.handle,
        bioDraft: this._drafts["soc-bio"] ?? prof.bio
      };
      break;
    }
    case "trending": {
      ctx.trends = Social.trending(app).map((t, i) => ({ ...t, rank: i + 1, postsLabel: `${t.posts} post${t.posts === 1 ? "" : "s"}`, score: Social.compact(t.score) }));
      const since = Time.now() - 7 * Time.secondsPerDay();
      ctx.topPosts = cards(all.filter((p) => !p.repostOf && (p.wt ?? 0) >= since)
        .sort((a, b) => Social.views(b) - Social.views(a)).slice(0, 6));
      ctx.creators = game.actors.filter((a) => a.type !== "pokemon" && (a.hasPlayerOwner || Data.getPhone(a).listed))
        .map((a) => ({ id: a.id, name: a.name, img: a.img, handle: Social.profile(a.id).handle, n: Social.fanCount(a.id, app) }))
        .sort((a, b) => b.n - a.n).slice(0, 5).map((c) => ({ ...c, fans: Social.compact(c.n) }));
      break;
    }
    case "search": {
      const tag = sv.tag;
      const q = (sv.q ?? "").toLowerCase();
      const matches = all.filter((p) => {
        const src = p.repostOf ? Social.postById(p.repostOf) : p;
        if (!src || p.repostOf) return false;
        const text = `${src.caption ?? ""} ${src.title ?? ""}`;
        if (tag) return Social.parseTags(text).includes(tag);
        return q && text.toLowerCase().includes(q);
      });
      ctx.searchLabel = tag ? `#${tag}` : sv.q;
      ctx.results = cards(matches);
      ctx.people = q ? game.actors.filter((a) => a.type !== "pokemon")
        .map((a) => ({ id: a.id, name: a.name, img: a.img, handle: Social.profile(a.id).handle }))
        .filter((a) => a.handle.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)).slice(0, 6) : [];
      break;
    }
    case "dms": {
      ctx.dms = Data.threadsFor(this.actor, app).map((t) => {
        const w = Data.who(t.other, { name: t.last.fromName, img: t.last.fromImg });
        return { other: t.other, name: w.name, img: w.img, handle: Social.profile(t.other).handle, preview: t.last.text || "📷 Photo", mine: t.last.from === me, time: ago(t.last.ms), unread: t.unread };
      });
      ctx.dmPeople = Social.profile(me).following[app].map((id) => ({ id, name: game.actors.get(id)?.name, handle: Social.profile(id).handle })).filter((x) => x.name);
      break;
    }
    case "compose": {
      ctx.composeImg = sv.img ?? null;
      ctx.galleryStrip = phone.gallery.slice(0, 30).map((g) => ({ ...g, selected: g.src === sv.img }));
      ctx.drafts = {
        caption: this._drafts["soc-caption"] ?? "",
        title: this._drafts["soc-title"] ?? "",
        length: this._drafts["soc-length"] ?? "1:30",
        sound: this._drafts["soc-sound"] ?? ""
      };
      ctx.pro = Data.hasApp(phone, "procamera");
      break;
    }
  }
  return ctx;
}

/* -------------------------------------------- */
/*  Actions                                     */
/* -------------------------------------------- */

function setView(view, extra = {}) {
  this.sv = { ...this.sv, view, ...extra };
  this._scroll = null;
  this.render();
}

export const socialActions = {
  apSocialNav(event, target) {
    const view = target.dataset.view;
    if (view === "feed" && target.dataset.following !== undefined) this.sv.followingOnly = target.dataset.following === "1";
    setView.call(this, view, view === "profile" ? { actor: this.actor.id } : {});
  },

  apSocialProfile(event, target) {
    event.preventDefault?.();
    setView.call(this, "profile", { actor: target.dataset.actor });
  },

  apSocialTag(event, target) {
    event.preventDefault?.();
    setView.call(this, "search", { tag: target.dataset.tag, q: null });
  },

  apSocialSearch() {
    const q = this.draft("soc-search");
    if (!q) return;
    const tag = q.startsWith("#") ? q.slice(1).toLowerCase() : null;
    if (q.startsWith("@")) {
      const a = Social.actorByHandle(q.slice(1));
      if (a) return setView.call(this, "profile", { actor: a.id });
    }
    setView.call(this, "search", { tag, q: tag ? null : q });
  },

  apSocialPost(event, target) {
    setView.call(this, "post", { postId: target.dataset.post });
  },

  async apSocialLike(event, target) {
    await Data.request("like", { postId: target.dataset.post, actorId: this.actor.id });
  },

  async apSocialComment(event, target) {
    const key = `comment-${target.dataset.post}`;
    const text = this.draft(key);
    if (!text) return;
    const ok = await Data.request("comment", { postId: target.dataset.post, actorId: this.actor.id, text });
    if (ok !== false) this.draft(key, true);
  },

  async apSocialRepost(event, target) {
    const id = target.dataset.post;
    const mine = Social.allPosts().find((x) => x.repostOf === id && x.author === this.actor.id);
    if (mine) return Data.request("deletePost", { postId: mine.id });
    const src = Social.postById(id);
    if (src?.author === this.actor.id) return ui.notifications.info("You can't repost your own post.");
    await Data.request("post", { author: this.actor.id, platform: this.sv.platform, repostOf: id });
  },

  async apSocialDelete(event, target) {
    const { DialogV2 } = foundry.applications.api;
    const ok = await DialogV2.confirm({ window: { title: "Delete post" }, content: "<p>Delete this post?</p>", rejectClose: false });
    if (!ok) return;
    await Data.request("deletePost", { postId: target.dataset.post });
    if (this.sv.view === "post") setView.call(this, "feed");
  },

  async apSocialFollow(event, target) {
    await Data.request("follow", { actorId: this.actor.id, targetId: target.dataset.actor, platform: this.sv.platform });
  },

  apSocialDM(event, target) {
    this.attachImg = null;
    this.go("thread", { other: target.dataset.actor, threadCh: this.sv.platform, threadBack: this.sv.platform });
  },

  apSocialCompose(event, target) {
    const src = target?.dataset?.src ?? this.phone.gallery[0]?.src ?? null;
    for (const k of ["soc-caption", "soc-title", "soc-sound"]) this._drafts[k] = "";
    setView.call(this, "compose", { img: src });
  },

  apSocialPick(event, target) {
    this.sv.img = target.dataset.src;
    this.render();
  },

  async apSocialPublish() {
    const sv = this.sv;
    if (!sv.img) return ui.notifications.warn("Pick a photo first. Take one with the Camera app.");
    const data = {
      author: this.actor.id,
      platform: sv.platform,
      img: sv.img,
      caption: this.draft("soc-caption"),
      title: this.draft("soc-title"),
      length: Social.parseDuration(this.draft("soc-length") || "1:30"),
      sound: this.draft("soc-sound"),
      pro: Data.hasApp(this.phone, "procamera")
    };
    if (sv.platform === "poketube" && !data.title) return ui.notifications.warn("Give your video a title.");
    const ok = await Data.request("post", data);
    if (ok === false) return;
    for (const k of ["soc-caption", "soc-title", "soc-sound"]) this.draft(k, true);
    setView.call(this, "feed", { img: null, followingOnly: false });
  },

  async apSocialSaveProfile() {
    const handle = this.draft("soc-handle");
    const bio = this.draft("soc-bio");
    const data = { actorId: this.actor.id, handle, bio };
    if (game.user.isGM) {
      const base = Number(this.element.querySelector("[data-soc-base]")?.value);
      if (!Number.isNaN(base)) data.base = { [this.sv.platform]: Math.max(0, Math.floor(base)) };
    }
    const res = await Data.ask("profile", data);
    if (res?.ok === false) return ui.notifications.warn(res.error);
    delete this._drafts["soc-handle"];
    delete this._drafts["soc-bio"];
    ui.notifications.info("Profile saved.");
  }
};

/** Where the back arrow goes inside a social app. */
export function socialBack() {
  if (this.sv?.view && this.sv.view !== "feed") {
    setView.call(this, "feed");
    return true;
  }
  return false;
}
