# Changelog

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
