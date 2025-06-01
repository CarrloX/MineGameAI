
import * as THREE from 'three';
import type { GameRefs } from './types';

export class RendererManager {
  private canvasRef: HTMLDivElement;
  private gameRefs: GameRefs;

  constructor(canvasRef: HTMLDivElement, gameRefs: GameRefs) {
    this.canvasRef = canvasRef;
    this.gameRefs = gameRefs;

    // Assume scene, camera, renderer are initialized by ThreeSetup and available in gameRefs
    if (!this.gameRefs.scene || !this.gameRefs.camera || !this.gameRefs.renderer) {
        console.error("RendererManager: Core Three.js objects not found in gameRefs. Ensure ThreeSetup runs first.");
        return;
    }
    
    this.setupResizeListener();
    // Initial size is set by ThreeSetup, handleResize will be called by listener if window changes
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
      // The DOM element is appended by ThreeSetup, so it should ideally be removed there if ThreeSetup had a dispose
      // Or, BlockifyGame can handle removing it since it owns the canvasRef
      if (this.canvasRef && this.gameRefs.renderer.domElement) {
        if (this.canvasRef.contains(this.gameRefs.renderer.domElement)) {
            // This removal might be better placed in BlockifyGame's cleanup or a hypothetical ThreeSetup.dispose()
            // For now, let's keep it here to ensure the canvas is cleaned.
           // this.canvasRef.removeChild(this.gameRefs.renderer.domElement);
        }
      }
    }
  }
}
