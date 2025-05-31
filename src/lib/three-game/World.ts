
import * as THREE from 'three';
import type { Block } from './Block';
import { Chunk } from './Chunk';
import { CHUNK_SIZE } from './utils';
import type { GameRefs } from './types';

export class World {
  public size: number; 
  public layers: number; 
  public skyHeight: number;
  public voidHeight: number;
  public skyColor: number;
  public lightColor: number;
  public gravity: number;
  public lighting: { ambient: THREE.AmbientLight; directional: THREE.DirectionalLight };
  
  private gameRefs: GameRefs;
  public activeChunks: Map<string, Chunk>; // Renamed from 'chunks'
  private chunkDataStore: Map<string, string[][][]>; // Stores block data for all generated/modified chunks
  private blockPrototypes: Map<string, Block>;
  private renderDistanceInChunks: number = 4; 
  private remeshQueue: Set<string>; 

  private frustum = new THREE.Frustum();
  private projScreenMatrix = new THREE.Matrix4();


  constructor(gameRefs: GameRefs) {
    this.gameRefs = gameRefs;
    this.size = 128; 
    this.layers = 16; 
    this.skyHeight = this.layers * 2; 
    this.voidHeight = 64; 
    this.skyColor = 0xf1f1f1; // Light cyan from PRD: #E0FFFF (HSL: 180 100% 94.1%)
    this.lightColor = 0xffffff;
    this.gravity = 0.004;
    this.activeChunks = new Map();
    this.chunkDataStore = new Map();
    this.remeshQueue = new Set();
    this.blockPrototypes = new Map();
    this.gameRefs.blocks?.forEach(block => {
      const blockNameKey = block.mesh.name.startsWith('Block_') ? block.mesh.name.substring(6) : block.mesh.name;
      this.blockPrototypes.set(blockNameKey, block);
    });
    
    const scene = this.gameRefs.scene!;

    this.lighting = {
      ambient: new THREE.AmbientLight(this.lightColor, 0.75),
      directional: new THREE.DirectionalLight(this.lightColor, 0.5),
    };

    this.lighting.ambient.name = "Ambient Light";
    scene.add(this.lighting.ambient);
    
    const shadowCameraCoverage = CHUNK_SIZE * (this.renderDistanceInChunks + 3); // Increased buffer
    this.lighting.directional.name = "Directional Light";
    this.lighting.directional.position.set(shadowCameraCoverage / 2, this.skyHeight, shadowCameraCoverage / 2); // Position light high and centered
    this.lighting.directional.castShadow = true;
    this.lighting.directional.shadow.camera = new THREE.OrthographicCamera(
      -shadowCameraCoverage, shadowCameraCoverage, shadowCameraCoverage, -shadowCameraCoverage, 0.5, this.skyHeight * 2
    );
    this.lighting.directional.shadow.mapSize = new THREE.Vector2(2048, 2048); 
    scene.add(this.lighting.directional);
    
    this.generateInitialChunks();
  }

  private generateInitialChunks(): void {
    const initialLoadRadius = 1; 
    for (let dChunkX = -initialLoadRadius; dChunkX <= initialLoadRadius; dChunkX++) {
      for (let dChunkZ = -initialLoadRadius; dChunkZ <= initialLoadRadius; dChunkZ++) {
        this.loadChunk(dChunkX, dChunkZ);
      }
    }
  }
  
  public getSpawnHeight(worldX: number, worldZ: number): number {
    const chunkX = Math.floor(worldX / CHUNK_SIZE);
    const chunkZ = Math.floor(worldZ / CHUNK_SIZE);
    const key = `${chunkX},${chunkZ}`;

    let blockData: string[][][] | undefined = this.chunkDataStore.get(key);

    if (!blockData) {
      // Temporarily create chunk data if not found, to determine spawn height
      const tempChunk = new Chunk(this, chunkX, chunkZ, this.blockPrototypes); // Will call generateTerrainData
      blockData = tempChunk.blocks;
      this.chunkDataStore.set(key, blockData); // Store it for future loads
    }
    
    // Find the highest solid block in the specified column of this chunk's data
    const localX = ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    for (let y = this.layers - 1; y >= 0; y--) {
      if (blockData && blockData[localX] && blockData[localX][y] && blockData[localX][y][localZ] !== 'air') {
        return this.layers + y + 1.7; // Add player height
      }
    }
    return this.layers / 2 + 1.7; // Fallback spawn height
  }


  public updateChunks(playerPosition: THREE.Vector3): void {
    const playerChunkX = Math.floor(playerPosition.x / CHUNK_SIZE);
    const playerChunkZ = Math.floor(playerPosition.z / CHUNK_SIZE);

    // Load chunks within render distance
    for (let dChunkX = -this.renderDistanceInChunks; dChunkX <= this.renderDistanceInChunks; dChunkX++) {
      for (let dChunkZ = -this.renderDistanceInChunks; dChunkZ <= this.renderDistanceInChunks; dChunkZ++) {
        const chunkX = playerChunkX + dChunkX;
        const chunkZ = playerChunkZ + dChunkZ;
        const key = `${chunkX},${chunkZ}`;
        if (!this.activeChunks.has(key)) { // Only load if not already active
            this.loadChunk(chunkX, chunkZ); 
        }
      }
    }

    // Unload chunks outside render distance
    const chunksToUnloadKeys: string[] = [];
    this.activeChunks.forEach((chunk, key) => {
      const dx = Math.abs(chunk.worldX - playerChunkX);
      const dz = Math.abs(chunk.worldZ - playerChunkZ);
      if (dx > this.renderDistanceInChunks || dz > this.renderDistanceInChunks) {
        chunksToUnloadKeys.push(key);
      }
    });

    chunksToUnloadKeys.forEach(key => this.unloadChunkByKey(key));
  }

  public updateChunkVisibility(camera: THREE.PerspectiveCamera): void {
    if (!camera) return;

    camera.updateMatrixWorld(); 
    this.projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

    const playerDirection = new THREE.Vector3();
    camera.getWorldDirection(playerDirection);

    this.activeChunks.forEach(chunk => {
        if (!chunk.chunkRoot) return;

        const chunkCenterX = chunk.worldX * CHUNK_SIZE + CHUNK_SIZE / 2;
        const chunkCenterY = chunk.worldY + this.layers / 2;
        const chunkCenterZ = chunk.worldZ * CHUNK_SIZE + CHUNK_SIZE / 2;
        
        const chunkCenterVec = new THREE.Vector3(chunkCenterX, chunkCenterY, chunkCenterZ);
        const chunkSizeVec = new THREE.Vector3(CHUNK_SIZE, this.layers, CHUNK_SIZE); // Use actual chunk dimensions
        const chunkBox = new THREE.Box3().setFromCenterAndSize(chunkCenterVec, chunkSizeVec);

        if (!this.frustum.intersectsBox(chunkBox)) {
            chunk.chunkRoot.visible = false;
            return;
        }

        const vectorToChunk = new THREE.Vector3().subVectors(chunkCenterVec, camera.position);
        const distanceToChunk = vectorToChunk.length(); 
        vectorToChunk.normalize(); 

        const dotProduct = playerDirection.dot(vectorToChunk);
        
        if (dotProduct < -0.3 && distanceToChunk > CHUNK_SIZE * 1.5) { 
            chunk.chunkRoot.visible = false;
        } else {
            chunk.chunkRoot.visible = true;
        }
    });
  }

  private loadChunk(chunkX: number, chunkZ: number): void {
    const key = `${chunkX},${chunkZ}`;
    // No need to check activeChunks here, updateChunks handles that.
    // This method is now just for the creation/loading process.

    const existingBlockData = this.chunkDataStore.get(key);
    const newChunk = new Chunk(this, chunkX, chunkZ, this.blockPrototypes, existingBlockData);
    
    if (!existingBlockData) {
      // If it was newly generated, store its data
      this.chunkDataStore.set(key, newChunk.blocks);
    }

    this.activeChunks.set(key, newChunk);
    this.gameRefs.scene!.add(newChunk.chunkRoot);
    this.remeshQueue.add(key); 
  }
  
  private unloadChunkByKey(key: string): void {
    const chunk = this.activeChunks.get(key);
    if (chunk) {
      // Ensure latest block data is in the store before disposing the chunk instance
      this.chunkDataStore.set(key, chunk.blocks); 
      
      this.gameRefs.scene!.remove(chunk.chunkRoot);
      chunk.dispose(); 
      this.activeChunks.delete(key);
      // No need to delete from remeshQueue here, processRemeshQueue handles non-existent chunks
    }
  }

  public getBlock(worldX: number, worldY: number, worldZ: number): string | null {
    const chunkX = Math.floor(worldX / CHUNK_SIZE);
    const chunkZ = Math.floor(worldZ / CHUNK_SIZE);
    const localY = worldY; 

    const key = `${chunkX},${chunkZ}`;
    const chunk = this.activeChunks.get(key); // Prioritize active chunks for immediate access

    if (chunk && localY >= 0 && localY < this.layers) {
      const localX = ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const localZ = ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      return chunk.getBlock(localX, localY, localZ);
    } else {
      // If chunk is not active but data exists, check chunkDataStore (e.g., for far interactions)
      const storedData = this.chunkDataStore.get(key);
      if (storedData && localY >= 0 && localY < this.layers) {
        const localX = ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const localZ = ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        if (storedData[localX] && storedData[localX][localY] && storedData[localX][localY][localZ] !== undefined) {
            return storedData[localX][localY][localZ];
        }
      }
    }
    return 'air'; // Default to air if block is out of bounds or chunk not found
  }

  public setBlock(worldX: number, worldY: number, worldZ: number, blockType: string): void {
    const chunkX = Math.floor(worldX / CHUNK_SIZE);
    const chunkZ = Math.floor(worldZ / CHUNK_SIZE);
    const localY = worldY;

    const key = `${chunkX},${chunkZ}`;
    let chunk = this.activeChunks.get(key);

    if (!chunk) {
      // If chunk is not active, we need to load its data, modify it, and save it back
      // This scenario should ideally be rare for player interactions which target nearby blocks
      console.warn(`Setting block in non-active chunk: ${key}. This might be slow.`);
      const existingBlockData = this.chunkDataStore.get(key);
      if (existingBlockData && localY >= 0 && localY < this.layers) {
        const localX = ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const localZ = ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        if (existingBlockData[localX][localY][localZ] !== blockType) {
            existingBlockData[localX][localY][localZ] = blockType;
            this.chunkDataStore.set(key, existingBlockData); // Save modified data back
            this.queueChunkRemesh(chunkX, chunkZ); // If it becomes active later, it needs remesh
        }
        return; // Exit, as we are not operating on an active Chunk instance
      } else if (!existingBlockData && localY >= 0 && localY < this.layers) {
          // If chunk data doesn't exist at all, we might need to generate it first
          // This is complex; for now, assume player interaction only hits loaded chunks.
          console.error(`Cannot set block in ungenerated, non-active chunk: ${key}`);
          return;
      }
    }


    if (chunk && localY >= 0 && localY < this.layers) {
      const localX = ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const localZ = ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      chunk.setBlock(localX, localY, localZ, blockType); // This will call world.notifyChunkUpdate
      // chunk.setBlock also queues this chunk for remesh, and notifyChunkUpdate updates chunkDataStore
      this.remeshQueue.add(key);

      if (localX === 0) this.queueChunkRemesh(chunkX - 1, chunkZ);
      if (localX === CHUNK_SIZE - 1) this.queueChunkRemesh(chunkX + 1, chunkZ);
      if (localZ === 0) this.queueChunkRemesh(chunkX, chunkZ - 1);
      if (localZ === CHUNK_SIZE - 1) this.queueChunkRemesh(chunkX, chunkZ + 1);

    } else {
      console.warn(`Attempted to set block in non-existent or out-of-bounds active chunk: ${worldX},${worldY},${worldZ}`);
    }
  }

  // Called by Chunk when its block data is updated
  public notifyChunkUpdate(chunkX: number, chunkZ: number, updatedBlockData: string[][][]): void {
    const key = `${chunkX},${chunkZ}`;
    this.chunkDataStore.set(key, updatedBlockData);
  }
  
  public queueChunkRemesh(chunkX: number, chunkZ: number): void {
    const key = `${chunkX},${chunkZ}`;
    // Only queue if chunk is active OR if its data exists (might become active soon)
    if (this.activeChunks.has(key) || this.chunkDataStore.has(key)) { 
      const chunk = this.activeChunks.get(key);
      if(chunk) chunk.needsMeshUpdate = true;
      this.remeshQueue.add(key);
    }
  }

  public processRemeshQueue(maxPerFrame: number = 1): void {
    let processedCount = 0;
    const queueArray = Array.from(this.remeshQueue); 
    
    for (const key of queueArray) {
      if (processedCount >= maxPerFrame) break;
      
      const chunk = this.activeChunks.get(key); // Only remesh active chunks
      if (chunk && chunk.needsMeshUpdate) { 
        chunk.buildMesh();
      }
      this.remeshQueue.delete(key); 
      processedCount++;
    }
  }
  
  public getRemeshQueueSize(): number {
    return this.remeshQueue.size;
  }
}
