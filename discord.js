import { MODULE_ID } from "./constants.js";

/**
 * Discord notices for #mount-registry, matching the vault's Registry Discord Posts templates.
 * Only the GM's client posts, and the webhook URL is a per-user setting so players never see it.
 */

function webhookUrl() {
  try { return game.settings.get(MODULE_ID, "webhookUrl")?.trim() ?? ""; }
  catch (e) { return ""; }
}

export function discordEnabled() {
  return game.user.isGM && game.settings.get(MODULE_ID, "postToDiscord") && !!webhookUrl();
}

export async function postToDiscord(content) {
  if (!discordEnabled()) return false;
  try {
    const res = await fetch(webhookUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } })
    });
    if (!res.ok) throw new Error(`Discord replied ${res.status}`);
    return true;
  } catch (err) {
    console.error(`${MODULE_ID} | Discord post failed`, err);
    ui.notifications.warn("Pokémon Phone: couldn't post to Discord. Check the webhook URL in module settings.");
    return false;
  }
}

const money = (n) => `$${Number(n).toLocaleString("en-AU")}`;

export const Templates = {
  learner: ({ name, endorsement, office, date }) =>
`📋 **ANTIPODEA TRAINER REGISTRY: Learner Permit Issued**
**Trainer:** ${name}
**Endorsement:** ${endorsement}
**Office:** ${office || "Antipodea"} Registry
**Date:** ${date}
Display your L-plates at all times. Ride safe, legend.`,

  full: ({ name, endorsement, office, date }) =>
`🪪 **ANTIPODEA TRAINER REGISTRY: Licence Issued**
**Trainer:** ${name}
**Endorsement:** ${endorsement}
**Office:** ${office || "Antipodea"} Registry
**Date:** ${date}
Off your Ls. Congrats, and don't make us regret it.`,

  infringement: ({ name, officer, town, offence, fine, points, total, limit, date, expires }) =>
`🚨 **INFRINGEMENT NOTICE: ${officer || "Police"}, ${town || "Antipodea"} Police**
**Trainer:** ${name}
**Offence:** ${offence}
**Fine:** ${money(fine)}
**Demerit points:** ${points} (total: ${total} / ${limit})
**Date:** ${date}
**Points expire:** ${expires}
Pay up at any Registry office or police station.`,

  suspended: ({ name, until, reason }) =>
`⛔ **LICENCE SUSPENDED: Antipodea Trainer Registry**
**Trainer:** ${name}
**Reason:** ${reason}
**Suspended:** all riding endorsements
**Until:** ${until}
Riding while suspended is a $2,000 fine and doubles the suspension. Walk it off.`,

  suspensionDoubled: ({ name, officer, town, fine, until, date }) =>
`🚨 **INFRINGEMENT NOTICE: ${officer || "Police"}, ${town || "Antipodea"} Police**
**Trainer:** ${name}
**Offence:** Riding while suspended
**Fine:** ${money(fine)}
**Date:** ${date}
**Suspension doubled. Now suspended until:** ${until}
Seriously, mate. Walk it off.`,

  suspensionOver: ({ name }) =>
`✅ **REGISTRY UPDATE**
**Trainer:** ${name}
**Suspension ended.** Riding endorsements are active again.`,

  cleared: ({ name, points, reason, total, limit }) =>
`✅ **REGISTRY UPDATE**
**Trainer:** ${name}
**Points removed:** ${points} (${reason})
**New total:** ${total} / ${limit}`,

  unlicensed: ({ name, officer, town, endorsement, fine, repeat, date }) =>
`🚨 **INFRINGEMENT NOTICE: ${officer || "Police"}, ${town || "Antipodea"} Police**
**Rider:** ${name}
**Offence:** Riding without a permit or licence (${endorsement})
**Fine:** ${money(fine)} (${repeat ? "doubled for repeat offence" : "first offence"})
**Date:** ${date}
Get your Ls, mate.`
};
