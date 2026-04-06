// LABS - Super Drill Recipe Control
import { world, system } from "@minecraft/server";

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

// Update recipe unlock based on feature flag
function updateSuperDrillRecipe() {
  try {
    const enabled = isSuperDrillEnabled();
    const players = world.getAllPlayers();
    
    for (const player of players) {
      try {
        if (enabled) {
          // Unlock recipe
          player.runCommandAsync("recipe give @s myname:superdrill").catch(() => {});
        } else {
          // Lock recipe
          player.runCommandAsync("recipe take @s myname:superdrill").catch(() => {});
        }
      } catch {}
    }
  } catch (err) {
    console.warn("Super Drill recipe update error:", err);
  }
}

// Check recipe status periodically and when players join
system.runInterval(() => {
  updateSuperDrillRecipe();
}, 200); // Check every 10 seconds

world.afterEvents.playerSpawn.subscribe(ev => {
  try {
    const player = ev.player;
    if (!player) return;
    
    system.runTimeout(() => {
      try {
        if (isSuperDrillEnabled()) {
          player.runCommandAsync("recipe give @s myname:superdrill").catch(() => {});
        } else {
          player.runCommandAsync("recipe take @s myname:superdrill").catch(() => {});
        }
      } catch {}
    }, 20);
  } catch {}
});
