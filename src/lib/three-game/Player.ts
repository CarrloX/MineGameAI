
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
  public lastSpacePressTime: number = 0;
  public flyToggleDelay: number = 300;
  public isFlyingAscending: boolean = false;
  public isFlyingDescending: boolean = false;
  
  public isRunning: boolean = false;
  public runSpeedMultiplier: number = 1.4;
  public isBoosting: boolean = false; 
  public boostSpeedMultiplier: number = 3.0;


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
    this.speed = 0.065;
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
        this.lookAround(); // Initial call if not preserving camera
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

  public lookAround(e?: MouseEvent | Touch): void {
    const { camera, cursor } = this.gameRefs;
    if (!camera) return;

    // If no event is passed (e.g., initial call), just ensure camera rotation matches player pitch/yaw
    if (!e && cursor) {
        if (cursor.inWindow) { // Ensure pointer lock is active for any mouse movement based update
             // This case might be redundant if initial look is handled by InputHandler with a synthetic event or similar
        }
        camera.rotation.x = this.pitch;
        camera.rotation.y = this.yaw;
        return;
    }
    
    if (cursor && cursor.inWindow && e) {
      const sensitivity = 0.002;
      if (e instanceof MouseEvent) {
        this.yaw -= e.movementX * sensitivity;
        this.pitch -= e.movementY * sensitivity;
      } else if (e instanceof Touch) {
        // Basic touch look (requires tracking previous touch for delta)
        // This is a simplified placeholder, real touch controls are more complex
        // For now, we assume mouse movement is primary for look
      }
      
      const maxPitch = Math.PI / 2 - 0.01; 
      this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
      this.yaw = ((this.yaw % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI); 
      camera.rotation.x = this.pitch;
      camera.rotation.y = this.yaw;
    }
  }


  public interactWithBlock(destroy: boolean): void {
    const { world, cursor } = this.gameRefs;
    if (!world || !this.lookingAt ) return; // Removed cursor.inWindow check as InputHandler ensures this

    if (destroy) {
      const { x, y, z } = this.lookingAt.blockWorldCoords;
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
          const currentBlock = world.getBlock(x,y,z);
          if (currentBlock !== 'waterBlock') { 
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

      const playerHeadY = Math.floor(this.y + this.height - 0.1); 
      const playerFeetY = Math.floor(this.y + 0.1); 

      if ( (Math.floor(placeX) === Math.floor(this.x) && Math.floor(placeZ) === Math.floor(this.z)) &&
           (Math.floor(placeY) === playerFeetY || Math.floor(placeY) === playerHeadY) ) {
        return;
      }

      if (placeY >= 0 && placeY < world.layers) {
        const blockToPlaceNameKey = "stoneBlock"; 

        if(blockToPlaceNameKey && blockToPlaceNameKey !== 'air') {
          world.setBlock(placeX, placeY, placeZ, blockToPlaceNameKey);
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
    let landedOnGroundThisFrame = false; 


    const pMinProposedGlobalY = correctedY;
    const pMaxProposedGlobalY = correctedY + this.height;
    const pMinProposedGlobalX = correctedX - this.width / 2;
    const pMaxProposedGlobalX = correctedX + this.width / 2;
    const pMinProposedGlobalZ = correctedZ - this.depth / 2;
    const pMaxProposedGlobalZ = correctedZ + this.depth / 2;

    const checkRadius = 1; 
    const startBlockY = Math.max(0, Math.floor(pMinProposedGlobalY) - checkRadius);
    const endBlockY = Math.min(world.layers, Math.ceil(pMaxProposedGlobalY) + checkRadius);

    for (let checkWorldX = Math.floor(pMinProposedGlobalX) - checkRadius; checkWorldX <= Math.ceil(pMaxProposedGlobalX) + checkRadius; checkWorldX++) {
        for (let checkWorldZ = Math.floor(pMinProposedGlobalZ) - checkRadius; checkWorldZ <= Math.ceil(pMaxProposedGlobalZ) + checkRadius; checkWorldZ++) {
            for (let checkWorldY = startBlockY; checkWorldY < endBlockY; checkWorldY++) {
                const blockType = world.getBlock(checkWorldX, checkWorldY, checkWorldZ);

                if (blockType && blockType !== 'air' && blockType !== 'waterBlock') { 
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
                                } else if (dY === 0 && pMaxY > bMinY && pMinY < bMaxY) { 
                                     correctedY = (this.y > bMinY + this.height / 2) ? (bMaxY + 0.001) : (bMinY - this.height - 0.001);
                                }
                                this.jumpVelocity = 0; 
                            } else { 
                                if (dY <= 0 && pMinY < bMaxY - 0.0001 && this.y >= bMaxY - 0.01) { 
                                    correctedY = bMaxY;
                                    this.jumpVelocity = 0;
                                    landedOnGroundThisFrame = true;
                                } else if (dY > 0 && pMaxY > bMinY && this.y + this.height <= bMinY + 0.01) { 
                                    correctedY = bMinY - this.height;
                                    this.jumpVelocity = -0.001; 
                                }
                            }
                        } else if (overlapX < overlapY && overlapX < overlapZ) { 
                            if (!this.flying && this.isRunning) {
                                this.isRunning = false; 
                            }
                            if ((pMaxX - bMinX) < (bMaxX - pMinX)) { 
                                correctedX = bMinX - this.width / 2 - 0.001;
                            } else { 
                                correctedX = bMaxX + this.width / 2 + 0.001;
                            }
                        } else { 
                             if (!this.flying && this.isRunning) {
                                this.isRunning = false; 
                            }
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

    this.x = correctedX;
    this.y = correctedY;
    this.z = correctedZ;

    if (this.flying) {
        this.jumpVelocity = 0;
        this.onGround = false; 
        if (this.y < 0) this.y = 0;
        if (this.y + this.height > world.layers) {
            this.y = world.layers - this.height;
        }
    } else {
        if (this.y < 0) { 
            this.y = 0;
            landedOnGroundThisFrame = true; 
            this.jumpVelocity = 0;
            if (!this.dead) this.die(); 
        }
        if (this.y + this.height > world.layers) { 
            this.y = world.layers - this.height;
            if (this.jumpVelocity > 0) this.jumpVelocity = -0.001; 
        }
        this.onGround = landedOnGroundThisFrame;
    }

    if (!this.flying && this.isRunning) {
        const playerFeetBlockX = Math.floor(this.x);
        const playerFeetBlockY = Math.floor(this.y + 0.01); 
        const playerFeetBlockZ = Math.floor(this.z);
        const blockAtFeet = world.getBlock(playerFeetBlockX, playerFeetBlockY, playerFeetBlockZ);

        if (blockAtFeet === 'waterBlock') {
            this.isRunning = false;
        }
    }

    if (this.y < -world.voidHeight && !this.dead) this.die();

    this.mesh.position.set(this.x, this.y, this.z);
    camera.position.set(this.x, this.y + this.height * 0.9, this.z); 
  }
}
