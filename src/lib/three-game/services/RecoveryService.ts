import { gameLogger } from './LoggingService';

interface RecoveryState {
  lastStableState: any;
  crashCount: number;
  lastCrashTime: number;
  isRecovering: boolean;
}

// Extender la interfaz Window para incluir propiedades personalizadas
declare global {
  interface Window {
    gc?: () => void;
    THREE?: {
      Cache: {
        clear: () => void;
      };
    };
  }
  interface Performance {
    memory?: {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    };
  }
}

class RecoveryService {
  private static instance: RecoveryService | null = null;
  private state: RecoveryState = {
    lastStableState: null,
    crashCount: 0,
    lastCrashTime: 0,
    isRecovering: false
  };

  private readonly MAX_CRASHES_PER_MINUTE = 3;
  private readonly CRASH_WINDOW_MS = 60000; // 1 minuto
  private readonly RECOVERY_COOLDOWN_MS = 5000; // 5 segundos
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): RecoveryService {
    if (!RecoveryService.instance) {
      RecoveryService.instance = new RecoveryService();
    }
    return RecoveryService.instance;
  }

  public initialize() {
    if (this.isInitialized || typeof window === 'undefined') return;
    
    this.setupCrashHandlers();
    this.isInitialized = true;
    gameLogger.logGameEvent('Servicio de recuperación inicializado');
  }

  private setupCrashHandlers() {
    if (typeof window === 'undefined') return;

    // Prevenir cierre inesperado
    window.addEventListener('beforeunload', (e) => {
      if (this.state.isRecovering) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    });

    // Capturar errores no manejados
    window.addEventListener('error', (event) => {
      this.handleCrash('error', event.error);
      return false; // Prevenir propagación
    });

    // Capturar promesas rechazadas no manejadas
    window.addEventListener('unhandledrejection', (event) => {
      this.handleCrash('promise', event.reason);
      return false;
    });

    // Capturar errores de recursos
    window.addEventListener('unhandledrejection', (event) => {
      if (event.reason instanceof ErrorEvent) {
        this.handleCrash('resource', event.reason);
      }
      return false;
    });
  }

  public handleCrash(type: string, error: any) {
    const now = Date.now();
    
    // Limpiar crashes antiguos
    if (now - this.state.lastCrashTime > this.CRASH_WINDOW_MS) {
      this.state.crashCount = 0;
    }

    this.state.crashCount++;
    this.state.lastCrashTime = now;

    // Registrar el crash
    gameLogger.logError(
      new Error(`Crash detectado (${type}): ${error?.message || 'Error desconocido'}`),
      'Game Crash'
    );

    // Verificar si debemos intentar recuperación
    if (this.state.crashCount <= this.MAX_CRASHES_PER_MINUTE) {
      this.attemptRecovery();
    } else {
      gameLogger.logError(
        new Error('Demasiados crashes en poco tiempo, forzando reinicio seguro'),
        'Critical Crash'
      );
      this.forceSafeRestart();
    }
  }

  private attemptRecovery() {
    if (this.state.isRecovering) return;

    this.state.isRecovering = true;
    gameLogger.logGameEvent('Iniciando proceso de recuperación');

    try {
      // Guardar estado actual
      this.saveCurrentState();

      // Limpiar recursos problemáticos
      this.cleanupResources();

      // Emitir evento de recuperación
      window.dispatchEvent(new CustomEvent('gameRecoveryAttempt', {
        detail: { timestamp: Date.now() }
      }));

      // Programar fin de recuperación
      setTimeout(() => {
        this.state.isRecovering = false;
        gameLogger.logGameEvent('Proceso de recuperación completado');
      }, this.RECOVERY_COOLDOWN_MS);

    } catch (recoveryError) {
      gameLogger.logError(
        new Error(`Error durante la recuperación: ${recoveryError}`),
        'Recovery Failed'
      );
      this.forceSafeRestart();
    }
  }

  private saveCurrentState() {
    try {
      // Guardar estado mínimo necesario para recuperación
      this.state.lastStableState = {
        timestamp: Date.now(),
        // Agregar aquí cualquier estado crítico que necesitemos preservar
      };
      gameLogger.logGameState('Estado guardado para recuperación');
    } catch (error) {
      gameLogger.logError(
        new Error('Error al guardar estado para recuperación'),
        'State Save Failed'
      );
    }
  }

  private cleanupResources() {
    try {
      // Limpiar recursos que podrían causar problemas
      if (window.performance && window.performance.memory) {
        // Forzar recolección de basura si es posible
        if (window.gc) {
          window.gc();
        }
      }

      // Limpiar caché de texturas si existe
      if (window.THREE?.Cache) {
        window.THREE.Cache.clear();
      }

      gameLogger.logGameEvent('Recursos limpiados durante recuperación');
    } catch (error) {
      gameLogger.logError(
        new Error('Error al limpiar recursos'),
        'Cleanup Failed'
      );
    }
  }

  private forceSafeRestart() {
    gameLogger.logGameEvent('Iniciando reinicio seguro');
    
    // Guardar logs antes del reinicio
    this.saveLogsBeforeRestart();

    // Programar reinicio después de un breve delay
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  }

  private async saveLogsBeforeRestart() {
    try {
      // Obtener logs directamente del logger
      const logs = gameLogger.getLogs();
      const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      // Crear enlace de descarga
      const a = document.createElement('a');
      a.href = url;
      a.download = `game-crash-logs-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      gameLogger.logGameEvent('Logs guardados antes del reinicio');
    } catch (error) {
      console.error('Error al guardar logs:', error);
    }
  }

  // Métodos públicos
  public isInRecoveryMode(): boolean {
    return this.state.isRecovering;
  }

  public getCrashCount(): number {
    return this.state.crashCount;
  }

  public resetCrashCount() {
    this.state.crashCount = 0;
    this.state.lastCrashTime = 0;
  }
}

// Exportar una función para obtener la instancia en lugar de la instancia directamente
export const getRecoveryService = () => {
  if (typeof window === 'undefined') {
    return {
      initialize: () => {},
      isInRecoveryMode: () => false,
      getCrashCount: () => 0,
      resetCrashCount: () => {},
      handleCrash: () => {}
    };
  }
  return RecoveryService.getInstance();
}; 