import { world, system, ItemStack, BlockPermutation } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

try { console.warn?.("[LABS] redstone_bot.js loaded"); } catch {}

const RSTATE = new Map(); // botId -> { owner:string, points: Array<{x,y,z}>, active:boolean, idx:number, speed:number }
const MARKING = new Map(); // playerId -> { botId:string, points:Array<{x,y,z}>, lastSneakAt?:number }
let TRAIL_PHASE = 0;

function toBlk(loc){ return { x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z) }; }
function dist2(a,b){ const dx=a.x-b.x, dy=a.y-b.y, dz=a.z-b.z; return dx*dx+dy*dy+dz*dz; }

function setOwnerTag(e, name){
  try{ const tags=e.getTags?.()||[]; for(const t of tags){ if(String(t).startsWith("labs_owner:")) try{ e.removeTag(t); }catch{} } e.addTag?.(`labs_owner:${name}`); }catch{}
}

function nearestPlayer(e){
  let best=null, bd=999999; for(const p of world.getPlayers()){ if(p.dimension.id!==e.dimension.id) continue; const d2=dist2(toBlk(p.location), toBlk(e.location)); if(d2<bd){ bd=d2; best=p; } }
  return best;
}

function powerNearbyRedstone(e){
  // Pulse redstone by placing a temporary redstone block in adjacent air
  try{
    const dim = e.dimension; const base = toBlk(e.location);
    for (let dx=-1; dx<=1; dx++){
      for (let dz=-1; dz<=1; dz++){
        const pos = { x: base.x+dx, y: base.y-1, z: base.z+dz };
        const b = dim.getBlock(pos); if (!b) continue;
        if (String(b.typeId||"") === "minecraft:redstone_wire"){
          // find an adjacent air cell around that wire
          const dirs = [ {x:1,y:0,z:0},{x:-1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:-1,z:0},{x:0,y:0,z:1},{x:0,y:0,z:-1} ];
          for (const d of dirs){
            const np = { x: pos.x+d.x, y: pos.y+d.y, z: pos.z+d.z };
            const nb = dim.getBlock(np); if (!nb) continue;
            const id = String(nb.typeId||"");
            if (id === "minecraft:air"){
              try{ dim.getBlock(np)?.setType("minecraft:redstone_block"); }catch{}
              system.runTimeout(()=>{ try{ dim.getBlock(np)?.setType("minecraft:air"); }catch{} }, 4);
              return; // one pulse per tick is enough
            }
          }
        }
      }
    }
  }catch{}
}

function findGroundY(dim, x, y, z){
  try{
    // search a small column around current y for solid ground (non-air) and return y+1
    const xmin = Math.max(-64, y-3), xmax = Math.min(319, y+3);
    for (let yy=xmax; yy>=xmin; yy--){
      const below = dim.getBlock({x, y: yy-1, z});
      const here = dim.getBlock({x, y: yy, z});
      const hereId = String(here?.typeId||"");
      const belowId = String(below?.typeId||"");
      if (hereId==="minecraft:air" && belowId && belowId!=="minecraft:air"){ return yy; }
    }
  }catch{}
  return y; // fallback
}

// Remove redstone torches (standing or wall) near a position
function removeNearbyTorches(dim, pos){
  try{
    const offsets = [
      {x:0,y:0,z:0},{x:0,y:1,z:0},{x:0,y:-1,z:0},
      {x:1,y:0,z:0},{x:-1,y:0,z:0},{x:0,y:0,z:1},{x:0,y:0,z:-1}
    ];
    for (const o of offsets){
      const p = { x: pos.x+o.x, y: pos.y+o.y, z: pos.z+o.z };
      const b = dim.getBlock(p); if(!b) continue;
      const id = String(b.typeId||"");
      if (id==="minecraft:redstone_torch" || id==="minecraft:redstone_wall_torch"){
        try{ b.setType("minecraft:air"); }catch{}
      }
    }
  }catch{}
}

// Resolve the actual placement cell for a redstone pulse near a waypoint
function resolvePulsePos(dim, pos){
  // Prefer the torch cell if one is present; otherwise use air above solid ground at x,z
  try{
    // Check for a torch in a small neighborhood
    const torchOffsets = [
      {x:0,y:0,z:0},{x:0,y:1,z:0},{x:1,y:0,z:0},{x:-1,y:0,z:0},{x:0,y:0,z:1},{x:0,y:0,z:-1}
    ];
    for (const o of torchOffsets){
      const p = { x: pos.x+o.x, y: pos.y+o.y, z: pos.z+o.z };
      const b = dim.getBlock(p); if(!b) continue;
      const id = String(b.typeId||"");
      if (id==="minecraft:redstone_torch" || id==="minecraft:redstone_wall_torch") return p;
    }
    const gy = findGroundY(dim, pos.x, pos.y, pos.z);
    return { x: pos.x, y: gy, z: pos.z };
  }catch{}
  return { x: pos.x, y: pos.y, z: pos.z };
}

function startPatrol(e){
  const st = RSTATE.get(e.id); if (!st || !st.points || st.points.length < 2) return;
  st.active = true; st.idx = 0; st.speed = 0.25; RSTATE.set(e.id, st);
  try{ e.nameTag = "Redstone Bot"; }catch{}
  try{ (world.getDimension("overworld")?.runCommandAsync?.("playsound block.piston.extend @a"))?.catch(()=>{}); }catch{}
}

function stopAndDrop(e){
  try{ e.addTag?.("labs_retrieved"); }catch{}
  try{ const egg = new ItemStack("myname:redstone_bot_spawn_egg", 1); const leftover = e.dimension?.spawnItem?.(egg, e.location); }catch{}
  try{ e.kill?.(); }catch{}
}

// Movement loop
system.runInterval(()=>{
  try{
    const dims = ["overworld","nether","the_end"]; 
    for (const did of dims){
      let d; try{ d=world.getDimension(did); }catch{} if(!d) continue;
      for (const e of d.getEntities({ type: "myname:redstone_bot" })){
        const st = RSTATE.get(e.id); if (!st || !st.active || st.points.length<2) continue;
        const target = st.points[st.idx]; if (!target) continue;
        // Handle spin at waypoint
        // Waypoint action sequence (place redstone block at mark, climb, then remove)
        if (st.pulse) {
        try {
        const p = st.pulse.pos;
        if (st.pulse.stage === 0) {
          const resolved = resolvePulsePos(e.dimension, p);
        try{ removeNearbyTorches(e.dimension, resolved); }catch{}
        try { e.dimension.getBlock(resolved)?.setType("minecraft:redstone_block"); } catch {}
          st.pulse.pos = resolved;
        st.pulse.stage = 1; st.pulse.ticks = 2;
        } else if (st.pulse.stage === 1) {
        if ((st.pulse.ticks||0) > 0) { st.pulse.ticks -= 1; }
          else { try { e.teleport({ x: st.pulse.pos.x+0.5, y: st.pulse.pos.y+1.0, z: st.pulse.pos.z+0.5 }, { dimension: e.dimension, keepVelocity: false, checkForBlocks: true }); } catch {}
          st.pulse.stage = 2; st.pulse.ticks = 4; }
        } else if (st.pulse.stage === 2) {
        if ((st.pulse.ticks||0) > 0) { st.pulse.ticks -= 1; }
          else { try { e.dimension.getBlock(st.pulse.pos)?.setType("minecraft:air"); } catch {}
              st.pulse.stage = 3; }
          }
          } catch {}
          RSTATE.set(e.id, st);
        }
        if ((st.spinTicks||0) > 0){
          st.spinYaw = ((st.spinYaw||0) + 18) % 360; // 20 ticks -> 360 deg
          try{ e.setRotation?.({x:0, y: st.spinYaw}); }catch{}
          // End rod swirl circle while spinning
          try{
            const base = ((st.spinYaw||0) * Math.PI) / 180;
            const r = 1.1;
            for (let i=0;i<8;i++){
              const a = base + i*(Math.PI/4);
              const x = e.location.x + Math.cos(a)*r;
              const z = e.location.z + Math.sin(a)*r;
              const y = e.location.y + 0.6 + 0.3*Math.sin(base + i);
              d.runCommandAsync(`particle minecraft:endrod ${x} ${y} ${z}`).catch(()=>{});
            }
          }catch{}
          st.spinTicks -= 1;
          if (st.spinTicks<=0){ st.idx = (st.idx+1) % st.points.length; try{ delete st.pulse; }catch{} }
          RSTATE.set(e.id, st);
          continue;
        }
        const cur = { x: e.location.x, y: e.location.y, z: e.location.z };
        const dx = target.x + 0.5 - cur.x; const dz = target.z + 0.5 - cur.z; // stay centered
        const dy = (target.y + 0.0) - cur.y;
        const dlen = Math.max(0.0001, Math.hypot(dx, dz));
        const step = st.speed;
        let nx = cur.x + (dx/dlen)*step; let nz = cur.z + (dz/dlen)*step; let ny = cur.y + Math.sign(dy)*Math.min(Math.abs(dy), 0.1);
        // simple ground snap near target y
        if (Math.abs(ny - (target.y+0.0)) < 0.2) ny = target.y+0.0;
        // snap to ground at destination column to avoid tunneling/falling
        const gy = findGroundY(e.dimension, Math.floor(nx), Math.floor(ny), Math.floor(nz));
        const ty = gy; // just above ground
        try{ e.teleport({ x:nx, y:ty, z:nz }, { dimension: e.dimension, keepVelocity: false, checkForBlocks: true }); }catch{}
        // reached? (horizontal tolerance only)
        if (Math.hypot((target.x+0.5) - nx, (target.z+0.5) - nz) < 0.9){
        if (!st.spinTicks || st.spinTicks<=0){
          st.spinTicks = 20; st.spinYaw = 0;
            // initialize waypoint pulse sequence at this mark
            st.pulse = { stage: 0, ticks: 0, pos: { x: target.x, y: target.y, z: target.z } };
            try{ d.runCommandAsync(`playsound block.beacon.activate @a ${Math.floor(e.location.x)} ${Math.floor(e.location.y)} ${Math.floor(e.location.z)} 1 1 0`).catch(()=>{}); }catch{}
           }
           RSTATE.set(e.id, st);
         }
         // pulse redstone near feet
         powerNearbyRedstone(e);
      }
    }
  }catch{}
}, 2);

// Ensure redstone bots resume after server/world restarts (entities may not be loaded immediately)
let RB_RESUME_UNTIL = 0;
try{
  world.afterEvents.worldInitialize.subscribe(()=>{
    // Set a 90s window to attempt resume as entities stream in
    RB_RESUME_UNTIL = Date.now() + 90*1000;
    // First-pass attempt after a short delay
    system.runTimeout(()=>{
      try{
        const dims=["overworld","nether","the_end"];
        for (const did of dims){
          let d; try{ d=world.getDimension(did); }catch{} if(!d) continue;
          const bots = d.getEntities({ type: "myname:redstone_bot" })||[];
          for (const e of bots){
            try{
              const stCur = RSTATE.get(e.id);
              if (stCur && stCur.active && Array.isArray(stCur.points) && stCur.points.length>=2) continue;
              const pts = loadPathFromBot(e);
              if (pts && pts.length>=2){
                const st = { owner: (e.getTags?.()?.find(t=>String(t).startsWith("labs_owner:"))||"").slice("labs_owner:".length), points: pts, active:false, idx:0, speed:0.25 };
                RSTATE.set(e.id, st);
                startPatrol(e);
              }
            }catch{}
          }
        }
      }catch{}
    }, 40);
  });
} catch {}
// Resume watcher during the window
system.runInterval(()=>{
  try{
    if (!RB_RESUME_UNTIL || Date.now() > RB_RESUME_UNTIL) return;
    const dims=["overworld","nether","the_end"];
    for (const did of dims){
      let d; try{ d=world.getDimension(did); }catch{} if(!d) continue;
      const bots = d.getEntities({ type: "myname:redstone_bot" })||[];
      for (const e of bots){
        try{
          const stCur = RSTATE.get(e.id);
          if (stCur && stCur.active && Array.isArray(stCur.points) && stCur.points.length>=2) continue;
          const pts = loadPathFromBot(e);
          if (pts && pts.length>=2){
            const st = { owner: (e.getTags?.()?.find(t=>String(t).startsWith("labs_owner:"))||"").slice("labs_owner:".length), points: pts, active:false, idx:0, speed:0.25 };
            RSTATE.set(e.id, st);
            startPatrol(e);
          }
        }catch{}
      }
    }
  }catch{}
}, 20);

// Trail renderer (lightweight): pulse particles on waypoints + along current segment
system.runInterval(()=>{
  try{
    TRAIL_PHASE = (TRAIL_PHASE + 1) % 4;
    const dims = ["overworld","nether","the_end"]; 
    for (const did of dims){
      let d; try{ d=world.getDimension(did); }catch{} if(!d) continue;
      for (const e of d.getEntities({ type: "myname:redstone_bot" })){
        const st = RSTATE.get(e.id); if (!st || !st.points || st.points.length===0) continue;
        const pts = st.points;
        // Waypoint beacons: show on a quarter of points each tick to reduce spam
        for (let i=TRAIL_PHASE; i<pts.length; i+=4){
          const p = pts[i]; try{ d.runCommandAsync(`particle minecraft:endrod ${p.x+0.5} ${p.y+0.2} ${p.z+0.5}`).catch(()=>{}); }catch (e) {}
        }
        // Current segment faint line
        if (st.active && pts.length>=2){
          const a = pts[st.idx]; const b = pts[(st.idx+1)%pts.length]; if (a && b){
            const dx=b.x-a.x, dy=b.y-a.y, dz=b.z-a.z; const len=Math.max(1, Math.round(Math.hypot(dx,dz)));
            const steps = Math.min(6, len); // cap particles per tick
            for (let s=0; s<=steps; s++){
              const t = s/steps; const x=a.x+0.5+dx*t; const y=a.y+0.2+dy*t; const z=a.z+0.5+dz*t; try{ d.runCommandAsync(`particle minecraft:endrod ${x} ${y} ${z}`).catch(()=>{}); }catch{}
            }
          }
        }
        // Marking visual indicator at bot
        try{
          for (const [pid, ms] of Array.from(MARKING.entries())){ if (ms.botId===e.id){ d.runCommandAsync(`particle minecraft:endrod ${e.location.x} ${e.location.y+1.5} ${e.location.z}`).catch(()=>{}); break; } }
        }catch{}
      }
    }
  }catch{}
}, 10);

// Torch-driven path marking (up to 8 points), with sneak-hold to finish
try{
  // Mark when placing redstone torches while marking is active
  world.afterEvents.itemUseOn.subscribe(ev=>{
    try{
      const p=ev.source; const it=ev.itemStack||ev.item; const id=String(it?.typeId||""); if(!p||!id) return;
      const isTorch = (id==="minecraft:redstone_torch" || id==="minecraft:redstone_wall_torch"); if(!isTorch) return;
      const ms = MARKING.get(p.id); if(!ms) return;
      const bot = p.dimension.getEntities({type:"myname:redstone_bot"}).find(b=>b.id===ms.botId); if(!bot) { MARKING.delete(p.id); return; }
      const pos = toBlk(ev.block?.location || p.location);
      const pts = ms.points || [];
      if (pts.length>=8){ try{ p.sendMessage("Max 8 torches."); }catch{} return; }
      // draw segment
      if (pts.length>0){ const a=pts[pts.length-1], b=pos; const dx=b.x-a.x, dy=b.y-a.y, dz=b.z-a.z; const steps=Math.min(20, Math.max(1, Math.round(Math.hypot(dx,dz)))); for(let s=0;s<=steps;s++){ const t=s/steps; const x=a.x+0.5+dx*t, y=a.y+0.2+dy*t, z=a.z+0.5+dz*t; try{ p.dimension.runCommandAsync(`particle minecraft:endrod ${x} ${y} ${z}`).catch(()=>{});}catch{} } }
      pts.push(pos); MARKING.set(p.id, { ...ms, points: pts, lastAddedAt: Date.now() });
      try{ bot.nameTag = "Redstone Bot"; }catch{}
      try{ p.sendMessage(`Marked point #${pts.length}. Place a Soul Torch to finish early, or place all 8.`);}catch{}
      if (pts.length===8){ finishMarking(p, bot, pts); }
    }catch{}
  });
  // Capture actual torch block position; finish when Soul Torch or lever/button placed near bot
  world.afterEvents.blockPlace.subscribe(ev=>{
    try{
      const p = ev.player; if(!p) return;
      const ms = MARKING.get(p.id); if(!ms) return;
      const b = ev.block; const id = String(b?.typeId||"");
      const pts = ms.points||[];
      // Finish triggers: Soul Torch (anywhere) or lever/button near the bot
      const isSoulTorch = (id==="minecraft:soul_torch" || id==="minecraft:soul_wall_torch");
      const isLeverOrButton = (id==="minecraft:lever" || id.endsWith("_button"));
      if ((isSoulTorch || isLeverOrButton) && pts.length>=2){
        const bot = p.dimension.getEntities({type:"myname:redstone_bot"}).find(bx=>bx.id===ms.botId);
        if (bot){
          if (!isSoulTorch){
            const bp = toBlk(bot.location); const lp = toBlk(b.location);
            const md = Math.abs(bp.x-lp.x)+Math.abs(bp.y-lp.y)+Math.abs(bp.z-lp.z);
            if (md > 5) throw "too_far";
          }
          // Optional: clean up the finish block if Soul Torch
          if (isSoulTorch){ try{ b.setType("minecraft:air"); }catch{} }
          finishMarking(p, bot, pts);
          return;
        }
      }
      // Torch marking: record exact block location
      const isTorch = (id==="minecraft:redstone_torch" || id==="minecraft:redstone_wall_torch"); if(!isTorch) return;
      const pos = toBlk(b.location);
      if (pts.length===0){ pts.push(pos); }
      else {
        const last = pts[pts.length-1];
        if (Math.abs(last.x-pos.x)+Math.abs(last.y-pos.y)+Math.abs(last.z-pos.z) <= 2){ pts[pts.length-1] = pos; }
        else if (pts.length < 8) { pts.push(pos); }
      }
      MARKING.set(p.id, { ...ms, points: pts, lastAddedAt: Date.now() });
      try{ const bot = p.dimension.getEntities({type:"myname:redstone_bot"}).find(bx=>bx.id===ms.botId); if(bot) bot.nameTag = "Redstone Bot"; }catch{}
    }catch{}
  });
  // Sneak hold finish/cancel
  system.runInterval(()=>{
    try{
      const now = Date.now();
      for (const [pid, ms] of Array.from(MARKING.entries())){
        const pl = world.getPlayers().find(pp=>pp.id===pid); if(!pl){ MARKING.delete(pid); continue; }
        const sneaking = !!(pl.isSneaking ?? false);
        // Inactivity auto-finish: if no new points for 3s and we have >=2, finish
        const pts = ms.points||[];
        if (pts.length>=2 && ms.lastAddedAt && (now - ms.lastAddedAt > 3000)){
          const bot = pl.dimension.getEntities({type:"myname:redstone_bot"}).find(b=>b.id===ms.botId);
          if (bot){ finishMarking(pl, bot, pts); continue; }
        }
        // Instant finish if sneaking and we have enough points (no hold required)
        if (sneaking && pts.length>=2){
          const bot = pl.dimension.getEntities({type:"myname:redstone_bot"}).find(b=>b.id===ms.botId);
          if (bot){ finishMarking(pl, bot, pts); continue; }
        }
        // Legacy hold-to-finish (kept as backup)
        if (sneaking){ if(!ms.lastSneakAt) ms.lastSneakAt=now; if (now - ms.lastSneakAt > 600){
          ms.lastSneakAt = 0; MARKING.set(pid, ms);
          const bot = pl.dimension.getEntities({type:"myname:redstone_bot"}).find(b=>b.id===ms.botId);
          if (!bot){ MARKING.delete(pid); continue; }
          const af=new ActionFormData().title("Finish Path").body("Finish or cancel marking?").button("Finish").button("Cancel");
          af.show(pl).then(res=>{ if(!res||res.canceled) return; if(res.selection===0){ finishMarking(pl, bot, ms.points||[]); } else { MARKING.delete(pid); try{ bot.nameTag = "Redstone Bot"; }catch{} try{ pl.sendMessage("Path canceled."); }catch{} } }).catch(()=>{});
          try{ pl.sendMessage("Tip: You can also place a lever/button near the bot."); }catch{}
        } } else { ms.lastSneakAt = 0; MARKING.set(pid, ms); }
      }
    }catch{}
  }, 2);
} catch {}

// Chat fallback: !rs finish / !rs cancel to finish or cancel marking
try{
  world.beforeEvents.chatSend.subscribe(ev=>{
    try{
      const msg=(ev.message||"").trim().toLowerCase();
      if (msg!=="!rs finish" && msg!=="!rs cancel") return;
      ev.cancel=true;
      const p=ev.sender; const ms=MARKING.get(p.id);
      if(!ms){ try{ p.sendMessage("No active path marking."); }catch{} return; }
      const bot = p.dimension.getEntities({type:"myname:redstone_bot"}).find(b=>b.id===ms.botId);
      if (!bot){ MARKING.delete(p.id); try{ p.sendMessage("No bot found."); }catch{} return; }
      if (msg==="!rs finish"){ finishMarking(p, bot, ms.points||[]); }
      else { MARKING.delete(p.id); try{ bot.nameTag = `Redstone Bot [Idle]`; p.sendMessage("Path canceled."); }catch{} }
    }catch{}
  });
}catch{}

function savePathToBot(bot, points){ try{ const tags=bot.getTags?.()||[]; for(const t of tags){ if(String(t).startsWith("rbp|")) try{ bot.removeTag(t); }catch{} } const data = points.map(p=>`${p.x},${p.y},${p.z}`).join(";"); bot.addTag?.(`rbp|${data}`); }catch{} }
function loadPathFromBot(bot){ try{ const tags=bot.getTags?.()||[]; const t=tags.find(tt=>String(tt).startsWith("rbp|")); if(!t) return null; const raw=String(t).slice(4); const parts=raw.split(";").map(s=>s.split(",").map(n=>parseInt(n,10))); const points=parts.filter(a=>a.length===3).map(a=>({x:a[0],y:a[1],z:a[2]})); return points.length?points:null; }catch{ return null; } }
function finishMarking(player, bot, points){ try{ if(!points||points.length<2){ try{ player.sendMessage("Need at least 2 points."); }catch{} return; } // close loop visual
  const a=points[points.length-1], b=points[0]; const dx=b.x-a.x, dy=b.y-a.y, dz=b.z-a.z; const steps=Math.min(20, Math.max(1, Math.round(Math.hypot(dx,dz)))); for(let s=0;s<=steps;s++){ const t=s/steps; const x=a.x+0.5+dx*t, y=a.y+0.2+dy*t, z=a.z+0.5+dz*t; try{ player.dimension.runCommandAsync(`particle minecraft:endrod ${x} ${y} ${z}`).catch(()=>{});}catch{} }
  // Normalize points to ground Y and remove torches at marks
  const norm=[]; for(const p of points.slice(0,8)){ const gy=findGroundY(bot.dimension, p.x, p.y, p.z); const np={x:p.x,y:gy,z:p.z}; norm.push(np); try{ removeNearbyTorches(bot.dimension, np); }catch{} }
  RSTATE.set(bot.id, { owner: player.name, points: norm, active:false, idx:0, speed:0.25 });
  savePathToBot(bot, norm);
  MARKING.delete(player.id);
  try{ player.sendMessage("Path set. Redstone Bot starting patrol."); }catch{}
  startPatrol(bot);
}catch{} }

// Also allow punching the bot to finish/cancel while marking
try{
  world.afterEvents.entityHit.subscribe(ev=>{
    try{
      const p = ev.damagingEntity; const bot = ev.hitEntity;
      if (!p || !bot || bot.typeId!=="myname:redstone_bot") return;
      const ms = MARKING.get(p.id); if (!ms || ms.botId!==bot.id) return;
      const af=new ActionFormData().title("Finish Path").body("Finish or cancel marking?").button("Finish").button("Cancel");
      af.show(p).then(res=>{ if(!res||res.canceled) return; if(res.selection===0){ finishMarking(p, bot, ms.points||[]); } else { MARKING.delete(p.id); try{ bot.nameTag = `Redstone Bot [Idle]`; }catch{} try{ p.sendMessage("Path canceled."); }catch{} } }).catch(()=>{});
    }catch{}
  });
}catch{}

// Spawn: set owner to nearest and polite prompt
try{
  world.afterEvents.entitySpawn.subscribe(ev=>{
    const e=ev.entity; if(!e || e.typeId!=="myname:redstone_bot") return;
    system.runTimeout(()=>{
      try{
        const p = nearestPlayer(e);
        if (p){
          setOwnerTag(e, p.name);
          e.nameTag = "Redstone Bot";
          // load persisted path if present, else enter marking mode
          const pts = loadPathFromBot(e);
          if (pts && pts.length>=2){
            RSTATE.set(e.id, { owner:p.name, points: pts, active:false, idx:0, speed:0.25 });
            startPatrol(e);
            try{ p.sendMessage("Redstone Bot resuming patrol from saved path."); }catch{}
          } else {
            MARKING.set(p.id, { botId: e.id, points: [] });
            try{ e.nameTag = "Redstone Bot"; }catch{}
            p.sendMessage?.("Place redstone torches to mark up to 8 points. Place a Soul Torch to finish early, or place all 8. Loop is auto-closed.");
          }
        }
      }catch{}
    }, 10);
  });
} catch {}

// Drop egg on death
try{
  world.afterEvents.entityDie.subscribe(ev=>{
    const e = ev.deadEntity; if(!e || e.typeId!=="myname:redstone_bot") return;
    try{ if (e.getTags?.()?.includes("labs_retrieved")) return; }catch{}
    try{ const egg=new ItemStack("myname:redstone_bot_spawn_egg",1); e.dimension.spawnItem(egg, e.location); }catch{}
  });
} catch {}
