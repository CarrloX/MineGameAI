import { Howl, Howler } from "howler";
import { EventBus, GameEvents } from "../events/EventBus";
import { AudioConfig } from "../config/AudioConfig";

export interface IAudioService {
  loadSound(name: string, path: string, loop?: boolean, volume?: number): void;
  playSound(name: string): void;
  stopSound(name: string): void;
  setGlobalVolume(volume: number): void;
  getStatus(): AudioServiceStatus;
}

export interface AudioServiceStatus {
  isInitialized: boolean;
  volume: number;
  loadedSounds: string[];
  soundCount: number;
  soundLoadErrors: string[];
}

export class AudioService implements IAudioService {
  private static instance: AudioService;
  private sounds: Map<string, Howl> = new Map();
  private isInitialized: boolean = false;
  private soundLoadErrors: Set<string> = new Set();
  private eventBus: EventBus;
  private audioConfig: AudioConfig;

  private constructor() {
    console.log("Inicializando AudioService");
    this.eventBus = EventBus.getInstance();
    this.audioConfig = AudioConfig.getInstance();

    // Inicializar con el volumen maestro
    const masterVolume = this.audioConfig.getVolume("master");
    Howler.volume(masterVolume);

    this.isInitialized = true;
    this.setupEventListeners();
    this.loadAllSounds();
    console.log("AudioService inicializado con volumen:", Howler.volume());
  }

  public static getInstance(): AudioService {
    if (!AudioService.instance) {
      AudioService.instance = new AudioService();
    }
    return AudioService.instance;
  }

  private loadAllSounds(): void {
    const soundPaths = this.audioConfig.getAllSoundPaths();
    Object.entries(soundPaths).forEach(([name, path]) => {
      if (path) {
        // Solo cargar sonidos que tengan una ruta definida
        this.loadSound(name, path);
      }
    });
  }

  private setupEventListeners(): void {
    // Escuchar eventos del juego y reproducir sonidos correspondientes
    this.eventBus.on(GameEvents.BLOCK_BREAK, () => {
      this.playSound("blockBreak");
    });

    this.eventBus.on(GameEvents.BLOCK_PLACE, () => {
      this.playSound("blockPlace");
    });

    this.eventBus.on(GameEvents.PLAYER_JUMP, () => {
      this.playSound("jump");
    });

    this.eventBus.on(GameEvents.PLAYER_LAND, () => {
      this.playSound("land");
    });

    // Escuchar cambios en la configuración de audio
    this.eventBus.on(GameEvents.GAME_STATE_CHANGE, (event) => {
      if (event.type === "audio_config_change") {
        const masterVolume = this.audioConfig.getVolume("master");
        this.setGlobalVolume(masterVolume);
      }
    });
  }

  public loadSound(
    name: string,
    path: string,
    loop: boolean = false,
    volume: number = 1.0
  ): void {
    if (this.soundLoadErrors.has(name)) {
      console.warn(
        `No se intentará cargar el sonido ${name} nuevamente debido a un error previo`
      );
      return;
    }

    // Aplicar el volumen SFX a los efectos de sonido
    const sfxVolume = this.audioConfig.getVolume("sfx");
    const finalVolume = volume * sfxVolume;

    console.log(`Cargando sonido: ${name} desde ${path}`);
    const sound = new Howl({
      src: [path],
      loop,
      volume: finalVolume,
      onload: () => {
        console.log(`Sonido ${name} cargado exitosamente`);
        this.sounds.set(name, sound);
      },
      onloaderror: (id, error) => {
        console.error(`Error al cargar sonido ${name}:`, error);
        this.soundLoadErrors.add(name);
      },
      onplayerror: (id, error) => {
        console.error(`Error al reproducir sonido ${name}:`, error);
      },
    });
  }

  public playSound(name: string): void {
    if (!this.isInitialized) {
      console.warn("AudioService no está inicializado");
      return;
    }

    const sound = this.sounds.get(name);
    if (sound) {
      // Actualizar el volumen antes de reproducir
      const sfxVolume = this.audioConfig.getVolume("sfx");
      sound.volume(sfxVolume);

      console.log("Reproduciendo sonido:", name, {
        volumen: Howler.volume(),
        sonidosCargados: this.sounds.size,
        sonidosDisponibles: Array.from(this.sounds.keys()),
      });
      sound.play();
    } else {
      console.warn(
        `AudioService: Sonido '${name}' no encontrado. Sonidos disponibles:`,
        Array.from(this.sounds.keys())
      );
    }
  }

  public stopSound(name: string): void {
    const sound = this.sounds.get(name);
    if (sound) {
      console.log("Deteniendo sonido:", name);
      sound.stop();
    } else {
      console.warn(
        `AudioService: No se pudo detener el sonido '${name}' - no encontrado`
      );
    }
  }

  public setGlobalVolume(volume: number): void {
    console.log("Estableciendo volumen global a:", volume);
    Howler.volume(volume);
  }

  public getStatus(): AudioServiceStatus {
    return {
      isInitialized: this.isInitialized,
      volume: Howler.volume(),
      loadedSounds: Array.from(this.sounds.keys()),
      soundCount: this.sounds.size,
      soundLoadErrors: Array.from(this.soundLoadErrors),
    };
  }
}
