
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
  public worldSeed: number;

  constructor(gameRefs: GameRefs, worldSeed: number) {
    this.gameRefs = gameRefs;
    this.worldSeed = worldSeed;
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
      blockData = this.chunkDataStore.get(key);
      if (!blockData) {
        const tempChunk = new Chunk(this, chunkX, chunkZ, this.blockPrototypes, undefined, this.worldSeed);
        blockData = tempChunk.blocks;
        // DO NOT store tempChunk.blocks in chunkDataStore here for getSpawnHeight
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
    if (this.activeChunks.has(key)) return;

    const existingBlockData = this.chunkDataStore.get(key);
    const newChunk = new Chunk(this, chunkX, chunkZ, this.blockPrototypes, existingBlockData, this.worldSeed);

    if (!existingBlockData && newChunk.wasGenerated) { // Only store if freshly generated
      this.chunkDataStore.set(key, newChunk.blocks);
    }

    this.activeChunks.set(key, newChunk);
    if (this.gameRefs.scene) {
      this.gameRefs.scene.add(newChunk.chunkRoot);
    } else {
        console.error("World: Scene not available in gameRefs when trying to load chunk.");
    }
    this.queueChunkRemesh(chunkX, chunkZ);
  }

  private unloadChunkByKey(key: string): void {
    const chunk = this.activeChunks.get(key);
    if (chunk) {
      if (chunk.wasGenerated) { // If it was generated, ensure its data is in the store before unload.
         this.chunkDataStore.set(key, chunk.blocks);
      }
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

    if (!chunk) {
      let blockData = this.chunkDataStore.get(key);
      if (!blockData) {
          const tempChunkGen = new Chunk(this, cX, cZ, this.blockPrototypes, undefined, this.worldSeed);
          blockData = tempChunkGen.blocks;
          // if tempChunkGen.wasGenerated, store its data
          if (tempChunkGen.wasGenerated) {
            this.chunkDataStore.set(key, blockData);
          }
      }
      const lX = ((Math.floor(worldX) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const lZ = ((Math.floor(worldZ) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

      if (blockData[lX]?.[lY]?.[lZ] !== blockType) {
          if (!blockData[lX]) blockData[lX] = [];
          if (!blockData[lX][lY]) blockData[lX][lY] = [];
          blockData[lX][lY][lZ] = blockType;
          this.chunkDataStore.set(key, blockData);

          this.queueChunkRemesh(cX, cZ);
          if (lX === 0) this.queueChunkRemesh(cX - 1, cZ);
          if (lX === CHUNK_SIZE - 1) this.queueChunkRemesh(cX + 1, cZ);
          if (lZ === 0) this.queueChunkRemesh(cX, cZ - 1);
          if (lZ === CHUNK_SIZE - 1) this.queueChunkRemesh(cX, cZ + 1);
      }
      return;
    }

    const localX = ((Math.floor(worldX) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((Math.floor(worldZ) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    chunk.setBlock(localX, lY, localZ, blockType);
  }

  public notifyChunkUpdate(chunkX: number, chunkZ: number, updatedBlockData: string[][][]): void {
    const key = `${chunkX},${chunkZ}`;
    this.chunkDataStore.set(key, updatedBlockData);
  }

  public queueChunkRemesh(chunkX: number, chunkZ: number): void {
    const key = `${chunkX},${chunkZ}`;
    const chunk = this.activeChunks.get(key);
    if(chunk) {
        chunk.needsMeshUpdate = true;
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
