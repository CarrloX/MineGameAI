
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
      const tempChunk = new Chunk(this, chunkX, chunkZ, this.blockPrototypes);
      blockData = tempChunk.blocks;
      this.chunkDataStore.set(key, blockData);
    }

    const localX = ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    for (let y = this.layers - 1; y >= 0; y--) {
      if (blockData && blockData[localX] && blockData[localX][y] && blockData[localX][y][localZ] !== 'air') {
        return y + 1;
      }
    }
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

  private loadChunk(chunkX: number, chunkZ: number): void {
    const key = `${chunkX},${chunkZ}`;

    const existingBlockData = this.chunkDataStore.get(key);
    const newChunk = new Chunk(this, chunkX, chunkZ, this.blockPrototypes, existingBlockData);

    if (!existingBlockData) {
      this.chunkDataStore.set(key, newChunk.blocks);
    }

    this.activeChunks.set(key, newChunk);
    if (this.gameRefs.scene) {
      this.gameRefs.scene.add(newChunk.chunkRoot);
    } else {
        console.error("World: Scene not available in gameRefs when trying to load chunk.");
    }
    this.remeshQueue.add(key);
  }

  private unloadChunkByKey(key: string): void {
    const chunk = this.activeChunks.get(key);
    if (chunk) {
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
    const localY = worldY;

    if (localY < 0 || localY >= this.layers) return 'air';

    const key = `${chunkX},${chunkZ}`;
    const chunk = this.activeChunks.get(key);

    if (chunk) {
      const localX = ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const localZ = ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      return chunk.getBlock(localX, localY, localZ);
    } else {
      const storedData = this.chunkDataStore.get(key);
      if (storedData) {
        const localX = ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const localZ = ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        if (storedData[localX] && storedData[localX][localY] && storedData[localX][localY][localZ] !== undefined) {
            return storedData[localX][localY][localZ];
        }
      }
    }
    return 'air';
  }

  public setBlock(worldX: number, worldY: number, worldZ: number, blockType: string): void {
    const chunkX = Math.floor(worldX / CHUNK_SIZE);
    const chunkZ = Math.floor(worldZ / CHUNK_SIZE);
    const localY = worldY;

    if (localY < 0 || localY >= this.layers) {
        console.warn(`Attempted to set block out of Y bounds: ${worldX},${worldY},${worldZ}`);
        return;
    }

    const key = `${chunkX},${chunkZ}`;
    let chunk = this.activeChunks.get(key);

    if (!chunk) {
      let blockData = this.chunkDataStore.get(key);
      if (!blockData) {
          const tempChunkGen = new Chunk(this, chunkX, chunkZ, this.blockPrototypes);
          blockData = tempChunkGen.blocks;
      }
      const localX = ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const localZ = ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      if (blockData[localX] && blockData[localX][localY] && blockData[localX][localY][localZ] !== blockType) {
          blockData[localX][localY][localZ] = blockType;
          this.chunkDataStore.set(key, blockData);

          if (localX === 0) this.queueChunkRemesh(chunkX - 1, chunkZ);
          if (localX === CHUNK_SIZE - 1) this.queueChunkRemesh(chunkX + 1, chunkZ);
          if (localZ === 0) this.queueChunkRemesh(chunkX, chunkZ - 1);
          if (localZ === CHUNK_SIZE - 1) this.queueChunkRemesh(chunkX, chunkZ + 1);
      }
      return;
    }

    if (chunk) {
      const localX = ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const localZ = ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      chunk.setBlock(localX, localY, localZ, blockType);
    } else {
      console.warn(`Attempted to set block in non-existent active chunk: ${worldX},${worldY},${worldZ}`);
    }
  }

  public notifyChunkUpdate(chunkX: number, chunkZ: number, updatedBlockData: string[][][]): void {
    const key = `${chunkX},${chunkZ}`;
    this.chunkDataStore.set(key, updatedBlockData);
  }

  public queueChunkRemesh(chunkX: number, chunkZ: number): void {
    const key = `${chunkX},${chunkZ}`;
    if (this.activeChunks.has(key)) {
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
