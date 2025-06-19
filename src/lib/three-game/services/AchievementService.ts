interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  hidden: boolean;
  unlockCondition: () => boolean;
  unlockDate?: Date;
}

export class AchievementService {
  private static instance: AchievementService;
  private achievements: Achievement[] = [];
  private eventBus: any;

  private constructor() {
    this.initializeAchievements();
  }

  public static getInstance(): AchievementService {
    if (!AchievementService.instance) {
      AchievementService.instance = new AchievementService();
    }
    return AchievementService.instance;
  }

  public setEventBus(eventBus: any): void {
    this.eventBus = eventBus;
  }

  private initializeAchievements(): void {
    this.achievements = [
      {
        id: 'first_steps',
        name: 'First Steps',
        description: 'Take your first steps in the game',
        icon: '👣',
        unlocked: false,
        hidden: false,
        unlockCondition: () => false, // Se actualizará dinámicamente
      },
      {
        id: 'miner',
        name: 'Miner',
        description: 'Mine your first block',
        icon: '⛏️',
        unlocked: false,
        hidden: false,
        unlockCondition: () => false, // Se actualizará dinámicamente
      },
      {
        id: 'explorer',
        name: 'Explorer',
        description: 'Visit 10 different chunks',
        icon: '🗺️',
        unlocked: false,
        hidden: false,
        unlockCondition: () => false, // Se actualizará dinámicamente
      },
      // Más logros...
    ];


    // Cargar logros desbloqueados del almacenamiento local
    this.loadAchievements();
  }

  private loadAchievements(): void {
    try {
      const saved = localStorage.getItem('game_achievements');
      if (saved) {
        const savedAchievements = JSON.parse(saved);
        this.achievements = this.achievements.map(ach => {
          const savedAch = savedAchievements.find((a: any) => a.id === ach.id);
          if (savedAch?.unlocked) {
            return { ...ach, unlocked: true, unlockDate: new Date(savedAch.unlockDate) };
          }
          return ach;
        });
      }
    } catch (error) {
      console.error('Error loading achievements:', error);
    }
  }

  private saveAchievements(): void {
    try {
      const achievementsToSave = this.achievements
        .filter(ach => ach.unlocked)
        .map(({ id, unlocked, unlockDate }) => ({ id, unlocked, unlockDate }));
      
      localStorage.setItem('game_achievements', JSON.stringify(achievementsToSave));
    } catch (error) {
      console.error('Error saving achievements:', error);
    }
  }

  public unlockAchievement(achievementId: string): boolean {
    const achievement = this.achievements.find(a => a.id === achievementId);
    
    if (achievement && !achievement.unlocked) {
      achievement.unlocked = true;
      achievement.unlockDate = new Date();
      this.saveAchievements();
      
      if (this.eventBus) {
        this.eventBus.emit('achievement:unlocked', {
          id: achievement.id,
          name: achievement.name,
          description: achievement.description,
          icon: achievement.icon,
          unlockDate: achievement.unlockDate,
        });
      }
      
      return true;
    }
    
    return false;
  }

  public getUnlockedAchievements(): Achievement[] {
    return this.achievements.filter(a => a.unlocked);
  }

  public getLockedAchievements(): Achievement[] {
    return this.achievements.filter(a => !a.unlocked && !a.hidden);
  }

  public getAllAchievements(): Achievement[] {
    return [...this.achievements];
  }

  public resetAchievements(): void {
    this.achievements.forEach(ach => {
      ach.unlocked = false;
      delete ach.unlockDate;
    });
    this.saveAchievements();
  }

  // Método para actualizar el estado de los logros basado en eventos del juego
  public updateAchievements(gameState: any): void {
    this.achievements.forEach(achievement => {
      if (!achievement.unlocked && achievement.unlockCondition()) {
        this.unlockAchievement(achievement.id);
      }
    });
  }
}
