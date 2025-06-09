import * as THREE from "three";
import { CONTROL_CONFIG } from "../CONTROL_CONFIG";
import type { PlayerWorldService } from "../types";

export class PlayerMovementService {
  private worldService: PlayerWorldService;
  private player: any; // Referencia al jugador para actualizar su posición

  constructor(worldService: PlayerWorldService, player: any) {
    this.worldService = worldService;
    this.player = player;
  }

  public updatePosition(deltaTime: number): void {
    let dY = this.calculateVerticalMovement(deltaTime);
    let { moveX, moveZ } = this.calculateHorizontalMovement();
    let currentEffectiveSpeed = this.calculateEffectiveSpeed();

    let { nextPlayerX, nextPlayerZ } = this.calculateNextPosition(
      moveX,
      moveZ,
      currentEffectiveSpeed,
      deltaTime
    );
    let { correctedX, correctedY, correctedZ, landedOnGroundThisFrame } =
      this.handleCollisions(nextPlayerX, this.player.y + dY, nextPlayerZ);

    this.applyFinalPosition(
      correctedX,
      correctedY,
      correctedZ,
      landedOnGroundThisFrame
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

  private calculateNextPosition(
    moveX: number,
    moveZ: number,
    currentEffectiveSpeed: number,
    deltaTime: number
  ): { nextPlayerX: number; nextPlayerZ: number } {
    let nextPlayerX = this.player.x;
    let nextPlayerZ = this.player.z;
    const moveMagnitude = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (moveMagnitude > 0) {
      const normalizedMoveX = moveX / moveMagnitude;
      const normalizedMoveZ = moveZ / moveMagnitude;
      nextPlayerX += normalizedMoveX * currentEffectiveSpeed * deltaTime;
      nextPlayerZ += normalizedMoveZ * currentEffectiveSpeed * deltaTime;
    }
    return { nextPlayerX, nextPlayerZ };
  }

  private handleCollisions(
    nextPlayerX: number,
    nextPlayerY: number,
    nextPlayerZ: number
  ): {
    correctedX: number;
    correctedY: number;
    correctedZ: number;
    landedOnGroundThisFrame: boolean;
  } {
    let correctedX = nextPlayerX;
    let correctedY = nextPlayerY;
    let correctedZ = nextPlayerZ;
    let landedOnGroundThisFrame = false;

    const pMinProposedGlobalY = correctedY;
    const pMaxProposedGlobalY = correctedY + this.player.height;
    const pMinProposedGlobalX = correctedX - this.player.width / 2;
    const pMaxProposedGlobalX = correctedX + this.player.width / 2;
    const pMinProposedGlobalZ = correctedZ - this.player.depth / 2;
    const pMaxProposedGlobalZ = correctedZ + this.player.depth / 2;

    const checkRadius = 1;
    const startBlockY = Math.max(
      0,
      Math.floor(pMinProposedGlobalY) - checkRadius
    );
    const endBlockY = Math.min(
      this.worldService.layers,
      Math.ceil(pMaxProposedGlobalY) + checkRadius
    );

    for (
      let checkWorldX = Math.floor(pMinProposedGlobalX) - checkRadius;
      checkWorldX <= Math.ceil(pMaxProposedGlobalX) + checkRadius;
      checkWorldX++
    ) {
      for (
        let checkWorldZ = Math.floor(pMinProposedGlobalZ) - checkRadius;
        checkWorldZ <= Math.ceil(pMaxProposedGlobalZ) + checkRadius;
        checkWorldZ++
      ) {
        for (
          let checkWorldY = startBlockY;
          checkWorldY < endBlockY;
          checkWorldY++
        ) {
          const blockType = this.worldService.getBlock(
            checkWorldX,
            checkWorldY,
            checkWorldZ
          );

          if (blockType && blockType !== "air" && blockType !== "waterBlock") {
            const collisionResult = this.resolveCollision(
              checkWorldX,
              checkWorldY,
              checkWorldZ,
              correctedX,
              correctedY,
              correctedZ,
              blockType
            );
            correctedX = collisionResult.correctedX;
            correctedY = collisionResult.correctedY;
            correctedZ = collisionResult.correctedZ;
            if (collisionResult.landedOnGround) landedOnGroundThisFrame = true;
          }
        }
      }
    }

    return { correctedX, correctedY, correctedZ, landedOnGroundThisFrame };
  }

  private resolveCollision(
    blockX: number,
    blockY: number,
    blockZ: number,
    playerX: number,
    playerY: number,
    playerZ: number,
    blockType: string
  ): {
    correctedX: number;
    correctedY: number;
    correctedZ: number;
    landedOnGround: boolean;
  } {
    const bMinX = blockX;
    const bMaxX = blockX + 1;
    const bMinY = blockY;
    const bMaxY = blockY + 1;
    const bMinZ = blockZ;
    const bMaxZ = blockZ + 1;

    let pMinX = playerX - this.player.width / 2;
    let pMaxX = playerX + this.player.width / 2;
    let pMinY = playerY;
    let pMaxY = playerY + this.player.height;
    let pMinZ = playerZ - this.player.depth / 2;
    let pMaxZ = playerZ + this.player.depth / 2;

    let correctedX = playerX;
    let correctedY = playerY;
    let correctedZ = playerZ;
    let landedOnGround = false;

    if (
      pMaxX > bMinX &&
      pMinX < bMaxX &&
      pMaxY > bMinY &&
      pMinY < bMaxY &&
      pMaxZ > bMinZ &&
      pMinZ < bMaxZ
    ) {
      const overlapX = Math.min(pMaxX - bMinX, bMaxX - pMinX);
      const overlapY = Math.min(pMaxY - bMinY, bMaxY - pMinY);
      const overlapZ = Math.min(pMaxZ - bMinZ, bMaxZ - pMinZ);

      if (overlapY <= overlapX && overlapY <= overlapZ) {
        if (this.player.flying) {
          if (this.player.jumpVelocity > 0 && pMinY < bMaxY) {
            correctedY = bMinY - this.player.height - 0.001;
          } else if (this.player.jumpVelocity < 0 && pMaxY > bMinY) {
            correctedY = bMaxY + 0.001;
          } else if (
            this.player.jumpVelocity === 0 &&
            pMaxY > bMinY &&
            pMinY < bMaxY
          ) {
            correctedY =
              this.player.y > bMinY + this.player.height / 2
                ? bMaxY + 0.001
                : bMinY - this.player.height - 0.001;
          }
          this.player.jumpVelocity = 0;
        } else {
          if (
            this.player.jumpVelocity <= 0 &&
            pMinY < bMaxY - 0.0001 &&
            this.player.y >= bMaxY - 0.01
          ) {
            correctedY = bMaxY;
            this.player.jumpVelocity = 0;
            landedOnGround = true;
          } else if (
            this.player.jumpVelocity > 0 &&
            pMaxY > bMinY &&
            this.player.y + this.player.height <= bMinY + 0.01
          ) {
            correctedY = bMinY - this.player.height;
            this.player.jumpVelocity = -0.001;
          }
        }
      } else if (overlapX <= overlapY && overlapX <= overlapZ) {
        if (
          !this.player.flying &&
          this.player.isRunning &&
          blockType !== "air" &&
          blockType !== "waterBlock"
        ) {
          this.player.stateService.toggleRunning();
        }
        if (pMaxX - bMinX < bMaxX - pMinX) {
          correctedX = bMinX - this.player.width / 2 - 0.001;
        } else {
          correctedX = bMaxX + this.player.width / 2 + 0.001;
        }
      } else {
        if (
          !this.player.flying &&
          this.player.isRunning &&
          blockType !== "air" &&
          blockType !== "waterBlock"
        ) {
          this.player.stateService.toggleRunning();
        }
        if (pMaxZ - bMinZ < bMaxZ - pMinZ) {
          correctedZ = bMinZ - this.player.depth / 2 - 0.001;
        } else {
          correctedZ = bMaxZ + this.player.depth / 2 + 0.001;
        }
      }
    }

    return { correctedX, correctedY, correctedZ, landedOnGround };
  }

  private applyFinalPosition(
    correctedX: number,
    correctedY: number,
    correctedZ: number,
    landedOnGroundThisFrame: boolean
  ): void {
    this.player.x = correctedX;
    this.player.y = correctedY;
    this.player.z = correctedZ;

    if (this.player.flying) {
      this.player.jumpVelocity = 0;
      this.player.onGround = false;
      if (this.player.y < 0) this.player.y = 0;
      if (this.player.y + this.player.height > this.worldService.layers) {
        this.player.y = this.worldService.layers - this.player.height;
      }
    } else {
      if (this.player.y < 0) {
        this.player.y = 0;
        landedOnGroundThisFrame = true;
        this.player.jumpVelocity = 0;
        if (!this.player.dead) this.player.die();
      }
      if (this.player.y + this.player.height > this.worldService.layers) {
        this.player.y = this.worldService.layers - this.player.height;
        if (this.player.jumpVelocity > 0) this.player.jumpVelocity = -0.001;
      }
      this.player.onGround = landedOnGroundThisFrame;
    }

    const playerFeetBlockX = Math.floor(this.player.x);
    const playerFeetBlockY = Math.floor(this.player.y + 0.01);
    const playerFeetBlockZ = Math.floor(this.player.z);
    const blockAtFeet = this.worldService.getBlock(
      playerFeetBlockX,
      playerFeetBlockY,
      playerFeetBlockZ
    );

    if (
      !this.player.flying &&
      this.player.isRunning &&
      blockAtFeet === "waterBlock"
    ) {
      this.player.stateService.toggleRunning();
    }

    if (this.player.y < -this.worldService.voidHeight && !this.player.dead) {
      this.player.die();
    }

    this.player.mesh.position.set(this.player.x, this.player.y, this.player.z);
    this.player.cameraService.position.set(
      this.player.x,
      this.player.y + this.player.height * 0.9,
      this.player.z
    );
  }
}
