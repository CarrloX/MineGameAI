import * as THREE from "three";

export interface ILightingService {
  /**
   * Inicializa el servicio de iluminación
   * @param scene Escena de Three.js donde se aplicará la iluminación
   */
  initialize(scene: THREE.Scene): void;

  /**
   * Actualiza la iluminación en cada frame
   * @param deltaTime Tiempo transcurrido desde el último frame
   * @param cameraPosition Posición actual de la cámara
   */
  update(deltaTime: number, cameraPosition: THREE.Vector3): void;

  /**
   * Limpia los recursos utilizados por el servicio
   */
  dispose(): void;

  /**
   * Habilita o deshabilita las sombras
   * @param enabled Estado de las sombras
   */
  setShadowsEnabled(enabled: boolean): void;

  /**
   * Actualiza la posición de la luz principal
   * @param position Nueva posición de la luz
   */
  updateLightPosition(position: THREE.Vector3): void;

  /**
   * Establece la intensidad de la luz ambiental
   * @param intensity Intensidad de la luz (0-1)
   */
  setAmbientLightIntensity(intensity: number): void;

  /**
   * Establece el color de la luz ambiental
   * @param color Color THREE.Color o string/hex
   */
  setAmbientLightColor(color: THREE.Color | string | number): void;

  /**
   * Establece la intensidad de la luz direccional
   * @param intensity Intensidad de la luz (0-1)
   */
  setDirectionalLightIntensity(intensity: number): void;

  /**
   * Establece el color de la luz direccional
   * @param color Color THREE.Color o string/hex
   */
  setDirectionalLightColor(color: THREE.Color | string | number): void;
}
