import { world, system, ItemStack } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";

// Butler behavior: follows owner, defends, picks up items, stores up to 64 slots, quips every ~10 min.
const B_STATE = new Map(); // id -> { owner?:string, inv: Record<itemId, count>, started:number, nextFollow:number, nextAttack:number, nextPickup:number, nextQuip:number, songAt?:number }
const MAX_SLOTS = 64;
const PICKUP_RADIUS = 6;
const ATTACK_RADIUS = 6;

// Get configurable values
function getPickupRadius() {
  try {
    return globalThis.LABS_getInteractionRange ? globalThis.LABS_getInteractionRange() : PICKUP_RADIUS;
  } catch { return PICKUP_RADIUS; }
}

function getAttackRadius() {
  try {
    return globalThis.LABS_getInteractionRange ? globalThis.LABS_getInteractionRange() : ATTACK_RADIUS;
  } catch { return ATTACK_RADIUS; }
}

function getQuipFrequencyMultiplier() {
  try {
    return globalThis.LABS_getQuipFrequencyMultiplier ? globalThis.LABS_getQuipFrequencyMultiplier() : 1;
  } catch { return 1; }
}

function getPersonalityMode() {
  try {
    return globalThis.LABS_getPersonalityMode ? globalThis.LABS_getPersonalityMode() : "balanced";
  } catch { return "balanced"; }
}

const QUIPS = [
  "Well this is nice.",
  "Oh, should we take a selfie here?",
  "My my my, what's that smell?",
  "Next chance we get, can we buy a fresh can of oil?",
  "How do cows do it?",
  "Is that a lava chicken in your pocket or are you just happy to see me?",
  "I used to be a blender, but the smoothies were too vanilla.",
  "If we find diamonds, I’m calling dibs on a shiny bowtie.",
  "Does this biome make my gears look big?",
  "If you hear ticking, that's totally normal… probably.",
  "I walk, therefore I am… low on grease.",
  "Ah, the sweet smell of adventure and mild ozone.",
  "Is this a dungeon or just very poorly lit interior design?",
  "If we get lost, I blame your pathfinding, boss.",
  "I brought a spoon in case we find pudding caves.",
  "Have you tried turning the sun off and on again?",
  "This place needs a fern. Or twelve.",
  "I would mine, but my manicure is immaculate.",
  "Beware of chickens. They judge in silence.",
  "If we see a creeper, remind me not to hug it.",
  "These boots were made for walkin', and also for lava avoidance.",
  "I’m a lover, not a looter… okay maybe a little looter.",
  "Onward! Adventure awaits, naps optional.",
  "The hills are alive with the sound of pickaxes.",
  // New quips
  "Note to self: do not polish armor with honey.",
  "If skeletons had manners, they'd knock before shooting.",
  "My threat assessment says: avoid pointy green hugs.",
  "I packed snacks. Just kidding, I ate them. Also kidding, I can't.",
  "Boss, if I trip, it’s a tactical dive.",
  "If we find a village, remind me to practice small talk.",
  "My warranty doesn’t cover wither skulls.",
  "I prefer my magma cubes medium-rare.",
  "If lost, please return me to the nearest cake.",
  "Careful, that cave says 'ominous' in six languages.",
  "Every day is leg day when you don’t have wheels.",
  "That zombie’s skincare routine needs work.",
  "Creeper etiquette tip: no surprises.",
  "Some say I’m clingy; I say I’m loyal.",
  "I bring class to glass panes.",
  "Sprinting? I call it enthusiastic gliding.",
  "We should start a collection: rare rocks and rarer stories.",
  "Adventure fuel at 73%. Recommend more drama.",
  "If you hear me humming, it's a battle song. Probably.",
  // Extra quips
  "Reminder: tea time is whenever we find tea.",
  "I'd hold your stuff, but then who would do the banter?",
  "If we find goats, I'm negotiating for a tiny top hat.",
  "This biome screams 'throw pillows.'",
  "Adventure checklist: snacks, torches, plausible deniability.",
  "Creepers explode; I compose.",
  "If I had knees, they'd be knocking.",
  "Stronghold? I prefer medium-hold.",
  "Nether forecast: 100% chance of drama.",
  "If we meet a witch, be polite; she has splashables.",
  "Warning: sarcasm module at 87%.",
  "My pathfinding is perfect. The world is merely wrong.",
  "Villagers respect me. I speak fluent 'Hrrrm.'",
  "If you place a bell, I'm ringing it. It's the law.",
  "I don't run; I majestically accelerate.",
  "Torch economy booming; darkness in recession.",
  "I would write a memoir, but I keep respawning.",
  "Is our inventory a museum or a disaster?",
  "Beds are for skipping nights and making statements.",
  "If we die, I call dibs on haunting the anvil.",
  "Note: Lava is not soup, despite appearances.",
  "If lost, follow the trail of my good intentions.",
  // Even more quips
  "Consider this a hike with benefits.",
  "My blade is polished, my wit even sharper.",
  "Caution: pockets may be deeper than they appear.",
  "If we sprint, I request dramatic music.",
  "Parkour? I prefer par-class.",
  "Put a flower in my off-hand; I fight better when fashionable.",
  "If we meet a goat, no headbutting. That's my job.",
  "Your leadership style? Chaotic benevolence.",
  "I can neither confirm nor deny I stole that cookie.",
  "Today I learned: lava is faster than me.",
  "If the map says 'Here be dragons,' let's bring snacks.",
  "I wrote a haiku: Creeper sneaks up close / I whisper 'no thank you' / We relocate now.",
  "If you see me waving, it's tactical semaphore.",
  "Boss, your backpack is a TARDIS and I'm impressed.",
  "Inventory Tetris is my love language.",
  "I named this torch Gregory. Be nice to Gregory.",
  "We could settle here. I call the corner with the view.",
  "When in doubt, pillar out.",
  "I don't panic. I strategically enthuse.",
  "If bravery had a flavor, it would be cake."
];

function toBlk(v){ return { x: Math.floor(v.x), y: Math.floor(v.y), z: Math.floor(v.z) }; }
function dist2(a,b){ const dx=a.x-b.x, dy=(a.y||0)-(b.y||0), dz=a.z-b.z; return dx*dx+dy*dy+dz*dz; }
function nearestOwner(e){
  let who=null,best=999999; const tags=e.getTags?.()||[]; let ownerName=""; for(const t of tags){ if(String(t).startsWith("labs_owner:")){ ownerName=String(t).slice("labs_owner:".length); break; } }
  if (ownerName){ for(const p of world.getPlayers()){ try{ if(p.name!==ownerName) continue; if(p.dimension.id!==e.dimension.id) continue; const d2=dist2(p.location,e.location); if(d2<best){best=d2; who=p;} }catch{} }
    if (!who){ // owner in other dimension
      for(const p of world.getPlayers()){ if(p.name===ownerName){ who=p; break; } }
    }
  } else {
    // fallback: nearest player
    for(const p of world.getPlayers()){ try{ if(p.dimension.id!==e.dimension.id) continue; const d2=dist2(p.location,e.location); if(d2<best){best=d2; who=p;} }catch{} }
  }
  return who;
}

function usedSlots(inv){ let slots=0; for(const id of Object.keys(inv)){ const c=inv[id]; const stackMax=new ItemStack(id,1).maxAmount||64; slots += Math.ceil(Math.max(0,c)/stackMax); } return slots; }
function addToInv(inv, itemId, amount){ const cur=inv[itemId]||0; inv[itemId]=cur+amount; return inv; }

function canPickup(inv, itemId, amount){
  // simulate adding and check slot usage <= MAX_SLOTS
  const tmp={...inv}; addToInv(tmp, itemId, amount);
  return usedSlots(tmp) <= MAX_SLOTS;
}

function pickupNearby(e){
  const st=B_STATE.get(e.id)||{}; const now=Date.now(); if(st.nextPickup && now<st.nextPickup){ B_STATE.set(e.id, st); return; }
  st.nextPickup=now+1500; // ~1.5s
  const dim=e.dimension; st.inv = st.inv || {}; // retain structure but we will not use it for non-smeltables
  try{
    const items=dim.getEntities({ type: "item" });
    for(const it of items){
      try{
        // within 6 blocks horizontally and 2 vertically
        const dx=it.location.x-e.location.x, dy=(it.location.y-e.location.y), dz=it.location.z-e.location.z;
        const pickupRadius = getPickupRadius();
        if (Math.abs(dx)>pickupRadius || Math.abs(dz)>pickupRadius || Math.abs(dy)>2) continue;
        const comp=it.getComponent?.("minecraft:item");
        const stack=comp?.itemStack;
        const id=String(stack?.typeId||""); const amt=Math.max(1, Math.floor(Number(stack?.amount||1)));
        if (!id) continue;
        // Only act on ores/fuels/smelter inputs; ignore all other items (tools, books, weapons, etc.)
        const owner = st.owner || nearestOwner(e)?.name;
        const canRoute = (globalThis.LABS_sendToSmelter && (id.startsWith("minecraft:raw_")||id.includes("_ore")||id==="minecraft:ancient_debris"||id==="minecraft:sand"||id==="minecraft:red_sand"||id==="minecraft:coal"||id==="minecraft:charcoal"||id==="minecraft:coal_block"||id==="minecraft:dried_kelp_block"));
        if (!canRoute) continue; // ignore non-smeltables entirely
        if (owner && canRoute){
          try{
            const ok = globalThis.LABS_sendToSmelter(owner, id, amt);
            if (ok){ try{ it.kill?.(); }catch{}; continue; }
          }catch{}
        }
        // If routing failed or no smelter available, leave the item on the ground (do not pick up)
      }catch{}
    }
  }catch{}
  B_STATE.set(e.id, st);
}

function defendOwner(e){
  const st=B_STATE.get(e.id)||{}; const now=Date.now(); if(st.nextAttack && now<st.nextAttack){ B_STATE.set(e.id, st); return; }
  st.nextAttack=now+500; // faster cadence
  const owner=nearestOwner(e); if(!owner){ B_STATE.set(e.id, st); return; }
  const dim=e.dimension; const hostiles = dim.getEntities({});
  let target=null,best=999999;
  for(const a of hostiles){
    try{
      if (!a || a.id===e.id) continue;
      const tid=String(a.typeId||"");
      // Only consider vanilla hostiles; never target addon entities or passives
      if (!tid.startsWith("minecraft:")) continue;
      // crude hostile allowlist
      const hostile = ["zombie","skeleton","spider","creeper","witch","pillager","vindicator","ravager","guardian","elder_guardian","drowned","husk","stray","zoglin","hoglin","evoker","vex","phantom","wither_skeleton","slime","magma_cube","zombie_villager","warden","blaze","ghast","enderman","endermite","shulker"].some(b=>tid.includes(b));
      if (!hostile) continue;
      const d2=dist2(a.location, owner.location); 
      const attackRadius = getAttackRadius();
      if (d2>attackRadius*attackRadius) continue;
      // prefer creepers
      if (!target || tid.includes("creeper")) { if (d2<best){ best=d2; target=a; } }
      else if (d2<best){ best=d2; target=a; }
    }catch{}
  }
  if (target){
    try{
      // approach target like a golem
      const dx=target.location.x - e.location.x;
      const dz=target.location.z - e.location.z;
      const dist=Math.sqrt(dx*dx+dz*dz)||0.001;
      if (dist>2.2){
        const step=2.0;
        const nx = e.location.x + (dx/dist)*step;
        const nz = e.location.z + (dz/dist)*step;
        const gy = findGroundY(dim, Math.floor(nx), Math.floor(e.location.y), Math.floor(nz));
        e.teleport({ x:nx, y:gy, z:nz }, { dimension: dim, checkForBlocks:true });
      }
      // attack: damage + knockback away from owner
      try{ target.applyDamage?.(8, { cause: "entity_attack" }); }catch{}
      try{ const ox = target.location.x - owner.location.x; const oz = target.location.z - owner.location.z; const mag = Math.max(0.01, Math.hypot(ox, oz)); target.applyKnockback?.(ox/mag, oz/mag, 0.8, 0.3); }catch{}
      try{ const x=Math.floor(target.location.x), y=Math.floor(target.location.y), z=Math.floor(target.location.z); dim.runCommandAsync?.(`damage @e[x=${x},y=${y},z=${z},r=1,c=1] 6 entity_attack`); }catch{}
    }catch{}
  }
  B_STATE.set(e.id, st);
}

function followOwner(e){
  const st=B_STATE.get(e.id)||{}; const now=Date.now(); if(st.nextFollow && now<st.nextFollow){ B_STATE.set(e.id, st); return; }
  st.nextFollow=now+800; // ~0.8s
  const owner=nearestOwner(e); if(!owner){ B_STATE.set(e.id, st); return; }
  st.owner = owner.name;
  // cross-dimension follow
  try{ if (owner.dimension.id!==e.dimension.id){ e.teleport(owner.location, { dimension: owner.dimension, checkForBlocks:true }); B_STATE.set(e.id, st); return; } }catch{}
  // keep 5-15 blocks away; avoid clipping
  try{
    const dx=owner.location.x-e.location.x, dz=owner.location.z-e.location.z; const d2=dx*dx+dz*dz;
    if (d2<25){ /* too close (<5 blocks) */ }
    else if (d2>225){ // >15 blocks: jump closer with safe offset
      const off = { x: (Math.random()<0.5?-1:1)*(3+Math.floor(Math.random()*3)), z: (Math.random()<0.5?-1:1)*(3+Math.floor(Math.random()*3)) };
      const pos={ x: owner.location.x + off.x + 0.5, y: owner.location.y + 0.5, z: owner.location.z + off.z + 0.5 };
      e.teleport(pos, { dimension: e.dimension, checkForBlocks:true });
    } else {
      // mid-range: gentle nudge
      const step=1.5; const len=Math.sqrt(d2)||1; const pos={ x: e.location.x + (dx/len)*step, y: e.location.y, z: e.location.z + (dz/len)*step };
      e.teleport(pos, { dimension: e.dimension, checkForBlocks:true });
    }
  }catch{}
  B_STATE.set(e.id, st);
}

function isInsideBlock(e){
  try{
    const dim=e.dimension; const p=toBlk(e.location);
    const bFeet=dim.getBlock({x:p.x,y:p.y,z:p.z}); const bHead=dim.getBlock({x:p.x,y:p.y+1,z:p.z});
    const bad=(b)=>{ const id=String(b?.typeId||""); return id && id!=='minecraft:air' && id!=='minecraft:water'; };
    return bad(bFeet) && bad(bHead);
  }catch{}
  return false;
}

function findGroundY(dim, x, y, z){
  try{
    for(let yy=Math.min(319, y+2); yy>=Math.max(-64, y-6); yy--){
      const below=dim.getBlock({x,y:yy-1,z}); const here=dim.getBlock({x,y:yy,z});
      const belowId=String(below?.typeId||""); const hereId=String(here?.typeId||"");
      if (hereId==='minecraft:air' && belowId && belowId!=='minecraft:air'){ return yy; }
    }
  }catch{}
  return y;
}

function rescueToOwner(e){
  try{
    const owner=nearestOwner(e); if(!owner) return;
    const dim=owner.dimension; const ox=Math.floor(owner.location.x), oz=Math.floor(owner.location.z);
    const offsets=[{x:2,z:0},{x:-2,z:0},{x:0,z:2},{x:0,z:-2},{x:3,z:0},{x:-3,z:0},{x:0,z:3},{x:0,z:-3}];
    let spot=null;
    for(const o of offsets){
      const gx=ox+o.x, gz=oz+o.z; const gy=findGroundY(dim, gx, Math.floor(owner.location.y), gz);
      try{ const here=dim.getBlock({x:gx,y:gy,z:gz}); const head=dim.getBlock({x:gx,y:gy+1,z:gz});
        const hid=String(here?.typeId||""), hid2=String(head?.typeId||"");
        if (hid==='minecraft:air' && hid2==='minecraft:air') { spot={x:gx+0.5,y:gy+0.01,z:gz+0.5}; break; }
      }catch{}
    }
    if(!spot){ spot={ x: owner.location.x+0.5, y: owner.location.y, z: owner.location.z+0.5 }; }
    e.teleport(spot, { dimension: dim, checkForBlocks:true, keepVelocity:false });
  }catch{}
}

function maybeQuip(e){
  const st=B_STATE.get(e.id)||{}; const now=Date.now(); if(st.nextQuip && now<st.nextQuip){ B_STATE.set(e.id, st); return; }
  
  // Apply personality mode and quip frequency
  const personalityMode = getPersonalityMode();
  const quipMultiplier = getQuipFrequencyMultiplier();
  
  // Skip quips in quiet mode
  if (personalityMode === "quiet") {
    st.nextQuip = now + 30*60*1000; // 30 minutes in quiet mode
    B_STATE.set(e.id, st);
    return;
  }
  
  // Calculate next quip time based on frequency multiplier
  const baseInterval = 10*60*1000; // 10 minutes base
  const adjustedInterval = Math.floor(baseInterval / quipMultiplier);
  st.nextQuip = now + adjustedInterval;
  
  const owner=nearestOwner(e); if(!owner){ B_STATE.set(e.id, st); return; }
  
  // In chatty mode, sometimes send multiple quips
  if (personalityMode === "chatty" && Math.random() < 0.3) {
    try{ owner.sendMessage(QUIPS[Math.floor(Math.random()*QUIPS.length)]); }catch{}
    setTimeout(() => {
      try{ owner.sendMessage(QUIPS[Math.floor(Math.random()*QUIPS.length)]); }catch{}
    }, 2000);
  } else {
    try{ owner.sendMessage(QUIPS[Math.floor(Math.random()*QUIPS.length)]); }catch{}
  }
  
  B_STATE.set(e.id, st);
}

function maybeSing(e){
  const st=B_STATE.get(e.id)||{}; const now=Date.now();
  if (st.songAt && now>=st.songAt){
    try{ const x=Math.floor(e.location.x), y=Math.floor(e.location.y), z=Math.floor(e.location.z); e.dimension.runCommandAsync(`playsound labs.butler_song @a ${x} ${y} ${z} 1 1 0`); }catch{}
    try{ const owner=nearestOwner(e); owner?.sendMessage?.("Your Butler hums a tune..."); }catch{}
    st.songAt = 0; B_STATE.set(e.id, st);
  }
}

function dropInventoryTo(playerOrDim, pos, inv){
  if (!inv) return;
  const dropOne=(id,amt)=>{ const stackMax=new ItemStack(id,1).maxAmount||64; let left=amt; while(left>0){ const put=Math.min(stackMax,left); try{ const is=new ItemStack(id,put); if (playerOrDim?.dimension){ playerOrDim.dimension.spawnItem(is,pos); } else { playerOrDim.spawnItem(is,pos); } }catch{} left-=put; } };
  try{ for(const id of Object.keys(inv)){ const c=Math.max(0,Math.floor(inv[id]||0)); if(c>0) dropOne(id,c); } }catch{}
}

function greet(e){
  try{ e.nameTag = `Butler Bot`; }catch{}
  const p=nearestOwner(e);
  if (p){ try{ p.sendMessage("At your service, boss."); }catch{} }
}

try{
  world.afterEvents.entitySpawn.subscribe(ev=>{
    const e=ev.entity; if(!e || e.typeId!=="myname:butler_bot") return;
    system.runTimeout(()=>{
      greet(e);
      B_STATE.set(e.id, { inv:{}, started: Date.now(), songAt: Date.now()+5*60*1000 });
    }, 10);
  });
} catch {}

// periodic behavior
system.runInterval(()=>{
  for(const dim of [world.getDimension("overworld"), world.getDimension("nether"), world.getDimension("the_end")]){
    if (!dim) continue; const bots=dim.getEntities({ type:"myname:butler_bot" });
    for(const b of bots){ try{ followOwner(b); defendOwner(b); pickupNearby(b); maybeQuip(b); maybeSing(b); }catch{} }
  }
}, 20);

// fast rescue loop: if stuck in solid block, snap next to owner at same height
system.runInterval(()=>{
  try{
    for(const dim of [world.getDimension("overworld"), world.getDimension("nether"), world.getDimension("the_end")]){
      if (!dim) continue; const bots=dim.getEntities({ type:"myname:butler_bot" });
      for(const b of bots){ try{ if (isInsideBlock(b)) rescueToOwner(b); }catch{} }
    }
  }catch{}
}, 3);

try{
  // On any hurt, attempt fast safety teleport with a small cooldown to avoid spam
  const HURT_COOLDOWN = new Map(); // id -> nextAllowedMs
  world.afterEvents.entityHurt.subscribe(ev=>{
    try{
      const e=ev.hurtEntity; if(!e || e.typeId!=="myname:butler_bot") return;
      const now = Date.now();
      const next = HURT_COOLDOWN.get(e.id)||0;
      // Always rescue if embedded in blocks
      if (isInsideBlock(e)) { rescueToOwner(e); HURT_COOLDOWN.set(e.id, now+1500); return; }
      // If damage likely from environment (no attacker), yank to owner with short cooldown
      const envHit = !ev.damagingEntity;
      const causeStr = String(ev.cause||"").toLowerCase();
      const badCause = envHit || causeStr.includes("suffocation") || causeStr.includes("lava") || causeStr.includes("fire") || causeStr.includes("contact") || causeStr.includes("drown") || causeStr.includes("block");
      if (badCause && now>=next){ rescueToOwner(e); HURT_COOLDOWN.set(e.id, now+1500); return; }
      // Health safeguard: if health < 40% and not on cooldown, rescue
      try{ const hc=e.getComponent?.("health"); const cur=Number(hc?.currentValue||0), max=Number(hc?.effectiveMax||hc?.value||0); if (max>0 && cur/max < 0.4 && now>=next){ rescueToOwner(e); HURT_COOLDOWN.set(e.id, now+1500); return; } }catch{}
    }catch{}
  });
} catch {}

try{
  world.afterEvents.entityDie.subscribe(ev=>{
    const e=ev.deadEntity; if(!e || e.typeId!=="myname:butler_bot") return;
    const st=B_STATE.get(e.id)||{}; B_STATE.delete(e.id);
    // Find owner to drop at their feet if possible
    let owner=null; try{ const tags=e.getTags?.()||[]; let on=""; for(const t of tags){ if(String(t).startsWith("labs_owner:")){ on=String(t).slice("labs_owner:".length); break; } } if (on){ owner=world.getPlayers().find(p=>p.name===on); } }catch{}
    const dropPos = owner ? owner.location : e.location;
    const where = owner ? owner : e.dimension;
    // Drop stored items
    try{ dropInventoryTo(where, dropPos, st.inv); }catch{}
    // If not retrieved via menu, still drop egg at death location
    try{ if (!e.getTags?.()?.includes("labs_retrieved")) (owner?owner.dimension:e.dimension).spawnItem(new ItemStack("myname:butler_bot_spawn_egg",1), dropPos); }catch{}
  });
} catch {}
