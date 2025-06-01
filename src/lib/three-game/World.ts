
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


  private gameRefs: GameRefs;
  public activeChunks: Map<string, Chunk>;
  private chunkDataStore: Map<string, string[][][]>;
  private blockPrototypes: Map<string, Block>;
  public renderDistanceInChunks: number = 4;
  private remeshQueue: Set<string>;

  private frustum = new THREE.Frustum();
  private projScreenMatrix = new THREE.Matrix4();


  constructor(gameRefs: GameRefs) {
    this.gameRefs = gameRefs;
    this.size = 128;
    this.layers = 128;
    this.skyHeight = this.layers * 2;
    this.voidHeight = 64;
    this.skyColor = 0xf1f1f1; 
    this.lightColor = 0xffffff;
    this.gravity = 0.004;
    this.activeChunks = new Map();
    this.chunkDataStore = new Map();
    this.remeshQueue = new Set();
    this.blockPrototypes = new Map();

    if (!this.gameRefs.blocks) {
        console.error("World: Block prototypes not found in gameRefs. Ensure ThreeSetup populates gameRefs.blocks.");
    } else {
        this.gameRefs.blocks.forEach(block => {
          const blockNameKey = block.mesh.name.startsWith('Block_') ? block.mesh.name.substring(6) : block.mesh.name;
          this.blockPrototypes.set(blockNameKey, block);
        });
    }

    // Initial chunks are now loaded by GameLogic.initializePlayer or World.updateChunks
  }

  public getSpawnHeight(worldX: number, worldZ: number): number {
    const chunkX = Math.floor(worldX / CHUNK_SIZE);
    const chunkZ = Math.floor(worldZ / CHUNK_SIZE);
    const key = `${chunkX},${chunkZ}`;

    let blockData: string[][][] | undefined;
    const activeChunk = this.activeChunks.get(key);

    if (activeChunk) {
      blockData = activeChunk.blocks;
    } else {
      console.warn(`getSpawnHeight: Chunk ${key} is not active. Attempting to use chunkDataStore or generate temporary data.`);
      blockData = this.chunkDataStore.get(key);
      if (!blockData) {
        console.warn(`getSpawnHeight: No data in chunkDataStore for ${key}. Generating temporary data.`);
        const tempChunk = new Chunk(this, chunkX, chunkZ, this.blockPrototypes);
        blockData = tempChunk.blocks;
        // DO NOT store tempChunk.blocks in chunkDataStore here.
        // GameLogic is responsible for loading chunks properly into activeChunks.
      }
    }

    if (!blockData) {
        console.error(`getSpawnHeight: Critical error - block data for chunk ${key} could not be obtained. Returning default height.`);
        return Math.floor(this.layers / 2.5) + 1; 
    }

    const localX = ((Math.floor(worldX) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((Math.floor(worldZ) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    for (let y = this.layers - 1; y >= 0; y--) {
      if (blockData[localX]?.[y]?.[localZ] !== undefined && blockData[localX][y][localZ] !== 'air') {
        return y + 1;
      }
    }
    // If no solid block found (e.g., all air column), return a base height.
    console.warn(`getSpawnHeight: No solid block found at (${worldX}, ${worldZ}). Returning default base height.`);
    return Math.floor(this.layers / 3) + 1;
  }


  public updateChunks(playerPosition: THREE.Vector3): void {
    const playerChunkX = Math.floor(playerPosition.x / CHUNK_SIZE);
    const playerChunkZ = Math.floor(playerPosition.z / CHUNK_SIZE);

    for (let dChunkX = -this.renderDistanceInChunks; dChunkX <= this.renderDistanceInChunks; dChunkX++) {
      for (let dChunkZ = -this.renderDistanceInChunks; dChunkZ <= this.renderDistanceInChunks; dChunkZ++) {
        const chunkX = playerChunkX + dChunkX;
        const chunkZ = playerChunkZ + dChunkZ;
        const key = `${chunkX},${chunkZ}`;
        if (!this.activeChunks.has(key)) {
            this.loadChunk(chunkX, chunkZ);
        }
      }
    }

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

    camera.updateMatrixWorld(true); 
    this.projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

    this.activeChunks.forEach(chunk => {
        if (!chunk.chunkRoot) return;

        const chunkCenterX = chunk.worldX * CHUNK_SIZE + CHUNK_SIZE / 2;
        const chunkCenterY = chunk.worldY + this.layers / 2; 
        const chunkCenterZ = chunk.worldZ * CHUNK_SIZE + CHUNK_SIZE / 2;
        
        const chunkCenterVec = new THREE.Vector3(chunkCenterX, chunkCenterY, chunkCenterZ);
        const chunkSizeVec = new THREE.Vector3(CHUNK_SIZE, this.layers, CHUNK_SIZE);
        const chunkBox = new THREE.Box3().setFromCenterAndSize(chunkCenterVec, chunkSizeVec);
        
        if (!this.frustum.intersectsBox(chunkBox)) {
            chunk.chunkRoot.visible = false;
        } else {
            chunk.chunkRoot.visible = true;
        }
    });
  }

  public loadChunk(chunkX: number, chunkZ: number): void {
    const key = `${chunkX},${chunkZ}`;
    if (this.activeChunks.has(key)) return; // Already active

    const existingBlockData = this.chunkDataStore.get(key);
    const newChunk = new Chunk(this, chunkX, chunkZ, this.blockPrototypes, existingBlockData);

    if (!existingBlockData) {
      // If chunk was generated fresh (not from store), store its data
      this.chunkDataStore.set(key, newChunk.blocks);
    }

    this.activeChunks.set(key, newChunk);
    if (this.gameRefs.scene) {
      this.gameRefs.scene.add(newChunk.chunkRoot);
    } else {
        console.error("World: Scene not available in gameRefs when trying to load chunk.");
    }
    this.remeshQueue.add(key); // Always queue for remesh when loaded/activated
  }

  private unloadChunkByKey(key: string): void {
    const chunk = this.activeChunks.get(key);
    if (chunk) {
      // Data is already in chunkDataStore if it was generated or loaded from there initially.
      // If it was modified while active, chunk.setBlock already updated chunkDataStore.
      // So, no explicit save here is strictly needed IF chunk.setBlock handles data store updates.
      // For safety, and if chunk.setBlock doesn't always update the store:
      this.chunkDataStore.set(key, chunk.blocks); 


      if (this.gameRefs.scene) {
        this.gameRefs.scene.remove(chunk.chunkRoot);
      }
      chunk.dispose();
      this.activeChunks.delete(key);
    }
  }

  public getBlock(worldX: number, worldY: number, worldZ: number): string | null {
    const chunkX = Math.floor(worldX / CHUNK_SIZE);
    const chunkZ = Math.floor(worldZ / CHUNK_SIZE);
    const localY = Math.floor(worldY); 

    if (localY < 0 || localY >= this.layers) return 'air'; 

    const key = `${chunkX},${chunkZ}`;
    const chunk = this.activeChunks.get(key);

    if (chunk) {
      const localX = ((Math.floor(worldX) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const localZ = ((Math.floor(worldZ) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      return chunk.getBlock(localX, localY, localZ);
    } else {
      const storedData = this.chunkDataStore.get(key);
      if (storedData) {
        const localX = ((Math.floor(worldX) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const localZ = ((Math.floor(worldZ) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        if (storedData[localX]?.[localY]?.[localZ] !== undefined) {
            return storedData[localX][localY][localZ];
        }
      }
    }
    return 'air'; 
  }

  public setBlock(worldX: number, worldY: number, worldZ: number, blockType: string): void {
    const cX = Math.floor(worldX / CHUNK_SIZE);
    const cZ = Math.floor(worldZ / CHUNK_SIZE);
    const lY = Math.floor(worldY);

    if (lY < 0 || lY >= this.layers) {
        console.warn(`Attempted to set block out of Y bounds: ${worldX},${worldY},${worldZ}`);
        return;
    }

    const key = `${cX},${cZ}`;
    let chunk = this.activeChunks.get(key);

    // If chunk is not active, load its data, modify, and store back.
    // This ensures modifications are persisted even if chunk isn't immediately visible.
    if (!chunk) {
      let blockData = this.chunkDataStore.get(key);
      if (!blockData) { // Chunk data doesn't exist at all, generate it
          const tempChunkGen = new Chunk(this, cX, cZ, this.blockPrototypes);
          blockData = tempChunkGen.blocks;
      }
      // Modify the blockData directly (it's a reference or a fresh array)
      const lX = ((Math.floor(worldX) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const lZ = ((Math.floor(worldZ) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

      if (blockData[lX]?.[lY]?.[lZ] !== blockType) {
          if (!blockData[lX]) blockData[lX] = [];
          if (!blockData[lX][lY]) blockData[lX][lY] = [];
          blockData[lX][lY][lZ] = blockType;
          this.chunkDataStore.set(key, blockData); // Ensure updated data is stored
          
          // Queue remesh for this chunk if it becomes active later.
          // And for adjacent chunks if block is on a border.
          this.queueChunkRemesh(cX, cZ); // This will mark it for remesh if it gets loaded
          if (lX === 0) this.queueChunkRemesh(cX - 1, cZ);
          if (lX === CHUNK_SIZE - 1) this.queueChunkRemesh(cX + 1, cZ);
          if (lZ === 0) this.queueChunkRemesh(cX, cZ - 1);
          if (lZ === CHUNK_SIZE - 1) this.queueChunkRemesh(cX, cZ + 1);
      }
      return; 
    }

    // If chunk is active, delegate to its setBlock method
    const localX = ((Math.floor(worldX) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((Math.floor(worldZ) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    chunk.setBlock(localX, lY, localZ, blockType);
    // chunk.setBlock will handle updating chunkDataStore and queueing remeshes
  }

  public notifyChunkUpdate(chunkX: number, chunkZ: number, updatedBlockData: string[][][]): void {
    const key = `${chunkX},${chunkZ}`;
    this.chunkDataStore.set(key, updatedBlockData);
  }

  public queueChunkRemesh(chunkX: number, chunkZ: number): void {
    const key = `${chunkX},${chunkZ}`;
    // It's okay to queue a chunk for remesh even if it's not currently active.
    // If it becomes active, its needsMeshUpdate flag (set by Chunk.setBlock or here) will be checked.
    // Or, when it's loaded, if it's in the queue, it can be remeshed.
    // For now, InputController directly sets needsMeshUpdate on active chunks.
    // This queue primarily serves to mark non-active but modified chunks, or for initial load.
    const chunk = this.activeChunks.get(key);
    if(chunk) {
        chunk.needsMeshUpdate = true; // Ensure flag is set on active chunk
    }
    this.remeshQueue.add(key);
  }

  public processRemeshQueue(maxPerFrame: number = 1): void {
    let processedCount = 0;
    const queueArray = Array.from(this.remeshQueue); 

    for (const key of queueArray) {
      if (processedCount >= maxPerFrame) break;

      const chunk = this.activeChunks.get(key);
      if (chunk && chunk.needsMeshUpdate) {
        chunk.buildMesh(); // buildMesh sets needsMeshUpdate to false
      }
      // Remove from queue whether it was active or not, or if needsMeshUpdate was false
      // If it was not active but in queue, its data is in chunkDataStore; it will build mesh when loaded.
      this.remeshQueue.delete(key); 
      processedCount++;
    }
  }

  public getRemeshQueueSize(): number {
    return this.remeshQueue.size;
  }
}

    
