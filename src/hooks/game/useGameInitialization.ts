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
import { gameLogger } from '@/lib/three-game/services/LoggingService';

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
    const startTime = performance.now();
    gameLogger.logGameEvent('Iniciando inicialización del juego');

    const refs = gameRefs.current;
    if (!mountRef.current) {
      const error = new Error("Mount ref no disponible");
      gameLogger.logError(error, 'Game Initialization');
      return;
    }
    refs.canvasRef = mountRef.current;

    setErrorInfo(null);

    // Generar seed del mundo
    refs.worldSeed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString();
    gameLogger.logGameState('World Seed generado', { seed: refs.worldSeed });

    try {
      // Inicializar Three.js
      gameLogger.logGameEvent('Iniciando configuración de Three.js');
      refs.threeSetup = new ThreeSetup();
      refs.threeSetup.initialize(refs.canvasRef, refs);

      // Verificar inicialización
      if (!validateThreeSetup(refs)) {
        const error = new Error("ThreeSetup validation failed");
        gameLogger.logError(error, 'Three.js Setup');
        setErrorInfo({
          title: "Initialization Error",
          message: "ThreeSetup failed to initialize essential Three.js components.",
        });
        return;
      }
      gameLogger.logGameEvent('Three.js inicializado correctamente');

      // Configurar renderer y sky
      gameLogger.logGameEvent('Configurando renderer y sky');
      setupRendererAndSky(refs);

      // Inicializar mundo
      gameLogger.logGameEvent('Iniciando generación del mundo');
      if (!initializeWorld(refs, setErrorInfo)) {
        const error = new Error("World initialization failed");
        gameLogger.logError(error, 'World Generation');
        return;
      }

      // Configurar controles y lógica del juego
      gameLogger.logGameEvent('Configurando controles y lógica del juego');
      setupGameControlsAndLogic(refs, setDebugInfo, setIsCameraSubmerged);

      // Iniciar game loop
      if (refs.gameLoopId === null) {
        refs.gameLoopId = requestAnimationFrame(gameLoop);
        gameLogger.logGameEvent('Game loop iniciado');
      }

      // Forzar un render inicial
      if (refs.renderer && refs.scene && refs.camera) {
        refs.renderer.render(refs.scene, refs.camera);
      }

      const endTime = performance.now();
      gameLogger.logPerformance('Game Initialization', endTime - startTime);
      gameLogger.logGameState('Juego inicializado completamente');

    } catch (error) {
      gameLogger.logError(error instanceof Error ? error : new Error(String(error)), 'Game Initialization');
      setErrorInfo({
        title: "Initialization Error",
        message: `Error during initialization: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }, [gameRefs, mountRef, setErrorInfo, setDebugInfo, setIsCameraSubmerged, gameLoop]);

  return { initGame };
};

// Funciones auxiliares actualizadas con logging
const validateThreeSetup = (refs: GameRefs): boolean => {
  const isValid = !!(
    refs.scene &&
    refs.camera &&
    refs.renderer &&
    refs.textureLoader &&
    refs.blocks &&
    refs.lightingService &&
    refs.raycaster &&
    refs.sky
  );

  if (!isValid) {
    gameLogger.logError(
      new Error("Componentes de Three.js faltantes"),
      'Three.js Validation'
    );
  }

  return isValid;
};

const setupRendererAndSky = (refs: GameRefs) => {
  if (!refs.canvasRef) {
    gameLogger.logError(
      new Error("Canvas reference no disponible"),
      'Renderer Setup'
    );
    return;
  }

  gameLogger.logGameEvent('Creando renderer manager');
  refs.rendererManager = new RendererManager(refs.canvasRef, refs);

  if (refs.renderer) {
    const width = refs.canvasRef.clientWidth;
    const height = refs.canvasRef.clientHeight;
    refs.renderer.setSize(width, height, false);
    refs.renderer.setPixelRatio(window.devicePixelRatio);

    if (refs.sky?.getSkyColorProvider()) {
      const skyColor = refs.sky.getSkyColorProvider().getSkyColor();
      refs.renderer.setClearColor(skyColor);
      gameLogger.logGameState('Color del cielo configurado', { color: skyColor });
    }
  }
};

const initializeWorld = (refs: GameRefs, setErrorInfo: (error: any) => void): boolean => {
  if (refs.worldSeed === null) {
    const error = new Error("World Seed missing");
    gameLogger.logError(error, 'World Initialization');
    setErrorInfo({
      title: "Initialization Error",
      message: "World Seed missing.",
    });
    return false;
  }
  refs.world = new World(refs, refs.worldSeed);
  gameLogger.logGameState('Mundo inicializado', { seed: refs.worldSeed });
  return true;
};

const setupGameControlsAndLogic = (
  refs: GameRefs,
  setDebugInfo: (updateFn: (prevState: DebugInfoState) => DebugInfoState) => void,
  setIsCameraSubmerged: (value: boolean | ((prev: boolean) => boolean)) => void
) => {
  // refs.inputController is initialized within GameLogic's constructor.
  refs.gameLogic = new GameLogic(refs, setDebugInfo, setIsCameraSubmerged);

  if (refs.inputController && refs.player) {
    refs.inputController.setPlayer(refs.player);
    gameLogger.logGameEvent('Controles vinculados al jugador');
  } else {
    gameLogger.logError(
      new Error("InputController o Player no disponible"),
      'Controls Setup'
    );
  }
  refs.inputController.setupEventListeners();
  gameLogger.logGameEvent('Event listeners configurados');
}; 