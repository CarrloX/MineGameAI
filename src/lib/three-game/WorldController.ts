import type { GameRefs } from "./types";
import * as THREE from "three";

export class WorldController {
  private refs: GameRefs;

  constructor(refs: GameRefs) {
    this.refs = refs;
  }

  /**
   * Actualiza el mundo y realiza frustum culling de los chunks.
   * @param frustum Frustum de la cámara para visibilidad
   * @param cameraMoved Indica si la cámara se ha movido significativamente
   * @param maxRemeshPerFrame Número máximo de remallados por frame
   * @returns número de chunks visibles
   */
  update(frustum?: THREE.Frustum, cameraMoved: boolean = true, maxRemeshPerFrame: number = 2) {
    const refs = this.refs;
    if (!refs.world || !refs.player) return 0;
    const playerMesh = refs.player.mesh;
    const world = refs.world;
    
    // Actualiza los chunks activos (carga/descarga)
    world.updateChunks(playerMesh.position);

    // Permitir ajustar dinámicamente el remallado por frame según el rendimiento
    let MAX_REMESH_PER_FRAME = maxRemeshPerFrame;

    if (world.getRemeshQueueSize() > 0) {
      world.processRemeshQueue(MAX_REMESH_PER_FRAME, playerMesh.position);
    }

    // Priorizar remallados asíncronos en chunks cercanos al jugador
    if (world.activeChunks.size > 0) {
      const playerPosition = playerMesh.position;
      const playerChunkX = Math.floor(playerPosition.x / 16);
      const playerChunkZ = Math.floor(playerPosition.z / 16);
      
      // Crear una lista ordenada de chunks por distancia al jugador
      const chunksToProcess = Array.from(world.activeChunks.entries())
        .map(([key, chunk]) => {
          const [chunkX, chunkZ] = key.split(',').map(Number);
          const distanceSquared = 
            (chunkX - playerChunkX) * (chunkX - playerChunkX) + 
            (chunkZ - playerChunkZ) * (chunkZ - playerChunkZ);
          return { key, chunk, distanceSquared };
        })
        .sort((a, b) => a.distanceSquared - b.distanceSquared);
      
      // Procesar primero los chunks más cercanos
      let remeshesThisFrame = 0;
      for (const { chunk } of chunksToProcess) {
        if (remeshesThisFrame >= MAX_REMESH_PER_FRAME) break;
        if (chunk.needsMeshUpdate && !(chunk as any).isRemeshing) {
          chunk.updateMeshIfNeededAsync();
          remeshesThisFrame++;
        }
      }
    }

    // Frustum culling y visibilidad
    let visibleChunksCount = 0;
    // Solo hacer frustum culling si la cámara se ha movido significativamente
    if (frustum && cameraMoved) {
      world.activeChunks.forEach((chunk) => {
        if (chunk && chunk.chunkRoot && chunk.boundingBox) {
          const isVisible = frustum.intersectsBox(chunk.boundingBox);
          chunk.chunkRoot.visible = isVisible;
          if (isVisible) visibleChunksCount++;
        } else {
          if (chunk && chunk.chunkRoot) chunk.chunkRoot.visible = false;
        }
      });
    } else if (!frustum) {
      // Si no hay frustum, asegurarse de que todos los chunks estén visibles
      world.activeChunks.forEach((chunk) => {
        if (chunk && chunk.chunkRoot) chunk.chunkRoot.visible = true;
      });
      visibleChunksCount = world.activeChunks.size;
    }
    return visibleChunksCount;
  }
}
