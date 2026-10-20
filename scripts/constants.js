export const MODULE_ID = "antipodea-registry";
export const FLAG = "record";

export const TIERS = ["Poké", "Great", "Ultra", "Master"];

export const ENDORSEMENTS = {
  land: { label: "Land", icon: "fa-paw", daysNeeded: 3 },
  water: { label: "Water", icon: "fa-water", daysNeeded: 4 },
  sky: { label: "Sky", icon: "fa-feather", daysNeeded: 6 }
};

export const STATUS_LABELS = { none: "None", learner: "Learner", full: "Full" };

/**
 * Offences from the Riding Licences rules.
 * kind: "demerit" adds points, "unlicensed" doubles per repeat with no points,
 * "suspended" doubles the remaining suspension, "custom" uses the GM's numbers.
 */
export const OFFENCES = {
  learner: {
    label: "Learner breach (no L-plates, carrying a passenger, Sky Learner unsupervised)",
    short: "Learner breach",
    kind: "demerit", fine: 500, points: 1
  },
  reckless: {
    label: "Reckless riding in a town or city",
    short: "Reckless riding",
    kind: "demerit", fine: 750, points: 2
  },
  battle: {
    label: "Mounted battle inside a town or city",
    short: "Mounted battle",
    kind: "demerit", fine: 1000, points: 3
  },
  suspended: {
    label: "Riding while suspended",
    short: "Riding while suspended",
    kind: "suspended", fine: 2000, points: 0
  },
  unlicensedLand: {
    label: "Riding without a permit or licence (Land / Water)",
    short: "Riding without a permit or licence",
    kind: "unlicensed", fine: 1000, points: 0
  },
  unlicensedSky: {
    label: "Riding without a permit or licence (Sky)",
    short: "Riding without a permit or licence (Sky)",
    kind: "unlicensed", fine: 2500, points: 0
  },
  custom: {
    label: "Other (set your own fine and points)",
    short: "Offence",
    kind: "custom", fine: 0, points: 0
  }
};

export const DEFAULT_BADGES = [
  "Badge 1", "Badge 2", "Badge 3", "Badge 4", "Badge 5", "Badge 6",
  "Badge 7", "Badge 8", "Badge 9", "Badge 10", "Badge 11", "Badge 12"
];

export function defaultRecord() {
  return {
    trainerId: "",
    homeTown: "",
    tier: "Poké",
    photo: "",
    badges: [],
    licenceNo: "",
    licences: {
      land: { status: "none", issued: null, office: "", days: 0 },
      water: { status: "none", issued: null, office: "", days: 0 },
      sky: { status: "none", issued: null, office: "", days: 0 }
    },
    demerits: [],
    suspendedUntil: null,
    unlicensedFines: 0
  };
}
