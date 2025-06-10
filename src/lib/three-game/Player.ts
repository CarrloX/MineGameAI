import * as THREE from "three";
import type { Block } from "./Block";
// World import no longer needed directly by Player
import { CHUNK_SIZE } from "./utils";
import type {
  LookingAtInfo,
  PlayerWorldService,
  PlayerCameraService,
  PlayerSceneService,
  PlayerRaycasterService,
} from "./types";
import { CONTROL_CONFIG } from "./CONTROL_CONFIG";
import { PlayerMovementService } from "./services/PlayerMovementService";
import { PlayerBlockInteractionService } from "./services/PlayerBlockInteractionService";
import { PlayerStateService } from "./services/PlayerStateService";
import { PlayerCameraController } from "./services/PlayerCameraService";

export class Player {
  public x: number;
  public y: number;
  public z: number;
  public height: number;
  public width: number;
  public depth: number;
  public pitch: number;
  public yaw: number;
  public speed: number;
  public velocity: number;
  public jumpSpeed: number;
  public jumpVelocity: number;
  public xdir: string;
  public zdir: string;
  public attackRange: number;
  public lookingAt: LookingAtInfo | null;
  public blockFaceHL: { mesh: THREE.LineSegments; dir: string };
  public mesh: THREE.Object3D;
  private name: string;

  // Dependencies injected via constructor
  private worldService: PlayerWorldService;
  private cameraService: PlayerCameraService;
  private sceneService: PlayerSceneService;
  private raycasterService: PlayerRaycasterService;
  private audioManager: any;

  // Servicios
  private stateService: PlayerStateService;
  private movementService: PlayerMovementService;
  private blockInteractionService: PlayerBlockInteractionService;
  private cameraController: PlayerCameraController;

  private _lastInteractionTime: number | null = null;

  constructor(
    name: string,
    worldService: PlayerWorldService,
    cameraService: PlayerCameraService,
    sceneService: PlayerSceneService,
    raycasterService: PlayerRaycasterService,
    x: number = 0,
    y: number = 0,
    z: number = 0,
    preserveCam: boolean = false,
    audioManager?: any // AudioManager opcional para compatibilidad
  ) {
    // Inicializar servicios primero
    this.name = name;
    this.worldService = worldService;
    this.cameraService = cameraService;
    this.sceneService = sceneService;
    this.raycasterService = raycasterService;
    this.audioManager = audioManager;
    this.stateService = new PlayerStateService(this);

    // Inicializar propiedades básicas
    this.x = x;
    this.y = y;
    this.z = z;
    this.height = CONTROL_CONFIG.PLAYER_HEIGHT;
    this.width = CONTROL_CONFIG.PLAYER_WIDTH;
    this.depth = CONTROL_CONFIG.PLAYER_DEPTH;

    this.pitch = 0; // Initial pitch
    this.yaw = 0; // Initial yaw

    this.speed = CONTROL_CONFIG.WALK_SPEED;
    this.velocity = 0;
    this.jumpSpeed = CONTROL_CONFIG.JUMP_SPEED;
    this.jumpVelocity = 0;
    this.xdir = "";
    this.zdir = "";
    this.attackRange = CONTROL_CONFIG.ATTACK_RANGE;
    this.lookingAt = null;

    // Inicializar el resto de servicios después de que las propiedades básicas estén listas
    this.movementService = new PlayerMovementService(worldService, this);
    this.blockInteractionService = new PlayerBlockInteractionService(
      worldService,
      sceneService,
      raycasterService,
      cameraService,
      this
    );
    this.cameraController = new PlayerCameraController(cameraService, this);

    // Configurar cámara
    if (!preserveCam) {
      this.cameraController.setPosition(this.x, this.y + this.height, this.z);
      this.cameraController.setRotation(this.pitch, this.yaw);
    }

    // Configurar highlight
    const highlightBoxGeo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    const highlightEdgesGeo = new THREE.EdgesGeometry(highlightBoxGeo);
    const highlightMaterial = new THREE.LineBasicMaterial({
      color: 0x000000,
      linewidth: 2,
    });

    this.blockFaceHL = {
      mesh: new THREE.LineSegments(highlightEdgesGeo, highlightMaterial),
      dir: "",
    };
    this.blockFaceHL.mesh.name = "Block_Wireframe_Highlight_Mesh";
    this.blockFaceHL.mesh.renderOrder = 1;

    this.mesh = new THREE.Object3D(); // This is a logical mesh for position, not necessarily rendered.
    this.mesh.name = name;
    this.mesh.position.set(this.x, this.y, this.z);

    // Añadir highlight al escenario
    this.sceneService.add(this.blockFaceHL.mesh);
  }

  highlightBlock(): void {
    this.blockInteractionService.highlightBlock();
  }

  // This method applies the Player's pitch and yaw to the cameraService.
  // InputController is responsible for updating Player's pitch and yaw from mouse events.
  public lookAround(): void {
    this.cameraController.lookAround();
  }

  public interactWithBlock(destroy: boolean): void {
    // PREVENIR DOBLE INTERACCIÓN
    // Usar una marca de tiempo para evitar múltiples interacciones en un período corto
    const now = Date.now();
    if (this._lastInteractionTime && now - this._lastInteractionTime < 150) {
      console.log("Interacción ignorada: demasiado rápida");
      return;
    }
    this._lastInteractionTime = now;

    // Delegamos la interacción al servicio correspondiente
    this.blockInteractionService.interactWithBlock(destroy);
  }

  public die(): void {
    this.stateService.die();
  }

  updatePosition(deltaTime: number): void {
    this.movementService.updatePosition(deltaTime);
  }

  // Getters para el estado
  public get flying(): boolean {
    return this.stateService.flying;
  }

  public get isFlyingAscending(): boolean {
    return this.stateService.isFlyingAscending;
  }

  public get isFlyingDescending(): boolean {
    return this.stateService.isFlyingDescending;
  }

  public get isRunning(): boolean {
    return this.stateService.isRunning;
  }

  public get isBoosting(): boolean {
    return this.stateService.isBoosting;
  }

  public get jumping(): boolean {
    return this.stateService.jumping;
  }

  public set jumping(value: boolean) {
    this.stateService.jumping = value;
  }

  public get onGround(): boolean {
    return this.stateService.onGround;
  }

  public set onGround(value: boolean) {
    this.stateService.onGround = value;
  }

  public get dead(): boolean {
    return this.stateService.dead;
  }

  public set dead(value: boolean) {
    this.stateService.dead = value;
  }

  public get lastSpacePressTime(): number {
    return this.stateService.lastSpacePressTime;
  }

  public get flySpeed(): number {
    return this.stateService.flySpeed;
  }

  public get flyToggleDelay(): number {
    return this.stateService.flyToggleDelay;
  }

  public get runSpeedMultiplier(): number {
    return this.stateService.runSpeedMultiplier;
  }

  public get boostSpeedMultiplier(): number {
    return this.stateService.boostSpeedMultiplier;
  }

  // Métodos para controlar el estado
  public toggleFlying(): void {
    console.log("Player.toggleFlying llamado");
    this.stateService.toggleFlying();
  }

  public startFlyingDown(): void {
    console.log("Player.startFlyingDown llamado");
    this.stateService.startFlyingDown();
  }

  public stopFlyingDown(): void {
    console.log("Player.stopFlyingDown llamado");
    this.stateService.stopFlyingDown();
  }

  public stopFlyingUp(): void {
    console.log("Player.stopFlyingUp llamado");
    this.stateService.stopFlyingUp();
  }

  public toggleRunning(): void {
    this.stateService.toggleRunning();
  }

  public toggleBoosting(): void {
    this.stateService.toggleBoosting();
  }

  // Métodos de cámara
  public getCamera(): PlayerCameraService {
    return this.cameraController.getCamera();
  }

  public setPitch(pitch: number): void {
    this.cameraController.setPitch(pitch);
  }

  public setYaw(yaw: number): void {
    this.cameraController.setYaw(yaw);
  }

  public getPitch(): number {
    return this.cameraController.getPitch();
  }

  public getYaw(): number {
    return this.cameraController.getYaw();
  }

  // Método para obtener información sobre el bloque que se está mirando
  public getLookingAt() {
    return this.blockInteractionService.getLookingAt();
  }

  // Getters para propiedades privadas
  public getName(): string {
    return this.name;
  }

  public getAudioManager(): any {
    return this.audioManager;
  }

  public respawn(): void {
    this.stateService.respawn();
  }

  /**
   * Devuelve la caja de colisión del jugador en la posición dada (o actual si no se pasa ninguna).
   */
  public getCollisionBox(pos?: { x: number; y: number; z: number }): THREE.Box3 {
    const x = pos?.x ?? this.x;
    const y = pos?.y ?? this.y;
    const z = pos?.z ?? this.z;
    const min = new THREE.Vector3(
      x - this.width / 2,
      y,
      z - this.depth / 2
    );
    const max = new THREE.Vector3(
      x + this.width / 2,
      y + this.height,
      z + this.depth / 2
    );
    return new THREE.Box3(min, max);
  }
}
