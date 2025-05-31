
"use client";

import React, { useEffect, useRef, useCallback, useState } from 'react';
import * as THREE from 'three';
import { World } from '@/lib/three-game/World';
import { Block } from '@/lib/three-game/Block';
import { Player } from '@/lib/three-game/Player';
import { getBlockDefinitions, CONTROL_CONFIG, CURSOR_STATE, CHUNK_SIZE } from '@/lib/three-game/utils';
import type { GameRefs } from '@/lib/three-game/types';

const BlockifyGame: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const gameRefs = useRef<GameRefs>({
    scene: null,
    camera: null,
    renderer: null,
    raycaster: null,
    textureLoader: null,
    world: null,
    blocks: null, // Will hold block prototypes
    player: null,
    controlConfig: { ...CONTROL_CONFIG }, 
    cursor: { ...CURSOR_STATE }, 
    gameLoopId: null,
    canvasRef: null,
  });

  const [fps, setFps] = useState(0);
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
    refs.blocks = [ // These are block PROTOTYPES
      new Block("grassBlock", blockData.grassBlock, refs.textureLoader, true),
      new Block("dirtBlock", {side: blockData.dirtBlock}, refs.textureLoader, false),
      new Block("stoneBlock", {side: blockData.stoneBlock}, refs.textureLoader, false),
      new Block("sandBlock", {side: blockData.sandBlock}, refs.textureLoader, false),
      new Block("woodLogBlock", blockData.woodLogBlock, refs.textureLoader, true),
      new Block("redstoneBlock", {side: blockData.redstoneBlock}, refs.textureLoader, false),
      new Block("orangeWoolBlock", {side: blockData.orangeWoolBlock}, refs.textureLoader, false),
      new Block("cobblestoneBlock", {side: blockData.cobblestoneBlock}, refs.textureLoader, false),
    ];
    
    refs.world = new World(refs);
    refs.renderer.setClearColor(new THREE.Color(refs.world.skyColor));
    refs.canvasRef.appendChild(refs.renderer.domElement);

    // Initial chunk processing
    refs.world.updateChunks(new THREE.Vector3(0,0,0)); // Load initial chunks around origin
    while(refs.world.getRemeshQueueSize() > 0) {
        refs.world.processRemeshQueue(refs.world.getRemeshQueueSize()); // Process all pending meshes
    }

    const spawnX = 0;
    const spawnZ = 0;
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
    if (now >= lastFrameTimeRef.current + 1000) {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
      lastFrameTimeRef.current = now;
    }

    refs.player.updatePosition();
    refs.player.highlightBlock();
    refs.world.updateChunks(refs.player.mesh.position);
    refs.world.processRemeshQueue(1); // Process one chunk mesh update per frame

    if (refs.player.dead) {
      const respawnX = 0; // Or some other logic
      const respawnZ = 0;
      const respawnY = refs.world.getSpawnHeight(respawnX, respawnZ);
      // Force remesh around spawn before creating player
      refs.world.updateChunks(new THREE.Vector3(respawnX, respawnY, respawnZ));
      while(refs.world.getRemeshQueueSize() > 0) {
        refs.world.processRemeshQueue(refs.world.getRemeshQueueSize());
      }
      refs.player = new Player(refs.player['name'], refs, respawnX, respawnY, respawnZ, true);
    }

    if (refs.cursor.holding) {
      refs.cursor.holdTime++;
      if (refs.cursor.holdTime === refs.cursor.triggerHoldTime) {
        refs.player.interactWithBlock(false); // false for place
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
      if (e.button === 0) refs.player?.interactWithBlock(true); // true for destroy
      if (e.button === 2) refs.player?.interactWithBlock(false); // false for place
    };

    const handleTouchStart = (e: TouchEvent) => {
      refs.cursor.holding = true;
      refs.cursor.holdTime = 0;
      // For touch look, you might want to record initial touch position here
    };
    const handleTouchMove = (e: TouchEvent) => {
      refs.cursor.holdTime = 0; 
      // For touch look, calculate delta from initial touch and call player.lookAround
    };
    const handleTouchEnd = (e: TouchEvent) => {
      if (refs.cursor.holdTime < refs.cursor.triggerHoldTime && refs.cursor.holdTime > 0) { // Short tap
        refs.player?.interactWithBlock(true); // Destroy
      } else if (refs.cursor.holdTime >= refs.cursor.triggerHoldTime) {
        // Placing is handled by the check in renderScene based on holdTime reaching triggerHoldTime
        // but if it was released exactly at triggerHoldTime, interactWithBlock might be called twice.
        // The logic in renderScene already calls interactWithBlock for placing.
      }
      refs.cursor.holding = false;
    };

    window.addEventListener("resize", handleResize);
    document.addEventListener("contextmenu", handleContextMenu); // Attached to document
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("mousemove", handleMouseMove);
    refs.canvasRef?.addEventListener("mousedown", handleMouseDown); // Attached to canvas
    refs.canvasRef?.addEventListener("touchstart", handleTouchStart, { passive: false });
    refs.canvasRef?.addEventListener("touchmove", handleTouchMove, { passive: false });
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


      refs.world?.chunks.forEach(chunk => chunk.dispose());
      refs.renderer?.dispose();
      refs.scene?.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.geometry?.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach(material => material.dispose());
          } else {
            object.material?.dispose();
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
        FPS: {fps}
      </div>
    </div>
  );
};

export default BlockifyGame;
