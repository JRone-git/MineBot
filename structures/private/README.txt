LABS Private Structures — Detailed Guide

Purpose
- This folder holds .mcstructure files that OPs can place in-game via Stick → LABS Quick → "Private Structures (OP)" or the chat command !opsmenu.
- The in-game list is driven by a config file you edit: LABS Behavior/scripts/config/private_structs.js

Quick Start (TL;DR)
1) Copy your .mcstructure files into this folder.
2) Edit LABS Behavior/scripts/config/private_structs.js and add entries for each file.
3) Restart the server/world so scripts reload.
4) In-game (as OP with tag labs_admin), open the Stick menu → "Private Structures (OP)", pick a structure, and place.

Where to put files
- Path: LABS Behavior/structures/private
- Examples:
  - LABS Behavior/structures/private/MyCastle.mcstructure
  - LABS Behavior/structures/private/hub_center.mcstructure
  - LABS Behavior/structures/private/base_tower.mcstructure

How keys map to filenames
- Preferred key format: "private:<filename>" (without the .mcstructure extension)
- Slash format "private/<filename>" is also accepted; the system will try both.
- Examples:
  - File: MyCastle.mcstructure → Key: private:MyCastle (slash also OK: private/MyCastle)
  - File: hub_center.mcstructure → Key: private:hub_center (slash also OK: private/hub_center)
- Keys are case-sensitive on some systems. Match the filename exactly (except the extension).
- Avoid spaces in filenames. Use letters, numbers, and underscores.

Edit the in-game menu list (CONFIG REQUIRED)
- Open: LABS Behavior/scripts/config/private_structs.js
- Two supported formats:
  A) Simple list (strings only; labels are derived from key)
     export default [
       "private/MyCastle",
       "private/hub_center",
       "private/base_tower"
     ];

  B) Labeled objects (custom label + defaults)
     export default [
       { key: "private/MyCastle", label: "My Castle", includeEntities: true, defaultRotation: "0_degrees" },
       { key: "private/hub_center", label: "Spawn Hub", defaultRotation: "90_degrees" },
       { key: "private/base_tower", label: "Base Tower" }
     ];

Field reference (for labeled objects)
- key (required): string like "private/MyCastle"
- label (optional): menu label shown to players; defaults to a prettified key
- includeEntities (optional): true/false; whether entities saved in the structure are spawned (default true)
- defaultRotation (optional): one of 0_degrees, 90_degrees, 180_degrees, 270_degrees (default 0_degrees)

Applying changes
- After you edit private_structs.js, RESTART the server/world to reload scripts and refresh the menu.
- Simply copying new .mcstructure files to this folder is not enough; you must add keys in private_structs.js and restart.

Using in-game (OPs only)
- Grant yourself the admin tag if needed: /tag @s add labs_admin
- Open the Stick quick menu → "Private Structures (OP)"
- Choose a structure from the list
- The placer:
  - Finds an anchor ~3 blocks in front of you
  - Snaps to ground by scanning up/down a few blocks
  - Loads the structure at that anchor, using the entry’s defaultRotation and includeEntities
  - Opens a manage menu (Rotate/Delete/Exit) once placed

Manage menu (after placement)
- Rotate 90° / 180° / 270°:
  - You’ll be asked for bounds width/height/depth (in blocks) so we can clean up old entities/blocks as needed, then reload rotated.
- Delete placement:
  - Enter bounds (width/height/depth). The region starting at the anchor is filled with air, and typical structure-spawned entities inside are cleaned up.
- Exit: leave the placement as-is.

Troubleshooting
- Menu is empty:
  - Ensure you edited scripts/config/private_structs.js and added keys
  - Restart the server/world after editing
  - Confirm you have the labs_admin tag
- "Failed to place '<key>'":
  - The key doesn’t match a file here. Check spelling, case, and that the file exists without the .mcstructure suffix
  - Example: file hub_center.mcstructure requires key private/hub_center
- Can’t rotate/delete:
  - Make sure you are OP and have labs_admin; ensure you entered correct bounds
- Entities didn’t appear:
  - Set includeEntities: true on the entry (or use the simple format which defaults to true)

Best practices and tips
- Keep filenames simple: letters, numbers, underscores. Avoid spaces/special characters.
- Large structures:
  - Placing very large structures can be heavy; consider chunk boundaries and performance
  - Use rotate/delete tools carefully with correct bounds
- Dimensions:
  - The placer works in your current dimension. Files are global, but placement happens wherever you run it.
- Backups:
  - Consider saving an undo region with a structure block before replacing large areas

Security & permissions
- OP-only access is enforced by the labs_admin tag. Non-admin players will see a warning and cannot open the menu.

Notes
- This pack does not auto-scan the folder. The config file is the source of truth for the in-game list.
- Manual typed entry isn’t enabled in this setup; use the config list.

Admin checklist for adding structures
1) Copy .mcstructure files into this folder
2) Add their keys to scripts/config/private_structs.js (simple or labeled format)
3) Restart the server/world
4) Verify in-game with Stick → "Private Structures (OP)"

Examples to test
- Create: LABS Behavior/structures/private/TestRoom.mcstructure
- Config:
  export default [
    { key: "private/TestRoom", label: "Test Room", includeEntities: false, defaultRotation: "0_degrees" }
  ];
- Restart, then place via stick menu

If you need help
- Check console logs for script errors
- Re-verify file paths and keys
- Confirm your permissions and tag
