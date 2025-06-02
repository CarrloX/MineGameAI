
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
        (this.texture as any)['data-ai-hint'] = 'sun bright';
    });


    this.light = new THREE.DirectionalLight(0xffffff, 0.0); // Initial intensity 0
    this.light.name = "SunDirectionalLight"; // Renamed to be specific
    this.light.castShadow = true;
    
    const shadowCamSize = 200; // Example value, should be tuned
    this.light.shadow.camera.left = -shadowCamSize;
    this.light.shadow.camera.right = shadowCamSize;
    this.light.shadow.camera.top = shadowCamSize;
    this.light.shadow.camera.bottom = -shadowCamSize;
    this.light.shadow.camera.near = 0.5;
    this.light.shadow.camera.far = orbitalPathRadius * 3; // Increased far plane for shadows
    this.light.shadow.mapSize.width = 2048; 
    this.light.shadow.mapSize.height = 2048;
    this.light.shadow.bias = -0.001; 

    scene.add(this.light);
    if (this.light.target && !this.light.target.parent) { // Ensure target is in scene if not already
        scene.add(this.light.target);
    }


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
    // Sun visible roughly from 0.25 (sunrise) to 0.75 (sunset)
    const dayPortionStart = 0.25; // Sunrise
    const dayPortionEnd = 0.75;   // Sunset
    const dayDuration = dayPortionEnd - dayPortionStart;

    this.renderData.isVisible = timeNormalized >= dayPortionStart && timeNormalized <= dayPortionEnd;

    if (this.renderData.isVisible) {
      // Calculate sun's angle from -PI/2 (sunrise) to PI/2 (sunset)
      const sunAngleProgress = (timeNormalized - dayPortionStart) / dayDuration;
      const sunAngle = (sunAngleProgress - 0.5) * Math.PI; // -PI/2 to PI/2

      // Position for a typical east-to-west sun path, rising in east (+X), setting in west (-X)
      this.renderData.position.x = Math.cos(sunAngle) * this.orbitalPathRadius; // Check: cos( PI/2) = 0 (noon), cos(-PI/2)=0(rise/set edge Z based)
                                                                            // Should be sin for X if 0 is east. Or adjust angle.
                                                                            // Let's make angle 0 at noon. Sun rises at -PI/2, sets at PI/2.
      const noonAngle = (timeNormalized - 0.5) * 2 * Math.PI; // Angle where 0 = noon, PI = midnight

      this.renderData.position.x = -Math.sin(noonAngle) * this.orbitalPathRadius; // -sin(0)=0 (noon), -sin(-PI/2)=1 (sunrise, +X), -sin(PI/2)=-1 (sunset, -X)
      this.renderData.position.y = Math.cos(noonAngle) * this.orbitalPathRadius * 0.6; // cos(0)=1 (noon, high), cos(PI/2)=0 (horizon)
      this.renderData.position.z = Math.sin(noonAngle) * Math.cos(noonAngle) * this.orbitalPathRadius * 0.2; // Slight wobble for less linear path

      
      this.renderData.position.add(cameraPosition);
      this.renderData.position.y = Math.max(cameraPosition.y - this.orbitalPathRadius*0.1 , this.renderData.position.y);

      this.light.position.copy(this.renderData.position);
      this.light.target.position.set(cameraPosition.x, Math.max(0, cameraPosition.y - 50), cameraPosition.z); 
      this.light.target.updateMatrixWorld();

      const noonTime = 0.5; // Midday
      const peakVisualIntensity = 1.0;
      const horizonVisualIntensity = 0.3;
      const peakLightIntensity = 0.9; // Max intensity for the directional light
      const horizonLightIntensity = 0.2;

      // Factor based on sun's height in sky (0 at horizon, 1 at noon)
      let sunHeightFactor = Math.cos(noonAngle); // cos(0)=1 (noon), cos(PI/2 or -PI/2)=0 (horizon)
      sunHeightFactor = Math.max(0, sunHeightFactor); // Clamp to positive

      this.renderData.intensity = horizonVisualIntensity + (peakVisualIntensity - horizonVisualIntensity) * sunHeightFactor;
      this.light.intensity = horizonLightIntensity + (peakLightIntensity - horizonLightIntensity) * sunHeightFactor;
      
      const morningColor = new THREE.Color(0xFFEBCD); // BlanchedAlmond for light
      const noonColor = new THREE.Color(0xFFFFFF);
      const eveningColor = new THREE.Color(0xFFDAB9); // PeachPuff for light

      const visualMorningColor = new THREE.Color(0xffccaa);
      const visualNoonColor = new THREE.Color(0xffffee);
      const visualEveningColor = new THREE.Color(0xffaa88);


      if (timeNormalized < noonTime) { // Morning to Noon
          const t = (timeNormalized - dayPortionStart) / (noonTime - dayPortionStart); // t from 0 to 1
          this.light.color.lerpColors(morningColor, noonColor, t);
          this.renderData.color.lerpColors(visualMorningColor, visualNoonColor, t);
      } else { // Noon to Evening
          const t = (timeNormalized - noonTime) / (dayPortionEnd - noonTime); // t from 0 to 1
          this.light.color.lerpColors(noonColor, eveningColor, t);
          this.renderData.color.lerpColors(visualNoonColor, visualEveningColor, t);
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
    // Light is managed by the scene, but if we added it, we should consider removing it
    if(this.light.parent) this.light.parent.remove(this.light);
    if(this.light.target && this.light.target.parent) this.light.target.parent.remove(this.light.target);
    // Note: DirectionalLight itself doesn't have a .dispose() method for GPU resources like materials/geometries
  }
}
