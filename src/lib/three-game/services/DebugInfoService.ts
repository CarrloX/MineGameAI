import type { GameRefs, DebugInfoState } from "../types";
import { CHUNK_SIZE } from "../utils";

export class DebugInfoService {
  private refs: GameRefs;
  private setDebugInfo: (
    updateFn: (prevState: DebugInfoState) => DebugInfoState
  ) => void;

  constructor(
    refs: GameRefs,
    setDebugInfo: (
      updateFn: (prevState: DebugInfoState) => DebugInfoState
    ) => void
  ) {
    this.refs = refs;
    this.setDebugInfo = setDebugInfo;
  }

  public updateDebugInfo() {
    // Early return if required refs are missing
    if (!this.refs?.player || !this.refs?.clock) {
      this.setDebugInfo((prev) => ({
        ...prev,
        position: 'N/A',
        chunk: 'N/A',
        velocity: 'N/A',
        onGround: false,
        fps: 0,
        triangles: this.getTriangleCount(),
        chunks: this.getLoadedChunksCount(),
      }));
      return;
    }

    const { player, clock } = this.refs;
    const fps = clock ? Math.round(1 / clock.getDelta()) : 0;
    
    // Handle case where player position is not available
    if (!player?.position) {
      this.setDebugInfo((prev) => ({
        ...prev,
        position: 'N/A',
        chunk: 'N/A',
        velocity: 'N/A',
        onGround: false,
        fps,
        triangles: this.getTriangleCount(),
        chunks: this.getLoadedChunksCount(),
      }));
      return;
    }

    // Calculate position and chunk info
    const position = player.position;
    const chunkX = Math.floor(position.x / CHUNK_SIZE);
    const chunkZ = Math.floor(position.z / CHUNK_SIZE);
    const currentFps = clock ? Math.round(1 / clock.getDelta()) : 0;

    // Update debug info with all available data
    this.setDebugInfo((prev) => ({
      ...prev,
      position: `${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}`,
      chunk: `X: ${chunkX}, Z: ${chunkZ}`,
      velocity: player.velocity ? player.velocity.toFixed(2) : 'N/A',
      onGround: player.onGround ?? false,
      fps: currentFps,
      triangles: this.getTriangleCount(),
      chunks: this.getLoadedChunksCount(),
    }));
  }

  private getTriangleCount(): number {
    if (!this.refs.scene) return 0;
    
    let triangles = 0;
    this.refs.scene.traverse((object: any) => {
      if (object.isMesh && object.geometry) {
        triangles += object.geometry.index
          ? object.geometry.index.count / 3
          : object.geometry.attributes.position.count / 3;
      }
    });
    
    return Math.round(triangles);
  }

  private getLoadedChunksCount(): number {
    if (!this.refs.world) return 0;
    
    // Return the number of active chunks using the Map's size property
    return this.refs.world.activeChunks.size;
  }

  public toggleDebugInfo(show: boolean) {
    this.setDebugInfo((prev) => ({
      ...prev,
      visible: show,
    }));
  }

  public updateCustomInfo(key: string, value: any) {
    this.setDebugInfo((prev) => ({
      ...prev,
      [key]: value,
    }));
  }
}
