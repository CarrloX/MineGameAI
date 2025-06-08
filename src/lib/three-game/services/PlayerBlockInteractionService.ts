import * as THREE from 'three';
import type { PlayerWorldService, PlayerSceneService, PlayerRaycasterService, LookingAtInfo, PlayerCameraService } from '../types';
import { CONTROL_CONFIG } from '../CONTROL_CONFIG';

export class PlayerBlockInteractionService {
    private worldService: PlayerWorldService;
    private sceneService: PlayerSceneService;
    private raycasterService: PlayerRaycasterService;
    private cameraService: PlayerCameraService;
    private player: any; // Referencia al jugador
    private blockFaceHL: { mesh: THREE.LineSegments; dir: string };
    private lookingAt: LookingAtInfo | null;

    constructor(
        worldService: PlayerWorldService,
        sceneService: PlayerSceneService,
        raycasterService: PlayerRaycasterService,
        cameraService: PlayerCameraService,
        player: any
    ) {
        this.worldService = worldService;
        this.sceneService = sceneService;
        this.raycasterService = raycasterService;
        this.cameraService = cameraService;
        this.player = player;
        this.lookingAt = null;

        console.log('Inicializando PlayerBlockInteractionService');
        
        // Crear geometría y material del resaltado
        const highlightBoxGeo = new THREE.BoxGeometry(1.002, 1.002, 1.002); // Ligeramente más grande que el bloque
        const highlightEdgesGeo = new THREE.EdgesGeometry(highlightBoxGeo);
        const highlightMaterial = new THREE.LineBasicMaterial({ 
            color: 0x000000,  // Color negro como en Minecraft
            linewidth: 2,     // Línea más fina para mejor definición
            depthTest: true,  // Permitir que se oculte detrás de otros objetos
            transparent: true // Permitir transparencia
        });

        this.blockFaceHL = {
            mesh: new THREE.LineSegments(highlightEdgesGeo, highlightMaterial),
            dir: "",
        };
        this.blockFaceHL.mesh.name = "Block_Wireframe_Highlight_Mesh";
        this.blockFaceHL.mesh.renderOrder = 999; // Asegurar que se renderice por encima de todo
        
        // Añadir el mesh a la escena inmediatamente
        console.log('Añadiendo mesh de resaltado a la escena');
        this.sceneService.add(this.blockFaceHL.mesh);
        
        // Verificar que se añadió correctamente
        const addedMesh = this.sceneService.getObjectByName("Block_Wireframe_Highlight_Mesh");
        console.log('Mesh de resaltado añadido:', addedMesh ? 'Sí' : 'No');
    }

    public highlightBlock(): void {
        if (!this.raycasterService || !this.cameraService) {
            console.error('Raycaster o Camera no disponibles');
            return;
        }

        console.log('highlightBlock llamado');
        
        // Actualizar el raycaster con la posición actual de la cámara
        const camera = this.cameraService;
        const raycaster = this.raycasterService;
        
        // Usar el centro de la pantalla para el raycaster
        const center = new THREE.Vector2(0, 0);
        console.log('Configurando raycaster desde cámara:', {
            cameraPosition: camera.position,
            cameraRotation: camera.rotation
        });
        
        raycaster.setFromCamera(center, camera);

        // Obtener los chunks activos para el raycaster
        const chunkMeshesToTest: THREE.Object3D[] = [];
        this.worldService.activeChunks.forEach(chunk => {
            if (chunk && chunk.chunkRoot && chunk.chunkRoot.children) {
                chunkMeshesToTest.push(...chunk.chunkRoot.children);
            }
        });

        console.log('Chunks a testear:', chunkMeshesToTest.length);
        
        // Realizar la intersección
        const intersects = raycaster.intersectObjects(chunkMeshesToTest, false);
        console.log('Intersecciones encontradas:', intersects.length);

        // Buscar la primera intersección válida
        const firstValidIntersect = intersects.find(
            intersect => intersect.object instanceof THREE.Mesh &&
                        intersect.object.name.startsWith("MergedChunkMesh_") &&
                        intersect.distance > 0.1 &&
                        intersect.distance < this.player.attackRange &&
                        intersect.face
        );

        if (firstValidIntersect && firstValidIntersect.face) {
            console.log('Intersección válida encontrada:', {
                point: firstValidIntersect.point,
                distance: firstValidIntersect.distance,
                object: firstValidIntersect.object.name
            });
            this.handleValidIntersection(firstValidIntersect);
        } else {
            console.log('No se encontró intersección válida');
            this.clearHighlight();
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
        if (!this.blockFaceHL.mesh) {
            console.error('Mesh de resaltado no existe');
            return;
        }

        // Verificar si el mesh está en la escena
        const meshInScene = this.sceneService.getObjectByName(this.blockFaceHL.mesh.name);
        if (!meshInScene) {
            console.log('Mesh de resaltado no está en la escena, añadiéndolo...');
            this.sceneService.add(this.blockFaceHL.mesh);
        }

        if (this.lookingAt && this.lookingAt.blockWorldCoords) {
            const pos = {
                x: this.lookingAt.blockWorldCoords.x + 0.5,
                y: this.lookingAt.blockWorldCoords.y + 0.5,
                z: this.lookingAt.blockWorldCoords.z + 0.5
            };
            console.log('Actualizando posición del resaltado:', pos);
            this.blockFaceHL.mesh.position.set(pos.x, pos.y, pos.z);
            this.blockFaceHL.mesh.visible = true;
            
            // Verificar la visibilidad del mesh
            console.log('Estado del mesh de resaltado:', {
                visible: this.blockFaceHL.mesh.visible,
                position: this.blockFaceHL.mesh.position,
                inScene: !!this.sceneService.getObjectByName(this.blockFaceHL.mesh.name)
            });
        } else {
            console.log('Ocultando mesh de resaltado');
            this.blockFaceHL.mesh.visible = false;
        }
        this.blockFaceHL.mesh.rotation.set(0, 0, 0);
    }

    private updateHighlightDirection(): void {
        const currentHitNormalWorld = this.lookingAt?.worldFaceNormal;
        if (currentHitNormalWorld) {
            if (Math.abs(currentHitNormalWorld.x) > 0.5) {
                this.blockFaceHL.dir = currentHitNormalWorld.x > 0 ? 'East (+X)' : 'West (-X)';
            } else if (Math.abs(currentHitNormalWorld.y) > 0.5) {
                this.blockFaceHL.dir = currentHitNormalWorld.y > 0 ? 'Top (+Y)' : 'Bottom (-Y)';
            } else if (Math.abs(currentHitNormalWorld.z) > 0.5) {
                this.blockFaceHL.dir = currentHitNormalWorld.z > 0 ? 'South (+Z)' : 'North (-Z)';
            } else {
                this.blockFaceHL.dir = 'Unknown Face';
            }
        }
    }

    private clearHighlight(): void {
        if (this.lookingAt !== null) {
            console.log('Limpiando resaltado');
            if (this.sceneService.getObjectByName(this.blockFaceHL.mesh.name)) {
                this.blockFaceHL.mesh.visible = false;
            }
            this.lookingAt = null;
            this.blockFaceHL.dir = "";
        }
    }

    public interactWithBlock(destroy: boolean): void {
        if (!this.lookingAt) return;

        if (destroy) {
            this.destroyBlock();
        } else {
            this.placeBlock();
        }
    }

    private destroyBlock(): void {
        if (!this.lookingAt) return;
        const { x, y, z } = this.lookingAt.blockWorldCoords;
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
            const currentBlock = this.worldService.getBlock(x, y, z);
            if (currentBlock !== 'waterBlock') {
                this.worldService.setBlock(x, y, z, 'air');
                if (this.player.audioManager) {
                    this.player.audioManager.playSound('blockBreak');
                }
            }
        } else {
            console.warn("Invalid block coordinates for destruction:", this.lookingAt.blockWorldCoords);
        }
    }

    private placeBlock(): void {
        if (!this.lookingAt) return;
        const { x: placeX, y: placeY, z: placeZ } = this.lookingAt.placeBlockWorldCoords;
        if (!Number.isFinite(placeX) || !Number.isFinite(placeY) || !Number.isFinite(placeZ)) {
            console.warn("Invalid block coordinates for placement:", this.lookingAt.placeBlockWorldCoords);
            return;
        }

        if (this.wouldPlaceBlockInsidePlayer(placeX, placeY, placeZ)) {
            return;
        }

        if (placeY >= 0 && placeY < this.worldService.layers) {
            const blockToPlaceNameKey = "stoneBlock";
            const placed = this.worldService.setBlock(placeX, placeY, placeZ, blockToPlaceNameKey);
            if (placed && this.player.audioManager) {
                this.player.audioManager.playSound('blockPlace');
            }
        }
    }

    private wouldPlaceBlockInsidePlayer(placeX: number, placeY: number, placeZ: number): boolean {
        const playerHeadY = Math.floor(this.player.y + this.player.height - 0.1);
        const playerFeetY = Math.floor(this.player.y + 0.1);

        return (Math.floor(placeX) === Math.floor(this.player.x) && 
                Math.floor(placeZ) === Math.floor(this.player.z)) &&
               (Math.floor(placeY) === playerFeetY || 
                Math.floor(placeY) === playerHeadY);
    }

    public getLookingAt(): LookingAtInfo | null {
        return this.lookingAt;
    }
} 