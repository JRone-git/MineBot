import { world, system, ItemStack } from "@minecraft/server";

// Eugene near-lava random encounter
// - Roughly 1 in 50 chance per minute while near lava
// - At most once per real-world day per player

try {
  const ROLL_INTERVAL_TICKS = 1200; // ~60s
  const CHANCE = 1 / 50; // 2% per check

  function yyyymmdd(){ try { const d=new Date(); const y=d.getUTCFullYear(); const m=String(d.getUTCMonth()+1).padStart(2,'0'); const day=String(d.getUTCDate()).padStart(2,'0'); return `${y}${m}${day}`; } catch { return ""; } }

  function isNearLava(dim, loc, r=6){
    const bx=Math.floor(loc.x), by=Math.floor(loc.y), bz=Math.floor(loc.z);
    for (let dy=-2; dy<=2; dy++){
      for (let dx=-r; dx<=r; dx++){
        for (let dz=-r; dz<=r; dz++){
          try{
            const b = dim.getBlock({ x: bx+dx, y: by+dy, z: bz+dz });
            if (b && String(b.typeId||"") === "minecraft:lava"){
              return { x: bx+dx, y: by+dy, z: bz+dz };
            }
          }catch{}
        }
      }
    }
    return null;
  }

  function safeSummonPos(dim, base){
    // Try to find a nearby air block at player level
    for (const off of [ {x:2,z:0},{x:-2,z:0},{x:0,z:2},{x:0,z:-2},{x:2,z:2},{x:-2,z:-2} ]){
      const pos = { x: Math.floor(base.x+off.x), y: Math.floor(base.y), z: Math.floor(base.z+off.z) };
      try{ const b = dim.getBlock(pos); if (b && (String(b.typeId||"")==="minecraft:air" || String(b.typeId||"")==="minecraft:cave_air")) return pos; }catch{}
    }
    return { x: Math.floor(base.x+2), y: Math.floor(base.y), z: Math.floor(base.z) };
  }

  function runEugeneSequence(p, lavaPos){
    try{
      const dim = p.dimension; if (!dim) return;
      // Spawn Eugene
      const sPos = safeSummonPos(dim, p.location);
      let eugene = null;
      try{ eugene = dim.spawnEntity("minecraft:villager_v2", sPos); }catch{}
      try{ if (eugene) { eugene.nameTag = "Eugene"; eugene.addTag?.("labs_eugene_temp"); } }catch{}
      try{ p.sendMessage("Villager: Hi there I'm Eugene!"); }catch{}

      // After a brief moment, toss a chicken into the lava
      system.runTimeout(()=>{
        try{
          // Spawn chicken above lava and let it drop/burn
          const cPos = { x: lavaPos.x+0.5, y: lavaPos.y+2, z: lavaPos.z+0.5 };
          let ck=null; try{ ck = dim.spawnEntity("minecraft:chicken", cPos); }catch{}
          // Nudge towards the lava center over a few ticks
          for (let i=0;i<6;i++){
            system.runTimeout(()=>{
              try{ if (ck) ck.teleport({ x: lavaPos.x+0.5, y: ck.location.y-0.2, z: lavaPos.z+0.5 }, { dimension: dim, keepVelocity:false, checkForBlocks:false }); }catch{}
            }, i*2);
          }
          // Ensure it perishes soon if it somehow avoids lava
          system.runTimeout(()=>{ try{ ck?.kill?.(); }catch{} }, 40);
        }catch{}
      }, 20);

      // Give HOT Lava Chicken to player shortly after
      system.runTimeout(()=>{
        try{
          const inv = p.getComponent("inventory")?.container;
          const item = new ItemStack("myname:hot_lava_chicken", 1);
          const leftover = inv?.addItem?.(item);
          if (leftover) dim.spawnItem(leftover, p.location);
        }catch{}
      }, 30);

      // Farewell line
      system.runTimeout(()=>{ try{ p.sendMessage("Villager: Enjoy friend, I've gotta find my way home now"); }catch{} }, 40);

      // Make Eugene run away and despawn
      system.runTimeout(()=>{
        try{
          if (!eugene) return;
          const base = eugene.location; const pl = p.location;
          const dir = { x: base.x - pl.x, z: base.z - pl.z };
          const mag = Math.max(0.01, Math.hypot(dir.x, dir.z));
          const ux = dir.x/mag, uz = dir.z/mag;
          for (let t=0;t<30;t++){
            system.runTimeout(()=>{ try{ const cur=eugene.location; eugene.teleport({ x: cur.x + ux*0.8, y: cur.y, z: cur.z + uz*0.8 }, { dimension: dim, keepVelocity:false, checkForBlocks:false }); }catch{} }, t*2);
          }
          system.runTimeout(()=>{ try{ eugene?.kill?.(); }catch{} }, 80);
        }catch{}
      }, 50);
    }catch{}
  }

  system.runInterval(()=>{
    try{
      const today = yyyymmdd();
      for (const p of world.getPlayers()){
        const dim = p?.dimension; if (!dim) continue;
        const lava = isNearLava(dim, p.location, 6); if (!lava) continue;
        // daily gate via tag labs_eugene_<yyyymmdd>
        let hadToday=false; try{ hadToday = (p.getTags?.()||[]).some(t=>String(t).startsWith("labs_eugene_") && t.endsWith(today)); }catch{}
        if (hadToday) continue;
        // 1 in 50 roll
        if (Math.random() < CHANCE){
          try{ const prev = (p.getTags?.()||[]).find(t=>String(t).startsWith("labs_eugene_")); if (prev) p.removeTag?.(prev); }catch{}
          try{ p.addTag?.(`labs_eugene_${today}`); }catch{}
          runEugeneSequence(p, lava);
        }
      }
    }catch{}
  }, ROLL_INTERVAL_TICKS);

} catch {}
