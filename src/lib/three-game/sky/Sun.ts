
import * as THREE from 'three';
import type { ICelestialBody, ICelestialBodyData } from './ICelestialBody';

export class Sun implements ICelestialBody {
  public name: string = 'sun';
  private texture: THREE.Texture | null = null;
  private size: number;
  private orbitalPathRadius: number; // Distance from the center of the world (or camera y=0 plane)
  public light: THREE.DirectionalLight;
  private renderData: ICelestialBodyData;

  constructor(textureLoader: THREE.TextureLoader, scene: THREE.Scene, orbitalPathRadius: number = 400, size: number = 50) {
    this.size = size;
    this.orbitalPathRadius = orbitalPathRadius;

    textureLoader.load('https://placehold.co/128x128/FFFF00/FFFF00.png?text=.', (tex) => {
        this.texture = tex;
        if (this.renderData) this.renderData.texture = this.texture;
    });
    (this.texture as any) = {'data-ai-hint': 'sun bright'};


    this.light = new THREE.DirectionalLight(0xffffff, 0.0); // Initial intensity 0, will be set by SkyColorController or main logic
    this.light.name = "SunLight";
    this.light.castShadow = true;
    // Configure shadow properties (needs to be adjusted based on world scale)
    const shadowCamSize = 200; // Example value
    this.light.shadow.camera.left = -shadowCamSize;
    this.light.shadow.camera.right = shadowCamSize;
    this.light.shadow.camera.top = shadowCamSize;
    this.light.shadow.camera.bottom = -shadowCamSize;
    this.light.shadow.camera.near = 0.5;
    this.light.shadow.camera.far = orbitalPathRadius * 2.5;
    this.light.shadow.mapSize.width = 2048; // Or 4096 for higher quality
    this.light.shadow.mapSize.height = 2048;
    this.light.shadow.bias = -0.001; // Adjust to prevent shadow acne

    scene.add(this.light);
    scene.add(this.light.target); // Target needs to be in the scene

    this.renderData = {
      position: new THREE.Vector3(),
      texture: this.texture,
      size: this.size,
      color: new THREE.Color(0xffffee),
      intensity: 1.0,
      isVisible: false,
    };
  }

  update(timeNormalized: number, cameraPosition: THREE.Vector3): void {
    // Calculate sun's angle based on time (0.0 at sunrise, 0.25 at noon, 0.5 at sunset)
    // Sun is visible from time ~0.0 (sunrise) to ~0.5 (sunset) in its own cycle if day is half the total cycle
    // If total cycle is 0 to 1 (midnight to midnight):
    // Sunrise at ~0.25, Noon at ~0.5, Sunset at ~0.75
    const dayPortion = 0.5; // Sun is up for half the cycle
    const sunAngle = (timeNormalized - 0.25) * Math.PI / dayPortion; // Angle from -PI/2 (sunrise) to PI/2 (sunset)

    this.renderData.isVisible = timeNormalized >= 0.25 && timeNormalized <= 0.75;

    if (this.renderData.isVisible) {
      // Position for a typical east-to-west sun path
      this.renderData.position.x = Math.cos(sunAngle) * this.orbitalPathRadius;
      this.renderData.position.y = Math.sin(sunAngle) * this.orbitalPathRadius * 0.7; // Make path less high
      this.renderData.position.z = 0; // Simple east-west path for now, adjust if needed
      
      // Make sun appear to be around the camera
      this.renderData.position.add(cameraPosition);
      this.renderData.position.y = Math.max(cameraPosition.y - this.orbitalPathRadius*0.2 , this.renderData.position.y); // ensure sun is not too low relative to cam

      // Update light position and target
      this.light.position.copy(this.renderData.position);
      this.light.target.position.set(cameraPosition.x, 0, cameraPosition.z); // Light targets origin relative to camera xz
      this.light.target.updateMatrixWorld();


      // Intensity based on height (simple model)
      const noonTime = 0.5;
      const peakIntensity = 1.0;
      const horizonIntensity = 0.3;
      let sunUpDownFactor = Math.sin(sunAngle); // 0 at horizon, 1 at noon, 0 at horizon
      sunUpDownFactor = Math.max(0, sunUpDownFactor);

      this.renderData.intensity = horizonIntensity + (peakIntensity - horizonIntensity) * sunUpDownFactor;
      this.light.intensity = this.renderData.intensity * 0.8; // Light intensity tied to sun's visual intensity
      
      const morningColor = new THREE.Color(0xFFEBCD); // BlanchedAlmond
      const noonColor = new THREE.Color(0xFFFFFF);
      const eveningColor = new THREE.Color(0xFFDAB9); // PeachPuff

      if (timeNormalized < noonTime) { // Morning to Noon
          const t = (timeNormalized - 0.25) / (noonTime - 0.25);
          this.light.color.lerpColors(morningColor, noonColor, t);
      } else { // Noon to Evening
          const t = (timeNormalized - noonTime) / (0.75 - noonTime);
          this.light.color.lerpColors(noonColor, eveningColor, t);
      }


    } else {
      this.renderData.intensity = 0;
      this.light.intensity = 0;
    }
  }

  getRenderData(): ICelestialBodyData {
    return this.renderData;
  }

  dispose(): void {
    this.texture?.dispose();
    // Light is managed by the scene, but if we added it, we should consider removing it or detaching
    this.light.dispose(); // DirectionalLight doesn't have a dispose method that cleans up everything.
                         // Its removal from scene is handled by the main Sky system if needed.
  }
}
