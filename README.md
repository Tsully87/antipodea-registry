# Antipodea Trainer Registry

The in-game phone for the Antipodea Pokémon Westmarch in Foundry VTT v13.

## Apps

- **Messages:** text other trainers. Open an NPC's phone to text as them. Attach photos.
- **Contacts:** everyone's number, plus the Antipodea directory (player trainers and NPCs you mark as listed).
- **PokéGram:** shared photo feed with likes and comments, mirrored to Discord if you set a webhook.
- **Camera:** snap what you can see on the map, or upload a picture.
- **Gallery:** view, post, send or delete photos.
- **Calendar:** month view on the world clock, reminders, and GM public events.
- **Trainer Card** and **Licence** (below).
- **Registry:** GM only. Card, licence, fines and the phone settings for that trainer.

### Rotom Phones
Tick **Rotom Phone** in a trainer's Registry tab. Their phone glows orange, their Rotom sits on the home screen, and you can type in **Rotom says** to pop a message up on their screen. Their replies come to you.

### Needs a GM online
Texts, posts and photos are saved by the GM's client. If no GM is logged in, phones show **No signal** and can only read.

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
| Phone: post PokéGram to Discord | On |
| Phone: PokéGram Discord webhook URL | Stored on your user only |
| Phone: pop up new PokéGram posts | On (per player) |
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

## Releasing an update

1. Bump nothing by hand. Push your changes to `main`.
2. On GitHub, go to **Releases > Draft a new release**, create a tag like `v1.0.1`, and publish.
3. The release workflow stamps the version into `module.json`, zips the module and attaches both.
4. In Foundry (or The Forge), the module shows an update. Click update.

Install URL for Foundry or The Forge:

```
https://github.com/<your-username>/<repo-name>/releases/latest/download/module.json
```
