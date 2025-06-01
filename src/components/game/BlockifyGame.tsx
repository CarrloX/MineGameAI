
"use client";

import React, { useEffect, useRef, useCallback, useState } from 'react';
import * as THREE from 'three';
import { World } from '@/lib/three-game/World';
import { Block } from '@/lib/three-game/Block';
import { Player } from '@/lib/three-game/Player';
import { getBlockDefinitions, CONTROL_CONFIG, CURSOR_STATE, CHUNK_SIZE } from '@/lib/three-game/utils';
import type { GameRefs } from '@/lib/three-game/types';
import ErrorBoundaryDisplay from './ErrorBoundaryDisplay';


interface DebugInfoState {
  fps: number;
  playerPosition: string;
  playerChunk: string;
  raycastTarget: string;
  highlightStatus: string;
  visibleChunks: number;
  totalChunks: number;
  isFlying: string;
  isRunning: string;
  isBoosting: string;
}

interface ErrorInfo {
  title: string;
  message: string;
}

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

  // Ref for the renderScene function to avoid re-creating it in game loop
  const renderSceneRef = useRef<() => void>(() => {});


  const initGame = useCallback(() => {
    console.log("Initializing game...");
    const refs = gameRefs.current;
    if (!mountRef.current) return;
    refs.canvasRef = mountRef.current;

    // Clear previous error if any
    setErrorInfo(null);

    refs.scene = new THREE.Scene();
    refs.camera = new THREE.PerspectiveCamera(75, refs.canvasRef.clientWidth / refs.canvasRef.clientHeight, 0.1, 1000);
    refs.renderer = new THREE.WebGLRenderer({ antialias: true });
    refs.renderer.setPixelRatio(window.devicePixelRatio);
    refs.renderer.setSize(refs.canvasRef.clientWidth, refs.canvasRef.clientHeight);
    refs.renderer.shadowMap.enabled = true;
    refs.raycaster = new THREE.Raycaster();
    refs.textureLoader = new THREE.TextureLoader();

    const blockData = getBlockDefinitions();
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
    refs.canvasRef.appendChild(refs.renderer.domElement);

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

    if (refs.camera && refs.player) {
      refs.camera.position.set(refs.player.x, refs.player.y + (refs.player.height - 0.5), refs.player.z);
      refs.camera.rotation.order = "YXZ";
      refs.camera.rotation.x = refs.player.pitch;
      refs.camera.rotation.y = refs.player.yaw;
      refs.camera.updateProjectionMatrix();
    }

    const canvasEl = refs.renderer.domElement;
    canvasEl.addEventListener("click", () => {
      if (!document.pointerLockElement) {
        canvasEl.requestPointerLock().catch(err => console.error("Pointer lock failed:", err));
      }
    });

    document.addEventListener('pointerlockchange', () => {
      refs.cursor.inWindow = document.pointerLockElement === canvasEl;
      if (!refs.cursor.inWindow && refs.canvasRef) {
            refs.cursor.x = refs.canvasRef.clientWidth / 2;
            refs.cursor.y = refs.canvasRef.clientHeight / 2;
      }
    }, false);

    console.log("Game initialized.");
    // Ensure game loop is started after init
    if (refs.gameLoopId === null) {
      console.log("Starting game loop from initGame");
      refs.gameLoopId = requestAnimationFrame(gameLoop);
    }

  }, []);

  const adjustWindow = useCallback(() => {
    const refs = gameRefs.current;
    if (refs.camera && refs.renderer && refs.canvasRef) {
      refs.camera.aspect = refs.canvasRef.clientWidth / refs.canvasRef.clientHeight;
      refs.camera.updateProjectionMatrix();
      refs.renderer.setSize(refs.canvasRef.clientWidth, refs.canvasRef.clientHeight);
    }
  }, []);

  // This function is the core logic and will be wrapped in the ref
  const renderSceneLogic = () => {
    const refs = gameRefs.current;
    if (!refs.player || !refs.renderer || !refs.scene || !refs.camera || !refs.world) {
      if (refs.gameLoopId !== null) cancelAnimationFrame(refs.gameLoopId);
      refs.gameLoopId = null; 
      return;
    }

    const now = performance.now();
    frameCountRef.current++;
    let newFpsValue: number | undefined = undefined;

    if (now >= lastFrameTimeRef.current + 1000) {
      newFpsValue = frameCountRef.current;
      frameCountRef.current = 0;
      lastFrameTimeRef.current = now;
    }

    refs.player.updatePosition();
    refs.player.highlightBlock();
    refs.world.updateChunks(refs.player.mesh.position);
    if (refs.camera) {
        refs.world.updateChunkVisibility(refs.camera);
    }
    refs.world.processRemeshQueue(1);

    const player = refs.player;
    const playerPosStr = `Player: X:${player.x.toFixed(2)}, Y:${player.y.toFixed(2)}, Z:${player.z.toFixed(2)}`;
    const playerChunkX = Math.floor(player.x / CHUNK_SIZE);
    const playerChunkZ = Math.floor(player.z / CHUNK_SIZE);
    const playerChunkStr = `Chunk: CX:${playerChunkX}, CZ:${playerChunkZ}`;

    let rayTargetStr = 'Ray: None';
    let highlightFaceDir = 'Inactive';
    if (player.lookingAt) {
      const { object, distance, blockWorldCoords, worldFaceNormal } = player.lookingAt;
      const objName = object.name.length > 20 ? object.name.substring(0, 20) + "..." : object.name;
      rayTargetStr = `Ray: ${objName} D:${distance.toFixed(1)} B:[${blockWorldCoords.x.toFixed(0)},${blockWorldCoords.y.toFixed(0)},${blockWorldCoords.z.toFixed(0)}]`;
      
      if (worldFaceNormal) {
        const normal = worldFaceNormal;
        if (Math.abs(normal.x) > 0.5) highlightFaceDir = normal.x > 0 ? 'East (+X)' : 'West (-X)';
        else if (Math.abs(normal.y) > 0.5) highlightFaceDir = normal.y > 0 ? 'Top (+Y)' : 'Bottom (-Y)';
        else if (Math.abs(normal.z) > 0.5) highlightFaceDir = normal.z > 0 ? 'South (+Z)' : 'North (-Z)';
        else highlightFaceDir = 'Unknown Face';
      }
    }
    const highlightStr = `HL: ${highlightFaceDir}`;

    let visibleChunksCount = 0;
    refs.world.activeChunks.forEach(chunk => {
      if(chunk.chunkRoot.visible) visibleChunksCount++;
    });

    // Underwater check
    if (refs.player && refs.world && refs.camera) {
      const camWorldX = Math.floor(refs.camera.position.x);
      const camWorldY = Math.floor(refs.camera.position.y);
      const camWorldZ = Math.floor(refs.camera.position.z);
      const blockAtCamera = refs.world.getBlock(camWorldX, camWorldY, camWorldZ);
      const newIsSubmerged = blockAtCamera === 'waterBlock';
      
      // setIsCameraSubmerged should be stable if called with current value
      if (newIsSubmerged !== isCameraSubmerged) {
        setIsCameraSubmerged(newIsSubmerged);
      }
    }

    setDebugInfo(prev => ({
      fps: newFpsValue !== undefined ? newFpsValue : prev.fps,
      playerPosition: playerPosStr,
      playerChunk: playerChunkStr,
      raycastTarget: rayTargetStr,
      highlightStatus: highlightStr,
      visibleChunks: visibleChunksCount,
      totalChunks: refs.world!.activeChunks.size,
      isFlying: `Flying: ${player.flying ? 'Yes' : 'No'}`,
      isRunning: `Running: ${player.isRunning ? 'Yes' : 'No'}`,
      isBoosting: `Boosting: ${player.isBoosting ? 'Yes' : 'No'}`,
    }));


    if (refs.player.dead) {
      const respawnX = 0.5;
      const respawnZ = 0.5;
      
      refs.world.updateChunks(new THREE.Vector3(respawnX, refs.player.y, respawnZ));
      while(refs.world.getRemeshQueueSize() > 0) {
        refs.world.processRemeshQueue(refs.world.getRemeshQueueSize());
      }

      let safeRespawnY = refs.world.getSpawnHeight(respawnX, respawnZ);
      let attempts = 0;
      const maxAttempts = 15; 

      while(attempts < maxAttempts) {
        const blockAtFeet = refs.world.getBlock(Math.floor(respawnX), Math.floor(safeRespawnY), Math.floor(respawnZ));
        const blockAtHead = refs.world.getBlock(Math.floor(respawnX), Math.floor(safeRespawnY + 1), Math.floor(respawnZ));

        if (blockAtFeet === 'air' && blockAtHead === 'air') {
          break;
        }
        safeRespawnY++;
        attempts++;
        if (safeRespawnY >= refs.world.layers - 2) {
            console.warn("Respawn safety check reached near world top. Defaulting Y.");
            safeRespawnY = Math.floor(refs.world.layers / 2);
            break;
        }
      }
       if (attempts >= maxAttempts) {
          console.warn("Could not find a perfectly safe respawn Y after " + maxAttempts + " attempts. Player collision logic should resolve.");
      }
      // Preserve camera orientation if desired, or reset it
      const currentPitch = refs.camera.rotation.x;
      const currentYaw = refs.camera.rotation.y;
      
      refs.player = new Player(refs.player['name'], refs, respawnX, safeRespawnY, respawnZ, true); // Pass true to preserve camera
      
      // Re-apply preserved camera orientation
      if (refs.camera && refs.player) {
        refs.player.pitch = currentPitch;
        refs.player.yaw = currentYaw;
        refs.camera.rotation.x = currentPitch;
        refs.camera.rotation.y = currentYaw;
      }
    }

    if (refs.cursor.holding) {
      refs.cursor.holdTime++;
      if (refs.cursor.holdTime === refs.cursor.triggerHoldTime) {
        refs.player.interactWithBlock(false);
      }
    }

    refs.renderer.render(refs.scene, refs.camera);
  };

  // Update the ref whenever renderSceneLogic changes (though it's stable now)
  useEffect(() => {
    renderSceneRef.current = renderSceneLogic;
  }, [renderSceneLogic]); // Dependency array can be refined if renderSceneLogic relies on more state/props

  // Game loop function that calls the ref
  const gameLoop = () => {
    try {
      renderSceneRef.current();
    } catch (error: any) {
      console.error("Error in game loop:", error);
      setErrorInfo({
        title: "¡Error en el Juego!",
        message: `Mensaje: ${error.message}\n\nPila de llamadas (Stack):\n${error.stack}`
      });
      if (gameRefs.current.gameLoopId !== null) {
        cancelAnimationFrame(gameRefs.current.gameLoopId);
        gameRefs.current.gameLoopId = null; // Stop the loop
      }
      return; // Exit loop function on error
    }
    if (gameRefs.current.gameLoopId !== null) { // Check if loop was stopped by error
        gameRefs.current.gameLoopId = requestAnimationFrame(gameLoop);
    }
  };

  useEffect(() => {
    initGame(); // Initialize game on mount
    
    const refs = gameRefs.current; // For cleanup

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


    const handleResize = () => adjustWindow();
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    const handleKeyDown = (e: KeyboardEvent) => refs.player?.handleKeyDown(e);
    const handleKeyUp = (e: KeyboardEvent) => refs.player?.handleKeyUp(e);
    const handleMouseMove = (e: MouseEvent) => refs.player?.lookAround(e);
    const handleMouseDown = (e: MouseEvent) => {
      if (refs.cursor.inWindow && refs.player) { 
        if (e.button === 0) refs.player.interactWithBlock(true);
        if (e.button === 2) refs.player.interactWithBlock(false);
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        refs.cursor.holding = true;
        refs.cursor.holdTime = 0;
      }
    };
    const handleTouchMove = (e: TouchEvent) => {
      refs.cursor.holdTime = 0; 
    };
    const handleTouchEnd = (e: TouchEvent) => {
      if (refs.cursor.holding && refs.player) { 
        if (refs.cursor.holdTime < refs.cursor.triggerHoldTime && refs.cursor.holdTime > 0) { 
          refs.player.interactWithBlock(true); 
        }
        refs.cursor.holding = false;
      }
    };

    window.addEventListener("resize", handleResize);
    document.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("mousemove", handleMouseMove);
    refs.canvasRef?.addEventListener("mousedown", handleMouseDown);
    refs.canvasRef?.addEventListener("touchstart", handleTouchStart, { passive: true });
    refs.canvasRef?.addEventListener("touchmove", handleTouchMove, { passive: true });
    refs.canvasRef?.addEventListener("touchend", handleTouchEnd);


    // Start game loop
    if (refs.gameLoopId === null && !errorInfo) { // Only start if not already running and no error
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
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("mousemove", handleMouseMove);
      refs.canvasRef?.removeEventListener("mousedown", handleMouseDown);
      refs.canvasRef?.removeEventListener("touchstart", handleTouchStart);
      refs.canvasRef?.removeEventListener("touchmove", handleTouchMove);
      refs.canvasRef?.removeEventListener("touchend", handleTouchEnd);

      const canvasEl = refs.renderer?.domElement;
      const pointerLockListener = () => {
        if (refs.cursor && refs.canvasRef) { // Check if refs.cursor and refs.canvasRef exist
            refs.cursor.inWindow = document.pointerLockElement === canvasEl;
            if (!refs.cursor.inWindow) {
                refs.cursor.x = refs.canvasRef.clientWidth / 2;
                refs.cursor.y = refs.canvasRef.clientHeight / 2;
            }
        }
      };
      document.removeEventListener('pointerlockchange', pointerLockListener, false);


      refs.world?.activeChunks.forEach((chunk) => {
        if (chunk && typeof chunk.dispose === 'function') {
          chunk.dispose();
        }
      });
      refs.renderer?.dispose();
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
      if (mountRef.current && refs.renderer?.domElement) {
        if (mountRef.current.contains(refs.renderer.domElement)) {
            mountRef.current.removeChild(refs.renderer.domElement);
        }
      }
      console.log("Cleanup complete.");
    };
  }, [initGame, adjustWindow]); // Removed renderSceneLogic from here


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
            // Optionally, you could try to re-initialize or prompt the user to refresh
            // For now, closing just hides the dialog. The game loop remains stopped.
            // initGame(); // Uncomment to try re-initializing, but might lead to loop if error is persistent
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
