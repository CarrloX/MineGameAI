export interface GameState {
  isPaused: boolean;
  isGameOver: boolean;
  score: number;
  level: number;
  playerHealth: number;
  playerMaxHealth: number;
  inventory: string[];
}

export class GameStateService {
  private static instance: GameStateService;
  private state: GameState;
  private eventBus: any; // Usaremos any temporalmente para evitar dependencias circulares

  private constructor() {
    this.state = {
      isPaused: false,
      isGameOver: false,
      score: 0,
      level: 1,
      playerHealth: 100,
      playerMaxHealth: 100,
      inventory: [],
    };
  }

  public static getInstance(): GameStateService {
    if (!GameStateService.instance) {
      GameStateService.instance = new GameStateService();
    }
    return GameStateService.instance;
  }

  public setEventBus(eventBus: any): void {
    this.eventBus = eventBus;
  }

  public getState(): GameState {
    return { ...this.state };
  }

  public pauseGame(): void {
    this.state.isPaused = true;
    this.eventBus?.emit('game:paused', { isPaused: true });
  }

  public resumeGame(): void {
    this.state.isPaused = false;
    this.eventBus?.emit('game:resumed', { isPaused: false });
  }

  public addScore(points: number): void {
    this.state.score += points;
    this.eventBus?.emit('score:updated', { score: this.state.score });
  }

  public updateHealth(health: number): void {
    this.state.playerHealth = Math.max(0, Math.min(health, this.state.playerMaxHealth));
    this.eventBus?.emit('health:updated', { 
      health: this.state.playerHealth,
      maxHealth: this.state.playerMaxHealth 
    });

    if (this.state.playerHealth <= 0) {
      this.gameOver();
    }
  }

  public addToInventory(item: string): void {
    this.state.inventory.push(item);
    this.eventBus?.emit('inventory:updated', { inventory: [...this.state.inventory] });
  }

  public removeFromInventory(item: string): void {
    const index = this.state.inventory.indexOf(item);
    if (index > -1) {
      this.state.inventory.splice(index, 1);
      this.eventBus?.emit('inventory:updated', { inventory: [...this.state.inventory] });
    }
  }

  public nextLevel(): void {
    this.state.level++;
    this.eventBus?.emit('level:changed', { level: this.state.level });
  }

  public resetGame(): void {
    this.state = {
      isPaused: false,
      isGameOver: false,
      score: 0,
      level: 1,
      playerHealth: 100,
      playerMaxHealth: 100,
      inventory: [],
    };
    this.eventBus?.emit('game:reset');
  }

  private gameOver(): void {
    this.state.isGameOver = true;
    this.eventBus?.emit('game:over', { score: this.state.score, level: this.state.level });
  }
}
