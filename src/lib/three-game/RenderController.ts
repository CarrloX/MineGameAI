import type { GameRefs } from './types';

export class RenderController {
  private refs: GameRefs;

  constructor(refs: GameRefs) {
    this.refs = refs;
  }

  render() {
    if (!this.refs.rendererManager) return;
    // Aquí puedes añadir lógica de renderizado adicional si es necesario
    this.refs.rendererManager.render();
  }
}
