import * as THREE from 'three';
import type { 
    IWorldService, 
    ISceneService, 
    IRaycasterService, 
    ICameraService,
    IBlockInteraction,
    LookingAtInfo 
} from '../types';
import { EventBus, GameEvents, BlockInteractionEvent } from '../events/EventBus';
import { GameConfig } from '../config/GameConfig';
import { Container } from '../di/Container';

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
        dir: ""
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
        const playerConfig = this.config.get('player') as {
            attackRange: number;
            height: number;
        };
        const highlightBoxGeo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
        const highlightEdgesGeo = new THREE.EdgesGeometry(highlightBoxGeo);
        const highlightMaterial = new THREE.LineBasicMaterial({ 
            color: 0x000000,
            linewidth: 2,
            depthTest: true,
            transparent: true
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
            if (event.state === 'paused') {
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
            console.error('Raycaster o Camera no disponibles');
            return;
        }

        const center = new THREE.Vector2(0, 0);
        this.raycasterService.setFromCamera(center, this.cameraService);

        const chunkMeshesToTest: THREE.Object3D[] = [];
        this.worldService.activeChunks.forEach(chunk => {
            if (chunk && chunk.chunkRoot && chunk.chunkRoot.children) {
                chunkMeshesToTest.push(...chunk.chunkRoot.children);
            }
        });

        const intersects = this.raycasterService.intersectObjects(chunkMeshesToTest, false);
        const playerConfig = this.config.get('player') as {
            attackRange: number;
            height: number;
        };

        const firstValidIntersect = intersects.find(
            intersect => intersect.object instanceof THREE.Mesh &&
                        intersect.object.name.startsWith("MergedChunkMesh_") &&
                        intersect.distance > 0.1 &&
                        intersect.distance < playerConfig.attackRange &&
                        intersect.face
        );

        if (firstValidIntersect && firstValidIntersect.face) {
            this.handleValidIntersection(firstValidIntersect);
            
            // Emitir evento de resaltado
            this.eventBus.emit(GameEvents.BLOCK_HIGHLIGHT, {
                position: firstValidIntersect.point,
                blockType: this.getBlockTypeAt(firstValidIntersect.point),
                playerPosition: {
                    x: this.player.x,
                    y: this.player.y,
                    z: this.player.z
                }
            });
        } else {
            this.clearHighlight();
        }
    }

    private getBlockTypeAt(point: THREE.Vector3): string {
        const x = Math.floor(point.x);
        const y = Math.floor(point.y);
        const z = Math.floor(point.z);
        return this.worldService.getBlock(x, y, z);
    }

    public interactWithBlock(destroy: boolean): void {
        if (!this.lookingAt) return;

        const { blockWorldCoords, placeBlockWorldCoords } = this.lookingAt;
        const playerConfig = this.config.get('player');

        if (destroy) {
            if (this.canBreakBlock(blockWorldCoords)) {
                const blockType = this.worldService.getBlock(
                    blockWorldCoords.x,
                    blockWorldCoords.y,
                    blockWorldCoords.z
                ) || 'air'; // Si es null, usar 'air' como valor por defecto
                
                this.worldService.setBlock(
                    blockWorldCoords.x,
                    blockWorldCoords.y,
                    blockWorldCoords.z,
                    'air'
                );

                // Emitir evento de destrucción
                this.eventBus.emit(GameEvents.BLOCK_BREAK, {
                    position: blockWorldCoords,
                    blockType,
                    playerPosition: {
                        x: this.player.x,
                        y: this.player.y,
                        z: this.player.z
                    }
                });
            }
        } else {
            if (this.canPlaceBlock(placeBlockWorldCoords)) {
                // Usar stoneBlock como bloque por defecto
                const blockType = 'stoneBlock';
                
                this.worldService.setBlock(
                    placeBlockWorldCoords.x,
                    placeBlockWorldCoords.y,
                    placeBlockWorldCoords.z,
                    blockType
                );

                // Emitir evento de colocación
                this.eventBus.emit(GameEvents.BLOCK_PLACE, {
                    position: placeBlockWorldCoords,
                    blockType,
                    playerPosition: {
                        x: this.player.x,
                        y: this.player.y,
                        z: this.player.z
                    }
                });
            }
        }
    }

    private canBreakBlock(coords: THREE.Vector3): boolean {
        const blockType = this.worldService.getBlock(coords.x, coords.y, coords.z);
        return blockType !== 'air' && blockType !== 'waterBlock';
    }

    private canPlaceBlock(coords: THREE.Vector3): boolean {
        const blockType = this.worldService.getBlock(coords.x, coords.y, coords.z);
        return blockType === 'air' && !this.wouldPlaceBlockInsidePlayer(coords.x, coords.y, coords.z);
    }

    private wouldPlaceBlockInsidePlayer(placeX: number, placeY: number, placeZ: number): boolean {
        const playerConfig = this.config.get('player') as {
            height: number;
        };
        const playerHeadY = Math.floor(this.player.y + playerConfig.height - 0.1);
        const playerFeetY = Math.floor(this.player.y + 0.1);

        return (Math.floor(placeX) === Math.floor(this.player.x) && 
                Math.floor(placeZ) === Math.floor(this.player.z)) &&
               (Math.floor(placeY) === playerFeetY || 
                Math.floor(placeY) === playerHeadY);
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

        const hitNormalWorld = hitNormalLocal.clone()
            .transformDirection(hitObject.matrixWorld)
            .normalize();

        const calculatedBlockWorldCoords = new THREE.Vector3(
            Math.floor(hitPointWorld.x - hitNormalWorld.x * 0.499),
            Math.floor(hitPointWorld.y - hitNormalWorld.y * 0.499),
            Math.floor(hitPointWorld.z - hitNormalWorld.z * 0.499)
        );

        const calculatedPlaceBlockWorldCoords = new THREE.Vector3(
            Math.floor(hitPointWorld.x + hitNormalWorld.x * 0.499),
            Math.floor(hitPointWorld.y + hitNormalWorld.y * 0.499),
            Math.floor(hitPointWorld.z + hitNormalWorld.z * 0.499)
        );

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

        const meshInScene = this.sceneService.getObjectByName(this.blockFaceHL.mesh.name);
        if (!meshInScene) {
            this.sceneService.add(this.blockFaceHL.mesh);
        }

        if (this.lookingAt && this.lookingAt.blockWorldCoords) {
            const pos = {
                x: this.lookingAt.blockWorldCoords.x + 0.5,
                y: this.lookingAt.blockWorldCoords.y + 0.5,
                z: this.lookingAt.blockWorldCoords.z + 0.5
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
            this.blockFaceHL.dir = normal.x > 0 ? 'East (+X)' : 'West (-X)';
        } else if (Math.abs(normal.y) > 0.5) {
            this.blockFaceHL.dir = normal.y > 0 ? 'Top (+Y)' : 'Bottom (-Y)';
        } else if (Math.abs(normal.z) > 0.5) {
            this.blockFaceHL.dir = normal.z > 0 ? 'South (+Z)' : 'North (-Z)';
        } else {
            this.blockFaceHL.dir = 'Unknown Face';
        }
    }

    public getLookingAt(): LookingAtInfo | null {
        return this.lookingAt;
    }
} 