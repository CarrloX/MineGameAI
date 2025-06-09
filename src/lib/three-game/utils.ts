import type { ControlConfig, CursorState } from "./types";

export const randomInt = (min: number, max: number): number =>
  Math.round(Math.random() * (max - min)) + min;

export const CHUNK_SIZE = 16;

export const CONTROL_CONFIG: ControlConfig = {
  backwards: "KeyS",
  forwards: "KeyW",
  left: "KeyA",
  right: "KeyD",
  jump: "Space",
  respawn: "KeyR",
  flyDown: "ShiftLeft",
  boost: "ControlLeft",
};

export const CURSOR_STATE: CursorState = {
  x: 0,
  y: 0,
  inWindow: false,
  holding: false,
  holdTime: 0,
  triggerHoldTime: 20,
};

// Using specific hex colors to avoid any text/watermarks from placehold.co
const GRASS_TOP_URL = "/textures/blocks/grass_block_top.png";
const GRASS_SIDE_URL = "/textures/blocks/grass_block_side.png";
const DIRT_URL = "/textures/blocks/dirt.png"; // Sienna
const STONE_URL = "/textures/blocks/stone.png"; // Gray
const SAND_URL = "/textures/blocks/sand.png"; // Khaki
const WOOD_LOG_SIDE_URL = "https://placehold.co/16x16/8B4513/8B4513.png"; // SaddleBrown
const WOOD_LOG_END_URL = "https://placehold.co/16x16/DEB887/DEB887.png"; // BurlyWood
const REDSTONE_BLOCK_URL = "https://placehold.co/16x16/FF0000/FF0000.png"; // Red
const ORANGE_WOOL_URL = "https://placehold.co/16x16/FFA500/FFA500.png"; // Orange
const COBBLESTONE_URL = "https://placehold.co/16x16/696969/696969.png"; // DimGray
const WATER_URL = "https://placehold.co/16x16/1E90FF/1E90FF.png"; // DodgerBlue

export const TEXTURE_PATHS = {
  GRASS_BLOCK: {
    paths: [
      GRASS_SIDE_URL, // Right face (+X)
      GRASS_SIDE_URL, // Left face (-X)
      GRASS_TOP_URL, // Top face (+Y)
      DIRT_URL, // Bottom face (-Y)
      GRASS_SIDE_URL, // Front face (+Z)
      GRASS_SIDE_URL, // Back face (-Z)
    ],
    hint: "grass dirt block",
  },
  DIRT_BLOCK: { side: DIRT_URL, hint: "dirt soil" },
  STONE_BLOCK: { side: STONE_URL, hint: "stone rock" },
  SAND_BLOCK: { side: SAND_URL, hint: "sand desert" },
  WOOD_LOG_BLOCK: {
    paths: [
      WOOD_LOG_SIDE_URL, // Right face (+X)
      WOOD_LOG_SIDE_URL, // Left face (-X)
      WOOD_LOG_END_URL, // Top face (+Y)
      WOOD_LOG_END_URL, // Bottom face (-Y)
      WOOD_LOG_SIDE_URL, // Front face (+Z)
      WOOD_LOG_SIDE_URL, // Back face (-Z)
    ],
    hint: "wood log tree",
  },
  REDSTONE_BLOCK: { side: REDSTONE_BLOCK_URL, hint: "redstone circuit" },
  ORANGE_WOOL_BLOCK: { side: ORANGE_WOOL_URL, hint: "orange wool" },
  COBBLESTONE_BLOCK: { side: COBBLESTONE_URL, hint: "cobblestone stone" },
  WATER_BLOCK: { side: WATER_URL, hint: "water liquid" },
};

export const getBlockDefinitions = (): Record<
  string,
  { side: string } | string[]
> => ({
  grassBlock: TEXTURE_PATHS.GRASS_BLOCK.paths,
  dirtBlock: { side: TEXTURE_PATHS.DIRT_BLOCK.side },
  stoneBlock: { side: TEXTURE_PATHS.STONE_BLOCK.side },
  sandBlock: { side: TEXTURE_PATHS.SAND_BLOCK.side },
  woodLogBlock: TEXTURE_PATHS.WOOD_LOG_BLOCK.paths,
  redstoneBlock: { side: TEXTURE_PATHS.REDSTONE_BLOCK.side },
  orangeWoolBlock: { side: TEXTURE_PATHS.ORANGE_WOOL_BLOCK.side },
  cobblestoneBlock: { side: TEXTURE_PATHS.COBBLESTONE_BLOCK.side },
  waterBlock: { side: TEXTURE_PATHS.WATER_BLOCK.side },
});

export const getTextureHint = (nameKey: string): string => {
  if (nameKey === "grassBlock") return TEXTURE_PATHS.GRASS_BLOCK.hint;
  if (nameKey === "dirtBlock") return TEXTURE_PATHS.DIRT_BLOCK.hint;
  if (nameKey === "stoneBlock") return TEXTURE_PATHS.STONE_BLOCK.hint;
  if (nameKey === "sandBlock") return TEXTURE_PATHS.SAND_BLOCK.hint;
  if (nameKey === "woodLogBlock") return TEXTURE_PATHS.WOOD_LOG_BLOCK.hint;
  if (nameKey === "redstoneBlock") return TEXTURE_PATHS.REDSTONE_BLOCK.hint;
  if (nameKey === "orangeWoolBlock")
    return TEXTURE_PATHS.ORANGE_WOOL_BLOCK.hint;
  if (nameKey === "cobblestoneBlock")
    return TEXTURE_PATHS.COBBLESTONE_BLOCK.hint;
  if (nameKey === "waterBlock") return TEXTURE_PATHS.WATER_BLOCK.hint;
  return "block pattern";
};
