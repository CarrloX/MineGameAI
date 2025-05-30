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

const PLACEHOLDER_TEXTURE_SILICON = "https://placehold.co/64x64/808080/FFFFFF.png?text=Si";
const PLACEHOLDER_TEXTURE_FRONT = "https://placehold.co/64x64/336699/FFFFFF.png?text=F";
const PLACEHOLDER_TEXTURE_SIDE = "https://placehold.co/64x64/6699CC/FFFFFF.png?text=S";
const PLACEHOLDER_TEXTURE_TOP = "https://placehold.co/64x64/99CCFF/000000.png?text=T";
const PLACEHOLDER_TEXTURE_BACK = "https://placehold.co/64x64/003366/FFFFFF.png?text=B";

const createPlaceholderBlockTextures = (color: string = "blue") => {
  const colors: {[key: string]: string} = {
    blue: "336699",
    grape: "5E2A5E",
    lime: "A2C523",
    bondi: "00949F",
    strawberry: "FC5A8D",
    tangerine: "F28500",
    mac: "D6D6D6"
  };
  const selectedColor = colors[color] || colors.blue;
  const textColor = (color === "lime" || color === "mac" || color === "strawberry") ? "000000" : "FFFFFF";

  return [
    `https://placehold.co/64x64/${selectedColor}/${textColor}.png?text=S`, // Right
    `https://placehold.co/64x64/${selectedColor}/${textColor}.png?text=S`, // Left
    `https://placehold.co/64x64/${selectedColor}/${textColor}.png?text=T`, // Top
    `https://placehold.co/64x64/${selectedColor}/${textColor}.png?text=T`, // Bottom
    `https://placehold.co/64x64/${selectedColor}/${textColor}.png?text=F`, // Front
    `https://placehold.co/64x64/${selectedColor}/${textColor}.png?text=B`, // Back
  ];
};


export const TEXTURE_PATHS = {
  SILICON_BLOCK: { side: PLACEHOLDER_TEXTURE_SILICON, hint: "circuit silicon" },
  BLUEBERRY_IMAC: { paths: createPlaceholderBlockTextures("blue"), hint: "computer blueberry" },
  BONDI_IMAC: { paths: createPlaceholderBlockTextures("bondi"), hint: "computer bondi" },
  GRAPE_IMAC: { paths: createPlaceholderBlockTextures("grape"), hint: "computer grape" },
  LIME_IMAC: { paths: createPlaceholderBlockTextures("lime"), hint: "computer lime" },
  MACINTOSH_128K: { paths: createPlaceholderBlockTextures("mac"), hint: "computer classic" },
  STRAWBERRY_IMAC: { paths: createPlaceholderBlockTextures("strawberry"), hint: "computer strawberry" },
  TANGERINE_IMAC: { paths: createPlaceholderBlockTextures("tangerine"), hint: "computer tangerine" },
};

export const getBlockDefinitions = () => ({
  siliconBlock: TEXTURE_PATHS.SILICON_BLOCK.side,
  blueberryIMac: TEXTURE_PATHS.BLUEBERRY_IMAC.paths,
  bondiIMac: TEXTURE_PATHS.BONDI_IMAC.paths,
  grapeIMac: TEXTURE_PATHS.GRAPE_IMAC.paths,
  limeIMac: TEXTURE_PATHS.LIME_IMAC.paths,
  macintosh128k: TEXTURE_PATHS.MACINTOSH_128K.paths,
  strawberryIMac: TEXTURE_PATHS.STRAWBERRY_IMAC.paths,
  tangerineIMac: TEXTURE_PATHS.TANGERINE_IMAC.paths,
});

// AI hints for textures (used in Block.ts)
export const getTextureHint = (name: string): string => {
    if (name.includes("SILICON")) return TEXTURE_PATHS.SILICON_BLOCK.hint;
    if (name.includes("BLUEBERRY")) return TEXTURE_PATHS.BLUEBERRY_IMAC.hint;
    if (name.includes("BONDI")) return TEXTURE_PATHS.BONDI_IMAC.hint;
    if (name.includes("GRAPE")) return TEXTURE_PATHS.GRAPE_IMAC.hint;
    if (name.includes("LIME")) return TEXTURE_PATHS.LIME_IMAC.hint;
    if (name.includes("MACINTOSH")) return TEXTURE_PATHS.MACINTOSH_128K.hint;
    if (name.includes("STRAWBERRY")) return TEXTURE_PATHS.STRAWBERRY_IMAC.hint;
    if (name.includes("TANGERINE")) return TEXTURE_PATHS.TANGERINE_IMAC.hint;
    return "block pattern";
}
