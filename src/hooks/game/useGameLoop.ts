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

    // FPS limit logic (más preciso)
    if (typeof fpsLimitRef !== 'undefined' && fpsLimitRef.current > 0) {
      const minFrameTime = 1000 / fpsLimitRef.current;
      if (now - lastFrameTimeRef.current < minFrameTime) {
        refs.gameLoopId = requestAnimationFrame(gameLoop);
        return;
      }
    }
    lastFrameTimeRef.current = now;

    // Actualización de FPS
    if (deltaTime > 0 && (!debugEnabledRef || debugEnabledRef.current)) {
      const currentFps = 1 / deltaTime;
      const window = fpsWindowRef.current;
      window.push(currentFps);
      if (window.length > 60) window.shift();
      const avgFps = window.reduce((a, b) => a + b, 0) / window.length;
      setDebugInfo(prev => ({ ...prev, fps: Math.round(avgFps) }));
    }
    try {
      // Actualizar lógica del juego
      if (refs.gameLogic) {
        refs.gameLogic.update(deltaTime, undefined, !debugEnabledRef || debugEnabledRef.current);
      }
      // Renderizar la escena
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