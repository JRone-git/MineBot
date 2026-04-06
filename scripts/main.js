// LABS - Leny's Amped Bots
import { world, system, ItemStack } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import bannedCfg from "./config/banned_bots.js";
import "./scripts/trash_bot.js";
import "./scripts/farmer_bot.js";
import "./scripts/bot_manual.js";
import "./scripts/world_shop.js";
import "./scripts/ops_manual_ui.js";
import "./scripts/karma.js";
import "./scripts/superdrill.js";
import "./scripts/superdrill_recipe.js";
import "./scripts/biome_bomb.js";

// Global safety: wrap Dimension.runCommandAsync to always catch rejections and log the failing cmd once
try {
  function patchDim(d) {
    try {
      const proto = Object.getPrototypeOf(d);
      if (!proto || proto.__labsPatched) return;
      const orig = proto.runCommandAsync;
      if (typeof orig !== 'function') return;
      proto.runCommandAsync = function(cmd) {
        try {
          if (typeof cmd === 'string' && cmd.startsWith('playsound ')){
            const m = cmd.match(/^playsound\s+([^\s]+)/);
            const id = m && m[1];
            const MUSIC_IDS = new Set([
              'labs.end_is_waiting','labs.fisher_song','labs.miner_song','labs.beekeeper_song','labs.butler_song','labs.justice_march','labs.shroom_song','labs.smelter_song','labs.party_song','labs.creeper_song','labs.iron_golems','labs.chicken_storm','labs.piglin_congo','labs.trash_bot_song','labs.chef_song','record.pigstep','record.otherside','record.relic'
            ]);
            if (id && MUSIC_IDS.has(id)){
              const now = Date.now();
              const until = Number(globalThis.LABS_musicUntil||0);
              if (now < until){
                // block overlapping music
                return Promise.resolve({});
              }
              // set lock briefly to avoid immediate overlaps (~10s)
              globalThis.LABS_musicUntil = now + 10*1000;
            }
          }
        } catch {}
        let p;
        try { p = orig.call(this, cmd); } catch (e) { try { console.warn?.(`[LABS] Command threw before promise: ${cmd}`); } catch {} return Promise.reject(e); }
        try {
          const SUPPRESS_FAIL_PREFIXES = ['tickingarea add', 'tickingarea remove'];
          const suppress = (typeof cmd === 'string') && SUPPRESS_FAIL_PREFIXES.some(pref => cmd.startsWith(pref));
          if (!suppress) {
            p?.catch?.(err => { try { console.warn?.(`[LABS] Command failed: ${cmd}`); } catch {} });
          } else {
            p?.catch?.(() => {});
          }
        } catch {}
        return p;
      };
      proto.__labsPatched = true;
    } catch {}
  }
  // Patch all known dimensions once
  ["overworld","nether","the_end"].forEach(k=>{ try { const d=world.getDimension(k); if (d) patchDim(d); } catch {} });
  // Also patch on world init in case server resets objects
  try { world.afterEvents.worldInitialize.subscribe(() => { ["overworld","nether","the_end"].forEach(k=>{ try { const d=world.getDimension(k); if (d) patchDim(d); } catch {} }); }); } catch {}
} catch {}

export const LABS_VERSION = "1.0.94";

// Feature flags system (defined early for configuration menu access)
const FEATURE_FLAGS_KEY = "labs_feature_flags";
let FEATURE_FLAGS = {};

function loadFeatureFlags() {
  try{ const raw=world.getDynamicProperty?.(FEATURE_FLAGS_KEY); FEATURE_FLAGS = raw && typeof raw==='string' ? JSON.parse(raw) : {}; }
  catch{ FEATURE_FLAGS = {}; }
}

function saveFeatureFlags() {
  try{ const s = JSON.stringify(FEATURE_FLAGS||{}); world.setDynamicProperty?.(FEATURE_FLAGS_KEY, s.length>3900 ? s.slice(0,3900) : s); }catch{}
}

function isFeatureEnabled(name) {
  try{ const v = FEATURE_FLAGS?.[name]; return v === false ? false : true; }catch{ return true; }
}

// Initialize feature flags on world load
try{ world.afterEvents.worldInitialize.subscribe(()=>{ loadFeatureFlags(); }); }catch{}

// Configuration menu helper functions are defined later in the file

// Removed broken duplicate configuration menu - using working version below

// Helper function to show OP Tools menu
function showOpToolsMenu(player) {
  const of = new ActionFormData().title("OP Tools")
    .body("Choose an admin tool:")
    .button("Private Structures (OP)")
    .button("Lava Chicken Stand (OP)")
    .button("Configure Access (OP)")
    .button("World Store Pricing (OP)")
    .button("Bot Ops (OP)")
    .button("Events (OP)")
    .button("Ops Manual")
    .button("◄ Back to LABS Menu");
  of.show(player).then(or=>{
    if (!or || or.canceled) return;
    if (or.selection === 7) {
      // Back to LABS Menu
      system.runTimeout(() => globalThis.LABS_showMainMenu(player), 1);
      return;
    }
    if (or.selection===0){ 
      try{ 
        if (globalThis.LABS_openOpsPrivateMenu) {
          globalThis.LABS_openOpsPrivateMenu(player);
        } else {
          player.sendMessage?.("Private structures tool not loaded yet.");
          system.runTimeout(() => showOpToolsMenu(player), 1);
        }
      }catch{
        system.runTimeout(() => showOpToolsMenu(player), 1);
      }
      return;
    }
    else if (or.selection===1){ 
      try{ 
        if (globalThis.LABS_placeLavaChickenStand) {
          globalThis.LABS_placeLavaChickenStand(player);
          system.runTimeout(() => showOpToolsMenu(player), 1);
        } else {
          player.sendMessage?.("Structure tool not loaded yet.");
          system.runTimeout(() => showOpToolsMenu(player), 1);
        }
      }catch{
        system.runTimeout(() => showOpToolsMenu(player), 1);
      }
      return;
    }
    else if (or.selection===2){
    // Configure Access (OP) - Main Category Menu
    const configMenu = new ActionFormData()
      .title("§d§l⚙ Configure Access (OP)§r")
      .body("§7Choose configuration category:§r")
      .button("§b§l🎮 UI Features§r\n§7Toggles for player UI access§r")
      .button("§6§l⚙ Bot Settings§r\n§7Limits & configurations§r")
      .button("§a§l🤖 Enable/Disable Bots§r\n§7Toggle individual bots§r")
      .button("§c§l🎭 Event Timing§r\n§7Control event frequency & timing§r")
      .button("§e§l💰 Economy Balance§r\n§7Adjust economy multipliers§r")
      .button("§f§l⚙ Bot Behavior§r\n§7Customize bot personalities§r")
      .button("§e§l◄ Back§r");
    configMenu.show(player).then(confRes=>{
      if (!confRes || confRes.canceled) return;
      if (confRes.selection === 6) {
        // Back to OP Tools Menu
        system.runTimeout(() => showOpToolsMenu(player), 1);
        return;
      }
      // Handle Configure Access sub-menus here
      if (confRes.selection === 0) {
        // UI Features
        const showUIFeatures = () => {
          const mf = new ModalFormData().title("§b§l🎮 UI Features§r")
            .toggle("Get My Bots (UI)", isFeatureEnabled('getMyBots'))
            .toggle("Teleport to My Bots (UI)", isFeatureEnabled('teleportBots'))
            .toggle("Play Music (UI)", isFeatureEnabled('playMusic'))
            .toggle("Welcome Pack (starter grants)", isFeatureEnabled('welcomePack'))
            .toggle("Super Drill (powerful drilling tool)", isFeatureEnabled('superDrill'))
            .toggle("Biome Bomb (creeping biome transformation)", isFeatureEnabled('biomeBomb'));
          
          mf.show(player).then(fr => {
            if (!fr || fr.canceled) { 
              system.runTimeout(() => showOpToolsMenu(player), 1);
              return; 
            }
            
            try {
              const vals = fr.formValues || [];
              FEATURE_FLAGS = FEATURE_FLAGS || {};
              FEATURE_FLAGS.getMyBots = !!vals[0];
              FEATURE_FLAGS.teleportBots = !!vals[1];
              FEATURE_FLAGS.playMusic = !!vals[2];
              FEATURE_FLAGS.welcomePack = !!vals[3];
              FEATURE_FLAGS.superDrill = !!vals[4];
              FEATURE_FLAGS.biomeBomb = !!vals[5];
              saveFeatureFlags();
              try{ player.sendMessage("§aUI features updated.§r"); }catch{}
            } catch (e) {
              try{ player.sendMessage(`§cError updating UI features: ${e.message}`); }catch{}
            }
            
            system.runTimeout(() => showOpToolsMenu(player), 1);
          }).catch(() => {});
        };
        showUIFeatures();
        return;
        
      } else if (confRes.selection === 1) {
        // Bot Settings
        const showBotSettings = () => {
          const currentMinerLimit = Math.max(1, Math.min(100, Number((FEATURE_FLAGS||{}).minerLimit ?? 3)|0));
          const currentFisherLimit = Math.max(1, Math.min(100, Number((FEATURE_FLAGS||{}).fisherLimit ?? 1)|0));
          const currentRarity = (FEATURE_FLAGS||{}).fisherRarity ?? "default";
          const rarityValues = ["default", "common", "rare", "epic", "legendary"];
          const rarityIndex = Math.max(0, rarityValues.indexOf(currentRarity));

          const mf = new ModalFormData().title("§6§l⚙ Bot Settings§r")
            .slider("Miner Bot Limit (per player)", 1, 100, 1, currentMinerLimit)
            .slider("Fisher Bot Limit (per player)", 1, 100, 1, currentFisherLimit)
            .dropdown("Fisher Loot Rarity", ["Default", "Common (50%)", "Rare (10%)", "Epic (5%)", "Legendary (1-2%)"], rarityIndex);
          
          mf.show(player).then(fr => {
            if (!fr || fr.canceled) {
              system.runTimeout(() => showOpToolsMenu(player), 1);
              return;
            }
            
            try {
              const vals = fr.formValues || [];
              FEATURE_FLAGS = FEATURE_FLAGS || {};
              FEATURE_FLAGS.minerLimit = Math.max(1, Math.min(100, Number(vals[0]||3)|0));
              FEATURE_FLAGS.fisherLimit = Math.max(1, Math.min(100, Number(vals[1]||1)|0));
              FEATURE_FLAGS.fisherRarity = rarityValues[Number(vals[2]||0)|0] || "default";
              saveFeatureFlags();
              try{ player.sendMessage("§aBot Settings updated.§r"); }catch{}
            } catch (e) {
              try{ player.sendMessage(`§cError updating Bot Settings: ${e.message}`); }catch{}
            }
            
            system.runTimeout(() => showOpToolsMenu(player), 1);
          }).catch(() => {});
        };
        showBotSettings();
        return;
        
      } else if (confRes.selection === 2) {
        // Enable/Disable Bots
        const showEnableDisable = () => {
          const mf = new ModalFormData().title("§a§l🤖 Enable/Disable Bots§r")
            .toggle("Miner Bot", isFeatureEnabled('miner_bot'))
            .toggle("Constructor Bot", isFeatureEnabled('constructor_bot'))
            .toggle("Fisher Bot", isFeatureEnabled('fisher_bot'))
            .toggle("Shroom Bot", isFeatureEnabled('shroom_bot'))
            .toggle("Farmer Bot", isFeatureEnabled('farmer_bot'))
            .toggle("Beekeeper Bot", isFeatureEnabled('beekeeper_bot'))
            .toggle("Treasure Bot", isFeatureEnabled('treasure_bot'))
            .toggle("Storekeeper Bot", isFeatureEnabled('storekeeper_bot'))
            .toggle("Chef Bot", isFeatureEnabled('chef_bot'))
            .toggle("Butler Bot", isFeatureEnabled('butler_bot'))
            .toggle("Redstone Bot", isFeatureEnabled('redstone_bot'))
            .toggle("Trash Bot", isFeatureEnabled('trash_bot'))
            .toggle("Smelter Bot", isFeatureEnabled('smelter_bot'))
            .toggle("Portal Bot", isFeatureEnabled('portal_bot'))
            .toggle("Control Bot", isFeatureEnabled('control_bot'));
          
          mf.show(player).then(fr => {
            if (!fr || fr.canceled) {
              system.runTimeout(() => showOpToolsMenu(player), 1);
              return;
            }
            
            try {
              const vals = fr.formValues || [];
              FEATURE_FLAGS = FEATURE_FLAGS || {};
              FEATURE_FLAGS.miner_bot = !!vals[0];
              FEATURE_FLAGS.constructor_bot = !!vals[1];
              FEATURE_FLAGS.fisher_bot = !!vals[2];
              FEATURE_FLAGS.shroom_bot = !!vals[3];
              FEATURE_FLAGS.farmer_bot = !!vals[4];
              FEATURE_FLAGS.beekeeper_bot = !!vals[5];
              FEATURE_FLAGS.treasure_bot = !!vals[6];
              FEATURE_FLAGS.storekeeper_bot = !!vals[7];
              FEATURE_FLAGS.chef_bot = !!vals[8];
              FEATURE_FLAGS.butler_bot = !!vals[9];
              FEATURE_FLAGS.redstone_bot = !!vals[10];
              FEATURE_FLAGS.trash_bot = !!vals[11];
              FEATURE_FLAGS.smelter_bot = !!vals[12];
              FEATURE_FLAGS.portal_bot = !!vals[13];
              FEATURE_FLAGS.control_bot = !!vals[14];
              saveFeatureFlags();
              try{ player.sendMessage("§aBot status updated.§r"); }catch{}
            } catch (e) {
              try{ player.sendMessage(`§cError updating bot status: ${e.message}`); }catch{}
            }
            
            system.runTimeout(() => showOpToolsMenu(player), 1);
          }).catch(() => {});
        };
        showEnableDisable();
        return;
        
      } else if (confRes.selection === 3) {
        // Event Timing
        const showEventTiming = () => {
          const currentAutoEvents = isFeatureEnabled('autoEvents');
          const currentChickenFreq = (FEATURE_FLAGS||{}).chickenFreq ?? "default";
          const currentEndFreq = (FEATURE_FLAGS||{}).endFreq ?? "default";
          const currentCooldown = Math.max(1, Math.min(24, Number((FEATURE_FLAGS||{}).eventCooldown ?? 1)|0));
          const freqValues = ["default", "rare", "frequent"];
          const chickenIndex = Math.max(0, freqValues.indexOf(currentChickenFreq));
          const endIndex = Math.max(0, freqValues.indexOf(currentEndFreq));

          const mf = new ModalFormData().title("§c§l🎭 Event Timing§r")
            .toggle("Auto Events Enabled", currentAutoEvents)
            .dropdown("Chicken Storm Frequency", ["Default", "Rare", "Frequent"], chickenIndex)
            .dropdown("End is Waiting Frequency", ["Default", "Rare", "Frequent"], endIndex)
            .slider("Event Cooldown (hours)", 1, 24, 1, currentCooldown);
          
          mf.show(player).then(fr => {
            if (!fr || fr.canceled) {
              system.runTimeout(() => showOpToolsMenu(player), 1);
              return;
            }
            
            try {
              const vals = fr.formValues || [];
              FEATURE_FLAGS = FEATURE_FLAGS || {};
              FEATURE_FLAGS.autoEvents = !!vals[0];
              FEATURE_FLAGS.chickenFreq = freqValues[Number(vals[1]||0)|0] || "default";
              FEATURE_FLAGS.endFreq = freqValues[Number(vals[2]||0)|0] || "default";
              FEATURE_FLAGS.eventCooldown = Math.max(1, Math.min(24, Number(vals[3]||1)|0));
              saveFeatureFlags();
              try{ player.sendMessage("§aEvent Timing updated.§r"); }catch{}
            } catch (e) {
              try{ player.sendMessage(`§cError updating Event Timing: ${e.message}`); }catch{}
            }
            
            system.runTimeout(() => showOpToolsMenu(player), 1);
          }).catch(() => {});
        };
        showEventTiming();
        return;
        
      } else if (confRes.selection === 4) {
        // Economy Balance
        try{ openEconomyBalanceMenu(player); }catch(e){ player.sendMessage?.("Error opening Economy Balance menu."); }
        return;
      } else if (confRes.selection === 5) {
        // Bot Behavior
        try{ openBotBehaviorMenu(player); }catch(e){ player.sendMessage?.("Error opening Bot Behavior menu."); }
        return;
      }
    }).catch(()=>{});
    } else if (or.selection===3){
    // World Store Pricing (OP)
    try{ 
      if (globalThis.LABS_openWorldStorePricingMenu) {
        globalThis.LABS_openWorldStorePricingMenu(player);
      } else {
        player.sendMessage?.("World Store not loaded yet.");
        system.runTimeout(() => showOpToolsMenu(player), 1);
      }
    }catch{
      system.runTimeout(() => showOpToolsMenu(player), 1);
    }
    return;
    } else if (or.selection===4){
    // Bot Ops (OP): Manage bot operators
    const botOpsMainMenu = new ActionFormData().title("Bot Ops Management")
      .body("Manage bot operators and their permissions:")
      .button("Assign/Remove Bot Op")
      .button("View Current Bot Ops")
      .button("◄ Back to OP Tools");
    
    botOpsMainMenu.show(player).then(mainRes => {
      if (!mainRes || mainRes.canceled) return;
      
      if (mainRes.selection === 2) {
        // Back to OP Tools Menu
        system.runTimeout(() => showOpToolsMenu(player), 1);
        return;
      }
      
      if (mainRes.selection === 0) {
        // Assign/Remove Bot Op
        const players = world.getPlayers();
        if (!players.length) {
          try{ player.sendMessage("No players online."); }catch{}
          return;
        }
        
        loadBotOps();
        const names = players.map(p => {
          const isOp = isBotOpName(p.name);
          return `${p.name} ${isOp ? '§a[Bot Op]' : '§7[Player]'}`;
        });
        
        const botOpsMenu = new ModalFormData().title("Assign/Remove Bot Op")
          .body("Select a player to toggle bot operator status:\n\n§a[Bot Op] = Current bot operator\n§7[Player] = Regular player")
          .dropdown("Player", names, 0);
        
        botOpsMenu.show(player).then(res => {
          if (!res || res.canceled) return;
          const targetIdx = Number(res.formValues?.[0]||0)|0;
          const target = players[targetIdx];
          if (!target) return;
          
          const hasAdmin = target.hasTag && target.hasTag("labs_admin");
          const isCurrentlyOp = isBotOpName(target.name);
          
          // Show confirmation dialog
          const confirmMenu = new ModalFormData().title("Confirm Bot Op Change")
            .body(`Player: ${target.name}\nCurrent Status: ${isCurrentlyOp ? 'Bot Operator' : 'Regular Player'}\n\nAre you sure you want to ${isCurrentlyOp ? 'remove' : 'grant'} bot operator status?`)
            .toggle("Confirm", false);
          
          confirmMenu.show(player).then(confirmRes => {
            if (!confirmRes || confirmRes.canceled || !confirmRes.formValues?.[0]) return;
            
            try {
              if (hasAdmin) {
                target.removeTag("labs_admin");
                // Remove from BOT_OPS list
                const index = BOT_OPS.indexOf(target.name);
                if (index > -1) {
                  BOT_OPS.splice(index, 1);
                  saveBotOps();
                }
                player.sendMessage(`§cRemoved bot operator status from ${target.name}.`);
                target.sendMessage("§cYour bot operator status has been removed.");
              } else {
                target.addTag("labs_admin");
                // Add to BOT_OPS list
                if (!BOT_OPS.includes(target.name)) {
                  BOT_OPS.push(target.name);
                  saveBotOps();
                }
                player.sendMessage(`§aGranted bot operator status to ${target.name}.`);
                target.sendMessage("§aYou have been granted bot operator status!");
              }
            } catch (error) {
              player.sendMessage(`§cError updating bot operator status: ${error.message}`);
            }
          }).catch(() => {});
        }).catch(() => {});
        
      } else if (mainRes.selection === 1) {
        // View Current Bot Ops
        loadBotOps();
        const allPlayers = world.getPlayers();
        const onlineOps = allPlayers.filter(p => isBotOpName(p.name));
        const offlineOps = BOT_OPS.filter(name => !allPlayers.some(p => p.name === name));
        
        let message = "§6=== Current Bot Operators ===\n\n";
        
        if (onlineOps.length > 0) {
          message += "§aOnline Bot Ops:\n";
          onlineOps.forEach(op => {
            message += `§a• ${op.name}\n`;
          });
          message += "\n";
        }
        
        if (offlineOps.length > 0) {
          message += "§7Offline Bot Ops:\n";
          offlineOps.forEach(op => {
            message += `§7• ${op}\n`;
          });
          message += "\n";
        }
        
        if (onlineOps.length === 0 && offlineOps.length === 0) {
          message += "§7No bot operators currently assigned.\n";
        }
        
        message += `\n§eTotal Bot Ops: ${BOT_OPS.length}`;
        
        const viewMenu = new ActionFormData().title("Current Bot Operators")
          .body(message)
          .button("◄ Back to Bot Ops Menu");
        
        viewMenu.show(player).then(() => {
          system.runTimeout(() => showOpToolsMenu(player), 1);
        }).catch(() => {});
      }
    }).catch(() => {});
    } else if (or.selection===5){
    // Events (OP)
    const eventsMenu = new ActionFormData().title("Events (OP)")
      .body("Choose an event to trigger:")
      .button("Trigger Chicken Storm")
      .button("Trigger The End is Waiting")
      .button("Trigger Creeper Serenade")
      .button("Trigger Golem March")
      .button("Trigger Piglin Congo (Nether)")
      .button("Trigger Eugene (Lava Gift)")
      .button("Trigger Eugene (Talk)")
      .button("Trigger Justice (target self)")
      .button("Trigger Trash Bot Song (near player)")
      .button("◄ Back to OP Tools");
    eventsMenu.show(player).then(evRes=>{
      if (!evRes || evRes.canceled) return;
      if (evRes.selection === 9) {
        // Back to OP Tools Menu
        system.runTimeout(() => showOpToolsMenu(player), 1);
        return;
      }
      
      // Events that target self (no player selection needed)
      if (evRes.selection === 7) {
        // Trigger Justice (target self)
        try{ if (globalThis.LABS_triggerJustice) globalThis.LABS_triggerJustice(player); else player.sendMessage?.("Justice not available."); }catch{}
        return;
      }
      
      // Events that need target player selection
      const players = world.getPlayers();
      if (!players.length) {
        try{ player.sendMessage("No players online for events."); }catch{}
        return;
      }
      const names = players.map(p=>p.name);
      const targetForm = new ModalFormData().title("Select Target Player")
        .dropdown("Player", names, 0);
      targetForm.show(player).then(targetRes=>{
        if (!targetRes || targetRes.canceled) return;
        const targetIdx = Number(targetRes.formValues?.[0]||0)|0;
        const target = players[targetIdx];
        if (!target) return;
        
        if (evRes.selection === 0) {
          // Trigger Chicken Storm
          try{ if (globalThis.LABS_triggerChickenStorm) globalThis.LABS_triggerChickenStorm(target); else player.sendMessage?.("Chicken Storm not available."); }catch{}
        } else if (evRes.selection === 1) {
          // Trigger The End is Waiting
          try{ if (globalThis.LABS_triggerEndIsWaiting) globalThis.LABS_triggerEndIsWaiting(target); else player.sendMessage?.("End Is Waiting not available."); }catch{}
        } else if (evRes.selection === 2) {
          // Trigger Creeper Serenade
          try{ if (globalThis.LABS_startCreeperSerenade) globalThis.LABS_startCreeperSerenade(target, true); else player.sendMessage?.("Creeper Serenade not available."); }catch{}
        } else if (evRes.selection === 3) {
          // Trigger Golem March
          try{ if (globalThis.LABS_startGolemMarch) globalThis.LABS_startGolemMarch(target, true); else player.sendMessage?.("Golem March not available."); }catch{}
        } else if (evRes.selection === 4) {
          // Trigger Piglin Congo (Nether)
          try{ if (globalThis.LABS_startPiglinCongo) globalThis.LABS_startPiglinCongo(target); else player.sendMessage?.("Piglin Congo not available."); }catch{}
        } else if (evRes.selection === 5) {
          // Trigger Eugene (Lava Gift)
          try{ if (globalThis.LABS_startEugeneLava) globalThis.LABS_startEugeneLava(target); else player.sendMessage?.("Eugene Lava Gift not available."); }catch{}
        } else if (evRes.selection === 6) {
          // Trigger Eugene (Talk)
          try{ if (globalThis.LABS_startEugeneTalk) globalThis.LABS_startEugeneTalk(target); else player.sendMessage?.("Eugene Talk not available."); }catch{}
        } else if (evRes.selection === 8) {
          // Trigger Trash Bot Song (near player)
          try{ if (globalThis.LABS_triggerTrashBotSong) globalThis.LABS_triggerTrashBotSong(target); else player.sendMessage?.("Trash Bot Song not available."); }catch{}
        }
      }).catch(()=>{});
    }).catch(()=>{});
    } else if (or.selection===6){
    try{ if (globalThis.LABS_openOpsManual) globalThis.LABS_openOpsManual(player); else player.sendMessage?.("Ops manual not loaded yet."); }catch{}
    }
  }).catch(()=>{});
}

// Export showOpToolsMenu to globalThis so other files can reference it
try{ globalThis.showOpToolsMenu = showOpToolsMenu; }catch{}

// Configuration menu functions
function openUIFeaturesMenu(player) {
  try {
    // Simple test - just show a basic message first
    player.sendMessage("§aUI Features menu opened successfully!");
    return;
  } catch (e) {
    player.sendMessage(`§cError in openUIFeaturesMenu: ${e.message}`);
  }
}

function openBotSettingsMenu(player) {
  try{ player.sendMessage("§eDEBUG: openBotSettingsMenu called"); }catch{}
  const currentMinerLimit = Math.max(1, Math.min(100, Number((FEATURE_FLAGS||{}).minerLimit ?? 3)|0));
  const currentFisherLimit = Math.max(1, Math.min(100, Number((FEATURE_FLAGS||{}).fisherLimit ?? 1)|0));
  const currentRarity = (FEATURE_FLAGS||{}).fisherRarity ?? "default";
  
  const rarityOptions = ["default", "common", "rare", "epic", "legendary"];
  const rarityIndex = Math.max(0, rarityOptions.indexOf(currentRarity));
  
  const menu = new ModalFormData()
    .title("Bot Settings (OP)")
    .body("Configure bot limits and settings:")
    .slider("Miner Bot Limit", 1, 100, 1, currentMinerLimit)
    .slider("Fisher Bot Limit", 1, 100, 1, currentFisherLimit)
    .dropdown("Fisher Loot Rarity", rarityOptions, rarityIndex);
  
  menu.show(player).then(res => {
    if (!res || res.canceled) return;
    
    const newMinerLimit = Math.max(1, Math.min(100, Number(res.formValues?.[0]||currentMinerLimit)|0));
    const newFisherLimit = Math.max(1, Math.min(100, Number(res.formValues?.[1]||currentFisherLimit)|0));
    const newRarityIndex = Number(res.formValues?.[2]||rarityIndex)|0;
    const newRarity = rarityOptions[newRarityIndex] || "default";
    
    let changesMade = false;
    const changes = [];
    
    if (newMinerLimit !== currentMinerLimit) {
      FEATURE_FLAGS.minerLimit = newMinerLimit;
      changesMade = true;
      changes.push(`Miner Bot Limit: ${newMinerLimit}`);
    }
    
    if (newFisherLimit !== currentFisherLimit) {
      FEATURE_FLAGS.fisherLimit = newFisherLimit;
      changesMade = true;
      changes.push(`Fisher Bot Limit: ${newFisherLimit}`);
    }
    
    if (newRarity !== currentRarity) {
      FEATURE_FLAGS.fisherRarity = newRarity;
      changesMade = true;
      changes.push(`Fisher Loot Rarity: ${newRarity}`);
    }
    
    if (changesMade) {
      saveFeatureFlags();
      try{ 
        player.sendMessage(`§aBot Settings updated:\n${changes.map(c => `§7• ${c}`).join('\n')}`); 
      }catch{}
    } else {
      try{ player.sendMessage("§7No changes made to Bot Settings."); }catch{}
    }
    
    // Return to Configure Access menu
    system.runTimeout(() => showConfigureAccessMenu(player), 1);
  }).catch(() => {});
}

function openBotToggleMenu(player) {
  try{ player.sendMessage("§eDEBUG: openBotToggleMenu called"); }catch{}
  const ALL_BOTS = [
    'miner_bot', 'constructor_bot', 'fisher_bot', 'shroom_bot', 'farmer_bot', 
    'beekeeper_bot', 'treasure_bot', 'storekeeper_bot', 'chef_bot', 'butler_bot', 
    'redstone_bot', 'trash_bot', 'smelter_bot', 'portal_bot', 'control_bot'
  ];
  
  const labels = ALL_BOTS.map(bot => bot.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()));
  
  const menu = new ModalFormData()
    .title("Enable/Disable Bots (OP)")
    .body("Toggle individual bots globally on/off:");
  
  // Add toggle switches for each bot
  ALL_BOTS.forEach(bot => {
    const enabled = isFeatureEnabled(bot);
    const label = bot.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    menu.toggle(label, enabled);
  });
  
  menu.show(player).then(res => {
    if (!res || res.canceled) return;
    
    let changesMade = false;
    const changes = [];
    
    // Process each toggle result
    res.formValues.forEach((value, index) => {
      const bot = ALL_BOTS[index];
      const label = labels[index];
      const currentState = isFeatureEnabled(bot);
      const newState = Boolean(value);
      
      if (currentState !== newState) {
        FEATURE_FLAGS[bot] = newState;
        changesMade = true;
        changes.push(`${label}: ${newState ? 'enabled' : 'disabled'}`);
      }
    });
    
    if (changesMade) {
      saveFeatureFlags();
      try{ 
        player.sendMessage(`§aBot Status updated:\n${changes.map(c => `§7• ${c}`).join('\n')}`); 
      }catch{}
    } else {
      try{ player.sendMessage("§7No changes made to Bot Status."); }catch{}
    }
    
    // Return to Configure Access menu
    system.runTimeout(() => showConfigureAccessMenu(player), 1);
  }).catch(() => {});
}

function openEventTimingMenu(player) {
  try{ player.sendMessage("§eDEBUG: openEventTimingMenu called"); }catch{}
  const currentAutoEvents = isFeatureEnabled('autoEvents');
  const currentChickenFreq = (FEATURE_FLAGS||{}).chickenFreq ?? "default";
  const currentEndFreq = (FEATURE_FLAGS||{}).endFreq ?? "default";
  const currentCooldown = Math.max(1, Math.min(24, Number((FEATURE_FLAGS||{}).eventCooldown ?? 1)|0));
  
  const freqOptions = ["default", "rare", "frequent"];
  const chickenIndex = Math.max(0, freqOptions.indexOf(currentChickenFreq));
  const endIndex = Math.max(0, freqOptions.indexOf(currentEndFreq));
  
  const menu = new ModalFormData()
    .title("Event Timing (OP)")
    .body("Control event frequency and timing:")
    .toggle("Auto Events", currentAutoEvents)
    .dropdown("Chicken Storm Frequency", freqOptions, chickenIndex)
    .dropdown("End is Waiting Frequency", freqOptions, endIndex)
    .slider("Event Cooldown (Hours)", 1, 24, 1, currentCooldown);
  
  menu.show(player).then(res => {
    if (!res || res.canceled) return;
    
    const newAutoEvents = Boolean(res.formValues?.[0]);
    const newChickenIndex = Number(res.formValues?.[1]||chickenIndex)|0;
    const newEndIndex = Number(res.formValues?.[2]||endIndex)|0;
    const newCooldown = Math.max(1, Math.min(24, Number(res.formValues?.[3]||currentCooldown)|0));
    
    const newChickenFreq = freqOptions[newChickenIndex] || "default";
    const newEndFreq = freqOptions[newEndIndex] || "default";
    
    let changesMade = false;
    const changes = [];
    
    if (newAutoEvents !== currentAutoEvents) {
      FEATURE_FLAGS.autoEvents = newAutoEvents;
      changesMade = true;
      changes.push(`Auto Events: ${newAutoEvents ? 'enabled' : 'disabled'}`);
    }
    
    if (newChickenFreq !== currentChickenFreq) {
      FEATURE_FLAGS.chickenFreq = newChickenFreq;
      changesMade = true;
      changes.push(`Chicken Storm Frequency: ${newChickenFreq}`);
    }
    
    if (newEndFreq !== currentEndFreq) {
      FEATURE_FLAGS.endFreq = newEndFreq;
      changesMade = true;
      changes.push(`End is Waiting Frequency: ${newEndFreq}`);
    }
    
    if (newCooldown !== currentCooldown) {
      FEATURE_FLAGS.eventCooldown = newCooldown;
      changesMade = true;
      changes.push(`Event Cooldown: ${newCooldown} hours`);
    }
    
    if (changesMade) {
      saveFeatureFlags();
      try{ 
        player.sendMessage(`§aEvent Timing updated:\n${changes.map(c => `§7• ${c}`).join('\n')}`); 
      }catch{}
    } else {
      try{ player.sendMessage("§7No changes made to Event Timing."); }catch{}
    }
    
    // Return to Configure Access menu
    system.runTimeout(() => showConfigureAccessMenu(player), 1);
  }).catch(() => {});
}

function openEconomyBalanceMenu(player) {
  const currentMode = (FEATURE_FLAGS||{}).economyMode ?? "balanced";
  const currentCoinMult = Math.max(0.1, Math.min(10, Number((FEATURE_FLAGS||{}).coinMultiplier ?? 1)|0));
  const currentKarmaMult = Math.max(0.1, Math.min(10, Number((FEATURE_FLAGS||{}).karmaMultiplier ?? 1)|0));
  const currentWelcomeCoins = Math.max(0, Math.min(10000, Number((FEATURE_FLAGS||{}).welcomeCoins ?? 500)|0));
  const currentWelcomeKarma = Math.max(0, Math.min(10000, Number((FEATURE_FLAGS||{}).welcomeKarma ?? 500)|0));
  
  const modeOptions = ["balanced", "casual", "hardcore"];
  const modeIndex = Math.max(0, modeOptions.indexOf(currentMode));
  
  const menu = new ActionFormData().title("Economy Balance (OP)")
    .body("Adjust economy multipliers:")
    .button(`Economy Mode: ${currentMode}`)
    .button(`Coin Multiplier: ${currentCoinMult}x`)
    .button(`Karma Multiplier: ${currentKarmaMult}x`)
    .button(`Welcome Coins: ${currentWelcomeCoins}`)
    .button(`Welcome Karma: ${currentWelcomeKarma}`)
    .button("◄ Back to Configure Access");
  
  menu.show(player).then(res => {
    if (!res || res.canceled) return;
    if (res.selection === 5) {
      // Back to Configure Access
      system.runTimeout(() => showOpToolsMenu(player), 1);
      return;
    }
    
    if (res.selection === 0) {
      // Economy Mode
      const modeMenu = new ModalFormData().title("Economy Mode")
        .dropdown("Mode", modeOptions, modeIndex);
      modeMenu.show(player).then(modeRes => {
        if (!modeRes || modeRes.canceled) return;
        const newIndex = Number(modeRes.formValues?.[0]||modeIndex)|0;
        const newMode = modeOptions[newIndex] || "balanced";
        if (newMode !== currentMode) {
          FEATURE_FLAGS.economyMode = newMode;
          saveFeatureFlags();
          try{ player.sendMessage(`Economy mode set to ${newMode}.`); }catch{}
        }
        system.runTimeout(() => openEconomyBalanceMenu(player), 1);
      }).catch(()=>{});
    } else if (res.selection === 1) {
      // Coin Multiplier
      const coinMenu = new ModalFormData().title("Coin Multiplier")
        .slider("Multiplier", 0.1, 10, 0.1, currentCoinMult);
      coinMenu.show(player).then(coinRes => {
        if (!coinRes || coinRes.canceled) return;
        const newMult = Math.max(0.1, Math.min(10, Number(coinRes.formValues?.[0]||currentCoinMult)|0));
        if (newMult !== currentCoinMult) {
          FEATURE_FLAGS.coinMultiplier = newMult;
          saveFeatureFlags();
          try{ player.sendMessage(`Coin multiplier set to ${newMult}x.`); }catch{}
        }
        system.runTimeout(() => openEconomyBalanceMenu(player), 1);
      }).catch(()=>{});
    } else if (res.selection === 2) {
      // Karma Multiplier
      const karmaMenu = new ModalFormData().title("Karma Multiplier")
        .slider("Multiplier", 0.1, 10, 0.1, currentKarmaMult);
      karmaMenu.show(player).then(karmaRes => {
        if (!karmaRes || karmaRes.canceled) return;
        const newMult = Math.max(0.1, Math.min(10, Number(karmaRes.formValues?.[0]||currentKarmaMult)|0));
        if (newMult !== currentKarmaMult) {
          FEATURE_FLAGS.karmaMultiplier = newMult;
          saveFeatureFlags();
          try{ player.sendMessage(`Karma multiplier set to ${newMult}x.`); }catch{}
        }
        system.runTimeout(() => openEconomyBalanceMenu(player), 1);
      }).catch(()=>{});
    } else if (res.selection === 3) {
      // Welcome Coins
      const coinsMenu = new ModalFormData().title("Welcome Coins")
        .slider("Amount", 0, 10000, 50, currentWelcomeCoins);
      coinsMenu.show(player).then(coinsRes => {
        if (!coinsRes || coinsRes.canceled) return;
        const newCoins = Math.max(0, Math.min(10000, Number(coinsRes.formValues?.[0]||currentWelcomeCoins)|0));
        if (newCoins !== currentWelcomeCoins) {
          FEATURE_FLAGS.welcomeCoins = newCoins;
          saveFeatureFlags();
          try{ player.sendMessage(`Welcome coins set to ${newCoins}.`); }catch{}
        }
        system.runTimeout(() => openEconomyBalanceMenu(player), 1);
      }).catch(()=>{});
    } else if (res.selection === 4) {
      // Welcome Karma
      const karmaMenu = new ModalFormData().title("Welcome Karma")
        .slider("Amount", 0, 10000, 50, currentWelcomeKarma);
      karmaMenu.show(player).then(karmaRes => {
        if (!karmaRes || karmaRes.canceled) return;
        const newKarma = Math.max(0, Math.min(10000, Number(karmaRes.formValues?.[0]||currentWelcomeKarma)|0));
        if (newKarma !== currentWelcomeKarma) {
          FEATURE_FLAGS.welcomeKarma = newKarma;
          saveFeatureFlags();
          try{ player.sendMessage(`Welcome karma set to ${newKarma}.`); }catch{}
        }
        system.runTimeout(() => openEconomyBalanceMenu(player), 1);
      }).catch(()=>{});
    }
  }).catch(()=>{});
}

function openBotBehaviorMenu(player) {
  const currentPersonality = (FEATURE_FLAGS||{}).personalityMode ?? "balanced";
  const currentWorkSpeed = Math.max(0.5, Math.min(3, Number((FEATURE_FLAGS||{}).workSpeed ?? 1)));
  const currentInteractionRange = Math.max(3, Math.min(15, Number((FEATURE_FLAGS||{}).interactionRange ?? 6)|0));
  const currentQuipFreq = Math.max(0.1, Math.min(5, Number((FEATURE_FLAGS||{}).quipFrequency ?? 1)));
  const currentMusicFreq = Math.max(0.1, Math.min(5, Number((FEATURE_FLAGS||{}).musicFrequency ?? 1)));
  
  const personalityOptions = ["balanced", "quiet", "chatty"];
  const personalityIndex = Math.max(0, personalityOptions.indexOf(currentPersonality));
  
  const menu = new ActionFormData().title("Bot Behavior (OP)")
    .body("Customize bot personalities:")
    .button(`Personality: ${currentPersonality}`)
    .button(`Work Speed: ${currentWorkSpeed}x`)
    .button(`Interaction Range: ${currentInteractionRange} blocks`)
    .button(`Quip Frequency: ${currentQuipFreq}x`)
    .button(`Music Frequency: ${currentMusicFreq}x`)
    .button("◄ Back to Configure Access");
  
  menu.show(player).then(res => {
    if (!res || res.canceled) return;
    if (res.selection === 5) {
      // Back to Configure Access
      system.runTimeout(() => showOpToolsMenu(player), 1);
      return;
    }
    
    if (res.selection === 0) {
      // Personality Mode
      const personalityMenu = new ModalFormData().title("Personality Mode")
        .dropdown("Mode", personalityOptions, personalityIndex);
      personalityMenu.show(player).then(personalityRes => {
        if (!personalityRes || personalityRes.canceled) return;
        const newIndex = Number(personalityRes.formValues?.[0]||personalityIndex)|0;
        const newPersonality = personalityOptions[newIndex] || "balanced";
        if (newPersonality !== currentPersonality) {
          FEATURE_FLAGS.personalityMode = newPersonality;
          saveFeatureFlags();
          try{ player.sendMessage(`Personality mode set to ${newPersonality}.`); }catch{}
        }
        system.runTimeout(() => openBotBehaviorMenu(player), 1);
      }).catch(()=>{});
    } else if (res.selection === 1) {
      // Work Speed
      const speedMenu = new ModalFormData().title("Work Speed Multiplier")
        .slider("Multiplier", 0.5, 3, 0.1, currentWorkSpeed);
      speedMenu.show(player).then(speedRes => {
        if (!speedRes || speedRes.canceled) return;
        const newSpeed = Math.max(0.5, Math.min(3, Number(speedRes.formValues?.[0]||currentWorkSpeed)));
        if (newSpeed !== currentWorkSpeed) {
          FEATURE_FLAGS.workSpeed = newSpeed;
          saveFeatureFlags();
          try{ player.sendMessage(`Work speed multiplier set to ${newSpeed.toFixed(1)}x.`); }catch{}
        }
        system.runTimeout(() => openBotBehaviorMenu(player), 1);
      }).catch(()=>{});
    } else if (res.selection === 2) {
      // Interaction Range
      const rangeMenu = new ModalFormData().title("Interaction Range")
        .slider("Blocks", 3, 15, 1, currentInteractionRange);
      rangeMenu.show(player).then(rangeRes => {
        if (!rangeRes || rangeRes.canceled) return;
        const newRange = Math.max(3, Math.min(15, Number(rangeRes.formValues?.[0]||currentInteractionRange)|0));
        if (newRange !== currentInteractionRange) {
          FEATURE_FLAGS.interactionRange = newRange;
          saveFeatureFlags();
          try{ player.sendMessage(`Interaction range set to ${newRange} blocks.`); }catch{}
        }
        system.runTimeout(() => openBotBehaviorMenu(player), 1);
      }).catch(()=>{});
    } else if (res.selection === 3) {
      // Quip Frequency
      const quipMenu = new ModalFormData().title("Quip Frequency Multiplier")
        .slider("Multiplier", 0.1, 5, 0.1, currentQuipFreq);
      quipMenu.show(player).then(quipRes => {
        if (!quipRes || quipRes.canceled) return;
        const newQuip = Math.max(0.1, Math.min(5, Number(quipRes.formValues?.[0]||currentQuipFreq)));
        if (newQuip !== currentQuipFreq) {
          FEATURE_FLAGS.quipFrequency = newQuip;
          saveFeatureFlags();
          try{ player.sendMessage(`Quip frequency multiplier set to ${newQuip.toFixed(1)}x.`); }catch{}
        }
        system.runTimeout(() => openBotBehaviorMenu(player), 1);
      }).catch(()=>{});
    } else if (res.selection === 4) {
      // Music Frequency
      const musicMenu = new ModalFormData().title("Music Frequency Multiplier")
        .slider("Multiplier", 0.1, 5, 0.1, currentMusicFreq);
      musicMenu.show(player).then(musicRes => {
        if (!musicRes || musicRes.canceled) return;
        const newMusic = Math.max(0.1, Math.min(5, Number(musicRes.formValues?.[0]||currentMusicFreq)));
        if (newMusic !== currentMusicFreq) {
          FEATURE_FLAGS.musicFrequency = newMusic;
          saveFeatureFlags();
          try{ player.sendMessage(`Music frequency multiplier set to ${newMusic.toFixed(1)}x.`); }catch{}
        }
        system.runTimeout(() => openBotBehaviorMenu(player), 1);
      }).catch(()=>{});
    }
  }).catch(()=>{});
}

// Export configuration menu functions
try{
  globalThis.LABS_openUIFeaturesMenu = openUIFeaturesMenu;
  globalThis.LABS_openBotSettingsMenu = openBotSettingsMenu;
  globalThis.LABS_openBotToggleMenu = openBotToggleMenu;
  globalThis.LABS_openEventTimingMenu = openEventTimingMenu;
  globalThis.LABS_openEconomyBalanceMenu = openEconomyBalanceMenu;
  globalThis.LABS_openBotBehaviorMenu = openBotBehaviorMenu;
}catch{}

// Global helpers: get score and spend coins safely
try{
  globalThis.LABS_getScore = function(player, objective){
    try{
      const obj = world.scoreboard?.getObjective?.(objective);
      const id = player?.scoreboardIdentity;
      if (obj && id){ const v=obj.getScore(id); if (typeof v==='number' && Number.isFinite(v)) return v; }
    }catch{}
    return 0;
  };
  globalThis.LABS_spendCoins = async function(player, amount){
    try{
      const need = Math.max(0, Math.floor(Number(amount)||0)); if (!need) return true;
      const cur = (globalThis.LABS_getScore ? globalThis.LABS_getScore(player, 'lenycoins') : 0) | 0;
      if (cur < need) return false;
      await player.runCommandAsync(`scoreboard players remove @s lenycoins ${need}`);
      return true;
    }catch{ return false; }
  };
  
  // Economy multiplier helpers
  globalThis.LABS_applyCoinMultiplier = function(amount){
    try{
      const multiplier = Math.max(0.1, Math.min(10, Number((FEATURE_FLAGS||{}).coinMultiplier ?? 1)|0));
      return Math.floor(amount * multiplier);
    }catch{ return amount; }
  };
  
  globalThis.LABS_applyKarmaMultiplier = function(amount){
    try{
      const multiplier = Math.max(0.1, Math.min(10, Number((FEATURE_FLAGS||{}).karmaMultiplier ?? 1)|0));
      return Math.floor(amount * multiplier);
    }catch{ return amount; }
  };
  
  // Bot behavior helpers
  globalThis.LABS_getWorkSpeedMultiplier = function(){
    try{
      return Math.max(0.5, Math.min(3, Number((FEATURE_FLAGS||{}).workSpeed ?? 1)));
    }catch{ return 1; }
  };
  
  globalThis.LABS_getInteractionRange = function(){
    try{
      return Math.max(3, Math.min(15, Number((FEATURE_FLAGS||{}).interactionRange ?? 6)|0));
    }catch{ return 6; }
  };
  
  globalThis.LABS_getQuipFrequencyMultiplier = function(){
    try{
      return Math.max(0.1, Math.min(5, Number((FEATURE_FLAGS||{}).quipFrequency ?? 1)));
    }catch{ return 1; }
  };
  
  globalThis.LABS_getMusicFrequencyMultiplier = function(){
    try{
      return Math.max(0.1, Math.min(5, Number((FEATURE_FLAGS||{}).musicFrequency ?? 1)));
    }catch{ return 1; }
  };
  
  globalThis.LABS_getPersonalityMode = function(){
    try{
      return (FEATURE_FLAGS||{}).personalityMode || "balanced";
    }catch{ return "balanced"; }
  };
} catch {}

// Safety clamp: prevent negative coin balances
try{
system.runInterval(()=>{
try{
for (const p of world.getPlayers()){
try{
const cur = (globalThis.LABS_getScore ? globalThis.LABS_getScore(p, 'lenycoins') : 0) | 0;
if (cur < 0){ try{ world.getDimension('overworld').runCommandAsync(`scoreboard players set \"${p.name}\" lenycoins 0`); }catch{} }
}catch{}
}
}catch{}
}, 200);
} catch {}

// Force-disable Constructor Bot at runtime
try{ world.afterEvents.worldInitialize.subscribe(()=>{ try{ setBotEnabled('myname:constructor_bot', false); }catch{} }); }catch{}

 // --- Feature access flags (OP-configurable) ---
// Feature flags already defined at top of file
// Register DP and load early
try{
  world.afterEvents.worldInitialize.subscribe(ev=>{
    try{ const DP = globalThis.DynamicPropertiesDefinition; if (typeof DP==='function'){ const def=new DP(); def.defineString(FEATURE_FLAGS_KEY, 4000); ev.propertyRegistry?.registerWorldDynamicProperties?.(def); } }catch{}
    system.run(()=>{ loadFeatureFlags(); });
  });
}catch{}

// --- Players registry and Bot Ops ---
const PLAYERS_ALL_KEY = "labs_players_all";
const BOT_OPS_KEY = "labs_bot_ops";
let PLAYERS_ALL = [];
let BOT_OPS = [];
function loadPlayersAll(){ try{ const raw=world.getDynamicProperty?.(PLAYERS_ALL_KEY); PLAYERS_ALL = raw && typeof raw==='string' ? JSON.parse(raw) : []; }catch{ PLAYERS_ALL=[]; } }
function savePlayersAll(){ try{ const s=JSON.stringify(PLAYERS_ALL||[]); world.setDynamicProperty?.(PLAYERS_ALL_KEY, s.length>7800 ? s.slice(0,7800) : s); }catch{} }
function loadBotOps(){ try{ const raw=world.getDynamicProperty?.(BOT_OPS_KEY); BOT_OPS = raw && typeof raw==='string' ? JSON.parse(raw) : []; }catch{ BOT_OPS=[]; } }
function saveBotOps(){ try{ const s=JSON.stringify(BOT_OPS||[]); world.setDynamicProperty?.(BOT_OPS_KEY, s.length>7800 ? s.slice(0,7800) : s); }catch{} }
function isBotOpName(name){ try{ return Array.isArray(BOT_OPS) && BOT_OPS.includes(String(name)); }catch{ return false; } }
try{
  world.afterEvents.worldInitialize.subscribe(ev=>{
    try{ const DP = globalThis.DynamicPropertiesDefinition; if (typeof DP==='function'){ const def=new DP(); def.defineString(PLAYERS_ALL_KEY, 8000); def.defineString(BOT_OPS_KEY, 8000); ev.propertyRegistry?.registerWorldDynamicProperties?.(def); } }catch{}
    system.run(()=>{ loadPlayersAll(); loadBotOps(); });
  });
}catch{}
try{
  world.afterEvents.playerSpawn.subscribe(ev=>{
    try{
      const p=ev.player; if(!p) return;
      // record player
      try{ const nm=String(p.name||""); if(nm){ loadPlayersAll(); if(!PLAYERS_ALL.includes(nm)){ PLAYERS_ALL.push(nm); PLAYERS_ALL = Array.from(new Set(PLAYERS_ALL)).slice(0,2000); savePlayersAll(); } } }catch{}
      // enforce bot ops tag
      try{ loadBotOps(); const want=isBotOpName(p.name); const has=p.hasTag&&p.hasTag("labs_admin"); if (want && !has){ p.addTag?.("labs_admin"); } else if (!want && has){ p.removeTag?.("labs_admin"); } }catch{}
    }catch{}
  });
}catch{}
 
 // --- Random daily event: Chicken Storm ---
const CHICKEN_EVENT_KEY = "labs_chicken_daily"; // playerName -> yyyymmdd
let CHICKEN_DAILY = {};
function loadChickenDaily(){ try{ const raw=world.getDynamicProperty?.(CHICKEN_EVENT_KEY); CHICKEN_DAILY = raw && typeof raw==='string' ? JSON.parse(raw) : {}; }catch{ CHICKEN_DAILY={}; } }
function saveChickenDaily(){ try{ const s=JSON.stringify(CHICKEN_DAILY||{}); world.setDynamicProperty?.(CHICKEN_EVENT_KEY, s.length>7900?s.slice(0,7900):s); }catch{} }

function randInt(a,b){ return a + Math.floor(Math.random()*(b-a+1)); }
function isUnderOpenSky(player){ try{ const dim=player.dimension; const x=Math.floor(player.location.x), z=Math.floor(player.location.z); const y0=Math.floor(player.location.y)+1; for(let dy=0; dy<20; dy++){ const b=dim.getBlock({x,y:y0+dy,z}); if (b && String(b.typeId||"")!=="minecraft:air") return false; } return true; }catch{ return false; } }
async function isDaytime(dim){ try{ const r = await dim.runCommandAsync("time query daytime"); const msg = String(r?.statusMessage||""); const m = msg.match(/\d+/); const t = m?Number(m[0]):0; return t>=0 && t<13000; }catch{ return true; } }

function speak(player, text){ try{ player.sendMessage(text); }catch{} }
function strike(dim, x,y,z, delayTicks=0){ system.runTimeout(()=>{ try{ dim.runCommandAsync(`summon lightning_bolt ${x} ${y} ${z}`).catch(()=>{}); }catch{} }, delayTicks); }

async function triggerChickenStorm(player){
 try{
   const dim = player.dimension; if (!dim || dim.id!=="minecraft:overworld") return;
   const x=Math.floor(player.location.x), y=Math.floor(player.location.y), z=Math.floor(player.location.z);
   // five warm-up strikes nearby
   for (let i=0;i<5;i++){
     const ox = x + randInt(-6,6);
     const oz = z + randInt(-6,6);
     strike(dim, ox, y, oz, i*10);
   }
   system.runTimeout(()=>speak(player, "The great clucker has chosen you, pay."), 60);
   system.runTimeout(()=>strike(dim, x+randInt(-3,3), y, z+randInt(-3,3)), 80);
   system.runTimeout(()=>speak(player, "DO YOU PAY THE PRICE YOU EGGLESS MINION?"), 85);
   // Prompt tithe (explicit Yes/No)
   system.runTimeout(()=>{
     try{
       const af = new ActionFormData().title("The Great Clucker").body("Tithe the Great Clucker one item?").button("Yes").button("No");
       af.show(player).then(res=>{
         if (!res || res.canceled){ cluckerPunish(player); return; }
         const sel = Number(res.selection||0);
         if (sel===0) cluckerTithe(player); else cluckerPunish(player);
       }).catch(()=>{});
     }catch{}
   }, 95);
 }catch{}
}

function describeItem(it){ try{ const id=String(it?.typeId||"item").split(":")[1]||String(it?.typeId||"item"); return `${id.replace(/_/g," ")}${it?.amount?" x"+it.amount:""}`; }catch{ return "something"; } }

function cluckerTithe(player){ try{ const inv=player.getComponent("inventory")?.container; if(!inv){ speak(player, "The Great Clucker could not take your gift."); return; } const slots=inv.size||36; const picks=[]; for(let i=0;i<slots;i++){ try{ const it=inv.getItem(i); if(it) picks.push({i,it}); }catch{} } if(!picks.length){ speak(player, "You have nothing to give. The Great Clucker spares you… for now."); return; } const sel=picks[randInt(0,picks.length-1)]; inv.setItem(sel.i, undefined); speak(player, `Your gift has been accepted: ${describeItem(sel.it)}. Go in peace, featherless fool!`); }catch{} }

function cluckerPunish(player){ try{ const dim=player.dimension; const x=Math.floor(player.location.x), y=Math.floor(player.location.y), z=Math.floor(player.location.z);
  // Darkness + fog
  try{ player.runCommandAsync(`effect @s darkness 30 1 true`).catch(()=>{}); }catch{}
  for (let t=25; t<=175; t+=25){ system.runTimeout(()=>{ try{ player.runCommandAsync(`effect @s darkness 30 1 true`).catch(()=>{}); }catch{} }, t*20); }
  try{ player.runCommandAsync(`fog @s push labs:thick_fog`).catch(()=>{}); }catch{}
  try{ player.runCommandAsync(`fog @s push labs:abyss_fog`).catch(()=>{}); }catch{}
  speak(player, "Foolish mortal!");
  for (let i=0;i<6;i++){
    const ox = x + (Math.random()<0.5?-1:1)*randInt(2,5);
    const oz = z + (Math.random()<0.5?-1:1)*randInt(2,5);
    strike(dim, ox, y, oz, i*6);
    system.runTimeout(()=>{ try{ if (Math.random()<0.25) player.runCommandAsync(`give @s cooked_chicken 1`).catch(()=>{}); }catch{} }, i*6 + 2);
  }
  // Play the Chicken Storm theme (with player fallback)
  try{ dim.runCommandAsync(`playsound labs.chicken_storm @a ${x} ${y} ${z} 1 1 0`).catch(()=>{}); }catch{}
  try{ system.runTimeout(()=>{ try{ player.runCommandAsync?.(`playsound labs.chicken_storm @s ${x} ${y} ${z} 1 1 0`); }catch{} }, 2); }catch{}
  // Warn
  speak(player, "Seek shelter from the Great Clucker in the sky!");
  // Feather/egg barrage ambiance for ~3 minutes
  for (let t=0; t<180; t+=4){ // every ~0.2s particle puffs
    system.runTimeout(()=>{
      try{
        const ox=x+randInt(-6,6), oy=y+randInt(1,3), oz=z+randInt(-6,6);
        dim.runCommandAsync(`particle minecraft:cloud ${ox} ${oy} ${oz}`).catch(()=>{});
        if (Math.random()<0.05){ // occasional eggs
          const ex=x+randInt(-6,6), ez=z+randInt(-6,6), ey=y+randInt(8,16);
          dim.runCommandAsync(`summon egg ${ex} ${ey} ${ez}`).catch(()=>{});
        }
      }catch{}
    }, t*20);
  }
  // First 1.5 minutes: ~60 chickens fall
  for(let i=0;i<60;i++){
    const delay = randInt(0, 90)*20;
    system.runTimeout(()=>{ try{ const ox=x+randInt(-8,8), oy=y+randInt(10,35), oz=z+randInt(-8,8); dim.runCommandAsync(`summon chicken ${ox} ${oy} ${oz}`).catch(()=>{}); }catch{} }, delay);
  }
  // Last 1.5 minutes: 40 chickens + 12 riders
  for(let i=0;i<40;i++){
    const delay = (90 + randInt(0, 90))*20;
    system.runTimeout(()=>{ try{ const ox=x+randInt(-8,8), oy=y+randInt(10,35), oz=z+randInt(-8,8); dim.runCommandAsync(`summon chicken ${ox} ${oy} ${oz}`).catch(()=>{}); }catch{} }, delay);
  }
  for(let i=0;i<12;i++){
    const delay=(90 + randInt(0,90))*20;
    system.runTimeout(()=>{
      try{
        const px = x + (Math.random()<0.5?-1:1)*5;
        const pz = z + (Math.random()<0.5?-1:1)*5;
        const py = y + 1;
        const rider = Math.random()<0.5 ? "skeleton" : "husk";
        dim.runCommandAsync(`summon chicken ${px} ${py} ${pz}`).catch(()=>{});
        dim.runCommandAsync(`summon ${rider} ${px} ${py} ${pz}`).catch(()=>{});
        system.runTimeout(()=>{ try{ dim.runCommandAsync(`execute as @e[type=${rider},x=${px},y=${py},z=${pz},r=2,c=1] run ride @s start_riding @e[type=chicken,x=${px},y=${py},z=${pz},r=2,c=1] teleport_rider`).catch(()=>{}); }catch{} }, 2);
      }catch{}
    }, delay);
  }
  // End cleanup at ~3 minutes
  system.runTimeout(()=>{ try{ player.runCommandAsync(`fog @s pop`).catch(()=>{}); player.runCommandAsync(`fog @s pop`).catch(()=>{}); speak(player, "The storm has passed. The distant clucking subsides."); }catch{} }, 180*20);
 }catch{} }

// periodic trigger (once per day, 1 in 5000 per minute)
try{
  world.afterEvents.worldInitialize.subscribe(ev=>{
    try{ const DP = globalThis.DynamicPropertiesDefinition; if (typeof DP==='function'){ const def=new DP(); def.defineString(CHICKEN_EVENT_KEY, 8000); ev.propertyRegistry?.registerWorldDynamicProperties?.(def); } }catch{}
    system.run(()=>{ loadChickenDaily(); });
  });
}catch{}

try{
  system.runInterval(async ()=>{
    try{
      const today=yyyymmdd();
      for (const p of world.getPlayers()){
        if (String(CHICKEN_DAILY?.[p.name]||"")===today) continue;
        if (p.dimension?.id!=="minecraft:overworld") continue;
        if (!isUnderOpenSky(p)) continue;
        // no time restriction; can occur day or night
        // Check if auto events are enabled
        if (!isFeatureEnabled('autoEvents')) continue;
        
        // Get frequency setting
        const freq = (FEATURE_FLAGS||{}).chickenEventFreq || "default";
        let chance = 0.0002; // default: 1/5000 per minute
        if (freq === "rare") chance = 0.0001; // 1/10000 per minute
        else if (freq === "frequent") chance = 0.0005; // 1/2000 per minute
        
        if (Math.random() < chance){
          CHICKEN_DAILY[p.name]=today; saveChickenDaily();
          triggerChickenStorm(p);
        }
      }
    }catch{}
  }, 1200);
}catch{}

// Export event functions
try{
  globalThis.LABS_triggerEndIsWaiting = triggerEndIsWaiting;
  globalThis.LABS_triggerChickenStorm = triggerChickenStorm;
}catch{}

// --- Random daily event: The End is Waiting ---
const END_EVENT_KEY = "labs_end_daily"; // playerName -> yyyymmdd
let END_DAILY = {};
function loadEndDaily(){ try{ const raw=world.getDynamicProperty?.(END_EVENT_KEY); END_DAILY = raw && typeof raw==='string' ? JSON.parse(raw) : {}; }catch{ END_DAILY={}; } }
function saveEndDaily(){ try{ const s=JSON.stringify(END_DAILY||{}); world.setDynamicProperty?.(END_EVENT_KEY, s.length>7900?s.slice(0,7900):s); }catch{} }
// Register on world init
try{
  world.afterEvents.worldInitialize.subscribe(ev=>{
    try{ const DP = globalThis.DynamicPropertiesDefinition; if (typeof DP==='function'){ const def=new DP(); def.defineString(END_EVENT_KEY, 8000); ev.propertyRegistry?.registerWorldDynamicProperties?.(def); } }catch{}
    system.run(()=>{ loadEndDaily(); });
  });
}catch{}

function yyyymmdd(){ const d=new Date(); const y=d.getUTCFullYear(); const m=String(d.getUTCMonth()+1).padStart(2,'0'); const day=String(d.getUTCDate()).padStart(2,'0'); return `${y}${m}${day}`; }

// --- Rare Nether event: Piglin Congo ---
 const PIGLIN_EVENT_KEY = "labs_piglin_congo_daily"; // playerName -> yyyymmdd
 let PIGLIN_DAILY = {};
 function loadPiglinDaily(){ try{ const raw=world.getDynamicProperty?.(PIGLIN_EVENT_KEY); PIGLIN_DAILY = raw && typeof raw==='string' ? JSON.parse(raw) : {}; }catch{ PIGLIN_DAILY={}; } }
 function savePiglinDaily(){ try{ const s=JSON.stringify(PIGLIN_DAILY||{}); world.setDynamicProperty?.(PIGLIN_EVENT_KEY, s.length>7900?s.slice(0,7900):s); }catch{} }
 try{
   world.afterEvents.worldInitialize.subscribe(ev=>{
     try{ const DP = globalThis.DynamicPropertiesDefinition; if (typeof DP==='function'){ const def=new DP(); def.defineString(PIGLIN_EVENT_KEY, 8000); ev.propertyRegistry?.registerWorldDynamicProperties?.(def); } }catch{}
     system.run(()=>{ loadPiglinDaily(); });
   });
 }catch{}
 
 function startPiglinCongo(player){
   try{
     if (player.dimension?.id !== "minecraft:nether") return;
     const dim = player.dimension;
     const loc = player.location || {x:0,y:0,z:0};
     // Compute a center about 12 blocks ahead of player facing
     let fx=0, fz=1; try{ const r=player.getRotation?.()||{}; const yaw = typeof r.y==='number'?r.y:0; const rad=(yaw*Math.PI)/180; const dx=-Math.sin(rad), dz=Math.cos(rad); if (Math.abs(dx)>Math.abs(dz)){ fx=Math.sign(dx); fz=0; } else { fx=0; fz=Math.sign(dz); } }catch{}
     const center = { x: Math.floor(loc.x) + fx*12, y: Math.floor(loc.y), z: Math.floor(loc.z) + fz*12 };
     // Ground snap around center (down then up)
     try{ let found=false; for(let dy=0; dy<=8; dy++){ const b=dim.getBlock({x:center.x,y:center.y-dy,z:center.z}); if (b && String(b.typeId||"")!=="minecraft:air"){ center.y=(center.y-dy)+1; found=true; break; } } if(!found){ for(let dy=1; dy<=8; dy++){ const b=dim.getBlock({x:center.x,y:center.y+dy,z:center.z}); if (b && String(b.typeId||"")==="minecraft:air"){ center.y=center.y+dy; break; } } } }catch{}
     const R = 6; // circle radius
     const N = 6; // piglins count (min 6)
     const SPACING = 0.35; // radians between piglins along path
     const STEP = 0.08; // radians per tick
     const STEP_TICKS = 4; // move every 4 ticks (~0.2s)
     const DURATION_TICKS = 3*60*20; // 3 minutes
     const TOTAL_STEPS = Math.floor(DURATION_TICKS/STEP_TICKS);
     const congoId = `labs_congo_${Date.now()}_${(player.name||'p').replace(/[^A-Za-z0-9_\-]/g,'_')}`;
     // Spawn piglins with tag to track
     const pigs = [];
     for (let i=0;i<N;i++){
       try{ const angle = -i*SPACING; const x=center.x + Math.cos(angle)*R; const z=center.z + Math.sin(angle)*R; const e = dim.spawnEntity?.("minecraft:piglin", {x, y:center.y, z}); if (e){ try{ e.addTag?.(congoId); }catch{} pigs.push(e); } }catch{}
     }
     try{ world.sendMessage?.("The Piglin Congo begins!" ); }catch{}
     try{ const x=Math.floor(loc.x), y=Math.floor(loc.y), z=Math.floor(loc.z); dim.runCommandAsync(`playsound labs.piglin_congo @a ${x} ${y} ${z} 1 1 0`).catch(()=>{}); }catch{}
     let k=0;
     const tick = ()=>{
       try{
         if (k>=TOTAL_STEPS){
           // cleanup
           for(const e of pigs){ try{ e.kill?.(); }catch{} }
           return;
         }
         const base = k*STEP;
         for (let i=0;i<pigs.length;i++){
           const e = pigs[i]; if (!e || e.isValid===false) continue;
           const a = base - i*SPACING;
           let px = center.x + Math.cos(a)*R;
           let pz = center.z + Math.sin(a)*R;
           let py = center.y;
           // tiny jump every other step
           if ((k%2)===0) py += 0.3;
           try{ e.teleport({x:px, y:py, z:pz}, { dimension: dim, checkForBlocks: true }); }catch{}
           try{ dim.runCommandAsync(`particle minecraft:happy_villager ${px.toFixed(2)} ${(py+1).toFixed(2)} ${pz.toFixed(2)}`).catch(()=>{}); }catch{}
         }
         k++;
         system.runTimeout(tick, STEP_TICKS);
       }catch{}
     };
     system.runTimeout(tick, STEP_TICKS);
   }catch{}
 }
 
 // Periodic checker: rare per-player chance in the Nether, max once/day
 try{
   system.runInterval(()=>{
     try{
       const today=yyyymmdd();
       for (const p of world.getPlayers()){
         try{ if (p.dimension?.id!=="minecraft:nether") continue; }catch{ continue; }
         const last = String(PIGLIN_DAILY?.[p.name]||"");
         if (last===today) continue; // already had event today
         // ~1 in 500 chance per 30 minutes => about 0.000067 per minute. We check every 60s.
         if (Math.random() < 0.000067){
           PIGLIN_DAILY[p.name] = today; savePiglinDaily();
           startPiglinCongo(p);
         }
       }
     }catch{}
   }, 1200); // every ~60 seconds
 }catch{}
 
 function triggerEndIsWaiting(player){
  try{
    const dim = player.dimension; const x=Math.floor(player.location.x), y=Math.floor(player.location.y), z=Math.floor(player.location.z);
    const DURATION_TICKS = 120*20; // 2 minutes
    // Play the ominous song (resource pack id: labs.end_is_waiting)
    try{ player.runCommandAsync(`playsound labs.end_is_waiting @s ${x} ${y} ${z} 1 1 0`).catch(()=>{}); }catch{}
    // Darkness: keep it active for full duration (reapply before lapse)
    try{ player.runCommandAsync(`effect @s darkness 45 1 true`).catch(()=>{}); }catch{}
    system.runTimeout(()=>{ try{ player.runCommandAsync(`effect @s darkness 45 1 true`).catch(()=>{}); }catch{} }, 40*20);
    system.runTimeout(()=>{ try{ player.runCommandAsync(`effect @s darkness 45 1 true`).catch(()=>{}); }catch{} }, 80*20);
    // Slow the player briefly and add a touch of weakness
    try{ player.runCommandAsync(`effect @s slowness 10 0 true`).catch(()=>{}); }catch{}
    try{ player.runCommandAsync(`effect @s weakness 15 0 true`).catch(()=>{}); }catch{}
    // Push heavy fog profiles if they exist (ignored if missing)
    try{ player.runCommandAsync(`fog @s push labs:thick_fog`).catch(()=>{}); }catch{}
    try{ player.runCommandAsync(`fog @s push labs:abyss_fog`).catch(()=>{}); }catch{}
    // Particles: portal and soul smoke pulses around the player over time
    try{
      for(let i=0;i<=24;i++){
        system.runTimeout(()=>{
          try{
            for(let j=0;j<8;j++){
              const ox=x+(Math.random()*6-3), oy=y+0.2+Math.random()*2.2, oz=z+(Math.random()*6-3);
              dim.runCommandAsync(`particle minecraft:portal_reverse ${ox.toFixed(2)} ${oy.toFixed(2)} ${oz.toFixed(2)}`).catch(()=>{});
              if (Math.random()<0.5){ dim.runCommandAsync(`particle minecraft:campfire_smoke_particle ${ox.toFixed(2)} ${(oy-0.2).toFixed(2)} ${oz.toFixed(2)}`).catch(()=>{}); }
            }
          }catch{}
        }, i*100);
      }
    }catch{}
    // Ambient creepy sounds at intervals
    const soundPulse = (delayTicks, id, vol=0.6, pitch=1)=>{ system.runTimeout(()=>{ try{ player.runCommandAsync(`playsound ${id} @s ${x} ${y} ${z} ${vol} ${pitch} 0`).catch(()=>{}); }catch{} }, delayTicks); };
    soundPulse(200, "ambient.cave", 0.6, 1.0);
    soundPulse(800, "mob.warden.heartbeat", 0.5, 1.0);
    soundPulse(1400, "ambient.cave", 0.6, 1.0);
    soundPulse(1800, "mob.enderdragon.growl", 0.4, 1.0);
    // Pop fog(s) at the end
    system.runTimeout(()=>{ try{ player.runCommandAsync(`fog @s pop`).catch(()=>{}); }catch{} }, DURATION_TICKS+10);
    system.runTimeout(()=>{ try{ player.runCommandAsync(`fog @s pop`).catch(()=>{}); }catch{} }, DURATION_TICKS+12);
    // Whisper hints
    try{
      player.sendMessage("A voice from the End drifts through the void…");
      system.runTimeout(()=>player.sendMessage("The End is waiting."), 5);
      system.runTimeout(()=>player.sendMessage("Bring a shovel. I am buried deep."), 15);
      system.runTimeout(()=>player.sendMessage("Gold buys silence; do not pay the debtors of ash."), 35);
    }catch{}
  }catch{}
}

// Periodic checker: once per day per player, random chance
try{
  system.runInterval(()=>{
    try{
      const today=yyyymmdd();
      for (const p of world.getPlayers()){
        const last = String(END_DAILY?.[p.name]||"");
        if (last===today) continue; // already had event today
        // Check if auto events are enabled
        if (!isFeatureEnabled('autoEvents')) continue;
        
        // Get frequency setting
        const freq = (FEATURE_FLAGS||{}).endEventFreq || "default";
        let chance = 0.01; // default: 1% per hour
        if (freq === "rare") chance = 0.005; // 0.5% per hour
        else if (freq === "frequent") chance = 0.02; // 2% per hour
        
        // Roll a small chance every 60s tick cycle -> roughly 5% per hour when online
        if (Math.random() < chance){
          END_DAILY[p.name] = today; saveEndDaily();
          triggerEndIsWaiting(p);
        }
      }
    }catch{}
  }, 1200); // every ~60 seconds
}catch{}

// Feedback inbox (in-memory fallback to ensure script load never fails)
let FEEDBACK_BUF = [];
function loadFeedback() { return FEEDBACK_BUF; }
function saveFeedback(arr) { FEEDBACK_BUF = Array.isArray(arr) ? arr : []; }

// Banned bots config parsing
const BAN_NAMES = ["miner","constructor","fisher","shroom","farmer","beekeeper","treasure","storekeeper","chef","butler","smelter","portal","control","redstone","trash"];
const NAME_TO_ID = Object.fromEntries(BAN_NAMES.map(n=>[n, `myname:${n}_bot`]));
function parseBannedSet(txt){
  try{
    const s=String(txt||"");
    const lines=s.split(/\r?\n/).map(l=>l.split("#")[0]).join(",");
    const parts=lines.split(",").map(p=>p.trim()).filter(Boolean);
    const set=new Set();
    for(const p of parts){
      const key=p.toLowerCase().replace(/\s+/g,"");
      if (NAME_TO_ID[key]) set.add(NAME_TO_ID[key]);
      else if (key.startsWith("myname:") && key.endsWith("_bot")) set.add(key);
    }
    return set;
  }catch{ return new Set(); }
}
let BANNED = parseBannedSet(bannedCfg);
// Runtime ban storage (world DP)
const RUNTIME_BAN_KEY = "labs_banned_runtime"; // JSON array of entity ids (myname:*_bot)
function loadRuntimeBans(){
  try{ const raw=world.getDynamicProperty?.(RUNTIME_BAN_KEY); if (raw && typeof raw==='string'){ const arr=JSON.parse(raw); if (Array.isArray(arr)) return new Set(arr); } }catch{}
  return new Set();
}
function saveRuntimeBans(set){ try{ const arr=Array.from(set||[]); world.setDynamicProperty?.(RUNTIME_BAN_KEY, JSON.stringify(arr)); }catch{} }
function recomputeBanned(){ try{ const runtime=loadRuntimeBans(); const base=parseBannedSet(bannedCfg); const merged=new Set([...base, ...runtime]); BANNED = merged; }catch{} }
try{ world.afterEvents.worldInitialize.subscribe(ev=>{ try{ const DP=globalThis.DynamicPropertiesDefinition; if (typeof DP==='function'){ const def=new DP(); def.defineString(RUNTIME_BAN_KEY, 8000); ev.propertyRegistry?.registerWorldDynamicProperties?.(def); } }catch{} system.run(()=>{ recomputeBanned(); }); }); }catch{}

// Auto-remove banned bot eggs from inventories and refund coins so players learn before use
const EGG_REFUND_DEFAULT = 200; // per egg
try{
  system.runInterval(()=>{
    try{
      for (const p of world.getPlayers()){
        const inv = p.getComponent("inventory")?.container; if (!inv) continue;
        for (let s=0; s<inv.size; s++){
          try{
            const it = inv.getItem(s); if (!it) continue;
            const id = String(it.typeId||"").replace(/^item\./,"");
            if (!/_spawn_egg$/.test(id)) continue;
            const ent = id.replace(/_spawn_egg$/,'');
            if (BANNED && BANNED.has(ent)){
              // remove and refund
              inv.setItem(s, undefined);
              const amt = Math.max(1, Number(it.amount||1));
              const refund = (EGG_REFUND_DEFAULT) * amt;
              try{ world.getDimension("overworld").runCommandAsync(`scoreboard players add \"${p.name}\" lenycoins ${refund}`); }catch{}
              try{ p.sendMessage(`That bot is disabled on this server. Refunded ${refund} LenyCoins.`); }catch{}
            }
          }catch{}
        }
      }
    }catch{}
  }, 200); // ~10 seconds
}catch{}
function setBotEnabled(entityId /* myname:xxx_bot */, enabled){ try{ const cur=loadRuntimeBans(); if (!enabled) cur.add(entityId); else cur.delete(entityId); saveRuntimeBans(cur); recomputeBanned(); }catch{} }

// Single source of truth for OP egg list
const ALL_BOT_EGGS = [
  "myname:miner_bot_spawn_egg",
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
  "myname:party_bot_spawn_egg",
  "myname:trash_bot_spawn_egg"
];

function eggLabelFromId(id){
  try{
    const core = String(id).split(":")[1] || id;
    const base = core.replace(/_spawn_egg$/i, "");
    const words = base.split("_").map(w=> w.charAt(0).toUpperCase()+w.slice(1));
    // Ensure "Bot" suffix present and prettified
    if (!/Bot$/i.test(words.join(" "))){ words.push("Bot"); }
    return words.join(" ");
  }catch{ return String(id); }
}

// Shroom item effects and utilities
function msToTicks(ms){ return Math.max(1, Math.floor((ms/1000) * 20)); }
async function grantTempFlight(player, durationMs){
  let enabled = false;
  try { await player.runCommandAsync(`ability @s mayfly true`); enabled = true; } catch {}
  if (!enabled){
    try { await player.runCommandAsync(`effect @s levitation 120 1 true`); } catch {}
    try { await player.runCommandAsync(`effect @s slow_falling 120 1 true`); } catch {}
    try { player.sendMessage("Flight not available here; applied Levitation + Slow Falling instead."); } catch {}
    return;
  }
  try { player.sendMessage("Flight enabled for a short time."); } catch {}
  system.runTimeout(async ()=>{
    try { await player.runCommandAsync(`ability @s mayfly false`); } catch {}
    try { player.sendMessage("Flight disabled."); } catch {}
  }, msToTicks(durationMs||60000));
}
function giveLabsManual(player){
  try {
    const disabled = (()=>{ try{ return Array.from(BANNED||[]).map(id=>{
      try{ const core=String(id).split(':')[1]||id; return core.replace(/_bot$/i,'').split('_').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ') + ' Bot'; }catch{ return id; }
    }); }catch{ return []; } })();
    const disabledPage = disabled.length ? `\\n\\nDisabled here:\\n- ${disabled.join('\\n- ')}` : '';
    const pages = [
      '{"text":"§6§lLeny\'s Amped Bots§r\\n\\n§7Open the LABS menu with your §eStick§7.\\n§7Use §bLABS Manual§7 to open this guide."}',
      `{"text":"§dBots§r:\\n§6• §e🛠 Constructor§7\\n§6• §a⛏ Miner§7\\n§6• §b🎣 Fisher§7\\n§6• §5🍄 Shroom§7\\n§6• §2🌾 Farmer§7\\n§6• §6🐝 BeeKeeper§7\\n§6• §6🗝 Treasure§7\\n§6• §3🤵 Butler§7\\n§6• §c🔥 Smelter§7\\n§6• §d🍳 Chef§7\\n§6• §9🎛 Control§7\\n§6• §4🧱 Redstone§7\\n§6• §5🌀 Portal§7\\n§6• §8🗑 Trash§7${disabledPage.replace(/\"/g,'\\\\\"')}` + '"}',
      '{"text":"§9Admin & Tools§r\\n\\n§6• §eDonate§7 coins to others (§a+5 Karma§7).\\n§6• §eReturn Egg§7 helps undo mistakes.\\n§6• §eOP Tools§7 for admins only."}',
      '{"text":"§eEconomy & Karma§r\\n\\n§6LenyCoins§r: earn/spend in the World Store and events.\\n§6• §7Donate from LABS menu (§a+5 Karma§7)\\n§6• §7Spend on server items & player listings\\n§aKarma§r: good deeds = rewards.\\n§6• §7Feed animals or villagers (§a+20§7)\\n§6• §7Baby spawns within 15 blocks (§a+100§7)\\n§6• §7Defeat hostiles (skeletons, zombies, witches, wizards, etc.) (§a+25§7)\\n§6• §7Convert Karma->Coins via §eKarma Tools§7"}',
      '{"text":"§bWorld Store§r (Global Shop)\\n\\n§6Open§7: Stick → §eOpen Shop Menu§7 → §bWorld Store§7\\n§6List§7: Put item in §eSlot 1§7, set price, deposit\\n§6Manage§7: deposit, change price, cancel/replace\\n§6Buy§7: Browse player listings & server items (Lava Chicken; Miner/Fisher/Farmer/Beekeeper/Shroom/Butler/Treasure/Chef/Control eggs)\\n§6Pay§7: LenyCoins; items delivered; sellers paid\\n§6Admin§7: OP Tools → §eWorld Store Pricing§7"}'
    ];
    const cmd = `give "${player.name}" written_book{pages:[${pages.join(',')}],title:"LABs for Dummies",author:"LABS",display:{Lore:[\"Here is your bot bible\"]}}`;
    player.runCommandAsync(cmd);
  } catch {}
}
try{
  world.beforeEvents.itemUse.subscribe(ev=>{
    const p = ev.source; const id = String(ev.itemStack?.typeId||""); if (!p || !id) return;
    if (id === "myname:fly_high_shroom" || id === "item.myname:fly_high_shroom"){
      // New flight: hold jump to propel in look direction (Superman style)
      try{
        const now = Date.now();
        const flightMs = 60*1000; // 60s flight
        const ffMs = flightMs + 45*1000; // feather fall lasts 45s longer
        FLY_HOLD.set(p.id, { until: now + flightMs, ffUntil: now + ffMs, dim: p.dimension?.id });
        p.runCommandAsync(`effect @s slow_falling 2 0 true`).catch(()=>{});
        p.sendMessage?.("Fly High: Hold Jump to fly toward your crosshair for 60s. Feather Falling persists for 105s.");
      }catch{}
    } else if (id === "myname:zoom_shroom" || id === "item.myname:zoom_shroom"){
      try { p.runCommandAsync(`effect @s speed 60 3 true`); } catch {}
      try { p.runCommandAsync(`effect @s jump_boost 60 2 true`); } catch {}
      try { p.runCommandAsync(`effect @s haste 60 2 true`); } catch {}
      try { p.sendMessage("Zoom Shroom: Speed, Jump Boost, and Haste for 60s."); } catch {}
    }
  });
} catch {}

// Doom Blade extra damage handler (disabled; using external Doom Sword pack as-is)
try{ /* disabled */ } catch {}

// Global LABS menu (stick-driven)
try{
  // Periodic HUD updater for players who enabled Karma HUD
  try{
    system.runInterval(()=>{
      try{
        for (const p of world.getPlayers()){
          try{
            if (!p.hasTag || !p.hasTag('labs_karma_hud')) continue;
            const obj = world.scoreboard?.getObjective?.('karma');
            const id = p?.scoreboardIdentity; let cur=0; try{ if (obj && id){ const v=obj.getScore(id); if(typeof v==='number'&&Number.isFinite(v)) cur=v; } }catch{}
            try{ p.onScreenDisplay?.setActionBar?.(`Karma: ${cur}`); }catch{}
          }catch{}
        }
      }catch{}
    }, 40); // ~2s
  }catch{}

  globalThis.LABS_showMainMenu = (player)=>{
    try{
      const dim = world.getDimension("overworld");
      const readScore = async (pl, objective)=>{
        // Prefer Scoreboard API when available
        try{
          const obj = world.scoreboard?.getObjective?.(objective);
          const id = pl?.scoreboardIdentity;
          if (obj && id) {
            const val = obj.getScore(id);
            if (typeof val === 'number' && Number.isFinite(val)) return val;
          }
        }catch{}
        // Fallback to command parsing
        try{
          const r = await pl.runCommandAsync(`scoreboard players get @s ${objective}`);
          const m = String(r?.statusMessage||"");
          const n = m.match(/-?\d+/); return n?Number(n[0]):0;
        }catch{ return 0; }
      };
      const form = new ActionFormData().title("LABS").body("Choose an option:");
      // Build buttons; some may be hidden by OP settings
      form.button("LABS Manual");
      form.button("Karma Tools");
      if (typeof isFeatureEnabled !== 'function' || isFeatureEnabled('getMyBots')) form.button("Get My Bots");
      if (typeof isFeatureEnabled !== 'function' || isFeatureEnabled('teleportBots')) form.button("Teleport to My Bots");
      
      
      // Admin-only quick actions at top level
      try{ if (player.hasTag && player.hasTag("labs_admin")) { form.button("Give Bot Egg (Admin)"); form.button("OP Tools (Admin)"); } }catch{}
      system.runTimeout(()=>{
      form.show(player).then(async res=>{
      if (!res || res.canceled) return;
      const idx = res.selection;
      
      // Check admin buttons first (before regular menu handlers)
      try{
        const isAdmin = player.hasTag && player.hasTag("labs_admin");
        if (isAdmin) {
          // Calculate admin button indices based on actual menu structure
          let adminIndex = 2; // Start after Karma Tools
          if (typeof isFeatureEnabled==='function' ? isFeatureEnabled('getMyBots') : true) adminIndex++;
          if (typeof isFeatureEnabled==='function' ? isFeatureEnabled('teleportBots') : true) adminIndex++;
          
          if (idx === adminIndex) {
            // Give Bot Egg (Admin)
            const players = world.getPlayers();
            if (!players.length){ try{ player.sendMessage("No players online."); }catch{} return; }
            const names = players.map(p=>p.name);
            const selfIdx = Math.max(0, names.indexOf(player.name));
            const eggs = ALL_BOT_EGGS.filter(id=>!BANNED.has(id.replace("_spawn_egg","")) && !/justice/i.test(id));
            eggs.push("myname:biome_bomb");
            const labels = eggs.map(eggLabelFromId);
            labels[labels.length - 1] = "§6§lBiome Bomb§r";
            const mf = new ModalFormData().title("Give Bot Egg (Admin)")
              .dropdown("Player", names, selfIdx)
              .dropdown("Egg", labels, 0)
              .slider("Amount", 1, 64, 1, 1);
            mf.show(player).then(fr=>{
              if (!fr || fr.canceled) return;
              const pi = Number(fr.formValues?.[0]||0)|0; const ei = Number(fr.formValues?.[1]||0)|0; const amt = Math.max(1, Math.min(64, Number(fr.formValues?.[2]||1)|0));
              const target = players[pi]; const eggId = eggs[ei];
              if (!target || !eggId) return;
              try{ const inv=target.getComponent("inventory")?.container; const leftover=inv?.addItem?.(new ItemStack(eggId, amt)); if (leftover) target.dimension.spawnItem(leftover, target.location); player.sendMessage?.(`Gave ${amt} ${eggId} to ${target.name}.`); }catch{}
            }).catch(()=>{});
            return;
          } else if (idx === adminIndex + 1) {
            // OP Tools (Admin)
            try{ showOpToolsMenu(player); }catch{}
            return;
          }
        }
      }catch(e){}
           if (idx===0){ try{ if (globalThis.LABS_openManual){ LABS_openManual(player); return; } }catch{}
            try {
              // Ensure objectives exist (no-op if already created)
              try{ await dim.runCommandAsync("scoreboard objectives add lenycoins dummy LenyCoins"); }catch{}
              try{ await dim.runCommandAsync("scoreboard objectives add karma dummy Karma"); }catch{}
              const [coins, karma] = await Promise.all([
                readScore(player, "lenycoins"),
                readScore(player, "karma")
              ]);
              player.sendMessage(`Your balances — LenyCoins: ${coins}, Karma: ${karma}`);
              // Your location (prominent)
              try{
                const loc={x:Math.floor(player.location.x),y:Math.floor(player.location.y),z:Math.floor(player.location.z)};
                const dm=dimNameToKey(player.dimension?.id);
                try{ player.onScreenDisplay.setTitle(`Your Location: ${loc.x},${loc.y},${loc.z} (${dm})`); }catch{}
                player.sendMessage(`Your Location: ${loc.x},${loc.y},${loc.z} (${dm})`);
              }catch{}
              // List owned bots with locations (cross-dimension, from registry)
              try{
                loadBotReg();
                const entries = (BOT_REG[player.name]||[]);
                if (!entries.length){ player.sendMessage("You have no registered bots yet."); }
                else {
                  const sorted = entries.slice().sort((a,b)=> (Number(b.t||0)) - (Number(a.t||0)));
                  const recent = sorted.slice(0,4);
                  player.sendMessage(`Your bots and locations (showing ${recent.length}/${entries.length}):`);
                  for (const en of recent){
                    const nm=String(en.type||"").split(":")[1]?.replace(/_/g," ")||"bot";
                    const dm=dimNameToKey(en.dim);
                    player.sendMessage(`- ${nm} @ ${en.x},${en.y},${en.z} (${dm})`);
                  }
                }
              }catch{}

              /*`give \"${player.name}\" written_book{pages:['["',{"text":"Leny\\'s Amped Bots","bold":true},{"text":"\\n\\nWelcome to LABS — a suite of helper bots, tools, and economy systems for Bedrock. Use the Stick Menu to open the LABS menu, manage coins/karma, and access utilities.\\n\\nThis book explains how to use LABS and what each bot does.","color":"reset"}]','{"text":"GETTING STARTED\\n\\n- Open the LABS menu with your Stick (use it while held).\\n- You\\'ll see About, Feedback, OP Tools (admins), Donate, Return Egg, Karma Tools, Get My Bots, Buy My Way Home, and Music.\\n- Many bots show a setup form on spawn. Place them near chests if they store stuff.\\n- Most bots drop their spawn egg when retrieved via menu or on death (unless marked retrieved)."}','{"text":"COINS & KARMA\\n\\n- LenyCoins: the addon currency. Earn/spend via shops and tools.\\n- Karma: social score for good deeds (donations, returns).\\n- View/change via LABS menu (admins can adjust in OP Tools).\\n- Some actions grant sounds, songs, or fun effects."}','{"text":"BOT BASICS\\n\\n- Spawn the bot with its spawn egg.\\n- Place bots where they should work (near furnaces, farms, pens, etc.).\\n- Many bots look for nearby chests/barrels to deposit items.\\n- Use menus the bot pops for setup.\\n- Retrieve: certain completion dialogs let you reclaim the egg; otherwise kill the bot (it usually drops an egg)."}','{"text":"BUTLER BOT\\n\\nRole: follow, defend, auto-pickup, route ores to smelter.\\n- Follows owner across dimensions, keeps a respectful distance.\\n- Defends owner vs. nearby hostiles.\\n- Picks up nearby item drops (up to 64 slots worth).\\n- Routes ores/fuel it picks to your nearest Smelter bot automatically when possible.\\n- Quips and occasionally hums a tune.\\nTip: Great companion for cave runs."}','{"text":"SMELTER BOT\\n\\nRole: manage up to 4 furnaces and an output chest.\\n- Place the bot; it will detect/place furnaces adjacent to it and use a nearby chest.\\n- Accepts queued ores/fuel (from Butler or players).\\n- Feeds fuel and ores safely; outputs go to a nearby chest.\\n- Tracks input/output so it never dupes beyond inputs.\\nTip: Put a chest next to each furnace for tidy output."}','{"text":"MINER BOT\\n\\nRole: mine corridors or stairs.\\n- On spawn choose: Corridor, Stairs Up, or Stairs Down.\\n- Faces like the nearest player, then digs a clean path in that direction.\\n- Avoids breaking valuable ores/sculk; leaves those for you to mine.\\n- Works in timed slices; finishes corridors after ~100 steps and offers to return the egg.\\n- Plays an occasional miner song."}','{"text":"FARMER BOT\\n\\nRole: simple automated farming.\\n- Choose farm type: Cocoa, Cactus, Paper (Sugar Cane), Bamboo, or Crops.\\n- Best inside a fenced area (~15x15) with a chest nearby.\\n- Harvests mature plants and deposits into the chest.\\n- Wanders the pen and avoids hazards like cactus.\\nTip: Place clear access and storage near the farm."}','{"text":"BEEKEEPER BOT\\n\\nRole: automate beehives/nests.\\n- Place near a beehive/nest area with a chest.\\n- If the chest has glass bottles, makes Honey Bottles; otherwise collects Honeycomb.\\n- Resets honey level safely and deposits into the chest.\\n- Periodically plays its song.\\nTip: A 20x20 fenced wildflower area with hives works great."}','{"text":"STOREKEEPER BOT\\n\\nRole: player shop for LenyCoins.\\n- Owner setup: put the item to sell in hotbar Slot 1, set a price, and deposit an amount from Slot 1 via the bot\\'s Manage menu.\\n- Stock/Prices are tracked per owner and shared across your shops.\\n- Buyers use the Buy menu, pay in LenyCoins, and receive the items (unlimited HOT Lava Chicken option available).\\n- Optional nearby chest for ambiance; stock is tracked by the system."}','{"text":"TREASURE BOT\\n\\nRole: roam and find points of interest.\\n- Wanders within a large radius, scanning columns for things like spawners, treasure chests, rich diamonds, amethyst caves, or sculk.\\n- When it finds something, it builds a small birch marker with a torch and announces the find.\\n- Launches fireworks for about 3 minutes at the spot.\\nTip: Let it roam; it prefers safe steps and avoids water."}','{"text":"HERDER BOT\\n\\nRole: gather a chosen animal to a pen.\\n- On spawn choose an animal (chickens, cows, pigs, sheep, horses, donkeys, mules, llamas, cats, wolves, goats, camels).\\n- Places an anchor fence post and roams to \"invite\" animals.\\n- Gently pulls collected animals to stay near; after ~10 minutes returns them to the fence.\\nTip: Build a simple pen around the anchor."}','{"text":"WORKER BOT\\n\\nRole: Block Maker (auto-craft storage blocks).\\n- Place near 1-2 chests: one chest for input (ingots/gems), one for output.\\n- Crafts compact blocks (e.g., 9 iron ingots -> 1 iron block) and deposits to output.\\n- If output is full, drops leftovers at its feet.\\nTip: Recipes include iron, gold, copper, diamond, emerald, redstone, lapis, quartz, coal, netherite."}','{"text":"CONSTRUCTOR BOT\\n\\nRole: place blueprints with fine-tune preview.\\n- Supports a default blueprint (wood_shack) and a fine-tune flow to position builds precisely.\\n- Use the compact fine-tune controls (look + stick taps; hold sneak to confirm) or the menu.\\n- Draws a particle outline preview before placing.\\nTip: Great for quick shelters and sharing player-made captures."}','{"text":"MENUS & TOOLS\\n\\n- Return Egg: hold a stolen bot egg, choose a player to return it to; may grant Karma.\\n- Donate: coins to others; Donate Here: coins/items to a nearby chest (Karma).\\n- OP Tools (admins): justice tools, give eggs, spawn demo kiosk, reset cooldowns, play music, grant items.\\n- Music: play custom LABS or vanilla tracks near you."}'],title:"LABs for Dummies",author:"http://minecraft.tools/",display:{Lore:["Here is your bot bible"]}}`;
                await player.runCommandAsync(cmd);
                */
                /* giveLabsManual removed from About */
                } catch {}
          } else if (idx===1){
            // Karma Tools
            const kform = new ActionFormData().title("Karma").body("Choose an option:")
              .button("View balances")
              .button("Convert Karma to Coins")
              .button("Toggle Karma HUD");
            kform.show(player).then(async kr=>{
              if (!kr || kr.canceled) return;
              if (kr.selection===0){
                // View balances
                try{
                  const [coins, karma] = await Promise.all([
                    readScore(player, "lenycoins"),
                    readScore(player, "karma")
                  ]);
                  player.sendMessage(`Your balances — LenyCoins: ${coins}, Karma: ${karma}`);
                }catch{}
              } else if (kr.selection===1){
                // Convert Karma to Coins
                try{
                  const [coins, karma] = await Promise.all([
                    readScore(player, "lenycoins"),
                    readScore(player, "karma")
                  ]);
                  if (karma <= 0) { 
                    try { player.sendMessage("You have no Karma to convert."); } catch {} 
                    return; 
                  }
                  const mf = new ModalFormData()
                    .title(`Convert Karma — You have ${karma}`)
                    .slider("Amount to convert", 1, karma, 1, Math.min(karma, 100));
                  mf.show(player).then(async fr=>{
                    if (!fr || fr.canceled) return;
                    const amt = Math.max(1, Math.floor(Number(fr.formValues?.[0]||0)));
                    if (amt > karma) { 
                      try { player.sendMessage("Insufficient Karma."); } catch {} 
                      return; 
                    }
                    try{
                      await player.runCommandAsync(`scoreboard players remove @s karma ${amt}`);
                      await player.runCommandAsync(`scoreboard players add @s lenycoins ${amt}`);
                      try { player.sendMessage(`Converted ${amt} Karma to ${amt} LenyCoins.`); } catch {}
                    }catch{ try { player.sendMessage("Conversion failed."); } catch {} }
                  }).catch(()=>{});
                }catch{ try { player.sendMessage("Failed to read karma balance."); } catch {} }
              } else if (kr.selection===2){
                // Toggle Karma HUD
                try{
                  const has = player.hasTag && player.hasTag('labs_karma_hud');
                  if (has) { try{ player.removeTag('labs_karma_hud'); player.sendMessage('Karma HUD: OFF'); }catch{} }
                  else { try{ player.addTag('labs_karma_hud'); player.sendMessage('Karma HUD: ON'); }catch{} }
                }catch{}
              }
            }).catch(()=>{});
          } else if (idx===2){
            // Get My Bots - Categorized by type with distance
            try{
              if (typeof isFeatureEnabled==='function' && !isFeatureEnabled('getMyBots')){ try{ player.sendMessage("This feature is disabled on this server."); }catch{} return; }
              const dims=[world.getDimension("overworld"), world.getDimension("nether"), world.getDimension("the_end")].filter(Boolean);
              const T=["myname:miner_bot","myname:constructor_bot","myname:fisher_bot","myname:shroom_bot","myname:farmer_bot","myname:beekeeper_bot","myname:treasure_bot","myname:storekeeper_bot","myname:chef_bot","myname:butler_bot","myname:smelter_bot","myname:redstone_bot","myname:trash_bot"].filter(id=>!BANNED.has(id));
              const bots=[];
              for(const dim of dims){
                for(const type of T){
                  const entities=dim.getEntities({type});
                  for(const e of entities){
                    const tags=e.getTags?.()||[];
                    let owner=""; for(const t of tags){ if(String(t).startsWith("labs_owner:")){ owner=String(t).slice("labs_owner:".length); break; } }
                    if(owner===player.name){
                      const dx=e.location.x-player.location.x, dy=e.location.y-player.location.y, dz=e.location.z-player.location.z;
                      const d2=dx*dx+dy*dy+dz*dz;
                      const nm=type.split(":")[1]?.replace(/_/g," ")||"bot";
                      const dm=dimNameToKey(dim.id);
                      bots.push({e, nm, dm, d2, type});
                    }
                  }
                }
              }
              if(!bots.length){ try{ player.sendMessage("No owned bots found."); }catch{} return; }
              bots.sort((a,b)=>a.d2-b.d2);
              const labels=bots.map(b=>`${b.nm} @ ${Math.floor(b.e.location.x)},${Math.floor(b.e.location.y)},${Math.floor(b.e.location.z)} (${b.dm})`);
              const mf=new ModalFormData().title("Get My Bots").dropdown("Retrieve:", labels, 0);
              mf.show(player).then(fr=>{
                if(!fr||fr.canceled) return; const idx2=fr.formValues?.[0]||0; const bot=bots[idx2]; if(!bot) return;
                try{
                  const inv=player.getComponent("inventory")?.container;
                  const egg=new ItemStack(bot.type+"_spawn_egg", 1);
                  const added=inv?.addItem?.(egg);
                  if(!added) bot.e.dimension.spawnItem(egg, bot.e.location);
                  try{ bot.e.addTag?.("labs_retrieved"); }catch{}
                  try{ bot.e.kill?.(); }catch{ try{ bot.e.dimension.spawnItem(new ItemStack(bot.type+"_spawn_egg", 1), bot.e.location); }catch{} }
                  try{ player.sendMessage("Bot retrieved."); }catch{}
                }catch{}
              }).catch(()=>{});
            }catch{}
          } else if (idx===3){
            // Teleport to My Bots — categorized by type with distance
            try{
              if (typeof isFeatureEnabled==='function' && !isFeatureEnabled('teleportBots')){ try{ player.sendMessage("This feature is disabled on this server."); }catch{} return; }
              loadBotReg();
              const entries = (BOT_REG[player.name]||[]);
              if (!entries.length){ try{ player.sendMessage("No owned bots recorded."); }catch{} return; }
              const labels = entries.map(en=>{ const nm=String(en.type||"").split(":")[1]?.replace(/_/g," ")||"bot"; const dimKey = dimNameToKey(en.dim); return `${nm} @ ${en.x},${en.y},${en.z} (${dimKey})`; });
              const mf=new ModalFormData().title("Teleport to My Bots").dropdown("Teleport to:", labels, 0);
              mf.show(player).then(async fr=>{
                if(!fr||fr.canceled) return; const idx2=fr.formValues?.[0]||0; const en=entries[idx2]; if(!en) return;
                // teleport (free)
                try{ const d2=world.getDimension(dimNameToKey(en.dim)); player.teleport({x:en.x+0.5,y:en.y+0.5,z:en.z+0.5}, { dimension: d2, checkForBlocks:true }); }catch{}
              }).catch(()=>{});
            }catch{}
          } else if (false && idx===4){
            // donatehere flow (disabled)
            try{
              const p=player; const dimP=p.dimension; const base={x:Math.floor(p.location.x), y:Math.floor(p.location.y), z:Math.floor(p.location.z)};
              let chest=null;
              for(let dx=-3;dx<=3 && !chest;dx++) for(let dz=-3;dz<=3 && !chest;dz++) for(let dy=-1;dy<=2 && !chest;dy++){
                try{
                  const b=dimP.getBlock({x:base.x+dx,y:base.y+dy,z:base.z+dz}); if (!b) continue;
                  if (String(b.typeId||"")==="minecraft:chest"){ chest=b; break; }
                }catch{}
              }
              if (!chest){ try{ p.sendMessage("No donation chest nearby."); }catch{} return; }
              const cont=chest.getComponent("minecraft:inventory")?.container; if (!cont){ try{ p.sendMessage("Chest not usable."); }catch{} return; }
              const af=new ActionFormData().title("Donation Chest").body("Choose what to donate:").button("Donate Coins").button("Donate Held Item");
              af.show(p).then(res2=>{
                if(!res2||res2.canceled) return;
                if (res2.selection===0){
                  const mf=new ModalFormData().title("Donate Coins").textField("Amount", "e.g. 100", "");
                  mf.show(p).then(async fr=>{
                    if(!fr||fr.canceled) return; const amt=Math.max(0,Math.floor(Number(fr.formValues?.[0]||0))); if(!amt){ try{ p.sendMessage("Nothing donated."); }catch{} return; }
                    try{ const ok = globalThis.LABS_spendCoins ? await globalThis.LABS_spendCoins(p, amt) : (await dim.runCommandAsync(`scoreboard players remove \"${p.name}\" lenycoins ${amt}`), true); if (!ok){ p.sendMessage?.("Insufficient LenyCoins."); return; } }catch{ try{ p.sendMessage("Insufficient LenyCoins."); }catch{} return; }
                    try{ dim.runCommandAsync(`scoreboard players add \"${p.name}\" karma 5`); }catch{}
                    try{ dim.runCommandAsync(`scoreboard players add \"${p.name}\" donated ${amt}`); }catch{}
                    try{ p.sendMessage(`Donated ${amt} LenyCoins. (+5 Karma)`); }catch{}
                  }).catch(()=>{});
                } else if (res2.selection===1){
                  const inv=p.getComponent("inventory")?.container; const slot=(typeof p?.selectedSlot==="number"&&Number.isFinite(p.selectedSlot))?p.selectedSlot:0; const held=inv?.getItem(Number(slot));
                  if (!held){ try{ p.sendMessage("Hold the item you want to donate."); }catch{} return; }
                  const mf=new ModalFormData().title("Donate Item").textField("Amount", `max ${held.amount}`, `${held.amount}`);
                  mf.show(p).then(async fr=>{
                    if(!fr||fr.canceled) return; const dep=Math.max(0,Math.min(held.amount, Math.floor(Number(fr.formValues?.[0]||0)))); if(!dep){ try{ p.sendMessage("Nothing donated."); }catch{} return; }
                    try{ const cur=inv.getItem(Number(slot)); if (cur && cur.typeId===held.typeId){ cur.amount-=dep; inv.setItem(Number(slot), cur.amount>0?cur:undefined); } }catch{}
                    try{ dim.runCommandAsync(`scoreboard players add \"${p.name}\" karma 5`); }catch{}
                    try{ p.sendMessage(`Donated ${dep} ${held.typeId}. (+5 Karma)`); }catch{}
                  }).catch(()=>{});
                }
              }).catch(()=>{});
            }catch{}
          } else if (false && idx===6){
            // donate flow (disabled)
            try{
              const p=player; const players=world.getPlayers().filter(x=>x.name!==p.name);
              if (!players.length){ try{ p.sendMessage("No other players online."); }catch{} return; }
              const names=players.map(pl=>pl.name);
              const form=new ModalFormData().title("Donate Coins").dropdown("Receiver", names, 0).textField("Amount", "e.g. 100", "");
              form.show(p).then(async fr=>{
                if(!fr||fr.canceled) return; const idx2=fr.formValues?.[0]||0; const amt=Math.max(0,Math.floor(Number(fr.formValues?.[1]||0)));
                if (!amt){ try{ p.sendMessage("Nothing donated."); }catch{} return; }
                const recv=players[idx2]; if (!recv){ try{ p.sendMessage("Receiver not found."); }catch{} return; }
                try{ const ok = globalThis.LABS_spendCoins ? await globalThis.LABS_spendCoins(p, amt) : (await dim.runCommandAsync(`scoreboard players remove \"${p.name}\" lenycoins ${amt}`), true); if (!ok){ p.sendMessage?.("Insufficient LenyCoins."); return; } }catch{ try{ p.sendMessage("Insufficient LenyCoins."); }catch{} return; }
                try{ dim.runCommandAsync(`scoreboard players add \"${recv.name}\" lenycoins ${amt}`); }catch{}
                try{ dim.runCommandAsync(`scoreboard players add \"${p.name}\" karma 5`); }catch{}
                try{ p.sendMessage(`Donated ${amt} LenyCoins to ${recv.name}. (+5 Karma)`); recv.sendMessage?.(`${p.name} donated ${amt} LenyCoins to you.`); }catch{}
              }).catch(()=>{});
            }catch{}
          } else if (idx===4){
            // karma tools
            const kform = new ActionFormData().title("Karma").body("Choose an option:")
              .button("View balances")
              .button("Convert Karma -> LenyCoins")
              .button("Toggle Karma HUD");
            kform.show(player).then(res2=>{
              if (!res2 || res2.canceled) return;
              if (res2.selection===0){
                // Show balances in a popup with a Back button
                try{
                  const readScore = (pl, objective)=>{
                    try{
                      const obj = world.scoreboard?.getObjective?.(objective);
                      const id = pl?.scoreboardIdentity;
                      if (obj && id) { const v = obj.getScore(id); if (typeof v === 'number' && Number.isFinite(v)) return v; }
                    }catch{}
                    return 0;
                  };
                  const coins = readScore(player, 'lenycoins');
                  const karma = readScore(player, 'karma');
                  const vf = new ActionFormData().title('Karma Balances')
                    .body(`LenyCoins: ${coins}\nKarma: ${karma}`)
                    .button('Back');
                  vf.show(player).then(vr=>{ if (!vr || vr.canceled) return; /* Back to Karma menu */
                    const kform2 = new ActionFormData().title('Karma').body('Choose an option:')
                      .button('View balances')
                      .button('Convert Karma -> LenyCoins');
                    kform2.show(player).then(rr=>{ if(!rr||rr.canceled) return; if (rr.selection===0){ /* recurse */ try{ player.sendMessage('Use the first option again to view balances.'); }catch{} } else if (rr.selection===1){
                      const curObj=world.scoreboard?.getObjective?.('karma'); const curId=player?.scoreboardIdentity; let cur=0; try{ if(curObj&&curId){ const v=curObj.getScore(curId); if(typeof v==='number'&&Number.isFinite(v)) cur=v; } }catch{}
                      if (cur<=0){ try{ player.sendMessage('You have no Karma to convert.'); }catch{}; return; }
                      const mf=new ModalFormData().title(`Convert Karma — You have ${cur}`).slider('Amount to convert', 1, cur, 1, Math.min(cur, 100));
                      mf.show(player).then(async fr=>{
                        if (!fr || fr.canceled) return;
                        const amt=Math.max(1, Math.floor(Number(fr.formValues?.[0]||0)));
                        try{ await player.runCommandAsync(`scoreboard players remove @s karma ${amt}`); }catch{}
                        try{ await player.runCommandAsync(`scoreboard players add @s lenycoins ${amt}`); }catch{}
                        try{ player.sendMessage(`Converted ${amt} Karma to ${amt} LenyCoins.`); }catch{}
                      }).catch(()=>{});
                    }}).catch(()=>{});
                  }).catch(()=>{});
                }catch{}
              } else if (res2.selection===1){
                // Convert Karma -> LenyCoins with a slider and current balance shown
                try{
                  let current=0; try{ const obj=world.scoreboard?.getObjective?.('karma'); const id=player?.scoreboardIdentity; if(obj&&id){ const v=obj.getScore(id); if(typeof v==='number' && Number.isFinite(v)) current=v; } }catch{}
                  if (current<=0){ try{ player.sendMessage('You have no Karma to convert.'); }catch{} return; }
                  const mf=new ModalFormData().title(`Convert Karma — You have ${current}`).slider('Amount to convert', 1, current, 1, Math.min(current, 100));
                  mf.show(player).then(async fr=>{
                    if (!fr || fr.canceled) return;
                    const amt = Math.max(1, Math.floor(Number(fr.formValues?.[0]||0)));
                    try{ await player.runCommandAsync(`scoreboard players remove @s karma ${amt}`); }catch{}
                    try{ await player.runCommandAsync(`scoreboard players add @s lenycoins ${amt}`); }catch{}
                    try{ player.sendMessage(`Converted ${amt} Karma to ${amt} LenyCoins.`); }catch{}
                  }).catch(()=>{});
                }catch{}
              } else if (res2.selection===2){
                // Toggle per-player Karma HUD (action bar)
                try{
                  const has = player.hasTag && player.hasTag('labs_karma_hud');
                  if (has){ try{ player.removeTag('labs_karma_hud'); player.sendMessage('Karma HUD: OFF'); }catch{} }
                  else { try{ player.addTag('labs_karma_hud'); player.sendMessage('Karma HUD: ON'); }catch{} }
                }catch{}
              }
            }).catch(()=>{});
          } else if (idx===5){
          // Get My Bots - Categorized by type with distance
            try{
              if (typeof isFeatureEnabled==='function' && !isFeatureEnabled('getMyBots')){ try{ player.sendMessage("This feature is disabled on this server."); }catch{} return; }
              const dims=[world.getDimension("overworld"), world.getDimension("nether"), world.getDimension("the_end")].filter(Boolean);
              const T=["myname:miner_bot","myname:constructor_bot","myname:fisher_bot","myname:shroom_bot","myname:farmer_bot","myname:beekeeper_bot","myname:treasure_bot","myname:storekeeper_bot","myname:chef_bot","myname:butler_bot","myname:smelter_bot","myname:redstone_bot","myname:trash_bot"].filter(id=>!BANNED.has(id));
              
              const botCategories = {
                "myname:miner_bot": { icon: "⛏", label: "Miner Bots", color: "§4" },
                "myname:fisher_bot": { icon: "🎣", label: "Fisher Bots", color: "§1" },
                "myname:farmer_bot": { icon: "🌾", label: "Farmer Bots", color: "§2" },
                "myname:beekeeper_bot": { icon: "🐝", label: "Beekeeper Bots", color: "§4" },
                "myname:shroom_bot": { icon: "🍄", label: "Shroom Bots", color: "§5" },
                "myname:butler_bot": { icon: "📦", label: "Butler Bots", color: "§0" },
                "myname:treasure_bot": { icon: "💎", label: "Treasure Bots", color: "§4" },
                "myname:chef_bot": { icon: "👨‍🍳", label: "Chef Bots", color: "§4" },
                "myname:storekeeper_bot": { icon: "🏪", label: "Storekeeper Bots", color: "§2" },
                "myname:constructor_bot": { icon: "🏗", label: "Constructor Bots", color: "§3" },
                "myname:smelter_bot": { icon: "🔥", label: "Smelter Bots", color: "§c" },
                "myname:redstone_bot": { icon: "⚡", label: "Redstone Bots", color: "§4" },
                "myname:trash_bot": { icon: "🗑", label: "Trash Bots", color: "§8" },
                "myname:control_bot": { icon: "🎮", label: "Control Bots", color: "§3" }
              };
              
              const mine=[];
              for(const d of dims){
                for(const t of T){
                  try{
                    const arr=d.getEntities({type:t});
                    for(const e of arr){
                      let ok=false;
                      try{ const tags=e.getTags?.()||[]; const own=tags.find(tt=>String(tt).startsWith("labs_owner:")); if (own && own.endsWith(player.name)) ok=true; }catch{}
                      if (!ok && t==="myname:storekeeper_bot"){
                        try{ const tags=e.getTags?.()||[]; const sk=tags.find(tt=>String(tt).startsWith("sko|")); if (sk && sk.slice(4)===player.name) ok=true; }catch{}
                      }
                      if (ok){ mine.push({e, type: t, dim: d.id}); }
                    }
                  }catch{}
                }
              }
              if (!mine.length){ try{ player.sendMessage("No owned bots found."); }catch{} return; }
              
              // Group by type
              const grouped = {};
              for (const item of mine){
                const type = item.type;
                if (!grouped[type]) grouped[type] = [];
                grouped[type].push(item);
              }
              
              // Create category menu
              const categoryLabels = [];
              const categoryKeys = [];
              for (const [type, bots] of Object.entries(grouped)){
                const cat = botCategories[type] || { icon: "🤖", label: type, color: "§8" };
                categoryLabels.push(`${cat.color}${cat.icon} ${cat.label} §8(${bots.length})§r`);
                categoryKeys.push(type);
              }
              
              const catForm = new ActionFormData().title("§1§l📦 Get My Bots§r").body("§8Select bot category to retrieve:§r");
              for (const label of categoryLabels){ catForm.button(label); }
              
              catForm.show(player).then(catRes=>{
                if(!catRes||catRes.canceled) return;
                const selectedType = categoryKeys[catRes.selection];
                const botsInCategory = grouped[selectedType] || [];
                if (!botsInCategory.length) return;
                
                // Show bots in this category with distance
                const pLoc = player.location;
                const botsWithDistance = botsInCategory.map(item=>{
                  const dist = Math.sqrt((item.e.location.x - pLoc.x)**2 + (item.e.location.y - pLoc.y)**2 + (item.e.location.z - pLoc.z)**2);
                  return { ...item, distance: Math.floor(dist) };
                }).sort((a,b)=> a.distance - b.distance);
                
                const botLabels = botsWithDistance.map(item=>{
                  const dimColors = { "minecraft:overworld": "§2", "minecraft:nether": "§c", "minecraft:the_end": "§5" };
                  const dimKey = item.dim.split(":")[1] || item.dim;
                  const dimColor = dimColors[item.dim] || "§8";
                  const cat = botCategories[selectedType] || { icon: "🤖" };
                  const loc = {x:Math.floor(item.e.location.x),y:Math.floor(item.e.location.y),z:Math.floor(item.e.location.z)};
                  return `${cat.icon} Bot §0[${item.distance}m]§r ${dimColor}●§r ${loc.x},${loc.y},${loc.z}`;
                });
                botLabels.push("§6§l◄ Back to Categories§r");
                
                const botForm = new ModalFormData().title(`${botCategories[selectedType]?.color || "§8"}${botCategories[selectedType]?.icon || "🤖"} ${botCategories[selectedType]?.label || "Bots"}§r`).dropdown("Retrieve bot:", botLabels, 0);
                botForm.show(player).then(fr=>{
                  if(!fr||fr.canceled) return;
                  const idx = fr.formValues?.[0]||0;
                  if (idx === botLabels.length - 1){ catForm.show(player); return; } // Back
                  const item = botsWithDistance[idx]; if(!item) return;
                  const b = item.e;
                  const eggId = `${b.typeId}_spawn_egg`;
                  
                  try{ b.addTag?.("labs_retrieved"); }catch{}
                  try{
                    const inv=player.getComponent("inventory")?.container; const egg=new ItemStack(eggId,1); const leftover=inv?.addItem?.(egg); if(leftover) player.dimension.spawnItem(leftover, player.location);
                  }catch{}
                  try{
                    const tag=`labs_kill:${Date.now().toString(36)}`; b.addTag?.(tag);
                    b.dimension.runCommandAsync?.(`kill @e[type=${b.typeId},x=${Math.floor(b.location.x)},y=${Math.floor(b.location.y)},z=${Math.floor(b.location.z)},r=2,tag=${tag}]`).catch(()=>{});
                  }catch{ try{ b.kill?.(); }catch{ try{ b.dimension.spawnItem(new ItemStack(eggId,1), b.location); }catch{} } }
                  try{ player.sendMessage("§a§lBot retrieved!§r §8Egg added to inventory.§r"); }catch{}
                  
                  // Show quick action menu after retrieval
                  const actionForm = new ActionFormData()
                    .title("§a§lBot Retrieved!§r")
                    .body(`§8Egg added to your inventory.§r`)
                    .button("📦 Retrieve Another Bot")
                    .button("✓ Done");
                  
                  actionForm.show(player).then(actRes=>{
                    if(!actRes||actRes.canceled) return;
                    if(actRes.selection === 0){ catForm.show(player); }
                  }).catch(()=>{});
                }).catch(()=>{});
              }).catch(()=>{});
            }catch{}
            } else if (idx===6){
                // Teleport to My Bots — categorized by type with distance
                try{
                if (typeof isFeatureEnabled==='function' && !isFeatureEnabled('teleportBots')){ try{ player.sendMessage("This feature is disabled on this server."); }catch{} return; }
                loadBotReg();
                const entries = (BOT_REG[player.name]||[]).filter(en=>!BANNED.has(String(en.type||"")));
                if (!entries.length){ try{ player.sendMessage("No owned bots recorded."); }catch{} return; }
                
                // Group bots by type
                const botCategories = {
                  "myname:miner_bot": { icon: "⛏", label: "Miner Bots", color: "§4" },
                  "myname:fisher_bot": { icon: "🎣", label: "Fisher Bots", color: "§1" },
                  "myname:farmer_bot": { icon: "🌾", label: "Farmer Bots", color: "§2" },
                  "myname:beekeeper_bot": { icon: "🐝", label: "Beekeeper Bots", color: "§4" },
                  "myname:shroom_bot": { icon: "🍄", label: "Shroom Bots", color: "§5" },
                  "myname:butler_bot": { icon: "📦", label: "Butler Bots", color: "§0" },
                  "myname:treasure_bot": { icon: "💎", label: "Treasure Bots", color: "§4" },
                  "myname:chef_bot": { icon: "👨‍🍳", label: "Chef Bots", color: "§4" },
                  "myname:control_bot": { icon: "🎮", label: "Control Bots", color: "§3" },
                  "myname:storekeeper_bot": { icon: "🏪", label: "Storekeeper Bots", color: "§2" }
                };
                
                const grouped = {};
                for (const en of entries){
                  const type = en.type || "unknown";
                  if (!grouped[type]) grouped[type] = [];
                  grouped[type].push(en);
                }
                
                // Create category menu
                const categoryLabels = [];
                const categoryKeys = [];
                for (const [type, bots] of Object.entries(grouped)){
                  const cat = botCategories[type] || { icon: "🤖", label: type, color: "§8" };
                  categoryLabels.push(`${cat.color}${cat.icon} ${cat.label} §8(${bots.length})§r`);
                  categoryKeys.push(type);
                }
                
                const catForm = new ActionFormData().title("§1§l🤖 Teleport to My Bots§r").body("§8Select bot category:§r");
                for (const label of categoryLabels){ catForm.button(label); }
                catForm.button("§4💎 Treasure Markers§r");
                
                catForm.show(player).then(catRes=>{
                  if(!catRes||catRes.canceled) return;
                  const selectedIdx = catRes.selection;
                  
                  // Check if treasure markers option was selected
                  if (selectedIdx === categoryLabels.length) {
                    // Treasure Markers menu
                    try{
                      if (typeof isFeatureEnabled==='function' && !isFeatureEnabled('treasureMarkers')){ try{ player.sendMessage("This feature is disabled on this server."); }catch{} return; }
                      const raw = world.getDynamicProperty?.("labs_treasure_markers");
                      const MARKERS = raw && typeof raw==='string' ? JSON.parse(raw) : {};
                      const myMarkers = MARKERS[player.name] || [];
                      if (!myMarkers.length){ try{ player.sendMessage("No treasure markers found."); }catch{} return; }
                      
                      // Sort by most recent
                      const sorted = [...myMarkers].sort((a,b)=> (b.timestamp||0) - (a.timestamp||0));
                      
                      // Calculate distances
                      const pLoc = player.location;
                      const markersWithDistance = sorted.map(m=>{
                        const dist = Math.sqrt((m.x - pLoc.x)**2 + (m.y - pLoc.y)**2 + (m.z - pLoc.z)**2);
                        return { ...m, distance: Math.floor(dist) };
                      });
                      
                      const markerLabels = markersWithDistance.map(m=>{
                        const dimColors = { "minecraft:overworld": "§2", "minecraft:nether": "§c", "minecraft:the_end": "§5" };
                        const dimColor = dimColors[m.dim] || "§8";
                        return `§4💎§r ${m.label} §0[${m.distance}m]§r ${dimColor}●§r`;
                      });
                      markerLabels.push("§c§l✖ Clear All Markers§r");
                      markerLabels.push("§4§l◄ Back to Categories§r");
                      
                      const markerForm = new ModalFormData().title("§4💎 Treasure Markers§r").dropdown("Select marker:", markerLabels, 0);
                      markerForm.show(player).then(async markerRes=>{
                        if(!markerRes||markerRes.canceled) return;
                        const idx = markerRes.formValues?.[0]||0;
                        
                        // Clear all markers
                        if (idx === markerLabels.length - 2){
                          try{
                            MARKERS[player.name] = [];
                            const s = JSON.stringify(MARKERS||{});
                            world.setDynamicProperty?.("labs_treasure_markers", s.length>10000?s.slice(0,10000):s);
                            player.sendMessage("§a§lCleared!§r §8All treasure markers removed.§r");
                          }catch{}
                          return;
                        }
                        
                        // Back button
                        if (idx === markerLabels.length - 1){ catForm.show(player); return; }
                        
                        const marker = markersWithDistance[idx]; if(!marker) return;
                        
                        // Teleport to marker
                        try{ const d2=world.getDimension(marker.dim); await player.teleport({x:marker.x+0.5,y:marker.y+0.5,z:marker.z+0.5}, { dimension: d2, checkForBlocks:true }); }catch{}
                        
                        // Show quick actions menu
                        const actionForm = new ActionFormData()
                          .title("§a§lTeleported!§r")
                          .body(`§6${marker.label}§r\n§8Location: ${marker.x}, ${marker.y}, ${marker.z}§r`)
                          .button("🔄 Teleport to Another Marker")
                          .button("§c✖ Delete This Marker")
                          .button("✓ Done");
                        
                        actionForm.show(player).then(actRes=>{
                          if(!actRes||actRes.canceled) return;
                          if(actRes.selection === 0){ markerForm.show(player); } // Teleport again
                          else if(actRes.selection === 1){
                            // Delete this marker
                            try{
                              MARKERS[player.name] = MARKERS[player.name].filter(m=> !(m.x===marker.x && m.y===marker.y && m.z===marker.z && m.label===marker.label));
                              const s = JSON.stringify(MARKERS||{});
                              world.setDynamicProperty?.("labs_treasure_markers", s.length>10000?s.slice(0,10000):s);
                              player.sendMessage("§a§lDeleted!§r §8Marker removed.§r");
                            }catch{}
                          }
                        }).catch(()=>{});
                      }).catch(()=>{});
                    }catch{}
                    return;
                  }
                  
                  const selectedType = categoryKeys[selectedIdx];
                  const botsInCategory = grouped[selectedType] || [];
                  if (!botsInCategory.length) return;
                  
                  // Show bots in this category with distance
                  const pLoc = player.location;
                  const botsWithDistance = botsInCategory.map(en=>{
                    const dist = Math.sqrt((en.x - pLoc.x)**2 + (en.y - pLoc.y)**2 + (en.z - pLoc.z)**2);
                    return { ...en, distance: Math.floor(dist) };
                  }).sort((a,b)=> a.distance - b.distance);
                  
                  const botLabels = botsWithDistance.map(en=>{
                    const dimColors = { "overworld": "§2", "nether": "§c", "the_end": "§5" };
                    const dimKey = dimNameToKey(en.dim);
                    const dimColor = dimColors[dimKey] || "§8";
                    const cat = botCategories[selectedType] || { icon: "🤖" };
                    return `${cat.icon} Bot §0[${en.distance}m]§r ${dimColor}●§r ${dimKey}`;
                  });
                  botLabels.push("§6§l◄ Back to Categories§r");
                  
                  const botForm = new ModalFormData().title(`${botCategories[selectedType]?.color || "§8"}${botCategories[selectedType]?.icon || "🤖"} ${botCategories[selectedType]?.label || "Bots"}§r`).dropdown("Select bot:", botLabels, 0);
                  botForm.show(player).then(async botRes=>{
                    if(!botRes||botRes.canceled) return;
                    const idx = botRes.formValues?.[0]||0;
                    if (idx === botLabels.length - 1){ catForm.show(player); return; } // Back
                    const en = botsWithDistance[idx]; if(!en) return;
                    
                    // Teleport to bot
                    try{ const dkey=dimNameToKey(en.dim); const d2=world.getDimension(dkey); await player.teleport({x:en.x+0.5,y:en.y+0.5,z:en.z+0.5}, { dimension: d2, checkForBlocks:true }); }catch{}
                    
                    // Show quick actions menu
                    const actionForm = new ActionFormData()
                      .title("§a§lTeleported!§r")
                      .body(`§8Location: ${en.x}, ${en.y}, ${en.z} (${dimNameToKey(en.dim)})§r`)
                      .button("🔄 Teleport to Another Bot")
                      .button("📦 Retrieve This Bot")
                      .button("📍 Mark Location")
                      .button("✓ Done");
                    
                    actionForm.show(player).then(actRes=>{
                      if(!actRes||actRes.canceled) return;
                      if(actRes.selection === 0){ catForm.show(player); } // Teleport again
                      else if(actRes.selection === 1){ 
                        // Retrieve bot - show confirmation in next iteration
                        player.sendMessage("§6[Feature] Retrieve bot function - check nearby for your bot's egg§r");
                      }
                      else if(actRes.selection === 2){
                        // Mark location with beacon tower
                        try{
                          const d2=world.getDimension(dimNameToKey(en.dim));
                          for(let i=0;i<5;i++){
                            try{ d2.getBlock({x:en.x,y:en.y+i,z:en.z})?.setType("minecraft:gold_block"); }catch{}
                          }
                          try{ d2.getBlock({x:en.x,y:en.y+5,z:en.z})?.setType("minecraft:beacon"); }catch{}
                          player.sendMessage(`§a§lMarked!§r §8Gold beacon placed at ${en.x}, ${en.y}, ${en.z}§r`);
                        }catch{}
                      }
                    }).catch(()=>{});
                  }).catch(()=>{});
                }).catch(()=>{});
                }catch{}
                } else if (idx===11){
                // My Structures — list saved structures, with optional Clear
                try{
                const raw=world.getDynamicProperty?.("labs_struct_index");
                const IDX = raw && typeof raw==='string' ? JSON.parse(raw) : {};
                const mine = Array.isArray(IDX[player.name]) ? IDX[player.name] : [];
                if (!mine.length){ try{ player.sendMessage("You have no saved structures."); }catch{} }
                else {
                try{
                  player.sendMessage(`You have ${mine.length} saved structures:`);
                  for (const it of mine){ const s=it.size; const dims=s?` (${s.dx}x${s.dy}x${s.dz})`:''; player.sendMessage(`- ${it.name}${dims}`); }
                }catch{}
                // Prompt to clear
                try{
                  const af = new ActionFormData().title("My Structures").body("Do you want to clear your saved structure index?").button("Clear My Structures").button("Close");
                  af.show(player).then(res=>{
                    if (!res || res.canceled) return;
                    if (res.selection===0){
                      try{
                        IDX[player.name] = [];
                        const s = JSON.stringify(IDX||{});
                        world.setDynamicProperty?.("labs_struct_index", s.length>7900?s.slice(0,7900):s);
                        player.sendMessage("Cleared your saved structures list.");
                      }catch{}
                    }
                  }).catch(()=>{});
                }catch{}
                }
                }catch{}
                
            } else if (idx===15){
              // OP Tools (Admin)
              try { if (!player.hasTag || !player.hasTag("labs_admin")) { player.sendMessage("OP only. /tag @s add labs_admin"); return; } } catch {}
              // Ensure objectives exist so edits apply
              try{ dim.runCommandAsync("scoreboard objectives add lenycoins dummy LenyCoins"); }catch{}
              try{ dim.runCommandAsync("scoreboard objectives add karma dummy Karma"); }catch{}
              const p=player;
                  const players=world.getPlayers(); const names=players.map(pl=>pl.name);
                  const mf=new ModalFormData().title("OP Menu").dropdown("Player", names, 0).textField("LenyCoins +/-", "e.g. +100 or -50", "").textField("Karma +/-", "e.g. +50 or -25", "");
                  mf.show(p).then(async fr=>{
                    if(!fr||fr.canceled) return; const idxp=fr.formValues?.[0]||0; const target=players[idxp]; if(!target) return;
                    const coinsRaw=String(fr.formValues?.[1]||"").trim(); const karmaRaw=String(fr.formValues?.[2]||"").trim();
                    const applyDelta= async (label,raw,objective)=>{ if(!raw) return; const sign=raw.startsWith("-")?"remove":"add"; const amt=Math.abs(parseInt(raw)); if(!amt) return; try{ await dim.runCommandAsync(`scoreboard players ${sign} \"${target.name}\" ${objective} ${amt}`); }catch{} };
                    await applyDelta("coins", coinsRaw, "lenycoins"); await applyDelta("karma", karmaRaw, "karma");
                    // Show new balances
                    try{
                      const r1 = await dim.runCommandAsync(`scoreboard players get \"${target.name}\" lenycoins`);
                      const r2 = await dim.runCommandAsync(`scoreboard players get \"${target.name}\" karma`);
                      const num1 = String(r1?.statusMessage||"").match(/-?\d+/)?.[0];
                      const num2 = String(r2?.statusMessage||"").match(/-?\d+/)?.[0];
                      p.sendMessage(`Applied. ${target.name} — LenyCoins: ${num1??"(n/a)"}, Karma: ${num2??"(n/a)"}`);
                    }catch{}
                    // Full OP Tools submenu
                    const af=new ActionFormData().title("OP Tools").body(`Target: ${target.name}`)
                    .button("Force Justice")
                    .button("Reset Justice Cooldown")
                    .button("Give Bot Eggs")
                    .button("Enable/Disable Bots")
                    .button("Reset All Justice Cooldowns")
                    .button("Play Music (OP)")
                    .button("Golem March (OP)")
                    .button("Creeper Love Fest (OP)")
                    .button("Trigger 'The End is Waiting' (OP)")
                    .button("Eugene: Lava (OP)")
                    .button("Eugene: Talk (OP)")
                    .button("Eugene: Nether (OP)")
                        .button("Lava Chicken Stand (OP)")
                        .button("Trigger 'Chicken Storm' (OP)")
                        .button("Close");
                    af.show(p).then(ar=>{
                    if(!ar||ar.canceled) return;
                       if (ar.selection===0){
                        try{ world.sendMessage(`${target.name} has invoked the Wrath of the Justice Bot, may the Minecraft gods have mercy on your pickles!`); }catch{}
                        try{ world.getDimension("overworld").runCommandAsync("playsound ambient.weather.thunder @a"); }catch{}
                        system.runTimeout(()=>{
                          try{ world.getDimension("overworld").runCommandAsync("playsound ambient.weather.thunder @a"); }catch{}
                          try{ target.dimension.runCommandAsync(`summon lightning_bolt ${Math.floor(target.location.x)} ${Math.floor(target.location.y)} ${Math.floor(target.location.z)}`); }catch{}
                          system.runTimeout(()=>{
                            try{ world.getDimension("overworld").runCommandAsync("playsound ambient.weather.thunder @a"); }catch{}
                            system.runTimeout(()=>{ try{ world.getDimension("overworld").runCommandAsync("playsound ambient.weather.thunder @a"); }catch{} }, 10);
                            system.runTimeout(()=>{ try{ world.getDimension("overworld").runCommandAsync("playsound ambient.weather.thunder @a"); }catch{} }, 20);
                            system.runTimeout(()=>{
                              try{ target.addTag?.("labs_justice_victim"); }catch{}
                              try{ target.dimension.runCommandAsync(`summon myname:justice_bot ${Math.floor(target.location.x)} ${Math.floor(target.location.y)} ${Math.floor(target.location.z)}`); }catch{}
                            }, 25);
                          }, 40);
                        }, 100);
                      } else if (ar.selection===1){
                        try{ const tags=target.getTags?.()||[]; for(const t of tags){ if(String(t).startsWith("labs_justice_cd:")) try{ target.removeTag(t); }catch{} } p.sendMessage(`Justice cooldown reset for ${target.name}.`); }catch{}
                      } else if (ar.selection===2){
                        const eggs=ALL_BOT_EGGS.filter(id=>!BANNED.has(id.replace("_spawn_egg","")));
                        const labels=eggs.map(eggLabelFromId);
                        labels.push("§6§lBiome Bomb§r");
                        const ef=new ModalFormData().title("Give Bot Eggs & Special Items").dropdown("Item", labels, 0).textField("Amount", "e.g. 1-64", "1");
                        ef.show(p).then(er=>{
                          if(!er||er.canceled) return; const ei=er.formValues?.[0]||0; const amt=Math.max(1, Math.min(64, Math.floor(Number(er.formValues?.[1]||1))));
                          const itemId = ei === labels.length - 1 ? "myname:biome_bomb" : eggs[ei];
                          try{ const inv=target.getComponent("inventory")?.container; const leftover=inv?.addItem?.(new ItemStack(itemId, amt)); if(leftover) target.dimension.spawnItem(leftover, target.location); p.sendMessage(`Gave ${amt} ${itemId} to ${target.name}.`); }catch{}
                        }).catch(()=>{});
                      } else if (ar.selection===3){
                       // Enable/Disable Bots
                       try{
                          const TYPES=["myname:miner_bot","myname:constructor_bot","myname:fisher_bot","myname:shroom_bot","myname:farmer_bot","myname:beekeeper_bot","myname:treasure_bot","myname:storekeeper_bot","myname:butler_bot","myname:smelter_bot","myname:redstone_bot","myname:control_bot","myname:portal_bot","myname:trash_bot"]; 
                          const labels=TYPES.map(t=> t.split(":")[1].replace(/_/g," "));
                          const form=new ModalFormData().title("Enable/Disable Bots");
                          const enabled=TYPES.map(t=> !BANNED.has(t));
                          for(let i=0;i<TYPES.length;i++){ form.toggle(labels[i], enabled[i]); }
                          form.show(p).then(fr2=>{
                            if(!fr2||fr2.canceled) return; const vals=fr2.formValues||[];
                            for(let i=0;i<TYPES.length;i++){ setBotEnabled(TYPES[i], !!vals[i]); }
                            try{ p.sendMessage("Bot enable/disable settings updated."); }catch{}
                          }).catch(()=>{});
                        }catch{} 
                       } else if (ar.selection===4){
                       try{ for(const pl of world.getPlayers()){ const tags=pl.getTags?.()||[]; for(const t of tags){ if(String(t).startsWith("labs_justice_cd:")) try{ pl.removeTag(t); }catch{} } } p.sendMessage("Justice cooldowns reset for all players."); }catch{}
                       } else if (ar.selection===999){
                        // (unused)
                      } else if (ar.selection===4){
                        // Play Music (OP)
                        const SONGS=[
                        {id:"labs.end_is_waiting", label:"The End is Waiting (custom)"},
                        {id:"labs.fisher_song", label:"Fisher Song (custom)"},
                        {id:"labs.miner_song", label:"Miner Song (custom)"},
                        {id:"labs.beekeeper_song", label:"Beekeeper Song (custom)"},
                        {id:"labs.butler_song", label:"Butler Song (custom)"},
                        {id:"labs.justice_march", label:"Justice March (custom)"},
                        {id:"labs.shroom_song", label:"Shroom Song (custom)"},
                        {id:"labs.smelter_song", label:"Smelter Song (custom)"},
                        {id:"labs.party_song", label:"Party Song (custom)"},
                        {id:"labs.creeper_song", label:"Creeper Serenade (custom)"},
                        {id:"labs.iron_golems", label:"Golem March (custom)"},
                          {id:"labs.chicken_storm", label:"Chicken Storm (custom)"},
                          {id:"labs.piglin_congo", label:"Piglin Congo (custom)"},
                          {id:"labs.trash_bot_song", label:"Trash Bot Song (custom)"},
                          {id:"record.pigstep", label:"Pigstep (vanilla)"},
                          {id:"record.otherside", label:"Otherside (vanilla)"},
                          {id:"record.relic", label:"Relic (vanilla)"}
                        ];
                        const mf2=new ModalFormData().title("Play Music")
                          .dropdown("Song", SONGS.map(s=>s.label), 0)
                        .slider("Volume", 0, 2, 0.1, 1.0);
                        mf2.show(p).then(fr2=>{
                          if(!fr2||fr2.canceled) return; const idxSel=fr2.formValues?.[0]||0; const s=SONGS[idxSel]; if(!s) return;
                           const volRaw = Number(fr2.formValues?.[1]); const vol = Number.isFinite(volRaw) ? Math.max(0, Math.min(2, volRaw)) : 1;
                           try{ const x=Math.floor(p.location.x), y=Math.floor(p.location.y), z=Math.floor(p.location.z); p.dimension.runCommandAsync(`playsound ${s.id} @a ${x} ${y} ${z} ${vol} 1 0`); }catch{}
                         }).catch(()=>{});
                      } else if (ar.selection===5){
                        // Golem March (Village)
                      try{
                      if (!globalThis.LABS_startGolemMarch || !globalThis.LABS_startGolemMarch(target, /*force*/true)){
                      p.sendMessage?.("Could not start Golem March for target.");
                      } else {
                      p.sendMessage?.(`Started Golem March for ${target.name}.`);
                      }
                      }catch{}
                      } else if (ar.selection===6){
                      // Creeper Love Fest
                      try{
                        if (globalThis.LABS_startCreeperSerenade && globalThis.LABS_startCreeperSerenade(target, /*force*/true)){
                        p.sendMessage?.(`Started Creeper Love Fest for ${target.name}.`);
                      } else {
                      p.sendMessage?.("Could not start Creeper Love Fest for target.");
                      }
                      }catch{}
                      } else if (ar.selection===7){
                      try{ triggerEndIsWaiting(target); p.sendMessage("Triggered 'The End is Waiting'."); }catch{}
                      } else if (ar.selection===8){
                      try{ if (globalThis.LABS_startEugeneLava && globalThis.LABS_startEugeneLava(target)) { p.sendMessage?.(`Started Eugene (Lava) for ${target.name}.`); } else { p.sendMessage?.("Could not start Eugene (Lava) for target."); } }catch{}
                      } else if (ar.selection===9){
                      try{ if (globalThis.LABS_startEugeneTalk && globalThis.LABS_startEugeneTalk(target)) { p.sendMessage?.(`Started Eugene (Talk) for ${target.name}.`); } else { p.sendMessage?.("Could not start Eugene (Talk) for target."); } }catch{}
                      } else if (ar.selection===10){
                      // Eugene: Nether (OP)
                      try{ if (globalThis.LABS_startEugeneNether && globalThis.LABS_startEugeneNether(target)) { p.sendMessage?.(`Started Eugene (Nether) for ${target.name}.`); } else { p.sendMessage?.("Could not start Eugene (Nether) for target."); } }catch{}
                      } else if (ar.selection===11){
                      // Lava Chicken Stand (OP)
                      try{ if (globalThis.LABS_placeLavaChickenStand) { globalThis.LABS_placeLavaChickenStand(player); } else { player.sendMessage?.("Structure tool not loaded yet."); } }catch{}
                      } else if (ar.selection===12){
                      // Trigger Chicken Storm (OP)
                       try{ triggerChickenStorm(target); p.sendMessage("Triggered 'Chicken Storm'."); }catch{}
                       } else if (ar.selection===13){
                                     // Close
                                return;
                              }
                     }).catch(()=>{});
                  }).catch(()=>{});
                }
                }).catch(()=>{});
      }, 0);
    } catch {}
  };
} catch {}

import "./scripts/gunna_fishing.js";
import "./scripts/miner_bot.js";
import "./scripts/constructor_bot.js";
import "./scripts/redstone_bot.js";
import "./scripts/portal_bot.js";
import "./scripts/shroom_bot.js";
import "./scripts/farmer_bot.js";
import "./scripts/beekeeper_bot.js";
import "./scripts/treasure_bot.js";

import "./scripts/chef_bot.js";
import "./scripts/butler_bot.js";

import "./scripts/smelter_bot.js";
import "./scripts/fisher_song.js";
import "./scripts/justice_bot.js";
import "./scripts/party_bot.js";
import "./scripts/creeper_event.js";
import "./scripts/iron_golem_event.js";
import "./scripts/eugene_event_new.js";
import KARMA_RULES from "./config/karma_rules.js";
import "./scripts/structure_tools.js";
import "./scripts/eugene_notes.js";
import "./scripts/eugene_nether_event.js";

// --- Karma earn/penalty hooks ---
try{
  // Per-player minute cap tracking
  const KARMA_MINUTE = new Map(); // name -> { sum:number, resetAt:number }
  const nowSec = ()=> Math.floor(Date.now()/1000);
  function grantKarma(p, amt){
    try{
      if (!p) return;
      const cap = Number(KARMA_RULES?.caps?.perMinuteMax||0) | 0;
      if (cap>0){
        const key=p.name; const now=nowSec();
        let st=KARMA_MINUTE.get(key)||{sum:0,resetAt:now+60};
        if (now >= st.resetAt){ st={sum:0,resetAt:now+60}; }
        const can = Math.max(0, cap - st.sum);
        const give = Math.max(0, Math.min(can, amt));
        if (give<=0){ KARMA_MINUTE.set(key, st); return; }
        st.sum += give; KARMA_MINUTE.set(key, st);
        p.runCommandAsync(`scoreboard players add "${p.name}" karma ${give}`);
      } else {
        p.runCommandAsync(`scoreboard players add "${p.name}" karma ${amt}`);
      }
    }catch{}
  }
  // Feeding animals - detect ANY interaction with breedable animals
  world.afterEvents.playerInteractWithEntity.subscribe(ev=>{
    try{
      const p=ev.player; const t=ev.target; if(!p||!t) return;
      const id=String(t?.typeId||"");
      
      // Check if target is a breedable animal
      const breedableTypes = [
        "minecraft:cow", "minecraft:sheep", "minecraft:pig", "minecraft:chicken",
        "minecraft:rabbit", "minecraft:horse", "minecraft:donkey", "minecraft:mule",
        "minecraft:llama", "minecraft:goat", "minecraft:mooshroom", "minecraft:hoglin",
        "minecraft:strider", "minecraft:axolotl", "minecraft:bee", "minecraft:panda",
        "minecraft:fox", "minecraft:turtle", "minecraft:camel", "minecraft:sniffer"
      ];
      
      if (breedableTypes.includes(id)) {
        const baseAmt=Number(KARMA_RULES?.earn?.feed?.amount||20)|0; 
        if (baseAmt>0) {
          const finalAmt = globalThis.LABS_applyKarmaMultiplier ? globalThis.LABS_applyKarmaMultiplier(baseAmt) : baseAmt;
          grantKarma(p, finalAmt);
          try{ p.sendMessage(`§a+${finalAmt} Karma§r (fed ${id.replace("minecraft:", "")})`); }catch{}
        }
      }
    }catch(e){ console.warn("Karma feed error:", e); }
  });
  // Breeding animals - detect baby animal spawns
  world.afterEvents.entitySpawn.subscribe(ev=>{
    try{
      const baby=ev.entity; if(!baby) return;
      const id=String(baby?.typeId||"");
      
      // Check if it's a breedable animal type
      const breedableTypes = [
        "minecraft:cow", "minecraft:sheep", "minecraft:pig", "minecraft:chicken",
        "minecraft:rabbit", "minecraft:horse", "minecraft:donkey", "minecraft:mule",
        "minecraft:llama", "minecraft:goat", "minecraft:mooshroom", "minecraft:hoglin",
        "minecraft:strider", "minecraft:axolotl", "minecraft:bee", "minecraft:panda",
        "minecraft:fox", "minecraft:turtle", "minecraft:camel", "minecraft:sniffer"
      ];
      
      if(!breedableTypes.includes(id)) return;
      
      // Check if it's a baby (use setTimeout to let entity fully spawn)
      system.runTimeout(()=>{
        try{
          const isBaby = baby.isBaby?.() || baby.getComponent?.("minecraft:is_baby");
          if(!isBaby) return;
          
          // Find closest player within 16 blocks
          const players=world.getAllPlayers?.() || world.getPlayers?.() || [];
          let closest=null; let minDist=16;
          for(const p of players){
            if(p.dimension.id !== baby.dimension.id) continue;
            const dx=p.location.x-baby.location.x;
            const dy=p.location.y-baby.location.y;
            const dz=p.location.z-baby.location.z;
            const dist=Math.sqrt(dx*dx+dy*dy+dz*dz);
            if(dist<minDist){ minDist=dist; closest=p; }
          }
          if(closest){
            const baseAmt=Number(KARMA_RULES?.earn?.breed?.amount||50)|0;
            if(baseAmt>0){
              const finalAmt = globalThis.LABS_applyKarmaMultiplier ? globalThis.LABS_applyKarmaMultiplier(baseAmt) : baseAmt;
              grantKarma(closest, finalAmt);
              try{ closest.sendMessage(`§a+${finalAmt} Karma§r (bred ${id.replace("minecraft:", "")})`); }catch{}
            }
          }
        }catch(e){ console.warn("Karma breed baby check error:", e); }
      }, 10);
    }catch(e){ console.warn("Karma breed error:", e); }
  });
  // Taming wolves/dogs
  world.afterEvents.entitySpawn.subscribe(ev=>{
    try{
      const entity=ev.entity; if(!entity) return;
      const id=String(entity?.typeId||"");
      if(id!=="minecraft:wolf") return;
      const tameable=entity.getComponent?.("minecraft:tameable");
      if(!tameable) return;
      system.runTimeout(()=>{
        try{
          const isTamed=tameable.isTamed?.() || tameable.isTame?.() || false;
          if(!isTamed) return;
          const owner=tameable.tamedToPlayer?.() || tameable.tamedToPlayerId?.();
          if(!owner) return;
          const players=world.getAllPlayers?.() || world.getPlayers?.() || [];
          const p=players.find(pl=>pl.id===owner || pl.name===owner);
          if(p){
            const baseAmt=Number(KARMA_RULES?.earn?.tame?.amount||200)|0;
            if(baseAmt>0) {
              const finalAmt = globalThis.LABS_applyKarmaMultiplier ? globalThis.LABS_applyKarmaMultiplier(baseAmt) : baseAmt;
              grantKarma(p, finalAmt);
            }
          }
        }catch{}
      }, 5);
    }catch{}
  });
  // Penalties on kill
  world.afterEvents.entityDie.subscribe(ev=>{
    try{
      const dead=ev.deadEntity; if(!dead) return;
      const killer=ev.damageSource?.damagingEntity; if (!killer||killer.typeId!=="minecraft:player") return;
      const pen = Number((KARMA_RULES?.penalties||{})[String(dead.typeId)||""]||0)|0;
      if (pen<0){ try{ killer.runCommandAsync(`scoreboard players add "${killer.name}" karma ${pen}`); }catch{} }
    }catch{}
  });
} catch {}


try {
  world.beforeEvents.chatSend.subscribe(ev => { return; /* chat commands removed; use stick menu */
    const raw = (ev.message||"").trim();
    const msg = raw.toLowerCase();
    const cmd = msg.startsWith("!") || msg.startsWith("/") ? msg.slice(1) : msg;
    const dim = world.getDimension("overworld");
    if (cmd === "labs") {
      ev.cancel = true;
      try {
        const showOpTools = (player)=>{
          try { if (!player.hasTag || !player.hasTag("labs_admin")) { player.sendMessage("OP only. /tag @s add labs_admin"); return; } } catch {}
          const dim = world.getDimension("overworld");
          const players=world.getPlayers(); const names=players.map(pl=>pl.name);
          const mf=new ModalFormData().title("OP Menu").dropdown("Player", names, 0).textField("LenyCoins +/-", "e.g. +100 or -50", "").textField("Karma +/-", "e.g. +50 or -25", "");
          mf.show(player).then(fr=>{
            if(!fr||fr.canceled) return; const idxp=fr.formValues?.[0]||0; const target=players[idxp]; if(!target) return;
            const coinsRaw=String(fr.formValues?.[1]||"").trim(); const karmaRaw=String(fr.formValues?.[2]||"").trim();
            const applyDelta=(label,raw,objective)=>{ if(!raw) return; const sign=raw.startsWith("-")?"remove":"add"; const amt=Math.abs(parseInt(raw)); if(!amt) return; try{ dim.runCommandAsync(`scoreboard players ${sign} \"${target.name}\" ${objective} ${amt}`); }catch{} };
            applyDelta("coins", coinsRaw, "lenycoins"); applyDelta("karma", karmaRaw, "karma");
            try{ player.sendMessage(`Applied changes to ${target.name}.`); }catch{}
            const af=new ActionFormData().title("OP Tools").body(`Target: ${target.name}`)
            .button("Force Justice")
            .button("Reset Justice Cooldown")
            .button("Give Bot Eggs")
            .button("Reset All Justice Cooldowns")
            .button("Play Music (OP)")
            .button("Golem March (OP)")
            .button("Creeper Love Fest (OP)")
            .button("Trigger 'The End is Waiting' (OP)")
            .button("Eugene: Lava (OP)")
            .button("Eugene: Talk (OP)")
               .button("Close");
            af.show(player).then(ar=>{
              if(!ar||ar.canceled) return;
              if (ar.selection===0){
                const seq = ()=>{
                  try{ world.sendMessage(`${target.name} has invoked the Wrath of the Justice Bot, may the Minecraft gods have mercy on your pickles!`); }catch{}
                  try{ world.getDimension("overworld").runCommandAsync("playsound ambient.weather.thunder @a"); }catch{}
                  system.runTimeout(()=>{
                    try{ world.getDimension("overworld").runCommandAsync("playsound ambient.weather.thunder @a"); }catch{}
                    try{ target.dimension.runCommandAsync(`summon lightning_bolt ${Math.floor(target.location.x)} ${Math.floor(target.location.y)} ${Math.floor(target.location.z)}`); }catch{}
                    system.runTimeout(()=>{
                      try{ world.getDimension("overworld").runCommandAsync("playsound ambient.weather.thunder @a"); }catch{}
                      system.runTimeout(()=>{ try{ world.getDimension("overworld").runCommandAsync("playsound ambient.weather.thunder @a"); }catch{} }, 10);
                      system.runTimeout(()=>{ try{ world.getDimension("overworld").runCommandAsync("playsound ambient.weather.thunder @a"); }catch{} }, 20);
                      system.runTimeout(()=>{
                        try{ target.addTag?.("labs_justice_victim"); }catch{}
                        try{ target.dimension.runCommandAsync(`summon myname:justice_bot ${Math.floor(target.location.x)} ${Math.floor(target.location.y)} ${Math.floor(target.location.z)}`); }catch{}
                      }, 25);
                    }, 40);
                  }, 100);
                };
                try{ world.getDimension("overworld").runCommandAsync("playsound labs.justice_march @a"); }catch{}
                system.runTimeout(()=>{ seq(); }, 4800);
              } else if (ar.selection===1){
                try{ const tags=target.getTags?.()||[]; for(const t of tags){ if(String(t).startsWith("labs_justice_cd:")) try{ target.removeTag(t); }catch{} } player.sendMessage(`Justice cooldown reset for ${target.name}.`); }catch{}
              } else if (ar.selection===2){
                const eggs=["myname:miner_bot_spawn_egg","myname:constructor_bot_spawn_egg","myname:fisher_bot_spawn_egg","myname:shroom_bot_spawn_egg","myname:farmer_bot_spawn_egg","myname:beekeeper_bot_spawn_egg","myname:treasure_bot_spawn_egg","myname:storekeeper_bot_spawn_egg","myname:butler_bot_spawn_egg","myname:smelter_bot_spawn_egg","myname:redstone_bot_spawn_egg","myname:control_bot_spawn_egg","myname:portal_bot_spawn_egg","myname:party_bot_spawn_egg","myname:trash_bot_spawn_egg"].filter(id=>!BANNED.has(id.replace("_spawn_egg","")));
                eggs.push("myname:biome_bomb");
                const ef=new ModalFormData().title("Give Bot Eggs & Special Items").dropdown("Item", eggs, 0).textField("Amount", "e.g. 1-64", "1");
                ef.show(player).then(er=>{
                  if(!er||er.canceled) return; const ei=er.formValues?.[0]||0; const amt=Math.max(1, Math.min(64, Math.floor(Number(er.formValues?.[1]||1))));
                  try{ const inv=target.getComponent("inventory")?.container; const leftover=inv?.addItem?.(new ItemStack(eggs[ei], amt)); if(leftover) target.dimension.spawnItem(leftover, target.location); player.sendMessage(`Gave ${amt} ${eggs[ei]} to ${target.name}.`); }catch{}
                }).catch(()=>{});
              } else if (ar.selection===3){
                // Reset All Justice Cooldowns
                try{ for(const pl of world.getPlayers()){ const tags=pl.getTags?.()||[]; for(const t of tags){ if(String(t).startsWith("labs_justice_cd:")) try{ pl.removeTag(t); }catch{} } } player.sendMessage("Justice cooldowns reset for all players."); }catch{}
              } else if (ar.selection===4){
                try{ for(const pl of world.getPlayers()){ const tags=pl.getTags?.()||[]; for(const t of tags){ if(String(t).startsWith("labs_justice_cd:")) try{ pl.removeTag(t); }catch{} } } player.sendMessage("Justice cooldowns reset for all players."); }catch{}
              }
            }).catch(()=>{});
          }).catch(()=>{});
        };
        // Main menu for !labs
        const showLabsMenu = (player)=>{
          try{
            const dim = world.getDimension("overworld");
            const form = new ActionFormData().title("LABS").body("Choose an option:")
              .button("About")
              .button("Send Feedback")
              .button("View Inbox")
              .button("Clear Inbox")
              .button("Get LABS Manual")
              .button("Get My Bots")
              .button("Teleport to My Bots");
            system.runTimeout(()=>{
              form.show(player).then(res=>{
                if (!res || res.canceled) return;
                const idx = res.selection;
                if (idx===0){ try{ if (globalThis.LABS_openManual){ LABS_openManual(player); return; } }catch{}
                  // Your location (prominent)
                  try{
                    const loc={x:Math.floor(player.location.x),y:Math.floor(player.location.y),z:Math.floor(player.location.z)};
                    const dm=dimNameToKey(player.dimension?.id);
                    try{ player.onScreenDisplay.setTitle(`Your Location: ${loc.x},${loc.y},${loc.z} (${dm})`); }catch{}
                    player.sendMessage(`Your Location: ${loc.x},${loc.y},${loc.z} (${dm})`);
                  }catch{}
                  // Show locations (registry, cross-dimension)
                  try{
                    loadBotReg();
                    const entries = (BOT_REG[player.name]||[]);
                    if (!entries.length){ player.sendMessage("You have no registered bots yet."); }
                    else {
                      player.sendMessage("Your bots and locations:");
                      for (const en of entries){
                        const nm=String(en.type||"").split(":")[1]?.replace(/_/g," ")||"bot";
                        const dm=dimNameToKey(en.dim);
                        player.sendMessage(`- ${nm} @ ${en.x},${en.y},${en.z} (${dm})`);
                      }
                    }
                  }catch{}
                } else if (idx===1){
                  const mf = new ModalFormData().title("Send Feedback").textField("Message", "type here", "");
                  mf.show(player).then(fr=>{
                    if (!fr || fr.canceled) return;
                    const body = String(fr.formValues?.[0]||"").trim();
                    if (!body) { try { player.sendMessage("Empty message ignored."); } catch {} ; return; }
                    const when = new Date().toISOString();
                    try { console.warn?.(`[LABS FEEDBACK] ${when} <${player.name}> ${body}`); } catch {}
                    const arr = loadFeedback(); arr.push({ t: when, p: player.name, m: body }); while(arr.length>50) arr.shift(); saveFeedback(arr);
                    try { player.sendMessage("Thanks! Feedback recorded."); } catch {}
                  }).catch(()=>{});
                } else if (idx===2){
                  const arr = loadFeedback(); const last10 = arr.slice(-10);
                  if (!last10.length){ try { player.sendMessage("Inbox is empty."); } catch {} ; return; }
                  try { player.sendMessage(`Inbox: showing ${last10.length}/${arr.length}`); for (const it of last10){ player.sendMessage(`- [${it.t}] <${it.p}> ${it.m}`); } } catch {}
                } else if (idx===3){
                  try { if (!player.hasTag || !player.hasTag("labs_admin")) { player.sendMessage("You need tag 'labs_admin' to clear. /tag @s add labs_admin"); return; } } catch {}
                  saveFeedback([]);
                  try { player.sendMessage("Inbox cleared."); } catch {}
                } else if (idx===4){
                  // OP menu
                  try { if (!player.hasTag || !player.hasTag("labs_admin")) { player.sendMessage("OP only. /tag @s add labs_admin"); return; } } catch {}
                  // Ensure objectives exist so edits apply
                  try{ dim.runCommandAsync("scoreboard objectives add lenycoins dummy LenyCoins"); }catch{}
                  try{ dim.runCommandAsync("scoreboard objectives add karma dummy Karma"); }catch{}
                  const p=player;
                  const players=world.getPlayers(); const names=players.map(pl=>pl.name);
                  const mf=new ModalFormData().title("OP Menu").dropdown("Player", names, 0).textField("LenyCoins +/-", "e.g. +100 or -50", "").textField("Karma +/-", "e.g. +50 or -25", "");
                  mf.show(p).then(async fr=>{
                    if(!fr||fr.canceled) return; const idxp=fr.formValues?.[0]||0; const target=players[idxp]; if(!target) return;
                    const coinsRaw=String(fr.formValues?.[1]||"").trim(); const karmaRaw=String(fr.formValues?.[2]||"").trim();
                    const applyDelta=(label,raw,objective)=>{ if(!raw) return; const sign=raw.startsWith("-")?"remove":"add"; const amt=Math.abs(parseInt(raw)); if(!amt) return; try{ dim.runCommandAsync(`scoreboard players ${sign} \"${target.name}\" ${objective} ${amt}`); }catch{} };
                    applyDelta("coins", coinsRaw, "lenycoins"); applyDelta("karma", karmaRaw, "karma");
                    try{ p.sendMessage(`Applied changes to ${target.name}.`); }catch{}
                    const af=new ActionFormData().title("OP Tools").body(`Target: ${target.name}`)
                      .button("Force Justice")
                      .button("Reset Justice Cooldown")
                      .button("Give Bot Eggs")
                      .button("Reset All Justice Cooldowns")
                      .button("Play Music (OP)")
                      .button("Close");
                    af.show(p).then(ar=>{
                      if(!ar||ar.canceled) return;
                      if (ar.selection===0){
                        try{ world.sendMessage(`${target.name} has invoked the Wrath of the Justice Bot, may the Minecraft gods have mercy on your pickles!`); }catch{}
                        try{ world.getDimension("overworld").runCommandAsync("playsound ambient.weather.thunder @a"); }catch{}
                        system.runTimeout(()=>{
                          try{ world.getDimension("overworld").runCommandAsync("playsound ambient.weather.thunder @a"); }catch{}
                          try{ target.dimension.runCommandAsync(`summon lightning_bolt ${Math.floor(target.location.x)} ${Math.floor(target.location.y)} ${Math.floor(target.location.z)}`); }catch{}
                          system.runTimeout(()=>{
                            try{ world.getDimension("overworld").runCommandAsync("playsound ambient.weather.thunder @a"); }catch{}
                            system.runTimeout(()=>{ try{ world.getDimension("overworld").runCommandAsync("playsound ambient.weather.thunder @a"); }catch{} }, 10);
                            system.runTimeout(()=>{ try{ world.getDimension("overworld").runCommandAsync("playsound ambient.weather.thunder @a"); }catch{} }, 20);
                            system.runTimeout(()=>{
                              try{ target.addTag?.("labs_justice_victim"); }catch{}
                              try{ target.dimension.runCommandAsync(`summon myname:justice_bot ${Math.floor(target.location.x)} ${Math.floor(target.location.y)} ${Math.floor(target.location.z)}`); }catch{}
                            }, 25);
                          }, 40);
                        }, 100);
                      } else if (ar.selection===1){
                        try{ const tags=target.getTags?.()||[]; for(const t of tags){ if(String(t).startsWith("labs_justice_cd:")) try{ target.removeTag(t); }catch{} } p.sendMessage(`Justice cooldown reset for ${target.name}.`); }catch{}
                      } else if (ar.selection===2){
                        const eggs=["myname:miner_bot_spawn_egg","myname:constructor_bot_spawn_egg","myname:fisher_bot_spawn_egg","myname:shroom_bot_spawn_egg","myname:farmer_bot_spawn_egg","myname:beekeeper_bot_spawn_egg","myname:treasure_bot_spawn_egg","myname:storekeeper_bot_spawn_egg","myname:butler_bot_spawn_egg","myname:smelter_bot_spawn_egg","myname:redstone_bot_spawn_egg","myname:control_bot_spawn_egg","myname:portal_bot_spawn_egg","myname:trash_bot_spawn_egg"].filter(id=>!BANNED.has(id.replace("_spawn_egg","")));
                        eggs.push("myname:biome_bomb");
                        const ef=new ModalFormData().title("Give Bot Eggs & Special Items").dropdown("Item", eggs, 0).textField("Amount", "e.g. 1-64", "1");
                        ef.show(p).then(er=>{
                          if(!er||er.canceled) return; const ei=er.formValues?.[0]||0; const amt=Math.max(1, Math.min(64, Math.floor(Number(er.formValues?.[1]||1))));
                          try{ const inv=target.getComponent("inventory")?.container; const leftover=inv?.addItem?.(new ItemStack(eggs[ei], amt)); if(leftover) target.dimension.spawnItem(leftover, target.location); p.sendMessage(`Gave ${amt} ${eggs[ei]} to ${target.name}.`); }catch{}
                        }).catch(()=>{});
                      } else if (ar.selection===3){
                        try{
                          const r=p.getRotation?.(); const yaw=(r&&typeof r.y==='number')?r.y:0; const rad=(yaw*Math.PI)/180; const dir={x:Math.round(-Math.sin(rad)), z:Math.round(Math.cos(rad))};
                          const dimP=p.dimension; const base={x:Math.floor(p.location.x)+dir.x*3, y:Math.floor(p.location.y), z:Math.floor(p.location.z)+dir.z*3};
                          const woods=["oak","spruce","birch","jungle","acacia","dark_oak","mangrove","cherry","bamboo"]; const wood=woods[Math.floor(Math.random()*woods.length)];
                          const pl=`minecraft:${wood}_planks`; const trap=`minecraft:${wood}_trapdoor`; const sign=`minecraft:jungle_wall_sign`;
                          for(let y=0;y<4;y++){
                            for(let dx=-1;dx<=1;dx++){
                              for(let dz=-1;dz<=1;dz++){
                                const wall=(Math.abs(dx)===1||Math.abs(dz)===1);
                                const pos={x:base.x+dx,y:base.y+y,z:base.z+dz};
                                try{
                                  if (wall){
                                    if (y===1 && dx===dir.x && dz===dir.z){ dimP.getBlock(pos)?.setType("minecraft:air"); try{ dimP.getBlock(pos)?.setType(trap); }catch{} }
                                    else dimP.getBlock(pos)?.setType(pl);
                                  } else {
                                    if (y===0) dimP.getBlock(pos)?.setType(pl); else dimP.getBlock(pos)?.setType("minecraft:air");
                                  }
                                }catch{}
                              }
                            }
                          }
                          const ry=base.y+4; const ring=[{x:-1,z:0},{x:1,z:0},{x:0,z:-1},{x:0,z:1}];
                          for(const r of ring){ try{ dimP.getBlock({x:base.x+r.x,y:ry,z:base.z+r.z})?.setType("minecraft:birch_stairs"); }catch{} }
                          try{ dimP.getBlock({x:base.x,y:ry,z:base.z})?.setType(pl); }catch{}
                          const sx=base.x+dir.x*2, sz=base.z+dir.z*2, sy=base.y+1;
                          try{ dimP.getBlock({x:sx,y:sy,z:sz})?.setType(sign); const sc=dimP.getBlock({x:sx,y:sy,z:sz})?.getComponent?.("minecraft:sign"); sc?.setText?.(0, `${p.name}'s Shop`); }catch{}
                          try{ dimP.getBlock({x:base.x,y:base.y+1,z:base.z})?.setType("minecraft:barrel"); }catch{}
                          try{ p.sendMessage("Spawned demo kiosk."); }catch{}
                        }catch{}
                      } else if (ar.selection===4){
                      try{ for(const pl of world.getPlayers()){ const tags=pl.getTags?.()||[]; for(const t of tags){ if(String(t).startsWith("labs_justice_cd:")) try{ pl.removeTag(t); }catch{} } } p.sendMessage("Justice cooldowns reset for all players."); }catch{}
                      } else if (ar.selection===5){
                          // Play Music (OP)
                 const SONGS=[
                 {id:"labs.end_is_waiting", label:"The End is Waiting (custom)"},
                 {id:"labs.fisher_song", label:"Fisher Song (custom)"},
                 {id:"labs.miner_song", label:"Miner Song (custom)"},
                 {id:"labs.beekeeper_song", label:"Beekeeper Song (custom)"},
                 {id:"labs.butler_song", label:"Butler Song (custom)"},
                 {id:"labs.justice_march", label:"Justice March (custom)"},
                 {id:"labs.shroom_song", label:"Shroom Song (custom)"},
                 {id:"labs.smelter_song", label:"Smelter Song (custom)"},
                 {id:"labs.party_song", label:"Party Song (custom)"},
                   {id:"labs.creeper_song", label:"Creeper Serenade (custom)"},
                  {id:"labs.iron_golems", label:"Golem March (custom)"},
                  {id:"labs.piglin_congo", label:"Piglin Congo (custom)"},
                  {id:"labs.trash_bot_song", label:"Trash Bot Song (custom)"},
                  {id:"record.pigstep", label:"Pigstep (vanilla)"},
                  {id:"record.otherside", label:"Otherside (vanilla)"},
                    {id:"record.relic", label:"Relic (vanilla)"}
                ];
                 const mf=new ModalFormData().title("Play Music").dropdown("Song", SONGS.map(s=>s.label), 0);
                 mf.show(p).then(async fr=>{
                   if(!fr||fr.canceled) return; const idx=fr.formValues?.[0]||0; const s=SONGS[idx]; if(!s) return;
                   try{ const x=Math.floor(p.location.x), y=Math.floor(p.location.y), z=Math.floor(p.location.z); p.dimension.runCommandAsync(`playsound ${s.id} @a ${x} ${y} ${z} 1 1 0`); }catch{}
                 }).catch(()=>{});
                 }
                 }).catch(()=>{});
                   }).catch(()=>{});
                } else if (idx===5){
                  // Get My Bots (short LABS menu)
                  try{
                    const dims=[world.getDimension("overworld"), world.getDimension("nether"), world.getDimension("the_end")].filter(Boolean);
                    const T=["myname:miner_bot","myname:constructor_bot","myname:fisher_bot","myname:shroom_bot","myname:farmer_bot","myname:beekeeper_bot","myname:treasure_bot","myname:storekeeper_bot","myname:chef_bot","myname:butler_bot","myname:smelter_bot","myname:redstone_bot","myname:trash_bot"].filter(id=>!BANNED.has(id));
                    const mine=[];
                    for(const d of dims){
                      for(const t of T){
                        try{
                          const arr=d.getEntities({type:t});
                          for(const e of arr){
                            let ok=false;
                            try{ const tags=e.getTags?.()||[]; const own=tags.find(tt=>String(tt).startsWith("labs_owner:")); if (own && own.endsWith(player.name)) ok=true; }catch{}
                            if (!ok && t==="myname:storekeeper_bot"){
                              try{ const tags=e.getTags?.()||[]; const sk=tags.find(tt=>String(tt).startsWith("sko|")); if (sk && sk.slice(4)===player.name) ok=true; }catch{}
                            }
                            if (ok){ const loc={x:Math.floor(e.location.x),y:Math.floor(e.location.y),z:Math.floor(e.location.z)}; const nm=t.split(":")[1].replace(/_/g," "); mine.push({e,label:`${nm} @ ${loc.x},${loc.y},${loc.z} (${d.id.split(":")[1]||d.id})`}); }
                          }
                        }catch{}
                      }
                    }
                    if (!mine.length){ try{ player.sendMessage("No owned bots found."); }catch{} return; }
                    const labels=mine.map(m=>m.label);
                    const mf=new ModalFormData().title("Get My Bots").dropdown("Choose bot to retrieve", labels, 0);
                    mf.show(player).then(fr=>{
                      if(!fr||fr.canceled) return; const idx2=fr.formValues?.[0]||0; const item=mine[idx2]; if(!item) return; const b=item.e;
                      const eggId = `${b.typeId}_spawn_egg`;
                      try{ b.addTag?.("labs_retrieved"); }catch{}
                      try{
                        const inv=player.getComponent("inventory")?.container; const egg=new ItemStack(eggId,1); const leftover=inv?.addItem?.(egg); if(leftover) player.dimension.spawnItem(leftover, player.location);
                      }catch{}
                      try{ b.kill?.(); }catch{ try{ b.dimension.spawnItem(new ItemStack(eggId,1), b.location); }catch{} }
                      try{ player.sendMessage("Bot retrieved."); }catch{}
                    }).catch(()=>{});
                  }catch{}
                } else if (idx===6){
                   // Buy My Way Home (100 LenyCoins)
                   try{
                   loadBotReg();
                   const entries = (BOT_REG[player.name]||[]).filter(en=>!BANNED.has(String(en.type||"")));
                   if (!entries.length){ try{ player.sendMessage("No owned bots recorded."); }catch{} return; }
                   const labels = entries.map(en=>{ const nm=String(en.type||"").split(":")[1]?.replace(/_/g," ")||"bot"; const dimKey = dimNameToKey(en.dim); return `${nm} @ ${en.x},${en.y},${en.z} (${dimKey})`; });
                     
                     const mf=new ModalFormData().title("Teleport to My Bots").dropdown("Teleport to:", labels, 0);
                     mf.show(player).then(async fr=>{
                       if(!fr||fr.canceled) return; const idx2=fr.formValues?.[0]||0; const en=entries[idx2]; if(!en) return;
                       // teleport (free)
                       try{ const d2=world.getDimension(dimNameToKey(en.dim)); player.teleport({x:en.x+0.5,y:en.y+0.5,z:en.z+0.5}, { dimension: d2, checkForBlocks:true }); }catch{}
                     }).catch(()=>{});
                   }catch{}
                 }
              }).catch(()=>{});
            }, 0);
          } catch {}
        };
        globalThis.LABS_showMainMenu = showLabsMenu;
        globalThis.LABS_showOpTools = showOpTools;
        showLabsMenu(ev.sender);
      } catch {}
    } else if (cmd === "bot") {
      ev.cancel = true;
      try{
        const p = ev.sender; const dimP=p.dimension;
        const BOT_TYPES = [
          "myname:miner_bot","myname:constructor_bot","myname:fisher_bot","myname:shroom_bot","myname:farmer_bot","myname:beekeeper_bot","myname:treasure_bot","myname:storekeeper_bot","myname:chef_bot","myname:butler_bot","myname:redstone_bot","myname:trash_bot"
        ];
        let best=null, bd2=9999; for(const e of dimP.getEntities({})){
          if (!BOT_TYPES.includes(e.typeId)) continue; const dx=e.location.x-p.location.x, dy=e.location.y-p.location.y, dz=e.location.z-p.location.z; const d2=dx*dx+dy*dy+dz*dz; if(d2<bd2 && d2<=16){ bd2=d2; best=e; }
        }
        if (!best){ try{ p.sendMessage("No bot nearby."); }catch{} return; }
        const form=new ActionFormData().title("Manage Bot").body(`${best.typeId}`).button("Retrieve bot").button("Close");
        form.show(p).then(res=>{
          if (!res || res.canceled) return;
          if (res.selection===0){
            // owner check (optional)
            let ownerName=""; try{ const tags=best.getTags?.()||[]; for(const t of tags){ if(String(t).startsWith("labs_owner:")){ ownerName=String(t).slice("labs_owner:".length); break; } } }catch{}
            if (ownerName && ownerName!==p.name){ try{ p.sendMessage("You are not the owner."); }catch{} return; }
            const eggId = best.typeId.replace("myname:","myname:")+"_spawn_egg"; // our eggs follow the same ids
            try{ best.addTag?.("labs_retrieved"); }catch{}
            try{
              const inv=p.getComponent("inventory")?.container; const egg=new ItemStack(eggId,1); const added=inv?.addItem?.(egg); if(!added) dim.runCommandAsync?.("");
              if (!added) best.dimension.spawnItem(egg, p.location);
            }catch{}
            try{
              const tag=`labs_kill:${Date.now().toString(36)}`; best.addTag?.(tag);
              best.dimension.runCommandAsync?.(`kill @e[type=${best.typeId},x=${Math.floor(best.location.x)},y=${Math.floor(best.location.y)},z=${Math.floor(best.location.z)},r=2,tag=${tag}]`).catch(()=>{});
            }catch{ try{ best.kill?.(); }catch{ try{ best.dimension.spawnItem(new ItemStack(eggId,1), best.location); }catch{} } }
          }
        }).catch(()=>{});
      }catch{}
    } else if (cmd === "donatehere") {
      ev.cancel = true;
      try{
        const p=ev.sender; const dimP=p.dimension; const base={x:Math.floor(p.location.x), y:Math.floor(p.location.y), z:Math.floor(p.location.z)};
        // find chest within 3 blocks with a sign above containing [Donation] if possible
        let chest=null, signText="";
        for(let dx=-3;dx<=3 && !chest;dx++) for(let dz=-3;dz<=3 && !chest;dz++) for(let dy=-1;dy<=2 && !chest;dy++){
          try{
            const b=dimP.getBlock({x:base.x+dx,y:base.y+dy,z:base.z+dz}); if (!b) continue;
            if (String(b.typeId||"")==="minecraft:chest"){
              // check block above for sign text
              try{
                const sb = dimP.getBlock({x:b.location.x,y:b.location.y+1,z:b.location.z});
                const sc = sb?.getComponent?.("minecraft:sign");
                if (sc){
                  // not all runtimes support getText; we'll best-effort by attempting both APIs
                  const t0 = sc.getText?.(0) || sc.getText?.() || "";
                  if (String(t0).toLowerCase().includes("[donation]")) { chest=b; signText=String(t0); break; }
                }
              }catch{}
              // if no sign, still accept as donation chest
              if (!chest) { chest=b; break; }
            }
          }catch{}
        }
        if (!chest){ try{ p.sendMessage("No donation chest nearby. Place a chest and a sign above with [Donation]."); }catch{} return; }
        const cont=chest.getComponent("minecraft:inventory")?.container; if (!cont){ try{ p.sendMessage("Chest not usable."); }catch{} return; }
        const form=new ActionFormData().title("Donation Chest").body("Choose what to donate:").button("Donate Coins").button("Donate Held Item");
        form.show(p).then(res=>{
          if(!res||res.canceled) return;
          if (res.selection===0){
            const mf=new ModalFormData().title("Donate Coins").textField("Amount", "e.g. 100", "");
            mf.show(p).then(async fr=>{
              if(!fr||fr.canceled) return; const amt=Math.max(0,Math.floor(Number(fr.formValues?.[0]||0))); if(!amt){ try{ p.sendMessage("Nothing donated."); }catch{} return; }
              try{ dim.runCommandAsync(`scoreboard players remove "${p.name}" lenycoins ${amt}`); }catch{ try{ p.sendMessage("Insufficient LenyCoins."); }catch{} return; }
              try{ dim.runCommandAsync(`scoreboard players add "${p.name}" karma 5`); }catch{}
              try{ dim.runCommandAsync(`scoreboard players add "${p.name}" donated ${amt}`); }catch{}
              try{ p.sendMessage(`Donated ${amt} LenyCoins. (+5 Karma)`); }catch{}
            }).catch(()=>{});
          } else if (res.selection===1){
            const inv=p.getComponent("inventory")?.container; const slot=(typeof p?.selectedSlot==="number"&&Number.isFinite(p.selectedSlot))?p.selectedSlot:0; const held=inv?.getItem(Number(slot));
            if (!held){ try{ p.sendMessage("Hold the item you want to donate."); }catch{} return; }
            const mf=new ModalFormData().title("Donate Item").textField("Amount", `max ${held.amount}`, `${held.amount}`);
            mf.show(p).then(async fr=>{
              if(!fr||fr.canceled) return; const dep=Math.max(0,Math.min(held.amount, Math.floor(Number(fr.formValues?.[0]||0)))); if(!dep){ try{ p.sendMessage("Nothing donated."); }catch{} return; }
              try{ const cur=inv.getItem(Number(slot)); if (cur && cur.typeId===held.typeId){ cur.amount-=dep; inv.setItem(Number(slot), cur.amount>0?cur:undefined); } }catch{}
              // deposit into chest
              let left=dep; const stackMax=new ItemStack(held.typeId,1).maxAmount||64;
              for(let i=0;i<cont.size && left>0;i++){ const it=cont.getItem(i); if(it && it.typeId===held.typeId && it.amount<it.maxAmount){ const can=Math.min(left,it.maxAmount-it.amount); it.amount+=can; cont.setItem(i,it); left-=can; } }
              for(let i=0;i<cont.size && left>0;i++){ const it=cont.getItem(i); if(!it){ const place=Math.min(stackMax,left); cont.setItem(i,new ItemStack(held.typeId,place)); left-=place; } }
              try{ dim.runCommandAsync(`scoreboard players add "${p.name}" karma 5`); }catch{}
              try{ p.sendMessage(`Donated ${dep-left} ${held.typeId}. (+5 Karma)`); }catch{}
            }).catch(()=>{});
          }
        }).catch(()=>{});
      }catch{}
    } else if (cmd === "donate") {
      ev.cancel = true;
      try{
        const p=ev.sender; const players=world.getPlayers().filter(x=>x.name!==p.name);
        if (!players.length){ try{ p.sendMessage("No other players online."); }catch{} return; }
        const names=players.map(pl=>pl.name);
        const form=new ModalFormData().title("Donate Coins").dropdown("Receiver", names, 0).textField("Amount", "e.g. 100", "");
        form.show(p).then(async fr=>{
          if(!fr||fr.canceled) return; const idx=fr.formValues?.[0]||0; const amt=Math.max(0,Math.floor(Number(fr.formValues?.[1]||0)));
          if (!amt){ try{ p.sendMessage("Nothing donated."); }catch{} return; }
          const recv=players[idx]; if (!recv){ try{ p.sendMessage("Receiver not found."); }catch{} return; }
          try{ dim.runCommandAsync(`scoreboard players remove "${p.name}" lenycoins ${amt}`); }catch{ try{ p.sendMessage("Insufficient LenyCoins."); }catch{} return; }
          try{ dim.runCommandAsync(`scoreboard players add "${recv.name}" lenycoins ${amt}`); }catch{}
          try{ dim.runCommandAsync(`scoreboard players add "${p.name}" karma 5`); }catch{}
          try{ p.sendMessage(`Donated ${amt} LenyCoins to ${recv.name}. (+5 Karma)`); recv.sendMessage?.(`${p.name} donated ${amt} LenyCoins to you.`); }catch{}
        }).catch(()=>{});
      }catch{}
    } else if (cmd === "returnegg") {
      ev.cancel = true;
      try{
        const p=ev.sender; const inv=p.getComponent("inventory")?.container; if (!inv){ try{ p.sendMessage("No inventory."); }catch{} return; }
        const eggIds=["myname:miner_bot_spawn_egg","myname:constructor_bot_spawn_egg","myname:fisher_bot_spawn_egg","myname:shroom_bot_spawn_egg","myname:farmer_bot_spawn_egg","myname:beekeeper_bot_spawn_egg","myname:treasure_bot_spawn_egg","myname:storekeeper_bot_spawn_egg","myname:redstone_bot_spawn_egg","myname:portal_bot_spawn_egg"];
        const slot=(typeof p?.selectedSlot==="number"&&Number.isFinite(p.selectedSlot))?p.selectedSlot:0; const held=inv.getItem(Number(slot));
        if (!held || !eggIds.includes(held.typeId)) { try{ p.sendMessage("Hold the stolen bot egg you want to return."); }catch{} return; }
        const others=world.getPlayers().filter(x=>x.name!==p.name);
        const names=others.map(pl=>pl.name);
        const form=new ModalFormData().title("Return Egg").dropdown("Return to", names, 0);
        form.show(p).then(async fr=>{
          if(!fr||fr.canceled) return; const idx=fr.formValues?.[0]||0; const owner=others[idx]; if(!owner){ try{ p.sendMessage("No recipient selected."); }catch{} return; }
          // remove one egg from hand
          try{ const cur=inv.getItem(Number(slot)); if (cur && cur.typeId===held.typeId){ cur.amount-=1; inv.setItem(Number(slot), cur.amount>0?cur:undefined); } }catch{}
          // give egg back to owner
          try{ const oinv=owner.getComponent("inventory")?.container; const added=oinv?.addItem?.(new ItemStack(held.typeId,1)); if(!added) owner.dimension.spawnItem(new ItemStack(held.typeId,1), owner.location); }catch{}
          // karma reward only if player has stolen>0
          try{ dim.runCommandAsync(`execute as "${p.name}" if score @s stolen matches 1.. run scoreboard players remove "${p.name}" stolen 1`); }catch{}
          try{ dim.runCommandAsync(`execute as "${p.name}" if score @s stolen matches 0.. run scoreboard players add "${p.name}" karma 0`); }catch{}
          try{ dim.runCommandAsync(`execute as "${p.name}" if score @s stolen matches 0 run tellraw @s {"rawtext":[{"text":"No stolen eggs on record; no Karma awarded."}]}`); }catch{}
          try{ dim.runCommandAsync(`execute as "${p.name}" if score @s stolen matches 0.. run scoreboard players add "${p.name}" karma 50`); }catch{}
          try{ p.sendMessage(`Returned ${held.typeId} to ${owner.name}. (+50 Karma if eligible)`); owner.sendMessage?.(`${p.name} returned a ${held.typeId} to you.`); }catch{}
        }).catch(()=>{});
      }catch{}
    } else if (cmd === "karma") {
      ev.cancel = true;
      try{
        const form = new ActionFormData().title("Karma").body("Choose an option:").button("View balances").button("Convert Karma -> LenyCoins");
        form.show(ev.sender).then(res=>{
          if (!res || res.canceled) return;
          if (res.selection===0){
            try{ dim.runCommandAsync(`scoreboard players get "${ev.sender.name}" karma`); }catch{}
            try{ dim.runCommandAsync(`scoreboard players get "${ev.sender.name}" lenycoins`); }catch{}
            try{ ev.sender.sendMessage("Check chat for scoreboard reads."); }catch{}
          } else if (res.selection===1){
            const mf=new ModalFormData().title("Convert Karma").textField("Amount", "e.g. 100", "");
            mf.show(ev.sender).then(fr=>{
              if (!fr || fr.canceled) return;
              const amt=Math.max(0, Math.floor(Number(fr.formValues?.[0]||0)));
              if (!amt) { try{ ev.sender.sendMessage("Nothing converted."); }catch{} return; }
              try{ dim.runCommandAsync(`scoreboard players remove "${ev.sender.name}" karma ${amt}`); }catch{}
              try{ dim.runCommandAsync(`scoreboard players add "${ev.sender.name}" lenycoins ${amt}`); }catch{}
              try{ ev.sender.sendMessage(`Converted ${amt} Karma to ${amt} LenyCoins.`); }catch{}
            }).catch(()=>{});
          }
        }).catch(()=>{});
      }catch{}
    } else if (msg.startsWith("!labs feedback")) {
      ev.cancel = true;
      const body = raw.slice("!labs feedback".length).trim();
      if (!body) { try { ev.sender.sendMessage("Please include a message: !labs feedback <your message>"); } catch {}; return; }
      const when = new Date().toISOString();
      // Log to console
      try { console.warn?.(`[LABS FEEDBACK] ${when} <${ev.sender.name}> ${body}`); } catch {}
      // Append to inbox (keep last 50)
      const arr = loadFeedback();
      arr.push({ t: when, p: ev.sender.name, m: body });
      while (arr.length > 50) arr.shift();
      saveFeedback(arr);
      try { ev.sender.sendMessage("Thanks! Feedback recorded. View with !labs inbox"); } catch {}
    } else if (msg === "!labs inbox") {
      ev.cancel = true;
      const arr = loadFeedback();
      if (!arr.length) { try { ev.sender.sendMessage("Inbox is empty."); } catch {}; return; }
      const last10 = arr.slice(-10);
      try {
        ev.sender.sendMessage(`Inbox: showing ${last10.length}/${arr.length}`);
        for (const it of last10) {
          ev.sender.sendMessage(`- [${it.t}] <${it.p}> ${it.m}`);
        }
      } catch {}
    } else if (msg === "!labs inbox clear") {
      ev.cancel = true;
      // Restrict clear to players with tag labs_admin
      try {
        if (!ev.sender.hasTag || !ev.sender.hasTag("labs_admin")) { ev.sender.sendMessage("You need tag 'labs_admin' to clear. /tag @s add labs_admin"); return; }
      } catch {}
      saveFeedback([]);
      try { ev.sender.sendMessage("Inbox cleared."); } catch {}
    }
  });
} catch {}

// HOT Lava Chicken + Magic Shrooms on use
try{
world.beforeEvents.itemUse.subscribe(ev=>{
  try{
    const p = ev?.source; const it = ev?.itemStack || ev?.item; const id = String(it?.typeId||""); if (!p || !id) return;
    // Block banned bot eggs from use
    try{ const idClean = id.replace(/^item\./,""); if (/_spawn_egg$/.test(idClean)){ const core=idClean.replace(/_spawn_egg$/,'').replace(/^myname:/,'myname:'); if (BANNED.has(core)){ ev.cancel=true; try{ p.sendMessage("That bot is disabled on this server."); }catch{} return; } } }catch{}
    const dim = world.getDimension("overworld");
    if (id==="myname:hot_lava_chicken"){
      // Clear all current effects first
      try{ dim.runCommandAsync(`effect "${p.name}" clear`); }catch{}
      // Fully heal (instant health big amplifier)
      try{ dim.runCommandAsync(`effect "${p.name}" instant_health 1 10 true`); }catch{}
      // Buffs: 10 minutes each (600s)
      const apply = (eff, dur, amp)=>{ try{ dim.runCommandAsync(`effect "${p.name}" ${eff} ${dur} ${amp} true`); }catch{} };
      apply("speed", 600, 1);
      apply("water_breathing", 600, 1);
      apply("strength", 600, 1);
      apply("slow_falling", 600, 1);
      try{ p.sendMessage("You feel invigorated by the HOT Lava Chicken!" ); }catch{}
    } else if (id==="myname:fly_high_shroom"){
    // New flight: hold jump to propel in look direction
    try{ const now=Date.now(); const flightMs=60*1000; const ffMs=flightMs+45*1000; FLY_HOLD.set(p.id, { until: now+flightMs, ffUntil: now+ffMs, dim: p.dimension?.id }); dim.runCommandAsync(`effect "${p.name}" slow_falling 2 0 true`).catch(()=>{}); p.sendMessage?.("Fly High: Hold Jump to fly toward your crosshair for 60s. Feather Falling persists for 105s."); }catch{}
    } else if (id==="myname:zoom_shroom"){
      // Speed/strength + slow falling
      const apply = (eff, dur, amp)=>{ try{ dim.runCommandAsync(`effect "${p.name}" ${eff} ${dur} ${amp} true`); }catch{} };
      apply("speed", 900, 2);
      apply("strength", 900, 1);
      apply("slow_falling", 900, 1);
      try{ p.sendMessage("Zoom! You feel super fast and strong."); }catch{}
    }
  }catch{}
});
} catch {}

// Stick quick-access for menus (Open LABS or Shop)
try{
  const QUICK_TAP = new Map(); // playerId -> lastShownMs
  function openQuickMenu(p){
    const af = new ActionFormData().title("LABS Quick").body("Choose an option:")
    .button("Open LABS Menu")
    .button("Open Shop Menu")
    .button("Open Chef Menu");
    system.run(()=>{
      af.show(p).then(res=>{
        if (!res || res.canceled) return;
        if (res.selection===0){ try{ if (globalThis.LABS_showMainMenu) globalThis.LABS_showMainMenu(p); else p.sendMessage?.("LABS menu not ready. Try again soon."); }catch{} }
        else if (res.selection===1){
          try{
            if (globalThis.LABS_openWorldShopMenu) globalThis.LABS_openWorldShopMenu(p);
            else p.sendMessage?.("Shop menu not ready.");
          }catch{}
        }
        else if (res.selection===2){
          try{ if (globalThis.LABS_openChefMenu) globalThis.LABS_openChefMenu(p); else p.sendMessage?.("Chef menu not ready. Try near a Chef Bot."); }catch{}
        } else if (false && res.selection===3){
          try{ if (!p.hasTag || !p.hasTag("labs_admin")) { p.sendMessage("OP only. /tag @s add labs_admin"); return; } } catch {}
          const SONGS=[
            {id:"labs.end_is_waiting", label:"The End is Waiting (custom)"},
            {id:"labs.fisher_song", label:"Fisher Song (custom)"},
            {id:"labs.miner_song", label:"Miner Song (custom)"},
            {id:"labs.beekeeper_song", label:"Beekeeper Song (custom)"},
            {id:"labs.butler_song", label:"Butler Song (custom)"},
            {id:"labs.justice_march", label:"Justice March (custom)"},
            {id:"labs.shroom_song", label:"Shroom Song (custom)"},
            {id:"labs.smelter_song", label:"Smelter Song (custom)"},
            {id:"labs.party_song", label:"Party Song (custom)"},
            {id:"labs.creeper_song", label:"Creeper Serenade (custom)"},
            {id:"labs.iron_golems", label:"Golem March (custom)"},
            {id:"labs.chicken_storm", label:"Chicken Storm (custom)"},
            {id:"labs.piglin_congo", label:"Piglin Congo (custom)"},
            {id:"labs.trash_bot_song", label:"Trash Bot Song (custom)"},
            {id:"record.pigstep", label:"Pigstep (vanilla)"},
            {id:"record.otherside", label:"Otherside (vanilla)"},
            {id:"record.relic", label:"Relic (vanilla)"}
          ];
          const mf=new ModalFormData().title("Play Music").dropdown("Song", SONGS.map(s=>s.label), 0);
          mf.show(p).then(async fr=>{
            if(!fr||fr.canceled) return; const idx=fr.formValues?.[0]||0; const s=SONGS[idx]; if(!s) return;
            try{ const x=Math.floor(p.location.x), y=Math.floor(p.location.y), z=Math.floor(p.location.z); p.dimension.runCommandAsync(`playsound ${s.id} @a ${x} ${y} ${z} 1 1 0`); }catch{}
          }).catch(()=>{});
        } else if (false && res.selection===4){
          try{ if (globalThis.LABS_placeLavaChickenStand) globalThis.LABS_placeLavaChickenStand(p); else p.sendMessage?.("Structure tool not loaded yet."); }catch{}
        }
      }).catch(()=>{});
    });
  }
  function maybeOpenQuick(p){
    try{ if (globalThis.LABS_isFineTuning && globalThis.LABS_isFineTuning(p)) return; }catch{}
    const now=Date.now(); const last=QUICK_TAP.get(p.id)||0; if (now-last<300) return; QUICK_TAP.set(p.id, now);
    openQuickMenu(p);
  }
  // In-air use opens quick menu
  world.beforeEvents.itemUse.subscribe(ev=>{ try{ const p=ev?.source; const it=ev?.itemStack||ev?.item; if (!p) return; const id=String(it?.typeId||""); if (id!=="minecraft:stick") return; maybeOpenQuick(p); }catch{} });
  world.afterEvents.itemUse.subscribe(ev=>{ try{ const p=ev?.source; const it=ev?.itemStack||ev?.item; if (!p) return; const id=String(it?.typeId||""); if (id!=="minecraft:stick") return; maybeOpenQuick(p); }catch{} });
  // Use on block opens same quick menu
  world.beforeEvents.itemUseOn.subscribe(ev=>{ try{ const p=ev?.source; const it=ev?.itemStack||ev?.item; if (!p) return; const id=String(it?.typeId||""); if (id!=="minecraft:stick") return; maybeOpenQuick(p); }catch{} });
  world.afterEvents.itemUseOn.subscribe(ev=>{ try{ const p=ev?.source; const it=ev?.itemStack||ev?.item; if (!p) return; const id=String(it?.typeId||""); if (id!=="minecraft:stick") return; maybeOpenQuick(p); }catch{} });
} catch {}
 
 // Fly-high shroom: hold-jump flight tracker + extended feather fall
const FLY_HOLD = new Map(); // playerId -> { until:number, ffUntil:number, dim?:string }
try{
  system.runInterval(()=>{
    const now = Date.now();
    try{
      for (const [pid, st] of Array.from(FLY_HOLD.entries())){
        const pl = world.getPlayers().find(p=>p.id===pid);
        if (!pl || now > (st.ffUntil||0) || (st.dim && pl.dimension?.id!==st.dim)) { FLY_HOLD.delete(pid); continue; }
        if (now <= (st.until||0)){
          if (pl.isJumping){
            try{
              const v = pl.getViewDirection?.() || {x:0,y:0,z:1};
              const hs = 1.5; // horizontal strength
              const vs = Math.max(0.1, Math.min(1.0, v.y*1.5));
              pl.applyKnockback?.(v.x, v.z, hs, vs);
            }catch{}
          }
        }
        try{ pl.runCommandAsync?.("effect @s slow_falling 1 0 true").catch(()=>{}); }catch{}
      }
    }catch{}
  }, 1);
} catch {}

// Legacy sneak-tap (deprecated, kept for compatibility)
const FLY_TAP = new Map(); // playerId -> { until:number, prevSneak:boolean, dim?:string }
try{
  system.runInterval(()=>{
    const now = Date.now();
    try{
      for (const [pid, st] of Array.from(FLY_TAP.entries())){
        const pl = world.getPlayers().find(p=>p.id===pid);
        if (!pl || now > st.until || (st.dim && pl.dimension?.id!==st.dim)) { FLY_TAP.delete(pid); continue; }
        const sneaking = !!(pl.isSneaking ?? false);
        if (sneaking && !st.prevSneak){
          try{ const up = { x: pl.location.x, y: pl.location.y + 5, z: pl.location.z }; pl.teleport(up, { dimension: pl.dimension, keepVelocity:false, checkForBlocks:true }); }catch{}
        }
        st.prevSneak = sneaking; FLY_TAP.set(pid, st);
      }
    }catch{}
  }, 3);
} catch {}

// Cross-dimension bot registry (owner -> [{uuid,type,dim,x,y,z,t}])
const BOT_REG_KEY = "labs_bot_registry";
let BOT_REG = {};
function loadBotReg(){ try{ const raw=world.getDynamicProperty?.(BOT_REG_KEY); if (raw && typeof raw==='string') BOT_REG = JSON.parse(raw); }catch{} }
function saveBotReg(){ try{ const s=JSON.stringify(BOT_REG||{}); world.setDynamicProperty?.(BOT_REG_KEY, s.length>7900 ? s.slice(0,7900) : s); }catch{} }
function regAddOrUpdate(owner, uuid, type, dimId, pos){ try{ const arr=Array.isArray(BOT_REG[owner])?BOT_REG[owner]:[]; let it=arr.find(r=>r.uuid===uuid); if(!it){ it={uuid,type,dim:dimId,x:Math.floor(pos.x),y:Math.floor(pos.y),z:Math.floor(pos.z),t:Date.now()}; arr.push(it); } else { it.type=type; it.dim=dimId; it.x=Math.floor(pos.x); it.y=Math.floor(pos.y); it.z=Math.floor(pos.z); it.t=Date.now(); } BOT_REG[owner]=arr; saveBotReg(); }catch{} }
function regRemove(uuid){ try{ for(const k of Object.keys(BOT_REG)){ const arr=Array.isArray(BOT_REG[k])?BOT_REG[k]:[]; const idx = arr.findIndex(r=>r.uuid===uuid); if(idx>=0){ arr.splice(idx,1); BOT_REG[k]=arr; } } saveBotReg(); }catch{} }
function dimNameToKey(id){ const s=String(id||""); if(s.includes("nether")) return "nether"; if(s.includes("the_end")||s.includes("end")) return "the_end"; return "overworld"; }

// Control Bot ticking-area helpers (persist across reboots)
const TA_PREFIX = "labs_ctrl_"; // legacy prefix (unused for add/remove now)
function addControlTickArea(dimKey, x, z){ try{ const dim=world.getDimension(dimKey); const cx=Math.floor(x/16), cz=Math.floor(z/16); dim.runCommandAsync?.(`tickingarea add circle ${cx} ${cz} 1`); }catch{} }
function removeControlTickArea(dimKey, x, z){ try{ const dim=world.getDimension(dimKey); const cx=Math.floor(x/16), cz=Math.floor(z/16); dim.runCommandAsync?.(`tickingarea remove circle ${cx} ${cz} 1`); }catch{} }
function ensureControlTickAreasFromRegistry(){ try{ for(const owner of Object.keys(BOT_REG)){ const arr=Array.isArray(BOT_REG[owner])?BOT_REG[owner]:[]; for(const it of arr){ if(String(it?.type||"")==='myname:control_bot'){ addControlTickArea(dimNameToKey(it.dim), it.x, it.z); } } } }catch{} }

try{
  world.afterEvents.worldInitialize.subscribe(ev=>{ try{ const DP = globalThis.DynamicPropertiesDefinition; if (typeof DP==='function'){ const def=new DP(); def.defineString(BOT_REG_KEY, 12000); ev.propertyRegistry?.registerWorldDynamicProperties?.(def); } }catch{} system.run(()=>{ loadBotReg(); ensureControlTickAreasFromRegistry(); }); });
}catch{}

// Periodic refresh of bot registry positions (loaded entities only)
system.runInterval(()=>{
  try{
    const dims=[world.getDimension("overworld"),world.getDimension("nether"),world.getDimension("the_end")].filter(Boolean);
    for(const d of dims){
      for(const t of ["myname:miner_bot","myname:constructor_bot","myname:fisher_bot","myname:shroom_bot","myname:farmer_bot","myname:beekeeper_bot","myname:treasure_bot","myname:storekeeper_bot","myname:chef_bot","myname:butler_bot","myname:smelter_bot","myname:redstone_bot","myname:control_bot","myname:portal_bot","myname:trash_bot"]){
        const arr=d.getEntities({type:t});
        for(const e of arr){
          try{ const tags=e.getTags?.()||[]; const own=tags.find(tt=>String(tt).startsWith("labs_owner:")); const uid=tags.find(tt=>String(tt).startsWith("labs_uuid:")); if(!own||!uid) continue; const owner=String(own).slice("labs_owner:".length); const uuid=String(uid).slice("labs_uuid:".length); regAddOrUpdate(owner, uuid, e.typeId, e.dimension.id, e.location); }catch{}
        }
      }
    }
  }catch{}
}, 200);

// Owner tagging for spawned bots and karma enforcement
try{
const BOT_TYPES = [
  "myname:miner_bot","myname:constructor_bot","myname:fisher_bot","myname:shroom_bot","myname:farmer_bot","myname:beekeeper_bot","myname:treasure_bot","myname:storekeeper_bot","myname:butler_bot","myname:smelter_bot","myname:redstone_bot","myname:control_bot","myname:portal_bot","myname:trash_bot"
].filter(id=>!BANNED.has(id));
const LAST_HIT = new Map(); // entityId -> playerName
world.afterEvents.entitySpawn.subscribe(ev=>{
  const e=ev.entity; if(!e) return;
  // if banned, prevent spawn and refund egg
  try{
    if (BANNED.has(e.typeId)){
      // try to find nearest player and give egg back; else drop at bot location
      let near=null,best=36; for(const p of world.getPlayers()){ if(p.dimension.id!==e.dimension.id) continue; const dx=p.location.x-e.location.x, dy=p.location.y-e.location.y, dz=p.location.z-e.location.z; const d2=dx*dx+dy*dy+dz*dz; if(d2<best){best=d2;near=p;} }
      const eggId = `${e.typeId}_spawn_egg`;
      try{ if (near){ const inv=near.getComponent("inventory")?.container; const leftover=inv?.addItem?.(new ItemStack(eggId,1)); if(leftover) near.dimension.spawnItem(leftover, near.location); } else { e.dimension.spawnItem(new ItemStack(eggId,1), e.location); } }catch{}
      try{ e.addTag?.("labs_retrieved"); }catch{}
      try{ e.kill?.(); }catch{}
      return;
    }
  }catch{}
  
  // Check if bot type is disabled via feature flags
  try{
    const botTypeKey = String(e.typeId).split(':')[1]; // e.g., "miner_bot"
    if (botTypeKey && isFeatureEnabled && !isFeatureEnabled(botTypeKey)){
      // Bot is disabled - refund egg and prevent spawn
      let near=null,best=36; 
      for(const p of world.getPlayers()){ 
        if(p.dimension.id!==e.dimension.id) continue; 
        const dx=p.location.x-e.location.x, dy=p.location.y-e.location.y, dz=p.location.z-e.location.z; 
        const d2=dx*dx+dy*dy+dz*dz; 
        if(d2<best){best=d2;near=p;} 
      }
      const eggId = `${e.typeId}_spawn_egg`;
      const botName = botTypeKey.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      try{ 
        if (near){ 
          const inv=near.getComponent("inventory")?.container; 
          const leftover=inv?.addItem?.(new ItemStack(eggId,1)); 
          if(leftover) near.dimension.spawnItem(leftover, near.location);
          near.sendMessage?.(`§c${botName} is currently disabled by the server.§r`);
        } else { 
          e.dimension.spawnItem(new ItemStack(eggId,1), e.location); 
        } 
      }catch{}
      try{ e.addTag?.("labs_retrieved"); }catch{}
      try{ e.kill?.(); }catch{}
      return;
    }
  }catch{}
  
  if (!BOT_TYPES.includes(e.typeId)) return;
  // find presumed owner as nearest player within 6 blocks
  let target=null, best=36; for(const p of world.getPlayers()){ if(p.dimension.id!==e.dimension.id) continue; const dx=p.location.x-e.location.x, dy=p.location.y-e.location.y, dz=p.location.z-e.location.z; const d2=dx*dx+dy*dy+dz*dz; if(d2<best){best=d2;target=p;} }

   // per-owner limits
  try{
    const minerL = Math.max(1, Math.min(100, Number((FEATURE_FLAGS||{}).minerLimit ?? 3)|0));
    const fisherL = Math.max(1, Math.min(100, Number((FEATURE_FLAGS||{}).fisherLimit ?? 1)|0));
    const LIMITS={"myname:miner_bot":minerL, "myname:storekeeper_bot":1, "myname:fisher_bot":fisherL, "myname:smelter_bot":1, "myname:butler_bot":1, "myname:redstone_bot":5, "myname:control_bot":1, "myname:portal_bot":2, "myname:trash_bot":1};
    if (target && LIMITS[e.typeId]){
      const owner=target.name;
      const dims=[world.getDimension("overworld"), world.getDimension("nether"), world.getDimension("the_end")].filter(Boolean);
      let count=0;
      for(const d of dims){
        const arr=d.getEntities({ type: e.typeId });
        for(const en of arr){
          try{
            if (en.id===e.id) continue;
            const tags=en.getTags?.()||[];
            let ok=false;
            for(const t of tags){ if(String(t).startsWith("labs_owner:") && String(t).endsWith(owner)){ ok=true; break; } }
            if (!ok && e.typeId==="myname:storekeeper_bot"){
              for(const t of tags){ if(String(t).startsWith("sko|") && String(t).slice(4)===owner){ ok=true; break; } }
            }
            if (ok) count++;
          }catch{}
        }
      }
      if (count>=LIMITS[e.typeId]){
        // refund and remove
        const eggId = `${e.typeId}_spawn_egg`;
        try{ const inv=target.getComponent("inventory")?.container; const leftover=inv?.addItem?.(new ItemStack(eggId,1)); if(leftover) target.dimension.spawnItem(leftover, target.location); target.sendMessage?.(`Too many ${e.typeId.split(':')[1].replace('_',' ')}s already deployed.`); }catch{}
        try{ e.addTag?.("labs_retrieved"); }catch{}
        try{ e.kill?.(); }catch{}
        return;
      }
    }
  }catch{}
  // per-chunk uniqueness for control bot (refund and remove duplicates in same chunk)
  try{
    if (e.typeId==="myname:control_bot"){
      const cx=Math.floor(e.location.x/16), cz=Math.floor(e.location.z/16);
      const arr=e.dimension.getEntities({type:"myname:control_bot"})||[];
      for(const other of arr){ if (other.id===e.id) continue; const ocx=Math.floor(other.location.x/16), ocz=Math.floor(other.location.z/16); if (ocx===cx && ocz===cz){
        try{ const eggId=`${e.typeId}_spawn_egg`; const inv=target?.getComponent("inventory")?.container; const leftover=inv?.addItem?.(new ItemStack(eggId,1)); if(leftover) target?.dimension.spawnItem(leftover, target.location); target?.sendMessage?.("Only one Control Bot per chunk. Refunding egg."); }catch{}
        try{ e.addTag?.("labs_retrieved"); }catch{}
        try{ e.kill?.(); }catch{}
        return;
      } }
    }
  }catch{}
  // tag owner
  if (target){ try { e.addTag?.(`labs_owner:${target.name}`); } catch {} }
  // ensure persistent uuid and register location
  try{
    const tags=e.getTags?.()||[]; let uid=tags.find(t=>String(t).startsWith("labs_uuid:")); if(!uid){ uid = `labs_uuid:${Date.now().toString(36)}${Math.floor(Math.random()*1e6).toString(36)}`; try{ e.addTag?.(uid); }catch{} }
    const owner = target?.name || (tags.find(t=>String(t).startsWith("labs_owner:"))||"").slice("labs_owner:".length);
    const uuid = String(uid).slice("labs_uuid:".length);
    if (owner && uuid){ regAddOrUpdate(owner, uuid, e.typeId, e.dimension.id, e.location); }
    // If control bot, set compact name and add ticking area immediately
    if (e.typeId==="myname:control_bot"){ try{ e.nameTag = "Control Bot"; }catch{} try{ addControlTickArea(dimNameToKey(e.dimension.id), e.location.x, e.location.z); }catch{} }
  }catch{}
});
world.afterEvents.entityHurt.subscribe(ev=>{
try{
const t=ev.hurtEntity; const src=ev.damageSource?.damagingEntity; if (!t||!src) return;
// Doom Blade extra effects
try{
  if (src.typeId==="minecraft:player"){
    const inv=src.getComponent("inventory")?.container; const slot=(typeof src.selectedSlot==="number"?src.selectedSlot:0); const held=inv?.getItem(Number(slot));
    if (held && held.typeId==="myname:doom_blade"){
      // Top up total damage to 18
      const extra = Math.max(0, 18 - (Number(ev.damage)||0));
      if (extra>0){ try{ src.dimension.runCommandAsync(`damage @e[type=${t.typeId},x=${Math.floor(t.location.x)},y=${Math.floor(t.location.y)},z=${Math.floor(t.location.z)},r=1,c=1] ${extra} entity_attack`); }catch{} }
      // Flame effect
      try{ t.setOnFire?.(4, true); }catch{}
      // Knockback
      try{
        const dx=t.location.x - src.location.x; const dz=t.location.z - src.location.z; const mag=Math.max(0.01, Math.hypot(dx,dz)); const k=1.2; t.applyKnockback?.(dx/mag, dz/mag, k, 0.4);
      }catch{}
      // Lightning strike effect at target (1-in-20 chance)
      try{ if (Math.random() < 0.05) src.dimension.runCommandAsync(`summon lightning_bolt ${Math.floor(t.location.x)} ${Math.floor(t.location.y)} ${Math.floor(t.location.z)}`).catch(()=>{}); }catch{}
    }
  }
}catch{}
if (!BOT_TYPES.includes(t.typeId)) return;
if (src.typeId==="minecraft:player"){ LAST_HIT.set(t.id, src.name); }
}catch{}
});
world.afterEvents.entityDie.subscribe(ev=>{
const e=ev.deadEntity; if(!e) return; if (!BOT_TYPES.includes(e.typeId)) return;
try{ if (e.getTags?.()?.includes("labs_retrieved")) return; }catch{}
// read owner/uuid from tags
let ownerName=""; let uuidTag=""; try{ const tags=e.getTags?.()||[]; for(const t of tags){ if(String(t).startsWith("labs_owner:")){ ownerName=String(t).slice("labs_owner:".length); } if(String(t).startsWith("labs_uuid:")){ uuidTag=String(t).slice("labs_uuid:".length); } } }catch{}
try{ if (uuidTag) regRemove(uuidTag); }catch{}
// If control bot, remove ticking area (by circle)
try{ if (e.typeId==="myname:control_bot"){ removeControlTickArea(dimNameToKey(e.dimension.id), e.location.x, e.location.z); } }catch{}
const killerName = LAST_HIT.get(e.id);
     if (killerName && ownerName && killerName!==ownerName){
      try{ const dim = world.getDimension("overworld"); dim.runCommandAsync(`scoreboard players remove "${killerName}" karma 100`); dim.runCommandAsync(`scoreboard players add "${killerName}" stolen 1`); }catch{}
      // Justice trigger if karma <= -1000 and not already tagged
      try{ const killer = world.getPlayers().find(p=>p.name===killerName); if (killer){
        // Cooldown check
        let cdUntil = 0; try{ const t = (killer.getTags?.()||[]).find(t=>String(t).startsWith("labs_justice_cd:")); if (t) cdUntil = Number(String(t).slice("labs_justice_cd:".length))||0; }catch{}
        const nowSec = Math.floor(Date.now()/1000);
        if (cdUntil && nowSec < cdUntil) { /* still in cooldown */ } else {

        // Read karma
        let kNow = 0;
        try{ const obj = world.scoreboard?.getObjective?.("karma"); const id = killer?.scoreboardIdentity; if (obj && id){ const v=obj.getScore(id); if (typeof v==='number' && Number.isFinite(v)) kNow=v; } }catch{}
        // Trigger only if karma <= -1000
        if (kNow <= -1000){
          const seq = ()=>{
            try{ world.sendMessage(`${killer.name} has invoked the Wrath of the Justice Bot, may the Minecraft gods have mercy on your pickles!`); }catch{}
            try{ world.getDimension("overworld").runCommandAsync("playsound ambient.weather.thunder @a"); }catch{}
            system.runTimeout(()=>{
              try{ world.getDimension("overworld").runCommandAsync("playsound ambient.weather.thunder @a"); }catch{}
              // lightning flashes at killer
              try{ killer.dimension.runCommandAsync(`summon lightning_bolt ${Math.floor(killer.location.x)} ${Math.floor(killer.location.y)} ${Math.floor(killer.location.z)}`); }catch{}
              system.runTimeout(()=>{
                // triple thunder
                try{ world.getDimension("overworld").runCommandAsync("playsound ambient.weather.thunder @a"); }catch{}
                system.runTimeout(()=>{ try{ world.getDimension("overworld").runCommandAsync("playsound ambient.weather.thunder @a"); }catch{} }, 10);
                system.runTimeout(()=>{ try{ world.getDimension("overworld").runCommandAsync("playsound ambient.weather.thunder @a"); }catch{} }, 20);
                // finally, mark victim and summon bot
                system.runTimeout(()=>{
                  try{ killer.addTag?.("labs_justice_victim"); }catch{}
                  try{ killer.dimension.runCommandAsync(`summon myname:justice_bot ${Math.floor(killer.location.x)} ${Math.floor(killer.location.y)} ${Math.floor(killer.location.z)}`); }catch{}
                }, 25);
              }, 40);
            }, 100);
          };
          // Play Justice March now and schedule seq for 4 minutes later (~4800 ticks)
          try{ world.getDimension("overworld").runCommandAsync("playsound labs.justice_march @a"); }catch{}
          system.runTimeout(()=>{ seq(); }, 4800);
          // set 1-hour cooldown immediately to avoid re-trigger spam
          try{ const tags=killer.getTags?.()||[]; for(const t of tags){ if(String(t).startsWith("labs_justice_cd:")) try{ killer.removeTag(t); }catch{} }
               killer.addTag?.(`labs_justice_cd:${nowSec+3600}`); }catch{}
        }

        }
      } }catch{}
    }
    LAST_HIT.delete(e.id);
  });
} catch {}

// Award Karma for animal/villager care and nearby breeding
try{
const NON_FOOD = new Set([
"minecraft:shears","minecraft:lead","minecraft:name_tag","minecraft:saddle",
"minecraft:bucket","minecraft:water_bucket","minecraft:lava_bucket","minecraft:glass_bottle",
  "minecraft:flint_and_steel","minecraft:boat","minecraft:minecart","minecraft:spawn_egg"
]);
// +20 Karma per valid feeding to any breedable or villager
world.afterEvents.playerInteractWithEntity.subscribe(ev=>{
try{
const p=ev.player; const t=ev.target; if(!p||!t) return;
const isBreedable = !!t.hasComponent?.("minecraft:breedable");
const isVillager = String(t.typeId||"") === "minecraft:villager_v2" || String(t.typeId||"") === "minecraft:villager";
if (!isBreedable && !isVillager) return;
const used = ev.beforeItemStack || ev.itemStack; if (!used) return;
  const usedId = String(used.typeId||"");
    if (!usedId || NON_FOOD.has(usedId)) return;
      try{ world.getDimension("overworld").runCommandAsync(`scoreboard players add "${p.name}" karma 20`); }catch{}
    }catch{}
  });
  // +100 Karma when a newborn animal or villager spawns within 15 blocks of a player
  world.afterEvents.entitySpawn.subscribe(ev=>{
    try{
      const e = ev.entity; if (!e) return;
      const age = e.getComponent?.("minecraft:ageable");
      const isBaby = !!age && !!age.isBaby;
      const isBreedable = !!e.hasComponent?.("minecraft:breedable");
      const isVillager = String(e.typeId||"") === "minecraft:villager_v2" || String(e.typeId||"") === "minecraft:villager";
      if (!isBaby) return;
      if (!(isBreedable || isVillager)) return;
      const dim = e.dimension; if (!dim) return;
      const ex = e.location?.x||0, ey=e.location?.y||0, ez=e.location?.z||0;
      for (const p of world.getPlayers()){
        try{
          if (p.dimension?.id !== dim.id) continue;
          const dx=p.location.x-ex, dy=p.location.y-ey, dz=p.location.z-ez;
          const d2 = dx*dx+dy*dy+dz*dz;
          if (d2 <= 15*15){ try{ world.getDimension("overworld").runCommandAsync(`scoreboard players add "${p.name}" karma 100`); }catch{} }
        }catch{}
      }
    }catch{}
  });
} catch {}

// Economy + Karma: objectives and initial grants
try{
  const dim = world.getDimension("overworld");
  system.runTimeout(()=>{
    try{ dim.runCommandAsync("scoreboard objectives add lenycoins dummy LenyCoins"); }catch{}
    try{ dim.runCommandAsync("scoreboard objectives add karma dummy Karma"); }catch{}
    try{ dim.runCommandAsync("scoreboard objectives add stolen dummy StolenEggs"); }catch{}
    try{ dim.runCommandAsync("scoreboard objectives add donated dummy Donated"); }catch{}
  }, 20);
  world.afterEvents.playerSpawn.subscribe(ev=>{
  const p = ev.player; if (!p) return;
  try{
  if (typeof isFeatureEnabled !== 'function' || isFeatureEnabled('welcomePack')){
  if (!p.hasTag || !p.hasTag("labs_coins_init")){
    const welcomeCoins = Math.max(0, Number((FEATURE_FLAGS||{}).welcomeCoins ?? 500)|0);
    if (welcomeCoins > 0) {
      dim.runCommandAsync(`scoreboard players add "${p.name}" lenycoins ${welcomeCoins}`);
      p.addTag?.("labs_coins_init");
      try { p.sendMessage(`You received ${welcomeCoins} LenyCoins to start.`); } catch {}
    }
  }
  if (!p.hasTag || !p.hasTag("labs_karma_init")){
    const welcomeKarma = Math.max(0, Number((FEATURE_FLAGS||{}).welcomeKarma ?? 500)|0);
    if (welcomeKarma > 0) {
      dim.runCommandAsync(`scoreboard players add "${p.name}" karma ${welcomeKarma}`);
      p.addTag?.("labs_karma_init");
      try { p.sendMessage(`You received ${welcomeKarma} Karma to start.`); } catch {}
    }
  }
    // Starter kit: place a chest with specific items (one-time)
  if (!p.hasTag || !p.hasTag("labs_starter_init")){
  try{
    const dim = p.dimension;
    const base = { x: Math.floor(p.location.x), y: Math.floor(p.location.y), z: Math.floor(p.location.z) };
    const offsets = [ {x:1,z:0}, {x:-1,z:0}, {x:0,z:1}, {x:0,z:-1}, {x:0,z:0}, {x:0,y:1,z:0} ];
    let spot = null;
  for (const o of offsets){
  try{
    const pos = { x: base.x + (o.x||0), y: base.y + (o.y||0), z: base.z + (o.z||0) };
    const b = dim.getBlock(pos);
      if (!b || String(b.typeId||"") === "minecraft:air") { spot = pos; break; }
      }catch{}
    }
    if (!spot) spot = { x: base.x, y: base.y, z: base.z };
    // Place chest block
    try { dim.runCommandAsync(`setblock ${spot.x} ${spot.y} ${spot.z} chest`).catch(()=>{}); } catch {}
  const fillChest = ()=>{
  try{
    const chest = dim.getBlock(spot);
    const cont = chest?.getComponent("minecraft:inventory")?.container;
    if (!cont) { return false; }
  const items = [
    new ItemStack("minecraft:diamond_axe", 1),
    new ItemStack("minecraft:diamond_sword", 1),
    new ItemStack("myname:butler_bot_spawn_egg", 2),
    new ItemStack("myname:miner_bot_spawn_egg", 4),
      new ItemStack("myname:fisher_bot_spawn_egg", 1)
    ];
    let i = 0;
  for (const it of items){
    if (!it) continue;
    // find a slot
    let placed = false;
  for (let s=0; s<cont.size; s++){
    const cur = cont.getItem(s);
      if (!cur){ cont.setItem(s, it); placed = true; break; }
    }
    if (!placed){ try{ dim.spawnItem(it, { x: spot.x + 0.5, y: spot.y + 1, z: spot.z + 0.5 }); }catch{} }
      i++;
    }
      return true;
      }catch{ return true; }
    };
    // Try immediately, else retry shortly once
    let ok = false; try { ok = fillChest(); } catch {}
    if (!ok) { try { system.runTimeout(()=>{ try{ fillChest(); }catch{} }, 2); } catch {} }
    // mark and notify
    p.addTag?.("labs_starter_init");
      try { p.sendMessage("A starter chest has been placed next to you."); } catch {}
      } catch {}
      }
      }
    }catch{}
  });
} catch {}

