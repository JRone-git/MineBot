import { world, system } from "@minecraft/server";

const FISHER_NEXT_SONG = new Map();
function fisherScheduleNext(id){ const now=Date.now(); const mins=1+Math.floor(Math.random()*45); FISHER_NEXT_SONG.set(id, now+mins*60000); }

// Easter egg: if a jukebox is near the fisher bot, play random vanilla records occasionally
const FISHER_JUKE_NEXT = new Map();
const JUKE_RECORDS = [
  "record.13","record.cat","record.blocks","record.chirp","record.far","record.mall","record.mellohi","record.stal","record.strad","record.ward","record.11","record.wait","record.pigstep","record.otherside","record.relic"
];
function fisherJukeScheduleNext(id){ const now=Date.now(); const mins=2+Math.floor(Math.random()*6); FISHER_JUKE_NEXT.set(id, now+mins*60000); }
function hasJukeboxNear(dim, loc, r=4){
  const bx=Math.floor(loc.x), by=Math.floor(loc.y), bz=Math.floor(loc.z);
  for(let dx=-r;dx<=r;dx++) for(let dz=-r;dz<=r;dz++) for(let dy=-1;dy<=2;dy++){
    try{ const b=dim.getBlock({x:bx+dx,y:by+dy,z:bz+dz}); if (b && String(b.typeId||"")==="minecraft:jukebox") return true; }catch{}
  }
  return false;
}
function randOf(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

// Per-player daily gating for fisher song
const FISH_TAG_PREFIX = "labs_fisher_song_day_";
function fishTodayKey(){ try{ const d=new Date(); const y=d.getUTCFullYear(); const m=String(d.getUTCMonth()+1).padStart(2,'0'); const da=String(d.getUTCDate()).padStart(2,'0'); return `${y}${m}${da}`; }catch{ return ""; } }
function fishHasHeardToday(p){ try{ const tags=p.getTags?.()||[]; const key=FISH_TAG_PREFIX+fishTodayKey(); return tags.includes(key); }catch{ return false; } }
function fishMarkHeardToday(p){ try{ const today=FISH_TAG_PREFIX+fishTodayKey(); const tags=p.getTags?.()||[]; for (const t of tags){ if (t.startsWith(FISH_TAG_PREFIX) && t!==today) try{ p.removeTag(t); }catch{} } try{ p.addTag(today); }catch{} }catch{} }

system.runInterval(()=>{
  for (const dim of [world.getDimension("overworld"), world.getDimension("nether"), world.getDimension("the_end")]){
    if (!dim) continue; const bots = dim.getEntities({ type: "myname:fisher_bot" });
    for (const bot of bots){
      const id=bot.id; if (!FISHER_NEXT_SONG.has(id)) fisherScheduleNext(id);
      const now=Date.now(); const due=FISHER_NEXT_SONG.get(id)||0;
      if (now>=due){
        try{
          const x=Math.floor(bot.location.x), y=Math.floor(bot.location.y), z=Math.floor(bot.location.z);
          for (const p of world.getPlayers()){
            try{
              if (!p || p.dimension?.id!==bot.dimension?.id) continue;
              if (fishHasHeardToday(p)) continue;
              p.runCommandAsync?.(`playsound labs.fisher_song @s ${x} ${y} ${z} 1 1 0`).catch(()=>{});
              fishMarkHeardToday(p);
            }catch{}
          }
        }catch{}
        fisherScheduleNext(id);
      }
      // Easter egg playback via jukebox
      try{
        if (hasJukeboxNear(bot.dimension, bot.location, 4)){
          if (!FISHER_JUKE_NEXT.has(id)) fisherJukeScheduleNext(id);
          const dueJ = FISHER_JUKE_NEXT.get(id)||0;
          if (now>=dueJ){
            const rec = randOf(JUKE_RECORDS);
            const x=Math.floor(bot.location.x), y=Math.floor(bot.location.y), z=Math.floor(bot.location.z);
            bot.dimension.runCommandAsync(`playsound ${rec} @a ${x} ${y} ${z} 1 1 0`).catch(()=>{});
            fisherJukeScheduleNext(id);
          }
        } else {
          FISHER_JUKE_NEXT.delete(id);
        }
      }catch{}
    }
  }
}, 40);
