
import type * as THREE from 'three';
import type { Player } from './Player';
import type { World } from './World';
import type { Block } from './Block';
import type { InputHandler } from './InputHandler';
import type { RendererManager } from './RendererManager';

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
  inputHandler: InputHandler | null;
  rendererManager: RendererManager | null;
}

export type BlockDefinition = { side: string } | string[];
