import { world, system, ItemStack } from "@minecraft/server";

// Eugene encounters:
// 1) Near-lava gift (daily, ~1/50 per minute)
// 2) Overworld thoughtful chat (max 3/day, ~1/100 per 10 min)

try {
  const ROLL_INTERVAL_TICKS = 1200; // ~60s
  const CHANCE = 1 / 50; // 2%
  const CHAT_INTERVAL_TICKS = 12000; // ~10min
  const CHAT_CHANCE = 1 / 100; // 1%

  function yyyymmdd(){ try{ const d=new Date(); const y=d.getUTCFullYear(); const m=String(d.getUTCMonth()+1).padStart(2,'0'); const day=String(d.getUTCDate()).padStart(2,'0'); return `${y}${m}${day}`; }catch{ return ""; } }

  function isNearLava(dim, loc, r=6){
    const bx=Math.floor(loc.x), by=Math.floor(loc.y), bz=Math.floor(loc.z);
    for (let dy=-2; dy<=2; dy++) for (let dx=-r; dx<=r; dx++) for (let dz=-r; dz<=r; dz++){
      try{ const b=dim.getBlock({ x:bx+dx,y:by+dy,z:bz+dz }); if (b && String(b.typeId||"")==="minecraft:lava") return { x:bx+dx, y:by+dy, z:bz+dz }; }catch{}
    }
    return null;
  }

  function safeSummonPos(dim, base){
    for (const off of [ {x:2,z:0},{x:-2,z:0},{x:0,z:2},{x:0,z:-2},{x:2,z:2},{x:-2,z:-2} ]){
      const pos = { x: Math.floor(base.x+off.x), y: Math.floor(base.y), z: Math.floor(base.z+off.z) };
      try{ const b=dim.getBlock(pos); if (b && (String(b.typeId||"")==="minecraft:air" || String(b.typeId||"")==="minecraft:cave_air")) return pos; }catch{}
    }
    return { x: Math.floor(base.x+2), y: Math.floor(base.y), z: Math.floor(base.z) };
  }

  function runAwayAndDespawn(dim, eugene, from){
    try{
      if (!eugene) return;
      const base = eugene.location; const dir = { x: base.x - from.x, z: base.z - from.z };
      const mag = Math.max(0.01, Math.hypot(dir.x, dir.z)); const ux = dir.x/mag, uz = dir.z/mag;
      for (let t=0;t<40;t++) system.runTimeout(()=>{ try{ const cur=eugene.location; eugene.teleport({ x: cur.x + ux*0.9, y: cur.y, z: cur.z + uz*0.9 }, { dimension: dim, keepVelocity:false, checkForBlocks:false }); }catch{} }, t*2);
      system.runTimeout(()=>{ try{ eugene?.kill?.(); }catch{} }, 120);
    }catch{}
  }

  function runEugeneLava(p, lavaPos){
    try{
      const dim=p.dimension; if(!dim) return;
      const sPos = safeSummonPos(dim, p.location);
      let eugene=null; try{ eugene=dim.spawnEntity("minecraft:villager_v2", sPos); }catch{}
      try{ if (eugene){ eugene.nameTag="Eugene"; eugene.addTag?.("labs_eugene_temp"); } }catch{}
      try{ p.sendMessage("Villager: Hi there I'm Eugene!"); }catch{}
      system.runTimeout(()=>{
        try{
          let lv=lavaPos; if (!lv) lv=isNearLava(dim, p.location, 10);
          const base = lv || { x: Math.floor(p.location.x), y: Math.floor(p.location.y), z: Math.floor(p.location.z) };
          const cPos = { x: base.x+0.5, y: base.y+2, z: base.z+0.5 };
          let ck=null; try{ ck=dim.spawnEntity("minecraft:chicken", cPos); }catch{}
          for(let i=0;i<6;i++) system.runTimeout(()=>{ try{ if (ck) ck.teleport({ x: base.x+0.5, y: ck.location.y-0.2, z: base.z+0.5 }, { dimension: dim, keepVelocity:false, checkForBlocks:false }); }catch{} }, i*2);
          system.runTimeout(()=>{ try{ ck?.kill?.(); }catch{} }, 40);
        }catch{}
      }, 20);
      system.runTimeout(()=>{ try{ const inv=p.getComponent("inventory")?.container; const item=new ItemStack("myname:hot_lava_chicken",1); const leftover=inv?.addItem?.(item); if(leftover) dim.spawnItem(leftover, p.location); }catch{} }, 30);
      system.runTimeout(()=>{ try{ p.sendMessage("Villager: Enjoy friend, I've gotta find my way home now"); }catch{} }, 40);
      system.runTimeout(()=>{ runAwayAndDespawn(dim, eugene, p.location); }, 50);
    }catch{}
  }

  const THOUGHTS = [
    "The Overworld hums—listen and it hums back.",
    "Cows teach patience; bees teach distance.",
    "Every sunrise is a new recipe for courage.",
    "Creepers only sneak because silence is their music.",
    "Sheep wear the clouds so we can dream lower.",
    "Pigs remember every carrot; we should remember every kindness.",
    "The forest breathes in leaves and sighs in shade.",
    "When rain taps the river, the fish count the beats.",
    "Villagers trade what they have; golems give what they are.",
    "Mountains are slow thunder with stone voices.",
    "Torches don’t chase darkness; they invite light.",
    "The best paths are made by feet and forgiven by grass.",
    "If you get lost, ask the moon; it never forgets return trips.",
    "Wolves follow hearts, not maps.",
    "A farm is a promise you water daily.",
    "The End is far; the Overworld is near; both fit inside a breath.",
    "Squids write poems in ink we can’t read.",
    "Bamboo is time measured in green.",
    "Every village is a story you enter mid-chapter.",
    "Rest when the sun rests; build when the stars applaud."
  ];

  function runEugeneTalk(p){
    try{
      if (String(p?.dimension?.id||"")!=="minecraft:overworld") return;
      const dim=p.dimension; const sPos=safeSummonPos(dim,p.location);
      let eugene=null; try{ eugene=dim.spawnEntity("minecraft:villager_v2", sPos);}catch{}
      try{ if(eugene){ eugene.nameTag="Eugene"; eugene.addTag?.("labs_eugene_temp"); } }catch{}
      try{ p.sendMessage("Villager: Hi there I'm Eugene!"); }catch{}
      const line = THOUGHTS[Math.floor(Math.random()*THOUGHTS.length)];
      system.runTimeout(()=>{ try{ p.sendMessage(`Eugene: ${line}`); try{ globalThis.LABS_EUGENE_addNote?.(p, line); }catch{} }catch{} }, 10);
      system.runTimeout(()=>{ try{ p.sendMessage("Eugene: Look at the time, I gotta get home, BYE!"); }catch{} }, 60);
      system.runTimeout(()=>{ runAwayAndDespawn(dim, eugene, p.location); }, 70);
    }catch{}
  }

  // Lava encounter loop (daily)
  system.runInterval(()=>{
    try{
      const today=yyyymmdd();
      for(const p of world.getPlayers()){
        const dim=p?.dimension; if(!dim) continue;
        const lava=isNearLava(dim, p.location, 6); if(!lava) continue;
        let had=false; try{ had=(p.getTags?.()||[]).some(t=>String(t).startsWith("labs_eugene_") && t.endsWith(today)); }catch{}
        if(had) continue;
        if(Math.random()<CHANCE){ try{ const prev=(p.getTags?.()||[]).find(t=>String(t).startsWith("labs_eugene_")); if(prev) p.removeTag?.(prev);}catch{} try{ p.addTag?.(`labs_eugene_${today}`);}catch{} runEugeneLava(p,lava); }
      }
    }catch{}
  }, ROLL_INTERVAL_TICKS);

  // Overworld thoughtful loop (max 3/day/player)
  system.runInterval(()=>{
    try{
      const today=yyyymmdd();
      for(const p of world.getPlayers()){
        if(String(p?.dimension?.id||"")!=="minecraft:overworld") continue;
        const tags=p.getTags?.()||[]; const prefix=`labs_eugene_chat_${today}_`;
        const used=tags.filter(t=>String(t).startsWith(prefix)).length; if(used>=3) continue;
        if(Math.random()<CHAT_CHANCE){ try{ p.addTag?.(`${prefix}${used+1}`);}catch{} runEugeneTalk(p); }
      }
    }catch{}
  }, CHAT_INTERVAL_TICKS);

  // OP triggers and chat commands (admin only)
  try{ globalThis.LABS_startEugeneLava = (pl)=>{ try{ const dim=pl?.dimension; const lava=isNearLava(dim, pl.location, 10); runEugeneLava(pl,lava); return true; }catch{ return false; } }; }catch{}
  try{ globalThis.LABS_startEugeneTalk = (pl)=>{ try{ runEugeneTalk(pl); return true; }catch{ return false; } }; }catch{}

  try{
    world.beforeEvents.chatSend.subscribe(ev=>{
      const msg=String(ev.message||"").trim().toLowerCase();
      if(msg==="!eugene lava"||msg==="!eugene talk"){ try{ if(!ev.sender?.hasTag||!ev.sender.hasTag("labs_admin")) return; }catch{ return; } ev.cancel=true; try{ if(msg.endsWith("lava")) globalThis.LABS_startEugeneLava?.(ev.sender); else globalThis.LABS_startEugeneTalk?.(ev.sender);}catch{} }
    });
  }catch{}

} catch {}
