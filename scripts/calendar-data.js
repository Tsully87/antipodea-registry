/**
 * The Antipodea Calendar: homebrew events for the Seasons & Stars "antipodea-gregorian"
 * calendar (calendar.js). Keeps the Gregorian month/weekday names and structure, but
 * carries none of S&S's built-in real-world holidays — this is the full replacement list,
 * locked 29 Oct 2026 (see the vault's "Antipodea Calendar.md" for the design writeup).
 *
 * kind: "major" -> gets the full treatment (Discord day-of post, upcoming heads-up, phone
 *       calendar). kind: "founders" -> phone calendar only, no Discord post, so the channel
 *       doesn't fill up with 35 minor civic anniversaries.
 */

export const ANTIPODEA_EVENTS = [
  /* ---------------- 15 major festivals ---------------- */
  {
    id: "turning-tide", name: "Turning Tide", kind: "major",
    description: "New year, start of summer. Beach bonfires and fireworks over the water up and down the coast — Bunya City's is the biggest, on Bunya Pine Park foreshore.",
    recurrence: { type: "fixed", month: 1, day: 1 },
    visibility: "player-visible", color: "#2e8b57", icon: "fa-solid fa-fire"
  },
  {
    id: "budgie-beach-carnival", name: "Budgie Beach Carnival", kind: "major",
    description: "Peak summer beach festival at Budgie Beach — surf contests, Water-type exhibition battles, a sandcastle competition judged by a Contest judge for a laugh.",
    recurrence: { type: "fixed", month: 1, day: 17 }, duration: "3d",
    visibility: "player-visible", color: "#ff9f1c", icon: "fa-solid fa-umbrella-beach"
  },
  {
    id: "autumn-muster", name: "Autumn Muster", kind: "major",
    description: "Big agricultural show season kicks off — produce, livestock, and Pokémon contests for farm-suited types (Grass, Normal, Ground). Travels between towns all month, so different towns host different weekends of it.",
    recurrence: { type: "fixed", month: 3, day: 1 }, duration: "31d",
    visibility: "player-visible", color: "#a98743", icon: "fa-solid fa-wheat-awn"
  },
  {
    id: "drop-bear-day", name: "Drop Bear Day", kind: "major",
    description: "A region-wide prank day aimed squarely at the Southern Hand's nickname — fake \"drop bear sighting\" pranks, joke warning posters, novelty \"drop bear repellent\" sold at Poké Marts for the day. Comedic, not tied to any real Southern Hand activity.",
    recurrence: { type: "fixed", month: 4, day: 1 },
    visibility: "player-visible", color: "#6d4c41", icon: "fa-solid fa-face-grin-tongue-wink"
  },
  {
    id: "lantern-night", name: "Lantern Night", kind: "major",
    description: "Autumn evening festival, paper lanterns shaped like Pokémon floated on rivers and harbours. Quiet, reflective, popular with couples and families.",
    recurrence: { type: "fixed", month: 4, day: 14 },
    visibility: "player-visible", color: "#f4a261", icon: "fa-solid fa-lightbulb"
  },
  {
    id: "shearing-festival", name: "Shearing Festival", kind: "major",
    description: "Rural festival, sheep-station country (inland towns). Shearing competitions, wool-craft stalls, and a Pokémon herding contest.",
    recurrence: { type: "fixed", month: 5, day: 1 },
    visibility: "player-visible", color: "#cbb994", icon: "fa-solid fa-scissors"
  },
  {
    id: "longest-night", name: "Longest Night", kind: "major",
    description: "Winter solstice. Bonfires, hot food stalls, and in the far south (Snowgum High Country, Tussock Plains) an actual aurora-watching tradition — \"Southern Lights.\"",
    recurrence: { type: "fixed", month: 6, day: 21 },
    visibility: "player-visible", color: "#355c7d", icon: "fa-solid fa-star"
  },
  {
    id: "gym-circuit-kickoff", name: "Gym Circuit Kickoff", kind: "major",
    description: "Gyms around the region hold open exhibition matches all week to kick off the year's badge season with fanfare. This is ceremonial, not a gate — gyms stay open for real challenges year-round, Kickoff or not.",
    recurrence: { type: "fixed", month: 7, day: 1 }, duration: "7d",
    visibility: "player-visible", color: "#e76f51", icon: "fa-solid fa-trophy"
  },
  {
    id: "frost-fair", name: "Frost Fair", kind: "major",
    description: "Alpine winter carnival at the snow zones — skiing, snowball Pokémon battles (no real damage, just for fun), hot chocolate stalls.",
    recurrence: { type: "fixed", month: 7, day: 24 }, duration: "3d",
    visibility: "player-visible", color: "#a8dadc", icon: "fa-solid fa-snowflake"
  },
  {
    id: "wattle-bloom", name: "Wattle Bloom", kind: "major",
    description: "Spring wildflower festival as the wattle comes into bloom region-wide. Flower crowns, Grass/Fairy-type showcases, picnic culture.",
    recurrence: { type: "fixed", month: 9, day: 1 },
    visibility: "player-visible", color: "#e9c46a", icon: "fa-solid fa-seedling"
  },
  {
    id: "grand-contest-festival", name: "Grand Contest Festival", kind: "major",
    description: "The single biggest Contest event of the year, rotating between the 8 Contest cities on a cycle. Huge crowds, the year's best Coordinators.",
    recurrence: { type: "fixed", month: 9, day: 18 }, duration: "3d",
    visibility: "player-visible", color: "#c77dff", icon: "fa-solid fa-star-of-david"
  },
  {
    id: "founders-bunya-city", name: "Founders' Day (Bunya City)", kind: "major",
    description: "Anniversary of Bunya City's founding. Parades, markets, fireworks over the Croc Shed.",
    recurrence: { type: "fixed", month: 10, day: 1 },
    visibility: "player-visible", color: "#2a9d8f", icon: "fa-solid fa-city"
  },
  {
    id: "hatch-day", name: "Hatch Day", kind: "major",
    description: "Celebrates the Croc Shed and every breeder in the region — public tours, egg-hatching demonstrations, a region-wide \"guess the egg\" competition.",
    recurrence: { type: "fixed", month: 10, day: 15 },
    visibility: "player-visible", color: "#f6bd60", icon: "fa-solid fa-egg"
  },
  {
    id: "elite-four-tournament", name: "Elite Four Tournament", kind: "major",
    description: "The year's championship tournament at Silver Fern Plateau. Whoever's holding all 8 badges by this date is slotted into that year's bracket; broadcast region-wide and the closest thing Antipodea has to a national sporting final. Earning your 8th badge later doesn't cost you a shot at glory forever — you're just in next November's tournament instead.",
    recurrence: { type: "fixed", month: 11, day: 1 }, duration: "4d",
    visibility: "player-visible", color: "#9d0208", icon: "fa-solid fa-crown"
  },
  {
    id: "stocktake-sale", name: "Stocktake Sale", kind: "major",
    description: "End-of-year sales across every Poké Mart in the region — discounted gear, old stock cleared out before the new year. More a shopping event than a festival, but popular.",
    recurrence: { type: "fixed", month: 12, day: 15 }, duration: "7d",
    visibility: "player-visible", color: "#588157", icon: "fa-solid fa-tags"
  },

  /* ---------------- 35 city and town Founders' Days ---------------- */
  { id: "founders-jandal-cove", name: "Founders' Day (Jandal Cove)", kind: "founders", description: "Jandal Cove's founding anniversary.", recurrence: { type: "fixed", month: 1, day: 6 }, visibility: "player-visible", color: "#8d6e63", icon: "fa-solid fa-city" },
  { id: "founders-stoked-city", name: "Founders' Day (Stoked City)", kind: "founders", description: "Stoked City's founding anniversary.", recurrence: { type: "fixed", month: 1, day: 12 }, visibility: "player-visible", color: "#8d6e63", icon: "fa-solid fa-city" },
  { id: "founders-banksia-city", name: "Founders' Day (Banksia City)", kind: "founders", description: "Banksia City's founding anniversary.", recurrence: { type: "fixed", month: 2, day: 10 }, visibility: "player-visible", color: "#8d6e63", icon: "fa-solid fa-city" },
  { id: "founders-lilly-pilly-town", name: "Founders' Day (Lilly Pilly Town)", kind: "founders", description: "Lilly Pilly Town's founding anniversary.", recurrence: { type: "fixed", month: 2, day: 15 }, visibility: "player-visible", color: "#8d6e63", icon: "fa-solid fa-city" },
  { id: "founders-billabong-bend", name: "Founders' Day (Billabong Bend)", kind: "founders", description: "Billabong Bend's founding anniversary.", recurrence: { type: "fixed", month: 2, day: 19 }, visibility: "player-visible", color: "#8d6e63", icon: "fa-solid fa-city" },
  { id: "founders-bonza-bay", name: "Founders' Day (Bonza Bay)", kind: "founders", description: "Bonza Bay's founding anniversary.", recurrence: { type: "fixed", month: 2, day: 22 }, visibility: "player-visible", color: "#8d6e63", icon: "fa-solid fa-city" },
  { id: "founders-mangrove-point", name: "Founders' Day (Mangrove Point)", kind: "founders", description: "Mangrove Point's founding anniversary.", recurrence: { type: "fixed", month: 3, day: 3 }, visibility: "player-visible", color: "#8d6e63", icon: "fa-solid fa-city" },
  { id: "founders-woop-woop", name: "Founders' Day (Woop Woop)", kind: "founders", description: "Woop Woop's founding anniversary.", recurrence: { type: "fixed", month: 3, day: 4 }, visibility: "player-visible", color: "#8d6e63", icon: "fa-solid fa-city" },
  { id: "founders-jarrah-city", name: "Founders' Day (Jarrah City)", kind: "founders", description: "Jarrah City's founding anniversary.", recurrence: { type: "fixed", month: 3, day: 16 }, visibility: "player-visible", color: "#8d6e63", icon: "fa-solid fa-city" },
  { id: "founders-ironbark", name: "Founders' Day (Ironbark)", kind: "founders", description: "Ironbark's founding anniversary.", recurrence: { type: "fixed", month: 3, day: 17 }, visibility: "player-visible", color: "#8d6e63", icon: "fa-solid fa-city" },
  { id: "founders-kauri-city", name: "Founders' Day (Kauri City)", kind: "founders", description: "Kauri City's founding anniversary.", recurrence: { type: "fixed", month: 4, day: 12 }, visibility: "player-visible", color: "#8d6e63", icon: "fa-solid fa-city" },
  { id: "founders-budgie-beach", name: "Founders' Day (Budgie Beach)", kind: "founders", description: "Budgie Beach's founding anniversary.", recurrence: { type: "fixed", month: 4, day: 20 }, visibility: "player-visible", color: "#8d6e63", icon: "fa-solid fa-city" },
  { id: "founders-marri-vale", name: "Founders' Day (Marri Vale)", kind: "founders", description: "Marri Vale's founding anniversary.", recurrence: { type: "fixed", month: 4, day: 24 }, visibility: "player-visible", color: "#8d6e63", icon: "fa-solid fa-city" },
  { id: "founders-fair-dinkum-city", name: "Founders' Day (Fair Dinkum City)", kind: "founders", description: "Fair Dinkum City's founding anniversary.", recurrence: { type: "fixed", month: 5, day: 3 }, visibility: "player-visible", color: "#8d6e63", icon: "fa-solid fa-city" },
  { id: "founders-huon-pine-city", name: "Founders' Day (Huon Pine City)", kind: "founders", description: "Huon Pine City's founding anniversary.", recurrence: { type: "fixed", month: 5, day: 9 }, visibility: "player-visible", color: "#8d6e63", icon: "fa-solid fa-city" },
  { id: "founders-leatherwood", name: "Founders' Day (Leatherwood)", kind: "founders", description: "Leatherwood's founding anniversary.", recurrence: { type: "fixed", month: 5, day: 20 }, visibility: "player-visible", color: "#8d6e63", icon: "fa-solid fa-city" },
  { id: "founders-coolibah-crossing", name: "Founders' Day (Coolibah Crossing)", kind: "founders", description: "Coolibah Crossing's founding anniversary.", recurrence: { type: "fixed", month: 6, day: 7 }, visibility: "player-visible", color: "#8d6e63", icon: "fa-solid fa-city" },
  { id: "founders-black-stump-city", name: "Founders' Day (Black Stump City)", kind: "founders", description: "Black Stump City's founding anniversary.", recurrence: { type: "fixed", month: 6, day: 14 }, visibility: "player-visible", color: "#8d6e63", icon: "fa-solid fa-city" },
  { id: "founders-paperbark-city", name: "Founders' Day (Paperbark City)", kind: "founders", description: "Paperbark City's founding anniversary.", recurrence: { type: "fixed", month: 6, day: 23 }, visibility: "player-visible", color: "#8d6e63", icon: "fa-solid fa-city" },
  { id: "founders-gumboot-plains", name: "Founders' Day (Gumboot Plains)", kind: "founders", description: "Gumboot Plains' founding anniversary.", recurrence: { type: "fixed", month: 6, day: 30 }, visibility: "player-visible", color: "#8d6e63", icon: "fa-solid fa-city" },
  { id: "founders-hard-yakka-city", name: "Founders' Day (Hard Yakka City)", kind: "founders", description: "Hard Yakka City's founding anniversary.", recurrence: { type: "fixed", month: 7, day: 11 }, visibility: "player-visible", color: "#8d6e63", icon: "fa-solid fa-city" },
  { id: "founders-servo-siding", name: "Founders' Day (Servo Siding)", kind: "founders", description: "Servo Siding's founding anniversary.", recurrence: { type: "fixed", month: 7, day: 27 }, visibility: "player-visible", color: "#8d6e63", icon: "fa-solid fa-city" },
  { id: "founders-gidgee-rock", name: "Founders' Day (Gidgee Rock)", kind: "founders", description: "Gidgee Rock's founding anniversary.", recurrence: { type: "fixed", month: 7, day: 29 }, visibility: "player-visible", color: "#8d6e63", icon: "fa-solid fa-city" },
  { id: "founders-ridgy-didge", name: "Founders' Day (Ridgy Didge)", kind: "founders", description: "Ridgy Didge's founding anniversary.", recurrence: { type: "fixed", month: 8, day: 1 }, visibility: "player-visible", color: "#8d6e63", icon: "fa-solid fa-city" },
  { id: "founders-snow-gum-city", name: "Founders' Day (Snow Gum City)", kind: "founders", description: "Snow Gum City's founding anniversary.", recurrence: { type: "fixed", month: 8, day: 2 }, visibility: "player-visible", color: "#8d6e63", icon: "fa-solid fa-city" },
  { id: "founders-boab-city", name: "Founders' Day (Boab City)", kind: "founders", description: "Boab City's founding anniversary.", recurrence: { type: "fixed", month: 8, day: 18 }, visibility: "player-visible", color: "#8d6e63", icon: "fa-solid fa-city" },
  { id: "founders-waratah-city", name: "Founders' Day (Waratah City)", kind: "founders", description: "Waratah City's founding anniversary.", recurrence: { type: "fixed", month: 9, day: 5 }, visibility: "player-visible", color: "#8d6e63", icon: "fa-solid fa-city" },
  { id: "founders-rimu-falls", name: "Founders' Day (Rimu Falls)", kind: "founders", description: "Rimu Falls' founding anniversary.", recurrence: { type: "fixed", month: 9, day: 16 }, visibility: "player-visible", color: "#8d6e63", icon: "fa-solid fa-city" },
  { id: "founders-kangaroo-paw-city", name: "Founders' Day (Kangaroo Paw City)", kind: "founders", description: "Kangaroo Paw City's founding anniversary.", recurrence: { type: "fixed", month: 9, day: 23 }, visibility: "player-visible", color: "#8d6e63", icon: "fa-solid fa-city" },
  { id: "founders-galah-flats", name: "Founders' Day (Galah Flats)", kind: "founders", description: "Galah Flats' founding anniversary.", recurrence: { type: "fixed", month: 10, day: 13 }, visibility: "player-visible", color: "#8d6e63", icon: "fa-solid fa-city" },
  { id: "founders-miro-sound", name: "Founders' Day (Miro Sound)", kind: "founders", description: "Miro Sound's founding anniversary.", recurrence: { type: "fixed", month: 10, day: 29 }, visibility: "player-visible", color: "#8d6e63", icon: "fa-solid fa-city" },
  { id: "founders-kawakawa-harbour", name: "Founders' Day (Kawakawa Harbour)", kind: "founders", description: "Kawakawa Harbour's founding anniversary.", recurrence: { type: "fixed", month: 11, day: 11 }, visibility: "player-visible", color: "#8d6e63", icon: "fa-solid fa-city" },
  { id: "founders-sweet-as-city", name: "Founders' Day (Sweet As City)", kind: "founders", description: "Sweet As City's founding anniversary.", recurrence: { type: "fixed", month: 11, day: 28 }, visibility: "player-visible", color: "#8d6e63", icon: "fa-solid fa-city" },
  { id: "founders-matai-isle", name: "Founders' Day (Matai Isle)", kind: "founders", description: "Matai Isle's founding anniversary.", recurrence: { type: "fixed", month: 12, day: 8 }, visibility: "player-visible", color: "#8d6e63", icon: "fa-solid fa-city" },
  { id: "founders-totara-ridge", name: "Founders' Day (Tōtara Ridge)", kind: "founders", description: "Tōtara Ridge's founding anniversary.", recurrence: { type: "fixed", month: 12, day: 23 }, visibility: "player-visible", color: "#8d6e63", icon: "fa-solid fa-city" }
];

export const MAJOR_EVENTS = ANTIPODEA_EVENTS.filter((e) => e.kind === "major");
export const FOUNDERS_EVENTS = ANTIPODEA_EVENTS.filter((e) => e.kind === "founders");
