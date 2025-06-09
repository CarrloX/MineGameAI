"use client";

import React, { useRef, useState, useEffect } from "react";
import * as THREE from "three";
import dynamic from 'next/dynamic';
import type { GameRefs, DebugInfoState, ErrorInfo } from "@/lib/three-game/types";
import { CONTROL_CONFIG, CURSOR_STATE, CHUNK_SIZE } from "@/lib/three-game/utils";
import { EventBus } from "@/lib/three-game/events/EventBus";
import { useGameLoop } from "@/hooks/game/useGameLoop";
import { useGameInitialization } from "@/hooks/game/useGameInitialization";
import { GameDebugOverlay } from "./GameDebugOverlay";
import { GameCrosshair } from "./GameCrosshair";
import ErrorBoundaryDisplay from "./ErrorBoundaryDisplay";
import { useFog } from '@/hooks/game/useFog';
import { gameLogger } from '@/lib/three-game/services/LoggingService';
import { getRecoveryService } from '@/lib/three-game/services/RecoveryService';

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

  const recoveryServiceRef = useRef(getRecoveryService());

  // Marcar que estamos en el cliente e inicializar el servicio de recuperación
  useEffect(() => {
    setIsClient(true);
    recoveryServiceRef.current.initialize();
    gameLogger.logGameEvent('Componente montado en el cliente');
  }, []);

  const { gameLoop } = useGameLoop({
    gameRefs,
    setDebugInfo,
    errorInfo,
    setErrorInfo,
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
    gameLogger.logGameEvent('Loop de animación iniciado');

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

      gameLogger.logGameEvent('Iniciando limpieza del componente');
      
      cancelAnimationFrame(animationFrameId);
      clearInterval(memoryIntervalId);
      document.removeEventListener("contextmenu", handleContextMenu);
      
      if (refs.gameLoopId !== null) {
        cancelAnimationFrame(refs.gameLoopId);
        gameLogger.logGameEvent('Game loop detenido');
      }

      // Limpieza de recursos con logging
      if (refs.renderer) {
        gameLogger.logGameEvent('Limpiando renderer');
        refs.renderer.dispose();
      }
      
      if (refs.scene) {
        gameLogger.logGameEvent('Limpiando escena y recursos');
        refs.scene.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            if (object.geometry) {
              object.geometry.dispose();
              gameLogger.logGameEvent('Geometría liberada', { 
                type: object.geometry.type,
                uuid: object.geometry.uuid 
              });
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
      
      gameLogger.logGameEvent('Limpieza completada');
    };
  }, [initGame, isClient]);

  // Usar el hook de niebla
  useFog({ gameRefs, isCameraSubmerged });

  if (!isClient) {
    gameLogger.logGameEvent('Renderizando componente de carga');
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
    <div className="relative w-full h-screen overflow-hidden">
      <div 
        ref={mountRef} 
        className="absolute inset-0 w-full h-full bg-transparent touch-none"
      />
      <GameDebugOverlay debugInfo={debugInfo} systemStats={systemStats} />
      <GameCrosshair crosshairBgColor={crosshairBgColor} />
    </div>
  );
};

// Función auxiliar para limpiar materiales con logging
const disposeMaterial = (material: THREE.Material) => {
  const mat = material as THREE.MeshStandardMaterial;
  if (mat.map) {
    mat.map.dispose();
    gameLogger.logGameEvent('Textura liberada', { type: 'map', uuid: mat.map.uuid });
  }
  if (mat.lightMap) {
    mat.lightMap.dispose();
    gameLogger.logGameEvent('Textura liberada', { type: 'lightMap', uuid: mat.lightMap.uuid });
  }
  if (mat.bumpMap) {
    mat.bumpMap.dispose();
    gameLogger.logGameEvent('Textura liberada', { type: 'bumpMap', uuid: mat.bumpMap.uuid });
  }
  if (mat.normalMap) {
    mat.normalMap.dispose();
    gameLogger.logGameEvent('Textura liberada', { type: 'normalMap', uuid: mat.normalMap.uuid });
  }
  if (mat.envMap) {
    mat.envMap.dispose();
    gameLogger.logGameEvent('Textura liberada', { type: 'envMap', uuid: mat.envMap.uuid });
  }
  material.dispose();
  gameLogger.logGameEvent('Material liberado', { type: material.type, uuid: material.uuid });
};

// Exportar el componente con carga dinámica
export default dynamic(() => Promise.resolve(BlockifyGame), {
  ssr: false,
  loading: () => <LoadingComponent />
});
