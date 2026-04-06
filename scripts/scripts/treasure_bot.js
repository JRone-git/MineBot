import { world, system, ItemStack } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";

const STATE = new Map(); // id -> { owner?: string, next?: number, origin?: {x,z}, radius?: number }

function toBlk(v){ return { x: Math.floor(v.x), y: Math.floor(v.y), z: Math.floor(v.z) }; }

function isWater(block){ try{ return String(block?.typeId||"").includes("water"); } catch { return false; } }

function getYaw(entity){
  try { const r = entity.getRotation?.(); if (r && typeof r.y === 'number') return r.y; } catch {}
  try { const r = entity.rotation; if (r && typeof r.y === 'number') return r.y; } catch {}
  return 0;
}
function forwardStepFromYaw(yaw){
  // Bedrock convention: yaw 0 -> +Z forward; use -sin for X, cos for Z
  const rad = (yaw*Math.PI)/180;
  const dx = -Math.round(Math.sin(rad));
  const dz = Math.round(Math.cos(rad));
  return { x: Math.sign(dx), z: Math.sign(dz) };
}
function wanderStep(bot){
  const dim = bot.dimension; const loc = toBlk(bot.location);
  const st = STATE.get(bot.id) || {};
  const origin = st.origin || { x: loc.x, z: loc.z };
  const r2 = Math.pow(st.radius ?? 200, 2);
  // Prefer stepping toward a seek target if present
  if (st.seek && typeof st.seek.x === 'number' && typeof st.seek.z === 'number') {
    const dx = Math.sign(st.seek.x - loc.x);
    const dz = Math.sign(st.seek.z - loc.z);
    const primary = { x: dx || 0, z: dz || 0 };
    const dirs = [primary, { x: primary.z, z: -primary.x }, { x: -primary.z, z: primary.x }, { x: -primary.x, z: -primary.z }];
    for (const d of dirs){
      for (const dy of [1,0,-1,-2,2,-3,3]){
        const tx = loc.x + d.x, tz = loc.z + d.z, ty = loc.y + dy;
        try{
          const at = dim.getBlock({x:tx,y:ty,z:tz});
          const below = dim.getBlock({x:tx,y:ty-1,z:tz});
          const head = dim.getBlock({x:tx,y:ty+1,z:tz});
          if (isWater(at) || isWater(below)) continue;
          const belowId = String(below?.typeId||"");
          if (!belowId || belowId==="minecraft:air") continue;
          const atAir = !at || String(at.typeId)==="minecraft:air";
          const headAir = !head || String(head.typeId)==="minecraft:air";
          if (!atAir || !headAir) continue;
          const d2 = Math.pow(tx-origin.x,2)+Math.pow(tz-origin.z,2);
          if (d2 > r2) continue;
          bot.teleport({x:tx+0.5,y:ty+0.01,z:tz+0.5},{dimension:dim});
          const d2t = Math.pow(st.seek.x - tx,2)+Math.pow(st.seek.z - tz,2);
          if (d2t <= 4) { st.arrived = true; STATE.set(bot.id, st); }
          return;
        }catch{}
      }
    }
  } else {
    // Straight-forward mode: keep going in the heading set at spawn
    const fwd = st.heading || forwardStepFromYaw(getYaw(bot));
    for (const dy of [1,0,-1,-2,2,-3,3]){
      const tx = loc.x + fwd.x, tz = loc.z + fwd.z, ty = loc.y + dy;
      try{
        const at = dim.getBlock({x:tx,y:ty,z:tz});
        const below = dim.getBlock({x:tx,y:ty-1,z:tz});
        const head = dim.getBlock({x:tx,y:ty+1,z:tz});
        if (isWater(at) || isWater(below)) continue;
        const belowId = String(below?.typeId||""); if (!belowId || belowId==="minecraft:air") continue;
        const atAir = !at || String(at.typeId)==="minecraft:air";
        const headAir = !head || String(head.typeId)==="minecraft:air";
        if (!atAir || !headAir) continue;
        const d2 = Math.pow(tx-origin.x,2)+Math.pow(tz-origin.z,2); if (d2 > r2) continue;
        bot.teleport({x:tx+0.5,y:ty+0.01,z:tz+0.5},{dimension:dim});
        return;
      }catch{}
    }
  }
  // If blocked, rotate heading 90° to find a new straight path next time
  try {
    const yaw = (getYaw(bot)+90)%360; bot.setRotation?.({x:0,y:yaw});
    const newHead = forwardStepFromYaw(yaw); st.heading = newHead; STATE.set(bot.id, st);
  } catch {}
}

// Non-blocking scanners: process a small Y-slice per tick to avoid watchdog hangs
const DIR_SLICE_Y = 8; // y-levels per tick for directional scans
const LOCAL_SLICE_Y = 10; // y-levels per tick for local scan (reduced for wider radius)

function initScanState(cx, cz, startY){
  return { cx, cz, y: startY, diamonds:0, spawner:false, amethyst:false, sculk:false, chest:false, rails:0, mossy:0, stoneBrick:0, vault:false, trialSpawner:false, done:false };
}
function scanSlice(dim, st, ySlice){
  const until = Math.max(0, st.y - ySlice + 1);
  const r = Number(st.r ?? 2);
  for (let y = st.y; y >= until; y--){
    for (let dx=-r; dx<=r; dx++){
      for (let dz=-r; dz<=r; dz++){
        try{
          const b = dim.getBlock({x:st.cx+dx,y:y,z:st.cz+dz}); if(!b) continue; const id=b.typeId||"";
          // High priority structures (immediate find)
          if (id === "minecraft:chest" || id === "minecraft:trapped_chest" || id === "minecraft:barrel") { st.chest = true; if (st.tx===undefined){ st.tx = b.location.x; st.tz = b.location.z; } }
          else if (id === "minecraft:spawner") { st.spawner = true; if (st.tx===undefined){ st.tx = b.location.x; st.tz = b.location.z; } }
          else if (id === "minecraft:trial_spawner") { st.trialSpawner = true; if (st.tx===undefined){ st.tx = b.location.x; st.tz = b.location.z; } }
          else if (id === "minecraft:vault" || id === "minecraft:ominous_vault") { st.vault = true; if (st.tx===undefined){ st.tx = b.location.x; st.tz = b.location.z; } }
          // Structure indicators (count to detect buried dungeons/mineshafts/strongholds)
          else if (id.includes("rail")) { st.rails++; if (st.tx===undefined){ st.tx = b.location.x; st.tz = b.location.z; } }
          else if (id === "minecraft:mossy_cobblestone" || id === "minecraft:mossy_stone_bricks") { st.mossy++; if (st.tx===undefined){ st.tx = b.location.x; st.tz = b.location.z; } }
          else if (id === "minecraft:stone_bricks" || id === "minecraft:cracked_stone_bricks" || id === "minecraft:chiseled_stone_bricks") { st.stoneBrick++; if (st.tx===undefined){ st.tx = b.location.x; st.tz = b.location.z; } }
          // Resources
          else if (id === "minecraft:diamond_ore" || id === "minecraft:deepslate_diamond_ore") { st.diamonds++; if (st.tx===undefined){ st.tx = b.location.x; st.tz = b.location.z; } }
          else if (id === "minecraft:budding_amethyst" || id === "minecraft:amethyst_block") { st.amethyst = true; if (st.tx===undefined){ st.tx = b.location.x; st.tz = b.location.z; } }
          // Ancient city / Deep dark
          else if (id.startsWith("minecraft:sculk")) { st.sculk = true; if (st.tx===undefined){ st.tx = b.location.x; st.tz = b.location.z; } }
        } catch {}
      }
    }
  }
  st.y = until - 1;
  const depth = Number(st.depth ?? 150);
  if (st.y < Math.max(0, (st.startBase ?? 0) - depth)) st.done = true;
}
function resultFromScan(st){
  if (st.chest) return "Treasure Chest";
  if (st.spawner) return "Dungeon Spawner";
  if (st.trialSpawner) return "Trial Chamber";
  if (st.vault) return "Trial Vault";
  if (st.rails >= 5) return "Mineshaft";
  if (st.mossy >= 10) return "Dungeon";
  if (st.stoneBrick >= 15) return "Stronghold";
  if (st.diamonds >= 3) return "Diamond Vein";
  if (st.amethyst) return "Amethyst Geode";
  if (st.sculk) return "Ancient City";
  return null;
}

function beginDirectional(stBot, dim, startX, startZ, yaw){
  const rad=(yaw*Math.PI)/180; const dir={x:Math.round(Math.cos(rad)), z:Math.round(Math.sin(rad))};
  const startY = Math.min(254, Math.max(0, Math.floor(dim.heightRange?.max ?? 200)));
  stBot.dirTask = { yaw, dir, step:1, maxSteps:100, startX, startZ, startY, cur: initScanState(startX+dir.x, startZ+dir.z, startY) };
  stBot.dirTask.cur.startBase = startY; stBot.dirTask.cur.r = 2; stBot.dirTask.cur.depth = 150;
}
function tickDirectional(stBot, dim){
  const t = stBot.dirTask; if(!t) return;
  if (t.done) return;
  if (!t.cur) { t.cur = initScanState(t.startX + t.dir.x*t.step, t.startZ + t.dir.z*t.step, t.startY); t.cur.startBase=t.startY; }
  scanSlice(dim, t.cur, DIR_SLICE_Y);
  const res = resultFromScan(t.cur);
  if (res || t.cur.done){
    if (res){ stBot.seek = { x: t.cur.cx, z: t.cur.cz }; stBot.dirFound = true; }
    t.step++;
    if (t.step>t.maxSteps || stBot.dirFound){ t.done = true; return; }
    t.cur = initScanState(t.startX + t.dir.x*t.step, t.startZ + t.dir.z*t.step, t.startY); t.cur.startBase=t.startY;
  }
}

function beginLocal(stBot, dim, cx, cz, baseY){
  const heightMin = Math.floor(dim.heightRange?.min ?? -64);
  const startY = Math.floor(baseY ?? 0);
  stBot.localTask = initScanState(cx, cz, startY);
  stBot.localTask.startBase = startY;
  // Scan radius: owner-configurable (64 for near scan, 124 for far scan)
  const r = Number(stBot.scanR || 64);
  stBot.localTask.r = Math.max(32, Math.min(124, r));
  // Scan down to bedrock/min height
  stBot.localTask.depth = Math.max(0, startY - heightMin + 1);
}
function tickLocal(stBot, dim){
  const lt=stBot.localTask; if(!lt) return null;
  scanSlice(dim, lt, LOCAL_SLICE_Y);
  // Early-report if something is found in current slice
  const resNow = resultFromScan(lt);
  if (resNow){ const out={ label: resNow, x: (lt.tx!==undefined? lt.tx: lt.cx), z: (lt.tz!==undefined? lt.tz: lt.cz) }; stBot.localTask=null; return out; }
  if (lt.done){ const res=resultFromScan(lt); const out = res ? { label: res, x: (lt.tx!==undefined? lt.tx: lt.cx), z: (lt.tz!==undefined? lt.tz: lt.cz) } : null; stBot.localTask=null; return out; }
  return null;
}

function saveTreasureMarker(owner, x, y, z, label, dimension){
  try{
    const raw = world.getDynamicProperty?.("labs_treasure_markers");
    const MARKERS = raw && typeof raw==='string' ? JSON.parse(raw) : {};
    if (!MARKERS[owner]) MARKERS[owner] = [];
    MARKERS[owner].push({ x, y, z, label, dim: dimension, timestamp: Date.now() });
    // Limit to 50 markers per player
    if (MARKERS[owner].length > 50) MARKERS[owner].shift();
    const s = JSON.stringify(MARKERS||{});
    world.setDynamicProperty?.("labs_treasure_markers", s.length>10000?s.slice(0,10000):s);
  }catch(e){ console.warn("Failed to save treasure marker:", e); }
}

function buildMarker(dim, x, y, z, label, owner){
  // Birch tower 5 high with torch on top, sign at bottom
  for (let i=0;i<5;i++){
    try { dim.getBlock({x,y:y+i,z})?.setType("minecraft:birch_log"); } catch {}
  }
  try { dim.getBlock({x,y:y+5,z})?.setType("minecraft:torch"); } catch {}
  try { dim.getBlock({x,y:y,z:z-1})?.setType("minecraft:oak_sign"); } catch {}
  // Sign text API is limited; send a chat hint instead
  try { for (const p of world.getPlayers()) p.sendMessage(`TreasureBot marker at ${x},${y},${z}: ${label}`); } catch {}
  // Save marker to player's list if owner provided
  if (owner) saveTreasureMarker(owner, x, y, z, label, dim.id);
}

try{
  world.afterEvents.entitySpawn.subscribe(ev=>{
    const e = ev.entity; if (!e || e.typeId!=="myname:treasure_bot") return;
    // assign owner and set initial straight heading based on player yaw (or bot yaw)
    let owner=null,best=999999; for (const p of world.getPlayers()){ if(p.dimension.id!==e.dimension.id) continue; const d2=(p.location.x-e.location.x)**2+(p.location.z-e.location.z)**2; if(d2<best){best=d2;owner=p;} }
    let yaw = 0; try{ yaw = owner ? getYaw(owner) : getYaw(e); }catch{}
    const heading = forwardStepFromYaw(yaw);
    try{ e.setRotation?.({x:0,y:yaw}); }catch{}
    const st = { owner: owner?.name, next: Date.now()+3000, origin: { x: Math.floor(e.location.x), z: Math.floor(e.location.z) }, radius: 200, heading };
    STATE.set(e.id, st);
    // Ask owner for scan radius (near or far)
    try{
      if (owner){
        const form = new ModalFormData().title("Treasure Bot").dropdown("Scan radius", ["Near Scan (64 blocks)", "Far Scan (124 blocks)"], 0);
        form.show(owner).then(res=>{
          if (!res || res.canceled) return;
          const idx = Number(res.formValues?.[0]||0)|0;
          const st2 = STATE.get(e.id)||{};
          st2.scanR = (idx===1) ? 124 : 64;
          STATE.set(e.id, st2);
          try{ owner.sendMessage(`Treasure Bot scan radius set to ${st2.scanR} blocks.`);}catch{}
        }).catch(()=>{});
      }
    }catch{}
  });
} catch {}

system.runInterval(()=>{
  for (const dim of [world.getDimension("overworld")]){
    if (!dim) continue; const bots = dim.getEntities({ type: "myname:treasure_bot" });
    for (const bot of bots){ const st=STATE.get(bot.id)||{}; const now=Date.now(); if (st.next && now<st.next) continue;
      const loc = toBlk(bot.location);
      // Periodic 5-min directional scan cycle
      if (!st.dirScan) { st.dirScan = { next: now + 300000, phase: -1, baseYaw: getYaw(bot) }; }
      if (now >= st.dirScan.next) {
        if (st.dirScan.phase === -1) { st.dirScan.phase = 0; st.dirScan.baseYaw = getYaw(bot); }
        // Begin or continue incremental directional scanning for this yaw
        if (!st.dirTask || st.dirTask.done) {
          const yaw = (st.dirScan.baseYaw + st.dirScan.phase*90) % 360;
          beginDirectional(st, dim, loc.x, loc.z, yaw);
        }
        tickDirectional(st, dim);
        if (st.dirFound) {
          const yaw2 = (st.dirScan.baseYaw + st.dirScan.phase*90) % 360;
          try { bot.setRotation?.({ x: 0, y: yaw2 }); } catch {}
          st.dirScan.next = now + 300000; st.dirScan.phase = -1; st.dirTask=null; st.dirFound=false; STATE.set(bot.id, st);
          continue;
        }
        if (st.dirTask && st.dirTask.done) {
          st.dirTask=null; st.dirScan.phase++;
          if (st.dirScan.phase > 3) { st.dirScan.phase = -1; st.dirScan.next = now + 300000; }
          else { st.dirScan.next = now + 1000; }
          STATE.set(bot.id, st);
        }
      }
      // Fireworks sequence active
      if (st.fireworks) {
        // launch rocket every 10s
        if (now >= st.fireworks.next) {
          try { const p = dim.runCommandAsync?.(`summon firework_rocket ${st.fireworks.pos.x} ${st.fireworks.pos.y} ${st.fireworks.pos.z}`); p?.catch?.(()=>{}); } catch {}
          try {
            if (typeof dim.playSound === "function") dim.playSound("block.bell.use", st.fireworks.pos, { volume: 1, pitch: 1.0 });
            else if (typeof world.playSound === "function") world.playSound("block.bell.use", st.fireworks.pos, { volume: 1, pitch: 1.0 });
          } catch {}
          st.fireworks.next = now + 10000;
        }
        if (now >= st.fireworks.until) {
          try { bot.applyDamage?.(1000); } catch {}
          STATE.delete(bot.id);
          continue;
        }
        STATE.set(bot.id, st);
        continue;
      }
      // If arrived at seek target, mark and finish (handle before scanning to avoid re-announcement)
      if (st.seek && st.arrived){
        const label = st.seekLabel || "Find";
        buildMarker(dim, loc.x, loc.y, loc.z, label, st.owner);
        try { dim.runCommandAsync(`summon lightning_bolt ${loc.x} ${loc.y+1} ${loc.z}`).catch(()=>{}); } catch {}
        try { dim.runCommandAsync(`playsound random.levelup @a[r=50] ${loc.x} ${loc.y} ${loc.z} 2.0 1.2`).catch(()=>{}); } catch {}
        try {
          const owner = st.owner && world.getPlayers().find(p=>p.name===st.owner);
          try{ bot.addTag?.("labs_retrieved"); }catch{}
          const egg = new ItemStack("myname:treasure_bot_spawn_egg",1);
          if (owner){
            try{ const inv=owner.getComponent("inventory")?.container; const leftover=inv?.addItem?.(egg); if(leftover) owner.dimension.spawnItem(leftover, owner.location); owner.sendMessage?.(`§6§l[Treasure Bot]§r §a✓ FOUND: ${label}!§r\n§7Location: ${loc.x}, ${loc.y}, ${loc.z}§r\n§eEgg returned to inventory.§r`); }catch{}
          } else {
            try{ dim.spawnItem(egg, { x: loc.x+0.5, y: loc.y+1, z: loc.z+0.5 }); }catch{}
          }
          try{ bot.kill?.(); }catch{}
          STATE.delete(bot.id);
          continue;
        } catch {}
      }
      // Only scan if not already tracking a target
      if (!st.seek) {
        // Incremental local scan underfoot (restart if bot moved columns)
        if (!st.localTask || (st.localTask && (st.localTask.cx!==loc.x || st.localTask.cz!==loc.z))){ beginLocal(st, dim, loc.x, loc.z, loc.y); }
        const localFound = tickLocal(st, dim);
        if (localFound){
          // Announce tracking and set seek towards found position (only once)
          try { bot.runCommandAsync(`say §6§l[Treasure Bot]§r §eOn the scent of ${localFound.label}! §7Tracking...§r`).catch(()=>{}); } catch {}
          try { dim.runCommandAsync(`playsound note.pling @a[r=30] ${loc.x} ${loc.y} ${loc.z} 1.5 1.5`).catch(()=>{}); } catch {}
          const owner = st.owner && world.getPlayers().find(p=>p.name===st.owner);
          if (owner){ try{ owner.sendMessage?.(`§6§l[Treasure Bot]§r §e🔍 Detected: ${localFound.label}§r\n§7Distance: ~${Math.floor(Math.sqrt((localFound.x-loc.x)**2+(localFound.z-loc.z)**2))} blocks§r`); }catch{} }
          st.seek = { x: localFound.x, z: localFound.z };
          st.seekLabel = localFound.label;
          st.arrived = false;
          // Face toward target
          try{
            const dx = st.seek.x - loc.x; const dz = st.seek.z - loc.z;
            const yaw = (Math.atan2(-dx, dz) * 180 / Math.PI + 360) % 360;
            bot.setRotation?.({ x: 0, y: yaw });
            st.heading = forwardStepFromYaw(yaw);
          }catch{}
          STATE.set(bot.id, st);
        }
      }
      // Movement: triple speed when tracking target
      const moveSpeed = st.seek ? 3 : 1;
      for (let i = 0; i < moveSpeed; i++) {
        wanderStep(bot);
      }
      // Faster tick rate when tracking (1 second vs 3-5 seconds)
      st.next = st.seek ? (now + 1000) : (now + 3000 + Math.floor(Math.random()*2000));
      STATE.set(bot.id, st);
    }
  }
}, 20);

try{
  world.afterEvents.entityDie.subscribe(ev=>{
    const e = ev.deadEntity; if (!e || e.typeId!=="myname:treasure_bot") return;
    const owner = STATE.get(e.id)?.owner;
    try { if (owner){ const p = world.getPlayers().find(pp=>pp.name===owner); p?.sendMessage("Your Treasure Bot has perished."); } } catch {}
    try { if (e.getTags?.()?.includes("labs_retrieved")) return; } catch {}
    try { const egg=new ItemStack("myname:treasure_bot_spawn_egg",1); e.dimension.spawnItem(egg,e.location);} catch {}
    STATE.delete(e.id);
  });
} catch {}
