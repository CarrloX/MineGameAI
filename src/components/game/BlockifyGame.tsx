
"use client";

import React, { useEffect, useRef, useCallback, useState } from 'react';
import * as THREE from 'three';
import { World } from '@/lib/three-game/World';
import { Block } from '@/lib/three-game/Block';
import { Player } from '@/lib/three-game/Player';
import { InputHandler } from '@/lib/three-game/InputHandler';
import { RendererManager } from '@/lib/three-game/RendererManager';
import { GameManager } from '@/lib/three-game/GameManager';
import { getBlockDefinitions, CONTROL_CONFIG, CURSOR_STATE, CHUNK_SIZE } from '@/lib/three-game/utils';
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
    player: null,
    inputHandler: null,
    rendererManager: null,
    gameManager: null,
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

  const renderSceneLogicRef = useRef<(fps?: number) => void>(() => {});


  const initGame = useCallback(() => {
    console.log("Initializing game...");
    const refs = gameRefs.current;
    if (!mountRef.current) return;
    refs.canvasRef = mountRef.current;

    setErrorInfo(null);

    refs.rendererManager = new RendererManager(refs.canvasRef, refs);

    const blockData = getBlockDefinitions();
    if (!refs.textureLoader) {
        console.error("TextureLoader not initialized by RendererManager!");
        return;
    }
     refs.blocks = [
      new Block("grassBlock", blockData.grassBlock, refs.textureLoader, true),
      new Block("dirtBlock", blockData.dirtBlock, refs.textureLoader, false),
      new Block("stoneBlock", blockData.stoneBlock, refs.textureLoader, false),
      new Block("sandBlock", blockData.sandBlock, refs.textureLoader, false),
      new Block("woodLogBlock", blockData.woodLogBlock, refs.textureLoader, true),
      new Block("redstoneBlock", blockData.redstoneBlock, refs.textureLoader, false),
      new Block("orangeWoolBlock", blockData.orangeWoolBlock, refs.textureLoader, false),
      new Block("cobblestoneBlock", blockData.cobblestoneBlock, refs.textureLoader, false),
      new Block("waterBlock", blockData.waterBlock, refs.textureLoader, false),
    ];

    refs.world = new World(refs);
    if (refs.renderer && refs.world) {
       refs.renderer.setClearColor(new THREE.Color(refs.world.skyColor));
    }

    const initialPlayerX = 0.5;
    const initialPlayerZ = 0.5;
    
    refs.world.updateChunks(new THREE.Vector3(initialPlayerX, 0, initialPlayerZ));
    while(refs.world.getRemeshQueueSize() > 0) {
        refs.world.processRemeshQueue(refs.world.getRemeshQueueSize());
    }

    let spawnY = refs.world.getSpawnHeight(initialPlayerX, initialPlayerZ);
    let attempts = 0;
    const maxAttempts = 15;
    while(attempts < maxAttempts) {
        const blockAtFeet = refs.world.getBlock(Math.floor(initialPlayerX), Math.floor(spawnY), Math.floor(initialPlayerZ));
        const blockAtHead = refs.world.getBlock(Math.floor(initialPlayerX), Math.floor(spawnY + 1), Math.floor(initialPlayerZ));

        if (blockAtFeet === 'air' && blockAtHead === 'air') {
          break;
        }
        spawnY++;
        attempts++;
        if (spawnY >= refs.world.layers - 2) {
            console.warn("Spawn safety check reached near world top. Defaulting Y.");
            spawnY = Math.floor(refs.world.layers / 2);
            break;
        }
    }
     if (attempts >= maxAttempts) {
        console.warn("Could not find a perfectly safe respawn Y after " + maxAttempts + " attempts. Player collision logic should resolve.");
    }

    refs.player = new Player("Player", refs, initialPlayerX, spawnY, initialPlayerZ);
    refs.inputHandler = new InputHandler(refs.player, refs);
    refs.inputHandler.setupEventListeners();

    refs.gameManager = new GameManager(refs, setDebugInfo, setIsCameraSubmerged);


    if (refs.camera && refs.player) {
      refs.camera.position.set(refs.player.x, refs.player.y + (refs.player.height - 0.5), refs.player.z);
      refs.camera.rotation.order = "YXZ";
      refs.player.lookAround();
    }

    console.log("Game initialized.");
    if (refs.gameLoopId === null) {
      console.log("Starting game loop from initGame");
      refs.gameLoopId = requestAnimationFrame(gameLoop);
    }
  }, []);


  useEffect(() => {
    // Keep the ref to gameManager.update current
    if (gameRefs.current.gameManager) {
      renderSceneLogicRef.current = (fps?: number) => gameRefs.current.gameManager!.update(fps);
    }
  }, [gameRefs.current.gameManager]); // This will run when gameManager is initialized

  const gameLoop = () => {
    let newFpsValue: number | undefined = undefined;
    const now = performance.now();
    frameCountRef.current++;

    if (now >= lastFrameTimeRef.current + 1000) {
      newFpsValue = frameCountRef.current;
      frameCountRef.current = 0;
      lastFrameTimeRef.current = now;
    }
    
    try {
      renderSceneLogicRef.current(newFpsValue);
    } catch (error: any) {
      console.error("Error in game loop:", error);
      setErrorInfo({
        title: "¡Error en el Juego!",
        message: `Mensaje: ${error.message}\n\nPila de llamadas (Stack):\n${error.stack}`
      });
      if (gameRefs.current.gameLoopId !== null) {
        cancelAnimationFrame(gameRefs.current.gameLoopId);
        gameRefs.current.gameLoopId = null; 
      }
      return; 
    }
    if (gameRefs.current.gameLoopId !== null) { // Check if it wasn't cancelled by an error
        gameRefs.current.gameLoopId = requestAnimationFrame(gameLoop);
    }
  };

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
   

    if (refs.gameLoopId === null && !errorInfo) { 
        console.log("Starting game loop from useEffect setup");
        refs.gameLoopId = requestAnimationFrame(gameLoop);
    }


    return () => {
      console.log("Cleaning up BlockifyGame component...");
      clearInterval(intervalId);
      if (refs.gameLoopId !== null) {
        cancelAnimationFrame(refs.gameLoopId);
        refs.gameLoopId = null;
      }
      document.removeEventListener("contextmenu", handleContextMenu);
      
      refs.inputHandler?.removeEventListeners();
      refs.rendererManager?.dispose();


      refs.world?.activeChunks.forEach((chunk) => {
        if (chunk && typeof chunk.dispose === 'function') {
          chunk.dispose();
        }
      });
      
      refs.scene?.traverse(object => {
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
          } else {
            (object.material as THREE.Material)?.dispose();
          }
        }
      });
      console.log("Cleanup complete.");
    };
  }, [initGame]); // initGame is stable due to useCallback([])


  useEffect(() => {
    const { renderer, scene, world } = gameRefs.current;
    if (!renderer || !scene || !world) return;

    if (isCameraSubmerged) {
        renderer.setClearColor(new THREE.Color(0x3A5F83)); 
        if (!scene.fog || !(scene.fog instanceof THREE.Fog)) {
            scene.fog = new THREE.Fog(0x3A5F83, 0.1, CHUNK_SIZE * 1.5);
        } else {
            scene.fog.color.setHex(0x3A5F83);
            scene.fog.near = 0.1;
            scene.fog.far = CHUNK_SIZE * 1.5;
        }
    } else {
        renderer.setClearColor(new THREE.Color(world.skyColor));
        scene.fog = null; 
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
            // Consider if game re-initialization logic is needed here, or just a page refresh.
            // For now, it keeps the game stopped.
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
