import * as THREE from "three";
import type { GameRefs } from "./types";
import { Block } from "./Block";
import { getBlockDefinitions, CHUNK_SIZE } from "./utils";
import { AdvancedSky } from "./sky/AdvancedSky";
import { SimpleShadowService } from "./lighting/SimpleShadowService";
import type { ILightingService } from "./lighting/ILightingService";

export class ThreeSetup {
  private lightingService: ILightingService;

  constructor() {
    // Inicializar el servicio de iluminación
    this.lightingService = new SimpleShadowService();
  }

  public initialize(canvasRef: HTMLDivElement, gameRefs: GameRefs): void {
    if (!canvasRef) {
      console.error("ThreeSetup: Canvas reference is missing.");
      return;
    }

    // Scene
    gameRefs.scene = new THREE.Scene();

    // Camera
    gameRefs.camera = new THREE.PerspectiveCamera(
      75,
      canvasRef.clientWidth / canvasRef.clientHeight,
      0.1,
      1000 // Initial far plane, will be adjusted
    );
    gameRefs.camera.rotation.order = "YXZ";

    // Renderer
    gameRefs.renderer = new THREE.WebGLRenderer({ antialias: true });
    gameRefs.renderer.setPixelRatio(window.devicePixelRatio);
    gameRefs.renderer.setSize(canvasRef.clientWidth, canvasRef.clientHeight);
    gameRefs.renderer.shadowMap.enabled = true;
    // renderer.setClearColor will be handled by sky system or dynamically
    canvasRef.appendChild(gameRefs.renderer.domElement);

    // Raycaster
    gameRefs.raycaster = new THREE.Raycaster();

    // TextureLoader
    gameRefs.textureLoader = new THREE.TextureLoader();

    // Inicializar el servicio de iluminación
    try {
      if (!gameRefs.scene) {
        throw new Error('La escena no está inicializada');
      }
      
      console.log('Inicializando servicio de iluminación...');
      this.lightingService.initialize(gameRefs.scene);
      
      // Configurar la iluminación básica
      this.lightingService.setAmbientLightIntensity(0.5);
      this.lightingService.setDirectionalLightIntensity(0.8);
      console.log('Servicio de iluminación configurado correctamente');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      console.error('Error al inicializar el servicio de iluminación:', error);
      throw new Error(`No se pudo inicializar el servicio de iluminación: ${errorMessage}`);
    }

    // Advanced Sky System
    // Parámetros de configuración avanzados para el cielo
    const defaultWorldRenderDistanceChunks = 8;
    const skyOptions = {
      dayDurationMinutes: 12, // Ejemplo: día de 12 minutos
      sunOrbitalRadiusFactor: 1.0,
      moonOrbitalRadiusFactor: 0.85,
      sunSizeFactor: 1.1,
      moonSizeFactor: 0.9,
    };
    
    gameRefs.sky = new AdvancedSky(
      gameRefs.scene,
      gameRefs.textureLoader,
      defaultWorldRenderDistanceChunks,
      CHUNK_SIZE,
      skyOptions,
      this.lightingService
    );
    
    // Configurar la referencia al servicio de iluminación
    gameRefs.lightingService = this.lightingService;

    // Adjust camera far plane to see the sky
    // AdvancedSky calculates its elements' radius based on worldRenderDistanceChunks * chunkSize.
    // SkyRenderer's skybox radius is maxVisibleDistance * 1.5.
    const skyElementsEffectiveRadius =
      defaultWorldRenderDistanceChunks * CHUNK_SIZE * 1.6; // A bit more than skybox
    if (gameRefs.camera.far < skyElementsEffectiveRadius) {
      gameRefs.camera.far = skyElementsEffectiveRadius * 1.2; // Ensure far plane is beyond the sky elements
      gameRefs.camera.updateProjectionMatrix();
    }

    // Block Prototypes
    if (!gameRefs.textureLoader) {
      console.error(
        "ThreeSetup: TextureLoader not initialized before creating block prototypes!"
      );
      return;
    }
    const blockData = getBlockDefinitions();
    gameRefs.blocks = [
      new Block(
        "grassBlock",
        blockData.grassBlock,
        gameRefs.textureLoader,
        true
      ),
      new Block(
        "dirtBlock",
        blockData.dirtBlock,
        gameRefs.textureLoader,
        false
      ),
      new Block(
        "stoneBlock",
        blockData.stoneBlock,
        gameRefs.textureLoader,
        false
      ),
      new Block(
        "sandBlock",
        blockData.sandBlock,
        gameRefs.textureLoader,
        false
      ),
      new Block(
        "woodLogBlock",
        blockData.woodLogBlock,
        gameRefs.textureLoader,
        true
      ),
      new Block(
        "redstoneBlock",
        blockData.redstoneBlock,
        gameRefs.textureLoader,
        false
      ),
      new Block(
        "orangeWoolBlock",
        blockData.orangeWoolBlock,
        gameRefs.textureLoader,
        false
      ),
      new Block(
        "cobblestoneBlock",
        blockData.cobblestoneBlock,
        gameRefs.textureLoader,
        false
      ),
      new Block(
        "waterBlock",
        blockData.waterBlock,
        gameRefs.textureLoader,
        false
      ),
    ];

    console.log(
      "Three.js core initialized by ThreeSetup, including AdvancedSky."
    );
    // Guardar referencia al servicio de iluminación
    gameRefs.lightingService = this.lightingService;
  }

  public update(deltaTime: number, cameraPosition: THREE.Vector3): void {
    // Actualizar la iluminación en cada frame
    this.lightingService.update(deltaTime, cameraPosition);
  }

  public dispose(): void {
    // Limpiar recursos de iluminación
    this.lightingService.dispose();
  }
}
