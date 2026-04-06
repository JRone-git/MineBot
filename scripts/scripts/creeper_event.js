import { world, system } from "@minecraft/server";

// Creeper Serenade: underground (Y<48) in overworld only
// Flow: spawn a creeper -> when it dies, play song (3:40), at ~3:00 spawn 2 more creepers, on end play thunder 4x
// Sound id expected in RP: labs.creeper_song (maps to creeper_song.ogg)

try {
  const UNDER_Y = 48;
  const HALFWAY_TICKS = 110 * 20; // 1:50 - halfway through song
  const END_TICKS = 180 * 20;   // 3:00 - near end
  const SONG_TICKS = 220 * 20;  // 3:40 total
  const BREAKDOWN_TICKS = 200 * 20; // ~3:20
  const PULSE_TICKS = 75;       // ~3.75s (8 beats @ 128 BPM)
  const SOUND_ID = "labs.creeper_song";

  function isUndergroundOverworld(p) {
    try { return p?.dimension?.id === "minecraft:overworld" && Math.floor(p.location.y) < UNDER_Y; } catch {}
    return false;
  }
  function spawnCreeperNear(p, off = { x: 6, y: 0, z: 0 }) {
    try {
      const x = Math.floor(p.location.x) + off.x;
      const y = Math.floor(p.location.y) + off.y;
      const z = Math.floor(p.location.z) + off.z;
      p.dimension.runCommandAsync?.(`summon creeper ${x} ${y} ${z}`);
      return true;
    } catch { return false; }
  }
  function startCreeperSerenade(who, force=false){
    try{
      const ok = ()=> force || isUndergroundOverworld(who);
      // mark active
      try { who.removeTag?.("labs_cs_wait"); who.addTag?.("labs_cs_active"); } catch {}
      // play song and effects
      try { const x = Math.floor(who.location.x), y = Math.floor(who.location.y), z = Math.floor(who.location.z); who.runCommandAsync?.(`playsound ${SOUND_ID} @s ${x} ${y} ${z} 1 1 0`); } catch {}
      try { who.sendMessage("You hear a tender hiss nearby…"); } catch {}
      try { who.runCommandAsync?.(`effect @s darkness 10 0 true`); } catch {}
      // spawn first creeper at start, 10 blocks away
      try { spawnCreeperNear(who, { x: 10, y: 0, z: 0 }); } catch {}
      // pulse particles (more, at two heights, and hearts at head level)
      for (let t = 0; t < SONG_TICKS; t += PULSE_TICKS) {
        system.runTimeout(() => {
          try {
            if (!ok()) return;
            const base = who.location;
            const lowY = (base.y + 1.4).toFixed(2);
            const highY = (base.y + 2.0).toFixed(2);
            const ring = [
              {x: 1.7, z: 0}, {x: -1.7, z: 0}, {x: 0, z: 1.7}, {x: 0, z: -1.7},
              {x: 1.2, z: 1.2}, {x: -1.2, z: -1.2}, {x: 1.2, z: -1.2}, {x: -1.2, z: 1.2}
            ];
            // lower ring: happy/notes
            for (let i=0;i<ring.length;i++){
              const r = ring[i];
              const px = (base.x + r.x).toFixed(2), pz = (base.z + r.z).toFixed(2);
              const id = (i % 2 === 0) ? 'minecraft:villager_happy' : 'minecraft:note';
              who.dimension.runCommandAsync?.(`particle ${id} ${px} ${lowY} ${pz}`).catch(()=>{});
            }
            // upper ring: notes
            for (let i=0;i<ring.length;i++){
              const r = ring[i];
              const px = (base.x + r.x * 0.8).toFixed(2), pz = (base.z + r.z * 0.8).toFixed(2);
              who.dimension.runCommandAsync?.(`particle minecraft:note ${px} ${highY} ${pz}`).catch(()=>{});
            }
            // hearts at head level
            const hx = base.x.toFixed(2), hy = (base.y + 1.9).toFixed(2), hz = base.z.toFixed(2);
            who.dimension.runCommandAsync?.(`particle minecraft:heart ${hx} ${hy} ${hz}`).catch(()=>{});
            // a couple extra hearts with slight offsets
            who.dimension.runCommandAsync?.(`particle minecraft:heart ${(base.x+0.3).toFixed(2)} ${hy} ${(base.z+0.2).toFixed(2)}`).catch(()=>{});
            who.dimension.runCommandAsync?.(`particle minecraft:heart ${(base.x-0.3).toFixed(2)} ${hy} ${(base.z-0.2).toFixed(2)}`).catch(()=>{});
          } catch {}
        }, t);
      }
      // halfway creeper
      system.runTimeout(() => {
        try { if (!ok()) return; spawnCreeperNear(who, { x: 8, y: 0, z: 0 }); who.sendMessage?.("Another presence draws near…"); } catch {}
      }, HALFWAY_TICKS);
      // end creepers (2 near the end of the song)
      system.runTimeout(() => {
        try { if (!ok()) return; spawnCreeperNear(who, { x: 1, y: 0, z: 1 }); spawnCreeperNear(who, { x: -2, y: 0, z: 0 }); who.sendMessage?.("You feel watched in the dark…"); } catch {}
      }, END_TICKS);
      // breakdown hiss lines
      system.runTimeout(()=>{ try{ if (!ok()) return; who.sendMessage('Sss-s-s-stop running… sss-stay…'); who.runCommandAsync?.(`playsound creeper.primed @s ${Math.floor(who.location.x)} ${Math.floor(who.location.y)} ${Math.floor(who.location.z)} 0.6 1.2 0`); }catch{} }, BREAKDOWN_TICKS);
      system.runTimeout(()=>{ try{ if (!ok()) return; who.sendMessage('Sss-oul mates… sss-omeday…'); who.runCommandAsync?.(`playsound creeper.primed @s ${Math.floor(who.location.x)} ${Math.floor(who.location.y)} ${Math.floor(who.location.z)} 0.6 1.0 0`); }catch{} }, BREAKDOWN_TICKS + 24);
      system.runTimeout(()=>{ try{ if (!ok()) return; who.sendMessage('Sss-pare a hug? sss-please?'); who.runCommandAsync?.(`playsound creeper.primed @s ${Math.floor(who.location.x)} ${Math.floor(who.location.y)} ${Math.floor(who.location.z)} 0.6 0.9 0`); }catch{} }, BREAKDOWN_TICKS + 48);
      system.runTimeout(()=>{ try{ if (!ok()) return; who.sendMessage('(SSSSS—) awww jeez!'); who.runCommandAsync?.(`playsound creeper.primed @s ${Math.floor(who.location.x)} ${Math.floor(who.location.y)} ${Math.floor(who.location.z)} 0.8 1.3 0`); }catch{} }, BREAKDOWN_TICKS + 72);
      // gentle camera shake pulses near breakdown
      for (let t = BREAKDOWN_TICKS; t < SONG_TICKS; t += PULSE_TICKS*2) {
        system.runTimeout(()=>{
          try {
            if (!ok()) return;
            who.runCommandAsync?.(`camerashake add @s 0.25 0.6 positional`);
            const bx = who.location.x.toFixed(2), by = (who.location.y+1.6).toFixed(2), bz = who.location.z.toFixed(2);
            who.dimension.runCommandAsync?.(`particle minecraft:explosion_particle ${bx} ${by} ${bz}`).catch(()=>{});
            who.dimension.runCommandAsync?.(`particle minecraft:poof ${bx} ${by} ${bz}`).catch(()=>{});
          } catch {}
        }, t);
      }
      // song end
      system.runTimeout(() => {
        try { const dim = who.dimension; const x = Math.floor(who.location.x), y = Math.floor(who.location.y), z = Math.floor(who.location.z); for (let i = 0; i < 4; i++) system.runTimeout(() => { try { dim.runCommandAsync(`playsound ambient.weather.thunder @a ${x} ${y} ${z} 0.8 1 0`); } catch {} }, i * 8); try { who.removeTag?.("labs_cs_active"); } catch {} } catch {}
      }, SONG_TICKS);
      return true;
    }catch{ return false; }
  }

  // Random trigger: small chance every ~60s while underground + fallback timer
  const WAIT = new Map(); // playerId -> expireTick
  system.runInterval(() => {
    try {
      const tick = system.currentTick || 0;
      for (const p of world.getPlayers()) {
        if (!isUndergroundOverworld(p)) continue;
        const tags = p.getTags?.() || [];
        const active = tags.includes("labs_cs_active");
        const waiting = tags.includes("labs_cs_wait");
        if (!active && waiting && !WAIT.has(p.id)) {
          WAIT.set(p.id, tick + 400); // ~20s fallback
        }
        if (!active && !waiting && Math.random() < 0.002) {
          const ok = spawnCreeperNear(p, { x: 6, y: 0, z: 0 });
          if (ok) { try { p.addTag?.("labs_cs_wait"); p.sendMessage("A lonely creeper wanders near…"); WAIT.set(p.id, tick + 400); } catch {} }
        }
        // Fallback start if creeper death not caught
        const exp = WAIT.get(p.id);
        if (!active && waiting && typeof exp==='number' && tick >= exp){
          try{ p.removeTag?.("labs_cs_wait"); p.addTag?.("labs_cs_active"); }catch{}
          try { const x = Math.floor(p.location.x), y = Math.floor(p.location.y), z = Math.floor(p.location.z); p.runCommandAsync?.(`playsound ${SOUND_ID} @s ${x} ${y} ${z} 1 1 0`); } catch {}
          try { p.sendMessage("You hear a tender hiss nearby…"); } catch {}
          try { p.runCommandAsync?.(`effect @s darkness 10 0 true`); } catch {}
          // spawn first creeper at start
          try { spawnCreeperNear(p, { x: 10, y: 0, z: 0 }); } catch {}
          // spawn halfway creeper
          system.runTimeout(()=>{
            try{ if (isUndergroundOverworld(p)) { spawnCreeperNear(p, { x: 8, y: 0, z: 0 }); p.sendMessage?.("Another presence draws near…"); } }catch{}
          }, HALFWAY_TICKS);
          // spawn end creepers
          system.runTimeout(()=>{
            try{ if (isUndergroundOverworld(p)) { spawnCreeperNear(p, { x: 1, y: 0, z: 1 }); spawnCreeperNear(p, { x: -2, y: 0, z: 0 }); p.sendMessage?.("You feel watched in the dark…"); } }catch{}
          }, END_TICKS);
          system.runTimeout(()=>{ try{ const dim=p.dimension; const x=Math.floor(p.location.x), y=Math.floor(p.location.y), z=Math.floor(p.location.z); for(let i=0;i<4;i++) system.runTimeout(()=>{ try{ dim.runCommandAsync(`playsound ambient.weather.thunder @a ${x} ${y} ${z} 0.8 1 0`); }catch{} }, i*8); p.removeTag?.("labs_cs_active"); }catch{} }, SONG_TICKS);
          WAIT.delete(p.id);
        }
      }
    } catch {}
  }, 1200);

  // When a creeper dies near a waiting player, start the song sequence for that player
  world.afterEvents.entityDie.subscribe(ev => {
  try {
  const e = ev.deadEntity; if (!e || String(e.typeId || "") !== "minecraft:creeper") return;
  let who = null, bd2 = 999999;
  for (const p of world.getPlayers()) {
  if (!isUndergroundOverworld(p)) continue;
  const tags = p.getTags?.() || [];
  if (!tags.includes("labs_cs_wait") || tags.includes("labs_cs_active")) continue;
  if (p.dimension.id !== e.dimension.id) continue;
  const dx = p.location.x - e.location.x, dz = p.location.z - e.location.z; const d2 = dx * dx + dz * dz;
  if (d2 < bd2) { bd2 = d2; who = p; }
  }
  if (!who) return;

  startCreeperSerenade(who, /*force*/false);

  } catch {}
  });

  // Manual trigger for testing: !creeperlove
  try {
    world.beforeEvents.chatSend.subscribe(ev => {
      const m = (ev.message || "").trim().toLowerCase(); if (m !== "!creeperlove") return; ev.cancel = true;
      const p = ev.sender; if (!isUndergroundOverworld(p)) { try { p.sendMessage("Go underground in the overworld to try this."); } catch {} return; }
      const tags = p.getTags?.() || [];
      if (tags.includes("labs_cs_active") || tags.includes("labs_cs_wait")) { try { p.sendMessage("Creeper serenade already in progress."); } catch {} return; }
      const ok = spawnCreeperNear(p, { x: 2, y: 0, z: 0 }); if (ok) { try { p.addTag?.("labs_cs_wait"); p.sendMessage("A lonely creeper wanders near…"); } catch {} }
    });
  } catch {}
  
  // Expose OP/manual trigger to start immediately (force=true ignores underground requirement)
  try{ globalThis.LABS_startCreeperSerenade = (pl, force=false)=>{ try{ return startCreeperSerenade(pl, !!force); }catch{ return false; } }; }catch{}

} catch {}
