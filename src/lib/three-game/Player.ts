
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
  private flyToggleDelay: number = 300; // Milliseconds for double tap
  public isFlyingAscending: boolean = false;
  public isFlyingDescending: boolean = false;


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
    this.blockFaceHL.mesh.renderOrder = 1; // Render on top

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
                   intersect.distance > 0.1 && // Avoid intersecting self/too close
                   intersect.distance < this.attackRange &&
                   intersect.face // Ensure face is available
    );

    if (firstValidIntersect && firstValidIntersect.face) {
      const intersection = firstValidIntersect;
      const hitObject = intersection.object as THREE.Mesh;

      const hitPointWorld = intersection.point.clone();
      const hitNormalLocal = intersection.face.normal.clone();
      // Transform normal to world space
      const hitNormalWorld = hitNormalLocal.clone().transformDirection(hitObject.matrixWorld).normalize();

      // Calculate block coordinates by slightly offsetting from the hit point along the normal
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
      this.blockFaceHL.mesh.rotation.set(0,0,0); // Ensure no rotation for wireframe cube

      // Update debug direction based on the world normal
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
        this.blockFaceHL.dir = ""; // Reset direction
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
      // Clamp pitch
      const maxPitch = Math.PI / 2 - 0.01; // Avoid gimbal lock
      this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
      // Normalize yaw
      this.yaw = ((this.yaw % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI); // Keep yaw within 0 to 2PI
      camera.rotation.x = this.pitch;
      camera.rotation.y = this.yaw;
    } else {
        // If cursor is not locked, maintain current camera rotation based on player pitch/yaw
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
    } else { // Place block
      const { x: placeX, y: placeY, z: placeZ } = this.lookingAt.placeBlockWorldCoords;
       if (!Number.isFinite(placeX) || !Number.isFinite(placeY) || !Number.isFinite(placeZ)) {
          console.warn("Invalid block coordinates for placement:", this.lookingAt.placeBlockWorldCoords);
          return;
      }

      // Prevent placing block inside player's own space
      const playerHeadY = Math.floor(this.y + this.height - 0.1); // Slightly below top of head
      const playerFeetY = Math.floor(this.y + 0.1); // Slightly above feet

      if ( (Math.floor(placeX) === Math.floor(this.x) && Math.floor(placeZ) === Math.floor(this.z)) &&
           (Math.floor(placeY) === playerFeetY || Math.floor(placeY) === playerHeadY) ) {
        // Trying to place block in player's own space
        return;
      }

      if (placeY >= 0 && placeY < world.layers) {
        // For now, assume placing the first block type from the prototypes (e.g., grass or stone)
        // This should be replaced with a selected block from an inventory later
        const blockToPlace = blockPrototypesArray[0]; // Example: always place the first block type
        if (blockToPlace) {
          const blockMeshName = blockToPlace.mesh.name;
          // Extract block type name from mesh name (e.g., "Block_grassBlock" -> "grassBlock")
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
      case controlConfig.jump: // Space bar
        const now = performance.now();
        if (now - this.lastSpacePressTime < this.flyToggleDelay) {
          // This is a "quick follow-up press" (potential double tap)
          this.flying = !this.flying; // Toggle flight mode
          if (this.flying) { // Just entered flight mode
            this.jumpVelocity = 0;
            this.onGround = false;
            this.jumping = false;
            this.isFlyingAscending = false;
            this.isFlyingDescending = false;
          } else { // Just exited flight mode
            this.isFlyingAscending = false;
            this.isFlyingDescending = false;
            // Gravity will take over if in air
          }
          this.lastSpacePressTime = 0; // Reset timer to prevent immediate re-toggle
        } else {
          // This is a "first" press or a slow press
          if (this.flying) {
            this.isFlyingAscending = true;
          } else {
            this.jumping = true; // Normal jump if not flying
          }
          this.lastSpacePressTime = now; // This press becomes the new reference for a potential double tap
        }
        break;
      case controlConfig.flyDown: // Typically ShiftLeft
        if (this.flying) {
          this.isFlyingDescending = true;
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
      case controlConfig.jump: // Space bar
        this.jumping = false; // Stop normal jump attempt
        this.isFlyingAscending = false; // Stop ascending if flying
        break;
      case controlConfig.flyDown: // Typically ShiftLeft
        this.isFlyingDescending = false; // Stop descending if flying
        break;
    }
  }

  die(): void {
    this.dead = true;
  }

  updatePosition(): void {
    const { world, camera } = this.gameRefs;
    if (!world || !camera) return;

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

    // Normalize diagonal movement
    const moveMagnitude = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (moveMagnitude > 0) {
        const normalizedMoveX = moveX / moveMagnitude;
        const normalizedMoveZ = moveZ / moveMagnitude;
        this.x += normalizedMoveX * this.speed;
        this.z += normalizedMoveZ * this.speed;
    }

    // Vertical movement
    if (this.flying) {
      this.jumpVelocity = 0; // No external vertical velocity while flying
      if (this.isFlyingAscending) {
        this.y += this.flySpeed;
      }
      if (this.isFlyingDescending) {
        this.y -= this.flySpeed;
      }
      // No gravity applied while flying
    } else {
      // Normal jump and gravity logic
      if (this.jumping && this.onGround) {
        this.jumpVelocity = this.jumpSpeed;
        this.onGround = false;
      }

      this.y += this.jumpVelocity;
      this.jumpVelocity -= world.gravity;
      if (this.jumpVelocity < -this.jumpSpeed * 1.5) { // Terminal velocity-ish for falling
          this.jumpVelocity = -this.jumpSpeed * 1.5;
      }
    }

    // Reset onGround before collision checks, unless flying and not actively descending.
    // This allows levitation when flying.
    if (!this.flying || (this.flying && this.isFlyingDescending)) {
        this.onGround = false;
    }


    // Collision detection and response
    const playerMinX = this.x - this.width / 2;
    const playerMaxX = this.x + this.width / 2;
    const playerMinY = this.y; // Bottom of the player
    const playerMaxY = this.y + this.height; // Top of the player
    const playerMinZ = this.z - this.depth / 2;
    const playerMaxZ = this.z + this.depth / 2;

    // Define a bounding box around the player for block checking
    const checkRadius = 1; // Check 1 block around in each direction
    const startBlockY = Math.max(0, Math.floor(this.y) - checkRadius -1);
    const endBlockY = Math.min(world.layers, Math.floor(this.y + this.height) + checkRadius + 1);

    for (let checkWorldX = Math.floor(playerMinX) - checkRadius; checkWorldX <= Math.floor(playerMaxX) + checkRadius; checkWorldX++) {
        for (let checkWorldZ = Math.floor(playerMinZ) - checkRadius; checkWorldZ <= Math.floor(playerMaxZ) + checkRadius; checkWorldZ++) {
            for (let checkWorldY = startBlockY; checkWorldY < endBlockY; checkWorldY++) {
                const blockType = world.getBlock(checkWorldX, checkWorldY, checkWorldZ);
                if (blockType && blockType !== 'air') { // If it's a solid block
                    const blockMinX = checkWorldX;
                    const blockMaxX = checkWorldX + 1;
                    const blockMinY = checkWorldY;
                    const blockMaxY = checkWorldY + 1;
                    const blockMinZ = checkWorldZ;
                    const blockMaxZ = checkWorldZ + 1;

                    // AABB collision check
                    if (playerMaxX > blockMinX && playerMinX < blockMaxX &&
                        playerMaxY > blockMinY && playerMinY < blockMaxY &&
                        playerMaxZ > blockMinZ && playerMinZ < blockMaxZ) {
                        
                        // Collision occurred, determine resolution axis
                        const overlapXRight = playerMaxX - blockMinX;
                        const overlapXLeft = blockMaxX - playerMinX;
                        const overlapYTop = playerMaxY - blockMinY;    // Player's head hitting block's bottom
                        const overlapYBottom = blockMaxY - playerMinY;  // Player's feet hitting block's top
                        const overlapZFront = playerMaxZ - blockMinZ;
                        const overlapZBack = blockMaxZ - playerMinZ;

                        const minOverlapX = Math.min(overlapXRight, overlapXLeft);
                        const minOverlapY = Math.min(overlapYTop, overlapYBottom);
                        const minOverlapZ = Math.min(overlapZFront, overlapZBack);

                        if (minOverlapY < minOverlapX && minOverlapY < minOverlapZ) {
                            // Vertical collision is smallest
                            if (overlapYBottom < overlapYTop) { // Collision with ground (player's feet hit block's top)
                                if (this.flying) {
                                    if (!this.isFlyingDescending) { // If flying and not trying to go down
                                        this.y = blockMaxY; // Land on top of block
                                        this.jumpVelocity = 0;
                                        // DO NOT set this.onGround = true if flying, to allow levitation
                                    }
                                    // If isFlyingDescending, allow to pass through (no specific action needed here for it)
                                } else { // Not flying
                                    if (this.jumpVelocity <= 0) { // Only if falling or not moving vertically
                                        this.y = blockMaxY;
                                        this.jumpVelocity = 0;
                                        this.onGround = true;
                                    }
                                }
                            } else { // Collision with ceiling (player's head hit block's bottom)
                                if (this.flying && !this.isFlyingAscending) { // If flying and not trying to go up
                                    this.y = blockMinY - this.height;
                                    this.jumpVelocity = 0;
                                } else if (!this.flying && this.jumpVelocity > 0) { // Not flying but was jumping up
                                    this.y = blockMinY - this.height;
                                    this.jumpVelocity = -0.001; // Stop upward movement slightly
                                }
                            }
                        } else if (minOverlapX < minOverlapY && minOverlapX < minOverlapZ) {
                            // Horizontal X collision is smallest
                            if (overlapXRight < overlapXLeft) {
                                this.x = blockMinX - this.width / 2;
                            } else {
                                this.x = blockMaxX + this.width / 2;
                            }
                        } else {
                            // Horizontal Z collision is smallest
                            if (overlapZFront < overlapZBack) {
                                this.z = blockMinZ - this.depth / 2;
                            } else {
                                this.z = blockMaxZ + this.depth / 2;
                            }
                        }
                    }
                }
            }
        }
    }

    // Check for falling out of the world
    if (this.y < -world.voidHeight) this.die();

    // Update player's invisible mesh position (if used for other things)
    this.mesh.position.set(this.x, this.y, this.z);

    // Update camera position to follow player
    camera.position.set(this.x, this.y + this.height * 0.9, this.z); // Camera slightly above player's feet (eye level)
  }
}

