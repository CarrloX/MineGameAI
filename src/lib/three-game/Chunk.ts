
import * as THREE from 'three';
import type { World } from './World';
import type { Block } from './Block';
import { CHUNK_SIZE } from './utils';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export class Chunk {
  public worldX: number;
  public worldZ: number;
  public worldY: number = 0;
  public blocks: string[][][];
  public chunkRoot: THREE.Group;
  private world: World;
  public needsMeshUpdate: boolean = false;
  private blockPrototypes: Map<string, Block>;

  constructor(world: World, worldX: number, worldZ: number, blockPrototypes: Map<string, Block>, initialBlockData?: string[][][]) {
    this.world = world;
    this.worldX = worldX;
    this.worldZ = worldZ;
    this.blockPrototypes = blockPrototypes;

    this.chunkRoot = new THREE.Group();
    this.chunkRoot.name = `ChunkRoot_${worldX}_${worldZ}`;
    this.chunkRoot.position.set(this.worldX * CHUNK_SIZE, this.worldY, this.worldZ * CHUNK_SIZE);

    if (initialBlockData) {
      this.blocks = initialBlockData;
      this.needsMeshUpdate = true; // Assume it needs remeshing if loaded from data
    } else {
      this.blocks = [];
      for (let x = 0; x < CHUNK_SIZE; x++) {
        this.blocks[x] = [];
        for (let y = 0; y < this.world.layers; y++) {
          this.blocks[x][y] = [];
          for (let z = 0; z < CHUNK_SIZE; z++) {
            this.blocks[x][y][z] = 'air';
          }
        }
      }
      this.generateTerrainData(); // This will set needsMeshUpdate to true
    }
  }

  getBlock(localX: number, localY: number, localZ: number): string | null {
    if (localX < 0 || localX >= CHUNK_SIZE ||
        localY < 0 || localY >= this.world.layers ||
        localZ < 0 || localZ >= CHUNK_SIZE) {
      return null;
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

      // Notify world so it can update its central store if needed, and queue neighbor remeshes
      this.world.notifyChunkUpdate(this.worldX, this.worldZ, this.blocks);


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
        surfaceY = Math.max(1, Math.min(this.world.layers - 1, surfaceY)); // Ensure at least 1 block of depth

        for (let y = 0; y < this.world.layers; y++) {
          if (y < surfaceY - 2) { // Deeper blocks are stone
            this.blocks[x][y][z] = stoneBlockName;
          } else if (y < surfaceY) { // Blocks just below surface are dirt
            this.blocks[x][y][z] = dirtBlockName;
          } else if (y === surfaceY) { // Surface block is grass
            this.blocks[x][y][z] = grassBlockName;
          } else { // Above surface is air
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

    const geometriesByMaterial = new Map<string, { material: THREE.Material, geometries: THREE.BufferGeometry[] }>();

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let y = 0; y < this.world.layers; y++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
          const blockType = this.blocks[x][y][z];
          if (blockType === 'air') continue;

          const blockProto = this.blockPrototypes.get(blockType);
          if (!blockProto) continue;

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
          
          const addFace = (material: THREE.Material, faceRotation: [number, number, number], faceTranslation: [number, number, number]) => {
            const faceGeometry = new THREE.PlaneGeometry(1, 1);
            faceGeometry.rotateX(faceRotation[0]);
            faceGeometry.rotateY(faceRotation[1]);
            faceGeometry.rotateZ(faceRotation[2]);
            faceGeometry.translate(x + 0.5 + faceTranslation[0] - 0.5, y + 0.5 + faceTranslation[1] -0.5, z + 0.5 + faceTranslation[2] -0.5);
            
            const materialKey = material.uuid; // Use material UUID as key
            if (!geometriesByMaterial.has(materialKey)) {
              geometriesByMaterial.set(materialKey, { material: material, geometries: [] });
            }
            geometriesByMaterial.get(materialKey)!.geometries.push(faceGeometry);
          };
          
          // Right face (+X)
          if (!isNeighborSolid(neighbors.right)) {
            const materialIndex = blockProto.multiTexture ? 0 : 0;
            const material = Array.isArray(blockProto.mesh.material) ? blockProto.mesh.material[materialIndex] : blockProto.mesh.material;
            addFace(material, [0, Math.PI / 2, 0], [1, 0.5, 0.5]);
          }
          // Left face (-X)
          if (!isNeighborSolid(neighbors.left)) {
            const materialIndex = blockProto.multiTexture ? 1 : 0;
            const material = Array.isArray(blockProto.mesh.material) ? blockProto.mesh.material[materialIndex] : blockProto.mesh.material;
            addFace(material, [0, -Math.PI / 2, 0], [0, 0.5, 0.5]);
          }
          // Top face (+Y)
          if (!isNeighborSolid(neighbors.top)) {
            const materialIndex = blockProto.multiTexture ? 2 : 0;
            const material = Array.isArray(blockProto.mesh.material) ? blockProto.mesh.material[materialIndex] : blockProto.mesh.material;
            addFace(material, [-Math.PI / 2, 0, 0], [0.5, 1, 0.5]);
          }
          // Bottom face (-Y)
          if (!isNeighborSolid(neighbors.bottom)) {
            const materialIndex = blockProto.multiTexture ? 3 : 0;
            const material = Array.isArray(blockProto.mesh.material) ? blockProto.mesh.material[materialIndex] : blockProto.mesh.material;
            addFace(material, [Math.PI / 2, 0, 0], [0.5, 0, 0.5]);
          }
          // Front face (+Z)
          if (!isNeighborSolid(neighbors.front)) {
            const materialIndex = blockProto.multiTexture ? 4 : 0;
            const material = Array.isArray(blockProto.mesh.material) ? blockProto.mesh.material[materialIndex] : blockProto.mesh.material;
            addFace(material, [0, 0, 0], [0.5, 0.5, 1]);
          }
          // Back face (-Z)
          if (!isNeighborSolid(neighbors.back)) {
            const materialIndex = blockProto.multiTexture ? 5 : 0;
            const material = Array.isArray(blockProto.mesh.material) ? blockProto.mesh.material[materialIndex] : blockProto.mesh.material;
            addFace(material, [0, Math.PI, 0], [0.5, 0.5, 0]);
          }
        }
      }
    }

    geometriesByMaterial.forEach((data) => {
      if (data.geometries.length > 0) {
        const mergedGeometry = BufferGeometryUtils.mergeGeometries(data.geometries, false);
        if (mergedGeometry) {
          const chunkMesh = new THREE.Mesh(mergedGeometry, data.material);
          chunkMesh.name = `MergedChunkMesh_${this.worldX}_${this.worldZ}_${data.material.uuid.substring(0,6)}`;
          chunkMesh.castShadow = true;
          chunkMesh.receiveShadow = true;
          this.chunkRoot.add(chunkMesh);
        }
        data.geometries.forEach(g => g.dispose());
      }
    });

    this.needsMeshUpdate = false;
  }

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
  }
}
