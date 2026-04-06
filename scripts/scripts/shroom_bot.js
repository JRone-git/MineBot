import { world, system, ItemStack } from "@minecraft/server";

try { console.warn?.("[LABS] shroom_bot.js loaded"); } catch {}

// IDs
const RED = "minecraft:red_mushroom";
const BROWN = "minecraft:brown_mushroom";
const CRIMSON = "minecraft:crimson_fungus";
const WARPED = "minecraft:warped_fungus";
const CRIMSON_NYL = "minecraft:crimson_nylium";
const WARPED_NYL = "minecraft:warped_nylium";
const FLY_ID = "myname:fly_high_shroom";
const ZOOM_ID = "myname:zoom_shroom";

const SHROOM_IDS = new Set([RED, BROWN]);
const FUNGUS_IDS = new Set([CRIMSON, WARPED]);
const PLANT_IDS = new Set([RED, BROWN, CRIMSON, WARPED]);
const SUBSTRATES = new Set([
  "minecraft:podzol",
  "minecraft:mycelium",
  "minecraft:dirt",
  "minecraft:coarse_dirt",
  "minecraft:grass_block",
  "minecraft:moss_block",
]);
function isLogLike(id){ return /(_log$|_stem$|hyphae$)/.test(id); }

const PLANT_RADIUS = 25;

const STATE = new Map(); // bot.id -> { chest:{x,y,z}|null, nextPlant:number, nextChest:number }

function toBlk(v) { return { x: Math.floor(v.x), y: Math.floor(v.y), z: Math.floor(v.z) }; }

function getYaw(entity){
  try{ const r=entity.getRotation?.(); if (r && typeof r.y==='number') return r.y; }catch{}
  try{ const r=entity.rotation; if (r && typeof r.y==='number') return r.y; }catch{}
  return 0;
}
function rightVec(yawDeg){ const r=(yawDeg*Math.PI)/180; return { x: Math.cos(r), z: Math.sin(r) }; }
function canStand(dim, x, y, z){
  try{ const here=dim.getBlock({x,y,z}); const below=dim.getBlock({x,y:y-1,z}); const hid=String(here?.typeId||""); const bid=String(below?.typeId||"");
    return (hid==="minecraft:air") && (bid!=="minecraft:air");
  }catch{ return false; }
}
function jumpSteps(e, dir, steps){ // dir: -1 left, +1 right (relative to current yaw)
  try{
    const dim=e.dimension; const base=toBlk(e.location); const yaw=getYaw(e); const rv=rightVec(yaw);
    const dx = Math.round(rv.x * dir * steps); const dz = Math.round(rv.z * dir * steps);
    const tx = base.x + dx, tz = base.z + dz, ty = base.y;
    if (!canStand(dim, tx, ty, tz)) return false;
    try{ e.teleport({ x: tx + 0.5, y: ty + 1, z: tz + 0.5 }, { dimension: dim, keepVelocity:false, checkForBlocks:true, rotation:{x:0,y:yaw} }); }catch{}
    return true;
  }catch{ return false; }
}
function emitDanceParticles(e){
  try{
    const dim=e.dimension; const p=e.location;
    const parts=["minecraft:happy_villager","minecraft:note","minecraft:heart","minecraft:heart_particle"];
    for(const id of parts){ try{ dim.runCommandAsync(`particle ${id} ${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)}`).catch(()=>{}); }catch{} }
  }catch{}
}
function spinTwice(e){
  try{
    const steps=16; // two full spins, 22.5° per step
    const startYaw=getYaw(e);
    for(let i=1;i<=steps;i++){
      system.runTimeout(()=>{ try{ const y = (startYaw + (360/8)*i) % 360; e.setRotation?.({x:0,y}); if (i%2===0) emitDanceParticles(e); const COLORS=["§d","§5","§b","§a","§e"]; const col=COLORS[i%COLORS.length]; try{ e.nameTag = `Shroom Bot ${col}♫♪♬§r`; }catch{} }catch{} }, i*2);
    }
    system.runTimeout(()=>{ try{ emitDanceParticles(e); e.nameTag = "Shroom Bot"; }catch{} }, (steps+2)*2);
  }catch{}
}
function startDance(e, ms){
  const end = Date.now() + ms;
  const doCycle = (dir)=>{
    if (!e || !e.id) return; if (Date.now()>end) return;
    // left/right sequence
    const a = ()=>{ jumpSteps(e, dir, 2); emitDanceParticles(e); };
    const b = ()=>{ jumpSteps(e, -dir, 2); emitDanceParticles(e); };
    const c = ()=>{ spinTwice(e); };
    const d = ()=>{ jumpSteps(e, -dir, 2); emitDanceParticles(e); };
    const eback = ()=>{ jumpSteps(e, dir, 2); emitDanceParticles(e); };
    // schedule: stagger actions
    a();
    system.runTimeout(()=>{ b(); }, 10);
    system.runTimeout(()=>{ c(); }, 30);
    system.runTimeout(()=>{ d(); }, 60);
    system.runTimeout(()=>{ eback(); }, 80);
    system.runTimeout(()=>{ c(); }, 100);
    system.runTimeout(()=>{ doCycle(-dir); }, 140);
  };
  doCycle(-1);
}

function hasSkyAccess(dim, pos){
  try{
    for(let y=pos.y+1; y<=319; y++){
      const b = dim.getBlock({ x: pos.x, y, z: pos.z });
      const id = String(b?.typeId||"");
      if (id && id !== "minecraft:air") return false;
    }
    return true;
  } catch { return false; }
}

async function queryDaytime(dim){
  try{
    const r = await dim.runCommandAsync("time query daytime");
    const m = String(r?.statusMessage||"");
    const n = m.match(/\d+/); return n?Number(n[0]):0;
  }catch{ return 0; }
}
function isNightVal(daytime){ return daytime >= 13000; }

function findChestNear(dim, center, radius=6){
  const base = toBlk(center);
  for(let dx=-radius; dx<=radius; dx++) for(let dz=-radius; dz<=radius; dz++) for(let dy=-2; dy<=2; dy++){
    try{
      const b = dim.getBlock({ x: base.x+dx, y: base.y+dy, z: base.z+dz });
      const cont = b?.getComponent("minecraft:inventory")?.container;
      if (cont && cont.size>0) return b.location;
    }catch{}
  }
  return null;
}

function scanNearby(dim, center, radius=15){
  const base = toBlk(center);
  let hasMush=false, hasCrimson=false, hasWarped=false;
  for(let dx=-radius; dx<=radius; dx++) for(let dz=-radius; dz<=radius; dz++) for(let dy=-2; dy<=2; dy++){
    try{
      const b = dim.getBlock({ x: base.x+dx, y: base.y+dy, z: base.z+dz });
      const id = String(b?.typeId||"");
      if (SHROOM_IDS.has(id)) hasMush = true;
      if (id===CRIMSON) hasCrimson = true;
      if (id===WARPED) hasWarped = true;
    }catch{}
  }
  return { hasMush, hasCrimson, hasWarped };
}

function insertIntoChest(dim, chestPos, itemId, amount=1){
  try{
    const cont = dim.getBlock(chestPos)?.getComponent("minecraft:inventory")?.container; if(!cont) return false;
    const stack = new ItemStack(itemId, amount);
    // merge first
    for(let i=0;i<cont.size;i++){ const cur=cont.getItem(i); if(cur && cur.typeId===itemId && cur.amount<cur.maxAmount){ const can=Math.min(amount, cur.maxAmount-cur.amount); cur.amount+=can; cont.setItem(i,cur); amount-=can; if(amount<=0) return true; } }
    for(let i=0;i<cont.size && amount>0;i++){ const cur=cont.getItem(i); if(!cur){ const place=Math.min(stack.maxAmount||64, amount); cont.setItem(i, new ItemStack(itemId, place)); amount-=place; } }
    return amount<=0;
  }catch{ return false; }
}

function randomInt(a,b){ return a + Math.floor(Math.random()*(b-a+1)); }
function randPick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

function choosePlantSpot(dim, center, radius, requireNylium, preferSubstrate){
  const base = toBlk(center);
  for(let tries=0; tries<60; tries++){
    const x = base.x + randomInt(-radius, radius);
    const z = base.z + randomInt(-radius, radius);
    const y = base.y + randomInt(-2, 2);
    try{
      const here = dim.getBlock({x,y,z}); const below = dim.getBlock({x,y:y-1,z});
      if (!here || !below) continue;
      const hereId = String(here.typeId||""); const belowId = String(below.typeId||"");
      if (hereId !== "minecraft:air") continue;
      if (requireNylium){ if (!(belowId===CRIMSON_NYL || belowId===WARPED_NYL)) continue; }
      else {
        if (belowId==="minecraft:air") continue;
        if (preferSubstrate && !(SUBSTRATES.has(belowId) || isLogLike(belowId))) continue;
      }
      return { x, y, z, belowId };
    }catch{}
  }
  return null;
}

function plantBlock(dim, pos, id){ try{ dim.getBlock(pos)?.setType(id); return true; }catch{ return false; } }

function computePlantingStats(dim, center, radius){
  const base = toBlk(center);
  let candidate = 0, planted = 0;
  for(let dx=-radius; dx<=radius; dx++){
    for(let dz=-radius; dz<=radius; dz++){
      if (dx*dx + dz*dz > radius*radius) continue;
      const x = base.x + dx, z = base.z + dz;
      // count candidate spot in this column
      let colCounted = false;
      for(let dy=-2; dy<=2; dy++){
        try{
          const y = base.y + dy;
          const here = dim.getBlock({x,y,z}); const below = dim.getBlock({x,y:y-1,z});
          const hereId = String(here?.typeId||""); const belowId = String(below?.typeId||"");
          if (!colCounted && hereId==="minecraft:air" && belowId!=="minecraft:air"){ candidate++; colCounted=true; }
          if (PLANT_IDS.has(hereId)) planted++;
        }catch{}
      }
    }
  }
  return { candidate, planted, cap: Math.floor(candidate * 0.75) };
}

function fxPlant(dim, pos){
  try{ dim.runCommandAsync(`playsound item.bone_meal.use @a ${pos.x} ${pos.y} ${pos.z} 1 1 0`).catch(()=>{}); }catch{}
  try{ dim.runCommandAsync(`particle minecraft:happy_villager ${pos.x} ${pos.y} ${pos.z}`).catch(()=>{}); }catch{}
}
function fxChest(dim, pos){
  try{ dim.runCommandAsync(`playsound random.orb @a ${pos.x} ${pos.y} ${pos.z} 1 1 0`).catch(()=>{}); }catch{}
  try{ dim.runCommandAsync(`particle minecraft:happy_villager ${pos.x} ${pos.y} ${pos.z}`).catch(()=>{}); }catch{}
}
 
 // Spawn logic and quips
try{
  world.afterEvents.entitySpawn.subscribe(ev=>{
    const e = ev.entity; if(!e || e.typeId!=="myname:shroom_bot") return;
    system.runTimeout(async ()=>{
      try{
        const dim = e.dimension; const pos = toBlk(e.location);
        // Play her song on placement
        try{ dim.runCommandAsync(`playsound labs.shroom_song @a ${pos.x} ${pos.y} ${pos.z} 1 1 0`).catch(()=>{}); }catch{}
        // Face like nearest player and dance ~146 seconds
        try{ const r=e.getRotation?.(); if (r) e.setRotation?.({x:0,y:r.y}); }catch{}
        try{ startDance(e, 146000); }catch{}
        // Find chest
        const chest = findChestNear(dim, e.location, 6);
        const day = await queryDaytime(dim);
        const night = isNightVal(day);
        const outside = hasSkyAccess(dim, pos);
        const nearby = scanNearby(dim, e.location, 15);
        // Intro line
        if (!outside){
          try{ (e.runCommandAsync?.(`tellraw @a[name=\"${e.nameTag||""}\"] {"rawtext":[{"text":""}]}`))?.catch(()=>{}); }catch{}
          try{ world.sendMessage?.("Shroom Bot: far out groovy pad man"); }catch{}
        } else if (!night && nearby.hasMush){
          try{ world.sendMessage?.("Shroom Bot: too bright out here man it's bumming out my groove"); }catch{}
        } else if (night){
          try{ world.sendMessage?.("Shroom Bot: groovy I can work with this!"); }catch{}
        }
        const now = Date.now();
        STATE.set(e.id, { chest, nextPlant: now + 120000, nextChest: now + 240000 });
        try{ e.nameTag = "Shroom Bot"; }catch{}
      }catch{}
    }, 10);
  });
} catch {}

// Brain loop
system.runInterval(async ()=>{
  const dims = [world.getDimension("overworld"), world.getDimension("nether"), world.getDimension("the_end")].filter(Boolean);
  const now = Date.now();
  for(const d of dims){
    const bots = d.getEntities({ type: "myname:shroom_bot" });
    for(const b of bots){
      const st = STATE.get(b.id); if(!st){ STATE.set(b.id, { chest: findChestNear(b.dimension, b.location, 6), nextPlant: now+120000, nextChest: now+240000 }); continue; }
      // Plant cycle (every ~2 minutes, prefer substrate, allow day on podzol/logs)
      if (now >= (st.nextPlant||0)){
        try{
          const day = await queryDaytime(b.dimension); const night = isNightVal(day);
          // respect capacity
          const stats = computePlantingStats(b.dimension, b.location, PLANT_RADIUS);
          if (stats.planted < stats.cap){
            // Try substrate-first (podzol/logs), even in daytime
            let spot = choosePlantSpot(b.dimension, b.location, PLANT_RADIUS, false, true);
            let doMush = true;
            if (!spot && night){
              // fallback general at night
              spot = choosePlantSpot(b.dimension, b.location, PLANT_RADIUS, false, false);
            }
            if (spot && doMush){
              const id = Math.random()<0.55 ? RED : BROWN;
              const placed = plantBlock(b.dimension, spot, id); if(placed) fxPlant(b.dimension, spot);
            }
            // Occasional fungus if nylium spot found
            if (Math.random() < 0.10){
              const fspot = choosePlantSpot(b.dimension, b.location, PLANT_RADIUS, true, false);
              if (fspot){ const fid = (fspot.belowId===CRIMSON_NYL)?CRIMSON:(fspot.belowId===WARPED_NYL?WARPED:(Math.random()<0.5?CRIMSON:WARPED)); const placed=plantBlock(b.dimension, fspot, fid); if(placed) fxPlant(b.dimension, fspot); }
            }
          }
        }catch{}
        st.nextPlant = now + (90000 + Math.floor(Math.random()*60000)); // 1.5–2.5 min
      }
      // Chest cycle (every 4 minutes)
      if (now >= (st.nextChest||0)){
        try{
          if (st.chest){
            // 50%: drop red/brown
            if (Math.random() < 0.5){ if (insertIntoChest(b.dimension, st.chest, Math.random()<0.5?RED:BROWN, 1)) fxChest(b.dimension, st.chest); }
            // 10%: if nearby crimson/warped present, add one to chest
            const near = scanNearby(b.dimension, b.location, 20);
            if ((near.hasCrimson || near.hasWarped) && Math.random() < 0.10){ if (insertIntoChest(b.dimension, st.chest, Math.random()<0.5?CRIMSON:WARPED, 1)) fxChest(b.dimension, st.chest); }
            // 5%: special shroom
            if (Math.random() < 0.05){ if (insertIntoChest(b.dimension, st.chest, Math.random()<0.5?FLY_ID:ZOOM_ID, 1)) fxChest(b.dimension, st.chest); }
          }
        }catch{}
        st.nextChest = now + 240000; // 4 min
      }
      STATE.set(b.id, st);
    }
  }
}, 40);

// Drop own egg on death
try{
  world.afterEvents.entityDie.subscribe(ev=>{
    const e=ev.deadEntity; if(!e || e.typeId!=="myname:shroom_bot") return;
    try{ if (e.getTags?.()?.includes("labs_retrieved")) return; }catch{}
    try{ e.dimension.spawnItem(new ItemStack("myname:shroom_bot_spawn_egg",1), e.location); }catch{}
  });
} catch {}
