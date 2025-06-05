import type { GameRefs } from './types';
import * as THREE from 'three';

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

    // Llama al remallado asíncrono en todos los chunks que lo necesiten
    this.refs.world.activeChunks.forEach(chunk => {
      chunk.updateMeshIfNeededAsync();
    });

    // Limita el número de remallados asíncronos por frame
    const MAX_REMESH_PER_FRAME = 2; // Puedes ajustar este valor según el rendimiento deseado
    let remeshesThisFrame = 0;
    for (const chunk of this.refs.world.activeChunks.values()) {
      if (remeshesThisFrame >= MAX_REMESH_PER_FRAME) break;
      if (chunk.needsMeshUpdate && !(chunk as any).isRemeshing) {
        chunk.updateMeshIfNeededAsync();
        remeshesThisFrame++;
      }
    }

    // Frustum culling y visibilidad
    let visibleChunksCount = 0;
    if (frustum) {
      this.refs.world.activeChunks.forEach(chunk => {
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
