import { world, system, ItemStack } from "@minecraft/server";

// March of the Iron Golems — Village-only, rare event
// Sound id expected in RP: labs.iron_golems (maps to iron_golems.ogg)
// Duration: 4m40s (280s)

try {
  const SOUND_ID = "labs.iron_golems";
  const SONG_TICKS = 280 * 20; // 4:40
  const CHEST_TICKS = 180 * 20; // 3:00
  const PULSE_TICKS = 80; // ~4s footstep pulse
  const CLANG_TICKS = 120; // ~6s clangs
  const ROLL_INTERVAL_TICKS = 1200; // ~60s
  const RARE_CHANCE = 0.001; // 0.1% per minute

  function isOverworld(p){ try { return p?.dimension?.id === "minecraft:overworld"; } catch {} return false; }

  // Heuristic village detector: near a bell or 2+ villagers
  function isInVillageOverworld(p){
    try {
      if (!isOverworld(p)) return false;
      const dim = p.dimension;
      const base = { x: Math.floor(p.location.x), y: Math.floor(p.location.y), z: Math.floor(p.location.z) };
      // Villagers within radius 24
      let villagers = 0;
      try { villagers = dim.getEntities({ type: "minecraft:villager_v2" }).filter(v=> {
        const dx=v.location.x-base.x, dz=v.location.z-base.z, dy=Math.abs(v.location.y-base.y);
        return (dx*dx+dz*dz)<=24*24 && dy<=12;
      }).length; } catch {}
      if (villagers >= 2) return true;
      // Bell within radius 16 (scan cross pattern & small cube)
      for (let dx=-16; dx<=16; dx++){
        for (let dz=-16; dz<=16; dz++){
          for (let dy=-4; dy<=6; dy++){
            try{ const b = dim.getBlock({ x: base.x+dx, y: base.y+dy, z: base.z+dz }); if (b && String(b.typeId||"")==="minecraft:bell") return true; }catch{}
          }
        }
      }
    } catch {}
    return false;
  }

  function summonGolemsWithThunder(p, count=10){
    try{
      const dim = p.dimension; const x0=Math.floor(p.location.x), y0=Math.floor(p.location.y), z0=Math.floor(p.location.z);
      const radius = 6;
      for (let i=0;i<count;i++){
        const ang = (i / count) * Math.PI * 2;
        const x = Math.floor(x0 + Math.cos(ang)*radius);
        const z = Math.floor(z0 + Math.sin(ang)*radius);
        try{ p.runCommandAsync?.(`playsound ambient.weather.thunder @s ${x} ${y0} ${z} 0.8 1 0`); }catch{}
        try{ dim.runCommandAsync(`summon iron_golem ${x} ${y0} ${z}`); }catch{}
      }
    }catch{}
  }

  function placeRewardChest(p){
    try{
      const dim = p.dimension; const base = { x: Math.floor(p.location.x), y: Math.floor(p.location.y), z: Math.floor(p.location.z) };
      const spots = [ {x:0,z:0}, {x:1,z:0}, {x:-1,z:0}, {x:0,z:1}, {x:0,z:-1} ];
      let chest=null;
      for (const s of spots){
        const pos = { x: base.x+s.x, y: base.y, z: base.z+s.z };
        try{
          const here = dim.getBlock(pos);
          const id = String(here?.typeId||"");
          if (id==="minecraft:air" || id==="minecraft:cave_air"){
            here?.setType("minecraft:chest");
            chest = pos; break;
          }
        }catch{}
      }
      if (!chest) return;
      try{
        const cont = dim.getBlock(chest)?.getComponent("minecraft:inventory")?.container; if (!cont) return;
        // Rewards: 3x64 iron ingots, 25 emeralds, 5 bread, 64 oak logs
        cont.setItem(0, new ItemStack("minecraft:iron_ingot", 64));
        cont.setItem(1, new ItemStack("minecraft:iron_ingot", 64));
        cont.setItem(2, new ItemStack("minecraft:iron_ingot", 64));
        cont.setItem(3, new ItemStack("minecraft:emerald", 25));
        cont.setItem(4, new ItemStack("minecraft:bread", 5));
        cont.setItem(5, new ItemStack("minecraft:oak_log", 64));
      }catch{}
    }catch{}
  }

  function startGolemMarchFor(p, force=false){
    try{
      if (!force && !isInVillageOverworld(p)) { try{ p.sendMessage("This omen stirs only in villages."); }catch{} return false; }
      const tags = p.getTags?.()||[];
      if (!force && tags.includes("labs_ig_active")) return false;
      if (force && tags.includes("labs_ig_active")) { try{ p.removeTag?.("labs_ig_active"); }catch{} }
      try{ p.addTag?.("labs_ig_active"); }catch{}
      // Summon golems w/ thunder
      summonGolemsWithThunder(p, 10);
      // Bell peal intro (three quick rings)
      try{ const xb=Math.floor(p.location.x), yb=Math.floor(p.location.y), zb=Math.floor(p.location.z);
        for(let i=0;i<3;i++) system.runTimeout(()=>{ try{ p.runCommandAsync?.(`playsound block.bell.use @s ${xb} ${yb} ${zb} 1 1 0`); }catch{} }, i*8);
      }catch{}
      // Play anthem to the player (with dimension fallback)
      try{ const x=Math.floor(p.location.x), y=Math.floor(p.location.y), z=Math.floor(p.location.z); p.runCommandAsync?.(`playsound ${SOUND_ID} @s ${x} ${y} ${z} 1 1 0`); }catch{}
      try{ const dim=p.dimension; const x=Math.floor(p.location.x), y=Math.floor(p.location.y), z=Math.floor(p.location.z); dim.runCommandAsync?.(`playsound ${SOUND_ID} @a ${x} ${y} ${z} 1 1 0`).catch(()=>{}); }catch{}
      try{ p.sendMessage("You hear a solemn clang—the March of the Iron Golems begins…"); }catch{}
      // Ambient iron clangs throughout the march
      for (let t=0; t<SONG_TICKS; t+=CLANG_TICKS){
        system.runTimeout(()=>{
          try{
            const sx=Math.floor(p.location.x), sy=Math.floor(p.location.y), sz=Math.floor(p.location.z);
            p.runCommandAsync?.(`playsound anvil.use @s ${sx} ${sy} ${sz} 0.6 1 0`);
          }catch{}
        }, t);
      }
      // Footstep particle pulses near nearby golems
      for (let t=20; t<SONG_TICKS; t+=PULSE_TICKS){
        system.runTimeout(()=>{
          try{
            const dim=p.dimension; const base=p.location; const golems=dim.getEntities({ type: "minecraft:iron_golem" });
            for (const g of golems){
              const dx=g.location.x-base.x, dz=g.location.z-base.z; const d2=dx*dx+dz*dz; if (d2>18*18) continue;
              const fx=g.location.x.toFixed(2), fy=(g.location.y+0.1).toFixed(2), fz=g.location.z.toFixed(2);
              dim.runCommandAsync?.(`particle minecraft:poof ${fx} ${fy} ${fz}`).catch(()=>{});
            }
          }catch{}
        }, t);
      }
      // Mid-song reward chest
      system.runTimeout(()=>{ try{ placeRewardChest(p); }catch{} }, CHEST_TICKS);
      // End cleanup
      system.runTimeout(()=>{ try{ p.removeTag?.("labs_ig_active"); }catch{} }, SONG_TICKS);
      return true;
    }catch{ return false; }
  }

  // Random trigger loop
  system.runInterval(()=>{
    try{
      for (const p of world.getPlayers()){
        if (!isInVillageOverworld(p)) continue;
        const tags = p.getTags?.()||[]; if (tags.includes("labs_ig_active")) continue;
        if (Math.random() < RARE_CHANCE){ startGolemMarchFor(p); }
      }
    }catch{}
  }, ROLL_INTERVAL_TICKS);

  // Expose OP/manual trigger
  try{ globalThis.LABS_startGolemMarch = (pl, force=false)=>{ try{ return startGolemMarchFor(pl, !!force); }catch{ return false; } }; }catch{}

} catch {}
