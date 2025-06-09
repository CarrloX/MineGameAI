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

  // Añadir un registro para evitar colocaciones duplicadas
  private _recentBlockOperations: Map<string, number> = new Map();
  private readonly BLOCK_OPERATION_COOLDOWN = 100; // ms

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

    // Crear un array de coordenadas de chunks a cargar, ordenados por distancia al jugador
    const chunksToLoad: { x: number; z: number; distance: number }[] = [];

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
        
        // Si el chunk ya está cargado, no lo agregamos a la lista
        if (!this.activeChunks.has(key)) {
          // Calcular distancia al cuadrado (evita calcular raíz cuadrada)
          const distanceSquared = dChunkX * dChunkX + dChunkZ * dChunkZ;
          chunksToLoad.push({ x: chunkX, z: chunkZ, distance: distanceSquared });
        }
      }
    }

    // Ordenar chunks por distancia (más cercanos primero)
    chunksToLoad.sort((a, b) => a.distance - b.distance);

    // Cargar chunks en orden de cercanía, priorizando los más cercanos
    const MAX_PRIORITY_DISTANCE = 4; // Distancia máxima (en chunks) para prioridad alta
    
    for (const chunk of chunksToLoad) {
      // Determinar si este chunk debe tener prioridad alta
      const isPriority = chunk.distance <= MAX_PRIORITY_DISTANCE * MAX_PRIORITY_DISTANCE;
      this.loadChunk(chunk.x, chunk.z, isPriority);
      
      // Asegurarse de que los chunks adyacentes también se actualizan para evitar problemas de agua en los bordes
      // Solo para chunks que se acaban de cargar y que están a distancia razonable
      if (isPriority) {
        this.ensureAdjacentChunksUpdated(chunk.x, chunk.z);
      }
    }

    // Descargar chunks fuera del rango de renderizado
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

  public loadChunk(chunkX: number, chunkZ: number, priority: boolean = false): void {
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
    
    // Si el chunk es prioritario, procesarlo inmediatamente
    if (priority && this.gameRefs.player) {
      // Procesar este chunk inmediatamente
      newChunk.buildMesh();
    } else {
      // Si no es prioritario, agregarlo a la cola de remallado
      this.queueChunkRemesh(chunkX, chunkZ);
    }
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
      
      // Especial: Para mejorar la continuidad del agua entre chunks
      // Verificar si está cerca de otro chunk con agua en sus bordes
      if (this.mightBeWaterAtChunkBoundary(worldX, worldY, worldZ)) {
        return "waterBlock";
      }
    }
    return "air";
  }

  /**
   * Determina si una posición podría ser agua basándose en chunks vecinos.
   * Esto ayuda a evitar "paredes" de agua en los límites de los chunks.
   */
  private mightBeWaterAtChunkBoundary(worldX: number, worldY: number, worldZ: number): boolean {
    // Si la posición no está cerca del borde de un chunk, no es relevante
    const localX = ((Math.floor(worldX) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((Math.floor(worldZ) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    
    const isNearXBoundary = localX === 0 || localX === CHUNK_SIZE - 1;
    const isNearZBoundary = localZ === 0 || localZ === CHUNK_SIZE - 1;
    
    if (!isNearXBoundary && !isNearZBoundary) {
      return false;
    }
    
    // Calcular qué chunks adyacentes deberíamos verificar
    const chunkX = Math.floor(worldX / CHUNK_SIZE);
    const chunkZ = Math.floor(worldZ / CHUNK_SIZE);
    
    // Direcciones a revisar basadas en la posición en el borde
    const directionsToCheck = [];
    
    if (localX === 0) directionsToCheck.push([-1, 0]);
    if (localX === CHUNK_SIZE - 1) directionsToCheck.push([1, 0]);
    if (localZ === 0) directionsToCheck.push([0, -1]);
    if (localZ === CHUNK_SIZE - 1) directionsToCheck.push([0, 1]);
    
    // Verificar chunks adyacentes
    for (const [dx, dz] of directionsToCheck) {
      const adjacentChunkX = chunkX + dx;
      const adjacentChunkZ = chunkZ + dz;
      const adjacentChunkKey = `${adjacentChunkX},${adjacentChunkZ}`;
      
      // Primero intentar con chunks activos
      const adjacentChunk = this.activeChunks.get(adjacentChunkKey);
      if (adjacentChunk) {
        // Calcular coordenadas locales en el chunk adyacente
        const adjacentLocalX = dx === -1 ? CHUNK_SIZE - 1 : (dx === 1 ? 0 : localX);
        const adjacentLocalZ = dz === -1 ? CHUNK_SIZE - 1 : (dz === 1 ? 0 : localZ);
        
        const blockType = adjacentChunk.getBlock(adjacentLocalX, Math.floor(worldY), adjacentLocalZ);
        if (blockType === "waterBlock") {
          return true;
        }
      } else {
        // Intentar con datos almacenados
        const storedData = this.chunkDataStore.get(adjacentChunkKey);
        if (storedData) {
          const adjacentLocalX = dx === -1 ? CHUNK_SIZE - 1 : (dx === 1 ? 0 : localX);
          const adjacentLocalZ = dz === -1 ? CHUNK_SIZE - 1 : (dz === 1 ? 0 : localZ);
          
          if (storedData[adjacentLocalX]?.[Math.floor(worldY)]?.[adjacentLocalZ] === "waterBlock") {
            return true;
          }
        }
      }
    }
    
    return false;
  }

  public setBlock(
    worldX: number,
    worldY: number,
    worldZ: number,
    blockType: string
  ): boolean {
    // Crear una clave única para esta operación
    const operationKey = `${Math.floor(worldX)},${Math.floor(worldY)},${Math.floor(worldZ)}`;
    const now = Date.now();
    
    // Verificar si hay una operación reciente en estas coordenadas
    if (this._recentBlockOperations.has(operationKey)) {
      const lastOperationTime = this._recentBlockOperations.get(operationKey);
      if (now - lastOperationTime! < this.BLOCK_OPERATION_COOLDOWN) {
        console.log(`Operación de bloque ignorada (demasiado rápida): ${operationKey}`);
        return false; // Ignorar operaciones demasiado rápidas en la misma posición
      }
    }
    
    // Registrar esta operación
    this._recentBlockOperations.set(operationKey, now);
    
    // Limpiar operaciones antiguas ocasionalmente
    if (this._recentBlockOperations.size > 100) {
      const keysToRemove = [];
      for (const [key, time] of this._recentBlockOperations.entries()) {
        if (now - time > this.BLOCK_OPERATION_COOLDOWN * 2) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => this._recentBlockOperations.delete(key));
    }

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
      // Sin embargo, setBlock en los chunks inactivos ahora también pone en cola a los vecinos, lo cual es bueno.
      this.remeshQueue.add(key); // Add to queue regardless, processRemeshQueue will check if active
    }
  }

  public processRemeshQueue(
    maxPerFrame: number = 1,
    playerPosition?: THREE.Vector3
  ): void {
    let processedCount = 0;
    let queueArray = Array.from(this.remeshQueue);

    // Siempre ordenar por distancia al jugador si se proporciona la posición
    if (playerPosition) {
      queueArray.sort((a, b) => {
        const [ax, az] = a.split(",").map(Number);
        const [bx, bz] = b.split(",").map(Number);
        // Calcular el centro del chunk
        const acx = (ax + 0.5) * CHUNK_SIZE;
        const acz = (az + 0.5) * CHUNK_SIZE;
        const bcx = (bx + 0.5) * CHUNK_SIZE;
        const bcz = (bz + 0.5) * CHUNK_SIZE;
        // Calcular distancia al cuadrado (más eficiente que raíz cuadrada)
        const distanceA = (acx - playerPosition.x) ** 2 + (acz - playerPosition.z) ** 2;
        const distanceB = (bcx - playerPosition.x) ** 2 + (bcz - playerPosition.z) ** 2;
        return distanceA - distanceB;
      });
    } else if (this.gameRefs.player) {
      // Si no se proporciona playerPosition pero tenemos acceso al jugador, usamos su posición
      const playerPos = this.gameRefs.player.mesh.position;
      queueArray.sort((a, b) => {
        const [ax, az] = a.split(",").map(Number);
        const [bx, bz] = b.split(",").map(Number);
        const acx = (ax + 0.5) * CHUNK_SIZE;
        const acz = (az + 0.5) * CHUNK_SIZE;
        const bcx = (bx + 0.5) * CHUNK_SIZE;
        const bcz = (bz + 0.5) * CHUNK_SIZE;
        const distanceA = (acx - playerPos.x) ** 2 + (acz - playerPos.z) ** 2;
        const distanceB = (bcx - playerPos.x) ** 2 + (bcz - playerPos.z) ** 2;
        return distanceA - distanceB;
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

  /**
   * Asegura que los chunks adyacentes a un chunk dado estén cargados y actualizados
   * para evitar problemas visuales en los bordes de los chunks con agua
   */
  private ensureAdjacentChunksUpdated(chunkX: number, chunkZ: number): void {
    // Direcciones adyacentes (ortogonales)
    const directions = [
      [1, 0], [-1, 0], [0, 1], [0, -1]
    ];
    
    for (const [dx, dz] of directions) {
      const adjacentX = chunkX + dx;
      const adjacentZ = chunkZ + dz;
      const adjacentKey = `${adjacentX},${adjacentZ}`;
      
      // Si el chunk adyacente ya está cargado, asegurarse de que esté en la cola de remallado
      if (this.activeChunks.has(adjacentKey)) {
        const adjacentChunk = this.activeChunks.get(adjacentKey);
        if (adjacentChunk) {
          this.queueChunkRemesh(adjacentX, adjacentZ);
        }
      }
    }
  }

  /**
   * Precarga inteligente de chunks: predice y comienza a cargar en segundo plano los chunks hacia donde se mueve el jugador.
   * Llama a esto después de mover al jugador, pasando la dirección de movimiento.
   * @param playerPosition Posición actual del jugador
   * @param moveDirection Vector de dirección de movimiento (normalizado)
   * @param prefetchRadius Número de chunks a predecir adelante (por defecto 2)
   */
  public smartPrefetchChunks(playerPosition: THREE.Vector3, moveDirection: THREE.Vector3, prefetchRadius: number = 2) {
    const playerChunkX = Math.floor(playerPosition.x / CHUNK_SIZE);
    const playerChunkZ = Math.floor(playerPosition.z / CHUNK_SIZE);
    // Predecir los próximos N chunks en la dirección de movimiento
    for (let i = 1; i <= prefetchRadius; i++) {
      const predX = playerPosition.x + moveDirection.x * CHUNK_SIZE * i;
      const predZ = playerPosition.z + moveDirection.z * CHUNK_SIZE * i;
      const chunkX = Math.floor(predX / CHUNK_SIZE);
      const chunkZ = Math.floor(predZ / CHUNK_SIZE);
      const key = `${chunkX},${chunkZ}`;
      if (!this.activeChunks.has(key)) {
        // Si el chunk no está activo, inicia su carga en background (baja prioridad)
        this.loadChunk(chunkX, chunkZ, false);
      }
    }
  }
}

