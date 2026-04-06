// LABS: Private Structures Menu Configuration
//
// Purpose
// - List the structure keys (under structures/private) that OPs can place via:
//   - Stick → LABS Quick → “Private Structures (OP)”, or the chat command “!opsmenu”.
// - Edit this file to add/remove structures. Restart the server/world to apply changes.
//
// Where to put files
// - Copy your .mcstructure files into the pack’s folder:
//   LABS Behavior/structures/private
//
// How to reference a file
// - Preferred: use the filename without the “.mcstructure” suffix, prefixed by "private:".
//   Also accepted: "private/Name" — the system will try both.
//   Examples:
//     structures/private/MyCastle.mcstructure  →  key: "private:MyCastle" ("private/MyCastle" also OK)
//     structures/private/hub_center.mcstructure → key: "private:hub_center" ("private/hub_center" also OK)
//
// Two configuration formats are supported:
//
// 1) Simple list (strings only)
//    - Quick to maintain. Labels are derived from the key (underscores → spaces).
//
// export default [
//   "private/MyCastle",
//   "private/hub_center",
//   "private/base_tower"
// ];
//
// 2) Labeled objects (advanced)
//    - Lets you set a custom display label and defaults per structure.
//    - All fields are optional except "key".
//    - Fields:
//        key: string (required) — e.g., "private/MyCastle"
//        label: string (optional) — menu label (default derived from key)
//        includeEntities: boolean (optional) — include structure entities on load (default true)
//        defaultRotation: "0_degrees" | "90_degrees" | "180_degrees" | "270_degrees" (optional; default "0_degrees")
//
// export default [
//   { key: "private/MyCastle", label: "My Castle", includeEntities: true, defaultRotation: "0_degrees" },
//   { key: "private/hub_center", label: "Spawn Hub", defaultRotation: "90_degrees" },
//   { key: "private/base_tower", label: "Base Tower" }
// ];
//
// Empty default: ops will see an empty list but can still use future manual-entry if enabled.
// Start by uncommenting one of the examples above and adjust to your files.
//
// Quick copy-paste examples (use one format only):
//
// Simple list:
// export default [
//   "private/MyCastle",
//   "private/hub_center",
//   "private/base_tower"
// ];
//
// Labeled objects:
// export default [
//   { key: "private/MyCastle", label: "My Castle", includeEntities: true, defaultRotation: "0_degrees" },
//   { key: "private/hub_center", label: "Spawn Hub", defaultRotation: "90_degrees" },
//   { key: "private/base_tower", label: "Base Tower" }
// ];
//
// Note: After editing, restart the server/world to reload scripts.
 
export default [
  // Add your entries here, e.g.:
 "private/SUB1",
  // { key: "private/hub_center", label: "Spawn Hub" }
];
