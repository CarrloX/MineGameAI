
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
    this.width = 0.6; // Increased width for better collision feel
    this.depth = 0.6; // Increased depth
    this.pitch = 0;
    this.yaw = 0;
    this.speed = 0.07; // Base movement speed magnitude
    this.velocity = 0;
    this.jumpSpeed = 0.11; // Initial upward velocity on jump
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
        new THREE.PlaneGeometry(1.01, 1.01), // Slightly larger to avoid z-fighting
        new THREE.MeshLambertMaterial({
          color: 0xffffff, 
          opacity: 0.3,
          transparent: true,
          side: THREE.DoubleSide, // Render both sides in case of rotation issues
        })
      ),
      dir: "",
    };
    this.blockFaceHL.mesh.name = "Block_Face_Highlight_Mesh"; // More specific name
    this.blockFaceHL.mesh.renderOrder = 1; // Try to render on top

    this.mesh = new THREE.Object3D(); // Player's root object in the scene
    this.mesh.name = name; // e.g., "Player"
    this.mesh.position.set(this.x, this.y, this.z);
    // this.gameRefs.scene!.add(this.mesh); // Player object is conceptual, camera moves with player.x,y,z

    if (preserveCam && this.gameRefs.camera) {
        this.pitch = this.gameRefs.camera.rotation.x;
        this.yaw = this.gameRefs.camera.rotation.y;
    } else {
        this.lookAround(); // Initialize camera orientation
    }
  }

  highlightBlock(): void {
    const { raycaster, camera, scene } = this.gameRefs;
    if (!raycaster || !camera || !scene) return;

    raycaster.setFromCamera({ x: 0, y: 0 }, camera); // Ray from center of screen
    // Consider only chunkRoot children for block intersection
    const chunkMeshes: THREE.Object3D[] = [];
    scene.children.forEach(child => {
        if (child.name.startsWith("Chunk_")) { // Assumes chunks are named "Chunk_X_Z"
            chunkMeshes.push(...child.children);
        }
    });

    const intersects = raycaster.intersectObjects(chunkMeshes, false); // Non-recursive, only check direct children (faces)
    
    const firstBlockFace = intersects.find(
      intersect => intersect.object instanceof THREE.Mesh &&
                   intersect.object.name.startsWith("BlockFace_") && // Ensure it's one of our block faces
                   intersect.distance > 0.1 && // Avoid intersecting self/too_close
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
      
      // Extract world coordinates from face name e.g., "BlockFace_Top_X_Y_Z"
      const nameParts = faceMesh.name.split('_');
      const blockWorldX = parseInt(nameParts[3], 10);
      const blockWorldY = parseInt(nameParts[4], 10);
      const blockWorldZ = parseInt(nameParts[5], 10);
      const faceType = nameParts[2]; // Top, Bottom, Front, Back, Right, Left

      // Position highlight mesh on the center of the 1x1x1 block cell
      this.blockFaceHL.mesh.position.set(blockWorldX + 0.5, blockWorldY + 0.5, blockWorldZ + 0.5);
      this.blockFaceHL.mesh.rotation.set(0,0,0); // Reset rotation before applying new one

      const offset = 0.501; // Slightly offset to avoid z-fighting with the actual block face

      switch(faceType) {
        case "Top": // Positive Y
            this.blockFaceHL.mesh.position.y = blockWorldY + offset;
            this.blockFaceHL.mesh.rotation.x = -Math.PI / 2;
            this.blockFaceHL.dir = "above";
            break;
        case "Bottom": // Negative Y
            this.blockFaceHL.mesh.position.y = blockWorldY + 1 - offset; // blockWorldY is bottom of block cell
            this.blockFaceHL.mesh.rotation.x = Math.PI / 2;
            this.blockFaceHL.dir = "below";
            break;
        case "Front": // Positive Z
            this.blockFaceHL.mesh.position.z = blockWorldZ + offset;
            this.blockFaceHL.dir = "south"; // Assuming +Z is South
            break;
        case "Back": // Negative Z
            this.blockFaceHL.mesh.position.z = blockWorldZ + 1 - offset;
            this.blockFaceHL.mesh.rotation.y = Math.PI;
            this.blockFaceHL.dir = "north"; // Assuming -Z is North
            break;
        case "Right": // Positive X
            this.blockFaceHL.mesh.position.x = blockWorldX + offset;
            this.blockFaceHL.mesh.rotation.y = Math.PI / 2;
            this.blockFaceHL.dir = "east"; // Assuming +X is East
            break;
        case "Left": // Negative X
            this.blockFaceHL.mesh.position.x = blockWorldX + 1 - offset;
            this.blockFaceHL.mesh.rotation.y = -Math.PI / 2;
            this.blockFaceHL.dir = "west"; // Assuming -X is West
            break;
      }
      
      // Opacity blink effect
      const minOpacity = 0.16;
      const maxOpacity = 0.5; // Reduced max opacity
      const opacityRange = maxOpacity - minOpacity;
      const blinkSpeedMs = 700; // Slower blink
      const timeFactor = (Date.now() % blinkSpeedMs) / blinkSpeedMs; // Normalized time (0 to 1)
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
      const sensitivity = 0.002; // Adjusted sensitivity

      if (e instanceof MouseEvent) {
        this.yaw -= e.movementX * sensitivity;
        this.pitch -= e.movementY * sensitivity;
      } else if (e) { 
        // Simplified touch: use if you implement touch-based look controls
      }
      
      const maxPitch = Math.PI / 2 - 0.01; // Prevent gimbal lock
      this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
      
      // Normalize yaw to be between 0 and 2*PI
      this.yaw = ((this.yaw % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);

      camera.rotation.x = this.pitch;
      camera.rotation.y = this.yaw;
    } else { // Not in pointer lock, update cursor based on stored yaw/pitch
        camera.rotation.x = this.pitch;
        camera.rotation.y = this.yaw;
    }
  }

  interactWithBlock(destroy: boolean): void { // true for destroy, false for place
    const { world, blocks: blockPrototypes, scene } = this.gameRefs;
    if (!world || !blockPrototypes || !scene || !this.lookingAt) return;

    const faceMesh = this.lookingAt.object as THREE.Mesh;
    const nameParts = faceMesh.name.split('_');
    let blockWorldX = parseInt(nameParts[3], 10);
    let blockWorldY = parseInt(nameParts[4], 10);
    let blockWorldZ = parseInt(nameParts[5], 10);

    if (destroy) {
      world.setBlock(blockWorldX, blockWorldY, blockWorldZ, 'air');
      // Force remove the highlight if we just destroyed the block it was on
      if (scene.getObjectByName(this.blockFaceHL.mesh.name)) {
        scene.remove(this.blockFaceHL.mesh);
      }
      this.lookingAt = null; 
    } else { // Place block
      // Determine placement coordinates based on the face normal (approximated by this.blockFaceHL.dir)
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
        default: return; // Should not happen if highlight is working
      }
      
      // Player collision check before placing
      const playerHeadY = Math.floor(this.y + this.height - 0.1); // slightly below top of head
      const playerFeetY = Math.floor(this.y + 0.1); // slightly above feet

      if ( (Math.floor(placeX) === Math.floor(this.x) && Math.floor(placeZ) === Math.floor(this.z)) &&
           (Math.floor(placeY) === playerFeetY || Math.floor(placeY) === playerHeadY) ) {
        // console.log("Cannot place block inside player.");
        return; // Player is in the way
      }

      if (placeY >= 0 && placeY < world.layers) { // Ensure within chunk vertical bounds
        const blockToPlace = blockPrototypes[0]; // Default to first block (e.g. grass)
        if (blockToPlace) {
          const blockNameKey = blockToPlace.mesh.name.replace('Block_', '');
          world.setBlock(placeX, placeY, placeZ, blockNameKey);
        }
      }
    }
  }

  handleKeyDown(e: KeyboardEvent): void {
    const { controlConfig } = this.gameRefs;
    if (!controlConfig) return;

    switch (e.code) { // Using e.code for layout independence
      case controlConfig.left: this.xdir = "left"; break;
      case controlConfig.right: this.xdir = "right"; break;
      case controlConfig.forwards: this.zdir = "forwards"; break;
      case controlConfig.backwards: this.zdir = "backwards"; break;
      case controlConfig.jump: this.jumping = true; break;
      case controlConfig.respawn: this.die(); break; // die() now sets this.dead = true
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
    // console.log("Player died.");
    this.dead = true;
    // Respawn logic is handled in BlockifyGame's renderScene
  }

  updatePosition(): void {
    const { world, camera } = this.gameRefs;
    if (!world || !camera) return;

    // --- Horizontal Movement ---
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
    
    // Normalize diagonal movement and apply speed
    const moveMagnitude = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (moveMagnitude > 0) {
        const normalizedMoveX = moveX / moveMagnitude;
        const normalizedMoveZ = moveZ / moveMagnitude;
        this.x += normalizedMoveX * this.speed;
        this.z += normalizedMoveZ * this.speed;
    }


    // --- Vertical Movement (Jumping/Gravity) ---
    if (this.jumping && this.onGround) { 
      this.jumpVelocity = this.jumpSpeed;
      this.onGround = false;
    }
    
    this.y += this.jumpVelocity;
    this.jumpVelocity -= world.gravity; // Apply gravity
    if (this.jumpVelocity < -this.jumpSpeed * 1.5) { // Terminal velocity-ish
        this.jumpVelocity = -this.jumpSpeed * 1.5;
    }


    // --- Collision Detection & Resolution ---
    this.onGround = false; // Assume not on ground until collision proves otherwise

    const playerMinX = this.x - this.width / 2;
    const playerMaxX = this.x + this.width / 2;
    const playerMinY = this.y; // Feet
    const playerMaxY = this.y + this.height; // Head
    const playerMinZ = this.z - this.depth / 2;
    const playerMaxZ = this.z + this.depth / 2;

    // Iterate over nearby blocks for collision
    // Check a 3x(world.layers)x3 grid of block cells around the player
    const checkRadius = 1; // Check 1 block around player's integer coords
    for (let dx = -checkRadius; dx <= checkRadius; dx++) {
        for (let dz = -checkRadius; dz <= checkRadius; dz++) {
            for (let dy = 0; dy < world.layers ; dy++) { // Check all layers in this column
                const blockWorldX = Math.floor(this.x) + dx;
                const blockWorldY = dy; // worldY of the block cell
                const blockWorldZ = Math.floor(this.z) + dz;

                const blockType = world.getBlock(blockWorldX, blockWorldY, blockWorldZ);
                if (blockType && blockType !== 'air') {
                    const blockMinX = blockWorldX;
                    const blockMaxX = blockWorldX + 1;
                    const blockMinY = blockWorldY;
                    const blockMaxY = blockWorldY + 1;
                    const blockMinZ = blockWorldZ;
                    const blockMaxZ = blockWorldZ + 1;

                    // Check for AABB collision
                    if (playerMaxX > blockMinX && playerMinX < blockMaxX &&
                        playerMaxY > blockMinY && playerMinY < blockMaxY &&
                        playerMaxZ > blockMinZ && playerMinZ < blockMaxZ) {
                        
                        // Collision occurred, resolve it
                        const overlapX = Math.min(playerMaxX - blockMinX, blockMaxX - playerMinX);
                        const overlapY = Math.min(playerMaxY - blockMinY, blockMaxY - playerMinY);
                        const overlapZ = Math.min(playerMaxZ - blockMinZ, blockMaxZ - playerMinZ);

                        if (overlapY < overlapX && overlapY < overlapZ) {
                            // Vertical collision
                            if (this.jumpVelocity <= 0 && playerMinY < blockMaxY && playerMaxY > blockMaxY) { // Landing on top
                                this.y = blockMaxY;
                                this.jumpVelocity = 0;
                                this.onGround = true;
                            } else if (this.jumpVelocity > 0 && playerMaxY > blockMinY && playerMinY < blockMinY) { // Hitting head from below
                                this.y = blockMinY - this.height;
                                this.jumpVelocity = -0.01; // Lose some upward momentum
                            }
                        } else if (overlapX < overlapY && overlapX < overlapZ) {
                            // Horizontal X collision
                            if (playerMaxX > blockMinX && this.x < blockMinX) { // Colliding with left side of block
                                this.x = blockMinX - this.width / 2;
                            } else if (playerMinX < blockMaxX && this.x > blockMaxX) { // Colliding with right side of block
                                this.x = blockMaxX + this.width / 2;
                            }
                            // this.velocity = 0; // Stop horizontal movement component if needed
                        } else {
                            // Horizontal Z collision
                            if (playerMaxZ > blockMinZ && this.z < blockMinZ) { // Colliding with back side of block
                                this.z = blockMinZ - this.depth / 2;
                            } else if (playerMinZ < blockMaxZ && this.z > blockMaxZ) { // Colliding with front side of block
                                this.z = blockMaxZ + this.depth / 2;
                            }
                            // this.velocity = 0;
                        }
                    }
                }
            }
        }
    }
    
    // --- Fall into void ---
    if (this.y < -world.voidHeight) this.die();

    // --- Update Camera ---
    // Player's Y is feet, camera is at eye level
    camera.position.set(this.x, this.y + this.height * 0.9, this.z); // Eye level slightly below top of head
    // Camera rotation (pitch/yaw) is handled by lookAround()
  }
}
