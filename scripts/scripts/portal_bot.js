import { world, system, ItemStack } from "@minecraft/server";

// Portal bot: each owner can have up to two; items near one are forwarded to the other (cross-dimension)
// Implementation: scan nearby item entities; when within 1.3 blocks, kill and re-spawn at partner
// Prevent ping-pong via a short-lived ignore set of spawned item entity ids

const IGNORED = new Map(); // id -> expireAt (Date.now())
const RADIUS = 1.9; // widened pickup radius for reliability
const BOT_ID = "myname:portal_bot";
const REG_KEY = "labs_bot_registry";

function nowMs(){ return Date.now(); }

function cleanupIgnored(){
  const t = nowMs();
  for (const [id, exp] of Array.from(IGNORED.entries())){ if (exp <= t) IGNORED.delete(id); }
}

function readRegistry(){
  try{ const raw = world.getDynamicProperty?.(REG_KEY); if (raw && typeof raw==='string') return JSON.parse(raw); }catch{}
  return {};
}

function getOwnerName(e){ try{ const tags=e.getTags?.()||[]; for(const t of tags){ if(String(t).startsWith("labs_owner:")) return String(t).slice("labs_owner:".length); } }catch{} return ""; }
function getSelfUuid(e){ try{ const tags=e.getTags?.()||[]; for(const t of tags){ if(String(t).startsWith("labs_uuid:")) return String(t).slice("labs_uuid:".length); } }catch{} return ""; }

function getPartnerInfo(self){
  try{
    // find owner name from tags
    const owner = getOwnerName(self);
    if (!owner) return null;
    const reg = readRegistry(); const arr = Array.isArray(reg[owner]) ? reg[owner] : [];
    // collect portal entries
    const mine = arr.filter(it=> String(it?.type||"")===BOT_ID);
    if (mine.length < 2) return null;
    // find self uuid
    const uidSelf = getSelfUuid(self);
    // pick the other
    const other = mine.find(it=> String(it.uuid||"") !== uidSelf) || mine[0];
    if (!other) return null;
    return { dimKey: dimNameToKey(other.dim), x: other.x + 0.5, y: other.y + 0.5, z: other.z + 0.5 };
  }catch{}
  return null;
}

function findPartnerLive(self){
  try{
    const owner = getOwnerName(self); if (!owner) return null;
    const uidSelf = getSelfUuid(self);
    for (const dk of ["overworld","nether","the_end"]) {
      let d; try{ d=world.getDimension(dk); }catch{} if(!d) continue;
      const bots = d.getEntities({ type: BOT_ID })||[];
      for (const b of bots){
        try{
          if (b.id===self.id) continue;
          const tags=b.getTags?.()||[];
          let ok=false, uid='';
          for(const t of tags){ if(String(t).startsWith("labs_owner:") && String(t).endsWith(owner)) ok=true; if(String(t).startsWith("labs_uuid:")) uid=String(t).slice("labs_uuid:".length); }
          if (ok && (!uidSelf || uid!==uidSelf)){
            return { dimKey: dk, x: b.location.x, y: b.location.y, z: b.location.z };
          }
        }catch{}
      }
    }
  }catch{}
  return null;
}

function dimNameToKey(id){ const s=String(id||""); if(s.includes("nether")) return "nether"; if(s.includes("the_end")||s.includes("end")) return "the_end"; return "overworld"; }

function findContainerNear(dim, center, radius=3){
  const base = { x: Math.floor(center.x), y: Math.floor(center.y), z: Math.floor(center.z) };
  // Pass 1: immediate neighbors (6 faces)
  const NEI = [
    {x:1,y:0,z:0},{x:-1,y:0,z:0},{x:0,y:0,z:1},{x:0,y:0,z:-1},{x:0,y:1,z:0},{x:0,y:-1,z:0}
  ];
  for (const o of NEI){
    try{
      const b = dim.getBlock({ x: base.x+o.x, y: base.y+o.y, z: base.z+o.z });
      const cont = b?.getComponent?.("minecraft:inventory")?.container;
      if (cont && cont.size>0) return b.location;
    }catch{}
  }
  // Pass 2: horizontal radius scan with extended vertical range (±4)
  for (let dx=-radius; dx<=radius; dx++) for (let dz=-radius; dz<=radius; dz++) for (let dy=-4; dy<=4; dy++){
    try{
      const b = dim.getBlock({ x: base.x+dx, y: base.y+dy, z: base.z+dz });
      const cont = b?.getComponent?.("minecraft:inventory")?.container;
      if (cont && cont.size>0) return b.location;
    }catch{}
  }
  return null;
}
function listContainers(dim, center, radius=4, dyMin=-4, dyMax=4){
  const base = { x: Math.floor(center.x), y: Math.floor(center.y), z: Math.floor(center.z) };
  const out=[];
  for(let dx=-radius; dx<=radius; dx++) for(let dz=-radius; dz<=radius; dz++) for(let dy=dyMin; dy<=dyMax; dy++){
    try{
      const pos={ x: base.x+dx, y: base.y+dy, z: base.z+dz };
      const b = dim.getBlock(pos);
      const cont = b?.getComponent?.("minecraft:inventory")?.container;
      if (cont && cont.size>0){ out.push(b.location); }
    }catch{}
  }
  // sort nearest first
  out.sort((a,b)=>{ const da=(a.x-base.x)**2+(a.y-base.y)**2+(a.z-base.z)**2; const db=(b.x-base.x)**2+(b.y-base.y)**2+(b.z-base.z)**2; return da-db; });
  return out;
}
function depositToContainer(dim, chestPos, itemId, amount){
  try{
    const cont = dim.getBlock(chestPos)?.getComponent?.("minecraft:inventory")?.container; if (!cont) return 0;
    let left = amount|0;
    // top up existing stacks (only safe for vanilla stackables)
    for (let i=0;i<cont.size && left>0;i++){
      const cur=cont.getItem(i);
      if (cur && cur.typeId===itemId && cur.amount<cur.maxAmount){
        const can=Math.min(left, cur.maxAmount-cur.amount);
        if (can>0){ cur.amount+=can; cont.setItem(i,cur); left-=can; }
      }
    }
    // fill empty slots
    const maxPer = new ItemStack(itemId,1).maxAmount||64;
    for (let i=0;i<cont.size && left>0;i++){
      const cur=cont.getItem(i);
      if (!cur){ const put=Math.min(maxPer,left); cont.setItem(i,new ItemStack(itemId,put)); left-=put; }
    }
    return (amount|0) - left;
  }catch{}
  return 0;
}
function depositStackExact(dim, chestPos, stack){
  try{
    const cont = dim.getBlock(chestPos)?.getComponent?.("minecraft:inventory")?.container; if (!cont) return false;
    for (let i=0;i<cont.size;i++){ const cur=cont.getItem(i); if (!cur){ cont.setItem(i, stack); return true; } }
  }catch{}
  return false;
}
function forwardItemsAt(bot){
  try{
    let partner = getPartnerInfo(bot);
    if(!partner){ partner = findPartnerLive(bot); if (!partner) return; }
    const dim = bot.dimension; if (!dim) return;
    const items = dim.getEntities({ type: "item" });
    for (const it of items){
      try{
        // close enough?
        const dx=it.location.x - bot.location.x, dy=it.location.y - bot.location.y, dz=it.location.z - bot.location.z;
        if ((dx*dx + dz*dz) > RADIUS*RADIUS || Math.abs(dy) > 3.0) continue;
        if (IGNORED.has(it.id)) continue;
        const comp = it.getComponent?.("minecraft:item"); const stack = comp?.itemStack; const id = String(stack?.typeId||""); const amt = Math.max(1, Math.floor(Number(stack?.amount||1)));
        if (!id || amt<=0) continue;
        // FX at source
        try{ dim.runCommandAsync(`particle minecraft:portal_reverse ${Math.floor(it.location.x)} ${Math.floor(it.location.y)} ${Math.floor(it.location.z)}`).catch(()=>{}); }catch{}
        try{ dim.runCommandAsync(`playsound random.orb @a ${Math.floor(it.location.x)} ${Math.floor(it.location.y)} ${Math.floor(it.location.z)} 0.7 1.2 0`).catch(()=>{}); }catch{}
        // remove source item
        try{ it.kill?.(); }catch{}
        // deliver at partner: prefer chest near partner bot; fallback spawn
        const destDim = world.getDimension(partner.dimKey);
        if (!destDim) continue;
        const destPos = { x: partner.x, y: partner.y, z: partner.z };
        // try to locate the actual partner bot nearby to anchor chest search
        let chestPos = null;
        try{
          const bots = destDim.getEntities({ type: BOT_ID });
          let pb=null,bd2=Infinity;
          for(const b of bots){ const dx=b.location.x-destPos.x, dz=b.location.z-destPos.z; const d2=dx*dx+dz*dz; if(d2<bd2){bd2=d2; pb=b;} }
          if (pb) chestPos = findContainerNear(destDim, pb.location, 4);
        }catch{}
        if(!chestPos) chestPos = findContainerNear(destDim, destPos, 4);
        // Build candidate containers: adjacent first, then within 4 blocks up/down
        const candidates = chestPos ? [chestPos] : [];
        try{
          const nearAdj = listContainers(destDim, destPos, 1, -1, 1);
          for(const p of nearAdj){ if (!candidates.find(c=>c.x===p.x&&c.y===p.y&&c.z===p.z)) candidates.push(p); }
          const nearWide = listContainers(destDim, destPos, 4, -4, 4);
          for(const p of nearWide){ if (!candidates.find(c=>c.x===p.x&&c.y===p.y&&c.z===p.z)) candidates.push(p); }
        }catch{}
        if (candidates.length){
          // Non-stackables (tools/armor/books) or amount==1: try containers until one accepts
          const maxAmt = new ItemStack(id,1).maxAmount||64;
          if ((maxAmt<=1) || (amt<=1)){
            let placedExact=false;
            for(const pos of candidates){ if (depositStackExact(destDim, pos, stack)) { placedExact=true; break; } }
            if (!placedExact){ const spawned = destDim.spawnItem?.(stack, destPos); if (spawned) IGNORED.set(spawned.id, nowMs()+8000); }
          } else {
            // Stackables: spread across containers until placed or none accept
            let remaining = amt|0;
            for(const pos of candidates){ if (remaining<=0) break; try{ const put=depositToContainer(destDim, pos, id, remaining); remaining -= (put|0); }catch{} }
            if (remaining>0){
              try{
                const maxPer=new ItemStack(id,1).maxAmount||64; let rem=remaining;
                while(rem>0){ const put=Math.min(maxPer, rem); const spawned=destDim.spawnItem?.(new ItemStack(id, put), destPos); if (spawned) IGNORED.set(spawned.id, nowMs()+8000); rem-=put; }
              }catch{
                try{ const spawned = destDim.spawnItem?.(stack, destPos); if (spawned) IGNORED.set(spawned.id, nowMs()+8000); }catch{}
              }
            }
          }
        } else {
          const spawned = destDim.spawnItem?.(stack, destPos);
          if (spawned){ IGNORED.set(spawned.id, nowMs()+8000); }
        }
        // FX at destination
        try{ destDim.runCommandAsync(`particle minecraft:portal_reverse ${Math.floor(destPos.x)} ${Math.floor(destPos.y)} ${Math.floor(destPos.z)}`).catch(()=>{}); }catch{}
        try{ destDim.runCommandAsync(`playsound random.orb @a ${Math.floor(destPos.x)} ${Math.floor(destPos.y)} ${Math.floor(destPos.z)} 0.7 1.2 0`).catch(()=>{}); }catch{}
      }catch{}
    }
  }catch{}
}
// loop
system.runInterval(()=>{
  try{
    cleanupIgnored();
    const dims=["overworld","nether","the_end"];
    for (const dkey of dims){
      let d; try{ d=world.getDimension(dkey); }catch{} if(!d) continue;
      const bots = d.getEntities({ type: BOT_ID });
      for (const b of bots){ try{ if (!b.nameTag) b.nameTag = "Portal Bot"; forwardItemsAt(b); }catch{} }
    }
  }catch{}
}, 3);

// Spawn messaging: confirm link status to owner
try{
world.afterEvents.entitySpawn.subscribe(ev=>{
try{
 const e=ev.entity; if(!e || e.typeId!==BOT_ID) return;
 // wait a moment for main.js to tag owner/uuid and update registry
   system.runTimeout(()=>{
       try{
          const ownerName = getOwnerName(e);
          const owner = ownerName && world.getPlayers().find(p=>p.name===ownerName);
          if (!owner){ return; }
          let partner = getPartnerInfo(e);
          if (!partner) partner = findPartnerLive(e);
          if (partner){
            try{ owner.sendMessage?.(`Portal Bot: Connection established. Partner at ${Math.floor(partner.x)},${Math.floor(partner.y)},${Math.floor(partner.z)} (${partner.dimKey}). All systems nominal.`); }catch{}
          } else {
            try{ owner.sendMessage?.(`Portal Bot: Connection not made. Spawn a second Portal Bot to link them, or wait a moment for registry to update.`); }catch{}
          }
        }catch{}
      }, 30);
    }catch{}
  });
} catch {}
 
 // On death: drop two portal bot eggs (to support deeper expeditions)
 try{
   world.afterEvents.entityDie.subscribe(ev=>{
     const e = ev.deadEntity; if (!e || e.typeId !== BOT_ID) return;
     try{ if (e.getTags?.()?.includes("labs_retrieved")) return; }catch{}
     try{ e.dimension.spawnItem(new ItemStack("myname:portal_bot_spawn_egg", 2), e.location); }catch{}
   });
 } catch {}
