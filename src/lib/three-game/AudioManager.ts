import { Howl, Howler } from 'howler';

// Rutas de sonidos (asume que están en public/sounds/)
export const SOUND_PATHS = {
  blockBreak: '/sounds/block_break.mp3',
  blockPlace: '/sounds/block_place.mp3',
  jump: '/sounds/jump.mp3',
  land: '/sounds/land.mp3',
};

export class AudioManager {
  private sounds: Map<string, Howl> = new Map();

  constructor() {
    Howler.volume(1.0); // Volumen global por defecto
  }

  loadSound(name: string, path: string, loop: boolean = false, volume: number = 1.0): void {
    const sound = new Howl({
      src: [path],
      loop,
      volume
    });
    this.sounds.set(name, sound);
  }

  playSound(name: string): void {
    const sound = this.sounds.get(name);
    if (sound) {
      console.log('Reproduciendo sonido:', name, 'Volumen actual:', Howler.volume());
      sound.play();
    } else {
      console.warn(`AudioManager: Sound '${name}' not found.`);
    }
  }

  stopSound(name: string): void {
    const sound = this.sounds.get(name);
    if (sound) {
      sound.stop();
    }
  }

  setGlobalVolume(volume: number): void {
    Howler.volume(volume);
    console.log('Volumen global de AudioManager establecido a:', volume);
  }
}
