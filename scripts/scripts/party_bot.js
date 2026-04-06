import { world, system, ItemStack, EnchantmentTypes } from "@minecraft/server";

const P_STATE = new Map(); // id -> { start:number, end:number, center:{x,y,z}, nextFire:number, phase:number, placed:number, spawned:number, nextAnimal:number, lastLightning:number }

function toBlk(v){ return { x: Math.floor(v.x), y: Math.floor(v.y), z: Math.floor(v.z) }; }
function randInt(a,b){ return a + Math.floor(Math.random()*(b-a+1)); }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

const PARTY_AREA = 12; // +/- distance from center (≈25x25)
const BLOCKS = ["minecraft:diamond_block","minecraft:netherite_block","minecraft:gold_block","minecraft:glowstone"];
const ANIMALS = ["minecraft:cow","minecraft:chicken","minecraft:llama","minecraft:panda","minecraft:camel","minecraft:bee"]; // 'giraffe' not in Bedrock; using camel

function withinAreaHover(center){
  return { x: center.x + (Math.random()<0.5?-1:1)*randInt(0, PARTY_AREA), y: center.y + 2, z: center.z + (Math.random()<0.5?-1:1)*randInt(0, PARTY_AREA) };
}
function withinArea(center){
  return { x: center.x + (Math.random()<0.5?-1:1)*randInt(0, PARTY_AREA), y: center.y, z: center.z + (Math.random()<0.5?-1:1)*randInt(0, PARTY_AREA) };
}

try{
  world.afterEvents.entitySpawn.subscribe(ev=>{
    const e=ev.entity; if(!e || e.typeId!=="myname:party_bot") return;
    system.runTimeout(()=>{
      try{ e.nameTag = "Party Bot"; }catch{}
      const center = toBlk(e.location);
      const now = Date.now();
      const end = now + 5*60*1000; // 5 minutes
      P_STATE.set(e.id, { start: now, end, center, nextFire: now, phase: 1, placed:0, spawned:0, nextAnimal: now+3*60*1000, lastLightning: 0 });
      // Play party music immediately
      try{ const x=Math.floor(e.location.x), y=Math.floor(e.location.y), z=Math.floor(e.location.z); e.dimension.runCommandAsync(`playsound labs.party_song @a ${x} ${y} ${z} 1 1 0`).catch(()=>{}); }catch{}
    }, 10);
  });
} catch {}

// Core loop
system.runInterval(()=>{
  for (const dim of [world.getDimension("overworld"), world.getDimension("nether"), world.getDimension("the_end")]){
    if (!dim) continue;
    const bots = dim.getEntities({ type: "myname:party_bot" });
    for (const bot of bots){
      const st=P_STATE.get(bot.id); if(!st) continue;
      const now=Date.now();
      // Dance move: teleport around inside the square every 10 ticks (hover ~2 blocks up)
      try{ const tgt = withinAreaHover(st.center); bot.teleport({ x:tgt.x+0.5, y:tgt.y, z:tgt.z+0.5 }, { dimension: bot.dimension, checkForBlocks: false }); }catch{}
      // Firework every 3s
      if (now>=st.nextFire){
        try{ const ox=randInt(-1,1), oy=randInt(0,2), oz=randInt(-1,1); bot.dimension.runCommandAsync(`summon fireworks_rocket ${Math.floor(bot.location.x)+ox} ${Math.floor(st.center.y)+2+oy} ${Math.floor(bot.location.z)+oz}`).catch(()=>{}); if (Math.random()<0.3){ const ox2=randInt(-2,2), oy2=randInt(0,3), oz2=randInt(-2,2); bot.dimension.runCommandAsync(`summon fireworks_rocket ${Math.floor(bot.location.x)+ox2} ${Math.floor(st.center.y)+2+oy2} ${Math.floor(bot.location.z)+oz2}`); } }catch{}
        st.nextFire = now + 3000;
      }
      const elapsed = now - st.start;
      // Phase control
      if (elapsed < 60*1000){ // minute 1: place 12 blocks
        st.phase = 1;
        if (st.placed < 12){
          try{
            const p=withinArea(st.center);
            const b=bot.dimension.getBlock(p);
            if (b) b.setType(pick(BLOCKS));
            st.placed++;
          }catch{}
        }
      } else if (elapsed < 2*60*1000){ // minute 2: spawn 12 endermen + lightning
        st.phase = 2;
        if (st.spawned < 12){
          try{
            const p=withinArea(st.center);
            bot.dimension.runCommandAsync(`summon enderman ${p.x} ${p.y} ${p.z}`).catch(()=>{});
            bot.dimension.runCommandAsync(`summon lightning_bolt ${p.x} ${p.y} ${p.z}`).catch(()=>{});
            st.spawned++;
          }catch{}
        }
      } else if (elapsed < 3*60*1000){ // minute 3: just zoom and fireworks (handled above)
        st.phase = 3;
      } else if (elapsed < 5*60*1000){ // minutes 4-5: animals every 10s
        st.phase = 4;
        if (now >= (st.nextAnimal||0)){
          try{ const p=withinArea(st.center); bot.dimension.runCommandAsync(`summon ${pick(ANIMALS)} ${p.x} ${p.y} ${p.z}`).catch(()=>{}); }catch{}
          st.nextAnimal = now + 10*1000;
        }
        // last 10 seconds: 4 lightnings
        if (st.end - now <= 10*1000){
          const remain = st.end - now; const slot = Math.floor((10000 - remain)/2500); // 0..3
          if (st.lastLightning !== slot){
            st.lastLightning = slot;
            try{ const p=withinArea(st.center); bot.dimension.runCommandAsync(`summon lightning_bolt ${p.x} ${p.y} ${p.z}`).catch(()=>{}); }catch{}
          }
        }
      }
      // End of party
      if (now>=st.end){
        // 10% chance to drop Sword of Doom
        try{
          if (Math.random() < 0.10){
            const drop = new ItemStack("myname:doom_blade", 1);
            try{
              const enchComp = drop.getComponent?.("minecraft:enchantments");
              const enchs = enchComp?.enchantments;
              // Max out common sword enchants
              try { enchs?.addEnchantment?.({ type: EnchantmentTypes.unbreaking, level: 3 }); } catch {}
              try { enchs?.addEnchantment?.({ type: EnchantmentTypes.looting, level: 3 }); } catch {}
              try { enchs?.addEnchantment?.({ type: EnchantmentTypes.fireAspect, level: 2 }); } catch {}
              try { enchs?.addEnchantment?.({ type: EnchantmentTypes.knockback, level: 2 }); } catch {}
              try { enchs?.addEnchantment?.({ type: EnchantmentTypes.sharpness, level: 5 }); } catch {}
              if (enchComp && enchs) { try { enchComp.enchantments = enchs; } catch {} }
            }catch{}
            bot.dimension.spawnItem(drop, bot.location);
          }
        }catch{}
        try{ bot.addTag?.("labs_retrieved"); }catch{}
        try{ bot.kill?.(); }catch{}
        P_STATE.delete(bot.id);
        continue;
      }
      P_STATE.set(bot.id, st);
    }
  }
}, 10);

// No egg drop
try{
  world.afterEvents.entityDie.subscribe(ev=>{
    const e=ev.deadEntity; if(!e || e.typeId!=="myname:party_bot") return;
    P_STATE.delete(e.id);
  });
} catch {}
