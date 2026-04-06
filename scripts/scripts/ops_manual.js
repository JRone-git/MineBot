import { world } from "@minecraft/server";
try{ console.warn?.("[LABS] ops_manual.js loaded"); }catch{}

function giveOpsManual(player){
  try{
    const pages = [
      '{"text":"§6§lLABS Ops Manual§r\\n\\n§7For administrators (players with §elabs_admin§7).\\nUse §eOP Tools§7 in the LABS menu to access these features."}',
      '{"text":"§e⚙ Configure Access (OP)§r\\n\\n§6• §7UI Toggles: §eGet My Bots§7, §eTeleport to My Bots§7, §ePlay Music§7, §eWelcome Pack§7\\n§6• §7Per-player limits: §eMiner§7 & §eFisher§7 bot limits\\n§6• §7Per-bot enable: toggle each bot on/off globally\\n§6• §7Effect: §aapplies immediately§7; persisted in world data"}',
      '{"text":"§b🏪 World Store Pricing (OP)§r\\n\\n§6• §7Set prices for §eLava Chicken§7 and bot eggs\\n§6• §7Affects server items in World Store §aimmediately§7\\n§6• §7Player listings are unaffected (their own prices)\\n§6• §7Persisted across restarts"}',
      '{"text":"§a🛡 Bot Ops (OP)§r\\n\\n§6• §7Grant/revoke §elabs_admin§7 for players\\n§6• §7Applies §aimmediately§7; enforced on login\\n§6• §7Lets ops use OP Tools & admin commands"}',
      '{"text":"§d🏗 Private Structures (OP)§r\\n\\n§6• §7Place from curated list; optional free placement\\n§6• §7Configure in §escripts/config/private_structs.js§7\\n§6• §7Chat: §e!opsmenu§7 to open directly"}',
      '{"text":"§c🎭 Events (OP)§r\\n\\n§6• §7Trigger cinematic events (Chicken Storm, End Is Waiting, etc.)\\n§6• §7Choose target player when applicable\\n§6• §7Use sparingly; some are impactful"}',
      '{"text":"§f🎁 Welcome Pack§r\\n\\n§6• §7Toggle starter grants (coins, karma, chest) in Configure Access\\n§6• §7When on, given once per player (tag-tracked)\\n§6• §7Turn off to disable granting on new joins"}'
    ];
    // Try to give rich-formatted book; fallback to simple ASCII if command parser rejects it
    const tryRich = async ()=>{
        try{
        const cmd = `give "${player.name}" written_book{pages:[${pages.join(',')}],title:"LABS Ops Manual",author:"LABS",display:{Lore:["Administrative Reference"]}}`;
        await player.runCommandAsync(cmd);
        return true;
      }catch{ return false; }
    };
    const trySimple = async ()=>{
      try{
        const simplePages = [
          '{"text":"LABS Ops Manual

For administrators (labs_admin). Use OP Tools in the LABS menu."}',
          '{"text":"Configure Access (OP)
- UI: Get My Bots, Teleport, Play Music, Welcome Pack
- Limits: Miner & Fisher
- Per-bot enable
- Applies immediately; persisted"}',
          '{"text":"World Store Pricing (OP)
- Set prices for Lava Chicken and bot eggs
- Affects server items immediately
- Player listings unaffected
- Persisted across restarts"}',
          '{"text":"Bot Ops (OP)
- Grant/revoke labs_admin
- Applies immediately; enforced on login
- Enables OP Tools"}',
          '{"text":"Private Structures (OP)
- Place from curated list; optional free placement
- Configure in scripts/config/private_structs.js
- Chat: !opsmenu to open"}',
          '{"text":"Events (OP)
- Trigger cinematic events
- Choose target when applicable
- Use sparingly"}',
          '{"text":"Welcome Pack
- Toggle starter grants (coins, karma, chest)
- Given once per player (tag-tracked)
- Turn off to disable grants on new joins"}'
        ];
        const cmd2 = `give "${player.name}" written_book{pages:[${simplePages.join(',')}],title:"LABS Ops Manual",author:"LABS"}`;
        await player.runCommandAsync(cmd2);
        return true;
      }catch{ return false; }
    };
    const okRich = await tryRich();
    if (!okRich){ await trySimple(); }
  }catch{}
}

try{ globalThis.LABS_giveOpsManual = giveOpsManual; }catch{}
