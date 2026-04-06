# Animations — submission template

Use this template when adding custom animations. Keep one entry per animation. Place your `.animation.json` files in this folder.

Copy and fill:

```markdown
## Animation: <human-friendly name>
- ID: animation.<bot_name>.<action>
- File: LABS Resources/animations/<file_name>.animation.json
- Target bot(s): myname:<bot_name>
- Purpose/trigger: <when to play (idle, walk, attack, on-interact, emote, etc.)>
- Bones driven: <e.g., head, rightArm, leftArm, body, waist>
- Variables/queries: <e.g., query.is_moving, variable.my_param>
- Duration/looping: <fixed length / looping / ping-pong>
- Author: <name or handle>
- Version/date: <v1 • YYYY-MM-DD>
- Notes: <anything important to wire correctly>
```

Example (filled):

```markdown
## Animation: Shroom Spin Up
- ID: animation.shroom_bot.spin_up
- File: LABS Resources/animations/shroom_spin_up.animation.json
- Target bot(s): myname:shroom_bot
- Purpose/trigger: short spin-up flair on interact
- Bones driven: head, body
- Variables/queries: query.on_ground (optional), variable.spin_gain
- Duration/looping: 1.2s, non-looping
- Author: ContributorName
- Version/date: v1 • 2025-08-21
- Notes: Designed to blend from idle; clamps head tilt to avoid clipping.
```

Wiring in client entity (example):

```jsonc
{
  "minecraft:client_entity": {
    "description": {
      "animations": {
        "spin_up": "animation.shroom_bot.spin_up"
      },
      "scripts": {
        "animate": ["spin_up", "controller.animation.iron_golem.move", "controller.animation.iron_golem.arm_movement"]
      }
    }
  }
}
```

Tips
- Keep identifiers stable; once referenced in behavior/scripts, renaming breaks wiring.
- If you require custom variables, note how they’re set (e.g., via script) in “Variables/queries.”
- Preview GIFs are welcome; place beside the animation as `<id>.gif`.
