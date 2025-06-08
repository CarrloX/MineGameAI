import type { GameRefs, PlayerCameraService } from './types';
import type { Player } from './Player';

export class InputController {
  private player: Player | null = null; // Player can be null initially or after destruction
  private gameRefs: GameRefs; // Keep for controlConfig, cursor
  // No direct cameraService needed here if Player.lookAround handles camera internally

  private boundHandleKeyDown: (e: KeyboardEvent) => void;
  private boundHandleKeyUp: (e: KeyboardEvent) => void;
  private boundHandleMouseMove: (e: MouseEvent) => void;
  private boundHandleMouseDown: (e: MouseEvent) => void;
  private boundHandlePointerLockChange: () => void;
  private boundHandleCanvasClick: () => void;
  private boundHandleTouchStart: (e: TouchEvent) => void;
  private boundHandleTouchMove: (e: TouchEvent) => void;
  private boundHandleTouchEnd: (e: TouchEvent) => void;
  private boundHandleMouseUp: (e: MouseEvent) => void; // Agregado

  private lastSpacePressTime: number = 0;
  private readonly FLY_TOGGLE_DELAY: number = 300; // ms

  constructor(gameRefs: GameRefs, initialPlayer?: Player) { // Player is now optional
    this.gameRefs = gameRefs;
    if (initialPlayer) this.player = initialPlayer;

    this.boundHandleKeyDown = this.handleKeyDown.bind(this);
    this.boundHandleKeyUp = this.handleKeyUp.bind(this);
    this.boundHandleMouseMove = this.handleMouseMove.bind(this);
    this.boundHandleMouseDown = this.handleMouseDown.bind(this);
    this.boundHandlePointerLockChange = this.handlePointerLockChange.bind(this);
    this.boundHandleCanvasClick = this.handleCanvasClick.bind(this);
    this.boundHandleTouchStart = this.handleTouchStart.bind(this);
    this.boundHandleTouchMove = this.handleTouchMove.bind(this);
    this.boundHandleTouchEnd = this.handleTouchEnd.bind(this);
    this.boundHandleMouseUp = this.handleMouseUp.bind(this); // Agregado
  }

  public setPlayer(player: Player | null) { // Allow setting player to null
    this.player = player;
  }

  public setupEventListeners(): void {
    if (!this.gameRefs.canvasRef) return;

    window.addEventListener("keydown", this.boundHandleKeyDown);
    window.addEventListener("keyup", this.boundHandleKeyUp);
    document.addEventListener('pointerlockchange', this.boundHandlePointerLockChange, false);    this.gameRefs.canvasRef.addEventListener("mousedown", this.boundHandleMouseDown);
    this.gameRefs.canvasRef.addEventListener("mouseup", this.handleMouseUp.bind(this));
    this.gameRefs.canvasRef.addEventListener("click", this.boundHandleCanvasClick);

    this.gameRefs.canvasRef.addEventListener("touchstart", this.boundHandleTouchStart, { passive: false });
    this.gameRefs.canvasRef.addEventListener("touchmove", this.boundHandleTouchMove, { passive: false });
    this.gameRefs.canvasRef.addEventListener("touchend", this.boundHandleTouchEnd);

    // Agregado
    this.gameRefs.canvasRef.addEventListener("mouseup", this.boundHandleMouseUp);
  }

  public removeEventListeners(): void {
    if (!this.gameRefs.canvasRef) return;

    window.removeEventListener("keydown", this.boundHandleKeyDown);
    window.removeEventListener("keyup", this.boundHandleKeyUp);
    // mousemove is added/removed in handlePointerLockChange
    document.removeEventListener('pointerlockchange', this.boundHandlePointerLockChange, false);    this.gameRefs.canvasRef.removeEventListener("mousedown", this.boundHandleMouseDown);
    this.gameRefs.canvasRef.removeEventListener("mouseup", this.handleMouseUp.bind(this));
    this.gameRefs.canvasRef.removeEventListener("click", this.boundHandleCanvasClick);

    this.gameRefs.canvasRef.removeEventListener("touchstart", this.boundHandleTouchStart);
    this.gameRefs.canvasRef.removeEventListener("touchmove", this.boundHandleTouchMove);
    this.gameRefs.canvasRef.removeEventListener("touchend", this.boundHandleTouchEnd);

    // Agregado
    this.gameRefs.canvasRef.removeEventListener("mouseup", this.boundHandleMouseUp);
  }

  private handleCanvasClick(): void {
    if (!this.gameRefs.canvasRef) return;
    if (!document.pointerLockElement) {
      this.gameRefs.canvasRef.requestPointerLock()
        .catch(err => console.error("Pointer lock failed:", err));
    }
  }

  private handlePointerLockChange(): void {
    const { cursor, canvasRef } = this.gameRefs;
    if (!cursor || !canvasRef) return;

    if (document.pointerLockElement === canvasRef) {
        document.addEventListener("mousemove", this.boundHandleMouseMove, false);
        cursor.inWindow = true;
    } else {
        document.removeEventListener("mousemove", this.boundHandleMouseMove, false);
        cursor.inWindow = false;
        cursor.x = canvasRef.clientWidth / 2;
        cursor.y = canvasRef.clientHeight / 2;
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.repeat) return;
    const { controlConfig } = this.gameRefs;
    if (!controlConfig || !this.player) return;

    console.log('KeyDown:', e.code);

    switch (e.code) {
      case controlConfig.left: this.player.xdir = "left"; break;
      case controlConfig.right: this.player.xdir = "right"; break;
      case controlConfig.forwards: this.player.zdir = "forwards"; break;
      case controlConfig.backwards: this.player.zdir = "backwards"; break;
      case controlConfig.respawn: this.player.die(); break;
      case controlConfig.jump: 
        console.log('Tecla de salto presionada');
        this.player.toggleFlying();
        break;
      case controlConfig.flyDown: 
        console.log('Tecla de descenso presionada');
        this.player.startFlyingDown(); 
        break;
      case controlConfig.boost: 
        if (this.player.flying) {
          this.player.toggleBoosting();
        } else {
          this.player.toggleRunning();
        }
        break;
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    if (!this.player) return;
    const { controlConfig } = this.gameRefs;
    if (!controlConfig) return;

    console.log('KeyUp:', e.code);

    switch (e.code) {
      case controlConfig.left: 
        if (this.player.xdir === "left") this.player.xdir = ""; 
        break;
      case controlConfig.right: 
        if (this.player.xdir === "right") this.player.xdir = ""; 
        break;
      case controlConfig.forwards: 
        if (this.player.zdir === "forwards") this.player.zdir = ""; 
        break;
      case controlConfig.backwards: 
        if (this.player.zdir === "backwards") this.player.zdir = ""; 
        break;
      case controlConfig.jump:
        console.log('Tecla de salto liberada');
        if (this.player.flying) {
          console.log('Deteniendo ascenso');
          this.player.stopFlyingUp();
        }
        break;
      case controlConfig.flyDown: 
        console.log('Tecla de descenso liberada');
        this.player.stopFlyingDown(); 
        break;
    }
  }

  private handleMouseMove(e: MouseEvent): void {
    if (this.gameRefs.cursor?.inWindow && this.player) {
      const sensitivity = 0.002;
      const newYaw = this.player.getYaw() - e.movementX * sensitivity;
      const newPitch = this.player.getPitch() - e.movementY * sensitivity;
      this.player.setYaw(newYaw);
      this.player.setPitch(newPitch);
    }
  }

  private handleMouseDown(e: MouseEvent): void {
    const { cursor } = this.gameRefs;
    if (cursor?.inWindow && this.player) {
      cursor.buttonPressed = e.button;
      if (e.button === 0) {
        cursor.holding = true;
        if (!cursor.holdTime || cursor.holdTime < 0) cursor.holdTime = 0;
        // Click instantáneo: destruir
        this.player.interactWithBlock(true);
      }
      if (e.button === 2) {
        cursor.holding = true;
        if (!cursor.holdTime || cursor.holdTime < 0) cursor.holdTime = 0;
        // Click instantáneo: colocar
        this.player.interactWithBlock(false);
      }
    }
  }

  private handleMouseUp(e: MouseEvent): void {
    const { cursor } = this.gameRefs;
    if (cursor?.inWindow) {
      cursor.holding = false;
      cursor.holdTime = 0;
      cursor.buttonPressed = undefined;
    }
  }

  private lastTouchX: number | null = null;
  private lastTouchY: number | null = null;

  private handleTouchStart(e: TouchEvent): void {
    e.preventDefault();
    const { cursor } = this.gameRefs;
    if (!cursor || !this.player) return;

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      this.lastTouchX = touch.clientX;
      this.lastTouchY = touch.clientY;
      cursor.holding = true;
      cursor.holdTime = 0;
    }
  }

  private handleTouchMove(e: TouchEvent): void {
    e.preventDefault();
    const { cursor } = this.gameRefs;
    if (!cursor || !this.player) return;

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      if (this.lastTouchX !== null && this.lastTouchY !== null) {
        const sensitivity = 0.005;
        const deltaX = touch.clientX - this.lastTouchX;
        const deltaY = touch.clientY - this.lastTouchY;

        this.player.yaw -= deltaX * sensitivity;
        this.player.pitch -= deltaY * sensitivity;
        this.player.lookAround();
      }
      this.lastTouchX = touch.clientX;
      this.lastTouchY = touch.clientY;
      cursor.holdTime = 0;
    }
  }

  private handleTouchEnd(e: TouchEvent): void {
    e.preventDefault();
    const { cursor } = this.gameRefs;
    if (!cursor || !this.player) return;

    this.lastTouchX = null;
    this.lastTouchY = null;

    if (cursor.holding) {
      if (cursor.holdTime < cursor.triggerHoldTime && cursor.holdTime >= 0) {
        this.player.interactWithBlock(true);
      }
      cursor.holding = false;
      cursor.holdTime = 0;
    }
  }
}
