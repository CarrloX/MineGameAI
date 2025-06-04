import type * as THREE from 'three';
import type { Player } from './Player';
import type { World } from './World';
import type { Block } from './Block';
import type { InputController } from './InputController';
import type { RendererManager } from './RendererManager';
import type { GameLogic } from './GameLogic';
import type { ThreeSetup } from './ThreeSetup';
import type { AdvancedSky } from './sky/AdvancedSky'; // New import

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
  _lastDestroyTime?: number; // Para control de destrucción continua
  buttonPressed?: number; // 0=izquierdo, 2=derecho
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
  lookDirection: string; // Dirección de la mirada (yaw/pitch)
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
  worldSeed: number | null;
  sky: AdvancedSky | null; // Changed from Sky to AdvancedSky
}

export type BlockDefinition = { side: string } | string[];

// Service-like types for Player dependencies
export type PlayerWorldService = Pick<World, 'getBlock' | 'setBlock' | 'layers' | 'gravity' | 'voidHeight' | 'activeChunks'>;
export type PlayerCameraService = THREE.PerspectiveCamera;
export type PlayerSceneService = Pick<THREE.Scene, 'add' | 'remove' | 'getObjectByName'>;
export type PlayerRaycasterService = Pick<THREE.Raycaster, 'setFromCamera' | 'intersectObjects'>;
