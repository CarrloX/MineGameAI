
import * as THREE from 'three';
import type { TextureLoader } from 'three';
import type { BlockDefinition } from './types';
import { getTextureHint } from './utils';


export class Block {
  public mesh: THREE.Mesh;
  public multiTexture: boolean;
  private nameKey: string; // Store the original key like "blueberryIMac" for hints

  constructor(nameKey: string, blockDefinition: BlockDefinition, textureLoader: THREE.TextureLoader, multiTexture: boolean = false) {
    this.nameKey = nameKey;
    const blockProtoGeo = new THREE.BoxGeometry(1, 1, 1); // Changed from BoxBufferGeometry
    let blockMat: THREE.Material | THREE.Material[];
    const blockColor = 0xffffff;

    this.multiTexture = multiTexture;

    if (this.multiTexture && Array.isArray(blockDefinition)) {
      blockMat = [];
      const textureHint = getTextureHint(this.nameKey);
      for (const path of blockDefinition) {
        const texture = textureLoader.load(path);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestMipMapNearestFilter;
        const sprite = new THREE.MeshLambertMaterial({
          color: blockColor,
          map: texture,
        });
        sprite.map!.wrapS = THREE.RepeatWrapping;
        sprite.map!.wrapT = THREE.RepeatWrapping;
        sprite.map!.repeat.set(1, 1);
        (sprite as any)['data-ai-hint'] = textureHint; // For potential image replacement
        blockMat.push(sprite);
      }
    } else if (!this.multiTexture && typeof blockDefinition === 'object' && 'side' in blockDefinition) {
      const texture = textureLoader.load(blockDefinition.side);
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestMipMapNearestFilter;
      const sprite = new THREE.MeshLambertMaterial({
        color: blockColor,
        map: texture,
      });
      sprite.map!.wrapS = THREE.RepeatWrapping;
      sprite.map!.wrapT = THREE.RepeatWrapping;
      sprite.map!.repeat.set(1, 1);
      (sprite as any)['data-ai-hint'] = getTextureHint(this.nameKey);
      blockMat = sprite;
    } else {
      // Fallback material
      console.warn("Invalid block definition for:", nameKey, blockDefinition);
      blockMat = new THREE.MeshLambertMaterial({ color: 0xcccccc });
    }

    this.mesh = new THREE.Mesh(blockProtoGeo, blockMat);
    if (Array.isArray(this.mesh.material)) {
        this.mesh.material.forEach(m => m.needsUpdate = true);
    } else {
        this.mesh.material.needsUpdate = true;
    }
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.name = `Block_${nameKey}`; // Give blocks unique names for debugging
  }
}
