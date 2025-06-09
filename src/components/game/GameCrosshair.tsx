import React, { memo } from 'react';

interface GameCrosshairProps {
  crosshairBgColor: string;
}

// Usando memo para evitar re-renders innecesarios
const GameCrosshair: React.FC<GameCrosshairProps> = memo(({ crosshairBgColor }) => (
  <div 
    className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none will-change-transform"
  >
    <div className="relative w-5 h-5">
      {/* Línea horizontal */}
      <div
        className="absolute top-1/2 left-0 w-full h-[2px] transform -translate-y-1/2"
        style={{ backgroundColor: crosshairBgColor }}
      />
      {/* Línea vertical */}
      <div
        className="absolute top-0 left-1/2 h-full w-[2px] transform -translate-x-1/2"
        style={{ backgroundColor: crosshairBgColor }}
      />
    </div>
  </div>
));

// Asignar un nombre de display para mejor debugging
GameCrosshair.displayName = 'GameCrosshair';

export { GameCrosshair }; 