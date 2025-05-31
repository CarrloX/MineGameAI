
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
  private chunks: Map<string, Chunk>;
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
    this.skyColor = 0xf1f1f1;
    this.lightColor = 0xffffff;
    this.gravity = 0.004;
    this.chunks = new Map();
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
    
    const shadowCameraCoverage = CHUNK_SIZE * (this.renderDistanceInChunks + 2); // Increased buffer for shadows
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
    let chunk = this.chunks.get(key);

    if (!chunk) {
      this.loadChunk(chunkX, chunkZ); 
      chunk = this.chunks.get(key);
      if (!chunk) { 
        return this.layers + 2; 
      }
    }

    for (let y = this.layers - 1; y >= 0; y--) {
      const blockType = chunk.getBlock(
        ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
        y, 
        ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
      );
      if (blockType && blockType !== 'air') {
        return chunk.worldY + y + 1.7; 
      }
    }
    return chunk.worldY + this.layers / 2; 
  }


  public updateChunks(playerPosition: THREE.Vector3): void {
    const playerChunkX = Math.floor(playerPosition.x / CHUNK_SIZE);
    const playerChunkZ = Math.floor(playerPosition.z / CHUNK_SIZE);

    for (let dChunkX = -this.renderDistanceInChunks; dChunkX <= this.renderDistanceInChunks; dChunkX++) {
      for (let dChunkZ = -this.renderDistanceInChunks; dChunkZ <= this.renderDistanceInChunks; dChunkZ++) {
        const chunkX = playerChunkX + dChunkX;
        const chunkZ = playerChunkZ + dChunkZ;
        this.loadChunk(chunkX, chunkZ); 
      }
    }

    const chunksToUnload: string[] = [];
    this.chunks.forEach((chunk, key) => {
      const dx = Math.abs(chunk.worldX - playerChunkX);
      const dz = Math.abs(chunk.worldZ - playerChunkZ);
      if (dx > this.renderDistanceInChunks || dz > this.renderDistanceInChunks) {
        chunksToUnload.push(key);
      }
    });

    chunksToUnload.forEach(key => this.unloadChunkByKey(key));
  }

  public updateChunkVisibility(camera: THREE.PerspectiveCamera): void {
    if (!camera) return;

    camera.updateMatrixWorld(); 
    this.projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

    const playerDirection = new THREE.Vector3();
    camera.getWorldDirection(playerDirection);

    this.chunks.forEach(chunk => {
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
        const distanceToChunk = vectorToChunk.length(); // Use length() for actual distance
        vectorToChunk.normalize(); // Normalize after getting length for dot product

        const dotProduct = playerDirection.dot(vectorToChunk);
        
        // Tune these thresholds as needed:
        // dotProduct < -0.3 means chunk is generally behind.
        // distanceToChunk > CHUNK_SIZE * 1.5 ensures we don't cull chunks player is very close to or inside.
        if (dotProduct < -0.3 && distanceToChunk > CHUNK_SIZE * 1.5) { 
            chunk.chunkRoot.visible = false;
        } else {
            chunk.chunkRoot.visible = true;
        }
    });
  }

  private loadChunk(chunkX: number, chunkZ: number): void {
    const key = `${chunkX},${chunkZ}`;
    if (!this.chunks.has(key)) {
      const newChunk = new Chunk(this, chunkX, chunkZ, this.blockPrototypes);
      newChunk.generateTerrainData(); 
      this.chunks.set(key, newChunk);
      this.gameRefs.scene!.add(newChunk.chunkRoot);
      this.remeshQueue.add(key); 
    }
  }
  
  private unloadChunkByKey(key: string): void {
    const chunk = this.chunks.get(key);
    if (chunk) {
      this.gameRefs.scene!.remove(chunk.chunkRoot);
      chunk.dispose(); 
      this.chunks.delete(key);
      this.remeshQueue.delete(key); 
    }
  }

  public getBlock(worldX: number, worldY: number, worldZ: number): string | null {
    const chunkX = Math.floor(worldX / CHUNK_SIZE);
    const chunkZ = Math.floor(worldZ / CHUNK_SIZE);
    const localY = worldY; 

    const key = `${chunkX},${chunkZ}`;
    const chunk = this.chunks.get(key);

    if (chunk && localY >= 0 && localY < this.layers) {
      const localX = ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const localZ = ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      return chunk.getBlock(localX, localY, localZ);
    }
    return 'air'; 
  }

  public setBlock(worldX: number, worldY: number, worldZ: number, blockType: string): void {
    const chunkX = Math.floor(worldX / CHUNK_SIZE);
    const chunkZ = Math.floor(worldZ / CHUNK_SIZE);
    const localY = worldY;

    const key = `${chunkX},${chunkZ}`;
    const chunk = this.chunks.get(key);

    if (chunk && localY >= 0 && localY < this.layers) {
      const localX = ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const localZ = ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      chunk.setBlock(localX, localY, localZ, blockType);
      this.remeshQueue.add(key); 

      // Queue neighbors for remesh if block is on a chunk boundary
      if (localX === 0) this.queueChunkRemesh(chunkX - 1, chunkZ);
      if (localX === CHUNK_SIZE - 1) this.queueChunkRemesh(chunkX + 1, chunkZ);
      if (localZ === 0) this.queueChunkRemesh(chunkX, chunkZ - 1);
      if (localZ === CHUNK_SIZE - 1) this.queueChunkRemesh(chunkX, chunkZ + 1);

    } else {
      console.warn(`Attempted to set block in non-existent or out-of-bounds chunk: ${worldX},${worldY},${worldZ}`);
    }
  }
  
  public queueChunkRemesh(chunkX: number, chunkZ: number): void {
    const key = `${chunkX},${chunkZ}`;
    if (this.chunks.has(key)) { // Only queue if chunk exists
      const chunk = this.chunks.get(key);
      if(chunk) chunk.needsMeshUpdate = true; // Mark for remesh
      this.remeshQueue.add(key);
    }
  }

  public processRemeshQueue(maxPerFrame: number = 1): void {
    let processedCount = 0;
    const queueArray = Array.from(this.remeshQueue); 
    
    for (const key of queueArray) {
      if (processedCount >= maxPerFrame) break;
      
      const chunk = this.chunks.get(key);
      if (chunk && chunk.needsMeshUpdate) { // Check if it actually needs remeshing
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
