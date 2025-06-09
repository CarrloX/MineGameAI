import * as THREE from "three";
import type {
  IWorldService,
  ISceneService,
  IRaycasterService,
  ICameraService,
  IBlockInteraction,
  LookingAtInfo,
} from "../types";
import {
  EventBus,
  GameEvents,
  BlockInteractionEvent,
} from "../events/EventBus";
import { GameConfig } from "../config/GameConfig";
import { Container } from "../di/Container";
import { gameLogger } from './LoggingService';

export class PlayerBlockInteractionService implements IBlockInteraction {
  private readonly worldService: IWorldService;
  private readonly sceneService: ISceneService;
  private readonly raycasterService: IRaycasterService;
  private readonly cameraService: ICameraService;
  private readonly eventBus: EventBus;
  private readonly config: GameConfig;
  private readonly player: any; // TODO: Crear interfaz IPlayer

  private blockFaceHL: { mesh: THREE.LineSegments; dir: string } = {
    mesh: new THREE.LineSegments(),
    dir: "",
  };
  private lookingAt: LookingAtInfo | null;

  constructor(
    worldService: IWorldService,
    sceneService: ISceneService,
    raycasterService: IRaycasterService,
    cameraService: ICameraService,
    player: any
  ) {
    // Obtener instancias de servicios singleton
    this.eventBus = EventBus.getInstance();
    this.config = GameConfig.getInstance();

    // Inyectar dependencias
    this.worldService = worldService;
    this.sceneService = sceneService;
    this.raycasterService = raycasterService;
    this.cameraService = cameraService;
    this.player = player;
    this.lookingAt = null;

    // Inicializar el resaltado de bloques
    this.initializeBlockHighlight();

    // Suscribirse a eventos relevantes
    this.setupEventListeners();
  }

  private initializeBlockHighlight(): void {
    const playerConfig = this.config.get("player") as {
      attackRange: number;
      height: number;
    };
    const highlightBoxGeo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    const highlightEdgesGeo = new THREE.EdgesGeometry(highlightBoxGeo);
    const highlightMaterial = new THREE.LineBasicMaterial({
      color: 0x000000,
      linewidth: 2,
      depthTest: true,
      transparent: true,
    });

    this.blockFaceHL = {
      mesh: new THREE.LineSegments(highlightEdgesGeo, highlightMaterial),
      dir: "",
    };
    this.blockFaceHL.mesh.name = "Block_Wireframe_Highlight_Mesh";
    this.blockFaceHL.mesh.renderOrder = 999;

    this.sceneService.add(this.blockFaceHL.mesh);
  }

  private setupEventListeners(): void {
    // Escuchar eventos de cambio de estado del juego
    this.eventBus.on(GameEvents.GAME_STATE_CHANGE, (event) => {
      if (event.state === "paused") {
        this.clearHighlight();
      }
    });

    // Escuchar eventos de actualización de chunks
    this.eventBus.on(GameEvents.CHUNK_LOAD, () => {
      // Forzar actualización del resaltado cuando se cargan nuevos chunks
      this.highlightBlock();
    });
  }

  public highlightBlock(): void {
    if (!this.raycasterService || !this.cameraService) {
      console.error("Raycaster o Camera no disponibles");
      return;
    }

    const center = new THREE.Vector2(0, 0);
    this.raycasterService.setFromCamera(center, this.cameraService);

    const chunkMeshesToTest: THREE.Object3D[] = [];
    this.worldService.activeChunks.forEach((chunk) => {
      if (chunk && chunk.chunkRoot && chunk.chunkRoot.children) {
        chunkMeshesToTest.push(...chunk.chunkRoot.children);
      }
    });

    const intersects = this.raycasterService.intersectObjects(
      chunkMeshesToTest,
      false
    );
    const playerConfig = this.config.get("player") as {
      attackRange: number;
      height: number;
    };

    // Filtramos las intersecciones para asegurarnos de tener solo resultados válidos
    const validIntersects = intersects.filter(
      (intersect) =>
        intersect.object instanceof THREE.Mesh &&
        intersect.object.name.startsWith("MergedChunkMesh_") &&
        intersect.distance > 0.1 &&
        intersect.distance < playerConfig.attackRange &&
        intersect.face
    );

    // Verificamos y procesamos solo la primera intersección válida
    if (validIntersects.length > 0 && validIntersects[0].face) {
      const firstValidIntersect = validIntersects[0];
      
      // Procesamos la intersección con mucho cuidado para evitar problemas de coordenadas
      this.handleValidIntersection(firstValidIntersect);

      // Emitir evento de resaltado con precaución
      this.eventBus.emit(GameEvents.BLOCK_HIGHLIGHT, {
        position: firstValidIntersect.point,
        blockType: this.getBlockTypeAt(firstValidIntersect.point),
        playerPosition: {
          x: this.player.x,
          y: this.player.y,
          z: this.player.z,
        },
      });
    } else {
      this.clearHighlight();
    }
  }

  private getBlockTypeAt(point: THREE.Vector3): string {
    const x = Math.floor(point.x);
    const y = Math.floor(point.y);
    const z = Math.floor(point.z);
    return this.worldService.getBlock(x, y, z) || "air";
  }

  public interactWithBlock(destroy: boolean): void {
    if (!this.lookingAt) return;

    const { blockWorldCoords, placeBlockWorldCoords } = this.lookingAt;

    if (destroy) {
      if (this.canBreakBlock(blockWorldCoords)) {
        const blockType = this.worldService.getBlock(
          blockWorldCoords.x,
          blockWorldCoords.y,
          blockWorldCoords.z
        ) || "air";

        this.worldService.setBlock(
          blockWorldCoords.x,
          blockWorldCoords.y,
          blockWorldCoords.z,
          "air"
        );

        this.eventBus.emit(GameEvents.BLOCK_BREAK, {
          position: blockWorldCoords,
          blockType,
          playerPosition: {
            x: this.player.x,
            y: this.player.y,
            z: this.player.z,
          },
        });
      }
      return;
    }

    // --- SOLO UNA COLOCACIÓN POR ACCIÓN ---
    // Si estamos mirando agua, solo intentamos colocar en esa posición
    const blockType = this.worldService.getBlock(
      blockWorldCoords.x,
      blockWorldCoords.y,
      blockWorldCoords.z
    );

    // PREVENCIÓN DE DOBLE COLOCACIÓN EN AGUA
    if (blockType === "waterBlock") {
      // Verificar adicionalmente si placeBlockWorldCoords contiene agua
      const placeBlockType = this.worldService.getBlock(
        placeBlockWorldCoords.x, 
        placeBlockWorldCoords.y, 
        placeBlockWorldCoords.z
      );
      
      // Si ambos son agua, SOLO colocar en el que estamos mirando directamente
      if (placeBlockType === "waterBlock") {
        console.log("Prevención de doble colocación activada: ambas posiciones contienen agua");
      }

      if (this.canPlaceBlockInWater(blockWorldCoords)) {
        const newBlockType = "stoneBlock";
        this.worldService.setBlock(
          blockWorldCoords.x,
          blockWorldCoords.y,
          blockWorldCoords.z,
          newBlockType
        );

        this.eventBus.emit(GameEvents.BLOCK_PLACE, {
          position: blockWorldCoords,
          blockType: newBlockType,
          playerPosition: {
            x: this.player.x,
            y: this.player.y,
            z: this.player.z,
          },
        });
      }
      // IMPORTANTE: return para evitar doble colocación
      return;
    }

    // Si no es agua, intentamos colocar en la posición adyacente
    // PREVENCIÓN ADICIONAL: verificar que no estamos intentando colocar en agua
    const adjacentIsWater = this.worldService.getBlock(
      placeBlockWorldCoords.x,
      placeBlockWorldCoords.y,
      placeBlockWorldCoords.z
    ) === "waterBlock";

    // Si el bloque adyacente es agua y estamos en la orilla, evitar colocación
    if (adjacentIsWater) {
      console.log("Prevención de colocación en agua adyacente activada");
      return;
    }

    if (this.canPlaceBlock(placeBlockWorldCoords)) {
      const newBlockType = "stoneBlock";
      this.worldService.setBlock(
        placeBlockWorldCoords.x,
        placeBlockWorldCoords.y,
        placeBlockWorldCoords.z,
        newBlockType
      );

      this.eventBus.emit(GameEvents.BLOCK_PLACE, {
        position: placeBlockWorldCoords,
        blockType: newBlockType,
        playerPosition: {
          x: this.player.x,
          y: this.player.y,
          z: this.player.z,
        },
      });
    }
  }

  private canBreakBlock(coords: THREE.Vector3): boolean {
    const blockType = this.worldService.getBlock(coords.x, coords.y, coords.z);
    return blockType !== "air" && blockType !== "waterBlock";
  }

  private canPlaceBlock(coords: THREE.Vector3): boolean {
    // Verificar si el bloque está dentro del jugador
    if (this.wouldPlaceBlockInsidePlayer(coords.x, coords.y, coords.z)) {
      return false;
    }

    // Verificar si el bloque actual es aire o agua
    const currentBlock = this.worldService.getBlock(coords.x, coords.y, coords.z);
    if (currentBlock !== "air" && currentBlock !== "waterBlock") {
      return false;
    }

    // Verificar si hay un bloque sólido debajo o al lado
    const hasSolidNeighbor = 
      this.isSolidBlock(coords.x, coords.y - 1, coords.z) ||
      this.isSolidBlock(coords.x + 1, coords.y, coords.z) ||
      this.isSolidBlock(coords.x - 1, coords.y, coords.z) ||
      this.isSolidBlock(coords.x, coords.y, coords.z + 1) ||
      this.isSolidBlock(coords.x, coords.y, coords.z - 1);

    // Verificar si hay agua arriba o al lado
    const hasWaterNeighbor = 
      this.worldService.getBlock(coords.x, coords.y + 1, coords.z) === "waterBlock" ||
      this.worldService.getBlock(coords.x + 1, coords.y, coords.z) === "waterBlock" ||
      this.worldService.getBlock(coords.x - 1, coords.y, coords.z) === "waterBlock" ||
      this.worldService.getBlock(coords.x, coords.y, coords.z + 1) === "waterBlock" ||
      this.worldService.getBlock(coords.x, coords.y, coords.z - 1) === "waterBlock";

    // Permitir colocación si hay un bloque sólido adyacente O si hay agua adyacente
    return hasSolidNeighbor || hasWaterNeighbor || currentBlock === "waterBlock";
  }

  private isSolidBlock(x: number, y: number, z: number): boolean {
    const blockType = this.worldService.getBlock(x, y, z);
    return blockType !== null && blockType !== "air" && blockType !== "waterBlock";
  }

  private canPlaceBlockInWater(coords: THREE.Vector3): boolean {
    const blockType = this.worldService.getBlock(coords.x, coords.y, coords.z);
    if (blockType !== "waterBlock") return false;

    // Si el bloque está dentro del jugador, no permitir colocación
    if (this.wouldPlaceBlockInsidePlayer(coords.x, coords.y, coords.z)) {
      return false;
    }

    // Verificar si hay un bloque sólido debajo
    const blockBelow = this.worldService.getBlock(coords.x, coords.y - 1, coords.z);
    const isSolidBelow = blockBelow && blockBelow !== "air" && blockBelow !== "waterBlock";

    // Si hay un bloque sólido debajo, permitir colocación
    if (isSolidBelow) {
      return true;
    }

    // Si no hay bloque sólido debajo, verificar si es agua profunda
    if (coords.y > 1) {
      const waterBelow = this.worldService.getBlock(coords.x, coords.y - 1, coords.z) === "waterBlock";
      const waterBelow2 = this.worldService.getBlock(coords.x, coords.y - 2, coords.z) === "waterBlock";
      
      // Si hay dos bloques de agua debajo, es agua profunda
      if (waterBelow && waterBelow2) {
        gameLogger.logGameEvent('Intento de colocar bloque en agua profunda', {
          position: coords.toArray()
        });
        return false;
      }
    }

    // Si hay un bloque sólido adyacente, permitir colocación
    const hasSolidNeighbor = 
      this.isSolidBlock(coords.x + 1, coords.y, coords.z) ||
      this.isSolidBlock(coords.x - 1, coords.y, coords.z) ||
      this.isSolidBlock(coords.x, coords.y, coords.z + 1) ||
      this.isSolidBlock(coords.x, coords.y, coords.z - 1);

    return hasSolidNeighbor;
  }

  private wouldPlaceBlockInsidePlayer(x: number, y: number, z: number): boolean {
    if (!this.player) return false;

    const playerMinX = this.player.x - this.player.width / 2;
    const playerMaxX = this.player.x + this.player.width / 2;
    const playerMinY = this.player.y;
    const playerMaxY = this.player.y + this.player.height;
    const playerMinZ = this.player.z - this.player.depth / 2;
    const playerMaxZ = this.player.z + this.player.depth / 2;

    return (
      x + 1 > playerMinX &&
      x < playerMaxX &&
      y + 1 > playerMinY &&
      y < playerMaxY &&
      z + 1 > playerMinZ &&
      z < playerMaxZ
    );
  }

  public clearHighlight(): void {
    if (this.lookingAt !== null) {
      if (this.sceneService.getObjectByName(this.blockFaceHL.mesh.name)) {
        this.blockFaceHL.mesh.visible = false;
      }
      this.lookingAt = null;
      this.blockFaceHL.dir = "";
    }
  }

  private handleValidIntersection(intersection: THREE.Intersection): void {
    const hitObject = intersection.object as THREE.Mesh;
    const hitPointWorld = intersection.point.clone();
    const hitNormalLocal = intersection.face?.normal.clone();
    if (!hitNormalLocal) return;

    const hitNormalWorld = hitNormalLocal
      .clone()
      .transformDirection(hitObject.matrixWorld)
      .normalize();

    // Calcular las coordenadas del bloque que estamos mirando
    const calculatedBlockWorldCoords = new THREE.Vector3(
      Math.floor(hitPointWorld.x - hitNormalWorld.x * 0.499),
      Math.floor(hitPointWorld.y - hitNormalWorld.y * 0.499),
      Math.floor(hitPointWorld.z - hitNormalWorld.z * 0.499)
    );

    // Verificar si el bloque que estamos mirando es agua
    const targetBlockType = this.worldService.getBlock(
      calculatedBlockWorldCoords.x,
      calculatedBlockWorldCoords.y,
      calculatedBlockWorldCoords.z
    );

    // Calcular las coordenadas donde se colocaría el bloque nuevo
    // Si estamos mirando agua, usamos exactamente esas coordenadas
    let calculatedPlaceBlockWorldCoords;
    if (targetBlockType === "waterBlock") {
      // En agua, usamos exactamente las mismas coordenadas del agua
      calculatedPlaceBlockWorldCoords = calculatedBlockWorldCoords.clone();
    } else {
      // Si no es agua, calculamos las coordenadas adyacentes normales
      calculatedPlaceBlockWorldCoords = new THREE.Vector3(
        Math.floor(hitPointWorld.x + hitNormalWorld.x * 0.499),
        Math.floor(hitPointWorld.y + hitNormalWorld.y * 0.499),
        Math.floor(hitPointWorld.z + hitNormalWorld.z * 0.499)
      );

      // IMPORTANTE: Verificar si las nuevas coordenadas son agua
      const placeBlockType = this.worldService.getBlock(
        calculatedPlaceBlockWorldCoords.x,
        calculatedPlaceBlockWorldCoords.y,
        calculatedPlaceBlockWorldCoords.z
      );

      // Si también es agua, NO permitimos otra coordenada de colocación
      // Esto evita la doble colocación cuando miramos la orilla del agua
      if (placeBlockType === "waterBlock") {
        gameLogger.logGameEvent('Prevención de colocación doble en agua', {
          target: calculatedBlockWorldCoords.toArray(),
          place: calculatedPlaceBlockWorldCoords.toArray()
        });
        // Usamos las coordenadas originales para evitar la doble colocación
        calculatedPlaceBlockWorldCoords = calculatedBlockWorldCoords.clone();
      }
    }

    // Actualizar el lookingAt con las coordenadas calculadas
    this.lookingAt = {
      object: hitObject,
      point: intersection.point,
      worldPoint: hitPointWorld,
      face: intersection.face ?? null,
      blockWorldCoords: calculatedBlockWorldCoords,
      placeBlockWorldCoords: calculatedPlaceBlockWorldCoords,
      worldFaceNormal: hitNormalWorld,
      distance: intersection.distance,
    };

    this.updateHighlightMesh();
    this.updateHighlightDirection();
  }

  private updateHighlightMesh(): void {
    if (!this.blockFaceHL.mesh) return;

    const meshInScene = this.sceneService.getObjectByName(
      this.blockFaceHL.mesh.name
    );
    if (!meshInScene) {
      this.sceneService.add(this.blockFaceHL.mesh);
    }

    if (this.lookingAt && this.lookingAt.blockWorldCoords) {
      const pos = {
        x: this.lookingAt.blockWorldCoords.x + 0.5,
        y: this.lookingAt.blockWorldCoords.y + 0.5,
        z: this.lookingAt.blockWorldCoords.z + 0.5,
      };
      this.blockFaceHL.mesh.position.set(pos.x, pos.y, pos.z);
      this.blockFaceHL.mesh.visible = true;
    } else {
      this.blockFaceHL.mesh.visible = false;
    }
    this.blockFaceHL.mesh.rotation.set(0, 0, 0);
  }

  private updateHighlightDirection(): void {
    if (!this.lookingAt?.worldFaceNormal) return;

    const normal = this.lookingAt.worldFaceNormal;
    if (Math.abs(normal.x) > 0.5) {
      this.blockFaceHL.dir = normal.x > 0 ? "East (+X)" : "West (-X)";
    } else if (Math.abs(normal.y) > 0.5) {
      this.blockFaceHL.dir = normal.y > 0 ? "Top (+Y)" : "Bottom (-Y)";
    } else if (Math.abs(normal.z) > 0.5) {
      this.blockFaceHL.dir = normal.z > 0 ? "South (+Z)" : "North (-Z)";
    } else {
      this.blockFaceHL.dir = "Unknown Face";
    }
  }

  public getLookingAt(): LookingAtInfo | null {
    return this.lookingAt;
  }
}
