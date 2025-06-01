
import * as THREE from 'three';
import type { World } from './World';
import type { Block } from './Block';
import { CHUNK_SIZE } from './utils';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export class Chunk {
  public worldX: number;
  public worldZ: number;
  public worldY: number = 0; // Base Y position of the chunk in world coordinates
  public blocks: string[][][]; // [x][y][z] local coordinates
  public chunkRoot: THREE.Group;
  private world: World;
  public needsMeshUpdate: boolean = false;
  private blockPrototypes: Map<string, Block>;

  constructor(world: World, worldX: number, worldZ: number, blockPrototypes: Map<string, Block>, initialBlockData?: string[][][]) {
    this.world = world;
    this.worldX = worldX; // Chunk's X index in the world grid
    this.worldZ = worldZ; // Chunk's Z index in the world grid
    this.blockPrototypes = blockPrototypes;

    this.chunkRoot = new THREE.Group();
    this.chunkRoot.name = `ChunkRoot_${worldX}_${worldZ}`;
    this.chunkRoot.position.set(this.worldX * CHUNK_SIZE, this.worldY, this.worldZ * CHUNK_SIZE);

    if (initialBlockData) {
      this.blocks = initialBlockData;
      this.needsMeshUpdate = true; // Mesh needs to be built from this data
    } else {
      // Initialize blocks array
      this.blocks = [];
      for (let x = 0; x < CHUNK_SIZE; x++) {
        this.blocks[x] = [];
        for (let y = 0; y < this.world.layers; y++) {
          this.blocks[x][y] = [];
          for (let z = 0; z < CHUNK_SIZE; z++) {
            this.blocks[x][y][z] = 'air'; // Default to air
          }
        }
      }
      this.generateTerrainData(); // Generate terrain if no initial data
    }
  }

  // Get block type at local chunk coordinates
  getBlock(localX: number, localY: number, localZ: number): string | null {
    if (localX < 0 || localX >= CHUNK_SIZE ||
        localY < 0 || localY >= this.world.layers ||
        localZ < 0 || localZ >= CHUNK_SIZE) {
      return null; // Out of bounds
    }
    return this.blocks[localX][localY][localZ];
  }

  // Set block type at local chunk coordinates
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

      // Notify the world and queue this chunk and potentially neighbors for remesh
      this.world.notifyChunkUpdate(this.worldX, this.worldZ, this.blocks);
      this.world.queueChunkRemesh(this.worldX, this.worldZ); 

      // If the block is on a chunk border, queue the adjacent chunk for remesh
      if (localX === 0) this.world.queueChunkRemesh(this.worldX - 1, this.worldZ);
      if (localX === CHUNK_SIZE - 1) this.world.queueChunkRemesh(this.worldX + 1, this.worldZ);
      if (localZ === 0) this.world.queueChunkRemesh(this.worldX, this.worldZ - 1);
      if (localZ === CHUNK_SIZE - 1) this.world.queueChunkRemesh(this.worldX, this.worldZ + 1);
    }
  }

  private lerp(a: number, b: number, t: number): number {
    return a * (1 - t) + b * t;
  }

  // Generates the initial terrain data for this chunk
  public generateTerrainData(): void {
    const grassBlockName = 'grassBlock';
    const dirtBlockName = 'dirtBlock';
    const stoneBlockName = 'stoneBlock';
    const sandBlockName = 'sandBlock';
    const waterBlockName = 'waterBlock'; 

    const baseHeight = Math.floor(this.world.layers / 2.5);
    const waterLevel = baseHeight - 1; 

    // Mountain Parameters
    const mountainMainFreq = 0.05;
    const mountainMainAmp = 15;
    const mountainDetailFreq = 0.15;
    const mountainDetailAmp = 5;
    const mountainRoughnessFreq = 0.3;
    const mountainRoughnessAmp = 1.5;
    const mountainBasinFreq = 0.04;
    const mountainBasinAmp = 20;
    const mountainBasinThreshold = 0.3;

    // Plains Parameters
    const plainsMainFreq = 0.04; 
    const plainsMainAmp = 3; 
    const plainsDetailFreq = 0.1; 
    const plainsDetailAmp = 1; 
    const plainsRoughnessFreq = 0.25; 
    const plainsRoughnessAmp = 0.2; 
    const plainsBasinFreq = 0.05; 
    const plainsBasinAmp = 3; 
    const plainsBasinThreshold = 0.65; 

    const biomeScale = 0.008; 
    const biomeBlendStart = -0.1; 
    const biomeBlendEnd = 0.2;  

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const absoluteWorldX = this.worldX * CHUNK_SIZE + x;
        const absoluteWorldZ = this.worldZ * CHUNK_SIZE + z;

        const biomeNoiseVal = (Math.sin(absoluteWorldX * biomeScale) * Math.cos(absoluteWorldZ * biomeScale * 0.77) +
                               Math.cos(absoluteWorldX * biomeScale * 1.23) * Math.sin(absoluteWorldZ * biomeScale * 0.89)) / 2;

        let blendFactor = (biomeNoiseVal - biomeBlendStart) / (biomeBlendEnd - biomeBlendStart);
        blendFactor = Math.max(0, Math.min(1, blendFactor)); 

        const currentMainAmp = this.lerp(plainsMainAmp, mountainMainAmp, blendFactor);
        const currentDetailAmp = this.lerp(plainsDetailAmp, mountainDetailAmp, blendFactor);
        const currentRoughnessAmp = this.lerp(plainsRoughnessAmp, mountainRoughnessAmp, blendFactor);
        const currentBasinAmp = this.lerp(plainsBasinAmp, mountainBasinAmp, blendFactor);
        const currentBasinThreshold = this.lerp(plainsBasinThreshold, mountainBasinThreshold, blendFactor);
        
        const currentMainFreq = this.lerp(plainsMainFreq, mountainMainFreq, blendFactor); 
        const currentDetailFreq = this.lerp(plainsDetailFreq, mountainDetailFreq, blendFactor);
        const currentRoughnessFreq = this.lerp(plainsRoughnessFreq, mountainRoughnessFreq, blendFactor);
        const currentBasinFreq = this.lerp(plainsBasinFreq, mountainBasinFreq, blendFactor);

        let height = baseHeight;
        height += currentMainAmp * (Math.sin(absoluteWorldX * currentMainFreq) * Math.cos(absoluteWorldZ * currentMainFreq * 0.8));
        height += currentDetailAmp * Math.cos(absoluteWorldX * currentDetailFreq + absoluteWorldZ * currentDetailFreq * 1.2);
        height += currentRoughnessAmp * (Math.sin(absoluteWorldX * currentRoughnessFreq * 1.1 - absoluteWorldZ * currentRoughnessFreq * 0.9));

        if (currentBasinAmp > 0) {
            const basinNoiseField = (Math.sin(absoluteWorldX * currentBasinFreq + 0.3) + Math.cos(absoluteWorldZ * currentBasinFreq - 0.2)) / 2;
            const normalizedBasinField = Math.pow(Math.abs(basinNoiseField), 2);

            if (normalizedBasinField < currentBasinThreshold) {
              const depressionStrength = (currentBasinThreshold - normalizedBasinField) / currentBasinThreshold;
              height -= depressionStrength * currentBasinAmp;
            }
        }

        let surfaceY = Math.floor(height);
        surfaceY = Math.max(1, Math.min(this.world.layers - 2, surfaceY));

        for (let y = 0; y < this.world.layers; y++) {
          if (y < surfaceY - 3) {
            this.blocks[x][y][z] = stoneBlockName;
          } else if (y < surfaceY) {
            if (surfaceY < waterLevel && y >= surfaceY -1 && y < waterLevel) { 
                 this.blocks[x][y][z] = sandBlockName;
            } else {
                 this.blocks[x][y][z] = dirtBlockName;
            }
          } else if (y === surfaceY) {
            if (surfaceY < waterLevel -1) { 
                this.blocks[x][y][z] = sandBlockName; 
            } else { 
                this.blocks[x][y][z] = grassBlockName;
            }
          } else if (y > surfaceY && y <= waterLevel) { 
             this.blocks[x][y][z] = waterBlockName; 
          }
          else {
            this.blocks[x][y][z] = 'air';
          }
        }
      }
    }
    this.needsMeshUpdate = true; // Mark for mesh generation
  }

  // Builds or rebuilds the visual mesh for this chunk
  public buildMesh(): void {
    // Clear existing meshes
    while (this.chunkRoot.children.length > 0) {
      const child = this.chunkRoot.children[0];
      this.chunkRoot.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => {
            m.map?.dispose();
            m.dispose();
          });
        } else if (child.material) {
          (child.material as THREE.Material).map?.dispose();
          (child.material as THREE.Material).dispose();
        }
      }
    }

    // Group geometries by material for merging
    const geometriesByMaterial = new Map<string, { material: THREE.Material, geometries: THREE.BufferGeometry[] }>();

    // Determine if a face should be rendered (not obscured by an opaque neighbor)
    const shouldRenderFace = (currentBlockType: string, neighborBlockType: string | null): boolean => {
      if (neighborBlockType === null) return true; // Edge of loaded world

      if (currentBlockType === 'waterBlock') {
          return neighborBlockType === 'air'; // Water only shows faces next to air
      }
      // Opaque blocks show faces next to air or water
      return neighborBlockType === 'air' || neighborBlockType === 'waterBlock';
    };


    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let y = 0; y < this.world.layers; y++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
          const blockType = this.blocks[x][y][z];
          if (blockType === 'air') continue;

          const blockProto = this.blockPrototypes.get(blockType);
          if (!blockProto) {
            console.warn(`No prototype found for block type: ${blockType} at ${this.worldX*CHUNK_SIZE+x},${y},${this.worldZ*CHUNK_SIZE+z}`);
            continue;
          }

          // Get world coordinates for neighbor checks
          const blockWorldX = this.worldX * CHUNK_SIZE + x;
          const blockWorldY = this.worldY + y;
          const blockWorldZ = this.worldZ * CHUNK_SIZE + z;

          const neighbors = {
            top: this.world.getBlock(blockWorldX, blockWorldY + 1, blockWorldZ),
            bottom: this.world.getBlock(blockWorldX, blockWorldY - 1, blockWorldZ),
            front: this.world.getBlock(blockWorldX, blockWorldY, blockWorldZ + 1), // +Z
            back: this.world.getBlock(blockWorldX, blockWorldY, blockWorldZ - 1),  // -Z
            right: this.world.getBlock(blockWorldX + 1, blockWorldY, blockWorldZ), // +X
            left: this.world.getBlock(blockWorldX - 1, blockWorldY, blockWorldZ)   // -X
          };

          // Helper to add a face geometry
          const addFace = (material: THREE.Material, faceRotation: [number, number, number], faceTranslation: [number, number, number]) => {
            const faceGeometry = new THREE.PlaneGeometry(1, 1);
            faceGeometry.rotateX(faceRotation[0]);
            faceGeometry.rotateY(faceRotation[1]);
            faceGeometry.rotateZ(faceRotation[2]);
            // Translate to local chunk position (origin is corner, center for geometry)
            faceGeometry.translate(x + 0.5 + faceTranslation[0] - 0.5, y + 0.5 + faceTranslation[1] -0.5, z + 0.5 + faceTranslation[2] -0.5);

            const materialKey = material.uuid; // Use material UUID as key for grouping
            if (!geometriesByMaterial.has(materialKey)) {
              geometriesByMaterial.set(materialKey, { material: material, geometries: [] });
            }
            geometriesByMaterial.get(materialKey)!.geometries.push(faceGeometry);
          };

          // Check each face
          if (shouldRenderFace(blockType, neighbors.right)) { // +X face
            const materialIndex = blockProto.multiTexture ? 0 : 0; // Right face material index
            const material = Array.isArray(blockProto.mesh.material) ? blockProto.mesh.material[materialIndex] : blockProto.mesh.material;
            addFace(material, [0, Math.PI / 2, 0], [1, 0.5, 0.5]);
          }
          if (shouldRenderFace(blockType, neighbors.left)) { // -X face
            const materialIndex = blockProto.multiTexture ? 1 : 0; // Left face material index
            const material = Array.isArray(blockProto.mesh.material) ? blockProto.mesh.material[materialIndex] : blockProto.mesh.material;
            addFace(material, [0, -Math.PI / 2, 0], [0, 0.5, 0.5]);
          }
          if (shouldRenderFace(blockType, neighbors.top)) { // +Y face
            const materialIndex = blockProto.multiTexture ? 2 : 0; // Top face material index
            const material = Array.isArray(blockProto.mesh.material) ? blockProto.mesh.material[materialIndex] : blockProto.mesh.material;
            addFace(material, [-Math.PI / 2, 0, 0], [0.5, 1, 0.5]);
          }
          if (shouldRenderFace(blockType, neighbors.bottom)) { // -Y face
            const materialIndex = blockProto.multiTexture ? 3 : 0; // Bottom face material index
            const material = Array.isArray(blockProto.mesh.material) ? blockProto.mesh.material[materialIndex] : blockProto.mesh.material;
            addFace(material, [Math.PI / 2, 0, 0], [0.5, 0, 0.5]);
          }
          if (shouldRenderFace(blockType, neighbors.front)) { // +Z face
            const materialIndex = blockProto.multiTexture ? 4 : 0; // Front face material index
            const material = Array.isArray(blockProto.mesh.material) ? blockProto.mesh.material[materialIndex] : blockProto.mesh.material;
            addFace(material, [0, 0, 0], [0.5, 0.5, 1]);
          }
          if (shouldRenderFace(blockType, neighbors.back)) { // -Z face
            const materialIndex = blockProto.multiTexture ? 5 : 0; // Back face material index
            const material = Array.isArray(blockProto.mesh.material) ? blockProto.mesh.material[materialIndex] : blockProto.mesh.material;
            addFace(material, [0, Math.PI, 0], [0.5, 0.5, 0]);
          }
        }
      }
    }

    // Merge geometries and create meshes
    geometriesByMaterial.forEach((data) => {
      if (data.geometries.length > 0) {
        const mergedGeometry = BufferGeometryUtils.mergeGeometries(data.geometries, false);
        if (mergedGeometry) {
          const chunkMesh = new THREE.Mesh(mergedGeometry, data.material);
          chunkMesh.name = `MergedChunkMesh_${this.worldX}_${this.worldZ}_${(data.material as any)?.map?.source?.src?.split('/').pop() || data.material.uuid.substring(0,6)}`;
          chunkMesh.castShadow = data.material !== this.blockPrototypes.get('waterBlock')?.mesh.material; // Water doesn't cast shadows
          chunkMesh.receiveShadow = true;
          this.chunkRoot.add(chunkMesh);
        }
        // Dispose individual face geometries after merging
        data.geometries.forEach(g => g.dispose());
      }
    });
    // Sort children to render transparent objects last (like water)
    this.chunkRoot.children.sort((a, b) => { 
        const matAIsTransparent = (a as THREE.Mesh).material && ((a as THREE.Mesh).material as THREE.Material).transparent;
        const matBIsTransparent = (b as THREE.Mesh).material && ((b as THREE.Mesh).material as THREE.Material).transparent;
        if (matAIsTransparent && !matBIsTransparent) return 1; // A is transparent, B is not -> A after B
        if (!matAIsTransparent && matBIsTransparent) return -1; // A is not, B is -> A before B
        return 0; // Same transparency or both opaque
    });


    this.needsMeshUpdate = false;
  }

  // Dispose of chunk resources
  dispose(): void {
    while (this.chunkRoot.children.length > 0) {
      const child = this.chunkRoot.children[0];
      this.chunkRoot.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => {
            m.map?.dispose();
            m.dispose();
          });
        } else if (child.material) {
          (child.material as THREE.Material).map?.dispose();
          (child.material as THREE.Material).dispose();
        }
      }
    }
    // Blocks data (this.blocks) is preserved in chunkDataStore by World.ts
  }
}

    