
import type { ControlConfig, CursorState } from './types';

export const randomInt = (min: number, max: number): number => Math.round(Math.random() * (max - min)) + min;

export const CHUNK_SIZE = 16; 

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
  triggerHoldTime: 20,
};

const GRASS_TOP_URL = "https://placehold.co/16x16/228B22/FFFFFF.png"; 
const GRASS_SIDE_URL = "https://placehold.co/16x16/90EE90/000000.png";
const DIRT_URL = "https://placehold.co/16x16/A0522D/FFFFFF.png";    
const STONE_URL = "https://placehold.co/16x16/808080/FFFFFF.png";   
const SAND_URL = "https://placehold.co/16x16/F0E68C/000000.png";    
const WOOD_LOG_SIDE_URL = "https://placehold.co/16x16/8B4513/FFFFFF.png"; 
const WOOD_LOG_END_URL = "https://placehold.co/16x16/DEB887/000000.png";  
const REDSTONE_BLOCK_URL = "https://placehold.co/16x16/8B0000/FFFFFF.png"; 
const ORANGE_WOOL_URL = "https://placehold.co/16x16/FFA500/FFFFFF.png"; 
const COBBLESTONE_URL = "https://placehold.co/16x16/696969/FFFFFF.png"; 

export const TEXTURE_PATHS = {
  GRASS_BLOCK: { 
    paths: [
      GRASS_SIDE_URL,      // Right face (+X) data-ai-hint="grass side"
      GRASS_SIDE_URL,      // Left face (-X) data-ai-hint="grass side"
      GRASS_TOP_URL,       // Top face (+Y) data-ai-hint="grass top"
      DIRT_URL,            // Bottom face (-Y) data-ai-hint="dirt soil"
      GRASS_SIDE_URL,      // Front face (+Z) data-ai-hint="grass side"
      GRASS_SIDE_URL,      // Back face (-Z) data-ai-hint="grass side"
    ],
    hint: "grass dirt block" 
  },
  DIRT_BLOCK: { side: DIRT_URL, hint: "dirt soil" },
  STONE_BLOCK: { side: STONE_URL, hint: "stone rock" },
  SAND_BLOCK: { side: SAND_URL, hint: "sand desert" },
  WOOD_LOG_BLOCK: { 
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

export const getBlockDefinitions = (): Record<string, { side: string } | string[]> => ({
  grassBlock: TEXTURE_PATHS.GRASS_BLOCK.paths,
  dirtBlock: { side: TEXTURE_PATHS.DIRT_BLOCK.side },
  stoneBlock: { side: TEXTURE_PATHS.STONE_BLOCK.side },
  sandBlock: { side: TEXTURE_PATHS.SAND_BLOCK.side },
  woodLogBlock: TEXTURE_PATHS.WOOD_LOG_BLOCK.paths,
  redstoneBlock: { side: TEXTURE_PATHS.REDSTONE_BLOCK.side },
  orangeWoolBlock: { side: TEXTURE_PATHS.ORANGE_WOOL_BLOCK.side },
  cobblestoneBlock: { side: TEXTURE_PATHS.COBBLESTONE_BLOCK.side },
});

export const getTextureHint = (nameKey: string): string => {
    if (nameKey === "grassBlock") return TEXTURE_PATHS.GRASS_BLOCK.hint;
    if (nameKey === "dirtBlock") return TEXTURE_PATHS.DIRT_BLOCK.hint;
    if (nameKey === "stoneBlock") return TEXTURE_PATHS.STONE_BLOCK.hint;
    if (nameKey === "sandBlock") return TEXTURE_PATHS.SAND_BLOCK.hint;
    if (nameKey === "woodLogBlock") return TEXTURE_PATHS.WOOD_LOG_BLOCK.hint;
    if (nameKey === "redstoneBlock") return TEXTURE_PATHS.REDSTONE_BLOCK.hint;
    if (nameKey === "orangeWoolBlock") return TEXTURE_PATHS.ORANGE_WOOL_BLOCK.hint;
    if (nameKey === "cobblestoneBlock") return TEXTURE_PATHS.COBBLESTONE_BLOCK.hint;
    return "block pattern"; 
}
