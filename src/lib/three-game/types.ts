import type * as THREE from "three";
import type { Player } from "./Player";
import type { World } from "./World";
import type { Block } from "./Block";
import type { InputController } from "./InputController";
import type { RendererManager } from "./RendererManager";
import type { GameLogic } from "./GameLogic";
import type { ThreeSetup } from "./ThreeSetup";
import type { AdvancedSky } from "./sky/AdvancedSky"; // New import
import { EventBus } from "./events/EventBus";
import { CONTROL_CONFIG, CURSOR_STATE } from "./utils";

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
  interaction_lock?: boolean; // Para prevenir interacciones duplicadas
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
  blocks: any | null;
  player: any | null;
  inputController: any | null;
  rendererManager: any | null;
  gameLogic: any | null;
  threeSetup: any | null;
  lighting: any | null;
  controlConfig: typeof CONTROL_CONFIG;
  cursor: typeof CURSOR_STATE;
  gameLoopId: number | null;
  canvasRef: HTMLDivElement | null;
  worldSeed: string | null;
  sky: AdvancedSky | null;
  eventBus: EventBus;
  controls: any | null;
  clock: THREE.Clock | null;
}

export type BlockDefinition = { side: string } | string[];

// Interfaces base para servicios
export interface IWorldService {
  getBlock(x: number, y: number, z: number): string | null;
  setBlock(x: number, y: number, z: number, blockType: string): void;
  activeChunks: Map<string, any>;
  updateChunks(position: THREE.Vector3): void;
  getSpawnHeight(x: number, z: number): number;
  layers: number;
  readonly voidHeight: number;
}

export interface ICameraService {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  updateMatrixWorld(): void;
  matrixWorld: THREE.Matrix4;
  matrixWorldInverse: THREE.Matrix4;
  projectionMatrix: THREE.Matrix4;
}

export interface ISceneService {
  add(object: THREE.Object3D): void;
  remove(object: THREE.Object3D): void;
  getObjectByName(name: string): THREE.Object3D | undefined;
}

export interface IRaycasterService {
  setFromCamera(coords: THREE.Vector2, camera: ICameraService): void;
  intersectObjects(
    objects: THREE.Object3D[],
    recursive?: boolean
  ): THREE.Intersection[];
}

export interface IPlayerState {
  flying: boolean;
  jumping: boolean;
  onGround: boolean;
  dead: boolean;
  isRunning: boolean;
  isBoosting: boolean;
  lastSpacePressTime: number;
  flySpeed: number;
  runSpeedMultiplier: number;
  boostSpeedMultiplier: number;
}

export interface IPlayerMovement {
  x: number;
  y: number;
  z: number;
  height: number;
  width: number;
  depth: number;
  pitch: number;
  yaw: number;
  speed: number;
  velocity: number;
  jumpSpeed: number;
  jumpVelocity: number;
  xdir: string;
  zdir: string;
  attackRange: number;
}

export interface IBlockInteraction {
  highlightBlock(): void;
  interactWithBlock(destroy: boolean): void;
  clearHighlight(): void;
  getLookingAt(): LookingAtInfo | null;
}

// Tipos existentes actualizados para usar las nuevas interfaces
export type PlayerWorldService = IWorldService;
export type PlayerCameraService = ICameraService;
export type PlayerSceneService = ISceneService;
export type PlayerRaycasterService = IRaycasterService;

// Interfaces para los servicios del jugador
export interface IPlayerStateService {
  readonly state: IPlayerState;
  toggleFlying(): void;
  setJumping(value: boolean): void;
  setOnGround(value: boolean): void;
  setDead(value: boolean): void;
  setRunning(value: boolean): void;
  setBoosting(value: boolean): void;
}

export interface IPlayerMovementService {
  updatePosition(deltaTime: number): void;
  calculateVerticalMovement(deltaTime: number): number;
  calculateHorizontalMovement(): { moveX: number; moveZ: number };
  calculateEffectiveSpeed(): number;
}

export interface IPlayerBlockInteractionService {
  highlightBlock(): void;
  interactWithBlock(destroy: boolean): void;
  clearHighlight(): void;
}

export interface IPlayerCameraController {
  lookAround(): void;
  updatePosition(): void;
  setPitch(pitch: number): void;
  setYaw(yaw: number): void;
  getPitch(): number;
  getYaw(): number;
  setPosition(x: number, y: number, z: number): void;
  setRotation(pitch: number, yaw: number): void;
}
