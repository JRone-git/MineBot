import { world } from "@minecraft/server";
try { console.warn?.("[LABS] ops_manual.js loaded"); } catch {}

function giveOpsManual(player){
  try {
    const pages = [
      '{"text":"LABS Ops Manual\\n\\nFor administrators (players with labs_admin). Use OP Tools in the LABS menu to access these features."}',
      '{"text":"Configure Access (OP)\\n\\n- UI Features: Get My Bots, Teleport to My Bots, Play Music, Welcome Pack, Super Drill, Biome Bomb\\n- Bot Settings: Miner Bot limit, Fisher Bot limit, Fisher Bot loot rarity\\n- Enable/Disable Bots: toggle individual bots globally\\n- Event Timing: control event frequency, auto-events, and cooldowns\\n- Economy Balance: adjust coin/karma multipliers, welcome pack amounts, economy modes\\n- Bot Behavior: customize work speed, interaction range, personality modes, quip/music frequency\\n- Changes apply immediately and persist in world data."}',
      '{"text":"World Store Pricing (OP)\\n\\n- Set prices for Lava Chicken and bot eggs\\n- Affects server items in World Store immediately\\n- Player listings keep their own prices\\n- Persisted across restarts."}',
      '{"text":"Bot Ops (OP)\\n\\n- Grant or revoke labs_admin for players\\n- Takes effect immediately and on next login\\n- Enables access to OP Tools and admin functions."}',
      '{"text":"Private Structures (OP)\\n\\n- Place from a curated list; optional free placement\\n- Configure in scripts/config/private_structs.js\\n- Chat shortcut: !opsmenu to open directly."}',
      '{"text":"Events (OP)\\n\\n- Trigger cinematic events (Chicken Storm, End Is Waiting, etc.)\\n- Choose a target player when prompted\\n- Use sparingly; some events are impactful."}',
      '{"text":"Event Timing (OP)\\n\\n- Auto Events: Enable/disable automatic event triggering\\n- Chicken Storm Frequency: Default (1/5000 per minute), Rare (1/10000), or Frequent (1/2000)\\n- End is Waiting Frequency: Default (1% per hour), Rare (0.5%), or Frequent (2%)\\n- Event Cooldown: Hours between same event per player (1-24 hours)\\n- Use sparingly; some events are impactful on gameplay."}',
      '{"text":"Economy Balance (OP)\\n\\n- Economy Mode: Balanced (default), Casual (easier), or Hardcore (challenging)\\n- LenyCoins Multiplier: 0.1x to 10x multiplier for all coin earnings\\n- Karma Multiplier: 0.1x to 10x multiplier for all karma rewards\\n- Welcome Pack Coins: Starting coins for new players (0-10,000)\\n- Welcome Pack Karma: Starting karma for new players (0-10,000)\\n- Affects all economy interactions immediately."}',
      '{"text":"Bot Behavior (OP)\\n\\n- Personality Mode: Balanced (default), Quiet (less chatty), or Chatty (more talkative)\\n- Work Speed Multiplier: 0.5x to 3x multiplier for bot work intervals\\n- Interaction Range: 3-15 blocks for pickup/attack radius\\n- Quip Frequency Multiplier: 0.1x to 5x multiplier for bot quips\\n- Music Frequency Multiplier: 0.1x to 5x multiplier for bot music\\n- Quiet mode: 30-minute quip intervals. Chatty mode: sometimes double quips."}',
      '{"text":"Welcome Pack\\n\\n- Toggle starter grants (coins, karma, chest) in Configure Access\\n- When on, given once per player (tracked by tags)\\n- Turn off to disable grants for new joins."}'
    ];
    const cmd = `give "${player.name}" written_book{pages:[${pages.join(',')}],title:"LABS Ops Manual",author:"LABS",display:{Lore:[\"Administrative Reference\"]}}`;
    player.runCommandAsync(cmd);
  } catch {}
}

try { globalThis.LABS_giveOpsManual = giveOpsManual; } catch {}
