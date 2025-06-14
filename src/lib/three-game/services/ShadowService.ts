import * as THREE from "three";
import { GameRefs } from "../types";
import CSM from "three-csm";

interface ShadowConfig {
  shadowResolution: number;
  shadowNear: number;
  shadowFar: number;
  shadowCameraSize: number;
  shadowType: THREE.ShadowMapType;
  numCascades: number;
  maxFar: number;
  fade: boolean;
  mode: 'practical' | 'uniform' | 'logarithmic';
  cascadeResolution: number;
}

export default class ShadowService {
  private light: THREE.DirectionalLight;
  private scene: THREE.Scene;
  private renderer: THREE.WebGLRenderer;
  private config: ShadowConfig;
  private csm: CSM | null = null;
  private gameRefs: GameRefs;

  constructor(gameRefs: GameRefs) {
    if (!gameRefs.scene || !gameRefs.renderer) {
      throw new Error('GameRefs must contain scene and renderer');
    }

    this.light = new THREE.DirectionalLight(0xffffff, 1);
    this.light.position.set(0, 100, 0);
    this.light.castShadow = true;
    this.light.shadow.mapSize.width = 1024;
    this.light.shadow.mapSize.height = 1024;
    this.light.shadow.camera.near = 0.1;
    this.light.shadow.camera.far = 500;
    this.light.shadow.camera.left = -50;
    this.light.shadow.camera.right = 50;
    this.light.shadow.camera.top = 50;
    this.light.shadow.camera.bottom = -50;
    this.light.shadow.camera.updateProjectionMatrix();
    
    // Configure shadow map type for CSM compatibility
    this.light.shadow.map = new THREE.WebGLRenderTarget(2048, 2048, {
      type: THREE.FloatType,
      depthBuffer: true,
      stencilBuffer: false
    });
    this.light.shadow.map.texture.generateMipmaps = false;
    this.light.shadow.map.texture.minFilter = THREE.LinearFilter;

    this.scene = gameRefs.scene;
    this.renderer = gameRefs.renderer;
    this.gameRefs = gameRefs;
    this.config = {
      shadowResolution: 1024,
      shadowNear: 0.1,
      shadowFar: 500,
      shadowCameraSize: 50,
      shadowType: THREE.PCFSoftShadowMap,
      numCascades: 4,
      maxFar: 500,
      fade: true,
      mode: 'practical',
      cascadeResolution: 1024
    };

    // Add the light to the scene
    this.scene.add(this.light);
    // Asegurarse de que los referencias no sean null
    if (!gameRefs.scene || !gameRefs.renderer) {
      throw new Error('GameRefs must contain scene and renderer');
    }

    this.gameRefs = gameRefs;
    this.scene = gameRefs.scene;
    this.renderer = gameRefs.renderer;
    
    this.config = {
      shadowResolution: 2048,
      shadowNear: 0.1,
      shadowFar: 1000,
      shadowCameraSize: 100,
      shadowType: THREE.PCFSoftShadowMap,
      numCascades: 4,
      maxFar: 1000,
      fade: true,
      mode: 'practical',
      cascadeResolution: 2048
    };

    this.setupRenderer();
    this.setupLight();
    this.setupCSM();
  }

  private setupRenderer() {
    // Configurar sombras en el renderizador
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = true;
  }

  private setupLight() {
    // Crear luz direccional para simular el sol
    this.light = new THREE.DirectionalLight(0xffffff, 1);
    
    // Posición inicial del sol (más baja y más horizontal)
    const sunPosition = new THREE.Vector3(1, 1, 1).normalize().multiplyScalar(50);
    this.light.position.set(sunPosition.x, sunPosition.y, sunPosition.z);
    
    // Configurar sombras
    this.light.castShadow = true;
    
    // Añadir la luz a la escena
    this.scene.add(this.light);
  }

  private setupCSM() {
    // Inicializar CSM
    this.csm = new CSM({
      camera: this.gameRefs.camera as THREE.PerspectiveCamera,
      cascades: this.config.numCascades,
      mode: this.config.mode,
      maxFar: this.config.maxFar,
      shadowMapSize: this.config.shadowResolution,
      parent: this.scene,
      lightDirection: new THREE.Vector3(0, -1, 0),
      lightDirectionUp: new THREE.Vector3(0, 0, 1),
      fade: this.config.fade,
      noLastCascadeCutOff: true
    });

    // Configure shadow camera
    this.light.shadow.camera.near = 0.1;
    this.light.shadow.camera.far = this.config.maxFar;
    this.light.shadow.camera.left = -100;
    this.light.shadow.camera.right = 100;
    this.light.shadow.camera.top = 100;
    this.light.shadow.camera.bottom = -100;

    // Configure shadow map
    this.light.shadow.mapSize.width = this.config.shadowResolution;
    this.light.shadow.mapSize.height = this.config.shadowResolution;
    this.light.shadow.bias = 0.0001;
    this.light.shadow.normalBias = 0.01;
    this.light.shadow.radius = 1;

    // Configure shadow type
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Add light to scene
    this.scene.add(this.light);

    // Update materials
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        if (Array.isArray(object.material)) {
          object.material.forEach((m) => {
            m.needsUpdate = true;
            (m as any).shadowSide = THREE.FrontSide;
          });
        } else {
          object.material.needsUpdate = true;
          (object.material as any).shadowSide = THREE.FrontSide;
        }
      }
    });

    // Finalizar la configuración
    this.csm.update();
    
    // Configurar el render loop
    this.renderer.setAnimationLoop(() => {
      if (this.csm) {
        this.csm.update();
        this.renderer.render(this.scene, this.gameRefs.camera as THREE.Camera);
      }
    });
  }

  public update() {
    if (this.csm) {
      this.csm.update();
    }
  }

  public setLightDirection(position: THREE.Vector3) {
    if (this.light) {
      this.light.position.copy(position);
      if (this.csm) {
        this.csm.lightDirection = position.clone().normalize();
        this.csm.update();
      }
    }
  }

  public dispose() {
    if (this.light) {
      this.scene.remove(this.light);
      this.light.dispose();
    }
    if (this.csm) {
      this.csm.dispose();
    }
  }

  public updateLightPosition(position: THREE.Vector3) {
    this.light.position.copy(position);
  }

  public getLight() {
    return this.light;
  }

  public getConfig() {
    return this.config;
  }

  public setConfig(newConfig: Partial<ShadowConfig>) {
    Object.assign(this.config, newConfig);
    // Actualizar configuración de la luz
    this.light.shadow.mapSize.width = this.config.shadowResolution;
    this.light.shadow.mapSize.height = this.config.shadowResolution;
    this.light.shadow.camera.near = this.config.shadowNear;
    this.light.shadow.camera.far = this.config.shadowFar;
    // @ts-ignore - CSM camera properties
    this.light.shadow.camera.cascades = this.config.numCascades;
    // @ts-ignore - CSM camera properties
    this.light.shadow.camera.cascadeResolution = this.config.cascadeResolution;
  }
}
