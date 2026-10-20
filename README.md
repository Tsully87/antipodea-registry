# Antipodea Trainer Registry

Digital Trainer Cards and Riding Licences for the Antipodea Pokémon Westmarch, shown on an in-game phone in Foundry VTT v13.

## What it does

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
reg.open("Trainer Name");            // opens their phone
reg.open("Trainer Name", "licence"); // straight to the licence
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
