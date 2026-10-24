# Pokémon Phone

The in-game phone for the Antipodea Pokémon Westmarch in Foundry VTT v13. (Module ID: `antipodea-registry`.)

## Apps

- **Messages:** text other trainers. Open an NPC's phone to text as them. Attach photos.
- **Contacts:** everyone's number, plus the Antipodea directory (player trainers and NPCs you mark as listed).
- **PokéGram, PokéTube, TikTogepi:** social apps with profiles, follows, likes, comments, reposts, DMs, @mentions, #hashtags and Trending. Fan engagement grows on the world clock. Each can mirror new posts to its own Discord channel.
- **Camera:** snap what you can see on the map, or upload a picture.
- **Gallery:** view, post, send or delete photos.
- **Calendar:** month view on the world clock, reminders, and GM public events.
- **Trainer Card** and **Licence** (below).
- **App Store** (Rotom Phones only): buy paid apps with the trainer's money.
- **Registry:** GM only. Card, licence, fines and the phone settings for that trainer.

### Paid apps
| App | Default price | What it does |
|---|---|---|
| Translator | $1,500 | Speak through the phone; posts to chat marked as translated into the chosen language. |
| Weather | $500 | Today's and tomorrow's weather for your zone, from the Antipodea Weather macro. |
| Pro Camera | $1,000 | Filters, sharper photos, Pro badge on posts, +1 Contest Introduction for promo content. |
| PokéMaps | $750 | Region map with every town, your location, distance and travel days (1 Capability = 1 km/h, 8 hrs a day). City maps with labelled spots for places you've been. |
| PokéPay | $250 | Balance, send money to other trainers, history. No transfers between one player's characters. |
| Mart Express | $500 | Order items from the "Poké Mart" Items folder at +25%, delivered after 1 in-game day. |

Prices are in the **App Store: prices** setting. Tick or untick apps in a trainer's Registry tab to give or remove them for free.

### Setting up the paid apps
- **PokéMaps:** set **PokéMaps: map image** to your Region Map. The pins are pre-loaded for every city and town. Set each trainer's location in their Registry tab, or open PokéMaps on their phone, tap a place and hit **Put them here**. Use **Edit pins** then click the map to add places.
- **City maps:** upload the town or city map to your Forge assets. In PokéMaps, tap the place, hit **Add city map** and pick the image. Open it, hit **Edit spots** and click the map to drop labelled spots (Pokémon Centre, Gym, Mart, Police, Registry, Transport, Food, Landmark, Danger and more), each with a note players see when they tap it. Trainers can only open a city map once they've been there: anywhere you've put them with **Put them here** or their Registry location counts, and it stays unlocked after they leave.
- **Mart Express:** make an Items folder called **Poké Mart** (subfolders become shop sections). Anything in it with a cost can be ordered.
- **Weather:** add this block to your **ANTIPODEA WEATHER** macro, on the line just above `if (isAuto) {`:

```js
// --- Antipodea Phone: Weather app forecast ---
if (scope?.forecast) {
  const key = Object.keys(ZONES).find((k) => ZONES[k].name === scope.forecast.zone) ?? Object.keys(ZONES)[0];
  return scope.forecast.dates.map((d) => chatCard([rollDay(key, d ?? date)], dateText(d ?? date)));
}
```


### Rotom Phones
Tick **Rotom Phone** in a trainer's Registry tab. Their phone glows orange, their Rotom sits on the home screen, and you can type in **Rotom says** to pop a message up on their screen. Their replies come to you.

### Without a GM online
Texts, DMs, all three social apps, follows, reminders, App Store purchases and the Weather app work with nobody else logged in. They're saved in the **📱 Pokémon Phone Network** journal, which every player owns. Don't delete or edit it.

- **Photos:** turn on **Upload New Files** for Players (Game Settings > Configure Permissions) so phones can upload them directly. Without it, photos wait for a GM.
- **PokéPay and Mart Express:** queue while no GM is on and go through when one logs in.
- **Discord posts:** sent when a GM next logs in.
- **Weather:** the GM's browser saves a week of forecasts each time it's on.

Whichever GM is online does the queued work, so a bot GM account can take this over later.

## Registry

- **Trainer Card:** photo, Trainer ID, Home Town, Tier and 12 badge slots.
- **Riding Licence:** Land, Water and Sky endorsements (None, Learner, Full), riding days logged toward the practical test, demerit points and suspensions.
- **Demerits run on the world clock.** Points drop off after 30 in-game days and suspensions end after 14, automatically, whenever you advance time in Seasons & Stars.
- **Discord notices** to #mount-registry for permits, licences, fines, suspensions and cleared points.

## Opening the phone

- **Players:** the phone button in the token controls, Shift+P, or the Phone button on their character sheet. It opens their selected token's trainer, or their assigned character.
- **GM:** right-click a trainer in the Actors sidebar and pick *Open Phone*, or use the sheet button. The **Registry** tab (GM only) is where you edit everything.

## Macros and Stream Deck

```js
const reg = game.modules.get("antipodea-registry").api;
reg.open("Trainer Name");               // opens their phone
reg.open("Trainer Name", "licence");    // straight to an app
reg.text("Jax Harlow", "Tazz", "lol");  // text as an NPC
reg.rotomSay("Tazz", "Oi! Look out!");  // speak as their Rotom
reg.openMine();                      // GM gets a picker
reg.testDiscord();                   // posts a test message to the webhook
```

## Settings

| Setting | Default |
|---|---|
| Demerit point limit | 6 |
| Suspension length | 14 in-game days |
| Points expire after | 30 in-game days |
| Badge names | Badge 1 to Badge 12, separated by commas |
| Post to Discord | On |
| Discord webhook URL | Stored on your user only |
| Phone: default contacts | Professor Manuka |
| Phone: PokéGram / Camera / reminders need a Rotom Phone | Off / Off / On |
| Phone: post social apps to Discord | On |
| Phone: PokéGram / PokéTube / TikTogepi Discord webhook URLs | Stored on your user only, blank skips that app |
| Phone: pop up new social posts | On (per player) |
| App Store: prices | translator=1500, weather=500, procamera=1000, pokemaps=750, pokepay=250, mart=500 |
| Translator: languages | Kantonian, Johtonian, Hoennian, Sinnohan, Unovan, Kalosian, Alolan, Galarian, Paldean |
| Weather: macro name | ANTIPODEA WEATHER |
| PokéMaps: map image / km per pixel | none / 4.11 |
| Mart Express: folder / markup / delivery days | Poké Mart / 25% / 1 |
| Phone: notification sound | On (per player) |

## Offence table

| Offence | Fine | Points |
|---|---|---|
| Learner breach | $500 | 1 |
| Reckless riding in a town or city | $750 | 2 |
| Mounted battle inside a town or city | $1,000 | 3 |
| Riding while suspended | $2,000 | Remaining suspension doubles |
| Riding without a permit or licence (Land / Water) | $1,000, doubles each repeat | n/a |
| Riding without a permit or licence (Sky) | $2,500, doubles each repeat | n/a |
| Other | You set it | You set it |

## Antipodea Weather macro

The weather macro lives in `macros/antipodea-weather.js`. To install or update it in Foundry:

1. Make a new **Script** macro, paste in everything from `macros/install-weather-update.js` and run it as the GM.
2. It downloads the weather macro for this release, checks it arrived intact, backs up your current one, keeps your Discord webhook, and adds the **Mount Kahikatea** and **Antipodea Earthquake** macros.
3. A whispered chat message lists what it did.

Emergency alerts reach a player's phone when their trainer's phone location (set with **Put them here** in PokéMaps or in the Registry tab) is in the affected weather zone.

## Releasing an update

1. Bump nothing by hand. Push your changes to `main`.
2. On GitHub, go to **Releases > Draft a new release**, create a tag like `v1.0.1`, and publish.
3. The release workflow stamps the version into `module.json`, zips the module and attaches both.
4. In Foundry (or The Forge), the module shows an update. Click update.

Install URL for Foundry or The Forge:

```
https://github.com/<your-username>/<repo-name>/releases/latest/download/module.json
```
