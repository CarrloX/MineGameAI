
"use client";

import React, { useEffect, useRef, useCallback, useState } from 'react';
import * as THREE from 'three';
import { World } from '@/lib/three-game/World';
import { Block } from '@/lib/three-game/Block';
import { Player } from '@/lib/three-game/Player';
import { getBlockDefinitions, CONTROL_CONFIG, CURSOR_STATE, CHUNK_SIZE } from '@/lib/three-game/utils';
import type { GameRefs } from '@/lib/three-game/types';

interface DebugInfoState {
  fps: number;
  playerPosition: string;
  playerChunk: string;
  raycastTarget: string;
  highlightStatus: string;
  visibleChunks: number;
  totalChunks: number;
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
  });
  const lastFrameTimeRef = useRef(performance.now());
  const frameCountRef = useRef(0);

  const initGame = useCallback(() => {
    const refs = gameRefs.current;
    if (!mountRef.current) return;
    refs.canvasRef = mountRef.current;

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
      new Block("dirtBlock", {side: blockData.dirtBlock }, refs.textureLoader, false),
      new Block("stoneBlock", {side: blockData.stoneBlock }, refs.textureLoader, false),
      new Block("sandBlock", {side: blockData.sandBlock }, refs.textureLoader, false),
      new Block("woodLogBlock", blockData.woodLogBlock, refs.textureLoader, true),
      new Block("redstoneBlock", {side: blockData.redstoneBlock }, refs.textureLoader, false),
      new Block("orangeWoolBlock", {side: blockData.orangeWoolBlock }, refs.textureLoader, false),
      new Block("cobblestoneBlock", {side: blockData.cobblestoneBlock }, refs.textureLoader, false),
    ];
    
    refs.world = new World(refs);
    refs.renderer.setClearColor(new THREE.Color(refs.world.skyColor)); // Updated to use world's skyColor
    refs.canvasRef.appendChild(refs.renderer.domElement);

    refs.world.updateChunks(new THREE.Vector3(0,0,0)); 
    // Process all pending remeshes for initial load
    while(refs.world.getRemeshQueueSize() > 0) {
        refs.world.processRemeshQueue(refs.world.getRemeshQueueSize()); 
    }

    const spawnX = 0.5; // Center of block 0
    const spawnZ = 0.5; // Center of block 0
    const spawnY = refs.world.getSpawnHeight(spawnX, spawnZ);
    refs.player = new Player("Player", refs, spawnX, spawnY, spawnZ);

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

  }, []);

  const adjustWindow = useCallback(() => {
    const refs = gameRefs.current;
    if (refs.camera && refs.renderer && refs.canvasRef) {
      refs.camera.aspect = refs.canvasRef.clientWidth / refs.canvasRef.clientHeight;
      refs.camera.updateProjectionMatrix();
      refs.renderer.setSize(refs.canvasRef.clientWidth, refs.canvasRef.clientHeight);
    }
  }, []);

  const renderScene = useCallback(() => {
    const refs = gameRefs.current;
    if (!refs.player || !refs.renderer || !refs.scene || !refs.camera || !refs.world) {
      if (refs.gameLoopId !== null) cancelAnimationFrame(refs.gameLoopId);
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
    if (player.lookingAt) {
      const { object, distance, blockWorldCoords } = player.lookingAt;
      const objName = object.name.length > 20 ? object.name.substring(0, 20) + "..." : object.name;
      rayTargetStr = `Ray: ${objName} D:${distance.toFixed(1)} B:[${blockWorldCoords.x.toFixed(0)},${blockWorldCoords.y.toFixed(0)},${blockWorldCoords.z.toFixed(0)}]`;
    }
    const highlightStr = `HL: ${refs.player.blockFaceHL.dir || 'Inactive'}`;
    
    let visibleChunksCount = 0;
    refs.world.activeChunks.forEach(chunk => { // Iterate over activeChunks
      if(chunk.chunkRoot.visible) visibleChunksCount++;
    });

    setDebugInfo(prev => ({
      fps: newFpsValue !== undefined ? newFpsValue : prev.fps,
      playerPosition: playerPosStr,
      playerChunk: playerChunkStr,
      raycastTarget: rayTargetStr,
      highlightStatus: highlightStr,
      visibleChunks: visibleChunksCount,
      totalChunks: refs.world!.activeChunks.size, // Count activeChunks
    }));


    if (refs.player.dead) {
      const respawnX = 0.5; 
      const respawnZ = 0.5;
      refs.world.updateChunks(new THREE.Vector3(respawnX, refs.player.y, respawnZ)); 
      while(refs.world.getRemeshQueueSize() > 0) {
        refs.world.processRemeshQueue(refs.world.getRemeshQueueSize());
      }
      const respawnY = refs.world.getSpawnHeight(respawnX, respawnZ);
      refs.player = new Player(refs.player['name'], refs, respawnX, respawnY, respawnZ, true);
    }

    if (refs.cursor.holding) {
      refs.cursor.holdTime++;
      if (refs.cursor.holdTime === refs.cursor.triggerHoldTime) {
        refs.player.interactWithBlock(false); // Place block on long press
      }
    }
    
    refs.renderer.render(refs.scene, refs.camera);
    refs.gameLoopId = requestAnimationFrame(renderScene);
  }, []); 


  useEffect(() => {
    initGame();
    const refs = gameRefs.current;

    const handleResize = () => adjustWindow();
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    const handleKeyDown = (e: KeyboardEvent) => refs.player?.handleKeyDown(e);
    const handleKeyUp = (e: KeyboardEvent) => refs.player?.handleKeyUp(e);
    const handleMouseMove = (e: MouseEvent) => refs.player?.lookAround(e);
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) refs.player?.interactWithBlock(true); // Left click: Destroy
      if (e.button === 2) refs.player?.interactWithBlock(false); // Right click: Place
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) { // Single touch
        refs.cursor.holding = true;
        refs.cursor.holdTime = 0;
      }
      // Could add logic for multi-touch (e.g., movement) here if needed
    };
    const handleTouchMove = (e: TouchEvent) => {
      // If movement is primarily for looking around on touch, handle here
      // For simplicity, current setup relies on pointer lock for look, which isn't ideal for touch
      // For block interaction, if touch moves significantly, cancel hold
      refs.cursor.holdTime = 0; 
    };
    const handleTouchEnd = (e: TouchEvent) => {
      if (refs.cursor.holding) { // Was holding
        if (refs.cursor.holdTime < refs.cursor.triggerHoldTime && refs.cursor.holdTime > 0) { 
          refs.player?.interactWithBlock(true); // Short tap: Destroy
        }
        // Long press is handled by renderScene's holdTime check
        refs.cursor.holding = false;
      }
    };

    window.addEventListener("resize", handleResize);
    document.addEventListener("contextmenu", handleContextMenu); 
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("mousemove", handleMouseMove);
    refs.canvasRef?.addEventListener("mousedown", handleMouseDown); 
    refs.canvasRef?.addEventListener("touchstart", handleTouchStart, { passive: true }); // Passive true for scroll performance if not preventing default
    refs.canvasRef?.addEventListener("touchmove", handleTouchMove, { passive: true });
    refs.canvasRef?.addEventListener("touchend", handleTouchEnd);


    renderScene(); 

    return () => {
      if (refs.gameLoopId !== null) cancelAnimationFrame(refs.gameLoopId);
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
        refs.cursor.inWindow = document.pointerLockElement === canvasEl;
         if (!refs.cursor.inWindow && refs.canvasRef) {
              refs.cursor.x = refs.canvasRef.clientWidth / 2;
              refs.cursor.y = refs.canvasRef.clientHeight / 2;
        }
      };
      document.removeEventListener('pointerlockchange', pointerLockListener, false);


      refs.world?.activeChunks.forEach((chunk) => { // Iterate over activeChunks
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
      if (mountRef.current && refs.renderer) {
        if (mountRef.current.contains(refs.renderer.domElement)) {
            mountRef.current.removeChild(refs.renderer.domElement);
        }
      }
    };
  }, [initGame, adjustWindow, renderScene]);

  return (
    <div ref={mountRef} className="relative w-full h-screen overflow-hidden cursor-crosshair">
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none w-5 h-5 z-10">
        <div className="w-full h-[2px] bg-foreground/75 absolute top-1/2 left-0 transform -translate-y-1/2 rounded-sm"></div>
        <div className="w-[2px] h-full bg-foreground/75 absolute top-0 left-1/2 transform -translate-x-1/2 rounded-sm"></div>
      </div>
      <div className="absolute top-2 right-2 text-foreground bg-background/50 p-1 rounded-md text-sm pointer-events-none z-10">
        <div>FPS: {debugInfo.fps}</div>
        <div>{debugInfo.playerPosition}</div>
        <div>{debugInfo.playerChunk}</div>
        <div>{debugInfo.raycastTarget}</div>
        <div>{debugInfo.highlightStatus}</div>
        <div>Chunks: {debugInfo.visibleChunks} / {debugInfo.totalChunks}</div>
      </div>
    </div>
  );
};

export default BlockifyGame;
