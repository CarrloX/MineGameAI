
import * as THREE from 'three';
import type { GameRefs } from './types';
import { Block } from './Block';
import { getBlockDefinitions, CHUNK_SIZE } from './utils'; // Assuming CHUNK_SIZE is needed for shadow camera

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
      1000
    );
    gameRefs.camera.rotation.order = "YXZ";

    // Renderer
    gameRefs.renderer = new THREE.WebGLRenderer({ antialias: true });
    gameRefs.renderer.setPixelRatio(window.devicePixelRatio);
    gameRefs.renderer.setSize(canvasRef.clientWidth, canvasRef.clientHeight);
    gameRefs.renderer.shadowMap.enabled = true;
    canvasRef.appendChild(gameRefs.renderer.domElement);

    // Raycaster
    gameRefs.raycaster = new THREE.Raycaster();

    // TextureLoader
    gameRefs.textureLoader = new THREE.TextureLoader();

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    ambientLight.name = "Ambient Light";
    gameRefs.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.name = "Directional Light";
    const shadowCameraCoverage = CHUNK_SIZE * ( (gameRefs.world?.renderDistanceInChunks || 4) + 3); // Use renderDistance or default
    const skyHeight = gameRefs.world?.skyHeight || 256; // Use world skyHeight or default
    directionalLight.position.set(shadowCameraCoverage / 2, skyHeight, shadowCameraCoverage / 2);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera = new THREE.OrthographicCamera(
      -shadowCameraCoverage, shadowCameraCoverage, shadowCameraCoverage, -shadowCameraCoverage, 0.5, skyHeight * 2
    );
    directionalLight.shadow.mapSize = new THREE.Vector2(2048, 2048);
    gameRefs.scene.add(directionalLight);
    
    gameRefs.lighting = { ambient: ambientLight, directional: directionalLight };


    // Block Prototypes
    if (!gameRefs.textureLoader) {
      console.error("ThreeSetup: TextureLoader not initialized before creating block prototypes!");
      return;
    }
    const blockData = getBlockDefinitions();
    gameRefs.blocks = [
      new Block("grassBlock", blockData.grassBlock, gameRefs.textureLoader, true),
      new Block("dirtBlock", blockData.dirtBlock, gameRefs.textureLoader, false),
      new Block("stoneBlock", blockData.stoneBlock, gameRefs.textureLoader, false),
      new Block("sandBlock", blockData.sandBlock, gameRefs.textureLoader, false),
      new Block("woodLogBlock", blockData.woodLogBlock, gameRefs.textureLoader, true),
      new Block("redstoneBlock", blockData.redstoneBlock, gameRefs.textureLoader, false),
      new Block("orangeWoolBlock", blockData.orangeWoolBlock, gameRefs.textureLoader, false),
      new Block("cobblestoneBlock", blockData.cobblestoneBlock, gameRefs.textureLoader, false),
      new Block("waterBlock", blockData.waterBlock, gameRefs.textureLoader, false),
    ];

    console.log("Three.js core initialized by ThreeSetup.");
  }

  // Dispose method could be added here if ThreeSetup manages resources that RendererManager doesn't
  // For now, RendererManager handles renderer disposal and resize listener.
}
