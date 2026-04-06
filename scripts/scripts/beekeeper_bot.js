import { world, system, ItemStack } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";

const STATE = new Map(); // id -> { chest?: {x,y,z}, next: number }

function toBlk(v){ return { x: Math.floor(v.x), y: Math.floor(v.y), z: Math.floor(v.z) }; }

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
function beeEmitParticles(e){
  try{
    const dim=e.dimension; const p=e.location; const out=(n)=>p.y.toFixed(n);
    const parts=["minecraft:happy_villager","minecraft:note","minecraft:heart","minecraft:heart_particle"];
    for(const id of parts){ try{ dim.runCommandAsync(`particle ${id} ${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)}`).catch(()=>{}); }catch{} }
  }catch{}
}
function beeJump(e, dir, steps){ // dir: -1 left, +1 right (relative to yaw)
  try{
    const dim=e.dimension; const base=toBlk(e.location); const yaw=getYaw(e); const rv=rightVec(yaw);
    const dx = Math.round(rv.x * dir * steps); const dz = Math.round(rv.z * dir * steps);
    const tx = base.x + dx, tz = base.z + dz, ty = base.y;
    if (!canStand(dim, tx, ty, tz)) return false;
    try{ e.teleport({ x: tx + 0.5, y: ty + 1, z: tz + 0.5 }, { dimension: dim, keepVelocity:false, checkForBlocks:true, rotation:{x:0,y:yaw} }); }catch{}
    beeEmitParticles(e);
    return true;
  }catch{ return false; }
}
function beeSpin(e){
  try{
    const steps=16; const startYaw=getYaw(e);
    for(let i=1;i<=steps;i++){
      system.runTimeout(()=>{ try{ const y=(startYaw + (360/8)*i)%360; e.setRotation?.({x:0,y}); if(i%2===0) beeEmitParticles(e); }catch{} }, i*2);
    }
  }catch{}
}
function beeLevitatePulse(e){
  try{ e.runCommandAsync?.("effect @s levitation 2 1 true").catch(()=>{}); }catch{}
  system.runTimeout(()=>{ try{ e.runCommandAsync?.("effect @s slow_falling 4 1 true").catch(()=>{}); }catch{} }, 40);
}
function startBeeDance(e, ms){
  const end = Date.now() + ms; let cycle=0;
  const step = ()=>{
    if (!e || !e.id) return; if (Date.now()>end) return;
    const dir = (cycle%2===0) ? -1 : +1;
    beeJump(e, dir, 2);
    system.runTimeout(()=>{ beeJump(e, -dir, 2); }, 10);
    system.runTimeout(()=>{ beeSpin(e); }, 30);
    // levitate pulse every other cycle
    if (cycle%2===0){ system.runTimeout(()=>{ beeLevitatePulse(e); }, 50); }
    cycle++;
    system.runTimeout(step, 140);
  };
  step();
}

function findChest(dim, center, radius=12){
  const c = toBlk(center);
  // Pass 1: immediate neighbors (6 faces)
  const NEI=[{x:1,y:0,z:0},{x:-1,y:0,z:0},{x:0,y:0,z:1},{x:0,y:0,z:-1},{x:0,y:1,z:0},{x:0,y:-1,z:0}];
  for (const o of NEI){
    try{ const b=dim.getBlock({x:c.x+o.x,y:c.y+o.y,z:c.z+o.z}); if(!b) continue; const cont=b.getComponent?.("minecraft:inventory")?.container; if (cont && cont.size>0) return {x:b.location.x,y:b.location.y,z:b.location.z}; }catch{}
  }
  // Pass 2: small horizontal radius but extended vertical range (±4)
  for(let r=1;r<=4;r++) for(let dx=-r;dx<=r;dx++) for(let dz=-r;dz<=r;dz++) for(let dy=-4;dy<=4;dy++){
    try{ const b = dim.getBlock({x:c.x+dx,y:c.y+dy,z:c.z+dz}); if (!b) continue; const cont=b.getComponent?.("minecraft:inventory")?.container; if (cont && cont.size>0) return {x:b.location.x,y:b.location.y,z:b.location.z}; }catch{}
  }
  // Pass 3: original broad search (limited vertical)
  for(let r=1;r<=radius;r++) for(let dx=-r;dx<=r;dx++) for(let dz=-r;dz<=r;dz++) for(let dy=-1;dy<=2;dy++){
    try{ const b = dim.getBlock({x:c.x+dx,y:c.y+dy,z:c.z+dz}); if (!b) continue; const cont=b.getComponent?.("minecraft:inventory")?.container; if (cont && cont.size>0) return {x:b.location.x,y:b.location.y,z:b.location.z}; }catch{}
  }
  return undefined;
}

function chestCount(dim, chestPos, id){
  try{ const cont = dim.getBlock(chestPos)?.getComponent("minecraft:inventory")?.container; if (!cont) return 0; let n=0; for(let i=0;i<cont.size;i++){ const it=cont.getItem(i); if (it && it.typeId===id) n+=it.amount; } return n; }catch{} return 0;
}
function chestRemove(dim, chestPos, id, amount){
  try{ const cont = dim.getBlock(chestPos)?.getComponent("minecraft:inventory")?.container; if (!cont) return 0; let left=amount; for(let i=0;i<cont.size && left>0;i++){ const it=cont.getItem(i); if (it && it.typeId===id){ const take=Math.min(left,it.amount); it.amount-=take; left-=take; if (it.amount<=0) cont.setItem(i, undefined); else cont.setItem(i,it); } } return amount-left; }catch{} return 0;
}
function chestAdd(dim, chestPos, id, amount){
  try{ const cont = dim.getBlock(chestPos)?.getComponent("minecraft:inventory")?.container; if (!cont) return 0; let left=amount; for(let i=0;i<cont.size && left>0;i++){ const it=cont.getItem(i); if (!it){ cont.setItem(i,new ItemStack(id, Math.min(64,left))); left-=Math.min(64,left); } else if (it.typeId===id && it.amount<it.maxAmount){ const can=Math.min(left,it.maxAmount-it.amount); it.amount+=can; cont.setItem(i,it); left-=can; } } return amount-left; }catch{} return 0;
}
// Multi-chest helpers
function listChests(dim, center, radius=4, dyMin=-4, dyMax=4){
  const c = toBlk(center);
  const out=[];
  for(let dx=-radius; dx<=radius; dx++) for(let dz=-radius; dz<=radius; dz++) for(let dy=dyMin; dy<=dyMax; dy++){
    try{ const b=dim.getBlock({x:c.x+dx,y:c.y+dy,z:c.z+dz}); const cont=b?.getComponent?.("minecraft:inventory")?.container; if (cont && cont.size>0) out.push({x:b.location.x,y:b.location.y,z:b.location.z}); }catch{}
  }
  // sort nearest first
  out.sort((a,b)=>{ const da=(a.x-c.x)**2+(a.y-c.y)**2+(a.z-c.z)**2; const db=(b.x-c.x)**2+(b.y-c.y)**2+(b.z-c.z)**2; return da-db; });
  return out;
}
function chestRemoveAny(dim, positions, id, amount){
  let left=amount|0; try{
    for(const pos of positions){ if (left<=0) break; try{ const t=chestRemove(dim, pos, id, left); left-=t; }catch{} }
  }catch{}
  return (amount|0)-left;
}
function chestAddAny(dim, positions, id, amount){
  let left=amount|0; try{
    for(const pos of positions){ if (left<=0) break; try{ const put=chestAdd(dim, pos, id, left); left-=put; }catch{} }
  }catch{}
  return (amount|0)-left;
}

function getHoneyLevel(block){ try { return block.permutation?.getState?.("honey_level") ?? -1; } catch { return -1; } }
function setHoneyLevel(block, lvl){ try { const p=block.permutation; const np=p.withState?.("honey_level", lvl); if (np){ block.setPermutation(np); return true; } } catch {} return false; }

function harvestNearby(bot){
  const dim = bot.dimension; const st = STATE.get(bot.id)||{};
  // refresh chest if missing or broken
  try{ const test = st.chest ? dim.getBlock(st.chest)?.getComponent?.("minecraft:inventory")?.container : null; if (!test) st.chest = undefined; }catch{}
  if (!st.chest) st.chest = findChest(dim, bot.location, 12);
  const c = toBlk(bot.location);
  // Candidate chests: cached, then adjacent, then within 4 blocks up/down
  const candidates = [];
  if (st.chest) candidates.push(st.chest);
  try{
    const adj = listChests(dim, bot.location, 1, -1, 1);
    for(const p of adj){ if (!candidates.find(q=>q.x===p.x&&q.y===p.y&&q.z===p.z)) candidates.push(p); }
    const near = listChests(dim, bot.location, 4, -4, 4);
    for(const p of near){ if (!candidates.find(q=>q.x===p.x&&q.y===p.y&&q.z===p.z)) candidates.push(p); }
  }catch{}
  const useBottles = candidates.some(pos => chestCount(dim, pos, "minecraft:glass_bottle")>0);
  let bottlesUsed=0, honeyMade=0, combMade=0;
  for (let dx=-10;dx<=10;dx++) for (let dz=-10;dz<=10;dz++) for (let dy=-2;dy<=3;dy++){
    try{
      const pos={x:c.x+dx,y:c.y+dy,z:c.z+dz}; const b=dim.getBlock(pos); if(!b) continue;
      const id=b.typeId; if (id!=="minecraft:bee_nest" && id!=="minecraft:beehive") continue;
      const hl = getHoneyLevel(b); if (hl<5) continue;
      if (useBottles){
        const taken = chestRemoveAny(dim, candidates, "minecraft:glass_bottle", 1);
        if (taken>0){
          setHoneyLevel(b, 0);
          const put = chestAddAny(dim, candidates, "minecraft:honey_bottle", 1);
          if (put<1){ try{ dim.spawnItem(new ItemStack("minecraft:honey_bottle",1), bot.location); }catch{} }
          bottlesUsed++; honeyMade++;
        }
      } else {
        setHoneyLevel(b, 0);
        const put = chestAddAny(dim, candidates, "minecraft:honeycomb", 3);
        const left = 3 - put;
        if (left>0){ try{ dim.spawnItem(new ItemStack("minecraft:honeycomb", left), bot.location); }catch{} }
        combMade+=3;
      }
    }catch{}
  }
  STATE.set(bot.id, st);
  try { bot.nameTag = "BeeKeeper Bot"; } catch {}
}

try{
  world.afterEvents.entitySpawn.subscribe(ev=>{
    const e = ev.entity; if (!e || e.typeId!=="myname:beekeeper_bot") return;
    system.runTimeout(()=>{
      // No menu; just a tip
      let target=null,best=999999; for (const p of world.getPlayers()){ if(p.dimension.id!==e.dimension.id) continue; const d2=(p.location.x-e.location.x)**2+(p.location.z-e.location.z)**2; if(d2<best){best=d2;target=p;} }
      try { target?.sendMessage("BeeKeeper Bot: place in 20x20 fenced area with chest. If chest has empty bottles, it will make honey bottles; otherwise it will shear comb."); } catch {}
      // play song once on placement
      try{ const x=Math.floor(e.location.x), y=Math.floor(e.location.y), z=Math.floor(e.location.z); e.dimension.runCommandAsync(`playsound labs.beekeeper_song @a ${x} ${y} ${z} 1 1 0`).catch(()=>{}); }catch{}
      // Face like nearest player and dance with levitation pulses (~3 minutes)
      try{ const r=e.getRotation?.(); if (r) e.setRotation?.({x:0,y:r.y}); }catch{}
      try{ startBeeDance(e, 180000); }catch{}
    }, 10);
  });
} catch {}

const NEXT_SONG = new Map();
function scheduleNext(id){ const now=Date.now(); const mins=1+Math.floor(Math.random()*45); NEXT_SONG.set(id, now+mins*60000); }

// Daily per-player gating helpers for beekeeper song (spawn-egg playback unchanged)
const BEE_TAG_PREFIX = "labs_bee_song_day_";
function beeTodayKey(){ try{ const d=new Date(); const y=d.getUTCFullYear(); const m=String(d.getUTCMonth()+1).padStart(2,'0'); const da=String(d.getUTCDate()).padStart(2,'0'); return `${y}${m}${da}`; }catch{ return ""; } }
function beeHasHeardToday(p){ try{ const tags=p.getTags?.()||[]; const key=BEE_TAG_PREFIX+beeTodayKey(); return tags.includes(key); }catch{ return false; } }
function beeMarkHeardToday(p){ try{ const today=BEE_TAG_PREFIX+beeTodayKey(); const tags=p.getTags?.()||[]; for (const t of tags){ if (t.startsWith(BEE_TAG_PREFIX) && t!==today) try{ p.removeTag(t); }catch{} } try{ p.addTag(today); }catch{} }catch{} }

system.runInterval(()=>{
  for (const dim of [world.getDimension("overworld"), world.getDimension("nether"), world.getDimension("the_end")]){
    if (!dim) continue; const bots = dim.getEntities({ type: "myname:beekeeper_bot" });
    for (const bot of bots){
      harvestNearby(bot);
      const id=bot.id; if (!NEXT_SONG.has(id)) scheduleNext(id);
      const now=Date.now(); const due=NEXT_SONG.get(id)||0;
      if (now>=due){
        // play beekeeper song near bot, once per real-day per player
        try{
          const x=Math.floor(bot.location.x), y=Math.floor(bot.location.y), z=Math.floor(bot.location.z);
          for (const p of world.getPlayers()){
            try{
              if (!p || p.dimension?.id!==bot.dimension?.id) continue;
              if (beeHasHeardToday(p)) continue;
              p.runCommandAsync?.(`playsound labs.beekeeper_song @s ${x} ${y} ${z} 1 1 0`).catch(()=>{});
              beeMarkHeardToday(p);
            }catch{}
          }
        }catch{}
        scheduleNext(id);
      }
    }
  }
}, 40);

try{
  world.afterEvents.entityDie.subscribe(ev=>{
    const e = ev.deadEntity; if (!e || e.typeId!=="myname:beekeeper_bot") return;
    try { if (e.getTags?.()?.includes("labs_retrieved")) return; } catch {}
    try { const egg=new ItemStack("myname:beekeeper_bot_spawn_egg",1); e.dimension.spawnItem(egg,e.location);} catch {}
  });
} catch {}
