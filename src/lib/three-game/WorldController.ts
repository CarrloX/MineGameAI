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
    this.refs.world.updateChunks(this.refs.player.mesh.position);
    this.refs.world.processRemeshQueue(1);
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
