import { world, system, ItemStack } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
try { console.warn?.("[LABS] chef_bot.js loaded"); } catch {}

// Simple Chef Bot: scans nearby chests/barrels and offers craftable/cookable foods.
// On spawn, places a chest on one side and a furnace on the other.

const CHEF_STATE = new Map(); // entityId -> { chest?: {x,y,z}, furnace?: {x,y,z}, owner?: string }

function toBlk(v){ return { x: Math.floor(v.x), y: Math.floor(v.y), z: Math.floor(v.z) }; }
function faceNearestPlayer(e){
  let best=null,bd2=999999, near=null; try{
    for(const p of world.getPlayers()){ if(p.dimension?.id!==e.dimension?.id) continue; const dx=p.location.x-e.location.x, dz=p.location.z-e.location.z; const d2=dx*dx+dz*dz; if(d2<bd2){ bd2=d2; near=p; } }
    if(near){ try{ const r=near.getRotation?.(); if(r&&typeof r.y==='number') e.setRotation?.({x:0,y:r.y}); }catch{} }
  }catch{}
  return near;
}

function placeChestAndFurnace(e){
  const dim=e.dimension; const base=toBlk(e.location);
  const spots=[{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}];
  let chestPos=null, furnacePos=null;
  try{
    // pick first empty for chest
    for(const s of spots){ const p={x:base.x+s.x,y:base.y,z:base.z+s.z}; try{ const b=dim.getBlock(p); if (!b || String(b.typeId||"")!=="minecraft:air") continue; dim.getBlock(p)?.setType("minecraft:chest"); chestPos=p; break; }catch{} }
    // pick opposite side for furnace if available
    if (chestPos){ const opp={x:base.x-(chestPos.x-base.x), y:base.y, z:base.z-(chestPos.z-base.z)}; try{ const b=dim.getBlock(opp); if (b && String(b.typeId||"")!=="minecraft:air"){ // try another
        for(const s of spots){ const p={x:base.x+s.x,y:base.y,z:base.z+s.z}; if (chestPos && p.x===chestPos.x && p.z===chestPos.z) continue; const bb=dim.getBlock(p); if (!bb || String(bb.typeId||"")!=="minecraft:air") continue; dim.getBlock(p)?.setType("minecraft:furnace"); furnacePos=p; break; }
      } else { dim.getBlock(opp)?.setType("minecraft:furnace"); furnacePos=opp; } }catch{}
    }
  }catch{}
  const st = CHEF_STATE.get(e.id)||{}; st.chest=chestPos||st.chest; st.furnace=furnacePos||st.furnace; CHEF_STATE.set(e.id, st);
}

function getNearbyContainers(e, radius=5){
  const dim=e.dimension; const base=toBlk(e.location); const found=[];
  try{
    for(let dx=-radius; dx<=radius; dx++) for(let dz=-radius; dz<=radius; dz++) for(let dy=-4; dy<=4; dy++){
      try{
        const b=dim.getBlock({x:base.x+dx,y:base.y+dy,z:base.z+dz}); if(!b) continue; const id=String(b.typeId||"");
        if (id==="minecraft:chest" || id==="minecraft:barrel"){ const cont=b.getComponent("minecraft:inventory")?.container; if (cont) found.push(cont); }
      }catch{}
    }
  }catch{}
  return found;
}

function norm(id){
  try{
    let s=String(id||"").toLowerCase();
    s=s.replace(/^item[.:]/,'');
    if (!s.includes(":")) s = `minecraft:${s}`;
    return s;
  }catch{ return String(id||""); }
}
function countFromContainers(conts){ const map={}; try{ for(const c of conts){ for(let i=0;i<c.size;i++){ const it=c.getItem(i); if(!it) continue; const id=norm(it.typeId); map[id]=(map[id]||0)+(it.amount||0); } } }catch{} return map; }
function removeFromContainers(conts, needMap){
  // needMap: { itemId: totalNeeded } (keys expected normalized like 'minecraft:...')
  const left = Object.fromEntries(Object.entries(needMap||{}).map(([k,v])=>[norm(k), Math.max(0, v|0)]));
  try{
    for (const [wantId] of Object.entries(left)){
      let remain = left[wantId]|0; if (remain<=0) continue;
      for (const c of conts){ if (remain<=0) break; for (let i=0;i<c.size && remain>0;i++){ try{ const it=c.getItem(i); const iid=norm(it?.typeId); if (!it || iid!==wantId) continue; const take=Math.min(remain, it.amount|0); it.amount -= take; remain -= take; c.setItem(i, it.amount>0?it:undefined); }catch{} } }
      left[wantId]=remain;
    }
  }catch{}
  return left; // returns leftovers not removed (0 means fully removed)
}

function pretty(id){ try{ const s=String(id||"").replace(/^item\./,""), core=s.split(":").pop(); if (s==="myname:fly_high_shroom") return "Fly High Shroom"; if (s==="myname:zoom_shroom") return "Zoom Shroom"; return core.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase()); }catch{ return String(id||""); } }

// Minimal recipe set: base foods + a few BoB foods. Extend easily by adding entries.
// Each entry: { type:'craft'|'cook', out:'id', outCount: n, requires: { id: count, ... } }
const RECIPES = [
  // Vanilla crafts
  { type:'craft', out:'minecraft:bread', outCount:1, requires: { 'minecraft:wheat':3 } },
  { type:'craft', out:'minecraft:pumpkin_pie', outCount:1, requires: { 'minecraft:pumpkin':1, 'minecraft:egg':1, 'minecraft:sugar':1 } },
  { type:'craft', out:'minecraft:cookie', outCount:8, requires: { 'minecraft:wheat':2, 'minecraft:cocoa_beans':1 } },
  { type:'craft', out:'minecraft:beetroot_soup', outCount:1, requires: { 'minecraft:beetroot':6, 'minecraft:bowl':1 } },
  { type:'craft', out:'minecraft:mushroom_stew', outCount:1, requires: { 'minecraft:red_mushroom':1, 'minecraft:brown_mushroom':1, 'minecraft:bowl':1 } },
  // Simple cooking (simulate furnace)
  { type:'cook', out:'minecraft:cooked_beef', outCount:1, requires: { 'minecraft:beef':1 } },
  { type:'cook', out:'minecraft:cooked_porkchop', outCount:1, requires: { 'minecraft:porkchop':1 } },
  { type:'cook', out:'minecraft:cooked_mutton', outCount:1, requires: { 'minecraft:mutton':1 } },
  { type:'cook', out:'minecraft:cooked_chicken', outCount:1, requires: { 'minecraft:chicken':1 } },
  { type:'cook', out:'minecraft:cooked_salmon', outCount:1, requires: { 'minecraft:salmon':1 } },
  { type:'cook', out:'minecraft:cooked_cod', outCount:1, requires: { 'minecraft:cod':1 } },
  { type:'cook', out:'minecraft:baked_potato', outCount:1, requires: { 'minecraft:potato':1 } },
  { type:'cook', out:'minecraft:dried_kelp', outCount:1, requires: { 'minecraft:kelp':1 } },
  // BoB examples (auto-hidden when Better on Bedrock items are not present)
  { type:'cook', out:'better_on_bedrock:fried_egg', outCount:1, requires: { 'minecraft:egg':1 } },
  { type:'craft', out:'better_on_bedrock:salad', outCount:1, requires: { 'better_on_bedrock:eggplant_food':1, 'better_on_bedrock:tomato_seed':1, 'better_on_bedrock:gabage_leaves':1, 'minecraft:bowl':1 } },
  { type:'craft', out:'better_on_bedrock:beef_burger', outCount:2, requires: { 'minecraft:bread':2, 'better_on_bedrock:gabage_leaves':1, 'better_on_bedrock:beef_patty':1, 'better_on_bedrock:onion_seed':1 } },
  { type:'craft', out:'better_on_bedrock:dough', outCount:1, requires: { 'minecraft:milk_bucket':1, 'minecraft:sugar':1, 'minecraft:wheat':1 } },
];

function maxCraftable(entry, have){
  let m = Infinity;
  for (const [id, need] of Object.entries(entry.requires||{})){
    const haveN = Math.max(0, have[id]||0);
    m = Math.min(m, Math.floor(haveN / Math.max(1, need)));
  }
  if (!Number.isFinite(m)) m=0; return Math.max(0, m);
}

function itemAvailable(id){ try { const t=new ItemStack(id,1); return !!t && !!t.typeId; } catch { return false; } }

function addToInventoryOrDrop(player, itemId, amount){
  if (!itemAvailable(itemId)) return; // do not attempt to give unknown items
  let left = amount|0;
  try{
    const inv = player.getComponent("inventory")?.container; if (!inv) throw 0;
    const stackMax = new ItemStack(itemId, 1).maxAmount || 64;
    while(left>0){ const put=Math.min(stackMax,left); const leftover = inv.addItem?.(new ItemStack(itemId, put)); if (leftover){ left = put; break; } left -= put; }
  }catch{}
  if (left>0){ try{ player.dimension.spawnItem(new ItemStack(itemId, left), player.location); }catch{} }
}

function getRequiredIds(){ try{ const s=new Set(); for(const r of RECIPES){ for(const k of Object.keys(r.requires||{})) s.add(norm(k)); } return s; }catch{ return new Set(); } }
function getBuffer(e){ const st=CHEF_STATE.get(e.id)||{}; if(!st.buffer) st.buffer={}; CHEF_STATE.set(e.id, st); return st.buffer; }
function addToBuffer(e, id, amt){ const buf=getBuffer(e); const k=norm(id); buf[k]=(buf[k]||0)+Math.max(0,amt|0); }
function takeFromBuffer(e, id, amt){ const buf=getBuffer(e); const k=norm(id); const cur=buf[k]||0; const take=Math.min(cur, Math.max(0,amt|0)); buf[k]=cur-take; if(buf[k]<=0) delete buf[k]; return take; }
function bufferCount(e){ const buf=getBuffer(e); const out={}; for(const k of Object.keys(buf)){ out[k]=buf[k]|0; } return out; }
function maxCraftableFromBuffer(entry, counts){ let m=Infinity; for(const [id,need] of Object.entries(entry.requires||{})){ const have=counts[norm(id)]||0; m=Math.min(m, Math.floor(have/Math.max(1,need))); } return Number.isFinite(m)?Math.max(0,m):0; }

function loadIngredientsToBuffer(e, player){
  try{
    const conts = getNearbyContainers(e);
    if (!conts.length){ player?.sendMessage?.("No chest/barrel nearby for ingredients."); return; }
    const want = getRequiredIds(); if(!want.size){ player?.sendMessage?.("No recipes configured."); return; }
    let moved = 0; const pulled={};
    for(const c of conts){
      for(let i=0;i<c.size;i++){
        try{
          const it=c.getItem(i); if(!it) continue; const id=norm(it.typeId); if(!want.has(id)) continue; const amt=it.amount|0; if(amt<=0) continue;
          addToBuffer(e, id, amt); moved+=amt; pulled[id]=(pulled[id]||0)+amt; c.setItem(i, undefined);
        }catch{}
      }
    }
    if (!moved){ player?.sendMessage?.("Loaded 0 items (no recipe ingredients found)."); return; }
    const top = Object.entries(pulled).slice(0,8).map(([k,v])=>`${pretty(k)} x${v}`).join(', ');
    player?.sendMessage?.(`Loaded ${moved} item(s) into Chef buffer.${top?` (${top})`:''}`);
  }catch{}
}

function craftFromBuffer(e, player){
  try{
    const counts = bufferCount(e);
    const entries=[];
    for(const r of RECIPES){
      // Only show if output + all required items exist and buffer has at least one craft
      let ok=itemAvailable(r.out); if(ok){ for(const k of Object.keys(r.requires||{})){ if(!itemAvailable(k)){ ok=false; break; } } }
      if(!ok) continue; const maxN=maxCraftableFromBuffer(r, counts); if(maxN>0){ entries.push({r, maxN}); }
    }
    if(!entries.length){ player?.sendMessage?.("Buffer is empty or insufficient for any recipe. Use 'Load Ingredients' first."); return; }
    const labels = entries.map(en=> `${pretty(en.r.out)} x${en.r.outCount} (max ${en.maxN})`);
    const pick=new ModalFormData().title("Chef: Craft From Buffer").dropdown("Recipe", labels, 0);
    pick.show(player).then(res=>{
      if(!res||res.canceled){ returnLeftovers(e, player); return; }
      const idx=Number(res.formValues?.[0]||0)|0; const en=entries[idx]; if(!en){ returnLeftovers(e, player); return; }
      const qtyForm=new ModalFormData().title(`Make ${pretty(en.r.out)}`).slider("Quantity", 1, en.maxN, 1, Math.min(16,en.maxN));
      qtyForm.show(player).then(fr=>{
        if(!fr||fr.canceled){ returnLeftovers(e, player); return; }
        const qty=Math.max(1, Math.floor(Number(fr.formValues?.[0]||1)));
        // Remove from buffer
        for(const [id,need] of Object.entries(en.r.requires||{})){
          const want=need*qty; const got=takeFromBuffer(e, id, want); if(got<want){ player?.sendMessage?.("Not enough ingredients in buffer."); returnLeftovers(e, player); return; }
        }
        // Give outputs
        const giveAmt=(en.r.outCount||1)*qty; addToInventoryOrDrop(player, en.r.out, giveAmt);
        // Bucket returns accumulate into buffer
        try{ const milk=(en.r.requires||{})['minecraft:milk_bucket']|0; if(milk>0){ addToBuffer(e, 'minecraft:bucket', milk*qty); } }catch{}
        player?.sendMessage?.(`Made ${giveAmt} ${pretty(en.r.out)} from buffer.`);
        // Auto-return leftovers after craft
        returnLeftovers(e, player);
      }).catch(()=>{ try{ returnLeftovers(e, player); }catch{} });
    }).catch(()=>{ try{ returnLeftovers(e, player); }catch{} });
  }catch{}
}

function returnLeftovers(e, player){
  try{
    const buf=getBuffer(e); const conts=getNearbyContainers(e);
    const push=(id,amt)=>{
      let left=amt|0; for(const c of conts){ if(left<=0) break; for(let i=0;i<c.size && left>0;i++){ const it=c.getItem(i); if(it && norm(it.typeId)===norm(id) && it.amount<it.maxAmount){ const can=Math.min(left, it.maxAmount-it.amount); it.amount+=can; c.setItem(i,it); left-=can; } } for(let i=0;i<c.size && left>0;i++){ const it=c.getItem(i); if(!it){ const put=Math.min(left,new ItemStack(id,1).maxAmount||64); c.setItem(i,new ItemStack(id,put)); left-=put; } }
      }
      if(left>0){ e.dimension.spawnItem(new ItemStack(id,left), e.location); }
    };
    const entries=Object.entries(buf); if(!entries.length){ player?.sendMessage?.("Nothing to return."); return; }
    let total=0; for(const [id,amt] of entries){ push(id, amt|0); total+=(amt|0); }
    // clear buffer
    CHEF_STATE.set(e.id, { ...(CHEF_STATE.get(e.id)||{}), buffer:{} });
    player?.sendMessage?.(`Returned ${total} item(s) from buffer to chests.`);
  }catch{}
}

function openChefMenu(e, player){
  const af=new ActionFormData().title("Chef Bot").body("Choose an action:")
    .button("Load Ingredients")
    .button("Craft From Buffer")
    .button("Return Leftovers")
    .button("Close");
  af.show(player).then(res=>{
    if(!res||res.canceled) return; const sel=res.selection|0;
    if(sel===0) loadIngredientsToBuffer(e, player);
    else if(sel===1) craftFromBuffer(e, player);
    else if(sel===2) returnLeftovers(e, player);
  }).catch(()=>{});
}

function openChefForEntity(e, player){ try{ loadIngredientsToBuffer(e, player); craftFromBuffer(e, player); }catch{} }


// Global open (stick menu hook)
try{
  globalThis.LABS_openChefMenu = function(player){
    try{
      const p=player; const dim=p.dimension;
      let best=null, bestD2=Number.POSITIVE_INFINITY;
      for(const e of dim.getEntities({type:"myname:chef_bot"})){
        const dx=e.location.x-p.location.x, dy=e.location.y-p.location.y, dz=e.location.z-p.location.z;
        const d2=dx*dx+dy*dy+dz*dz; if(d2<bestD2){ bestD2=d2; best=e; }
      }
      // Require within 5 blocks (3D)
      if(!best || bestD2 > 25){ try{ p.sendMessage("You must be within 5 blocks of a Chef Bot to use it."); }catch{} return; }
      system.runTimeout(()=>openChefForEntity(best, p), 0);
    }catch{}
  }
} catch {}

// On spawn: face player, set name, tag owner, place chest+furnace
try{
  world.afterEvents.entitySpawn.subscribe(ev=>{
    const e=ev.entity; if (!e || e.typeId!=="myname:chef_bot") return;
    system.runTimeout(()=>{
      try{ const near = faceNearestPlayer(e); if (near){ try{ e.nameTag = `Chef Bot (${near.name})`; }catch{} try{ e.addTag?.(`labs_owner:${near.name}`); }catch{} CHEF_STATE.set(e.id, { ...(CHEF_STATE.get(e.id)||{}), owner: near.name }); } }catch{}
      placeChestAndFurnace(e);
      // Starter supplies: 64 bowls + 16 empty buckets into the spawned chest (or drop nearby)
      try{
        const st = CHEF_STATE.get(e.id)||{}; const pos = st.chest; if (pos){
          const cont = e.dimension.getBlock(pos)?.getComponent("minecraft:inventory")?.container;
          if (cont){
            const push = (id, amt)=>{
              try{
                // merge into existing stacks
                for (let i=0;i<cont.size && amt>0;i++){ const it=cont.getItem(i); if (it && it.typeId===id && it.amount<it.maxAmount){ const can=Math.min(amt, it.maxAmount-it.amount); it.amount+=can; cont.setItem(i,it); amt-=can; } }
                // place into empty slots
                for (let i=0;i<cont.size && amt>0;i++){ const it=cont.getItem(i); if (!it){ const stackMax=new ItemStack(id,1).maxAmount||64; const put=Math.min(amt, stackMax); cont.setItem(i, new ItemStack(id, put)); amt-=put; } }
                // drop leftovers if any
                if (amt>0){ e.dimension.spawnItem(new ItemStack(id, amt), { x: pos.x+0.5, y: pos.y+1, z: pos.z+0.5 }); }
              }catch{}
            };
            push("minecraft:bowl", 64);
            push("minecraft:bucket", 16);
          }
        }
      }catch{}
      // Play Chef song on spawn (3:40)
      try{ const x=Math.floor(e.location.x), y=Math.floor(e.location.y), z=Math.floor(e.location.z); e.dimension.runCommandAsync(`playsound labs.chef_song @a ${x} ${y} ${z} 1 1 0`).catch(()=>{}); }catch{}
    }, 10);
  });
} catch {}
