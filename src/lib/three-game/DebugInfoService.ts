import type { GameRefs, DebugInfoState } from "./types";
import { CHUNK_SIZE } from "./utils";

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

  updateDebugInfo(newFpsValue?: number) {
    const refs = this.refs;
    if (!refs.player || !refs.world) return;
    const player = refs.player;
    const playerPosStr = `Player: X:${player.x.toFixed(
      2
    )}, Y:${player.y.toFixed(2)}, Z:${player.z.toFixed(2)}`;
    const playerChunkX = Math.floor(player.x / CHUNK_SIZE);
    const playerChunkZ = Math.floor(player.z / CHUNK_SIZE);
    const playerChunkStr = `Chunk: CX:${playerChunkX}, CZ:${playerChunkZ}`;

    let rayTargetStr = "Ray: None";
    let highlightFaceDir = "Inactive";
    if (player.lookingAt) {
      const { object, distance, blockWorldCoords, worldFaceNormal } =
        player.lookingAt;
      const objName =
        object.name.length > 20
          ? object.name.substring(0, 20) + "..."
          : object.name;
      rayTargetStr = `Ray: ${objName} D:${distance.toFixed(
        1
      )} B:[${blockWorldCoords.x.toFixed(0)},${blockWorldCoords.y.toFixed(
        0
      )},${blockWorldCoords.z.toFixed(0)}]`;
      if (worldFaceNormal) {
        const normal = worldFaceNormal;
        if (Math.abs(normal.x) > 0.5)
          highlightFaceDir = normal.x > 0 ? "East (+X)" : "West (-X)";
        else if (Math.abs(normal.y) > 0.5)
          highlightFaceDir = normal.y > 0 ? "Top (+Y)" : "Bottom (-Y)";
        else if (Math.abs(normal.z) > 0.5)
          highlightFaceDir = normal.z > 0 ? "South (+Z)" : "North (-Z)";
        else highlightFaceDir = "Unknown Face";
      }
    }
    const highlightStr = `HL: ${highlightFaceDir}`;

    let visibleChunksCount = 0;
    refs.world.activeChunks.forEach((chunk) => {
      if (chunk.chunkRoot && chunk.chunkRoot.visible) visibleChunksCount++;
    });

    this.setDebugInfo((prev) => ({
      fps: newFpsValue !== undefined ? newFpsValue : prev.fps,
      playerPosition: playerPosStr,
      playerChunk: playerChunkStr,
      raycastTarget: rayTargetStr,
      highlightStatus: highlightStr,
      visibleChunks: visibleChunksCount,
      totalChunks: refs.world ? refs.world.activeChunks.size : 0,
      isFlying: `Flying: ${player.flying ? "Yes" : "No"}`,
      isRunning: `Running: ${player.isRunning ? "Yes" : "No"}`,
      isBoosting: `Boosting: ${player.isBoosting ? "Yes" : "No"}`,
      lookDirection: prev.lookDirection,
    }));
  }
}
