import { world, system, ItemStack, BlockPermutation } from "@minecraft/server";
import { ModalFormData, ActionFormData } from "@minecraft/server-ui";
import PRICING from "../config/structure_pricing.js";

// Preview/fine-tune state per player
// player.id -> { botId, bpName, origin, size, dimId, step, lastTapAt?, tapCount? }
const PREVIEW = new Map();
// Track players currently fine-tuning so other menus (e.g. LABS Quick) don't pop up
const FT_PLAYERS = new Set();
try {
  if (!globalThis.LABS_isFineTuning) {
    globalThis.LABS_isFineTuning = (pl) => { try { return FT_PLAYERS.has(pl?.id); } catch {} return false; };
  }
} catch {}

function drawPreview(dim, origin, size){
  // High-visibility outline using bright particles + vertical corner pillars
  const minX=origin.x, minY=origin.y, minZ=origin.z;
  const maxX=origin.x+size.dx-1, maxY=origin.y+size.dy-1, maxZ=origin.z+size.dz-1;
  const parts = [];
  const step = 1; // dense
  // Bottom and top rectangles
  for (let x=minX; x<=maxX; x+=step){ parts.push({x, y:minY, z:minZ}); parts.push({x, y:minY, z:maxZ}); parts.push({x, y:maxY, z:minZ}); parts.push({x, y:maxY, z:maxZ}); }
  for (let z=minZ; z<=maxZ; z+=step){ parts.push({x:minX, y:minY, z}); parts.push({x:maxX, y:minY, z}); parts.push({x:minX, y:maxY, z}); parts.push({x:maxX, y:maxY, z}); }
  // Vertical edges (every block)
  for (let y=minY; y<=maxY; y+=step){ parts.push({x:minX, y, z:minZ}); parts.push({x:maxX, y, z:minZ}); parts.push({x:minX, y, z:maxZ}); parts.push({x:maxX, y, z:maxZ}); }
  // Crosshair guides on mid-planes for extra visibility
  const midX = Math.floor((minX+maxX)/2), midZ = Math.floor((minZ+maxZ)/2);
  for (let x=minX; x<=maxX; x+=2){ parts.push({x, y:minY, z:midZ}); parts.push({x, y:maxY, z:midZ}); }
  for (let z=minZ; z<=maxZ; z+=2){ parts.push({x:midX, y:minY, z}); parts.push({x:midX, y:maxY, z}); }
  // Corner pillars (thicker look)
  for (let y=minY; y<=maxY; y+=step){ parts.push({x:minX, y, z:minZ}); parts.push({x:maxX, y, z:maxZ}); parts.push({x:minX, y, z:maxZ}); parts.push({x:maxX, y, z:minZ}); }
  // Emit particles (bright white endrod)
  for (let i=0;i<parts.length;i++){ const p=parts[i]; try{ dim.runCommandAsync(`particle minecraft:endrod ${p.x} ${p.y} ${p.z}`).catch(()=>{}); }catch{} }
}

function beginFineTune(player, bot, bpName){
  const bp = BLUEPRINTS.get(bpName); if (!bp) return;
  const center = { x: Math.floor(bp.size.dx/2), z: Math.floor(bp.size.dz/2) };
  const origin = { x: Math.floor(bot.location.x) - center.x, y: Math.floor(bot.location.y), z: Math.floor(bot.location.z) - center.z };
  PREVIEW.set(player.id, { botId: bot.id, bpName, origin, size: bp.size, dimId: bot.dimension.id, step: 1 });
  FT_PLAYERS.add(player.id);
  try{
    player.onScreenDisplay.setActionBar("Fine-tune: use the on-screen arrows to nudge. Sneak to finish.");
  }catch{}
  try{ showDPadFineTune(player); }catch{}
}

function endFineTune(player, msg){
  PREVIEW.delete(player.id);
  FT_PLAYERS.delete(player.id);
  try{ if (msg) player.sendMessage(msg); }catch{}
}

// Optional legacy menu (kept for fallback); not shown in compact flow
function showFineTuneMenu(player){
  const st = PREVIEW.get(player.id); if (!st) return;
  try{ const dim = world.getDimension(st.dimId); drawPreview(dim, st.origin, st.size); }catch{}
  const af = new ActionFormData().title("Fine Tune Placement")
    .body(`Use controls. Current origin: ${st.origin.x},${st.origin.y},${st.origin.z} (step ${st.step})`)
    .button("← Left").button("→ Right").button("↑ Forward").button("↓ Backward")
    .button("Up").button("Down").button("Place Here").button("Cancel");
  af.show(player).then(res=>{
    if (!res || res.canceled) return;
    const sel = res.selection; const o = st.origin;
    if (sel===0) o.x -= st.step;
    else if (sel===1) o.x += st.step;
    else if (sel===2) o.z -= st.step;
    else if (sel===3) o.z += st.step;
    else if (sel===4) o.y += st.step;
    else if (sel===5) o.y -= st.step;
    else if (sel===6){
      const dim = world.getDimension(st.dimId);
      const bot = dim.getEntities({ type:"myname:constructor_bot" }).find(b=>b.id===st.botId);
      if (bot){ startBuildJob(bot, player.name, st.bpName, st.origin); }
      endFineTune(player);
      return;
    } else if (sel===7){ endFineTune(player, "Placement canceled."); return; }
    PREVIEW.set(player.id, st);
    system.runTimeout(()=> showFineTuneMenu(player), 1);
  }).catch(()=>{});
}

// Keep preview visible for active users + detect hold-sneak to show tiny confirm
function showHoldPlacePrompt(player){
  const st = PREVIEW.get(player.id); if (!st) return;
  try{ const dim = world.getDimension(st.dimId); drawPreview(dim, st.origin, st.size); }catch{}
  try{
    const form = new ActionFormData().title("Confirm Placement").body(`Place '${st.bpName}' here?`).button("Place").button("Fine Tune").button("Cancel");
    system.run(()=>{
      form.show(player).then(res=>{
        if (!res || res.canceled) return;
        if (res.selection===0){
          try{ const dim = world.getDimension(st.dimId); const bot = dim.getEntities({ type:"myname:constructor_bot" }).find(b=>b.id===st.botId); if (bot){ startBuildJob(bot, player.name, st.bpName, st.origin); } }catch{}
          endFineTune(player);
        } else if (res.selection===1){
          // Return to D-Pad fine tune
          showDPadFineTune(player);
        } else {
          // Cancel selection -> keep fine-tuning
        }
      }).catch(()=>{});
    });
  }catch{}
}

// D-Pad style fine-tune UI that re-opens after each nudge
function showDPadFineTune(player){
  const st = PREVIEW.get(player.id); if (!st) return;
  try{ const dim = world.getDimension(st.dimId); drawPreview(dim, st.origin, st.size); }catch{}
  const f = new ActionFormData().title("Fine-tune Position")
    .body("Use arrows to nudge. Sneak to finish.")
    .button("↑ Forward")
    .button("↓ Back")
    .button("← Left")
    .button("→ Right")
    .button("↑ Up (Y+)")
    .button("↓ Down (Y-)")
    .button("Advanced (Structure)")
    .button("Cancel");
  system.run(()=>{
    f.show(player).then(res=>{
      if (!res || res.canceled) return;
      const sel = res.selection;
      if (sel===7){ endFineTune(player, "Placement canceled."); return; }
      if (sel===6){ showStructureAdvanced(player); return; }
      const st2 = PREVIEW.get(player.id); if (!st2) return;
      const step = st2.step || 1;
      // Move relative to player's facing
      let dx=0, dz=0, dy=0;
      try{ const rot=player.getRotation?.()||{}; const yaw = typeof rot.y==='number'?rot.y:0; const rad=(yaw*Math.PI)/180; const fx=Math.round(Math.cos(rad)); const fz=Math.round(Math.sin(rad)); const lx=-fz, lz=fx; // left = perpendicular
        if (sel===0){ dx += fx*step; dz += fz*step; }
        else if (sel===1){ dx -= fx*step; dz -= fz*step; }
        else if (sel===2){ dx += lx*step; dz += lz*step; }
        else if (sel===3){ dx -= lx*step; dz -= lz*step; }
        else if (sel===4){ dy += step; }
        else if (sel===5){ dy -= step; }
      }catch{}
      st2.origin.x += dx; st2.origin.z += dz; st2.origin.y += dy; PREVIEW.set(player.id, st2);
      try{ player.onScreenDisplay.setActionBar(`Origin ${st2.origin.x},${st2.origin.y},${st2.origin.z} (step ${step}) — sneak to finish`); }catch{}
      // re-open loop while fine-tuning remains active
      system.runTimeout(()=>{ if (PREVIEW.get(player.id)) showDPadFineTune(player); }, 1);
    }).catch(()=>{});
  });
}

function placeTempStructureBlock(dim, nearPos){
  try{
    const p={ x: Math.floor(nearPos.x)-1, y: Math.floor(nearPos.y), z: Math.floor(nearPos.z) };
    const prev = dim.getBlock(p)?.typeId;
    try{ dim.getBlock(p)?.setType("minecraft:structure_block"); }catch{}
    system.runTimeout(()=>{ try{ dim.getBlock(p)?.setType(prev||"minecraft:air"); }catch{} }, 60);
  }catch{}
}

function placePersistentStructureBlock(dim, nearPos, seconds=120){
  try{
    const p={ x: Math.floor(nearPos.x)-1, y: Math.floor(nearPos.y), z: Math.floor(nearPos.z) };
    const prev = dim.getBlock(p)?.typeId;
    try{ dim.getBlock(p)?.setType("minecraft:structure_block"); }catch{}
    // Auto-remove after given duration
    const ticks = Math.max(20, Math.floor(seconds*20));
    system.runTimeout(()=>{ try{ dim.getBlock(p)?.setType(prev||"minecraft:air"); }catch{} }, ticks);
  }catch{}
}

function showLoadFromPackKey(player){
  const st = PREVIEW.get(player.id); if (!st) return;
  const last = getLastPrefs(player.name);
  const rotIdx = {"0":0,"90":1,"180":2,"270":3}[String(last.rot||'0')] ?? 0;
  const mirIdx = {"none":0,"x":1,"z":2}[String(last.mir||'none')] ?? 0;
  const integPctDef = Math.round(Math.max(0, Math.min(1, Number(last.integrity)||1)) * 100);
  const seedDef = String(Number(last.seed)||"");
  const mf = new ModalFormData().title("Load from Pack Key")
    .textField("Structure file key (e.g. mypack:castle)", "mypack:my_struct", "")
    .dropdown("Rotation", ["0","90","180","270"], rotIdx)
    .dropdown("Mirror", ["none","x","z"], mirIdx)
    .slider("Integrity (0-100%)", 0, 100, 5, integPctDef)
    .textField("Seed (optional)", "e.g. 42", seedDef);
  mf.show(player).then(fr=>{
    if (!fr || fr.canceled) { showStructureAdvanced(player); return; }
    const key = String(fr.formValues?.[0]||"").trim(); if (!key){ showStructureAdvanced(player); return; }
    const rot = ["0","90","180","270"][Number(fr.formValues?.[1]||0)|0] || "0";
    const mir = ["none","x","z"][Number(fr.formValues?.[2]||0)|0] || "none";
    const integPct = Number(fr.formValues?.[3]||100);
    const integrity = Math.max(0, Math.min(1, (isNaN(integPct)?100:integPct)/100));
    const seedRaw = String(fr.formValues?.[4]||"").trim();
    const seedNum = seedRaw? (parseInt(seedRaw,10)||0) : 0;
    setLastPrefs(player.name, { rot, mir, integrity, seed: seedNum });
    const dim = world.getDimension(st.dimId);
    const origin = st.origin;
    const pf = new ActionFormData().title("Structure Load").body("Preview bounds or load now?")
      .button("Preview")
      .button("Load")
      .button("Back");
    pf.show(player).then(pr=>{
      if (!pr || pr.canceled) return;
      if (pr.selection===2){ showStructureAdvanced(player); return; }
      if (pr.selection===0){
        try{ drawRotatedPreview(dim, origin, st.size, rot, mir); player.sendMessage("Preview shown. Pick 'Load' when ready."); }catch{}
        system.runTimeout(()=> pf.show(player).catch(()=>{}), 10);
        return;
      }
      try{ placeTempStructureBlock(dim, origin); }catch{}
      const dx = st.size?.dx||1, dy = st.size?.dy||1, dz = st.size?.dz||1;
      const w = (rot==='0' || rot==='180') ? dx : dz;
      const d = (rot==='0' || rot==='180') ? dz : dx;
      const x1 = origin.x, y1 = origin.y, z1 = origin.z;
      const x2 = x1 + w - 1, y2 = y1 + dy - 1, z2 = z1 + d - 1;
      const undoKey = `labs_undo_${(player.name||'player').replace(/[^A-Za-z0-9_\-]/g,'_').toLowerCase()}_${Date.now()}`;
      let cmd = `structure load ${key} ${origin.x} ${origin.y} ${origin.z} ${rot} ${mir} ${integrity.toFixed(2)}`;
      if (seedNum) cmd += ` ${seedNum}`;
      try{
        player.runCommandAsync(`structure save ${undoKey} ${x1} ${y1} ${z1} ${x2} ${y2} ${z2} true true`)
          .then(()=> player.runCommandAsync(cmd))
          .then(()=>{ try{ player.sendMessage(`Loaded '${key}' (rot=${rot}, mirror=${mir}, integrity=${integrity.toFixed(2)}${seedNum?`, seed=${seedNum}`:""}) at ${origin.x},${origin.y},${origin.z}.`); }catch{} })
          .then(()=>{ showUndoPrompt(player, dim, { x1, y1, z1, x2, y2, z2 }, undoKey, { x: x1, y: y1, z: z1 }); });
      }catch{}
    }).catch(()=>{});
  }).catch(()=>{});
}

function showStructureAdvanced(player){
  const st = PREVIEW.get(player.id); if (!st) return;
  const dim = world.getDimension(st.dimId);
  // First panel: Save / Load / Back
  const af = new ActionFormData().title("Structure (Advanced)").body("Choose mode:")
    .button("Save")
    .button("Load")
    .button("Manual Export/Import")
    .button("Load from Pack Key")
    .button("Back");
  system.run(()=>{
    af.show(player).then(res=>{
      if (!res || res.canceled) return;
      const sel = res.selection;
      if (sel===4){ showDPadFineTune(player); return; }
      if (sel===2){
        // Manual Export/Import via Structure Block
        try{
          const dim = world.getDimension(st.dimId);
          placePersistentStructureBlock(dim, st.origin, 120); // 2 minutes
          try{ player.sendMessage("Placed a Structure Block at the origin for manual Export/Import (2 minutes). Open it to Export or Load."); }catch{}
        }catch{}
        return;
      }
      if (sel===3){
        // Load from Pack Key
        showLoadFromPackKey(player);
        return;
      }
      if (sel===0){
        // Save form
        const defName = `${st.bpName||"structure"}`;
        const mf = new ModalFormData().title("Save Structure")
          .textField("Name", "my_build", defName)
          .toggle("Include entities", true)
          .toggle("Save water", true);
        mf.show(player).then(fr=>{
          if (!fr || fr.canceled) { showStructureAdvanced(player); return; }
          const nameRaw = String(fr.formValues?.[0]||defName).trim()||defName;
          const incEnt = !!fr.formValues?.[1];
          const saveWater = !!fr.formValues?.[2];
          // Bounds from preview origin/size
          const x1=st.origin.x, y1=st.origin.y, z1=st.origin.z;
          const x2=st.origin.x + (st.size?.dx||1) - 1;
          const y2=st.origin.y + (st.size?.dy||1) - 1;
          const z2=st.origin.z + (st.size?.dz||1) - 1;
          const ownerName = player.name.replace(/[^A-Za-z0-9_\-]/g,'_');
          const key = `labs/${ownerName}_${nameRaw.replace(/[^A-Za-z0-9_\-]/g,'_').toLowerCase()}`;
          try{ placeTempStructureBlock(dim, st.origin); }catch{}
          try{ dim.runCommandAsync(`structure save ${key} ${x1} ${y1} ${z1} ${x2} ${y2} ${z2} ${incEnt} ${saveWater}`); }catch{}
          try{ player.sendMessage(`Saved structure '${key}'.`); }catch{}
          // Return to advanced menu
          system.runTimeout(()=> showStructureAdvanced(player), 1);
        }).catch(()=>{});
      } else if (sel===1){
        // Load form: list from INDEX for this player
        const names = (INDEX[player.name]||[]).map(it=>({ label: `${it.name} ${it.size?`(${it.size.dx}x${it.size.dy}x${it.size.dz})`:''}`, file: it.file||it.name }));
        if (!names.length){ try{ player.sendMessage("You have no saved structures in the index. Use Save first."); }catch{} showStructureAdvanced(player); return; }
        const labels = names.map(n=>n.label);
        // Prefill with last-used per-player prefs
        const last = getLastPrefs(player.name);
        const rotIdx = {"0":0,"90":1,"180":2,"270":3}[String(last.rot||'0')] ?? 0;
        const mirIdx = {"none":0,"x":1,"z":2}[String(last.mir||'none')] ?? 0;
        const integPctDef = Math.round(Math.max(0, Math.min(1, Number(last.integrity)||1)) * 100);
        const seedDef = String(Number(last.seed)||"");
        const mf = new ModalFormData().title("Load Structure")
          .dropdown("Structure", labels, 0)
          .dropdown("Rotation", ["0","90","180","270"], rotIdx)
          .dropdown("Mirror", ["none","x","z"], mirIdx)
          .slider("Integrity (0-100%)", 0, 100, 5, integPctDef)
          .textField("Seed (optional)", "e.g. 42", seedDef);
        mf.show(player).then(fr=>{
          if (!fr || fr.canceled) { showStructureAdvanced(player); return; }
          const idx = Number(fr.formValues?.[0]||0)|0; const entry = names[idx]; if (!entry) { showStructureAdvanced(player); return; }
          const rot = ["0","90","180","270"][Number(fr.formValues?.[1]||0)|0] || "0";
          const mir = ["none","x","z"][Number(fr.formValues?.[2]||0)|0] || "none";
          const integPct = Number(fr.formValues?.[3]||100);
          const integrity = Math.max(0, Math.min(1, (isNaN(integPct)?100:integPct)/100));
          const seedRaw = String(fr.formValues?.[4]||"").trim();
          const seedNum = seedRaw? (parseInt(seedRaw,10)||0) : 0;
          // Save prefs
          setLastPrefs(player.name, { rot, mir, integrity, seed: seedNum });
          // Ask preview or load
          const pf = new ActionFormData().title("Structure Load").body("Preview bounds or load now?")
            .button("Preview")
            .button("Load")
            .button("Back");
          pf.show(player).then(pr=>{
            if (!pr || pr.canceled) return;
            if (pr.selection===2){ showStructureAdvanced(player); return; }
            if (pr.selection===0){
              try{ drawRotatedPreview(dim, st.origin, st.size, rot, mir); player.sendMessage("Preview shown. Pick 'Load' when ready."); }catch{}
              // return to same prompt
              system.runTimeout(()=> pf.show(player).catch(()=>{}), 10);
              return;
            }
            // Load with undo
            try{ placeTempStructureBlock(dim, st.origin); }catch{}
            const dx = st.size?.dx||1, dy = st.size?.dy||1, dz = st.size?.dz||1;
            const w = (rot==='0' || rot==='180') ? dx : dz;
            const d = (rot==='0' || rot==='180') ? dz : dx;
            const x1 = st.origin.x, y1 = st.origin.y, z1 = st.origin.z;
            const x2 = x1 + w - 1, y2 = y1 + dy - 1, z2 = z1 + d - 1;
            const undoKey = `labs_undo_${(player.name||'player').replace(/[^A-Za-z0-9_\-]/g,'_').toLowerCase()}_${Date.now()}`;
            let cmd = `structure load ${entry.file} ${st.origin.x} ${st.origin.y} ${st.origin.z} ${rot} ${mir} ${integrity.toFixed(2)}`;
            if (seedNum) cmd += ` ${seedNum}`;
            try{
              player.runCommandAsync(`structure save ${undoKey} ${x1} ${y1} ${z1} ${x2} ${y2} ${z2} true true`)
                .then(()=> player.runCommandAsync(cmd))
                .then(()=>{ try{ player.sendMessage(`Loaded '${entry.file}' (rot=${rot}, mirror=${mir}, integrity=${integrity.toFixed(2)}${seedNum?`, seed=${seedNum}`:""}) at ${st.origin.x},${st.origin.y},${st.origin.z}.`); }catch{} })
                .then(()=>{ showUndoPrompt(player, dim, { x1, y1, z1, x2, y2, z2 }, undoKey, { x: x1, y: y1, z: z1 }); });
            }catch{}
          }).catch(()=>{});
        }).catch(()=>{});
      }
    }).catch(()=>{});
  });
}

function drawRotatedPreview(dim, origin, size, rot, mir){
  try{
    const dx = size?.dx||1, dy=size?.dy||1, dz=size?.dz||1;
    const w = (rot==='0' || rot==='180') ? dx : dz;
    const d = (rot==='0' || rot==='180') ? dz : dx;
    const minX = origin.x, minY=origin.y, minZ=origin.z;
    const maxX = minX + w - 1, maxY = minY + dy - 1, maxZ = minZ + d - 1;
    const parts=[];
    for(let x=minX;x<=maxX;x++){ parts.push({x, y:minY, z:minZ}); parts.push({x, y:minY, z:maxZ}); parts.push({x, y:maxY, z:minZ}); parts.push({x, y:maxY, z:maxZ}); }
    for(let z=minZ;z<=maxZ;z++){ parts.push({x:minX, y:minY, z}); parts.push({x:maxX, y:minY, z}); parts.push({x:minX, y:maxY, z}); parts.push({x:maxX, y:maxY, z}); }
    for(let y=minY;y<=maxY;y++){ parts.push({x:minX, y, z:minZ}); parts.push({x:maxX, y, z:maxZ}); parts.push({x:minX, y, z:maxZ}); parts.push({x:maxX, y, z:minZ}); }
    for(const p of parts){ try{ dim.runCommandAsync(`particle minecraft:endrod ${p.x} ${p.y} ${p.z}`).catch(()=>{}); }catch{} }
  }catch{}
}

function showUndoPrompt(player, dim, clearBounds, undoKey, loadOrigin, refundCoins=0){
  try{
    const f = new ActionFormData().title("Undo Placement").body("Keep changes or undo the last operation?")
      .button("Keep")
      .button("Undo");
    system.run(()=>{
      f.show(player).then(res=>{
        if (!res || res.canceled) return;
        if (res.selection===1){
          try{
            dim.runCommandAsync(`fill ${clearBounds.x1} ${clearBounds.y1} ${clearBounds.z1} ${clearBounds.x2} ${clearBounds.y2} ${clearBounds.z2} air`)
              .then(()=> dim.runCommandAsync(`structure load ${undoKey} ${loadOrigin.x} ${loadOrigin.y} ${loadOrigin.z} 0 none 1.00`))
              .then(()=>{ try{ if (refundCoins>0){ dim.runCommandAsync(`scoreboard players add \"${player.name}\" lenycoins ${refundCoins}`); } }catch{} try{ player.sendMessage("Undone last placement." + (refundCoins>0 ? (" Refunded " + refundCoins + " LenyCoins.") : "")); }catch{} })
              .catch(()=>{ try{ player.sendMessage("Undo failed."); }catch{} });
          }catch{}
        }
      }).catch(()=>{});
    });
  }catch{}
}

system.runInterval(()=>{
  const now = Date.now();
  for(const [pid, st] of PREVIEW.entries()){
    try{
      const pl = world.getPlayers().find(p=>p.id===pid); if(!pl) continue;
      const dim = world.getDimension(st.dimId); drawPreview(dim, st.origin, st.size);
      // Sneak hold detection (~0.9s)
      const sneaking = !!(pl?.isSneaking ?? false);
      if (sneaking){
        if (!st.holdSince) st.holdSince = now;
        if (!st.holdPromptShown && now - st.holdSince >= 900){
          st.holdPromptShown = true;
          PREVIEW.set(pid, st);
          showHoldPlacePrompt(pl);
        }
      } else {
        if (st.holdSince || st.holdPromptShown){ st.holdSince = 0; st.holdPromptShown = false; PREVIEW.set(pid, st); }
      }
    }catch{}
  }
}, 10);

// Simple in-memory blueprint store: name -> { size: {dx,dy,dz}, blocks: Array<{dx,dy,dz,typeId}>, ownerId?: string, ownerName?: string }
const BLUEPRINTS = new Map();
// Per-player blueprint index: playerId -> [name]
const PLAYER_BPS = new Map();
const MAX_BPS_PER_PLAYER = 5;

// Persistence: store only a small index of player -> [ { name, file, size } ] in world dynamic properties
const INDEX_KEY = "labs_struct_index";
let INDEX = {};

// Per-player structure load prefs (rotation/mirror/integrity/seed)
const PREFS_KEY = "labs_struct_ui_prefs";
let STRUCT_PREFS = {}; // playerName -> { rot:'0'|'90'|'180'|'270', mir:'none'|'x'|'z', integrity: number (0..1), seed?: number }
function loadPrefs(){ try{ const raw=world.getDynamicProperty?.(PREFS_KEY); STRUCT_PREFS = raw && typeof raw==='string' ? JSON.parse(raw) : {}; }catch{ STRUCT_PREFS={}; } }
function savePrefs(){ try{ const s=JSON.stringify(STRUCT_PREFS||{}); world.setDynamicProperty?.(PREFS_KEY, s.length>7900 ? s.slice(0,7900) : s); }catch{} }
function getLastPrefs(name){ const p=STRUCT_PREFS?.[name]; return p && typeof p==='object' ? p : { rot:'0', mir:'none', integrity:1, seed:0 }; }
function setLastPrefs(name, obj){ try{ STRUCT_PREFS[name] = { rot: String(obj.rot||'0'), mir: String(obj.mir||'none'), integrity: Math.max(0, Math.min(1, Number(obj.integrity)||1)), seed: Number(obj.seed)||0 }; savePrefs(); }catch{} }

function loadIndex(){
  try { const raw = world.getDynamicProperty?.(INDEX_KEY); INDEX = raw && typeof raw === 'string' ? JSON.parse(raw) : {}; }
  catch { INDEX = {}; }
}
function saveIndex(){
  try { const s = JSON.stringify(INDEX||{}); world.setDynamicProperty?.(INDEX_KEY, s.length > 7900 ? s.slice(0, 7900) : s); } catch {}
}

// Register the dynamic property on world init
try{
  world.afterEvents.worldInitialize.subscribe(ev=>{
    try{
      const DP = globalThis.DynamicPropertiesDefinition;
      if (typeof DP === 'function'){
        const def = new DP();
        def.defineString(INDEX_KEY, 8000);
        def.defineString(PREFS_KEY, 8000);
        ev.propertyRegistry?.registerWorldDynamicProperties?.(def);
      }
    }catch{}
    // attempt load shortly after
    system.run(()=>{ loadIndex(); loadPrefs(); rebuildFromIndex?.(); });
  });
}catch{}


function addDefaultBlueprint() {
  const dx = 4, dy = 5, dz = 4; // 4 wide (x), 5 tall (y), 4 deep (z)
  const blocks = [];
  // Floor and roof + walls
  for (let x=0;x<dx;x++) for (let z=0;z<dz;z++) {
    blocks.push({ dx:x, dy:0, dz:z, typeId: "minecraft:oak_planks" });
    blocks.push({ dx:x, dy:dy-1, dz:z, typeId: "minecraft:oak_planks" });
  }
  for (let y=1;y<dy-1;y++) {
    for (let x=0;x<dx;x++) {
      blocks.push({ dx:x, dy:y, dz:0, typeId: "minecraft:oak_planks" });
      blocks.push({ dx:x, dy:y, dz:dz-1, typeId: "minecraft:oak_planks" });
    }
    for (let z=1;z<dz-1;z++) {
      blocks.push({ dx:0, dy:y, dz:z, typeId: "minecraft:oak_planks" });
      blocks.push({ dx:dx-1, dy:y, dz:z, typeId: "minecraft:oak_planks" });
    }
  }
  // Door at front center (front = dz==0), two blocks high starting at y=1
  const doorX = Math.floor(dx/2);
  blocks.push({ dx:doorX, dy:1, dz:0, typeId: "minecraft:oak_door" });
  blocks.push({ dx:doorX, dy:2, dz:0, typeId: "minecraft:oak_door" });
  // Window panes on the other three sides at y=2
  for (let x=1;x<dx-1;x++) blocks.push({ dx:x, dy:2, dz:dz-1, typeId: "minecraft:glass_pane" }); // back
  for (let z=1;z<dz-1;z++) blocks.push({ dx:0, dy:2, dz:z, typeId: "minecraft:glass_pane" }); // left
  for (let z=1;z<dz-1;z++) blocks.push({ dx:dx-1, dy:2, dz:z, typeId: "minecraft:glass_pane" }); // right
  // Interior: bed and chest on floor level inside
  const bedPos = { x:1, y:1, z:1 };
  blocks.push({ dx:bedPos.x, dy:bedPos.y, dz:bedPos.z, typeId: "minecraft:red_bed" });
  const chestPos = { x:2, y:1, z:1 };
  blocks.push({ dx:chestPos.x, dy:chestPos.y, dz:chestPos.z, typeId: "minecraft:chest" });

  BLUEPRINTS.set("wood_shack", { size: { dx, dy, dz }, blocks, meta: { chestPos, bedPos }, ownerId: "system", ownerName: "system" });
}

addDefaultBlueprint();

// Rebuild in-memory maps from saved index (names + struct files)
function rebuildFromIndex(){
  try{
    const idx = INDEX||{};
    for (const owner of Object.keys(idx)){
      const list = Array.isArray(idx[owner]) ? idx[owner] : [];
      const names = [];
      for (const it of list){
        const nm = String(it?.name||""); if (!nm) continue;
        names.push(nm);
        if (!BLUEPRINTS.has(nm)){
          const sz = it?.size || { dx:1, dy:1, dz:1 };
          BLUEPRINTS.set(nm, { size: sz, blocks: [], ownerId: owner, ownerName: owner, structFile: it?.file });
        }
      }
      PLAYER_BPS.set(owner, names);
    }
  }catch{}
}
// initial load attempt (also done in worldInitialize)
try{ loadIndex(); rebuildFromIndex(); }catch{}
// Expose rebuild hook for other modules (e.g., StoreKeeper) to refresh in-memory view after sales
try{ globalThis.LABS_rebuildStructs = ()=>{ try{ loadIndex(); rebuildFromIndex(); }catch{} }; }catch{}
// Per-player selection state
const SELECT = new Map(); // player.id -> { stage: 0|1, p1: {x,y,z}, awaiting?: 'start'|'finish'|'name', pendingCapture?: any }
let AUTONAME = 1;
// Building jobs per bot id
const JOBS = new Map(); // bot.id -> { name, blocks, idx, total, origin, center, ownerName, layer, nextAt }

const TICKS_PER_SECOND = 20;
const LAYER_INTERVAL_MS = 5000; // 5 seconds per layer

function toBlockPos(loc) { return { x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z) }; }

function min(a,b){return a<b?a:b} function max(a,b){return a>b?a:b}

function captureRegion(dim, a, b) {
  const minX = min(a.x,b.x), maxX = max(a.x,b.x);
  const minY = min(a.y,b.y), maxY = max(a.y,b.y);
  const minZ = min(a.z,b.z), maxZ = max(a.z,b.z);
  const blocks = [];
  for (let x=minX;x<=maxX;x++) {
    for (let y=minY;y<=maxY;y++) {
      for (let z=minZ;z<=maxZ;z++) {
        try {
          const bl = dim.getBlock({x,y,z});
          if (!bl) continue;
          const id = bl.typeId;
          if (!id || id === "minecraft:air") continue;
          let states = {};
          try { states = bl.permutation?.getAllStates?.() || {}; } catch {}
          blocks.push({ dx: x-minX, dy: y-minY, dz: z-minZ, typeId: id, states });
        } catch {}
      }
    }
  }
  return { size: { dx: maxX-minX+1, dy: maxY-minY+1, dz: maxZ-minZ+1 }, blocks };
}

function isStickInHand(player, itemStack) {
  try {
    if (itemStack && itemStack.typeId === "minecraft:stick") return true;
    const inv = player.getComponent("minecraft:inventory");
    const slot = typeof player.selectedSlot === "number" ? player.selectedSlot : 0;
    const held = inv?.container?.getItem(slot);
    return held?.typeId === "minecraft:stick";
  } catch { return false; }
}

function showManageBlueprints(player, note) {
try {
  let names = getPlayerBlueprintNames(player);
if (!Array.isArray(names)) names = [];
if (!names.length) {
  try { loadIndex(); rebuildFromIndex(); } catch {}
    names = getPlayerBlueprintNames(player);
    if (!Array.isArray(names) || !names.length) {
      try { player.sendMessage("You have no saved constructions."); } catch {}
      return;
  }
}

const defaultIdx = 0;
const defNew = `${names[0]}_renamed`;

const form = new ModalFormData()
.title("Manage constructions")
.dropdown("Select construct", names, defaultIdx)
.dropdown("Action", ["Rename", "Delete", "Place", "Exit"], 0)
.textField("New name (for rename)", "my_build", defNew);

system.run(() => {
form.show(player).then(res => {
if (!res || res.canceled) return;
const [selRaw, actionRaw, newNameField] = res.formValues || [];
const selIdx = (Number(selRaw) | 0) || 0;
const actionIdx = (Number(actionRaw) | 0) || 0;
const newNameRaw = String(newNameField || "").trim();
const target = names[selIdx] || names[0];

switch (actionIdx) {
case 3: // Exit
return;
case 1: { // Delete
deleteBlueprintForPlayer(player, target);
try { player.sendMessage(`Deleted '${target}'.`); } catch {}
return;
}
case 2: { // Place
try {
  const pkey = player?.name || getPlayerKey(player);
  const list = Array.isArray(INDEX[pkey]) ? INDEX[pkey] : [];
const entry = list.find(it => String(it?.name || "").toLowerCase() === String(target).toLowerCase());
  let file = entry?.file;
  let size = entry?.size;
  if (!file) {
    try {
      const bp = BLUEPRINTS.get(target);
      if (bp && bp.structFile) { file = bp.structFile; size = size || bp.size; }
    } catch {}
  }
  if (!file || !size) {
    try { player.sendMessage("Cannot place: missing saved file or size. Try re-saving this construction."); } catch {}
    return;
  }

  const rotForm = new ModalFormData()
    .title("Place Construction")
    .dropdown("Rotation", ["0", "90", "180", "270"], 0)
    .slider("Forward/Back (relative)", -16, 16, 1, 0)
    .slider("Left/Right (relative)", -16, 16, 1, 0)
  .slider("Up/Down", -16, 16, 1, 0);

rotForm.show(player).then(rres => {
  if (!rres || rres.canceled) return;
  const rotSel = Number(rres.formValues?.[0] ?? 0) | 0;
  const rot = ["0", "90", "180", "270"][rotSel] || "0";
  const offF = Number(rres.formValues?.[1] ?? 0) | 0;
  const offL = Number(rres.formValues?.[2] ?? 0) | 0;
const offU = Number(rres.formValues?.[3] ?? 0) | 0;

const dim = player.dimension;
const base = {
x: Math.floor(player.location.x),
y: Math.floor(player.location.y),
  z: Math.floor(player.location.z)
  };

let fx = 0, fz = 1;
try {
const r = player.getRotation?.() || {};
const yaw = typeof r.y === "number" ? r.y : 0;
const rad = (yaw * Math.PI) / 180;
const ddx = -Math.sin(rad), ddz = Math.cos(rad);
  if (Math.abs(ddx) > Math.abs(ddz)) { fx = Math.sign(ddx); fz = 0; }
    else { fx = 0; fz = Math.sign(ddz); }
  } catch {}
const lx = -fz, lz = fx;

let ax = base.x + fx * (3 + offF) + lx * offL;
let az = base.z + fz * (3 + offF) + lz * offL;
let ay = base.y + offU;

try {
    let found = false;
      for (let dy = 0; dy <= 6; dy++) {
        const b = dim.getBlock({ x: ax, y: base.y - dy, z: az });
          if (b && String(b.typeId || "") !== "minecraft:air") {
            ay = (base.y - dy) + 1 + offU;
              found = true;
              break;
            }
          }
          if (!found) {
          for (let dy = 1; dy <= 6; dy++) {
              const b = dim.getBlock({ x: ax, y: base.y + dy, z: az });
            if (b && String(b.typeId || "") === "minecraft:air") {
                ay = base.y + dy + offU;
                  break;
                  }
                  }
                  }
              } catch {}

                const sx = size?.dx || 1, sy = size?.dy || 1, sz = size?.dz || 1;
                const w = (rot === "0" || rot === "180") ? sx : sz;
                const d = (rot === "0" || rot === "180") ? sz : sx;

                const x1 = ax, y1 = ay, z1 = az;
                const x2 = x1 + w - 1, y2 = y1 + sy - 1, z2 = z1 + d - 1;

                const undoKey = `labs_undo_${(player.name || "player").replace(/[^A-Za-z0-9_-]/g, "_").toLowerCase()}_${Date.now()}`;
                const vol = Math.max(1, sx * sy * sz);

                let price = 0;
                try {
                  const allowFree = !!PRICING?.allowOpsFreePlacement && (player.hasTag?.("labs_admin") || false);
                  if (!allowFree) {
                    const rate = Number(PRICING?.ratePerBlock || 0.02);
                    const minP = Number(PRICING?.minPrice || 50);
                    const cap = Number(PRICING?.maxCap || 25000);
                    price = Math.min(cap, Math.max(minP, Math.ceil(vol * rate)));
                  }
                } catch {}

                const doPlace = () => {
                  try {
                    player.runCommandAsync(`structure save ${undoKey} ${x1} ${y1} ${z1} ${x2} ${y2} ${z2} true true`)
                      .then(() => player.runCommandAsync(`structure load ${file} ${x1} ${y1} ${z1} ${rot} none 1.00`))
                      .then(() => { try { player.sendMessage(`Placed '${target}' (rot=${rot}) at ${x1},${y1},${z1}.`); } catch {} })
                      .then(() => { showUndoPrompt(player, dim, { x1, y1, z1, x2, y2, z2 }, undoKey, { x: x1, y: y1, z: z1 }, price); })
                      .catch(() => {});
                  } catch {}
                };

                if (price > 0) {
                  player.runCommandAsync(`scoreboard players test @s lenycoins ${price}..`)
                    .then(() => player.runCommandAsync(`scoreboard players remove @s lenycoins ${price}`))
                    .then(() => doPlace())
                    .catch(() => { try { player.sendMessage("Not enough LenyCoins or payment failed. Need " + price + "."); } catch {} });
                } else {
                  doPlace();
                }
              }).catch(() => {});
            } catch {}
            return;
          }
          case 0:
          default: {
            if (!newNameRaw) { try { player.sendMessage("Please enter a new name."); } catch {} return; }
            const out = renameBlueprintForPlayer(player, target, newNameRaw);
            if (out?.ok) {
              try { player.sendMessage(`Renamed '${target}' -> '${out.name}'.`); } catch {}
            } else {
              try { player.sendMessage("Rename failed."); } catch {}
            }
            return;
          }
        }
      }).catch(() => {});
    });
  } catch {}
}

function showStartPrompt(player, pos) {
  try {
    const form = new ActionFormData()
      .title("Constructor")
      .body("Start a new construction here?")
      .button("Yes")
      .button("No");
    system.run(() => {
      form.show(player).then(res => {
        if (!res || res.canceled) return;
        if (res.selection === 0) {
          // Yes selected
          SELECT.set(player.id, { stage: 1, p1: pos, dim: player.dimension, dimId: player.dimension.id, lastPromptAt: Date.now() });
          try {
            player.sendMessage(`Constructor: first block set at ${pos.x}, ${pos.y}, ${pos.z}. Go to the last block space to mark it.`);
            player.onScreenDisplay.setActionBar("First corner set. Mark the opposite corner.");
          } catch {}
        } else {
          // No selected -> quick actions: Labs / Shop / Manage / Ops (admin) / Exit
          try{
            const isAdmin = !!player.hasTag?.("labs_admin");
            const af = new ActionFormData().title("Quick Actions").body("What would you like to open?")
              .button("Labs Menu")
              .button("Shop Menu")
              .button("Chef Menu")
              .button("Manage Constructions");
            if (isAdmin) af.button("Ops Menu");
            af.button("Exit");
            system.run(()=>{
              af.show(player).then(ar=>{
                if (!ar || ar.canceled) return;
                const sel = ar.selection;
                if (sel===0){
                  try{
                    if (typeof globalThis.LABS_showMainMenu === 'function'){
                      system.run(()=>{ try{ globalThis.LABS_showMainMenu(player); }catch{} });
                    } else {
                      try{ player.sendMessage("LABS menu not ready. Try again in a moment."); }catch{}
                    }
                  }catch{}
                }
                else if (sel===1){
                  try{
                    if (typeof globalThis.LABS_openShopMenu === 'function'){
                      system.run(()=>{ try{ globalThis.LABS_openShopMenu(player); }catch{} });
                    } else {
                      try{ player.sendMessage("Shop menu not ready. Try near a StoreKeeper."); }catch{}
                    }
                  }catch{}
                }
                else if (sel===2){
                  try{
                    if (typeof globalThis.LABS_openChefMenu === 'function'){
                      system.run(()=>{ try{ globalThis.LABS_openChefMenu(player); }catch{} });
                    } else {
                      try{ player.sendMessage("Chef menu not ready. Try near a Chef Bot."); }catch{}
                    }
                  }catch{}
                }
                else if (sel===3){ showManageBlueprints(player); }
                else if (isAdmin && sel===4){ showOpsMenu(player); }
                else { /* Exit */ }
              }).catch(()=>{});
            });
          } catch {}
        }
      }).catch(() => {});
    });
  } catch {}
}

function showOpsMenu(player){
  try{
    if (!player.hasTag?.("labs_admin")) { try{ player.sendMessage("Ops only."); }catch{} return; }
    const players = (()=>{ try{ return world.getPlayers().map(p=>p.name); }catch{} return []; })();
    if (!players.length){ try{ player.sendMessage("No players online."); }catch{} return; }
    const selfIdx = Math.max(0, players.indexOf(player.name));
    // Bot egg list (excluding Justice)
    const OPS_EGGS = [
      "myname:miner_bot_spawn_egg",
      "myname:constructor_bot_spawn_egg",
      "myname:fisher_bot_spawn_egg",
      "myname:shroom_bot_spawn_egg",
      "myname:farmer_bot_spawn_egg",
      "myname:beekeeper_bot_spawn_egg",
      "myname:treasure_bot_spawn_egg",
      "myname:storekeeper_bot_spawn_egg",
      "myname:chef_bot_spawn_egg",
      "myname:butler_bot_spawn_egg",
      "myname:smelter_bot_spawn_egg",
      "myname:redstone_bot_spawn_egg",
      "myname:control_bot_spawn_egg",
      "myname:portal_bot_spawn_egg",
      "myname:party_bot_spawn_egg"
    ];
    const labelize = (id)=>{ try{ const core=String(id).split(":")[1]||id; const base=core.replace(/_spawn_egg$/i,""); return base.split("_").map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(" "); }catch{ return String(id); } };
    const labels = OPS_EGGS.map(labelize);
    const mf = new ModalFormData().title("Ops: Give Bot Egg")
      .dropdown("Target player", players, selfIdx)
      .dropdown("Egg", labels, 0)
      .slider("Quantity", 1, 64, 1, 1);
    system.run(()=>{
      mf.show(player).then(res=>{
        if (!res || res.canceled) return;
        const pIdx = Number(res.formValues?.[0]||0)|0;
        const eIdx = Number(res.formValues?.[1]||0)|0;
        const qty = Math.max(1, Math.min(64, Number(res.formValues?.[2]||1)|0));
        const target = players[pIdx] || players[0];
        const eggId = OPS_EGGS[eIdx];
        if (!eggId){ try{ player.sendMessage("No egg selected."); }catch{} return; }
        try{
          const pl = world.getPlayers().find(pp=>pp.name===target);
          const inv = pl?.getComponent("inventory")?.container;
          if (inv){ const leftover = inv.addItem?.(new ItemStack(eggId, qty)); if (leftover) pl.dimension.spawnItem(leftover, pl.location); }
          else { pl?.dimension.spawnItem?.(new ItemStack(eggId, qty), pl.location); }
          try{ player.sendMessage(`Gave ${qty}x ${eggId} to ${target}.`); }catch{}
        }catch{}
      }).catch(()=>{});
    });
  }catch{}
}

function showFinalizePrompt(player, st, pos) {
  try {
    const form = new ActionFormData()
      .title("Constructor")
      .body("Finalize your construction selection.")
      .button("Name & Save")
      .button("Rotate 90°")
      .button("Rotate 180°")
      .button("Rotate 270°")
      .button("Cancel");
    system.run(() => {
      form.show(player).then(res => {
        if (!res || res.canceled) return;
        const choice = res.selection;
        const dim = player.dimension;
        const x1 = Math.min(st.p1.x, pos.x), y1 = Math.min(st.p1.y, pos.y), z1 = Math.min(st.p1.z, pos.z);
        const x2 = Math.max(st.p1.x, pos.x), y2 = Math.max(st.p1.y, pos.y), z2 = Math.max(st.p1.z, pos.z);
        const safeOwner = (player.name||"player").replace(/[^A-Za-z0-9_\-]/g,'_').toLowerCase();
        const tmpKey = `labs/${safeOwner}__sel_tmp`;

        if (choice === 1 || choice === 2 || choice === 3) {
          // Rotate by 90/180/270 via structure save + load (with undo)
          const rot = choice === 1 ? '90' : (choice === 2 ? '180' : '270');
          const dx = (x2 - x1 + 1), dy = (y2 - y1 + 1), dz = (z2 - z1 + 1);
          const w = (rot==='90' || rot==='270') ? dz : dx;
          const d = (rot==='90' || rot==='270') ? dx : dz;
          const undoKey = `labs_undo_${safeOwner}_${Date.now()}`;
          try {
            try{ placeTempStructureBlock(dim, { x: x1, y: y1, z: z1 }); }catch{}
            player.runCommandAsync(`structure save ${undoKey} ${x1} ${y1} ${z1} ${x2} ${y2} ${z2} true true`)
              .then(() => player.runCommandAsync(`fill ${x1} ${y1} ${z1} ${x2} ${y2} ${z2} air`))
              .then(() => player.runCommandAsync(`structure load ${undoKey} ${x1} ${y1} ${z1} ${rot} none 1.00`))
              .then(() => { try { player.sendMessage(`Rotated selection ${rot}°.`); } catch {} })
              .then(() => { showUndoPrompt(player, dim, { x1, y1, z1, x2: x1 + w - 1, y2: y1 + dy - 1, z2: z1 + d - 1 }, undoKey, { x: x1, y: y1, z: z1 }); })
              .catch(() => { try { player.sendMessage(`Rotation ${rot}° failed. Make sure you have permissions for structure commands.`); } catch {} })
              .finally(() => { try { SELECT.delete(player.id); } catch {} });
          } catch {}
          return;
        }
        if (choice === 0) {
          // Name & Save -> prompt for name (respect per-player limit)
          const existing = getPlayerBlueprintNames(player).length;
          if (existing >= MAX_BPS_PER_PLAYER) {
            try { player.sendMessage(`You already have ${existing}/${MAX_BPS_PER_PLAYER} constructions. Delete one to save a new one.`); } catch {}
            showManageBlueprints(player);
            return;
          }
          const defName = `construct${AUTONAME}`;
          const nameForm = new ModalFormData()
            .title("Name your construction")
            .textField("Enter a name:", "my_build", defName);
          system.run(() => {
            nameForm.show(player).then(nameRes => {
              if (!nameRes || nameRes.canceled) return;
              const nameValRaw = String(nameRes.formValues?.[0] ?? defName).trim() || defName;
              const dim = player.dimension;
              if (!st.dim || st.dim.id !== dim.id) { SELECT.delete(player.id); return; }
              const capture = captureRegion(dim, st.p1, pos);
              const count = capture.blocks.length;
              const resReg = registerBlueprintForPlayer(player, nameValRaw, capture);
              if (!resReg.ok) {
                try { player.sendMessage("Save failed (limit). Delete one of your constructions."); } catch {}
              } else {
                AUTONAME++;
                try {
                  player.sendMessage(`Saved '${resReg.name}' with ${count} blocks (${capture.size.dx}x${capture.size.dy}x${capture.size.dz}).`);
                  player.onScreenDisplay.setTitle("Constructor: Saved");
                } catch {}
                // Also save a .mcstructure file for persistence/export, and index it
                try {
                  const safeName = `${player.name.replace(/[^A-Za-z0-9_\-]/g, '_')}_${resReg.name}`.toLowerCase();
                  const fileKey = `labs/${safeName}`;
                  const cmd = `structure save ${fileKey} ${x1} ${y1} ${z1} ${x2} ${y2} ${z2} true true`;
                  player.dimension.runCommandAsync?.(cmd);
                  // attach file reference to blueprint
                  try{ const bp = BLUEPRINTS.get(resReg.name); if (bp){ bp.structFile = fileKey; BLUEPRINTS.set(resReg.name, bp); } }catch{}
                  // update persistence index for player's name
                  try{
                    const pkey = player?.name || getPlayerKey(player);
                    const arr = Array.isArray(INDEX[pkey]) ? INDEX[pkey] : [];
                    arr.push({ name: resReg.name, file: fileKey, size: capture.size });
                    INDEX[pkey] = arr;
                    // also mirror PLAYER_BPS under name key for future lookups
                    const listByName = (PLAYER_BPS.get(pkey) || []).slice(0);
                    if (!listByName.includes(resReg.name)) { listByName.push(resReg.name); PLAYER_BPS.set(pkey, listByName); }
                    saveIndex();
                  }catch{}
                } catch {}
              }
              SELECT.delete(player.id);
            }).catch(() => {});
          });
          return;
        }
        // Cancel -> keep current state, do nothing
      }).catch(() => {});
    });
  } catch {}
}

function handleStickUse(player, block) {
  if (!player || !block) return;
  const dim = player.dimension;
  const pos = toBlockPos(block.location);
  const st = SELECT.get(player.id) || { stage: 0 };
  const now = Date.now();
  if (st.lastPromptAt && now - st.lastPromptAt < 200) return; // debounce double fire
  if (st.stage === 0) {
    SELECT.set(player.id, { stage: 0, lastPromptAt: now });
    showStartPrompt(player, pos);
  } else {
    if (!st.dim || st.dim.id !== dim.id) { SELECT.delete(player.id); return; }
    SELECT.set(player.id, { ...st, lastPromptAt: now });
    try {
      player.onScreenDisplay.setActionBar(`Second corner at ${pos.x}, ${pos.y}, ${pos.z}`);
    } catch {}
    showFinalizePrompt(player, st, pos);
  }
}

// Stick selects two corners via confirmations (use both before and after; debounce prevents double)
const ENABLE_CONSTRUCTOR_STICK = false;
try {
  if (ENABLE_CONSTRUCTOR_STICK) {
    world.beforeEvents.itemUseOn.subscribe(ev => {
      const { source: player, itemStack, block } = ev;
      if (!player || !block) return;
      if (!isStickInHand(player, itemStack)) return;
      try { player.onScreenDisplay.setActionBar("Constructor: Stick click"); } catch {}
      handleStickUse(player, block);
    });
    world.afterEvents.itemUseOn.subscribe(ev => {
      const { source: player, itemStack, block } = ev;
      if (!player || !block) return;
      if (!isStickInHand(player, itemStack)) return;
      handleStickUse(player, block);
    });
  }
} catch {}

// Compact fine-tune controls: use stick in air while preview is active
try {
  world.beforeEvents.itemUse.subscribe(ev => {
    try {
      const p = ev?.source; const it = ev?.itemStack || ev?.item; const id = String(it?.typeId||"");
      if (!p || id !== "minecraft:stick") return;
      const st = PREVIEW.get(p.id);
      if (!st) return; // not fine-tuning
      // prevent other stick menus from opening if possible
      try { ev.cancel = true; } catch {}

      // Determine movement based on camera
      const rot = p.getRotation?.() || {};
      const yaw = typeof rot.y === 'number' ? rot.y : 0; // horizontal
      const pitch = typeof rot.x === 'number' ? rot.x : 0; // vertical (+down)
      const o = st.origin;
      const step = st.step || 1;

      // Tap detection for Place/Cancel
      const now = Date.now();
      const recent = now - (st.lastTapAt || 0);
      if (recent < 300) { st.tapCount = (st.tapCount || 1) + 1; } else { st.tapCount = 1; }
      st.lastTapAt = now;

      if (st.tapCount >= 3) {
        // triple-tap -> cancel
        endFineTune(p, "Placement canceled.");
        return;
      }
      if (st.tapCount === 2) {
        // double-tap -> place
        try {
          const dim = world.getDimension(st.dimId);
          const bot = dim.getEntities({ type: "myname:constructor_bot" }).find(b => b.id === st.botId);
          if (bot) { startBuildJob(bot, p.name, st.bpName, st.origin); }
        } catch {}
        endFineTune(p);
        return;
      }

      // Sneak + single tap -> toggle step 1/5 (no movement)
      const sneaking = !!(p?.isSneaking ?? false);
      if (st.tapCount === 1 && sneaking) {
        st.step = st.step === 1 ? 5 : 1;
        PREVIEW.set(p.id, st);
        try { p.onScreenDisplay.setActionBar(`Fine-tune: step ${st.step}. origin ${o.x},${o.y},${o.z} — dbl-tap=Place, tpl-tap=Cancel, click block=center`); } catch {}
        try { const dim = world.getDimension(st.dimId); drawPreview(dim, st.origin, st.size); } catch {}
        return;
      }

      // Single tap -> nudge
      if (pitch < -35) {
        // look up -> move up
        o.y += step;
      } else if (pitch > 35) {
        // look down -> move down
        o.y -= step;
      } else {
        // horizontal move along facing axis
        const rad = (yaw * Math.PI) / 180;
        const dirX = Math.round(-Math.sin(rad));
        const dirZ = Math.round(Math.cos(rad));
        o.x += dirX * step;
        o.z += dirZ * step;
      }

      PREVIEW.set(p.id, st);
      try { p.onScreenDisplay.setActionBar(`Fine-tune: origin ${o.x},${o.y},${o.z} (step ${step}) — dbl-tap=Place, tpl-tap=Cancel, sneak+tap=Step 1/5, hold sneak=Confirm, click block=center`); } catch {}
      try { const dim = world.getDimension(st.dimId); drawPreview(dim, st.origin, st.size); } catch {}
    } catch {}
  });
} catch {}

function getPlayerKey(player) {
  return player?.id || player?.name || "unknown";
}

function getPlayerBlueprintNames(player) {
  try{
    const byId = player?.id; const byName = player?.name;
    const arr = (byId && PLAYER_BPS.get(byId)) || (byName && PLAYER_BPS.get(byName)) || [];
    return arr.slice(0);
  }catch{ return []; }
}

function ensureUniqueName(base) {
  let name = base;
  let i = 1;
  while (BLUEPRINTS.has(name)) {
    name = `${base}_${i++}`;
  }
  return name;
}

function registerBlueprintForPlayer(player, name, data) {
  const key = getPlayerKey(player);
  const list = PLAYER_BPS.get(key) || [];
  if (list.length >= MAX_BPS_PER_PLAYER) return { ok: false, reason: "limit" };
  const unique = ensureUniqueName(name);
  const record = { ...data, ownerId: key, ownerName: player?.name };
  BLUEPRINTS.set(unique, record);
  list.push(unique);
  PLAYER_BPS.set(key, list);
  return { ok: true, name: unique };
}

function deleteBlueprintForPlayer(player, name) {
  const key = getPlayerKey(player);
  // remove from both id and name keyed lists
  const listById = (PLAYER_BPS.get(key) || []).filter(n=>String(n).toLowerCase()!==String(name).toLowerCase());
  PLAYER_BPS.set(key, listById);
  const nm = player?.name;
  if (nm) {
    const listByName = (PLAYER_BPS.get(nm) || []).filter(n=>String(n).toLowerCase()!==String(name).toLowerCase());
    PLAYER_BPS.set(nm, listByName);
  }
  BLUEPRINTS.delete(name);
  // update persistence index (case-insensitive)
  try{
    const pkey = (player?.name || key);
    const arr = Array.isArray(INDEX[pkey]) ? INDEX[pkey] : [];
    INDEX[pkey] = arr.filter(it=> String(it?.name||"").toLowerCase() !== String(name).toLowerCase());
    saveIndex();
  }catch{}
}

function renameBlueprintForPlayer(player, oldName, newName) {
  const key = getPlayerKey(player);
  // update list for both id and name keys (case-insensitive match)
  const updateList = (k)=>{
    const lst = (PLAYER_BPS.get(k)||[]).map(n=> String(n).toLowerCase()===String(oldName).toLowerCase()? unique : n);
    PLAYER_BPS.set(k, lst);
  };
  const unique = ensureUniqueName(newName);
  const bp = BLUEPRINTS.get(oldName);
  if (!bp) return { ok: false };
  BLUEPRINTS.delete(oldName);
  BLUEPRINTS.set(unique, { ...bp });
  updateList(key);
  if (player?.name) updateList(player.name);
  // update persistence index (rename label only; keep file path)
  try{
    const pkey = player?.name || key;
    const arr = Array.isArray(INDEX[pkey]) ? INDEX[pkey] : [];
    for (const it of arr){ if (String(it?.name||"").toLowerCase() === String(oldName).toLowerCase()) { it.name = unique; break; } }
    INDEX[pkey] = arr;
    saveIndex();
  }catch{}
  return { ok: true, name: unique };
}

// Chat command: !constructs (list)
try {
  world.beforeEvents.chatSend.subscribe(ev => {
    const msg = (ev.message || "").trim();
    const player = ev.sender;
    if (!player || !msg) return;
    const lower = msg.toLowerCase();
    if (lower === "!constructs" || lower === "!constructs list") {
      ev.cancel = true;
      const names = getPlayerBlueprintNames(player);
      const count = names.length;
      if (count === 0) {
        try { player.sendMessage("You have no saved constructions. Use the stick to create one."); } catch {}
        return;
      }
      const lines = [
        `You have ${count}/${MAX_BPS_PER_PLAYER} constructions:`,
        ...names.map((n,i)=> `${i+1}. ${n}`),
        "Use the stick, click No, then Manage to rename or delete.",
        "Tip: Use !constructs clear to wipe your saved index."
      ];
      try { player.sendMessage(lines.join("\n")); } catch {}
    } else if (lower === "!constructs clear") {
      ev.cancel = true;
      try {
        // Clear persistent index for this player's name
        const pkey = player?.name || player?.id;
        const raw = world.getDynamicProperty?.(INDEX_KEY);
        const idxAll = raw && typeof raw==='string' ? JSON.parse(raw) : {};
        idxAll[pkey] = [];
        const s = JSON.stringify(idxAll||{});
        world.setDynamicProperty?.(INDEX_KEY, s.length>7900?s.slice(0,7900):s);
        // Clear in-memory lists
        PLAYER_BPS.set(player?.id, []);
        if (player?.name) PLAYER_BPS.set(player.name, []);
        player.sendMessage("Cleared your saved structures index.");
      } catch {}
    }
  });
} catch {}

function listBlueprintNames() {
  return Array.from(BLUEPRINTS.keys());
}

function scheduleLayerBuildJob(bot, ownerName, bp, origin, center) {
  const total = Array.isArray(bp.blocks) ? bp.blocks.length : 0;
  JOBS.set(bot.id, {
    name: Array.from(BLUEPRINTS.keys()).find(k => BLUEPRINTS.get(k) === bp) || "bp",
    blocks: bp.blocks || [],
    total,
    origin,
    center,
    ownerName,
    layer: 0,
    nextAt: 0,
    size: bp.size,
    reverse: true
  });
  try { bot.nameTag = "Constructor"; } catch {}
}

function createSafePlatform(dim, center, y, size=5){
  try{
    const half = Math.floor(size/2);
    for(let dx=-half; dx<=half; dx++){
      for(let dz=-half; dz<=half; dz++){
        try{ dim.getBlock({ x: Math.floor(center.x)+dx, y: Math.floor(y), z: Math.floor(center.z)+dz })?.setType("minecraft:glass"); }catch{}
      }
    }
  }catch{}
}
function applySlowFalling(dim, ownerName, spot){
  try{
    const x=Math.floor(spot.x), y=Math.floor(spot.y), z=Math.floor(spot.z);
    dim.runCommandAsync?.(`effect "${ownerName}" slow_falling 60 1 true`);
    dim.runCommandAsync?.(`effect @e[type=myname:constructor_bot,x=${x},y=${y},z=${z},r=6] slow_falling 60 1 true`);
  }catch{}
}
function startBuildJob(bot, ownerName, bpName, originOverride) {
  const bp = BLUEPRINTS.get(bpName);
  if (!bp) return false;
  const center = { x: Math.floor(bp.size.dx / 2), z: Math.floor(bp.size.dz / 2) };
  const origin = originOverride || { x: Math.floor(bot.location.x) - center.x, y: Math.floor(bot.location.y), z: Math.floor(bot.location.z) - center.z };
  // Move bot to far side outside build volume to avoid suffocation
  const farZ = origin.z + bp.size.dz + 1;
  const safeSpot = { x: origin.x + center.x + 0.5, y: origin.y + 2, z: farZ + 0.5 };
  // Build a 5x5 glass platform at the safe spot and stand on it
  const platformY = Math.floor(safeSpot.y) - 1;
  try{ createSafePlatform(bot.dimension, safeSpot, platformY, 5); }catch{}
  try { bot.teleport({ x: safeSpot.x, y: platformY + 1, z: safeSpot.z }, { dimension: bot.dimension, rotation: { x: 0, y: 180 }, keepVelocity: false, checkForBlocks: true }); } catch {}
  // Also move the owner player to the platform and grant slow falling to both
  try {
    const owner = world.getPlayers().find(p => p.name === ownerName && p.dimension.id === bot.dimension.id);
    if (owner) {
      const playerSafe = { x: safeSpot.x, y: platformY + 1, z: safeSpot.z + 2 };
      owner.teleport(playerSafe, { dimension: bot.dimension, keepVelocity: false, checkForBlocks: true });
      try{ applySlowFalling(bot.dimension, ownerName, playerSafe); }catch{}
    } else {
      try{ applySlowFalling(bot.dimension, ownerName, { x: safeSpot.x, y: platformY + 1, z: safeSpot.z }); }catch{}
    }
  } catch {}
  // Fast path: if a persisted structure file exists, try to load it; on failure, fallback to layer job
  try{
    if (bp.structFile) {
      const cmd = `structure load ${bp.structFile} ${origin.x} ${origin.y} ${origin.z}`;
      try { bot.nameTag = "Constructor"; } catch {}
      bot.dimension.runCommandAsync?.(cmd).then(res=>{
        const ok = !!res && (res.successCount>0 || res.statusCode===0 || String(res.statusMessage||"").toLowerCase().includes("success"));
        if (ok) {
          try { bot.nameTag = "Constructor"; } catch {}
          try { const owner = world.getPlayers().find(p => p.name === ownerName && p.dimension.id === bot.dimension.id); owner?.sendMessage(`Constructor placed '${bpName}'.`); } catch {}
        } else {
          if (!Array.isArray(bp.blocks) || bp.blocks.length===0){ try{ world.getDimension("overworld").runCommandAsync(`tellraw \"${ownerName}\" {\"rawtext\":[{\"text\":\"Constructor: structure file unavailable; please re-save this construct this session.\"}]}`); }catch{} }
          scheduleLayerBuildJob(bot, ownerName, bp, origin, center);
        }
      }).catch(()=>{
        if (!Array.isArray(bp.blocks) || bp.blocks.length===0){ try{ world.getDimension("overworld").runCommandAsync(`tellraw \"${ownerName}\" {\"rawtext\":[{\"text\":\"Constructor: structure load failed and no block data persisted. Re-save the construct.\"}]}`); }catch{} }
        scheduleLayerBuildJob(bot, ownerName, bp, origin, center);
      });
      return true;
    }
  }catch{}
  // Fallback: layer-by-layer manual placement
  scheduleLayerBuildJob(bot, ownerName, bp, origin, center);
  return true;
}

// Bot spawn: pick a blueprint to build
try {
  world.afterEvents.entitySpawn.subscribe(ev => {
    const e = ev.entity;
    if (!e || e.typeId !== "myname:constructor_bot") return;
    // Find nearest player
    let nearest = null, best = 999999;
    for (const p of world.getPlayers()) {
      if (p.dimension.id !== e.dimension.id) continue;
      const dx = p.location.x - e.location.x;
      const dz = p.location.z - e.location.z;
      const d2 = dx*dx + dz*dz;
      if (d2 < best) { best = d2; nearest = p; }
    }
    const all = listBlueprintNames();
    if (all.length === 0) {
      try {
        e.nameTag = "Constructor";
        nearest?.sendMessage("No blueprints saved. Use a stick to select a region, then name it.");
      } catch {}
      return;
    }
    let own = nearest ? getPlayerBlueprintNames(nearest) : [];
    const names = (own && own.length) ? own : all;
    const form = new ModalFormData().title("Build which?").dropdown("Blueprint", names, 0);
    if (!nearest) return;
    form.show(nearest).then(res => {
      if (!res || res.canceled) return;
      const idx = res.formValues?.[0] ?? 0;
      const name = names[idx] || names[0];
      // After choosing blueprint, ask Place or Fine Tune
      const pf = new ActionFormData().title("Placement").body("Place now or fine tune the position?")
        .button("Place Now")
        .button("Fine Tune");
      pf.show(nearest).then(pr=>{
        if (!pr || pr.canceled) return;
        if (pr.selection===0){ startBuildJob(e, nearest.name, name); return; }
        if (pr.selection===1){ beginFineTune(nearest, e, name); }
      }).catch(()=>{});
    }).catch(() => {});
  });
} catch {}

// Build loop: place one full layer every 5 seconds
system.runInterval(() => {
  for (const player of world.getPlayers()) {
    const dim = player.dimension;
    const bots = dim.getEntities({ type: "myname:constructor_bot" });
    for (const bot of bots) {
      const job = JOBS.get(bot.id);
      if (!job) continue;
      const now = Date.now();
      if (job.nextAt && now < job.nextAt) continue;
      const layer = job.layer;
      if (layer >= job.size.dy) {
        try { bot.nameTag = "Constructor"; } catch {}
        const owner = world.getPlayers().find(p => p.name === job.ownerName);
        try {
          // If this is the default blueprint, try to add items to the chest
          if (job.name === "wood_shack" && job.size) {
            const chestPos = BLUEPRINTS.get("wood_shack")?.meta?.chestPos;
            if (chestPos) {
              const cx = job.origin.x + chestPos.x;
              const cy = job.origin.y + chestPos.y;
              const cz = job.origin.z + chestPos.z;
              try {
                const cblk = dim.getBlock({ x: cx, y: cy, z: cz });
                const inv = cblk?.getComponent?.("minecraft:inventory");
                const cont = inv?.container;
                if (cont) {
                  cont.setItem(0, new ItemStack("minecraft:bread", 10));
                  cont.setItem(1, new ItemStack("minecraft:diamond", 2));
                }
              } catch {}
            }
          }
          owner?.sendMessage(`Constructor finished '${job.name}'.`);
          owner?.onScreenDisplay.setTitle("Constructor: Done");
          if (typeof dim.playSound === "function") dim.playSound("block.bell.use", bot.location, { volume: 1, pitch: 1 });
        } catch {}
        JOBS.delete(bot.id);
        continue;
      }
      // Place entire layer (reverse order along Z to build from far side toward origin)
      const layerBlocks = job.blocks.filter(b => b.dy === layer).sort((a,b)=> (job.reverse ? b.dz - a.dz : a.dz - b.dz));
      for (const b of layerBlocks) {
        const x = job.origin.x + b.dx;
        const y = job.origin.y + b.dy;
        const z = job.origin.z + b.dz;
        try {
          const blk = dim.getBlock({ x, y, z });
          if (blk) {
            if (b.states && typeof BlockPermutation?.resolve === 'function') {
              try { const perm = BlockPermutation.resolve(b.typeId, b.states); blk.setPermutation(perm); }
              catch { try { blk.setType(b.typeId); } catch {} }
            } else {
              try { blk.setType(b.typeId); } catch {}
            }
          }
        } catch {}
      }
      job.layer++;
      job.nextAt = now + LAYER_INTERVAL_MS;
      JOBS.set(bot.id, job);
    }
  }
}, 5);

// Drop own egg on death
try {
  world.afterEvents.entityDie.subscribe(ev => {
    const e = ev.deadEntity;
    if (!e || e.typeId !== "myname:constructor_bot") return;
    try { if (e.getTags?.()?.includes("labs_retrieved")) return; } catch {}
    try {
      const egg = new ItemStack("myname:constructor_bot_spawn_egg", 1);
      e.dimension.spawnItem(egg, e.location);
    } catch {}
  });
} catch {}
