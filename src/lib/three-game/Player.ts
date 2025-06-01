
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
  
  public isRunning: boolean = false;
  public isBoosting: boolean = false; // This is for flying boost
  public boostSpeedMultiplier: number = 3.0; // For flying
  public runSpeedMultiplier: number = 1.7; // For running on ground


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
        // Test against all chunk meshes, visible or not, for interaction
        chunkMeshesToTest.push(...chunk.chunkRoot.children);
    });

    const intersects = raycaster.intersectObjects(chunkMeshesToTest, false);

    const firstValidIntersect = intersects.find(
      intersect => intersect.object instanceof THREE.Mesh &&
                   intersect.object.name.startsWith("MergedChunkMesh_") &&
                   intersect.distance > 0.1 && // Avoid intersecting with self/too close
                   intersect.distance < this.attackRange &&
                   intersect.face
    );

    if (firstValidIntersect && firstValidIntersect.face) {
      const intersection = firstValidIntersect;
      const hitObject = intersection.object as THREE.Mesh;

      const hitPointWorld = intersection.point.clone();
      const hitNormalLocal = intersection.face.normal.clone();

      // Transform the normal to world space
      const hitNormalWorld = hitNormalLocal.clone().transformDirection(hitObject.matrixWorld).normalize();

      // Calculate block coordinates by slightly moving back from the hit point along the normal
      const calculatedBlockWorldCoords = new THREE.Vector3(
        Math.floor(hitPointWorld.x - hitNormalWorld.x * 0.499),
        Math.floor(hitPointWorld.y - hitNormalWorld.y * 0.499),
        Math.floor(hitPointWorld.z - hitNormalWorld.z * 0.499)
      );

      // Calculate placement coordinates by slightly moving forward from the hit point along the normal
      const calculatedPlaceBlockWorldCoords = new THREE.Vector3(
        Math.floor(hitPointWorld.x + hitNormalWorld.x * 0.499),
        Math.floor(hitPointWorld.y + hitNormalWorld.y * 0.499),
        Math.floor(hitPointWorld.z + hitNormalWorld.z * 0.499)
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
      this.blockFaceHL.mesh.rotation.set(0,0,0); // Reset rotation

      // Determine face direction (optional, for debug or specific game logic)
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
      // Clamp pitch
      const maxPitch = Math.PI / 2 - 0.01; // Prevent gimbal lock
      this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
      // Normalize yaw
      this.yaw = ((this.yaw % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI); // Keep yaw between 0 and 2PI
      camera.rotation.x = this.pitch;
      camera.rotation.y = this.yaw;
    } else {
        // If pointer not locked, keep camera rotation to player's current rotation.
        camera.rotation.x = this.pitch;
        camera.rotation.y = this.yaw;
    }
  }

  interactWithBlock(destroy: boolean): void {
    const { world, cursor } = this.gameRefs;
    if (!world || !this.lookingAt || !cursor || !cursor.inWindow) return;


    if (destroy) {
      const { x, y, z } = this.lookingAt.blockWorldCoords;
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
          const currentBlock = world.getBlock(x,y,z);
          if (currentBlock !== 'waterBlock') { // Prevent destroying water for now
            world.setBlock(x, y, z, 'air');
          }
      } else {
          console.warn("Invalid block coordinates for destruction:", this.lookingAt.blockWorldCoords);
      }
    } else {
      const { x: placeX, y: placeY, z: placeZ } = this.lookingAt.placeBlockWorldCoords;
       if (!Number.isFinite(placeX) || !Number.isFinite(placeY) || !Number.isFinite(placeZ)) {
          console.warn("Invalid block coordinates for placement:", this.lookingAt.placeBlockWorldCoords);
          return;
      }

      // Prevent placing block inside self
      const playerHeadY = Math.floor(this.y + this.height - 0.1); // Upper part of player
      const playerFeetY = Math.floor(this.y + 0.1); // Lower part of player

      if ( (Math.floor(placeX) === Math.floor(this.x) && Math.floor(placeZ) === Math.floor(this.z)) &&
           (Math.floor(placeY) === playerFeetY || Math.floor(placeY) === playerHeadY) ) {
        // Trying to place block where player feet or head is
        return;
      }

      // Check if placement is within world bounds (Y-axis)
      if (placeY >= 0 && placeY < world.layers) {
        const blockToPlaceNameKey = "stoneBlock"; // TODO: Use selected block from inventory

        if(blockToPlaceNameKey && blockToPlaceNameKey !== 'air') {
          world.setBlock(placeX, placeY, placeZ, blockToPlaceNameKey);
        } else {
          console.warn("Attempted to place an invalid block type:", blockToPlaceNameKey);
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
        if (this.flying && now - this.lastSpacePressTime < this.flyToggleDelay && this.lastSpacePressTime !== 0) {
            // Double tap while flying: toggle flying off
            this.flying = false;
            this.isFlyingAscending = false;
            this.isFlyingDescending = false;
            this.isBoosting = false; // Turn off flying boost
            this.onGround = false; // Force re-evaluation of ground state
            this.lastSpacePressTime = 0; // Reset after toggle
        } else if (!this.flying && now - this.lastSpacePressTime < this.flyToggleDelay && this.lastSpacePressTime !== 0) {
            // Double tap while on ground/falling: toggle flying on
            this.flying = true;
            this.jumping = false;
            this.jumpVelocity = 0;
            this.onGround = false;
            // isBoosting state remains as is for flying, can be toggled separately
            this.lastSpacePressTime = 0; // Reset after toggle
        } else {
            // Single tap
            if (this.flying) {
                this.isFlyingAscending = true;
            } else {
                this.jumping = true; // For normal jump
            }
            this.lastSpacePressTime = now;
        }
        break;
      case controlConfig.flyDown: // Typically ShiftLeft
        if (this.flying) {
          this.isFlyingDescending = true;
        }
        break;
      case controlConfig.boost: // Typically ControlLeft
        if (this.flying) {
          this.isBoosting = !this.isBoosting; // Toggle flying boost
        } else {
          this.isRunning = !this.isRunning; // Toggle run if not flying
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
        this.jumping = false; // For normal jump
        this.isFlyingAscending = false; // For flying
        break;
      case controlConfig.flyDown:
        this.isFlyingDescending = false;
        break;
      // No keyUp handling needed for boost/run toggles
    }
  }

  die(): void {
    this.dead = true;
    this.flying = false;
    this.isBoosting = false;
    this.isRunning = false;
    this.isFlyingAscending = false;
    this.isFlyingDescending = false;
    this.lastSpacePressTime = 0;
    this.jumpVelocity = 0;
    this.onGround = false;
  }

  updatePosition(): void {
    const { world, camera } = this.gameRefs;
    if (!world || !camera) return;

    let dY = 0;

    if (this.flying) {
      this.jumpVelocity = 0; // Crucial: No gravity/jump physics while flying
      this.onGround = false;   // Crucial: Not on ground while flying (allows levitation)
      if (this.isFlyingAscending) dY += this.flySpeed;
      if (this.isFlyingDescending) dY -= this.flySpeed;
    } else {
      // Apply gravity and jump physics only when not flying
      if (this.jumping && this.onGround) {
        this.jumpVelocity = this.jumpSpeed;
        this.onGround = false;
      }
      this.jumpVelocity -= world.gravity;
      // Terminal velocity cap for falling
      if (this.jumpVelocity < -this.jumpSpeed * 2.5) {
          this.jumpVelocity = -this.jumpSpeed * 2.5;
      }
      dY += this.jumpVelocity;
    }

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

    let currentEffectiveSpeed = this.speed;
    if (this.flying && this.isBoosting) {
      currentEffectiveSpeed *= this.boostSpeedMultiplier;
    } else if (!this.flying && this.isRunning) {
      currentEffectiveSpeed *= this.runSpeedMultiplier;
    }


    let nextPlayerX = this.x;
    let nextPlayerZ = this.z;
    const moveMagnitude = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (moveMagnitude > 0) {
        const normalizedMoveX = moveX / moveMagnitude;
        const normalizedMoveZ = moveZ / moveMagnitude;
        nextPlayerX += normalizedMoveX * currentEffectiveSpeed;
        nextPlayerZ += normalizedMoveZ * currentEffectiveSpeed;
    }

    let correctedX = nextPlayerX;
    let correctedY = this.y + dY;
    let correctedZ = nextPlayerZ;
    let landedOnGroundThisFrame = false; // Used only if not flying


    // Define player's proposed bounding box for this frame's movement
    const pMinProposedGlobalY = correctedY;
    const pMaxProposedGlobalY = correctedY + this.height;
    const pMinProposedGlobalX = correctedX - this.width / 2;
    const pMaxProposedGlobalX = correctedX + this.width / 2;
    const pMinProposedGlobalZ = correctedZ - this.depth / 2;
    const pMaxProposedGlobalZ = correctedZ + this.depth / 2;

    // Iterate through nearby blocks for collision detection
    const checkRadius = 1; // Check blocks in a 3x3xH area around player
    const startBlockY = Math.max(0, Math.floor(pMinProposedGlobalY) - checkRadius);
    const endBlockY = Math.min(world.layers, Math.ceil(pMaxProposedGlobalY) + checkRadius);

    for (let checkWorldX = Math.floor(pMinProposedGlobalX) - checkRadius; checkWorldX <= Math.ceil(pMaxProposedGlobalX) + checkRadius; checkWorldX++) {
        for (let checkWorldZ = Math.floor(pMinProposedGlobalZ) - checkRadius; checkWorldZ <= Math.ceil(pMaxProposedGlobalZ) + checkRadius; checkWorldZ++) {
            for (let checkWorldY = startBlockY; checkWorldY < endBlockY; checkWorldY++) {
                const blockType = world.getBlock(checkWorldX, checkWorldY, checkWorldZ);

                if (blockType && blockType !== 'air' && blockType !== 'waterBlock') { // Solid block collision
                    const bMinX = checkWorldX;
                    const bMaxX = checkWorldX + 1;
                    const bMinY = checkWorldY;
                    const bMaxY = checkWorldY + 1;
                    const bMinZ = checkWorldZ;
                    const bMaxZ = checkWorldZ + 1;

                    // Player's current corrected bounding box for this iteration
                    let pMinX = correctedX - this.width / 2;
                    let pMaxX = correctedX + this.width / 2;
                    let pMinY = correctedY;
                    let pMaxY = correctedY + this.height;
                    let pMinZ = correctedZ - this.depth / 2;
                    let pMaxZ = correctedZ + this.depth / 2;

                    // Check for AABB collision
                    if (pMaxX > bMinX && pMinX < bMaxX &&
                        pMaxY > bMinY && pMinY < bMaxY && 
                        pMaxZ > bMinZ && pMinZ < bMaxZ) {

                        // Collision detected, find shallowest penetration axis
                        const overlapX = Math.min(pMaxX - bMinX, bMaxX - pMinX);
                        const overlapY = Math.min(pMaxY - bMinY, bMaxY - pMinY);
                        const overlapZ = Math.min(pMaxZ - bMinZ, bMaxZ - pMinZ);

                        if (overlapY <= overlapX && overlapY <= overlapZ) { // Y-axis collision is shallowest
                            if (this.flying) {
                                if (dY > 0 && pMinY < bMaxY) { // Flying up into ceiling
                                    correctedY = bMinY - this.height - 0.001;
                                } else if (dY < 0 && pMaxY > bMinY) { // Flying down into floor
                                    correctedY = bMaxY + 0.001;
                                } else if (dY === 0 && pMaxY > bMinY && pMinY < bMaxY) { // Stationary but overlapping vertically
                                    correctedY = (this.y > bMinY) ? (bMaxY + 0.001) : (bMinY - this.height - 0.001);
                                }
                            } else { // Not flying
                                if (dY <= 0 && pMinY < bMaxY - 0.0001 && this.y >= bMaxY - 0.01) { // Landed on ground
                                    correctedY = bMaxY;
                                    this.jumpVelocity = 0;
                                    landedOnGroundThisFrame = true;
                                } else if (dY > 0 && pMaxY > bMinY && this.y + this.height <= bMinY + 0.01) { // Hit head on ceiling
                                    correctedY = bMinY - this.height;
                                    this.jumpVelocity = -0.001; // Small bounce
                                }
                            }
                        } else if (overlapX < overlapY && overlapX < overlapZ) { // X-axis collision is shallowest
                            if ((pMaxX - bMinX) < (bMaxX - pMinX)) { // Collided with left side of block
                                correctedX = bMinX - this.width / 2 - 0.001;
                            } else { // Collided with right side of block
                                correctedX = bMaxX + this.width / 2 + 0.001;
                            }
                        } else { // Z-axis collision is shallowest
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

    // World boundary checks
    if (this.flying) {
        this.jumpVelocity = 0; // Ensure no gravity accumulation if somehow it was set
        this.onGround = false;   // Must be false if flying
        if (correctedY < 0) correctedY = 0;
        if (correctedY + this.height > world.layers) correctedY = world.layers - this.height;
    } else {
        // Not flying - standard world boundaries
        if (correctedY < 0) { // Fallen below world
            correctedY = 0;
            landedOnGroundThisFrame = true; // Consider landed on "bottom"
            this.jumpVelocity = 0;
            if (!this.dead) this.die(); // Die if falling into void
        }
        if (correctedY + this.height > world.layers) { // Hit world ceiling
            correctedY = world.layers - this.height;
            if (this.jumpVelocity > 0) this.jumpVelocity = -0.001; // Small bounce
        }
        this.onGround = landedOnGroundThisFrame;
    }


    this.x = correctedX;
    this.y = correctedY;
    this.z = correctedZ;

    // Check for void death after all position corrections
    if (this.y < -world.voidHeight && !this.dead) this.die();

    // Update player mesh and camera
    this.mesh.position.set(this.x, this.y, this.z);
    camera.position.set(this.x, this.y + this.height * 0.9, this.z); // Camera slightly below top of head
  }
}

