// LABS - Biome Bomb (Creeping Biome Transformation)
import { world, system, ItemStack } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

// Track active biome bombs: blockKey -> { dim, x, y, z, biome, radius, maxRadius, player }
const ACTIVE_BOMBS = new Map();

// Helper to check if Biome Bomb is enabled
function isBiomeBombEnabled() {
  try {
    const FEATURE_FLAGS_KEY = "labs_feature_flags";
    const raw = world.getDynamicProperty?.(FEATURE_FLAGS_KEY);
    const flags = raw && typeof raw === 'string' ? JSON.parse(raw) : {};
    const enabled = flags?.biomeBomb;
    return enabled === false ? false : true; // default enabled
  } catch {
    return true; // default enabled if error
  }
}

// Biome configurations
const BIOMES = {
  plains: {
    name: "§2Plains",
    icon: "🌾",
    surface: "minecraft:grass_block",
    subsurface: "minecraft:dirt",
    plants: ["minecraft:tall_grass", "minecraft:poppy", "minecraft:dandelion", "minecraft:azure_bluet"],
    trees: "oak",
    particle: "minecraft:crop_growth_emitter",
    color: "§a"
  },
  desert: {
    name: "§6Desert",
    icon: "🏜️",
    surface: "minecraft:sand",
    subsurface: "minecraft:sandstone",
    plants: ["minecraft:cactus", "minecraft:dead_bush"],
    trees: null,
    particle: "minecraft:falling_dust_sand_particle",
    color: "§e"
  },
  snow: {
    name: "§f§lSnow Tundra",
    icon: "❄️",
    surface: "minecraft:snow",
    subsurface: "minecraft:snow",
    underLayer: "minecraft:dirt",
    plants: ["minecraft:fern"],
    trees: "spruce",
    freezeWater: true,
    particle: "minecraft:snowflake_particle",
    color: "§b"
  },
  jungle: {
    name: "§2§lJungle",
    icon: "🌴",
    surface: "minecraft:grass_block",
    subsurface: "minecraft:dirt",
    plants: ["minecraft:fern", "minecraft:large_fern", "minecraft:jungle_sapling", "minecraft:bamboo"],
    trees: "jungle",
    particle: "minecraft:crop_growth_emitter",
    color: "§2"
  },
  bamboo_jungle: {
    name: "§2§lBamboo Jungle",
    icon: "🎋",
    surface: "minecraft:grass_block",
    subsurface: "minecraft:dirt",
    // Weight bamboo heavily by repeating it
    plants: ["minecraft:bamboo","minecraft:bamboo","minecraft:bamboo","minecraft:bamboo","minecraft:jungle_sapling","minecraft:fern"],
    trees: "jungle",
    particle: "minecraft:crop_growth_emitter",
    color: "§2"
  },
  swamp: {
    name: "§8Swamp",
    icon: "🌿",
    surface: "minecraft:grass_block",
    subsurface: "minecraft:dirt",
    plants: ["minecraft:lily_pad", "minecraft:brown_mushroom", "minecraft:red_mushroom", "minecraft:mangrove_propagule"],
    trees: "mangrove",
    particle: "minecraft:villager_happy",
    color: "§2",
    postGeneration: "mangroves"
  },
  taiga: {
    name: "§9Taiga",
    icon: "🌲",
    surface: "minecraft:grass_block",
    subsurface: "minecraft:dirt",
    plants: ["minecraft:fern", "minecraft:sweet_berry_bush"],
    trees: "spruce",
    particle: "minecraft:crop_growth_emitter",
    color: "§2"
  },
  savanna: {
    name: "§eGolden Savanna",
    icon: "🦁",
    surface: "minecraft:grass_block",
    subsurface: "minecraft:dirt",
    plants: ["minecraft:tall_grass", "minecraft:acacia_sapling"],
    trees: "acacia",
    particle: "minecraft:falling_dust_dragon_egg_particle",
    color: "§6"
  },
  mushroom: {
    name: "§d§lMushroom Island",
    icon: "🍄",
    surface: "minecraft:mycelium",
    subsurface: "minecraft:dirt",
    plants: ["minecraft:red_mushroom", "minecraft:brown_mushroom"],
    trees: "huge_mushroom",
    particle: "minecraft:villager_happy",
    color: "§d"
  },
  cherry: {
    name: "§dCherry Grove",
    icon: "🌸",
    surface: "minecraft:grass_block",
    subsurface: "minecraft:dirt",
    plants: ["minecraft:pink_petals", "minecraft:cherry_sapling"],
    trees: "cherry",
    particle: "minecraft:cherry_leaves_particle",
    color: "§d"
  },
  badlands: {
    name: "§c§lBadlands",
    icon: "🏔️",
    surface: "minecraft:red_sand",
    subsurface: "minecraft:terracotta",
    plants: ["minecraft:dead_bush"],
    trees: null,
    particle: "minecraft:falling_dust_red_sand_particle",
    color: "§c"
  },
  sculk_egg: {
    name: "§0§l§nSculk Egg",
    icon: "🥚",
    special: "egg",
    shell: "minecraft:sculk",
    shellThickness: 2,
    eggWidth: 20,
    eggHeight: 20,
    particle: "minecraft:soul_particle",
    glowParticle: "minecraft:sculk_soul_particle",
    color: "§0",
    interiorBlocks: {
      "minecraft:sculk_sensor": 4,
      "minecraft:sculk_shrieker": 3,
      "minecraft:sculk_catalyst": 4
    }
  }
};

// Post-generation animal spawns per SURFACE biome (2 of each), with safe fallbacks
const BIOME_ANIMALS = {
  plains: ["minecraft:cow","minecraft:sheep","minecraft:horse"],
  desert: ["minecraft:camel","minecraft:rabbit"],
  snow: ["minecraft:polar_bear","minecraft:rabbit"],
  jungle: ["minecraft:ocelot","minecraft:parrot","minecraft:panda","minecraft:bee"],
  bamboo_jungle: ["minecraft:ocelot","minecraft:parrot","minecraft:panda","minecraft:bee"],
  swamp: ["minecraft:slime","minecraft:frog","minecraft:bee"],
  taiga: ["minecraft:wolf","minecraft:fox"],
  savanna: ["minecraft:horse","minecraft:llama"],
  mushroom: ["minecraft:mooshroom"],
  cherry: ["minecraft:bee","minecraft:rabbit"],
  badlands: ["minecraft:rabbit"],
};

function trySpawn(dim, id, px, py, pz){
  try{
    // Prefer API spawn; fallback to command
    try { dim.spawnEntity(id, { x: px, y: py, z: pz }); return; } catch {}
    dim.runCommandAsync(`summon ${id} ${Math.floor(px)} ${Math.floor(py)} ${Math.floor(pz)}`).catch(()=>{});
  }catch{}
}

function findGround(dim, px, py, pz){
  // Search downward first for ground, then a bit upward
  try{
    for (let y=py+8; y>=py-40; y--){
      try{
        const b=dim.getBlock({x:px,y:y,z:pz}); if(!b) continue;
        const isSolid = !b.isAir && String(b.typeId||"")!=="minecraft:water";
        const above = dim.getBlock({x:px,y:y+1,z:pz});
        if (isSolid && above && above.isAir) return y+1;
      }catch{}
    }
  }catch{}
  return py; // fallback
}

function spawnBiomeAnimals(dim, cx, cy, cz, biomeKey){
  try{
    const list = BIOME_ANIMALS[biomeKey];
    if (!Array.isArray(list) || !list.length) return;
    // Spawn in a small ring around center
    let angle = 0;
    for (const id of list){
      const isPanda = id === 'minecraft:panda';
      const count = biomeKey === 'bamboo_jungle' ? (isPanda ? 6 : 2)
                   : biomeKey === 'jungle' ? (isPanda ? 3 : 2)
                   : 2;
      for (let n=0;n<count;n++){
        angle += Math.PI/4;
        const r = 6 + (n*2);
        const px = Math.floor(cx + Math.cos(angle)*r);
        const pz = Math.floor(cz + Math.sin(angle)*r);
        const py = findGround(dim, px, cy, pz);
        trySpawn(dim, id, px+0.5, py, pz+0.5);
      }
    }
  }catch{}
}

// Underground biome configurations (30+ blocks below surface)
const UNDERGROUND_BIOMES = {
  mushroom_cavern: {
    name: "§d§lMushroom Cavern",
    icon: "🍄",
    underground: true,
    floor: "minecraft:mycelium",
    ceiling: "minecraft:shroomlight",
    walls: "minecraft:mossy_stone_bricks",
    fillBlock: "minecraft:air",
    features: {
      mushrooms: ["minecraft:red_mushroom", "minecraft:brown_mushroom"],
      lights: "minecraft:glowstone",
      vines: "minecraft:glow_lichen",
      berryVines: true
    },
    particle: "minecraft:villager_happy",
    glowParticle: "minecraft:soul_particle",
    color: "§d",
    postGeneration: "giant_mushrooms"
  },
  crystal_geode: {
    name: "§b§l§nCrystal Geode",
    icon: "💎",
    underground: true,
    floor: "minecraft:calcite",
    ceiling: "minecraft:budding_amethyst",
    walls: "minecraft:smooth_basalt",
    fillBlock: "minecraft:air",
    features: {
      crystals: "minecraft:amethyst_cluster",
      pillars: "minecraft:amethyst_block",
      stalactites: "minecraft:pointed_dripstone",
      accent: "minecraft:copper_ore"
    },
    particle: "minecraft:enchanting_table_particle",
    glowParticle: "minecraft:electric_spark_particle",
    color: "§b"
  },
  verdant_oasis: {
    name: "§2§l§nVerdant Oasis",
    icon: "🌿",
    underground: true,
    floor: "minecraft:moss_block",
    ceiling: "minecraft:moss_block",
    walls: "minecraft:stone",
    fillBlock: "minecraft:air",
    features: {
      plants: ["minecraft:azalea", "minecraft:flowering_azalea", "minecraft:small_dripleaf"],
      vines: "minecraft:cave_vines",
      spores: "minecraft:spore_blossom",
      moss: "minecraft:moss_carpet",
      grass: ["minecraft:short_grass", "minecraft:fern"]
    },
    particle: "minecraft:crop_growth_emitter",
    glowParticle: "minecraft:cherry_leaves_particle",
    color: "§2"
  },
  sculk_egg_underground: {
    name: "§0§l§nSculk Egg",
    icon: "🥚",
    special: "egg",
    underground: true,
    shell: "minecraft:sculk",
    shellThickness: 2,
    eggWidth: 20,
    eggHeight: 20,
    particle: "minecraft:soul_particle",
    glowParticle: "minecraft:sculk_soul_particle",
    color: "§0",
    interiorBlocks: {
      "minecraft:sculk_sensor": 4,
      "minecraft:sculk_shrieker": 3,
      "minecraft:sculk_catalyst": 4
    }
  }
};

// Listen for gold block placement
world.afterEvents.playerPlaceBlock.subscribe(ev => {
  try {
    const { block, player } = ev;
    if (!block || !player) return;
    if (block.typeId !== "myname:biome_bomb") return;
    
    // Check if Biome Bomb is enabled
    if (!isBiomeBombEnabled()) {
      // Biome bomb is disabled - just let it be a normal gold block
      return;
    }
    
    const blockKey = `${block.dimension.id}_${block.x}_${block.y}_${block.z}`;
    
    // Prevent multiple activations on same block
    if (ACTIVE_BOMBS.has(blockKey)) return;
    
    // Check if underground (30+ blocks below surface)
    system.runTimeout(() => {
      const isUnderground = checkIfUnderground(block);
      if (isUnderground) {
        showUndergroundBiomeMenu(player, block);
      } else {
        showBiomeMenu(player, block);
      }
    }, 5);
    
  } catch (err) {
    console.warn("Biome bomb placement error:", err);
  }
});

function checkIfUnderground(block) {
  try {
    const dim = block.dimension;
    const startY = block.y;
    
    // Scan upward to find surface (sky exposure)
    for (let y = startY + 1; y <= 320; y++) {
      try {
        const checkBlock = dim.getBlock({ x: block.x, y, z: block.z });
        if (!checkBlock) continue;
        
        // Found air block - check if there's clear sky above (10 blocks of air)
        if (checkBlock.isAir) {
          let clearSky = true;
          for (let skyCheck = y; skyCheck < y + 10; skyCheck++) {
            const skyBlock = dim.getBlock({ x: block.x, y: skyCheck, z: block.z });
            if (!skyBlock || !skyBlock.isAir) {
              clearSky = false;
              break;
            }
          }
          
          if (clearSky) {
            // Found surface - calculate depth
            const depth = y - startY;
            return depth >= 30; // Underground if 30+ blocks below surface
          }
        }
      } catch {}
    }
    
    // If we couldn't find surface within reasonable range, assume underground
    return startY < 60; // Below y=60 is probably underground
  } catch {
    return false;
  }
}

function scanForChests(dim, centerX, centerY, centerZ, radius, isUnderground) {
  try {
    // Check for chests in the affected area
    const scanRadius = Math.ceil(radius);
    
    for (let dx = -scanRadius; dx <= scanRadius; dx++) {
      for (let dz = -scanRadius; dz <= scanRadius; dz++) {
        const horizontalDist = Math.sqrt(dx * dx + dz * dz);
        if (horizontalDist > scanRadius) continue;
        
        // For underground, check the dome height; for surface, check ±10
        const yStart = isUnderground ? centerY - 5 : centerY - 10;
        const yEnd = isUnderground ? centerY + 25 : centerY + 10;
        
        for (let checkY = yStart; checkY <= yEnd; checkY++) {
          try {
            const block = dim.getBlock({ x: centerX + dx, y: checkY, z: centerZ + dz });
            if (!block) continue;
            
            const blockId = block.typeId || "";
            // Check for any storage blocks (chests, barrels, shulker boxes, etc.)
            if (blockId === "minecraft:chest" || blockId === "minecraft:trapped_chest" || 
                blockId === "minecraft:barrel" || blockId === "minecraft:ender_chest" ||
                blockId.includes("shulker_box")) {
              return true; // Chest found!
            }
          } catch {}
        }
      }
    }
    
    return false; // No chests found
  } catch {
    return false;
  }
}

function showUndergroundBiomeMenu(player, block) {
  try {
    // PROTECTION: Scan for chests FIRST
    const hasChests = scanForChests(block.dimension, block.x, block.y, block.z, 25, true);
    if (hasChests) {
      // Silently reject and return gold block
      player.sendMessage("§6This biome is not accessible here. Please find another spot.§r");
      system.runTimeout(() => {
        try {
          block.setType("minecraft:air");
          const bombBlock = new ItemStack("myname:biome_bomb", 1);
          const inv = player.getComponent("inventory")?.container;
          const leftover = inv?.addItem?.(goldBlock);
          if (leftover) player.dimension.spawnItem(leftover, player.location);
        } catch {}
      }, 1);
      return;
    }
    
    const form = new ActionFormData()
      .title("§6§l💣 UNDERGROUND BIOME BOMB §r")
      .body("§8⬇ You are deep underground! ⬇§r\n§7Select underground cavern biome:§r");
    
    const biomeKeys = Object.keys(UNDERGROUND_BIOMES);
    for (const key of biomeKeys) {
      const biome = UNDERGROUND_BIOMES[key];
      form.button(`${biome.color}${biome.icon} ${biome.name}§r\n§8Spherical transformation§r`);
    }
    form.button("§c§l✖ CANCEL§r\n§7Remove bomb§r");
    
    form.show(player).then(res => {
      if (!res || res.canceled) {
        try { block.setType("minecraft:air"); } catch {}
        return;
      }
      
      if (res.selection === biomeKeys.length) {
        try { 
          block.setType("minecraft:air");
          player.sendMessage("§6§lBiome Bomb:§r §7Cancelled and removed.§r");
        } catch {}
        return;
      }
      
      const selectedBiome = biomeKeys[res.selection];
      startUndergroundBiomeBomb(player, block, selectedBiome);
      
    }).catch(() => {});
    
  } catch (err) {
    console.warn("Underground biome menu error:", err);
  }
}

function showBiomeMenu(player, block) {
  try {
    // PROTECTION: Scan for chests FIRST
    const hasChests = scanForChests(block.dimension, block.x, block.y, block.z, 30, false);
    if (hasChests) {
      // Silently reject and return gold block
      player.sendMessage("§6This biome is not accessible here. Please find another spot.§r");
      system.runTimeout(() => {
        try {
          block.setType("minecraft:air");
          const bombBlock = new ItemStack("myname:biome_bomb", 1);
          const inv = player.getComponent("inventory")?.container;
          const leftover = inv?.addItem?.(goldBlock);
          if (leftover) player.dimension.spawnItem(leftover, player.location);
        } catch {}
      }, 1);
      return;
    }
    
    // Single modal: toggle at top + biome dropdown
    const biomeKeys = Object.keys(BIOMES);
    const labels = biomeKeys.map(k=>{ const b=BIOMES[k]; return `${b.color}${b.icon} ${b.name}§r`; });
    const mf = new ModalFormData().title("§6§l💣 SURFACE BIOME BOMB §r")
      .toggle("§eSurface-only mode§r (for difficult terrains)", false)
      .dropdown("Biome", labels, 0)
      .toggle("§cCancel (remove bomb)", false);
    mf.show(player).then(res=>{
      if(!res||res.canceled){ try{ block.setType("minecraft:air"); }catch{} return; }
      const surfaceOnly = !!(res.formValues?.[0]);
      const idx = Number(res.formValues?.[1]||0)|0;
      const cancel = !!(res.formValues?.[2]);
      if (cancel){ try{ block.setType("minecraft:air"); player.sendMessage("§6§lBiome Bomb:§r §7Cancelled and removed.§r"); }catch{} return; }
      const selectedBiome = biomeKeys[idx] || biomeKeys[0];
      startBiomeBomb(player, block, selectedBiome, surfaceOnly);
    }).catch(()=>{});
    
  } catch (err) {
    console.warn("Biome menu error:", err);
  }
}

async function startBiomeBomb(player, block, biomeKey, surfaceOnly=false) {
  try {
    const biome = BIOMES[biomeKey];
    const dim = block.dimension;
    const blockKey = `${dim.id}_${block.x}_${block.y}_${block.z}`;
    
    // Check if this is a SPECIAL egg biome
    if (biome.special === "egg") {
      startSculkEggBomb(player, block, biome, blockKey);
      return;
    }
    
    player.sendMessage(`§6§l💣 BIOME BOMB ARMED!§r ${biome.color}${biome.icon} ${biome.name}§r`);
    player.sendMessage("§e§lCOUNTDOWN INITIATED...§r");
    
    // 10 second countdown with effects
    for (let i = 10; i > 0; i--) {
      // Check if block still exists
      try {
        const checkBlock = dim.getBlock({ x: block.x, y: block.y, z: block.z });
        if (!checkBlock || checkBlock.typeId !== "myname:biome_bomb") {
          player.sendMessage("§6§lBiome Bomb:§r §cDefused! Block was removed.§r");
          return;
        }
      } catch {
        player.sendMessage("§6§lBiome Bomb:§r §cDefused! Block was removed.§r");
        return;
      }
      
      // Countdown message and effects
      const color = i <= 3 ? "§c§l" : (i <= 6 ? "§6§l" : "§e§l");
      player.sendMessage(`${color}${i}...§r`);
      
      // Sound
      const pitch = 0.5 + (10 - i) * 0.1;
      dim.runCommandAsync(`playsound note.pling @a ${block.x} ${block.y} ${block.z} 3.0 ${pitch} 0`);
      
      // Particles (growing intensity)
      for (let p = 0; p < (11 - i); p++) {
        const angle = (p * 36) * Math.PI / 180;
        const radius = 2;
        dim.spawnParticle(biome.particle, {
          x: block.x + 0.5 + Math.cos(angle) * radius,
          y: block.y + 1,
          z: block.z + 0.5 + Math.sin(angle) * radius
        });
      }
      
      // Circle of particles around block
      for (let a = 0; a < 360; a += 15) {
        const angle = a * Math.PI / 180;
        const radius = 3 + (10 - i) * 0.3;
        dim.spawnParticle("minecraft:lava_particle", {
          x: block.x + 0.5 + Math.cos(angle) * radius,
          y: block.y + 0.5,
          z: block.z + 0.5 + Math.sin(angle) * radius
        });
      }
      
      await new Promise(resolve => system.runTimeout(resolve, 20)); // 1 second
    }
    
    // DETONATION!
    player.sendMessage(`${biome.color}§l§n💥 BIOME BOMB DETONATED! 💥§r`);
    dim.runCommandAsync(`playsound random.explode @a ${block.x} ${block.y} ${block.z} 5.0 0.5 0`);
    dim.runCommandAsync(`playsound mob.enderdragon.growl @a ${block.x} ${block.y} ${block.z} 4.0 0.8 0`);
    dim.runCommandAsync(`playsound firework.large_blast @a ${block.x} ${block.y} ${block.z} 4.0 1.0 0`);
    
    // Massive particle burst
    for (let i = 0; i < 50; i++) {
      const angle = (i * 7.2) * Math.PI / 180;
      const radius = 5;
      dim.spawnParticle("minecraft:huge_explosion_emitter", {
        x: block.x + 0.5 + Math.cos(angle) * radius,
        y: block.y + 1,
        z: block.z + 0.5 + Math.sin(angle) * radius
      });
      dim.spawnParticle(biome.particle, {
        x: block.x + 0.5 + Math.cos(angle) * radius,
        y: block.y + 2,
        z: block.z + 0.5 + Math.sin(angle) * radius
      });
    }
    
    // Lightning strike (no damage)
    dim.runCommandAsync(`summon lightning_bolt ${block.x} ${block.y + 1} ${block.z} ~ ~ ~ minecraft:become_charge_bolt`).catch(()=>{});
    
    // PRE-CLEARING PHASE: Remove ALL vegetation in entire radius FIRST (Y-slices to prevent lag)
    player.sendMessage(`${biome.color}Clearing vegetation...§r`);
    
    for (let sliceY = block.y - 5; sliceY <= block.y + 25; sliceY++) {
      for (let dx = -30; dx <= 30; dx++) {
        for (let dz = -30; dz <= 30; dz++) {
          const dist = Math.sqrt(dx*dx + dz*dz);
          if (dist > 30) continue;
          
          try {
            const clearBlock = dim.getBlock({ x: block.x + dx, y: sliceY, z: block.z + dz });
            if (!clearBlock) continue;
            
            const blockId = clearBlock.typeId || "";
            if (blockId.includes("leaves") || blockId.includes("log") || blockId.includes("wood") ||
                blockId.includes("sapling") || blockId.includes("grass") || blockId.includes("fern") || 
                blockId.includes("flower") || blockId.includes("mushroom") || blockId === "minecraft:vine" || 
                blockId === "minecraft:cactus" || blockId === "minecraft:dead_bush" || 
                blockId.includes("propagule") || blockId.includes("tulip") || blockId.includes("poppy") ||
                blockId.includes("dandelion") || blockId.includes("azalea") || blockId.includes("dripleaf") ||
                blockId.includes("petals") || blockId === "minecraft:lily_pad" || blockId === "minecraft:sweet_berry_bush") {
              clearBlock.setType("minecraft:air");
            }
          } catch {}
        }
      }
      
      // Small delay every 3 slices to avoid lag
      if ((sliceY - (block.y - 5)) % 3 === 0) {
        await new Promise(resolve => system.runTimeout(resolve, 1));
      }
    }
    
    player.sendMessage(`${biome.color}Vegetation cleared! Normalizing surface...§r`);

    // SURFACE NORMALIZATION: remove leftover stump blocks above ground, fill small holes, and make surface flush
    try{
      const normRadius = 30;
      for (let dx = -normRadius; dx <= normRadius; dx++){
        for (let dz = -normRadius; dz <= normRadius; dz++){
          const dist = Math.sqrt(dx*dx + dz*dz);
          if (dist > normRadius) continue;
          const tx = block.x + dx;
          const tz = block.z + dz;
          const gy = findSurfaceY(dim, tx, block.y, tz);
          try{
            // Remove any leftover block immediately above surface (e.g., stump remnants)
            const above = dim.getBlock({ x: tx, y: gy + 1, z: tz });
            if (above && !above.isAir) {
              const aid = String(above.typeId||"");
              if (aid !== 'minecraft:water') above.setType('minecraft:air');
            }
          }catch{}
          try{
            // Ensure surface is not air
            const surf = dim.getBlock({ x: tx, y: gy, z: tz });
            if (surf && surf.isAir){
              // Look one below for solid; if solid, set surface; if not, fill one block
              const below = dim.getBlock({ x: tx, y: gy - 1, z: tz });
              const bid = String(below?.typeId||"");
              if (below && !below.isAir && bid !== 'minecraft:water'){
                surf.setType(biome.surface);
              } else {
                if (below && below.isAir) below.setType(biome.subsurface);
                surf.setType(biome.surface);
              }
            }
          }catch{}
          try{
            // Fill shallow holes right under the surface (up to 2 blocks)
            for (let fy = gy - 2; fy < gy; fy++){
              const fb = dim.getBlock({ x: tx, y: fy, z: tz });
              if (fb && fb.isAir){ fb.setType(biome.subsurface); }
            }
          }catch{}
        }
      }
    }catch{}

    player.sendMessage(`${biome.color}Surface normalized! Starting transformation...§r`);
    
    // Register active bomb
    ACTIVE_BOMBS.set(blockKey, {
      dim,
      x: block.x,
      y: block.y,
      z: block.z,
      biome: biomeKey,
      radius: 0,
      maxRadius: 30,
      player: player.name,
      surfaceOnly,
      active: true
    });
    
    player.sendMessage(`${biome.color}The ${biome.name}§r ${biome.color}is CREEPING outward...§r`);
    
  } catch (err) {
    console.warn("Biome bomb start error:", err);
  }
}

// Creeping wave system - runs every tick
system.runInterval(() => {
  for (const [blockKey, bomb] of ACTIVE_BOMBS.entries()) {
    try {
      if (!bomb.active) continue;
      
      // Check if gold block still exists
      try {
        const checkBlock = bomb.dim.getBlock({ x: bomb.x, y: bomb.y, z: bomb.z });
        if (!checkBlock || checkBlock.typeId !== "myname:biome_bomb") {
          // Block was mined - stop transformation
          const players = world.getPlayers();
          const player = players.find(p => p.name === bomb.player);
          if (player) {
            player.sendMessage("§6§lBiome Bomb:§r §cTransformation halted! Bomb removed.§r");
          }
          ACTIVE_BOMBS.delete(blockKey);
          continue;
        }
      } catch {
        ACTIVE_BOMBS.delete(blockKey);
        continue;
      }
      
      // Get biome from correct collection
      const biome = bomb.underground ? UNDERGROUND_BIOMES[bomb.biome] : BIOMES[bomb.biome];
      
      // Spread one layer outward (different for underground)
      if (bomb.underground) {
        spreadUndergroundBiomeWave(bomb, biome);
      } else {
        spreadBiomeWave(bomb, biome);
      }
      
      // Increment radius
      bomb.radius += 0.5; // Slower spread for better visual
      
      // Check if complete
      if (bomb.radius >= bomb.maxRadius) {
        // Transformation complete!
        bomb.active = false;
        
        // Consume gold block
        try {
          const finalBlock = bomb.dim.getBlock({ x: bomb.x, y: bomb.y, z: bomb.z });
          if (finalBlock && finalBlock.typeId === "myname:biome_bomb") {
            finalBlock.setType("minecraft:air");
          }
        } catch {}
        
        // Notify player
        const players = world.getPlayers();
        const player = players.find(p => p.name === bomb.player);
        if (player) {
          player.sendMessage(`${biome.color}§l✓ ${biome.name} TRANSFORMATION COMPLETE! ✓§r`);
          player.sendMessage(`${biome.color}The biome has spread to ${bomb.maxRadius} blocks!§r`);
        }
        
        // Final epic effects
        bomb.dim.runCommandAsync(`playsound random.levelup @a ${bomb.x} ${bomb.y} ${bomb.z} 5.0 1.5 0`);
        bomb.dim.runCommandAsync(`playsound mob.wither.death @a ${bomb.x} ${bomb.y} ${bomb.z} 3.0 1.8 0`);
        
        // Massive final particle burst
        for (let a = 0; a < 360; a += 5) {
          const angle = a * Math.PI / 180;
          const radius = bomb.maxRadius;
          bomb.dim.spawnParticle(biome.particle, {
            x: bomb.x + 0.5 + Math.cos(angle) * radius,
            y: bomb.y + 3,
            z: bomb.z + 0.5 + Math.sin(angle) * radius
          });
          bomb.dim.spawnParticle("minecraft:totem_particle", {
            x: bomb.x + 0.5 + Math.cos(angle) * radius,
            y: bomb.y + 5,
            z: bomb.z + 0.5 + Math.sin(angle) * radius
          });
        }
        
        // POST-GENERATION: Special features (giant mushrooms, mangroves, etc.)
        if (biome.postGeneration === "giant_mushrooms") {
          generateGiantMushrooms(bomb.dim, bomb.x, bomb.y, bomb.z, bomb.maxRadius, player);
        } else if (biome.postGeneration === "mangroves") {
          generateMangroves(bomb.dim, bomb.x, bomb.y, bomb.z, bomb.maxRadius, player);
        }

        // PHASE: Foliage/Plant pass (light pass to avoid bumps). Bamboo Jungle handled by grove generator
        try{
          const pl = world.getPlayers().find(p=>p.name===bomb.player);
          try{ pl?.onScreenDisplay?.setActionBar?.("Adding foliage..."); }catch{}
          if (!bomb.underground && !biome.special){
            if (bomb.biome === 'bamboo_jungle') {
              try { generateBambooGroves(bomb.dim, bomb.x, bomb.y, bomb.z, bomb.maxRadius); } catch {}
            } else {
              try { lightFoliageSweep(bomb.dim, bomb.x, bomb.y, bomb.z, bomb.maxRadius, biome); } catch {}
            }
          }
        }catch{}

        // PHASE: Wildlife spawn after a short delay to ensure chunks settle
        try{
          const pl = world.getPlayers().find(p=>p.name===bomb.player);
          system.runTimeout(()=>{
            try{ pl?.onScreenDisplay?.setActionBar?.("Releasing wildlife..."); }catch{}
            if (!bomb.underground && !biome.special){
              spawnBiomeAnimals(bomb.dim, bomb.x, bomb.y, bomb.z, bomb.biome);
            }
          }, 15);
        }catch{}
        
        ACTIVE_BOMBS.delete(blockKey);
      }
      
    } catch (err) {
      console.warn("Biome bomb tick error:", err);
    }
  }
}, 4); // Every 4 ticks (0.2 seconds) for smooth spreading

// Find the local terrain surface at (x,z) near a hint Y
function findSurfaceY(dim, x, yHint, z){
  try{
    const MIN_Y = -64, MAX_Y = 320;
    const upMax = Math.min(MAX_Y, yHint + 40);
    const downMin = Math.max(MIN_Y, yHint - 80);
    // Scan downward from above to catch hilltops correctly
    outer: for (let y = upMax; y >= downMin; y--){
      try{
        const b = dim.getBlock({ x, y, z }); if (!b) continue;
        const id = String(b.typeId||"");
        // Skip non-ground blocks (air/water/vegetation)
        if (b.isAir || id === "minecraft:water" || id.includes("leaves") || id.includes("log") || id.includes("wood") || id.includes("sapling") || id.includes("grass") || id.includes("fern") || id.includes("flower") || id.includes("mushroom") || id === "minecraft:vine" || id === "minecraft:cactus" || id === "minecraft:dead_bush" || id.includes("propagule") || id.includes("petals")){
          continue;
        }
        // Ensure air above so it's an exposed surface
        try{
          const above = dim.getBlock({ x, y: y+1, z });
          if (above && above.isAir) return y;
        }catch{}
      }catch{}
    }
  }catch{}
  return yHint; // fallback
}

function spreadBiomeWave(bomb, biome) {
  try {
    const { dim, x, y, z, radius, maxRadius } = bomb;

    // Process a full ring band (prevents angular aliasing/parallel rows)
    const checkMin = Math.max(0, Math.floor(radius) - 1);
    const checkMax = Math.ceil(radius) + 1;

    for (let dx = -checkMax; dx <= checkMax; dx++) {
      for (let dz = -checkMax; dz <= checkMax; dz++) {
        const targetX = x + dx;
        const targetZ = z + dz;
        const horizontalDist = Math.sqrt(dx * dx + dz * dz);
        if (horizontalDist < checkMin || horizontalDist > checkMax) continue;

        // Distance ratio for feathering (0 at center, 1 at edge)
        const distRatio = Math.min(1, horizontalDist / maxRadius);
        // Follow terrain: detect local surface near this column
        const localY = findSurfaceY(dim, targetX, y, targetZ);
        transformColumn(dim, targetX, localY, targetZ, biome, distRatio, !!bomb.surfaceOnly);

        // Wave edge particles (sparser)
        if ((Math.floor(radius) % 2 === 0) && ((dx * dx + dz * dz) % 5 === 0)) {
          dim.spawnParticle(biome.particle, { x: targetX + 0.5, y: y + 2, z: targetZ + 0.5 });
          if ((dx + dz) % 3 === 0) dim.spawnParticle("minecraft:totem_particle", { x: targetX + 0.5, y: y + 3, z: targetZ + 0.5 });
        }
      }
    }

    // Wave edge sound
    if (Math.floor(radius) % 5 === 0) {
      const soundPitch = 0.8 + (radius / bomb.maxRadius) * 0.7;
      dim.runCommandAsync(`playsound block.grass.place @a ${x} ${y} ${z} 2.0 ${soundPitch} 0`).catch(()=>{});
      dim.runCommandAsync(`playsound dig.stone @a ${x} ${y} ${z} 1.5 ${soundPitch} 0`).catch(()=>{});
    }

  } catch (err) {
    console.warn("Spread wave error:", err);
  }
}

function transformColumn(dim, x, baseY, z, biome, distRatio, surfaceOnly=false) {
  try {
    // NOTE: Vegetation already cleared in pre-clearing phase!
    
    // EDGE FEATHERING: Outer 30% of radius blends with existing terrain (no clamping)
    const isEdge = distRatio > 0.7; // Last 30% of radius
    const isTransition = distRatio > 0.5 && distRatio <= 0.7; // 20% transition zone
    
    // Step 1: Find current surface level (vegetation already removed)
    let surfaceY = baseY;
    for (let checkY = baseY + 10; checkY >= baseY - 10; checkY--) {
      try {
        const block = dim.getBlock({ x, y: checkY, z });
        if (!block || block.typeId === "myname:biome_bomb") continue;
        
        const blockId = block.typeId || "";
        // Skip AIR, WATER, and ALL vegetation when finding surface
        if (block.isAir || blockId === "minecraft:water") continue;
        if (blockId.includes("leaves") || blockId.includes("log") || blockId.includes("wood") ||
            blockId.includes("sapling") || blockId === "minecraft:grass" || blockId === "minecraft:tall_grass" ||
            blockId.includes("fern") || blockId.includes("flower") || blockId.includes("mushroom") || 
            blockId === "minecraft:vine" || blockId === "minecraft:cactus" || blockId === "minecraft:dead_bush" || 
            blockId.includes("propagule") || blockId.includes("tulip") || blockId.includes("poppy") ||
            blockId.includes("dandelion") || blockId.includes("azalea") || blockId.includes("petals")) {
          continue;
        }
        
        // Found actual solid ground block
        surfaceY = checkY;
        break;
      } catch {}
    }
    
    // Step 2: SLOPE DETECTION - Check 8 neighbors (including diagonals for smoother blending)
    const neighbors = [];
    const directions = [[0,1], [0,-1], [1,0], [-1,0], [1,1], [1,-1], [-1,1], [-1,-1]]; // All 8 directions
    
    for (const [dx, dz] of directions) {
      try {
        let neighborY = baseY;
        for (let checkY = baseY + 10; checkY >= baseY - 10; checkY--) {
          const neighborBlock = dim.getBlock({ x: x + dx, y: checkY, z: z + dz });
          if (!neighborBlock) continue;
          
          const blockId = neighborBlock.typeId || "";
          // Skip AIR, WATER, and ALL vegetation
          if (neighborBlock.isAir || blockId === "minecraft:water") continue;
          if (blockId.includes("leaves") || blockId.includes("log") || blockId.includes("sapling") ||
              blockId.includes("grass") || blockId.includes("fern") || blockId.includes("flower") ||
              blockId.includes("mushroom") || blockId.includes("propagule") || blockId === "minecraft:vine") {
            continue;
          }
          
          // Found solid ground
          neighborY = checkY;
          break;
        }
        neighbors.push(neighborY);
      } catch {
        neighbors.push(baseY);
      }
    }
    
    // Calculate average neighbor height (simple smoothing)
    const avgNeighborY = neighbors.length > 0 ? Math.floor(neighbors.reduce((a,b)=>a+b,0) / neighbors.length) : surfaceY;

    // Additional smoothing: include 2nd ring sampling for broad slopes
    let ringSum = 0, ringCount = 0;
    for (let rx = -2; rx <= 2; rx++) {
      for (let rz = -2; rz <= 2; rz++) {
        if (Math.max(Math.abs(rx), Math.abs(rz)) !== 2) continue; // outer ring only
        try {
          for (let ry = baseY + 8; ry >= baseY - 8; ry--) {
            const b = dim.getBlock({ x: x + rx, y: ry, z: z + rz });
            if (!b) continue;
            const bid = b.typeId || "";
            if (b.isAir || bid === "minecraft:water" || bid.includes("leaves") || bid.includes("grass")) continue;
            ringSum += ry; ringCount++; break;
          }
        } catch {}
      }
    }
    const ringAvgY = ringCount > 0 ? Math.floor(ringSum / ringCount) : avgNeighborY;
    const smoothedNeighborY = Math.floor((avgNeighborY * 3 + ringAvgY * 2 + surfaceY) / 6);
    
    // Detect slope type
    const heightDiff = smoothedNeighborY - surfaceY;
    const isDownslope = heightDiff < -2; // Neighbors are lower (going downhill)
    const isUpslope = heightDiff > 2;    // Neighbors are higher (going uphill)
    
    // Step 3: Determine target height with GRADUAL transitions
    // Goal: follow terrain on hills; avoid building high plateaus from bomb altitude
    let targetY;
    let extendedRange = 3;
    
    // EDGE FEATHERING: Outer 30% keeps natural height (no terracing!)
    if (isEdge) {
      targetY = surfaceY; // Use actual terrain height at edges (no terracing near edge)
      extendedRange = Math.max(2, Math.abs(surfaceY - baseY));
    }
    // TRANSITION ZONE: 50-70% radius - gradual blending
    else if (isTransition) {
      // Smooth blend: weight shifts to existing terrain as we approach edge
      const blendFactor = (distRatio - 0.5) / 0.2; // 0 at 50%, 1 at 70%
      const blendedHeight = Math.floor(surfaceY * (0.5 + blendFactor * 0.5) + smoothedNeighborY * (0.5 - blendFactor * 0.5));
      targetY = Math.max(baseY - 6, Math.min(baseY + 6, blendedHeight));
      extendedRange = 6; // Natural variation
    }
    else if (isDownslope) {
      // DOWNSLOPE: Strongly bias toward lower neighbors so we follow the mountain down
      extendedRange = 6;
      const desired = Math.floor(surfaceY * 0.3 + smoothedNeighborY * 0.7);
      // Allow a larger drop vs local surface to avoid plateaus
      targetY = Math.max(surfaceY - 16, Math.min(surfaceY + 4, desired));
    } else if (isUpslope) {
      // UPSLOPE: Slightly favor higher neighbors, but keep within reasonable rise
      extendedRange = 5;
      const desired = Math.floor(surfaceY * 0.6 + smoothedNeighborY * 0.4);
      targetY = Math.max(surfaceY - 4, Math.min(surfaceY + 8, desired));
    } else {
      // FLAT/Minor slope: keep close to surface
      targetY = Math.max(surfaceY - 3, Math.min(surfaceY + 3, surfaceY));
    }

    // Deterministic micro-jitter to break grid lines without visible noise
    // Hash based on x,z to choose occasional +/- 1 adjustment toward neighbors
    try {
      const h = ((x * 73856093) ^ (z * 19349663)) & 15; // 0..15
      if (h === 0) {
        const toward = Math.sign(smoothedNeighborY - targetY);
        targetY += Math.max(-1, Math.min(1, toward));
      }
    } catch {}

    if (surfaceOnly){
      // SURFACE-ONLY MODE: strictly hug existing terrain; do not raise platforms or fill voids
      // This forces the surface layer to match the exposed ground at this column
      targetY = surfaceY;
    }
    else {
      // Normal mode safety: never rise far above detected surface to avoid midair shelves
      // Allow a tiny offset to smooth gentle bumps
      if (targetY > surfaceY + 1) targetY = surfaceY + 1;
    }
    
    // Step 5: CLEAR OVERHEAD - Remove blocks above target surface (dynamic cap)
    const clearUp = surfaceOnly ? 0 : (isUpslope ? 15 : 10);
    for (let removeY = targetY + 1; removeY <= targetY + clearUp; removeY++) {
      try {
        const removeBlock = dim.getBlock({ x, y: removeY, z });
        if (removeBlock && !removeBlock.isAir && removeBlock.typeId !== "myname:biome_bomb") {
          removeBlock.setType("minecraft:air");
        }
      } catch {}
    }
    
    // Step 6: FILL BELOW - Disabled in surface-only mode to prevent pillars
    const fillStart = surfaceOnly ? targetY : Math.min(surfaceY, targetY) - 8;
    for (let fillY = fillStart; fillY < targetY; fillY++) {
      try {
        const fillBlock = dim.getBlock({ x, y: fillY, z });
        if (fillBlock && fillBlock.isAir) {
          fillBlock.setType("minecraft:stone");
        }
      } catch {}
    }
    
    // Step 6: Transform to biome blocks (work from bottom up to avoid gaps)
    for (let dy = (surfaceOnly ? -1 : -3); dy <= 0; dy++) { // surface-only: transform top and one subsurface layer
      const transformY = targetY + dy;
      try {
        const block = dim.getBlock({ x, y: transformY, z });
        if (!block || block.typeId === "minecraft:bedrock" || block.typeId === "myname:biome_bomb") continue;
        
        if (block.typeId === "minecraft:water") {
          if (biome.freezeWater && dy === 0) block.setType("minecraft:ice");
          continue;
        }
        
        // Subsurface layers (-3 to -1)
        if (dy < 0) {
          // Only place subsurface if current position is not air (avoid creating hanging lips)
          if (block.isAir) continue;
          if (dy === -1 && biome.underLayer && biome.surface === "minecraft:snow") {
            block.setType(biome.underLayer);
          } else {
            block.setType(biome.subsurface);
          }
        }
        // Surface layer (dy === 0)
        else if (dy === 0) {
          // Only place surface if either current block is not air OR the block below is solid
          let canPlaceSurface = true;
          try {
            if (block.isAir) {
              const below = dim.getBlock({ x, y: transformY - 1, z });
              const belowId = String(below?.typeId||"");
              canPlaceSurface = !!(below && !below.isAir && belowId !== "minecraft:water");
            }
          } catch {}
          if (!canPlaceSurface) continue;
          block.setType(biome.surface);
          
          // Skip per-column decoration in surface-only mode to keep terrain smooth
          if (!surfaceOnly && Math.random() < 0.12 && biome.plants && biome.plants.length > 0) {
            try {
              const aboveBlock = dim.getBlock({ x, y: transformY + 1, z });
              if (aboveBlock && aboveBlock.isAir) {
                const plant = biome.plants[Math.floor(Math.random() * biome.plants.length)];
                // Avoid placing bamboo in the per-column pass to prevent checker bumps;
                // Bamboo Jungle will be handled by a post-generation grove pass.
                if (plant !== "minecraft:bamboo") {
                  aboveBlock.setType(plant);
                }
              }
            } catch {}
          }
          
          if (!surfaceOnly && Math.random() < 0.03 && biome.trees) {
            try { placeTree(dim, x, transformY + 1, z, biome.trees); } catch {}
          }
        }
        
      } catch {}
    }
    
    // Step 7: SURFACE CORRECTION - Ensure top exposed block is always surface type (not dirt!)
    try {
      for (let scanY = targetY + 5; scanY >= targetY - 5; scanY--) {
        const scanBlock = dim.getBlock({ x, y: scanY, z });
        const aboveBlock = dim.getBlock({ x, y: scanY + 1, z });
        
        if (scanBlock && !scanBlock.isAir && scanBlock.typeId !== "minecraft:water" &&
            aboveBlock && aboveBlock.isAir) {
          // This is the top block! Make sure it's surface type (grass, not dirt)
          if (scanBlock.typeId === biome.subsurface || scanBlock.typeId === "minecraft:dirt" || 
              scanBlock.typeId === "minecraft:stone") {
            scanBlock.setType(biome.surface);
          }
          break;
        }
      }
    } catch {}
    
  } catch (err) {
    // Silent fail
  }
}

function placeTree(dim, x, y, z, treeType) {
  try {
    // Simple tree placement (just saplings for now to avoid structure complexity)
    const block = dim.getBlock({ x, y, z });
    if (block && block.isAir) {
      const saplingMap = {
        "oak": "minecraft:oak_sapling",
        "spruce": "minecraft:spruce_sapling",
        "jungle": "minecraft:jungle_sapling",
        "acacia": "minecraft:acacia_sapling",
        "dark_oak": "minecraft:dark_oak_sapling",
        "cherry": "minecraft:cherry_sapling",
        "mangrove": "minecraft:mangrove_propagule"
      };
      
      const sapling = saplingMap[treeType];
      if (sapling) {
        block.setType(sapling);
      }
      
      // For huge mushrooms
      if (treeType === "huge_mushroom") {
        if (Math.random() < 0.5) {
          block.setType("minecraft:red_mushroom");
        } else {
          block.setType("minecraft:brown_mushroom");
        }
      }
    }
  } catch {}
}

// Light foliage pass to add sparse plants without creating bumps
function lightFoliageSweep(dim, cx, cy, cz, radius, biome){
  try{
    const step = 4;
    for (let dx=-radius; dx<=radius; dx+=step){
      for (let dz=-radius; dz<=radius; dz+=step){
        const dist = Math.sqrt(dx*dx + dz*dz);
        if (dist > radius) continue;
        const x = cx + dx;
        const z = cz + dz;
        const y = findSurfaceY(dim, x, cy, z);
        try{
          const above = dim.getBlock({x, y:y+1, z});
          const base = dim.getBlock({x, y, z});
          const baseId = String(base?.typeId||"");
          if (!above || !above.isAir) continue;
          if (baseId !== biome.surface) continue;
          if (!biome.plants || biome.plants.length===0) continue;
          // 1 in 6 chance to place a small plant (never bamboo here)
          if (Math.random() < 0.166){
            const candidates = biome.plants.filter(p=>p!=="minecraft:bamboo");
            if (candidates.length){
              const plant = candidates[Math.floor(Math.random()*candidates.length)];
              above.setType(plant);
            }
          }
        }catch{}
      }
    }
  }catch{}
}

function generateBambooGroves(dim, cx, cy, cz, radius){
  try{
    const clusters = 12; // number of groves (doubled)
    for (let i=0;i<clusters;i++){
      const ang = (i / clusters) * Math.PI * 2 + Math.random()*0.4;
      const r = Math.max(4, Math.floor(radius*0.3)) + Math.floor(Math.random()*8) - 4; // closer to center, more spread
      const gx = Math.floor(cx + Math.cos(ang)*r);
      const gz = Math.floor(cz + Math.sin(ang)*r);
      const gy = findGround(dim, gx, cy, gz);
      const patch = 12 + Math.floor(Math.random()*8); // larger patches (12-20 bamboo per cluster)
      for (let n=0;n<patch;n++){
        const ox = gx + Math.floor(Math.random()*9) - 4; // larger cluster spread
        const oz = gz + Math.floor(Math.random()*9) - 4;
        const oy = findGround(dim, ox, cy, oz);
        try{
          const base = dim.getBlock({x:ox,y:oy-1,z:oz});
          const above = dim.getBlock({x:ox,y:oy,z:oz});
          if (!base || !above) continue;
          const baseId = String(base.typeId||"");
          if (above.isAir && (baseId === 'minecraft:grass_block' || baseId === 'minecraft:dirt' || baseId === 'minecraft:podzol' || baseId === 'minecraft:moss_block')){
            above.setType('minecraft:bamboo');
            // Much higher chance for clump effect - create dense bamboo patches
            if (Math.random() < 0.7){
              const sx = ox + (Math.random()<0.5?1:-1);
              const sz = oz + (Math.random()<0.5?1:-1);
              const sy = findGround(dim, sx, cy, sz);
              const sabove = dim.getBlock({x:sx,y:sy,z:sz});
              const sbase = dim.getBlock({x:sx,y:sy-1,z:sz});
              const sbaseId = String(sbase?.typeId||"");
              if (sabove && sabove.isAir && (sbaseId==='minecraft:grass_block'||sbaseId==='minecraft:dirt'||sbaseId==='minecraft:podzol'||sbaseId==='minecraft:moss_block')){
                sabove.setType('minecraft:bamboo');
              }
            }
          }
        }catch{}
      }
    }
  }catch{}
}

// Underground biome bomb - 3D spherical transformation
async function startUndergroundBiomeBomb(player, block, biomeKey) {
  try {
    const biome = UNDERGROUND_BIOMES[biomeKey];
    const dim = block.dimension;
    const blockKey = `${dim.id}_${block.x}_${block.y}_${block.z}`;
    
    // Check if this is a SPECIAL egg biome
    if (biome.special === "egg") {
      startSculkEggBomb(player, block, biome, blockKey);
      return;
    }
    
    player.sendMessage(`§6§l💣 UNDERGROUND BIOME BOMB ARMED!§r ${biome.color}${biome.icon} ${biome.name}§r`);
    player.sendMessage("§8§lCreating cavern deep below...§r");
    
    // 10 second countdown
    for (let i = 10; i > 0; i--) {
      try {
        const checkBlock = dim.getBlock({ x: block.x, y: block.y, z: block.z });
        if (!checkBlock || checkBlock.typeId !== "myname:biome_bomb") {
          player.sendMessage("§6§lBiome Bomb:§r §cDefused! Block was removed.§r");
          return;
        }
      } catch {
        player.sendMessage("§6§lBiome Bomb:§r §cDefused! Block was removed.§r");
        return;
      }
      
      const color = i <= 3 ? "§c§l" : (i <= 6 ? "§6§l" : "§e§l");
      player.sendMessage(`${color}${i}...§r`);
      
      const pitch = 0.5 + (10 - i) * 0.1;
      dim.runCommandAsync(`playsound note.pling @a ${block.x} ${block.y} ${block.z} 3.0 ${pitch} 0`);
      
      // 3D particle sphere
      for (let p = 0; p < (11 - i) * 2; p++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        const radius = 3 + (10 - i) * 0.2;
        const px = block.x + 0.5 + Math.sin(phi) * Math.cos(theta) * radius;
        const py = block.y + 0.5 + Math.cos(phi) * radius;
        const pz = block.z + 0.5 + Math.sin(phi) * Math.sin(theta) * radius;
        dim.spawnParticle(biome.particle, { x: px, y: py, z: pz });
      }
      
      await new Promise(resolve => system.runTimeout(resolve, 20));
    }
    
    // DETONATION!
    player.sendMessage(`${biome.color}§l§n💥 CAVERN FORMING! 💥§r`);
    dim.runCommandAsync(`playsound random.explode @a ${block.x} ${block.y} ${block.z} 5.0 0.5 0`);
    dim.runCommandAsync(`playsound ambient.cave @a ${block.x} ${block.y} ${block.z} 4.0 0.6 0`);
    dim.runCommandAsync(`playsound block.sculk_shrieker.shriek @a ${block.x} ${block.y} ${block.z} 4.0 0.8 0`);
    
    // Massive 3D particle explosion
    for (let i = 0; i < 100; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const radius = 5;
      const px = block.x + 0.5 + Math.sin(phi) * Math.cos(theta) * radius;
      const py = block.y + 0.5 + Math.cos(phi) * radius;
      const pz = block.z + 0.5 + Math.sin(phi) * Math.sin(theta) * radius;
      dim.spawnParticle("minecraft:huge_explosion_emitter", { x: px, y: py, z: pz });
      dim.spawnParticle(biome.glowParticle, { x: px, y: py, z: pz });
    }
    
    player.sendMessage(`${biome.color}§lWatch the cavern hollow out...§r`);
    
    // Start gradual wave system (hollows AND decorates together)
    ACTIVE_BOMBS.set(blockKey, {
      dim,
      x: block.x,
      y: block.y,
      z: block.z,
      biome: biomeKey,
      underground: true,
      radius: 0,
      maxRadius: 25,
      player: player.name,
      active: true
    });
    
  } catch (err) {
    console.warn("Underground biome bomb start error:", err);
  }
}

// Spread underground biome as DOME (hemisphere with tapering height)
function spreadUndergroundBiomeWave(bomb, biome) {
  try {
    const { dim, x, y, z, radius, maxRadius } = bomb;
    
    // World boundaries
    const MIN_Y = -64;
    const MAX_Y = 320;
    
    // Process COMPLETE square area (no gaps!) then filter by distance
    // Only process blocks at current radius ring to reduce lag
    const checkMin = Math.floor(radius) - 3;
    const checkMax = Math.ceil(radius) + 1;
    
    for (let dx = -checkMax; dx <= checkMax; dx++) {
      for (let dz = -checkMax; dz <= checkMax; dz++) {
        const targetX = x + dx;
        const targetZ = z + dz;
        
        // Calculate horizontal distance
        const horizontalDist = Math.sqrt(dx * dx + dz * dz);
        
        // Only process blocks within current radius ±3
        if (horizontalDist > checkMax || horizontalDist < checkMin) continue;
        
        // Calculate distance ratio for height tapering
        const distRatio = Math.min(1, horizontalDist / maxRadius);
        
        // TAPERING HEIGHT: 20 blocks at center, 2 blocks at edge
        const maxHeightAtPos = Math.max(2, Math.floor(20 - (18 * distRatio)));
        
        // Is this on the shell edge?
        const atEdge = (horizontalDist >= radius - 1 && horizontalDist <= radius + 1);
        
        // HEMISPHERE: Process from 3 below to maxHeight above
        for (let dy = -3; dy <= maxHeightAtPos; dy++) {
          const targetY = y + dy;
          
          // WORLD BOUNDARY CHECK
          if (targetY < MIN_Y || targetY > MAX_Y) continue;
          
          try {
            const block = dim.getBlock({ x: targetX, y: targetY, z: targetZ });
            if (!block || block.typeId === "minecraft:bedrock" || block.typeId === "myname:biome_bomb") continue;
            
            // FLOOR LAYER (dy = -3 to 0): Always transform to biome floor blocks
            if (dy <= 0 && dy >= -3 && horizontalDist <= radius) {
              block.setType(biome.floor);
              
              // Add floor decorations on top layer (dy = 0)
              if (dy === 0) {
                try {
                  const aboveBlock = dim.getBlock({ x: targetX, y: targetY + 1, z: targetZ });
                  if (aboveBlock && aboveBlock.isAir) {
                    // Mushrooms for mushroom cavern (INCREASED spawn rate!)
                    if (biome.features.mushrooms && Math.random() < 0.4) {
                      const mushroom = biome.features.mushrooms[Math.floor(Math.random() * biome.features.mushrooms.length)];
                      aboveBlock.setType(mushroom);
                    }
                    // Plants for verdant oasis
                    if (biome.features.plants && Math.random() < 0.2) {
                      const plant = biome.features.plants[Math.floor(Math.random() * biome.features.plants.length)];
                      aboveBlock.setType(plant);
                    }
                    // Grass for verdant oasis
                    if (biome.features.grass && Math.random() < 0.15) {
                      const grass = biome.features.grass[Math.floor(Math.random() * biome.features.grass.length)];
                      aboveBlock.setType(grass);
                    }
                    // Moss carpet for verdant oasis
                    if (biome.features.moss && Math.random() < 0.3) {
                      aboveBlock.setType(biome.features.moss);
                    }
                  }
                } catch {}
              }
            }
            // HOLLOW interior space (above floor, below ceiling)
            else if (dy > 0 && dy < maxHeightAtPos - 2 && horizontalDist <= radius) {
              if (!block.isAir) block.setType("minecraft:air");
            }
            // CEILING and WALLS at shell edge
            else if (atEdge && !block.isAir && dy >= maxHeightAtPos - 2) {
              decorateUndergroundShell(dim, block, biome, dy, maxHeightAtPos);
            }
          } catch {}
        }
      }
    }
    
    // Wave edge particles (ring)
    if (Math.floor(radius) % 3 === 0) {
      for (let a = 0; a < 360; a += 40) {
        const angle = a * Math.PI / 180;
        const px = x + Math.cos(angle) * radius;
        const pz = z + Math.sin(angle) * radius;
        const distRatio = Math.min(1, radius / maxRadius);
        const maxHeightAtPos = Math.max(2, Math.floor(20 - (18 * distRatio)));
        const particleY = y + Math.floor(maxHeightAtPos * 0.8);
        
        if (particleY >= MIN_Y && particleY <= MAX_Y) {
          dim.spawnParticle(biome.particle, { x: px + 0.5, y: particleY, z: pz + 0.5 });
        }
      }
    }
    
    // Sound effects (less frequent)
    if (Math.floor(radius) % 5 === 0) {
      const soundPitch = 0.7 + (radius / maxRadius) * 0.6;
      dim.runCommandAsync(`playsound dig.stone @a ${x} ${y} ${z} 2.5 ${soundPitch} 0`).catch(()=>{});
      dim.runCommandAsync(`playsound ambient.cave @a ${x} ${y} ${z} 1.5 ${soundPitch} 0`).catch(()=>{});
    }
    
  } catch (err) {
    console.warn("Spread underground wave error:", err);
  }
}

function decorateUndergroundShell(dim, block, biome, dy, maxHeightAtPos) {
  try {
    // Determine position type based on Y offset
    const isFloor = dy <= 0; // Ground level and below
    const isCeiling = dy >= maxHeightAtPos - 2; // Top 2 layers
    const isWall = !isFloor && !isCeiling; // Middle (walls)
    
    // FLOOR: Place floor blocks and floor decorations
    if (isFloor) {
      block.setType(biome.floor);
      
      // Place mushrooms/plants ON the floor
      if (Math.random() < 0.2) {
        try {
          const aboveBlock = dim.getBlock({ x: block.x, y: block.y + 1, z: block.z });
          if (aboveBlock && aboveBlock.isAir) {
            if (biome.features.mushrooms && Math.random() < 0.5) {
              const mushroom = biome.features.mushrooms[Math.floor(Math.random() * biome.features.mushrooms.length)];
              aboveBlock.setType(mushroom);
            }
            if (biome.features.plants && Math.random() < 0.5) {
              const plant = biome.features.plants[Math.floor(Math.random() * biome.features.plants.length)];
              aboveBlock.setType(plant);
            }
            if (biome.features.grass && Math.random() < 0.3) {
              const grass = biome.features.grass[Math.floor(Math.random() * biome.features.grass.length)];
              aboveBlock.setType(grass);
            }
          }
        } catch {}
      }
      
      // Moss carpet for verdant oasis
      if (biome.features.moss && Math.random() < 0.4) {
        try {
          const aboveBlock = dim.getBlock({ x: block.x, y: block.y + 1, z: block.z });
          if (aboveBlock && aboveBlock.isAir) {
            aboveBlock.setType(biome.features.moss);
          }
        } catch {}
      }
    }
    // CEILING: Place ceiling blocks and hanging decorations
    else if (isCeiling) {
      block.setType(biome.ceiling);
      
      // Hanging vines
      if (biome.features.vines && Math.random() < 0.25) {
        try {
          const belowBlock = dim.getBlock({ x: block.x, y: block.y - 1, z: block.z });
          if (belowBlock && belowBlock.isAir) {
            belowBlock.setType(biome.features.vines);
          }
        } catch {}
      }
      
      // Cave vines with glow berries
      if (biome.features.berryVines && Math.random() < 0.2) {
        try {
          const belowBlock = dim.getBlock({ x: block.x, y: block.y - 1, z: block.z });
          if (belowBlock && belowBlock.isAir) {
            belowBlock.setType("minecraft:cave_vines");
          }
        } catch {}
      }
      
      // Spore blossoms for verdant oasis
      if (biome.features.spores && Math.random() < 0.1) {
        block.setType(biome.features.spores);
      }
      
      // Stalactites for crystal geode
      if (biome.features.stalactites && Math.random() < 0.15) {
        try {
          const belowBlock = dim.getBlock({ x: block.x, y: block.y - 1, z: block.z });
          if (belowBlock && belowBlock.isAir) {
            belowBlock.setType(biome.features.stalactites);
          }
        } catch {}
      }
    }
    // WALLS: Place wall blocks and wall decorations
    else if (isWall) {
      block.setType(biome.walls);
      
      // Amethyst crystals on walls
      if (biome.features.crystals && Math.random() < 0.12) {
        block.setType(biome.features.crystals);
      }
      
      // Copper ore accents
      if (biome.features.accent && Math.random() < 0.08) {
        block.setType(biome.features.accent);
      }
      
      // Glow lichen
      if (biome.features.vines && Math.random() < 0.15) {
        block.setType(biome.features.vines);
      }
    }
    
    // Light sources throughout cavern (glowstone, shroomlight)
    if (biome.features.lights && Math.random() < 0.03) {
      block.setType(biome.features.lights);
    }
    
    // Occasional pillars (floor to ceiling connectors)
    if (biome.features.pillars && Math.random() < 0.02) {
    block.setType(biome.features.pillars);
    }

    } catch {
    // Silent fail
    }
}

// SPECIAL: Sculk Egg Bomb - Creates egg-shaped sculk chamber
async function startSculkEggBomb(player, block, biome, blockKey) {
  try {
    const dim = block.dimension;
    
    player.sendMessage(`${biome.color}§l💣 SCULK EGG BOMB ARMED!§r ${biome.icon} ${biome.name}§r`);
    player.sendMessage("§0§l⚫ THE DEEP DARK AWAKENS ⚫§r");
    
    // 10 second countdown with sculk sounds
    for (let i = 10; i > 0; i--) {
      try {
        const checkBlock = dim.getBlock({ x: block.x, y: block.y, z: block.z });
        if (!checkBlock || checkBlock.typeId !== "myname:biome_bomb") {
          player.sendMessage("§6§lBiome Bomb:§r §cDefused! Block was removed.§r");
          return;
        }
      } catch {
        return;
      }
      
      const color = i <= 3 ? "§c§l" : (i <= 6 ? "§8§l" : "§7");
      player.sendMessage(`${color}${i}...§r`);
      
      const pitch = 0.3 + (10 - i) * 0.08;
      dim.runCommandAsync(`playsound block.sculk_sensor.clicking @a ${block.x} ${block.y} ${block.z} 3.0 ${pitch} 0`);
      dim.runCommandAsync(`playsound note.pling @a ${block.x} ${block.y} ${block.z} 2.0 ${pitch} 0`);
      
      // Dark pulsing particles (matching other bombs)
      for (let p = 0; p < (11 - i); p++) {
        const angle = (p * 36) * Math.PI / 180;
        const radius = 2;
        dim.spawnParticle(biome.particle, {
          x: block.x + 0.5 + Math.cos(angle) * radius,
          y: block.y + 1,
          z: block.z + 0.5 + Math.sin(angle) * radius
        });
      }
      
      // Expanding ring
      for (let a = 0; a < 360; a += 15) {
        const angle = a * Math.PI / 180;
        const radius = 3 + (10 - i) * 0.3;
        dim.spawnParticle("minecraft:soul_particle", {
          x: block.x + 0.5 + Math.cos(angle) * radius,
          y: block.y + 0.5,
          z: block.z + 0.5 + Math.sin(angle) * radius
        });
      }
      
      await new Promise(resolve => system.runTimeout(resolve, 20));
    }
    
    // DETONATION - Sculk awakening
    player.sendMessage(`${biome.color}§l§n💀 SCULK EGG FORMING! 💀§r`);
    dim.runCommandAsync(`playsound block.sculk_shrieker.shriek @a ${block.x} ${block.y} ${block.z} 6.0 0.5 0`);
    dim.runCommandAsync(`playsound mob.warden.listening_angry @a ${block.x} ${block.y} ${block.z} 5.0 0.7 0`);
    dim.runCommandAsync(`playsound block.sculk.spread @a ${block.x} ${block.y} ${block.z} 4.0 0.6 0`);
    
    // Dark particle explosion
    for (let i = 0; i < 150; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const radius = 6;
      const px = block.x + 0.5 + Math.sin(phi) * Math.cos(theta) * radius;
      const py = block.y + 0.5 + Math.cos(phi) * radius;
      const pz = block.z + 0.5 + Math.sin(phi) * Math.sin(theta) * radius;
      dim.spawnParticle("minecraft:soul_particle", { x: px, y: py, z: pz });
      dim.spawnParticle("minecraft:sculk_soul_particle", { x: px, y: py, z: pz });
    }
    
    player.sendMessage(`${biome.color}§lBuilding Sculk Egg...§r`);
    
    // Build egg shape in phases
    const centerX = block.x;
    const centerY = block.y;
    const centerZ = block.z;
    const radiusXZ = biome.eggWidth / 2; // 10 blocks horizontal
    const radiusY = biome.eggHeight / 2;  // 10 blocks vertical
    
    // PHASE 1: Hollow out egg interior
    for (let dy = -radiusY; dy <= radiusY; dy++) {
      for (let dx = -radiusXZ; dx <= radiusXZ; dx++) {
        for (let dz = -radiusXZ; dz <= radiusXZ; dz++) {
          // Egg formula: (x/a)^2 + (y/b)^2 + (z/c)^2 <= 1
          const normalized = (dx*dx)/(radiusXZ*radiusXZ) + (dy*dy)/(radiusY*radiusY) + (dz*dz)/(radiusXZ*radiusXZ);
          
          if (normalized <= 1.0) {
            const targetY = centerY + dy;
            if (targetY < -64 || targetY > 320) continue;
            
            try {
              const eggBlock = dim.getBlock({ x: centerX + dx, y: targetY, z: centerZ + dz });
              if (eggBlock && eggBlock.typeId !== "minecraft:bedrock" && eggBlock.typeId !== "myname:biome_bomb") {
                eggBlock.setType("minecraft:air");
              }
            } catch {}
          }
        }
      }
      
      // Progress particles
      if (dy % 3 === 0) {
        await new Promise(resolve => system.runTimeout(resolve, 1));
        for (let a = 0; a < 360; a += 60) {
          const angle = a * Math.PI / 180;
          dim.spawnParticle("minecraft:soul_particle", {
            x: centerX + Math.cos(angle) * radiusXZ * 0.8,
            y: centerY + dy,
            z: centerZ + Math.sin(angle) * radiusXZ * 0.8
          });
        }
      }
    }
    
    player.sendMessage(`${biome.color}§lApplying Sculk shell...§r`);
    
    // PHASE 2: Apply sculk shell (2 blocks thick)
    for (let dy = -radiusY; dy <= radiusY; dy++) {
      for (let dx = -radiusXZ; dx <= radiusXZ; dx++) {
        for (let dz = -radiusXZ; dz <= radiusXZ; dz++) {
          const normalized = (dx*dx)/(radiusXZ*radiusXZ) + (dy*dy)/(radiusY*radiusY) + (dz*dz)/(radiusXZ*radiusXZ);
          
          // Shell: between 0.8 and 1.0 (2 block thick shell)
          if (normalized > 0.8 && normalized <= 1.0) {
            const targetY = centerY + dy;
            if (targetY < -64 || targetY > 320) continue;
            
            try {
              const eggBlock = dim.getBlock({ x: centerX + dx, y: targetY, z: centerZ + dz });
              if (eggBlock && eggBlock.isAir) {
                eggBlock.setType(biome.shell);
              }
            } catch {}
          }
        }
      }
    }
    
    dim.runCommandAsync(`playsound block.sculk.spread @a ${centerX} ${centerY} ${centerZ} 4.0 0.8 0`);
    
    await new Promise(resolve => system.runTimeout(resolve, 20));
    
    // PHASE 3: Find valid floor positions ON BOTTOM INNER SHELL
    player.sendMessage(`${biome.color}§lPlacing Sculk devices...§r`);
    
    const floorPositions = [];
    
    // Scan bottom half of egg for inner shell floor surface
    for (let dy = -radiusY; dy <= 0; dy++) {
      for (let dx = -radiusXZ; dx <= radiusXZ; dx++) {
        for (let dz = -radiusXZ; dz <= radiusXZ; dz++) {
          const normalized = (dx*dx)/(radiusXZ*radiusXZ) + (dy*dy)/(radiusY*radiusY) + (dz*dz)/(radiusXZ*radiusXZ);
          
          // Check blocks just INSIDE the shell (0.75 to 0.8 - inner surface)
          if (normalized > 0.75 && normalized < 0.82) {
            const targetY = centerY + dy;
            if (targetY < -64 || targetY > 320) continue;
            
            try {
              const shellBlock = dim.getBlock({ x: centerX + dx, y: targetY, z: centerZ + dz });
              const insideBlock = dim.getBlock({ x: centerX + dx, y: targetY + 1, z: centerZ + dz });
              
              // Valid if this is sculk with AIR above (inner floor surface)
              if (shellBlock && shellBlock.typeId === "minecraft:sculk" && 
                  insideBlock && insideBlock.isAir) {
                floorPositions.push({ x: centerX + dx, y: targetY + 1, z: centerZ + dz });
              }
            } catch {}
          }
        }
      }
    }
    
    if (floorPositions.length === 0) {
      // Fallback: just find random AIR positions inside egg with sculk below
      for (let attempt = 0; attempt < 100; attempt++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = (Math.random() * 0.5 + 0.5) * Math.PI; // Bottom half
        const r = Math.random() * (radiusXZ - 4);
        const px = Math.floor(centerX + Math.sin(phi) * Math.cos(theta) * r);
        const py = Math.floor(centerY - radiusY * 0.5 + Math.random() * radiusY * 0.3);
        const pz = Math.floor(centerZ + Math.sin(phi) * Math.sin(theta) * r);
        
        if (py < -64 || py > 320) continue;
        
        try {
          const airBlock = dim.getBlock({ x: px, y: py, z: pz });
          const belowBlock = dim.getBlock({ x: px, y: py - 1, z: pz });
          
          if (airBlock && airBlock.isAir && belowBlock && belowBlock.typeId === "minecraft:sculk") {
            floorPositions.push({ x: px, y: py, z: pz });
          }
        } catch {}
      }
    }
    
    // Shuffle positions
    for (let i = floorPositions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [floorPositions[i], floorPositions[j]] = [floorPositions[j], floorPositions[i]];
    }
    
    // Place sculk sensors (3-4 total)
    const sensorCount = Math.floor(Math.random() * 2) + 3;
    for (let i = 0; i < sensorCount && i < floorPositions.length; i++) {
      try {
        const pos = floorPositions[i];
        const sensorBlock = dim.getBlock(pos);
        if (sensorBlock && sensorBlock.isAir) {
          sensorBlock.setType("minecraft:sculk_sensor");
          dim.spawnParticle("minecraft:soul_particle", { x: pos.x + 0.5, y: pos.y + 1, z: pos.z + 0.5 });
        }
      } catch {}
    }
    
    dim.runCommandAsync(`playsound block.sculk_sensor.place @a ${centerX} ${centerY} ${centerZ} 2.0 1.0 0`);
    
    // Place sculk shriekers (3 total)
    for (let i = sensorCount; i < sensorCount + 3 && i < floorPositions.length; i++) {
      try {
        const pos = floorPositions[i];
        const shriekerBlock = dim.getBlock(pos);
        if (shriekerBlock && shriekerBlock.isAir) {
          shriekerBlock.setType("minecraft:sculk_shrieker");
          dim.spawnParticle("minecraft:sculk_soul_particle", { x: pos.x + 0.5, y: pos.y + 1, z: pos.z + 0.5 });
        }
      } catch {}
    }
    
    dim.runCommandAsync(`playsound block.sculk_shrieker.place @a ${centerX} ${centerY} ${centerZ} 2.0 1.0 0`);
    
    // Place sculk catalysts (4 total)
    for (let i = sensorCount + 3; i < sensorCount + 7 && i < floorPositions.length; i++) {
      try {
        const pos = floorPositions[i];
        const catalystBlock = dim.getBlock(pos);
        if (catalystBlock && catalystBlock.isAir) {
          catalystBlock.setType("minecraft:sculk_catalyst");
          dim.spawnParticle("minecraft:soul_particle", { x: pos.x + 0.5, y: pos.y + 1, z: pos.z + 0.5 });
        }
      } catch {}
    }
    
    dim.runCommandAsync(`playsound block.sculk_catalyst.bloom @a ${centerX} ${centerY} ${centerZ} 2.0 1.0 0`);
    
    // Consume gold block
    try {
      const finalBlock = dim.getBlock({ x: block.x, y: block.y, z: block.z });
      if (finalBlock && finalBlock.typeId === "myname:biome_bomb") {
        finalBlock.setType("minecraft:air");
      }
    } catch {}
    
    // Final effects
    player.sendMessage(`${biome.color}§l✓ SCULK EGG COMPLETE! ✓§r`);
    player.sendMessage(`${biome.color}The Deep Dark has claimed this space...§r`);
    
    dim.runCommandAsync(`playsound block.sculk_shrieker.shriek @a ${centerX} ${centerY} ${centerZ} 5.0 1.2 0`);
    dim.runCommandAsync(`playsound mob.warden.roar @a ${centerX} ${centerY} ${centerZ} 4.0 0.9 0`);
    
    // Final particle burst
    for (let a = 0; a < 360; a += 10) {
      const angle = a * Math.PI / 180;
      dim.spawnParticle("minecraft:sculk_soul_particle", {
        x: centerX + Math.cos(angle) * radiusXZ,
        y: centerY,
        z: centerZ + Math.sin(angle) * radiusXZ
      });
      dim.spawnParticle("minecraft:soul_particle", {
        x: centerX + Math.cos(angle) * radiusXZ,
        y: centerY + 5,
        z: centerZ + Math.sin(angle) * radiusXZ
      });
    }
    
  } catch (err) {
    console.warn("Sculk egg bomb error:", err);
  }
}

// Generate 3 giant red mushrooms in mushroom cavern
function generateGiantMushrooms(dim, centerX, centerY, centerZ, radius, player) {
  try {
    if (player) {
      player.sendMessage("§d§l🍄 Growing GIANT mushrooms...§r");
    }
    
    // Find valid floor positions (mycelium with clear space above)
    const validSpots = [];
    
    for (let dx = -radius + 5; dx <= radius - 5; dx += 3) {
      for (let dz = -radius + 5; dz <= radius - 5; dz += 3) {
        const dist = Math.sqrt(dx*dx + dz*dz);
        if (dist > radius - 8) continue;
        
        // Find floor level
        for (let dy = -3; dy <= 15; dy++) {
          try {
            const floorBlock = dim.getBlock({ x: centerX + dx, y: centerY + dy, z: centerZ + dz });
            const aboveBlock = dim.getBlock({ x: centerX + dx, y: centerY + dy + 1, z: centerZ + dz });
            
            if (floorBlock && floorBlock.typeId === "minecraft:mycelium" && 
                aboveBlock && aboveBlock.isAir) {
              // Check if there's enough vertical space (8 blocks)
              let clearSpace = true;
              for (let checkUp = 1; checkUp <= 8; checkUp++) {
                const checkBlock = dim.getBlock({ x: centerX + dx, y: centerY + dy + checkUp, z: centerZ + dz });
                if (!checkBlock || !checkBlock.isAir) {
                  clearSpace = false;
                  break;
                }
              }
              
              if (clearSpace) {
                validSpots.push({ x: centerX + dx, y: centerY + dy + 1, z: centerZ + dz });
                break;
              }
            }
          } catch {}
        }
      }
    }
    
    // Place 3 giant red mushrooms
    for (let i = 0; i < 3 && i < validSpots.length; i++) {
      const spot = validSpots[Math.floor(Math.random() * validSpots.length)];
      validSpots.splice(validSpots.indexOf(spot), 1);
      
      buildGiantRedMushroom(dim, spot.x, spot.y, spot.z);
    }
    
    if (player) {
      player.sendMessage("§d§l✓ Giant mushrooms grown! ✓§r");
    }
    
    dim.runCommandAsync(`playsound block.fungus.place @a ${centerX} ${centerY} ${centerZ} 3.0 0.6 0`);
    
    // Spawn 4 bats in the cavern
    for (let i = 0; i < 4; i++) {
      const angle = (i * 90) * Math.PI / 180;
      const batX = centerX + Math.cos(angle) * (radius * 0.5);
      const batY = centerY + 5 + Math.random() * 5;
      const batZ = centerZ + Math.sin(angle) * (radius * 0.5);
      
      try {
        dim.runCommandAsync(`summon bat ${batX} ${batY} ${batZ}`).catch(()=>{});
        dim.spawnParticle("minecraft:villager_happy", { x: batX, y: batY, z: batZ });
      } catch {}
    }
    
    if (player) {
      player.sendMessage("§d🦇 Bats have moved in!§r");
    }
    
    dim.runCommandAsync(`playsound mob.bat.takeoff @a ${centerX} ${centerY} ${centerZ} 2.0 1.0 0`);
    
  } catch (err) {
    console.warn("Giant mushroom generation error:", err);
  }
}

// Build a giant red mushroom (5x5 cap, 5 block tall stem)
function buildGiantRedMushroom(dim, x, y, z) {
  try {
    // Stem (5 blocks tall) - brown mushroom block with all sides
    for (let stemY = 0; stemY < 5; stemY++) {
      try {
        const stemBlock = dim.getBlock({ x, y: y + stemY, z });
        if (stemBlock && stemBlock.isAir) {
          stemBlock.setType("minecraft:brown_mushroom_block");
        }
      } catch {}
    }
    
    // Cap layers (5x5 red blocks)
    const capY = y + 4;
    
    // Bottom layer of cap - 5x5
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        try {
          const capBlock = dim.getBlock({ x: x + dx, y: capY, z: z + dz });
          if (capBlock && capBlock.isAir) {
            capBlock.setType("minecraft:red_mushroom_block");
          }
        } catch {}
      }
    }
    
    // Middle layer - 5x5
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        try {
          const capBlock = dim.getBlock({ x: x + dx, y: capY + 1, z: z + dz });
          if (capBlock && capBlock.isAir) {
            capBlock.setType("minecraft:red_mushroom_block");
          }
        } catch {}
      }
    }
    
    // Top layer - 3x3 (rounded top)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        try {
          const capBlock = dim.getBlock({ x: x + dx, y: capY + 2, z: z + dz });
          if (capBlock && capBlock.isAir) {
            capBlock.setType("minecraft:red_mushroom_block");
          }
        } catch {}
      }
    }
    
    // Particle effect
    for (let a = 0; a < 360; a += 60) {
      const angle = a * Math.PI / 180;
      dim.spawnParticle("minecraft:villager_happy", {
        x: x + Math.cos(angle) * 3,
        y: capY + 1,
        z: z + Math.sin(angle) * 3
      });
    }
    
  } catch (err) {
    console.warn("Build giant mushroom error:", err);
  }
}

// Generate 12 mangrove trees and 1-2 slimes in swamp
function generateMangroves(dim, centerX, centerY, centerZ, radius, player) {
  try {
    if (player) {
      player.sendMessage("§2§l🌿 Growing MANGROVE forest...§r");
    }
    
    const validSpots = [];
    
    for (let dx = -radius + 3; dx <= radius - 3; dx += 2) {
      for (let dz = -radius + 3; dz <= radius - 3; dz += 2) {
        const dist = Math.sqrt(dx*dx + dz*dz);
        if (dist > radius - 5) continue;
        
        for (let dy = -5; dy <= 5; dy++) {
          try {
            const floorBlock = dim.getBlock({ x: centerX + dx, y: centerY + dy, z: centerZ + dz });
            const aboveBlock = dim.getBlock({ x: centerX + dx, y: centerY + dy + 1, z: centerZ + dz });
            
            const floorId = floorBlock?.typeId || "";
            if ((floorId === "minecraft:grass_block" || floorId === "minecraft:dirt") && 
                aboveBlock && aboveBlock.isAir) {
              let clearSpace = true;
              for (let checkUp = 1; checkUp <= 10; checkUp++) {
                const checkBlock = dim.getBlock({ x: centerX + dx, y: centerY + dy + checkUp, z: centerZ + dz });
                if (!checkBlock || !checkBlock.isAir) {
                  clearSpace = false;
                  break;
                }
              }
              
              if (clearSpace) {
                validSpots.push({ x: centerX + dx, y: centerY + dy + 1, z: centerZ + dz });
                break;
              }
            }
          } catch {}
        }
      }
    }
    
    // Place 12 mangrove trees
    for (let i = 0; i < 12 && i < validSpots.length; i++) {
      const spot = validSpots[Math.floor(Math.random() * validSpots.length)];
      validSpots.splice(validSpots.indexOf(spot), 1);
      buildMangroveTree(dim, spot.x, spot.y, spot.z);
    }
    
    if (player) {
      player.sendMessage("§2§l✓ Mangrove forest grown! ✓§r");
    }
    
    dim.runCommandAsync(`playsound block.mangrove_roots.place @a ${centerX} ${centerY} ${centerZ} 3.0 0.8 0`);
    
    // Spawn 1-2 slimes
    const slimeCount = Math.floor(Math.random() * 2) + 1;
    for (let i = 0; i < slimeCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const slimeR = Math.random() * (radius * 0.6);
      const slimeX = centerX + Math.cos(angle) * slimeR;
      const slimeZ = centerZ + Math.sin(angle) * slimeR;
      
      for (let dy = -5; dy <= 5; dy++) {
        try {
          const groundBlock = dim.getBlock({ x: Math.floor(slimeX), y: centerY + dy, z: Math.floor(slimeZ) });
          const aboveGround = dim.getBlock({ x: Math.floor(slimeX), y: centerY + dy + 1, z: Math.floor(slimeZ) });
          
          if (groundBlock && !groundBlock.isAir && aboveGround && aboveGround.isAir) {
            dim.runCommandAsync(`summon slime ${slimeX} ${centerY + dy + 1} ${slimeZ}`).catch(()=>{});
            dim.spawnParticle("minecraft:villager_happy", { x: slimeX, y: centerY + dy + 2, z: slimeZ });
            break;
          }
        } catch {}
      }
    }
    
    if (player) {
      player.sendMessage("§2🟢 Slimes have appeared!§r");
    }
    
    dim.runCommandAsync(`playsound mob.slime.squish @a ${centerX} ${centerY} ${centerZ} 2.0 0.8 0`);
    
  } catch (err) {
    console.warn("Mangrove generation error:", err);
  }
}

// Build mangrove tree (5-7 tall with roots and leaves)
function buildMangroveTree(dim, x, y, z) {
  try {
    const height = 5 + Math.floor(Math.random() * 3);
    
    // Mangrove roots (2 blocks down)
    for (let rootY = -2; rootY < 0; rootY++) {
      try {
        const rootBlock = dim.getBlock({ x, y: y + rootY, z });
        if (rootBlock && rootBlock.isAir) {
          rootBlock.setType("minecraft:mangrove_roots");
        }
      } catch {}
    }
    
    // Trunk
    for (let trunkY = 0; trunkY < height; trunkY++) {
      try {
        const trunkBlock = dim.getBlock({ x, y: y + trunkY, z });
        if (trunkBlock && trunkBlock.isAir) {
          trunkBlock.setType("minecraft:mangrove_log");
        }
      } catch {}
    }
    
    // Canopy (3x3x2 leaves)
    const canopyY = y + height - 1;
    
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          try {
            const leafBlock = dim.getBlock({ x: x + dx, y: canopyY + dy, z: z + dz });
            if (leafBlock && leafBlock.isAir) {
              leafBlock.setType("minecraft:mangrove_leaves");
            }
          } catch {}
        }
      }
    }
    
    // Top leaf
    try {
      const topBlock = dim.getBlock({ x, y: canopyY + 2, z });
      if (topBlock && topBlock.isAir) {
        topBlock.setType("minecraft:mangrove_leaves");
      }
    } catch {}
    
    // Hanging propagule (20% chance)
    if (Math.random() < 0.2) {
      const hangDx = Math.floor(Math.random() * 3) - 1;
      const hangDz = Math.floor(Math.random() * 3) - 1;
      try {
        const hangBlock = dim.getBlock({ x: x + hangDx, y: canopyY - 1, z: z + hangDz });
        if (hangBlock && hangBlock.isAir) {
          hangBlock.setType("minecraft:mangrove_propagule");
        }
      } catch {}
    }
    
  } catch (err) {
    console.warn("Build mangrove error:", err);
  }
}
