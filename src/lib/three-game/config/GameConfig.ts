export class GameConfig {
    private static instance: GameConfig;
    private config: Map<string, any>;

    private constructor() {
        this.config = new Map();
        this.initializeDefaultConfig();
    }

    public static getInstance(): GameConfig {
        if (!GameConfig.instance) {
            GameConfig.instance = new GameConfig();
        }
        return GameConfig.instance;
    }

    private initializeDefaultConfig(): void {
        // Configuración del jugador
        this.set('player', {
            height: 1.8,
            width: 0.6,
            depth: 0.6,
            walkSpeed: 4.3,
            runSpeed: 5.6,
            jumpSpeed: 8.0,
            flySpeed: 8.0,
            gravity: 20.0,
            maxFallDistance: 4.0,
            attackRange: 5.0,
            flyToggleDelay: 300, // ms
            runSpeedMultiplier: 1.3,
            boostSpeedMultiplier: 1.6
        });

        // Configuración del mundo
        this.set('world', {
            chunkSize: 16,
            renderDistance: 8,
            maxHeight: 256,
            voidHeight: 64,
            seed: Math.floor(Math.random() * Number.MAX_SAFE_INTEGER),
            generation: {
                terrainScale: 0.01,
                heightScale: 64,
                treeFrequency: 0.02,
                caveFrequency: 0.05
            }
        });

        // Configuración de gráficos
        this.set('graphics', {
            fov: 75,
            nearPlane: 0.1,
            farPlane: 1000,
            shadowMapSize: 2048,
            antialias: true,
            bloom: {
                enabled: true,
                threshold: 0.8,
                strength: 0.5,
                radius: 0.8
            }
        });

        // Configuración de audio
        this.set('audio', {
            masterVolume: 1.0,
            musicVolume: 0.7,
            sfxVolume: 0.8,
            ambientVolume: 0.5,
            maxDistance: 32,
            rolloffFactor: 1
        });

        // Configuración de controles
        this.set('controls', {
            mouseSensitivity: 0.002,
            invertY: false,
            keyBindings: {
                forward: 'KeyW',
                backward: 'KeyS',
                left: 'KeyA',
                right: 'KeyD',
                jump: 'Space',
                sprint: 'ShiftLeft',
                fly: 'KeyF',
                inventory: 'KeyE',
                drop: 'KeyQ'
            }
        });

        // Configuración de debug
        this.set('debug', {
            enabled: false,
            showFPS: true,
            showChunkBorders: false,
            showCollisionBoxes: false,
            showLightLevels: false,
            showBlockInfo: false
        });
    }

    public get<T>(key: string): T | undefined {
        return this.config.get(key) as T;
    }

    public set(key: string, value: any): void {
        this.config.set(key, value);
    }

    public update(key: string, updates: Partial<any>): void {
        const current = this.config.get(key);
        if (current) {
            this.config.set(key, { ...current, ...updates });
        }
    }

    public reset(): void {
        this.config.clear();
        this.initializeDefaultConfig();
    }

    public saveToLocalStorage(): void {
        try {
            const configObject = Object.fromEntries(this.config);
            localStorage.setItem('gameConfig', JSON.stringify(configObject));
        } catch (error) {
            console.error('Error saving config to localStorage:', error);
        }
    }

    public loadFromLocalStorage(): void {
        try {
            const savedConfig = localStorage.getItem('gameConfig');
            if (savedConfig) {
                const configObject = JSON.parse(savedConfig);
                Object.entries(configObject).forEach(([key, value]) => {
                    this.config.set(key, value);
                });
            }
        } catch (error) {
            console.error('Error loading config from localStorage:', error);
            this.reset();
        }
    }
} 