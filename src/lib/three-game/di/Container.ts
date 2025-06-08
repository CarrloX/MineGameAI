type Constructor<T = any> = new (...args: any[]) => T;
type Factory<T = any> = () => T;

export class Container {
    private static instance: Container;
    private services: Map<string, any>;
    private factories: Map<string, Factory>;
    private singletons: Map<string, any>;

    private constructor() {
        this.services = new Map();
        this.factories = new Map();
        this.singletons = new Map();
    }

    public static getInstance(): Container {
        if (!Container.instance) {
            Container.instance = new Container();
        }
        return Container.instance;
    }

    public register<T>(token: string, implementation: Constructor<T> | Factory<T>): void {
        if (typeof implementation === 'function' && 'prototype' in implementation) {
            // Es un constructor
            this.services.set(token, implementation);
        } else {
            // Es una factory
            this.factories.set(token, implementation as Factory<T>);
        }
    }

    public registerSingleton<T>(token: string, implementation: Constructor<T> | Factory<T>): void {
        this.register(token, implementation);
        this.singletons.set(token, true);
    }

    public resolve<T>(token: string): T {
        // Verificar si ya existe una instancia singleton
        if (this.singletons.has(token) && this.singletons.get(token) !== true) {
            return this.singletons.get(token);
        }

        let instance: T;

        if (this.services.has(token)) {
            const constructor = this.services.get(token);
            instance = new constructor();
        } else if (this.factories.has(token)) {
            const factory = this.factories.get(token);
            instance = factory();
        } else {
            throw new Error(`No implementation found for token: ${token}`);
        }

        // Si es un singleton, guardar la instancia
        if (this.singletons.has(token)) {
            this.singletons.set(token, instance);
        }

        return instance;
    }

    public clear(): void {
        this.services.clear();
        this.factories.clear();
        this.singletons.clear();
    }
}

// Ejemplo de uso:
/*
const container = Container.getInstance();

// Registrar servicios
container.register('worldService', WorldService);
container.register('cameraService', CameraService);
container.registerSingleton('eventBus', () => EventBus.getInstance());
container.registerSingleton('gameConfig', () => GameConfig.getInstance());

// Resolver dependencias
const worldService = container.resolve<WorldService>('worldService');
const cameraService = container.resolve<CameraService>('cameraService');
const eventBus = container.resolve<EventBus>('eventBus');
const gameConfig = container.resolve<GameConfig>('gameConfig');
*/ 