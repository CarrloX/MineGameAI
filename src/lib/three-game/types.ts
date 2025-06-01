
import type * as THREE from 'three';
import type { Player } from './Player';
import type { World } from './World';
import type { Block } from './Block';
import type { InputController } from './InputController';
import type { RendererManager } from './RendererManager';
import type { GameLogic } from './GameLogic';
import type { ThreeSetup } from './ThreeSetup';

export interface ControlConfig {
  backwards: string;
  forwards: string;
  left: string;
  right: string;
  jump: string;
  respawn: string;
  flyDown: string;
  boost: string;
}

export interface CursorState {
  x: number;
  y: number;
  inWindow: boolean;
  holding: boolean;
  holdTime: number;
  triggerHoldTime: number;
}

export interface LookingAtInfo {
  object: THREE.Object3D;
  point: THREE.Vector3;
  worldPoint: THREE.Vector3;
  face: THREE.Face | null;
  blockWorldCoords: THREE.Vector3;
  placeBlockWorldCoords: THREE.Vector3;
  worldFaceNormal: THREE.Vector3;
  distance: number;
}

export interface DebugInfoState {
  fps: number;
  playerPosition: string;
  playerChunk: string;
  raycastTarget: string;
  highlightStatus: string;
  visibleChunks: number;
  totalChunks: number;
  isFlying: string;
  isRunning: string;
  isBoosting: string;
}

export interface ErrorInfo {
  title: string;
  message: string;
}

export interface GameRefs {
  scene: THREE.Scene | null;
  camera: THREE.PerspectiveCamera | null;
  renderer: THREE.WebGLRenderer | null;
  raycaster: THREE.Raycaster | null;
  textureLoader: THREE.TextureLoader | null;
  world: World | null;
  blocks: Block[] | null;
  player: Player | null;
  controlConfig: ControlConfig;
  cursor: CursorState;
  gameLoopId: number | null;
  canvasRef: HTMLDivElement | null;
  inputController: InputController | null;
  rendererManager: RendererManager | null;
  gameLogic: GameLogic | null;
  threeSetup: ThreeSetup | null;
  lighting: { ambient: THREE.AmbientLight; directional: THREE.DirectionalLight; } | null;
}

export type BlockDefinition = { side: string } | string[];

// Service-like types for Player dependencies (towards DIP)
export interface PlayerWorldService {
  getBlock: (worldX: number, worldY: number, worldZ: number) => string | null;
  setBlock: (worldX: number, worldY: number, worldZ: number, blockType: string) => void;
  layers: number;
  gravity: number;
  voidHeight: number;
  activeChunks: Map<string, any>; // Simplified for raycasting context (Chunk type can be used if Chunk.ts is stable)
}

// PlayerCameraService should be compatible with THREE.PerspectiveCamera's relevant properties/methods
// We use 'extends THREE.Object3D' as a base for position/rotation, then add specific camera things if needed.
// For now, direct use of THREE.PerspectiveCamera structurally matches what Player needs.
export type PlayerCameraService = THREE.PerspectiveCamera;


export interface PlayerSceneService {
  add: (object: THREE.Object3D) => void;
  remove: (object: THREE.Object3D) => void;
  getObjectByName: (name: string) => THREE.Object3D | undefined;
}

// PlayerRaycasterService should be compatible with THREE.Raycaster
export type PlayerRaycasterService = THREE.Raycaster;
