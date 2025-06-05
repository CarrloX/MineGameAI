import * as THREE from 'three';
import { Player } from './Player';
import type { GameRefs } from './types';

export class PlayerRespawnService {
  static respawnPlayer(refs: GameRefs) {
    const respawnX = 0.5;
    const respawnZ = 0.5;
    refs.world.updateChunks(new THREE.Vector3(respawnX, refs.player.y, respawnZ));
    while(refs.world.getRemeshQueueSize() > 0) {
      refs.world.processRemeshQueue(refs.world.getRemeshQueueSize());
    }
    let safeRespawnY = refs.world.getSpawnHeight(respawnX, respawnZ);
    let attempts = 0;
    const maxAttempts = 15;
    while(attempts < maxAttempts) {
      const blockAtFeet = refs.world.getBlock(Math.floor(respawnX), Math.floor(safeRespawnY), Math.floor(respawnZ));
      const blockAtHead = refs.world.getBlock(Math.floor(respawnX), Math.floor(safeRespawnY + 1), Math.floor(respawnZ));
      if (blockAtFeet === 'air' && blockAtHead === 'air') {
        break;
      }
      safeRespawnY++;
      attempts++;
      if (safeRespawnY >= refs.world.layers - 2) {
        console.warn("Respawn safety check reached near world top. Defaulting Y.");
        safeRespawnY = Math.floor(refs.world.layers / 2);
        break;
      }
    }
    if (attempts >= maxAttempts) {
      console.warn("Could not find a perfectly safe respawn Y after " + maxAttempts + " attempts. Player collision logic should resolve.");
    }
    const currentPitch = refs.camera!.rotation.x;
    const currentYaw = refs.camera!.rotation.y;
    refs.player = new Player(refs.player!['name'], refs, respawnX, safeRespawnY, respawnZ, true);
    if (refs.inputHandler) {
      refs.inputHandler['player'] = refs.player;
    }
    if (refs.camera && refs.player) {
      refs.player.pitch = currentPitch;
      refs.player.yaw = currentYaw;
      refs.player.lookAround();
    }
  }
}
