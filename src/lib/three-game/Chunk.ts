
import * as THREE from 'three';
import type { World } from './World';
import type { Block } from './Block';
import { CHUNK_SIZE } from './utils';

export class Chunk {
  public worldX: number;
  public worldZ: number;
  public worldY: number = 0; // Base Y position of the chunk in the world
  public blocks: string[][][]; // [x][y][z] -> block type name (e.g., 'grassBlock')
  public chunkRoot: THREE.Group;
  private world: World;
  public needsMeshUpdate: boolean = false;
  private blockPrototypes: Map<string, Block>;

  constructor(world: World, worldX: number, worldZ: number, blockPrototypes: Map<string, Block>) {
    this.world = world;
    this.worldX = worldX; // Chunk's X coordinate in chunk units
    this.worldZ = worldZ; // Chunk's Z coordinate in chunk units
    this.blockPrototypes = blockPrototypes;

    this.blocks = [];
    for (let x = 0; x < CHUNK_SIZE; x++) {
      this.blocks[x] = [];
      for (let y = 0; y < this.world.layers; y++) {
        this.blocks[x][y] = [];
        for (let z = 0; z < CHUNK_SIZE; z++) {
          this.blocks[x][y][z] = 'air'; // Initialize with air
        }
      }
    }
    this.chunkRoot = new THREE.Group();
    this.chunkRoot.name = `Chunk_${worldX}_${worldZ}`;
    this.chunkRoot.position.set(this.worldX * CHUNK_SIZE, this.worldY, this.worldZ * CHUNK_SIZE);
  }

  getBlock(localX: number, localY: number, localZ: number): string | null {
    if (localX < 0 || localX >= CHUNK_SIZE ||
        localY < 0 || localY >= this.world.layers ||
        localZ < 0 || localZ >= CHUNK_SIZE) {
      return null; // Out of bounds for this chunk
    }
    return this.blocks[localX][localY][localZ];
  }

  setBlock(localX: number, localY: number, localZ: number, blockType: string): void {
    if (localX < 0 || localX >= CHUNK_SIZE ||
        localY < 0 || localY >= this.world.layers ||
        localZ < 0 || localZ >= CHUNK_SIZE) {
      console.warn(`Attempted to set block out of chunk bounds: ${localX},${localY},${localZ} in chunk ${this.worldX},${this.worldZ}`);
      return;
    }
    if (this.blocks[localX][localY][localZ] !== blockType) {
      this.blocks[localX][localY][localZ] = blockType;
      this.needsMeshUpdate = true;

      if (localX === 0) this.world.queueChunkRemesh(this.worldX - 1, this.worldZ);
      if (localX === CHUNK_SIZE - 1) this.world.queueChunkRemesh(this.worldX + 1, this.worldZ);
      if (localZ === 0) this.world.queueChunkRemesh(this.worldX, this.worldZ - 1);
      if (localZ === CHUNK_SIZE - 1) this.world.queueChunkRemesh(this.worldX, this.worldZ + 1);
    }
  }

  public generateTerrainData(): void {
    const grassBlockName = 'grassBlock';
    const dirtBlockName = 'dirtBlock';
    const stoneBlockName = 'stoneBlock';

    const baseHeight = Math.floor(this.world.layers / 3) + 1; 
    const amplitude = 2; 
    const frequency = 0.15; 

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const absoluteWorldX = this.worldX * CHUNK_SIZE + x;
        const absoluteWorldZ = this.worldZ * CHUNK_SIZE + z;

        let surfaceY = baseHeight + Math.floor(
          amplitude * (Math.sin(absoluteWorldX * frequency) + Math.cos(absoluteWorldZ * frequency * 0.8))
        );
        surfaceY = Math.max(0, Math.min(this.world.layers - 1, surfaceY));

        for (let y = 0; y < this.world.layers; y++) {
          if (y < surfaceY) {
            this.blocks[x][y][z] = (surfaceY - y < 3 && y < surfaceY) ? dirtBlockName : stoneBlockName;
          } else if (y === surfaceY) {
            this.blocks[x][y][z] = grassBlockName;
          } else {
            this.blocks[x][y][z] = 'air';
          }
        }
      }
    }
    this.needsMeshUpdate = true;
  }

  public buildMesh(): void {
    while (this.chunkRoot.children.length > 0) {
      const child = this.chunkRoot.children[0];
      this.chunkRoot.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    }

    const faceGeometry = new THREE.PlaneGeometry(1, 1);

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let y = 0; y < this.world.layers; y++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
          const blockType = this.blocks[x][y][z];
          if (blockType === 'air') continue;

          const blockProto = this.blockPrototypes.get(blockType);
          if (!blockProto) {
            console.warn(`No prototype found for block type: ${blockType}`);
            continue;
          }

          // World coordinates of the current block's origin (min corner)
          const blockWorldX = this.worldX * CHUNK_SIZE + x;
          const blockWorldY = this.worldY + y;
          const blockWorldZ = this.worldZ * CHUNK_SIZE + z;

          const neighbors = {
            top: this.world.getBlock(blockWorldX, blockWorldY + 1, blockWorldZ),
            bottom: this.world.getBlock(blockWorldX, blockWorldY - 1, blockWorldZ),
            front: this.world.getBlock(blockWorldX, blockWorldY, blockWorldZ + 1), 
            back: this.world.getBlock(blockWorldX, blockWorldY, blockWorldZ - 1),  
            right: this.world.getBlock(blockWorldX + 1, blockWorldY, blockWorldZ), 
            left: this.world.getBlock(blockWorldX - 1, blockWorldY, blockWorldZ)   
          };
          
          const isNeighborSolid = (type: string | null) => type !== null && type !== 'air';

          // Top face (+Y)
          if (!isNeighborSolid(neighbors.top)) {
            const materialIndex = blockProto.multiTexture ? 2 : 0;
            const material = Array.isArray(blockProto.mesh.material) ? blockProto.mesh.material[materialIndex] : blockProto.mesh.material;
            const faceMesh = new THREE.Mesh(faceGeometry, material);
            faceMesh.position.set(x + 0.5, y + 1, z + 0.5); // Center of top face
            faceMesh.rotation.x = -Math.PI / 2;
            faceMesh.name = `BlockFace_Top_${blockWorldX}_${blockWorldY}_${blockWorldZ}`;
            this.chunkRoot.add(faceMesh);
          }

          // Bottom face (-Y)
          if (!isNeighborSolid(neighbors.bottom)) {
            const materialIndex = blockProto.multiTexture ? 3 : 0;
            const material = Array.isArray(blockProto.mesh.material) ? blockProto.mesh.material[materialIndex] : blockProto.mesh.material;
            const faceMesh = new THREE.Mesh(faceGeometry, material);
            faceMesh.position.set(x + 0.5, y, z + 0.5); // Center of bottom face
            faceMesh.rotation.x = Math.PI / 2;
            faceMesh.name = `BlockFace_Bottom_${blockWorldX}_${blockWorldY}_${blockWorldZ}`;
            this.chunkRoot.add(faceMesh);
          }

          // Front face (+Z)
          if (!isNeighborSolid(neighbors.front)) {
            const materialIndex = blockProto.multiTexture ? 4 : 0;
            const material = Array.isArray(blockProto.mesh.material) ? blockProto.mesh.material[materialIndex] : blockProto.mesh.material;
            const faceMesh = new THREE.Mesh(faceGeometry, material);
            faceMesh.position.set(x + 0.5, y + 0.5, z + 1); // Center of front face
            // No rotation needed for Z+ face if PlaneGeometry is in XY plane
            faceMesh.name = `BlockFace_Front_${blockWorldX}_${blockWorldY}_${blockWorldZ}`;
            this.chunkRoot.add(faceMesh);
          }

          // Back face (-Z)
          if (!isNeighborSolid(neighbors.back)) {
            const materialIndex = blockProto.multiTexture ? 5 : 0;
            const material = Array.isArray(blockProto.mesh.material) ? blockProto.mesh.material[materialIndex] : blockProto.mesh.material;
            const faceMesh = new THREE.Mesh(faceGeometry, material);
            faceMesh.position.set(x + 0.5, y + 0.5, z); // Center of back face
            faceMesh.rotation.y = Math.PI; 
            faceMesh.name = `BlockFace_Back_${blockWorldX}_${blockWorldY}_${blockWorldZ}`;
            this.chunkRoot.add(faceMesh);
          }

          // Right face (+X)
          if (!isNeighborSolid(neighbors.right)) {
            const materialIndex = blockProto.multiTexture ? 0 : 0;
            const material = Array.isArray(blockProto.mesh.material) ? blockProto.mesh.material[materialIndex] : blockProto.mesh.material;
            const faceMesh = new THREE.Mesh(faceGeometry, material);
            faceMesh.position.set(x + 1, y + 0.5, z + 0.5); // Center of right face
            faceMesh.rotation.y = Math.PI / 2;
            faceMesh.name = `BlockFace_Right_${blockWorldX}_${blockWorldY}_${blockWorldZ}`;
            this.chunkRoot.add(faceMesh);
          }
          
          // Left face (-X)
          if (!isNeighborSolid(neighbors.left)) {
            const materialIndex = blockProto.multiTexture ? 1 : 0;
            const material = Array.isArray(blockProto.mesh.material) ? blockProto.mesh.material[materialIndex] : blockProto.mesh.material;
            const faceMesh = new THREE.Mesh(faceGeometry, material);
            faceMesh.position.set(x, y + 0.5, z + 0.5); // Center of left face
            faceMesh.rotation.y = -Math.PI / 2;
            faceMesh.name = `BlockFace_Left_${blockWorldX}_${blockWorldY}_${blockWorldZ}`;
            this.chunkRoot.add(faceMesh);
          }
        }
      }
    }
    this.needsMeshUpdate = false;
  }

  dispose(): void {
    while (this.chunkRoot.children.length > 0) {
      const child = this.chunkRoot.children[0];
      this.chunkRoot.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else if (child.material) {
          child.material.dispose();
        }
      }
    }
  }
}
