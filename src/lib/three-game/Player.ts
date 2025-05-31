
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
      const nameParts = faceMesh.name.split('_'); // BlockFace_Top_X_Y_Z
      
      if (nameParts.length < 5) { // Check for "BlockFace", "Type", "X", "Y", "Z"
        if (scene.getObjectByName(this.blockFaceHL.mesh.name)) {
            scene.remove(this.blockFaceHL.mesh);
        }
        this.lookingAt = null;
        this.blockFaceHL.dir = "";
        return;
      }

      const blockWorldX = parseInt(nameParts[2], 10);
      const blockWorldY = parseInt(nameParts[3], 10);
      const blockWorldZ = parseInt(nameParts[4], 10);
      const faceType = nameParts[1];

      if (isNaN(blockWorldX) || isNaN(blockWorldY) || isNaN(blockWorldZ)) {
        if (scene.getObjectByName(this.blockFaceHL.mesh.name)) {
            scene.remove(this.blockFaceHL.mesh);
        }
        this.lookingAt = null;
        this.blockFaceHL.dir = "";
        return;
      }
      
      const epsilon = 0.015; 
      this.blockFaceHL.mesh.position.set(blockWorldX + 0.5, blockWorldY + 0.5, blockWorldZ + 0.5); 
      this.blockFaceHL.mesh.rotation.set(0,0,0); 

      switch(faceType) {
        case "Top": 
            this.blockFaceHL.mesh.position.y = (blockWorldY + 1) + epsilon;
            this.blockFaceHL.mesh.rotation.x = -Math.PI / 2;
            this.blockFaceHL.dir = "above"; 
            break;
        case "Bottom": 
            this.blockFaceHL.mesh.position.y = blockWorldY - epsilon;
            this.blockFaceHL.mesh.rotation.x = Math.PI / 2;
            this.blockFaceHL.dir = "below"; 
            break;
        case "Front": 
            this.blockFaceHL.mesh.position.z = (blockWorldZ + 1) + epsilon;
            this.blockFaceHL.mesh.rotation.y = 0; 
            this.blockFaceHL.dir = "south"; 
            break;
        case "Back": 
            this.blockFaceHL.mesh.position.z = blockWorldZ - epsilon;
            this.blockFaceHL.mesh.rotation.y = Math.PI;
            this.blockFaceHL.dir = "north"; 
            break;
        case "Right": 
            this.blockFaceHL.mesh.position.x = (blockWorldX + 1) + epsilon;
            this.blockFaceHL.mesh.rotation.y = Math.PI / 2;
            this.blockFaceHL.dir = "east";  
            break;
        case "Left": 
            this.blockFaceHL.mesh.position.x = blockWorldX - epsilon;
            this.blockFaceHL.mesh.rotation.y = -Math.PI / 2;
            this.blockFaceHL.dir = "west";  
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
    const nameParts = faceMesh.name.split('_'); // Example: BlockFace_Top_0_1_0

    // nameParts[0] = "BlockFace"
    // nameParts[1] = "Top" (Face Type)
    // nameParts[2] = "0" (World X)
    // nameParts[3] = "1" (World Y)
    // nameParts[4] = "0" (World Z)

    if (nameParts.length < 5) {
        console.error("Interaction failed: Invalid faceMesh name:", faceMesh.name);
        if (scene.getObjectByName(this.blockFaceHL.mesh.name)) {
            scene.remove(this.blockFaceHL.mesh);
        }
        this.lookingAt = null;
        return;
    }

    let blockWorldX = parseInt(nameParts[2], 10);
    let blockWorldY = parseInt(nameParts[3], 10);
    let blockWorldZ = parseInt(nameParts[4], 10);

    if (isNaN(blockWorldX) || isNaN(blockWorldY) || isNaN(blockWorldZ)) {
        console.error("Interaction failed: Could not parse coordinates from faceMesh name:", faceMesh.name, nameParts);
        if (scene.getObjectByName(this.blockFaceHL.mesh.name)) {
            scene.remove(this.blockFaceHL.mesh);
        }
        this.lookingAt = null;
        return;
    }


    if (destroy) {
      world.setBlock(blockWorldX, blockWorldY, blockWorldZ, 'air');
      // The highlightBlock method will handle removing the highlight on the next frame
      // by re-evaluating what the player is looking at.
      // Forcing removal here can be okay too, but ensure lookingAt is nulled.
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
        default: 
          console.warn("Cannot place block: unknown highlight direction", this.blockFaceHL.dir);
          return; 
      }
      
      const playerHeadY = Math.floor(this.y + this.height - 0.1); 
      const playerFeetY = Math.floor(this.y + 0.1); 

      if ( (Math.floor(placeX) === Math.floor(this.x) && Math.floor(placeZ) === Math.floor(this.z)) &&
           (Math.floor(placeY) === playerFeetY || Math.floor(placeY) === playerHeadY) ) {
        // Trying to place block inside player
        return; 
      }

      if (placeY >= 0 && placeY < world.layers) { 
        const blockToPlace = blockPrototypesArray[0]; // For now, always place the first block type
        if (blockToPlace) {
          // Ensure blockNameKey is correctly derived from the prototype
          const blockMeshName = blockToPlace.mesh.name; // e.g., "Block_grassBlock"
          const blockNameKey = blockMeshName.startsWith('Block_') ? blockMeshName.substring(6) : blockMeshName;
          
          if(blockNameKey && blockNameKey !== 'air') {
            world.setBlock(placeX, placeY, placeZ, blockNameKey);
          } else {
            console.warn("Attempted to place an invalid or air block prototype:", blockToPlace);
          }
        } else {
            console.warn("No block prototype found to place.");
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

                    // AABB collision check
                    if (playerMaxX > blockMinX && playerMinX < blockMaxX &&
                        playerMaxY > blockMinY && playerMinY < blockMaxY &&
                        playerMaxZ > blockMinZ && playerMinZ < blockMaxZ) {
                        
                        // Resolve collision
                        const overlapXRight = playerMaxX - blockMinX;
                        const overlapXLeft = blockMaxX - playerMinX;
                        const overlapYTop = playerMaxY - blockMinY; // Player's top colliding with block's bottom
                        const overlapYBottom = blockMaxY - playerMinY; // Player's bottom colliding with block's top
                        const overlapZFront = playerMaxZ - blockMinZ;
                        const overlapZBack = blockMaxZ - playerMinZ;

                        const minOverlapX = Math.min(overlapXRight, overlapXLeft);
                        const minOverlapY = Math.min(overlapYTop, overlapYBottom);
                        const minOverlapZ = Math.min(overlapZFront, overlapZBack);
                        
                        if (minOverlapY < minOverlapX && minOverlapY < minOverlapZ) {
                            // Vertical collision
                            if (overlapYBottom < overlapYTop) { // Player landed on top of block
                                if (this.jumpVelocity <= 0) {
                                    this.y = blockMaxY;
                                    this.jumpVelocity = 0;
                                    this.onGround = true;
                                }
                            } else { // Player hit block from below
                                if (this.jumpVelocity > 0) {
                                    this.y = blockMinY - this.height;
                                    this.jumpVelocity = -0.001; // Stop upward movement
                                }
                            }
                        } else if (minOverlapX < minOverlapY && minOverlapX < minOverlapZ) {
                            // Horizontal X collision
                            if (overlapXRight < overlapXLeft) { // Player hit block from the left
                                this.x = blockMinX - this.width / 2;
                            } else { // Player hit block from the right
                                this.x = blockMaxX + this.width / 2;
                            }
                        } else {
                            // Horizontal Z collision
                            if (overlapZFront < overlapZBack) { // Player hit block from the back
                                this.z = blockMinZ - this.depth / 2;
                            } else { // Player hit block from the front
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

