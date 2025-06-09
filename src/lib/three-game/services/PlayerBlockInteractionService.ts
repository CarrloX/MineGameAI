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

    // Obtener todas las intersecciones
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

    if (validIntersects.length === 0) {
      this.clearHighlight();
      return;
    }

    // Identificar y filtrar intersecciones con agua
    const nonWaterIntersections: THREE.Intersection[] = [];
    const waterIntersections: THREE.Intersection[] = [];

    for (const intersect of validIntersects) {
      // Calcular las coordenadas del bloque intersectado
      const hitPoint = intersect.point.clone();
      const hitNormal = intersect.face?.normal.clone() || new THREE.Vector3();
      const hitNormalWorld = hitNormal.clone().transformDirection(intersect.object.matrixWorld).normalize();
      
      const blockCoords = new THREE.Vector3(
        Math.floor(hitPoint.x - hitNormalWorld.x * 0.499),
        Math.floor(hitPoint.y - hitNormalWorld.y * 0.499),
        Math.floor(hitPoint.z - hitNormalWorld.z * 0.499)
      );
      
      // Verificar si es un bloque de agua
      const blockType = this.worldService.getBlock(
        blockCoords.x,
        blockCoords.y,
        blockCoords.z
      );
      
      if (blockType === "waterBlock") {
        // Verificar si es agua profunda (3+ bloques)
        const isDeepWater = this.isDeepWater(blockCoords);
        
        // Si es agua profunda, ignorar esta intersección para el resaltado
        if (isDeepWater) {
          gameLogger.logGameEvent('Ignorando resaltado en agua profunda', {
            position: blockCoords.toArray()
          });
          continue; // Saltar a la siguiente intersección
        }
        
        waterIntersections.push(intersect);
      } else {
        nonWaterIntersections.push(intersect);
        // Si encontramos un bloque no-agua, lo usamos inmediatamente
        // Solo seguimos buscando si solo tenemos agua hasta ahora
        if (nonWaterIntersections.length === 1) {
          break;
        }
      }
    }

    // Si no hay intersecciones válidas después de filtrar agua profunda, limpiar resaltado
    if (nonWaterIntersections.length === 0 && waterIntersections.length === 0) {
      this.clearHighlight();
      return;
    }

    // Priorizar bloques sólidos sobre agua
    let targetIntersection: THREE.Intersection;
    if (nonWaterIntersections.length > 0) {
      // Si hay bloques sólidos, usar el primer bloque sólido encontrado
      targetIntersection = nonWaterIntersections[0];
      gameLogger.logGameEvent('Apuntando a bloque sólido a través del agua', {
        distance: targetIntersection.distance
      });
    } else {
      // Si solo hay agua (no profunda), usar la primera intersección con agua
      targetIntersection = waterIntersections[0];
      gameLogger.logGameEvent('Apuntando a bloque de agua (no profunda)', {
        distance: targetIntersection.distance
      });
    }

    // Procesamos la intersección seleccionada
    this.handleValidIntersection(targetIntersection);

    // Emitir evento de resaltado
    this.eventBus.emit(GameEvents.BLOCK_HIGHLIGHT, {
      position: targetIntersection.point,
      blockType: this.getBlockTypeAt(targetIntersection.point),
      playerPosition: {
        x: this.player.x,
        y: this.player.y,
        z: this.player.z,
      },
    });
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

    // Si queremos romper un bloque
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

    // --- COLOCACIÓN DE BLOQUES ---
    // Verificar el tipo de bloque que estamos mirando
    const targetBlockType = this.worldService.getBlock(
      blockWorldCoords.x,
      blockWorldCoords.y,
      blockWorldCoords.z
    );

    // Si estamos mirando agua, intentar colocar en esa posición
    if (targetBlockType === "waterBlock") {
      if (this.canPlaceBlockInWater(blockWorldCoords)) {
        const newBlockType = "stoneBlock";
        
        gameLogger.logGameEvent('Colocando bloque en agua', {
          position: blockWorldCoords.toArray()
        });
        
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
      return;
    }

    // Si no estamos mirando agua, intentar colocar en la posición adyacente
    const placeBlockType = this.worldService.getBlock(
      placeBlockWorldCoords.x,
      placeBlockWorldCoords.y,
      placeBlockWorldCoords.z
    );

    // Si el bloque adyacente es agua, permitir colocar ahí también
    if (placeBlockType === "waterBlock") {
      if (this.canPlaceBlockInWater(placeBlockWorldCoords)) {
        const newBlockType = "stoneBlock";
        
        gameLogger.logGameEvent('Colocando bloque en agua adyacente', {
          position: placeBlockWorldCoords.toArray()
        });
        
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
      return;
    }

    // Si no estamos mirando agua ni la posición adyacente es agua,
    // usar la lógica normal de colocación
    if (this.canPlaceBlock(placeBlockWorldCoords)) {
      const newBlockType = "stoneBlock";
      
      gameLogger.logGameEvent('Colocando bloque en posición normal', {
        position: placeBlockWorldCoords.toArray()
      });
      
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
    // No permitir romper aire ni agua, igual que en Minecraft original
    return blockType !== null && blockType !== "air" && blockType !== "waterBlock";
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
    
    // Verificar que el bloque es agua
    if (blockType !== "waterBlock") {
      gameLogger.logGameEvent('No se puede colocar: no es agua', {
        position: coords.toArray(),
        blockType
      });
      return false;
    }

    // Verificar que no colocamos dentro del jugador
    if (this.wouldPlaceBlockInsidePlayer(coords.x, coords.y, coords.z)) {
      gameLogger.logGameEvent('No se puede colocar: colisión con jugador', {
        position: coords.toArray()
      });
      return false;
    }

    // *** VERIFICACIÓN CLAVE: Comprobar si es agua superficial ***
    // Obtener el bloque debajo del agua
    const blockBelow = this.worldService.getBlock(coords.x, coords.y - 1, coords.z);
    
    // Si el bloque debajo no es agua, entonces esta agua es superficial
    // y podemos colocar un bloque aquí sin problema
    if (blockBelow !== "waterBlock") {
      gameLogger.logGameEvent('Colocación permitida: agua superficial', {
        position: coords.toArray(),
        blockBelow
      });
      return true;
    }
    
    // Si el bloque debajo es agua, verificar si es agua profunda
    if (coords.y > 1) {
      const blockTwoBelow = this.worldService.getBlock(coords.x, coords.y - 2, coords.z);
      
      // Si el bloque dos niveles abajo no es agua, todavía es superficial (2 bloques)
      if (blockTwoBelow !== "waterBlock") {
        gameLogger.logGameEvent('Colocación permitida: agua semi-profunda', {
          position: coords.toArray()
        });
        return true;
      }
      
      // Si tenemos 3 o más bloques de agua, es agua profunda
      gameLogger.logGameEvent('No se puede colocar: agua profunda', {
        position: coords.toArray()
      });
      return false;
    }
    
    // Si no podemos verificar más abajo (estamos en y=0 o y=1)
    // permitir colocar para evitar casos extremos
    return true;
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

    // COORDENADAS PARA DESTRUIR BLOQUES
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

    // COORDENADAS PARA COLOCAR BLOQUES
    // Si estamos mirando agua, usamos esas coordenadas directamente para colocar
    let calculatedPlaceBlockWorldCoords;
    
    if (targetBlockType === "waterBlock") {
      // Si miramos agua, queremos:
      // 1. Para romper: buscar bloques sólidos cercanos
      // 2. Para colocar: usar las coordenadas del agua directamente
      
      // Para destrucción: buscar bloques sólidos cercanos bajo el agua
      const solidBlockPos = this.findSolidBlockNearWater(calculatedBlockWorldCoords);
      if (solidBlockPos) {
        // Si encontramos un bloque sólido cercano, usarlo para destruir
        calculatedBlockWorldCoords.copy(solidBlockPos);
        gameLogger.logGameEvent('Apuntando a bloque sólido bajo agua', {
          position: solidBlockPos.toArray()
        });
      }
      
      // Para colocación: usar las coordenadas del agua directamente
      calculatedPlaceBlockWorldCoords = new THREE.Vector3().copy(calculatedBlockWorldCoords);
    } else {
      // Si no estamos mirando agua, calcular las coordenadas adyacentes
      calculatedPlaceBlockWorldCoords = new THREE.Vector3(
        Math.floor(hitPointWorld.x + hitNormalWorld.x * 0.499),
        Math.floor(hitPointWorld.y + hitNormalWorld.y * 0.499),
        Math.floor(hitPointWorld.z + hitNormalWorld.z * 0.499)
      );
    }

    // Actualizar la información de lookingAt
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

  // Método auxiliar para encontrar bloques sólidos cerca de agua
  private findSolidBlockNearWater(waterPos: THREE.Vector3): THREE.Vector3 | null {
    // Buscar en 6 direcciones: abajo (prioridad), 4 lados, arriba
    const directions = [
      new THREE.Vector3(0, -1, 0), // abajo (más probable para bloques sumergidos)
      new THREE.Vector3(1, 0, 0),  // +x
      new THREE.Vector3(-1, 0, 0), // -x
      new THREE.Vector3(0, 0, 1),  // +z
      new THREE.Vector3(0, 0, -1), // -z
      new THREE.Vector3(0, 1, 0),  // arriba (menos probable)
    ];

    // Buscar el bloque sólido más cercano
    let distance = 1; // Empezar con bloques adyacentes
    const maxDistance = 2; // No buscar demasiado lejos

    while (distance <= maxDistance) {
      for (const dir of directions) {
        const checkPos = new THREE.Vector3(
          waterPos.x + dir.x * distance,
          waterPos.y + dir.y * distance,
          waterPos.z + dir.z * distance
        );
        
        const blockType = this.worldService.getBlock(
          checkPos.x, checkPos.y, checkPos.z
        );
        
        // Si encontramos un bloque sólido (ni aire ni agua)
        if (blockType && blockType !== "air" && blockType !== "waterBlock") {
          return checkPos; // Devolver la posición del bloque sólido
        }
      }
      
      // Si no encontramos un bloque sólido, aumentar la distancia de búsqueda
      distance++;
    }
    
    return null; // No se encontró ningún bloque sólido cercano
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

  // Método para determinar si un bloque de agua es agua profunda (3+ bloques)
  private isDeepWater(coords: THREE.Vector3): boolean {
    // Si no es agua, no es agua profunda
    if (this.worldService.getBlock(coords.x, coords.y, coords.z) !== "waterBlock") {
      return false;
    }
    
    // Verificar si hay agua debajo (primer nivel)
    const hasWaterBelow = coords.y > 0 && 
      this.worldService.getBlock(coords.x, coords.y - 1, coords.z) === "waterBlock";
      
    if (!hasWaterBelow) {
      return false; // Solo 1 bloque de agua, no es profunda
    }
    
    // Verificar si hay agua dos niveles abajo (segundo nivel)
    const hasWaterTwoBelow = coords.y > 1 && 
      this.worldService.getBlock(coords.x, coords.y - 2, coords.z) === "waterBlock";
      
    // Es agua profunda si hay al menos 3 bloques de agua en total
    return hasWaterTwoBelow;
  }
}
