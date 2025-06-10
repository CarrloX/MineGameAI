import * as THREE from "three";
import type { PlayerWorldService } from "../types";

export interface CollisionResult {
  newPosition: THREE.Vector3;
  isOnGround: boolean;
}

export class CollisionService {
  private world: PlayerWorldService;
  private stepHeight: number;

  constructor(world: PlayerWorldService, stepHeight: number = 0.6) {
    this.world = world;
    this.stepHeight = stepHeight;
  }

  /**
   * Resuelve colisiones y step-up para un volumen dado.
   * @param currentPos Posición actual (Vector3)
   * @param desiredVelocity Vector de movimiento deseado (Vector3)
   * @param dims Dimensiones del jugador/entidad
   * @returns { newPosition, isOnGround }
   */
  public resolveCollisions(
    currentPos: THREE.Vector3,
    desiredVelocity: THREE.Vector3,
    dims: { width: number; height: number; depth: number }
  ): CollisionResult {
    let { x: px, y: py, z: pz } = currentPos;
    let dx = desiredVelocity.x;
    let dy = desiredVelocity.y;
    let dz = desiredVelocity.z;
    let onGround = false;

    // --- EJE X (con lógica de escalón) ---
    if (dx !== 0) {
      const tryX = px + dx;
      const boxX = this.getBox({ x: tryX, y: py, z: pz }, dims);
      if (!this.isBoxCollidingWithWorld(boxX)) {
        px = tryX;
      } else {
        // Intentar step-up
        const stepUpY = py + this.stepHeight;
        const boxStep = this.getBox({ x: tryX, y: stepUpY, z: pz }, dims);
        const boxHead = this.getBox({ x: tryX, y: stepUpY + dims.height - 0.01, z: pz }, dims);
        if (!this.isBoxCollidingWithWorld(boxStep) && !this.isBoxCollidingWithWorld(boxHead)) {
          px = tryX;
          py = stepUpY;
        } else {
          // Ajustar hasta el borde del bloque
          let sign = Math.sign(dx);
          let step = 0.01 * sign;
          let testX = px;
          while (!this.isBoxCollidingWithWorld(this.getBox({ x: testX + step, y: py, z: pz }, dims)) && Math.abs(testX - px) < Math.abs(dx)) {
            testX += step;
          }
          px = testX;
        }
      }
    }

    // --- EJE Y ---
    if (dy !== 0) {
      const tryY = py + dy;
      const boxY = this.getBox({ x: px, y: tryY, z: pz }, dims);
      if (!this.isBoxCollidingWithWorld(boxY)) {
        py = tryY;
      } else {
        // Ajustar hasta el borde del bloque
        let sign = Math.sign(dy);
        let step = 0.01 * sign;
        let testY = py;
        while (!this.isBoxCollidingWithWorld(this.getBox({ x: px, y: testY + step, z: pz }, dims)) && Math.abs(testY - py) < Math.abs(dy)) {
          testY += step;
        }
        py = testY;
        if (dy < 0) {
          onGround = true;
        }
      }
    }

    // --- EJE Z (con lógica de escalón) ---
    if (dz !== 0) {
      const tryZ = pz + dz;
      const boxZ = this.getBox({ x: px, y: py, z: tryZ }, dims);
      if (!this.isBoxCollidingWithWorld(boxZ)) {
        pz = tryZ;
      } else {
        // Intentar step-up
        const stepUpY = py + this.stepHeight;
        const boxStep = this.getBox({ x: px, y: stepUpY, z: tryZ }, dims);
        const boxHead = this.getBox({ x: px, y: stepUpY + dims.height - 0.01, z: tryZ }, dims);
        if (!this.isBoxCollidingWithWorld(boxStep) && !this.isBoxCollidingWithWorld(boxHead)) {
          pz = tryZ;
          py = stepUpY;
        } else {
          // Ajustar hasta el borde del bloque
          let sign = Math.sign(dz);
          let step = 0.01 * sign;
          let testZ = pz;
          while (!this.isBoxCollidingWithWorld(this.getBox({ x: px, y: py, z: testZ + step }, dims)) && Math.abs(testZ - pz) < Math.abs(dz)) {
            testZ += step;
          }
          pz = testZ;
        }
      }
    }

    return {
      newPosition: new THREE.Vector3(px, py, pz),
      isOnGround: onGround,
    };
  }

  /**
   * Devuelve la caja de colisión para una posición y dimensiones dadas.
   */
  public getBox(pos: { x: number; y: number; z: number }, dims: { width: number; height: number; depth: number }): THREE.Box3 {
    const min = new THREE.Vector3(
      pos.x - dims.width / 2,
      pos.y,
      pos.z - dims.depth / 2
    );
    const max = new THREE.Vector3(
      pos.x + dims.width / 2,
      pos.y + dims.height,
      pos.z + dims.depth / 2
    );
    return new THREE.Box3(min, max);
  }

  /**
   * Verifica si la caja dada colisiona con algún bloque sólido en el mundo.
   */
  public isBoxCollidingWithWorld(box: THREE.Box3): boolean {
    const min = box.min;
    const max = box.max;
    for (let x = Math.floor(min.x); x < Math.ceil(max.x); x++) {
      for (let y = Math.floor(min.y); y < Math.ceil(max.y); y++) {
        for (let z = Math.floor(min.z); z < Math.ceil(max.z); z++) {
          const blockType = this.world.getBlock(x, y, z);
          if (blockType && blockType !== "air" && blockType !== "waterBlock") {
            return true;
          }
        }
      }
    }
    return false;
  }
}
