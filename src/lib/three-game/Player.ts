
import * as THREE from 'three';
import type { Block } from './Block';
import type { World } from './World';
import { randomInt, CONTROL_CONFIG } from './utils';
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
  public velocity: number;
  public jumpSpeed: number;
  public jumpVelocity: number;
  public xdir: string;
  public zdir: string;
  public attackRange: number;
  public lookingAt: THREE.Intersection | null;
  public jumping: boolean;
  public onGround: boolean;
  public dead: boolean;
  public blockFaceHL: { mesh: THREE.Mesh; dir: string };
  public mesh: THREE.Object3D; // Player's representation in scene
  private name: string;
  private gameRefs: GameRefs;

  constructor(name: string, gameRefs: GameRefs, x: number = 0, y: number = 0, z: number = 0, preserveCam: boolean = false) {
    this.name = name;
    this.gameRefs = gameRefs;
    
    this.x = x;
    this.y = y;
    this.z = z;
    this.height = 1.7;
    this.width = 0.25;
    this.depth = 0.25;
    this.pitch = 0;
    this.yaw = 0;
    this.speed = 0.05;
    this.velocity = 0;
    this.jumpSpeed = 0.13;
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
        new THREE.PlaneGeometry(1, 1), // Changed from PlaneBufferGeometry
        new THREE.MeshLambertMaterial({
          color: 0xffffff, // White highlight
          opacity: 0.5,
          transparent: true,
        })
      ),
      dir: "",
    };
    this.blockFaceHL.mesh.name = "Block Face Highlight";

    this.mesh = new THREE.Object3D();
    this.mesh.name = name;
    this.mesh.position.set(this.x, this.y, this.z);
    this.gameRefs.scene!.add(this.mesh);

    if (preserveCam) {
        this.lookAround();
    }
  }

  highlightBlock(): void {
    const { raycaster, camera, scene } = this.gameRefs;
    if (!raycaster || !camera || !scene) return;

    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const intersects = raycaster.intersectObjects(scene.children);
    const intersected = intersects.filter(
      child => child.object instanceof THREE.Mesh &&
        child.distance > this.depth &&
        child.distance < this.attackRange &&
        child.object.name !== this.blockFaceHL.mesh.name
    );
    const firstBlock = intersected[0];

    if (intersected.length && firstBlock) {
      if (this.lookingAt == null) scene.add(this.blockFaceHL.mesh);
      this.lookingAt = firstBlock;

      const fbObj = firstBlock.object as THREE.Mesh;
      const fbObjRot = fbObj.rotation.y;

      this.blockFaceHL.mesh.position.set(fbObj.position.x, fbObj.position.y, fbObj.position.z);
      this.blockFaceHL.mesh.rotation.set(0, 0, 0);

      const faceIndex = firstBlock.faceIndex;
      if (faceIndex === undefined) return;

      const minOpacity = 0.16;
      const maxOpacity = 0.84;
      const opacityRange = maxOpacity - minOpacity;
      const ms = opacityRange * 1e3;
      const opacityFromMin = (new Date().getTime() % ms) / ms; // Use getTime() for number

      this.blockFaceHL.mesh.material.opacity =
        (opacityFromMin > opacityRange / 2 ? maxOpacity - opacityFromMin : opacityFromMin) + minOpacity; // Corrected logic

      const zFightFix = 1e-3;

      // face directions: 0,1—right(px), 2,3—left(nx), 4,5—top(py), 6,7—bottom(ny), 8,9—front(pz), 10,11—back(nz)
      // These indices are for non-indexed BufferGeometry.
      // For BoxBufferGeometry, faces are ordered: px, nx, py, ny, pz, nz. Each face has 2 triangles.
      // 0,1: +X (right)
      // 2,3: -X (left)
      // 4,5: +Y (top)
      // 6,7: -Y (bottom)
      // 8,9: +Z (front)
      // 10,11: -Z (back)

      const face = Math.floor(faceIndex / 2); // Each face has 2 triangles (faceIndex 0,1 is one face, 2,3 another, etc.)
      
      if (
          (face === 0 && fbObjRot === 0) || // Right face, no rotation
          (face === 1 && Math.abs(fbObjRot) === Math.PI) || // Left face, 180 deg rotation (becomes right)
          (face === 4 && fbObjRot === Math.PI/2) || // Front face, 90 deg rot (becomes right)
          (face === 5 && fbObjRot === -Math.PI/2) // Back face, -90 deg rot (becomes right)
      ) {
        this.blockFaceHL.mesh.position.x += 0.5 + zFightFix;
        this.blockFaceHL.mesh.rotation.y += Math.PI / 2;
        this.blockFaceHL.dir = "east";
      } else if (
          (face === 0 && Math.abs(fbObjRot) === Math.PI) || // Right face, 180 deg rotation (becomes left)
          (face === 1 && fbObjRot === 0) || // Left face, no rotation
          (face === 4 && fbObjRot === -Math.PI/2) || // Front face, -90 deg rot (becomes left)
          (face === 5 && fbObjRot === Math.PI/2) // Back face, 90 deg rot (becomes left)
      ) {
        this.blockFaceHL.mesh.position.x -= 0.5 + zFightFix;
        this.blockFaceHL.mesh.rotation.y -= Math.PI / 2;
        this.blockFaceHL.dir = "west";
      } else if (face === 2) { // Top face
        this.blockFaceHL.mesh.position.y += 0.5 + zFightFix;
        this.blockFaceHL.mesh.rotation.x -= Math.PI / 2;
        this.blockFaceHL.dir = "above";
      } else if (face === 3) { // Bottom face
        this.blockFaceHL.mesh.position.y -= 0.5 + zFightFix;
        this.blockFaceHL.mesh.rotation.x += Math.PI / 2;
        this.blockFaceHL.dir = "below";
      } else if (
          (face === 0 && fbObjRot === -Math.PI/2) || // Right face, -90 deg rot (becomes south/front)
          (face === 1 && fbObjRot === Math.PI/2) ||   // Left face, 90 deg rot (becomes south/front)
          (face === 4 && fbObjRot === 0) ||           // Front face, no rotation
          (face === 5 && Math.abs(fbObjRot) === Math.PI) // Back face, 180 deg rot (becomes south/front)
      ) {
        this.blockFaceHL.mesh.position.z += 0.5 + zFightFix;
        this.blockFaceHL.dir = "south";
      } else if (
          (face === 0 && fbObjRot === Math.PI/2) ||   // Right face, 90 deg rot (becomes north/back)
          (face === 1 && fbObjRot === -Math.PI/2) ||  // Left face, -90 deg rot (becomes north/back)
          (face === 4 && Math.abs(fbObjRot) === Math.PI) ||// Front face, 180 deg rot (becomes north/back)
          (face === 5 && fbObjRot === 0)            // Back face, no rotation
      ) {
        this.blockFaceHL.mesh.position.z -= 0.5 + zFightFix;
        this.blockFaceHL.mesh.rotation.y = Math.PI; // Rotate 180 deg to face correctly
        this.blockFaceHL.dir = "north";
      }


    } else if (this.lookingAt != null) {
      scene.remove(this.blockFaceHL.mesh);
      this.blockFaceHL.dir = "";
      this.lookingAt = null;
    }
  }

  lookAround(e?: MouseEvent | Touch): void {
    const { cursor } = this.gameRefs;
    if (!cursor || !this.gameRefs.canvasRef) return;

    if (cursor.inWindow) {
      const center = {
        x: this.gameRefs.canvasRef.clientWidth / 2,
        y: this.gameRefs.canvasRef.clientHeight / 2,
      };
      const maxPitch = Math.PI / 2;
      const sensitivity = 4;

      if (e instanceof MouseEvent) {
        cursor.x += e.movementX;
        cursor.y += e.movementY;
      } else if (e) { // Touch event
        // Simplified touch handling - assumes single touch and uses clientX/Y
        // A proper touch joystick or delta calculation from previous touch position would be better.
        // For now, this example might not work well with touch for looking.
        // cursor.x = e.clientX; 
        // cursor.y = e.clientY;
      }

      this.pitch = -Math.atan((cursor.y - center.y) / center.y) * sensitivity;
      if (this.pitch < -maxPitch) this.pitch = -maxPitch;
      else if (this.pitch > maxPitch) this.pitch = maxPitch;

      this.yaw = -Math.atan((cursor.x - center.x) / center.x) * sensitivity;
    }
  }

  build(e?: MouseEvent): void {
    const { world, blocks, cursor, scene } = this.gameRefs;
    if (!world || !blocks || !cursor || !scene) return;
    
    // Destroy block
    if ((e && e.button === 2) || cursor.holdTime === cursor.triggerHoldTime) {
      if (this.lookingAt != null && this.lookingAt.object.name !== this.blockFaceHL.mesh.name) { // Check not highlighting mesh
        scene.remove(this.lookingAt.object);
        // Potentially remove from a data structure tracking blocks if physics or saving is implemented
      }
    // Place block
    } else if ((e && e.button === 0) || (cursor.holdTime > 0 && cursor.holdTime < cursor.triggerHoldTime)) {
      const at = this.lookingAt;
      if (at != null) {
        const pos = at.object.position;
        let placeX = pos.x;
        let placeY = pos.y;
        let placeZ = pos.z;

        switch (this.blockFaceHL.dir) {
          case "east": ++placeX; break;
          case "west": --placeX; break;
          case "above": ++placeY; break;
          case "below": --placeY; break;
          case "south": ++placeZ; break;
          case "north": --placeZ; break;
          default: break;
        }

        const xr = Math.round(this.x);
        const yr = Math.round(this.y);
        const zr = Math.round(this.z);
        const pxr = Math.round(placeX);
        const pyr = Math.round(placeY);
        const pzr = Math.round(placeZ);
        
        // Player collision check: slightly expanded to avoid placing inside player more reliably
        const playerCollides = 
            (pxr === xr && pyr === yr && pzr === zr) || // Body
            (pxr === xr && pyr === yr - 1 && pzr === zr) || // Feet
            (pxr === xr && pyr === yr + 1 && pzr === zr); // Head (approx)


        if (!playerCollides &&
          (pxr >= -world.size / 2 && pxr < world.size / 2) &&
          (pyr >= 0 && pyr < world.skyHeight) &&
          (pzr >= -world.size / 2 && pzr < world.size / 2)) {
          
          const layers = world.layers - 1;
          const currentY = Math.floor(placeY);

          // Use a default block or a selected block from inventory (not implemented)
          const blockToPlace = blocks[0]; // Default to first block type (e.g., silicon)
          world.addBlock(placeX, placeY, placeZ, blockToPlace, this.yaw);
        }
      }
    }
  }

  handleKeyDown(e: KeyboardEvent): void {
    const { controlConfig } = this.gameRefs;
    if (!controlConfig) return;

    switch (e.keyCode) {
      case controlConfig.left: this.xdir = "left"; break;
      case controlConfig.right: this.xdir = "right"; break;
      case controlConfig.forwards: this.zdir = "forwards"; break;
      case controlConfig.backwards: this.zdir = "backwards"; break;
      case controlConfig.jump: this.jumping = true; break;
      case controlConfig.respawn: if (this.die()) { /* Respawn logic handled in main game loop */ } break;
    }
  }

  handleKeyUp(e: KeyboardEvent): void {
    const { controlConfig } = this.gameRefs;
    if (!controlConfig) return;

    switch (e.keyCode) {
      case controlConfig.left: case controlConfig.right: this.xdir = ""; break;
      case controlConfig.forwards: case controlConfig.backwards: this.zdir = ""; break;
      case controlConfig.jump: this.jumping = false; break;
    }
  }
  
  midairMoveStop(): void {
    if (!this.onGround && this.jumpVelocity > 0) {
      this.velocity = -this.jumpVelocity; // This seems to intend to stop horizontal movement, but is applied to overall velocity
    }
  }

  die(): boolean {
    const { scene } = this.gameRefs;
    if (!scene) return false;

    scene.remove(this.mesh); // Player model
    scene.remove(this.blockFaceHL.mesh); // Highlight mesh
    this.dead = true;
    return this.dead;
  }

  updatePosition(): void {
    const { world, scene, camera } = this.gameRefs;
    if (!world || !scene || !camera ) return;

    // Moving
    const move = this.velocity < 0 ? 0 : this.velocity;
    const rate = 0.01;

    if (this.xdir === "left") {
      this.x -= move * Math.cos(this.yaw);
      this.z += move * Math.sin(this.yaw);
    } else if (this.xdir === "right") {
      this.x += move * Math.cos(this.yaw);
      this.z -= move * Math.sin(this.yaw);
    }
    if (this.zdir === "backwards") {
      this.z += move * Math.cos(this.yaw);
      this.x += move * Math.sin(this.yaw);
    } else if (this.zdir === "forwards") {
      this.z -= move * Math.cos(this.yaw);
      this.x -= move * Math.sin(this.yaw);
    }

    // Accelerate movement
    if (this.xdir !== "" || this.zdir !== "") {
      this.velocity += rate;
      if (this.velocity > this.speed) this.velocity = this.speed;
    } else {
      this.velocity -= rate;
      if (this.velocity < 0) this.velocity = 0;
    }

    // Jumping, falling
    if (this.jumpVelocity === 0) {
      if (this.jumping && this.onGround) { // Can only jump if on ground
        this.jumpVelocity = this.jumpSpeed;
        this.onGround = false;
      } else {
        // this.onGround = true; // This is set by collision detection
      }
    }
    this.y += this.jumpVelocity;
    this.jumpVelocity -= world.gravity;

    // Assume not on ground until a collision proves otherwise
    this.onGround = false;

    // Touch blocks
    scene.children.forEach(child => {
      if (child instanceof THREE.Mesh && child.name !== this.mesh.name && child.name !== this.blockFaceHL.mesh.name) {
        const cpos = child.position;
        const xFromPlyr = Math.abs(cpos.x - this.x);
        const yFromPlyrAbs = Math.abs((this.y + this.height/2) - (cpos.y + 0.5)); // Compare center Ys, blocks are 1 unit high
        const yFromPlyr = (this.y) - (cpos.y); // Player bottom vs block top
        const zFromPlyr = Math.abs(cpos.z - this.z);

        // Broad phase collision check (simplified)
        // Check if player's bounding box (approx) overlaps with block's bounding box (1x1x1)
        if (xFromPlyr < (this.width/2 + 0.5) && 
            yFromPlyrAbs < (this.height/2 + 0.5) && 
            zFromPlyr < (this.depth/2 + 0.5)) {
          this.collideWithBlock(child);
        }
      }
    });
    
    if (this.y < -world.voidHeight) this.die();

    // Camera keep up
    camera.position.x = this.x;
    camera.position.y = this.y + (this.height - 0.5);
    camera.position.z = this.z;
    camera.rotation.x = this.pitch;
    camera.rotation.y = this.yaw;
  }

  private collideWithBlock(block: THREE.Mesh): void {
    // AABB collision detection
    const pMinX = this.x - this.width / 2;
    const pMaxX = this.x + this.width / 2;
    const pMinY = this.y; // Bottom of player
    const pMaxY = this.y + this.height; // Top of player
    const pMinZ = this.z - this.depth / 2;
    const pMaxZ = this.z + this.depth / 2;

    const bMinX = block.position.x - 0.5;
    const bMaxX = block.position.x + 0.5;
    const bMinY = block.position.y - 0.5;
    const bMaxY = block.position.y + 0.5;
    const bMinZ = block.position.z - 0.5;
    const bMaxZ = block.position.z + 0.5;

    // Check for overlap
    if (pMaxX > bMinX && pMinX < bMaxX && pMaxY > bMinY && pMinY < bMaxY && pMaxZ > bMinZ && pMinZ < bMaxZ) {
        // Collision detected, calculate penetration depths
        const penX1 = bMaxX - pMinX; // Penetration from -X side of block
        const penX2 = pMaxX - bMinX; // Penetration from +X side of block
        const penY1 = bMaxY - pMinY; // Penetration from -Y side of block (player hits top of block)
        const penY2 = pMaxY - bMinY; // Penetration from +Y side of block (player hits bottom of block)
        const penZ1 = bMaxZ - pMinZ; // Penetration from -Z side of block
        const penZ2 = pMaxZ - bMinZ; // Penetration from +Z side of block

        const penX = Math.min(penX1, penX2);
        const penY = Math.min(penY1, penY2);
        const penZ = Math.min(penZ1, penZ2);
        
        // Resolve collision by pushing player out by the smallest penetration
        if (penY < penX && penY < penZ) { // Vertical collision
            if (penY1 < penY2) { // Player landed on top of block
                this.y = bMaxY;
                this.jumpVelocity = 0;
                this.onGround = true;
            } else { // Player hit bottom of block
                this.y = bMinY - this.height;
                if(this.jumpVelocity > 0) this.jumpVelocity = 0; // Stop upward movement
            }
        } else if (penX < penY && penX < penZ) { // Horizontal X collision
            if (penX1 < penX2) { // Player hit -X side of block
                this.x = bMaxX + this.width / 2;
            } else { // Player hit +X side of block
                this.x = bMinX - this.width / 2;
            }
            this.velocity = 0; // Stop horizontal movement in this direction
        } else { // Horizontal Z collision
            if (penZ1 < penZ2) { // Player hit -Z side of block
                this.z = bMaxZ + this.depth / 2;
            } else { // Player hit +Z side of block
                this.z = bMinZ - this.depth / 2;
            }
            this.velocity = 0; // Stop horizontal movement in this direction
        }
    }
  }
}
