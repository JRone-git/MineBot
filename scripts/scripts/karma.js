import { world, Player } from "@minecraft/server";

// Simple-first: award +25 karma to the player who killed a hostile mob.
// Hostile set covers common vanilla mobs and the BoB wizard.
const HOSTILE_TYPES = new Set([
  // Undead / common overworld hostiles
  "minecraft:zombie",
  "minecraft:zombie_villager",
  "minecraft:zombie_villager_v2",
  "minecraft:husk",
  "minecraft:drowned",
  "minecraft:skeleton",
  "minecraft:stray",
  "minecraft:wither_skeleton",
  // Arthropods / creeps
  "minecraft:spider",
  "minecraft:cave_spider",
  "minecraft:creeper",
  "minecraft:enderman",
  "minecraft:silverfish",
  "minecraft:endermite",
  // Nether
  "minecraft:blaze",
  "minecraft:ghast",
  "minecraft:magma_cube",
  "minecraft:hoglin",
  "minecraft:zoglin",
  "minecraft:piglin_brute",
  // Illagers / witches / raid mobs
  "minecraft:witch",
  "minecraft:evoker",
  "minecraft:vindicator",
  "minecraft:pillager",
  "minecraft:vex",
  "minecraft:ravager",
  // Aquatic
  "minecraft:guardian",
  "minecraft:elder_guardian",
  // End / late game
  "minecraft:shulker",
  // Night flyers
  "minecraft:phantom",
  // Better on Bedrock wizard (BoB pack)
  "better_on_bedrock:lonely_wizard",
]);

const OBJECTIVE = "karma";

function ensureObjective() {
  try {
    // Try to add; ignore failure if it already exists
    world.getDimension("overworld").runCommandAsync(`scoreboard objectives add ${OBJECTIVE} dummy Karma`).catch(()=>{});
  } catch {}
}

try {
  world.afterEvents.worldInitialize.subscribe(() => {
    ensureObjective();
  });
} catch {}

try {
  world.afterEvents.entityDie.subscribe(({ damageSource, deadEntity }) => {
    try {
      if (!deadEntity) return;
      const killer = damageSource?.damagingEntity;
      if (!(killer instanceof Player)) return;
      const id = String(deadEntity.typeId || "");
      if (!HOSTILE_TYPES.has(id)) return;
      // Award karma to killer (with multiplier)
      const baseKarma = 25;
      const finalKarma = globalThis.LABS_applyKarmaMultiplier ? globalThis.LABS_applyKarmaMultiplier(baseKarma) : baseKarma;
      try { killer.runCommandAsync?.(`scoreboard players add @s ${OBJECTIVE} ${finalKarma}`).catch(()=>{}); } catch {}
    } catch {}
  });
} catch {}
