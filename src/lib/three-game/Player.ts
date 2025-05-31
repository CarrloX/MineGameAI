
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

    const highlightBoxGeo = new THREE.BoxGeometry(1.002, 1.002, 1.002); // Slightly larger to avoid z-fighting
    const highlightEdgesGeo = new THREE.EdgesGeometry(highlightBoxGeo);
    const highlightMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 }); // Black outline
    
    this.blockFaceHL = {
      mesh: new THREE.LineSegments(highlightEdgesGeo, highlightMaterial),
      dir: "", // This 'dir' might be less relevant for a full cube outline
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

      // Calculate the world coordinates of the block being looked at (for destruction)
      const calculatedBlockWorldCoords = new THREE.Vector3(
        Math.floor(hitPointWorld.x - hitNormalWorld.x * 0.49),
        Math.floor(hitPointWorld.y - hitNormalWorld.y * 0.49),
        Math.floor(hitPointWorld.z - hitNormalWorld.z * 0.49)
      );
      
      // Calculate the world coordinates for placing a new block (adjacent to the hit face)
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
      
      // Position the wireframe highlight at the center of the targeted block cell
      this.blockFaceHL.mesh.position.set(
        this.lookingAt.blockWorldCoords.x + 0.5,
        this.lookingAt.blockWorldCoords.y + 0.5,
        this.lookingAt.blockWorldCoords.z + 0.5
      );
      this.blockFaceHL.mesh.rotation.set(0,0,0); // No rotation needed for a full cube outline
      
      // Determine face direction for debug info or other logic (optional, as visual is now a cube)
      if (Math.abs(hitNormalWorld.x) > 0.5) this.blockFaceHL.dir = hitNormalWorld.x > 0 ? "East (+X)" : "West (-X)";
      else if (Math.abs(hitNormalWorld.y) > 0.5) this.blockFaceHL.dir = hitNormalWorld.y > 0 ? "Top (+Y)" : "Bottom (-Y)";
      else if (Math.abs(hitNormalWorld.z) > 0.5) this.blockFaceHL.dir = hitNormalWorld.z > 0 ? "South (+Z)" : "North (-Z)";
      else this.blockFaceHL.dir = "Unknown";


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
    const { world, blocks: blockPrototypesArray, scene } = this.gameRefs;
    if (!world || !blockPrototypesArray || !scene || !this.lookingAt) return;

    if (destroy) {
      const { x, y, z } = this.lookingAt.blockWorldCoords;
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
          world.setBlock(x, y, z, 'air');
      } else {
          console.warn("Invalid block coordinates for destruction:", this.lookingAt.blockWorldCoords);
          return;
      }
      
      // No need to explicitly remove the highlight mesh here, 
      // highlightBlock will handle its visibility/removal in the next frame
      // if (scene.getObjectByName(this.blockFaceHL.mesh.name)) {
      //    scene.remove(this.blockFaceHL.mesh);
      // }
      // this.lookingAt = null; 
      // this.blockFaceHL.dir = "";
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
        // Prevent placing blocks inside the player
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
    const { controlConfig } = this.gameRefs;
    if (!controlConfig) return;

    switch (e.code) { 
      case controlConfig.left: this.xdir = "left"; break;
      case controlConfig.right: this.xdir = "right"; break;
      case controlConfig.forwards: this.zdir = "forwards"; break;
      case controlConfig.backwards: this.zdir = "backwards"; break;
      case controlConfig.jump: this.jumping = true; break;
      case controlConfig.respawn: this.die(); break; 
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
      case controlConfig.jump: this.jumping = false; break;
    }
  }
  
  die(): void {
    this.dead = true;
  }

  updatePosition(): void {
    const { world, camera } = this.gameRefs;
    if (!world || !camera) return;

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
    
    const moveMagnitude = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (moveMagnitude > 0) {
        const normalizedMoveX = moveX / moveMagnitude;
        const normalizedMoveZ = moveZ / moveMagnitude;
        this.x += normalizedMoveX * this.speed;
        this.z += normalizedMoveZ * this.speed;
    }

    if (this.jumping && this.onGround) { 
      this.jumpVelocity = this.jumpSpeed;
      this.onGround = false;
    }
    
    this.y += this.jumpVelocity;
    this.jumpVelocity -= world.gravity; 
    if (this.jumpVelocity < -this.jumpSpeed * 1.5) { 
        this.jumpVelocity = -this.jumpSpeed * 1.5;
    }

    this.onGround = false; 

    const playerMinX = this.x - this.width / 2;
    const playerMaxX = this.x + this.width / 2;
    const playerMinY = this.y; 
    const playerMaxY = this.y + this.height; 
    const playerMinZ = this.z - this.depth / 2;
    const playerMaxZ = this.z + this.depth / 2;

    const checkRadius = 1; 
    const startBlockY = Math.max(0, Math.floor(this.y) - checkRadius -1);
    const endBlockY = Math.min(world.layers, Math.floor(this.y + this.height) + checkRadius + 1);

    for (let checkWorldX = Math.floor(playerMinX) - checkRadius; checkWorldX <= Math.floor(playerMaxX) + checkRadius; checkWorldX++) {
        for (let checkWorldZ = Math.floor(playerMinZ) - checkRadius; checkWorldZ <= Math.floor(playerMaxZ) + checkRadius; checkWorldZ++) {
            for (let checkWorldY = startBlockY; checkWorldY < endBlockY; checkWorldY++) {
                const blockType = world.getBlock(checkWorldX, checkWorldY, checkWorldZ);
                if (blockType && blockType !== 'air') {
                    const blockMinX = checkWorldX;
                    const blockMaxX = checkWorldX + 1;
                    const blockMinY = checkWorldY;
                    const blockMaxY = checkWorldY + 1;
                    const blockMinZ = checkWorldZ;
                    const blockMaxZ = checkWorldZ + 1;

                    if (playerMaxX > blockMinX && playerMinX < blockMaxX &&
                        playerMaxY > blockMinY && playerMinY < blockMaxY &&
                        playerMaxZ > blockMinZ && playerMinZ < blockMaxZ) {
                        const overlapXRight = playerMaxX - blockMinX;
                        const overlapXLeft = blockMaxX - playerMinX;
                        const overlapYTop = playerMaxY - blockMinY;
                        const overlapYBottom = blockMaxY - playerMinY;
                        const overlapZFront = playerMaxZ - blockMinZ;
                        const overlapZBack = blockMaxZ - playerMinZ;

                        const minOverlapX = Math.min(overlapXRight, overlapXLeft);
                        const minOverlapY = Math.min(overlapYTop, overlapYBottom);
                        const minOverlapZ = Math.min(overlapZFront, overlapZBack);
                        
                        if (minOverlapY < minOverlapX && minOverlapY < minOverlapZ) {
                            if (overlapYBottom < overlapYTop) { 
                                if (this.jumpVelocity <= 0) { 
                                    this.y = blockMaxY;
                                    this.jumpVelocity = 0;
                                    this.onGround = true;
                                }
                            } else { 
                                if (this.jumpVelocity > 0) { 
                                    this.y = blockMinY - this.height;
                                    this.jumpVelocity = -0.001; 
                                }
                            }
                        } else if (minOverlapX < minOverlapY && minOverlapX < minOverlapZ) { 
                            if (overlapXRight < overlapXLeft) {
                                this.x = blockMinX - this.width / 2;
                            } else {
                                this.x = blockMaxX + this.width / 2;
                            }
                        } else { 
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
    
    if (this.y < -world.voidHeight) this.die();
    this.mesh.position.set(this.x, this.y, this.z); 
    camera.position.set(this.x, this.y + this.height * 0.9, this.z); 
  }
}

