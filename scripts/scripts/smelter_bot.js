import { world, system, ItemStack } from "@minecraft/server";

// Smelter: stands still, manages up to 4 adjacent furnaces, optional adjacent chest for outputs.
// Accepts ores/fuels sent by Butler via global queue; also reacts to player-supplied fuel.

const S_STATE = new Map(); // id -> { furnaces: {x,y,z}[], chest?:{x,y,z}, queue: { ores: Record<id, n>, fuel: Record<id, n> }, next:number, ledger?: Record<outId, {in:number,out:number}>, nextQuip?: number }

const ORE_ITEMS = new Set([
  "minecraft:raw_iron","minecraft:raw_copper","minecraft:raw_gold",
  "minecraft:iron_ore","minecraft:deepslate_iron_ore",
  "minecraft:copper_ore","minecraft:deepslate_copper_ore",
  "minecraft:gold_ore","minecraft:deepslate_gold_ore",
  "minecraft:ancient_debris",
  "minecraft:sand","minecraft:red_sand",
  "minecraft:wet_sponge",
]);
const FUEL_ITEMS = new Set([
  "minecraft:coal","minecraft:charcoal","minecraft:coal_block","minecraft:dried_kelp_block"
]);

function toBlk(v){ return { x: Math.floor(v.x), y: Math.floor(v.y), z: Math.floor(v.z) }; }

function findAdjacents(e){
  const dim=e.dimension; const base=toBlk(e.location);
  const card=[{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}];
  const furn=[]; let chestNearBot=null; let placedFurn=false;
  for(const c of card){
    const p={x:base.x+c.x,y:base.y,z:base.z+c.z};
    try{
      const b=dim.getBlock(p); if(!b) continue; const id=String(b.typeId||"");
      if (id==="minecraft:air" && !placedFurn){ try{ b.setType("minecraft:furnace"); }catch{} placedFurn=true; furn.push(p); continue; }
      if (id==="minecraft:furnace") furn.push(p);
      if (!chestNearBot && id==="minecraft:chest") chestNearBot=p;
    }catch{}
  }
  return { furnaces: furn.slice(0,4), chestNearBot };
}

function findChestNear(dim, pos){
  const offs=[{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}];
  for(const o of offs){ try{ const b=dim.getBlock({x:pos.x+o.x,y:pos.y,z:pos.z+o.z}); if (b && String(b.typeId||"")==="minecraft:chest") return {x:b.location.x,y:b.location.y,z:b.location.z}; }catch{} }
  return null;
}

function mapOutputId(id){
  if (id.includes("iron")) return "minecraft:iron_ingot";
  if (id.includes("copper")) return "minecraft:copper_ingot";
  if (id.includes("gold")) return "minecraft:gold_ingot";
  if (id==="minecraft:ancient_debris") return "minecraft:netherite_scrap";
  if (id==="minecraft:sand" || id==="minecraft:red_sand") return "minecraft:glass";
  if (id==="minecraft:wet_sponge") return "minecraft:sponge";
  return null;
}
function addToQueue(q, id, n, st){ if(!id||!n) return; const map = ORE_ITEMS.has(id)?q.ores:q.fuel; map[id]=(map[id]||0)+n; /* ledger updated on actual feed, not on queue add */ }

function takeFrom(map){ for(const k of Object.keys(map)){ const n=map[k]; if(n>0){ map[k]=0; return {id:k, n}; } } return null; }

function depositToChest(dim, chestPos, itemId, amount){
  try{ const cont=dim.getBlock(chestPos)?.getComponent("minecraft:inventory")?.container; if(!cont) return 0; let left=amount; const maxPer=new ItemStack(itemId,1).maxAmount||64;
    for(let i=0;i<cont.size && left>0;i++){ const cur=cont.getItem(i); if(cur && cur.typeId===itemId && cur.amount<cur.maxAmount){ const can=Math.min(left, cur.maxAmount-cur.amount); if(can>0){ cur.amount+=can; cont.setItem(i,cur); left-=can; } } }
    for(let i=0;i<cont.size && left>0;i++){ const cur=cont.getItem(i); if(!cur){ const place=Math.min(maxPer,left); cont.setItem(i,new ItemStack(itemId,place)); left-=place; } }
    return amount-left;
  }catch{} return 0;
}

function isFurnaceLit(dim, furnPos){
  try{ const b = dim.getBlock(furnPos); const lit = b?.permutation?.getState?.("lit"); return !!lit; }catch{} return false;
}

function moveOutputsToChest(dim, furnPos, chestPos, st, allowPartial){
  try{
    if (!chestPos) return;
    // Only remove ingots when the furnace is no longer lit
    if (isFurnaceLit(dim, furnPos)) return;
    const fcont = dim.getBlock(furnPos)?.getComponent("minecraft:inventory")?.container; if (!fcont) return;
    const out = fcont.getItem(2);
    if (!out || out.amount<=0) return;
    // Clamp by ledger so outputs never exceed inputs (default allow=0 if no record)
    let allow = 0;
    if (st && st.ledger){ const rec=st.ledger[out.typeId]; allow = Math.max(0, (rec?.in||0) - (rec?.out||0)); }
    if (allow <= 0) return;
    const take = Math.min(out.amount, allow);
    if (take<=0) return;
    const moved = depositToChest(dim, chestPos, out.typeId, take);
    if (moved>0){
      out.amount -= moved;
      fcont.setItem(2, out.amount>0?out:undefined);
      if(st){ st.ledger=st.ledger||{}; const rec=st.ledger[out.typeId]||{in:0,out:0}; rec.out += moved; st.ledger[out.typeId]=rec; }
    }
  }catch{}
}

function topOffFuel(dim, furnPos, qFuel){
  try{
    const fcont = dim.getBlock(furnPos)?.getComponent("minecraft:inventory")?.container; if (!fcont) return;
    const fuel = fcont.getItem(1);
    const need = !fuel || fuel.amount<16;
    if (!need) return;
    const pick = takeFrom(qFuel); if(!pick) return;
    const stackMax=new ItemStack(pick.id,1).maxAmount||64; const put=Math.min(stackMax, pick.n);
    const cur = fcont.getItem(1);
    if (!cur){ fcont.setItem(1, new ItemStack(pick.id, put)); }
    else if (cur.typeId===pick.id && cur.amount<cur.maxAmount){ cur.amount=Math.min(cur.maxAmount, cur.amount+put); fcont.setItem(1, cur); }
    else { /* different fuel present, push back */ addToQueue({ores:{},fuel:qFuel}, pick.id, pick.n); return; }
    if (pick.n>put) addToQueue({ores:{},fuel:qFuel}, pick.id, pick.n-put);
  }catch{}
}

function feedOre(dim, furnPos, qOres, st, bot){
  try{
    const fcont = dim.getBlock(furnPos)?.getComponent("minecraft:inventory")?.container; if (!fcont) return;
    const in0 = fcont.getItem(0);
    if (in0) return; // already smelting
    const pick = takeFrom(qOres); if(!pick) return;
    const expectedOut = mapOutputId(pick.id);
    // If output slot contains different item (e.g., gold while smelting iron), move it to chest first
    const out = fcont.getItem(2);
    if (out && expectedOut && out.typeId !== expectedOut){
      const chestF = findChestNear(dim, furnPos) || st?.chest;
      if (chestF) moveOutputsToChest(dim, furnPos, chestF, st);
    }
    // Re-check output slot conditions: must be empty or same type with room
    const out2 = fcont.getItem(2);
    if (out2 && expectedOut){
      const same = out2.typeId === expectedOut;
      const hasRoom = same && out2.amount < out2.maxAmount;
      if (!same || !hasRoom){
        // Can't smelt now; push back into queue (do not increment ledger again)
        addToQueue({ores:qOres,fuel:{}}, pick.id, pick.n);
        return;
      }
    }
    // Feed ore (and record ledger on actual feed)
    const stackMax=new ItemStack(pick.id,1).maxAmount||64; const put=Math.min(stackMax, pick.n);
    fcont.setItem(0, new ItemStack(pick.id, put));
    if (expectedOut && st){ st.ledger=st.ledger||{}; const rec=st.ledger[expectedOut]||{in:0,out:0}; rec.in += put; st.ledger[expectedOut]=rec; }
    if (pick.n>put) addToQueue({ores:qOres,fuel:{}}, pick.id, pick.n-put);
    // Sing when smelting starts (cooldown ~5 min)
    try{
      st._songNext = st._songNext || 0; const now=Date.now();
      if (bot && now>=st._songNext){ const x=Math.floor(bot.location.x), y=Math.floor(bot.location.y), z=Math.floor(bot.location.z); bot.dimension.runCommandAsync(`playsound labs.smelter_song @a ${x} ${y} ${z} 1 1 0`).catch(()=>{}); st._songNext = now + 5*60*1000; }
    }catch{}

  }catch{}
}

function tickSmelter(e){
  const st=S_STATE.get(e.id); if(!st) return; const now=Date.now(); if(st.next && now<st.next) return; st.next=now+1000; S_STATE.set(e.id, st);
  const dim=e.dimension;
  // refresh adjacents every tick to pick up newly placed furnaces/chests
  const adj=findAdjacents(e);
  st.furnaces = adj.furnaces;
  st.chest = adj.chestNearBot || st.chest || null;
  S_STATE.set(e.id, st);
  // Determine if we should flush partial outputs (no more ore queued and all furnaces idle)
  const isQueueEmpty = Object.values(st.queue?.ores||{}).every(v=>!v || v<=0);
  let allIdle = true;
  for (const fpos of st.furnaces){ try{ const fcont = dim.getBlock(fpos)?.getComponent("minecraft:inventory")?.container; const in0=fcont?.getItem(0); if (in0 && in0.amount>0) { allIdle=false; break; } }catch{} }
  const flushPartials = isQueueEmpty && allIdle;
  // outputs -> chest near each furnace (fallback to chest near bot), fuel top-off, feed ores
  for(const fpos of st.furnaces){ try{
    const chestF = findChestNear(dim, fpos) || st.chest;
    if (chestF) moveOutputsToChest(dim, fpos, chestF, st, flushPartials);
    // Safety clamp: ensure out never exceeds in
    try{ if (st && st.ledger){ for(const k of Object.keys(st.ledger)){ const rec=st.ledger[k]; if(rec && rec.out>rec.in) rec.out = rec.in; } } }catch{}
    topOffFuel(dim, fpos, st.queue.fuel);
    feedOre(dim, fpos, st.queue.ores, st, e);
  }catch{} }
}

// API for Butler to send items
globalThis.LABS_sendToSmelter = function(ownerName, itemId, amount){
  try{
    // find nearest smelter owned by ownerName across all dimensions
    const dims=[world.getDimension("overworld"), world.getDimension("nether"), world.getDimension("the_end")].filter(Boolean);
    let best=null, bd2=Infinity;
    for(const d of dims){
      const bots=d.getEntities({ type: "myname:smelter_bot" });
      for(const b of bots){ try{ const tags=b.getTags?.()||[]; const own=tags.find(t=>String(t).startsWith("labs_owner:")); if (!own || !own.endsWith(ownerName)) continue; const dx=b.location.x, dz=b.location.z; const d2=dx*dx+dz*dz; if(d2<bd2){ bd2=d2; best=b; } }catch{} }
    }
    if (!best) return false;
    const st=S_STATE.get(best.id) || { furnaces:[], chest:null, queue:{ores:{},fuel:{}}, next:0, ledger:{} };
    if (ORE_ITEMS.has(itemId)) addToQueue(st.queue, itemId, amount, st);
    else if (FUEL_ITEMS.has(itemId)) addToQueue(st.queue, itemId, amount, st);
    else return false;
    S_STATE.set(best.id, st);
    return true;
  }catch{ return false; }
};

try{
  world.afterEvents.entitySpawn.subscribe(ev=>{
    const e=ev.entity; if(!e || e.typeId!=="myname:smelter_bot") return;
    system.runTimeout(()=>{
      try{ e.nameTag = "Smelter Bot"; }catch{}
      const adj=findAdjacents(e);
      S_STATE.set(e.id, { furnaces: adj.furnaces, chest: adj.chest, queue:{ores:{},fuel:{}}, next: 0, ledger:{}, nextQuip: Date.now() + (4*60*1000) + Math.floor(Math.random()* (3*60*1000)) });
      // sing once on placement
      try{ const x=Math.floor(e.location.x), y=Math.floor(e.location.y), z=Math.floor(e.location.z); e.dimension.runCommandAsync(`playsound labs.smelter_song @a ${x} ${y} ${z} 1 1 0`).catch(()=>{}); }catch{}
    }, 10);
  });
} catch {}

const SMELTER_QUIPS = [
  "Too hot to handle, too tough to quit.",
  "I don’t sweat — I just leak style.",
  "Pouring bars like a lava DJ.",
  "Oil can? Nah, I drink molten.",
  "If it’s glowing, it’s going.",
  "Stack ‘em high, cool ‘em slow.",
  "Heatwave handshake — clang!",
  "Dance floor? Furnace floor.",
];

system.runInterval(()=>{
  for (const dim of [world.getDimension("overworld"), world.getDimension("nether"), world.getDimension("the_end")]){
    if (!dim) continue; const bots=dim.getEntities({type:"myname:smelter_bot"}); for(const b of bots){ try{ tickSmelter(b);
      const st=S_STATE.get(b.id); if(!st) continue; const now=Date.now();
      if (st.nextQuip && now>=st.nextQuip){
        // nearest player within ~16 blocks
        let who=null,bd2=999999; for(const p of world.getPlayers()){ if(p.dimension.id!==b.dimension.id) continue; const dx=p.location.x-b.location.x, dz=p.location.z-b.location.z; const d2=dx*dx+dz*dz; if(d2<bd2){bd2=d2; who=p;} }
        if (who && bd2<=256){ const line=SMELTER_QUIPS[Math.floor(Math.random()*SMELTER_QUIPS.length)]; try{ who.sendMessage(`Smelter Bot: ${line}`); }catch{} }
        st.nextQuip = now + (7*60*1000) + Math.floor(Math.random()* (5*60*1000)); S_STATE.set(b.id, st);
      }
    }catch{} }
  }
}, 40);

// Drop egg on death
try{
  world.afterEvents.entityDie.subscribe(ev=>{
    const e=ev.deadEntity; if(!e || e.typeId!=="myname:smelter_bot") return; try{ if (e.getTags?.()?.includes("labs_retrieved")) return; }catch{}
    try{ e.dimension.spawnItem(new ItemStack("myname:smelter_bot_spawn_egg",1), e.location); }catch{}
    S_STATE.delete(e.id);
  });
} catch {}
