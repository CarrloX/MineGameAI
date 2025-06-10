import * as THREE from "three";
import { CONTROL_CONFIG } from "../CONTROL_CONFIG";
import type { PlayerWorldService } from "../types";

const STEP_HEIGHT_LIMIT = 0.6; // Altura máxima de escalón que el jugador puede subir automáticamente

export class PlayerMovementService {
  private worldService: PlayerWorldService;
  private player: any; // Referencia al jugador para actualizar su posición

  constructor(worldService: PlayerWorldService, player: any) {
    this.worldService = worldService;
    this.player = player;
  }

  /**
   * Movimiento y colisión incremental por eje (X, Y, Z).
   * Aplica el movimiento en cada eje y ajusta la posición si hay colisión.
   */
  public updatePosition(deltaTime: number): void {
    // 1. Calcular velocidades
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

    // 2. Movimiento incremental por eje
    let { x: px, y: py, z: pz } = this.player;
    let onGround = false;

    // --- EJE X (con lógica de escalón) ---
    if (dx !== 0) {
      const tryX = px + dx;
      const boxX = this.player.getCollisionBox({ x: tryX, y: py, z: pz });
      if (!this.isBoxCollidingWithWorld(boxX)) {
        px = tryX;
      } else {
        // Intentar step-up
        const stepUpY = py + STEP_HEIGHT_LIMIT;
        const boxStep = this.player.getCollisionBox({ x: tryX, y: stepUpY, z: pz });
        const boxHead = this.player.getCollisionBox({ x: tryX, y: stepUpY + this.player.height - 0.01, z: pz });
        if (!this.isBoxCollidingWithWorld(boxStep) && !this.isBoxCollidingWithWorld(boxHead)) {
          px = tryX;
          py = stepUpY;
        } else {
          // Ajustar hasta el borde del bloque
          let sign = Math.sign(dx);
          let step = 0.01 * sign;
          let testX = px;
          while (!this.isBoxCollidingWithWorld(this.player.getCollisionBox({ x: testX + step, y: py, z: pz })) && Math.abs(testX - px) < Math.abs(dx)) {
            testX += step;
          }
          px = testX;
        }
      }
    }

    // --- EJE Y ---
    if (dy !== 0) {
      const tryY = py + dy;
      const boxY = this.player.getCollisionBox({ x: px, y: tryY, z: pz });
      if (!this.isBoxCollidingWithWorld(boxY)) {
        py = tryY;
      } else {
        // Ajustar hasta el borde del bloque
        let sign = Math.sign(dy);
        let step = 0.01 * sign;
        let testY = py;
        while (!this.isBoxCollidingWithWorld(this.player.getCollisionBox({ x: px, y: testY + step, z: pz })) && Math.abs(testY - py) < Math.abs(dy)) {
          testY += step;
        }
        py = testY;
        // Si el movimiento era descendente y hay colisión, está en el suelo
        if (dy < 0) {
          onGround = true;
          this.player.jumpVelocity = 0;
        } else if (dy > 0) {
          this.player.jumpVelocity = -0.001;
        }
      }
    }

    // --- EJE Z (con lógica de escalón) ---
    if (dz !== 0) {
      const tryZ = pz + dz;
      const boxZ = this.player.getCollisionBox({ x: px, y: py, z: tryZ });
      if (!this.isBoxCollidingWithWorld(boxZ)) {
        pz = tryZ;
      } else {
        // Intentar step-up
        const stepUpY = py + STEP_HEIGHT_LIMIT;
        const boxStep = this.player.getCollisionBox({ x: px, y: stepUpY, z: tryZ });
        const boxHead = this.player.getCollisionBox({ x: px, y: stepUpY + this.player.height - 0.01, z: tryZ });
        if (!this.isBoxCollidingWithWorld(boxStep) && !this.isBoxCollidingWithWorld(boxHead)) {
          pz = tryZ;
          py = stepUpY;
        } else {
          // Ajustar hasta el borde del bloque
          let sign = Math.sign(dz);
          let step = 0.01 * sign;
          let testZ = pz;
          while (!this.isBoxCollidingWithWorld(this.player.getCollisionBox({ x: px, y: py, z: testZ + step })) && Math.abs(testZ - pz) < Math.abs(dz)) {
            testZ += step;
          }
          pz = testZ;
        }
      }
    }

    // 3. Aplicar posición final
    this.player.x = px;
    this.player.y = py;
    this.player.z = pz;
    this.player.onGround = onGround;
    this.player.mesh.position.set(px, py, pz);
    this.player.cameraService.position.set(
      px,
      py + this.player.height * 0.9,
      pz
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

  /**
   * Verifica si la caja dada colisiona con algún bloque sólido en el mundo.
   * Devuelve true si hay colisión, false si está libre.
   */
  private isBoxCollidingWithWorld(box: THREE.Box3): boolean {
    const min = box.min;
    const max = box.max;
    for (let x = Math.floor(min.x); x < Math.ceil(max.x); x++) {
      for (let y = Math.floor(min.y); y < Math.ceil(max.y); y++) {
        for (let z = Math.floor(min.z); z < Math.ceil(max.z); z++) {
          const blockType = this.worldService.getBlock(x, y, z);
          if (blockType && blockType !== "air" && blockType !== "waterBlock") {
            return true;
          }
        }
      }
    }
    return false;
  }
}
