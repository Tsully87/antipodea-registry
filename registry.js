import { MODULE_ID, FLAG, OFFENCES, ENDORSEMENTS, defaultRecord } from "./constants.js";
import * as Time from "./time.js";
import { postToDiscord, Templates } from "./discord.js";

const S = (key) => game.settings.get(MODULE_ID, key);

/* -------------------------------------------- */
/*  Reading and writing records                 */
/* -------------------------------------------- */

export function getRecord(actor) {
  const stored = actor?.getFlag(MODULE_ID, FLAG) ?? {};
  return foundry.utils.mergeObject(defaultRecord(), foundry.utils.deepClone(stored), { inplace: false });
}

export function hasRecord(actor) {
  return !!actor?.getFlag(MODULE_ID, FLAG);
}

export async function saveRecord(actor, record) {
  // The record has a fixed shape and its lists (demerits, badges) are replaced whole
  // on update, so a single write is enough.
  ensureIds(record);
  return actor.update({ [`flags.${MODULE_ID}.${FLAG}`]: record });
}

export async function updateRecord(actor, fn) {
  const record = getRecord(actor);
  await fn(record);
  return saveRecord(actor, record);
}

/* -------------------------------------------- */
/*  Derived values                              */
/* -------------------------------------------- */

export function activeDemerits(record, at = Time.now()) {
  return record.demerits.filter((d) => d.expires > at && d.points > 0);
}

export function totalPoints(record, at = Time.now()) {
  return activeDemerits(record, at).reduce((sum, d) => sum + d.points, 0);
}

export function isSuspended(record, at = Time.now()) {
  return record.suspendedUntil !== null && record.suspendedUntil > at;
}

export function anyLicence(record) {
  return Object.values(record.licences).some((l) => l.status !== "none");
}

function randomDigits(n) {
  let s = "";
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}

export function ensureIds(record) {
  if (!record.trainerId) record.trainerId = randomDigits(5);
  if (!record.licenceNo && anyLicence(record)) record.licenceNo = `AP-${randomDigits(6)}`;
}

/* -------------------------------------------- */
/*  Licences                                    */
/* -------------------------------------------- */

export async function setEndorsement(actor, key, status, office = "") {
  const record = getRecord(actor);
  const lic = record.licences[key];
  if (!lic || lic.status === status) return;
  lic.status = status;
  lic.office = office || lic.office;
  lic.issued = status === "none" ? null : Time.now();
  if (status === "none") lic.days = 0;
  ensureIds(record);
  await saveRecord(actor, record);

  const args = {
    name: actor.name,
    endorsement: ENDORSEMENTS[key].label,
    office: lic.office,
    date: Time.formatShort(Time.now())
  };
  if (status === "learner") await postToDiscord(Templates.learner(args));
  if (status === "full") await postToDiscord(Templates.full(args));
}

export async function adjustRidingDays(actor, key, delta) {
  return updateRecord(actor, (r) => {
    r.licences[key].days = Math.max(0, (r.licences[key].days ?? 0) + delta);
  });
}

/* -------------------------------------------- */
/*  Offences                                    */
/* -------------------------------------------- */

/**
 * @param {Actor} actor
 * @param {object} data { offence, endorsement, town, officer, fine, points, note }
 */
export async function issueOffence(actor, data) {
  const def = OFFENCES[data.offence] ?? OFFENCES.custom;
  const record = getRecord(actor);
  const t = Time.now();
  const date = Time.formatShort(t);
  const limit = S("demeritLimit");
  const base = { name: actor.name, officer: data.officer, town: data.town, date };

  if (def.kind === "unlicensed") {
    const repeat = record.unlicensedFines > 0;
    const fine = def.fine * 2 ** record.unlicensedFines;
    record.unlicensedFines += 1;
    await saveRecord(actor, record);
    const endorsement = data.offence === "unlicensedSky" ? "Sky" : (ENDORSEMENTS[data.endorsement]?.label ?? "Land");
    await postToDiscord(Templates.unlicensed({ ...base, endorsement, fine, repeat }));
    return { fine, message: `${actor.name} fined $${fine.toLocaleString("en-AU")} for riding unlicensed.` };
  }

  if (def.kind === "suspended") {
    const fine = def.fine;
    if (isSuspended(record, t)) {
      const remaining = record.suspendedUntil - t;
      record.suspendedUntil = t + remaining * 2;
    } else {
      ui.notifications.warn(`${actor.name} isn't currently suspended, so only the fine applies.`);
    }
    await saveRecord(actor, record);
    await postToDiscord(Templates.suspensionDoubled({ ...base, fine, until: Time.formatShort(record.suspendedUntil ?? t) }));
    return { fine, message: `${actor.name} fined $${fine.toLocaleString("en-AU")} and suspension doubled.` };
  }

  // Demerit offences and custom offences.
  const fine = def.kind === "custom" ? Number(data.fine) || 0 : def.fine;
  const points = def.kind === "custom" ? Number(data.points) || 0 : def.points;
  const label = data.note?.trim() || (def.kind === "custom" ? "Offence" : def.short);
  const offence = data.town ? `${label} in ${data.town}` : label;

  const expires = Time.addDays(t, S("expiryDays"));
  if (points > 0) {
    record.demerits.push({
      id: foundry.utils.randomID(),
      offence, points, fine,
      town: data.town ?? "", officer: data.officer ?? "",
      issued: t, expires
    });
  }

  const total = totalPoints(record, t);
  let suspendedNow = false;
  if (points > 0 && total >= limit && !isSuspended(record, t)) {
    record.suspendedUntil = Time.addDays(t, S("suspensionDays"));
    suspendedNow = true;
  }
  await saveRecord(actor, record);

  await postToDiscord(Templates.infringement({
    ...base, offence, fine, points, total, limit, expires: Time.formatShort(expires)
  }));
  if (suspendedNow) {
    await postToDiscord(Templates.suspended({
      name: actor.name, until: Time.formatShort(record.suspendedUntil), reason: `${limit} demerit points reached`
    }));
  }

  let message = `${actor.name}: ${offence}, $${fine.toLocaleString("en-AU")} and ${points} point${points === 1 ? "" : "s"} (${total} / ${limit}).`;
  if (suspendedNow) message += " Licence SUSPENDED.";
  return { fine, points, total, suspendedNow, message };
}

/** Each day of Community Service removes 1 point, oldest demerit first. */
export async function communityService(actor, days = 1) {
  const record = getRecord(actor);
  const t = Time.now();
  let toRemove = days;
  const active = activeDemerits(record, t).sort((a, b) => a.issued - b.issued);
  for (const d of active) {
    if (toRemove <= 0) break;
    const take = Math.min(d.points, toRemove);
    d.points -= take;
    toRemove -= take;
  }
  const removed = days - toRemove;
  if (removed <= 0) {
    ui.notifications.info(`${actor.name} has no demerit points to work off.`);
    return;
  }
  record.demerits = record.demerits.filter((d) => d.points > 0);
  await saveRecord(actor, record);
  await postToDiscord(Templates.cleared({
    name: actor.name, points: removed, reason: "Community Service",
    total: totalPoints(record, t), limit: S("demeritLimit")
  }));
}

export async function removeDemerit(actor, id) {
  const record = getRecord(actor);
  const d = record.demerits.find((x) => x.id === id);
  if (!d) return;
  record.demerits = record.demerits.filter((x) => x.id !== id);
  await saveRecord(actor, record);
  await postToDiscord(Templates.cleared({
    name: actor.name, points: d.points, reason: "removed by the Registry",
    total: totalPoints(record), limit: S("demeritLimit")
  }));
}

export async function clearSuspension(actor) {
  const record = getRecord(actor);
  if (record.suspendedUntil === null) return;
  record.suspendedUntil = null;
  await saveRecord(actor, record);
  await postToDiscord(Templates.suspensionOver({ name: actor.name }));
}

/* -------------------------------------------- */
/*  World clock sweep                           */
/* -------------------------------------------- */

/** Drops expired points and ends finished suspensions. Run on the active GM only. */
export async function sweep() {
  const t = Time.now();
  const limit = S("demeritLimit");
  for (const actor of game.actors) {
    if (!hasRecord(actor)) continue;
    const record = getRecord(actor);
    const expired = record.demerits.filter((d) => d.expires <= t);
    const suspensionDone = record.suspendedUntil !== null && record.suspendedUntil <= t;
    if (!expired.length && !suspensionDone) continue;

    record.demerits = record.demerits.filter((d) => d.expires > t);
    if (suspensionDone) record.suspendedUntil = null;
    await saveRecord(actor, record);

    if (expired.length) {
      const pts = expired.reduce((s, d) => s + d.points, 0);
      await postToDiscord(Templates.cleared({
        name: actor.name, points: pts, reason: "expired", total: totalPoints(record, t), limit
      }));
    }
    if (suspensionDone) await postToDiscord(Templates.suspensionOver({ name: actor.name }));
  }
}
