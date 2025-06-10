import React from 'react';
import './PauseMenu.css';

interface PauseMenuProps {
    isPaused: boolean;
    onResumeGame: () => void;
}

const PauseMenu: React.FC<PauseMenuProps> = ({ isPaused, onResumeGame }) => {
    if (!isPaused) {
        return null;
    }

    return (
        <div className="pause-menu-overlay">
            <div className="pause-menu-content">
                <h1>Juego Pausado</h1>
                <button onClick={onResumeGame}>Reanudar Partida</button>
                {/* Puedes añadir más botones aquí en el futuro: Opciones, Salir, etc. */}
            </div>
        </div>
    );
};

export default PauseMenu;
