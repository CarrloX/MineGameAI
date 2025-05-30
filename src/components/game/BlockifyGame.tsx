"use client";

import React, { useEffect, useRef, useCallback } from 'react';
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

  const initGame = useCallback(() => {
    const refs = gameRefs.current;
    if (!mountRef.current) return;
    refs.canvasRef = mountRef.current;

    // Setup
    refs.scene = new THREE.Scene();
    refs.camera = new THREE.PerspectiveCamera(45, refs.canvasRef.clientWidth / refs.canvasRef.clientHeight, 0.1, 2e4);
    refs.renderer = new THREE.WebGLRenderer({ antialias: true }); // Added antialias

    refs.renderer.setPixelRatio(window.devicePixelRatio);
    refs.renderer.setSize(refs.canvasRef.clientWidth, refs.canvasRef.clientHeight);
    refs.renderer.shadowMap.enabled = true;
    refs.raycaster = new THREE.Raycaster();
    refs.textureLoader = new THREE.TextureLoader();
    
    // Blocks
    const blockData = getBlockDefinitions();
    refs.blocks = [
      new Block("siliconBlock", blockData.siliconBlock, refs.textureLoader, false),
      new Block("blueberryIMac", blockData.blueberryIMac, refs.textureLoader, true),
      new Block("bondiIMac", blockData.bondiIMac, refs.textureLoader, true),
      new Block("grapeIMac", blockData.grapeIMac, refs.textureLoader, true),
      new Block("limeIMac", blockData.limeIMac, refs.textureLoader, true),
      new Block("macintosh128k", blockData.macintosh128k, refs.textureLoader, true),
      new Block("strawberryIMac", blockData.strawberryIMac, refs.textureLoader, true),
      new Block("tangerineIMac", blockData.tangerineIMac, refs.textureLoader, true),
    ];
    
    refs.world = new World(refs);
    refs.player = new Player("Player", refs, 0, refs.world.layers, 0);

    // Camera
    if (refs.camera && refs.player) {
      refs.camera.position.set(refs.player.x, refs.player.y + (refs.player.height - 0.5), refs.player.z);
      refs.camera.rotation.order = "YXZ";
      refs.camera.rotation.x = refs.player.pitch;
      refs.camera.rotation.y = refs.player.yaw;
      // refs.camera.zoom = 0.5; // Zoom might not be desired for FPS style
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
          // Reset cursor position if lock is lost, to prevent large jumps
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

    refs.player.updatePosition();
    refs.player.highlightBlock();

    if (refs.player.dead) {
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

    // Touch events (simplified)
    const handleTouchStart = (e: TouchEvent) => {
      refs.cursor.holding = true;
      refs.cursor.holdTime = 0;
      // Potentially use first touch for movement joystick if implemented
    };
    const handleTouchMove = (e: TouchEvent) => {
      // refs.player?.lookAround(e.touches[0]); // Simplified, might need better handling
      refs.cursor.holdTime = 0; // Reset hold time if moving finger
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

    renderScene(); // Start render loop

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
      document.removeEventListener('pointerlockchange', () => { /* remove matching listener */ });


      // Dispose Three.js objects
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
        mountRef.current.removeChild(refs.renderer.domElement);
      }
    };
  }, [initGame, adjustWindow, renderScene]);

  return <div ref={mountRef} className="w-full h-screen overflow-hidden cursor-crosshair" />;
};

export default BlockifyGame;
