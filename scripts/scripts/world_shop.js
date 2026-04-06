import { world, system, ItemStack } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
try { console.warn?.("[LABS] world_shop.js loaded"); } catch {}

// World Store: one active item listing per player, accessible anywhere with a Stick
const WS_KEY = "labs_world_shop"; // JSON: { sellerName: { id:string, price:number, qty:number } }
let WORLD_SHOP = {};

function loadWorldShop(){
  try{ const raw = world.getDynamicProperty?.(WS_KEY); WORLD_SHOP = raw && typeof raw==='string' ? JSON.parse(raw) : {}; }
  catch{ WORLD_SHOP = {}; }
}
function saveWorldShop(){
  try{ const s = JSON.stringify(WORLD_SHOP||{}); world.setDynamicProperty?.(WS_KEY, s.length>12000 ? s.slice(0,12000) : s); }catch{}
}

// Register world dynamic property
try{
  world.afterEvents.worldInitialize.subscribe(ev=>{
    try{ const DP = globalThis.DynamicPropertiesDefinition; if (typeof DP==='function'){ const def=new DP(); def.defineString(WS_KEY, 12000); ev.propertyRegistry?.registerWorldDynamicProperties?.(def); } }catch{}
    system.run(()=>{ loadWorldShop(); });
  });
} catch {}

function titleCase(s){ return String(s||"").replace(/[_-]+/g," ").replace(/\b\w/g, c=>c.toUpperCase()).trim(); }
function displayItemName(id){
  const raw = String(id||"");
  const clean = raw.replace(/^item\./, "");
  if (clean === "myname:fly_high_shroom") return "Fly High Shroom";
  if (clean === "myname:zoom_shroom") return "Zoom Shroom";
  const parts = clean.split(":"); const base = parts.length>1?parts[1]:parts[0];
  return titleCase(base);
}

function addToInventoryOrDrop(player, itemId, amount){
  let left = amount|0;
  try{
    const inv = player.getComponent("inventory")?.container;
    const stackMax = new ItemStack(itemId,1).maxAmount||64;
    while(left>0){ const put=Math.min(stackMax, left); const leftover=inv?.addItem?.(new ItemStack(itemId, put)); if (leftover){ left = put; break; } left-=put; }
  }catch{}
  if (left>0){ try{ player.dimension.spawnItem(new ItemStack(itemId, left), player.location); }catch{} }
}

function removeFromInventory(inv, itemId, qty){
  try{
    let left = Math.max(0, qty|0);
    if (left<=0) return 0;
    for (let i=0; i<inv.size && left>0; i++){
      try{
        const it = inv.getItem(i); if (!it || it.typeId!==itemId) continue;
        const take = Math.min(left, it.amount|0);
        if (take>0){ it.amount -= take; left -= take; inv.setItem(i, it.amount>0?it:undefined); }
      }catch{}
    }
    return qty-left;
  }catch{ return 0; }
}

function countInInventory(inv, itemId){ try{ let n=0; for (let i=0;i<inv.size;i++){ const it=inv.getItem(i); if (it && it.typeId===itemId) n+=it.amount|0; } return n; }catch{ return 0; } }

function ensureObjectives(){
  try{
    const dim = world.getDimension("overworld");
    dim.runCommandAsync("scoreboard objectives add lenycoins dummy LenyCoins").catch(()=>{});
    dim.runCommandAsync("scoreboard objectives add karma dummy Karma").catch(()=>{});
  }catch{}
}
try{ world.afterEvents.worldInitialize.subscribe(()=>{ system.run(()=>ensureObjectives()); }); }catch{}

function openManageListing(p){
  try{
    loadWorldShop();
    const mine = WORLD_SHOP?.[p.name];
    const inv = p.getComponent("inventory")?.container;
    const slot = 0; // use first hotbar slot like StoreKeeper flow
    const held = inv?.getItem(slot);
    const heldInfo = held ? `${displayItemName(held.typeId)} x${held.amount}` : "(place item in first hotbar slot)";

    if (!mine){
      // Create new listing
      const priceDefault = 10;
      const maxDeposit = Math.max(1, Number(held?.amount||1));
      const form = new ModalFormData().title("World Store: New Listing")
        .dropdown("First slot item (Slot 1)", [heldInfo], 0)
        .slider("Price per item", 1, 10000, 1, priceDefault)
        .slider("Deposit amount", 1, Math.max(1, maxDeposit), 1, Math.max(1, maxDeposit));
      form.show(p).then(res=>{
        if (!res || res.canceled) return;
        const price = Math.max(1, Math.floor(Number(res.formValues?.[1]||0)));
        const dep = Math.max(1, Math.floor(Number(res.formValues?.[2]||0)));
        const cur = inv?.getItem(slot);
        if (!cur || !cur.typeId){ try{ p.sendMessage("Place the item you want to sell in your first hotbar slot (slot 1) and try again."); }catch{} return; }
        const take = Math.min(dep, cur.amount|0);
        // remove across inventory to avoid dupes
        const removed = removeFromInventory(inv, cur.typeId, take);
        if (removed<=0){ try{ p.sendMessage("Could not remove items from inventory."); }catch{} return; }
        WORLD_SHOP[p.name] = { id: cur.typeId, price, qty: removed };
        saveWorldShop();
        try{ p.sendMessage(`Listed ${removed} ${displayItemName(cur.typeId)} @ ${price} each in the World Store.`); }catch{}
      }).catch(()=>{});
    } else {
      // Manage existing listing
      const label = `${displayItemName(mine.id)} x${mine.qty} @ ${mine.price}`;
      const af=new ActionFormData().title("World Store: Manage Listing").body(label)
        .button("Deposit more from slot 1")
        .button("Change price")
        .button("Cancel listing and retrieve items")
        .button("Replace with slot 1 item");
      af.show(p).then(res=>{
        if (!res || res.canceled) return;
        const sel = Number(res.selection||0);
        if (sel===0){
          const cur = inv?.getItem(slot);
          if (!cur || cur.typeId!==mine.id){ try{ p.sendMessage("Select the same item type as your listing."); }catch{} return; }
          const max = Math.max(1, Number(cur.amount||1));
          const mf=new ModalFormData().title("Deposit More").slider("Amount", 1, max, 1, max);
          mf.show(p).then(fr=>{
            if (!fr || fr.canceled) return; const dep = Math.max(1, Math.floor(Number(fr.formValues?.[0]||1)));
            const removed = removeFromInventory(inv, cur.typeId, dep);
            if (removed<=0){ try{ p.sendMessage("Could not remove items."); }catch{} return; }
            loadWorldShop(); if (!WORLD_SHOP[p.name]) WORLD_SHOP[p.name] = { id: cur.typeId, price: mine.price, qty: 0 };
            WORLD_SHOP[p.name].qty += removed; saveWorldShop();
            try{ p.sendMessage(`Deposited ${removed}. Now selling ${WORLD_SHOP[p.name].qty} total.`); }catch{}
          }).catch(()=>{});
        } else if (sel===1){
          const mf=new ModalFormData().title("Change Price").slider("New price", 1, 10000, 1, mine.price|0);
          mf.show(p).then(fr=>{ if(!fr||fr.canceled) return; const price=Math.max(1, Math.floor(Number(fr.formValues?.[0]||0))); loadWorldShop(); if (WORLD_SHOP[p.name]) WORLD_SHOP[p.name].price=price; saveWorldShop(); try{ p.sendMessage(`Price updated to ${price}.`); }catch{} }).catch(()=>{});
        } else if (sel===2){
          // cancel and return
          const ret = Math.max(0, Number(mine.qty||0));
          loadWorldShop(); delete WORLD_SHOP[p.name]; saveWorldShop();
          if (ret>0){ addToInventoryOrDrop(p, mine.id, ret); }
          try{ p.sendMessage("Listing canceled and items returned."); }catch{}
        } else if (sel===3){
          const cur = inv?.getItem(slot);
          if (!cur || !cur.typeId){ try{ p.sendMessage("Put the new item in your selected slot."); }catch{} return; }
          const priceDefault = mine.price|0 || 10;
          const maxDeposit = Math.max(1, Number(cur.amount||1));
          const mf=new ModalFormData().title("Replace Listing")
            .dropdown("Selected slot item", [`${displayItemName(cur.typeId)} x${cur.amount}`], 0)
            .slider("Price per item", 1, 10000, 1, priceDefault)
            .slider("Deposit amount", 1, Math.max(1, maxDeposit), 1, Math.max(1, maxDeposit));
          mf.show(p).then(fr=>{
            if (!fr || fr.canceled) return;
            const price=Math.max(1, Math.floor(Number(fr.formValues?.[1]||0)));
            const dep=Math.max(1, Math.floor(Number(fr.formValues?.[2]||0)));
            const removed = removeFromInventory(inv, cur.typeId, dep);
            if (removed<=0){ try{ p.sendMessage("Could not remove items."); }catch{} return; }
            // return previous listing items
            const ret = Math.max(0, Number(mine.qty||0));
            if (ret>0) addToInventoryOrDrop(p, mine.id, ret);
            loadWorldShop(); WORLD_SHOP[p.name] = { id: cur.typeId, price, qty: removed }; saveWorldShop();
            try{ p.sendMessage(`Replaced listing: ${removed} ${displayItemName(cur.typeId)} @ ${price}.`); }catch{}
          }).catch(()=>{});
        }
      }).catch(()=>{});
    }
  }catch{}
}

async function trySpendCoins(p, amount){
  try{
    if (globalThis.LABS_spendCoins){ return await globalThis.LABS_spendCoins(p, amount); }
    await p.runCommandAsync(`scoreboard players remove @s lenycoins ${Math.max(0,Math.floor(Number(amount)||0))}`);
    return true;
  } catch { return false; }
}

function creditCoins(name, amount){ try{ if (amount<=0) return; world.getDimension("overworld").runCommandAsync(`scoreboard players add \"${name}\" lenycoins ${amount}`).catch(()=>{}); }catch{} }

function openBrowseCategory(p, category){
  try{
    loadWorldShop();
    const entries = [];
    
    // Add category-specific items
    if (category === "special") {
      const LAVA_ID = "myname:hot_lava_chicken";
      const LAVA_PRICE = (typeof getPrice === 'function') ? getPrice(LAVA_ID, 50) : 50;
      if (LAVA_PRICE > 0) entries.push({ seller: null, id: LAVA_ID, price: LAVA_PRICE, qty: 9999999, global: true });
      const DOOM_ID = "myname:doom_blade";
      const DOOM_PRICE = (typeof getPrice === 'function') ? getPrice(DOOM_ID, 5000) : 5000;
      if (DOOM_PRICE > 0) entries.push({ seller: null, id: DOOM_ID, price: DOOM_PRICE, qty: 9999999, global: true });
    } else if (category === "bots") {
      const BOT_EGGS = [
        "myname:miner_bot_spawn_egg",
        "myname:fisher_bot_spawn_egg",
        "myname:farmer_bot_spawn_egg",
        "myname:beekeeper_bot_spawn_egg",
        "myname:shroom_bot_spawn_egg",
        "myname:butler_bot_spawn_egg",
        "myname:treasure_bot_spawn_egg",
        "myname:chef_bot_spawn_egg",
        "myname:control_bot_spawn_egg",
      ];
      for (const id of BOT_EGGS){ const price = (typeof getPrice === 'function') ? getPrice(id, 350) : 350; if (price > 0) entries.push({ seller: null, id, price, qty: 9999999, global: true }); }
    } else if (category === "animals") {
      const ANIMAL_EGGS = [
        "minecraft:cow_spawn_egg",
        "minecraft:chicken_spawn_egg",
        "minecraft:pig_spawn_egg",
        "minecraft:sheep_spawn_egg",
        "minecraft:bee_spawn_egg",
        "minecraft:panda_spawn_egg",
        "minecraft:llama_spawn_egg",
        "minecraft:horse_spawn_egg",
      ];
      for (const id of ANIMAL_EGGS){ const price = (typeof getPrice === 'function') ? getPrice(id, 150) : 150; if (price > 0) entries.push({ seller: null, id, price, qty: 9999999, global: true }); }
    } else if (category === "players") {
      const playerEntries = Object.entries(WORLD_SHOP||{})
        .map(([seller, rec])=>({ seller, id:String(rec?.id||""), price:Math.max(0,Number(rec?.price||0)), qty:Math.max(0,Number(rec?.qty||0)) }))
        .filter(e=>e.id && e.price>0 && e.qty>0);
      entries.push(...playerEntries);
    }

    if (!entries.length){ 
      try{ p.sendMessage(category === "players" ? "§7No player listings available.§r" : "§7This category is empty.§r"); }catch{} 
      openWorldShopMenu(p); 
      return; 
    }
    
    const categoryTitles = {
      "special": "§c§l🔥 Special Items§r",
      "bots": "§1§l🤖 Bot Eggs§r",
      "animals": "§2§l🐄 Animal Eggs§r",
      "players": "§6§l👤 Player Listings§r"
    };
    
    const labels = entries.map(en=> {
      const qtyS = en.global ? "§8∞§r" : "§0"+String(en.qty)+"§r";
      const coinIcon = "§6●§r";
      return `§0${displayItemName(en.id)}§r §8x${qtyS} ${coinIcon} §0${en.price}§r`;
    });
    labels.push("§6§l◄ Back to Store Menu§r");
    const pick=new ModalFormData().title(categoryTitles[category] || "Browse").dropdown("Select Item", labels, 0);
    pick.show(p).then(res=>{
      if (!res || res.canceled) { openWorldShopMenu(p); return; }
      const idx = Number(res.formValues?.[0]||0)|0; 
      if (idx === labels.length - 1) { openWorldShopMenu(p); return; } // Back button
      const en = entries[idx]; if(!en) return;
      const maxQty = Math.min(64, en.qty);
      const who2 = en.global ? "Server" : en.seller;
      const qtyForm = new ModalFormData().title(`Buy ${displayItemName(en.id)} from ${who2} @ ${en.price}`).slider("Quantity", 1, maxQty, 1, Math.min(16, maxQty));
      qtyForm.show(p).then(async fr=>{
        if (!fr || fr.canceled) { openBrowseCategory(p, category); return; }
        const qty = Math.max(1, Math.floor(Number(fr.formValues?.[0]||1)));
        if (en.global){
          const cost = qty * (en.price|0);
          try{ if (globalThis.LABS_getScore && (globalThis.LABS_getScore(p,'lenycoins')|0) < cost){ p.sendMessage?.("Not enough LenyCoins."); openBrowseCategory(p, category); return; } }catch{}
          const ok = await trySpendCoins(p, cost);
          if (!ok){ try{ p.sendMessage("Not enough LenyCoins."); }catch{} openBrowseCategory(p, category); return; }
          addToInventoryOrDrop(p, en.id, qty);
          try{ p.sendMessage(`Purchased ${qty} ${displayItemName(en.id)} for ${cost} LenyCoins.`); }catch{}
          openBrowseCategory(p, category);
          return;
        }
        // Reload/validate and clamp to current stock for player listings
        loadWorldShop(); const cur = WORLD_SHOP?.[en.seller]; if (!cur || cur.id!==en.id || (cur.qty|0)<=0){ try{ p.sendMessage("Listing no longer available."); }catch{} openBrowseCategory(p, category); return; }
        const take = Math.min(qty, cur.qty|0);
        const cost = take * (cur.price|0);
        // Precheck funds
        try{ if (globalThis.LABS_getScore && (globalThis.LABS_getScore(p,'lenycoins')|0) < cost){ p.sendMessage?.("Not enough LenyCoins."); openBrowseCategory(p, category); return; } }catch{}
        const ok = await trySpendCoins(p, cost);
        if (!ok){ try{ p.sendMessage("Not enough LenyCoins."); }catch{} openBrowseCategory(p, category); return; }
        // Deduct from seller listing and credit seller
        loadWorldShop(); const cur2 = WORLD_SHOP?.[en.seller]; if (!cur2 || cur2.id!==en.id || (cur2.qty|0) <= 0){ try{ p.sendMessage("Listing no longer available."); }catch{} openBrowseCategory(p, category); return; }
        const taken = Math.min(take, cur2.qty|0);
        cur2.qty = Math.max(0, (cur2.qty|0) - taken);
        if (cur2.qty<=0){ delete WORLD_SHOP[en.seller]; }
        saveWorldShop();
        if (en.seller){ creditCoins(en.seller, taken*(cur2.price||en.price||0)); }
        addToInventoryOrDrop(p, en.id, taken);
        try{ if (en.seller && en.seller!==p.name){ world.getDimension("overworld").runCommandAsync(`scoreboard players add \"${p.name}\" karma 25`).catch(()=>{}); } }catch{}
        try{ p.sendMessage(`Purchased ${taken} ${displayItemName(en.id)} from ${en.seller} for ${cost} LenyCoins.`); }catch{}
        openBrowseCategory(p, category);
      }).catch(()=>{});
    }).catch(()=>{});
  }catch{}
}

function openWorldShopMenu(p){
  try{
    const af = new ActionFormData()
      .title("§4§l🏪 World Store§r")
      .body("§8Browse by category or manage your listing:§r")
      .button("§c§l🔥 Special Items§r\n§8Rare & unique items§r")
      .button("§1§l🤖 Bot Eggs§r\n§8Helpful companion bots§r")
      .button("§2§l🐄 Animal Eggs§r\n§8Livestock spawn eggs§r")
      .button("§6§l👤 Player Listings§r\n§8Community marketplace§r")
      .button("§5§l📝 Manage My Listing§r\n§8Sell your items§r");
    af.show(p).then(res=>{
      if (!res || res.canceled) return;
      if (res.selection===0) openBrowseCategory(p, "special");
      else if (res.selection===1) openBrowseCategory(p, "bots");
      else if (res.selection===2) openBrowseCategory(p, "animals");
      else if (res.selection===3) openBrowseCategory(p, "players");
      else if (res.selection===4) openManageListing(p);
    }).catch(()=>{});
  }catch{}
}

// Expose global for quick menu integration
try{ globalThis.LABS_openWorldShopMenu = openWorldShopMenu; }catch{}

// ----- OP Pricing Config -----
const WS_PRICE_KEY = "labs_world_shop_prices"; // JSON: { id: price }
let WS_PRICES = {};
function loadWsPrices(){ try{ const raw=world.getDynamicProperty?.(WS_PRICE_KEY); WS_PRICES = raw && typeof raw==='string' ? JSON.parse(raw) : {}; }catch{ WS_PRICES={}; } }
function saveWsPrices(){ try{ const s=JSON.stringify(WS_PRICES||{}); world.setDynamicProperty?.(WS_PRICE_KEY, s.length>6000?s.slice(0,6000):s); }catch{} }
try{ world.afterEvents.worldInitialize.subscribe(ev=>{ try{ const DP=globalThis.DynamicPropertiesDefinition; if (typeof DP==='function'){ const def=new DP(); def.defineString(WS_PRICE_KEY, 6000); ev.propertyRegistry?.registerWorldDynamicProperties?.(def); } }catch{} system.run(()=>{ loadWsPrices(); }); }); }catch{}
function getPrice(id, def){ try{ const n=Math.max(0, Math.floor(Number((WS_PRICES||{})[id] ?? def))); return n; }catch{ return def|0; } }

function openWorldStorePricingMenu(player){
  try{
    // OP guard
    try{ if (!player.hasTag || !player.hasTag("labs_admin")){ player.sendMessage?.("OP only. /tag @s add labs_admin"); return; } }catch{}
    // Items to configure
    const LAVA_ID = "myname:hot_lava_chicken";
    const LAVA_DEF = 50;
    const DOOM_ID = "myname:doom_blade";
    const DOOM_DEF = 5000;
    const BOT_EGGS = [
      "myname:miner_bot_spawn_egg",
      "myname:fisher_bot_spawn_egg",
      "myname:farmer_bot_spawn_egg",
      "myname:beekeeper_bot_spawn_egg",
      "myname:shroom_bot_spawn_egg",
      "myname:butler_bot_spawn_egg",
      "myname:treasure_bot_spawn_egg",
      "myname:chef_bot_spawn_egg",
      "myname:control_bot_spawn_egg",
    ];
    const BOT_DEF = 350;
    const ANIMAL_EGGS = [
      "minecraft:cow_spawn_egg",
      "minecraft:chicken_spawn_egg",
      "minecraft:pig_spawn_egg",
      "minecraft:sheep_spawn_egg",
      "minecraft:bee_spawn_egg",
      "minecraft:panda_spawn_egg",
      "minecraft:llama_spawn_egg",
      "minecraft:horse_spawn_egg",
    ];
    const ANIMAL_DEF = 150;

    const showRoot = ()=>{
      try{
        const af=new ActionFormData().title("World Store Pricing (OP)").body("Edit global prices for server-sold items.\nSet price to 0 to disable an item.")
          .button("Edit Prices")
          .button("Back");
        af.show(player).then(res=>{
          if (!res || res.canceled) {
            if (globalThis.showOpToolsMenu) system.runTimeout(() => globalThis.showOpToolsMenu(player), 1);
            return;
          }
          if (res.selection===1) {
            if (globalThis.showOpToolsMenu) system.runTimeout(() => globalThis.showOpToolsMenu(player), 1);
            return;
          } // Back
          // Edit
          loadWsPrices();
          const mf=new ModalFormData().title("Edit World Store Prices");
          try{ mf.slider(`HOT Lava Chicken @ ${getPrice(LAVA_ID,LAVA_DEF)}`, 0, 10000, 5, getPrice(LAVA_ID,LAVA_DEF)); }catch{}
          try{ mf.slider(`Sword of Doom @ ${getPrice(DOOM_ID,DOOM_DEF)}`, 0, 10000, 5, getPrice(DOOM_ID,DOOM_DEF)); }catch{}
          for (const id of BOT_EGGS){ try{ mf.slider(`${displayItemName(id)} @ ${getPrice(id,BOT_DEF)}`, 0, 10000, 5, getPrice(id,BOT_DEF)); }catch{} }
          for (const id of ANIMAL_EGGS){ try{ mf.slider(`${displayItemName(id)} @ ${getPrice(id,ANIMAL_DEF)}`, 0, 10000, 5, getPrice(id,ANIMAL_DEF)); }catch{} }
          mf.show(player).then(fr=>{
            if (!fr || fr.canceled) { showRoot(); return; }
            const vals = fr.formValues||[]; let i=0; loadWsPrices();
            WS_PRICES[LAVA_ID] = Math.max(0, Math.floor(Number(vals[i++]||getPrice(LAVA_ID,LAVA_DEF))));
            WS_PRICES[DOOM_ID] = Math.max(0, Math.floor(Number(vals[i++]||getPrice(DOOM_ID,DOOM_DEF))));
            for (const id of BOT_EGGS){ WS_PRICES[id] = Math.max(0, Math.floor(Number(vals[i++]||getPrice(id,BOT_DEF)))); }
            for (const id of ANIMAL_EGGS){ WS_PRICES[id] = Math.max(0, Math.floor(Number(vals[i++]||getPrice(id,ANIMAL_DEF)))); }
            saveWsPrices();
            try{ player.sendMessage("World Store prices updated. (Set to 0 to hide items)"); }catch{}
            showRoot();
          }).catch(()=>{});
        }).catch(()=>{});
      }catch{}
    };
    showRoot();
  }catch{}
}
try{ globalThis.LABS_openWorldStorePricingMenu = openWorldStorePricingMenu; }catch{}

