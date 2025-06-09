import { useEffect } from 'react';
import * as THREE from 'three';
import { GameRefs } from '@/lib/three-game/types';
import { CHUNK_SIZE } from '@/constants/game';

interface UseFogProps {
  gameRefs: React.MutableRefObject<GameRefs>;
  isCameraSubmerged: boolean;
}

export const useFog = ({ gameRefs, isCameraSubmerged }: UseFogProps) => {
  useEffect(() => {
    const refs = gameRefs.current;
    const { renderer, scene, world, sky } = refs;
    
    if (!renderer || !scene || !world || !sky?.getSkyColorProvider()) return;

    const skyColorProvider = sky.getSkyColorProvider();

    const updateFog = () => {
      if (isCameraSubmerged) {
        // Niebla azul oscura para el agua - más sutil
        renderer.setClearColor(new THREE.Color(0x3a5f83));
        scene.fog = new THREE.Fog(0x3a5f83, 4, CHUNK_SIZE * 1.2);
      } else {
        // Niebla basada en el color del cielo - más suave y gradual como Minecraft
        const skyFogColor = skyColorProvider.getFogColor();
        renderer.setClearColor(skyColorProvider.getSkyColor());

        // Ajustamos las distancias para que sea más sutil como en Minecraft
        const fogNearDistance = world.renderDistanceInChunks * CHUNK_SIZE * 0.7;  // Comienza más lejos
        const fogFarDistance = world.renderDistanceInChunks * CHUNK_SIZE * 1.2;   // Termina más lejos

        scene.fog = new THREE.Fog(skyFogColor, fogNearDistance, fogFarDistance);
      }
    };

    // Inicializar con una niebla suave
    scene.fog = new THREE.Fog(0xffffff, 0, 1);
    updateFog();

    // Actualizar la niebla
    const fogUpdateInterval = setInterval(() => {
      if (world && world.renderDistanceInChunks !== undefined) {
        updateFog();
      }
    }, 1000);

    return () => {
      clearInterval(fogUpdateInterval);
      scene.fog = null;
    };
  }, [isCameraSubmerged, gameRefs.current.world?.renderDistanceInChunks]);
}; 