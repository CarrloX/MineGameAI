
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
  public activeChunks: Map<string, Chunk>;
  private chunkDataStore: Map<string, string[][][]>;
  private blockPrototypes: Map<string, Block>;
  private renderDistanceInChunks: number = 4;
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

    const shadowCameraCoverage = CHUNK_SIZE * (this.renderDistanceInChunks + 3);
    this.lighting.directional.name = "Directional Light";
    this.lighting.directional.position.set(shadowCameraCoverage / 2, this.skyHeight, shadowCameraCoverage / 2);
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
      const tempChunk = new Chunk(this, chunkX, chunkZ, this.blockPrototypes);
      blockData = tempChunk.blocks;
      this.chunkDataStore.set(key, blockData); // Store newly generated data
    }

    const localX = ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    for (let y = this.layers - 1; y >= 0; y--) {
      if (blockData && blockData[localX] && blockData[localX][y] && blockData[localX][y][localZ] !== 'air') {
        return y + 1; // Player's feet should be 1 unit above the topmost solid block
      }
    }
    // Fallback if no solid ground is found (e.g. spawned over void, though terrain gen should prevent this)
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

    camera.updateMatrixWorld(true); // Ensure matrix is up-to-date
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
        const chunkSizeVec = new THREE.Vector3(CHUNK_SIZE, this.layers, CHUNK_SIZE); 
        const chunkBox = new THREE.Box3().setFromCenterAndSize(chunkCenterVec, chunkSizeVec);

        if (!this.frustum.intersectsBox(chunkBox)) {
            chunk.chunkRoot.visible = false;
            return;
        }
        
        const vectorToChunk = new THREE.Vector3().subVectors(chunkCenterVec, camera.position);
        const distanceToChunk = vectorToChunk.length();
        vectorToChunk.normalize(); 

        const dotProduct = playerDirection.dot(vectorToChunk);
        
        const pitch = camera.rotation.x; 
        const lookingDownFactor = Math.max(0, Math.sin(pitch)); 
        
        let dynamicDotThreshold = -0.4 + (lookingDownFactor * 0.3); 
        dynamicDotThreshold = Math.min(-0.1, dynamicDotThreshold);

        const dynamicDistanceThreshold = CHUNK_SIZE * 2.0; 

        if (dotProduct < dynamicDotThreshold && distanceToChunk > dynamicDistanceThreshold) { 
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
    this.gameRefs.scene!.add(newChunk.chunkRoot);
    this.remeshQueue.add(key);
  }

  private unloadChunkByKey(key: string): void {
    const chunk = this.activeChunks.get(key);
    if (chunk) {
      this.chunkDataStore.set(key, chunk.blocks); // Save current state before unloading

      this.gameRefs.scene!.remove(chunk.chunkRoot);
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
      // If chunk is not active, modify its data in chunkDataStore directly
      let blockData = this.chunkDataStore.get(key);
      if (!blockData) { // If chunk data doesn't exist at all, create it (e.g. from template)
          const tempChunkGen = new Chunk(this, chunkX, chunkZ, this.blockPrototypes);
          blockData = tempChunkGen.blocks;
      }
      const localX = ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const localZ = ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      if (blockData[localX] && blockData[localX][localY] && blockData[localX][localY][localZ] !== blockType) {
          blockData[localX][localY][localZ] = blockType;
          this.chunkDataStore.set(key, blockData); 
          
          // If this chunk ever becomes active, it will need remeshing
          // For now, we don't add to remeshQueue as it's not active.
          // However, its neighbors might be active and need remeshing.
          if (localX === 0) this.queueChunkRemesh(chunkX - 1, chunkZ);
          if (localX === CHUNK_SIZE - 1) this.queueChunkRemesh(chunkX + 1, chunkZ);
          if (localZ === 0) this.queueChunkRemesh(chunkX, chunkZ - 1);
          if (localZ === CHUNK_SIZE - 1) this.queueChunkRemesh(chunkX, chunkZ + 1);
      }
      return;
    }


    // If chunk is active, use its setBlock method
    if (chunk) {
      const localX = ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const localZ = ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      chunk.setBlock(localX, localY, localZ, blockType); // This will mark for remesh & notify world
      // this.remeshQueue.add(key); // Chunk.setBlock already queues itself via world.queueChunkRemesh
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
    