import type * as THREE from 'three';
import type { Player } from './Player';
import type { World } from './World';
import type { Block } from './Block';

export interface ControlConfig {
  backwards: number;
  forwards: number;
  left: number;
  right: number;
  jump: number;
  respawn: number;
}

export interface CursorState {
  x: number;
  y: number;
  inWindow: boolean;
  holding: boolean;
  holdTime: number;
  triggerHoldTime: number;
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
