export interface GameSettings {
  audio: {
    masterVolume: number;
    musicVolume: number;
    effectsVolume: number;
    mute: boolean;
  };
  graphics: {
    resolution: [number, number];
    fullscreen: boolean;
    shadows: boolean;
    antiAliasing: boolean;
    renderDistance: number;
  };
  controls: {
    sensitivity: number;
    invertY: boolean;
    keybindings: Record<string, string>;
  };
}

export class SettingsService {
  private static instance: SettingsService;
  private settings: GameSettings;
  private readonly STORAGE_KEY = 'game_settings';

  private constructor() {
    this.settings = this.loadSettings();
  }

  public static getInstance(): SettingsService {
    if (!SettingsService.instance) {
      SettingsService.instance = new SettingsService();
    }
    return SettingsService.instance;
  }

  private getDefaultSettings(): GameSettings {
    return {
      audio: {
        masterVolume: 0.8,
        musicVolume: 0.7,
        effectsVolume: 0.9,
        mute: false,
      },
      graphics: {
        resolution: [1920, 1080] as [number, number],
        fullscreen: false,
        shadows: true,
        antiAliasing: true,
        renderDistance: 8,
      },
      controls: {
        sensitivity: 0.5,
        invertY: false,
        keybindings: {
          moveForward: 'KeyW',
          moveBackward: 'KeyS',
          moveLeft: 'KeyA',
          moveRight: 'KeyD',
          jump: 'Space',
          crouch: 'ShiftLeft',
          sprint: 'ControlLeft',
          interact: 'KeyE',
          inventory: 'KeyI',
        },
      },
    };
  }

  private loadSettings(): GameSettings {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        return { ...this.getDefaultSettings(), ...JSON.parse(saved) };
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
    return this.getDefaultSettings();
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.settings));
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  }

  public getSettings(): GameSettings {
    return JSON.parse(JSON.stringify(this.settings));
  }

  public updateSettings(updates: Partial<GameSettings>): void {
    this.settings = { ...this.settings, ...updates };
    this.saveSettings();
  }

  public resetToDefaults(): void {
    this.settings = this.getDefaultSettings();
    this.saveSettings();
  }

  // Audio settings helpers
  public setMasterVolume(volume: number): void {
    this.settings.audio.masterVolume = Math.max(0, Math.min(1, volume));
    this.saveSettings();
  }

  // Graphics settings helpers
  public setResolution(width: number, height: number): void {
    this.settings.graphics.resolution = [width, height];
    this.saveSettings();
  }

  public setFullscreen(fullscreen: boolean): void {
    this.settings.graphics.fullscreen = fullscreen;
    this.saveSettings();
  }

  // Controls helpers
  public setKeyBinding(action: string, key: string): void {
    if (this.settings.controls.keybindings[action] !== undefined) {
      this.settings.controls.keybindings[action] = key;
      this.saveSettings();
    }
  }

  public getKeyForAction(action: string): string | undefined {
    return this.settings.controls.keybindings[action];
  }
}
