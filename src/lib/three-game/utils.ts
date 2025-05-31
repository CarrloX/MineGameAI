
import type { ControlConfig, CursorState } from './types';

export const randomInt = (min: number, max: number): number => Math.round(Math.random() * (max - min)) + min;

export const CHUNK_SIZE = 16; // Standard Minecraft chunk width/depth

export const CONTROL_CONFIG: ControlConfig = {
  backwards: "KeyS",
  forwards: "KeyW",
  left: "KeyA",
  right: "KeyD",
  jump: "Space",
  respawn: "KeyR",
};

export const CURSOR_STATE: CursorState = {
  x: 0,
  y: 0,
  inWindow: false,
  holding: false,
  holdTime: 0,
  triggerHoldTime: 20, // Frames to hold for "place" action with touch
};

const GRASS_TOP_URL = "https://placehold.co/16x16/228B22/FFFFFF.png"; // ForestGreen data-ai-hint="grass top"
const GRASS_SIDE_URL = "https://placehold.co/16x16/90EE90/000000.png"; // LightGreen data-ai-hint="grass side"
const DIRT_URL = "https://placehold.co/16x16/A0522D/FFFFFF.png";    // Sienna data-ai-hint="dirt soil"
const STONE_URL = "https://placehold.co/16x16/808080/FFFFFF.png";   // Gray data-ai-hint="stone rock"
const SAND_URL = "https://placehold.co/16x16/F0E68C/000000.png";    // Khaki data-ai-hint="sand desert"
const WOOD_LOG_SIDE_URL = "https://placehold.co/16x16/8B4513/FFFFFF.png"; // SaddleBrown data-ai-hint="wood bark"
const WOOD_LOG_END_URL = "https://placehold.co/16x16/DEB887/000000.png";  // BurlyWood data-ai-hint="wood end"
const REDSTONE_BLOCK_URL = "https://placehold.co/16x16/8B0000/FFFFFF.png"; // DarkRed data-ai-hint="redstone circuit"
const ORANGE_WOOL_URL = "https://placehold.co/16x16/FFA500/FFFFFF.png"; // Orange data-ai-hint="orange wool"
const COBBLESTONE_URL = "https://placehold.co/16x16/696969/FFFFFF.png"; // DimGray data-ai-hint="cobblestone stone"

// We define block definitions with explicit face textures for multi-texture blocks
// and a single 'side' texture for blocks that are the same on all sides.
export const TEXTURE_PATHS = {
  GRASS_BLOCK: { // This will be a multi-texture block
    paths: [
      GRASS_SIDE_URL,      // Right face (+X) data-ai-hint="grass side"
      GRASS_SIDE_URL,      // Left face (-X) data-ai-hint="grass side"
      GRASS_TOP_URL,       // Top face (+Y) data-ai-hint="grass top"
      DIRT_URL,            // Bottom face (-Y) data-ai-hint="dirt soil"
      GRASS_SIDE_URL,      // Front face (+Z) data-ai-hint="grass side"
      GRASS_SIDE_URL,      // Back face (-Z) data-ai-hint="grass side"
    ],
    hint: "grass dirt block" // General hint for the block type
  },
  DIRT_BLOCK: { side: DIRT_URL, hint: "dirt soil" },
  STONE_BLOCK: { side: STONE_URL, hint: "stone rock" },
  SAND_BLOCK: { side: SAND_URL, hint: "sand desert" },
  WOOD_LOG_BLOCK: { // Multi-texture block
    paths: [
      WOOD_LOG_SIDE_URL,   // Right face (+X) data-ai-hint="wood bark"
      WOOD_LOG_SIDE_URL,   // Left face (-X) data-ai-hint="wood bark"
      WOOD_LOG_END_URL,    // Top face (+Y) data-ai-hint="wood end"
      WOOD_LOG_END_URL,    // Bottom face (-Y) data-ai-hint="wood end"
      WOOD_LOG_SIDE_URL,   // Front face (+Z) data-ai-hint="wood bark"
      WOOD_LOG_SIDE_URL,   // Back face (-Z) data-ai-hint="wood bark"
    ],
    hint: "wood log tree"
  },
  REDSTONE_BLOCK: { side: REDSTONE_BLOCK_URL, hint: "redstone circuit" },
  ORANGE_WOOL_BLOCK: { side: ORANGE_WOOL_URL, hint: "orange wool" },
  COBBLESTONE_BLOCK: { side: COBBLESTONE_URL, hint: "cobblestone stone" },
};

// This function provides the data structure Block.ts expects
export const getBlockDefinitions = () => ({
  grassBlock: TEXTURE_PATHS.GRASS_BLOCK.paths, // Pass the array of paths
  dirtBlock: TEXTURE_PATHS.DIRT_BLOCK.side,   // Pass the single side path
  stoneBlock: TEXTURE_PATHS.STONE_BLOCK.side,
  sandBlock: TEXTURE_PATHS.SAND_BLOCK.side,
  woodLogBlock: TEXTURE_PATHS.WOOD_LOG_BLOCK.paths,
  redstoneBlock: TEXTURE_PATHS.REDSTONE_BLOCK.side,
  orangeWoolBlock: TEXTURE_PATHS.ORANGE_WOOL_BLOCK.side,
  cobblestoneBlock: TEXTURE_PATHS.COBBLESTONE_BLOCK.side,
});

// AI hints for textures, used by Block.ts to embed data-ai-hint on materials
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
