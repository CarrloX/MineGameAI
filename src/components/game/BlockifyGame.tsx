
"use client";

import React, { useEffect, useRef, useCallback, useState } from 'react';
import * as THREE from 'three';
import { World } from '@/lib/three-game/World';
import { Block } from '@/lib/three-game/Block';
import { Player } from '@/lib/three-game/Player';
import { getBlockDefinitions, CONTROL_CONFIG, CURSOR_STATE } from '@/lib/three-game/utils';
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
    blocks: null,
    player: null,
    controlConfig: { ...CONTROL_CONFIG }, // Copy
    cursor: { ...CURSOR_STATE }, // Copy
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

    // Setup
    refs.scene = new THREE.Scene();
    refs.camera = new THREE.PerspectiveCamera(45, refs.canvasRef.clientWidth / refs.canvasRef.clientHeight, 0.1, 2e4);
    refs.renderer = new THREE.WebGLRenderer({ antialias: true });

    refs.renderer.setPixelRatio(window.devicePixelRatio);
    refs.renderer.setSize(refs.canvasRef.clientWidth, refs.canvasRef.clientHeight);
    refs.renderer.shadowMap.enabled = true;
    refs.raycaster = new THREE.Raycaster();
    refs.textureLoader = new THREE.TextureLoader();
    
    // Blocks
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
    ];
    
    refs.world = new World(refs);
    refs.player = new Player("Player", refs, 0, refs.world.layers, 0); // Spawn player at world height

    // Camera
    if (refs.camera && refs.player) {
      refs.camera.position.set(refs.player.x, refs.player.y + (refs.player.height - 0.5), refs.player.z);
      refs.camera.rotation.order = "YXZ";
      refs.camera.rotation.x = refs.player.pitch;
      refs.camera.rotation.y = refs.player.yaw;
      refs.camera.updateProjectionMatrix();
    }
    
    // Render
    refs.renderer.setClearColor(new THREE.Color(refs.world.skyColor));
    refs.canvasRef.appendChild(refs.renderer.domElement);
    
    // Pointer lock
    const canvasEl = refs.renderer.domElement;
    canvasEl.addEventListener("click", () => {
      if (!document.pointerLockElement) {
        canvasEl.requestPointerLock().catch(err => console.error("Pointer lock failed:", err));
      }
    });

    document.addEventListener('pointerlockchange', () => {
      refs.cursor.inWindow = document.pointerLockElement === canvasEl;
      if (!refs.cursor.inWindow) {
          if (refs.canvasRef) {
            refs.cursor.x = refs.canvasRef.clientWidth / 2;
            refs.cursor.y = refs.canvasRef.clientHeight / 2;
          }
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
      console.log("Render prerequisites not met", refs);
      if (refs.gameLoopId !== null) cancelAnimationFrame(refs.gameLoopId);
      return;
    }

    // FPS Calculation
    const now = performance.now();
    frameCountRef.current++;
    if (now >= lastFrameTimeRef.current + 1000) {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
      lastFrameTimeRef.current = now;
    }

    refs.player.updatePosition();
    refs.player.highlightBlock();

    if (refs.player.dead) {
      // Respawn player at a safe height, e.g., world.layers
      refs.player = new Player(refs.player['name'], refs, 0, refs.world.layers, 0, true);
    }

    if (refs.cursor.holding) {
      refs.cursor.holdTime++;
      if (refs.cursor.holdTime === refs.cursor.triggerHoldTime) {
        refs.player.build();
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
    const handleMouseDown = (e: MouseEvent) => refs.player?.build(e);

    const handleTouchStart = (e: TouchEvent) => {
      refs.cursor.holding = true;
      refs.cursor.holdTime = 0;
    };
    const handleTouchMove = (e: TouchEvent) => {
      refs.cursor.holdTime = 0; 
    };
    const handleTouchEnd = (e: TouchEvent) => {
      if (refs.cursor.holdTime < refs.cursor.triggerHoldTime) {
        refs.player?.build();
      }
      refs.cursor.holding = false;
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("touchstart", handleTouchStart);
    window.addEventListener("touchmove", handleTouchMove);
    window.addEventListener("touchend", handleTouchEnd);

    renderScene(); 

    return () => {
      if (refs.gameLoopId !== null) cancelAnimationFrame(refs.gameLoopId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      // Explicitly remove pointerlockchange listener attached to document
      const canvasEl = refs.renderer?.domElement;
      const pointerLockListener = () => {
        refs.cursor.inWindow = document.pointerLockElement === canvasEl;
         if (!refs.cursor.inWindow) {
            if (refs.canvasRef) {
              refs.cursor.x = refs.canvasRef.clientWidth / 2;
              refs.cursor.y = refs.canvasRef.clientHeight / 2;
            }
        }
      };
      document.removeEventListener('pointerlockchange', pointerLockListener, false);


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
        // Check if renderer.domElement is a child before removing
        if (mountRef.current.contains(refs.renderer.domElement)) {
            mountRef.current.removeChild(refs.renderer.domElement);
        }
      }
    };
  }, [initGame, adjustWindow, renderScene]);

  return (
    <div ref={mountRef} className="relative w-full h-screen overflow-hidden cursor-crosshair">
      {/* El lienzo de Three.js se adjuntará aquí por initGame */}
      
      {/* Cruceta */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none w-5 h-5 z-10">
        {/* Línea horizontal */}
        <div className="w-full h-[2px] bg-foreground/75 absolute top-1/2 left-0 transform -translate-y-1/2 rounded-sm"></div>
        {/* Línea vertical */}
        <div className="w-[2px] h-full bg-foreground/75 absolute top-0 left-1/2 transform -translate-x-1/2 rounded-sm"></div>
      </div>

      {/* Indicador de FPS */}
      <div className="absolute top-2 right-2 text-foreground bg-background/50 p-1 rounded-md text-sm pointer-events-none z-10">
        FPS: {fps}
      </div>
    </div>
  );
};

export default BlockifyGame;
