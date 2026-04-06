// Karma rules configuration
export default {
  earn: {
    feed: { amount: 20 },
    breed: { amount: 50 },
    tame: { amount: 200 }
  },
  penalties: {
    "minecraft:dog": -500,
    "minecraft:wolf": -500,
    "minecraft:horse": -500,
    "minecraft:dolphin": -100,
    "minecraft:turtle": -200,
    "minecraft:camel": -100,
    "minecraft:cat": -200,
    "minecraft:llama": -100,
    "minecraft:trader_llama": -100,
    "minecraft:panda": -100,
    "minecraft:donkey": -100,
    "minecraft:mule": -100,
    "minecraft:polar_bear": -100
  },
  caps: {
    perMinuteMax: 0
  }
};
