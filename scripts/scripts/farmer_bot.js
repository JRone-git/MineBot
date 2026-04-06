import { world, system, ItemStack } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";

const STATE = new Map(); // id -> { type: 'cocoa'|'cactus'|'paper'|'bamboo'|'crops', next: number, chest?: {x,y,z}, bounds?: {min:{x,z}, max:{x,z}} }
const TYPE_TAG_PREFIX = "labs:farmer:type=";
function setFarmerTypeTag(bot, type){
  try{
    const tags = bot.getTags?.() || [];
    for (const t of tags){ if (String(t).startsWith(TYPE_TAG_PREFIX)) try { bot.removeTag(t); } catch {} }
    try { bot.addTag(`${TYPE_TAG_PREFIX}${type}`); } catch {}
  } catch {}
}
function getFarmerTypeTag(bot){
  try{
    const tags = bot.getTags?.() || [];
    for (const t of tags){ if (String(t).startsWith(TYPE_TAG_PREFIX)) return String(t).slice(TYPE_TAG_PREFIX.length); }
  } catch {}
  return undefined;
}
function inferTypeFromNameTag(bot){
  try{
    const nt = String(bot.nameTag||"").toLowerCase();
    if (!nt.includes("farmer bot")) return undefined;
    if (nt.includes("cocoa")) return 'cocoa';
    if (nt.includes("cactus")) return 'cactus';
    if (nt.includes("bamboo")) return 'bamboo';
    if (nt.includes("sugarcane") || nt.includes("cane")) return 'paper';
    if (nt.includes("crops") || nt.includes("wheat") || nt.includes("carrot") || nt.includes("potato")) return 'crops';
  } catch {}
  return undefined;
}

function typeLabel(t){
  const map={cocoa:"Cocoa", cactus:"Cactus", paper:"Crops: Cane", bamboo:"Bamboo", crops:"Crops"};
  return map[t] || String(t||"").toUpperCase();
}
function setTypeNameTag(bot, t){
  try{ bot.nameTag = `Farmer Bot (${typeLabel(t)})`; }catch{}
}

function toBlk(v){ return { x: Math.floor(v.x), y: Math.floor(v.y), z: Math.floor(v.z) }; }

// Robust chest search like BeeKeeper: build candidate chest list (cached, adjacent, ±4Y nearby)
function listChests(dim, center, radius=9, dyMin=-4, dyMax=4){
const c = toBlk(center);
const out=[];
for(let dx=-radius; dx<=radius; dx++) for(let dz=-radius; dz<=radius; dz++) for(let dy=dyMin; dy<=dyMax; dy++){
try{ const b=dim.getBlock({x:c.x+dx,y:c.y+dy,z:c.z+dz}); const cont=b?.getComponent?.("minecraft:inventory")?.container; if (cont && cont.size>0) out.push({x:b.location.x,y:b.location.y,z:b.location.z}); }catch{}
}
// nearest-first
out.sort((a,b)=>{ const da=(a.x-c.x)**2+(a.y-c.y)**2+(a.z-c.z)**2; const db=(b.x-c.x)**2+(b.y-c.y)**2+(b.z-c.z)**2; return da-db; });
return out;
}
function getCandidateChests(bot){
const dim=bot.dimension; const st=STATE.get(bot.id)||{}; const out=[];
// validate cached
try{ const cont = st.chest ? dim.getBlock(st.chest)?.getComponent("minecraft:inventory")?.container : null; if (!cont) st.chest=undefined; }catch{}
if (st.chest) out.push(st.chest);
try{ const adj=listChests(dim, bot.location, 1, -1, 1); for(const p of adj){ if (!out.find(q=>q.x===p.x&&q.y===p.y&&q.z===p.z)) out.push(p); } }catch{}
try{ const near=listChests(dim, bot.location, 9, -4, 4); for(const p of near){ if (!out.find(q=>q.x===p.x&&q.y===p.y&&q.z===p.z)) out.push(p); } }catch{}
 STATE.set(bot.id, st);
  return out;
}
 
function deposit(dim, chestPos, itemId, amount){
  try{
    const cont = dim.getBlock(chestPos)?.getComponent?.("minecraft:inventory")?.container;
    if (!cont) return false;
    let left = amount;
    // pass 1: top up existing stacks
    for (let i=0;i<cont.size && left>0;i++){
      const cur = cont.getItem(i);
      if (cur && cur.typeId === itemId && cur.amount < cur.maxAmount){
        const can = Math.min(left, cur.maxAmount - cur.amount);
        if (can>0){ cur.amount += can; cont.setItem(i, cur); left -= can; }
      }
    }
    // pass 2: fill empty slots with capped stacks
    const maxPer = new ItemStack(itemId, 1).maxAmount || 64;
    for (let i=0;i<cont.size && left>0;i++){
      const cur = cont.getItem(i);
      if (!cur){
        const place = Math.min(maxPer, left);
        cont.setItem(i, new ItemStack(itemId, place));
        left -= place;
      }
    }
    return left < amount;
  }catch{}
  return false;
}

function depositCount(dim, chestPos, itemId, amount){
  try{
    const cont = dim.getBlock(chestPos)?.getComponent?.("minecraft:inventory")?.container;
    if (!cont) return 0;
    let left = amount|0;
    for (let i=0;i<cont.size && left>0;i++){
      const cur = cont.getItem(i);
      if (cur && cur.typeId === itemId && cur.amount < cur.maxAmount){
        const can = Math.min(left, cur.maxAmount - cur.amount);
        if (can>0){ cur.amount += can; cont.setItem(i, cur); left -= can; }
      }
    }
    const maxPer = new ItemStack(itemId, 1).maxAmount || 64;
    for (let i=0;i<cont.size && left>0;i++){
      const cur = cont.getItem(i);
      if (!cur){ const place = Math.min(maxPer, left); cont.setItem(i, new ItemStack(itemId, place)); left -= place; }
    }
    return (amount|0) - left;
  }catch{ return 0; }
}
function depositAny(dim, positions, itemId, amount){
  let left = amount|0;
  try{
    for (const pos of positions){ if (left<=0) break; const put = depositCount(dim, pos, itemId, left); left -= put; }
  }catch{}
  return (amount|0) - left;
}

function getAge(block){
  try{
    const p = block.permutation;
    let v = p.getState?.("age"); if (typeof v === 'number') return v;
    v = p.getState?.("growth"); if (typeof v === 'number') return v;
    v = p.getState?.("stage"); if (typeof v === 'number') return v;
    // Better on Bedrock crops use a namespaced numeric key
    v = p.getState?.("better_on_bedrock:growth_stage"); if (typeof v === 'number') return v;
  }catch{}
  return -1;
}
function setAge(block, age){
  try{
    const p = block.permutation;
    let np = p.withState?.("age", age);
    if (!np) np = p.withState?.("growth", age);
    if (!np) np = p.withState?.("stage", age);
    if (!np) np = p.withState?.("better_on_bedrock:growth_stage", age);
    if (np) { block.setPermutation(np); return true; }
  }catch{}
  return false;
}

function getGrowthLabel(block){
  try{
    const p=block.permutation; const keys=["growth","Growth","stage","Stage","phase","Phase","maturity","Maturity","crop_stage","Crop_stage","development","Development","state","State"];
    for(const k of keys){ const v=p.getState?.(k); if (typeof v==='string') return String(v).toLowerCase(); }
  }catch{}
  return "";
}
function getGrowthPercent(block){
  try{
    const p=block.permutation; const keys=["growth","Growth","stage","Stage","progress","Progress","percent","Percent"];
    for(const k of keys){
      const v=p.getState?.(k);
      if (typeof v==='string'){
        const m=/([0-9]{1,3})\s*%/.exec(v);
        if (m){ const n=parseInt(m[1]); if (!isNaN(n)) return n; }
      }
      if (typeof v==='number'){
        if (v>=0 && v<=100) return v;
      }
    }
  }catch{}
  return -1;
}
function isGrownGeneric(block, defaultThresh=3){
  const a=getAge(block);
  if (a>=0){
    try{
      const id = String(block.typeId||"");
      const MAX = {
        "better_on_bedrock:cabbage_crop": 4,
        "better_on_bedrock:eggplant_crop": 2,
        "better_on_bedrock:barley_crop": 3,
        "better_on_bedrock:onion_crop": 3,
        "better_on_bedrock:tomato_crop": 2
      };
      if (MAX[id] !== undefined) return a >= MAX[id];
    }catch{}
    return a>=defaultThresh;
  }
  const gp=getGrowthPercent(block); if (gp>=0) return gp>=90; // treat 90%+ as harvestable
  const gl=getGrowthLabel(block);
  if (!gl) return false;
  const yes=["grown","mature","ripe","harvest","harvestable","ready","final","done","complete"]; return yes.includes(gl);
}
function setGrowthString(block){
  try{
    const p=block.permutation; const keys=["growth","Growth","stage","Stage","phase","Phase","maturity","Maturity","crop_stage","Crop_stage","development","Development","state","State"]; const candidates=["0%","seedling","young","stage_0","sprout","small","initial","youngling","0"];
    for(const k of keys){ for(const lab of candidates){ try{ const np=p.withState?.(k, lab); if (np){ block.setPermutation(np); return true; } }catch{} } }
  }catch{}
  return false;
}
function ensureSoilAndReplant(dim, pos, typeId){
  try{
    const below = dim.getBlock({x:pos.x,y:pos.y-1,z:pos.z}); const bid=String(below?.typeId||"").toLowerCase();
    if (bid!=="minecraft:farmland" && bid!=="minecraft:grass_path"){ try{ below?.setType("minecraft:farmland"); }catch{} }
    try{ dim.getBlock(pos)?.setType(typeId); }catch{}
    const b = dim.getBlock(pos); if (b){ if (!setAge(b,0)) setGrowthString(b); }
  }catch{}
}

function detectBounds(dim, center){
  const c = toBlk(center);
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity; let found=0;
  for (let r=3;r<=10;r++){
    for (let dx=-r;dx<=r;dx++){
      for (let dz=-r;dz<=r;dz++){
        if (Math.abs(dx)!==r && Math.abs(dz)!==r) continue; // perimeter ring
        for (let dy=-1;dy<=2;dy++){
          try{
            const b = dim.getBlock({x:c.x+dx,y:c.y+dy,z:c.z+dz});
            if (!b) continue;
            const id = String(b.typeId||"").toLowerCase();
            if (id.includes("fence") || id.includes("wall")){
              if (c.x+dx<minX) minX=c.x+dx; if (c.x+dx>maxX) maxX=c.x+dx;
              if (c.z+dz<minZ) minZ=c.z+dz; if (c.z+dz>maxZ) maxZ=c.z+dz;
              found++;
            }
          }catch{}
        }
      }
    }
    if (found>16) break;
  }
  if (found>0) return { min:{x:minX,z:minZ}, max:{x:maxX,z:maxZ} };
  return undefined;
}

function wander(bot){
  const st = STATE.get(bot.id); if (!st) return;
  const dim = bot.dimension;
  // build bounds once
  if (!st.bounds){ st.bounds = detectBounds(dim, bot.location); STATE.set(bot.id, st); }
  // choose small step
  const step = [{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}][Math.floor(Math.random()*4)];
  let tx = Math.floor(bot.location.x) + step.x;
  let tz = Math.floor(bot.location.z) + step.z;
  if (st.bounds){
    tx = Math.max(st.bounds.min.x+1, Math.min(st.bounds.max.x-1, tx));
    tz = Math.max(st.bounds.min.z+1, Math.min(st.bounds.max.z-1, tz));
  }
  try{
    const fy = Math.floor(bot.location.y);
    const at = dim.getBlock({x:tx,y:fy,z:tz});
    const below = dim.getBlock({x:tx,y:fy-1,z:tz});
    const idAt = String(at?.typeId||"").toLowerCase();
    const idBelow = String(below?.typeId||"").toLowerCase();
    if (idAt.includes("fence") || idAt.includes("wall")) return; // don't step into fence
    // avoid cactus hazards (standing on or adjacent)
    const isCactus = (b)=> String(b?.typeId||"").toLowerCase().includes("cactus");
    if (isCactus(at) || isCactus(below)) return;
    const dirs = [
      {x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}
    ];
    for (const d of dirs){
      const nb = dim.getBlock({x:tx+d.x,y:fy,z:tz+d.z});
      if (isCactus(nb)) return;
    }
    // safety: only step if target is air and block below is solid (not air/water/lava)
    const isFluid = (id)=> id.includes("water") || id.includes("lava");
    const isAir = (id)=> id==="minecraft:air" || id==="minecraft:cave_air" || id==="minecraft:void_air";
    if (!isAir(idAt)) return;
    if (isAir(idBelow) || isFluid(idBelow)) return;
    bot.teleport({ x: tx+0.5, y: bot.location.y, z: tz+0.5 }, { dimension: dim, keepVelocity:false, checkForBlocks:true });
  }catch{}
}

function cocoaHarvestPass(bot){
  const dim = bot.dimension;
  const origin = bot.location;
  const st = STATE.get(bot.id);
  if (!st) return;
  let harvested = 0;
  const cx = Math.floor(origin.x), cy = Math.floor(origin.y), cz = Math.floor(origin.z);
  for (let dx=-13; dx<=13; dx++){
    for (let dz=-13; dz<=13; dz++){
      for (let dy=-2; dy<=3; dy++){
        try{
          const pos = { x: cx+dx, y: cy+dy, z: cz+dz };
          const b = dim.getBlock(pos);
          if (!b) continue;
          if (b.typeId !== "minecraft:cocoa") continue;
          const age = getAge(b);
          if (age >= 2){
            // harvest beans and replant by resetting age to 0
            const resetOk = setAge(b, 0);
            if (!resetOk){ try { b.setType("minecraft:air"); } catch {} }
            harvested += 3;
          }
        }catch{}
      }
    }
  }
  if (harvested > 0){
    const candidates = getCandidateChests(bot);
    if (candidates.length){
      for (const pos of candidates){ if (harvested<=0) break; const ok = deposit(dim, pos, "minecraft:cocoa_beans", harvested); if (ok) harvested = 0; }
    }
  }
  try { setTypeNameTag(bot, st?.type || 'cocoa'); } catch {}
  // small wander movement each pass
  wander(bot);
  }

function chooseFarmType(e){
  const form = new ModalFormData().title("Farmer Bot").dropdown("Farm type", ["Cocoa Farm","Cactus Farm","Paper (Sugar Cane)","Bamboo","Crops"], 0).textField("Tip:", "", "Place in a 15x15 fenced area with a chest.");
  // nearest player
  let target=null,best=999999;
  for (const p of world.getPlayers()){
    if (p.dimension.id!==e.dimension.id) continue;
    const dx=p.location.x-e.location.x, dz=p.location.z-e.location.z; const d2=dx*dx+dz*dz; if (d2<best){best=d2;target=p;}
  }
  if (!target) return;
  form.show(target).then(res=>{
    if (!res || res.canceled) return;
    const idx = res.formValues?.[0] ?? 0;
    const types = ['cocoa','cactus','paper','bamboo','crops'];
    const type = types[idx] || 'cocoa';
    // Persist type on the entity so it survives reloads
    setFarmerTypeTag(e, type);
    STATE.set(e.id, { type, next: Date.now()+5000 });
    if (type==='cocoa'){
      try { target.sendMessage("Place the bot inside a 15x15 fenced area with jungle logs 2 high. Include a chest. Bot will harvest ripe cocoa and replant."); } catch {}
    } else if (type==='cactus') {
      try { target.sendMessage("Place the bot inside a 15x15 fenced area with cactus planted on sand. Bot will trim stacks down to 1 and store cactus."); } catch {}
    } else if (type==='paper') {
      try { target.sendMessage("Place the bot inside a 15x15 fenced area with sugar cane. Bot will trim down to 1 and store sugar cane."); } catch {}
    } else if (type==='bamboo') {
      try { target.sendMessage("Place the bot inside a 15x15 fenced area with bamboo. Bot will trim down to 1 and store bamboo."); } catch {}
    }
    try { setTypeNameTag(e, type); } catch {}
  }).catch(()=>{});
}

try{
  world.afterEvents.entitySpawn.subscribe(ev=>{
    const e = ev.entity; if (!e || e.typeId !== "myname:farmer_bot") return;
    system.runTimeout(()=>{ chooseFarmType(e); }, 10);
  });
} catch {}

system.runInterval(()=>{
  for (const dim of [world.getDimension("overworld"), world.getDimension("nether"), world.getDimension("the_end")]){
    if (!dim) continue;
    const bots = dim.getEntities({ type: "myname:farmer_bot" });
    for (const bot of bots){
      let st = STATE.get(bot.id);
      // Rehydrate state after reloads using entity tag, if needed
      if (!st){
        let t = getFarmerTypeTag(bot);
        if (!t) t = inferTypeFromNameTag(bot);
        if (t) {
          st = { type: t, next: 0 };
          STATE.set(bot.id, st);
          setFarmerTypeTag(bot, t); // backfill tag for persistence
          try { setTypeNameTag(bot, t); } catch {}
        } else {
          continue; // not configured yet
        }
      }
      const now = Date.now();
      if (st.next && now < st.next) continue;
      if (st.type === 'cocoa') cocoaHarvestPass(bot);
      else if (st.type === 'cactus') cactusHarvestPass(bot);
      else if (st.type === 'paper') caneHarvestPass(bot);
      else if (st.type === 'bamboo') bambooHarvestPass(bot);
      else if (st.type === 'crops') cropsHarvestPass(bot);
      // Apply work speed multiplier
      const baseInterval = 8000 + Math.floor(Math.random()*4000); // 8-12s base
      const workSpeedMultiplier = globalThis.LABS_getWorkSpeedMultiplier ? globalThis.LABS_getWorkSpeedMultiplier() : 1;
      const adjustedInterval = Math.floor(baseInterval / workSpeedMultiplier);
      st.next = now + adjustedInterval;
      STATE.set(bot.id, st);
    }
  }
}, 20);

function harvestAgeCrop(dim, pos, maxAge, replantId){
  try{
    const b = dim.getBlock(pos); if (!b) return 0;
    const id = b.typeId;
    const age = getAge(b);
    if (age < 0) return 0;
    const threshold = (typeof maxAge === 'number') ? maxAge : 7;
    if (age >= threshold){
      // reset to age 0 (replant)
      if (!setAge(b, 0)) {
        // fallback: clear and re-place crop at initial stage ensuring soil
        try { b.setType("minecraft:air"); } catch {}
        try { ensureSoilAndReplant(dim, pos, replantId || id); } catch {}
      }
      return 1;
    }
  } catch {}
  return 0;
}

function cropsHarvestPass(bot){
  const dim = bot.dimension; const st = STATE.get(bot.id); if (!st) return;
  let drops = {};
  const c = toBlk(bot.location);
  for (let dx=-13;dx<=13;dx++) for (let dz=-13;dz<=13;dz++){
    for (let dy=-3;dy<=4;dy++){
      const pos = {x:c.x+dx,y:c.y+dy,z:c.z+dz};
      try{
        const b = dim.getBlock(pos); if (!b) continue;
        const id = b.typeId;
        if (id==="minecraft:wheat") { const n=harvestAgeCrop(dim,pos,7,"minecraft:wheat"); if(n){ drops["minecraft:wheat_seeds"]=(drops["minecraft:wheat_seeds"]||0)+1; drops["minecraft:wheat"]=(drops["minecraft:wheat"]||0)+1; } }
        else if (id==="minecraft:carrots") { const n=harvestAgeCrop(dim,pos,7,"minecraft:carrots"); if(n){ drops["minecraft:carrot"]=(drops["minecraft:carrot"]||0)+2; } }
        else if (id==="minecraft:potatoes") { const n=harvestAgeCrop(dim,pos,7,"minecraft:potatoes"); if(n){ drops["minecraft:potato"]=(drops["minecraft:potato"]||0)+2; } }
        else if (id==="minecraft:beetroot") { const n=harvestAgeCrop(dim,pos,3,"minecraft:beetroot"); if(n){ drops["minecraft:beetroot"]=(drops["minecraft:beetroot"]||0)+1; drops["minecraft:beetroot_seeds"]=(drops["minecraft:beetroot_seeds"]||0)+1; } }
        else if (id==="minecraft:sweet_berry_bush") { const age=getAge(b); if (age>=3){ try{ setAge(b,1);}catch{} drops["minecraft:sweet_berries"]=(drops["minecraft:sweet_berries"]||0)+2; } }
        else if (id==="minecraft:glow_berry") { /* cave vine tip is different; skip for now */ }
        else if (id==="minecraft:melon_block" || id==="minecraft:pumpkin") { try{ b.setType("minecraft:air"); } catch {}; if (id==="minecraft:melon_block") drops["minecraft:melon_slice"]=(drops["minecraft:melon_slice"]||0)+3; else drops["minecraft:pumpkin"]=(drops["minecraft:pumpkin"]||0)+1; }
        else if (id==="better_on_bedrock:blueberry_block" || id==="better_on_bedrock:grape") {
          const age = getAge(b);
          if (age>=2){
            // reset bush to stage 1 after picking
            if (!setAge(b, 1)){
              try{ const p=b.permutation; const np=p.withState?.("better_on_bedrock:growth_stage", 1); if (np) b.setPermutation(np); }catch{}
            }
            const outId = (id==="better_on_bedrock:blueberry_block")? "better_on_bedrock:blueberries" : "better_on_bedrock:grape_seed";
            drops[outId] = (drops[outId]||0) + (age>=3? 3 : 1);
          }
        }
        else {
          // Generic & mod crops: numeric threshold, % growth, or string 'grown'
          if (isGrownGeneric(b, 3)){
            // Try to reset growth without breaking drops
            if (!setAge(b,0)){
              // Try string reset (e.g., set Growth to "0%") before hard reset
              if (!setGrowthString(b)){
                try{ b.setType("minecraft:air"); }catch{}
                ensureSoilAndReplant(dim, pos, id);
              }
            }
            // Infer produce item for known patterns and mods
            let outId = id;
            if (id === "better_on_bedrock:cabbage_crop") outId = "better_on_bedrock:gabage_leaves";
            else if (id === "better_on_bedrock:eggplant_crop") outId = "better_on_bedrock:eggplant_food";
            else if (id === "better_on_bedrock:barley_crop") outId = "better_on_bedrock:barley_straw";
            else if (id === "better_on_bedrock:onion_crop") outId = "better_on_bedrock:onion_seed";
            else if (id === "better_on_bedrock:tomato_crop") outId = "better_on_bedrock:tomato_seed";
            else if (id.endsWith("_crop")){
              outId = id.slice(0, -5);
            }
            drops[outId] = (drops[outId]||0) + 1;
          }
        }
      } catch {}
    }
  }
  // deposit all across nearby chests
  const candidates = getCandidateChests(bot);
  if (candidates.length){
    for (const k of Object.keys(drops)){
      const amt = drops[k]|0; if (amt>0) depositAny(dim, candidates, k, amt);
    }
  }
  try { setTypeNameTag(bot, st?.type || 'crops'); } catch {}
  wander(bot);
}

function trimColumn(dim, base, id, minKeep){
  // Count upward and trim to minKeep
  let y = base.y;
  let count = 0;
  for (;;){
    try{
      const b = dim.getBlock({x:base.x,y:y,z:base.z});
      if (!b || b.typeId !== id) break;
      y++; count++;
    } catch { break; }
  }
  if (count > minKeep){
    let removed = 0;
    for (let yy = base.y + count - 1; yy >= base.y + minKeep; yy--){
      try{ const b = dim.getBlock({x:base.x,y:yy,z:base.z}); if (b && b.typeId === id){ b.setType("minecraft:air"); removed++; } } catch {}
    }
    return removed;
  }
  return 0;
}


function cactusHarvestPass(bot){
  const dim = bot.dimension; const st = STATE.get(bot.id); if (!st) return;
  let cactusTotal = 0;
  let flowerTotal = 0;
  const c = toBlk(bot.location);
  // First, harvest cactus flowers so cactus can grow
  for (let dx=-13;dx<=13;dx++) for (let dz=-13;dz<=13;dz++){
    for (let dy=-1;dy<=3;dy++){
      try{
        const bp = dim.getBlock({x:c.x+dx,y:c.y+dy,z:c.z+dz});
        if (!bp) continue;
        if (bp.typeId === "minecraft:cactus_flower") { bp.setType("minecraft:air"); flowerTotal++; }
      }catch{}
    }
  }
  // Then, trim cactus columns down to 1
  for (let dx=-13;dx<=13;dx++) for (let dz=-13;dz<=13;dz++){
    const pos = {x:c.x+dx,y:c.y,z:c.z+dz};
    try{ const b = dim.getBlock(pos); if (!b || b.typeId!=="minecraft:cactus") continue; cactusTotal += trimColumn(dim,pos,"minecraft:cactus",1); } catch {}
  }
  const candidates = getCandidateChests(bot);
  if (cactusTotal>0 && candidates.length) depositAny(dim, candidates, "minecraft:cactus", cactusTotal);
  if (flowerTotal>0 && candidates.length) depositAny(dim, candidates, "minecraft:cactus_flower", flowerTotal);
  try { setTypeNameTag(bot, st?.type || 'cactus'); } catch {}
  wander(bot);
}

function caneHarvestPass(bot){
  const dim = bot.dimension; const st = STATE.get(bot.id); if (!st) return;
  let total = 0;
  const c = toBlk(bot.location);
  for (let dx=-13;dx<=13;dx++) for (let dz=-13;dz<=13;dz++){
    const pos = {x:c.x+dx,y:c.y,z:c.z+dz};
    try{
      const b = dim.getBlock(pos);
      if (!b) continue;
      const bid = b.typeId;
      if (bid!=="minecraft:reeds" && bid!=="minecraft:sugar_cane") continue;
      total += trimColumn(dim, pos, bid, 1);
    } catch {}
  }
  if (total>0){
    const candidates = getCandidateChests(bot);
    if (candidates.length){
      let left = total;
      const putReeds = depositAny(dim, candidates, "minecraft:reeds", left);
      left -= putReeds;
      if (left>0) depositAny(dim, candidates, "minecraft:sugar_cane", left);
    }
  }
  try { setTypeNameTag(bot, st?.type || 'paper'); } catch {}
  wander(bot);
}

function bambooHarvestPass(bot){
  const dim = bot.dimension; const st = STATE.get(bot.id); if (!st) return;
  let total = 0;
  const c = toBlk(bot.location);
  for (let dx=-13;dx<=13;dx++) for (let dz=-13;dz<=13;dz++){
    const pos = {x:c.x+dx,y:c.y,z:c.z+dz};
    try{ const b = dim.getBlock(pos); if (!b || b.typeId!=="minecraft:bamboo") continue; total += trimColumn(dim,pos,"minecraft:bamboo",1); } catch {}
  }
  const candidates = getCandidateChests(bot);
  if (total>0 && candidates.length) depositAny(dim, candidates, "minecraft:bamboo", total);
  try { setTypeNameTag(bot, st?.type || 'bamboo'); } catch {}
  wander(bot);
}


// Drop egg on death
try{
  world.afterEvents.entityDie.subscribe(ev=>{
    const e = ev.deadEntity; if (!e || e.typeId !== "myname:farmer_bot") return;
    try { if (e.getTags?.()?.includes("labs_retrieved")) return; } catch {}
    try { const egg = new ItemStack("myname:farmer_bot_spawn_egg",1); e.dimension.spawnItem(egg, e.location); } catch {}
  });
} catch {}
