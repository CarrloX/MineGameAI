import { CONTROL_CONFIG } from '../CONTROL_CONFIG';

export class PlayerStateService {
    private player: any; // Referencia al jugador

    // Estado del jugador
    private _flying: boolean = false;
    private _isFlyingAscending: boolean = false;
    private _isFlyingDescending: boolean = false;
    private _isRunning: boolean = false;
    private _isBoosting: boolean = false;
    private _jumping: boolean = false;
    private _onGround: boolean = false;
    private _dead: boolean = false;
    private _lastSpacePressTime: number = 0;

    // Configuración
    public readonly flySpeed: number = CONTROL_CONFIG.FLY_SPEED;
    public readonly flyToggleDelay: number = CONTROL_CONFIG.FLY_TOGGLE_DELAY;
    public readonly runSpeedMultiplier: number = CONTROL_CONFIG.RUN_SPEED_MULTIPLIER;
    public readonly boostSpeedMultiplier: number = CONTROL_CONFIG.BOOST_SPEED_MULTIPLIER;

    constructor(player: any) {
        this.player = player;
    }

    // Getters y setters
    public get flying(): boolean {
        return this._flying;
    }

    public get isFlyingAscending(): boolean {
        return this._isFlyingAscending;
    }

    public get isFlyingDescending(): boolean {
        return this._isFlyingDescending;
    }

    public get isRunning(): boolean {
        return this._isRunning;
    }

    public get isBoosting(): boolean {
        return this._isBoosting;
    }

    public get jumping(): boolean {
        return this._jumping;
    }

    public set jumping(value: boolean) {
        this._jumping = value;
    }

    public get onGround(): boolean {
        return this._onGround;
    }

    public set onGround(value: boolean) {
        this._onGround = value;
    }

    public get dead(): boolean {
        return this._dead;
    }

    public set dead(value: boolean) {
        this._dead = value;
    }

    public get lastSpacePressTime(): number {
        return this._lastSpacePressTime;
    }

    public set lastSpacePressTime(value: number) {
        this._lastSpacePressTime = value;
    }

    public toggleFlying(): void {
        const now = performance.now();
        console.log('toggleFlying llamado:', {
            now,
            lastSpacePressTime: this._lastSpacePressTime,
            timeDiff: now - this._lastSpacePressTime,
            flying: this._flying
        });

        if (now - this._lastSpacePressTime < this.flyToggleDelay && this._lastSpacePressTime !== 0) {
            console.log('Doble clic detectado - alternando modo de vuelo');
            this._flying = !this._flying;
            this._isFlyingAscending = false;
            this._isFlyingDescending = false;
            this._lastSpacePressTime = 0;

            if (this._flying) {
                console.log('Activando modo de vuelo');
                this._jumping = false;
                this.player.jumpVelocity = 0;
                this._onGround = false;
                this._isRunning = false;
                this._isBoosting = false;
            } else {
                console.log('Desactivando modo de vuelo');
                this._isBoosting = false;
                this._onGround = false;
            }
        } else {
            console.log('Primer clic o clic único');
            if (this._flying) {
                console.log('Iniciando ascenso');
                this._isFlyingAscending = true;
            } else {
                console.log('Iniciando salto');
                this._jumping = true;
            }
            this._lastSpacePressTime = now;
        }
    }

    public startFlyingDown(): void {
        if (this._flying) {
            this._isFlyingDescending = true;
        }
    }

    public stopFlyingDown(): void {
        this._isFlyingDescending = false;
    }

    public stopFlyingUp(): void {
        this._isFlyingAscending = false;
    }

    public toggleRunning(): void {
        if (!this._flying) {
            this._isRunning = !this._isRunning;
            if (this._isRunning) {
                this._isBoosting = false;
            }
        }
    }

    public toggleBoosting(): void {
        if (this._flying) {
            this._isBoosting = !this._isBoosting;
        }
    }

    public die(): void {
        this._dead = true;
        this._flying = false;
        this._isBoosting = false;
        this._isRunning = false;
        this._isFlyingAscending = false;
        this._isFlyingDescending = false;
        this._lastSpacePressTime = 0;
        this.player.jumpVelocity = 0;
        this._onGround = false;
    }

    public respawn(): void {
        this._dead = false;
        this._flying = false;
        this._isBoosting = false;
        this._isRunning = false;
        this._isFlyingAscending = false;
        this._isFlyingDescending = false;
        this._lastSpacePressTime = 0;
        this.player.jumpVelocity = 0;
        this._onGround = false;
    }

    public isPlayerDead(): boolean {
        return this._dead;
    }

    public isPlayerFlying(): boolean {
        return this._flying;
    }

    public isPlayerRunning(): boolean {
        return this._isRunning;
    }

    public isPlayerBoosting(): boolean {
        return this._isBoosting;
    }

    public isPlayerJumping(): boolean {
        return this._jumping;
    }

    public isPlayerOnGround(): boolean {
        return this._onGround;
    }
} 