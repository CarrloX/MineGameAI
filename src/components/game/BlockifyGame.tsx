
"use client";

import React, { useEffect, useRef, useCallback, useState } from 'react';
import * as THREE from 'three';
import { World } from '@/lib/three-game/World';
// Player is now instantiated by GameLogic
// import { Player } from '@/lib/three-game/Player';
import { InputController } from '@/lib/three-game/InputController';
import { RendererManager } from '@/lib/three-game/RendererManager';
import { GameLogic } from '@/lib/three-game/GameLogic';
import { ThreeSetup } from '@/lib/three-game/ThreeSetup';
import { CONTROL_CONFIG, CURSOR_STATE, CHUNK_SIZE } from '@/lib/three-game/utils';
import type { GameRefs, DebugInfoState, ErrorInfo } from '@/lib/three-game/types';
import ErrorBoundaryDisplay from './ErrorBoundaryDisplay';

const BlockifyGame: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const gameRefs = useRef<GameRefs>({
    scene: null,
    camera: null,
    renderer: null,
    raycaster: null,
    textureLoader: null,
    world: null,
    blocks: null,
    player: null, // Player will be created by GameLogic
    inputController: null,
    rendererManager: null,
    gameLogic: null,
    threeSetup: null,
    lighting: null,
    controlConfig: { ...CONTROL_CONFIG },
    cursor: { ...CURSOR_STATE },
    gameLoopId: null,
    canvasRef: null,
  });

  const [debugInfo, setDebugInfo] = useState<DebugInfoState>({
    fps: 0,
    playerPosition: 'Player: N/A',
    playerChunk: 'Chunk: N/A',
    raycastTarget: 'Ray: None',
    highlightStatus: 'HL: Inactive',
    visibleChunks: 0,
    totalChunks: 0,
    isFlying: 'Flying: No',
    isRunning: 'Running: No',
    isBoosting: 'Boosting: No',
  });
  const [crosshairBgColor, setCrosshairBgColor] = useState<string | undefined>(undefined);
  const lastFrameTimeRef = useRef(performance.now());
  const frameCountRef = useRef(0);
  const [isCameraSubmerged, setIsCameraSubmerged] = useState(false);
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null);

  const gameLoop = useCallback(() => {
    const refs = gameRefs.current;
    if (!refs.gameLogic) {
        if (refs.gameLoopId !== null) {
          refs.gameLoopId = requestAnimationFrame(gameLoop);
        }
        return;
    }

    let newFpsValue: number | undefined = undefined;
    const now = performance.now();
    frameCountRef.current++;

    if (now >= lastFrameTimeRef.current + 1000) {
      newFpsValue = frameCountRef.current;
      frameCountRef.current = 0;
      lastFrameTimeRef.current = now;
    }

    try {
      refs.gameLogic.update(newFpsValue); // GameLogic's update now drives the game
    } catch (error: any) {
      console.error("Error in game loop:", error);
      setErrorInfo({
        title: "Game Loop Error!",
        message: `Message: ${error.message}\n\nStack:\n${error.stack}`
      });
      if (refs.gameLoopId !== null) {
        cancelAnimationFrame(refs.gameLoopId);
        refs.gameLoopId = null;
      }
      return;
    }
    if (refs.gameLoopId !== null) {
        refs.gameLoopId = requestAnimationFrame(gameLoop);
    }
  }, []); // Dependencies for gameLoop can be kept minimal if it calls stable refs


  const initGame = useCallback(() => {
    console.log("Initializing game...");
    const refs = gameRefs.current;
    if (!mountRef.current) return;
    refs.canvasRef = mountRef.current;

    setErrorInfo(null); // Clear previous errors

    // 1. Initialize Three.js core components
    refs.threeSetup = new ThreeSetup();
    refs.threeSetup.initialize(refs.canvasRef, refs); // Populates scene, camera, renderer, blocks, lighting etc. in refs

    if (!refs.scene || !refs.camera || !refs.renderer || !refs.textureLoader || !refs.blocks || !refs.lighting || !refs.raycaster) {
        console.error("ThreeSetup did not initialize all required gameRefs properties.");
        setErrorInfo({ title: "Initialization Error", message: "ThreeSetup failed to initialize essential Three.js components." });
        return;
    }
    
    // 2. Initialize RendererManager (primarily for resize handling and the render call)
    refs.rendererManager = new RendererManager(refs.canvasRef, refs);
    if (refs.renderer && refs.world) { // world is not yet initialized here, so this might need adjustment
       refs.renderer.setClearColor(new THREE.Color(0xf1f1f1)); // Default sky color, world might override
    } else if (refs.renderer) {
       refs.renderer.setClearColor(new THREE.Color(0xf1f1f1));
    }


    // 3. Initialize World (depends on blocks from ThreeSetup)
    refs.world = new World(refs);
     if (refs.renderer && refs.world) { // Now world is initialized
       refs.renderer.setClearColor(new THREE.Color(refs.world.skyColor));
    }


    // Player is now created inside GameLogic's constructor
    // Initial camera setup is also handled by GameLogic or Player constructor

    // 4. Initialize InputController (Player instance is now created by GameLogic, so pass undefined or handle later)
    refs.inputController = new InputController(refs); // Player will be set by GameLogic
    refs.inputController.setupEventListeners();

    // 5. Initialize GameLogic (creates Player, connects pieces)
    refs.gameLogic = new GameLogic(refs, setDebugInfo, setIsCameraSubmerged);
    // GameLogic's constructor now calls initializePlayer which sets up the player and camera

    console.log("Game initialized by BlockifyGame.");
    if (refs.gameLoopId === null) {
      console.log("Starting game loop from initGame");
      refs.gameLoopId = requestAnimationFrame(gameLoop);
    }
  }, [gameLoop, setDebugInfo, setIsCameraSubmerged]); // initGame dependencies


  useEffect(() => {
    initGame();

    const refs = gameRefs.current; // For cleanup

    const updateCrosshairColor = () => {
        // Access player through gameRefs, which is set by GameLogic
        if (refs.player?.lookingAt) {
            setCrosshairBgColor('rgba(255, 255, 255, 0.75)');
        } else {
            setCrosshairBgColor('rgba(0, 0, 0, 0.75)');
        }
    };

    const intervalId = setInterval(() => {
      if (refs.player) { // Check if player exists on gameRefs
        updateCrosshairColor();
      }
    }, 100);


    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      console.log("Cleaning up BlockifyGame component...");
      clearInterval(intervalId);
      if (gameRefs.current.gameLoopId !== null) {
        cancelAnimationFrame(gameRefs.current.gameLoopId);
        gameRefs.current.gameLoopId = null;
      }
      document.removeEventListener("contextmenu", handleContextMenu);

      gameRefs.current.inputController?.removeEventListeners();
      gameRefs.current.rendererManager?.dispose(); // Disposes renderer, removes resize listener
      
      // Dispose world resources (chunks)
      gameRefs.current.world?.activeChunks.forEach((chunk) => {
        if (chunk && typeof chunk.dispose === 'function') {
          chunk.dispose();
        }
      });

      // Dispose scene objects (geometries, materials)
      // This is crucial and might need to be more thorough if ThreeSetup doesn't handle it.
      // For now, RendererManager.dispose only handles the renderer itself.
      gameRefs.current.scene?.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.geometry?.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach(material => {
                material.map?.dispose(); // Dispose textures
                material.dispose();
            });
          } else if ((object.material as THREE.Material)?.map) {
             (object.material as THREE.Material).map?.dispose();
             (object.material as THREE.Material)?.dispose();
          } else if (object.material) {
            (object.material as THREE.Material)?.dispose();
          }
        }
      });
       // Clear lighting from scene if added by ThreeSetup
      if (gameRefs.current.lighting?.ambient) gameRefs.current.scene?.remove(gameRefs.current.lighting.ambient);
      if (gameRefs.current.lighting?.directional) gameRefs.current.scene?.remove(gameRefs.current.lighting.directional);


      // Nullify refs to help with GC and prevent stale references
      Object.keys(gameRefs.current).forEach(key => {
        // Keep controlConfig and cursor as they are simple objects, not holding complex resources
        if (key !== 'controlConfig' && key !== 'cursor' && key !== 'canvasRef') {
            (gameRefs.current as any)[key] = null;
        }
      });
      
      console.log("Cleanup complete for BlockifyGame.");
    };
  }, [initGame]); // useEffect for init and cleanup


  // Effect for handling camera submerged visual changes
  useEffect(() => {
    const { renderer, scene, world } = gameRefs.current;
    if (!renderer || !scene ) return; // World might not be needed if skyColor comes from a different source or is static for water

    if (isCameraSubmerged) {
        renderer.setClearColor(new THREE.Color(0x3A5F83)); // Water color
        if (!scene.fog || !(scene.fog instanceof THREE.Fog)) { // Create fog if none
            scene.fog = new THREE.Fog(0x3A5F83, 0.1, CHUNK_SIZE * 1.5);
        } else { // Update existing fog
            scene.fog.color.setHex(0x3A5F83);
            scene.fog.near = 0.1;
            scene.fog.far = CHUNK_SIZE * 1.5;
        }
    } else {
        // Revert to sky color and remove/adjust fog
        const skyColorToUse = gameRefs.current.world ? gameRefs.current.world.skyColor : 0xf1f1f1; // Fallback sky color
        renderer.setClearColor(new THREE.Color(skyColorToUse));
        scene.fog = null; // Or set to a distant sky fog if desired
    }
  }, [isCameraSubmerged]); // Only re-run when isCameraSubmerged changes


  return (
    <div ref={mountRef} className="relative w-full h-screen overflow-hidden cursor-crosshair">
      {errorInfo && (
        <ErrorBoundaryDisplay
          title={errorInfo.title}
          message={errorInfo.message}
          onClose={() => {
            setErrorInfo(null);
            // Potentially re-initialize or offer a refresh option here
          }}
        />
      )}
      {crosshairBgColor !== undefined && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none w-5 h-5 z-10">
          <div
            className="w-full h-[2px] absolute top-1/2 left-0 transform -translate-y-1/2 rounded-sm"
            style={{ backgroundColor: crosshairBgColor }}
          ></div>
          <div
            className="w-[2px] h-full absolute top-0 left-1/2 transform -translate-x-1/2 rounded-sm"
            style={{ backgroundColor: crosshairBgColor }}
          ></div>
        </div>
      )}
      <div className="absolute top-2 right-2 text-foreground bg-background/50 p-1 rounded-md text-sm pointer-events-none z-10">
        <div>FPS: {debugInfo.fps}</div>
        <div>{debugInfo.playerPosition}</div>
        <div>{debugInfo.playerChunk}</div>
        <div>{debugInfo.raycastTarget}</div>
        <div>{debugInfo.highlightStatus}</div>
        <div>Chunks: {debugInfo.visibleChunks} / {debugInfo.totalChunks}</div>
        <div>{debugInfo.isFlying}</div>
        <div>{debugInfo.isRunning}</div>
        <div>{debugInfo.isBoosting}</div>
      </div>
    </div>
  );
};

export default BlockifyGame;
