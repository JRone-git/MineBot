import { world, system, ItemStack } from "@minecraft/server";

const JB_STATE = new Map(); // id -> { target:string, hits:number, hue:number }

function toBlk(v){ return { x: Math.floor(v.x), y: Math.floor(v.y), z: Math.floor(v.z) }; }

function getVictimNear(bot){
  // Find player with labs_justice_victim tag near bot
  try{
    let best=null,bd2=9999; for(const p of world.getPlayers()){
      if (p.dimension.id!==bot.dimension.id) continue;
      if (!p.hasTag || !p.hasTag("labs_justice_victim")) continue;
      const dx=p.location.x-bot.location.x, dy=p.location.y-bot.location.y, dz=p.location.z-bot.location.z; const d2=dx*dx+dy*dy+dz*dz; if (d2<bd2){ bd2=d2; best=p; }
    }
    return best;
  }catch{}
  return null;
}

function chaseAndStrike(bot){
  const st = JB_STATE.get(bot.id); if (!st) return;
  const player = world.getPlayers().find(p=>p.name===st.target);
  if (!player) return; // wait until target online
  // Chase: teleport behind/near player
  try{
    const px=player.location.x, py=player.location.y, pz=player.location.z;
    bot.teleport({ x:px+ (Math.random()*2-1), y:py, z:pz+ (Math.random()*2-1) }, { dimension: player.dimension });
    // heartbeat rate scales with distance
    const dx=bot.location.x-player.location.x, dz=bot.location.z-player.location.z; const d=Math.sqrt(dx*dx+dz*dz);
    const rate = Math.max(5, Math.min(40, Math.floor(40 - (30*(Math.max(0,10-d)/10))))); // closer -> smaller period
    const key = `hb_${bot.id}`;
    let cnt = (globalThis[key]||0)+1; if (cnt>=rate){ cnt=0; try{ bot.dimension.runCommandAsync(`playsound mob.warden.heartbeat ${Math.floor(bot.location.x)} ${Math.floor(bot.location.y)} ${Math.floor(bot.location.z)}`).catch(()=>{}); }catch{} }
    globalThis[key]=cnt;
    // periodic particles
    try{ bot.dimension.runCommandAsync(`particle minecraft:campfire_smoke_particle ${bot.location.x} ${bot.location.y+1} ${bot.location.z}`).catch(()=>{}); }catch{}
  }catch{}
  // Strike if close
  try{
    const dx=bot.location.x-player.location.x, dy=bot.location.y-player.location.y, dz=bot.location.z-player.location.z; const d2=dx*dx+dy*dy+dz*dz;
    if (d2<=4){
      const hc = st.hits||0;
      const health = player.getComponent?.("health");
      // scare sound on each strike
      try{ bot.dimension.runCommandAsync(`playsound mob.enderdragon.growl ${Math.floor(bot.location.x)} ${Math.floor(bot.location.y)} ${Math.floor(bot.location.z)}`).catch(()=>{}); }catch{}
      if (hc < 4){
        const cur = Math.max(1, Math.floor(health?.currentValue||10));
        const dmg = Math.ceil(cur/2);
        try{ player.applyDamage?.(dmg); }catch{}
        st.hits = hc+1; JB_STATE.set(bot.id, st);
      } else {
        // 5th hit: execute doom
        try{ player.kill?.(); }catch{ try{ player.applyDamage?.(1000); }catch{} }
        // reset karma
        try{ const dim=world.getDimension("overworld"); dim.runCommandAsync(`scoreboard players set "${player.name}" karma 0`); }catch{}
        // destroy all bots owned by player (no eggs)
        const BOT_TYPES=["myname:miner_bot","myname:constructor_bot","myname:fisher_bot","myname:shroom_bot","myname:farmer_bot","myname:beekeeper_bot","myname:treasure_bot","myname:storekeeper_bot"];
        for (const dim of [world.getDimension("overworld"), world.getDimension("nether"), world.getDimension("the_end")]){
          if (!dim) continue; const ents = dim.getEntities({});
          for (const e of ents){
            if (!BOT_TYPES.includes(e.typeId)) continue;
            try{ const tags=e.getTags?.()||[]; const own=tags.find(t=>String(t).startsWith("labs_owner:")); if (own && own.endsWith(player.name)){ e.addTag?.("labs_retrieved"); e.kill?.(); } }catch{}
          }
        }
        // remove bot eggs from inventory
        try{
          const inv = player.getComponent("inventory")?.container; if (inv){
            const eggIds=[
              "myname:miner_bot_spawn_egg","myname:constructor_bot_spawn_egg","myname:fisher_bot_spawn_egg","myname:shroom_bot_spawn_egg","myname:farmer_bot_spawn_egg","myname:beekeeper_bot_spawn_egg","myname:treasure_bot_spawn_egg","myname:storekeeper_bot_spawn_egg"
            ];
            for (let i=0;i<inv.size;i++){
              const it=inv.getItem(i); if (it && eggIds.includes(it.typeId)){ inv.setItem(i, undefined); }
            }
          }
        }catch{}
        // broadcast end message and remove bot
        try{ world.sendMessage("It's a tough world but Justice is tougher."); }catch{}
        try{ bot.kill?.(); }catch{}
      }
    }
  }catch{}
}

// Simple tick for chase and attack
system.runInterval(()=>{
  for (const dim of [world.getDimension("overworld"), world.getDimension("nether"), world.getDimension("the_end")]){
    if (!dim) continue; const bots = dim.getEntities({ type: "myname:justice_bot" });
    for (const bot of bots){
      let st = JB_STATE.get(bot.id);
      if (!st){
        // assign victim
        const v = getVictimNear(bot);
        if (v){
          JB_STATE.set(bot.id, { target: v.name, hits: 0, hue: 0 });
          try{ v.removeTag?.("labs_justice_victim"); }catch{}
          try{ world.sendMessage(`${v.name}, prepare to meet your doom.`); }catch{}
        }
        continue;
      }
      // Boss bar simulation: cycle colors on action bar for nearby players
      try{
        st.hue = (st.hue||0)+1; if (st.hue>30) st.hue=0;
        const colors = ['§4','§5','§1','§9','§5','§4']; // deep red/purple/blue
        const c = colors[Math.floor(st.hue/6) % colors.length];
        for (const p of world.getPlayers()){
          if (p.dimension.id!==bot.dimension.id) continue;
          const dx=p.location.x-bot.location.x, dz=p.location.z-bot.location.z; const d2=dx*dx+dz*dz; if (d2>64*64) continue;
          try{ p.onScreenDisplay.setActionBar(`${c}JUSTICE BOT §7| §fTarget: ${st.target} §7| §fHits: ${st.hits||0}`); }catch{}
        }
      }catch{}
      JB_STATE.set(bot.id, st);
      chaseAndStrike(bot);
    }
  }
}, 20);
