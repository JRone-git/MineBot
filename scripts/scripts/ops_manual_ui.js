// LABS Ops Manual (UI-based, like LABS Manual)
import { ActionFormData } from "@minecraft/server-ui";

(function(){
  try{
    const chapters = [
      {
        id: "configure",
        title: "⚙ Configure Access (OP)",
        body: [
          "• UI Features: Get My Bots, Teleport to My Bots, Play Music, Welcome Pack, Super Drill, Biome Bomb.",
          "• Bot Settings: per-player Miner Bot and Fisher Bot limits, Fisher Bot loot rarity.",
          "• Enable/Disable Bots: toggle individual bots globally.",
          "• Event Timing: control event frequency, auto-events, and cooldowns.",
          "• Economy Balance: adjust coin/karma multipliers, welcome pack amounts, economy modes.",
          "• Bot Behavior: customize work speed, interaction range, personality modes, quip/music frequency.",
          "• Changes apply immediately and persist in world data."
        ].join("\n\n")
      },
      {
        id: "pricing",
        title: "🏪 World Store Pricing (OP)",
        body: [
          "• Set prices for Lava Chicken and bot eggs.",
          "• Affects server items in World Store immediately.",
          "• Player listings keep their own prices.",
          "• Persisted across restarts."
        ].join("\n\n")
      },
      {
        id: "botops",
        title: "🛡 Bot Ops (OP)",
        body: [
          "• Grant or revoke 'labs_admin' for players.",
          "• Takes effect immediately and on next login.",
          "• Enables access to OP Tools and admin functions."
        ].join("\n\n")
      },
      {
        id: "private",
        title: "🏗 Private Structures (OP)",
        body: [
          "• Place from a curated list; optional free placement.",
          "• Configure in scripts/config/private_structs.js.",
          "• Chat shortcut: !opsmenu to open directly."
        ].join("\n\n")
      },
      {
        id: "events",
        title: "🎭 Events (OP)",
        body: [
          "• Trigger cinematic events (Chicken Storm, End Is Waiting, etc.).",
          "• Choose a target player when prompted.",
          "• Use sparingly; some events are impactful."
        ].join("\n\n")
      },
      {
        id: "event_timing",
        title: "🎭 Event Timing (OP)",
        body: [
          "• Auto Events: Enable/disable automatic event triggering.",
          "• Chicken Storm Frequency: Default (1/5000 per minute), Rare (1/10000), or Frequent (1/2000).",
          "• End is Waiting Frequency: Default (1% per hour), Rare (0.5%), or Frequent (2%).",
          "• Event Cooldown: Hours between same event per player (1-24 hours).",
          "• Use sparingly; some events are impactful on gameplay."
        ].join("\n\n")
      },
      {
        id: "economy_balance",
        title: "💰 Economy Balance (OP)",
        body: [
          "• Economy Mode: Balanced (default), Casual (easier), or Hardcore (challenging).",
          "• LenyCoins Multiplier: 0.1x to 10x multiplier for all coin earnings.",
          "• Karma Multiplier: 0.1x to 10x multiplier for all karma rewards.",
          "• Welcome Pack Coins: Starting coins for new players (0-10,000).",
          "• Welcome Pack Karma: Starting karma for new players (0-10,000).",
          "• Affects all economy interactions immediately."
        ].join("\n\n")
      },
      {
        id: "bot_behavior",
        title: "⚙ Bot Behavior (OP)",
        body: [
          "• Personality Mode: Balanced (default), Quiet (less chatty), or Chatty (more talkative).",
          "• Work Speed Multiplier: 0.5x to 3x multiplier for bot work intervals.",
          "• Interaction Range: 3-15 blocks for pickup/attack radius.",
          "• Quip Frequency Multiplier: 0.1x to 5x multiplier for bot quips.",
          "• Music Frequency Multiplier: 0.1x to 5x multiplier for bot music.",
          "• Quiet mode: 30-minute quip intervals. Chatty mode: sometimes double quips."
        ].join("\n\n")
      },
      {
        id: "welcome",
        title: "🎁 Welcome Pack",
        body: [
          "• Toggle starter grants (coins, karma, chest) in Configure Access.",
          "• Given once per player (tracked by tags).",
          "• Turn off to disable grants for new joins."
        ].join("\n\n")
      }
    ];

    function showChapter(player, ch){
      try{
        const f = new ActionFormData()
          .title(ch.title)
          .body(ch.body)
          .button("Back");
        f.show(player).then(res=>{ if (!res || res.canceled) return; openOpsManual(player); }).catch(()=>{});
      }catch{}
    }

    function openOpsManual(player){
      try{
        const f = new ActionFormData().title("LABS Ops Manual").body("Choose a topic:");
        for (const ch of chapters){ f.button(ch.title); }
        f.button("Close");
        f.show(player).then(res=>{
          if (!res || res.canceled) return;
          const sel = res.selection;
          if (sel === chapters.length) return; // Close
          const ch = chapters[sel]; if (!ch) return;
          showChapter(player, ch);
        }).catch(()=>{});
      }catch{}
    }

    globalThis.LABS_openOpsManual = openOpsManual;
  }catch{}
})();
