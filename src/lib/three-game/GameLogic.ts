
import * as THREE from 'three';
import type { GameRefs, DebugInfoState, PlayerWorldService, PlayerCameraService, PlayerSceneService, PlayerRaycasterService } from './types';
import { CHUNK_SIZE } from './utils';
import { Player } from './Player';

export class GameLogic {
  private gameRefs: GameRefs;
  private setDebugInfo: (updateFn: (prevState: DebugInfoState) => DebugInfoState) => void;
  private setIsCameraSubmerged: React.Dispatch<React.SetStateAction<boolean>>;
  private isCameraSubmerged_internal: boolean = false;

  constructor(
    gameRefs: GameRefs,
    setDebugInfo: (updateFn: (prevState: DebugInfoState) => DebugInfoState) => void,
    setIsCameraSubmerged: React.Dispatch<React.SetStateAction<boolean>>
  ) {
    this.gameRefs = gameRefs;
    this.setDebugInfo = setDebugInfo;
    this.setIsCameraSubmerged = setIsCameraSubmerged;
    this.initializePlayer(); // Initialize player here
  }

  private initializePlayer(): void {
    const refs = this.gameRefs;
    if (!refs.world || !refs.camera || !refs.scene || !refs.raycaster) {
      console.error("GameLogic: Core refs not available for player initialization.");
      return;
    }
    const initialPlayerX = 0.5;
    const initialPlayerZ = 0.5;
    let spawnY = refs.world.getSpawnHeight(initialPlayerX, initialPlayerZ);
    // Simplified spawn Y finding for brevity, assuming world is ready
    // In a real scenario, ensure world chunks are loaded before getSpawnHeight

    refs.player = new Player(
      "Player",
      refs.world as PlayerWorldService, // Cast to the service type
      refs.camera as PlayerCameraService, // Cast to the service type
      refs.scene as PlayerSceneService,   // Cast to the service type
      refs.raycaster as PlayerRaycasterService, // Cast to the service type
      initialPlayerX,
      spawnY,
      initialPlayerZ
    );

    if (refs.inputController) {
      refs.inputController.setPlayer(refs.player);
    } else {
        console.warn("GameLogic: InputController not available to set player.");
    }
    
    // Initial camera position update
    refs.camera.position.set(refs.player.x, refs.player.y + refs.player.height * 0.9, refs.player.z);
    refs.player.lookAround(); // Apply initial rotation
  }


  public update(newFpsValue?: number): void {
    const refs = this.gameRefs;
    // Player is now initialized in constructor, so should exist if GameLogic is constructed.
    if (!refs.player || !refs.rendererManager || !refs.scene || !refs.camera || !refs.world || !refs.raycaster || !refs.inputController) {
      if (refs.gameLoopId !== null) cancelAnimationFrame(refs.gameLoopId);
      refs.gameLoopId = null;
      console.warn("GameLogic.update: Critical refs missing, stopping loop.", refs);
      return;
    }

    refs.player.updatePosition();
    refs.player.highlightBlock();
    refs.world.updateChunks(refs.player.mesh.position); // player.mesh.position is updated in player.updatePosition
    if (refs.camera) {
      refs.world.updateChunkVisibility(refs.camera);
    }
    refs.world.processRemeshQueue(1);

    const playerForDebug = refs.player;
    const playerPosStr = `Player: X:${playerForDebug.x.toFixed(2)}, Y:${playerForDebug.y.toFixed(2)}, Z:${playerForDebug.z.toFixed(2)}`;
    const playerChunkX = Math.floor(playerForDebug.x / CHUNK_SIZE);
    const playerChunkZ = Math.floor(playerForDebug.z / CHUNK_SIZE);
    const playerChunkStr = `Chunk: CX:${playerChunkX}, CZ:${playerChunkZ}`;

    let rayTargetStr = 'Ray: None';
    let highlightFaceDir = 'Inactive';
    if (playerForDebug.lookingAt) {
      const { object, distance, blockWorldCoords, worldFaceNormal } = playerForDebug.lookingAt;
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
      isFlying: `Flying: ${playerForDebug.flying ? 'Yes' : 'No'}`,
      isRunning: `Running: ${playerForDebug.isRunning ? 'Yes' : 'No'}`,
      isBoosting: `Boosting: ${playerForDebug.isBoosting ? 'Yes' : 'No'}`,
    }));

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

    if (refs.player.dead) {
      const respawnX = 0.5;
      const respawnZ = 0.5;

      refs.world.updateChunks(new THREE.Vector3(respawnX, refs.player.y, respawnZ));
      while(refs.world.getRemeshQueueSize() > 0) {
        refs.world.processRemeshQueue(refs.world.getRemeshQueueSize());
      }

      let safeRespawnY = refs.world.getSpawnHeight(respawnX, respawnZ);
      let attempts = 0;
      const maxAttempts = 15; // Safety break

      while(attempts < maxAttempts) {
        const blockAtFeet = refs.world.getBlock(Math.floor(respawnX), Math.floor(safeRespawnY), Math.floor(respawnZ));
        const blockAtHead = refs.world.getBlock(Math.floor(respawnX), Math.floor(safeRespawnY + 1), Math.floor(respawnZ));

        if (blockAtFeet === 'air' && blockAtHead === 'air') {
          break; // Found a safe spot
        }
        safeRespawnY++;
        attempts++;
        if (safeRespawnY >= refs.world.layers - 2) { // Prevent infinite loop near world top
            console.warn("Respawn safety check reached near world top. Defaulting Y.");
            safeRespawnY = Math.floor(refs.world.layers / 2);
            break;
        }
      }
       if (attempts >= maxAttempts) {
          console.warn("Could not find a perfectly safe respawn Y after " + maxAttempts + " attempts. Player collision logic should resolve.");
      }
      const currentPitch = refs.camera!.rotation.x;
      const currentYaw = refs.camera!.rotation.y;

      // Create new Player, providing service interfaces
      refs.player = new Player(
        refs.player!['name'], // Keep old name
        refs.world as PlayerWorldService,
        refs.camera as PlayerCameraService,
        refs.scene as PlayerSceneService,
        refs.raycaster as PlayerRaycasterService,
        respawnX, safeRespawnY, respawnZ,
        true // preserveCam flag (its role is reduced now)
      );

      if (refs.inputController) {
        refs.inputController.setPlayer(refs.player);
      }

      // Restore camera orientation
      refs.player.pitch = currentPitch;
      refs.player.yaw = currentYaw;
      refs.player.lookAround(); // Apply to cameraService

      // Update camera position to new player position
      refs.camera.position.set(refs.player.x, refs.player.y + refs.player.height * 0.9, refs.player.z);
    }

    if (refs.cursor.holding) {
      refs.cursor.holdTime++;
      if (refs.cursor.holdTime === refs.cursor.triggerHoldTime) {
        if (refs.player) refs.player.interactWithBlock(false); // Place block on hold
      }
    }

    refs.rendererManager.render();
  }
}
