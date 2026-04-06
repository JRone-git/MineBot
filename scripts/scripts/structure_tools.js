// Structure Tools: Lava Chicken Stand placer for OPs
import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import PRIVATE_STRUCTS_CFG from "../config/private_structs.js";

const STRUCT_NAME = "LAVACHICKEN"; // expects LABS Behavior/structures/LAVACHICKEN.mcstructure

function round(n) { return Math.floor(Number(n)||0); }

function forwardDir(player){
  try {
    const r = player.getRotation?.();
    const yaw = (r && typeof r.y === 'number') ? r.y : 0;
    const rad = (yaw * Math.PI) / 180;
    const dx = -Math.sin(rad);
    const dz =  Math.cos(rad);
    // snap to cardinal to reduce odd offsets
    const sx = Math.abs(dx) > Math.abs(dz) ? Math.sign(dx) : 0;
    const sz = Math.abs(dz) >= Math.abs(dx) ? Math.sign(dz) : 0;
    return { x: sx, z: sz };
  } catch { return { x: 0, z: 1 }; }
}

function findGroundY(dim, ax, ay, az){
  let y = ay;
  try {
    let found = false;
    for (let dy = 0; dy <= 6; dy++){
      const b = dim.getBlock({ x: ax, y: ay - dy, z: az });
      if (b && String(b.typeId||"") !== "minecraft:air"){ y = (ay - dy) + 1; found = true; break; }
    }
    if (!found){
      for (let dy = 1; dy <= 6; dy++){
        const b = dim.getBlock({ x: ax, y: ay + dy, z: az });
        if (b && String(b.typeId||"") === "minecraft:air"){ y = ay + dy; found = true; break; }
      }
    }
  } catch {}
  return y;
}

function computeAnchor(player, fwd=0, left=0, up=0){
  const dim = player.dimension;
  const base = { x: round(player.location.x), y: round(player.location.y), z: round(player.location.z) };
  const dir = forwardDir(player);
  const fx = dir.x, fz = dir.z;
  const lx = -fz, lz = fx;
  let ax = base.x + fx*3 + fx*(Number(fwd)||0) + lx*(Number(left)||0);
  let az = base.z + fz*3 + fz*(Number(fwd)||0) + lz*(Number(left)||0);
  let ay = findGroundY(dim, ax, base.y, az) + (Number(up)||0);
  return { ax, ay, az };
}

async function placeStructure(dim, x, y, z, rot, includeEntities=true){
  const rotation = rot || "0_degrees"; // 0_degrees | 90_degrees | 180_degrees | 270_degrees
  const ent = includeEntities ? "true" : "false";
  const cmd = `structure load ${STRUCT_NAME} ${x} ${y} ${z} ${rotation} none layer_by_layer 0.0 ${ent} true false 100`;
  try { return await dim.runCommandAsync(cmd); } catch (e) { return Promise.reject(e); }
}

function cleanupEntities(dim, anchor, w, h, d){
  const dx = Math.max(0, (w|0) - 1), dy = Math.max(0, (h|0) - 1), dz = Math.max(0, (d|0) - 1);
  const x = anchor.x, y = anchor.y, z = anchor.z;
  const cmds = [
    `kill @e[type=minecraft:chicken,x=${x},y=${y},z=${z},dx=${dx},dy=${dy},dz=${dz}]`,
    `kill @e[type=minecraft:villager_v2,x=${x},y=${y},z=${z},dx=${dx},dy=${dy},dz=${dz}]`,
    `kill @e[type=minecraft:villager,x=${x},y=${y},z=${z},dx=${dx},dy=${dy},dz=${dz}]`
  ];
  for (const c of cmds){ try { dim.runCommandAsync(c).catch(()=>{}); } catch {}
  }
}

const ROT_BOUNDS = new Map(); // playerId -> {w,h,d}

function showManageMenu(player, anchor){
  const dim = player.dimension;
  const rotOpts = ["0_degrees","90_degrees","180_degrees","270_degrees"];
  const af = new ActionFormData().title("Lava Chicken Stand").body("Manage placement:")
    .button("Rotate 90°")
    .button("Rotate 180°")
    .button("Rotate 270°")
    .button("Delete placement")
    .button("Exit");
  af.show(player).then(res => {
    if (!res || res.canceled) return;
    const sel = res.selection;
    if (sel === 0 || sel === 1 || sel === 2){
      const rot = rotOpts[sel+1];
      // Ask bounds so we can clean up old entities before rotating
      const cur = ROT_BOUNDS.get(player.id) || { w:12, h:12, d:12 };
      const mf = new ModalFormData().title("Rotate Structure")
        .textField("Width (X)", "e.g. 12", String(cur.w))
        .textField("Height (Y)", "e.g. 12", String(cur.h))
        .textField("Depth (Z)", "e.g. 12", String(cur.d));
      mf.show(player).then(fr => {
        if (!fr || fr.canceled) return;
        const w = Math.max(1, round(fr.formValues?.[0]));
        const h = Math.max(1, round(fr.formValues?.[1]));
        const d = Math.max(1, round(fr.formValues?.[2]));
        ROT_BOUNDS.set(player.id, { w, h, d });
        cleanupEntities(dim, anchor, w, h, d);
        placeStructure(dim, anchor.x, anchor.y, anchor.z, rot, /*includeEntities*/ true).then(()=>{
          try { player.sendMessage(`Rotated to ${rot.replace('_',' ')}.`); } catch {}
          system.runTimeout(()=>showManageMenu(player, anchor), 1);
        }).catch(()=>{ try{ player.sendMessage("Rotate failed. Is the structure available?"); }catch{} });
      }).catch(()=>{});
    } else if (sel === 3){
      const cur = ROT_BOUNDS.get(player.id) || { w:12, h:12, d:12 };
      const mf = new ModalFormData().title("Delete Placement")
        .textField("Width (X)", "e.g. 12", String(cur.w))
        .textField("Height (Y)", "e.g. 12", String(cur.h))
        .textField("Depth (Z)", "e.g. 12", String(cur.d));
      mf.show(player).then(fr => {
        if (!fr || fr.canceled) return;
        const w = Math.max(1, round(fr.formValues?.[0]));
        const h = Math.max(1, round(fr.formValues?.[1]));
        const d = Math.max(1, round(fr.formValues?.[2]));
        ROT_BOUNDS.set(player.id, { w, h, d });
        // cleanup entities inside box first
        cleanupEntities(dim, anchor, w, h, d);
        const x2 = anchor.x + (w - 1);
        const y2 = anchor.y + (h - 1);
        const z2 = anchor.z + (d - 1);
        const cmd = `fill ${anchor.x} ${anchor.y} ${anchor.z} ${x2} ${y2} ${z2} air replace`;
        try { dim.runCommandAsync(cmd).then(()=>{ try{ player.sendMessage("Placement cleared."); }catch{}; }); } catch {}
      }).catch(()=>{});
    } else {
      // Exit
    }
  }).catch(()=>{});
}

function placeLavaChickenStand(player){
  // OP-only guard (use labs_admin tag as in rest of LABS)
  try { if (!player.hasTag || !player.hasTag("labs_admin")) { player.sendMessage("OP only. /tag @s add labs_admin"); return; } } catch {}
  const dim = player.dimension;
  const base = { x: round(player.location.x), y: round(player.location.y), z: round(player.location.z) };
  const dir = forwardDir(player);
  let ax = base.x + dir.x * 3;
  let az = base.z + dir.z * 3;
  // Find ground at target column: search down up to 6, then up to 6
  let ay = base.y;
  try {
    let found = false;
    for (let dy = 0; dy <= 6; dy++){
      const b = dim.getBlock({ x: ax, y: base.y - dy, z: az });
      if (b && String(b.typeId||"") !== "minecraft:air"){ ay = (base.y - dy) + 1; found = true; break; }
    }
    if (!found){
      for (let dy = 1; dy <= 6; dy++){
        const b = dim.getBlock({ x: ax, y: base.y + dy, z: az });
        if (b && String(b.typeId||"") === "minecraft:air"){ ay = base.y + dy; found = true; break; }
      }
    }
  } catch {}
  const anchor = { x: ax, y: ay, z: az };
  placeStructure(dim, anchor.x, anchor.y, anchor.z, "0_degrees").then(()=>{
    try { player.onScreenDisplay?.setTitle("Lava Chicken Stand placed"); } catch {}
    showManageMenu(player, anchor);
  }).catch(()=>{
    try { player.sendMessage("Failed to place structure. Ensure LAVACHICKEN.mcstructure is in the pack's structures folder."); } catch {}
  });
}

// Expose for other menus (stick Quick menu)
try{ globalThis.LABS_placeLavaChickenStand = placeLavaChickenStand; } catch {}

// Chat command: !lavachicken
try{
  world.beforeEvents.chatSend.subscribe(ev => {
    try{
      const raw = String(ev.message||"").trim(); if (!raw) return;
      const low = raw.toLowerCase();
      if (low === "!lavachicken" || low === "/lavachicken" || low === "!lava_chicken_stand"){
        ev.cancel = true;
        const p = ev.sender; if (!p) return;
        placeLavaChickenStand(p);
      }
    }catch{}
  });
} catch {}

// --- OP Private Structures Menu ---
// Config-driven list of structures from scripts/config/private_structs.js
function labelFromKey(key){
  try{
  const base = String(key||"").replace(/^private\//, "");
    return base.replace(/_/g, " ");
 }catch{ return String(key||""); }
}

// Normalize config into array of { key, label, includeEntities, defaultRotation }
const PRIVATE_ENTRIES = (function(){
try{
    const raw = Array.isArray(PRIVATE_STRUCTS_CFG) ? PRIVATE_STRUCTS_CFG : [];
    const ROTS = new Set(["0_degrees","90_degrees","180_degrees","270_degrees"]);
    const out = [];
    for (const it of raw){
      if (typeof it === 'string'){
        out.push({ key: it, label: labelFromKey(it), includeEntities: true, defaultRotation: "0_degrees" });
      } else if (it && typeof it === 'object' && typeof it.key === 'string'){
        const key = String(it.key);
        const label = String(it.label || labelFromKey(key));
        const includeEntities = (typeof it.includeEntities === 'boolean') ? it.includeEntities : true;
        const defRot = ROTS.has(it.defaultRotation) ? it.defaultRotation : "0_degrees";
        out.push({ key, label, includeEntities, defaultRotation: defRot });
      }
    }
    return out;
  }catch{ return []; }
})();

async function placeStructureByName(structKey, dim, x, y, z, rot, includeEntities=true){
  const rotation = rot || "0_degrees";
  const ent = includeEntities ? "true" : "false";
  // Try multiple key forms: colon (preferred), slash, and basename
  const rotMap = {"0_degrees":"0","90_degrees":"90","180_degrees":"180","270_degrees":"270"};
  const keyStr = String(structKey||"").trim();
  const colon = keyStr.includes(":") ? keyStr : keyStr.replace("/", ":");
  const slash = keyStr;
  const base = keyStr.split(/[/:]/).pop();
  const forms = Array.from(new Set([colon, slash, base].filter(Boolean)));
  for (const k of forms){
    const cmdA = `structure load ${k} ${x} ${y} ${z} ${rotation} none layer_by_layer 0.0 ${ent} true false 100`;
    try { return await dim.runCommandAsync(cmdA); } catch {}
    const r2 = rotMap[rotation] || "0";
    const cmdB = `structure load ${k} ${x} ${y} ${z} ${r2} none 1.00`;
    try { return await dim.runCommandAsync(cmdB); } catch {}
  }
  // If all attempts failed, bubble the original error
  throw new Error(`Structure not found: ${structKey}`);

}

function showManageMenuFor(player, anchor, structKey){
  const dim = player.dimension;
  const rotOpts = ["0_degrees","90_degrees","180_degrees","270_degrees"];
  const af = new ActionFormData().title(`Private: ${labelFromKey(structKey)}`).body("Manage placement:")
    .button("Rotate 90°")
    .button("Rotate 180°")
    .button("Rotate 270°")
    .button("Delete placement")
    .button("Exit");
  af.show(player).then(res => {
    if (!res || res.canceled) return;
    const sel = res.selection;
    if (sel === 0 || sel === 1 || sel === 2){
      const rot = rotOpts[sel+1];
      const cur = ROT_BOUNDS.get(player.id) || { w:12, h:12, d:12 };
      const mf = new ModalFormData().title("Rotate Structure")
        .textField("Width (X)", "e.g. 12", String(cur.w))
        .textField("Height (Y)", "e.g. 12", String(cur.h))
        .textField("Depth (Z)", "e.g. 12", String(cur.d));
      mf.show(player).then(fr => {
        if (!fr || fr.canceled) return;
        const w = Math.max(1, round(fr.formValues?.[0]));
        const h = Math.max(1, round(fr.formValues?.[1]));
        const d = Math.max(1, round(fr.formValues?.[2]));
        ROT_BOUNDS.set(player.id, { w, h, d });
        cleanupEntities(dim, anchor, w, h, d);
        placeStructureByName(structKey, dim, anchor.x, anchor.y, anchor.z, rot, /*includeEntities*/ true).then(()=>{
          try { player.sendMessage(`Rotated to ${rot.replace('_',' ')}.`); } catch {}
          system.runTimeout(()=>showManageMenuFor(player, anchor, structKey), 1);
        }).catch(()=>{ try{ player.sendMessage("Rotate failed. Is the structure available?"); }catch{} });
      }).catch(()=>{});
    } else if (sel === 3){
      const cur = ROT_BOUNDS.get(player.id) || { w:12, h:12, d:12 };
      const mf = new ModalFormData().title("Delete Placement")
        .textField("Width (X)", "e.g. 12", String(cur.w))
        .textField("Height (Y)", "e.g. 12", String(cur.h))
        .textField("Depth (Z)", "e.g. 12", String(cur.d));
      mf.show(player).then(fr => {
        if (!fr || fr.canceled) return;
        const w = Math.max(1, round(fr.formValues?.[0]));
        const h = Math.max(1, round(fr.formValues?.[1]));
        const d = Math.max(1, round(fr.formValues?.[2]));
        ROT_BOUNDS.set(player.id, { w, h, d });
        cleanupEntities(dim, anchor, w, h, d);
        const x2 = anchor.x + (w - 1);
        const y2 = anchor.y + (h - 1);
        const z2 = anchor.z + (d - 1);
        const cmd = `fill ${anchor.x} ${anchor.y} ${anchor.z} ${x2} ${y2} ${z2} air replace`;
        try { dim.runCommandAsync(cmd).then(()=>{ try{ player.sendMessage("Placement cleared."); }catch{}; }); } catch {}
      }).catch(()=>{});
    } else {
      // Exit
    }
  }).catch(()=>{});
}

function openOpsPrivateMenu(player){
  // OP-only guard
  try { if (!player.hasTag || !player.hasTag("labs_admin")) { player.sendMessage("OP only. /tag @s add labs_admin"); return; } } catch {}
  const info = "Put .mcstructure files into: behavior pack / LABS Behavior / structures / private. Then edit scripts/config/private_structs.js and restart the server.\nSelect from your config list or enter a key manually (e.g., private:MyCastle).";
  const hasList = Array.isArray(PRIVATE_ENTRIES) && PRIVATE_ENTRIES.length>0;
  const af = new ActionFormData().title("OP: Private Structures").body(info)
    .button("Select from Config")
    .button("Manual Enter Key")
    .button("Back");
  af.show(player).then(res=>{
    if (!res || res.canceled) {
      if (globalThis.showOpToolsMenu) system.runTimeout(() => globalThis.showOpToolsMenu(player), 1);
      return;
    }
    if (res.selection===2) {
      // Back to OP Tools Menu
      if (globalThis.showOpToolsMenu) {
        system.runTimeout(() => globalThis.showOpToolsMenu(player), 1);
      }
      return;
    }
    if (res.selection===1){
      // Manual entry
      const mf = new ModalFormData().title("Manual Structure Key")
        .textField("Structure key (e.g. private:MyCastle)", "private:Name", "")
        .dropdown("Rotation", ["0_degrees","90_degrees","180_degrees","270_degrees"], 0)
        .toggle("Include entities", true)
        .slider("Forward/Back (relative)", -16, 16, 1, 0)
        .slider("Left/Right (relative)", -16, 16, 1, 0)
        .slider("Up/Down", -16, 16, 1, 0);
      mf.show(player).then(fr=>{
        if (!fr || fr.canceled) return;
        const key = String(fr.formValues?.[0]||"").trim(); if (!key){ try{ player.sendMessage("No key entered."); }catch{} return; }
        const placeRot = ["0_degrees","90_degrees","180_degrees","270_degrees"][Number(fr.formValues?.[1]||0)|0] || "0_degrees";
        const includeEnt = !!fr.formValues?.[2];
        const offF = Number(fr.formValues?.[3]||0)|0;
        const offL = Number(fr.formValues?.[4]||0)|0;
        const offU = Number(fr.formValues?.[5]||0)|0;
        // Compute anchor with offsets and place
        try{
          const dim = player.dimension;
          const pos = computeAnchor(player, offF, offL, offU);
          const anchor = { x: pos.ax, y: pos.ay, z: pos.az };
          placeStructureByName(key, dim, anchor.x, anchor.y, anchor.z, placeRot, includeEnt).then(()=>{
            try { player.onScreenDisplay?.setTitle(`Placed: ${key}`); } catch {}
            showManageMenuFor(player, anchor, key);
          }).catch(()=>{ try{ player.sendMessage(`Failed to place '${key}'. Try using private:Name or check the file under structures/private.`); }catch{} });
        }catch{}
      }).catch(()=>{});
      return;
    }
    // Select from config
    if (!hasList){ try{ player.sendMessage("Your config list is empty. Use Manual Enter Key or edit scripts/config/private_structs.js."); }catch{} return; }
    const labels = PRIVATE_ENTRIES.map(e=>e.label);
    const sm = new ModalFormData().title("OP: Private Structures")
      .dropdown("Structure", labels, 0)
      .slider("Forward/Back (relative)", -16, 16, 1, 0)
      .slider("Left/Right (relative)", -16, 16, 1, 0)
      .slider("Up/Down", -16, 16, 1, 0);
    sm.show(player).then(fr=>{
      if (!fr || fr.canceled) return;
      const idx = Number(fr.formValues?.[0]||0)|0;
      const entry = PRIVATE_ENTRIES[idx]; if (!entry) return;
      const key = entry.key;
      const placeRot = entry.defaultRotation || "0_degrees";
      const includeEnt = (typeof entry.includeEntities === 'boolean') ? entry.includeEntities : true;
      const offF = Number(fr.formValues?.[1]||0)|0;
      const offL = Number(fr.formValues?.[2]||0)|0;
      const offU = Number(fr.formValues?.[3]||0)|0;
      try{
        const dim = player.dimension;
        const pos = computeAnchor(player, offF, offL, offU);
        const anchor = { x: pos.ax, y: pos.ay, z: pos.az };
        placeStructureByName(key, dim, anchor.x, anchor.y, anchor.z, placeRot, includeEnt).then(()=>{
          try { player.onScreenDisplay?.setTitle(`Placed: ${entry.label}`); } catch {}
          showManageMenuFor(player, anchor, key);
        }).catch(()=>{ try{ player.sendMessage(`Failed to place '${key}'. Ensure the file exists under structures/private.`); }catch{} });
      }catch{}
    }).catch(()=>{});
  }).catch(()=>{});
}

// Expose to stick Quick menu
try{ globalThis.LABS_openOpsPrivateMenu = openOpsPrivateMenu; } catch {}

// Chat command: !opsmenu (private structures)
try{
  world.beforeEvents.chatSend.subscribe(ev => {
    try{
      const raw = String(ev.message||"").trim(); if (!raw) return;
      const low = raw.toLowerCase();
      if (low === "!opsmenu" || low === "!opsmenu private"){
        ev.cancel = true;
        const p = ev.sender; if (!p) return;
        openOpsPrivateMenu(p);
      }
    }catch{}
  });
} catch {}
