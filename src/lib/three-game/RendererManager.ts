
import * as THREE from 'three';
import type { GameRefs } from './types';

export class RendererManager {
  private canvasRef: HTMLDivElement;
  private gameRefs: GameRefs;

  constructor(canvasRef: HTMLDivElement, gameRefs: GameRefs) {
    this.canvasRef = canvasRef;
    this.gameRefs = gameRefs;

    this.initThreeCore();
    this.setupResizeListener();
    this.handleResize(); // Call once for initial sizing
  }

  private initThreeCore(): void {
    if (!this.canvasRef) return;

    this.gameRefs.scene = new THREE.Scene();
    this.gameRefs.camera = new THREE.PerspectiveCamera(
      75,
      this.canvasRef.clientWidth / this.canvasRef.clientHeight,
      0.1,
      1000
    );
    this.gameRefs.camera.rotation.order = "YXZ"; // Crucial for FPS controls

    this.gameRefs.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.gameRefs.renderer.setPixelRatio(window.devicePixelRatio);
    this.gameRefs.renderer.setSize(this.canvasRef.clientWidth, this.canvasRef.clientHeight);
    this.gameRefs.renderer.shadowMap.enabled = true;

    this.gameRefs.raycaster = new THREE.Raycaster();
    this.gameRefs.textureLoader = new THREE.TextureLoader();

    this.canvasRef.appendChild(this.gameRefs.renderer.domElement);
  }

  private handleResize = (): void => {
    if (this.gameRefs.camera && this.gameRefs.renderer && this.canvasRef) {
      this.gameRefs.camera.aspect = this.canvasRef.clientWidth / this.canvasRef.clientHeight;
      this.gameRefs.camera.updateProjectionMatrix();
      this.gameRefs.renderer.setSize(this.canvasRef.clientWidth, this.canvasRef.clientHeight);
    }
  };

  public setupResizeListener(): void {
    window.addEventListener('resize', this.handleResize);
  }

  public removeResizeListener(): void {
    window.removeEventListener('resize', this.handleResize);
  }

  public render(): void {
    if (this.gameRefs.renderer && this.gameRefs.scene && this.gameRefs.camera) {
      this.gameRefs.renderer.render(this.gameRefs.scene, this.gameRefs.camera);
    }
  }

  public dispose(): void {
    this.removeResizeListener();
    if (this.gameRefs.renderer) {
      this.gameRefs.renderer.dispose();
      if (this.canvasRef && this.gameRefs.renderer.domElement) {
        if (this.canvasRef.contains(this.gameRefs.renderer.domElement)) {
            this.canvasRef.removeChild(this.gameRefs.renderer.domElement);
        }
      }
    }
  }
}
