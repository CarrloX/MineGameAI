"use client";

import React, { useEffect } from 'react';
import { logger } from '@/lib/three-game/utils/Logger';

interface ErrorBoundaryDisplayProps {
  title: string;
  message: string;
  onClose: () => void;
  error?: Error;
}

const ErrorBoundaryDisplay: React.FC<ErrorBoundaryDisplayProps> = ({ 
  title, 
  message, 
  onClose,
  error 
}) => {
  useEffect(() => {
    // Registrar el error en el sistema de logs
    logger.error(`Error en el juego: ${title}`, {
      message,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : undefined,
      timestamp: new Date().toISOString()
    });
  }, [title, message, error]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-gray-800 p-6 rounded-lg shadow-xl max-w-2xl w-full mx-4">
        <h2 className="text-red-500 text-2xl font-bold mb-4">{title}</h2>
        <p className="text-gray-300 mb-6 whitespace-pre-wrap">{message}</p>
        <div className="flex justify-end space-x-4">
          <button
            onClick={() => {
              const logs = logger.exportLogs();
              const blob = new Blob([logs], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `game-error-${new Date().toISOString()}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Descargar Logs
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ErrorBoundaryDisplay;
