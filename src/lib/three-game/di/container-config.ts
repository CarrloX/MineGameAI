import { Container } from './Container';
import { EventBus } from '../events/EventBus';

/**
 * Configura el contenedor de inyección de dependencias con los servicios principales.
 * Debe llamarse al inicio de la aplicación.
 */
export function configureContainer() {
  const container = Container.getInstance();

  // Registrar el EventBus como un singleton
  container.registerSingleton('eventBus', () => EventBus.getInstance());

  // Aquí puedes registrar otros servicios singleton según sea necesario
  // Ejemplo:
  // container.registerSingleton('gameState', () => GameState.getInstance());
  // container.register('worldService', WorldService);

  return container;
}

/**
 * Función de ayuda para obtener el EventBus del contenedor
 */
export function getEventBus() {
  const container = Container.getInstance();
  return container.resolve<EventBus>('eventBus');
}

// Tipos de eventos comunes para facilitar el autocompletado
export const GameEvents = {
  PLAYER_MOVE: 'player:move',
  BLOCK_INTERACTION: 'block:interaction',
  CHUNK_LOADED: 'chunk:loaded',
  CHUNK_UNLOADED: 'chunk:unloaded',
  GAME_STATE_CHANGED: 'game:state:changed',
} as const;
