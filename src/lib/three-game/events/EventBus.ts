type EventCallback = (...args: any[]) => void;

export class EventBus {
  private static instance: EventBus;
  private listeners: Map<string, EventCallback[]>;

  private constructor() {
    this.listeners = new Map();
  }

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  public on(event: string, callback: EventCallback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  public off(event: string, callback: EventCallback): void {
    if (!this.listeners.has(event)) return;
    const callbacks = this.listeners.get(event)!;
    const index = callbacks.indexOf(callback);
    if (index !== -1) {
      callbacks.splice(index, 1);
    }
  }

  public emit(event: string, ...args: any[]): void {
    if (!this.listeners.has(event)) return;
    this.listeners.get(event)!.forEach((callback) => {
      try {
        callback(...args);
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
      }
    });
  }

  public clear(): void {
    this.listeners.clear();
  }
}

// Definición de eventos comunes
export enum GameEvents {
  PLAYER_MOVE = "player:move",
  PLAYER_JUMP = "player:jump",
  PLAYER_LAND = "player:land",
  PLAYER_FLY_TOGGLE = "player:fly_toggle",
  PLAYER_DEATH = "player:death",
  PLAYER_RESPAWN = "player:respawn",
  BLOCK_PLACE = "block:place",
  BLOCK_BREAK = "block:break",
  BLOCK_HIGHLIGHT = "block:highlight",
  CHUNK_LOAD = "chunk:load",
  CHUNK_UNLOAD = "chunk:unload",
  WORLD_UPDATE = "world:update",
  CAMERA_UPDATE = "camera:update",
  GAME_STATE_CHANGE = "game:state_change",
  RENDER_DISTANCE_CHANGE = "renderDistanceChange",
}

// Tipos de eventos
export interface PlayerMoveEvent {
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
}

export interface BlockInteractionEvent {
  position: { x: number; y: number; z: number };
  blockType: string;
  playerPosition: { x: number; y: number; z: number };
}

export interface ChunkEvent {
  chunkKey: string;
  position: { x: number; z: number };
}

export interface GameStateEvent {
  state: "playing" | "paused" | "menu" | "loading";
  previousState?: string;
}
