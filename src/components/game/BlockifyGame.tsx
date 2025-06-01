
"use client";

import React, { useEffect, useRef, useCallback, useState } from 'react';
import * as THREE from 'three';
import { World } from '@/lib/three-game/World';
import { InputController } from '@/lib/three-game/InputController';
import { RendererManager } from '@/lib/three-game/RendererManager';
import { GameLogic } from '@/lib/three-game/GameLogic';
import { ThreeSetup } from '@/lib/three-game/ThreeSetup';
import { CONTROL_CONFIG, CURSOR_STATE, CHUNK_SIZE } from '@/lib/three-game/utils';
import type { GameRefs, DebugInfoState, ErrorInfo } from '@/lib/three-game/types';
import ErrorBoundaryDisplay from './ErrorBoundaryDisplay';
import { Player } from '@/lib/three-game/Player'; // Player needed for GameLogic init

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
      refs.gameLogic.update(newFpsValue);
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
  }, []);


  const initGame = useCallback(() => {
    console.log("Initializing game...");
    const refs = gameRefs.current;
    if (!mountRef.current) return;
    refs.canvasRef = mountRef.current;

    setErrorInfo(null);

    refs.worldSeed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    console.log("Generated World Seed:", refs.worldSeed);

    refs.threeSetup = new ThreeSetup();
    refs.threeSetup.initialize(refs.canvasRef, refs);

    if (!refs.scene || !refs.camera || !refs.renderer || !refs.textureLoader || !refs.blocks || !refs.lighting || !refs.raycaster) {
        console.error("ThreeSetup did not initialize all required gameRefs properties.");
        setErrorInfo({ title: "Initialization Error", message: "ThreeSetup failed to initialize essential Three.js components." });
        return;
    }
    
    refs.rendererManager = new RendererManager(refs.canvasRef, refs);
     // Initial clear color set in ThreeSetup or RendererManager. World might not be fully ready here.
    if (refs.renderer && refs.world) { // World might be null initially if ThreeSetup doesn't create it
       refs.renderer.setClearColor(new THREE.Color(refs.world.skyColor));
    } else if (refs.renderer) {
       refs.renderer.setClearColor(new THREE.Color(0xf1f1f1)); // Default sky color
    }


    if (refs.worldSeed === null) {
        console.error("Initialization Error: World Seed is null before World creation.");
        setErrorInfo({ title: "Initialization Error", message: "World Seed missing." });
        return;
    }
    refs.world = new World(refs, refs.worldSeed);
     if (refs.renderer && refs.world) {
       refs.renderer.setClearColor(new THREE.Color(refs.world.skyColor));
    }

    refs.inputController = new InputController(refs); 
    
    refs.gameLogic = new GameLogic(refs, setDebugInfo, setIsCameraSubmerged);
    
    if (refs.inputController && refs.player) {
      refs.inputController.setPlayer(refs.player);
    } else {
        console.warn("BlockifyGame init: InputController or Player not available to link after GameLogic init.");
    }
    refs.inputController.setupEventListeners();


    console.log("Game initialized by BlockifyGame.");
    if (refs.gameLoopId === null) {
      console.log("Starting game loop from initGame");
      refs.gameLoopId = requestAnimationFrame(gameLoop);
    }
  }, [gameLoop, setDebugInfo, setIsCameraSubmerged]);


  useEffect(() => {
    initGame();

    const refs = gameRefs.current;

    const updateCrosshairColor = () => {
        if (refs.player?.lookingAt) {
            setCrosshairBgColor('rgba(255, 255, 255, 0.75)');
        } else {
            setCrosshairBgColor('rgba(0, 0, 0, 0.75)');
        }
    };

    const intervalId = setInterval(() => {
      if (refs.player) {
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
      gameRefs.current.rendererManager?.dispose();
      
      gameRefs.current.world?.activeChunks.forEach((chunk) => {
        if (chunk && typeof chunk.dispose === 'function') {
          chunk.dispose();
        }
      });

      gameRefs.current.scene?.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.geometry?.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach(material => {
                material.map?.dispose();
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
      if (gameRefs.current.lighting?.ambient) gameRefs.current.scene?.remove(gameRefs.current.lighting.ambient);
      if (gameRefs.current.lighting?.directional) gameRefs.current.scene?.remove(gameRefs.current.lighting.directional);

      Object.keys(gameRefs.current).forEach(key => {
        if (key !== 'controlConfig' && key !== 'cursor' && key !== 'canvasRef' && key !== 'worldSeed') {
            (gameRefs.current as any)[key] = null;
        }
      });
      
      console.log("Cleanup complete for BlockifyGame.");
    };
  }, [initGame]);


  useEffect(() => {
    const { renderer, scene, world } = gameRefs.current;
    if (!renderer || !scene || !world) return;

    if (isCameraSubmerged) {
        renderer.setClearColor(new THREE.Color(0x3A5F83)); // Dark blue for water
        if (!scene.fog || !(scene.fog instanceof THREE.Fog) || scene.fog.color.getHex() !== 0x3A5F83) {
            scene.fog = new THREE.Fog(0x3A5F83, 0.1, CHUNK_SIZE * 1.5);
        } else { // Fog exists and is already water fog, just ensure parameters
            scene.fog.near = 0.1;
            scene.fog.far = CHUNK_SIZE * 1.5;
        }
    } else {
        const skyColorToUse = world.skyColor;
        renderer.setClearColor(new THREE.Color(skyColorToUse));

        const fogNearDistance = world.renderDistanceInChunks * CHUNK_SIZE * 0.6;
        const fogFarDistance = world.renderDistanceInChunks * CHUNK_SIZE * 1.1;
        
        if (!scene.fog || !(scene.fog instanceof THREE.Fog) || scene.fog.color.getHex() !== skyColorToUse) {
            scene.fog = new THREE.Fog(skyColorToUse, fogNearDistance, fogFarDistance);
        } else { // Fog exists and is already sky fog, ensure parameters
            scene.fog.color.setHex(skyColorToUse); // Ensure color is up-to-date if it could change
            scene.fog.near = fogNearDistance;
            scene.fog.far = fogFarDistance;
        }
    }
  }, [isCameraSubmerged]);


  return (
    <div ref={mountRef} className="relative w-full h-screen overflow-hidden cursor-crosshair">
      {errorInfo && (
        <ErrorBoundaryDisplay
          title={errorInfo.title}
          message={errorInfo.message}
          onClose={() => {
            setErrorInfo(null);
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

    