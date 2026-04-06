import { world, system } from "@minecraft/server";

// Eugene's Notes: record per-player lines and issue a written book on demand
// Storage: world DP string JSON map { playerName: [lines...] }

const DP_KEY = "labs_eugene_notes";

function loadAll(){
  try{ const raw=world.getDynamicProperty?.(DP_KEY); if (raw && typeof raw==='string') return JSON.parse(raw); }catch{}
  return {};
}
function saveAll(obj){
  try{ const s=JSON.stringify(obj||{}); world.setDynamicProperty?.(DP_KEY, s.length>12000?s.slice(0,12000):s); }catch{}
}
function addNote(player, line){
  try{
    const notes=loadAll(); const name=player?.name||""; if(!name) return false;
    const arr=Array.isArray(notes[name])?notes[name]:[];
    const txt=String(line||"").slice(0,240);
    // Avoid immediate duplicates
    if (!arr.length || arr[arr.length-1]!==txt){ arr.push(txt); }
    // Cap notes
    while(arr.length>40) arr.shift();
    notes[name]=arr; saveAll(notes); return true;
  }catch{ return false; }
}

function escapePage(s){ return String(s).replaceAll('"','\\"').replaceAll("\n","\\n"); }
function giveBook(player){
  try{
    const notes=loadAll(); const arr=Array.isArray(notes[player.name])?notes[player.name]:[];
    if (!arr.length){ try{ player.sendMessage("Eugene's Notes: (empty)"); }catch{} return; }
    // Build pages: one note per page
    const pages = arr.map(line=>`{\"text\":\"${escapePage(line)}\"}`);
    const cmd = `give \"${player.name}\" written_book{pages:[${pages.join(',')}],title:\"Eugene's Notes\",author:\"Eugene\"}`;
    player.runCommandAsync(cmd).catch(()=>{});
  }catch{}
}

// Register DP at world init
try{
  world.afterEvents.worldInitialize.subscribe(ev=>{
    try{ const DP = globalThis.DynamicPropertiesDefinition; if (typeof DP==='function'){ const def=new DP(); def.defineString(DP_KEY, 12000); ev.propertyRegistry?.registerWorldDynamicProperties?.(def); } }catch{}
  });
}catch{}

// Expose API
try{ globalThis.LABS_EUGENE_addNote = addNote; }catch{}
try{ globalThis.LABS_EUGENE_giveBook = giveBook; }catch{}
