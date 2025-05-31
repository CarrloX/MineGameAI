
import * as THREE from 'three';
import type { Block } from './Block';
import { Chunk } from './Chunk';
import { CHUNK_SIZE } from './utils';
import type { GameRefs } from './types';

export class World {
  public size: number; // Old parameter, less relevant with chunks but can define initial area or bounds
  public layers: number; // Defines the height of each chunk in blocks
  public skyHeight: number;
  public voidHeight: number;
  public skyColor: number;
  public lightColor: number;
  public gravity: number;
  public lighting: { ambient: THREE.AmbientLight; directional: THREE.DirectionalLight };
  
  private gameRefs: GameRefs;
  private chunks: Map<string, Chunk>;
  private blockPrototypes: Map<string, Block>;
  private renderDistanceInChunks: number = 4; // Render distance in chunks (radius)
  private remeshQueue: Set<string>; // Chunks needing mesh update (key: "chunkX,chunkZ")


  constructor(gameRefs: GameRefs) {
    this.gameRefs = gameRefs;
    this.size = 128; // Can be seen as max world boundary if needed, or initial exploration area
    this.layers = 16; // Each chunk will be 16 blocks high.
    this.skyHeight = this.layers * 2; // Arbitrary skybox height
    this.voidHeight = 64; // How far player can fall before "dying"
    this.skyColor = 0xf1f1f1;
    this.lightColor = 0xffffff;
    this.gravity = 0.004;
    this.chunks = new Map();
    this.remeshQueue = new Set();
    this.blockPrototypes = new Map();
    this.gameRefs.blocks?.forEach(block => {
      this.blockPrototypes.set(block.mesh.name.replace('Block_', ''), block);
    });
    
    const scene = this.gameRefs.scene!;

    this.lighting = {
      ambient: new THREE.AmbientLight(this.lightColor, 0.75),
      directional: new THREE.DirectionalLight(this.lightColor, 0.5),
    };

    this.lighting.ambient.name = "Ambient Light";
    scene.add(this.lighting.ambient);
    
    const shadowCameraSize = CHUNK_SIZE * (this.renderDistanceInChunks + 1);
    this.lighting.directional.name = "Directional Light";
    this.lighting.directional.position.set(shadowCameraSize / 2, this.skyHeight, shadowCameraSize / 2);
    this.lighting.directional.castShadow = true;
    this.lighting.directional.shadow.camera = new THREE.OrthographicCamera(
      -shadowCameraSize, shadowCameraSize, shadowCameraSize, -shadowCameraSize, 0.5, this.skyHeight * 2
    );
    this.lighting.directional.shadow.mapSize = new THREE.Vector2(2048, 2048); // Increased shadow map size
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

    // Ensure the chunk is loaded and its terrain data generated if it doesn't exist
    if (!chunk) {
      // console.warn(`Spawn height requested for non-existent or non-generated chunk: ${chunkX},${chunkZ}. Loading it.`);
      this.loadChunk(chunkX, chunkZ); // This will generate terrain data and queue for mesh
      chunk = this.chunks.get(key);
      if (!chunk) { // If still not found after load attempt
        // console.error(`Failed to load chunk ${chunkX},${chunkZ} for spawn height. Defaulting.`);
        return this.layers + 2; // Default high spawn if chunk truly fails to load
      }
      // If the chunk was just loaded, its mesh might not be built.
      // For spawn height, we rely on its .blocks data which is set by generateTerrainData.
    }


    // Iterate from the top of the chunk's block data downwards
    for (let y = this.layers - 1; y >= 0; y--) {
      const blockType = chunk.getBlock(
        ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
        y, // local Y within chunk
        ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
      );
      if (blockType && blockType !== 'air') {
        return chunk.worldY + y + 1.7; // Player height is 1.7, spawn just on top
      }
    }
    // Fallback: if no solid block found in the column (e.g., entire column is air)
    return chunk.worldY + this.layers / 2; // Spawn in middle of chunk height as a last resort
  }


  public updateChunks(playerPosition: THREE.Vector3): void {
    const playerChunkX = Math.floor(playerPosition.x / CHUNK_SIZE);
    const playerChunkZ = Math.floor(playerPosition.z / CHUNK_SIZE);

    // Load/unload chunks based on player position
    for (let dChunkX = -this.renderDistanceInChunks; dChunkX <= this.renderDistanceInChunks; dChunkX++) {
      for (let dChunkZ = -this.renderDistanceInChunks; dChunkZ <= this.renderDistanceInChunks; dChunkZ++) {
        const chunkX = playerChunkX + dChunkX;
        const chunkZ = playerChunkZ + dChunkZ;
        this.loadChunk(chunkX, chunkZ); // loadChunk is idempotent and handles existing chunks
      }
    }

    // Unload distant chunks
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

  private loadChunk(chunkX: number, chunkZ: number): void {
    const key = `${chunkX},${chunkZ}`;
    if (!this.chunks.has(key)) {
      const newChunk = new Chunk(this, chunkX, chunkZ, this.blockPrototypes);
      newChunk.generateTerrainData(); // Generate block data
      this.chunks.set(key, newChunk);
      this.gameRefs.scene!.add(newChunk.chunkRoot);
      this.remeshQueue.add(key); // Add to queue for mesh building
      // console.log(`Loaded chunk: ${key}`);
    }
  }
  
  private unloadChunkByKey(key: string): void {
    const chunk = this.chunks.get(key);
    if (chunk) {
      this.gameRefs.scene!.remove(chunk.chunkRoot);
      chunk.dispose(); // Clean up Three.js resources
      this.chunks.delete(key);
      this.remeshQueue.delete(key); // Remove from remesh queue if it was there
      // console.log(`Unloaded chunk: ${key}`);
    }
  }

  public getBlock(worldX: number, worldY: number, worldZ: number): string | null {
    const chunkX = Math.floor(worldX / CHUNK_SIZE);
    const chunkZ = Math.floor(worldZ / CHUNK_SIZE);
    // Assuming chunks are stacked starting from worldY = 0.
    // For multiple vertical chunk layers, this would need to find the correct chunkY.
    const localY = worldY; // If chunk.worldY is always 0, worldY is localY.

    const key = `${chunkX},${chunkZ}`;
    const chunk = this.chunks.get(key);

    if (chunk && localY >= 0 && localY < this.layers) {
      const localX = ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const localZ = ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      return chunk.getBlock(localX, localY, localZ);
    }
    return 'air'; // Treat outside loaded chunks or out of vertical bounds as air for simplicity
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
      this.remeshQueue.add(key); // Ensure this chunk gets remeshed
    } else {
      console.warn(`Attempted to set block in non-existent or out-of-bounds chunk: ${worldX},${worldY},${worldZ}`);
    }
  }
  
  public queueChunkRemesh(chunkX: number, chunkZ: number): void {
    const key = `${chunkX},${chunkZ}`;
    if (this.chunks.has(key)) {
      this.remeshQueue.add(key);
    }
  }

  public processRemeshQueue(maxPerFrame: number = 1): void {
    let processedCount = 0;
    const queueArray = Array.from(this.remeshQueue); // Process in order of addition (roughly)
    
    for (const key of queueArray) {
      if (processedCount >= maxPerFrame) break;
      
      const chunk = this.chunks.get(key);
      if (chunk) {
        chunk.buildMesh();
        // console.log(`Remeshed chunk: ${key}`);
      }
      this.remeshQueue.delete(key); // Remove from queue after processing
      processedCount++;
    }
  }
  
  public getRemeshQueueSize(): number {
    return this.remeshQueue.size;
  }
}
