import { logger } from '../utils/Logger';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  data?: any;
}

export interface ILoggingService {
  logGameEvent(event: string, data?: any): void;
  logError(error: Error, context: string, data?: any): void;
  logPerformance(metric: string, duration: number): void;
  logGameState(state: string, data?: any): void;
  getLogs(): LogEntry[];
}

export class GameLoggingService implements ILoggingService {
  private static instance: GameLoggingService;
  private logs: LogEntry[] = [];
  private readonly MAX_LOGS = 1000;

  private constructor() {}

  public static getInstance(): GameLoggingService {
    if (!GameLoggingService.instance) {
      GameLoggingService.instance = new GameLoggingService();
    }
    return GameLoggingService.instance;
  }

  private addLog(level: LogLevel, message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      data
    };

    this.logs.push(entry);
    if (this.logs.length > this.MAX_LOGS) {
      this.logs.shift(); // Eliminar el log más antiguo
    }
  }

  public logGameEvent(event: string, data?: any): void {
    this.addLog('info', `[Game Event] ${event}`, data);
    console.log(`[Game Event] ${event}`, data);
  }

  public logError(error: Error, context: string, data?: any): void {
    this.addLog('error', `[${context}] ${error.message}`, {
      ...data,
      stack: error.stack
    });
    console.error(`[${context}] ${error.message}`, error, data);
  }

  public logPerformance(metric: string, duration: number): void {
    this.addLog('debug', `[Performance] ${metric}: ${duration.toFixed(2)}ms`);
    console.debug(`[Performance] ${metric}: ${duration.toFixed(2)}ms`);
  }

  public logGameState(state: string, data?: any): void {
    this.addLog('info', `[Game State] ${state}`, data);
    console.log(`[Game State] ${state}`, data);
  }

  public getLogs(): LogEntry[] {
    return [...this.logs];
  }
}

// Exportar una instancia singleton
export const gameLogger = GameLoggingService.getInstance(); 