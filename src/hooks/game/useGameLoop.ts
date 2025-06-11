import { useCallback, useRef } from 'react';
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
    const FIXED_STEP = 1 / 60; // 60 FPS fijo para física
    const MAX_STEPS = 5; // Evitar bucles infinitos
    let numSteps = 0;
    // Acumular el tiempo real pasado
    let accumulator = physicsAccumulatorRef.current + deltaTime;
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

  return {
    gameLoop,
    lastFrameTimeRef,
    frameCountRef
  };
};