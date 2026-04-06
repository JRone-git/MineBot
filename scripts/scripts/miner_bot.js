import { world, system, ItemStack } from "@minecraft/server";
import { ModalFormData, ActionFormData } from "@minecraft/server-ui";

const STATE = new Map(); // id -> { mode: 'corridor'|'stairs_up'|'stairs_down'|'corkscrew', step: number, cur?:{x,y,z} }
const ORIENT_TICKS = new Map(); // id -> ticks of initial orientation
const PROMPTED = new Set(); // ids that have been shown the menu

// Corkscrew tuning
const CORK_TURN_EVERY = 2;   // turn right every N steps (each step = 2 forward, 1 down)
const CORK_TORCH_EVERY = 7;  // place a torch every N steps (≈14 blocks) for a moody feel

function getYaw(entity) {
    try {
        if (typeof entity.getRotation === "function") {
            const r = entity.getRotation();
            if (r && typeof r.y === "number") return r.y;
        }
    } catch { }
    try { const r = entity.rotation; if (r && typeof r.y === "number") return r.y; } catch { }
    return 0;
}
function forwardVec(yawDeg) {
    const r = (yawDeg * Math.PI) / 180;
    // Bedrock yaw 0 faces +Z; forward should be (-sin, +cos)
    return { x: -Math.sin(r), z: Math.cos(r) };
}
function rightVec(yawDeg) {
    const r = (yawDeg * Math.PI) / 180;
    // Right (perpendicular) should be (cos, sin)
    return { x: Math.cos(r), z: Math.sin(r) };
}

function isProtected(block) {
    if (!block) return false;
    const id = String(block.typeId || "");
    return id.includes("ore") || id.includes("redstone") || id.includes("sculk");
}
function isPOI(block) {
    if (!block) return false;
    const id = String(block.typeId || "").toLowerCase();
    // Hard indicators: spawners, rails, reinforced deepslate, trial spawners, shriekers/sensors, mossy cobble, chests/barrels, player utility blocks
    if (id === "minecraft:spawner" || id === "minecraft:trial_spawner") return true;
    if (id.includes("rail")) return true; // rail, powered_rail, detector_rail, activator_rail
    if (id === "minecraft:reinforced_deepslate") return true;
    if (id === "minecraft:sculk_shrieker" || id === "minecraft:sculk_sensor") return true;
    if (id === "minecraft:mossy_cobblestone") return true;
    if (id === "minecraft:chest" || id === "minecraft:barrel") return true;
    if (id === "minecraft:crafting_table" || id === "minecraft:furnace" || id.includes("door")) return true;
    // Deepslate bricks/tiles (ancient city palette), vaults
    if (id === "minecraft:deepslate_bricks" || id === "minecraft:deepslate_tiles" || id === "minecraft:vault" || id === "minecraft:ominous_vault") return true;
    // Amethyst blocks
    if (id === "minecraft:budding_amethyst" || id === "minecraft:amethyst_block" || id.includes("amethyst_cluster") || id.includes("amethyst_bud")) return true;
    return false;
}
function isWater(block) {
    if (!block) return false;
    const id = String(block.typeId || "").toLowerCase();
    return id.includes("water");
}
function isLava(block) {
    if (!block) return false;
    const id = String(block.typeId || "").toLowerCase();
    return id.includes("lava");
}
function isGravity(block) {
    if (!block) return false;
    const id = String(block.typeId || "").toLowerCase();
    return id.includes("sand") || id.includes("gravel") || id.includes("concrete_powder");
}
function isBedrock(block) {
    if (!block) return false;
    const id = String(block.typeId || "").toLowerCase();
    return id.includes("bedrock");
}

function setAir(dim, x, y, z) {
    try {
        const b = dim.getBlock({ x, y, z });
        if (!b) return;
        if (isProtected(b)) return; // skip ores/gems/sculk
        b.setType("minecraft:air");
    } catch { }
}

function clearFallingInSlice(dim, sx, sz, baseY, r, widthHalf, height, extraAbove = 6) {
    // Clear gravity blocks that may have fallen into the mined area
    try {
        for (let pass = 0; pass < 3; pass++) {
            for (let w = -widthHalf; w <= widthHalf; w++) {
                const ox = sx + Math.round(r.x * w);
                const oz = sz + Math.round(r.z * w);
                for (let h = 0; h < height + extraAbove; h++) {
                    const b = dim.getBlock({ x: ox, y: baseY + h, z: oz });
                    if (isGravity(b)) {
                        b.setType("minecraft:air");
                    }
                }
            }
        }
    } catch { }
}

function placeMarkerSign(dim, x, y, z, text) {
    try {
        const up = { x, y: y + 1, z };
        const b = dim.getBlock(up);
        if (!b) return;
        const id = String(b.typeId || "");
        if (id === "minecraft:air") {
            try { b.setType("minecraft:oak_sign"); } catch { }
            try {
                const sign = b.getComponent?.("minecraft:sign");
                if (sign) {
                    try { sign.setText?.(String(text || "POI detected")); } catch { }
                    try { sign.setText?.(String(text || "POI detected"), "Front"); } catch { }
                }
            } catch { }
        }
    } catch { }
}

function faceLikeNearestPlayer(e) {
    let nearest = null, best = 999999;
    for (const p of world.getPlayers()) {
        if (p.dimension.id !== e.dimension.id) continue;
        const dx = p.location.x - e.location.x;
        const dz = p.location.z - e.location.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < best) { best = d2; nearest = p; }
    }
    if (nearest) {
        try {
            const r = nearest.getRotation ? nearest.getRotation() : null;
            const yaw = r && typeof r.y === 'number' ? r.y : 0;
            e.setRotation({ x: 0, y: yaw });
        } catch { }
    }
}

function showModePrompt(e) {
    if (PROMPTED.has(e.id)) return;
    const form = new ModalFormData().title("WHAT?").dropdown("Mode", ["Corridor", "Stairs up", "Stairs down", "Corkscrew (down)"], 0);
    // send to nearest player within 12 blocks
    let target = null, best = 144;
    for (const p of world.getPlayers()) {
        if (p.dimension.id !== e.dimension.id) continue;
        const dx = p.location.x - e.location.x;
        const dy = p.location.y - e.location.y;
        const dz = p.location.z - e.location.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < best) { best = d2; target = p; }
    }
    if (!target) return;
    PROMPTED.add(e.id);
    form.show(target).then(res => {
        if (!res || res.canceled) { PROMPTED.delete(e.id); return; }
        const choice = res.formValues?.[0] ?? 0;
        const mode = choice === 0 ? 'corridor' : (choice === 1 ? 'stairs_up' : (choice === 2 ? 'stairs_down' : 'corkscrew'));
        const origin = { x: Math.floor(e.location.x), y: Math.floor(e.location.y), z: Math.floor(e.location.z) };
        const yaw = getYaw(e);
        const cur = { ...origin };
        STATE.set(e.id, { mode, step: 0, origin, yaw, cur, last: 0, ownerName: target.name });
        try { e.nameTag = "Miner Bot"; } catch { }
    }).catch(() => { PROMPTED.delete(e.id); });
}

try {
    world.afterEvents.entitySpawn.subscribe(ev => {
        const e = ev.entity;
        if (!e || e.typeId !== "myname:miner_bot") return;
        // Delay orientation and prompt slightly to avoid spawn timing issues
        ORIENT_TICKS.set(e.id, 0);
        system.runTimeout(() => {
            try { faceLikeNearestPlayer(e); } catch { }
            showModePrompt(e);
        }, 10);
    });
} catch { }

const MINER_NEXT_SONG = new Map();
function minerScheduleNext(id) { const now = Date.now(); const mins = 1 + Math.floor(Math.random() * 45); MINER_NEXT_SONG.set(id, now + mins * 60000); }

system.runInterval(() => {
    for (const dim of [world.getDimension("overworld"), world.getDimension("nether"), world.getDimension("the_end")]) {
        if (!dim) continue;
        const bots = dim.getEntities({ type: "myname:miner_bot" });
        for (const e of bots) {
            // ambient song timer
            const id = e.id; if (!MINER_NEXT_SONG.has(id)) minerScheduleNext(id);
            const nowSong = Date.now(); const due = MINER_NEXT_SONG.get(id) || 0;
            if (nowSong >= due) {
                try { const x = Math.floor(e.location.x), y = Math.floor(e.location.y), z = Math.floor(e.location.z); e.dimension.runCommandAsync(`playsound labs.miner_song @a ${x} ${y} ${z} 1 1 0`).catch(() => { }); } catch { }
                minerScheduleNext(id);
            }
            // For the first ~20 ticks, keep aligning to player yaw to ensure facing matches placement
            const t = (ORIENT_TICKS.get(e.id) ?? 0);
            if (t < 20) {
                faceLikeNearestPlayer(e);
                ORIENT_TICKS.set(e.id, t + 1);
            }
            if (!STATE.has(e.id)) {
                // if prompt failed earlier (no player nearby), retry occasionally
                if ((t % 20) === 0) showModePrompt(e);
                ORIENT_TICKS.set(e.id, t + 1);
                continue;
            }

            const st = STATE.get(e.id);
            
            // Apply work speed multiplier
            const workSpeedMultiplier = globalThis.LABS_getWorkSpeedMultiplier ? globalThis.LABS_getWorkSpeedMultiplier() : 1;
            
            // For slower speeds, skip some cycles
            if (workSpeedMultiplier < 1) {
                const skipChance = 1 - workSpeedMultiplier;
                if (Math.random() < skipChance) continue;
            }
            
            // For faster speeds, work multiple times per cycle
            const workCount = workSpeedMultiplier > 1 ? Math.floor(workSpeedMultiplier) : 1;
            
            // If halted as 'done' or 'water', do nothing further
            if (st.halted === 'done' || st.halted === 'water') { continue; }
            
            // Work multiple times for faster speeds
            for (let workIteration = 0; workIteration < workCount; workIteration++) {
                const now = Date.now();
                if (!st.last) st.last = 0;
                // Adjust delay based on work speed multiplier
                const baseDelay = 5000;
                const adjustedDelay = baseDelay / workSpeedMultiplier;
                if (now - st.last < adjustedDelay) { 
                    STATE.set(e.id, st); 
                    if (workIteration === 0) continue; // Only skip on first iteration
                    break; // Exit work loop but continue with next bot
                }
                st.last = now;

            const yaw = st.yaw;
            const f = forwardVec(yaw);
            const r = rightVec(yaw);
            const origin = st.origin;
            if (st.mode === 'corridor') {
                if (st.step >= 100) {
                    if (st.halted !== 'done') {
                        try { e.nameTag = "Miner Bot"; } catch { }
                        const owner = world.getPlayers().find(p => p.name === st.ownerName);
                        // Show completion popup once
                        try {
                            const target = owner;
                            if (target) {
                                const form = new ActionFormData().title("Miner Bot").body("Finished corridor. What would you like to do?").button("Retrieve bot").button("Close");
                                form.show(target).then(res => {
                                    if (!res || res.canceled) return;
                                    if (res.selection === 0) {
                                        // mark to suppress drop and grant egg directly
                                        try { e.addTag?.("labs_retrieved"); } catch { }
                                        try {
                                            const inv = target.getComponent("inventory")?.container;
                                            const egg = new ItemStack("myname:miner_bot_spawn_egg", 1);
                                            const added = inv?.addItem?.(egg);
                                            if (!added) e.dimension.spawnItem(egg, target.location);
                                        } catch { }
                                        try { e.kill?.(); } catch { try { e.dimension.spawnItem(new ItemStack("myname:miner_bot_spawn_egg", 1), e.location); } catch { } }
                                    }
                                }).catch(() => { });
                            }
                        } catch { }
                        STATE.set(e.id, { ...st, halted: 'done' });
                    }
                    continue;
                }
                // Next slice position
                const fwd = st.step + 1;
                const sx = origin.x + Math.round(f.x * fwd);
                const sz = origin.z + Math.round(f.z * fwd);
                // Water/POI check in this slice
                let waterHit = false, poiHit = false;
                for (let w = -2; w <= 2 && !waterHit && !poiHit; w++) {
                    const ox = sx + Math.round(r.x * w);
                    const oz = sz + Math.round(r.z * w);
                    for (let h = 0; h < 4; h++) {
                        const b = dim.getBlock({ x: ox, y: origin.y + h, z: oz });
                        if (isWater(b) || isLava(b)) { waterHit = true; break; }
                        if (isPOI(b)) { poiHit = true; break; }
                    }
                }
                if (waterHit || poiHit) {
                    // back up 8 and notify
                    const bx = origin.x + Math.round(f.x * Math.max(0, fwd - 8));
                    const bz = origin.z + Math.round(f.z * Math.max(0, fwd - 8));
                    try { e.teleport({ x: bx + 0.5, y: origin.y + 1, z: bz + 0.5 }, { dimension: dim, rotation: { x: 0, y: yaw } }); } catch { }
                    try { e.nameTag = "Miner Bot"; } catch { }
                    try { const whyMark = waterHit ? "Water/Lava ahead" : "POI detected ahead"; placeMarkerSign(dim, bx, origin.y, bz, whyMark); } catch { }
                    const owner = world.getPlayers().find(p => p.name === st.ownerName);
                    // Popup to owner with retrieve option
                    try {
                        if (owner) {
                            const why = waterHit ? "Hit water and backed up." : "Found structure/POI ahead and paused.";
                            const form = new ActionFormData().title("Miner Bot").body(`${why} Retrieve bot?`).button("Retrieve bot").button("Close");
                            system.runTimeout(() => {
                                form.show(owner).then(res => {
                                    if (!res || res.canceled) return;
                                    if (res.selection === 0) {
                                        try { e.addTag?.("labs_retrieved"); } catch { }
                                        try {
                                            const inv = owner.getComponent("inventory")?.container;
                                            const egg = new ItemStack("myname:miner_bot_spawn_egg", 1);
                                            const added = inv?.addItem?.(egg);
                                            if (!added) e.dimension.spawnItem(egg, owner.location);
                                        } catch { }
                                        try { e.kill?.(); } catch { try { e.dimension.spawnItem(new ItemStack("myname:miner_bot_spawn_egg", 1), e.location); } catch { } }
                                    }
                                }).catch(() => { });
                            }, 0);
                        }
                    } catch { }
                    STATE.set(e.id, { ...st, halted: "water" });
                    continue;
                }
                // Carve the slice
                for (let w = -2; w <= 2; w++) {
                    const ox = sx + Math.round(r.x * w);
                    const oz = sz + Math.round(r.z * w);
                    for (let h = 0; h < 4; h++) setAir(dim, ox, origin.y + h, oz);
                }
                // Clear fallen blocks
                clearFallingInSlice(dim, sx, sz, origin.y, r, 2, 4);
                // Move bot to the cleared slice center
                try { e.teleport({ x: sx + 0.5, y: origin.y + 1, z: sz + 0.5 }, { dimension: dim, rotation: { x: 0, y: yaw } }); } catch { }
                st.step++;
            } else if (st.mode === 'stairs_up' || st.mode === 'stairs_down') {
                if (st.step >= 250) {
                    if (st.halted !== 'done') {
                        try { e.nameTag = "Miner Bot"; } catch { }
                        const owner = world.getPlayers().find(p => p.name === st.ownerName);
                        try {
                            const target = owner;
                            if (target) {
                                const form = new ActionFormData().title("Miner Bot").body("Finished stairs. What would you like to do?").button("Retrieve bot").button("Close");
                                form.show(target).then(res => {
                                    if (!res || res.canceled) return;
                                    if (res.selection === 0) {
                                        try { e.addTag?.("labs_retrieved"); } catch { }
                                        try {
                                            const inv = target.getComponent("inventory")?.container;
                                            const egg = new ItemStack("myname:miner_bot_spawn_egg", 1);
                                            const added = inv?.addItem?.(egg);
                                            if (!added) e.dimension.spawnItem(egg, target.location);
                                        } catch { }
                                        try { e.kill?.(); } catch { try { e.dimension.spawnItem(new ItemStack("myname:miner_bot_spawn_egg", 1), e.location); } catch { } }
                                    }
                                }).catch(() => { });
                            }
                        } catch { }
                        STATE.set(e.id, { ...st, halted: 'done' });
                    }
                    continue;
                }
                // For each step: clear 2 forward segments of 3x4, then y += 1 (up) or -=1 (down)
                const rise = st.mode === 'stairs_up' ? 1 : -1;
                const segment = st.step;
                const elev = rise * segment;
                let waterHit = false, poiHit = false;
                for (let seg = 1; seg <= 2 && !waterHit && !poiHit; seg++) {
                    const fx = origin.x + Math.round(f.x * (segment * 2 + seg));
                    const fz = origin.z + Math.round(f.z * (segment * 2 + seg));
                    for (let w = -1; w <= 1 && !waterHit && !poiHit; w++) {
                        const ox = fx + Math.round(r.x * w);
                        const oz = fz + Math.round(r.z * w);
                        for (let h = 0; h < 4; h++) {
                            try {
                                const yv = origin.y + elev + h;
                                const b = dim.getBlock({ x: ox, y: yv, z: oz });
                                if (isWater(b) || isLava(b)) { waterHit = true; break; }
                                if (isPOI(b)) { poiHit = true; break; }
                            } catch {
                                // Out-of-world access; stop checking this column
                                break;
                            }
                        }
                    }
                }
                if (waterHit || poiHit) {
                    const backSeg = Math.max(0, segment - 4); // about 8 forward cells
                    const bx = origin.x + Math.round(f.x * (backSeg * 2));
                    const bz = origin.z + Math.round(f.z * (backSeg * 2));
                    try { e.teleport({ x: bx + 0.5, y: origin.y + elev + 1, z: bz + 0.5 }, { dimension: dim, rotation: { x: 0, y: yaw } }); } catch { }
                    try { e.nameTag = "Miner Bot"; } catch { }
                    try { const whyMark = waterHit ? "Water/Lava ahead" : "POI detected ahead"; placeMarkerSign(dim, bx, origin.y + elev, bz, whyMark); } catch { }
                    const owner = world.getPlayers().find(p => p.name === st.ownerName);
                    try {
                        if (owner) {
                            const why = waterHit ? "Hit water and backed up." : "Found structure/POI ahead and paused.";
                            const form = new ActionFormData().title("Miner Bot").body(`${why} Retrieve bot?`).button("Retrieve bot").button("Close");
                            system.runTimeout(() => {
                                form.show(owner).then(res => {
                                    if (!res || res.canceled) return;
                                    if (res.selection === 0) {
                                        try { e.addTag?.("labs_retrieved"); } catch { }
                                        try {
                                            const inv = owner.getComponent("inventory")?.container;
                                            const egg = new ItemStack("myname:miner_bot_spawn_egg", 1);
                                            const added = inv?.addItem?.(egg);
                                            if (!added) e.dimension.spawnItem(egg, owner.location);
                                        } catch { }
                                        try { e.kill?.(); } catch { try { e.dimension.spawnItem(new ItemStack("myname:miner_bot_spawn_egg", 1), e.location); } catch { } }
                                    }
                                }).catch(() => { });
                            }, 0);
                        }
                    } catch { }
                    STATE.set(e.id, { ...st, halted: "water" });
                    continue;
                }
                for (let seg = 1; seg <= 2; seg++) {
                    const fx = origin.x + Math.round(f.x * (segment * 2 + seg));
                    const fz = origin.z + Math.round(f.z * (segment * 2 + seg));
                    for (let w = -1; w <= 1; w++) {
                        const ox = fx + Math.round(r.x * w);
                        const oz = fz + Math.round(r.z * w);
                        for (let h = 0; h < 4; h++) setAir(dim, ox, origin.y + elev + h, oz);
                    }
                }
                // Clear any falling blocks in the last segment area
                const tx = origin.x + Math.round(f.x * (segment * 2 + 2));
                const tz = origin.z + Math.round(f.z * (segment * 2 + 2));
                clearFallingInSlice(dim, tx, tz, origin.y + elev, r, 1, 4);
                // If the next down step would hit bedrock or bottom, stop here
                try {
                    const below = dim.getBlock({ x: tx, y: origin.y + elev - 1, z: tz });
                    if (isBedrock(below) || (origin.y + elev - 1) <= -62) {
                        if (st.halted !== 'done') {
                            try { e.nameTag = "Miner Bot"; } catch { }
                            const owner = world.getPlayers().find(p => p.name === st.ownerName);
                            try {
                                const target = owner;
                                if (target) {
                                    const form = new ActionFormData().title("Miner Bot").body("Reached bedrock. What would you like to do?").button("Retrieve bot").button("Close");
                                    form.show(target).then(res => {
                                        if (!res || res.canceled) return;
                                        if (res.selection === 0) {
                                            try { e.addTag?.("labs_retrieved"); } catch { }
                                            try {
                                                const inv = target.getComponent("inventory")?.container;
                                                const egg = new ItemStack("myname:miner_bot_spawn_egg", 1);
                                                const added = inv?.addItem?.(egg);
                                                if (!added) e.dimension.spawnItem(egg, target.location);
                                            } catch { }
                                            try { e.kill?.(); } catch { try { e.dimension.spawnItem(new ItemStack("myname:miner_bot_spawn_egg", 1), e.location); } catch { } }
                                        }
                                    }).catch(() => { });
                                }
                            } catch { }
                            STATE.set(e.id, { ...st, halted: 'done' });
                            continue;
                        }
                    }
                } catch { }
                // move bot to end of the cleared two segments at current elevation
                try { e.teleport({ x: tx + 0.5, y: origin.y + elev + 1, z: tz + 0.5 }, { dimension: dim, rotation: { x: 0, y: yaw } }); } catch { }
                st.step++;
            } else if (st.mode === 'corkscrew') {
                // Spiral downward: every step = carve 2 forward segments at current level, then drop 1; every 3 steps, turn right 90°
                if (!st.cur) st.cur = { ...origin };
                if (st.step >= 250) {
                    if (st.halted !== 'done') {
                        try { e.nameTag = "Miner Bot"; } catch { }
                        const owner = world.getPlayers().find(p => p.name === st.ownerName);
                        try {
                            const target = owner;
                            if (target) {
                                const form = new ActionFormData().title("Miner Bot").body("Finished corkscrew. What would you like to do?").button("Retrieve bot").button("Close");
                                form.show(target).then(res => {
                                    if (!res || res.canceled) return;
                                    if (res.selection === 0) {
                                        try { e.addTag?.("labs_retrieved"); } catch { }
                                        try {
                                            const inv = target.getComponent("inventory")?.container;
                                            const egg = new ItemStack("myname:miner_bot_spawn_egg", 1);
                                            const added = inv?.addItem?.(egg);
                                            if (!added) e.dimension.spawnItem(egg, target.location);
                                        } catch { }
                                        try { e.kill?.(); } catch { try { e.dimension.spawnItem(new ItemStack("myname:miner_bot_spawn_egg", 1), e.location); } catch { } }
                                    }
                                }).catch(() => { });
                            }
                        } catch { }
                        STATE.set(e.id, { ...st, halted: 'done' });
                    }
                    continue;
                }
                // Compute forward/right from current yaw
                const f2 = forwardVec(st.yaw);
                const r2 = rightVec(st.yaw);
                // Check for water/lava/POI ahead in the two forward segments at current elevation
                let waterHit = false, poiHit = false;
                for (let seg = 1; seg <= 2 && !waterHit && !poiHit; seg++) {
                    const fx = st.cur.x + Math.round(f2.x * seg);
                    const fz = st.cur.z + Math.round(f2.z * seg);
                    for (let w = -1; w <= 1 && !waterHit && !poiHit; w++) {
                        const ox = fx + Math.round(r2.x * w);
                        const oz = fz + Math.round(r2.z * w);
                        for (let h = 0; h < 4; h++) {
                            try {
                                const yv = st.cur.y + h;
                                const b = dim.getBlock({ x: ox, y: yv, z: oz });
                                if (isWater(b) || isLava(b)) { waterHit = true; break; }
                                if (isPOI(b)) { poiHit = true; break; }
                            } catch { break; }
                        }
                    }
                }
                if (waterHit || poiHit) {
                    const bx = st.cur.x - Math.round(f2.x * 8);
                    const bz = st.cur.z - Math.round(f2.z * 8);
                    try { e.teleport({ x: bx + 0.5, y: st.cur.y + 1, z: bz + 0.5 }, { dimension: dim, rotation: { x: 0, y: st.yaw } }); } catch { }
                    try { e.nameTag = "Miner Bot"; } catch { }
                    try { const whyMark = waterHit ? "Water/Lava ahead" : "POI detected ahead"; placeMarkerSign(dim, bx, st.cur.y, bz, whyMark); } catch { }
                    const owner = world.getPlayers().find(p => p.name === st.ownerName);
                    try {
                        if (owner) {
                            const why = waterHit ? "Hit water and backed up." : "Found structure/POI ahead and paused.";
                            const form = new ActionFormData().title("Miner Bot").body(`${why} Retrieve bot?`).button("Retrieve bot").button("Close");
                            system.runTimeout(() => {
                                form.show(owner).then(res => {
                                    if (!res || res.canceled) return;
                                    if (res.selection === 0) {
                                        try { e.addTag?.("labs_retrieved"); } catch { }
                                        try {
                                            const inv = owner.getComponent("inventory")?.container;
                                            const egg = new ItemStack("myname:miner_bot_spawn_egg", 1);
                                            const added = inv?.addItem?.(egg);
                                            if (!added) e.dimension.spawnItem(egg, owner.location);
                                        } catch { }
                                        try { e.kill?.(); } catch { try { e.dimension.spawnItem(new ItemStack("myname:miner_bot_spawn_egg", 1), e.location); } catch { } }
                                    }
                                }).catch(() => { });
                            }, 0);
                        }
                    } catch { }
                    STATE.set(e.id, { ...st, halted: "water" });
                    continue;
                }
                // Carve two forward segments at current elevation, 3x4 cross-section
                for (let seg = 1; seg <= 2; seg++) {
                    const fx = st.cur.x + Math.round(f2.x * seg);
                    const fz = st.cur.z + Math.round(f2.z * seg);
                    for (let w = -1; w <= 1; w++) {
                        const ox = fx + Math.round(r2.x * w);
                        const oz = fz + Math.round(r2.z * w);
                        for (let h = 0; h < 4; h++) setAir(dim, ox, st.cur.y + h, oz);
                    }
                }
                // Clear any falling blocks at the end of the segment
                const tx = st.cur.x + Math.round(f2.x * 2);
                const tz = st.cur.z + Math.round(f2.z * 2);
                clearFallingInSlice(dim, tx, tz, st.cur.y, r2, 1, 4);
                // Move bot to end of the cleared two segments
                try { e.teleport({ x: tx + 0.5, y: st.cur.y + 1, z: tz + 0.5 }, { dimension: dim, rotation: { x: 0, y: st.yaw } }); } catch { }
                // Place torch on right wall just before turning (to avoid destroying it)
                try {
                    if (st.step > 0 && (st.step + 1) % CORK_TURN_EVERY === 0) {
                        // Place torch on the right wall at eye level (y+2)
                        const px = tx + Math.round(r2.x * 1);
                        const pz = tz + Math.round(r2.z * 1);
                        const pb = dim.getBlock({ x: px, y: st.cur.y + 2, z: pz });
                        if (pb && pb.typeId !== "minecraft:air") {
                            // Wall exists, place torch on it
                            pb.setType("minecraft:torch");
                        } else {
                            // No wall, place on floor instead
                            const floor = dim.getBlock({ x: px, y: st.cur.y, z: pz });
                            if (floor && floor.typeId === "minecraft:air") floor.setType("minecraft:torch");
                        }
                    }
                } catch { }
                // If the next drop would hit bedrock or bottom, stop here
                try {
                    const below = dim.getBlock({ x: tx, y: st.cur.y - 1, z: tz });
                    if (isBedrock(below) || (st.cur.y - 1) <= -62) {
                        if (st.halted !== 'done') {
                            try { e.nameTag = "Miner Bot"; } catch { }
                            const owner = world.getPlayers().find(p => p.name === st.ownerName);
                            try {
                                const target = owner;
                                if (target) {
                                    const form = new ActionFormData().title("Miner Bot").body("Reached bedrock. What would you like to do?").button("Retrieve bot").button("Close");
                                    form.show(target).then(res => {
                                        if (!res || res.canceled) return;
                                        if (res.selection === 0) {
                                            try { e.addTag?.("labs_retrieved"); } catch { }
                                            try {
                                                const inv = target.getComponent("inventory")?.container;
                                                const egg = new ItemStack("myname:miner_bot_spawn_egg", 1);
                                                const added = inv?.addItem?.(egg);
                                                if (!added) e.dimension.spawnItem(egg, target.location);
                                            } catch { }
                                            try { e.kill?.(); } catch { try { e.dimension.spawnItem(new ItemStack("myname:miner_bot_spawn_egg", 1), e.location); } catch { } }
                                        }
                                    }).catch(() => { });
                                }
                            } catch { }
                            STATE.set(e.id, { ...st, halted: 'done' });
                            continue;
                        }
                    }
                } catch { }
                // Advance current position and drop one level
                st.cur = { x: tx, y: st.cur.y - 1, z: tz };
                st.step++;
                // Turn right every CORK_TURN_EVERY steps
                if (st.step % CORK_TURN_EVERY === 0) {
                    let newYaw = st.yaw - 90;
                    if (newYaw < 0) newYaw += 360;
                    st.yaw = newYaw;
                }
            }
            STATE.set(e.id, st);
            } // End work loop for speed multiplier
        }
    }
}, 5);

// Drop own spawn egg on death
try {
    world.afterEvents.entityDie.subscribe(ev => {
        const e = ev.deadEntity;
        if (!e || e.typeId !== "myname:miner_bot") return;
        // If retrieved via UI, we already gave the egg; suppress world drop
        try { if (e.getTags?.()?.includes("labs_retrieved")) return; } catch { }
        try {
            const egg = new ItemStack("myname:miner_bot_spawn_egg", 1);
            e.dimension.spawnItem(egg, e.location);
        } catch { }
    });
} catch { }
