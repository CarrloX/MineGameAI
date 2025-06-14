import React, { useCallback, useRef } from 'react';
import type { GameRefs } from '@/lib/three-game/types';
import type { DebugInfoState } from '@/lib/three-game/types';

interface UseGameLoopProps {
  gameRefs: React.MutableRefObject<GameRefs>;
  setDebugInfo: (updateFn: (prevState: DebugInfoState) => DebugInfoState) => void;
  errorInfo: any;
  setErrorInfo: (error: any) => void;
  debugEnabledRef?: React.MutableRefObject<boolean>;
  fpsLimitRef?: React.MutableRefObject<number>;
}

export const useGameLoop = ({ 
  gameRefs, 
  setDebugInfo, 
  errorInfo, 
  setErrorInfo,
  debugEnabledRef,
  fpsLimitRef
}: UseGameLoopProps) => {
  const lastFrameTimeRef = useRef(performance.now());
  const frameCountRef = useRef(0);
  const fpsWindowRef = useRef<number[]>([]);
  // Acumulador de física global para el game loop
  const physicsAccumulatorRef = useRef(0);

  const gameLoop = useCallback(() => {
    const refs = gameRefs.current;
    
    if (errorInfo) {
      console.log("Game loop stopped due to error");
      if (refs.gameLoopId !== null) {
        cancelAnimationFrame(refs.gameLoopId);
        refs.gameLoopId = null;
      }
      return;
    }

    if (!refs.gameLogic || !refs.camera || !refs.renderer || !refs.scene) {
      console.warn("Missing required components for game loop:", {
        gameLogic: !!refs.gameLogic,
        camera: !!refs.camera,
        renderer: !!refs.renderer,
        scene: !!refs.scene
      });
      if (refs.gameLoopId !== null) {
        refs.gameLoopId = requestAnimationFrame(gameLoop);
      }
      return;
    }

    const now = performance.now();
    let deltaTime = (now - lastFrameTimeRef.current) / 1000.0;
    // Limitar deltaTime máximo para evitar saltos de física por lag o pausa
    deltaTime = Math.min(deltaTime, 0.25); // Máx 0.25s (4 FPS) para evitar acumulación tras tab-out
    const FIXED_STEP = 1 / 60; // 60 FPS fijo para física
    const MAX_STEPS = 10; // Permitir más pasos pero evitar bucles infinitos
    let numSteps = 0;
    // Acumular el tiempo real pasado
    let accumulator = physicsAccumulatorRef.current + deltaTime;
    if (accumulator > 0.5) accumulator = 0.5; // Limitar acumulador tras tab-out (máx 0.5s de catch-up)
    // Lógica de física y cielo en pasos fijos
    while (accumulator >= FIXED_STEP && numSteps < MAX_STEPS) {
      if (refs.gameLogic) {
        refs.gameLogic.fixedStepUpdate(FIXED_STEP);
      }
      accumulator -= FIXED_STEP;
      numSteps++;
    }
    physicsAccumulatorRef.current = accumulator;
    lastFrameTimeRef.current = now;
    // Lógica de frame: chunks, highlight, etc. (cada frame)
    if (refs.gameLogic) {
      refs.gameLogic.update(deltaTime, undefined, !debugEnabledRef || debugEnabledRef.current);
    }
    // Actualización de FPS (solo para mostrar, no para física)
    if (deltaTime > 0 && (!debugEnabledRef || debugEnabledRef.current)) {
      const currentFps = 1 / deltaTime;
      const window = fpsWindowRef.current;
      window.push(currentFps);
      if (window.length > 60) window.shift();
      const avgFps = window.reduce((a, b) => a + b, 0) / window.length;
      setDebugInfo(prev => ({ ...prev, fps: Math.round(avgFps) }));
    }
    try {
      // Renderizar la escena (solo una vez por frame)
      if (refs.renderer && refs.scene && refs.camera) {
        refs.renderer.render(refs.scene, refs.camera);
      } else {
        console.warn("Cannot render: missing renderer, scene, or camera");
      }
    } catch (error: any) {
      console.error("Error in game loop:", error);
      if (!errorInfo) {
        setErrorInfo({
          title: "Game Loop Error!",
          message: `Message: ${error.message}\n\nStack:\n${error.stack}`,
        });
      }
      if (refs.gameLoopId !== null) {
        cancelAnimationFrame(refs.gameLoopId);
        refs.gameLoopId = null;
      }
      return;
    }

    // FPS limit logic
    let nextFrame = () => requestAnimationFrame(gameLoop);
    if (typeof fpsLimitRef !== 'undefined' && fpsLimitRef.current > 0) {
      const minFrameTime = 1000 / fpsLimitRef.current;
      const elapsed = performance.now() - now;
      if (elapsed < minFrameTime) {
        setTimeout(() => requestAnimationFrame(gameLoop), minFrameTime - elapsed);
        return;
      }
    }
    if (refs.gameLoopId !== null) {
      refs.gameLoopId = requestAnimationFrame(gameLoop);
    }
  }, [errorInfo, gameRefs, setDebugInfo, setErrorInfo, debugEnabledRef, fpsLimitRef]);

  // FPS dinámico según visibilidad
  const userFpsLimitRef = useRef<number | undefined>(undefined);
  // Detectar cambio de visibilidad de la pestaña
  React.useEffect(() => {
    function handleVisibility() {
      if (document.hidden) {
        // Solo guardar el límite del usuario si aún no está guardado
        if (fpsLimitRef && fpsLimitRef.current !== 30 && userFpsLimitRef.current === undefined) {
          userFpsLimitRef.current = fpsLimitRef.current;
          fpsLimitRef.current = 30;
        }
      } else {
        // Restaurar el límite del usuario si estaba guardado
        if (fpsLimitRef && userFpsLimitRef.current !== undefined) {
          fpsLimitRef.current = userFpsLimitRef.current;
          userFpsLimitRef.current = undefined;
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);
    window.addEventListener('blur', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
      window.removeEventListener('blur', handleVisibility);
    };
  }, [fpsLimitRef]);

  return {
    gameLoop,
    lastFrameTimeRef,
    frameCountRef
  };
};