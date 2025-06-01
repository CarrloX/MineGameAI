
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
  private worldSeed: number;
  public wasGenerated: boolean = false;

  constructor(world: World, worldX: number, worldZ: number, blockPrototypes: Map<string, Block>, initialBlockData?: string[][][], worldSeed?: number) {
    this.world = world;
    this.worldX = worldX;
    this.worldZ = worldZ;
    this.blockPrototypes = blockPrototypes;
    this.worldSeed = worldSeed !== undefined ? worldSeed : Math.floor(Math.random() * Number.MAX_SAFE_INTEGER); 

    this.chunkRoot = new THREE.Group();
    this.chunkRoot.name = `ChunkRoot_${worldX}_${worldZ}`;
    this.chunkRoot.position.set(this.worldX * CHUNK_SIZE, this.worldY, this.worldZ * CHUNK_SIZE);

    if (initialBlockData) {
      this.blocks = initialBlockData;
      this.needsMeshUpdate = true;
      this.wasGenerated = false; 
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
      this.generateTerrainData();
      this.wasGenerated = true;
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
      this.world.notifyChunkUpdate(this.worldX, this.worldZ, this.blocks);
      this.world.queueChunkRemesh(this.worldX, this.worldZ);

      if (localX === 0) this.world.queueChunkRemesh(this.worldX - 1, this.worldZ);
      if (localX === CHUNK_SIZE - 1) this.world.queueChunkRemesh(this.worldX + 1, this.worldZ);
      if (localZ === 0) this.world.queueChunkRemesh(this.worldX, this.worldZ - 1);
      if (localZ === CHUNK_SIZE - 1) this.world.queueChunkRemesh(this.worldX, this.worldZ + 1);
    }
  }

  private lerp(a: number, b: number, t: number): number {
    return a * (1 - t) + b * t;
  }

  private seededRandom(vX: number, vY: number, vZ: number, seed: number, feature: string): number {
    let val = (vX * 381923 + vY * 271931 + vZ * 101393 + seed) & 0x7fffffff;
    let featureHash = 0;
    for (let i = 0; i < feature.length; i++) {
        featureHash = (featureHash << 5) - featureHash + feature.charCodeAt(i);
        featureHash |= 0; 
    }
    val = (val + featureHash) & 0x7fffffff;
    val = (val ^ (val >> 15)) * 1664525;
    val = (val ^ (val >> 13)) * 1013904223;
    val = (val ^ (val >> 16));
    return (val & 0x7fffffff) / 0x7fffffff;
  }


  public generateTerrainData(): void {
    const grassBlockName = 'grassBlock';
    const dirtBlockName = 'dirtBlock';
    const stoneBlockName = 'stoneBlock';
    const sandBlockName = 'sandBlock';
    const waterBlockName = 'waterBlock';

    const baseHeight = Math.floor(this.world.layers / 2.5);
    const waterLevel = baseHeight - 1;
    
    // Parameters influenced by world seed for global world 'style'
    // For these, vX, vY, vZ to seededRandom should be constant (e.g., 0,0,0)
    // so these parameters are the same across the entire world for a given seed.
    const mountainMainFreq = 0.05 + this.seededRandom(0,0,0, this.worldSeed, "mtMainFreq") * 0.01 - 0.005;
    const mountainMainAmp = 15 + this.seededRandom(0,0,0, this.worldSeed, "mtMainAmp") * 5 - 2.5;
    const mountainDetailFreq = 0.15 + this.seededRandom(0,0,0, this.worldSeed, "mtDetailFreq") * 0.02 - 0.01;
    const mountainDetailAmp = 5 + this.seededRandom(0,0,0, this.worldSeed, "mtDetailAmp") * 2 - 1;
    const mountainRoughnessFreq = 0.3 + this.seededRandom(0,0,0, this.worldSeed, "mtRoughFreq") * 0.05 - 0.025;
    const mountainRoughnessAmp = 1.5 + this.seededRandom(0,0,0, this.worldSeed, "mtRoughAmp") * 1 - 0.5;
    const mountainBasinFreq = 0.04 + this.seededRandom(0,0,0, this.worldSeed, "mtBasinFreq") * 0.01 - 0.005;
    const mountainBasinAmp = 20 + this.seededRandom(0,0,0, this.worldSeed, "mtBasinAmp") * 5 - 2.5;
    const mountainBasinThreshold = 0.3 + this.seededRandom(0,0,0, this.worldSeed, "mtBasinThresh") * 0.1 - 0.05;

    const plainsMainFreq = 0.04 + this.seededRandom(0,0,0, this.worldSeed, "plMainFreq") * 0.01 - 0.005;
    const plainsMainAmp = 3 + this.seededRandom(0,0,0, this.worldSeed, "plMainAmp") * 1 - 0.5;
    const plainsDetailFreq = 0.1 + this.seededRandom(0,0,0, this.worldSeed, "plDetailFreq") * 0.02 - 0.01;
    const plainsDetailAmp = 1 + this.seededRandom(0,0,0, this.worldSeed, "plDetailAmp") * 0.5 - 0.25;
    const plainsRoughnessFreq = 0.25 + this.seededRandom(0,0,0, this.worldSeed, "plRoughFreq") * 0.05 - 0.025;
    const plainsRoughnessAmp = 0.2 + this.seededRandom(0,0,0, this.worldSeed, "plRoughAmp") * 0.1 - 0.05;
    const plainsBasinFreq = 0.05 + this.seededRandom(0,0,0, this.worldSeed, "plBasinFreq") * 0.01 - 0.005;
    const plainsBasinAmp = 3 + this.seededRandom(0,0,0, this.worldSeed, "plBasinAmp") * 1 - 0.5;
    const plainsBasinThreshold = 0.65 + this.seededRandom(0,0,0, this.worldSeed, "plBasinThresh") * 0.1 - 0.05;

    const biomeScale = 0.008 + this.seededRandom(0,0,0, this.worldSeed, "biomeScale") * 0.002 - 0.001;
    const biomeBlendStart = -0.1 + this.seededRandom(0,0,0, this.worldSeed, "biomeBlendStart") * 0.05 - 0.025;
    const biomeBlendEnd = 0.2 + this.seededRandom(0,0,0, this.worldSeed, "biomeBlendEnd") * 0.05 - 0.025;


    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const absoluteWorldX = this.worldX * CHUNK_SIZE + x;
        const absoluteWorldZ = this.worldZ * CHUNK_SIZE + z;

        const noiseInputX1 = absoluteWorldX;
        const noiseInputZ1 = absoluteWorldZ;
        const noiseInputX2 = absoluteWorldX + 10000.5; 
        const noiseInputZ2 = absoluteWorldZ - 10000.5;

        const biomeNoiseVal = (Math.sin(noiseInputX1 * biomeScale) * Math.cos(noiseInputZ1 * biomeScale * 0.77) +
                               Math.cos(noiseInputX2 * biomeScale * 1.23) * Math.sin(noiseInputZ2 * biomeScale * 0.89)) / 2;

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
        height += currentMainAmp * (Math.sin(noiseInputX1 * currentMainFreq) * Math.cos(noiseInputZ1 * currentMainFreq * 0.8));
        height += currentDetailAmp * Math.cos(noiseInputX2 * currentDetailFreq + noiseInputZ2 * currentDetailFreq * 1.2);
        height += currentRoughnessAmp * (Math.sin(noiseInputX1 * currentRoughnessFreq * 1.1 - noiseInputZ2 * currentRoughnessFreq * 0.9));

        if (currentBasinAmp > 0) {
            const basinNoiseField = (Math.sin(noiseInputX1 * currentBasinFreq + 0.3) + Math.cos(noiseInputZ1 * currentBasinFreq - 0.2)) / 2;
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
          } else if (y < surfaceY) { // Between stone and surface
            if (surfaceY <= waterLevel) { 
                 this.blocks[x][y][z] = sandBlockName;
            } else {
                 this.blocks[x][y][z] = dirtBlockName;
            }
          } else if (y === surfaceY) { // Surface block
            if (surfaceY < waterLevel ) { 
                this.blocks[x][y][z] = sandBlockName;
            } else if (surfaceY === waterLevel) { 
                this.blocks[x][y][z] = sandBlockName; 
            }
            else { 
                this.blocks[x][y][z] = grassBlockName;
            }
          } else if (y > surfaceY && y <= waterLevel) { // Above surface but at or below water level
             this.blocks[x][y][z] = waterBlockName;
          }
          else { // Above water level and above surface
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
    const shouldRenderFace = (currentBlockType: string, neighborBlockType: string | null): boolean => {
      if (neighborBlockType === null) return true; 
      if (currentBlockType === 'waterBlock') {
          return neighborBlockType === 'air'; 
      }
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
          
          const addFace = (material: THREE.Material, faceRotation: [number, number, number], faceTranslation: [number, number, number]) => {
            const faceGeometry = new THREE.PlaneGeometry(1, 1);
            faceGeometry.rotateX(faceRotation[0]);
            faceGeometry.rotateY(faceRotation[1]);
            faceGeometry.rotateZ(faceRotation[2]);
            // Translations are local to the chunk's coordinate system
            faceGeometry.translate(x + faceTranslation[0], y + faceTranslation[1], z + faceTranslation[2]);


            const materialKey = material.uuid + (material.transparent ? '_transparent' : '_opaque');
            if (!geometriesByMaterial.has(materialKey)) {
              geometriesByMaterial.set(materialKey, { material: material, geometries: [] });
            }
            geometriesByMaterial.get(materialKey)!.geometries.push(faceGeometry);
          };
          
          // Face translation values are offsets from the block's origin (min corner) to the center of the face
          if (shouldRenderFace(blockType, neighbors.right)) { 
            const materialIndex = blockProto.multiTexture ? 0 : 0; // Right is typically the first in a multi-texture array
            const material = Array.isArray(blockProto.mesh.material) ? blockProto.mesh.material[materialIndex] : blockProto.mesh.material;
            addFace(material, [0, Math.PI / 2, 0], [0.5, 0.5, 0.5]); // Translate to center, then one unit in X (local block space)
                                                                     // Corrected: This translation was over-complex.
                                                                     // Plane origin is center. For a +X face at x=1 (local), center is (1, 0.5, 0.5)
                                                                     // It should be: addFace(material, [0, Math.PI / 2, 0], [1, 0.5, 0.5]);
                                                                     // But since we are translating based on x,y,z, it's simpler to think of the face geometry's center.
                                                                     // A plane is 1x1, centered at 0,0. To place its center at local (x_block + 0.5, y_block + 0.5, z_block + 0.5)
                                                                     // and then adjust for face direction... this is tricky.
                                                                     // Let's stick to the PlaneGeometry origin being at its center.
                                                                     // Then for +X face, its center in local coords is (x + 1, y + 0.5, z + 0.5)
                                                                     // No, this is wrong. Plane at (0,0). Translate to (x,y,z).
                                                                     // For +X face: center is at (x + 0.5, y + 0.5, z + 0.5). Geometry needs to be at (x+1, y+0.5, z+0.5)
                                                                     // If we add 0.5 to x,y,z and then translate the plane
                                                                     // Let's re-evaluate:
                                                                     // The instance of the block is at (x,y,z) local chunk coords.
                                                                     // The +X face of this block spans from (x+1, y, z) to (x+1, y+1, z+1).
                                                                     // The center of this face is (x+1, y+0.5, z+0.5).
                                                                     // PlaneGeometry is created centered at origin.
                                                                     // So translate it to (x+1, y+0.5, z+0.5).
                                                                     // The `faceTranslation` parameter to `addFace` is relative to the block's origin (x,y,z)
                                                                     // So `addFace(material, [0, Math.PI/2, 0], [1, 0.5, 0.5])` is correct for +X face.
             addFace(material, [0, Math.PI / 2, 0], [1, 0.5, 0.5]);
          }
          if (shouldRenderFace(blockType, neighbors.left)) { 
            const materialIndex = blockProto.multiTexture ? 1 : 0;
            const material = Array.isArray(blockProto.mesh.material) ? blockProto.mesh.material[materialIndex] : blockProto.mesh.material;
            addFace(material, [0, -Math.PI / 2, 0], [0, 0.5, 0.5]);
          }
          if (shouldRenderFace(blockType, neighbors.top)) { 
            const materialIndex = blockProto.multiTexture ? 2 : 0;
            const material = Array.isArray(blockProto.mesh.material) ? blockProto.mesh.material[materialIndex] : blockProto.mesh.material;
            addFace(material, [-Math.PI / 2, 0, 0], [0.5, 1, 0.5]);
          }
          if (shouldRenderFace(blockType, neighbors.bottom)) { 
            const materialIndex = blockProto.multiTexture ? 3 : 0;
            const material = Array.isArray(blockProto.mesh.material) ? blockProto.mesh.material[materialIndex] : blockProto.mesh.material;
            addFace(material, [Math.PI / 2, 0, 0], [0.5, 0, 0.5]);
          }
          if (shouldRenderFace(blockType, neighbors.front)) { 
            const materialIndex = blockProto.multiTexture ? 4 : 0;
            const material = Array.isArray(blockProto.mesh.material) ? blockProto.mesh.material[materialIndex] : blockProto.mesh.material;
            addFace(material, [0, 0, 0], [0.5, 0.5, 1]);
          }
          if (shouldRenderFace(blockType, neighbors.back)) { 
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
          chunkMesh.name = `MergedChunkMesh_${this.worldX}_${this.worldZ}_${(data.material as any)?.map?.source?.src?.split('/').pop() || data.material.uuid.substring(0,6)}`;
          chunkMesh.castShadow = !(data.material as THREE.Material).transparent;
          chunkMesh.receiveShadow = true;
          this.chunkRoot.add(chunkMesh);
        }
        data.geometries.forEach(g => g.dispose());
      }
    });
    this.chunkRoot.children.sort((a, b) => {
        const matAIsTransparent = (a as THREE.Mesh).material && ((a as THREE.Mesh).material as THREE.Material).transparent;
        const matBIsTransparent = (b as THREE.Mesh).material && ((b as THREE.Mesh).material as THREE.Material).transparent;
        if (matAIsTransparent && !matBIsTransparent) return 1;
        if (!matAIsTransparent && matBIsTransparent) return -1;
        return 0;
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
