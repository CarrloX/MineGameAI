// src/lib/three-game/workers/MeshWorkerPool.ts
// Pool de Web Workers para generación de mallas de chunks

import createMeshWorker from './meshWorkerWrapper';

const WORKER_COUNT = Math.max(2, Math.floor(navigator.hardwareConcurrency / 2) || 2);

export type MeshTask = {
  chunkData: string[][][];
  chunkX: number;
  chunkZ: number;
  worldSeed: number;
  blockPrototypes?: any;
  onComplete: (meshData: any) => void;
};

export class MeshWorkerPool {
  private workers: Worker[] = [];
  private busy: boolean[] = [];
  private queue: MeshTask[] = [];

  constructor(poolSize: number = WORKER_COUNT) {
    for (let i = 0; i < poolSize; i++) {
      const worker = createMeshWorker();
      worker.onmessage = (e) => this.handleWorkerMessage(i, e);
      this.workers.push(worker);
      this.busy.push(false);
    }
  }

  enqueueTask(task: MeshTask) {
    // Busca un worker libre
    const freeIdx = this.busy.findIndex(b => !b);
    if (freeIdx !== -1) {
      this.runTaskOnWorker(freeIdx, task);
    } else {
      this.queue.push(task);
    }
  }

  private runTaskOnWorker(idx: number, task: MeshTask) {
    this.busy[idx] = true;
    (this.workers[idx] as Worker).onmessage = (e) => this.handleWorkerMessage(idx, e, task.onComplete);
    this.workers[idx].postMessage({
      chunkData: task.chunkData,
      chunkX: task.chunkX,
      chunkZ: task.chunkZ,
      worldSeed: task.worldSeed,
      blockPrototypes: task.blockPrototypes,
    });
  }

  private handleWorkerMessage(idx: number, e: MessageEvent, onComplete?: (meshData: any) => void) {
    this.busy[idx] = false;
    const meshData = e.data.meshData;
    if (onComplete) onComplete(meshData);
    // Atiende la siguiente tarea en la cola si existe
    if (this.queue.length > 0) {
      const nextTask = this.queue.shift()!;
      this.runTaskOnWorker(idx, nextTask);
    }
  }

  dispose() {
    this.workers.forEach(w => w.terminate());
    this.workers = [];
    this.busy = [];
    this.queue = [];
  }
}
