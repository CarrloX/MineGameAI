import React from 'react';
import type { DebugInfoState } from '@/lib/three-game/types';

interface GameDebugOverlayProps {
  debugInfo: DebugInfoState;
  systemStats: {
    memory: null | { usedMB: number; totalMB: number };
  };
}

export const GameDebugOverlay: React.FC<GameDebugOverlayProps> = ({
  debugInfo,
  systemStats
}) => {
  return (
    <div className="fixed top-0 right-0 p-2 text-white text-sm font-mono bg-black/50 z-50">
      <div>FPS: {debugInfo.fps}</div>
      <div>{debugInfo.playerPosition}</div>
      <div>{debugInfo.playerChunk}</div>
      <div>{debugInfo.raycastTarget}</div>
      <div>{debugInfo.highlightStatus}</div>
      <div>Chunks: {debugInfo.visibleChunks}/{debugInfo.totalChunks}</div>
      <div>{debugInfo.isFlying}</div>
      <div>{debugInfo.isRunning}</div>
      <div>{debugInfo.isBoosting}</div>
      <div>{debugInfo.lookDirection}</div>
      {systemStats.memory && (
        <div>
          Memoria: {Math.round(systemStats.memory.usedMB)}MB /{' '}
          {Math.round(systemStats.memory.totalMB)}MB
        </div>
      )}
    </div>
  );
}; 