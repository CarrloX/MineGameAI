import { getEventBus, GameEvents } from '../di/container-config';

export class PlayerController {
  private position = { x: 0, y: 0, z: 0 };
  private eventBus = getEventBus();

  move(deltaX: number, deltaY: number, deltaZ: number) {
    // Actualizar posición
    this.position.x += deltaX;
    this.position.y += deltaY;
    this.position.z += deltaZ;

    // Emitir evento de movimiento
    this.eventBus.emit(GameEvents.PLAYER_MOVE, {
      position: { ...this.position },
      timestamp: Date.now()
    });
  }

  interactWithBlock(blockPosition: {x: number, y: number, z: number}, blockType: string) {
    // Emitir evento de interacción con bloque
    this.eventBus.emit(GameEvents.BLOCK_INTERACTION, {
      position: blockPosition,
      blockType,
      playerPosition: { ...this.position },
      timestamp: Date.now()
    });
  }
}
