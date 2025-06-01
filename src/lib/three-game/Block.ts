
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
    const blockProtoGeo = new THREE.BoxGeometry(1, 1, 1);
    let blockMat: THREE.Material | THREE.Material[];
    const blockColor = 0xffffff;

    this.multiTexture = multiTexture;

    let materialOptions: THREE.MeshLambertMaterialParameters = {
      color: blockColor,
    };

    if (nameKey === 'waterBlock') {
      materialOptions.transparent = true;
      materialOptions.opacity = 0.7;
      materialOptions.depthWrite = false; // Key change for water rendering
    }

    if (this.multiTexture && Array.isArray(blockDefinition)) {
      blockMat = [];
      const textureHint = getTextureHint(this.nameKey);
      for (const path of blockDefinition) {
        const texture = textureLoader.load(path);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        
        const faceMaterialOptions = { ...materialOptions };
        faceMaterialOptions.map = texture;
        const sprite = new THREE.MeshLambertMaterial(faceMaterialOptions);

        sprite.map!.wrapS = THREE.RepeatWrapping;
        sprite.map!.wrapT = THREE.RepeatWrapping;
        sprite.map!.repeat.set(1, 1);
        (sprite as any)['data-ai-hint'] = textureHint;
        blockMat.push(sprite);
      }
    } else if (!this.multiTexture && typeof blockDefinition === 'object' && 'side' in blockDefinition) {
      const texture = textureLoader.load(blockDefinition.side);
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      
      const singleMaterialOptions = { ...materialOptions };
      singleMaterialOptions.map = texture;
      const sprite = new THREE.MeshLambertMaterial(singleMaterialOptions);
      
      sprite.map!.wrapS = THREE.RepeatWrapping;
      sprite.map!.wrapT = THREE.RepeatWrapping;
      sprite.map!.repeat.set(1, 1);
      (sprite as any)['data-ai-hint'] = getTextureHint(this.nameKey);
      blockMat = sprite;
    } else {
      console.warn("Invalid block definition for:", nameKey, blockDefinition);
      blockMat = new THREE.MeshLambertMaterial({ color: 0xcccccc });
    }

    this.mesh = new THREE.Mesh(blockProtoGeo, blockMat);
    if (Array.isArray(this.mesh.material)) {
        this.mesh.material.forEach(m => m.needsUpdate = true);
    } else {
        this.mesh.material.needsUpdate = true;
    }
    this.mesh.castShadow = nameKey !== 'waterBlock'; // Water shouldn't cast shadows
    this.mesh.receiveShadow = true;
    this.mesh.name = `Block_${nameKey}`;
  }
}

