'use client';

import { useEffect } from 'react';
import { getEventBus, GameEvents } from '@/lib/three-game/di/container-config';

interface PlayerEventListenerProps {
  onPlayerMove?: (position: { x: number; y: number; z: number }) => void;
  onBlockInteraction?: (data: { blockType: string; position: { x: number; y: number; z: number } }) => void;
}

export function PlayerEventListener({ onPlayerMove, onBlockInteraction }: PlayerEventListenerProps) {
  useEffect(() => {
    const eventBus = getEventBus();
    
    // Suscribirse a eventos del jugador
    if (onPlayerMove) {
      eventBus.on(GameEvents.PLAYER_MOVE, onPlayerMove);
    }
    
    if (onBlockInteraction) {
      eventBus.on(GameEvents.BLOCK_INTERACTION, onBlockInteraction);
    }

    // Limpieza al desmontar el componente
    return () => {
      if (onPlayerMove) {
        eventBus.off(GameEvents.PLAYER_MOVE, onPlayerMove);
      }
      if (onBlockInteraction) {
        eventBus.off(GameEvents.BLOCK_INTERACTION, onBlockInteraction);
      }
    };
  }, [onPlayerMove, onBlockInteraction]);

  return null; // Este componente no renderiza nada
}
