"use client";

import React, { useRef, useState, useEffect } from "react";
import * as THREE from "three";
import dynamic from 'next/dynamic';
import type { GameRefs, DebugInfoState, ErrorInfo } from "@/lib/three-game/types";
import { CONTROL_CONFIG, CURSOR_STATE, CHUNK_SIZE } from "@/lib/three-game/utils";
import { EventBus, GameEvents } from "@/lib/three-game/events/EventBus";
import { useGameLoop } from "@/hooks/game/useGameLoop";
import { useGameInitialization } from "@/hooks/game/useGameInitialization";
import { GameDebugOverlay } from "./GameDebugOverlay";
import { GameCrosshair } from "./GameCrosshair";
import ErrorBoundaryDisplay from "./ErrorBoundaryDisplay";
import { useFog } from '@/hooks/game/useFog';
import { gameLogger } from '@/lib/three-game/services/LoggingService';
import { getRecoveryService } from '@/lib/three-game/services/RecoveryService';
import PauseMenu from '../PauseMenu';
import styles from './BlockifyGame.module.css';

// Componente de carga
const LoadingComponent = () => (
  <div className="w-full h-screen flex items-center justify-center bg-black text-white">
    <div className="text-xl">Cargando juego...</div>
  </div>
);

const BlockifyGame: React.FC = () => {
  const [isClient, setIsClient] = useState(false);
  const mountRef = useRef<HTMLDivElement>(null);
  const gameRefs = useRef<GameRefs>({
    scene: null,
    camera: null,
    renderer: null,
    raycaster: null,
    textureLoader: null,
    world: null,
    blocks: null,
    player: null,
    inputController: null,
    rendererManager: null,
    gameLogic: null,
    threeSetup: null,
    lighting: null,
    controlConfig: { ...CONTROL_CONFIG },
    cursor: { ...CURSOR_STATE },
    gameLoopId: null,
    canvasRef: null,
    worldSeed: null,
    sky: null,
    eventBus: EventBus.getInstance(),
    controls: null,
    clock: null,
  });

  const [debugInfo, setDebugInfo] = useState<DebugInfoState>({
    fps: 0,
    playerPosition: "Player: N/A",
    playerChunk: "Chunk: N/A",
    raycastTarget: "Ray: None",
    highlightStatus: "HL: Inactive",
    visibleChunks: 0,
    totalChunks: 0,
    isFlying: "Flying: No",
    isRunning: "Running: No",
    isBoosting: "Boosting: No",
    lookDirection: "Look: N/A",
  });

  const [crosshairBgColor, setCrosshairBgColor] = useState<string>("rgba(0, 0, 0, 0.75)");
  const lastUpdateTimeRef = useRef(0);
  const UPDATE_INTERVAL = 100; // Actualizar cada 100ms
  const [isCameraSubmerged, setIsCameraSubmerged] = useState(false);
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null);
  const [systemStats, setSystemStats] = useState({
    memory: null as null | { usedMB: number; totalMB: number },
  });
  const [isGamePaused, setIsGamePaused] = useState(false);
  const [showDebugOverlay, setShowDebugOverlay] = useState(true);
  const showDebugOverlayRef = useRef(true);

  const recoveryServiceRef = useRef(getRecoveryService());
  const fpsLimitRef = useRef<number>(60);

  // Marcar que estamos en el cliente e inicializar el servicio de recuperación
  useEffect(() => {
    setIsClient(true);
    recoveryServiceRef.current.initialize();
    gameLogger.logGameEvent('Componente montado en el cliente');
  }, []);

  // Mantener el ref sincronizado con el estado
  useEffect(() => {
    showDebugOverlayRef.current = showDebugOverlay;
  }, [showDebugOverlay]);

  // Pasa showDebugOverlayRef a gameLoop para evitar updates de debugInfo si está oculto
  const { gameLoop } = useGameLoop({
    gameRefs,
    setDebugInfo,
    errorInfo,
    setErrorInfo,
    debugEnabledRef: showDebugOverlayRef,
    fpsLimitRef,
  });

  const { initGame } = useGameInitialization({
    gameRefs,
    mountRef,
    setErrorInfo,
    setDebugInfo,
    setIsCameraSubmerged,
    gameLoop,
  });

  // Efecto para manejar la recuperación
  useEffect(() => {
    if (!isClient) return;

    const handleRecoveryAttempt = (event: CustomEvent) => {
      gameLogger.logGameEvent('Recibido evento de recuperación');
      
      // Pausar el game loop
      if (gameRefs.current.gameLoopId !== null) {
        cancelAnimationFrame(gameRefs.current.gameLoopId);
        gameRefs.current.gameLoopId = null;
      }

      // Limpiar recursos específicos del juego
      if (gameRefs.current.renderer) {
        gameRefs.current.renderer.dispose();
      }

      // Reinicializar componentes críticos
      try {
        initGame();
        gameLogger.logGameEvent('Recuperación completada exitosamente');
      } catch (error) {
        gameLogger.logError(
          new Error('Error durante la recuperación del juego'),
          'Game Recovery Failed'
        );
      }
    };

    window.addEventListener('gameRecoveryAttempt', handleRecoveryAttempt as EventListener);

    return () => {
      window.removeEventListener('gameRecoveryAttempt', handleRecoveryAttempt as EventListener);
    };
  }, [isClient, initGame]);

  // Modificar el useEffect principal para incluir manejo de recuperación
  useEffect(() => {
    if (!isClient) return;

    if (recoveryServiceRef.current.isInRecoveryMode()) {
      gameLogger.logGameEvent('Iniciando en modo recuperación');
      // Esperar a que termine el período de recuperación
      return;
    }

    gameLogger.logGameEvent('Iniciando montaje del juego');
    initGame();

    const refs = gameRefs.current;

    // Suscribirse al evento de cambio de distancia de renderizado
    const eventBus = refs.eventBus;
    const handleRenderDistanceChange = (event: { distance: number }) => {
        if (refs.world && refs.player?.mesh) { // Asegurarse de que world y player estén disponibles
            refs.world.renderDistanceInChunks = event.distance;
            gameLogger.logGameEvent(`Distancia de renderizado actualizada a ${event.distance}`);
            // Forzar una actualización inmediata de chunks con la nueva distancia
            refs.world.updateChunks(refs.player.mesh.position);
        } else {
            gameLogger.logGameEvent('World o Player no disponibles al cambiar distancia de renderizado.');
        }
    };
    eventBus.on(GameEvents.RENDER_DISTANCE_CHANGE, handleRenderDistanceChange);

    const updateCrosshairColor = () => {
      const now = performance.now();
      if (now - lastUpdateTimeRef.current < UPDATE_INTERVAL) return;
      lastUpdateTimeRef.current = now;

      if (!refs.player || !refs.camera || !refs.raycaster) {
        gameLogger.logError(
          new Error("Componentes necesarios no disponibles para actualizar crosshair"),
          'Crosshair Update'
        );
        return;
      }

      // Obtener el punto central de la pantalla
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;

      // Actualizar el raycaster
      refs.raycaster.setFromCamera(
        new THREE.Vector2(
          (centerX / window.innerWidth) * 2 - 1,
          -(centerY / window.innerHeight) * 2 + 1
        ),
        refs.camera
      );

      // Realizar el raycast
      const intersects = refs.raycaster.intersectObjects(refs.scene!.children, true);

      if (intersects.length > 0) {
        const target = intersects[0].object;
        // Verificar si el objeto es interactuable
        if (target.userData?.isInteractable) {
          setCrosshairBgColor("rgba(255, 255, 255, 0.75)");
          gameLogger.logGameState('Crosshair interactuable detectado', {
            objectType: target.type,
            position: target.position.toArray()
          });
        } else if (target instanceof THREE.Mesh) {
          // Si no es interactuable, usar el color opuesto al fondo
          const material = target.material as THREE.MeshStandardMaterial;
          if (material && material.color) {
            const brightness = (material.color.r + material.color.g + material.color.b) / 3;
            setCrosshairBgColor(brightness > 0.5 ? "rgba(0, 0, 0, 0.75)" : "rgba(255, 255, 255, 0.75)");
          } else {
            setCrosshairBgColor("rgba(0, 0, 0, 0.75)");
          }
        } else {
          setCrosshairBgColor("rgba(0, 0, 0, 0.75)");
        }
      } else {
        // Si no hay intersección, usar el color opuesto al cielo
        const skyColor = refs.sky?.getSkyColorProvider()?.getSkyColor();
        if (skyColor) {
          const brightness = (skyColor.r + skyColor.g + skyColor.b) / 3;
          setCrosshairBgColor(brightness > 0.5 ? "rgba(0, 0, 0, 0.75)" : "rgba(255, 255, 255, 0.75)");
        } else {
          setCrosshairBgColor("rgba(0, 0, 0, 0.75)");
        }
      }
    };

    // Usar requestAnimationFrame para actualizaciones más suaves
    let animationFrameId: number;
    const animate = () => {
      updateCrosshairColor();
      animationFrameId = requestAnimationFrame(animate);
    };
    animationFrameId = requestAnimationFrame(animate);

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      gameLogger.logGameEvent('Contexto del menú bloqueado');
    };
    document.addEventListener("contextmenu", handleContextMenu);

    // Polling de memoria con logging
    const memoryIntervalId = setInterval(() => {
      if (window.performance && (window.performance as any).memory) {
        const memory = (window.performance as any).memory;
        const usedMB = memory.usedJSHeapSize / (1024 * 1024);
        const totalMB = memory.jsHeapSizeLimit / (1024 * 1024);
        
        setSystemStats({
          memory: {
            usedMB,
            totalMB,
          },
        });

        // Registrar uso de memoria si excede el 80%
        if (usedMB / totalMB > 0.8) {
          gameLogger.logError(
            new Error(`Uso de memoria crítico: ${usedMB.toFixed(2)}MB / ${totalMB.toFixed(2)}MB`),
            'Memory Usage'
          );
        }
      }
    }, 1000);

    return () => {
      if (recoveryServiceRef.current.isInRecoveryMode()) {
        gameLogger.logGameEvent('Omitiendo limpieza durante recuperación');
        return;
      }

      cancelAnimationFrame(animationFrameId);
      clearInterval(memoryIntervalId);
      document.removeEventListener("contextmenu", handleContextMenu);
      
      if (refs.gameLoopId !== null) {
        cancelAnimationFrame(refs.gameLoopId);
        gameLogger.logGameEvent('Game loop detenido');
      }

      // Limpieza de recursos con logging
      if (refs.renderer) {
        refs.renderer.dispose();
      }
      
      if (refs.scene) {
        refs.scene.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            if (object.geometry) {
              object.geometry.dispose();
            }
            if (object.material) {
              if (Array.isArray(object.material)) {
                object.material.forEach(disposeMaterial);
              } else {
                disposeMaterial(object.material);
              }
            }
          }
        });
      }

      eventBus.off(GameEvents.RENDER_DISTANCE_CHANGE, handleRenderDistanceChange);
    };
  }, [initGame, isClient]);

  // Usar el hook de niebla
  useFog({ gameRefs, isCameraSubmerged });

  // Sincronizar el estado de pausa de GameLogic con React usando eventos
  useEffect(() => {
    const eventBus = gameRefs.current.eventBus;
    if (!eventBus) return;
    const handleGameStateChange = (event: { state: string }) => {
      setIsGamePaused(event.state === "paused");
    };
    eventBus.on("game:state_change", handleGameStateChange);
    // Inicializar el estado de pausa al montar
    if (gameRefs.current.gameLogic) {
      setIsGamePaused(gameRefs.current.gameLogic.isPaused);
    }
    return () => {
      eventBus.off("game:state_change", handleGameStateChange);
    };
  }, []);

  const handleResumeGame = () => {
    if (gameRefs.current.gameLogic) {
      gameRefs.current.gameLogic.togglePause();
    }
  };

  // Manejo de la tecla F3 para mostrar/ocultar el overlay de depuración
  useEffect(() => {
    const handleF3 = (e: KeyboardEvent) => {
      if (e.code === 'F3' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        setShowDebugOverlay(prev => !prev);
        e.preventDefault();
        e.stopPropagation(); // Bloquear buscador del navegador
      }
    };
    window.addEventListener('keydown', handleF3, { capture: true });
    return () => window.removeEventListener('keydown', handleF3, { capture: true });
  }, []);

  // Escuchar cambios en el límite de FPS
  useEffect(() => {
    const eventBus = gameRefs.current.eventBus;
    const handleFpsLimitChange = (event: { fps: number }) => {
      fpsLimitRef.current = event.fps;
      gameLogger.logGameEvent(`Límite de FPS actualizado a ${event.fps === 0 ? 'Ilimitado' : event.fps}`);
    };
    eventBus.on('FPS_LIMIT_CHANGE', handleFpsLimitChange);
    return () => {
      eventBus.off('FPS_LIMIT_CHANGE', handleFpsLimitChange);
    };
  }, []);

  if (!isClient) {
    return <LoadingComponent />;
  }

  if (errorInfo) {
    const error = new Error(errorInfo.message);
    gameLogger.logError(error, errorInfo.title);
    
    // Intentar recuperación si es posible
    if (!recoveryServiceRef.current.isInRecoveryMode()) {
      recoveryServiceRef.current.handleCrash('component', error);
    }

    return (
      <ErrorBoundaryDisplay 
        title={errorInfo.title} 
        message={errorInfo.message} 
        onClose={() => {
          setErrorInfo(null);
          gameLogger.logGameEvent('Error boundary cerrado');
          // Resetear contador de crashes si la recuperación fue exitosa
          if (recoveryServiceRef.current.getCrashCount() > 0) {
            recoveryServiceRef.current.resetCrashCount();
          }
        }}
      />
    );
  }

  return (
    <div className={styles.rootContainer}>
      <div 
        ref={mountRef} 
        className="absolute inset-0 w-full h-full bg-transparent touch-none"
      />
      {showDebugOverlay && (
        <GameDebugOverlay debugInfo={debugInfo} systemStats={systemStats} />
      )}
      <GameCrosshair crosshairBgColor={crosshairBgColor} />
      <PauseMenu isPaused={isGamePaused} onResumeGame={handleResumeGame} />
    </div>
  );
};

// Función auxiliar para limpiar materiales con logging
const disposeMaterial = (material: THREE.Material) => {
  const mat = material as THREE.MeshStandardMaterial;
  if (mat.map) {
    mat.map.dispose();
  }
  if (mat.lightMap) {
    mat.lightMap.dispose();
  }
  if (mat.bumpMap) {
    mat.bumpMap.dispose();
  }
  if (mat.normalMap) {
    mat.normalMap.dispose();
  }
  if (mat.envMap) {
    mat.envMap.dispose();
  }
  material.dispose();
};

// Exportar el componente con carga dinámica
export default dynamic(() => Promise.resolve(BlockifyGame), {
  ssr: false,
  loading: () => <LoadingComponent />
});
