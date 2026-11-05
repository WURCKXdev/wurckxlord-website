/*
 * Combat data for the damage / rotation calculator.
 *
 * PREVIEW DATA like skills-data.js: cooldowns, cast times and formulas are
 * placeholders until synced with the server's skill tables.
 *
 * Entry: skillId: [kind, cooldownSec, castSec, options]
 *   "hit"    physical: weapon attack x {key}% x hits (x ticks)
 *   "spell"  magic: ({key} + magic power x coef) x hits (x ticks)
 *   "buff"   self buff for options.dur seconds: { stat, key, dur }
 *   "debuff" on target for options.dur seconds: { stat, key, dur }
 *   "passive" always-on bonus from the skill's current level: { stat, key }
 *   "util"   no damage (heals, stuns, summons) - still takes time in a rotation
 * Stats: "atk" physical dmg %, "md" magic dmg %, "dmg" all dmg %,
 *        "crit" crit chance %, "cd" crit damage %, "taken" target dmg taken %,
 *        "def" target damage reduction removed (percentage points)
 * Skills not listed here are passives with no damage effect.
 */
window.ARCH_DAMAGE = {
  baseStats: { weapon: 500, magic: 400, crit: 10, critDmg: 150, reduction: 20 },
  spellCoef: 1.0,     // magic power added to every spell hit
  minStepSec: 0.5     // shortest time a cast can take in the timeline
};

window.ARCH_COMBAT = {
  knight: {
    slash: ["hit", 6, 1], taunt: ["util", 15, 0.5], vigor: ["util", 60, 1],
    charge: ["util", 12, 0.5], bulwark: ["util", 40, 0.5], cleave: ["hit", 10, 1.2],
    oath: ["util", 90, 1], judgment: ["hit", 30, 1.5]
  },
  archer: {
    shot: ["hit", 5, 1], multi: ["util", 8, 1], focus: ["buff", 60, 1, { stat: "crit", key: "crit", dur: 300 }],
    snare: ["util", 15, 0.5], pierce: ["hit", 9, 1], evade: ["util", 40, 0.5],
    rain: ["hit", 30, 1.5, { ticks: 5 }], deadeye: ["passive", 0, 0, { stat: "cd", key: "cd" }]
  },
  mage: {
    bolt: ["spell", 3, 1], ice: ["spell", 6, 1.2], heal: ["util", 4, 1.5], barrier: ["util", 30, 1],
    chain: ["util", 10, 1.5], focus: ["passive", 0, 0, { stat: "md", key: "md" }],
    bless: ["buff", 120, 1.5, { stat: "dmg", key: "st", dur: 600 }],
    meteor: ["spell", 40, 2.5], revive: ["util", 120, 3]
  },
  berserker: {
    smash: ["hit", 5, 1], roar: ["buff", 60, 1, { stat: "atk", key: "atk", dur: 300 }],
    whirl: ["hit", 8, 1], leap: ["util", 15, 0.5], frenzy: ["util", 60, 0.5],
    rend: ["hit", 12, 1], slaughter: ["hit", 30, 1.5], undying: ["util", 180, 0.5]
  },
  hunter: {
    shot: ["hit", 5, 1], poison: ["spell", 10, 1], trap: ["util", 20, 1],
    instinct: ["buff", 60, 1, { stat: "crit", key: "crit", dur: 300 }], volley: ["util", 10, 1],
    hide: ["util", 60, 0.5], draw: ["passive", 0, 0, { stat: "atk", key: "dmg" }],
    storm: ["hit", 30, 1.5, { ticks: 5 }], kill: ["hit", 25, 1]
  },
  sorcerer: {
    spirit: ["spell", 3, 1], curse: ["debuff", 15, 1, { stat: "def", key: "def", dur: 15 }],
    mend: ["util", 4, 1.5], drain: ["spell", 8, 1], ward: ["util", 120, 1.5], fear: ["util", 30, 1],
    dark: ["passive", 0, 0, { stat: "md", key: "md" }], plague: ["spell", 40, 2], spirits: ["util", 120, 2]
  },
  swashbuckler: {
    lunge: ["hit", 5, 1], combo: ["hit", 7, 1, { hits: 2 }], dance: ["util", 60, 0.5],
    blind: ["util", 25, 0.5], flurry: ["hit", 15, 1.5, { hits: 5 }],
    shadow: ["buff", 20, 0.5, { stat: "crit", key: "crit", dur: 5 }], eclipse: ["hit", 30, 1.5],
    lunar: ["buff", 90, 0.5, { stat: "dmg", key: "dmg", dur: 20 }]
  },
  ranger: {
    arrow: ["hit", 5, 1], entangle: ["util", 20, 0.5],
    mark: ["debuff", 20, 0.5, { stat: "taken", key: "dmg", dur: 15 }], nature: ["util", 60, 1],
    split: ["util", 10, 1], sharp: ["passive", 0, 0, { stat: "cd", key: "cd" }],
    gale: ["hit", 15, 1], star: ["hit", 40, 2], spirit: ["util", 120, 1]
  },
  elementalist: {
    spark: ["spell", 3, 1], attune: ["passive", 0, 0, { stat: "md", key: "dmg" }], water: ["spell", 5, 1],
    shield: ["util", 30, 1], earth: ["spell", 8, 1.2], storm: ["spell", 30, 1.5, { ticks: 5 }],
    summon: ["util", 90, 2], cata: ["spell", 50, 3],
    avatar: ["buff", 120, 1, { stat: "md", key: "md", dur: 30 }]
  },
  slayer: {
    claw: ["hit", 5, 1], tail: ["hit", 8, 1], fury: ["buff", 60, 1, { stat: "atk", key: "atk", dur: 300 }],
    dive: ["hit", 15, 1], breath: ["hit", 12, 1.2], ascend: ["buff", 120, 0.5, { stat: "dmg", key: "dmg", dur: 20 }]
  },
  obiterator: {
    orb: ["spell", 3, 1], focus: ["passive", 0, 0, { stat: "crit", key: "crit" }], burst: ["spell", 6, 1],
    veil: ["util", 30, 1], ray: ["spell", 12, 1.5], power: ["passive", 0, 0, { stat: "cd", key: "cd" }],
    nova: ["spell", 40, 2.5], oblit: ["spell", 90, 3]
  },
  summoner: {
    whelp: ["util", 30, 2], heal: ["util", 4, 1.5], drake: ["util", 60, 2.5], command: ["util", 60, 0.5],
    elder: ["util", 300, 3], swarm: ["util", 90, 2]
  }
};
