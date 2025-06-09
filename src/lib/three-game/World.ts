import * as THREE from "three";
import type { Block } from "./Block";
import { Chunk } from "./Chunk";
import { CHUNK_SIZE } from "./utils";
import type { GameRefs } from "./types";

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
  public renderDistanceInChunks: number = 8; // Cambiado de 4 a 8
  private remeshQueue: Set<string>;

  public worldSeed: string;

  public debugMaterialMode: "none" | "light" | "materialId" = "none";

  constructor(refs: GameRefs, seed: string) {
    this.gameRefs = refs;
    this.worldSeed = seed;
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
      console.error(
        "World: Block prototypes not found in gameRefs. Ensure ThreeSetup populates gameRefs.blocks."
      );
    } else {
      this.gameRefs.blocks.forEach((block: Block) => {
        const blockNameKey = block.mesh.name.startsWith("Block_")
          ? block.mesh.name.substring(6)
          : block.mesh.name;
        this.blockPrototypes.set(blockNameKey, block);
      });
    }
  }

  public getSpawnHeight(
    worldX: number,
    worldZ: number,
    ensureSolidGround: boolean = false
  ): number {
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
        const tempChunk = new Chunk(
          this,
          chunkX,
          chunkZ,
          this.blockPrototypes,
          undefined,
          parseInt(this.worldSeed)
        );
        blockData = tempChunk.blocks;
        // DO NOT store tempChunk.blocks in chunkDataStore here for getSpawnHeight if it's just a temporary read
      }
    }

    if (!blockData) {
      console.error(
        `getSpawnHeight: Critical error - block data for chunk ${key} could not be obtained. Returning default height.`
      );
      return Math.floor(this.layers / 2.5) + 1;
    }

    const localX =
      ((Math.floor(worldX) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ =
      ((Math.floor(worldZ) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    for (let y = this.layers - 1; y >= 0; y--) {
      const currentBlock = blockData[localX]?.[y]?.[localZ];
      if (currentBlock !== undefined) {
        if (ensureSolidGround) {
          if (currentBlock !== "air" && currentBlock !== "waterBlock") {
            return y + 1; // Spawn on top of this solid block
          }
        } else {
          if (currentBlock !== "air") {
            return y + 1; // Spawn on top of any non-air block
          }
        }
      }
    }
    console.warn(
      `getSpawnHeight: No suitable block found at (${worldX}, ${worldZ}) with ensureSolidGround=${ensureSolidGround}. Returning default base height.`
    );
    return Math.floor(this.layers / 3) + 1;
  }

  public updateChunks(playerPosition: THREE.Vector3): void {
    const playerChunkX = Math.floor(playerPosition.x / CHUNK_SIZE);
    const playerChunkZ = Math.floor(playerPosition.z / CHUNK_SIZE);

    for (
      let dChunkX = -this.renderDistanceInChunks;
      dChunkX <= this.renderDistanceInChunks;
      dChunkX++
    ) {
      for (
        let dChunkZ = -this.renderDistanceInChunks;
        dChunkZ <= this.renderDistanceInChunks;
        dChunkZ++
      ) {
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
      if (
        dx > this.renderDistanceInChunks ||
        dz > this.renderDistanceInChunks
      ) {
        chunksToUnloadKeys.push(key);
      }
    });

    chunksToUnloadKeys.forEach((key) => this.unloadChunkByKey(key));
  }

  public updateChunkVisibility(
    camera: THREE.PerspectiveCamera,
    frustum: THREE.Frustum
  ): void {
    if (!camera || !frustum) return; // Asegurarse de que el frustum también esté presente

    // The frustum is now updated in GameLogic.update, so we don't need to do it here.
    // camera.updateMatrixWorld(true);
    // this.projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    // this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

    this.activeChunks.forEach((chunk) => {
      if (!chunk.chunkRoot) return;

      // Use the isChunkInFrustum method with the passed-in frustum
      if (this.isChunkInFrustum(frustum, chunk)) {
        chunk.chunkRoot.visible = true;
      } else {
        chunk.chunkRoot.visible = false;
      }
    });
  }

  public loadChunk(chunkX: number, chunkZ: number): void {
    const key = `${chunkX},${chunkZ}`;
    if (this.activeChunks.has(key)) return;

    const existingBlockData = this.chunkDataStore.get(key);
    const newChunk = new Chunk(
      this,
      chunkX,
      chunkZ,
      this.blockPrototypes,
      existingBlockData,
      parseInt(this.worldSeed)
    );

    if (!existingBlockData && newChunk.wasGenerated) {
      // Only store if freshly generated
      this.chunkDataStore.set(key, newChunk.blocks);
    }

    this.activeChunks.set(key, newChunk);
    if (this.gameRefs.scene) {
      this.gameRefs.scene.add(newChunk.chunkRoot);
    } else {
      console.error(
        "World: Scene not available in gameRefs when trying to load chunk."
      );
    }
    this.queueChunkRemesh(chunkX, chunkZ);
  }

  private unloadChunkByKey(key: string): void {
    const chunk = this.activeChunks.get(key);
    if (chunk) {
      if (chunk.wasGenerated) {
        // If it was generated, ensure its data is in the store before unload.
        this.chunkDataStore.set(key, chunk.blocks);
      }
      if (this.gameRefs.scene) {
        this.gameRefs.scene.remove(chunk.chunkRoot);
      }
      chunk.dispose();
      this.activeChunks.delete(key);
    }
  }

  public getBlock(
    worldX: number,
    worldY: number,
    worldZ: number
  ): string | null {
    const chunkX = Math.floor(worldX / CHUNK_SIZE);
    const chunkZ = Math.floor(worldZ / CHUNK_SIZE);
    const localY = Math.floor(worldY);

    if (localY < 0 || localY >= this.layers) return "air";

    const key = `${chunkX},${chunkZ}`;
    const chunk = this.activeChunks.get(key);

    if (chunk) {
      const localX =
        ((Math.floor(worldX) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const localZ =
        ((Math.floor(worldZ) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      return chunk.getBlock(localX, localY, localZ);
    } else {
      const storedData = this.chunkDataStore.get(key);
      if (storedData) {
        const localX =
          ((Math.floor(worldX) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const localZ =
          ((Math.floor(worldZ) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        if (storedData[localX]?.[localY]?.[localZ] !== undefined) {
          return storedData[localX][localY][localZ];
        }
      }
    }
    return "air";
  }

  public setBlock(
    worldX: number,
    worldY: number,
    worldZ: number,
    blockType: string
  ): boolean {
    const cX = Math.floor(worldX / CHUNK_SIZE);
    const cZ = Math.floor(worldZ / CHUNK_SIZE);
    const lY = Math.floor(worldY);

    if (lY < 0 || lY >= this.layers) {
      console.warn(
        `Attempted to set block out of Y bounds: ${worldX},${worldY},${worldZ}`
      );
      return false;
    }

    const key = `${cX},${cZ}`;
    let chunk = this.activeChunks.get(key);

    if (!chunk) {
      let blockData = this.chunkDataStore.get(key);
      let wasChunkGenerated = false;
      if (!blockData) {
        const tempChunkGen = new Chunk(
          this,
          cX,
          cZ,
          this.blockPrototypes,
          undefined,
          parseInt(this.worldSeed)
        );
        blockData = tempChunkGen.blocks;
        wasChunkGenerated = tempChunkGen.wasGenerated;
        if (wasChunkGenerated) {
          this.chunkDataStore.set(key, blockData);
        }
      }
      const lX = ((Math.floor(worldX) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const lZ = ((Math.floor(worldZ) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

      if (blockData[lX]?.[lY]?.[lZ] !== blockType) {
        if (!blockData[lX]) blockData[lX] = [];
        if (!blockData[lX][lY]) blockData[lX][lY] = [];
        blockData[lX][lY][lZ] = blockType;
        this.chunkDataStore.set(key, blockData); // Ensure updated data is stored

        this.queueChunkRemesh(cX, cZ);
        // Queue neighbors for remesh, as this block change might affect their visible faces
        if (lX === 0) this.queueChunkRemesh(cX - 1, cZ);
        if (lX === CHUNK_SIZE - 1) this.queueChunkRemesh(cX + 1, cZ);
        if (lZ === 0) this.queueChunkRemesh(cX, cZ - 1);
        if (lZ === CHUNK_SIZE - 1) this.queueChunkRemesh(cX, cZ + 1);
        return true;
      }
      return false;
    }

    // If chunk is active, just call its setBlock method
    const localX =
      ((Math.floor(worldX) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ =
      ((Math.floor(worldZ) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return chunk.setBlock(localX, lY, localZ, blockType);
  }

  public notifyChunkUpdate(
    chunkX: number,
    chunkZ: number,
    updatedBlockData: string[][][]
  ): void {
    const key = `${chunkX},${chunkZ}`;
    this.chunkDataStore.set(key, updatedBlockData);
  }

  public queueChunkRemesh(chunkX: number, chunkZ: number): void {
    const key = `${chunkX},${chunkZ}`;
    const chunk = this.activeChunks.get(key);
    if (chunk) {
      // Only mark for remesh if it's an active chunk
      chunk.needsMeshUpdate = true;
      this.remeshQueue.add(key);
    } else {
      // If chunk is not active, but we need to remesh it (e.g. after setBlock on non-active chunk data)
      // we still add it to the queue. ProcessRemeshQueue will handle loading it if necessary,
      // or simply process its stored data if that becomes the strategy.
      // For now, let's assume processRemeshQueue only acts on activeChunks.
      // So if a non-active chunk is modified, it will remesh when it becomes active.
      // To force remesh on inactive, it would need to be loaded first.
      // However, setBlock on inactive chunks now also queues neighbors, which is good.
      this.remeshQueue.add(key); // Add to queue regardless, processRemeshQueue will check if active
    }
  }

  public processRemeshQueue(
    maxPerFrame: number = 1,
    playerPosition?: THREE.Vector3
  ): void {
    let processedCount = 0;
    let queueArray = Array.from(this.remeshQueue);

    // Si se pasa la posición del jugador, ordenar por distancia al centro del chunk
    if (playerPosition) {
      queueArray.sort((a, b) => {
        const [ax, az] = a.split(",").map(Number);
        const [bx, bz] = b.split(",").map(Number);
        const acx = (ax + 0.5) * CHUNK_SIZE;
        const acz = (az + 0.5) * CHUNK_SIZE;
        const bcx = (bx + 0.5) * CHUNK_SIZE;
        const bcz = (bz + 0.5) * CHUNK_SIZE;
        const da =
          (acx - playerPosition.x) ** 2 + (acz - playerPosition.z) ** 2;
        const db =
          (bcx - playerPosition.x) ** 2 + (bcz - playerPosition.z) ** 2;
        return da - db;
      });
    }

    for (const key of queueArray) {
      if (processedCount >= maxPerFrame) break;

      const chunk = this.activeChunks.get(key);
      if (chunk && chunk.needsMeshUpdate) {
        chunk.buildMesh(); // buildMesh sets needsMeshUpdate to false
      }
      this.remeshQueue.delete(key);
      processedCount++;
    }
  }

  public getRemeshQueueSize(): number {
    return this.remeshQueue.size;
  }

  public isChunkInFrustum(frustum: THREE.Frustum, chunk: Chunk): boolean {
    if (!chunk.chunkRoot || !chunk.chunkRoot.children) {
      return false; // Cannot check frustum if chunk root or children are missing
    }

    // Check if any mesh within the chunk intersects the frustum
    for (const child of chunk.chunkRoot.children) {
      if (child instanceof THREE.Mesh) {
        if (frustum.intersectsObject(child)) {
          return true; // At least one mesh is visible
        }
      }
    }

    return false; // No meshes in the chunk are visible within the frustum
  }

  public setDebugMaterialMode(mode: "none" | "light" | "materialId") {
    this.debugMaterialMode = mode;
    // Forzar remallado de todos los chunks activos para aplicar el material debug
    for (const [key, chunk] of this.activeChunks) {
      chunk.needsMeshUpdate = true;
      this.remeshQueue.add(key);
    }
  }
}
