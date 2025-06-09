import { GameConfig } from "./GameConfig";

export interface AudioConfigData {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  ambientVolume: number;
  maxDistance: number;
  rolloffFactor: number;
  soundPaths: Record<string, string>;
}

export class AudioConfig {
  private static instance: AudioConfig;
  private config: GameConfig;
  private defaultSoundPaths: Record<string, string> = {
    blockBreak: "/sounds/block_break.mp3",
    blockPlace: "/sounds/block_place.mp3",
    // jump: '/sounds/jump.mp3',  // Comentado hasta tener el archivo
    // land: '/sounds/land.mp3',  // Comentado hasta tener el archivo
  };

  private constructor() {
    this.config = GameConfig.getInstance();
    this.initializeDefaultConfig();
  }

  public static getInstance(): AudioConfig {
    if (!AudioConfig.instance) {
      AudioConfig.instance = new AudioConfig();
    }
    return AudioConfig.instance;
  }

  private initializeDefaultConfig(): void {
    const audioConfig = this.config.get("audio") as AudioConfigData;
    if (!audioConfig) {
      this.config.set("audio", {
        masterVolume: 1.0,
        musicVolume: 0.7,
        sfxVolume: 0.8,
        ambientVolume: 0.5,
        maxDistance: 32,
        rolloffFactor: 1,
        soundPaths: this.defaultSoundPaths,
      });
    }
  }

  public getSoundPath(soundName: string): string | undefined {
    const audioConfig = this.config.get("audio") as AudioConfigData;
    return audioConfig?.soundPaths[soundName];
  }

  public getAllSoundPaths(): Record<string, string> {
    const audioConfig = this.config.get("audio") as AudioConfigData;
    return audioConfig?.soundPaths || this.defaultSoundPaths;
  }

  public getVolume(type: "master" | "music" | "sfx" | "ambient"): number {
    const audioConfig = this.config.get("audio") as AudioConfigData;
    switch (type) {
      case "master":
        return audioConfig?.masterVolume ?? 1.0;
      case "music":
        return audioConfig?.musicVolume ?? 0.7;
      case "sfx":
        return audioConfig?.sfxVolume ?? 0.8;
      case "ambient":
        return audioConfig?.ambientVolume ?? 0.5;
      default:
        return 1.0;
    }
  }

  public setVolume(
    type: "master" | "music" | "sfx" | "ambient",
    value: number
  ): void {
    const audioConfig = this.config.get("audio") as AudioConfigData;
    if (audioConfig) {
      switch (type) {
        case "master":
          audioConfig.masterVolume = value;
          break;
        case "music":
          audioConfig.musicVolume = value;
          break;
        case "sfx":
          audioConfig.sfxVolume = value;
          break;
        case "ambient":
          audioConfig.ambientVolume = value;
          break;
      }
      this.config.set("audio", audioConfig);
    }
  }

  public getMaxDistance(): number {
    const audioConfig = this.config.get("audio") as AudioConfigData;
    return audioConfig?.maxDistance ?? 32;
  }

  public getRolloffFactor(): number {
    const audioConfig = this.config.get("audio") as AudioConfigData;
    return audioConfig?.rolloffFactor ?? 1;
  }
}
