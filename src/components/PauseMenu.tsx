import React, { useState } from 'react';
import './PauseMenu.css';
import { logger } from '@/lib/three-game/utils/Logger';
import { AudioManager } from '@/lib/three-game/AudioManager';
import { Howler } from 'howler';

interface PauseMenuProps {
    isPaused: boolean;
    onResumeGame: () => void;
}

const PauseMenu: React.FC<PauseMenuProps> = ({ isPaused, onResumeGame }) => {
    const [showSettings, setShowSettings] = useState(false);
    const [disableLogs, setDisableLogs] = useState(false);
    const [masterVolume, setMasterVolume] = useState(100);

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
