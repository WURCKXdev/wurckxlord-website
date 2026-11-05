/*
 * WurckxLord skill builder data.
 *
 * PREVIEW DATA: skill names, values and requirements below are placeholders
 * modelled on the Archlord class layout. Replace them with values exported
 * from the server's skill templates before treating builds as accurate.
 *
 * Skill tuple format (kept compact so whole trees are easy to edit):
 *   [id, name, type, maxLevel, reqCharLevel, levelStep, prereqs, description, scale]
 *
 *   type        "active" | "passive" | "buff"
 *   reqCharLevel character level needed for skill level 1
 *   levelStep   extra character levels needed per further skill level
 *   prereqs     { otherSkillId: requiredLevel } (or null)
 *   description text with {key} tokens filled from `scale`
 *   scale       { key: [valueAtLv1, gainPerLevel] }
 *
 * Every skill level costs one skill point.
 */
window.ARCH_RULES = {
  maxLevel: 99,
  startingPoints: 1,   // points at character level 1
  pointsPerLevel: 1    // points gained per level after 1
};

window.ARCH_RACES = [
  {
    id: "human", name: "Human", classes: [
      { id: "knight", name: "Knight", role: "Tank · Melee", color: "#c9a45c", skills: [
        ["slash", "Heavy Slash", "active", 10, 1, 3, null, "Strikes for {dmg}% weapon damage.", { dmg: [130, 12] }],
        ["guard", "Shield Mastery", "passive", 10, 4, 4, null, "Increases block rate by {blk}%.", { blk: [3, 1.5] }],
        ["taunt", "Provoke", "active", 5, 8, 6, { slash: 3 }, "Forces nearby enemies to attack you for {dur}s.", { dur: [4, 1] }],
        ["vigor", "Iron Vigor", "buff", 10, 12, 4, { guard: 3 }, "Raises max HP by {hp}% for 10 min.", { hp: [5, 2] }],
        ["charge", "Rushing Charge", "active", 10, 18, 4, { slash: 5 }, "Dashes to a target and stuns for {dur}s.", { dur: [1, 0.2] }],
        ["bulwark", "Bulwark", "buff", 10, 26, 4, { vigor: 3 }, "Reduces damage taken by {red}% for 20s.", { red: [8, 2] }],
        ["cleave", "Cleaving Arc", "active", 10, 34, 4, { charge: 5 }, "Hits all enemies in front for {dmg}% weapon damage.", { dmg: [110, 10] }],
        ["armor", "Plate Discipline", "passive", 10, 40, 4, { guard: 7 }, "Increases physical defense by {def}%.", { def: [4, 2] }],
        ["oath", "Oath of the Lord", "buff", 5, 60, 8, { bulwark: 5, armor: 5 }, "Party gains {def}% defense for 30s.", { def: [10, 4] }],
        ["judgment", "Final Judgment", "active", 5, 75, 6, { cleave: 7 }, "Crushing blow for {dmg}% weapon damage.", { dmg: [420, 60] }]
      ]},
      { id: "archer", name: "Archer", role: "Ranged DPS", color: "#7fbf6a", skills: [
        ["shot", "Power Shot", "active", 10, 1, 3, null, "Fires an arrow for {dmg}% damage.", { dmg: [125, 12] }],
        ["eye", "Hawk Eye", "passive", 10, 4, 4, null, "Increases attack range by {rng} m.", { rng: [1, 0.5] }],
        ["multi", "Multi Shot", "active", 10, 10, 4, { shot: 3 }, "Hits up to {n} targets.", { n: [2, 0.4] }],
        ["focus", "Focus", "buff", 10, 14, 4, { eye: 3 }, "Raises critical rate by {crit}% for 5 min.", { crit: [3, 1] }],
        ["snare", "Snare Arrow", "active", 5, 20, 6, { shot: 5 }, "Roots the target for {dur}s.", { dur: [2, 0.5] }],
        ["swift", "Swift Draw", "passive", 10, 28, 4, { focus: 3 }, "Increases attack speed by {spd}%.", { spd: [3, 1] }],
        ["pierce", "Piercing Arrow", "active", 10, 36, 4, { multi: 5 }, "Pierces in a line for {dmg}% damage.", { dmg: [160, 14] }],
        ["evade", "Wind Step", "buff", 10, 45, 4, { swift: 3 }, "Increases evasion by {ev}% for 20s.", { ev: [6, 2] }],
        ["rain", "Arrow Rain", "active", 5, 65, 6, { pierce: 5 }, "Area barrage for {dmg}% damage per second.", { dmg: [90, 15] }],
        ["deadeye", "Deadeye", "passive", 5, 80, 6, { focus: 7, swift: 5 }, "Critical damage +{cd}%.", { cd: [10, 5] }]
      ]},
      { id: "mage", name: "Mage", role: "Caster · Support", color: "#6aa8e0", skills: [
        ["bolt", "Fire Bolt", "active", 10, 1, 3, null, "Deals {dmg} fire damage.", { dmg: [60, 22] }],
        ["mind", "Arcane Mind", "passive", 10, 4, 4, null, "Increases max MP by {mp}%.", { mp: [4, 2] }],
        ["ice", "Frost Lance", "active", 10, 8, 4, { bolt: 3 }, "Deals {dmg} cold damage and slows.", { dmg: [70, 24] }],
        ["heal", "Restoration", "active", 10, 12, 4, { mind: 3 }, "Restores {hp} HP to an ally.", { hp: [120, 40] }],
        ["barrier", "Mana Barrier", "buff", 10, 20, 4, { mind: 5 }, "Absorbs {abs} damage.", { abs: [200, 60] }],
        ["chain", "Chain Lightning", "active", 10, 30, 4, { ice: 5 }, "Jumps between {n} targets.", { n: [3, 0.3] }],
        ["focus", "Spell Focus", "passive", 10, 38, 4, { chain: 3 }, "Magic damage +{md}%.", { md: [3, 1.5] }],
        ["bless", "Blessing", "buff", 10, 44, 4, { heal: 5 }, "Party gains {st}% all stats for 10 min.", { st: [2, 1] }],
        ["meteor", "Meteor", "active", 5, 70, 6, { chain: 7, focus: 5 }, "Area impact for {dmg} damage.", { dmg: [900, 180] }],
        ["revive", "Resurrection", "active", 5, 60, 8, { bless: 5 }, "Revives an ally with {hp}% HP.", { hp: [20, 15] }]
      ]}
    ]
  },
  {
    id: "orc", name: "Orc", classes: [
      { id: "berserker", name: "Berserker", role: "Melee DPS", color: "#d0634e", skills: [
        ["smash", "Brutal Smash", "active", 10, 1, 3, null, "Strikes for {dmg}% weapon damage.", { dmg: [140, 13] }],
        ["rage", "Blood Rage", "passive", 10, 4, 4, null, "Attack +{atk}% when below 50% HP.", { atk: [4, 2] }],
        ["roar", "War Roar", "buff", 10, 10, 4, { rage: 3 }, "Attack power +{atk}% for 5 min.", { atk: [4, 1.5] }],
        ["whirl", "Whirlwind", "active", 10, 16, 4, { smash: 5 }, "Spins for {dmg}% damage to nearby enemies.", { dmg: [100, 10] }],
        ["leap", "Savage Leap", "active", 5, 24, 6, { smash: 5 }, "Leaps to target, knocking down for {dur}s.", { dur: [1, 0.4] }],
        ["hide", "Thick Hide", "passive", 10, 30, 4, { rage: 5 }, "Max HP +{hp}%.", { hp: [3, 1.5] }],
        ["frenzy", "Frenzy", "buff", 10, 40, 4, { roar: 5 }, "Attack speed +{spd}% for 30s.", { spd: [8, 2] }],
        ["rend", "Rend", "active", 10, 48, 4, { whirl: 5 }, "Bleeds for {dmg}% damage over 8s.", { dmg: [200, 20] }],
        ["slaughter", "Slaughter", "active", 5, 72, 6, { rend: 5, leap: 3 }, "Massive hit for {dmg}% damage.", { dmg: [450, 70] }],
        ["undying", "Undying", "buff", 3, 85, 7, { hide: 7, frenzy: 5 }, "Cannot drop below 1 HP for {dur}s.", { dur: [3, 1] }]
      ]},
      { id: "hunter", name: "Hunter", role: "Ranged DPS", color: "#a7b04d", skills: [
        ["shot", "Bone Arrow", "active", 10, 1, 3, null, "Fires for {dmg}% damage.", { dmg: [125, 12] }],
        ["track", "Tracking", "passive", 10, 4, 4, null, "Accuracy +{acc}%.", { acc: [3, 1.5] }],
        ["poison", "Venom Shot", "active", 10, 10, 4, { shot: 3 }, "Poisons for {dmg} damage over 10s.", { dmg: [150, 45] }],
        ["trap", "Spiked Trap", "active", 5, 16, 6, { track: 3 }, "Trap roots enemies for {dur}s.", { dur: [2, 0.6] }],
        ["instinct", "Predator Instinct", "buff", 10, 24, 4, { track: 5 }, "Critical rate +{crit}% for 5 min.", { crit: [3, 1] }],
        ["volley", "Volley", "active", 10, 32, 4, { poison: 5 }, "Hits up to {n} targets.", { n: [3, 0.4] }],
        ["hide", "Camouflage", "buff", 5, 40, 6, { trap: 3 }, "Stealth for {dur}s.", { dur: [8, 3] }],
        ["draw", "Heavy Draw", "passive", 10, 46, 4, { instinct: 3 }, "Ranged damage +{dmg}%.", { dmg: [3, 1.5] }],
        ["storm", "Bone Storm", "active", 5, 68, 6, { volley: 5, draw: 3 }, "Barrage for {dmg}% damage per second.", { dmg: [95, 15] }],
        ["kill", "Killshot", "active", 5, 82, 6, { storm: 3 }, "Execute for {dmg}% damage below 30% HP.", { dmg: [500, 80] }]
      ]},
      { id: "sorcerer", name: "Sorcerer", role: "Caster · Curse", color: "#a46ad0", skills: [
        ["spirit", "Spirit Bolt", "active", 10, 1, 3, null, "Deals {dmg} magic damage.", { dmg: [60, 22] }],
        ["totem", "Totem Lore", "passive", 10, 4, 4, null, "MP regen +{mp}%.", { mp: [5, 2] }],
        ["curse", "Weakness Curse", "active", 10, 8, 4, { spirit: 3 }, "Target defense -{def}% for 15s.", { def: [5, 1.5] }],
        ["mend", "Spirit Mend", "active", 10, 14, 4, { totem: 3 }, "Restores {hp} HP.", { hp: [110, 38] }],
        ["drain", "Life Drain", "active", 10, 22, 4, { curse: 3 }, "Steals {dmg} HP.", { dmg: [80, 26] }],
        ["ward", "Ancestral Ward", "buff", 10, 30, 4, { mend: 5 }, "Party magic defense +{def}% for 10 min.", { def: [4, 2] }],
        ["fear", "Terror", "active", 5, 40, 6, { curse: 5 }, "Fears the target for {dur}s.", { dur: [2, 0.5] }],
        ["dark", "Dark Pact", "passive", 10, 46, 4, { drain: 5 }, "Magic damage +{md}%.", { md: [3, 1.5] }],
        ["plague", "Plague", "active", 5, 66, 6, { drain: 7, dark: 3 }, "Area curse dealing {dmg} damage over 12s.", { dmg: [800, 160] }],
        ["spirits", "Call of Ancestors", "active", 3, 84, 7, { ward: 7, plague: 3 }, "Summons {n} spirits for 30s.", { n: [2, 1] }]
      ]}
    ]
  },
  {
    id: "moonelf", name: "Moon Elf", classes: [
      { id: "swashbuckler", name: "Swashbuckler", role: "Melee · Agile", color: "#5fc6c0", skills: [
        ["lunge", "Lunge", "active", 10, 1, 3, null, "Strikes for {dmg}% damage.", { dmg: [130, 12] }],
        ["grace", "Moon Grace", "passive", 10, 4, 4, null, "Evasion +{ev}%.", { ev: [3, 1.5] }],
        ["combo", "Twin Strike", "active", 10, 10, 4, { lunge: 3 }, "Two hits of {dmg}% damage.", { dmg: [80, 8] }],
        ["dance", "Blade Dance", "buff", 10, 16, 4, { grace: 3 }, "Attack speed +{spd}% for 5 min.", { spd: [4, 1.5] }],
        ["parry", "Riposte", "passive", 10, 24, 4, { combo: 3 }, "{ch}% chance to counter.", { ch: [3, 1] }],
        ["blind", "Moonflash", "active", 5, 32, 6, { grace: 5 }, "Blinds for {dur}s.", { dur: [2, 0.5] }],
        ["flurry", "Flurry", "active", 10, 42, 4, { combo: 5 }, "Five hits of {dmg}% damage.", { dmg: [45, 5] }],
        ["shadow", "Shadow Step", "active", 5, 50, 6, { blind: 3 }, "Teleports behind target, +{crit}% crit.", { crit: [20, 10] }],
        ["eclipse", "Eclipse", "active", 5, 72, 6, { flurry: 5, shadow: 3 }, "Area slash for {dmg}% damage.", { dmg: [380, 60] }],
        ["lunar", "Lunar Fury", "buff", 3, 85, 7, { dance: 7, parry: 5 }, "All damage +{dmg}% for 20s.", { dmg: [15, 7] }]
      ]},
      { id: "ranger", name: "Ranger", role: "Ranged · Control", color: "#8fd17d", skills: [
        ["arrow", "Moon Arrow", "active", 10, 1, 3, null, "Fires for {dmg}% damage.", { dmg: [125, 12] }],
        ["wind", "Wind Sense", "passive", 10, 4, 4, null, "Movement speed +{ms}%.", { ms: [2, 1] }],
        ["entangle", "Entangle", "active", 5, 10, 6, { arrow: 3 }, "Roots for {dur}s.", { dur: [2, 0.6] }],
        ["mark", "Hunter's Mark", "active", 10, 16, 4, { wind: 3 }, "Target takes +{dmg}% damage.", { dmg: [4, 1.5] }],
        ["nature", "Nature's Gift", "buff", 10, 24, 4, { wind: 5 }, "HP regen +{hp}/s for 10 min.", { hp: [5, 3] }],
        ["split", "Split Arrow", "active", 10, 32, 4, { mark: 3 }, "Splits into {n} arrows.", { n: [2, 0.4] }],
        ["sharp", "Keen Sight", "passive", 10, 40, 4, { mark: 5 }, "Critical damage +{cd}%.", { cd: [4, 2] }],
        ["gale", "Gale Shot", "active", 5, 50, 6, { entangle: 3, split: 3 }, "Knockback and {dmg}% damage.", { dmg: [180, 25] }],
        ["star", "Starfall", "active", 5, 70, 6, { split: 7, sharp: 3 }, "Area barrage for {dmg}% damage.", { dmg: [100, 16] }],
        ["spirit", "Forest Spirit", "buff", 3, 84, 7, { nature: 7 }, "Party evasion +{ev}% for 30s.", { ev: [10, 5] }]
      ]},
      { id: "elementalist", name: "Elementalist", role: "Caster · Elemental", color: "#7d8ff0", skills: [
        ["spark", "Spark", "active", 10, 1, 3, null, "Deals {dmg} lightning damage.", { dmg: [62, 22] }],
        ["attune", "Attunement", "passive", 10, 4, 4, null, "Elemental damage +{dmg}%.", { dmg: [2, 1] }],
        ["water", "Water Whip", "active", 10, 8, 4, { spark: 3 }, "Deals {dmg} water damage.", { dmg: [70, 24] }],
        ["shield", "Elemental Shield", "buff", 10, 14, 4, { attune: 3 }, "Absorbs {abs} damage.", { abs: [180, 55] }],
        ["earth", "Earth Spike", "active", 10, 22, 4, { water: 3 }, "Deals {dmg} and stuns 1s.", { dmg: [90, 28] }],
        ["flow", "Mana Flow", "passive", 10, 30, 4, { attune: 5 }, "Cast speed +{cs}%.", { cs: [2, 1] }],
        ["storm", "Thunderstorm", "active", 10, 40, 4, { earth: 5 }, "Area damage {dmg} per second.", { dmg: [60, 18] }],
        ["summon", "Elemental Servant", "active", 5, 50, 6, { shield: 5 }, "Summons a servant with {hp} HP.", { hp: [1500, 600] }],
        ["cata", "Cataclysm", "active", 5, 72, 6, { storm: 7, flow: 5 }, "Massive area damage {dmg}.", { dmg: [950, 190] }],
        ["avatar", "Elemental Avatar", "buff", 3, 86, 7, { summon: 3, cata: 1 }, "Magic damage +{md}% for 30s.", { md: [20, 8] }]
      ]}
    ]
  },
  {
    id: "scion", name: "Dragon Scion", classes: [
      { id: "slayer", name: "Slayer", role: "Melee DPS", color: "#e08a4f", skills: [
        ["claw", "Dragon Claw", "active", 10, 1, 3, null, "Strikes for {dmg}% damage.", { dmg: [135, 13] }],
        ["blood", "Dragon Blood", "passive", 10, 4, 4, null, "Max HP +{hp}%.", { hp: [3, 1.5] }],
        ["tail", "Tail Sweep", "active", 10, 12, 4, { claw: 3 }, "Area sweep for {dmg}% damage.", { dmg: [100, 10] }],
        ["fury", "Draconic Fury", "buff", 10, 20, 4, { blood: 3 }, "Attack +{atk}% for 5 min.", { atk: [4, 1.5] }],
        ["scale", "Hardened Scales", "passive", 10, 30, 4, { blood: 5 }, "Defense +{def}%.", { def: [3, 1.5] }],
        ["dive", "Wyrm Dive", "active", 5, 40, 6, { tail: 5 }, "Leap for {dmg}% damage, stun 1s.", { dmg: [220, 30] }],
        ["breath", "Flame Breath", "active", 10, 50, 4, { fury: 5 }, "Cone for {dmg}% damage.", { dmg: [160, 15] }],
        ["ascend", "Ascension", "buff", 3, 80, 7, { breath: 7, scale: 5 }, "All damage +{dmg}% for 20s.", { dmg: [15, 7] }]
      ]},
      { id: "obiterator", name: "Obiterator", role: "Ranged · Burst", color: "#d9c25a", skills: [
        ["orb", "Chaos Orb", "active", 10, 1, 3, null, "Deals {dmg} damage.", { dmg: [65, 22] }],
        ["focus", "Dragon Focus", "passive", 10, 4, 4, null, "Critical rate +{crit}%.", { crit: [2, 1] }],
        ["burst", "Orb Burst", "active", 10, 12, 4, { orb: 3 }, "Explodes for {dmg} area damage.", { dmg: [80, 24] }],
        ["veil", "Dragon Veil", "buff", 10, 20, 4, { focus: 3 }, "Absorbs {abs} damage.", { abs: [180, 55] }],
        ["ray", "Annihilation Ray", "active", 10, 34, 4, { burst: 5 }, "Line beam for {dmg} damage.", { dmg: [140, 40] }],
        ["power", "Overcharge", "passive", 10, 44, 4, { focus: 5 }, "Critical damage +{cd}%.", { cd: [4, 2] }],
        ["nova", "Chaos Nova", "active", 5, 70, 6, { ray: 7, power: 3 }, "Area blast for {dmg} damage.", { dmg: [900, 180] }],
        ["oblit", "Obliteration", "active", 3, 85, 7, { nova: 3 }, "Single target {dmg} damage.", { dmg: [2200, 600] }]
      ]},
      { id: "summoner", name: "Summoner", role: "Pets · Support", color: "#c46ab0", skills: [
        ["whelp", "Summon Whelp", "active", 10, 1, 3, null, "Summons a whelp with {hp} HP.", { hp: [400, 150] }],
        ["bond", "Soul Bond", "passive", 10, 4, 4, null, "Summon damage +{dmg}%.", { dmg: [3, 1.5] }],
        ["heal", "Draconic Mend", "active", 10, 10, 4, { bond: 3 }, "Heals for {hp}.", { hp: [110, 38] }],
        ["drake", "Summon Drake", "active", 10, 24, 4, { whelp: 5 }, "Summons a drake with {hp} HP.", { hp: [1200, 300] }],
        ["command", "Command", "buff", 10, 32, 4, { bond: 5 }, "Summon attack speed +{spd}% for 30s.", { spd: [8, 2] }],
        ["link", "Life Link", "passive", 10, 42, 4, { heal: 5 }, "Share {sh}% damage with summons.", { sh: [5, 2] }],
        ["elder", "Summon Elder Dragon", "active", 3, 75, 7, { drake: 7, command: 5 }, "Summons an elder dragon for {dur}s.", { dur: [20, 10] }],
        ["swarm", "Brood Swarm", "active", 5, 60, 6, { whelp: 7 }, "Summons {n} whelps for 15s.", { n: [3, 1] }]
      ]}
    ]
  }
];
