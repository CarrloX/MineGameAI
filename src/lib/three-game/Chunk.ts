
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

      // If the change is on a boundary, the neighbor might need remeshing too
      if (localX === 0) this.world.queueChunkRemesh(this.worldX - 1, this.worldZ);
      if (localX === CHUNK_SIZE - 1) this.world.queueChunkRemesh(this.worldX + 1, this.worldZ);
      if (localZ === 0) this.world.queueChunkRemesh(this.worldX, this.worldZ - 1);
      if (localZ === CHUNK_SIZE - 1) this.world.queueChunkRemesh(this.worldX, this.worldZ + 1);
      // Note: Vertical neighbors (chunks above/below) are not handled as we only have one layer of chunks vertically.
    }
  }

  public generateTerrainData(): void {
    const grassBlockName = 'grassBlock';
    const dirtBlockName = 'dirtBlock';
    const stoneBlockName = 'stoneBlock';

    const baseHeight = Math.floor(this.world.layers / 3) + 1; // Ground level around 1/3 of chunk height, ensure at least 1
    const amplitude = 2; // How much the terrain varies
    const frequency = 0.15; // How "wavy" the terrain is

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        // Calculate absolute world coordinates for the noise function input
        // This helps in creating seamless terrain if/when we use Perlin noise
        const absoluteWorldX = this.worldX * CHUNK_SIZE + x;
        const absoluteWorldZ = this.worldZ * CHUNK_SIZE + z;

        // Simple sine wave for height variation
        let surfaceY = baseHeight + Math.floor(
          amplitude * (Math.sin(absoluteWorldX * frequency) + Math.cos(absoluteWorldZ * frequency * 0.8)) // Slightly different frequencies for more variation
        );
        // Clamp height to be within the chunk's vertical layers (0 to world.layers - 1)
        // Ensure surfaceY is at least 0 so there's always a ground.
        surfaceY = Math.max(0, Math.min(this.world.layers - 1, surfaceY));

        for (let y = 0; y < this.world.layers; y++) {
          if (y < surfaceY) {
            // Stone for lower layers, dirt closer to the surface
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
    // Clear existing mesh children
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

          const worldX = this.worldX * CHUNK_SIZE + x;
          const worldBlockY = this.worldY + y; // Block's Y position in world space
          const worldZ = this.worldZ * CHUNK_SIZE + z;

          // Check neighbors (N, S, E, W, Top, Bottom)
          const neighbors = {
            top: this.world.getBlock(worldX, worldBlockY + 1, worldZ),
            bottom: this.world.getBlock(worldX, worldBlockY - 1, worldZ),
            front: this.world.getBlock(worldX, worldBlockY, worldZ + 1), // Positive Z
            back: this.world.getBlock(worldX, worldBlockY, worldZ - 1),  // Negative Z
            right: this.world.getBlock(worldX + 1, worldBlockY, worldZ), // Positive X
            left: this.world.getBlock(worldX - 1, worldBlockY, worldZ)   // Negative X
          };
          
          const isNeighborSolid = (type: string | null) => type !== null && type !== 'air';

          // Top face (Positive Y)
          if (!isNeighborSolid(neighbors.top)) {
            const materialIndex = blockProto.multiTexture ? 2 : 0; // Assuming top texture is at index 2 for multi-texture blocks
            const material = Array.isArray(blockProto.mesh.material) ? blockProto.mesh.material[materialIndex] : blockProto.mesh.material;
            const faceMesh = new THREE.Mesh(faceGeometry, material);
            faceMesh.position.set(x + 0.5, y + 0.5, z + 0.5); // Position relative to chunkRoot origin
            faceMesh.rotation.x = -Math.PI / 2; // Pointing up
            faceMesh.name = `BlockFace_Top_${worldX}_${worldBlockY}_${worldZ}`;
            this.chunkRoot.add(faceMesh);
          }

          // Bottom face (Negative Y)
          if (!isNeighborSolid(neighbors.bottom)) {
            const materialIndex = blockProto.multiTexture ? 3 : 0; // Assuming bottom texture is at index 3
            const material = Array.isArray(blockProto.mesh.material) ? blockProto.mesh.material[materialIndex] : blockProto.mesh.material;
            const faceMesh = new THREE.Mesh(faceGeometry, material);
            faceMesh.position.set(x + 0.5, y - 0.5, z + 0.5);
            faceMesh.rotation.x = Math.PI / 2; // Pointing down
            faceMesh.name = `BlockFace_Bottom_${worldX}_${worldBlockY}_${worldZ}`;
            this.chunkRoot.add(faceMesh);
          }

          // Front face (Positive Z)
          if (!isNeighborSolid(neighbors.front)) {
            const materialIndex = blockProto.multiTexture ? 4 : 0; // Assuming front texture is at index 4
            const material = Array.isArray(blockProto.mesh.material) ? blockProto.mesh.material[materialIndex] : blockProto.mesh.material;
            const faceMesh = new THREE.Mesh(faceGeometry, material);
            faceMesh.position.set(x + 0.5, y, z + 0.5 + 0.5);
            // No rotation needed, default PlaneGeometry faces +Z
            faceMesh.name = `BlockFace_Front_${worldX}_${worldBlockY}_${worldZ}`;
            this.chunkRoot.add(faceMesh);
          }

          // Back face (Negative Z)
          if (!isNeighborSolid(neighbors.back)) {
            const materialIndex = blockProto.multiTexture ? 5 : 0; // Assuming back texture is at index 5
            const material = Array.isArray(blockProto.mesh.material) ? blockProto.mesh.material[materialIndex] : blockProto.mesh.material;
            const faceMesh = new THREE.Mesh(faceGeometry, material);
            faceMesh.position.set(x + 0.5, y, z - 0.5 + 0.5);
            faceMesh.rotation.y = Math.PI; // Rotate to face -Z
            faceMesh.name = `BlockFace_Back_${worldX}_${worldBlockY}_${worldZ}`;
            this.chunkRoot.add(faceMesh);
          }

          // Right face (Positive X)
          if (!isNeighborSolid(neighbors.right)) {
            const materialIndex = blockProto.multiTexture ? 0 : 0; // Assuming right texture is at index 0
            const material = Array.isArray(blockProto.mesh.material) ? blockProto.mesh.material[materialIndex] : blockProto.mesh.material;
            const faceMesh = new THREE.Mesh(faceGeometry, material);
            faceMesh.position.set(x + 0.5 + 0.5, y, z + 0.5);
            faceMesh.rotation.y = Math.PI / 2; // Rotate to face +X
            faceMesh.name = `BlockFace_Right_${worldX}_${worldBlockY}_${worldZ}`;
            this.chunkRoot.add(faceMesh);
          }
          
          // Left face (Negative X)
          if (!isNeighborSolid(neighbors.left)) {
            const materialIndex = blockProto.multiTexture ? 1 : 0; // Assuming left texture is at index 1
            const material = Array.isArray(blockProto.mesh.material) ? blockProto.mesh.material[materialIndex] : blockProto.mesh.material;
            const faceMesh = new THREE.Mesh(faceGeometry, material);
            faceMesh.position.set(x - 0.5 + 0.5, y, z + 0.5);
            faceMesh.rotation.y = -Math.PI / 2; // Rotate to face -X
            faceMesh.name = `BlockFace_Left_${worldX}_${worldBlockY}_${worldZ}`;
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
    // Potentially other disposals if chunk holds more complex THREE objects
  }
}
