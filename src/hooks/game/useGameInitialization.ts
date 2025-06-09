import { useCallback } from 'react';
import * as THREE from 'three';
import type { GameRefs } from '@/lib/three-game/types';
import { World } from '@/lib/three-game/World';
import { InputController } from '@/lib/three-game/InputController';
import { RendererManager } from '@/lib/three-game/RendererManager';
import { GameLogic } from '@/lib/three-game/GameLogic';
import { ThreeSetup } from '@/lib/three-game/ThreeSetup';
import { EventBus } from '@/lib/three-game/events/EventBus';
import type { DebugInfoState } from '@/lib/three-game/types';

interface UseGameInitializationProps {
  gameRefs: React.MutableRefObject<GameRefs>;
  mountRef: React.RefObject<HTMLDivElement>;
  setErrorInfo: (error: any) => void;
  setDebugInfo: (updateFn: (prevState: DebugInfoState) => DebugInfoState) => void;
  setIsCameraSubmerged: (value: boolean | ((prev: boolean) => boolean)) => void;
  gameLoop: () => void;
}

export const useGameInitialization = ({
  gameRefs,
  mountRef,
  setErrorInfo,
  setDebugInfo,
  setIsCameraSubmerged,
  gameLoop
}: UseGameInitializationProps) => {
  const initGame = useCallback(() => {
    console.log("Initializing game...");
    const refs = gameRefs.current;
    if (!mountRef.current) {
      console.error("Mount ref is not available");
      return;
    }
    refs.canvasRef = mountRef.current;

    setErrorInfo(null);

    // Generar seed del mundo
    refs.worldSeed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString();
    console.log("Generated World Seed:", refs.worldSeed);

    try {
      // Inicializar Three.js
      console.log("Initializing Three.js setup...");
      refs.threeSetup = new ThreeSetup();
      refs.threeSetup.initialize(refs.canvasRef, refs);
      console.log("Three.js setup initialized");

      // Verificar inicialización
      if (!validateThreeSetup(refs)) {
        console.error("ThreeSetup validation failed:", {
          scene: !!refs.scene,
          camera: !!refs.camera,
          renderer: !!refs.renderer,
          textureLoader: !!refs.textureLoader,
          blocks: !!refs.blocks,
          lighting: !!refs.lighting,
          raycaster: !!refs.raycaster,
          sky: !!refs.sky
        });
        setErrorInfo({
          title: "Initialization Error",
          message: "ThreeSetup failed to initialize essential Three.js components.",
        });
        return;
      }

      // Configurar renderer y sky
      console.log("Setting up renderer and sky...");
      setupRendererAndSky(refs);
      console.log("Renderer and sky setup complete");

      // Inicializar mundo
      console.log("Initializing world...");
      if (!initializeWorld(refs, setErrorInfo)) {
        console.error("World initialization failed");
        return;
      }
      console.log("World initialized");

      // Configurar controles y lógica del juego
      console.log("Setting up game controls and logic...");
      setupGameControlsAndLogic(refs, setDebugInfo, setIsCameraSubmerged);
      console.log("Game controls and logic setup complete");

      // Iniciar game loop
      console.log("Starting game loop...");
      if (refs.gameLoopId === null) {
        refs.gameLoopId = requestAnimationFrame(gameLoop);
        console.log("Game loop started");
      }

      // Forzar un render inicial
      if (refs.renderer && refs.scene && refs.camera) {
        console.log("Forcing initial render...");
        refs.renderer.render(refs.scene, refs.camera);
      }

    } catch (error) {
      console.error("Error during game initialization:", error);
      setErrorInfo({
        title: "Initialization Error",
        message: `Error during initialization: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }, [gameRefs, mountRef, setErrorInfo, setDebugInfo, setIsCameraSubmerged, gameLoop]);

  return { initGame };
};

// Funciones auxiliares
const validateThreeSetup = (refs: GameRefs): boolean => {
  const isValid = !!(
    refs.scene &&
    refs.camera &&
    refs.renderer &&
    refs.textureLoader &&
    refs.blocks &&
    refs.lighting &&
    refs.raycaster &&
    refs.sky
  );

  if (!isValid) {
    console.error("ThreeSetup validation failed. Missing components:", {
      scene: !refs.scene,
      camera: !refs.camera,
      renderer: !refs.renderer,
      textureLoader: !refs.textureLoader,
      blocks: !refs.blocks,
      lighting: !refs.lighting,
      raycaster: !refs.raycaster,
      sky: !refs.sky
    });
  }

  return isValid;
};

const setupRendererAndSky = (refs: GameRefs) => {
  if (!refs.canvasRef) {
    console.error("Canvas reference is not available for renderer setup");
    return;
  }

  console.log("Creating renderer manager...");
  refs.rendererManager = new RendererManager(refs.canvasRef, refs);

  if (refs.renderer) {
    console.log("Configuring renderer...");
    // Asegurar que el renderer tenga el tamaño correcto
    const width = refs.canvasRef.clientWidth;
    const height = refs.canvasRef.clientHeight;
    refs.renderer.setSize(width, height, false);
    refs.renderer.setPixelRatio(window.devicePixelRatio);

    // Configurar color de fondo
    if (refs.sky?.getSkyColorProvider()) {
      const skyColor = refs.sky.getSkyColorProvider().getSkyColor();
      console.log("Setting sky color:", skyColor);
      refs.renderer.setClearColor(skyColor);
    } else {
      console.log("Setting default sky color");
      refs.renderer.setClearColor(new THREE.Color(0xf1f1f1));
    }
  } else {
    console.error("Renderer is not available for setup");
  }
};

const initializeWorld = (refs: GameRefs, setErrorInfo: (error: any) => void): boolean => {
  if (refs.worldSeed === null) {
    console.error("Initialization Error: World Seed is null before World creation.");
    setErrorInfo({
      title: "Initialization Error",
      message: "World Seed missing.",
    });
    return false;
  }
  refs.world = new World(refs, refs.worldSeed);
  return true;
};

const setupGameControlsAndLogic = (
  refs: GameRefs,
  setDebugInfo: (updateFn: (prevState: DebugInfoState) => DebugInfoState) => void,
  setIsCameraSubmerged: (value: boolean | ((prev: boolean) => boolean)) => void
) => {
  refs.inputController = new InputController(refs);
  refs.gameLogic = new GameLogic(refs, setDebugInfo, setIsCameraSubmerged);

  if (refs.inputController && refs.player) {
    refs.inputController.setPlayer(refs.player);
  } else {
    console.warn("InputController or Player not available to link after GameLogic init.");
  }
  refs.inputController.setupEventListeners();
}; 