
import type { GameRefs } from './types';
import type { Player } from './Player';

export class InputHandler {
  private player: Player;
  private gameRefs: GameRefs;
  private boundHandleKeyDown: (e: KeyboardEvent) => void;
  private boundHandleKeyUp: (e: KeyboardEvent) => void;
  private boundHandleMouseMove: (e: MouseEvent) => void;
  private boundHandleMouseDown: (e: MouseEvent) => void;
  private boundHandlePointerLockChange: () => void;
  private boundHandleCanvasClick: () => void;
  private boundHandleTouchStart: (e: TouchEvent) => void;
  private boundHandleTouchMove: (e: TouchEvent) => void;
  private boundHandleTouchEnd: (e: TouchEvent) => void;


  constructor(player: Player, gameRefs: GameRefs) {
    this.player = player;
    this.gameRefs = gameRefs;

    this.boundHandleKeyDown = this.handleKeyDown.bind(this);
    this.boundHandleKeyUp = this.handleKeyUp.bind(this);
    this.boundHandleMouseMove = this.handleMouseMove.bind(this);
    this.boundHandleMouseDown = this.handleMouseDown.bind(this);
    this.boundHandlePointerLockChange = this.handlePointerLockChange.bind(this);
    this.boundHandleCanvasClick = this.handleCanvasClick.bind(this);
    this.boundHandleTouchStart = this.handleTouchStart.bind(this);
    this.boundHandleTouchMove = this.handleTouchMove.bind(this);
    this.boundHandleTouchEnd = this.handleTouchEnd.bind(this);
  }

  public setupEventListeners(): void {
    if (!this.gameRefs.canvasRef) return;

    window.addEventListener("keydown", this.boundHandleKeyDown);
    window.addEventListener("keyup", this.boundHandleKeyUp);
    window.addEventListener("mousemove", this.boundHandleMouseMove);
    this.gameRefs.canvasRef.addEventListener("mousedown", this.boundHandleMouseDown);
    this.gameRefs.canvasRef.addEventListener("click", this.boundHandleCanvasClick);
    document.addEventListener('pointerlockchange', this.boundHandlePointerLockChange, false);

    this.gameRefs.canvasRef.addEventListener("touchstart", this.boundHandleTouchStart, { passive: true });
    this.gameRefs.canvasRef.addEventListener("touchmove", this.boundHandleTouchMove, { passive: true });
    this.gameRefs.canvasRef.addEventListener("touchend", this.boundHandleTouchEnd);
  }

  public removeEventListeners(): void {
    if (!this.gameRefs.canvasRef) return;

    window.removeEventListener("keydown", this.boundHandleKeyDown);
    window.removeEventListener("keyup", this.boundHandleKeyUp);
    window.removeEventListener("mousemove", this.boundHandleMouseMove);
    this.gameRefs.canvasRef.removeEventListener("mousedown", this.boundHandleMouseDown);
    this.gameRefs.canvasRef.removeEventListener("click", this.boundHandleCanvasClick);
    document.removeEventListener('pointerlockchange', this.boundHandlePointerLockChange, false);

    this.gameRefs.canvasRef.removeEventListener("touchstart", this.boundHandleTouchStart);
    this.gameRefs.canvasRef.removeEventListener("touchmove", this.boundHandleTouchMove);
    this.gameRefs.canvasRef.removeEventListener("touchend", this.boundHandleTouchEnd);
  }

  private handleCanvasClick(): void {
    if (!this.gameRefs.canvasRef) return;
    if (!document.pointerLockElement) {
      this.gameRefs.canvasRef.requestPointerLock().catch(err => console.error("Pointer lock failed:", err));
    }
  }

  private handlePointerLockChange(): void {
    const { cursor, canvasRef } = this.gameRefs;
    if (!cursor || !canvasRef) return;
    cursor.inWindow = document.pointerLockElement === canvasRef;
    if (!cursor.inWindow) {
      cursor.x = canvasRef.clientWidth / 2;
      cursor.y = canvasRef.clientHeight / 2;
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    const { controlConfig, cursor } = this.gameRefs;
    if (!controlConfig || !cursor || !cursor.inWindow) return;

    switch (e.code) {
      case controlConfig.left: this.player.xdir = "left"; break;
      case controlConfig.right: this.player.xdir = "right"; break;
      case controlConfig.forwards: this.player.zdir = "forwards"; break;
      case controlConfig.backwards: this.player.zdir = "backwards"; break;
      case controlConfig.respawn: this.player.die(); break;
      case controlConfig.jump:
        const now = performance.now();
        if (now - this.player.lastSpacePressTime < this.player.flyToggleDelay && this.player.lastSpacePressTime !== 0) {
            this.player.flying = !this.player.flying;
            this.player.isFlyingAscending = false;
            this.player.isFlyingDescending = false;
            this.player.lastSpacePressTime = 0;
            if (this.player.flying) {
                this.player.jumping = false;
                this.player.jumpVelocity = 0;
                this.player.onGround = false;
                this.player.isRunning = false;
                this.player.isBoosting = false;
            } else {
                this.player.isBoosting = false;
                this.player.onGround = false;
            }
        } else {
            if (this.player.flying) {
                this.player.isFlyingAscending = true;
            } else {
                this.player.jumping = true;
            }
            this.player.lastSpacePressTime = now;
        }
        break;
      case controlConfig.flyDown:
        if (this.player.flying) {
          this.player.isFlyingDescending = true;
        }
        break;
      case controlConfig.boost:
        if (this.player.flying) {
            this.player.isBoosting = !this.player.isBoosting;
        } else {
            this.player.isRunning = !this.player.isRunning;
        }
        break;
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    const { controlConfig } = this.gameRefs;
    if (!controlConfig) return;

    switch (e.code) {
      case controlConfig.left: if (this.player.xdir === "left") this.player.xdir = ""; break;
      case controlConfig.right: if (this.player.xdir === "right") this.player.xdir = ""; break;
      case controlConfig.forwards: if (this.player.zdir === "forwards") this.player.zdir = ""; break;
      case controlConfig.backwards: if (this.player.zdir === "backwards") this.player.zdir = ""; break;
      case controlConfig.jump:
        this.player.jumping = false;
        this.player.isFlyingAscending = false;
        break;
      case controlConfig.flyDown:
        this.player.isFlyingDescending = false;
        break;
    }
  }

  private handleMouseMove(e: MouseEvent): void {
    if (this.gameRefs.cursor?.inWindow) {
      this.player.lookAround(e);
    }
  }

  private handleMouseDown(e: MouseEvent): void {
    if (this.gameRefs.cursor?.inWindow) {
      if (e.button === 0) this.player.interactWithBlock(true); // Left click - destroy
      if (e.button === 2) this.player.interactWithBlock(false); // Right click - place
    }
  }

  private handleTouchStart(e: TouchEvent): void {
    const { cursor } = this.gameRefs;
    if (!cursor) return;
    if (e.touches.length === 1) {
      cursor.holding = true;
      cursor.holdTime = 0;
    }
  }
  private handleTouchMove(e: TouchEvent): void {
    const { cursor } = this.gameRefs;
    if (!cursor) return;
    cursor.holdTime = 0;
  }

  private handleTouchEnd(e: TouchEvent): void {
    const { cursor } = this.gameRefs;
    if (!cursor) return;

    if (cursor.holding) {
      if (cursor.holdTime < cursor.triggerHoldTime && cursor.holdTime > 0) {
        this.player.interactWithBlock(true); // Tap to destroy
      }
      cursor.holding = false;
    }
  }
}
