
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
    this.blockFaceHL.mesh.renderOrder = 1; // Ensure it renders on top

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
        chunkMeshesToTest.push(...chunk.chunkRoot.children);
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
        Math.floor(hitPointWorld.x - hitNormalWorld.x * 0.499), // Use 0.499 for safety
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

    if (destroy) { // Destroy block (Left Click)
      const { x, y, z } = this.lookingAt.blockWorldCoords;
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
          const currentBlock = world.getBlock(x,y,z);
          if (currentBlock !== 'waterBlock') { // Prevent destroying water for now, can be changed
            world.setBlock(x, y, z, 'air');
          }
      } else {
          console.warn("Invalid block coordinates for destruction:", this.lookingAt.blockWorldCoords);
      }
    } else { // Place block (Right Click)
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
        // For now, let's hardcode placing stone block as an example
        // Later, this can be tied to a selected block in an inventory
        const blockToPlaceNameKey = "stoneBlock"; // Example: player places stone
        
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
        if (this.flying) { 
            this.isFlyingAscending = true;
            this.lastSpacePressTime = 0; 
        } else { 
            if (now - this.lastSpacePressTime < this.flyToggleDelay) {
                this.flying = true;
                this.isFlyingAscending = false; 
                this.isFlyingDescending = false;
                this.jumping = false;
                this.jumpVelocity = 0;
                this.onGround = false; 
                this.lastSpacePressTime = 0; 
            } else {
                this.jumping = true; 
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
          this.isBoosting = !this.isBoosting; 
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
    }
  }

  die(): void {
    this.dead = true;
    this.flying = false; 
    this.isBoosting = false;
  }

  updatePosition(): void {
    const { world, camera } = this.gameRefs;
    if (!world || !camera) return;

    let dY = 0;
    if (this.flying) {
      this.jumpVelocity = 0; 
      this.onGround = false;   
      if (this.isFlyingAscending) dY += this.flySpeed;
      if (this.isFlyingDescending) dY -= this.flySpeed;
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

    let correctedX = nextPlayerX;
    let correctedY = nextPlayerY;
    let correctedZ = nextPlayerZ;
    let landedOnGroundThisFrame = false;

    const pMinProposedGlobalY = nextPlayerY;
    const pMaxProposedGlobalY = nextPlayerY + this.height;
    const pMinProposedGlobalX = nextPlayerX - this.width / 2;
    const pMaxProposedGlobalX = nextPlayerX + this.width / 2;
    const pMinProposedGlobalZ = nextPlayerZ - this.depth / 2;
    const pMaxProposedGlobalZ = nextPlayerZ + this.depth / 2;

    const checkRadius = 1; 
    const startBlockY = Math.max(0, Math.floor(pMinProposedGlobalY) - checkRadius);
    const endBlockY = Math.min(world.layers, Math.ceil(pMaxProposedGlobalY) + checkRadius);

    for (let checkWorldX = Math.floor(pMinProposedGlobalX) - checkRadius; checkWorldX <= Math.ceil(pMaxProposedGlobalX) + checkRadius; checkWorldX++) {
        for (let checkWorldZ = Math.floor(pMinProposedGlobalZ) - checkRadius; checkWorldZ <= Math.ceil(pMaxProposedGlobalZ) + checkRadius; checkWorldZ++) {
            for (let checkWorldY = startBlockY; checkWorldY < endBlockY; checkWorldY++) {
                const blockType = world.getBlock(checkWorldX, checkWorldY, checkWorldZ);
                
                if (blockType && blockType !== 'air' && blockType !== 'waterBlock') { // Water is not solid
                    const bMinX = checkWorldX;
                    const bMaxX = checkWorldX + 1;
                    const bMinY = checkWorldY;
                    const bMaxY = checkWorldY + 1;
                    const bMinZ = checkWorldZ;
                    const bMaxZ = checkWorldZ + 1;

                    let pMinX = correctedX - this.width / 2;
                    let pMaxX = correctedX + this.width / 2;
                    let pMinY = correctedY;
                    let pMaxY = correctedY + this.height;
                    let pMinZ = correctedZ - this.depth / 2;
                    let pMaxZ = correctedZ + this.depth / 2;

                    if (pMaxX > bMinX && pMinX < bMaxX &&
                        pMaxY > bMinY && pMinY < bMaxY &&
                        pMaxZ > bMinZ && pMinZ < bMaxZ) {

                        const overlapX = Math.min(pMaxX - bMinX, bMaxX - pMinX);
                        const overlapY = Math.min(pMaxY - bMinY, bMaxY - pMinY);
                        const overlapZ = Math.min(pMaxZ - bMinZ, bMaxZ - pMinZ);

                        if (overlapY <= overlapX && overlapY <= overlapZ) { 
                            if (this.flying) {
                                if (dY > 0 && pMinY < bMaxY) { 
                                    correctedY = bMinY - this.height - 0.001; 
                                } else if (dY < 0 && pMaxY > bMinY) { 
                                    correctedY = bMaxY + 0.001; 
                                } else if (dY === 0 && pMinY < bMaxY && pMaxY > bMinY) { 
                                    correctedY = (this.y > bMinY) ? (bMaxY + 0.001) : (bMinY - this.height - 0.001); 
                                }
                            } else { 
                                if (dY <= 0 && pMinY < bMaxY && this.y >= bMaxY - 0.01) { 
                                    correctedY = bMaxY;
                                    this.jumpVelocity = 0;
                                    landedOnGroundThisFrame = true;
                                } else if (dY > 0 && pMaxY > bMinY && this.y + this.height <= bMinY + 0.01) { 
                                    correctedY = bMinY - this.height;
                                    this.jumpVelocity = -0.001; 
                                }
                            }
                        } else if (overlapX < overlapY && overlapX < overlapZ) { 
                            if ((pMaxX - bMinX) < (bMaxX - pMinX)) { 
                                correctedX = bMinX - this.width / 2 - 0.001;
                            } else { 
                                correctedX = bMaxX + this.width / 2 + 0.001;
                            }
                        } else { 
                             if ((pMaxZ - bMinZ) < (bMaxZ - pMinZ)) { 
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

    if (this.flying) {
        this.jumpVelocity = 0;
        this.onGround = false;
        if (correctedY < 0) correctedY = 0;
        if (correctedY + this.height > world.layers) correctedY = world.layers - this.height;
    } else {
        if (correctedY < 0) { 
            correctedY = 0;
            landedOnGroundThisFrame = true; 
            this.jumpVelocity = 0;
            if (!this.dead) this.die(); // Die if falling through absolute bottom
        }
        if (correctedY + this.height > world.layers) { 
            correctedY = world.layers - this.height;
            if (this.jumpVelocity > 0) this.jumpVelocity = -0.001; 
        }
        this.onGround = landedOnGroundThisFrame;
    }

    this.x = correctedX;
    this.y = correctedY;
    this.z = correctedZ;

    if (this.y < -world.voidHeight && !this.dead) this.die(); 

    this.mesh.position.set(this.x, this.y, this.z);
    camera.position.set(this.x, this.y + this.height * 0.9, this.z); 
  }
}
