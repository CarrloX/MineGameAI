
import type { ControlConfig, CursorState } from './types';

export const randomInt = (min: number, max: number): number => Math.round(Math.random() * (max - min)) + min;

export const CONTROL_CONFIG: ControlConfig = {
  backwards: 83, // S
  forwards: 87,  // W
  left: 65,      // A
  right: 68,     // D
  jump: 32,      // Spacebar
  respawn: 82,   // R
};

export const CURSOR_STATE: CursorState = {
  x: 0,
  y: 0,
  inWindow: false,
  holding: false,
  holdTime: 0,
  triggerHoldTime: 20,
};

// Minecraft-inspired block texture URLs
const GRASS_TOP_URL = "https://placehold.co/64x64/228B22/FFFFFF.png"; // ForestGreen
const DIRT_URL = "https://placehold.co/64x64/A0522D/FFFFFF.png";    // Sienna
const STONE_URL = "https://placehold.co/64x64/808080/FFFFFF.png";   // Gray
const SAND_URL = "https://placehold.co/64x64/F0E68C/000000.png";    // Khaki
const WOOD_LOG_SIDE_URL = "https://placehold.co/64x64/8B4513/FFFFFF.png"; // SaddleBrown (Bark)
const WOOD_LOG_END_URL = "https://placehold.co/64x64/DEB887/000000.png";  // BurlyWood (Log End)
const REDSTONE_BLOCK_URL = "https://placehold.co/64x64/8B0000/FFFFFF.png"; // DarkRed
const ORANGE_WOOL_URL = "https://placehold.co/64x64/FFA500/FFFFFF.png"; // Orange
const COBBLESTONE_URL = "https://placehold.co/64x64/696969/FFFFFF.png"; // DimGray


export const TEXTURE_PATHS = {
  GRASS_BLOCK: {
    paths: [
      DIRT_URL,          // Right face (Dirt)
      DIRT_URL,          // Left face (Dirt)
      GRASS_TOP_URL,     // Top face (Grass)
      DIRT_URL,          // Bottom face (Dirt)
      DIRT_URL,          // Front face (Dirt)
      DIRT_URL,          // Back face (Dirt)
    ],
    hint: "grass dirt"
  },
  DIRT_BLOCK: { side: DIRT_URL, hint: "dirt soil" },
  STONE_BLOCK: { side: STONE_URL, hint: "stone rock" },
  SAND_BLOCK: { side: SAND_URL, hint: "sand desert" },
  WOOD_LOG_BLOCK: {
    paths: [
      WOOD_LOG_SIDE_URL, // Right face (Bark)
      WOOD_LOG_SIDE_URL, // Left face (Bark)
      WOOD_LOG_END_URL,  // Top face (Log End)
      WOOD_LOG_END_URL,  // Bottom face (Log End)
      WOOD_LOG_SIDE_URL, // Front face (Bark)
      WOOD_LOG_SIDE_URL, // Back face (Bark)
    ],
    hint: "wood log"
  },
  REDSTONE_BLOCK: { side: REDSTONE_BLOCK_URL, hint: "redstone circuit" },
  ORANGE_WOOL_BLOCK: { side: ORANGE_WOOL_URL, hint: "orange wool" },
  COBBLESTONE_BLOCK: { side: COBBLESTONE_URL, hint: "cobblestone stone" },
};

export const getBlockDefinitions = () => ({
  grassBlock: TEXTURE_PATHS.GRASS_BLOCK.paths,
  dirtBlock: TEXTURE_PATHS.DIRT_BLOCK.side,
  stoneBlock: TEXTURE_PATHS.STONE_BLOCK.side,
  sandBlock: TEXTURE_PATHS.SAND_BLOCK.side,
  woodLogBlock: TEXTURE_PATHS.WOOD_LOG_BLOCK.paths,
  redstoneBlock: TEXTURE_PATHS.REDSTONE_BLOCK.side,
  orangeWoolBlock: TEXTURE_PATHS.ORANGE_WOOL_BLOCK.side,
  cobblestoneBlock: TEXTURE_PATHS.COBBLESTONE_BLOCK.side,
});

// AI hints for textures (used in Block.ts)
export const getTextureHint = (nameKey: string): string => {
    if (nameKey === "grassBlock") return TEXTURE_PATHS.GRASS_BLOCK.hint;
    if (nameKey === "dirtBlock") return TEXTURE_PATHS.DIRT_BLOCK.hint;
    if (nameKey === "stoneBlock") return TEXTURE_PATHS.STONE_BLOCK.hint;
    if (nameKey === "sandBlock") return TEXTURE_PATHS.SAND_BLOCK.hint;
    if (nameKey === "woodLogBlock") return TEXTURE_PATHS.WOOD_LOG_BLOCK.hint;
    if (nameKey === "redstoneBlock") return TEXTURE_PATHS.REDSTONE_BLOCK.hint;
    if (nameKey === "orangeWoolBlock") return TEXTURE_PATHS.ORANGE_WOOL_BLOCK.hint;
    if (nameKey === "cobblestoneBlock") return TEXTURE_PATHS.COBBLESTONE_BLOCK.hint;
    return "block pattern"; // Default hint
}
