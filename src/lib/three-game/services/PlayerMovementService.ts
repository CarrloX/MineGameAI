import * as THREE from "three";
import { CONTROL_CONFIG } from "../CONTROL_CONFIG";
import type { PlayerWorldService } from "../types";
import { CollisionService } from "../physics/CollisionService";

export class PlayerMovementService {
  private worldService: PlayerWorldService;
  private player: any; // Referencia al jugador para actualizar su posición
  private collisionService: CollisionService;

  constructor(worldService: PlayerWorldService, player: any) {
    this.worldService = worldService;
    this.player = player;
    this.collisionService = new CollisionService(worldService);
  }

  /**
   * Movimiento y colisión incremental por eje (X, Y, Z).
   * Aplica el movimiento en cada eje y ajusta la posición si hay colisión.
   */
  public updatePosition(deltaTime: number): void {
    // Calcular velocidades deseadas
    let dY = this.calculateVerticalMovement(deltaTime);
    let { moveX, moveZ } = this.calculateHorizontalMovement();
    let currentEffectiveSpeed = this.calculateEffectiveSpeed();
    let dx = 0,
      dz = 0;
    // Normalizar movimiento horizontal
    const moveMagnitude = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (moveMagnitude > 0) {
      dx = (moveX / moveMagnitude) * currentEffectiveSpeed * deltaTime;
      dz = (moveZ / moveMagnitude) * currentEffectiveSpeed * deltaTime;
    }
    let dy = dY;

    // Usar CollisionService para resolver colisiones y step-up
    const result = this.collisionService.resolveCollisions(
      new THREE.Vector3(this.player.x, this.player.y, this.player.z),
      new THREE.Vector3(dx, dy, dz),
      { width: this.player.width, height: this.player.height, depth: this.player.depth }
    );

    this.player.x = result.newPosition.x;
    this.player.y = result.newPosition.y;
    this.player.z = result.newPosition.z;
    this.player.onGround = result.isOnGround;
    this.player.mesh.position.set(result.newPosition.x, result.newPosition.y, result.newPosition.z);
    this.player.cameraService.position.set(
      result.newPosition.x,
      result.newPosition.y + this.player.height * 0.9,
      result.newPosition.z
    );
  }

  private calculateVerticalMovement(deltaTime: number): number {
    let dY = 0;

    if (this.player.flying) {
      this.player.jumpVelocity = 0;
      this.player.onGround = false;
      if (this.player.isFlyingAscending)
        dY += CONTROL_CONFIG.FLY_SPEED * deltaTime;
      if (this.player.isFlyingDescending)
        dY -= CONTROL_CONFIG.FLY_SPEED * deltaTime;
    } else {
      if (this.player.jumping && this.player.onGround) {
        this.player.jumpVelocity = CONTROL_CONFIG.JUMP_SPEED;
        this.player.onGround = false;
        this.player.jumping = false;
        if (this.player.audioManager)
          this.player.audioManager.playSound("jump");
      }
      this.player.jumpVelocity -= CONTROL_CONFIG.GRAVITY * deltaTime;
      if (this.player.jumpVelocity < -CONTROL_CONFIG.JUMP_SPEED * 2.5) {
        this.player.jumpVelocity = -CONTROL_CONFIG.JUMP_SPEED * 2.5;
      }
      dY = this.player.jumpVelocity;
    }

    return dY;
  }

  private calculateHorizontalMovement(): { moveX: number; moveZ: number } {
    let moveX = 0;
    let moveZ = 0;

    if (this.player.xdir === "left") {
      moveX -= Math.cos(this.player.yaw);
      moveZ += Math.sin(this.player.yaw);
    } else if (this.player.xdir === "right") {
      moveX += Math.cos(this.player.yaw);
      moveZ -= Math.sin(this.player.yaw);
    }
    if (this.player.zdir === "backwards") {
      moveZ += Math.cos(this.player.yaw);
      moveX += Math.sin(this.player.yaw);
    } else if (this.player.zdir === "forwards") {
      moveZ -= Math.cos(this.player.yaw);
      moveX -= Math.sin(this.player.yaw);
    }

    return { moveX, moveZ };
  }

  private calculateEffectiveSpeed(): number {
    let currentEffectiveSpeed = this.player.speed;
    if (this.player.flying && this.player.isBoosting) {
      currentEffectiveSpeed *= this.player.boostSpeedMultiplier;
    } else if (!this.player.flying && this.player.isRunning) {
      currentEffectiveSpeed *= this.player.runSpeedMultiplier;
    }
    return currentEffectiveSpeed;
  }
}
