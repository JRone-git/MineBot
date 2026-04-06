import { world, system, ItemStack } from "@minecraft/server";

// Trash Bot: stationary junk disposer. Eats nearby items, plays a noteblock sound per item,
// spins cutely every 100 items, burps occasionally. Indestructible. (No campfire platform)

const T_STATE = new Map(); // id -> { base:{x,y,z}, eaten:number, next:number, spin?:{k:number, until:number}, lastSongAt?:number, songActive?:boolean }
const BOT_ID = "myname:trash_bot";
const RADIUS = 2.4;

function toBlk(v){ return { x: Math.floor(v.x), y: Math.floor(v.y), z: Math.floor(v.z) }; }

function placeBonfire(e){
  try{
    // No campfire or fire placement — keep current ground as-is. Ensure stable anchor.
    const dim=e.dimension; const p=toBlk(e.location);
    try{ e.teleport({ x: p.x+0.5, y: e.location.y, z: p.z+0.5 }, { dimension: dim, checkForBlocks:true, keepVelocity:false }); }catch{}
  }catch{}
}

function playNote(dim, x,y,z){
  try{
    const NOTES=["note.harp","note.bass","note.pling","note.bell","note.bit","note.xylophone"]; // may vary; fallback below
    const FUNNY=["random.pop","random.click","mob.villager.yes","mob.villager.no"]; // best-effort; falls back
    const useNotes = Math.random()<0.7;
    const id = (useNotes?NOTES:FUNNY)[Math.floor(Math.random()*(useNotes?NOTES.length:FUNNY.length))];
    const pitch = (Math.random()<0.33)?0.8:((Math.random()<0.5)?1.0:1.2);
    dim.runCommandAsync(`playsound ${id} @a ${x} ${y} ${z} 0.6 ${pitch} 0`).catch(()=>{
      try{ dim.runCommandAsync(`playsound random.orb @a ${x} ${y} ${z} 0.6 1.0 0`).catch(()=>{}); }catch{}
    });
  }catch{}
}

function burp(dim, x,y,z){
  try{
    // Chat burp + low note + goofy slime "vomit" burst
    for(const p of world.getPlayers()){ try{ if(p.dimension?.id===dim.id){ const dx=p.location.x-x, dz=p.location.z-z; if (dx*dx+dz*dz<=256) p.sendMessage?.("TrashBot: BURP."); } }catch{} }
    dim.runCommandAsync(`playsound note.bass @a ${x} ${y} ${z} 0.6 0.6 0`).catch(()=>{});
    try{
      for(let i=0;i<14;i++){
        const ox=(Math.random()*0.8-0.4);
        const oy=1.0 + Math.random()*0.6;
        const oz=(Math.random()*0.6+0.2);
        dim.runCommandAsync(`particle minecraft:slime ${(x+0.5+ox).toFixed(2)} ${(y+oy).toFixed(2)} ${(z+0.5+oz).toFixed(2)}`).catch(()=>{});
      }
    }catch{}
  }catch{}
}

function spinCute(e, ms=1500){
  try{
    const st=T_STATE.get(e.id)||{}; const now=Date.now(); st.spin={k:0, until: now+ms}; T_STATE.set(e.id, st);
  }catch{}
}

function confetti(dim, x,y,z){
  try{
    // Fireworky celebration burst
    try{ dim.runCommandAsync(`playsound fireworks.blast @a ${x} ${y} ${z} 0.7 1.0 0`).catch(()=>{}); }catch{}
    const P=["minecraft:happy_villager","minecraft:totem_particle","minecraft:endrod","minecraft:firework_particle","minecraft:note"];
    for(let i=0;i<36;i++){
      const id = P[Math.floor(Math.random()*P.length)];
      const ox=(Math.random()*2-1), oy=(Math.random()*1.5+0.8), oz=(Math.random()*2-1);
      dim.runCommandAsync(`particle ${id} ${(x+0.5+ox).toFixed(2)} ${(y+oy).toFixed(2)} ${(z+0.5+oz).toFixed(2)}`).catch(()=>{});
    }
  }catch{}
}

function keepHome(e){
  try{
    const st=T_STATE.get(e.id)||{}; const base=st.base; if (!base) return;
    // Strong anchor: if drifted at all, snap back atop the campfire
    const dx=e.location.x-(base.x+0.5), dz=e.location.z-(base.z+0.5);
    const d2=dx*dx+dz*dz; if (d2>0.01){ try{ e.teleport({ x: base.x+0.5, y: base.y+1.0, z: base.z+0.5 }, { dimension:e.dimension, checkForBlocks:true, keepVelocity:false }); }catch{} }
  }catch{}
}

function nearbyPlayers(dim, x, z, r2=400){
  try{ return world.getPlayers().filter(p=>{ try{ if(p.dimension?.id!==dim.id) return false; const dx=p.location.x-x, dz=p.location.z-z; return dx*dx+dz*dz<=r2; }catch{return false;} }); }catch{ return []; }
}

function singSong(e){
  try{
    const st=T_STATE.get(e.id)||{}; if (st.songActive) return; st.songActive=true; T_STATE.set(e.id, st);
    const dim=e.dimension; const x=e.location.x, y=e.location.y, z=e.location.z;
    const say = (line)=>{ try{ for(const p of nearbyPlayers(dim, x, z, 900)){ p.sendMessage(line); } }catch{} };
    // Play 2-minute music track
    try{
      dim.runCommandAsync(`playsound labs.trash_bot_song @a ${x.toFixed(1)} ${y.toFixed(1)} ${z.toFixed(1)} 1 1 0`).catch(()=>{
        try{ dim.runCommandAsync(`playsound labs.party_song @a ${x.toFixed(1)} ${y.toFixed(1)} ${z.toFixed(1)} 1 1 0`).catch(()=>{
          try{ dim.runCommandAsync(`playsound record.relic @a ${x.toFixed(1)} ${y.toFixed(1)} ${z.toFixed(1)} 1 1 0`).catch(()=>{}); }catch{}
        }); }catch{}
      });
    }catch{}
    const SONG=[
      "[Chorus] Trashy Smashy, Trashy Dee Dee,\\nFeed me your junk and set your chunks free!",
      "[Verse 1] What do you get when you hoard every block?\\nChests making soup and frames ticking like clocks.",
      "[Chorus] Clear what you keep, compost the rest,\\nClean inventories make gameplay the best!",
      "[Chorus] Trashy Smashy, Trashy Dee Dee,\\nPick up your drops, don’t leave ‘em to flee!",
      "[Verse 2] Crafting by guess and stuffing each chest?\\nFuture-you sighs while searching the mess.",
      "[Chorus] Sort by the row, label the lot,\\nPast-you was wise, present-you’s hot!",
      "[Chorus] Trashy Smashy, Trashy Dee Dum,\\nClear out the junk—bum, diddy, bum!",
      "[Verse 3] Mining in darkness, no torch in your grip?\\nCreepers say “Hi!” and you rage-quit the trip.",
      "[Chorus] Light every step, mind every hiss,\\nBoomless adventures are crafting bliss!",
      "[Chorus] Trashy Smashy, Trashy Dee Dee,\\nTidy your base and let lag flee!",
      "[Verse 4] Bridging o’er lava with gravel so thin?\\nOne wiggle of crouch keeps all your stuff in.",
      "[Chorus] Carry a bucket, crouch on the edge,\\nOne pinky tap saves more than a pledge!",
      "[Final Chorus] Trashy Smashy, Trashy Dee Day,\\nClean as you go and you’ll game your best way!"
    ];
    // Spread lyrics across ~120s (20 ticks = 1s)
    const totalTicks = 120*20; const step = Math.max(20, Math.floor(totalTicks / Math.max(1, SONG.length)));
    SONG.forEach((line,i)=>{ system.runTimeout(()=>{ say(line); }, i*step); });
    // Dance state for tick loop (spin and particles during music)
    try{ const s2=T_STATE.get(e.id)||{}; s2.songEndAt=Date.now()+120000; s2.songDir=1; s2.songNext=0; T_STATE.set(e.id, s2); }catch{}
    // end flag after music
    system.runTimeout(()=>{ try{ const s=T_STATE.get(e.id)||{}; s.songActive=false; s.lastSongAt=Date.now(); delete s.songEndAt; T_STATE.set(e.id, s); }catch{} }, totalTicks+10);
  }catch{}
}

function tickTrash(e){
  const st=T_STATE.get(e.id)||{}; const now=Date.now(); if (st.next && now<st.next){ T_STATE.set(e.id, st); return; }
  st.next=now+400; // ~0.4s cadence
  const dim=e.dimension; const base=toBlk(e.location); const x=Math.floor(e.location.x), y=Math.floor(e.location.y), z=Math.floor(e.location.z);
  // If marked for retrieval/removal, self-terminate cleanly
  try{ const tags=e.getTags?.()||[]; if (tags.some(t=>String(t)==="labs_retrieved"||String(t).startsWith("labs_kill:"))){ e.kill?.(); return; } }catch{}
  // Spin animation if active
  try{
    if (st.spin && now<st.spin.until){
      const t = (st.spin.k||0)+1; st.spin.k=t; const yaw = (t*36)%360; // fast
      e.setRotation?.({x:0,y:yaw});
      // fake opposite head spin: particle swirl
      if (t%2===0) dim.runCommandAsync(`particle minecraft:note ${e.location.x.toFixed(2)} ${(e.location.y+1.6).toFixed(2)} ${e.location.z.toFixed(2)}`).catch(()=>{});
    }
  }catch{}
  
  // If singing, do continuous dance + heart/note particles
  try{
    if (st.songEndAt && now < st.songEndAt){
      st.songK = (st.songK||0) + 1;
      const yaw = ((st.songK*12)%360); // slower, smooth spin
      e.setRotation?.({x:0,y:yaw});
      if (!st.songNext || now >= st.songNext){
        st.songNext = now + 600; // every ~0.6s
        try{ dim.runCommandAsync(`particle minecraft:note ${e.location.x.toFixed(2)} ${(e.location.y+1.6).toFixed(2)} ${e.location.z.toFixed(2)}`); }catch{}
        try{ if (st.songK % 4 === 0) dim.runCommandAsync(`particle minecraft:heart ${e.location.x.toFixed(2)} ${(e.location.y+1.2).toFixed(2)} ${e.location.z.toFixed(2)}`); }catch{}
      }
    }
  }catch{}
  
  // Eat nearby items
  try{
    const items=dim.getEntities({ type: "item" });
    for(const it of items){
      try{
        const dx=it.location.x-e.location.x, dy=it.location.y-e.location.y, dz=it.location.z-e.location.z;
        if ((dx*dx+dz*dz) > RADIUS*RADIUS || Math.abs(dy)>3.0) continue;
        const comp=it.getComponent?.("minecraft:item"); const stack=comp?.itemStack; const amt=Math.max(1, Math.floor(Number(stack?.amount||1)));
        // swallow
        it.kill?.();
        // fx
        playNote(dim, x,y,z);
        try{ dim.runCommandAsync(`particle minecraft:cloud ${e.location.x.toFixed(2)} ${(e.location.y+0.6).toFixed(2)} ${e.location.z.toFixed(2)}`).catch(()=>{}); }catch{}
        // count
        st.eaten = (st.eaten||0) + amt;
        if (Math.floor(Math.random()*200) === 0){ confetti(dim, x,y,z); }
        else if (st.eaten % 100 === 0){ spinCute(e); }
        else if (st.eaten % 17 === 0){ burp(dim, x,y,z); }
        // musical event: 1/5000 chance per feeding, at most once per 24h
        try{
          const dayMs = 24*60*60*1000;
          const last = Number(st.lastSongAt||0);
          if (!st.songActive && (now - last) > dayMs){
            if (Math.floor(Math.random()*5000) === 0){ singSong(e); }
          }
        }catch{}
      }catch{}
    }
  }catch{}

  // keep anchored
  keepHome(e);
  T_STATE.set(e.id, st);
}

// Make indestructible: on hurt, immediately restore and teleport back to base
try{
  world.afterEvents.entityHurt.subscribe(ev=>{
    try{
      const e=ev.hurtEntity; if(!e || e.typeId!==BOT_ID) return;
      // If being retrieved/removed, allow death; do not rescue
      try{ const tags=e.getTags?.()||[]; if (tags.includes("labs_retrieved") || tags.some(t=>String(t).startsWith("labs_kill:"))) return; }catch{}
      const st=T_STATE.get(e.id)||{}; const base=st.base; if(base){ try{ e.teleport({x:base.x+0.5,y:e.location.y,z:base.z+0.5}, {dimension:e.dimension, checkForBlocks:true, keepVelocity:false}); }catch{} }
      try{ const hc=e.getComponent?.("health"); if(hc){ hc.resetToMaxValue?.(); e.addEffect?.("regeneration", 2, { amplifier: 1, showParticles:false }); } }catch{}
    }catch{}
  });
} catch {}

// Spawn handler: set name, base, bonfire
try{
  world.afterEvents.entitySpawn.subscribe(ev=>{
    const e=ev.entity; if(!e || e.typeId!==BOT_ID) return;
    system.runTimeout(()=>{
      try{ e.nameTag = "Trash Bot"; }catch{}
      const base=toBlk(e.location); T_STATE.set(e.id, { base, eaten:0, next:0 });
      placeBonfire(e);
      try{ if(!e.nameTag) e.nameTag = "Trash Bot"; }catch{}
    }, 10);
  });
} catch {}

// Ticker: scan and act
try{
  system.runInterval(()=>{
    for (const dim of [world.getDimension("overworld"), world.getDimension("nether"), world.getDimension("the_end")]){
      if (!dim) continue; const bots=dim.getEntities({ type: BOT_ID });
      for (const b of bots){ try{ tickTrash(b); }catch{} }
    }
  }, 8);
} catch {}

// On death: drop spawn egg + cleanup
try{
  world.afterEvents.entityDie.subscribe(ev=>{
    const e=ev.deadEntity; if(!e || e.typeId!==BOT_ID) return; 
    // don't drop egg if retrieved
    let retrieved=false; try{ retrieved = (e.getTags?.()||[]).includes("labs_retrieved"); }catch{}
    if (!retrieved){ try{ e.dimension.spawnItem(new ItemStack("myname:trash_bot_spawn_egg",1), e.location); }catch{} }
    T_STATE.delete(e.id);
  });
} catch {}

// OP-triggered event: make a nearby Trash Bot sing if within 10 blocks of the target player
try{
  globalThis.LABS_triggerTrashBotSong = (target)=>{
    try{
      if (!target) return;
      const dim = target.dimension; if (!dim) return;
      const bots = dim.getEntities({ type: BOT_ID })||[];
      let best=null, bestD2=Infinity; const x=target.location.x, y=target.location.y, z=target.location.z;
      for (const b of bots){
        try{
          const dx=b.location.x-x, dy=b.location.y-y, dz=b.location.z-z; const d2=dx*dx+dy*dy+dz*dz;
          if (d2<=100 && d2<bestD2){ best=b; bestD2=d2; }
        }catch{}
      }
      if (!best){ try{ target.sendMessage?.("No Trash Bot within 10 blocks."); }catch{} return; }
      try{ singSong(best); }catch{}
      try{ target.sendMessage?.("Triggered Trash Bot song."); }catch{}
    }catch{}
  };
} catch {}
