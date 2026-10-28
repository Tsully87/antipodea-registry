# Changelog

## 1.8.2
- Crafting now gates recipes by Survival rank, per the signed-off design: Bush Shelter, Charcoal Filter, Bush Remedy and Splint need Novice; Hide Oilskin and Fur Layers need Adept; Bush Swag needs Expert. Checked against the trainer's actual `system.skills.survival.rank`. Recipes below your rank show the requirement, grey out, and Craft is disabled (with a tooltip) instead of silently letting anyone attempt anything.

## 1.8.1
- Added the missing **Swag** item (Travel and Camping, $1,500) — the one-person weatherproof bedroll from the gear table that Bush Swag crafts. It existed in the rules but was never actually created in Foundry, so Bush Swag couldn't hand anything out. It can now be bought or crafted.

## 1.8.0
- New **Survival and Crafting**, per the signed-off vault note: Food and Water, Foraging, Pokémon Drops and Crafting.
- **Crafting** window (token controls, everyone): Craft and Forage tabs. Craft checks Survival against a recipe's DC and consumes materials on a pass (ruined on a bad miss). Forage rolls Survival for a trainer who's Out Bush, finding materials from a table keyed to their zone.
- **Pokémon Drops** tool (GM): after a fight, pick the harvester and the defeated/caught Pokémon's first Type to roll the right skill (Survival, Athletics or Pokémon Ed) for 1 material. Nothing drops unless a player chooses to harvest.
- **End of Day** tool (GM): pops up when the world clock's day changes, if anyone is tagged Out Bush. Shows every out-bush trainer grouped by zone with today's weather and suggested hazard flags (tick to apply, shift-click for Severe), checks food (a Ration, or push through on Focus vs DC 10/15 that climbs +5 a day missed) and weather exposure (Survival vs DC 10/14 if not geared for it) for everyone, and stacks Worn Down on a miss.
- **Out Bush toggle** in Move Trainers: a tree icon next to each trainer flags them as out in the field rather than in town. Foraging and End of Day only apply to tagged trainers.
- Settings: "Survival: pop up End of Day when the day changes" (on by default).
- New API: `Survival.craft()`, `Survival.forage()`, `Survival.harvest()`, `Survival.rollCheck()`, `Survival.isOutBush()` / `setOutBush()`, `Survival.endOfDayPreview()` / `applyEndOfDay()`.

## 1.7.6
- Pokédex grid: bigger, darker dex numbers and more breathing room between tiles, so they're actually readable instead of faint grey text crammed under the sprite.

## 1.7.5
- Fixed: the Pokédex screen itself never actually showed anything. The phone's main template switches between apps with one line per app, and the Pokédex's line was missing since it was first built — the search box, grid, filters and detail view were all working correctly underneath, they just never got included on screen. Everything from 1.7.0 through 1.7.4 is now visible for the first time.

## 1.7.4
- Pokédex posts to Discord: when a trainer sees or catches an Antipodea species for the first time, a line posts through its own webhook (separate from the Registry, Poké Mart and social webhooks, so it can go to its own channel). Setting: "Pokédex: post new entries to Discord", webhook under "Pokédex: Discord webhook URL".
- GM tool: from a trainer's Pokédex entry, the GM can mark it Owned, Seen only, or Clear it back to unknown, without needing an in-world scan. Shows up only for the GM, on that trainer's Pokédex.
- A species' Habitat is now locked behind exploring: it only shows once the trainer's been to a zone on PokéMaps that has that terrain. Like search and the filters, it never gives away which terrain is being withheld.
- Fixed: the Pokédex didn't refresh on its own when a trainer's seen/owned list changed while the phone was open.

## 1.7.3
- Pokédex: filter the list by status (Owned / Seen only / Not found) and by type. Like search, a type filter only ever matches species you've actually found — it can't be used to peek at what a "???" entry is.

## 1.7.2
- **Antipodea Dex Entries**: a new journal (GM: `api.openDexEntries()`, or just find it in the Journal sidebar) with one page per Antipodea species. Rewrite any entry in Manuka's voice straight in Foundry's normal editor — no code needed — and the Pokédex shows your version instead of PTR's stock text. Every page starts seeded with PTR's own flavour text so nothing shows blank while you work through them; new pages are added automatically (for the active GM, same as the weather and shops) whenever a species is missing one.

## 1.7.1
- The Phone's Pokédex now replaces PTR's own "Dex" button on the trainer sheet for players (that screen showed no info for seen/owned Pokémon anyway). GMs still see PTR's button. Turn this off in settings ("Phone: Pokédex replaces PTR's Dex button for players") if you ever want it back for everyone.

## 1.7.0
- New **Pokédex** app on the phone, replacing the blank seen/owned list PTR shows on the trainer sheet. Unseen species show as a silhouette; seen species show artwork, dex number, type, size and habitat; owned species add base stats, abilities, capabilities, egg groups and level-up moves. Search by name or dex number. Limited to the species in Pokedex 1.05 (748 PTR entries).
- Species artwork is pulled from PokéAPI's sprite CDN by dex number, since PTR's own compendium has no per-species art.

## 1.6.1
- Poké Mart receipts on Discord no longer show how much money the trainer has left. They show what was bought or sold and the total.

## 1.6.0
- **Move Trainers** (GM): one window to move any number of trainers to a place. It shows who's where at a glance, ticks a whole group or everyone on the current scene, and can include NPCs. Opens from the route button in the token controls or Shift+L.
- **Scenes can be tagged with a place** (Scene Config, Basics tab). Activating the scene, or dropping a trainer token on it, moves those trainers there.
- **Set location** for one trainer from their token HUD (pin button), the Actors sidebar right-click menu, or Shift+L with their token selected.
- New API: `moveTrainers()` and `moveTo(actors, placeId)`.

## 1.5.0
- New **Poké Mart**: a shop window players open from the token controls, Shift+M or the phone. It shows the shops in the city their trainer is in, with Buy and Sell tabs, sections, a basket and a running total. Money and items update on the trainer's sheet straight away, with no GM needed.
- New **Shop Manager** for the GM: a shop per city, choose which Poké Mart sections it sells, mark items out of stock, set a markup, a buy-back rate and fixed prices.
- Shops buy items back (50% by default). The Pokédex and phones can't be sold.
- **#poke-mart on Discord**: each shop gets a forum post with its price list, updated when you save the shop, and every purchase and sale is logged in a Receipts post.
- Purchases and sales show in PokéPay history.
- Central Poké Mart (Vinnie Costa, Bunya City) is set up the first time a GM logs in.

## 1.4.1
- Fixed social posts going to Discord more than once. If you had Foundry open as GM in more than one window, every window posted it. Now only one window posts each one, and a post is marked as sent before it goes out.
- The weather now runs itself when the day changes, from one GM window only. Players no longer get "no permission" pop-ups for the weather macro. Turn off the old Hook Macros entry for it (Settings: "Weather: run the weather macro when the day changes" switches this off if you ever need to).
- GM phone picker: Shift+P or the phone button now lists every trainer, players and NPCs, grouped by folder, with a search box and your recent phones at the top. Select an NPC's token first and its phone opens straight away.
- New API: `api.pickPhone()` opens the GM picker (handy for a Stream Deck button).

## 1.4.0
- Emergency alerts: when the Antipodea Weather macro reports something serious, every phone whose location is in that weather zone gets a red pop-up, Rotom Phone or not. Tapping it opens the Weather app if they have it, or the home screen.
- Alerts cover earthquakes (Moderate shaking or worse), strong aftershocks, tsunami warnings, cyclone watches and warnings, severe east coast lows, Watch and Act or Emergency Warning bushfires, thick smoke, Mount Kahikatea at Alert Level 2+, Moderate or Major floods, and severe or extreme heatwaves.
- Each alert pops up once per player, and only when an event starts or gets worse. Players who log in later still get today's alerts.
- New API: `game.modules.get("antipodea-registry").api.postAlerts(alerts)` for the weather macro.
- PokéMaps pins now use the same weather zones as the vault: Sweet As City and Silver Fern Plateau in Snowgum High Country, Ironbark in Bunya Coast, Matai Isle in Tussock Plains.
- The Antipodea Weather macro now lives in this repo (`macros/`), with an installer macro that keeps your Discord webhook.

## 1.3.3
- Fixed the Antipodea directory names in Contacts showing pale on the light screen. The list shared a class name with Foundry's own sidebar, which was recolouring it.

## 1.3.1
- Fixed contact names (and other phone text) turning pale and unreadable when Foundry or another module uses a dark theme. Phone text now always stays dark on the light screen.

## 1.3.0
- Renamed to **Pokémon Phone** (the module ID stays antipodea-registry, so nothing needs reinstalling).
- New Phone Network: texts, DMs, posts, likes, comments, reposts, follows and profiles are saved in a hidden journal every player can write to, so they all work with no GM online.
- Photos upload straight from the player's phone if they have Foundry's Upload New Files permission. Otherwise they queue until a GM is on.
- PokéPay payments and Mart Express orders queue while no GM is online and go through when one logs in. If one fails (say, not enough money by then), the player gets told next time they're on.
- Posts made while the GM was offline go to Discord when a GM next logs in (posts older than 2 days are skipped).
- The GM's browser saves a week of forecasts for every zone, so the Weather app works with no GM online.
- Existing texts, posts and profiles move into the Phone Network automatically the first time a GM logs in after updating.
- Ready for a bot GM later: whichever GM is online picks up the queue.
- PokéMaps city maps: GMs attach a town or city map to any pin and mark labelled spots on it (Pokémon Centre, Gym, Mart, Police, Registry, Transport, Food, Landmark, Danger and more), each with a note. Zoom in and tap a spot to see what's there.
- City maps unlock once a trainer has been to that place. Every location the GM sets is remembered, so maps stay unlocked after they move on.

## 1.2.0
- New social apps: PokéTube (videos with titles, lengths and subscribers) and TikTogepi (full-screen vertical feed with sounds), alongside PokéGram.
- Social profiles with handles, bios, follower or subscriber counts, Follow/Subscribe, and a grid of posts.
- Fan engagement: posts pick up views, likes and fan comments as the world clock moves, based on the trainer's following. Popular posts win new fans, and a few go viral. GMs set starting fans per app (for Jax and friends).
- @mentions and #hashtags are clickable, with search, a Trending tab and Top Creators.
- Reposts and in-app DMs for each social app.
- Notifications for tags, comments, reposts, new followers, DMs, payments received and deliveries.
- App Store on Rotom Phones: buying an app takes the money straight off the trainer sheet and installs it. GMs can grant or remove apps for free in the Registry tab.
- Paid apps: Translator, Weather (forecast from the Antipodea Weather macro), Pro Camera (filters, sharper photos, Pro badge), PokéMaps (region map, your location, distance and travel days), PokéPay (balance, send money, history) and Mart Express (order from a Poké Mart item folder, delivered on the world clock).
- PokéPay blocks transfers between characters owned by the same player.

## 1.1.0
- The phone is now a full phone: home screen with app icons, back button and home bar.
- Messages: real texts between trainers. GMs text as any NPC by opening that NPC's phone. Photos can be attached.
- Contacts: phone numbers, default contacts, and an Antipodea directory of player trainers plus NPCs the GM lists.
- PokéGram: shared feed with photos, captions, likes and comments, with optional mirroring to a Discord channel.
- Camera: snap what you can see on the map, or upload a picture from your device. Gallery to view, post, send or delete.
- Calendar: month view on the Seasons & Stars calendar, personal reminders, and GM public events. Reminders and events pop up when the clock reaches them.
- Rotom Phones: GM switches them on per trainer, names the Rotom and speaks as it. Rotom pops up on the player's screen and players can text it back.
- Optional settings to make PokéGram, Camera or reminders Rotom Phone only.
- Phone-style notifications with sound.
- Texts, posts and photos go through the GM, so they need a GM online ("No signal" otherwise).

## 1.0.2
- Badge names are now separated by commas, since Foundry text settings are single line.

## 1.0.1
- Fixed the bottom nav buttons on the phone not responding (Foundry v13 reserves the "tab" action).
- Removed the template's reliance on the eq helper.

## 1.0.0
- Phone window with a Trainer Card and a Riding Licence tab for every trainer.
- Trainer Card: photo, Trainer ID, Home Town, Tier and 12 badge slots.
- Riding Licence: Land, Water and Sky endorsements (None, Learner, Full), riding days toward the practical test, demerit point bar and suspension stamp.
- GM Registry tab: edit card details, issue licences, issue fines from the offence table, Community Service, remove demerits, end suspensions.
- Demerits drop off and suspensions end on their own as the world clock moves (Seasons & Stars or core time).
- Discord notices to #mount-registry through a webhook.
- Ways in: actor sheet header, actor sidebar right-click, token controls button, Shift+P, and a macro API.
