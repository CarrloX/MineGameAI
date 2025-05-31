
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
        // Interact with all active chunk meshes, not just camera-visible ones
        chunkMeshesToTest.push(...chunk.chunkRoot.children);
    });

    const intersects = raycaster.intersectObjects(chunkMeshesToTest, false);

    const firstValidIntersect = intersects.find(
      intersect => intersect.object instanceof THREE.Mesh &&
                   intersect.object.name.startsWith("MergedChunkMesh_") &&
                   intersect.distance > 0.1 && // Avoid intersecting with self/very close objects
                   intersect.distance < this.attackRange &&
                   intersect.face // Ensure there's a face to get a normal from
    );

    if (firstValidIntersect && firstValidIntersect.face) {
      const intersection = firstValidIntersect;
      const hitObject = intersection.object as THREE.Mesh;

      const hitPointWorld = intersection.point.clone(); // Point of intersection in world space
      const hitNormalLocal = intersection.face.normal.clone(); // Normal in object's local space
      
      // Transform normal from local to world space
      const hitNormalWorld = hitNormalLocal.clone().transformDirection(hitObject.matrixWorld).normalize();

      // Calculate block coordinates based on hit point and world normal
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
      this.blockFaceHL.mesh.rotation.set(0,0,0); // Ensure no rotation applied to highlight

      // Update debug direction based on world normal
      const currentHitNormalWorld = this.lookingAt.worldFaceNormal;
      if (Math.abs(currentHitNormalWorld.x) > 0.5) this.blockFaceHL.dir = currentHitNormalWorld.x > 0 ? 'East (+X)' : 'West (-X)';
      else if (Math.abs(currentHitNormalWorld.y) > 0.5) this.blockFaceHL.dir = currentHitNormalWorld.y > 0 ? 'Top (+Y)' : 'Bottom (-Y)';
      else if (Math.abs(currentHitNormalWorld.z) > 0.5) this.blockFaceHL.dir = currentHitNormalWorld.z > 0 ? 'South (+Z)' : 'North (-Z)';
      else this.blockFaceHL.dir = 'Unknown Face';

    } else {
      if (this.lookingAt !== null) { // Only clear if it was previously set
        if (scene.getObjectByName(this.blockFaceHL.mesh.name)) {
          scene.remove(this.blockFaceHL.mesh);
        }
        this.lookingAt = null;
        this.blockFaceHL.dir = ""; // Clear direction
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
      const maxPitch = Math.PI / 2 - 0.01; // Prevents camera flipping
      this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
      // Normalize yaw (0 to 2PI)
      this.yaw = ((this.yaw % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);
      camera.rotation.x = this.pitch;
      camera.rotation.y = this.yaw;
    } else {
        // Ensure camera rotation is set even if not actively looking around (e.g. after respawn)
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

      // Prevent placing block inside self
      if ( (Math.floor(placeX) === Math.floor(this.x) && Math.floor(placeZ) === Math.floor(this.z)) &&
           (Math.floor(placeY) === playerFeetY || Math.floor(placeY) === playerHeadY) ) {
        return;
      }

      if (placeY >= 0 && placeY < world.layers) {
        const blockToPlace = blockPrototypesArray[0]; // Default to first block in proto array (usually grass)
        if (blockToPlace) {
          const blockMeshName = blockToPlace.mesh.name;
          // Extract block name key, e.g., "grassBlock" from "Block_grassBlock"
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
        if (this.flying) { // If already flying, space is for ascending
            this.isFlyingAscending = true;
            // Reset lastSpacePressTime if flying to prevent accidental flight toggle on next press
            this.lastSpacePressTime = 0;
        } else { // Not flying, check for double tap or single jump
            if (now - this.lastSpacePressTime < this.flyToggleDelay) {
                this.flying = true;
                this.isFlyingAscending = false;
                this.isFlyingDescending = false;
                this.jumping = false;
                this.jumpVelocity = 0;
                this.onGround = false;
                this.lastSpacePressTime = 0; // Consume the double tap
            } else {
                this.jumping = true; // Regular jump
                this.lastSpacePressTime = now;
            }
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
      // No change for controlConfig.boost on keyUp as it's a toggle now
    }
  }

  die(): void {
    this.dead = true;
  }

  updatePosition(): void {
    const { world, camera } = this.gameRefs;
    if (!world || !camera) return;

    // --- Vertical Movement Calculation ---
    let dY = 0;
    if (this.flying) {
      this.jumpVelocity = 0; // Crucial: No gravity/jump physics when flying
      this.onGround = false;   // Crucial: Not on ground when flying
      if (this.isFlyingAscending) dY += this.flySpeed;
      if (this.isFlyingDescending) dY -= this.flySpeed;
    } else {
      // Standard jump/gravity physics
      if (this.jumping && this.onGround) {
        this.jumpVelocity = this.jumpSpeed;
        this.onGround = false;
      }
      this.jumpVelocity -= world.gravity;
      if (this.jumpVelocity < -this.jumpSpeed * 2.5) { // Terminal velocity cap
          this.jumpVelocity = -this.jumpSpeed * 2.5;
      }
      dY += this.jumpVelocity;
    }
    let nextPlayerY = this.y + dY;

    // --- Horizontal Movement Calculation ---
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


    // --- Collision Detection and Response ---
    let correctedX = nextPlayerX;
    let correctedY = nextPlayerY;
    let correctedZ = nextPlayerZ;
    let landedOnGroundThisFrame = false;

    // Define player's proposed bounding box for this frame
    const pMinProposedGlobalY = nextPlayerY;
    const pMaxProposedGlobalY = nextPlayerY + this.height;
    const pMinProposedGlobalX = nextPlayerX - this.width / 2;
    const pMaxProposedGlobalX = nextPlayerX + this.width / 2;
    const pMinProposedGlobalZ = nextPlayerZ - this.depth / 2;
    const pMaxProposedGlobalZ = nextPlayerZ + this.depth / 2;

    // Iterate over nearby blocks for collision
    const checkRadius = 1; // Check blocks in a 3x3xHeight area around player
    const startBlockY = Math.max(0, Math.floor(pMinProposedGlobalY) - checkRadius);
    const endBlockY = Math.min(world.layers, Math.ceil(pMaxProposedGlobalY) + checkRadius);

    for (let checkWorldX = Math.floor(pMinProposedGlobalX) - checkRadius; checkWorldX <= Math.ceil(pMaxProposedGlobalX) + checkRadius; checkWorldX++) {
        for (let checkWorldZ = Math.floor(pMinProposedGlobalZ) - checkRadius; checkWorldZ <= Math.ceil(pMaxProposedGlobalZ) + checkRadius; checkWorldZ++) {
            for (let checkWorldY = startBlockY; checkWorldY < endBlockY; checkWorldY++) {
                const blockType = world.getBlock(checkWorldX, checkWorldY, checkWorldZ);
                if (blockType && blockType !== 'air') {
                    const bMinX = checkWorldX;
                    const bMaxX = checkWorldX + 1;
                    const bMinY = checkWorldY;
                    const bMaxY = checkWorldY + 1;
                    const bMinZ = checkWorldZ;
                    const bMaxZ = checkWorldZ + 1;

                    // Use the already corrected positions from previous checks in this frame
                    let pMinX = correctedX - this.width / 2;
                    let pMaxX = correctedX + this.width / 2;
                    let pMinY = correctedY;
                    let pMaxY = correctedY + this.height;
                    let pMinZ = correctedZ - this.depth / 2;
                    let pMaxZ = correctedZ + this.depth / 2;

                    // Check for overlap
                    if (pMaxX > bMinX && pMinX < bMaxX &&
                        pMaxY > bMinY && pMinY < bMaxY &&
                        pMaxZ > bMinZ && pMinZ < bMaxZ) {

                        // Calculate overlap on each axis
                        const overlapX = Math.min(pMaxX - bMinX, bMaxX - pMinX);
                        const overlapY = Math.min(pMaxY - bMinY, bMaxY - pMinY);
                        const overlapZ = Math.min(pMaxZ - bMinZ, bMaxZ - pMinZ);

                        // Resolve collision on the axis with the smallest overlap
                        if (overlapY <= overlapX && overlapY <= overlapZ) { // Vertical collision
                            if (this.flying) {
                                if (dY > 0 && pMinY < bMaxY) { // Flying up into block
                                    correctedY = bMinY - this.height - 0.001; // Push down
                                } else if (dY < 0 && pMaxY > bMinY) { // Flying down into block
                                    correctedY = bMaxY + 0.001; // Push up
                                } else if (dY === 0 && pMinY < bMaxY && pMaxY > bMinY) { // Intersecting while static/horizontal fly
                                    correctedY = (this.y > bMinY) ? (bMaxY + 0.001) : (bMinY - this.height - 0.001); // Push out
                                }
                                // jumpVelocity is already 0 if flying, onGround is false
                            } else { // Not flying
                                if (dY <= 0 && pMinY < bMaxY && this.y >= bMaxY - 0.01) { // Landing or on ground
                                    correctedY = bMaxY;
                                    this.jumpVelocity = 0;
                                    landedOnGroundThisFrame = true;
                                } else if (dY > 0 && pMaxY > bMinY && this.y + this.height <= bMinY + 0.01) { // Hitting ceiling
                                    correctedY = bMinY - this.height;
                                    this.jumpVelocity = -0.001; // Stop upward momentum
                                }
                            }
                        } else if (overlapX < overlapY && overlapX < overlapZ) { // Horizontal X collision
                            if ((pMaxX - bMinX) < (bMaxX - pMinX)) { // Collided with left side of block
                                correctedX = bMinX - this.width / 2 - 0.001;
                            } else { // Collided with right side of block
                                correctedX = bMaxX + this.width / 2 + 0.001;
                            }
                        } else { // Horizontal Z collision
                             if ((pMaxZ - bMinZ) < (bMaxZ - pMinZ)) { // Collided with front side of block
                                correctedZ = bMinZ - this.depth / 2 - 0.001;
                            } else { // Collided with back side of block
                                correctedZ = bMaxZ + this.depth / 2 + 0.001;
                            }
                        }
                    }
                }
            }
        }
    }

    // --- Apply World Boundaries and Final State ---
    if (this.flying) {
        // Re-assert flying state absolutes after collision resolution
        this.jumpVelocity = 0;
        this.onGround = false;
        if (correctedY < 0) correctedY = 0;
        if (correctedY + this.height > world.layers) correctedY = world.layers - this.height;
    } else {
        // Normal physics for non-flying state
        if (correctedY < 0) { // Fell through world floor
            correctedY = 0;
            landedOnGroundThisFrame = true;
            this.jumpVelocity = 0;
        }
        if (correctedY + this.height > world.layers) { // Hit world ceiling
            correctedY = world.layers - this.height;
            if (this.jumpVelocity > 0) this.jumpVelocity = -0.001; // Stop upward momentum
        }
        this.onGround = landedOnGroundThisFrame;
    }


    this.x = correctedX;
    this.y = correctedY;
    this.z = correctedZ;

    if (this.y < -world.voidHeight && !this.dead) this.die(); // Check for void death

    this.mesh.position.set(this.x, this.y, this.z);
    camera.position.set(this.x, this.y + this.height * 0.9, this.z); // Camera slightly below top of head
  }
}
