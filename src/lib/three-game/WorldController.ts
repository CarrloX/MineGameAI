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
   * @returns número de chunks visibles
   */
  update(frustum?: THREE.Frustum) {
    if (!this.refs.world || !this.refs.player) return 0;
    
    // Actualiza los chunks activos (carga/descarga)
    this.refs.world.updateChunks(this.refs.player.mesh.position);

    // Procesar la cola de remallado con prioridad para chunks cercanos
    const MAX_REMESH_PER_FRAME = 2; 
    if (this.refs.world.getRemeshQueueSize() > 0) {
      this.refs.world.processRemeshQueue(MAX_REMESH_PER_FRAME, this.refs.player.mesh.position);
    }

    // Priorizar remallados asíncronos en chunks cercanos al jugador
    if (this.refs.world.activeChunks.size > 0) {
      const playerPosition = this.refs.player.mesh.position;
      const playerChunkX = Math.floor(playerPosition.x / 16);
      const playerChunkZ = Math.floor(playerPosition.z / 16);
      
      // Crear una lista ordenada de chunks por distancia al jugador
      const chunksToProcess = Array.from(this.refs.world.activeChunks.entries())
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
    if (frustum) {
      this.refs.world.activeChunks.forEach((chunk) => {
        if (chunk && chunk.chunkRoot && chunk.boundingBox) {
          const isVisible = frustum.intersectsBox(chunk.boundingBox);
          chunk.chunkRoot.visible = isVisible;
          if (isVisible) visibleChunksCount++;
        } else {
          if (chunk && chunk.chunkRoot) chunk.chunkRoot.visible = false;
        }
      });
    }
    return visibleChunksCount;
  }
}
