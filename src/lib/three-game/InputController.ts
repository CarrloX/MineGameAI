import * as THREE from 'three';
import type { GameRefs, PlayerCameraService } from "./types";
import type { Player } from "./Player";
import { gameLogger } from './services/LoggingService';

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

  private mouseButtons: Set<number> = new Set();
  private lastClickTime: number = 0;
  private readonly CLICK_TIMEOUT = 50; // ms para considerar clicks simultáneos

  private _hasInteractedBefore: boolean = false;

  private _lastInteractionPos: { x: number, y: number, z: number } | null = null;
  private _lastInteractionTime: number = 0;
  private readonly INTERACTION_COOLDOWN = 300; // ms

  constructor(gameRefs: GameRefs, initialPlayer?: Player) {
    // Player is now optional
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

  public setPlayer(player: Player | null) {
    // Allow setting player to null
    this.player = player;
  }

  public setupEventListeners(): void {
    if (!this.gameRefs.canvasRef) return;

    window.addEventListener("keydown", this.boundHandleKeyDown);
    window.addEventListener("keyup", this.boundHandleKeyUp);
    document.addEventListener(
      "pointerlockchange",
      this.boundHandlePointerLockChange,
      false
    );
    this.gameRefs.canvasRef.addEventListener(
      "mousedown",
      this.boundHandleMouseDown
    );
    this.gameRefs.canvasRef.addEventListener(
      "mouseup",
      this.boundHandleMouseUp
    );
    this.gameRefs.canvasRef.addEventListener(
      "click",
      this.boundHandleCanvasClick
    );

    this.gameRefs.canvasRef.addEventListener(
      "touchstart",
      this.boundHandleTouchStart,
      { passive: false }
    );
    this.gameRefs.canvasRef.addEventListener(
      "touchmove",
      this.boundHandleTouchMove,
      { passive: false }
    );
    this.gameRefs.canvasRef.addEventListener(
      "touchend",
      this.boundHandleTouchEnd
    );
  }

  public removeEventListeners(): void {
    if (!this.gameRefs.canvasRef) return;

    window.removeEventListener("keydown", this.boundHandleKeyDown);
    window.removeEventListener("keyup", this.boundHandleKeyUp);
    document.removeEventListener(
      "pointerlockchange",
      this.boundHandlePointerLockChange,
      false
    );
    this.gameRefs.canvasRef.removeEventListener(
      "mousedown",
      this.boundHandleMouseDown
    );
    this.gameRefs.canvasRef.removeEventListener(
      "mouseup",
      this.boundHandleMouseUp
    );
    this.gameRefs.canvasRef.removeEventListener(
      "click",
      this.boundHandleCanvasClick
    );

    this.gameRefs.canvasRef.removeEventListener(
      "touchstart",
      this.boundHandleTouchStart
    );
    this.gameRefs.canvasRef.removeEventListener(
      "touchmove",
      this.boundHandleTouchMove
    );
    this.gameRefs.canvasRef.removeEventListener(
      "touchend",
      this.boundHandleTouchEnd
    );
  }

  private handleCanvasClick(): void {
    if (!this.gameRefs.canvasRef) return;
    if (!document.pointerLockElement) {
      this.gameRefs.canvasRef
        .requestPointerLock()
        .catch((err) => console.error("Pointer lock failed:", err));
    }
  }

  private handlePointerLockChange(): void {
    const { cursor, canvasRef } = this.gameRefs;
    if (!cursor || !canvasRef) return;

    if (document.pointerLockElement === canvasRef) {
      document.addEventListener("mousemove", this.boundHandleMouseMove, false);
      cursor.inWindow = true;
    } else {
      document.removeEventListener(
        "mousemove",
        this.boundHandleMouseMove,
        false
      );
      cursor.inWindow = false;
      cursor.x = canvasRef.clientWidth / 2;
      cursor.y = canvasRef.clientHeight / 2;
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.repeat) return;
    const { controlConfig } = this.gameRefs;
    if (!controlConfig || !this.player) return;

    console.log("KeyDown:", e.code);

    switch (e.code) {
      case controlConfig.left:
        this.player.xdir = "left";
        break;
      case controlConfig.right:
        this.player.xdir = "right";
        break;
      case controlConfig.forwards:
        this.player.zdir = "forwards";
        break;
      case controlConfig.backwards:
        this.player.zdir = "backwards";
        break;
      case controlConfig.respawn:
        this.player.die();
        break;
      case controlConfig.jump:
        console.log("Tecla de salto presionada");
        this.player.toggleFlying();
        break;
      case controlConfig.flyDown:
        console.log("Tecla de descenso presionada");
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

    console.log("KeyUp:", e.code);

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
        console.log("Tecla de salto liberada");
        if (this.player.flying) {
          console.log("Deteniendo ascenso");
          this.player.stopFlyingUp();
        }
        break;
      case controlConfig.flyDown:
        console.log("Tecla de descenso liberada");
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

  private handleMouseDown = (event: MouseEvent) => {
    event.preventDefault();
    const button = event.button;
    const now = performance.now();

    // Si el botón ya está registrado, ignorar
    if (this.mouseButtons.has(button)) {
      return;
    }

    // Protección contra doble interacción en la misma posición
    // Especialmente útil para la primera interacción
    const blockingKey = 'interaction_lock';
    if (this.gameRefs.cursor[blockingKey]) {
      console.log("Interacción bloqueada temporalmente");
      return;
    }

    // Aplicar un bloqueo temporal para evitar múltiples interacciones rápidas
    this.gameRefs.cursor[blockingKey] = true;
    setTimeout(() => {
      if (this.gameRefs.cursor) {
        this.gameRefs.cursor[blockingKey] = false;
      }
    }, 50); // 50ms debería ser suficiente para prevenir doble interacción

    // Registrar el botón presionado
    this.mouseButtons.add(button);
    
    // Si hay más de un botón presionado y el tiempo entre clicks es menor que CLICK_TIMEOUT
    if (this.mouseButtons.size > 1 && (now - this.lastClickTime) < this.CLICK_TIMEOUT) {
      // Limpiar el estado actual para evitar acciones duplicadas
      this.mouseButtons.clear();
      this.gameRefs.cursor.holding = false;
      this.gameRefs.cursor.holdTime = 0;
      this.gameRefs.cursor.buttonPressed = undefined;
      
      // Manejar como click simultáneo
      this.handleSimultaneousClicks(now);
      return;
    }

    this.lastClickTime = now;

    // Obtener la posición actual del bloque que se está mirando
    const lookingAt = this.getLookingAt();
    let currentPos = null;
    
    if (lookingAt && lookingAt.object) {
      const pos = button === 0 
        ? lookingAt.point // Para destruir, usamos el punto exacto
        : new THREE.Vector3().copy(lookingAt.point).add(lookingAt.face?.normal || new THREE.Vector3()); // Para construir, añadimos la normal
      
      currentPos = {
        x: Math.floor(pos.x),
        y: Math.floor(pos.y),
        z: Math.floor(pos.z)
      };
      
      // Verificar si estamos interactuando con la misma posición muy rápidamente
      if (this._lastInteractionPos && 
          this._lastInteractionPos.x === currentPos.x &&
          this._lastInteractionPos.y === currentPos.y &&
          this._lastInteractionPos.z === currentPos.z &&
          now - this._lastInteractionTime < this.INTERACTION_COOLDOWN) {
        console.log("Ignorando interacción duplicada en la misma posición");
        return;
      }
      
      // Actualizar el registro de la última interacción
      this._lastInteractionPos = currentPos;
      this._lastInteractionTime = now;
    }

    // Comportamiento normal para un solo botón
    if (button === 0) { // Click izquierdo
      this.gameRefs.cursor.holding = true;
      this.gameRefs.cursor.holdTime = now;
      this.gameRefs.cursor.buttonPressed = 0;
      
      // Asegurarse de que solo se ejecute una interacción por clic
      if (this.player) {
        gameLogger.logGameEvent('Interacción de bloque (destruir)', {
          time: now,
          firstClick: !this._hasInteractedBefore,
          position: currentPos
        });
        this._hasInteractedBefore = true;
        this.player.interactWithBlock(true);
      }
    } else if (button === 2) { // Click derecho
      this.gameRefs.cursor.holding = true;
      this.gameRefs.cursor.holdTime = now;
      this.gameRefs.cursor.buttonPressed = 2;
      
      // Asegurarse de que solo se ejecute una interacción por clic
      if (this.player) {
        gameLogger.logGameEvent('Interacción de bloque (colocar)', {
          time: now,
          firstClick: !this._hasInteractedBefore,
          position: currentPos
        });
        this._hasInteractedBefore = true;
        this.player.interactWithBlock(false);
      }
    }
  };

  private handleMouseUp = (event: MouseEvent) => {
    event.preventDefault();
    const button = event.button;

    // Remover el botón liberado
    this.mouseButtons.delete(button);

    // Si no hay más botones presionados, resetear el estado
    if (this.mouseButtons.size === 0) {
      this.gameRefs.cursor.holding = false;
      this.gameRefs.cursor.holdTime = 0;
      this.gameRefs.cursor.buttonPressed = undefined;
      this.lastClickTime = 0; // Resetear también el tiempo del último click
    }
  };

  private handleSimultaneousClicks(timestamp: number) {
    if (!this.player) return;

    // Obtener el objeto que el jugador está mirando
    const lookingAt = this.getLookingAt();
    
    if (!lookingAt) {
      return; // No hacer nada si no está mirando ningún objeto
    }

    // Verificar si el objeto es interactuable
    const isInteractable = lookingAt.object.userData?.isInteractable;
    
    // Establecer el estado del cursor
    this.gameRefs.cursor.holding = true;
    this.gameRefs.cursor.holdTime = timestamp;

    if (isInteractable) {
      // Si es interactuable, priorizar click derecho
      this.gameRefs.cursor.buttonPressed = 2;
      this.player.interactWithBlock(false);
      gameLogger.logGameEvent('Click derecho priorizado en objeto interactuable', {
        objectType: lookingAt.object.type,
        position: lookingAt.point.toArray()
      });
    } else {
      // Si no es interactuable, priorizar click izquierdo
      this.gameRefs.cursor.buttonPressed = 0;
      this.player.interactWithBlock(true);
      gameLogger.logGameEvent('Click izquierdo priorizado en bloque normal', {
        objectType: lookingAt.object.type,
        position: lookingAt.point.toArray()
      });
    }
  }

  private getLookingAt() {
    if (!this.gameRefs.camera || !this.gameRefs.raycaster || !this.gameRefs.scene) return null;

    // Obtener el punto central de la pantalla
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    // Actualizar el raycaster
    this.gameRefs.raycaster.setFromCamera(
      new THREE.Vector2(
        (centerX / window.innerWidth) * 2 - 1,
        -(centerY / window.innerHeight) * 2 + 1
      ),
      this.gameRefs.camera
    );

    // Realizar el raycast
    const intersects = this.gameRefs.raycaster.intersectObjects(this.gameRefs.scene.children, true);
    return intersects.length > 0 ? intersects[0] : null;
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
