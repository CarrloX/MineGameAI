import * as THREE from "three";
import type { GameRefs, DebugInfoState } from "./types";
import { CHUNK_SIZE } from "./utils";
import { Player } from "./Player";
import { PlayerRespawnService } from "./PlayerRespawnService";
import { PlayerController } from "./PlayerController";
import { WorldController } from "./WorldController";
import { RenderController } from "./RenderController";
import { DebugInfoService } from "./DebugInfoService";

export class GameLogic {
  private gameRefs: GameRefs;
  private setDebugInfo: (
    updateFn: (prevState: DebugInfoState) => DebugInfoState
  ) => void;
  private setIsCameraSubmerged: React.Dispatch<React.SetStateAction<boolean>>;
  private isCameraSubmerged_internal: boolean = false;
  private frustum: THREE.Frustum = new THREE.Frustum();
  private playerController: PlayerController;
  private worldController: WorldController;
  private renderController: RenderController;
  private debugInfoService: DebugInfoService;
  private lastCameraPosition: THREE.Vector3 = new THREE.Vector3();
  private lastCameraRotation: THREE.Euler = new THREE.Euler();
  private CAMERA_MOVE_THRESHOLD: number = 0.01;
  private lastFps: number = 60;

  constructor(
    gameRefs: GameRefs,
    setDebugInfo: (
      updateFn: (prevState: DebugInfoState) => DebugInfoState
    ) => void,
    setIsCameraSubmerged: React.Dispatch<React.SetStateAction<boolean>>
  ) {
    this.gameRefs = gameRefs;
    this.setDebugInfo = setDebugInfo;
    this.setIsCameraSubmerged = setIsCameraSubmerged;
    this.playerController = new PlayerController(gameRefs);
    this.worldController = new WorldController(gameRefs);
    this.renderController = new RenderController(gameRefs);
    this.debugInfoService = new DebugInfoService(gameRefs, setDebugInfo);

    // Inicializar el frustum
    const camera = gameRefs.camera;
    if (camera) {
      const matrix = new THREE.Matrix4();
      camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
      matrix.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse
      );
      this.frustum.setFromProjectionMatrix(matrix);
    }
  }

  public update(deltaTime: number, newFpsValue?: number): void {
    const refs = this.gameRefs;
    if (
      !refs.player ||
      !refs.rendererManager ||
      !refs.scene ||
      !refs.camera ||
      !refs.world
    ) {
      if (refs.gameLoopId !== null) cancelAnimationFrame(refs.gameLoopId);
      refs.gameLoopId = null;
      return;
    }

    // Actualizar el frustum
    const camera = refs.camera;
    if (camera) {
      const matrix = new THREE.Matrix4();
      camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
      matrix.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse
      );
      this.frustum.setFromProjectionMatrix(matrix);
    }

    // Detectar si la cámara se ha movido significativamente
    let cameraMoved = false;
    if (refs.camera) {
      const posMoved = this.lastCameraPosition.distanceToSquared(refs.camera.position) > this.CAMERA_MOVE_THRESHOLD;
      // Convertir rotación Euler a vector manualmente
      const lastRotVec = new THREE.Vector3(this.lastCameraRotation.x, this.lastCameraRotation.y, this.lastCameraRotation.z);
      const currRotVec = new THREE.Vector3(refs.camera.rotation.x, refs.camera.rotation.y, refs.camera.rotation.z);
      const rotMoved = lastRotVec.distanceTo(currRotVec) > this.CAMERA_MOVE_THRESHOLD;
      if (posMoved || rotMoved) {
        cameraMoved = true;
        this.lastCameraPosition.copy(refs.camera.position);
        this.lastCameraRotation.copy(refs.camera.rotation);
      }
    }

    // Ajustar el remallado dinámicamente según los FPS
    if (newFpsValue !== undefined) {
      this.lastFps = newFpsValue;
    }
    const maxRemeshPerFrame = Math.max(1, Math.floor(this.lastFps / 30));

    this.playerController.update(deltaTime);
    const visibleChunksCount = this.worldController.update(this.frustum, cameraMoved, maxRemeshPerFrame);
    this.debugInfoService.updateDebugInfo(newFpsValue);

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
      PlayerRespawnService.respawnPlayer(refs);
    }

    if (refs.cursor.holding) {
      refs.cursor.holdTime++;
      if (refs.cursor.holdTime === refs.cursor.triggerHoldTime) {
        if (refs.player) refs.player.interactWithBlock(false);
      }
    }

    this.renderController.render();
  }
}
