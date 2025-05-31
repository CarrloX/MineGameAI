
import * as THREE from 'three';
import type { Block } from './Block';
import type { World } from './World';
import { CHUNK_SIZE } from './utils';
import type { GameRefs, LookingAtInfo } from './types';


export class Player {
  public x: number;
  public y: number;
  public z: number;
  public height: number;
  public width: number;
  public depth: number;
  public pitch: number;
  public yaw: number;
  public speed: number;
  public velocity: number;
  public jumpSpeed: number;
  public jumpVelocity: number;
  public xdir: string;
  public zdir: string;
  public attackRange: number;
  public lookingAt: LookingAtInfo | null;
  public jumping: boolean;
  public onGround: boolean;
  public dead: boolean;
  public blockFaceHL: { mesh: THREE.LineSegments; dir: string };
  public mesh: THREE.Object3D;
  private name: string;
  private gameRefs: GameRefs;

  public flying: boolean = false;
  public flySpeed: number = 0.1;
  private lastSpacePressTime: number = 0;
  private flyToggleDelay: number = 300;
  public isFlyingAscending: boolean = false;
  public isFlyingDescending: boolean = false;
  public isBoosting: boolean = false;
  public boostSpeedMultiplier: number = 2.0;


  constructor(name: string, gameRefs: GameRefs, x: number = 0, y: number = 0, z: number = 0, preserveCam: boolean = false) {
    this.name = name;
    this.gameRefs = gameRefs;

    this.x = x;
    this.y = y;
    this.z = z;
    this.height = 1.7;
    this.width = 0.6;
    this.depth = 0.6;
    this.pitch = 0;
    this.yaw = 0;
    this.speed = 0.07;
    this.velocity = 0;
    this.jumpSpeed = 0.11;
    this.jumpVelocity = 0;
    this.xdir = "";
    this.zdir = "";
    this.attackRange = 5;
    this.lookingAt = null;
    this.jumping = false;
    this.onGround = false;
    this.dead = false;

    const highlightBoxGeo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    const highlightEdgesGeo = new THREE.EdgesGeometry(highlightBoxGeo);
    const highlightMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });

    this.blockFaceHL = {
      mesh: new THREE.LineSegments(highlightEdgesGeo, highlightMaterial),
      dir: "",
    };
    this.blockFaceHL.mesh.name = "Block_Wireframe_Highlight_Mesh";
    this.blockFaceHL.mesh.renderOrder = 1;

    this.mesh = new THREE.Object3D();
    this.mesh.name = name;
    this.mesh.position.set(this.x, this.y, this.z);

    if (preserveCam && this.gameRefs.camera) {
        this.pitch = this.gameRefs.camera.rotation.x;
        this.yaw = this.gameRefs.camera.rotation.y;
    } else {
        this.lookAround();
    }
  }

  highlightBlock(): void {
    const { raycaster, camera, scene, world } = this.gameRefs;
    if (!raycaster || !camera || !scene || !world) return;

    raycaster.setFromCamera({ x: 0, y: 0 }, camera);

    const chunkMeshesToTest: THREE.Object3D[] = [];
    world.activeChunks.forEach(chunk => {
        if (chunk.chunkRoot.visible) {
            chunkMeshesToTest.push(...chunk.chunkRoot.children);
        }
    });

    const intersects = raycaster.intersectObjects(chunkMeshesToTest, false);

    const firstValidIntersect = intersects.find(
      intersect => intersect.object instanceof THREE.Mesh &&
                   intersect.object.name.startsWith("MergedChunkMesh_") &&
                   intersect.distance > 0.1 &&
                   intersect.distance < this.attackRange &&
                   intersect.face
    );

    if (firstValidIntersect && firstValidIntersect.face) {
      const intersection = firstValidIntersect;
      const hitObject = intersection.object as THREE.Mesh;

      const hitPointWorld = intersection.point.clone();
      const hitNormalLocal = intersection.face.normal.clone();
      const hitNormalWorld = hitNormalLocal.clone().transformDirection(hitObject.matrixWorld).normalize();

      const calculatedBlockWorldCoords = new THREE.Vector3(
        Math.floor(hitPointWorld.x - hitNormalWorld.x * 0.49),
        Math.floor(hitPointWorld.y - hitNormalWorld.y * 0.49),
        Math.floor(hitPointWorld.z - hitNormalWorld.z * 0.49)
      );

      const calculatedPlaceBlockWorldCoords = new THREE.Vector3(
        Math.floor(hitPointWorld.x + hitNormalWorld.x * 0.49),
        Math.floor(hitPointWorld.y + hitNormalWorld.y * 0.49),
        Math.floor(hitPointWorld.z + hitNormalWorld.z * 0.49)
      );

      this.lookingAt = {
        object: hitObject,
        point: intersection.point,
        worldPoint: hitPointWorld,
        face: intersection.face,
        blockWorldCoords: calculatedBlockWorldCoords,
        placeBlockWorldCoords: calculatedPlaceBlockWorldCoords,
        worldFaceNormal: hitNormalWorld,
        distance: intersection.distance,
      };

      if (!scene.getObjectByName(this.blockFaceHL.mesh.name)) {
        scene.add(this.blockFaceHL.mesh);
      }

      this.blockFaceHL.mesh.position.set(
        this.lookingAt.blockWorldCoords.x + 0.5,
        this.lookingAt.blockWorldCoords.y + 0.5,
        this.lookingAt.blockWorldCoords.z + 0.5
      );
      this.blockFaceHL.mesh.rotation.set(0,0,0);

      const currentHitNormalWorld = this.lookingAt.worldFaceNormal;
      if (Math.abs(currentHitNormalWorld.x) > 0.5) this.blockFaceHL.dir = currentHitNormalWorld.x > 0 ? 'East (+X)' : 'West (-X)';
      else if (Math.abs(currentHitNormalWorld.y) > 0.5) this.blockFaceHL.dir = currentHitNormalWorld.y > 0 ? 'Top (+Y)' : 'Bottom (-Y)';
      else if (Math.abs(currentHitNormalWorld.z) > 0.5) this.blockFaceHL.dir = currentHitNormalWorld.z > 0 ? 'South (+Z)' : 'North (-Z)';
      else this.blockFaceHL.dir = 'Unknown Face';

    } else {
      if (this.lookingAt !== null) {
        if (scene.getObjectByName(this.blockFaceHL.mesh.name)) {
          scene.remove(this.blockFaceHL.mesh);
        }
        this.lookingAt = null;
        this.blockFaceHL.dir = "";
      }
    }
  }

  lookAround(e?: MouseEvent | Touch): void {
    const { cursor, camera } = this.gameRefs;
    if (!cursor || !camera || !this.gameRefs.canvasRef) return;

    if (cursor.inWindow) {
      const sensitivity = 0.002;
      if (e instanceof MouseEvent) {
        this.yaw -= e.movementX * sensitivity;
        this.pitch -= e.movementY * sensitivity;
      }
      const maxPitch = Math.PI / 2 - 0.01;
      this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
      this.yaw = ((this.yaw % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);
      camera.rotation.x = this.pitch;
      camera.rotation.y = this.yaw;
    } else {
        camera.rotation.x = this.pitch;
        camera.rotation.y = this.yaw;
    }
  }

  interactWithBlock(destroy: boolean): void {
    const { world, blocks: blockPrototypesArray } = this.gameRefs;
    if (!world || !blockPrototypesArray || !this.lookingAt) return;

    if (destroy) {
      const { x, y, z } = this.lookingAt.blockWorldCoords;
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
          world.setBlock(x, y, z, 'air');
      } else {
          console.warn("Invalid block coordinates for destruction:", this.lookingAt.blockWorldCoords);
      }
    } else {
      const { x: placeX, y: placeY, z: placeZ } = this.lookingAt.placeBlockWorldCoords;
       if (!Number.isFinite(placeX) || !Number.isFinite(placeY) || !Number.isFinite(placeZ)) {
          console.warn("Invalid block coordinates for placement:", this.lookingAt.placeBlockWorldCoords);
          return;
      }

      const playerHeadY = Math.floor(this.y + this.height - 0.1);
      const playerFeetY = Math.floor(this.y + 0.1);

      if ( (Math.floor(placeX) === Math.floor(this.x) && Math.floor(placeZ) === Math.floor(this.z)) &&
           (Math.floor(placeY) === playerFeetY || Math.floor(placeY) === playerHeadY) ) {
        return;
      }

      if (placeY >= 0 && placeY < world.layers) {
        const blockToPlace = blockPrototypesArray[0];
        if (blockToPlace) {
          const blockMeshName = blockToPlace.mesh.name;
          const blockNameKey = blockMeshName.startsWith('Block_') ? blockMeshName.substring(6) : 'unknownBlock';

          if(blockNameKey && blockNameKey !== 'air' && blockNameKey !== 'unknownBlock') {
            world.setBlock(placeX, placeY, placeZ, blockNameKey);
          } else {
            console.warn("Attempted to place an invalid block type:", blockNameKey);
          }
        }
      }
    }
  }

  handleKeyDown(e: KeyboardEvent): void {
    const { controlConfig, cursor } = this.gameRefs;
    if (!controlConfig || !cursor || !cursor.inWindow) return;

    switch (e.code) {
      case controlConfig.left: this.xdir = "left"; break;
      case controlConfig.right: this.xdir = "right"; break;
      case controlConfig.forwards: this.zdir = "forwards"; break;
      case controlConfig.backwards: this.zdir = "backwards"; break;
      case controlConfig.respawn: this.die(); break;
      case controlConfig.jump:
        const now = performance.now();
        if (now - this.lastSpacePressTime < this.flyToggleDelay) {
          this.flying = !this.flying;
          this.isFlyingAscending = false;
          this.isFlyingDescending = false;
          this.jumping = false;
          if (this.flying) {
            this.jumpVelocity = 0;
            this.onGround = false;
          } else {
             // When disabling flight, ensure boosting is also off
            this.isBoosting = false;
          }
          this.lastSpacePressTime = 0; // Consume the double tap
        } else {
          if (this.flying) {
            this.isFlyingAscending = true;
          } else {
            this.jumping = true;
          }
          this.lastSpacePressTime = now;
        }
        break;
      case controlConfig.flyDown:
        if (this.flying) {
          this.isFlyingDescending = true;
        }
        break;
      case controlConfig.boost:
        if (this.flying) {
          this.isBoosting = !this.isBoosting; // Toggle boost
        }
        break;
    }
  }

  handleKeyUp(e: KeyboardEvent): void {
    const { controlConfig } = this.gameRefs;
    if (!controlConfig) return;

    switch (e.code) {
      case controlConfig.left: if(this.xdir === "left") this.xdir = ""; break;
      case controlConfig.right: if(this.xdir === "right") this.xdir = ""; break;
      case controlConfig.forwards: if(this.zdir === "forwards") this.zdir = ""; break;
      case controlConfig.backwards: if(this.zdir === "backwards") this.zdir = ""; break;
      case controlConfig.jump:
        this.jumping = false;
        this.isFlyingAscending = false;
        break;
      case controlConfig.flyDown:
        this.isFlyingDescending = false;
        break;
      // No change needed for controlConfig.boost on keyUp as it's a toggle now
    }
  }

  die(): void {
    this.dead = true;
  }

  updatePosition(): void {
    const { world, camera } = this.gameRefs;
    if (!world || !camera) return;

    if (this.flying) {
      this.jumpVelocity = 0;
      this.onGround = false;
    }

    // Horizontal movement
    let moveX = 0;
    let moveZ = 0;

    if (this.xdir === "left") {
      moveX -= Math.cos(this.yaw);
      moveZ += Math.sin(this.yaw);
    } else if (this.xdir === "right") {
      moveX += Math.cos(this.yaw);
      moveZ -= Math.sin(this.yaw);
    }
    if (this.zdir === "backwards") {
      moveZ += Math.cos(this.yaw);
      moveX += Math.sin(this.yaw);
    } else if (this.zdir === "forwards") {
      moveZ -= Math.cos(this.yaw);
      moveX -= Math.sin(this.yaw);
    }

    let currentSpeed = this.speed;
    if (this.flying && this.isBoosting) {
      currentSpeed *= this.boostSpeedMultiplier;
    }

    let nextPlayerX = this.x;
    let nextPlayerZ = this.z;
    const moveMagnitude = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (moveMagnitude > 0) {
        const normalizedMoveX = moveX / moveMagnitude;
        const normalizedMoveZ = moveZ / moveMagnitude;
        nextPlayerX += normalizedMoveX * currentSpeed;
        nextPlayerZ += normalizedMoveZ * currentSpeed;
    }

    // Vertical movement
    let dY = 0;
    if (this.flying) {
      this.jumpVelocity = 0; // Ensure no residual jump velocity
      this.onGround = false;   // Ensure not considered on ground
      if (this.isFlyingAscending) {
        dY += this.flySpeed;
      }
      if (this.isFlyingDescending) {
        dY -= this.flySpeed;
      }
    } else {
      if (this.jumping && this.onGround) {
        this.jumpVelocity = this.jumpSpeed;
        this.onGround = false;
      }
      this.jumpVelocity -= world.gravity;
      if (this.jumpVelocity < -this.jumpSpeed * 2.5) {
          this.jumpVelocity = -this.jumpSpeed * 2.5;
      }
      dY += this.jumpVelocity;
    }
    let nextPlayerY = this.y + dY;

    // Collision detection and response
    let correctedX = nextPlayerX;
    let correctedY = nextPlayerY;
    let correctedZ = nextPlayerZ;

    let landedOnGroundThisFrame = false;

    const checkRadius = 1;
    const startBlockY = Math.max(0, Math.floor(correctedY) - checkRadius);
    const endBlockY = Math.min(world.layers, Math.floor(correctedY + this.height) + checkRadius + 1);

    for (let checkWorldX = Math.floor(correctedX - this.width/2) - checkRadius; checkWorldX <= Math.floor(correctedX + this.width/2) + checkRadius; checkWorldX++) {
        for (let checkWorldZ = Math.floor(correctedZ - this.depth/2) - checkRadius; checkWorldZ <= Math.floor(correctedZ + this.depth/2) + checkRadius; checkWorldZ++) {
            for (let checkWorldY = startBlockY; checkWorldY < endBlockY; checkWorldY++) {
                const blockType = world.getBlock(checkWorldX, checkWorldY, checkWorldZ);
                if (blockType && blockType !== 'air') {
                    const bMinX = checkWorldX;
                    const bMaxX = checkWorldX + 1;
                    const bMinY = checkWorldY;
                    const bMaxY = checkWorldY + 1;
                    const bMinZ = checkWorldZ;
                    const bMaxZ = checkWorldZ + 1;

                    // Use the already corrected positions from previous collision checks in this frame
                    let pMinProposedX = correctedX - this.width / 2;
                    let pMaxProposedX = correctedX + this.width / 2;
                    let pMinProposedY = correctedY;
                    let pMaxProposedY = correctedY + this.height;
                    let pMinProposedZ = correctedZ - this.depth / 2;
                    let pMaxProposedZ = correctedZ + this.depth / 2;

                    if (pMaxProposedX > bMinX && pMinProposedX < bMaxX &&
                        pMaxProposedY > bMinY && pMinProposedY < bMaxY &&
                        pMaxProposedZ > bMinZ && pMinProposedZ < bMaxZ) {

                        const overlapX = Math.min(pMaxProposedX - bMinX, bMaxX - pMinProposedX);
                        const overlapY = Math.min(pMaxProposedY - bMinY, bMaxY - pMinProposedY);
                        const overlapZ = Math.min(pMaxProposedZ - bMinZ, bMaxZ - pMinProposedZ);

                        if (overlapY <= overlapX && overlapY <= overlapZ) {
                            if (this.flying) {
                                if (dY > 0 && pMinProposedY < bMaxY ) { // Moving up into block
                                    correctedY = bMinY - this.height;
                                } else if (dY < 0 && pMaxProposedY > bMinY) { // Moving down into block
                                    correctedY = bMaxY;
                                } else if (dY === 0 && (pMinProposedY < bMaxY && pMaxProposedY > bMinY) ) { // Intersecting while static
                                     correctedY = bMaxY; // Push up if stuck
                                }
                                // jumpVelocity is already 0 if flying
                            } else { // Not flying
                                if (dY <= 0 && pMinProposedY < bMaxY && this.y >= bMaxY - 0.01 ) { // Landing or on ground
                                    correctedY = bMaxY;
                                    this.jumpVelocity = 0;
                                    landedOnGroundThisFrame = true;
                                } else if (dY > 0 && pMaxProposedY > bMinY && this.y + this.height <= bMinY + 0.01) { // Hitting ceiling
                                    correctedY = bMinY - this.height;
                                    this.jumpVelocity = -0.001; // Stop upward momentum
                                }
                            }
                        } else if (overlapX < overlapY && overlapX < overlapZ) {
                            if ((pMaxProposedX - bMinX) < (bMaxX - pMinProposedX)) {
                                correctedX = bMinX - this.width / 2 - 0.001;
                            } else {
                                correctedX = bMaxX + this.width / 2 + 0.001;
                            }
                        } else {
                             if ((pMaxProposedZ - bMinZ) < (bMaxZ - pMinProposedZ)) {
                                correctedZ = bMinZ - this.depth / 2 - 0.001;
                            } else {
                                correctedZ = bMaxZ + this.depth / 2 + 0.001;
                            }
                        }
                    }
                }
            }
        }
    }

    // Apply world boundary checks AFTER block collisions
    if (this.flying) {
        this.jumpVelocity = 0; // Re-assert no jump velocity if flying
        this.onGround = false; // Re-assert not on ground if flying
        if (correctedY < 0) { // Flying down and hitting y=0
            correctedY = 0;
        }
        if (correctedY + this.height > world.layers) { // Flying up and hitting world ceiling
            correctedY = world.layers - this.height;
        }
    } else {
        // Normal physics for non-flying state
        if (correctedY < 0) {
            correctedY = 0;
            landedOnGroundThisFrame = true;
            this.jumpVelocity = 0;
        }
         if (correctedY + this.height > world.layers) {
            correctedY = world.layers - this.height;
            if (this.jumpVelocity > 0) this.jumpVelocity = -0.001; // Hit ceiling
        }
    }

    this.x = correctedX;
    this.y = correctedY;
    this.z = correctedZ;

    if (!this.flying) {
        this.onGround = landedOnGroundThisFrame;
    } else {
        this.onGround = false;
    }

    if (this.y < -world.voidHeight) this.die();

    this.mesh.position.set(this.x, this.y, this.z);
    camera.position.set(this.x, this.y + this.height * 0.9, this.z);
  }
}
