import * as THREE from "three";
import type { GameRefs } from "./types";
import { Block } from "./Block";
import { getBlockDefinitions, CHUNK_SIZE } from "./utils";
import { AdvancedSky } from "./sky/AdvancedSky"; // Import AdvancedSky

export class ThreeSetup {
  constructor() {}

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

    // Lighting - Ambient Light (Directional light is now handled by AdvancedSky's Sun)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.2); // Initial moderate intensity
    ambientLight.name = "Ambient Light";
    gameRefs.scene.add(ambientLight);

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
      skyOptions
    );

    gameRefs.lighting = {
      ambient: ambientLight,
      directional:
        gameRefs.sky.getSunLight() ?? new THREE.DirectionalLight(0xffffff, 0.5), // fallback para evitar error de tipo
    };

    if (
      gameRefs.lighting &&
      gameRefs.lighting.directional &&
      !gameRefs.lighting.directional.parent
    ) {
      // This check is mostly a safeguard; Sun adds its light to the scene.
      // gameRefs.scene.add(gameRefs.lighting.directional);
      // if (gameRefs.lighting.directional.target && !gameRefs.lighting.directional.target.parent) {
      //     gameRefs.scene.add(gameRefs.lighting.directional.target);
      // }
    }

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
  }
}
