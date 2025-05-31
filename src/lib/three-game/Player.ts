
import * as THREE from 'three';
import type { Block } from './Block';
import type { World } from './World';
import { CONTROL_CONFIG, CHUNK_SIZE } from './utils';
import type { GameRefs } from './types';


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
  public velocity: number; // Current movement speed (forward/strafe)
  public jumpSpeed: number;
  public jumpVelocity: number; // Current vertical speed
  public xdir: string; // "left", "right", or ""
  public zdir: string; // "forwards", "backwards", or ""
  public attackRange: number;
  public lookingAt: { object: THREE.Object3D, point: THREE.Vector3, face: THREE.Face | null, faceIndex?: number, distance: number } | null;
  public jumping: boolean;
  public onGround: boolean;
  public dead: boolean;
  public blockFaceHL: { mesh: THREE.Mesh; dir: string }; // Highlight mesh for targeted block face
  public mesh: THREE.Object3D; // Player's representation in scene (usually just a conceptual position)
  private name: string;
  private gameRefs: GameRefs;

  constructor(name: string, gameRefs: GameRefs, x: number = 0, y: number = 0, z: number = 0, preserveCam: boolean = false) {
    this.name = name;
    this.gameRefs = gameRefs;
    
    this.x = x;
    this.y = y; // This is the Y of the player's feet
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

    this.blockFaceHL = {
      mesh: new THREE.Mesh(
        new THREE.PlaneGeometry(1.01, 1.01), 
        new THREE.MeshLambertMaterial({
          color: 0xffffff, 
          opacity: 0.3,
          transparent: true,
          side: THREE.DoubleSide, 
        })
      ),
      dir: "",
    };
    this.blockFaceHL.mesh.name = "Block_Face_Highlight_Mesh"; 
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
    const { raycaster, camera, scene } = this.gameRefs;
    if (!raycaster || !camera || !scene) return;

    raycaster.setFromCamera({ x: 0, y: 0 }, camera); 
    const chunkMeshes: THREE.Object3D[] = [];
    scene.children.forEach(child => {
        if (child.name.startsWith("Chunk_")) { 
            chunkMeshes.push(...child.children);
        }
    });

    const intersects = raycaster.intersectObjects(chunkMeshes, false); 
    
    const firstBlockFace = intersects.find(
      intersect => intersect.object instanceof THREE.Mesh &&
                   intersect.object.name.startsWith("BlockFace_") && 
                   intersect.distance > 0.1 && 
                   intersect.distance < this.attackRange
    );

    if (firstBlockFace) {
      if (this.lookingAt === null || this.lookingAt.object !== firstBlockFace.object) {
         if (!scene.getObjectByName(this.blockFaceHL.mesh.name)) {
            scene.add(this.blockFaceHL.mesh);
         }
      }
      this.lookingAt = firstBlockFace;

      const faceMesh = firstBlockFace.object as THREE.Mesh;
      const nameParts = faceMesh.name.split('_');
      const blockWorldX = parseInt(nameParts[3], 10);
      const blockWorldY = parseInt(nameParts[4], 10);
      const blockWorldZ = parseInt(nameParts[5], 10);
      const faceType = nameParts[2]; // Top, Bottom, Front, Back, Right, Left

      // Corrected Visual Highlight Positioning
      // The highlight plane is 1x1. Its center needs to be ON the face of the block.
      // A block at (blockWorldX, blockWorldY, blockWorldZ) spans from X to X+1, Y to Y+1, Z to Z+1.
      const epsilon = 0.015; // Slightly increased offset for visual clarity
      this.blockFaceHL.mesh.position.set(blockWorldX + 0.5, blockWorldY + 0.5, blockWorldZ + 0.5); // Start at cell center
      this.blockFaceHL.mesh.rotation.set(0,0,0); // Reset rotation

      switch(faceType) {
        case "Top": // Positive Y face is at Y = blockWorldY + 1
            this.blockFaceHL.mesh.position.y = (blockWorldY + 1) + epsilon;
            this.blockFaceHL.mesh.rotation.x = -Math.PI / 2;
            this.blockFaceHL.dir = "above"; // Place new block ON TOP of current block
            break;
        case "Bottom": // Negative Y face is at Y = blockWorldY
            this.blockFaceHL.mesh.position.y = blockWorldY - epsilon;
            this.blockFaceHL.mesh.rotation.x = Math.PI / 2;
            this.blockFaceHL.dir = "below"; // Place new block BENEATH current block
            break;
        case "Front": // Positive Z face is at Z = blockWorldZ + 1 (Chunk.ts places front face mesh at z + 0.5 + 0.5 relative to chunk origin)
            this.blockFaceHL.mesh.position.z = (blockWorldZ + 1) + epsilon;
            this.blockFaceHL.mesh.rotation.y = 0; // Default PlaneGeometry faces +Z if not rotated
            this.blockFaceHL.dir = "south"; // Place new block IN FRONT OF (South, +Z) current block
            break;
        case "Back": // Negative Z face is at Z = blockWorldZ
            this.blockFaceHL.mesh.position.z = blockWorldZ - epsilon;
            this.blockFaceHL.mesh.rotation.y = Math.PI;
            this.blockFaceHL.dir = "north"; // Place new block BEHIND (North, -Z) current block
            break;
        case "Right": // Positive X face is at X = blockWorldX + 1
            this.blockFaceHL.mesh.position.x = (blockWorldX + 1) + epsilon;
            this.blockFaceHL.mesh.rotation.y = Math.PI / 2;
            this.blockFaceHL.dir = "east";  // Place new block to the RIGHT (East, +X) current block
            break;
        case "Left": // Negative X face is at X = blockWorldX
            this.blockFaceHL.mesh.position.x = blockWorldX - epsilon;
            this.blockFaceHL.mesh.rotation.y = -Math.PI / 2;
            this.blockFaceHL.dir = "west";  // Place new block to the LEFT (West, -X) current block
            break;
      }
      
      const minOpacity = 0.16;
      const maxOpacity = 0.5; 
      const opacityRange = maxOpacity - minOpacity;
      const blinkSpeedMs = 700; 
      const timeFactor = (Date.now() % blinkSpeedMs) / blinkSpeedMs; 
      (this.blockFaceHL.mesh.material as THREE.MeshLambertMaterial).opacity = minOpacity + Math.abs(Math.sin(timeFactor * Math.PI)) * opacityRange;

    } else if (this.lookingAt !== null) {
      if (scene.getObjectByName(this.blockFaceHL.mesh.name)) {
        scene.remove(this.blockFaceHL.mesh);
      }
      this.blockFaceHL.dir = "";
      this.lookingAt = null;
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
      } else if (e) { 
        
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

    const faceMesh = this.lookingAt.object as THREE.Mesh;
    const nameParts = faceMesh.name.split('_');
    let blockWorldX = parseInt(nameParts[3], 10);
    let blockWorldY = parseInt(nameParts[4], 10);
    let blockWorldZ = parseInt(nameParts[5], 10);

    if (destroy) {
      world.setBlock(blockWorldX, blockWorldY, blockWorldZ, 'air');
      if (scene.getObjectByName(this.blockFaceHL.mesh.name)) {
        scene.remove(this.blockFaceHL.mesh);
      }
      this.lookingAt = null; 
    } else { 
      let placeX = blockWorldX;
      let placeY = blockWorldY;
      let placeZ = blockWorldZ;

      switch (this.blockFaceHL.dir) {
        case "east": placeX++; break;
        case "west": placeX--; break;
        case "above": placeY++; break;
        case "below": placeY--; break;
        case "south": placeZ++; break;
        case "north": placeZ--; break;
        default: return; 
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
          const blockNameKey = (blockToPlace.mesh.name as string).replace('Block_', '');
          world.setBlock(placeX, placeY, placeZ, blockNameKey);
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
    for (let dx = -checkRadius; dx <= checkRadius; dx++) {
        for (let dz = -checkRadius; dz <= checkRadius; dz++) {
            for (let dy = 0; dy < world.layers ; dy++) { 
                const blockWorldX = Math.floor(this.x) + dx;
                const blockWorldY = dy; 
                const blockWorldZ = Math.floor(this.z) + dz;

                const blockType = world.getBlock(blockWorldX, blockWorldY, blockWorldZ);
                if (blockType && blockType !== 'air') {
                    const blockMinX = blockWorldX;
                    const blockMaxX = blockWorldX + 1;
                    const blockMinY = blockWorldY;
                    const blockMaxY = blockWorldY + 1;
                    const blockMinZ = blockWorldZ;
                    const blockMaxZ = blockWorldZ + 1;

                    if (playerMaxX > blockMinX && playerMinX < blockMaxX &&
                        playerMaxY > blockMinY && playerMinY < blockMaxY &&
                        playerMaxZ > blockMinZ && playerMinZ < blockMaxZ) {
                        
                        const overlapX = Math.min(playerMaxX - blockMinX, blockMaxX - playerMinX);
                        const overlapY = Math.min(playerMaxY - blockMinY, blockMaxY - playerMinY);
                        const overlapZ = Math.min(playerMaxZ - blockMinZ, blockMaxZ - playerMinZ);

                        if (overlapY < overlapX && overlapY < overlapZ) {
                            if (this.jumpVelocity <= 0 && playerMinY < blockMaxY && playerMaxY > blockMaxY) { 
                                this.y = blockMaxY;
                                this.jumpVelocity = 0;
                                this.onGround = true;
                            } else if (this.jumpVelocity > 0 && playerMaxY > blockMinY && playerMinY < blockMinY) { 
                                this.y = blockMinY - this.height;
                                this.jumpVelocity = -0.01; 
                            }
                        } else if (overlapX < overlapY && overlapX < overlapZ) {
                            if (playerMaxX > blockMinX && this.x < blockMinX + this.width / 2) { 
                                this.x = blockMinX - this.width / 2;
                            } else if (playerMinX < blockMaxX && this.x > blockMaxX - this.width / 2) { 
                                this.x = blockMaxX + this.width / 2;
                            }
                        } else {
                            if (playerMaxZ > blockMinZ && this.z < blockMinZ + this.depth / 2) { 
                                this.z = blockMinZ - this.depth / 2;
                            } else if (playerMinZ < blockMaxZ && this.z > blockMaxZ - this.depth / 2) { 
                                this.z = blockMaxZ + this.depth / 2;
                            }
                        }
                    }
                }
            }
        }
    }
    
    if (this.y < -world.voidHeight) this.die();

    camera.position.set(this.x, this.y + this.height * 0.9, this.z); 
  }
}
