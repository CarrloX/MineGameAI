import * as THREE from 'three';
import type { Block } from './Block';
// World import no longer needed directly by Player
import { CHUNK_SIZE } from './utils';
import type { LookingAtInfo, PlayerWorldService, PlayerCameraService, PlayerSceneService, PlayerRaycasterService } from './types';
import { CONTROL_CONFIG } from './CONTROL_CONFIG';


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
  public mesh: THREE.Object3D; // Player's own representation in the scene (if any, currently just logical)
  private name: string;

  // Dependencies injected via constructor
  private worldService: PlayerWorldService;
  private cameraService: PlayerCameraService;
  private sceneService: PlayerSceneService;
  private raycasterService: PlayerRaycasterService;
  private audioManager: any; // AudioManager

  public flying: boolean = false;
  public flySpeed: number = CONTROL_CONFIG.FLY_SPEED;
  public lastSpacePressTime: number = 0;
  public flyToggleDelay: number = CONTROL_CONFIG.FLY_TOGGLE_DELAY;
  public isFlyingAscending: boolean = false;
  public isFlyingDescending: boolean = false;

  public isRunning: boolean = false;
  public runSpeedMultiplier: number = CONTROL_CONFIG.RUN_SPEED_MULTIPLIER;
  public isBoosting: boolean = false;
  public boostSpeedMultiplier: number = CONTROL_CONFIG.BOOST_SPEED_MULTIPLIER;


  constructor(
    name: string,
    worldService: PlayerWorldService,
    cameraService: PlayerCameraService,
    sceneService: PlayerSceneService,
    raycasterService: PlayerRaycasterService,
    x: number = 0, y: number = 0, z: number = 0,
    preserveCam: boolean = false,
    audioManager?: any // AudioManager opcional para compatibilidad
  ) {
    this.name = name;
    this.worldService = worldService;
    this.cameraService = cameraService;
    this.sceneService = sceneService;
    this.raycasterService = raycasterService;
    this.audioManager = audioManager;

    this.x = x;
    this.y = y;
    this.z = z;
    this.height = CONTROL_CONFIG.PLAYER_HEIGHT;
    this.width = CONTROL_CONFIG.PLAYER_WIDTH;
    this.depth = CONTROL_CONFIG.PLAYER_DEPTH;

    this.pitch = 0; // Initial pitch
    this.yaw = 0;   // Initial yaw

    this.speed = CONTROL_CONFIG.WALK_SPEED;
    this.velocity = 0;
    this.jumpSpeed = CONTROL_CONFIG.JUMP_SPEED;
    this.jumpVelocity = 0;
    this.xdir = "";
    this.zdir = "";
    this.attackRange = CONTROL_CONFIG.ATTACK_RANGE;
    this.lookingAt = null;
    this.jumping = false;
    this.onGround = false;
    this.dead = false;
    this.lastSpacePressTime = 0;

    const highlightBoxGeo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    const highlightEdgesGeo = new THREE.EdgesGeometry(highlightBoxGeo);
    const highlightMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });

    this.blockFaceHL = {
      mesh: new THREE.LineSegments(highlightEdgesGeo, highlightMaterial),
      dir: "",
    };
    this.blockFaceHL.mesh.name = "Block_Wireframe_Highlight_Mesh";
    this.blockFaceHL.mesh.renderOrder = 1;

    this.mesh = new THREE.Object3D(); // This is a logical mesh for position, not necessarily rendered.
    this.mesh.name = name;
    this.mesh.position.set(this.x, this.y, this.z);

    // Apply initial pitch/yaw to camera. If preserveCam is true, external logic (GameLogic)
    // will set pitch/yaw on this player instance and then call lookAround.
    if (!preserveCam) {
        this.lookAround();
    }
  }

  highlightBlock(): void {
    this.raycasterService.setFromCamera({ x: 0, y: 0 }, this.cameraService);

    const chunkMeshesToTest: THREE.Object3D[] = [];
    // Access activeChunks through the worldService
    this.worldService.activeChunks.forEach(chunk => {
        if (chunk && chunk.chunkRoot && chunk.chunkRoot.children) { // Ensure chunk and its properties exist
            chunkMeshesToTest.push(...chunk.chunkRoot.children);
        }
    });

    const intersects = this.raycasterService.intersectObjects(chunkMeshesToTest, false);

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
        Math.floor(hitPointWorld.x - hitNormalWorld.x * 0.499),
        Math.floor(hitPointWorld.y - hitNormalWorld.y * 0.499),
        Math.floor(hitPointWorld.z - hitNormalWorld.z * 0.499)
      );

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

      if (!this.sceneService.getObjectByName(this.blockFaceHL.mesh.name)) {
        this.sceneService.add(this.blockFaceHL.mesh);
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
        if (this.sceneService.getObjectByName(this.blockFaceHL.mesh.name)) {
          this.sceneService.remove(this.blockFaceHL.mesh);
        }
        this.lookingAt = null;
        this.blockFaceHL.dir = "";
      }
    }
  }

  // This method applies the Player's pitch and yaw to the cameraService.
  // InputController is responsible for updating Player's pitch and yaw from mouse events.
  public lookAround(): void {
    const maxPitch = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
    this.yaw = ((this.yaw % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);

    this.cameraService.rotation.x = this.pitch;
    this.cameraService.rotation.y = this.yaw;
  }


  public interactWithBlock(destroy: boolean): void {
    if (!this.lookingAt ) return;

    if (destroy) {
      const { x, y, z } = this.lookingAt.blockWorldCoords;
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
          const currentBlock = this.worldService.getBlock(x,y,z);
          if (currentBlock !== 'waterBlock') { // Cannot destroy water
            this.worldService.setBlock(x, y, z, 'air');
            if (this.audioManager) this.audioManager.playSound('blockBreak');
          }
      } else {
          console.warn("Invalid block coordinates for destruction:", this.lookingAt.blockWorldCoords);
      }
    } else { // Place block
      const { x: placeX, y: placeY, z: placeZ } = this.lookingAt.placeBlockWorldCoords;
       if (!Number.isFinite(placeX) || !Number.isFinite(placeY) || !Number.isFinite(placeZ)) {
          console.warn("Invalid block coordinates for placement:", this.lookingAt.placeBlockWorldCoords);
          return;
      }

      const playerHeadY = Math.floor(this.y + this.height - 0.1);
      const playerFeetY = Math.floor(this.y + 0.1);

      if ( (Math.floor(placeX) === Math.floor(this.x) && Math.floor(placeZ) === Math.floor(this.z)) &&
           (Math.floor(placeY) === playerFeetY || Math.floor(placeY) === playerHeadY) ) {
        // Prevent placing block inside self
        return;
      }

      if (placeY >= 0 && placeY < this.worldService.layers) {
        const blockToPlaceNameKey = "stoneBlock"; // Example: always place stone

        if(blockToPlaceNameKey && blockToPlaceNameKey !== 'air') {
          this.worldService.setBlock(placeX, placeY, placeZ, blockToPlaceNameKey);
          if (this.audioManager) this.audioManager.playSound('blockPlace');
        } else {
          console.warn("Attempted to place an invalid block type:", blockToPlaceNameKey);
        }
      }
    }
  }

  public die(): void {
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

  updatePosition(deltaTime: number): void {
    let dY = 0;

    if (this.flying) {
      this.jumpVelocity = 0;
      this.onGround = false;
      if (this.isFlyingAscending) dY += CONTROL_CONFIG.FLY_SPEED * deltaTime;
      if (this.isFlyingDescending) dY -= CONTROL_CONFIG.FLY_SPEED * deltaTime;
    } else {
      if (this.jumping && this.onGround) {
        this.jumpVelocity = CONTROL_CONFIG.JUMP_SPEED;
        this.onGround = false;
        this.jumping = false;
        if (this.audioManager) this.audioManager.playSound('jump');
      }
      this.jumpVelocity -= CONTROL_CONFIG.GRAVITY * deltaTime;
      // Limit falling speed
      if (this.jumpVelocity < -CONTROL_CONFIG.JUMP_SPEED * 2.5) {
          this.jumpVelocity = -CONTROL_CONFIG.JUMP_SPEED * 2.5;
      }
      dY = this.jumpVelocity; // dY is now just the jumpVelocity
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
        nextPlayerX += normalizedMoveX * currentEffectiveSpeed * deltaTime; // Apply deltaTime to horizontal movement
        nextPlayerZ += normalizedMoveZ * currentEffectiveSpeed * deltaTime; // Apply deltaTime to horizontal movement
    }

    let correctedX = nextPlayerX;
    let correctedY = this.y + dY; // dY already incorporates deltaTime for flying or is jumpVelocity
    let correctedZ = nextPlayerZ;
    let landedOnGroundThisFrame = false;


    const pMinProposedGlobalY = correctedY;
    const pMaxProposedGlobalY = correctedY + this.height;
    const pMinProposedGlobalX = correctedX - this.width / 2;
    const pMaxProposedGlobalX = correctedX + this.width / 2;
    const pMinProposedGlobalZ = correctedZ - this.depth / 2;
    const pMaxProposedGlobalZ = correctedZ + this.depth / 2;

    const checkRadius = 1; // How far around the player to check for collision blocks
    const startBlockY = Math.max(0, Math.floor(pMinProposedGlobalY) - checkRadius);
    const endBlockY = Math.min(this.worldService.layers, Math.ceil(pMaxProposedGlobalY) + checkRadius);

    for (let checkWorldX = Math.floor(pMinProposedGlobalX) - checkRadius; checkWorldX <= Math.ceil(pMaxProposedGlobalX) + checkRadius; checkWorldX++) {
        for (let checkWorldZ = Math.floor(pMinProposedGlobalZ) - checkRadius; checkWorldZ <= Math.ceil(pMaxProposedGlobalZ) + checkRadius; checkWorldZ++) {
            for (let checkWorldY = startBlockY; checkWorldY < endBlockY; checkWorldY++) {
                const blockType = this.worldService.getBlock(checkWorldX, checkWorldY, checkWorldZ);

                if (blockType && blockType !== 'air' && blockType !== 'waterBlock') { // Collide with non-air, non-water blocks
                    const bMinX = checkWorldX;
                    const bMaxX = checkWorldX + 1;
                    const bMinY = checkWorldY;
                    const bMaxY = checkWorldY + 1;
                    const bMinZ = checkWorldZ;
                    const bMaxZ = checkWorldZ + 1;

                    // Player's AABB based on *corrected* potential next position
                    let pMinX = correctedX - this.width / 2;
                    let pMaxX = correctedX + this.width / 2;
                    let pMinY = correctedY;
                    let pMaxY = correctedY + this.height;
                    let pMinZ = correctedZ - this.depth / 2;
                    let pMaxZ = correctedZ + this.depth / 2;

                    // Check for AABB collision
                    if (pMaxX > bMinX && pMinX < bMaxX &&
                        pMaxY > bMinY && pMinY < bMaxY &&
                        pMaxZ > bMinZ && pMinZ < bMaxZ) { // Collision detected

                        // Calculate overlaps on each axis
                        const overlapX = Math.min(pMaxX - bMinX, bMaxX - pMinX);
                        const overlapY = Math.min(pMaxY - bMinY, bMaxY - pMinY);
                        const overlapZ = Math.min(pMaxZ - bMinZ, bMaxZ - pMinZ);

                        // Resolve collision by moving player out along axis of minimum overlap
                        if (overlapY <= overlapX && overlapY <= overlapZ) { // Y collision is smallest (or tied)
                            if (this.flying) {
                                if (dY > 0 && pMinY < bMaxY) { // Flying up into ceiling
                                    correctedY = bMinY - this.height - 0.001; // Move just below block
                                } else if (dY < 0 && pMaxY > bMinY) { // Flying down into floor
                                    correctedY = bMaxY + 0.001; // Move just above block
                                } else if (dY === 0 && pMaxY > bMinY && pMinY < bMaxY) { // Stuck in block while flying
                                     correctedY = (this.y > bMinY + this.height / 2) ? (bMaxY + 0.001) : (bMinY - this.height - 0.001);
                                }
                                this.jumpVelocity = 0; // Stop vertical movement
                            } else { // Not flying
                                if (dY <= 0 && pMinY < bMaxY - 0.0001 && this.y >= bMaxY - 0.01) { // Landing on a block or stuck in floor
                                    correctedY = bMaxY; // Align player top of block
                                    this.jumpVelocity = 0;
                                    landedOnGroundThisFrame = true;
                                } else if (dY > 0 && pMaxY > bMinY && this.y + this.height <= bMinY + 0.01) { // Hitting head on a block while jumping
                                    correctedY = bMinY - this.height; // Align player bottom of block
                                    this.jumpVelocity = -0.001; // Start falling (small downward velocity)
                                }
                            }
                        } else if (overlapX < overlapY && overlapX < overlapZ) { // X collision is smallest
                            if (!this.flying && this.isRunning && blockType !== 'air' && blockType !== 'waterBlock') {
                               this.isRunning = false; // Stop running if hit wall
                            }
                            if ((pMaxX - bMinX) < (bMaxX - pMinX)) { // Collided with left side of block (player moving right)
                                correctedX = bMinX - this.width / 2 - 0.001; // Move player to left of block
                            } else { // Collided with right side of block (player moving left)
                                correctedX = bMaxX + this.width / 2 + 0.001; // Move player to right of block
                            }
                        } else { // Z collision is smallest
                             if (!this.flying && this.isRunning && blockType !== 'air' && blockType !== 'waterBlock') {
                                this.isRunning = false; // Stop running if hit wall
                             }
                             if ((pMaxZ - bMinZ) < (bMaxZ - pMinZ)) { // Collided with front side of block (player moving towards +Z)
                                correctedZ = bMinZ - this.depth / 2 - 0.001; // Move player in front of block
                            } else { // Collided with back side of block (player moving towards -Z)
                                correctedZ = bMaxZ + this.depth / 2 + 0.001; // Move player behind block
                            }
                        }
                    }
                }
            }
        }
    }

    // Apply the corrected positions
    this.x = correctedX;
    this.y = correctedY;
    this.z = correctedZ;

    // Post-collision adjustments and state updates
    if (this.flying) {
        this.jumpVelocity = 0;
        this.onGround = false;
        if (this.y < 0) this.y = 0; // Prevent flying below world
        if (this.y + this.height > this.worldService.layers) { // Prevent flying above world
            this.y = this.worldService.layers - this.height;
        }
    } else { // Not flying
        if (this.y < 0) { // Fell out of the world (or through floor due to high speed)
            this.y = 0; // Place at bottom boundary (can be adjusted)
            landedOnGroundThisFrame = true; // Consider on ground
            this.jumpVelocity = 0;
            if (!this.dead) this.die(); // Die if fall out of world (negative Y means below defined world)
        }
        if (this.y + this.height > this.worldService.layers) { // Prevent going above world (e.g. jumping too high)
            this.y = this.worldService.layers - this.height;
            if (this.jumpVelocity > 0) this.jumpVelocity = -0.001; // Start falling if hit ceiling
        }
        this.onGround = landedOnGroundThisFrame;
    }

    const playerFeetBlockX = Math.floor(this.x);
    const playerFeetBlockY = Math.floor(this.y + 0.01); // Small offset to check block truly under feet
    const playerFeetBlockZ = Math.floor(this.z);
    const blockAtFeet = this.worldService.getBlock(playerFeetBlockX, playerFeetBlockY, playerFeetBlockZ);

    if (!this.flying && this.isRunning && blockAtFeet === 'waterBlock') {
        this.isRunning = false; // Stop running if enter water
    }


    if (this.y < -this.worldService.voidHeight && !this.dead) this.die(); // Die if fall into void

    // Update the player's logical mesh position
    this.mesh.position.set(this.x, this.y, this.z);
    // Update the camera's position to follow the player
    this.cameraService.position.set(this.x, this.y + this.height * 0.9, this.z);
  }
}
