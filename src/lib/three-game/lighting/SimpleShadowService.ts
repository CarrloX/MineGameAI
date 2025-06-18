import * as THREE from "three";
import { ILightingService } from "./ILightingService";

export class SimpleShadowService implements ILightingService {
  private scene: THREE.Scene | null = null;
  private ambientLight: THREE.AmbientLight;
  private directionalLight: THREE.DirectionalLight;
  private isInitialized: boolean = false;

  constructor() {
    // Luz ambiental para iluminación base
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    
    // Luz direccional sin sombras
    this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    this.directionalLight.name = "SimpleDirectionalLight";
    this.directionalLight.castShadow = false;
  }

  initialize(scene: THREE.Scene): void {
    if (!scene) {
      console.error('No se proporcionó una escena válida');
      return;
    }
    
    if (this.isInitialized) {
      console.warn('El servicio de iluminación ya está inicializado');
      return;
    }
    
    try {
      this.scene = scene;
      
      // Añadir luces a la escena
      if (this.ambientLight) {
        this.scene.add(this.ambientLight);
      }
      
      if (this.directionalLight) {
        this.scene.add(this.directionalLight);
        
        // Añadir el target de la luz si no tiene padre
        if (this.directionalLight.target && !this.directionalLight.target.parent) {
          this.scene.add(this.directionalLight.target);
        }
      }
      
      this.isInitialized = true;
      console.log('Servicio de iluminación inicializado correctamente');
    } catch (error) {
      console.error('Error al inicializar el servicio de iluminación:', error);
      throw error; // Relanzar el error para que se maneje en el nivel superior
    }
  }

  update(_deltaTime: number, cameraPosition: THREE.Vector3): void {
    if (!this.isInitialized) return;
    
    // Actualizar la posición de la luz para que siga a la cámara
    this.directionalLight.position.set(
      cameraPosition.x + 50,
      cameraPosition.y + 100,
      cameraPosition.z + 50
    );
    
    // Apuntar la luz ligeramente hacia abajo
    if (this.directionalLight.target) {
      this.directionalLight.target.position.set(
        cameraPosition.x,
        cameraPosition.y - 20,
        cameraPosition.z
      );
      this.directionalLight.target.updateMatrixWorld();
    }
  }

  dispose(): void {
    if (!this.scene) return;
    
    // Limpiar luces
    this.scene.remove(this.ambientLight);
    this.scene.remove(this.directionalLight);
    
    if (this.directionalLight.target) {
      this.scene.remove(this.directionalLight.target);
    }
    
    this.isInitialized = false;
  }

  setShadowsEnabled(_enabled: boolean): void {
    // En esta implementación simple, no manejamos sombras
    // Este método se mantiene por compatibilidad con la interfaz
  }

  updateLightPosition(position: THREE.Vector3): void {
    this.directionalLight.position.copy(position);
  }

  // Métodos adicionales específicos de esta implementación
  setAmbientLightIntensity(intensity: number): void {
    this.ambientLight.intensity = intensity;
  }

  setAmbientLightColor(color: THREE.Color | string | number): void {
    this.ambientLight.color = (color instanceof THREE.Color)
      ? color
      : new THREE.Color(color);
  }

  setDirectionalLightIntensity(intensity: number): void {
    this.directionalLight.intensity = intensity;
  }

  setDirectionalLightColor(color: THREE.Color | string | number): void {
    this.directionalLight.color = (color instanceof THREE.Color)
      ? color
      : new THREE.Color(color);
  }
}

