import { world, system, ItemStack } from "@minecraft/server";
import { ModalFormData, ActionFormData } from "@minecraft/server-ui";
try { console.warn?.("[LABS] storekeeper_bot.js loaded"); } catch (e) {}

const SK_STATE = new Map(); // id -> { owner:string, pos:{x,y,z}, storage?:{x,y,z} }
const PRICE_TAG_PREFIX = "skp|"; // tag format: skp|<itemId>|<price> (legacy, per-entity)
const OWNER_TAG_PREFIX = "sko|"; // tag format: sko|<ownerName>
const STOCK_TAG_PREFIX = "sks|"; // tag format: sks|<itemId>|<qty> (legacy, per-entity)

// New per-owner shared storage and prices
const OWNER_STOCK = new Map(); // ownerName -> { itemId: qty }
const OWNER_PRICES = new Map(); // ownerName -> { itemId: price }
const OWNER_STOCK_TAG_PREFIX = "skos|"; // on player: skos|<itemId>|<qty>
const OWNER_PRICE_TAG_PREFIX = "skpp|"; // on player: skpp|<itemId>|<price>

// Structures marketplace (persistent)
const STRUCT_INDEX_KEY = "labs_struct_index"; // read-only here (written by constructor)
const STRUCT_SALES_KEY = "labs_struct_sales"; // write/read here: owner -> { name: { price:number, enabled:boolean } }
let STRUCT_SALES = {};
function loadSales(){ try{ const raw=world.getDynamicProperty?.(STRUCT_SALES_KEY); STRUCT_SALES = raw && typeof raw==='string' ? JSON.parse(raw) : {}; }catch{ STRUCT_SALES={}; } }
function saveSales(){ try{ const s=JSON.stringify(STRUCT_SALES||{}); world.setDynamicProperty?.(STRUCT_SALES_KEY, s.length>7900?s.slice(0,7900):s); }catch{} }
function readStructIndex(){ try{ const raw=world.getDynamicProperty?.(STRUCT_INDEX_KEY); const idx = raw && typeof raw==='string'? JSON.parse(raw):{}; return idx||{}; }catch{ return {}; } }
try{
  world.afterEvents.worldInitialize.subscribe(ev=>{
    try{ const DP = globalThis.DynamicPropertiesDefinition; if (typeof DP === 'function'){ const def=new DP(); def.defineString(STRUCT_SALES_KEY, 8000); ev.propertyRegistry?.registerWorldDynamicProperties?.(def); } }catch{}
    system.run(()=>{ loadSales(); ensureCoinsObjective(); });
  });
}catch{}

function getOwnerStock(owner){ let m=OWNER_STOCK.get(owner); if(!m){ m={}; OWNER_STOCK.set(owner,m);} return m; }
function getOwnerPrices(owner){ let m=OWNER_PRICES.get(owner); if(!m){ m={}; OWNER_PRICES.set(owner,m);} return m; }
function addToOwnerStock(owner,itemId,amount){ const st=getOwnerStock(owner); st[itemId]=(st[itemId]||0)+Math.max(0,amount||0); }
function takeFromOwnerStock(owner,itemId,amount){ const st=getOwnerStock(owner); const cur=st[itemId]||0; const take=Math.min(cur, Math.max(0,amount||0)); st[itemId]=cur-take; if(st[itemId]<=0) delete st[itemId]; return take; }
function setOwnerPrice(owner,itemId,price){ const pr=getOwnerPrices(owner); pr[itemId]=Math.max(0,Math.floor(Number(price)||0)); }
 
 function titleCase(s){ return String(s||"").replace(/[_-]+/g," ").replace(/\b\w/g, c=>c.toUpperCase()).trim(); }
 function displayItemName(id){
   const raw = String(id||"");
   const clean = raw.replace(/^item\./, "");
   if (clean === "myname:fly_high_shroom") return "Fly High Shroom";
   if (clean === "myname:zoom_shroom") return "Zoom Shroom";
   const parts = clean.split(":"); const base = parts.length>1?parts[1]:parts[0];
   return titleCase(base);
 }

function syncOwnerToPlayer(owner){ try{ const p=world.getPlayers().find(x=>x.name===owner); if(!p) return; const tags=p.getTags?.()||[]; // wipe old
  for(const t of tags){ if(String(t).startsWith(OWNER_STOCK_TAG_PREFIX) || String(t).startsWith(OWNER_PRICE_TAG_PREFIX)) try{ p.removeTag(t);}catch (e) {} }
  const st=getOwnerStock(owner); const pr=getOwnerPrices(owner);
  for(const k of Object.keys(st)){ try{ p.addTag?.(`${OWNER_STOCK_TAG_PREFIX}${k}|${st[k]}`); }catch (e) {} }
  for(const k of Object.keys(pr)){ try{ p.addTag?.(`${OWNER_PRICE_TAG_PREFIX}${k}|${pr[k]}`); }catch (e) {} }
} catch (e) {}
}
function loadOwnerFromPlayer(owner){
  try {
    const p = world.getPlayers().find(x => x.name === owner);
    if (!p) return;
    const tags = p.getTags?.() || [];
    // rebuild stock/prices from tags to avoid cumulative duplication
    const newStock = {};
    const newPrices = {};
    for (const t of tags) {
      const s = String(t);
      if (s.startsWith(OWNER_STOCK_TAG_PREFIX)) {
        const parts = s.split("|");
        if (parts.length === 3) {
          const id = parts[1];
          const qty = Math.max(0, Math.floor(Number(parts[2]) || 0));
          newStock[id] = (newStock[id]||0) + qty;
        }
      } else if (s.startsWith(OWNER_PRICE_TAG_PREFIX)) {
        const parts = s.split("|");
        if (parts.length === 3) {
          const id = parts[1];
          const price = Math.max(0, Math.floor(Number(parts[2]) || 0));
          newPrices[id] = price;
        }
      }
    }
    OWNER_STOCK.set(owner, newStock);
    OWNER_PRICES.set(owner, newPrices);
  } catch (e) {}
}

function toBlk(v){ return { x: Math.floor(v.x), y: Math.floor(v.y), z: Math.floor(v.z) }; }

function faceNearestPlayer(e){
  let nearest=null,best=999999; for (const p of world.getPlayers()){ if(p.dimension.id!==e.dimension.id) continue; const dx=p.location.x-e.location.x, dz=p.location.z-e.location.z; const d2=dx*dx+dz*dz; if(d2<best){best=d2;nearest=p;} }
  if (!nearest) return { player:null };
  try { const r=nearest.getRotation?.(); if(r&&typeof r.y==='number') e.setRotation?.({x:0,y:r.y}); } catch (e) {}
  return { player: nearest };
}

function setOwnerTag(e, name){
  try{ const tags=e.getTags?.()||[]; for(const t of tags){ if(String(t).startsWith(OWNER_TAG_PREFIX)) try{e.removeTag(t);}catch (e) {} }
    e.addTag?.(`${OWNER_TAG_PREFIX}${name}`);
  }catch (e) {}
}
function getOwnerTag(e){ try{ const tags=e.getTags?.()||[]; for(const t of tags){ if(String(t).startsWith(OWNER_TAG_PREFIX)) return String(t).slice(OWNER_TAG_PREFIX.length); } }catch (e) {} return undefined; }

const WOODS = ["oak","spruce","birch","jungle","acacia","dark_oak","mangrove","cherry","bamboo"];
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)] }

function placeStarterChest(e){
  const dim=e.dimension; const base=toBlk(e.location);
  const spots=[{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}];
  let chestPos=null;
  for(const s of spots){ const p={x:base.x+s.x,y:base.y,z:base.z+s.z}; try{ const b=dim.getBlock(p); if(b && String(b.typeId||"")!=="minecraft:air") continue; dim.getBlock(p)?.setType("minecraft:chest"); chestPos=p; break; }catch (e) {} }
  if (!chestPos) return;
  // Fill chest with building materials
  try{
    const cont = dim.getBlock(chestPos)?.getComponent("minecraft:inventory")?.container; if (!cont) return;
    const wood = pick(WOODS);
    const plankId = wood+"_planks";
    const trapId = wood+"_trapdoor";
    const signId = wood+"_sign";
    const items = [
      new ItemStack(`minecraft:${plankId}`, 64),
      new ItemStack("minecraft:birch_stairs", 4),
      new ItemStack(`minecraft:${trapId}`, 5),
      new ItemStack(`minecraft:${signId}`, 3)
    ];
    let i=0; for(const it of items){ cont.setItem(i++, it); }
    // remember storage reference (use nearby container for shop stock too)
    SK_STATE.set(e.id, { ...(SK_STATE.get(e.id)||{}), storage: chestPos });
  }catch (e) {}
}

function ensureCoinsObjective(){
  const dim = world.getDimension("overworld"); if(!dim) return;
  try{ dim.runCommandAsync("scoreboard objectives add lenycoins dummy LenyCoins").catch(()=>{}); }catch (e) {}
  try{ dim.runCommandAsync("scoreboard objectives add karma dummy Karma").catch(()=>{}); }catch (e) {}
}
function getCoins(player){ try{ const r=player.runCommandAsync?.("scoreboard players get @s lenycoins"); r?.catch?.(()=>{}); return 0; }catch (e) {} return 0; }

function addCoins(player, amount){ const dim=world.getDimension("overworld"); try{ dim.runCommandAsync(`scoreboard players add "${player.name}" lenycoins ${amount}`).catch(()=>{}); }catch (e) {} }
function removeCoins(player, amount){ const dim=world.getDimension("overworld"); try{ dim.runCommandAsync(`scoreboard players remove "${player.name}" lenycoins ${amount}`).catch(()=>{}); }catch (e) {} }

function getStorage(e){
  const st=SK_STATE.get(e.id)||{};
  const dim=e.dimension; const base=toBlk(e.location);
  const candidates=[];
  const radius=3;
  for(let dx=-radius;dx<=radius;dx++) for(let dy=-1;dy<=2;dy++) for(let dz=-radius;dz<=radius;dz++){
    try{
      const b=dim.getBlock({x:base.x+dx,y:base.y+dy,z:base.z+dz});
      if (!b) continue;
      const id=String(b.typeId||"");
      if (id==="minecraft:barrel" || id==="minecraft:chest") candidates.push(b.location);
    }catch (e) {}
  }
  const pos = candidates[0] || st.storage || null;
  if (!pos) return null;
  try{ return dim.getBlock(pos)?.getComponent("minecraft:inventory")?.container; }catch (e) {}
  return null;
}

function listPrices(e){ const tags=e.getTags?.()||[]; const map={}; for(const t of tags){ if(String(t).startsWith(PRICE_TAG_PREFIX)){ const parts=String(t).split("|"); if(parts.length===3){ map[parts[1]]=Number(parts[2])||0; } }} return map; }
function setPrice(e, itemId, price){ try{ const tags=e.getTags?.()||[]; for(const t of tags){ if(String(t).startsWith(`${PRICE_TAG_PREFIX}${itemId}|`)) try{e.removeTag(t);}catch (e) {} } e.addTag?.(`${PRICE_TAG_PREFIX}${itemId}|${price}`); }catch (e) {} }

function readStock(e){ const tags=e.getTags?.()||[]; const map={}; for(const t of tags){ if(String(t).startsWith(STOCK_TAG_PREFIX)){ const parts=String(t).split("|"); if(parts.length===3){ map[parts[1]]=Math.max(0, Math.floor(Number(parts[2])||0)); } }} return map; }
function writeStockEntry(e, itemId, qty){ try{ const tags=e.getTags?.()||[]; for(const t of tags){ if(String(t).startsWith(`${STOCK_TAG_PREFIX}${itemId}|`)) try{e.removeTag(t);}catch (e) {} } e.addTag?.(`${STOCK_TAG_PREFIX}${itemId}|${Math.max(0,Math.floor(qty||0))}`); }catch (e) {} }
function addToStock(e, itemId, amount){ const stock=readStock(e); const cur=stock[itemId]||0; writeStockEntry(e,itemId, cur+amount); }
function takeFromStock(e, itemId, amount){ const stock=readStock(e); const cur=stock[itemId]||0; const take=Math.min(cur, amount); writeStockEntry(e,itemId, cur - take); return take; }

function openOwnerMenu(e, player){
  const af = new ActionFormData().title("StoreKeeper: Owner").body("Choose what to manage:")
    .button("Sell Items")
    .button("Sell Structures")
    .button("Retrieve Items");
  af.show(player).then(res=>{
    if(!res || res.canceled) return;
    if (res.selection===0) openOwnerItemsMenu(e, player);
    else if (res.selection===1) openOwnerStructuresMenu(e, player);
    else if (res.selection===2) openOwnerRetrieveMenu(e, player);
  }).catch(()=>{});
}

function openOwnerItemsMenu(e, player){
  const ownerName = getOwnerTag(e) || SK_STATE.get(e.id)?.owner || player?.name || "";
  loadOwnerFromPlayer(ownerName);
  // Always use first hotbar slot (index 0) as the sale item slot
  const slot = 0;
  const cont = player?.getComponent?.("inventory")?.container;
  const held = cont?.getItem(slot);
  const heldInfo = held ? `${held.typeId} x${held.amount}` : "(place item in first slot)";
  if (!held) { try{ player.sendMessage("Hint: place the item to sell in your first hotbar slot (slot 1)." ); }catch (e) {} }
  const existingPrice = Number(getOwnerPrices(ownerName)?.[held?.typeId||""]||0)|0;
  const priceDefault = existingPrice>0? existingPrice : 10;
  const maxDeposit = Math.max(0, Number(held?.amount||0));
  const form=new ModalFormData()
    .title("StoreKeeper: Manage Items")
    .dropdown("First slot item (Slot 1)", [heldInfo], 0)
    .slider("Price per item", 1, 10000, 1, priceDefault)
    .slider("Deposit amount", 1, Math.max(1, maxDeposit), 1, Math.max(1, maxDeposit));
  form.show(player).then(res=>{
    if (!res || res.canceled) return;
    const priceNum = Math.floor(Number(res.formValues?.[1]||0));
    const depNum = Math.floor(Number(res.formValues?.[2]||0));
    if (!held || !held.typeId || priceNum<=0 || depNum<=0) { try{ player.sendMessage("Place the item to sell in the first hotbar slot, set a price, and deposit >0."); }catch (e) {} return; }
    // Re-read first slot to avoid dupes if changed during form
    const curNow = cont?.getItem?.(slot);
    if (!curNow || curNow.typeId!==held.typeId){ try{ player.sendMessage("First slot changed. Put the item back in Slot 1 and try again."); }catch{} return; }
    // Respect existing price if already selling this item; ignore new price
    const existing = Number(getOwnerPrices(ownerName)?.[held.typeId]||0)|0;
    let finalPrice = priceNum;
    if (existing>0 && existing!==priceNum){ finalPrice = existing; }
    // set owner price and move items into shared owner stock
    setOwnerPrice(ownerName, held.typeId, finalPrice);
    const takeReq = Math.min(depNum, curNow.amount|0);
    // Robust removal: prefer Slot 1, then other slots with same item type
    let removed = 0;
    const removeFromSlot = (idx)=>{
      try{
        const it = cont.getItem(idx);
        if (!it || it.typeId!==held.typeId) return 0;
        const take = Math.min(takeReq-removed, it.amount|0);
        if (take<=0) return 0;
        it.amount -= take;
        try{ cont.setItem(idx, it.amount>0?it:undefined); }catch{}
        if (it.amount<=0){ try{ cont.setItem(idx, undefined); }catch{} }
        return take;
      }catch{return 0;}
    };
    removed += removeFromSlot(slot);
    for (let i=0;i<cont.size && removed<takeReq;i++){ if (i===slot) continue; removed += removeFromSlot(i); }
    if (removed<=0){ try{ player.sendMessage("Could not remove items from inventory."); }catch{} return; }
    // add to shared stock
    addToOwnerStock(ownerName, held.typeId, removed);
    syncOwnerToPlayer(ownerName);
    try{ player.sendMessage(`Listed ${removed} ${displayItemName(held.typeId)} @ ${finalPrice} each from slot 1. (Shared across your shops)`); }catch (e) {}
  }).catch(()=>{});
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

function openOwnerRetrieveMenu(e, player){
  const ownerName = getOwnerTag(e) || SK_STATE.get(e.id)?.owner || player?.name || "";
  loadOwnerFromPlayer(ownerName);
  const st = getOwnerStock(ownerName);
  const entries = Object.keys(st||{}).filter(id=> (st[id]|0)>0).map(id=>({id, qty: st[id]|0}));
  if (!entries.length){ try{ player.sendMessage("Your store has no items to retrieve."); }catch{} return; }
  const labels = entries.map(en=> `${displayItemName(en.id)} x${en.qty}`);
  const pick=new ModalFormData().title("Retrieve Items").dropdown("Item", labels, 0);
  pick.show(player).then(res=>{
    if (!res || res.canceled) return; const idx = Number(res.formValues?.[0]||0)|0; const en = entries[idx]; if(!en) return;
    const qtyForm = new ModalFormData().title(`Retrieve ${displayItemName(en.id)} (in stock: ${en.qty})`).slider("Quantity", 1, en.qty, 1, Math.min(16, en.qty));
    qtyForm.show(player).then(fr=>{
      if (!fr || fr.canceled) return; const want = Math.max(1, Math.floor(Number(fr.formValues?.[0]||1))); const take = takeFromOwnerStock(ownerName, en.id, want);
      syncOwnerToPlayer(ownerName);
      if (take<=0){ try{ player.sendMessage("Nothing retrieved."); }catch{} return; }
      addToInventoryOrDrop(player, en.id, take);
      try{ player.sendMessage(`Retrieved ${take} ${displayItemName(en.id)} from your store.`); }catch{}
    }).catch(()=>{});
  }).catch(()=>{});
}

function openOwnerStructuresMenu(e, player){
  const ownerName = getOwnerTag(e) || SK_STATE.get(e.id)?.owner || player?.name || "";
  const idx = readStructIndex();
  const mine = Array.isArray(idx[ownerName]) ? idx[ownerName] : [];
  if (!mine.length){ try{ player.sendMessage("You have no saved constructions. Use the Constructor stick to save structures first."); }catch{} return; }
  // Build labels with current price/enabled
  const sales = STRUCT_SALES[ownerName] || {};
  const labels = mine.map(it=>{
    const name = String(it?.name||""); const meta = sales[name]||{}; const price = meta.price||0; const on = !!meta.enabled;
    const sz = it?.size; const dims = sz?` ${sz.dx}x${sz.dy}x${sz.dz}`:"";
    return `${name}${dims} — ${on?"ON":"OFF"}${price?` @ ${price}`:""}`;
  });
  const form=new ModalFormData().title("Sell Structures")
    .dropdown("Structure", labels, 0)
    .slider("Price", 0, 10000, 10, Math.min(1000, Number((STRUCT_SALES[ownerName]?.[mine[0]?.name||""]?.price)||0)))
    .toggle("Enabled for sale", Boolean(STRUCT_SALES[ownerName]?.[mine[0]?.name||""]?.enabled));
  form.show(player).then(res=>{
    if(!res||res.canceled) return;
    const idxSel = Number(res.formValues?.[0]||0)|0; const price = Math.max(0, Math.floor(Number(res.formValues?.[1]||0))); const enable = !!res.formValues?.[2];
    const entry = mine[idxSel]; if(!entry){ try{ player.sendMessage("Invalid selection."); }catch{} return; }
    if (!STRUCT_SALES[ownerName]) STRUCT_SALES[ownerName] = {};
    STRUCT_SALES[ownerName][entry.name] = { price, enabled: enable };
    saveSales();
    try{ player.sendMessage(`${enable?"Listed":"Unlisted"} '${entry.name}' ${price?`@ ${price} LenyCoins`:"(no price)"}.`); }catch{}
  }).catch(()=>{});
}

function openBuyerMenu(e, player){
  const af = new ActionFormData().title("StoreKeeper: Buy/Sell").body("Choose an option:")
    .button("Buy Items")
    .button("Buy Structures")
    .button("Sell Ingots (5 LenyCoins each)");
  af.show(player).then(res=>{
    if(!res||res.canceled) return;
    if (res.selection===0) openBuyerItemsMenu(e, player);
    else if (res.selection===1) openBuyerStructuresMenu(e, player);
    else if (res.selection===2) openBuyerSellIngots(e, player);
  }).catch(()=>{});
}

function countItems(inv, typeId){ try{ let n=0; for(let i=0;i<inv.size;i++){ const it=inv.getItem(i); if(it && it.typeId===typeId) n+=it.amount; } return n; }catch{ return 0; }
}
function removeItems(inv, typeId, amount){ try{ let left=amount|0; for(let i=0;i<inv.size && left>0;i++){ const it=inv.getItem(i); if(it && it.typeId===typeId){ const take=Math.min(left,it.amount); it.amount-=take; left-=take; inv.setItem(i, it.amount>0?it:undefined); } } return amount-left; }catch{ return 0; }
}
function openBuyerSellIngots(e, player){
  try{
    const inv = player.getComponent("inventory")?.container; if (!inv){ try{ player.sendMessage("Inventory not available."); }catch{} return; }
    const INGOTS = ["minecraft:iron_ingot","minecraft:gold_ingot","minecraft:copper_ingot","minecraft:netherite_ingot"];
    const PRICE = 5;
    const options = [];
    for (const id of INGOTS){ const n = countItems(inv, id); if (n>0) options.push({ id, n }); }
    if (!options.length){ try{ player.sendMessage("You have no ingots to sell."); }catch{} return; }
    const labels = options.map(o=> `${displayItemName(o.id)} x${o.n} @ ${PRICE} each`);
    const form=new ModalFormData().title("Sell Ingots").dropdown("Ingot", labels, 0).textField("Quantity to sell", `<= available`, "1");
    form.show(player).then(res=>{
      if (!res || res.canceled) return;
      const idx = Number(res.formValues?.[0]||0)|0; const qty = Math.max(1, Math.floor(Number(res.formValues?.[1]||1)));
      const opt = options[idx]; if (!opt) return;
      const sell = Math.min(qty, opt.n);
      const removed = removeItems(inv, opt.id, sell);
      if (removed<=0){ try{ player.sendMessage("Could not remove items."); }catch{} return; }
      const total = removed * PRICE;
      try{ const dim=world.getDimension("overworld"); dim.runCommandAsync(`scoreboard players add \"${player.name}\" lenycoins ${total}`); }catch{}
      try{ player.sendMessage(`Sold ${removed} ${displayItemName(opt.id)} for ${total} LenyCoins.`); }catch{}
    }).catch(()=>{});
  }catch{}
}

function openBuyerItemsMenu(e, player){
const ownerName = getOwnerTag(e) || SK_STATE.get(e.id)?.owner || "";
loadOwnerFromPlayer(ownerName);
const prices = getOwnerPrices(ownerName);
const stockMap = getOwnerStock(ownerName);
const entries = [];
// Add all stocked items with price > 0
for (const id of Object.keys(stockMap)){
const price = prices[id]||0; const qty = stockMap[id]||0; if (price>0 && qty>0){ entries.push({id,price,qty}); }
}
// Always include unlimited HOT Lava Chicken
const lavaId = "myname:hot_lava_chicken";
const lavaPrice = prices[lavaId] || 50;
if (lavaPrice>0){ entries.push({id: lavaId, price: lavaPrice, qty: 9999999}); }
// Global bot eggs available at any shop for a fixed price
const BOT_EGGS = [
  "myname:miner_bot_spawn_egg",
  "myname:fisher_bot_spawn_egg",
  "myname:farmer_bot_spawn_egg",
  "myname:beekeeper_bot_spawn_egg",
  "myname:shroom_bot_spawn_egg",
  "myname:butler_bot_spawn_egg",
  "myname:treasure_bot_spawn_egg",
];
const BOT_EGG_PRICE = 350;
for (const id of BOT_EGGS){ entries.push({ id, price: BOT_EGG_PRICE, qty: 9999999 }); }
const UNLIMITED = new Set([lavaId, ...BOT_EGGS]);
if (!entries.length){ try{ player.sendMessage("Shop is empty."); }catch (e) {} return; }
const labels = entries.map(en => displayItemName(en.id) + " x" + (en.qty >= 9999999 ? "inf" : String(en.qty)) + " @ " + en.price);
const pickForm=new ModalFormData().title("StoreKeeper: Buy Items").dropdown("Item", labels, 0);
pickForm.show(player).then(res=>{
  if (!res || res.canceled) return;
  const selIdx = Number(res.formValues?.[0]||0)|0;
  const en = entries[selIdx]; if(!en) return;
  const maxQty = UNLIMITED.has(en.id) ? 64 : Math.max(1, en.qty);
  const qtyForm = new ModalFormData().title(`Buy ${displayItemName(en.id)} @ ${en.price} each`).slider("Quantity", 1, maxQty, 1, Math.min(16, maxQty));
  qtyForm.show(player).then(async res2=>{
    if (!res2 || res2.canceled) return;
    const qty = Math.max(1, Math.floor(Number(res2.formValues?.[0]||1)));
    const dim=world.getDimension("overworld");
    // Pre-check player can afford desired quantity
    const desiredCost = en.price * qty;
    try{
      const canSpend = (globalThis.LABS_spendCoins ? ((await globalThis.LABS_spendCoins(player, 0)), (globalThis.LABS_getScore(player,'lenycoins')>=desiredCost)) : true);
      if (!canSpend){ try{ player.sendMessage("Not enough LenyCoins."); }catch{} return; }
    }catch{}
    let taken = qty;
    if (!UNLIMITED.has(en.id)){
      taken = takeFromOwnerStock(ownerName, en.id, qty);
      syncOwnerToPlayer(ownerName);
      if (taken<=0){ try{ player.sendMessage("Out of stock."); }catch{} return; }
    }
    const totalCost = en.price * taken;
    // Final spend (for unlimited or clamped stock); guarded by helper
    try{
      let ok=true;
      if (globalThis.LABS_spendCoins){ ok = await globalThis.LABS_spendCoins(player, totalCost); }
      else { await dim.runCommandAsync(`scoreboard players remove \"${player.name}\" lenycoins ${totalCost}`); }
      if (!ok){ try{ player.sendMessage("Not enough LenyCoins."); }catch{} return; }
    }catch{ try{ player.sendMessage("Not enough LenyCoins."); }catch{} return; }
    if (!UNLIMITED.has(en.id) && ownerName){ try{ dim.runCommandAsync(`scoreboard players add \"${ownerName}\" lenycoins ${totalCost}`).catch(()=>{}); }catch (e) {} }
    try { if (ownerName && ownerName!==player.name){ dim.runCommandAsync(`scoreboard players add \"${player.name}\" karma 25`); } } catch (e) {}
    try{ const inv=player.getComponent("inventory").container; let added=taken; const stackMax=new ItemStack(en.id,1).maxAmount||64; while(added>0){ const put=Math.min(stackMax, added); inv.addItem?.(new ItemStack(en.id, put)); added-=put; } }catch (e) {}
    try{ player.sendMessage(`Purchased ${taken} ${displayItemName(en.id)} for ${totalCost} LenyCoins.`); }catch (e) {}
  }).catch(()=>{});
}).catch(()=>{});
}

function openBuyerStructuresMenu(e, player){
  const ownerName = getOwnerTag(e) || SK_STATE.get(e.id)?.owner || "";
  const sales = STRUCT_SALES[ownerName] || {};
  const idx = readStructIndex();
  const mine = Array.isArray(idx[ownerName]) ? idx[ownerName] : [];
  const entries = [];
  for (const it of mine){ const name=String(it?.name||""); const meta = sales[name]; if (meta && meta.enabled && (meta.price||0) > 0){ entries.push({ name, price: meta.price, file: it.file, size: it.size }); } }
  if (!entries.length){ try{ player.sendMessage("No structures for sale here."); }catch{} return; }
  const labels = entries.map(en=>{
    const s = en.size; const dims = s?` ${s.dx}x${s.dy}x${s.dz}`:""; return `${en.name}${dims} @ ${en.price}`;
  });
  const form=new ModalFormData().title("StoreKeeper: Buy Structures").dropdown("Structure", labels, 0);
  form.show(player).then(async res=>{
    if(!res||res.canceled) return; const sel=Number(res.formValues?.[0]||0)|0; const en=entries[sel]; if(!en) return;
    const cost = en.price;
    const dim=world.getDimension("overworld");
    try{ let ok=true; if (globalThis.LABS_spendCoins){ ok = await globalThis.LABS_spendCoins(player, cost); } else { await dim.runCommandAsync(`scoreboard players remove \"${player.name}\" lenycoins ${cost}`); } if(!ok){ player.sendMessage?.("Not enough LenyCoins."); return; } }
    catch{ try{ player.sendMessage("Not enough LenyCoins."); }catch{} return; }
    // credit seller
    try{ if(ownerName) dim.runCommandAsync(`scoreboard players add \"${ownerName}\" lenycoins ${cost}`).catch(()=>{}); }catch{}
    // add to buyer's construct index (unique name)
    try{
      const raw=world.getDynamicProperty?.(STRUCT_INDEX_KEY); const idxAll = raw && typeof raw==='string'? JSON.parse(raw):{}; const buyerName = player.name;
      const existing = Array.isArray(idxAll[buyerName]) ? idxAll[buyerName] : [];
      const names = new Set(existing.map(it=>String(it?.name||"")));
      let base = en.name; let name = base; let i=1; while(names.has(name)){ name = `${base}_${i++}`; }
      const rec = { name, file: en.file, size: en.size };
      existing.push(rec); idxAll[buyerName] = existing; const s=JSON.stringify(idxAll||{});
      world.setDynamicProperty?.(STRUCT_INDEX_KEY, s.length>7900?s.slice(0,7900):s);
      try{ globalThis.LABS_rebuildStructs?.(); }catch{}
      try{ player.sendMessage(`Purchased structure '${name}'. Use a Constructor bot to place it.`); }catch{}
    }catch{}
  }).catch(()=>{});
}

// Chat command: !shop opens nearest
try{
  world.beforeEvents.chatSend.subscribe(ev=>{
    const msg=(ev.message||"").trim().toLowerCase(); if(msg!=="!shop") return; ev.cancel=true;
    const p=ev.sender; const dim=p.dimension; let best=null,bd2=999999; for(const e of dim.getEntities({type:"myname:storekeeper_bot"})){ const dx=e.location.x-p.location.x, dz=e.location.z-p.location.z; const d2=dx*dx+dz*dz; if(d2<bd2){bd2=d2; best=e;} }
    if(!best){ try{ p.sendMessage("No StoreKeeper nearby."); }catch (e) {} return; }
    const owner = getOwnerTag(best) || SK_STATE.get(best.id)?.owner || "";
    if (owner && owner===p.name) system.runTimeout(()=>openOwnerMenu(best,p),0); else system.runTimeout(()=>openBuyerMenu(best,p),0);
  });
} catch (e) {}

// Global entry: open shop menu for a player (nearest StoreKeeper)
try{
  globalThis.LABS_openShopMenu = function(player){
    try{
      const dim=player.dimension; let best=null,bd2=999999; for(const e of dim.getEntities({type:"myname:storekeeper_bot"})){ const dx=e.location.x-player.location.x, dz=e.location.z-player.location.z; const d2=dx*dx+dz*dz; if(d2<bd2){bd2=d2; best=e;} }
      if(!best){ try{ player.sendMessage("No StoreKeeper nearby."); }catch (e) {} return; }
      const owner = getOwnerTag(best) || SK_STATE.get(best.id)?.owner || "";
      if (owner && owner===player.name){
        const af=new ModalFormData().title("StoreKeeper")
          .dropdown("Action", ["Manage (owner)", "Buy from this shop"], 0);
        af.show(player).then(res=>{
          if(!res||res.canceled) return; const sel = res.formValues?.[0]||0;
          if (sel===0) system.runTimeout(()=>openOwnerMenu(best,player),0); else system.runTimeout(()=>openBuyerMenu(best,player),0);
        }).catch(()=>{});
      } else {
        system.runTimeout(()=>openBuyerMenu(best,player),0);
      }
    }catch (e) {}
  };
} catch (e) {}

// Global: fetch owner listings (items + structures)
try{
  globalThis.LABS_getOwnerListings = function(ownerName){
    try{
      loadOwnerFromPlayer(ownerName);
      const st = getOwnerStock(ownerName);
      const pr = getOwnerPrices(ownerName);
      const items = [];
      const seen = new Set([...Object.keys(st||{}), ...Object.keys(pr||{})]);
      for(const id of seen){ items.push({ id, qty: Math.max(0, Number(st[id]||0)), price: Math.max(0, Number(pr[id]||0)) }); }
      // Structures
      const idx = readStructIndex();
      const mine = Array.isArray(idx[ownerName]) ? idx[ownerName] : [];
      const sales = STRUCT_SALES[ownerName] || {};
      const structures = mine.map(it=>{ const meta = sales[it.name]||{}; return { name: it.name, size: it.size, price: Math.max(0, Number(meta.price||0)), enabled: !!meta.enabled }; });
      return { items, structures };
    }catch{ return { items: [], structures: [] }; }
  };
} catch (e) {}

// Initialize player scoreboard entries on spawn
try{
  world.afterEvents.playerSpawn.subscribe(ev=>{
    const p=ev.player; if(!p) return;
    system.runTimeout(()=>{
      const dim=world.getDimension("overworld");
      try{ dim.runCommandAsync(`scoreboard players add \"${p.name}\" lenycoins 0`).catch(()=>{}); }catch{}
      try{ dim.runCommandAsync(`scoreboard players add \"${p.name}\" karma 0`).catch(()=>{}); }catch{}
    }, 5);
  });
} catch (e) {}

// On spawn: set owner, place a starter chest with materials next to the bot
try{
  world.afterEvents.entitySpawn.subscribe(ev=>{
    const e=ev.entity; if(!e || e.typeId!=="myname:storekeeper_bot") return;
    system.runTimeout(()=>{
      const { player } = faceNearestPlayer(e);
      if (player){
        setOwnerTag(e, player.name);
        // remember owner for this entity state
        const st = SK_STATE.get(e.id) || {};
        st.owner = player.name; SK_STATE.set(e.id, st);
        try{ e.nameTag = "StoreKeeper"; }catch (e) {}
        // Default price for HOT Lava Chicken (unlimited item)
        try{ setOwnerPrice(player.name, "myname:hot_lava_chicken", 50); syncOwnerToPlayer(player.name); }catch (e) {}
      }
      placeStarterChest(e); // end-of-file sentinel
    }, 10);
  });
} catch (e) {}
