import * as THREE from "three";
import type {
  GameRefs,
  DebugInfoState,
  PlayerWorldService,
  PlayerCameraService,
  PlayerSceneService,
  PlayerRaycasterService,
} from "./types";
import { CHUNK_SIZE } from "./utils";
import { Player } from "./Player";
import { AudioManager, SOUND_PATHS } from "./AudioManager";
import { GameEvents, EventBus } from "./events/EventBus";
import { InputController } from "./InputController"; // Asegúrate de que la ruta sea correcta
import { CollisionService } from "./physics/CollisionService";
import { DebugInfoService } from "./services/DebugInfoService";

export class GameLogic {
  private gameRefs: GameRefs;
  private setDebugInfo: (
    updateFn: (prevState: DebugInfoState) => DebugInfoState
  ) => void;
  private setIsCameraSubmerged: React.Dispatch<React.SetStateAction<boolean>>;
  private isCameraSubmerged_internal: boolean = false;
  private audioManager: AudioManager;
  private debugInfoService: DebugInfoService;

  private frustum: THREE.Frustum = new THREE.Frustum();
  private projectionMatrixInverse: THREE.Matrix4 = new THREE.Matrix4(); // Aunque no la usaremos directamente para el frustum aquí, es una buena práctica tenerla cerca.

  public destroyBlockDelay: number = 0.2; // segundos entre destrucciones continuas
  public initialHoldDelay: number = 0.35; // retardo inicial antes de destrucción continua
  private _isPaused: boolean = false;

  constructor(
    gameRefs: GameRefs,
    setDebugInfo: (
      updateFn: (prevState: DebugInfoState) => DebugInfoState
    ) => void,
    setIsCameraSubmerged: React.Dispatch<React.SetStateAction<boolean>>
  ) {
    console.log("Inicializando GameLogic");
    this.gameRefs = gameRefs;
    this.setDebugInfo = setDebugInfo;
    this.setIsCameraSubmerged = setIsCameraSubmerged;

    console.log("Creando AudioManager");
    this.audioManager = new AudioManager();

    // Cargar sonidos comunes
    console.log("Cargando sonidos del juego");
    Object.entries(SOUND_PATHS).forEach(([name, path]) => {
      console.log(`Cargando sonido: ${name} desde ${path}`);
      this.audioManager.loadSound(name, path);
    });

    // Verificar estado del AudioManager después de cargar los sonidos
    const audioStatus = this.audioManager.getStatus();
    console.log(
      "Estado del AudioManager después de cargar sonidos:",
      audioStatus
    );

    // Configurar listeners de eventos para sonidos
    gameRefs.eventBus.on(GameEvents.BLOCK_BREAK, () => {
      console.log("Reproduciendo sonido de romper bloque");
      this.audioManager.playSound("blockBreak");
    });

    gameRefs.eventBus.on(GameEvents.BLOCK_PLACE, () => {
      console.log("Reproduciendo sonido de colocar bloque");
      this.audioManager.playSound("blockPlace");
    });

    // Instanciar InputController pasando la instancia de GameLogic
    this.gameRefs.inputController = new InputController(this.gameRefs, this); // Pasa la instancia de GameLogic
    this.debugInfoService = new DebugInfoService(gameRefs, setDebugInfo);

    this.initializePlayer();
  }

  private initializePlayer(): void {
    console.log("Inicializando jugador");
    const refs = this.gameRefs;
    if (!refs.world || !refs.camera || !refs.scene || !refs.raycaster) {
      console.error(
        "GameLogic: Core refs not available for player initialization."
      );
      return;
    }
    const initialPlayerX = 0.5;
    const initialPlayerZ = 0.5;

    const initialChunkX = Math.floor(initialPlayerX / CHUNK_SIZE);
    const initialChunkZ = Math.floor(initialPlayerZ / CHUNK_SIZE);
    if (
      refs.world &&
      !refs.world.activeChunks.has(`${initialChunkX},${initialChunkZ}`)
    ) {
      refs.world.loadChunk(initialChunkX, initialChunkZ);
      let initialRemeshLoops = 0;
      while (refs.world.getRemeshQueueSize() > 0 && initialRemeshLoops < 5) {
        refs.world.processRemeshQueue(refs.world.getRemeshQueueSize());
        initialRemeshLoops++;
      }
    }

    let spawnY = refs.world.getSpawnHeight(initialPlayerX, initialPlayerZ);
    // Instanciar CollisionService antes de Player
    const collisionService = new CollisionService(refs.world);
    refs.player = new Player(
      "Player",
      refs.world as PlayerWorldService,
      refs.camera as PlayerCameraService,
      refs.scene as PlayerSceneService,
      refs.raycaster as PlayerRaycasterService,
      initialPlayerX,
      spawnY,
      initialPlayerZ,
      false,
      this.audioManager,
      collisionService // Inyección de dependencias
    );

    // Verificar que el AudioManager se pasó correctamente al jugador
    const playerAudioManager = refs.player.getAudioManager();
    console.log(
      "Estado del AudioManager en el jugador:",
      playerAudioManager ? playerAudioManager.getStatus() : "No disponible"
    );

    if (refs.inputController) {
      refs.inputController.setPlayer(refs.player);
    } else {
      console.warn("GameLogic: InputController not available to set player.");
    }

    refs.camera.position.set(
      refs.player.x,
      refs.player.y + refs.player.height * 0.9,
      refs.player.z
    );
    refs.player.lookAround();
  }

  public get isPaused(): boolean {
    return this._isPaused;
  }

  public togglePause(): void {
    const prevState = this._isPaused ? "paused" : "playing";
    this._isPaused = !this._isPaused;
    console.log('Juego pausado:', this._isPaused);

    if (this._isPaused) {
        // Cuando el juego se pausa, deshabilitar el input de movimiento del jugador
        this.gameRefs.inputController.disablePlayerMovement();
        // Liberar el mouse
        this.gameRefs.inputController.releasePointerLock();
    } else {
        // Cuando el juego se reanuda, habilitar el input de movimiento del jugador
        this.gameRefs.inputController.enablePlayerMovement();
        // Volver a capturar el mouse
        this.gameRefs.inputController.requestPointerLock();
    }

    // Emitir evento para que la UI escuche el cambio de pausa
    const eventBus = this.gameRefs.eventBus || EventBus.getInstance();
    eventBus.emit(
      GameEvents.GAME_STATE_CHANGE,
      {
        state: this._isPaused ? "paused" : "playing",
        previousState: prevState
      }
    );
  }

  // fixedStepUpdate: solo física y cielo
  public fixedStepUpdate(fixedStep: number): void {
    const refs = this.gameRefs;
    if (refs.sky && refs.camera) {
      refs.sky.updateFixedStep(fixedStep, refs.camera, this.isCameraSubmerged_internal);
    }
    // Física del jugador
    if (!this._isPaused && refs.player) {
      refs.player.updatePosition(fixedStep);
    }
  }

  // update: lógica de frame, chunks, highlight, etc.
  public update(deltaTime: number, newFpsValue?: number, debugEnabled: boolean = true): void {
    const refs = this.gameRefs;
    if (!refs.player || !refs.world || !refs.camera || !refs.scene) {
      console.error("GameLogic.update: Missing critical references.");
      return;
    }
    // Highlight de bloques (puede depender del frame)
    refs.player.highlightBlock();
    // Actualizar chunks y remallado (debe ejecutarse cada frame, no solo en fixedStep)
    refs.world.updateChunks(refs.player.mesh.position);
    // Procesar la cola de remallado de chunks cada frame
    if (refs.world.getRemeshQueueSize() > 0) {
      refs.world.processRemeshQueue(2, refs.player.mesh.position);
    }

    // Interacción continua con bloques
    if (refs.cursor.holding) {
      refs.cursor.holdTime = (refs.cursor.holdTime || 0) + deltaTime;
      if (refs.cursor.holdTime >= this.initialHoldDelay) {
        // Destruir o colocar bloque cada destroyBlockDelay segundos
        if (
          !refs.cursor._lastDestroyTime ||
          refs.cursor.holdTime - refs.cursor._lastDestroyTime >=
            this.destroyBlockDelay
        ) {
          const destroy = refs.cursor.buttonPressed === 0;
          refs.player.interactWithBlock(destroy);
          refs.cursor._lastDestroyTime = refs.cursor.holdTime;
        }
      }
    } else {
      refs.cursor.holdTime = 0;
      refs.cursor._lastDestroyTime = 0;
    }

    // Verificar si la cámara está bajo el agua
    if (refs.player && refs.world && refs.camera) {
      const camWorldX = Math.floor(refs.camera.position.x);
      const camWorldY = Math.floor(refs.camera.position.y);
      const camWorldZ = Math.floor(refs.camera.position.z);
      const blockAtCamera = refs.world.getBlock(
        camWorldX,
        camWorldY,
        camWorldZ
      );
      const newIsSubmerged = blockAtCamera === "waterBlock";

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
      while (
        refs.world.getRemeshQueueSize() > 0 &&
        safetyRemeshLoops < maxRemeshLoops
      ) {
        refs.world.processRemeshQueue(refs.world.getRemeshQueueSize());
        safetyRemeshLoops++;
      }
      if (
        safetyRemeshLoops >= maxRemeshLoops &&
        refs.world.getRemeshQueueSize() > 0
      ) {
        console.warn(
          "Respawn: Remesh queue was not fully cleared after max attempts."
        );
      }

      let safeRespawnY = refs.world.getSpawnHeight(respawnX, respawnZ);
      let attempts = 0;
      const maxSafetyCheckAttempts = refs.world.layers;
      const playerHeightForCheck = refs.player.height - 0.01;

      while (attempts < maxSafetyCheckAttempts) {
        const blockAtFeet = refs.world.getBlock(
          Math.floor(respawnX),
          Math.floor(safeRespawnY),
          Math.floor(respawnZ)
        );
        const blockAtHead = refs.world.getBlock(
          Math.floor(respawnX),
          Math.floor(safeRespawnY + playerHeightForCheck),
          Math.floor(respawnZ)
        );
        const blockSlightlyAboveHead = refs.world.getBlock(
          Math.floor(respawnX),
          Math.floor(safeRespawnY + playerHeightForCheck + 0.5),
          Math.floor(respawnZ)
        );

        if (
          blockAtFeet === "air" &&
          blockAtHead === "air" &&
          blockSlightlyAboveHead === "air"
        ) {
          break;
        }
        safeRespawnY++;
        attempts++;
        if (safeRespawnY + playerHeightForCheck + 1 >= refs.world.layers) {
          console.warn(
            "Respawn safety check reached world top. Choosing a default Y."
          );
          safeRespawnY = Math.max(
            1,
            Math.min(
              Math.floor(refs.world.layers / 2),
              refs.world.layers - Math.ceil(playerHeightForCheck) - 2
            )
          );
          break;
        }
      }
      if (attempts >= maxSafetyCheckAttempts) {
        console.warn(
          "Could not find a perfectly safe respawn Y after " +
            maxSafetyCheckAttempts +
            " attempts. Using last calculated or default."
        );
        safeRespawnY = Math.max(
          1,
          Math.min(
            safeRespawnY,
            refs.world.layers - Math.ceil(playerHeightForCheck) - 2
          )
        );
      }

      safeRespawnY = Math.max(1, safeRespawnY);
      safeRespawnY = Math.min(
        safeRespawnY,
        refs.world.layers - Math.ceil(refs.player.height) - 1
      );

      const currentPitch = refs.player.getPitch();
      const currentYaw = refs.player.getYaw();
      refs.player = new Player(
        refs.player!["name"],
        refs.world as PlayerWorldService,
        refs.camera as PlayerCameraService,
        refs.scene as PlayerSceneService,
        refs.raycaster as PlayerRaycasterService,
        respawnX,
        safeRespawnY,
        respawnZ,
        true,
        this.audioManager
      );

      if (refs.inputController) {
        refs.inputController.setPlayer(refs.player);
      }

      refs.player.setPitch(currentPitch);
      refs.player.setYaw(currentYaw);
      refs.player.lookAround();

      refs.camera.position.set(
        refs.player.x,
        refs.player.y + refs.player.height * 0.9,
        refs.player.z
      );
    }

    // Actualiza la matriz de proyección y el frustum (siempre)
    refs.camera.updateMatrixWorld();
    this.projectionMatrixInverse.multiplyMatrices(
      refs.camera.projectionMatrix,
      refs.camera.matrixWorldInverse
    );
    this.frustum.setFromProjectionMatrix(this.projectionMatrixInverse);

    // Frustum culling a nivel de chunks (siempre)
    let visibleChunksCount = 0;
    refs.world.activeChunks.forEach((chunk) => {
      if (chunk && chunk.chunkRoot && chunk.boundingBox) {
        const isVisible = this.frustum.intersectsBox(chunk.boundingBox);
        chunk.chunkRoot.visible = isVisible;
        if (isVisible) visibleChunksCount++;
      } else {
        if (chunk && chunk.chunkRoot) chunk.chunkRoot.visible = false;
      }
    });

    // Actualizar información de depuración solo si está habilitado
    if (debugEnabled && this.debugInfoService) {
      this.debugInfoService.updateDebugInfo();
    }

    // Renderizar la escena (siempre)
    if (refs.rendererManager) {
      refs.rendererManager.render();
    }
  }
}
