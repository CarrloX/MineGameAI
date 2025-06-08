import * as THREE from 'three';
import { Player } from './Player';
import type { GameRefs } from './types';

export class PlayerRespawnService {
  static respawnPlayer(refs: GameRefs) {
    if (!refs.world || !refs.player || !refs.camera || !refs.scene || !refs.raycaster) {
      console.error("PlayerRespawnService: Required refs not available for respawn.");
      return;
    }

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

    const currentPitch = refs.player.getPitch();
    const currentYaw = refs.player.getYaw();

    refs.player = new Player(
      refs.player.getName(),
      refs.world,
      refs.camera,
      refs.scene,
      refs.raycaster,
      respawnX,
      safeRespawnY,
      respawnZ,
      true,
      refs.player.getAudioManager()
    );

    if (refs.inputController) {
      refs.inputController.setPlayer(refs.player);
    }

    refs.player.setPitch(currentPitch);
    refs.player.setYaw(currentYaw);
    refs.player.lookAround();
  }
}
