import { world, system, ItemStack, EnchantmentTypes } from "@minecraft/server";
// Note: Enchanted book handling tries both stored_enchantments and enchantments components for compatibility.

// Chat command: !testbook [enchant] [level] to spawn enchanted books for testing
function toCamelFromSnake(name) {
  return name.replace(/[_-](\w)/g, (_,c)=>c?c.toUpperCase():"");
}
function resolveEnchantType(name) {
  if (!name) return null;
  const raw = String(name).toLowerCase().replace(/^minecraft:/, "");
  const camel = toCamelFromSnake(raw);
  const t = EnchantmentTypes?.[camel];
  if (t) return t;
  const aliases = {
    looting: "looting",
    fortune: "fortune",
    mending: "mending",
    unbreaking: "unbreaking",
    efficiency: "efficiency",
    sharpness: "sharpness",
    protection: "protection",
    thorns: "thorns",
    respiration: "respiration",
    luckofthesea: "luckOfTheSea",
    luck_of_the_sea: "luckOfTheSea",
    lure: "lure"
  };
  const key = aliases[raw] || aliases[camel] || null;
  return key ? EnchantmentTypes?.[key] : null;
}
function giveEnchantedBook(player, typeName, level) {
  const lvl = Math.max(1, Math.min(5, Number(level) || 3));
  const book = new ItemStack("minecraft:enchanted_book", 1);
  let applied = false;
  const type = resolveEnchantType(typeName);
  try {
    const stored = book.getComponent("minecraft:stored_enchantments");
    if (stored && type) {
      stored.enchantments?.addEnchantment?.({ type, level: lvl });
      book.setComponent(stored);
      applied = true;
    }
  } catch {}
  if (!applied) {
    try {
      const ench = book.getComponent("minecraft:enchantments");
      if (ench && type) {
        ench.enchantments?.addEnchantment?.({ type, level: lvl });
        book.setComponent(ench);
        applied = true;
      }
    } catch {}
  }
  try {
    const inv = player.getComponent("minecraft:inventory");
    const cont = inv?.container;
    if (cont?.addItem) cont.addItem(book); else player.dimension.spawnItem(book, player.location);
  } catch { try { player.dimension.spawnItem(book, player.location); } catch {} }
  try { player.sendMessage(`Gave enchanted book${type?` (${typeName} ${lvl})`:""}.`); } catch {}
}
try {
  world.beforeEvents.chatSend.subscribe(ev => {
    const msg = (ev.message || "").trim();
    const player = ev.sender;
    if (!player || !msg) return;
    const lower = msg.toLowerCase();
    if (lower.startsWith("!testbook")) {
      ev.cancel = true;
      const parts = msg.split(/\s+/);
      if (parts.length === 1) {
        // Use loot table for random book to mirror real behavior
        const p = player.location;
        const cmd = `loot spawn ${Math.floor(p.x)} ${Math.floor(p.y)} ${Math.floor(p.z)} loot "gameplay/constructor_random_book"`;
        try { player.dimension.runCommandAsync?.(cmd); } catch {}
      } else if (parts.length >= 2) {
        const enchName = parts[1];
        const lvl = parts[2] ? parseInt(parts[2],10) : 3;
        const t = resolveEnchantType(enchName);
        if (!t) { try { player.sendMessage(`Unknown enchant '${enchName}'. Try one of: mending, unbreaking, efficiency, fortune, sharpness, protection, luck_of_the_sea, lure.`); } catch {}; return; }
        giveEnchantedBook(player, enchName, isNaN(lvl)?3:lvl);
      }
    }
  });
} catch {}

const COOLDOWNS = new Map();

// High-end drop pools (no leather/stone). Some drops may be enchanted.
const FISHES = ["minecraft:cod", "minecraft:salmon", "minecraft:tropical_fish", "minecraft:pufferfish"];
const MATERIALS = [
  "minecraft:iron_ingot",
  "minecraft:gold_ingot",
  "minecraft:diamond",
  "minecraft:emerald",
  "minecraft:amethyst_shard",
  "minecraft:netherite_scrap"
];
const ARMOR = [
  // Iron
  "minecraft:iron_helmet",
  "minecraft:iron_chestplate",
  "minecraft:iron_leggings",
  "minecraft:iron_boots",
  // Diamond
  "minecraft:diamond_helmet",
  "minecraft:diamond_chestplate",
  "minecraft:diamond_leggings",
  "minecraft:diamond_boots",
  // Netherite
  "minecraft:netherite_helmet",
  "minecraft:netherite_chestplate",
  "minecraft:netherite_leggings",
  "minecraft:netherite_boots"
];
const TOOLS = [
  // Iron
  "minecraft:iron_pickaxe",
  "minecraft:iron_axe",
  "minecraft:iron_shovel",
  "minecraft:iron_hoe",
  // Diamond
  "minecraft:diamond_pickaxe",
  "minecraft:diamond_axe",
  "minecraft:diamond_shovel",
  "minecraft:diamond_hoe",
  // Netherite
  "minecraft:netherite_pickaxe",
  "minecraft:netherite_axe",
  "minecraft:netherite_shovel",
  "minecraft:netherite_hoe"
];
const WEAPONS = [
  "minecraft:iron_sword",
  "minecraft:diamond_sword",
  "minecraft:netherite_sword",
  "minecraft:bow",
  "minecraft:crossbow",
  "minecraft:trident"
];

function randOf(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function maybeEnchant(item) {
  try {
    const ench = item.getComponent("minecraft:enchantments");
    if (!ench) return item;
    // 50% chance to enchant, level 1-3, filtered by item type
    if (Math.random() < 0.5) {
      const id = item.typeId;
      let options = [];
      if (id.includes("pickaxe") || id.includes("axe") || id.includes("shovel") || id.includes("hoe")) {
        options = [EnchantmentTypes.unbreaking, EnchantmentTypes.mending, EnchantmentTypes.efficiency, EnchantmentTypes.fortune];
      } else if (id.includes("sword")) {
        options = [EnchantmentTypes.unbreaking, EnchantmentTypes.mending, EnchantmentTypes.sharpness, EnchantmentTypes.looting, EnchantmentTypes.thorns];
      } else if (id.includes("bow") || id.includes("crossbow") || id.includes("trident")) {
        options = [EnchantmentTypes.unbreaking, EnchantmentTypes.mending];
      } else if (id.includes("helmet") || id.includes("chestplate") || id.includes("leggings") || id.includes("boots")) {
        options = [EnchantmentTypes.unbreaking, EnchantmentTypes.mending, EnchantmentTypes.protection, EnchantmentTypes.thorns, EnchantmentTypes.respiration];
      }
      options = options.filter(Boolean);
      const type = randOf(options);
      if (type) {
        const level = 1 + Math.floor(Math.random() * 3);
        // Use nested enchantments list per Bedrock API
        ench.enchantments?.addEnchantment?.({ type, level });
        item.setComponent(ench);
      }
    }
  } catch {}
  return item;
}

function createHighEndDrop() {
  // Get rarity setting from feature flags (default, half, extremely_rare)
  let rarityMode = "default";
  try {
    const FEATURE_FLAGS_KEY = "labs_feature_flags";
    const raw = world.getDynamicProperty?.(FEATURE_FLAGS_KEY);
    const flags = raw && typeof raw === 'string' ? JSON.parse(raw) : {};
    rarityMode = flags?.fisherRarity || "default";
  } catch {}
  
  const roll = Math.random();
  // Adjust weights based on rarity mode
  let fishThreshold = 0.45;
  let materialThreshold = 0.65;
  let bookThreshold = 0.78;
  let toolThreshold = 0.90;
  let armorThreshold = 0.98;
  
  if (rarityMode === "half") {
    // Half rarity: reduce rare items by making common items more likely
    fishThreshold = 0.60;
    materialThreshold = 0.75;
    bookThreshold = 0.85;
    toolThreshold = 0.93;
    armorThreshold = 0.99;
  } else if (rarityMode === "extremely_rare") {
    // Extremely rare: 1 in 15 chance for rare items (≈6.67% for books/tools/armor/special)
    fishThreshold = 0.70;
    materialThreshold = 0.85;
    bookThreshold = 0.90;
    toolThreshold = 0.95;
    armorThreshold = 0.99;
  }
  
  // Weighted: fish common, materials uncommon, books/tools/armor rarer, netherite-tier rarest
  if (roll < fishThreshold) return new ItemStack(randOf(FISHES), 1);
  if (roll < materialThreshold) return new ItemStack(randOf(MATERIALS), 1 + (Math.random() < 0.3 ? 1 : 0));
  if (roll < bookThreshold) {
    // Enchanted book (rare) — attach stored enchantment (Bedrock scripting)
    try {
      const book = new ItemStack("minecraft:enchanted_book", 1);
      let applied = false;
      // Preferred: stored_enchantments on enchanted_book
      try {
        const stored = book.getComponent("minecraft:stored_enchantments");
        if (stored) {
          const types = [
            EnchantmentTypes.mending,
            EnchantmentTypes.unbreaking,
            EnchantmentTypes.efficiency,
            EnchantmentTypes.fortune,
            EnchantmentTypes.sharpness,
            EnchantmentTypes.protection,
          ].filter(Boolean);
          const t = randOf(types);
          // Prefer nested list if present
          if (t) stored.enchantments?.addEnchantment?.({ type: t, level: 2 + Math.floor(Math.random() * 2) });
          book.setComponent(stored);
          applied = true;
        }
      } catch {}
      // Fallback: some engines expose only minecraft:enchantments
      if (!applied) {
        try {
          const ench = book.getComponent("minecraft:enchantments");
          if (ench) {
            const types = [
              EnchantmentTypes.mending,
              EnchantmentTypes.unbreaking,
              EnchantmentTypes.efficiency,
              EnchantmentTypes.fortune,
              EnchantmentTypes.sharpness,
              EnchantmentTypes.protection,
            ].filter(Boolean);
            const t = randOf(types);
            if (t) ench.enchantments?.addEnchantment?.({ type: t, level: 2 + Math.floor(Math.random() * 2) });
            book.setComponent(ench);
            applied = true;
          }
        } catch {}
      }
      return book;
    } catch {}
    return new ItemStack("minecraft:enchanted_book", 1);
  }
  if (roll < toolThreshold) return maybeEnchant(new ItemStack(randOf(TOOLS.concat(WEAPONS)), 1));
  if (roll < armorThreshold) return maybeEnchant(new ItemStack(randOf(ARMOR), 1));
  // Very rare: special cases (e.g., fishing rod with Lure III + Luck of the Sea III)
  // 2% chance overall above — further split:
  const sub = Math.random();
  if (sub < 0.6) {
    // Guaranteed enchanted fishing rod
    const rod = new ItemStack("minecraft:fishing_rod", 1);
    try {
      const ench = rod.getComponent("minecraft:enchantments");
      if (ench && EnchantmentTypes.lure && EnchantmentTypes.luckOfTheSea) {
        ench.addEnchantment({ type: EnchantmentTypes.lure, level: 3 });
        ench.addEnchantment({ type: EnchantmentTypes.luckOfTheSea, level: 3 });
        rod.setComponent(ench);
      }
    } catch {}
    return rod;
  }
  // Otherwise drop a top-tier material
  return new ItemStack(Math.random() < 0.5 ? "minecraft:diamond" : "minecraft:netherite_scrap", 1);
}

function getYaw(entity) {
  // Try multiple APIs for rotation; fall back to 0
  try {
    if (typeof entity.getRotation === "function") {
      const r = entity.getRotation();
      if (r && typeof r.y === "number") return r.y;
    }
  } catch {}
  try {
    const r = entity.rotation;
    if (r && typeof r.y === "number") return r.y;
  } catch {}
  return 0;
}

function getForward(entity) {
  const yaw = getYaw(entity);
  const rad = (yaw * Math.PI) / 180;
  return { x: Math.cos(rad), z: Math.sin(rad) };
}

function nearestWaterDir(entity){
  try{
    const dim = entity.dimension; const o=entity.location; const oy=Math.floor(o.y);
    let best=null, bd2=Infinity;
    for(let dx=-4; dx<=4; dx++){
      for(let dz=-4; dz<=4; dz++){
        if (dx===0 && dz===0) continue;
        const dist2 = dx*dx + dz*dz; if (dist2> (4*4)) continue;
        for(let drop=0; drop<=3; drop++){
          const pos={ x: Math.floor(o.x)+dx, y: oy-drop, z: Math.floor(o.z)+dz };
          try{
            const b=dim.getBlock(pos);
            const id=String(b?.typeId||"");
            if (id.includes("water")){
              if (dist2 < bd2){ bd2=dist2; best={ dx, dz, pos }; }
              break;
            }
          }catch{}
        }
      }
    }
    if (!best) return { found:false };
    // Compute yaw that faces best dx,dz (matching getForward: x=cos, z=sin)
    const yaw = (Math.atan2(best.dz, best.dx) * 180) / Math.PI;
    return { found:true, yaw, pos: best.pos };
  }catch{ return { found:false }; }
}
function hasWaterAheadBelow(entity) {
  const r = nearestWaterDir(entity);
  // Optionally orient a bit toward nearest water
  try{ if (r.found){ const cur=entity.getRotation?.(); const cy=typeof cur?.y==='number'?cur.y:0; const target=r.yaw; const diff=((target - cy + 540)%360)-180; if (Math.abs(diff)>15){ entity.setRotation?.({x:0, y: cy + Math.sign(diff)*10 }); } } }catch{}
  return !!r.found;
}

const NAMED = new Set();

// Fisher Bot: spawn with a chest, deposit catches into it, despawn when chest is full
const FISHER_STATE = new Map(); // id -> { chest:{x,y,z} }

function toBlk(v){ return { x: Math.floor(v.x), y: Math.floor(v.y), z: Math.floor(v.z) }; }

// Chest discovery similar to BeeKeeper: prefer cached, adjacent, then nearby within ±4Y
 function listChests(dim, center, radius=4, dyMin=-4, dyMax=4){
   const c = toBlk(center);
   const out=[];
   for(let dx=-radius; dx<=radius; dx++) for(let dz=-radius; dz<=radius; dz++) for(let dy=dyMin; dy<=dyMax; dy++){
     try{ const b=dim.getBlock({x:c.x+dx,y:c.y+dy,z:c.z+dz}); const cont=b?.getComponent?.("minecraft:inventory")?.container; if (cont && cont.size>0) out.push({x:b.location.x,y:b.location.y,z:b.location.z}); }catch{}
   }
   out.sort((a,b)=>{ const da=(a.x-c.x)**2+(a.y-c.y)**2+(a.z-c.z)**2; const db=(b.x-c.x)**2+(b.y-c.y)**2+(b.z-c.z)**2; return da-db; });
   return out;
 }
 function getCandidateChests(bot){
   const dim=bot.dimension; const st=FISHER_STATE.get(bot.id)||{}; const c=toBlk(bot.location); const out=[];
   // verify cached
   try{ const cont = st.chest ? dim.getBlock(st.chest)?.getComponent("minecraft:inventory")?.container : null; if (!cont) st.chest=undefined; }catch{}
   if (st.chest) out.push(st.chest);
   // adjacency
   try{ const adj=listChests(dim, bot.location, 1, -1, 1); for(const p of adj){ if (!out.find(q=>q.x===p.x&&q.y===p.y&&q.z===p.z)) out.push(p); } }catch{}
   // nearby within 4 blocks up/down
   try{ const near=listChests(dim, bot.location, 4, -4, 4); for(const p of near){ if (!out.find(q=>q.x===p.x&&q.y===p.y&&q.z===p.z)) out.push(p); } }catch{}
   FISHER_STATE.set(bot.id, st);
   return out;
 }
 
 function labelChestWithOwner(bot, owner){
  try{
    const st=FISHER_STATE.get(bot.id); if(!st||!st.chest) return;
    const dim=bot.dimension; const up={x:st.chest.x, y:st.chest.y+1, z:st.chest.z};
    const b=dim.getBlock(up);
    const id=String(b?.typeId||"");
    if (!b) return;
    if (id==="minecraft:air"){
      try{ b.setType("minecraft:oak_sign"); }catch{}
      try{
        const signComp=b.getComponent?.("minecraft:sign");
        if (signComp){
          try{ signComp.setText?.(`Owner: ${owner}`); }catch{}
          try{ signComp.setText?.(`Owner: ${owner}`, "Front"); }catch{}
        }
      }catch{}
    }
  }catch{}
}

function placeChestNextTo(bot){
  try{
    const dim = bot.dimension; const base = toBlk(bot.location);
    const spots=[{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}];
    for(const s of spots){
      const p={x:base.x+s.x,y:base.y,z:base.z+s.z};
      try{ const b=dim.getBlock(p); const id=String(b?.typeId||""); if(!b) continue; if (id!=="minecraft:air") continue; b.setType("minecraft:chest"); FISHER_STATE.set(bot.id, { chest:p }); const owner=findOwnerName(bot); labelChestWithOwner(bot, owner); return; }catch{}
    }
  }catch{}
}

function getChestContainer(bot){
  try{
    const st=FISHER_STATE.get(bot.id); if(!st||!st.chest) return null; const dim=bot.dimension; const b=dim.getBlock(st.chest); return b?.getComponent("minecraft:inventory")?.container || null;
  }catch{ return null; }
}

function depositIntoChest(bot, item){
  try{
    const dim = bot.dimension;
    const candidates = getCandidateChests(bot);
    if (!candidates.length) return -1;
    const type = String(item?.typeId||"");
    const amt = Math.max(1, Number(item?.amount||1));
    let remaining = amt;
    // Detect items with metadata/components (e.g. enchanted books) — preserve as-is
    let hasMeta=false;
    try{ const se=item.getComponent?.("minecraft:stored_enchantments"); if (se) hasMeta=true; }catch{}
    try{ const en=item.getComponent?.("minecraft:enchantments"); if (en) hasMeta=true; }catch{}
    for (const pos of candidates){
      const cont = dim.getBlock(pos)?.getComponent("minecraft:inventory")?.container; if (!cont) continue;
      if (hasMeta || type==="minecraft:enchanted_book"){
        if (type==="minecraft:enchanted_book"){
          try{ let slot=-1; for(let i=0;i<cont.size;i++){ if(!cont.getItem(i)){ slot=i; break; } } if (slot>=0){ const cmd = `loot replace block ${pos.x} ${pos.y} ${pos.z} slot.container ${slot} 1 loot \"gameplay/constructor_random_book\"`; try{ bot.dimension.runCommandAsync(cmd).catch(()=>{}); }catch{} return 1; } }catch{}
        }
        for(let i=0;i<cont.size;i++){ const cur=cont.getItem(i); if (!cur){ cont.setItem(i, item); return amt; } }
        continue;
      }
      let left = remaining; const maxPer = (new ItemStack(type,1)).maxAmount||64;
      for(let i=0;i<cont.size && left>0;i++){
        const cur = cont.getItem(i);
        if (cur && cur.typeId===type && cur.amount<cur.maxAmount){ const can = Math.min(left, cur.maxAmount - cur.amount); if (can>0){ cur.amount += can; cont.setItem(i, cur); left -= can; } }
      }
      for(let i=0;i<cont.size && left>0;i++){
        const cur = cont.getItem(i);
        if (!cur){ const put = Math.min(maxPer, left); cont.setItem(i, new ItemStack(type, put)); left -= put; }
      }
      const placed = remaining - left; if (placed>0){ remaining = left; if (remaining<=0) return amt; }
    }
    return amt - remaining;
  }catch{ return -1; }
}

function findOwnerName(bot){
  try{ const tags=bot.getTags?.()||[]; for(const t of tags){ if(String(t).startsWith("labs_owner:")) return String(t).slice("labs_owner:".length); } }catch{}
  return "";
}

// Drop a spawn egg on death
try {
  world.afterEvents.entityDie.subscribe(ev => {
    const e = ev.deadEntity;
    if (!e || e.typeId !== "myname:fisher_bot") return;
    try { if (e.getTags?.()?.includes("labs_retrieved")) return; } catch {}
    try {
      const egg = new ItemStack("myname:fisher_bot_spawn_egg", 1);
      e.dimension.spawnItem(egg, e.location);
    } catch {}
  });
} catch {}

// On spawn: place a chest next to the Fisher Bot
try{
  world.afterEvents.entitySpawn.subscribe(ev=>{
    const e=ev.entity; if(!e || e.typeId!=="myname:fisher_bot") return;
    system.runTimeout(()=>{ placeChestNextTo(e); }, 10);
  });
} catch {}

// Orient for a short period after spawn to match player facing
const ORIENT_COUNT = new Map(); // id -> ticks oriented so far
// const DEBUG_COUNT = new Map(); // id -> ticks of debug logs so far

system.runInterval(() => {
  const now = Date.now();
  for (const player of world.getPlayers()) {
    const dim = player.dimension;
    const bots = dim.getEntities({ type: "myname:fisher_bot" });
    for (const bot of bots) {
      const key = bot.id;

      // Always refresh nameTag to ensure it overrides default label
      try {
        const isBaby = !!bot.getComponent("minecraft:is_baby");
        const base = isBaby ? "MiniMe" : "Gunna";
        // status suffix added below after water check
        if (!bot.nameTag || !bot.nameTag.startsWith(base)) bot.nameTag = base;
      } catch {}
      // For the first ~20 ticks after we first see the bot, align its yaw to the nearest player's yaw
      const ticks = ORIENT_COUNT.get(key) || 0;
      if (ticks < 20) {
        try {
          let nearest = null;
          let best = 999999;
          for (const p of world.getPlayers()) {
            const dx = p.location.x - bot.location.x;
            const dz = p.location.z - bot.location.z;
            const d2 = dx*dx + dz*dz;
            if (d2 < best) { best = d2; nearest = p; }
          }
          if (nearest) {
            let pyaw = 0;
            try {
              const r = nearest.getRotation ? nearest.getRotation() : null;
              if (r && typeof r.y === "number") pyaw = r.y;
            } catch {}
            bot.setRotation({ x: 0, y: pyaw });
          }
        } catch {}
        ORIENT_COUNT.set(key, ticks + 1);
      }

      const ready = hasWaterAheadBelow(bot);
      try {
        const base = bot.typeId === "myname:fisher_bot"
          ? (bot.getComponent("minecraft:is_baby") ? "MiniMe" : "Fisher Bot")
          : (bot.getComponent("minecraft:is_baby") ? "MiniMe" : "Gunna");
        bot.nameTag = base + (ready ? " [Ready]" : " [No Water]");
      } catch {}

      // Short debug phase: (disabled once stable)
      // const dbg = DEBUG_COUNT.get(key) || 0;
      // if (dbg < 50) {
      //   try {
      //     const yaw = getYaw(bot);
      //     console.warn(`[Gunna] ${key} yaw=${Math.round(yaw)} ready=${ready}`);
      //   } catch {}
      //   DEBUG_COUNT.set(key, dbg + 1);
      // }

      if (!ready) continue;
      const last = COOLDOWNS.get(key) || 0;
      const delay = 30000 + Math.random() * 15000; // 30-45s
      if (now - last < delay) continue;
      try {
        const drop = createHighEndDrop();
        // Deposit into chest instead of dropping on ground
        if (drop) {
        let placed = depositIntoChest(bot, drop);
        if (placed === -1) {
          // Try to place a chest and reattempt deposit before dropping
          placeChestNextTo(bot);
          placed = depositIntoChest(bot, drop);
        }
        if (placed === -1) {
          // No chest available; drop in world as fallback
          try{ dim.spawnItem(drop, { x: bot.location.x, y: bot.location.y + 0.5, z: bot.location.z }); }catch{}
        } else if (placed < (drop.amount||1)){
          // Chest full — try other nearby chests once more
          const remaining = (drop.amount||1) - placed; const type=drop.typeId; const extraPlaced = depositIntoChest(bot, new ItemStack(type, remaining));
          if (extraPlaced < remaining){
            // Still full — notify owner and despawn bot (no egg)
            const owner = findOwnerName(bot);
            try{ const p = world.getPlayers().find(x=>x.name===owner); if(p) p.sendMessage("Your Fisher Bot's chest(s) are full. It has finished work and despawned."); }catch{}
            try{ bot.addTag?.("labs_retrieved"); }catch{}
            try{ bot.kill?.(); }catch{}
            continue;
          }
        }
        }
        // Sound on catch (Fisher Bot uses random.orb, Gunna uses bell)
        try {
        const pos = { x: bot.location.x, y: bot.location.y, z: bot.location.z };
        const soundId = bot.typeId === "myname:fisher_bot" ? "random.orb" : "block.bell.use";
        if (typeof dim.playSound === "function") dim.playSound(soundId, pos, { volume: 1, pitch: 1.0 });
          else if (typeof world.playSound === "function") world.playSound(soundId, pos, { volume: 1, pitch: 1.0 });
        } catch {}
        } catch (e) {}
        COOLDOWNS.set(key, now);
    }
  }
}, 20);

