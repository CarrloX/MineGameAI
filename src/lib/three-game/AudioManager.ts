import { Howl, Howler } from "howler";

// Rutas de sonidos (asume que están en public/sounds/)
export const SOUND_PATHS = {
  blockBreak: "/sounds/block_break.mp3",
  blockPlace: "/sounds/block_place.mp3",
  // Temporalmente comentamos jump y land hasta tener los archivos
  // jump: '/sounds/jump.mp3',
  // land: '/sounds/land.mp3',
};

export class AudioManager {
  private sounds: Map<string, Howl> = new Map();
  private isInitialized: boolean = false;
  private soundLoadErrors: Set<string> = new Set();

  constructor() {
    console.log("Inicializando AudioManager");
    Howler.volume(0.5); // Volumen global por defecto (50%)
    this.isInitialized = true;
    console.log("AudioManager inicializado con volumen:", Howler.volume());
  }

  loadSound(
    name: string,
    path: string,
    loop: boolean = false,
    volume: number = 1.0
  ): void {
    // Si ya hubo un error cargando este sonido, no intentar cargarlo de nuevo
    if (this.soundLoadErrors.has(name)) {
      console.warn(
        `No se intentará cargar el sonido ${name} nuevamente debido a un error previo`
      );
      return;
    }

    // Si el sonido no está en SOUND_PATHS, no lo cargamos
    if (!(name in SOUND_PATHS)) {
      console.warn(
        `No se cargará el sonido ${name} porque no está definido en SOUND_PATHS`
      );
      return;
    }

    console.log(`Cargando sonido: ${name} desde ${path}`);
    const sound = new Howl({
      src: [path],
      loop,
      volume,
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

  playSound(name: string): void {
    if (!this.isInitialized) {
      console.warn("AudioManager no está inicializado");
      return;
    }

    // Si el sonido no está en SOUND_PATHS, no lo reproducimos
    if (!(name in SOUND_PATHS)) {
      console.warn(
        `No se reproducirá el sonido ${name} porque no está definido en SOUND_PATHS`
      );
      return;
    }

    const sound = this.sounds.get(name);
    if (sound) {
      console.log("Reproduciendo sonido:", name, {
        volumen: Howler.volume(),
        sonidosCargados: this.sounds.size,
        sonidosDisponibles: Array.from(this.sounds.keys()),
      });
      sound.play();
    } else {
      console.warn(
        `AudioManager: Sonido '${name}' no encontrado. Sonidos disponibles:`,
        Array.from(this.sounds.keys())
      );
    }
  }

  stopSound(name: string): void {
    const sound = this.sounds.get(name);
    if (sound) {
      console.log("Deteniendo sonido:", name);
      sound.stop();
    } else {
      console.warn(
        `AudioManager: No se pudo detener el sonido '${name}' - no encontrado`
      );
    }
  }

  setGlobalVolume(volume: number): void {
    console.log("Estableciendo volumen global a:", volume);
    Howler.volume(volume);
  }

  getStatus(): {
    isInitialized: boolean;
    volume: number;
    loadedSounds: string[];
    soundCount: number;
    soundLoadErrors: string[];
  } {
    return {
      isInitialized: this.isInitialized,
      volume: Howler.volume(),
      loadedSounds: Array.from(this.sounds.keys()),
      soundCount: this.sounds.size,
      soundLoadErrors: Array.from(this.soundLoadErrors),
    };
  }
}
