// Structure Tools: Submarine (SUB1) placer and movement
import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

const STRUCT_NAME = "SUB1"; // expects LABS Behavior/structures/SUB1.mcstructure
const SUB_REG_KEY = "labs_sub_registry"; // world DP: { [ownerName]: [{anchor:{x,y,z},dim:string,size:{w,h,d},dir:{x,z},rot:string,btns:[{x,y,z},{x,y,z}],active:boolean,dive:boolean}] }

function round(n){ return Math.floor(Number(n)||0); }
function fwdDir(player){
  try{ const r=player.getRotation?.(); const yaw=(r&&typeof r.y==='number')?r.y:0; const rad=(yaw*Math.PI)/180; const dx=-Math.sin(rad), dz=Math.cos(rad); return Math.abs(dx)>=Math.abs(dz)?{x:Math.sign(dx),z:0}:{x:0,z:Math.sign(dz)}; }catch{return {x:0,z:1};}
}
function loadReg(){ try{ const raw=world.getDynamicProperty?.(SUB_REG_KEY); return raw && typeof raw==='string' ? JSON.parse(raw) : {}; }catch{return {};} }
function saveReg(obj){ try{ const s=JSON.stringify(obj||{}); world.setDynamicProperty?.(SUB_REG_KEY, s.length>7900?s.slice(0,7900):s); }catch{} }

async function placeStructure(dim, x,y,z, rot){
  const rotation = rot || "0_degrees";
  const cmd = `structure load ${STRUCT_NAME} ${x} ${y} ${z} ${rotation} none layer_by_layer 0.0 false true false 100`;
  try { return await dim.runCommandAsync(cmd); } catch (e) { return Promise.reject(e); }
}
function cleanupBox(dim, a, w,h,d){
  const x2=a.x+(w-1), y2=a.y+(h-1), z2=a.z+(d-1);
  try{ dim.runCommandAsync(`fill ${a.x} ${a.y} ${a.z} ${x2} ${y2} ${z2} air replace`).catch(()=>{}); }catch{}
}
function scanButtons(dim, a, w,h,d){
  const btns=[]; try{
    for(let y=0;y<h;y++) for(let x=0;x<w;x++) for(let z=0;z<d;z++){
      const pos={x:a.x+x,y:a.y+y,z:a.z+z}; const b=dim.getBlock(pos); if(!b) continue;
      const id=String(b.typeId||""); if (id.includes("button")) btns.push(pos);
      if (btns.length>=2) break;
    }
  }catch{}
  return btns.slice(0,2);
}

function registerSub(owner, dimId, anchor, size, dir, rot, btns){
  const R = loadReg(); const arr = Array.isArray(R[owner]) ? R[owner] : [];
  arr.push({ anchor, dim: dimId, size, dir, rot, btns, active:false, dive:false, seekOpen:true, seekDeep:false, pilot:null });
  R[owner]=arr; saveReg(R);
}
function updateSub(owner, idx, patch){ const R=loadReg(); const arr=Array.isArray(R[owner])?R[owner]:[]; if(arr[idx]){ Object.assign(arr[idx], patch||{}); R[owner]=arr; saveReg(R);} }
function removeSub(owner, idx){ const R=loadReg(); const arr=Array.isArray(R[owner])?R[owner]:[]; if(idx>=0&&idx<arr.length){ arr.splice(idx,1); R[owner]=arr; saveReg(R);} }

const TURN_COOLDOWN = new Map(); // owner -> ticks

function subFind(player){
  try{
    const R=loadReg(); const arr=Array.isArray(R[player.name])?R[player.name]:[]; const dim=player.dimension; const pos=player.location;
    for(let i=0;i<arr.length;i++){
      const s=arr[i]; if(s.dim!==dim.id) continue; const a=s.anchor, sz=s.size;
      if (pos.x>=a.x && pos.x<a.x+sz.w && pos.y>=a.y && pos.y<a.y+sz.h && pos.z>=a.z && pos.z<a.z+sz.d){ return { idx:i, sub:s, dim }; }
    }
  }catch{}
  return null;
}
function boardSub(player){ const f=subFind(player); if(!f) return false; const {idx,sub,dim}=f; if (sub.pilot && sub.pilot!==player.name) return false;
  try{
    const cx = sub.anchor.x + Math.floor(sub.size.w/2) + 0.5;
    const cy = sub.anchor.y + Math.min(sub.size.h-2, Math.max(1, Math.floor(sub.size.h/2)));
    const cz = sub.anchor.z + Math.floor(sub.size.d/2) + 0.5;
    player.teleport({ x: cx, y: cy, z: cz }, { dimension: dim, keepVelocity: false, checkForBlocks: false });
  }catch{}
  updateSub(player.name, idx, { pilot: player.name, active:true }); return true;
}
function unboardSub(player){ const f=subFind(player); if(!f) return false; const {idx,sub}=f; if (sub.pilot!==player.name) return false; updateSub(player.name, idx, { pilot:null, active:false, dive:false, seekDeep:false }); return true; }
function toggleDive(player){ const f=subFind(player); if(!f) return false; const {idx,sub}=f; const d=!sub.dive; updateSub(player.name, idx, { dive:d, seekDeep: d?true:false }); return d; }
function setHeadingFacing(player){ const f=subFind(player); if(!f) return false; const {idx}=f; try{ const r=player.getRotation?.(); const yaw=(r&&typeof r.y==='number')?r.y:0; const rad=(yaw*Math.PI)/180; const dx=-Math.sin(rad), dz=Math.cos(rad); const nd=Math.abs(dx)>=Math.abs(dz)?{x:Math.sign(dx),z:0}:{x:0,z:Math.sign(dz)}; updateSub(player.name, idx, { dir: nd }); return true; }catch{ return false; } }
function turnLeft(player){ const f=subFind(player); if(!f) return false; const {idx,sub}=f; const d=sub.dir||{x:0,z:1}; const nd = d.x===1?{x:0,z:1}: d.z===1?{x:-1,z:0}: d.x===-1?{x:0,z:-1}:{x:1,z:0}; updateSub(player.name, idx, { dir: nd }); return true; }
function turnRight(player){ const f=subFind(player); if(!f) return false; const {idx,sub}=f; const d=sub.dir||{x:0,z:1}; const nd = d.x===1?{x:0,z:-1}: d.z===1?{x:1,z:0}: d.x===-1?{x:0,z:1}:{x:-1,z:0}; updateSub(player.name, idx, { dir: nd }); return true; }
function toggleActive(player){ const f=subFind(player); if(!f) return false; const {idx,sub}=f; const a=!sub.active; updateSub(player.name, idx, { active:a }); return a; }

function openSubControls(player){
  const f=subFind(player); if(!f){ try{ player.sendMessage("You are not inside your submarine."); }catch{} return; }
  const {sub}=f; const af=new ActionFormData().title("Submarine Controls").body("Choose an action:");
  af.button(sub.pilot===player.name?"Leave Helm":"Take Helm");
  af.button(sub.active?"Stop":"Go");
  af.button(sub.dive?"Surface":"Dive");
  af.button("Heading -> Facing");
  af.button("Turn Left");
  af.button("Turn Right");
  af.button("Close");
  af.show(player).then(res=>{
    if(!res||res.canceled) return; const sel=res.selection;
    if (sel===0){ if (sub.pilot===player.name) unboardSub(player); else boardSub(player); }
    else if (sel===1){ toggleActive(player); }
    else if (sel===2){ toggleDive(player); }
    else if (sel===3){ setHeadingFacing(player); }
    else if (sel===4){ turnLeft(player); }
    else if (sel===5){ turnRight(player); }
    system.runTimeout(()=>openSubControls(player), 1);
  }).catch(()=>{});
}

try{ globalThis.LABS_subControls = { boardSub, unboardSub, toggleDive, setHeadingFacing, turnLeft, turnRight, toggleActive, openSubControls }; }catch{}

export function placeSubmarine(player){
  try { if (!player.hasTag || !player.hasTag("labs_admin")) { player.sendMessage("OP only. /tag @s add labs_admin"); return; } } catch {}
  const dim=player.dimension; const base={x:round(player.location.x), y:round(player.location.y), z:round(player.location.z)}; const dir=fwdDir(player);
  // Auto: place without size prompt; we'll detect actual size by scanning after place
  let ax=base.x+dir.x*3, az=base.z+dir.z*3; let ay=base.y-3;
  const anchor={x:ax,y:ay,z:az};
  placeStructure(dim, anchor.x, anchor.y, anchor.z, "0_degrees").then(()=>{
    // Detect bounding box of solid structure (non-air/non-water) within a reasonable cap
    let min={x:Infinity,y:Infinity,z:Infinity}, max={x:-Infinity,y:-Infinity,z:-Infinity};
    const CAP={w:48,h:24,d:64};
    try{
      for(let y=0;y<CAP.h;y++) for(let x=0;x<CAP.w;x++) for(let z=0;z<CAP.d;z++){
        const pos={x:anchor.x+x,y:anchor.y+y,z:anchor.z+z}; const b=dim.getBlock(pos); if(!b) continue; const id=String(b.typeId||"");
        if (id!=="minecraft:air" && !id.includes("water")){
          if (pos.x<min.x) min.x=pos.x; if (pos.y<min.y) min.y=pos.y; if (pos.z<min.z) min.z=pos.z;
          if (pos.x>max.x) max.x=pos.x; if (pos.y>max.y) max.y=pos.y; if (pos.z>max.z) max.z=pos.z;
        }
      }
    }catch{}
    if (!Number.isFinite(min.x) || !Number.isFinite(max.x)){
      // Fallback to default size
      min={x:anchor.x,y:anchor.y,z:anchor.z}; max={x:anchor.x+31,y:anchor.y+11,z:anchor.z+39};
    }
    const size={ w: (max.x-min.x)+1, h: (max.y-min.y)+1, d: (max.z-min.z)+1 };
    const adjAnchor={ x: min.x, y: min.y, z: min.z };
    // Re-place tightly at detected anchor
    cleanupBox(dim, anchor, size.w, size.h, size.d);
    placeStructure(dim, adjAnchor.x, adjAnchor.y, adjAnchor.z, "0_degrees").then(()=>{
      const btns=scanButtons(dim, adjAnchor, size.w,size.h,size.d);
      // Choose best initial heading (cardinal) based on water ratio ahead
      const dirs=[{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}];
      const scoreDir=(d)=>{ let water=0, tot=0; try{ for(let y=0;y<size.h;y++) for(let x=0;x<size.w;x++) for(let z=0;z<size.d;z++){ const b=dim.getBlock({x:adjAnchor.x+d.x+x,y:adjAnchor.y+y,z:adjAnchor.z+d.z+z}); const id=String(b?.typeId||""); if (id==="minecraft:air"||id.includes("water")) water++; tot++; } }catch{} return water/(tot||1); };
      let best=dir, bestR=-1; for(const d of dirs){ const r=scoreDir(d); if (r>bestR){ bestR=r; best=d; } }
      registerSub(player.name, dim.id, adjAnchor, size, best, "0_degrees", btns);
      // Auto-engage forward to reach open water; player can stop with left button
      updateSub(player.name, (loadReg()[player.name]?.length||1)-1, { active:true, seekOpen:true });
      try{ player.sendMessage("Submarine deployed and moving. Left button: Stop/Go. Right: Dive/Surface. Sneak inside to steer."); }catch{}
    }).catch(()=>{ try{ player.sendMessage("Sub placed but failed to adjust size."); }catch{} });
  }).catch(()=>{ try{ player.sendMessage("Failed to place SUB1 structure."); }catch{} });
}

// Hook button interactions to control the sub
try{
  world.afterEvents.playerInteractWithBlock.subscribe(ev=>{
    try{
      const p=ev.player; const dim=p.dimension; const R=loadReg(); const arr=Array.isArray(R[p.name])?R[p.name]:[]; if(!arr.length) return;
      const pos=ev.block; if(!pos) return; const bp={x:round(pos.location.x), y:round(pos.location.y), z:round(pos.location.z)};
      for(let i=0;i<arr.length;i++){
        const sub=arr[i]; if(sub.dim!==dim.id) continue; const {anchor,size,btns}=sub; if(!btns||btns.length<1) continue;
        const inside = (bp.x>=anchor.x && bp.x<anchor.x+size.w && bp.y>=anchor.y && bp.y<anchor.y+size.h && bp.z>=anchor.z && bp.z<anchor.z+size.d);
        if (!inside) continue;
        // Only react to the actual two button blocks we recorded
        const isBtn = btns.some(b=>b.x===bp.x && b.y===bp.y && b.z===bp.z);
        if (!isBtn) continue;
        // Determine left/right by comparing button Xs
        let leftFirst=true; if(btns.length>=2){ leftFirst = (btns[0].x <= btns[1].x); }
        const isLeft = (btns.length>=2) ? (bp.x=== (leftFirst?btns[0].x:btns[1].x)) : true;
        if (isLeft){
          // Board/Unboard pilot (no riding; stay on foot to avoid ejection)
          if (!sub.pilot){
            // Snap pilot safely near cabin center
            try{
              const cx = anchor.x + Math.floor(size.w/2) + 0.5;
              const cy = anchor.y + Math.min(size.h-2, Math.max(1, Math.floor(size.h/2)));
              const cz = anchor.z + Math.floor(size.d/2) + 0.5;
              p.teleport({ x: cx, y: cy, z: cz }, { dimension: dim, keepVelocity: false, checkForBlocks: false });
            }catch{}
            updateSub(p.name, i, { pilot: p.name, active: true, seekOpen:false });
            try{ p.sendMessage("Sub: You are now piloting. W to move. Right button: Dive/Surface."); }catch{}
          }
          else if (sub.pilot===p.name){
            updateSub(p.name, i, { pilot: null, active: false, dive:false, seekDeep:false });
            try{ p.sendMessage("Sub: You left the helm."); }catch{}
          } else { try{ p.sendMessage(`Sub: Already piloted by ${sub.pilot}.`); }catch{} }
        } else {
          // Toggle dive
          updateSub(p.name, i, { dive: !sub.dive, seekDeep: sub.dive?false:true });
          try{ p.sendMessage(sub.dive?"Sub: Diving." : "Sub: Surfacing/hold depth."); }catch{}
        }
        break;
      }
    }catch{}
  });
} catch {}

// Movement loop: move active subs in small steps, clearing previous area
try{
  system.runInterval(()=>{
    try{
      const OPEN_WATER_MIN = 0.5; // ratio to exit open-water seeking
      const DEEP_WATER_MIN = 0.8; // ratio required to dive
      const R=loadReg(); const owners=Object.keys(R);
      for(const owner of owners){ const arr=Array.isArray(R[owner])?R[owner]:[]; for(let i=0;i<arr.length;i++){
        const sub=arr[i]; if(!sub.active) continue; const dim=world.getDimension(sub.dim.split(":")[1]||sub.dim);
        if (!dim) continue;
        // Steering: owner inside and sneaking sets heading to their facing (cardinal)
        try{
          const pilot = world.getPlayers().find(p=>p.name===owner && p.dimension?.id===sub.dim && p.location && p.location.x>=sub.anchor.x && p.location.x<sub.anchor.x+sub.size.w && p.location.y>=sub.anchor.y && p.location.y<sub.anchor.y+sub.size.h && p.location.z>=sub.anchor.z && p.location.z<sub.anchor.z+sub.size.d);
          if (pilot && (pilot.isSneaking??false)){
            const r=pilot.getRotation?.(); const yaw=(r&&typeof r.y==='number')?r.y:0; const rad=(yaw*Math.PI)/180; const dx=-Math.sin(rad), dz=Math.cos(rad); const nd=Math.abs(dx)>=Math.abs(dz)?{x:Math.sign(dx),z:0}:{x:0,z:Math.sign(dz)}; sub.dir=nd; updateSub(owner, i, { dir: nd });
          }
        }catch{}
        // Candidate positions
        const nextFlat={ x: sub.anchor.x+sub.dir.x, y: sub.anchor.y, z: sub.anchor.z+sub.dir.z };
        const nextDown={ x: sub.anchor.x+sub.dir.x, y: Math.max(1, sub.anchor.y-1), z: sub.anchor.z+sub.dir.z };
        // Evaluate only the leading slice (avoid self-collision)
        let okFlat=true, waterFlat=0, totFlat=0; try{
          if (sub.dir.x!==0){
            const slabX = sub.dir.x>0 ? (nextFlat.x + (sub.size.w-1)) : nextFlat.x;
            for(let y=0;y<sub.size.h && okFlat;y++) for(let z=0;z<sub.size.d && okFlat;z++){
              const b=dim.getBlock({x:slabX,y:nextFlat.y+y,z:nextFlat.z+z}); const id=String(b?.typeId||"");
              if (id!=="minecraft:air" && !id.includes("water")) okFlat=false; else { totFlat++; if (id.includes("water")) waterFlat++; }
            }
          } else {
            const slabZ = sub.dir.z>0 ? (nextFlat.z + (sub.size.d-1)) : nextFlat.z;
            for(let y=0;y<sub.size.h && okFlat;y++) for(let x=0;x<sub.size.w && okFlat;x++){
              const b=dim.getBlock({x:nextFlat.x+x,y:nextFlat.y+y,z:slabZ}); const id=String(b?.typeId||"");
              if (id!=="minecraft:air" && !id.includes("water")) okFlat=false; else { totFlat++; if (id.includes("water")) waterFlat++; }
            }
          }
        }catch{}
        if (!okFlat){ updateSub(owner, i, { active:false, dive:false }); continue; }
        let okDown=true, waterDown=0, totDown=0; if (sub.dive || sub.seekDeep){ try{
          for(let y=0;y<sub.size.h && okDown;y++) for(let x=0;x<sub.size.w && okDown;x++) for(let z=0;z<sub.size.d && okDown;z++){
            const b=dim.getBlock({x:nextDown.x+x,y:nextDown.y+y,z:nextDown.z+z}); const id=String(b?.typeId||"");
            if (id!=="minecraft:air" && !id.includes("water")) okDown=false; else { totDown++; if (id.includes("water")) waterDown++; }
          }
        }catch{} }
        const ratioFlat = totFlat? (waterFlat/totFlat) : 0;
        const ratioDown = totDown? (waterDown/totDown) : 0;
        // Auto-seek rules
        if (sub.seekOpen && ratioFlat >= OPEN_WATER_MIN){ sub.seekOpen=false; updateSub(owner, i, { seekOpen:false }); }
        let doDive = sub.dive;
        if (doDive){ if (!okDown || ratioDown < DEEP_WATER_MIN){ doDive=false; sub.seekDeep=true; updateSub(owner, i, { seekDeep:true }); } }
        if (!doDive && sub.seekDeep && okDown && ratioDown >= DEEP_WATER_MIN){ doDive=true; sub.seekDeep=false; updateSub(owner, i, { seekDeep:false, dive:true }); }
        // Pilot movement gating (W/S): only move if pilot presses forward; backward stops
        let allowMove = true;
        try{
          const pv = world.getPlayers().find(p=>p.name===sub.pilot);
          const mv = pv?.inputInfo?.getMovementVector?.();
          const forward = Number(mv?.y)||0; // ~1.0 when W, -1.0 when S
          if (sub.pilot && forward <= 0.1) allowMove = false;
          // HUD for pilot (action bar)
          if (pv){
            const dir = sub.dir||{x:0,z:1};
            const heading = dir.x===1?"E":dir.x===-1?"W":dir.z===1?"S":"N";
            const state = (allowMove?"Moving":"Stopped") + (doDive?" | Diving":" | Surface/Level");
            try{ pv.onScreenDisplay.setActionBar(`SUB | Heading: ${heading} | Y: ${Math.floor(sub.anchor.y)} | ${state}`); }catch{}
          }
        }catch{}
        if (!allowMove) continue;
        const step={ x: sub.dir.x, y: (doDive?-1:0), z: sub.dir.z };
        const next={ x: sub.anchor.x+step.x, y: Math.max(1, sub.anchor.y+step.y), z: sub.anchor.z+step.z };
        // Move
        cleanupBox(dim, sub.anchor, sub.size.w, sub.size.h, sub.size.d);
        try{ placeStructure(dim, next.x, next.y, next.z, sub.rot).then(()=>{ updateSub(owner, i, { anchor: next });
        }).catch(()=>{ updateSub(owner, i, { active:false, dive:false, seekDeep:false }); }); }catch{}
      } }
    }catch{}
  }, 5);
} catch {}

// Expose deploy function for menus
try{ globalThis.LABS_placeSubmarine = placeSubmarine; } catch {}

// Submarine Egg: use within 2 blocks of water to deploy
try{
  world.beforeEvents.itemUse.subscribe(ev=>{
    try{
      const p=ev.source; const it=ev.itemStack||ev.item; const id=String(it?.typeId||""); if (!p || id!=="myname:submarine_egg") return;
      const dim=p.dimension; const base={x:Math.floor(p.location.x), y:Math.floor(p.location.y), z:Math.floor(p.location.z)};
      // Check water within 2 blocks around
      let nearWater=false; try{ for(let dx=-2;dx<=2 && !nearWater;dx++) for(let dy=-2;dy<=2 && !nearWater;dy++) for(let dz=-2;dz<=2 && !nearWater;dz++){ const b=dim.getBlock({x:base.x+dx,y:base.y+dy,z:base.z+dz}); const tid=String(b?.typeId||""); if (tid.includes("water")) nearWater=true; } }catch{}
      if (!nearWater){ try{ p.sendMessage("Deploy near water (within 2 blocks)."); }catch{} return; }
      // Consume one egg from hand
      try{ const inv=p.getComponent("inventory")?.container; const slot=(typeof p?.selectedSlot==="number"?p.selectedSlot:0)|0; const cur=inv?.getItem(slot); if(cur && cur.typeId===id){ cur.amount-=1; inv.setItem(slot, cur.amount>0?cur:undefined); } }catch{}
      // Deploy
      placeSubmarine(p);
    }catch{}
  });
} catch {}
