import type { GameRefs } from "./types";

export class PlayerController {
  private refs: GameRefs;

  constructor(refs: GameRefs) {
    this.refs = refs;
  }

  update(deltaTime: number) {
    if (!this.refs.player) return;
    this.refs.player.updatePosition(deltaTime);
    this.refs.player.highlightBlock();
    // Aquí puedes añadir más lógica específica del jugador
  }
}
