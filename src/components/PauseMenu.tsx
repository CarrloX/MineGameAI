import React, { useState } from 'react';
import './PauseMenu.css';
import { logger } from '@/lib/three-game/utils/Logger';
import { AudioManager } from '@/lib/three-game/AudioManager';
import { Howler } from 'howler';
import { EventBus, GameEvents } from '@/lib/three-game/events/EventBus';

interface PauseMenuProps {
    isPaused: boolean;
    onResumeGame: () => void;
}

const PauseMenu: React.FC<PauseMenuProps> = ({ isPaused, onResumeGame }) => {
    const [showSettings, setShowSettings] = useState(false);
    const [disableLogs, setDisableLogs] = useState(false);
    const [masterVolume, setMasterVolume] = useState(50);
    const [renderDistance, setRenderDistance] = useState(8); // Nuevo estado para la distancia de renderizado
    // Detectar la frecuencia máxima de la pantalla (mejorado)
    const [detectedHz, setDetectedHz] = useState<number>(60);
    // Estado para máximo personalizado
    const [customHz, setCustomHz] = useState<string>(() => {
        // Intentar cargar de localStorage
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem('blockify_customHz');
            return stored || "";
        }
        return "";
    });
    React.useEffect(() => {
        // Guardar en localStorage cuando cambie
        if (customHz && typeof window !== 'undefined') {
            localStorage.setItem('blockify_customHz', customHz);
        }
    }, [customHz]);
    React.useEffect(() => {
        let frame = 0;
        let last = performance.now();
        let times: number[] = [];
        let running = true;
        function measure() {
            if (!running) return;
            const now = performance.now();
            times.push(now - last);
            last = now;
            frame++;
            if (frame < 60) {
                requestAnimationFrame(measure);
            } else {
                const avg = times.slice(5).reduce((a, b) => a + b, 0) / (times.length - 5);
                let hz = Math.round(1000 / avg);
                // Fallback si la medición es absurda
                if (hz < 50) {
                    // Algunos navegadores exponen screen.frequency o screen.refreshRate
                    const screenHz = (window.screen as any).frequency || (window.screen as any).refreshRate || 0;
                    if (typeof screenHz === 'number' && screenHz > 0) {
                        hz = screenHz;
                    } else {
                        hz = 60;
                    }
                }
                setDetectedHz(hz);
            }
        }
        requestAnimationFrame(measure);
        return () => { running = false; };
    }, []);
    // Usar el máximo entre el detectado y el personalizado
    const effectiveHz = customHz && !isNaN(Number(customHz)) && Number(customHz) > 10 ? Number(customHz) : detectedHz;
    // Generar los pasos del slider dinámicamente
    const fpsSteps = React.useMemo(() => {
        const limit = Math.max(30, effectiveHz);
        const arr = [];
        for (let i = 5; i <= limit; i += 5) arr.push(i);
        arr.push(0); // 0 = Ilimitado
        return arr;
    }, [effectiveHz]);
    // Por defecto, FPS ilimitado
    const [fpsLimit, setFpsLimit] = useState(() => {
        // Si hay un valor guardado, usarlo, si no, ilimitado (0)
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem('blockify_fpsLimit');
            if (stored !== null) return Number(stored);
        }
        return 0;
    });
    React.useEffect(() => {
        // Guardar el valor en localStorage
        if (typeof window !== 'undefined') {
            localStorage.setItem('blockify_fpsLimit', String(fpsLimit));
        }
    }, [fpsLimit]);
    // Emitir el valor de FPS al juego al cargar el componente
    React.useEffect(() => {
        EventBus.getInstance().emit('FPS_LIMIT_CHANGE', { fps: fpsLimit });
    }, []);
    const handleToggleLogs = () => {
        setDisableLogs(v => {
            const newValue = !v;
            // ON = silenciar (error), OFF = habilitar (info)
            logger.setLogLevel(newValue ? 'error' : 'info');
            return newValue;
        });
    };

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = Number(e.target.value);
        setMasterVolume(value);
        // Controlar el volumen global real
        AudioManager.prototype.setGlobalVolume.call(null, value / 100);
        if (value === 0) {
            Howler.mute(true); // Desactiva completamente el sistema de sonido
        } else {
            Howler.mute(false); // Reactiva el sistema de sonido
        }
    };

    const handleRenderDistanceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = Number(e.target.value);
        setRenderDistance(value);
        // Emitir el evento para notificar al juego
        EventBus.getInstance().emit(GameEvents.RENDER_DISTANCE_CHANGE, { distance: value });
    };

    const handleFpsLimitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = Number(e.target.value);
        setFpsLimit(value);
        EventBus.getInstance().emit('FPS_LIMIT_CHANGE', { fps: value });
    };

    if (!isPaused) {
        return null;
    }

    if (showSettings) {
        return (
            <div className="pause-menu-overlay">
                <div className="pause-menu-content settings-menu">
                    <h1>Ajustes</h1>
                    <div className="settings-row">
                        <span>Desactivar logs y métricas</span>
                        <button
                            className={disableLogs ? 'settings-btn-off' : 'settings-btn-on'}
                            onClick={handleToggleLogs}
                        >
                            {disableLogs ? 'ON' : 'OFF'}
                        </button>
                    </div>
                    <div className="settings-row">
                        <span>Volumen maestro</span>
                        <input
                            type="range"
                            min={0}
                            max={100}
                            value={masterVolume}
                            onChange={handleVolumeChange}
                            className="settings-slider"
                            title="Controlar volumen maestro"
                        />
                        <span className="settings-volume-value">{masterVolume}</span>
                    </div>
                    <div className="settings-row">
                        <span>Distancia de Renderizado</span>
                        <input
                            type="range"
                            min={2}
                            max={64}
                            value={renderDistance}
                            onChange={handleRenderDistanceChange}
                            className="settings-slider"
                            title="Controlar distancia de renderizado de chunks"
                        />
                        <span className="settings-volume-value">{renderDistance}</span>
                    </div>
                    <div className="settings-row">
                        <span>Limite de FPS</span>
                        <div className="settings-fps-slider-wrapper">
                            <input
                                type="range"
                                min={0}
                                max={fpsSteps.length - 1}
                                step={1}
                                value={fpsSteps.indexOf(fpsLimit) === -1 ? fpsSteps.length - 1 : fpsSteps.indexOf(fpsLimit)}
                                onChange={e => {
                                    const idx = Number(e.target.value);
                                    handleFpsLimitChange({
                                        ...e,
                                        target: { ...e.target, value: fpsSteps[idx].toString() }
                                    } as React.ChangeEvent<HTMLInputElement>);
                                }}
                                className="settings-slider"
                                title="Controlar límite de FPS"
                            />
                            <div className="settings-fps-tooltip">
                                El límite de FPS no puede superar el refresco real de tu pantalla, que el navegador ha detectado como {detectedHz} Hz. Si la detección es incorrecta, puedes forzar el valor real manualmente.
                            </div>
                        </div>
                        <span className="settings-volume-value">
                            {fpsLimit === 0 ? 'Ilimitado' : fpsLimit + ' FPS'}
                        </span>
                        <span className="settings-fps-max">
                            (Máx. detectado: {detectedHz} Hz)
                        </span>
                        <input
                            type="number"
                            min={10}
                            max={1000}
                            value={customHz}
                            onChange={e => setCustomHz(e.target.value)}
                            placeholder="Forzar Hz"
                            className="settings-fps-input"
                        />
                    </div>
                    <button className="settings-done-btn" onClick={() => setShowSettings(false)}>Hecho</button>
                </div>
            </div>
        );
    }

    return (
        <div className="pause-menu-overlay">
            <div className="pause-menu-content">
                <h1>Juego Pausado</h1>
                <button onClick={onResumeGame}>Reanudar Partida</button>
                <button onClick={() => setShowSettings(true)}>Ajustes</button>
            </div>
        </div>
    );
};

export default PauseMenu;
