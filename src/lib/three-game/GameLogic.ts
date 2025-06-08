import * as THREE from 'three';
import type { GameRefs, DebugInfoState, PlayerWorldService, PlayerCameraService, PlayerSceneService, PlayerRaycasterService } from './types';
import { CHUNK_SIZE } from './utils';
import { Player } from './Player';
import { AudioManager, SOUND_PATHS } from './AudioManager';
import { GameEvents } from './events/EventBus';

export class GameLogic {
  private gameRefs: GameRefs;
  private setDebugInfo: (updateFn: (prevState: DebugInfoState) => DebugInfoState) => void;
  private setIsCameraSubmerged: React.Dispatch<React.SetStateAction<boolean>>;
  private isCameraSubmerged_internal: boolean = false;
  private audioManager: AudioManager;

  private frustum: THREE.Frustum = new THREE.Frustum();
  private projectionMatrixInverse: THREE.Matrix4 = new THREE.Matrix4(); // Aunque no la usaremos directamente para el frustum aquí, es una buena práctica tenerla cerca.

  public destroyBlockDelay: number = 0.2; // segundos entre destrucciones continuas
  public initialHoldDelay: number = 0.35; // retardo inicial antes de destrucción continua

  constructor(
    gameRefs: GameRefs,
    setDebugInfo: (updateFn: (prevState: DebugInfoState) => DebugInfoState) => void,
    setIsCameraSubmerged: React.Dispatch<React.SetStateAction<boolean>>
  ) {
    console.log('Inicializando GameLogic');
    this.gameRefs = gameRefs;
    this.setDebugInfo = setDebugInfo;
    this.setIsCameraSubmerged = setIsCameraSubmerged;
    
    console.log('Creando AudioManager');
    this.audioManager = new AudioManager();
    
    // Cargar sonidos comunes
    console.log('Cargando sonidos del juego');
    Object.entries(SOUND_PATHS).forEach(([name, path]) => {
        console.log(`Cargando sonido: ${name} desde ${path}`);
        this.audioManager.loadSound(name, path);
    });

    // Verificar estado del AudioManager después de cargar los sonidos
    const audioStatus = this.audioManager.getStatus();
    console.log('Estado del AudioManager después de cargar sonidos:', audioStatus);

    // Configurar listeners de eventos para sonidos
    gameRefs.eventBus.on(GameEvents.BLOCK_BREAK, () => {
        console.log('Reproduciendo sonido de romper bloque');
        this.audioManager.playSound('blockBreak');
    });

    gameRefs.eventBus.on(GameEvents.BLOCK_PLACE, () => {
        console.log('Reproduciendo sonido de colocar bloque');
        this.audioManager.playSound('blockPlace');
    });

    this.initializePlayer();
  }

  private initializePlayer(): void {
    console.log('Inicializando jugador');
    const refs = this.gameRefs;
    if (!refs.world || !refs.camera || !refs.scene || !refs.raycaster) {
      console.error("GameLogic: Core refs not available for player initialization.");
      return;
    }
    const initialPlayerX = 0.5;
    const initialPlayerZ = 0.5;
    
    const initialChunkX = Math.floor(initialPlayerX / CHUNK_SIZE);
    const initialChunkZ = Math.floor(initialPlayerZ / CHUNK_SIZE);
    if (refs.world && !refs.world.activeChunks.has(`${initialChunkX},${initialChunkZ}`)) {
        refs.world.loadChunk(initialChunkX, initialChunkZ);
        let initialRemeshLoops = 0;
        while(refs.world.getRemeshQueueSize() > 0 && initialRemeshLoops < 5) {
            refs.world.processRemeshQueue(refs.world.getRemeshQueueSize());
            initialRemeshLoops++;
        }
    }

    let spawnY = refs.world.getSpawnHeight(initialPlayerX, initialPlayerZ);    refs.player = new Player(
      "Player",
      refs.world as PlayerWorldService,
      refs.camera as PlayerCameraService,
      refs.scene as PlayerSceneService,
      refs.raycaster as PlayerRaycasterService,
      initialPlayerX,
      spawnY,
      initialPlayerZ,
      false,
      this.audioManager
    );

    // Verificar que el AudioManager se pasó correctamente al jugador
    const playerAudioManager = refs.player.getAudioManager();
    console.log('Estado del AudioManager en el jugador:', 
        playerAudioManager ? playerAudioManager.getStatus() : 'No disponible');

    if (refs.inputController) {
      refs.inputController.setPlayer(refs.player);
    } else {
        console.warn("GameLogic: InputController not available to set player.");
    }
    
    refs.camera.position.set(refs.player.x, refs.player.y + refs.player.height * 0.9, refs.player.z);
    refs.player.lookAround();
  }


  public update(deltaTime: number, newFpsValue?: number): void {
    const refs = this.gameRefs;
    if (!refs.player || !refs.rendererManager || !refs.scene || !refs.camera || !refs.world || !refs.raycaster || !refs.inputController || !refs.sky) {
      if (refs.gameLoopId !== null) cancelAnimationFrame(refs.gameLoopId);
      refs.gameLoopId = null;
      console.warn("GameLogic.update: Critical refs missing (incl. sky), stopping loop.", refs);
      return;
    }
    refs.sky.update(deltaTime, refs.camera, this.isCameraSubmerged_internal);

    // Asegura que la matriz de transformación mundial de la cámara esté actualizada.
    refs.camera.updateMatrixWorld();

    // Actualiza el frustum con la matriz combinada de proyección y vista de la cámara
    this.frustum.setFromProjectionMatrix(
        new THREE.Matrix4().multiplyMatrices(
            refs.camera.projectionMatrix,
            refs.camera.matrixWorldInverse
        )
    );

    // Frustum culling de chunks
    let visibleChunksCount = 0;
    refs.world.activeChunks.forEach(chunk => {
      if (chunk && chunk.chunkRoot && chunk.boundingBox) {
        const isVisible = this.frustum.intersectsBox(chunk.boundingBox);
        chunk.chunkRoot.visible = isVisible;
        if (isVisible) visibleChunksCount++;
      } else {
        // Si el chunk no tiene boundingBox o chunkRoot, lo ocultamos por seguridad
        if (chunk && chunk.chunkRoot) chunk.chunkRoot.visible = false;
      }
    });

    refs.player.updatePosition(deltaTime);
    refs.player.highlightBlock();
    refs.world.updateChunks(refs.player.mesh.position);
    // if (refs.camera) {
    //   refs.world.updateChunkVisibility(refs.camera, this.frustum); // Esta línea es ahora redundante
    // }
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

    const yawDeg = (THREE.MathUtils.radToDeg(playerForDebug.yaw) % 360).toFixed(1);
    const pitchDeg = (THREE.MathUtils.radToDeg(playerForDebug.pitch) % 360).toFixed(1);
    const lookDirStr = `Look: Yaw ${yawDeg}°, Pitch ${pitchDeg}°`;

    this.setDebugInfo(prev => ({
      fps: newFpsValue !== undefined ? newFpsValue : prev.fps,
      playerPosition: playerPosStr,
      playerChunk: playerChunkStr,
      raycastTarget: rayTargetStr,
      highlightStatus: highlightStr,
      visibleChunks: visibleChunksCount, // ¡Actualiza esto!
      totalChunks: refs.world!.activeChunks.size,
      isFlying: `Flying: ${playerForDebug.flying ? 'Yes' : 'No'}`,
      isRunning: `Running: ${playerForDebug.isRunning ? 'Yes' : 'No'}`,
      isBoosting: `Boosting: ${playerForDebug.isBoosting ? 'Yes' : 'No'}`,
      lookDirection: lookDirStr, // <-- Nueva línea para mostrar dirección de mirada
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
      const respawnChunkX = Math.floor(respawnX / CHUNK_SIZE);
      const respawnChunkZ = Math.floor(respawnZ / CHUNK_SIZE);

      if (!refs.world.activeChunks.has(`${respawnChunkX},${respawnChunkZ}`)) {
          refs.world.loadChunk(respawnChunkX, respawnChunkZ);
      }
      
      let safetyRemeshLoops = 0;
      const maxRemeshLoops = 5; 
      while(refs.world.getRemeshQueueSize() > 0 && safetyRemeshLoops < maxRemeshLoops) {
        refs.world.processRemeshQueue(refs.world.getRemeshQueueSize()); 
        safetyRemeshLoops++;
      }
      if (safetyRemeshLoops >= maxRemeshLoops && refs.world.getRemeshQueueSize() > 0) {
        console.warn("Respawn: Remesh queue was not fully cleared after max attempts.");
      }

      let safeRespawnY = refs.world.getSpawnHeight(respawnX, respawnZ);
      let attempts = 0;
      const maxSafetyCheckAttempts = refs.world.layers; 
      const playerHeightForCheck = refs.player.height - 0.01; 

      while(attempts < maxSafetyCheckAttempts) {
        const blockAtFeet = refs.world.getBlock(Math.floor(respawnX), Math.floor(safeRespawnY), Math.floor(respawnZ));
        const blockAtHead = refs.world.getBlock(Math.floor(respawnX), Math.floor(safeRespawnY + playerHeightForCheck), Math.floor(respawnZ));
        const blockSlightlyAboveHead = refs.world.getBlock(Math.floor(respawnX), Math.floor(safeRespawnY + playerHeightForCheck + 0.5), Math.floor(respawnZ));


        if (blockAtFeet === 'air' && blockAtHead === 'air' && blockSlightlyAboveHead === 'air') {
          break; 
        }
        safeRespawnY++;
        attempts++;
        if (safeRespawnY + playerHeightForCheck + 1 >= refs.world.layers) {
            console.warn("Respawn safety check reached world top. Choosing a default Y.");
            safeRespawnY = Math.max(1, Math.min(Math.floor(refs.world.layers / 2), refs.world.layers - Math.ceil(playerHeightForCheck) - 2));
            break;
        }
      }
       if (attempts >= maxSafetyCheckAttempts) {
          console.warn("Could not find a perfectly safe respawn Y after " + maxSafetyCheckAttempts + " attempts. Using last calculated or default.");
          safeRespawnY = Math.max(1, Math.min(safeRespawnY, refs.world.layers - Math.ceil(playerHeightForCheck) - 2));
      }

      safeRespawnY = Math.max(1, safeRespawnY); 
      safeRespawnY = Math.min(safeRespawnY, refs.world.layers - Math.ceil(refs.player.height) - 1); 


      const currentPitch = refs.player.getPitch();
      const currentYaw = refs.player.getYaw();
      refs.player = new Player(
        refs.player!['name'],
        refs.world as PlayerWorldService,
        refs.camera as PlayerCameraService,
        refs.scene as PlayerSceneService,
        refs.raycaster as PlayerRaycasterService,
        respawnX, safeRespawnY, respawnZ,
        true,
        this.audioManager
      );

      if (refs.inputController) {
        refs.inputController.setPlayer(refs.player);
      }

      refs.player.setPitch(currentPitch);
      refs.player.setYaw(currentYaw);
      refs.player.lookAround(); 

      refs.camera.position.set(refs.player.x, refs.player.y + refs.player.height * 0.9, refs.player.z);
    }

    // Interacción continua con bloques
    if (refs.cursor.holding) {
      refs.cursor.holdTime = (refs.cursor.holdTime || 0) + deltaTime;
      if (refs.cursor.holdTime >= this.initialHoldDelay) {
        // Destruir o colocar bloque cada destroyBlockDelay segundos
        if (!refs.cursor._lastDestroyTime || (refs.cursor.holdTime - refs.cursor._lastDestroyTime) >= this.destroyBlockDelay) {
          const destroy = refs.cursor.buttonPressed === 0;
          refs.player.interactWithBlock(destroy);
          refs.cursor._lastDestroyTime = refs.cursor.holdTime;
        }
      }
    } else {
      refs.cursor.holdTime = 0;
      refs.cursor._lastDestroyTime = 0;
    }

    refs.rendererManager.render();
  }
}
