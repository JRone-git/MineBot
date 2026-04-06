// LABS On-Screen Manual (chapters with Back navigation)
import { ActionFormData } from "@minecraft/server-ui";
import { world, system } from "@minecraft/server";

(function(){
  try{
    const chapters = [
      {
        id: "economy",
        title: "Karma / Coins / World Shop",
        body: [
          "Overview: This world runs on two scores — Karma and LenyCoins. Karma measures your deeds; Coins buy goods in the World Store and at StoreKeepers.",
          "Earning Karma:\n• Feeding animals: +20 every time you feed any animal (no restrictions).\n• Breeding animals: +50 every time animals breed.\n• Taming wolves/dogs: +200 when you tame a wolf.\n• Hostile slayers: +25 for defeating most hostile mobs (zombies, skeletons, creepers, etc.).",
          "Losing Karma (do not harm protected wildlife):\n• Dog/Wolf -500, Horse -500.\n• Dolphin -100, Turtle -200, Cat -200, Panda -100, Polar Bear -100.\n• Donkey/Mule/Camel/Llama/Trader Llama -100 each.\nThese penalties are immediate and stack. Play like a hero.",
          "Consequences: Server ops may configure automatic punishments when your Karma drops too low — including forced death and/or temporary suspension. Thresholds and durations are determined by server configuration.",
          "LenyCoins: You spend Coins to buy items (including bot eggs) in the World Store and at StoreKeepers. Coins can be earned by trading, selling to shops (e.g., ingots), event rewards, and — when enabled by ops — exchanging positive Karma at a configured rate.",
          "World Store (global, open anywhere with a Stick):\n• Browse: See server-sold goods and player listings.\n• Buy: Costs LenyCoins. Server items are unlimited; player listings are limited stock and credit the seller.\n• Good citizenship: Buying from another player may grant you a small Karma bonus.",
          "Sell a single-player listing (first hotbar slot):\n1) Place the item stack you want to sell in your FIRST hotbar slot (left‑most, Slot 1).\n2) Use your Stick ➜ World Store ➜ Manage My Listing.\n3) Set Price per item (Coins) and Deposit amount (how many items to list now).\n4) Confirm: those items are removed from your inventory and go on sale.\n5) Managing later: \"Deposit more from slot 1\", \"Change price\", \"Cancel listing\" (returns stock), or \"Replace with slot 1 item\".",
          "Tips:\n• Put the exact item in Slot 1 before depositing/replacing.\n• Player may only have one active listing at a time.\n• Ops can configure server-wide prices for some global items in OP Tools."
        ].join("\n\n")
      },
      {
        id: "miner",
        title: "Miner Bot",
        body: [
          "Role: digs corridors or stairs.",
          "Setup: on spawn choose Corridor, Stairs Up, Stairs Down, or a tight Corkscrew Down staircase.",
          "Behavior: faces like the nearest player, digs a clean path in that direction in timed slices.",
          "Safety: avoids breaking valuable ores/sculk; leaves those to you.",
          "Completion: finishes after its planned run and often offers to return the egg."
        ].join("\n\n")
      },
      {
        id: "fisher",
        title: "Fisher Bot",
        body: [
          "Role: automated fishing companion.",
          "Setup: place near water with room to work.",
          "Behavior: casts periodically; collects fish and related loot; may hum a tune.",
          "Storage: deposits catch into a nearby chest/barrel when available.",
          "Tips: give it a clear shoreline and chest access for best results."
        ].join("\n\n")
      },
      {
        id: "shroom",
        title: "Shroom Bot",
        body: [
          "Role: playful mushroom helper.",
          "Behavior: roams lightly and harvests/regrows shrooms in suitable areas.",
          "Effects: may trigger a short shroom-themed tune and ambient particles.",
          "Storage: will use a nearby container when present."
        ].join("\n\n")
      },
      {
        id: "farmer",
        title: "Farmer Bot",
        body: [
          "Role: simple automated farming.",
          "Setup: best inside a fenced ~15x15 with a chest.",
          "Behavior: harvests mature crops and replants where appropriate; wanders pen; avoids cactus.",
          "Storage: deposits harvest into the chest if found."
        ].join("\n\n")
      },
      {
        id: "beekeeper",
        title: "Beekeeper Bot",
        body: [
          "Role: automate hives and nests.",
          "Behavior: if bottles are available in a nearby chest, makes Honey Bottles; otherwise collects Honeycomb.",
          "Safety: resets honey level safely.",
          "Storage: deposits products into nearby storage.",
          "Tip: a fenced wildflower area with hives works great."
        ].join("\n\n")
      },
      {
        id: "treasure",
        title: "Treasure Bot",
        body: [
          "Role: roams and flags points of interest.",
          "Behavior: scans columns for spawners, treasure, rich ores, amethyst, sculk, etc.",
          "Output: builds a small marker and announces finds.",
          "Tip: give it open space to wander."
        ].join("\n\n")
      },
      {
        id: "butler",
        title: "Butler Bot",
        body: [
          "Role: loyal companion.",
          "Behavior: follows and defends; does not act as an overflow or general pickup.",
          "Synergy: when given ores or fuel, forwards them to your Smelter Bot.",
          "Personality: occasional quips and humming."
        ].join("\n\n")
      },
      {
        id: "smelter",
        title: "Smelter Bot",
        body: [
          "Role: furnace manager.",
          "Setup: place near furnaces and an output chest.",
          "Behavior: feeds fuel and inputs, tracks I/O, and deposits smelted items into a chest.",
          "Pairs: receives ore and fuel directly from Butler Bots.",
          "Tip: chests next to furnaces keep things tidy."
        ].join("\n\n")
      },
      {
        id: "redstone",
        title: "Redstone Bot",
        body: [
          "Role: redstone helper.",
          "Behavior: assists with simple toggles, pulses, and upkeep tasks (varies by configuration).",
          "Requires: lay out a short path with ~8 redstone torches to guide the bot.",
          "Tip: place near contraptions you want it to gently nudge or keep alive."
        ].join("\n\n")
      },
      {
        id: "control",
        title: "Control Bot",
        body: [
          "Role: world control and chunk-watching.",
          "Behavior: maintains ticking areas for control tasks; ensures systems keep running near its location.",
          "Integration: ties into the cross-dimension bot registry to restore watchers on server restart."
        ].join("\n\n")
      },
      {
        id: "portal",
        title: "Portal Bot",
        body: [
          "Limits: only two portals can be active at once; they link to each other.",
          "Behavior: items tossed into one portal are teleported to its partner.",
          "Delivery: the partner portal deposits into the nearest chest, or drops on the ground if none.",
          "Tip: place at bases to support fast transit flows."
        ].join("\n\n")
      },
      {
        id: "party",
        title: "Party Bot",
        body: [
          "Role: music and celebration.",
          "Behavior: plays custom tracks, particles, and silly cheer routines.",
          "Note: some global music cooldowns prevent overlapping songs."
        ].join("\n\n")
      },
      {
        id: "chef",
        title: "Chef Bot",
        body: [
          "Role: cooking and rations.",
          "Behavior: crafts staple foods from inputs; may grant small buffs in certain flows.",
          "Storage: uses nearby containers to take ingredients and store finished foods."
        ].join("\n\n")
      },
      {
        id: "trash",
        title: "Trash Bot",
        body: [
          "Role: cleanup crew.",
          "Behavior: tidies dropped junk, optionally plays its theme song.",
          "Tip: place near farms or build sites to keep areas clean."
        ].join("\n\n")
      },
      {
        id: "justice",
        title: "Justice Bot",
        body: [
          "Role: dramatic punishment and spectacle.",
          "Behavior: when invoked by ops, storms and lightning may herald its arrival; targets a marked victim.",
          "Cooldowns: admins can reset cooldowns via OP Tools."
        ].join("\n\n")
      },
      {
        id: "biome_bomb",
        title: "Biome Bomb 💣",
        body: [
          "What it does: Transforms terrain into different biomes with a spectacular creeping wave effect. Watch landscapes shift before your eyes!",
          "How to use: Place the biome bomb block on the ground. A menu appears — select your desired biome. After a 10-second countdown, the transformation begins and spreads outward in waves.",
          "Surface Biomes (11 available):\n• Plains, Desert, Snow Tundra, Jungle, Swamp, Taiga, Golden Savanna, Mushroom Island, Cherry Grove, Badlands\n• SCULK EGG: Creates a massive hollow egg-shaped chamber filled with sculk sensors, shriekers, and catalysts — perfect for trap rooms!",
          "Underground Biomes (4 available - place 30+ blocks deep):\n• Mushroom Cavern: Purple glowing cave with mycelium floor, shroomlight ceiling, 3 giant red mushrooms, and 4 bats!\n• Crystal Geode: Sparkling amethyst cathedral with crystal pillars and stalactites\n• Verdant Oasis: Lush underground jungle with moss, hanging vines, spore blossoms, and azalea bushes\n• SCULK EGG: Same dark egg chamber, works anywhere!",
          "Placement Tips for Best Results:\n• Flat surfaces work best — hills may create uneven transitions\n• Clear away trees/structures first if you want a clean transformation\n• Surface bombs spread 50 blocks; underground creates 25-block dome\n• Underground detection: bomb automatically knows if you're 30+ blocks below surface",
          "Important Notes:\n• The bomb is consumed when transformation completes\n• Mining the bomb block stops transformation immediately\n• Protected areas: bomb won't activate near chests (safeguards your base!)\n• Each biome has unique blocks, plants, and atmosphere — experiment!",
          "Advanced Tips:\n• Surface bombs smooth terrain to ±3-5 blocks from placement height\n• Downhill slopes blend naturally; uphill transitions work too\n• Underground creates hollow dome: 20 blocks tall at center, 2 blocks at edges\n• Server admins can disable this feature in Configure Access if needed"
        ].join("\n\n")
      }
    ];

    function showChapter(player, ch){
      try{
        const f = new ActionFormData()
          .title(ch.title)
          .body(ch.body)
          .button("Back");
        f.show(player).then(res=>{ if (!res || res.canceled) return; openManual(player); }).catch(()=>{});
      }catch{}
    }

    function openManual(player){
      try{
        const f = new ActionFormData().title("LABS Manual").body("Choose a chapter:");
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

    globalThis.LABS_openManual = openManual;
  }catch{}
})();
