// LABS - Super Drill
import { world, system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

// Track if player is currently using Super Drill
const ACTIVE_DRILLS = new Map();

// Helper to check if Super Drill is enabled
function isSuperDrillEnabled() {
  try {
    const FEATURE_FLAGS_KEY = "labs_feature_flags";
    const raw = world.getDynamicProperty?.(FEATURE_FLAGS_KEY);
    const flags = raw && typeof raw === 'string' ? JSON.parse(raw) : {};
    const enabled = flags?.superDrill;
    return enabled === false ? false : true; // default enabled
  } catch {
    return true; // default enabled if error
  }
}

world.beforeEvents.itemUseOn.subscribe(ev => {
  try {
    const { source: player, itemStack, block } = ev;
    if (!player || !itemStack || itemStack.typeId !== "myname:superdrill") return;
    
    // Prevent default block placement
    ev.cancel = true;
    
    // Check if Super Drill is enabled
    if (!isSuperDrillEnabled()) {
      player.sendMessage?.("§c§lSuper Drill:§r §7This tool has been disabled by server admins.§r");
      return;
    }
    
    // Prevent multiple activations
    if (ACTIVE_DRILLS.has(player.id)) {
      player.sendMessage?.("§cSuper Drill already in use!");
      return;
    }
    
    // Show menu on next tick
    system.runTimeout(() => {
      try {
        openSuperDrillMenu(player, itemStack);
      } catch (err) {
        console.warn("Super Drill menu error:", err);
      }
    }, 1);
  } catch (err) {
    console.warn("Super Drill use error:", err);
  }
});

function openSuperDrillMenu(player, itemStack) {
  const form = new ActionFormData()
    .title("§b§lSuper Drill§r")
    .body("§7Choose drilling direction:§r")
    .button("§a§l⬆ GOING UP?§r\n§7Drill to surface & launch§r")
    .button("§c§l⬇ GOING DOWN?§r\n§7Drill to bedrock & descend§r")
    .button("§e§l✖ EXIT§r\n§7Keep drill for later§r");
  
  form.show(player).then(res => {
    if (!res || res.canceled) return;
    
    try {
      if (res.selection === 0) {
        // Going UP
        drillUp(player, itemStack);
      } else if (res.selection === 1) {
        // Going DOWN
        drillDown(player, itemStack);
      }
      // Selection 2 = Exit, do nothing
    } catch (err) {
      console.warn("Super Drill selection error:", err);
    }
  }).catch(() => {});
}

async function drillUp(player, itemStack) {
  try {
    ACTIVE_DRILLS.set(player.id, true);
    
    player.sendMessage("§b§lSuper Drill:§r §eSCanning upward...§r");
    const dim = player.dimension;
    const pos = player.location;
    
    // Scan upward to find ACTUAL surface (look for solid-to-air transition with sky above)
    let surfaceY = Math.floor(pos.y);
    let maxScan = 320; // World height limit
    let foundSurface = false;
    
    // First, skip any air blocks (from existing hole) by finding next solid block
    let scanY = Math.floor(pos.y) + 1;
    let foundSolid = false;
    for (let y = scanY; y < maxScan; y++) {
      try {
        const testBlock = dim.getBlock({ x: Math.floor(pos.x), y, z: Math.floor(pos.z) });
        if (testBlock && !testBlock.isAir && testBlock.typeId !== "minecraft:bedrock") {
          foundSolid = true;
          scanY = y;
          break;
        }
      } catch {}
    }
    
    // If we never found solid blocks, we're already at surface
    if (!foundSolid) {
      surfaceY = Math.floor(pos.y) + 10;
      foundSurface = true;
    } else {
      // Now scan from solid block to find where it opens to sky (actual surface)
      for (let y = scanY; y < maxScan; y++) {
        try {
          const testBlock = dim.getBlock({ x: Math.floor(pos.x), y, z: Math.floor(pos.z) });
          if (testBlock && testBlock.isAir) {
            // Check if we have clear sky above (next 10 blocks are air for real surface)
            let clearAbove = true;
            for (let checkY = y + 1; checkY < y + 11; checkY++) {
              const aboveBlock = dim.getBlock({ x: Math.floor(pos.x), y: checkY, z: Math.floor(pos.z) });
              if (!aboveBlock || !aboveBlock.isAir) {
                clearAbove = false;
                break;
              }
            }
            if (clearAbove) {
              surfaceY = y;
              foundSurface = true;
              break;
            }
          }
        } catch {}
      }
    }
    
    if (!foundSurface) {
      player.sendMessage("§c§lSuper Drill:§r §cCouldn't find surface! Too deep or obstructed.§r");
      ACTIVE_DRILLS.delete(player.id);
      return;
    }
    
    const targetY = surfaceY + 10; // 10 blocks above surface
    const distance = targetY - Math.floor(pos.y);
    player.sendMessage(`§b§lSuper Drill:§r §aFound surface! Drilling ${distance} blocks up to Y=${targetY}...§r`);
    
    // LIGHTNING STORM PRE-DRILL SEQUENCE (no damage)
    player.sendMessage("§b§lSuper Drill:§r §e§l⚡ CHARGING POWER... ⚡§r");
    for (let i = 0; i < 5; i++) {
      await new Promise(resolve => system.runTimeout(resolve, 10));
      const offsetX = (Math.random() - 0.5) * 4;
      const offsetZ = (Math.random() - 0.5) * 4;
      try {
        dim.runCommandAsync(`summon lightning_bolt ${Math.floor(pos.x) + offsetX} ${Math.floor(pos.y)} ${Math.floor(pos.z) + offsetZ} ~ ~ ~ minecraft:become_charge_bolt`).catch(()=>{});
        dim.runCommandAsync(`playsound ambient.weather.thunder @a ${Math.floor(pos.x)} ${Math.floor(pos.y)} ${Math.floor(pos.z)} 4.0 ${0.8 + i * 0.1} 0`);
        dim.spawnParticle("minecraft:huge_explosion_emitter", { x: pos.x + offsetX, y: pos.y + 1, z: pos.z + offsetZ });
      } catch {}
    }
    
    await new Promise(resolve => system.runTimeout(resolve, 10));
    
    // COUNTDOWN: 3... 2... 1... BOOM!
    player.sendMessage("§e§l3...§r");
    dim.runCommandAsync(`playsound note.pling @a ${Math.floor(pos.x)} ${Math.floor(pos.y)} ${Math.floor(pos.z)} 2.0 0.8 0`);
    await new Promise(resolve => system.runTimeout(resolve, 20));
    
    player.sendMessage("§6§l2...§r");
    dim.runCommandAsync(`playsound note.pling @a ${Math.floor(pos.x)} ${Math.floor(pos.y)} ${Math.floor(pos.z)} 2.0 1.0 0`);
    await new Promise(resolve => system.runTimeout(resolve, 20));
    
    player.sendMessage("§c§l1...§r");
    dim.runCommandAsync(`playsound note.pling @a ${Math.floor(pos.x)} ${Math.floor(pos.y)} ${Math.floor(pos.z)} 2.0 1.2 0`);
    await new Promise(resolve => system.runTimeout(resolve, 20));
    
    player.sendMessage("§4§l§nBOOM!!!§r");
    dim.runCommandAsync(`playsound random.explode @a ${Math.floor(pos.x)} ${Math.floor(pos.y)} ${Math.floor(pos.z)} 5.0 0.5 0`);
    dim.runCommandAsync(`playsound random.explode @a ${Math.floor(pos.x)} ${Math.floor(pos.y)} ${Math.floor(pos.z)} 5.0 0.7 0`);
    
    // Apply resistance, slow falling, and invulnerability for safety
    await player.runCommandAsync("effect @s slow_falling 60 0 true");
    await player.runCommandAsync("effect @s resistance 60 4 true");
    await player.runCommandAsync("effect @s health_boost 60 4 true");
    
    // Drill the 4x4 hole upward
    const startX = Math.floor(pos.x) - 1;
    const startZ = Math.floor(pos.z) - 1;
    
    // Dig hole with particle effects and progressive sounds
    let soundCounter = 0;
    for (let y = Math.floor(pos.y); y <= targetY; y++) {
      for (let x = startX; x < startX + 4; x++) {
        for (let z = startZ; z < startZ + 4; z++) {
          try {
            const block = dim.getBlock({ x, y, z });
            if (block && !block.isAir && block.typeId !== "minecraft:bedrock") {
              // Spawn multiple breaking particles
              dim.spawnParticle("minecraft:critical_hit_emitter", { x: x + 0.5, y: y + 0.5, z: z + 0.5 });
              dim.spawnParticle("minecraft:lava_particle", { x: x + 0.5, y: y + 0.5, z: z + 0.5 });
              block.setType("minecraft:air");
            }
          } catch {}
        }
      }
      
      // Play drilling sounds every 3 blocks
      if (y % 3 === 0) {
        soundCounter++;
        const pitch = 0.8 + (soundCounter * 0.05);
        try {
          dim.runCommandAsync(`playsound dig.stone @a ${Math.floor(pos.x)} ${Math.floor(y)} ${Math.floor(pos.z)} 2.0 ${pitch} 0`);
          if (soundCounter % 2 === 0) {
            dim.runCommandAsync(`playsound block.piston.in @a ${Math.floor(pos.x)} ${Math.floor(y)} ${Math.floor(pos.z)} 1.5 ${pitch} 0`);
          }
        } catch {}
      }
      
      // Add slight delay every few blocks
      if (y % 3 === 0) {
        await new Promise(resolve => system.runTimeout(resolve, 1));
      }
    }
    
    player.sendMessage("§b§lSuper Drill:§r §c§l⚡ LAUNCHING! ⚡§r");
    
    // Calculate hole center (player stays centered in 4x4 hole)
    const holeCenterX = Math.floor(pos.x) + 0.5;
    const holeCenterZ = Math.floor(pos.z) + 0.5;
    
    // Calculate final landing position (4 blocks away from hole)
    const launchX = holeCenterX + 4;
    const launchY = targetY;
    const launchZ = holeCenterZ;
    
    // INSTANT TELEPORT TO SURFACE (no stages to avoid wall-clipping)
    player.teleport(
      { x: holeCenterX, y: launchY, z: holeCenterZ }, 
      { dimension: dim, keepVelocity: false }
    );
    
    // Apply slow falling to prevent fall damage
    await player.runCommandAsync("effect @s slow_falling 20 0 true");
    await player.runCommandAsync("effect @s resistance 20 4 true");
    
    // EPIC ARRIVAL AT SURFACE - LIGHTNING STORM, ENDERDRAGON, MASSIVE PARTICLES
    try {
      await player.runCommandAsync(`camerashake add @s 3.0 1.0 positional`);
      
      // Spawn multiple lightning strikes around the hole (no damage)
      for (let i = 0; i < 12; i++) {
        system.runTimeout(() => {
          const angle = (i * 30) * Math.PI / 180;
          const radius = 2 + (i % 3);
          const lx = holeCenterX + Math.cos(angle) * radius;
          const lz = holeCenterZ + Math.sin(angle) * radius;
          try {
            dim.runCommandAsync(`summon lightning_bolt ${lx} ${launchY} ${lz} ~ ~ ~ minecraft:become_charge_bolt`).catch(()=>{});
          } catch {}
        }, i * 8);
      }
      
      // ENDERDRAGON ROAR AND WING FLAP SOUNDS (epic arrival)
      dim.runCommandAsync(`playsound mob.enderdragon.growl @a ${Math.floor(holeCenterX)} ${Math.floor(launchY)} ${Math.floor(holeCenterZ)} 6.0 0.7 0`);
      dim.runCommandAsync(`playsound mob.enderdragon.flap @a ${Math.floor(holeCenterX)} ${Math.floor(launchY)} ${Math.floor(holeCenterZ)} 5.0 0.5 0`);
      dim.runCommandAsync(`playsound mob.enderdragon.death @a ${Math.floor(holeCenterX)} ${Math.floor(launchY)} ${Math.floor(holeCenterZ)} 4.0 1.2 0`);
      
      // Thunder and massive explosion sounds
      dim.runCommandAsync(`playsound ambient.weather.thunder @a ${Math.floor(holeCenterX)} ${Math.floor(launchY)} ${Math.floor(holeCenterZ)} 5.0 0.6 0`);
      dim.runCommandAsync(`playsound random.explode @a ${Math.floor(holeCenterX)} ${Math.floor(launchY)} ${Math.floor(holeCenterZ)} 5.0 0.4 0`);
      dim.runCommandAsync(`playsound firework.large_blast @a ${Math.floor(holeCenterX)} ${Math.floor(launchY)} ${Math.floor(holeCenterZ)} 4.5 1.0 0`);
      dim.runCommandAsync(`playsound firework.twinkle @a ${Math.floor(holeCenterX)} ${Math.floor(launchY)} ${Math.floor(holeCenterZ)} 4.0 1.3 0`);
      dim.runCommandAsync(`playsound random.levelup @a ${Math.floor(holeCenterX)} ${Math.floor(launchY)} ${Math.floor(holeCenterZ)} 4.5 1.6 0`);
      dim.runCommandAsync(`playsound beacon.activate @a ${Math.floor(holeCenterX)} ${Math.floor(launchY)} ${Math.floor(holeCenterZ)} 4.0 0.7 0`);
      dim.runCommandAsync(`playsound block.end_portal.spawn @a ${Math.floor(holeCenterX)} ${Math.floor(launchY)} ${Math.floor(holeCenterZ)} 4.0 0.9 0`);
      
      // MASSIVE PARTICLE EFFECTS DOWN THE ENTIRE HOLE
      const holeDepth = Math.floor(launchY - pos.y);
      for (let yLevel = 0; yLevel < holeDepth; yLevel += 3) {
        const particleY = Math.floor(pos.y) + yLevel;
        system.runTimeout(() => {
          // Multiple huge explosions at this level
          dim.spawnParticle("minecraft:huge_explosion_emitter", { x: holeCenterX, y: particleY, z: holeCenterZ });
          dim.spawnParticle("minecraft:huge_explosion_emitter", { x: holeCenterX + 1, y: particleY, z: holeCenterZ + 1 });
          dim.spawnParticle("minecraft:huge_explosion_emitter", { x: holeCenterX - 1, y: particleY, z: holeCenterZ - 1 });
          dim.spawnParticle("minecraft:totem_particle", { x: holeCenterX, y: particleY, z: holeCenterZ });
          dim.spawnParticle("minecraft:lava_particle", { x: holeCenterX, y: particleY, z: holeCenterZ });
          dim.spawnParticle("minecraft:sparkler_emitter", { x: holeCenterX + 0.5, y: particleY, z: holeCenterZ });
          dim.spawnParticle("minecraft:sparkler_emitter", { x: holeCenterX - 0.5, y: particleY, z: holeCenterZ });
          dim.spawnParticle("minecraft:critical_hit_emitter", { x: holeCenterX, y: particleY + 1, z: holeCenterZ });
        }, Math.floor(yLevel / 3) * 2);
      }
      
      // Move player to safe landing spot
      await player.teleport(
        { x: launchX, y: launchY, z: launchZ }, 
        { dimension: dim, keepVelocity: false }
      );
      
      // SAFETY: Clear area around player
      const clearX = Math.floor(launchX);
      const clearY = Math.floor(launchY);
      const clearZ = Math.floor(launchZ);
      
      for (let x = clearX - 1; x <= clearX + 1; x++) {
        for (let y = clearY; y <= clearY + 2; y++) {
          for (let z = clearZ - 1; z <= clearZ + 1; z++) {
            try {
              const block = dim.getBlock({ x, y, z });
              if (block && !block.isAir && block.typeId !== "minecraft:bedrock") {
                block.setType("minecraft:air");
              }
            } catch {}
          }
        }
      }
      
      // Massive explosion particle burst at landing (circular pattern)
      for (let i = 0; i < 30; i++) {
        const angle = (i * 12) * Math.PI / 180;
        const radius = 2 + (i % 3) * 0.5;
        dim.spawnParticle("minecraft:huge_explosion_emitter", {
          x: launchX + Math.cos(angle) * radius,
          y: launchY,
          z: launchZ + Math.sin(angle) * radius
        });
        dim.spawnParticle("minecraft:totem_particle", {
          x: launchX + Math.cos(angle) * radius,
          y: launchY + 1,
          z: launchZ + Math.sin(angle) * radius
        });
      }
    } catch {}
    
    // Create extended sparkle trail
    for (let i = 0; i < 40; i++) {
      system.runTimeout(() => {
        try {
          if (!player.isValid()) return;
          const playerPos = player.location;
          dim.spawnParticle("minecraft:totem_particle", playerPos);
          dim.spawnParticle("minecraft:sparkler_emitter", playerPos);
          dim.spawnParticle("minecraft:villager_happy", { x: playerPos.x, y: playerPos.y + 1, z: playerPos.z });
        } catch {}
      }, i * 3);
    }
    
    player.sendMessage("§b§lSuper Drill:§r §a§l✓ SURFACE BREACHED! ✓§r");
    
    // Ask player if they want to fill the hole with TNT
    system.runTimeout(() => {
      try {
        if (!player.isValid()) return;
        
        const tntForm = new ActionFormData()
          .title("§b§lSuper Drill§r")
          .body("§7Want to toss TNT into the hole?§r\n§8(Fills the shaft with dirt)§r")
          .button("§c§lYES! Toss TNT!§r\n§7Fill the hole§r")
          .button("§7No, leave it open§r");
        
        tntForm.show(player).then(res => {
          if (!res || res.canceled) return;
          
          if (res.selection === 0) {
            // Player chose YES - fill the hole with dirt
            try {
              player.sendMessage("§b§lSuper Drill:§r §e*TOSSES TNT*§r");
              
              // Explosion sounds and effects
              dim.runCommandAsync(`playsound random.explode @a ${Math.floor(holeCenterX)} ${Math.floor(pos.y + 10)} ${Math.floor(holeCenterZ)} 3.0 0.8 0`);
              dim.runCommandAsync(`playsound random.explode @a ${Math.floor(holeCenterX)} ${Math.floor(pos.y + 20)} ${Math.floor(holeCenterZ)} 2.5 1.0 0`);
              
              // Visual explosion particles down the hole
              for (let i = 0; i < 8; i++) {
                system.runTimeout(() => {
                  const explosionY = pos.y + (i * 5);
                  dim.spawnParticle("minecraft:huge_explosion_emitter", { 
                    x: holeCenterX, 
                    y: explosionY, 
                    z: holeCenterZ 
                  });
                  dim.spawnParticle("minecraft:lava_particle", { 
                    x: holeCenterX, 
                    y: explosionY, 
                    z: holeCenterZ 
                  });
                }, i * 3);
              }
              
              // Fill the 4x4 hole with layered materials after explosion effect
              system.runTimeout(() => {
                const startX = Math.floor(holeCenterX) - 1;
                const startZ = Math.floor(holeCenterZ) - 1;
                // Fill only to surface level (not above)
                const fillToY = surfaceY;
                
                for (let y = Math.floor(pos.y); y <= fillToY; y++) {
                  for (let x = startX; x < startX + 4; x++) {
                    for (let z = startZ; z < startZ + 4; z++) {
                      try {
                        const block = dim.getBlock({ x, y, z });
                        if (block && block.isAir) {
                          // Choose block type based on depth
                          let blockType = "minecraft:dirt";
                          
                          // Top 3 layers: dirt
                          if (y >= fillToY - 2) {
                            blockType = "minecraft:dirt";
                          }
                          // Next 10 layers: cobblestone
                          else if (y >= fillToY - 12) {
                            blockType = "minecraft:cobblestone";
                          }
                          // Y=0 to Y=10: deepslate
                          else if (y >= 0 && y <= 10) {
                            blockType = "minecraft:deepslate";
                          }
                          // Y=-64 to Y=-1: deepslate
                          else if (y < 0) {
                            blockType = "minecraft:deepslate";
                          }
                          // Everything else: stone
                          else {
                            blockType = "minecraft:stone";
                          }
                          
                          block.setType(blockType);
                        }
                      } catch {}
                    }
                  }
                }
                
                player.sendMessage("§b§lSuper Drill:§r §a§lBOOM! Hole filled with natural materials!§r");
                dim.runCommandAsync(`playsound random.explode @a ${Math.floor(holeCenterX)} ${Math.floor(pos.y)} ${Math.floor(holeCenterZ)} 2.0 0.6 0`);
              }, 30); // Wait for explosion effects to finish
              
            } catch (err) {
              console.warn("TNT fill error:", err);
            }
          } else {
            // Player chose NO
            player.sendMessage("§b§lSuper Drill:§r §7Hole left open.§r");
          }
        }).catch(() => {});
        
      } catch {}
    }, 50); // Show menu after arrival effects settle
    
    // Consume the drill
    system.runTimeout(() => {
      try {
        consumeDrill(player, itemStack);
        ACTIVE_DRILLS.delete(player.id);
      } catch {}
    }, 10);
    
  } catch (err) {
    console.warn("Super Drill UP error:", err);
    player.sendMessage?.("§cSuper Drill malfunctioned!");
    ACTIVE_DRILLS.delete(player.id);
  }
}

async function drillDown(player, itemStack) {
  try {
    ACTIVE_DRILLS.set(player.id, true);
    
    player.sendMessage("§b§lSuper Drill:§r §eScanning downward...§r");
    const dim = player.dimension;
    const pos = player.location;
    
    // Scan downward to find bedrock
    let bedrockY = -64; // Default bedrock level
    let minScan = -64;
    
    for (let y = Math.floor(pos.y) - 1; y > minScan; y--) {
      try {
        const testBlock = dim.getBlock({ x: Math.floor(pos.x), y, z: Math.floor(pos.z) });
        if (testBlock && testBlock.typeId === "minecraft:bedrock") {
          bedrockY = y + 1; // Stop just above bedrock
          break;
        }
      } catch {}
    }
    
    player.sendMessage(`§b§lSuper Drill:§r §aFound bedrock! Drilling to Y=${bedrockY}...§r`);
    
    // Apply feather falling for 3 minutes
    await player.runCommandAsync("effect @s slow_falling 180 0 true");
    
    // Drill the 4x4 hole downward
    const startX = Math.floor(pos.x) - 1;
    const startZ = Math.floor(pos.z) - 1;
    
    // Play drilling sound
    try {
      dim.runCommandAsync(`playsound block.piston.in @a ${Math.floor(pos.x)} ${Math.floor(pos.y)} ${Math.floor(pos.z)} 2.0 0.8 0`);
    } catch {}
    
    // Dig hole with particle effects
    for (let y = Math.floor(pos.y); y >= bedrockY; y--) {
      for (let x = startX; x < startX + 4; x++) {
        for (let z = startZ; z < startZ + 4; z++) {
          try {
            const block = dim.getBlock({ x, y, z });
            if (block && !block.isAir && block.typeId !== "minecraft:bedrock") {
              // Spawn breaking particles
              dim.spawnParticle("minecraft:critical_hit_emitter", { x: x + 0.5, y: y + 0.5, z: z + 0.5 });
              block.setType("minecraft:air");
            }
          } catch {}
        }
      }
      // Add delay every few blocks for visual effect
      if (y % 5 === 0) {
        await new Promise(resolve => system.runTimeout(resolve, 2));
      }
    }
    
    player.sendMessage("§b§lSuper Drill:§r §a§lHole complete! Enjoy your descent!§r");
    
    // Play completion sound
    try {
      dim.runCommandAsync(`playsound random.levelup @a ${Math.floor(pos.x)} ${Math.floor(pos.y)} ${Math.floor(pos.z)} 1.5 0.8 0`);
    } catch {}
    
    // Create sparkle effects during fall
    for (let i = 0; i < 60; i++) {
      system.runTimeout(() => {
        try {
          if (!player.isValid()) return;
          const playerPos = player.location;
          dim.spawnParticle("minecraft:totem_particle", playerPos);
          dim.spawnParticle("minecraft:sparkler_emitter", {
            x: playerPos.x,
            y: playerPos.y + 1,
            z: playerPos.z
          });
        } catch {}
      }, i * 10);
    }
    
    player.sendMessage("§b§lSuper Drill:§r §a✓ Bedrock reached!§r");
    
    // Consume the drill
    system.runTimeout(() => {
      try {
        consumeDrill(player, itemStack);
        ACTIVE_DRILLS.delete(player.id);
      } catch {}
    }, 10);
    
  } catch (err) {
    console.warn("Super Drill DOWN error:", err);
    player.sendMessage?.("§cSuper Drill malfunctioned!");
    ACTIVE_DRILLS.delete(player.id);
  }
}

function consumeDrill(player, itemStack) {
  try {
    const inv = player.getComponent("minecraft:inventory");
    if (!inv) return;
    
    const container = inv.container;
    if (!container) return;
    
    // Find and remove the drill
    for (let i = 0; i < container.size; i++) {
      try {
        const slot = container.getItem(i);
        if (slot && slot.typeId === "myname:superdrill") {
          container.setItem(i, undefined);
          player.sendMessage("§b§lSuper Drill:§r §7One-use tool consumed.§r");
          
          // Play break sound
          try {
            player.dimension.runCommandAsync(
              `playsound random.break @a ${Math.floor(player.location.x)} ${Math.floor(player.location.y)} ${Math.floor(player.location.z)} 1.0 1.0 0`
            );
          } catch {}
          
          return;
        }
      } catch {}
    }
  } catch (err) {
    console.warn("Consume drill error:", err);
  }
}
