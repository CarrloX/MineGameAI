import * as THREE from "three";
import { Player } from "../Player";
import type { GameRefs } from "../types";
import { CHUNK_SIZE } from "@/constants/game";

export class PlayerRespawnService {
  static respawnPlayer(refs: GameRefs) {
    console.log("Iniciando respawn del jugador");
    if (
      !refs.world ||
      !refs.player ||
      !refs.camera ||
      !refs.controls
    ) {
      console.error("Referencias faltantes para el respawn");
      return;
    }

    // Obtener la posición de spawn segura
    const spawnPosition = this.findSafeSpawnPosition(refs);
    
    // Reposicionar al jugador
    refs.player.position.copy(spawnPosition);
    refs.player.velocity.set(0, 0, 0);
    refs.player.onGround = false;
    
    // Reposicionar la cámara
    refs.camera.position.copy(
      new THREE.Vector3().addVectors(
        spawnPosition,
        new THREE.Vector3(0, refs.player.height, 0)
      )
    );
    
    // Actualizar controles
    refs.controls.target.copy(spawnPosition);
    refs.controls.object.position.copy(refs.camera.position);
    
    console.log("Respawn completado en posición:", spawnPosition);
  }

  private static findSafeSpawnPosition(refs: GameRefs): THREE.Vector3 {
    // Intentar encontrar una posición segura en el mundo
    const world = refs.world!;
    const worldSize = world.size;
    
    // Intentar con la posición de spawn por defecto primero
    const defaultSpawn = new THREE.Vector3(0, worldSize * CHUNK_SIZE, 0);
    const safePosition = this.findNearestSafeSpot(world, defaultSpawn);
    
    if (safePosition) {
      return safePosition;
    }
    
    // Si no se encuentra una posición segura cerca del spawn, buscar en el mundo
    console.warn("No se encontró posición segura cerca del spawn, buscando en el mundo...");
    
    for (let y = worldSize - 1; y >= 0; y--) {
      for (let x = 0; x < worldSize; x++) {
        for (let z = 0; z < worldSize; z++) {
          const testPos = new THREE.Vector3(
            x * CHUNK_SIZE + CHUNK_SIZE / 2,
            y * CHUNK_SIZE + 2,
            z * CHUNK_SIZE + CHUNK_SIZE / 2
          );
          
          const safeSpot = this.findNearestSafeSpot(world, testPos);
          if (safeSpot) {
            console.log("Posición segura encontrada en:", safeSpot);
            return safeSpot;
          }
        }
      }
    }
    
    // Si todo falla, devolver una posición por defecto
    console.error("No se pudo encontrar una posición segura, usando posición por defecto");
    return new THREE.Vector3(0, worldSize * CHUNK_SIZE + 2, 0);
  }

  private static findNearestSafeSpot(
    world: any,
    position: THREE.Vector3
  ): THREE.Vector3 | null {
    const maxAttempts = 10;
    // Using the imported CHUNK_SIZE constant
    
    for (let i = 0; i < maxAttempts; i++) {
      // Buscar hacia arriba desde la posición actual
      for (let y = position.y; y < position.y + 20; y++) {
        const testPos = new THREE.Vector3(position.x, y, position.z);
        const blockBelow = new THREE.Vector3(testPos.x, testPos.y - 1, testPos.z);
        
        const isAir = !world.getBlock(testPos);
        const isSolidBelow = world.getBlock(blockBelow);
        
        if (isAir && isSolidBelow) {
          return testPos;
        }
      }
      
      // Si no se encuentra en esta posición, intentar en una posición aleatoria cercana
      position.x += (Math.random() - 0.5) * CHUNK_SIZE * 2;
      position.z += (Math.random() - 0.5) * CHUNK_SIZE * 2;
      position.y = Math.min(position.y, world.size * CHUNK_SIZE);
    }
    
    return null;
  }
}
