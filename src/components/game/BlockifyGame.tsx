"use client";

import React, { useEffect, useRef, useCallback, useState } from "react";
import * as THREE from "three";
import { World } from "@/lib/three-game/World";
import { InputController } from "@/lib/three-game/InputController";
import { RendererManager } from "@/lib/three-game/RendererManager";
import { GameLogic } from "@/lib/three-game/GameLogic";
import { ThreeSetup } from "@/lib/three-game/ThreeSetup";
import {
  CONTROL_CONFIG,
  CURSOR_STATE,
  CHUNK_SIZE,
} from "@/lib/three-game/utils";
import type {
  GameRefs,
  DebugInfoState,
  ErrorInfo,
} from "@/lib/three-game/types";
import ErrorBoundaryDisplay from "./ErrorBoundaryDisplay";
import { Player } from "@/lib/three-game/Player"; // Player needed for GameLogic init
import { EventBus } from "@/lib/three-game/events/EventBus";

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
    sky: null,
    eventBus: EventBus.getInstance(),
  });

  const [debugInfo, setDebugInfo] = useState<DebugInfoState>({
    fps: 0,
    playerPosition: "Player: N/A",
    playerChunk: "Chunk: N/A",
    raycastTarget: "Ray: None",
    highlightStatus: "HL: Inactive",
    visibleChunks: 0,
    totalChunks: 0,
    isFlying: "Flying: No",
    isRunning: "Running: No",
    isBoosting: "Boosting: No",
    lookDirection: "Look: N/A", // <-- Añadido para mostrar dirección de mirada
  });
  const [crosshairBgColor, setCrosshairBgColor] = useState<string | undefined>(
    undefined
  );
  const lastFrameTimeRef = useRef(performance.now());
  const frameCountRef = useRef(0);
  const [isCameraSubmerged, setIsCameraSubmerged] = useState(false);
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null);

  const [systemStats, setSystemStats] = useState({
    memory: null as null | { usedMB: number; totalMB: number },
  });

  // --- FPS Sliding Window ---
  const fpsWindowRef = useRef<number[]>([]);
  const [fps, setFps] = useState(0);

  const gameLoop = useCallback(() => {
    const refs = gameRefs.current;
    if (errorInfo) {
      if (refs.gameLoopId !== null) {
        cancelAnimationFrame(refs.gameLoopId);
        refs.gameLoopId = null;
      }
      return;
    }
    if (!refs.gameLogic || !refs.camera) {
      if (refs.gameLoopId !== null) {
        refs.gameLoopId = requestAnimationFrame(gameLoop);
      }
      return;
    }

    const now = performance.now();
    const deltaTime = (now - lastFrameTimeRef.current) / 1000.0;
    frameCountRef.current++;

    // FPS sliding window
    if (deltaTime > 0) {
      const currentFps = 1 / deltaTime;
      const window = fpsWindowRef.current;
      window.push(currentFps);
      if (window.length > 60) window.shift();
      const avgFps = window.reduce((a, b) => a + b, 0) / window.length;
      setFps(Math.round(avgFps));
    }

    let newFpsValue: number | undefined = undefined; // No longer used, but kept for compatibility

    try {
      refs.gameLogic.update(deltaTime, undefined); // newFpsValue no es necesario
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
    lastFrameTimeRef.current = now;

    if (refs.gameLoopId !== null) {
      refs.gameLoopId = requestAnimationFrame(gameLoop);
    }
  }, [errorInfo]);

  const initGame = useCallback(() => {
    console.log("Initializing game...");
    const refs = gameRefs.current;
    if (!mountRef.current) return;
    refs.canvasRef = mountRef.current;

    setErrorInfo(null);

    refs.worldSeed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    console.log("Generated World Seed:", refs.worldSeed);

    refs.threeSetup = new ThreeSetup();
    refs.threeSetup.initialize(refs.canvasRef, refs); // threeSetup now populates refs.sky

    if (
      !refs.scene ||
      !refs.camera ||
      !refs.renderer ||
      !refs.textureLoader ||
      !refs.blocks ||
      !refs.lighting ||
      !refs.raycaster ||
      !refs.sky
    ) {
      console.error(
        "ThreeSetup did not initialize all required gameRefs properties, including AdvancedSky."
      );
      setErrorInfo({
        title: "Initialization Error",
        message:
          "ThreeSetup failed to initialize essential Three.js or AdvancedSky components.",
      });
      return;
    }

    refs.rendererManager = new RendererManager(refs.canvasRef, refs);
    if (refs.renderer && refs.sky && refs.sky.getSkyColorProvider()) {
      refs.renderer.setClearColor(refs.sky.getSkyColorProvider().getSkyColor());
    } else if (refs.renderer) {
      refs.renderer.setClearColor(new THREE.Color(0xf1f1f1)); // Default sky color
    }

    if (refs.worldSeed === null) {
      console.error(
        "Initialization Error: World Seed is null before World creation."
      );
      setErrorInfo({
        title: "Initialization Error",
        message: "World Seed missing.",
      });
      return;
    }
    refs.world = new World(refs, refs.worldSeed);
    if (refs.renderer && refs.sky && refs.sky.getSkyColorProvider()) {
      refs.renderer.setClearColor(refs.sky.getSkyColorProvider().getSkyColor());
    }

    refs.inputController = new InputController(refs);

    // Crear una función estable para setDebugInfo y setIsCameraSubmerged
    const stableSetDebugInfo = (
      updateFn: (prevState: DebugInfoState) => DebugInfoState
    ) => {
      setDebugInfo(updateFn);
    };

    const stableSetIsCameraSubmerged = (
      value: boolean | ((prev: boolean) => boolean)
    ) => {
      setIsCameraSubmerged(value);
    };

    refs.gameLogic = new GameLogic(
      refs,
      stableSetDebugInfo,
      stableSetIsCameraSubmerged
    );

    if (refs.inputController && refs.player) {
      refs.inputController.setPlayer(refs.player);
    } else {
      console.warn(
        "BlockifyGame init: InputController or Player not available to link after GameLogic init."
      );
    }
    refs.inputController.setupEventListeners();

    console.log("Game initialized by BlockifyGame.");
    if (refs.gameLoopId === null) {
      console.log("Starting game loop from initGame");
      lastFrameTimeRef.current = performance.now(); // Initialize lastFrameTimeRef before first gameLoop call
      refs.gameLoopId = requestAnimationFrame(gameLoop);
    }
  }, [gameLoop]); // Removemos setDebugInfo y setIsCameraSubmerged de las dependencias

  useEffect(() => {
    initGame();

    const refs = gameRefs.current;

    const updateCrosshairColor = () => {
      if (refs.player?.lookingAt) {
        setCrosshairBgColor("rgba(255, 255, 255, 0.75)");
      } else {
        setCrosshairBgColor("rgba(0, 0, 0, 0.75)");
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
      gameRefs.current.sky?.dispose(); // Dispose AdvancedSky

      gameRefs.current.world?.activeChunks.forEach((chunk) => {
        if (chunk && typeof chunk.dispose === "function") {
          chunk.dispose();
        }
      });

      gameRefs.current.scene?.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          // Dispose geometry
          object.geometry?.dispose();
          // Dispose material(s) and texture(s) safely
          const disposeMaterial = (material: THREE.Material) => {
            const anyMat = material as any;
            if (anyMat.map && typeof anyMat.map.dispose === "function")
              anyMat.map.dispose();
            if (
              anyMat.lightMap &&
              typeof anyMat.lightMap.dispose === "function"
            )
              anyMat.lightMap.dispose();
            if (anyMat.aoMap && typeof anyMat.aoMap.dispose === "function")
              anyMat.aoMap.dispose();
            if (
              anyMat.emissiveMap &&
              typeof anyMat.emissiveMap.dispose === "function"
            )
              anyMat.emissiveMap.dispose();
            if (anyMat.bumpMap && typeof anyMat.bumpMap.dispose === "function")
              anyMat.bumpMap.dispose();
            if (
              anyMat.normalMap &&
              typeof anyMat.normalMap.dispose === "function"
            )
              anyMat.normalMap.dispose();
            if (
              anyMat.displacementMap &&
              typeof anyMat.displacementMap.dispose === "function"
            )
              anyMat.displacementMap.dispose();
            if (
              anyMat.roughnessMap &&
              typeof anyMat.roughnessMap.dispose === "function"
            )
              anyMat.roughnessMap.dispose();
            if (
              anyMat.metalnessMap &&
              typeof anyMat.metalnessMap.dispose === "function"
            )
              anyMat.metalnessMap.dispose();
            if (
              anyMat.alphaMap &&
              typeof anyMat.alphaMap.dispose === "function"
            )
              anyMat.alphaMap.dispose();
            if (anyMat.envMap && typeof anyMat.envMap.dispose === "function")
              anyMat.envMap.dispose();
            material.dispose();
          };
          if (Array.isArray(object.material)) {
            object.material.forEach((mat) => {
              if (mat) disposeMaterial(mat);
            });
          } else if (object.material) {
            disposeMaterial(object.material);
          }
        }
      });
      if (gameRefs.current.lighting?.ambient)
        gameRefs.current.scene?.remove(gameRefs.current.lighting.ambient);
      // Directional light is managed by AdvancedSky (Sun), so it's removed when sky is disposed.
      // if (gameRefs.current.lighting?.directional) gameRefs.current.scene?.remove(gameRefs.current.lighting.directional);

      Object.keys(gameRefs.current).forEach((key) => {
        if (
          key !== "controlConfig" &&
          key !== "cursor" &&
          key !== "canvasRef" &&
          key !== "worldSeed"
        ) {
          (gameRefs.current as any)[key] = null;
        }
      });

      console.log("Cleanup complete for BlockifyGame.");
    };
  }, []); // Removemos initGame de las dependencias

  useEffect(() => {
    const { renderer, scene, world, sky } = gameRefs.current;
    if (!renderer || !scene || !world || !sky?.getSkyColorProvider()) return;

    const skyColorProvider = sky.getSkyColorProvider();

    if (isCameraSubmerged) {
      renderer.setClearColor(new THREE.Color(0x3a5f83)); // Dark blue for water
      if (
        !scene.fog ||
        !(scene.fog instanceof THREE.Fog) ||
        scene.fog.color.getHex() !== 0x3a5f83
      ) {
        scene.fog = new THREE.Fog(0x3a5f83, 0.1, CHUNK_SIZE * 1.5);
      } else {
        scene.fog.near = 0.1;
        scene.fog.far = CHUNK_SIZE * 1.5;
      }
    } else {
      const skyFogColor = skyColorProvider.getFogColor();
      renderer.setClearColor(skyColorProvider.getSkyColor());

      const fogNearDistance = world.renderDistanceInChunks * CHUNK_SIZE * 0.6;
      const fogFarDistance = world.renderDistanceInChunks * CHUNK_SIZE * 1.1;

      if (
        !scene.fog ||
        !(scene.fog instanceof THREE.Fog) ||
        scene.fog.color.getHex() !== skyFogColor.getHex()
      ) {
        scene.fog = new THREE.Fog(skyFogColor, fogNearDistance, fogFarDistance);
      } else {
        scene.fog.color.copy(skyFogColor);
        scene.fog.near = fogNearDistance;
        scene.fog.far = fogFarDistance;
      }
    }
  }, [isCameraSubmerged, gameRefs.current.world?.renderDistanceInChunks]); // Added world.renderDistanceInChunks

  useEffect(() => {
    // Actualiza el color del crosshair usando una variable CSS
    const root = document.documentElement;
    if (crosshairBgColor) {
      root.style.setProperty("--crosshair-color", crosshairBgColor);
    } else {
      root.style.setProperty("--crosshair-color", "rgba(0,0,0,0.75)");
    }
  }, [crosshairBgColor]);

  // --- System Stats Polling ---
  useEffect(() => {
    // RAM (JS heap) via performance.memory (solo Chrome)
    function pollMemory() {
      if ((window.performance as any).memory) {
        const mem = (window.performance as any).memory;
        setSystemStats((prev) => ({
          ...prev,
          memory: {
            usedMB: Math.round(mem.usedJSHeapSize / 1048576),
            totalMB: Math.round(mem.totalJSHeapSize / 1048576),
          },
        }));
      }
    }
    pollMemory();
    const interval = setInterval(pollMemory, 2000);
    return () => clearInterval(interval);
  }, []);

  // --- Animación de agua tipo Minecraft: actualiza uniform 'time' en materiales de agua ---
  useEffect(() => {
    let animId: number | null = null;
    function animateWater() {
      const refs = gameRefs.current;
      if (refs.world && refs.world.activeChunks) {
        const now = performance.now() * 0.001;
        refs.world.activeChunks.forEach((chunk) => {
          if (chunk && chunk.chunkRoot) {
            chunk.chunkRoot.traverse((obj) => {
              if (obj instanceof THREE.Mesh) {
                const mats = Array.isArray(obj.material)
                  ? obj.material
                  : [obj.material];
                for (const mat of mats) {
                  if (
                    mat &&
                    mat.userData &&
                    mat.userData._waterAnim &&
                    mat.userData._shader
                  ) {
                    mat.userData._shader.uniforms.time.value = now;
                  }
                }
              }
            });
          }
        });
      }
      animId = requestAnimationFrame(animateWater);
    }
    animateWater();
    return () => {
      if (animId !== null) cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="relative w-full h-screen overflow-hidden cursor-crosshair"
    >
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
            className={
              "w-full h-[2px] absolute top-1/2 left-0 transform -translate-y-1/2 rounded-sm crosshair-bar-horizontal"
            }
          ></div>
          <div
            className={
              "w-[2px] h-full absolute top-0 left-1/2 transform -translate-x-1/2 rounded-sm crosshair-bar-vertical"
            }
          ></div>
        </div>
      )}
      <div className="absolute top-2 right-2 text-foreground bg-background/50 p-1 rounded-md text-sm pointer-events-none z-10">
        <div>FPS: {fps}</div>
        <div>{debugInfo.playerPosition}</div>
        <div>{debugInfo.playerChunk}</div>
        <div>{debugInfo.raycastTarget}</div>
        <div>{debugInfo.highlightStatus}</div>
        <div>
          Chunks: {debugInfo.visibleChunks} / {debugInfo.totalChunks}
        </div>
        <div>{debugInfo.isFlying}</div>
        <div>{debugInfo.isRunning}</div>
        <div>{debugInfo.isBoosting}</div>
        <div>{debugInfo.lookDirection}</div>
        {/* Estadísticas del sistema */}
        <div>
          RAM:{" "}
          {systemStats.memory
            ? `${systemStats.memory.usedMB} / ${systemStats.memory.totalMB} MB`
            : "N/A"}
        </div>
      </div>
    </div>
  );
};

export default BlockifyGame;
