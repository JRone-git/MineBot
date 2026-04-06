import { world, system, ItemStack } from "@minecraft/server";

try{
  const ROLL_INTERVAL_TICKS = 1200; // ~60s
  const CHANCE = 1/60; // ~1.67% per minute

  function yyyymmdd(){ try{ const d=new Date(); const y=d.getUTCFullYear(); const m=String(d.getUTCMonth()+1).padStart(2,'0'); const day=String(d.getUTCDate()).padStart(2,'0'); return `${y}${m}${day}`; }catch{ return ""; } }

  function safeSummonPos(dim, base){
    for (const off of [ {x:2,z:0},{x:-2,z:0},{x:0,z:2},{x:0,z:-2},{x:2,z:2},{x:-2,z:-2} ]){
      const pos = { x: Math.floor(base.x+off.x), y: Math.floor(base.y), z: Math.floor(base.z+off.z) };
      try{ const a=dim.getBlock(pos); const b=dim.getBlock({x:pos.x,y:pos.y+1,z:pos.z}); if (!a || String(a.typeId||"")==="minecraft:air"){ if (!b || String(b.typeId||"")==="minecraft:air") return pos; } }catch{}
    }
    return { x: Math.floor(base.x+1), y: Math.floor(base.y), z: Math.floor(base.z) };
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

  const LINES = [
    "It's near... or maybe not. Hard to tell in this heat...",
    "The End whispers through the lava cracks... or maybe that was me.",
    "Beneath a lonely warped tree lies a secret... or was it crimson?",
    "If you see my family, tell them I'm safe. Or don't. Safer that way.",
    "The End, the End... always at the edge of your map.",
    "I buried something under a bush. Or a fungus. It was green-ish...",
    "Take this, friend. You look like someone the End might notice.",
    "I had a plan. Step one: survive. Step two... oh, I forgot step two.",
    "If you hear a chorus, look down. Secrets sink.",
    "I keep getting lost. The Nether keeps finding me back.",
    "It's near. Or far. Or both—like a chorus fruit joke.",
    "Under roots, under ash, under echoes—dig there.",
    "Tell them I'm safe. Or maybe not. It’s safer if they worry.",
    "A compass spins in the Nether, but truth points down.",
    "Build a door where there isn't a wall. The End loves doors.",
    "I dropped a note under a tree. Or a piglin took it.",
    "The secret isn't hidden. It's waiting.",
    "If blocks could blink, the End would always be winking.",
    "You saw it too, right? The shadow under the bush?",
    "Here—this might save your life. Or just your pickaxe."
  ];

  function netherLightningShow(dim, center){
    try{
      for (let i=0;i<6;i++){
        system.runTimeout(()=>{
          try{
            const ang = Math.random()*Math.PI*2; const r = 10 + Math.floor(Math.random()*6);
            const x = Math.floor(center.x + Math.cos(ang)*r);
            const z = Math.floor(center.z + Math.sin(ang)*r);
            const y = Math.max(1, Math.floor(center.y + (Math.random()*2-1)*2));
            dim.runCommandAsync(`summon lightning_bolt ${x} ${y} ${z}`).catch(()=>{});
          }catch{}
        }, Math.floor((i/6)*100));
      }
    }catch{}
  }

  function particleFlourish(dim, pos){
    try{
      for (let i=0;i<30;i++) system.runTimeout(()=>{ try{ dim.runCommandAsync(`particle minecraft:campfire_smoke_particle ${pos.x+ (Math.random()*2-1).toFixed(2)} ${pos.y.toFixed(2)} ${pos.z+(Math.random()*2-1).toFixed(2)}`).catch(()=>{}); }catch{} }, i*2);
      for (let i=0;i<20;i++) system.runTimeout(()=>{ try{ dim.runCommandAsync(`particle minecraft:portal_reverse ${pos.x+ (Math.random()*2-1).toFixed(2)} ${pos.y.toFixed(2)} ${pos.z+(Math.random()*2-1).toFixed(2)}`).catch(()=>{}); }catch{} }, i*3);
    }catch{}
  }

  function runEugeneNether(p){
    try{
      const dim=p.dimension; if(!dim) return;
      const base={ x: Math.floor(p.location.x), y: Math.floor(p.location.y), z: Math.floor(p.location.z) };
      // Lightning show (~5s) and camera shake
      netherLightningShow(dim, base);
      try{ dim.runCommandAsync(`camerashake add "${p.name}" 0.8 3 positional`).catch(()=>{}); }catch{}
      system.runTimeout(()=>{ try{ dim.runCommandAsync(`camerashake add "${p.name}" 0.5 2 positional`).catch(()=>{}); }catch{} }, 120);
      // After 10s, spawn Eugene in a flourish
      system.runTimeout(()=>{
        const sPos = safeSummonPos(dim, p.location);
        particleFlourish(dim, { x: sPos.x+0.5, y: sPos.y+1, z: sPos.z+0.5 });
        let eugene=null; try{ eugene=dim.spawnEntity("minecraft:villager_v2", sPos); }catch{}
        try{ if (eugene){ eugene.nameTag="Eugene"; eugene.addTag?.("labs_eugene_temp"); } }catch{}
        // After 3s, speak and give items
        system.runTimeout(()=>{
          try{
            const line = LINES[Math.floor(Math.random()*LINES.length)];
            p.sendMessage?.(`Eugene: ${line}`);
            try{ globalThis.LABS_EUGENE_addNote?.(p, line); }catch{}
            // Gifts: 15 obsidian, 1 flint_and_steel, 1 netherite_sword
            const inv=p.getComponent("inventory")?.container;
            const give=(id,amt)=>{ try{ const leftover=inv?.addItem?.(new ItemStack(id,amt)); if(leftover) dim.spawnItem(leftover, p.location); }catch{} };
            give("minecraft:obsidian", 15);
            give("minecraft:flint_and_steel", 1);
            give("minecraft:netherite_sword", 1);
          }catch{}
        }, 60);
        // After 5s, run away and despawn
        system.runTimeout(()=>{ runAwayAndDespawn(dim, eugene, p.location); }, 160);
      }, 200);
    }catch{}
  }

  system.runInterval(()=>{
  try{
  const today=yyyymmdd();
  for(const p of world.getPlayers()){
  if(String(p?.dimension?.id||"")!=="minecraft:nether") continue;
  const tags=p.getTags?.()||[]; const tkey=`labs_eugene_nether_${today}`;
  const had = tags.includes(tkey);
  if(had) continue;
  if(Math.random() < CHANCE){ try{ p.addTag?.(tkey); }catch{} runEugeneNether(p); }
  }
  }catch{}
  }, ROLL_INTERVAL_TICKS);
  
  // OP trigger
  try{ globalThis.LABS_startEugeneNether = (pl)=>{ try{ runEugeneNether(pl); return true; }catch{ return false; } }; }catch{}
 
} catch{}
