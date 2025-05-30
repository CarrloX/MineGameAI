
import * as THREE from 'three';
import type { Block } from './Block';
import { randomInt } from './utils';
import type { GameRefs } from './types';

export class World {
  public size: number;
  public layers: number;
  public skyHeight: number;
  public voidHeight: number;
  public skyColor: number;
  public lightColor: number;
  public gravity: number;
  public lighting: { ambient: THREE.AmbientLight; directional: THREE.DirectionalLight };
  private gameRefs: GameRefs;

  constructor(gameRefs: GameRefs) {
    this.gameRefs = gameRefs;
    this.size = 12;
    this.layers = 2; // Ground layer + 1 underground layer
    this.skyHeight = 64;
    this.voidHeight = 64;
    this.skyColor = 0xf1f1f1; // Light gray
    this.lightColor = 0xffffff;
    this.gravity = 0.004; // Adjusted gravity for a longer jump feel
    
    const scene = this.gameRefs.scene!;

    this.lighting = {
      ambient: new THREE.AmbientLight(this.lightColor, 0.75),
      directional: new THREE.DirectionalLight(this.lightColor, 0.5),
    };

    this.lighting.ambient.name = "Ambient Light";
    scene.add(this.lighting.ambient);

    const sizeHalf = this.size / 2;
    this.lighting.directional.name = "Directional Light";
    this.lighting.directional.position.set(0, this.skyHeight, 0);
    this.lighting.directional.castShadow = true;
    this.lighting.directional.shadow.camera = new THREE.OrthographicCamera(
      -sizeHalf - 1, sizeHalf + 1, sizeHalf + 1, -sizeHalf, 0.5, 2e4
    );
    this.lighting.directional.shadow.mapSize = new THREE.Vector2(1024, 1024);
    scene.add(this.lighting.directional);

    this.generate();
  }

  addBlock(x: number, y: number, z: number, block: Block, rad: number = 0): void {
    const scene = this.gameRefs.scene!;
    const newBlock = block.mesh.clone();
    const deg = rad * 180 / Math.PI;
    let rotY = block.multiTexture ? Math.round(deg / 90) * 90 : 0;

    if (rotY >= 360 || rotY <= -360) rotY %= 360;
    if (rotY === 270) rotY = -90;
    else if (rotY === -270) rotY = 90;

    newBlock.position.set(x, y, z);
    newBlock.rotation.y = rotY * Math.PI / 180;
    scene.add(newBlock);
  }

  private generate(): void {
    const blocks = this.gameRefs.blocks!;
    if (!blocks || blocks.length === 0) {
        console.error("No blocks defined for world generation.");
        return;
    }
    const sizeStart = !(this.size % 2) ? -this.size / 2 : Math.round(-this.size / 2);
    const sizeHalf = this.size / 2;

    for (let z = sizeStart; z < sizeHalf; ++z) {
      for (let y = 0; y < this.layers; ++y) {
        for (let x = sizeStart; x < sizeHalf; ++x) {
          if (y === this.layers - 1) { // Ground level (top layer)
            // Use grass block if available, otherwise default to blocks[0]
            const grassBlock = blocks.find(b => b.mesh.name.includes('Grass_Block')) || blocks[0];
            this.addBlock(x, y, z, grassBlock);
          } else { // Underground layers
            // Exclude grass from underground if possible, or use a sensible default
            const undergroundBlocks = blocks.filter(b => !b.mesh.name.includes('Grass_Block'));
            const blockToUse = undergroundBlocks.length > 0 ? undergroundBlocks[randomInt(0, undergroundBlocks.length - 1)] : blocks[randomInt(0, blocks.length - 1)];
            this.addBlock(x, y, z, blockToUse);
          }
        }
      }
    }
  }
}
