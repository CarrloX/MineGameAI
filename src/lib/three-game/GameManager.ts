
import * as THREE from 'three';
import type { GameRefs, DebugInfoState } from './types';
import { CHUNK_SIZE } from './utils';
import { Player } from './Player'; // Required for respawn logic

export class GameManager {
  private gameRefs: GameRefs;
  private setDebugInfo: (updateFn: (prevState: DebugInfoState) => DebugInfoState) => void;
  private setIsCameraSubmerged: React.Dispatch<React.SetStateAction<boolean>>;
  private isCameraSubmerged_internal: boolean = false; // Internal tracking to avoid frequent state updates

  constructor(
    gameRefs: GameRefs,
    setDebugInfo: (updateFn: (prevState: DebugInfoState) => DebugInfoState) => void,
    setIsCameraSubmerged: React.Dispatch<React.SetStateAction<boolean>>
  ) {
    this.gameRefs = gameRefs;
    this.setDebugInfo = setDebugInfo;
    this.setIsCameraSubmerged = setIsCameraSubmerged;
  }

  public update(newFpsValue?: number): void {
    const refs = this.gameRefs;
    if (!refs.player || !refs.rendererManager || !refs.scene || !refs.camera || !refs.world) {
      if (refs.gameLoopId !== null) cancelAnimationFrame(refs.gameLoopId);
      refs.gameLoopId = null;
      return;
    }

    refs.player.updatePosition();
    refs.player.highlightBlock();
    refs.world.updateChunks(refs.player.mesh.position);
    if (refs.camera) {
      refs.world.updateChunkVisibility(refs.camera);
    }
    refs.world.processRemeshQueue(1);

    // Debug Info Update
    const player = refs.player;
    const playerPosStr = `Player: X:${player.x.toFixed(2)}, Y:${player.y.toFixed(2)}, Z:${player.z.toFixed(2)}`;
    const playerChunkX = Math.floor(player.x / CHUNK_SIZE);
    const playerChunkZ = Math.floor(player.z / CHUNK_SIZE);
    const playerChunkStr = `Chunk: CX:${playerChunkX}, CZ:${playerChunkZ}`;

    let rayTargetStr = 'Ray: None';
    let highlightFaceDir = 'Inactive';
    if (player.lookingAt) {
      const { object, distance, blockWorldCoords, worldFaceNormal } = player.lookingAt;
      const objName = object.name.length > 20 ? object.name.substring(0, 20) + "..." : object.name;
      rayTargetStr = `Ray: ${objName} D:${distance.toFixed(1)} B:[${blockWorldCoords.x.toFixed(0)},${blockWorldCoords.y.toFixed(0)},${blockWorldCoords.z.toFixed(0)}]`;
      
      if (worldFaceNormal) {
        const normal = worldFaceNormal;
        if (Math.abs(normal.x) > 0.5) highlightFaceDir = normal.x > 0 ? 'East (+X)' : 'West (-X)';
        else if (Math.abs(normal.y) > 0.5) highlightFaceDir = normal.y > 0 ? 'Top (+Y)' : 'Bottom (-Y)';
        else if (Math.abs(normal.z) > 0.5) highlightFaceDir = normal.z > 0 ? 'South (+Z)' : 'North (-Z)';
        else highlightFaceDir = 'Unknown Face';
      }
    }
    const highlightStr = `HL: ${highlightFaceDir}`;

    let visibleChunksCount = 0;
    refs.world.activeChunks.forEach(chunk => {
      if(chunk.chunkRoot.visible) visibleChunksCount++;
    });

    this.setDebugInfo(prev => ({
      fps: newFpsValue !== undefined ? newFpsValue : prev.fps,
      playerPosition: playerPosStr,
      playerChunk: playerChunkStr,
      raycastTarget: rayTargetStr,
      highlightStatus: highlightStr,
      visibleChunks: visibleChunksCount,
      totalChunks: refs.world!.activeChunks.size,
      isFlying: `Flying: ${player.flying ? 'Yes' : 'No'}`,
      isRunning: `Running: ${player.isRunning ? 'Yes' : 'No'}`,
      isBoosting: `Boosting: ${player.isBoosting ? 'Yes' : 'No'}`,
    }));

    // Camera Submerged Check
    if (refs.player && refs.world && refs.camera) {
      const camWorldX = Math.floor(refs.camera.position.x);
      const camWorldY = Math.floor(refs.camera.position.y);
      const camWorldZ = Math.floor(refs.camera.position.z);
      const blockAtCamera = refs.world.getBlock(camWorldX, camWorldY, camWorldZ);
      const newIsSubmerged = blockAtCamera === 'waterBlock';
      
      if (newIsSubmerged !== this.isCameraSubmerged_internal) {
        this.isCameraSubmerged_internal = newIsSubmerged;
        this.setIsCameraSubmerged(newIsSubmerged);
      }
    }

    // Player Death and Respawn
    if (refs.player.dead) {
      const respawnX = 0.5;
      const respawnZ = 0.5;
      
      refs.world.updateChunks(new THREE.Vector3(respawnX, refs.player.y, respawnZ));
      while(refs.world.getRemeshQueueSize() > 0) {
        refs.world.processRemeshQueue(refs.world.getRemeshQueueSize());
      }

      let safeRespawnY = refs.world.getSpawnHeight(respawnX, respawnZ);
      let attempts = 0;
      const maxAttempts = 15; 

      while(attempts < maxAttempts) {
        const blockAtFeet = refs.world.getBlock(Math.floor(respawnX), Math.floor(safeRespawnY), Math.floor(respawnZ));
        const blockAtHead = refs.world.getBlock(Math.floor(respawnX), Math.floor(safeRespawnY + 1), Math.floor(respawnZ));

        if (blockAtFeet === 'air' && blockAtHead === 'air') {
          break;
        }
        safeRespawnY++;
        attempts++;
        if (safeRespawnY >= refs.world.layers - 2) {
            console.warn("Respawn safety check reached near world top. Defaulting Y.");
            safeRespawnY = Math.floor(refs.world.layers / 2);
            break;
        }
      }
       if (attempts >= maxAttempts) {
          console.warn("Could not find a perfectly safe respawn Y after " + maxAttempts + " attempts. Player collision logic should resolve.");
      }
      const currentPitch = refs.camera.rotation.x;
      const currentYaw = refs.camera.rotation.y;
      
      refs.player = new Player(refs.player['name'], refs, respawnX, safeRespawnY, respawnZ, true); // Pass true to preserve camera
      if (refs.inputHandler) { 
        refs.inputHandler['player'] = refs.player;
      }
      
      if (refs.camera && refs.player) {
        refs.player.pitch = currentPitch;
        refs.player.yaw = currentYaw;
        refs.camera.rotation.x = currentPitch;
        refs.camera.rotation.y = currentYaw;
      }
    }

    // Cursor Hold Logic
    if (refs.cursor.holding) {
      refs.cursor.holdTime++;
      if (refs.cursor.holdTime === refs.cursor.triggerHoldTime) {
        if (refs.player) refs.player.interactWithBlock(false); 
      }
    }

    // Render
    refs.rendererManager.render();
  }
}
