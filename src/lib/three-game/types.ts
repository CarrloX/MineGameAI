
import type * as THREE from 'three';
import type { Player } from './Player';
import type { World } from './World';
import type { Block } from './Block';

export interface ControlConfig {
  backwards: string; // Changed from number to string for e.code
  forwards: string;
  left: string;
  right: string;
  jump: string;
  respawn: string;
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
  object: THREE.Object3D; // The merged mesh
  point: THREE.Vector3;    // Hit point in local space of the object
  worldPoint: THREE.Vector3; // Hit point in world space
  face: THREE.Face | null; // Intersected face of merged geo (might be less reliable with merged)
  blockWorldCoords: THREE.Vector3; // Calculated world coords of the block cell
  placeBlockWorldCoords: THREE.Vector3; // Calculated world coords for placing a new block
  worldFaceNormal: THREE.Vector3;  // Normal of the hit face in world space
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
}

export type BlockDefinition = { side: string } | string[];
