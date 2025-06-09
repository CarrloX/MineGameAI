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

  // Marcar que estamos en el cliente
  useEffect(() => {
    setIsClient(true);
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

  useEffect(() => {
    if (!isClient) return;

    initGame();

    const refs = gameRefs.current;

    const updateCrosshairColor = () => {
      const now = performance.now();
      // Limitar la frecuencia de actualización
      if (now - lastUpdateTimeRef.current < UPDATE_INTERVAL) return;
      lastUpdateTimeRef.current = now;

      if (!refs.player || !refs.camera || !refs.raycaster) return;

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

    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", handleContextMenu);

    // Polling de memoria
    const memoryIntervalId = setInterval(() => {
      if (window.performance && (window.performance as any).memory) {
        const memory = (window.performance as any).memory;
        setSystemStats({
          memory: {
            usedMB: memory.usedJSHeapSize / (1024 * 1024),
            totalMB: memory.jsHeapSizeLimit / (1024 * 1024),
          },
        });
      }
    }, 1000);

    return () => {
      cancelAnimationFrame(animationFrameId);
      clearInterval(memoryIntervalId);
      document.removeEventListener("contextmenu", handleContextMenu);
      
      if (refs.gameLoopId !== null) {
        cancelAnimationFrame(refs.gameLoopId);
      }

      // Limpieza de recursos
      if (refs.renderer) {
        refs.renderer.dispose();
      }
      if (refs.scene) {
        refs.scene.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            if (object.geometry) object.geometry.dispose();
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
    };
  }, [initGame, isClient]);

  // Usar el hook de niebla
  useFog({ gameRefs, isCameraSubmerged });

  if (!isClient) {
    return <LoadingComponent />;
  }

  if (errorInfo) {
    return (
      <ErrorBoundaryDisplay 
        title={errorInfo.title} 
        message={errorInfo.message} 
        onClose={() => setErrorInfo(null)}
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

// Función auxiliar para limpiar materiales
const disposeMaterial = (material: THREE.Material) => {
  const mat = material as THREE.MeshStandardMaterial;
  if (mat.map) mat.map.dispose();
  if (mat.lightMap) mat.lightMap.dispose();
  if (mat.bumpMap) mat.bumpMap.dispose();
  if (mat.normalMap) mat.normalMap.dispose();
  if (mat.envMap) mat.envMap.dispose();
  material.dispose();
};

// Exportar el componente con carga dinámica
export default dynamic(() => Promise.resolve(BlockifyGame), {
  ssr: false,
  loading: () => <LoadingComponent />
});
