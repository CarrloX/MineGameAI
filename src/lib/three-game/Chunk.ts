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

  public boundingBox: THREE.Box3; // Propiedad para almacenar el bounding box del chunk

  private isRemeshing: boolean = false; // Bandera para evitar remallados concurrentes

  constructor(world: World, worldX: number, worldZ: number, blockPrototypes: Map<string, Block>, initialBlockData?: string[][][], worldSeed?: number) {
    this.world = world;
    this.worldX = worldX;
    this.worldZ = worldZ;
    this.blockPrototypes = blockPrototypes;
    this.worldSeed = worldSeed !== undefined ? worldSeed : Math.floor(Math.random() * Number.MAX_SAFE_INTEGER); 

    this.chunkRoot = new THREE.Group();
    this.chunkRoot.name = `ChunkRoot_${worldX}_${worldZ}`;
    this.chunkRoot.position.set(this.worldX * CHUNK_SIZE, this.worldY, this.worldZ * CHUNK_SIZE);

    // Calcular el bounding box para este chunk
    const minX = this.worldX * CHUNK_SIZE;
    const minY = 0; // Asumiendo que los chunks van desde Y=0
    const minZ = this.worldZ * CHUNK_SIZE;

    const maxX = (this.worldX + 1) * CHUNK_SIZE;
    const maxY = this.world.layers; // La altura total del mundo obtenida de la instancia de World
    const maxZ = (this.worldZ + 1) * CHUNK_SIZE;

    this.boundingBox = new THREE.Box3(
        new THREE.Vector3(minX, minY, minZ),
        new THREE.Vector3(maxX, maxY, maxZ)
    );

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
    const waterLevel = baseHeight - 3; 

    const OCTAVES = 5; 
    const PERSISTENCE = 0.45; 
    const LACUNARITY = 2.0; 
    const NOISE_SCALE_ADJUSTMENT = 1.5; 

    const mountainMainFreqBase_const = 0.05;
    const mountainMainAmpBase_const = 12; 
    const plainsMainFreqBase_const = 0.04;
    const plainsMainAmpBase_const = 2.5; 

    const mountainBasinFreqBase_const = 0.04;
    const mountainBasinAmpBase_const = 15; 
    const mountainBasinThresholdBase_const = 0.28; 
    const plainsBasinFreqBase_const = 0.05;
    const plainsBasinAmpBase_const = 2.0; 
    const plainsBasinThresholdBase_const = 0.62; 

    const biomeScaleBase_const = 0.008;
    const biomeBlendStartBase_const = -0.1;
    const biomeBlendEndBase_const = 0.2;
    
    const mountainBaseFreqSeeded = (mountainMainFreqBase_const + this.seededRandom(0,0,0, this.worldSeed, "mtMainFreq") * 0.01 - 0.005) / NOISE_SCALE_ADJUSTMENT;
    const mountainBaseAmpSeeded = mountainMainAmpBase_const + this.seededRandom(0,0,0, this.worldSeed, "mtMainAmp") * 5 - 2.5;
    
    const plainsBaseFreqSeeded = (plainsMainFreqBase_const + this.seededRandom(0,0,0, this.worldSeed, "plMainFreq") * 0.01 - 0.005) / NOISE_SCALE_ADJUSTMENT;
    const plainsBaseAmpSeeded = plainsMainAmpBase_const + this.seededRandom(0,0,0, this.worldSeed, "plMainAmp") * 1 - 0.5;

    const mountainBasinFreq = (mountainBasinFreqBase_const + this.seededRandom(0,0,0, this.worldSeed, "mtBasinFreq") * 0.01 - 0.005);
    const mountainBasinAmp = mountainBasinAmpBase_const + this.seededRandom(0,0,0, this.worldSeed, "mtBasinAmp") * 5 - 2.5;
    const mountainBasinThreshold = mountainBasinThresholdBase_const + this.seededRandom(0,0,0, this.worldSeed, "mtBasinThresh") * 0.1 - 0.05;

    const plainsBasinFreq = (plainsBasinFreqBase_const + this.seededRandom(0,0,0, this.worldSeed, "plBasinFreq") * 0.01 - 0.005);
    const plainsBasinAmp = plainsBasinAmpBase_const + this.seededRandom(0,0,0, this.worldSeed, "plBasinAmp") * 1 - 0.5;
    const plainsBasinThreshold = plainsBasinThresholdBase_const + this.seededRandom(0,0,0, this.worldSeed, "plBasinThresh") * 0.1 - 0.05;
    
    const biomeScale = biomeScaleBase_const + this.seededRandom(0,0,0, this.worldSeed, "biomeScale") * 0.002 - 0.001;
    const biomeBlendStart = biomeBlendStartBase_const + this.seededRandom(0,0,0, this.worldSeed, "biomeBlendStart") * 0.05 - 0.025;
    const biomeBlendEnd = biomeBlendEndBase_const + this.seededRandom(0,0,0, this.worldSeed, "biomeBlendEnd") * 0.05 - 0.025;

    const calculateFbmHeight = (
        worldAbsX: number,
        worldAbsZ: number,
        initialFrequency: number,
        initialAmplitude: number
    ): number => {
        let totalHeightContribution = 0;
        let frequency = initialFrequency;
        let amplitude = initialAmplitude;

        for (let i = 0; i < OCTAVES; i++) {
            const noiseX = worldAbsX * frequency + (i + 1) * 0.3712; // Small fixed offsets per octave
            const noiseZ = worldAbsZ * frequency - (i + 1) * 0.6193; 
            
            const noiseValue = Math.sin(noiseX) * Math.cos(noiseZ); 
            totalHeightContribution += noiseValue * amplitude;
            
            amplitude *= PERSISTENCE;
            frequency *= LACUNARITY;
        }
        return totalHeightContribution;
    };

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

        const mountainFbmContribution = calculateFbmHeight(absoluteWorldX, absoluteWorldZ, mountainBaseFreqSeeded, mountainBaseAmpSeeded);
        const plainsFbmContribution = calculateFbmHeight(absoluteWorldX, absoluteWorldZ, plainsBaseFreqSeeded, plainsBaseAmpSeeded);

        const blendedFbmHeight = this.lerp(plainsFbmContribution, mountainFbmContribution, blendFactor);
        
        let height = baseHeight + blendedFbmHeight;

        const currentBasinAmp = this.lerp(plainsBasinAmp, mountainBasinAmp, blendFactor);
        const currentBasinThreshold = this.lerp(plainsBasinThreshold, mountainBasinThreshold, blendFactor);
        const currentBasinFreq = this.lerp(plainsBasinFreq, mountainBasinFreq, blendFactor);
        
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
          } else if (y < surfaceY) { 
            if (surfaceY <= waterLevel) { 
                 this.blocks[x][y][z] = sandBlockName;
            } else {
                 this.blocks[x][y][z] = dirtBlockName;
            }
          } else if (y === surfaceY) { 
            if (surfaceY < waterLevel ) { 
                this.blocks[x][y][z] = sandBlockName;
            } else if (surfaceY === waterLevel) { 
                this.blocks[x][y][z] = sandBlockName; 
            }
            else { 
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

    // --- Start of Pillar Reduction / Height Clamping Post-Processing ---
    const MAX_HEIGHT_DIFF_THRESHOLD = 3;
    const SMOOTHING_PASSES = 2;

    let currentSurfaceHeightMap: number[][] = Array(CHUNK_SIZE).fill(null).map(() => Array(CHUNK_SIZE).fill(0));

    // Initialize currentSurfaceHeightMap from this.blocks
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        let surfaceY = 0;
        for (let y = this.world.layers - 1; y >= 0; y--) {
          if (this.blocks[x][y][z] !== 'air' && this.blocks[x][y][z] !== waterBlockName) {
            surfaceY = y;
            break;
          }
        }
        currentSurfaceHeightMap[x][z] = surfaceY;
      }
    }

    for (let pass = 0; pass < SMOOTHING_PASSES; pass++) {
      const nextSurfaceHeightMap: number[][] = currentSurfaceHeightMap.map(arr => arr.slice()); // Deep copy for the next pass

      for (let x = 1; x < CHUNK_SIZE - 1; x++) { // Iterate excluding borders
        for (let z = 1; z < CHUNK_SIZE - 1; z++) {
          const currentColumnHeight = currentSurfaceHeightMap[x][z];
          let neighborHeightsSum = 0;
          let validNeighbors = 0;

          for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
              if (dx === 0 && dz === 0) continue; 

              const nx = x + dx;
              const nz = z + dz;
              
              neighborHeightsSum += currentSurfaceHeightMap[nx][nz];
              validNeighbors++;
            }
          }

          if (validNeighbors > 0) {
            const averageNeighborHeight = neighborHeightsSum / validNeighbors;
            
            if (currentColumnHeight > averageNeighborHeight + MAX_HEIGHT_DIFF_THRESHOLD) {
              const newHeight = Math.floor(averageNeighborHeight + MAX_HEIGHT_DIFF_THRESHOLD);
              nextSurfaceHeightMap[x][z] = Math.max(0, Math.min(newHeight, this.world.layers - 1));
            }
          }
        }
      }
      currentSurfaceHeightMap = nextSurfaceHeightMap; // Current map becomes the result of this pass
    }

    // Reconstruct this.blocks based on the final smoothed currentSurfaceHeightMap
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const finalSurfaceY = currentSurfaceHeightMap[x][z];
        for (let y = 0; y < this.world.layers; y++) {
          if (y > finalSurfaceY) {
            // If above new surface Y AND below or at water level, it could be water
            if (y <= waterLevel) {
                 this.blocks[x][y][z] = waterBlockName;
            } else {
                 this.blocks[x][y][z] = 'air';
            }
          } else if (y === finalSurfaceY) {
            if (finalSurfaceY < waterLevel) {
              this.blocks[x][y][z] = sandBlockName;
            } else if (finalSurfaceY === waterLevel) {
              this.blocks[x][y][z] = sandBlockName;
            } else {
              this.blocks[x][y][z] = grassBlockName;
            }
          } else { // y < finalSurfaceY (sub-surface)
            if (finalSurfaceY <= waterLevel && y > finalSurfaceY - 2) { 
               this.blocks[x][y][z] = sandBlockName;
            } else if (y < finalSurfaceY - 3) { 
              this.blocks[x][y][z] = stoneBlockName;
            } else { 
              this.blocks[x][y][z] = dirtBlockName;
            }
          }
        }
      }
    }
    // --- End of Pillar Reduction / Height Clamping Post-Processing ---

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
            if ('map' in m && m.map) {
              m.map.dispose();
            }
            m.dispose();
          });
        } else if (child.material) {
          const mat = child.material as THREE.Material;
          if ('map' in mat && (mat as any).map) {
            (mat as any).map.dispose();
          }
          mat.dispose();
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
          
          const addFace = (material: THREE.Material, faceRotation: [number, number, number], faceCenterInBlockLocal: [number, number, number]) => {
            const faceGeometry = new THREE.PlaneGeometry(1, 1);
            
            faceGeometry.rotateX(faceRotation[0]);
            faceGeometry.rotateY(faceRotation[1]);
            faceGeometry.rotateZ(faceRotation[2]);
            
            faceGeometry.translate(
              x + faceCenterInBlockLocal[0], 
              y + faceCenterInBlockLocal[1], 
              z + faceCenterInBlockLocal[2]
            );
            
            const materialKey = material.uuid + (material.transparent ? '_transparent' : '_opaque');
            if (!geometriesByMaterial.has(materialKey)) {
              geometriesByMaterial.set(materialKey, { material: material, geometries: [] });
            }
            geometriesByMaterial.get(materialKey)!.geometries.push(faceGeometry);
          };
          
          if (shouldRenderFace(blockType, neighbors.right)) { 
            const materialIndex = blockProto.multiTexture ? 0 : 0; 
            const material = Array.isArray(blockProto.mesh.material) ? blockProto.mesh.material[materialIndex] : blockProto.mesh.material;
            addFace(material, [0, Math.PI / 2, 0], [0.5 + 0.5, 0.5, 0.5]); 
          }
          if (shouldRenderFace(blockType, neighbors.left)) { 
            const materialIndex = blockProto.multiTexture ? 1 : 0;
            const material = Array.isArray(blockProto.mesh.material) ? blockProto.mesh.material[materialIndex] : blockProto.mesh.material;
            addFace(material, [0, -Math.PI / 2, 0], [-0.5 + 0.5, 0.5, 0.5]); 
          }
          if (shouldRenderFace(blockType, neighbors.top)) { 
            const materialIndex = blockProto.multiTexture ? 2 : 0;
            const material = Array.isArray(blockProto.mesh.material) ? blockProto.mesh.material[materialIndex] : blockProto.mesh.material;
            addFace(material, [-Math.PI / 2, 0, 0], [0.5, 0.5 + 0.5, 0.5]); 
          }
          if (shouldRenderFace(blockType, neighbors.bottom)) { 
            const materialIndex = blockProto.multiTexture ? 3 : 0;
            const material = Array.isArray(blockProto.mesh.material) ? blockProto.mesh.material[materialIndex] : blockProto.mesh.material;
            addFace(material, [Math.PI / 2, 0, 0], [0.5, -0.5 + 0.5, 0.5]); 
          }
          if (shouldRenderFace(blockType, neighbors.front)) { 
            const materialIndex = blockProto.multiTexture ? 4 : 0;
            const material = Array.isArray(blockProto.mesh.material) ? blockProto.mesh.material[materialIndex] : blockProto.mesh.material;
            addFace(material, [0, 0, 0], [0.5, 0.5, 0.5 + 0.5]); 
          }
          if (shouldRenderFace(blockType, neighbors.back)) { 
            const materialIndex = blockProto.multiTexture ? 5 : 0;
            const material = Array.isArray(blockProto.mesh.material) ? blockProto.mesh.material[materialIndex] : blockProto.mesh.material;
            addFace(material, [0, Math.PI, 0], [0.5, 0.5, -0.5 + 0.5]); 
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
  
  /**
   * Genera la malla del chunk usando un Web Worker.
   * @param onMeshReady Callback que recibe los datos serializados para reconstruir la geometría
   */
  buildMeshAsync(onMeshReady: (meshData: any) => void) {
    const worker = new Worker(new URL('./workers/meshWorker.js', import.meta.url));
    worker.onmessage = (e) => {
      const { meshData } = e.data;
      onMeshReady(meshData);
      worker.terminate();
    };
    worker.postMessage({
      chunkData: this.blocks,
      chunkX: this.worldX,
      chunkZ: this.worldZ,
      worldSeed: this.worldSeed,
      // blockPrototypes: ... // Si necesitas pasar info de materiales, simplifícalo aquí
    });
  }

  /**
   * Reconstruye la geometría de Three.js a partir de los datos serializados del worker.
   */
  static meshDataToGeometry(meshData: any): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const indices = [];
    // Añadir vértices
    for (const v of meshData.vertices) {
      vertices.push(v[0], v[1], v[2]);
    }
    // Añadir índices para cada cara (asumimos cuadriláteros, los convertimos a dos triángulos)
    for (const face of meshData.faces) {
      // [a, b, c, d] => triángulos (a, b, c) y (a, c, d)
      indices.push(face.indices[0], face.indices[1], face.indices[2]);
      indices.push(face.indices[0], face.indices[2], face.indices[3]);
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  dispose(): void {
    while (this.chunkRoot.children.length > 0) {
      const child = this.chunkRoot.children[0];
      this.chunkRoot.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => {
            if ('map' in m && m.map) {
              m.map.dispose();
            }
            m.dispose();
          });
        } else if (child.material) {
          const mat = child.material as THREE.Material;
          if ('map' in mat && (mat as any).map) {
            (mat as any).map.dispose();
          }
          mat.dispose();
        }
      }
    }
  }

  /**
   * Llama a remeshAsync solo si needsMeshUpdate es true y no hay remallado en curso.
   * Devuelve una promesa que se resuelve cuando el remallado termina.
   */
  public async updateMeshIfNeededAsync(material?: THREE.Material): Promise<void> {
    if (this.needsMeshUpdate && !this.isRemeshing) {
      this.isRemeshing = true;
      await new Promise<void>((resolve) => {
        this.remeshAsync(material, () => {
          this.isRemeshing = false;
          resolve();
        });
      });
    }
  }

  /**
   * Genera y añade automáticamente el mesh del chunk usando el worker y la geometría reconstruida.
   * El material puede ser personalizado según el tipo de bloque principal, aquí se usa uno por defecto.
   * Ahora acepta un callback opcional para integración asíncrona.
   */
  remeshAsync(material?: THREE.Material, onComplete?: () => void) {
    // Elimina los meshes previos
    while (this.chunkRoot.children.length > 0) {
      const child = this.chunkRoot.children[0];
      this.chunkRoot.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => {
            if ('map' in m && m.map) {
              m.map.dispose();
            }
            m.dispose();
          });
        } else if (child.material) {
          const mat = child.material as THREE.Material;
          if ('map' in mat && (mat as any).map) {
            (mat as any).map.dispose();
          }
          mat.dispose();
        }
      }
    }
    // Llama al worker y añade el mesh cuando esté listo
    this.buildMeshAsync((meshData) => {
      const geometry = Chunk.meshDataToGeometry(meshData);
      // Selección de material: usa el proporcionado o uno por defecto
      const meshMaterial = material || new THREE.MeshStandardMaterial({ color: 0xaaaaaa, flatShading: true });
      const mesh = new THREE.Mesh(geometry, meshMaterial);
      mesh.name = `AsyncChunkMesh_${this.worldX}_${this.worldZ}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.chunkRoot.add(mesh);
      // Ordena para transparencia si es necesario
      this.chunkRoot.children.sort((a, b) => {
        const matAIsTransparent = (a as THREE.Mesh).material && ((a as THREE.Mesh).material as THREE.Material).transparent;
        const matBIsTransparent = (b as THREE.Mesh).material && ((b as THREE.Mesh).material as THREE.Material).transparent;
        if (matAIsTransparent && !matBIsTransparent) return 1;
        if (!matAIsTransparent && matBIsTransparent) return -1;
        return 0;
      });
      this.needsMeshUpdate = false;
      if (onComplete) onComplete();
    });
  }
}
