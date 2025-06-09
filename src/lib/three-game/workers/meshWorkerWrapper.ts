// src/lib/three-game/workers/meshWorkerWrapper.ts
// Wrapper para crear el worker de mesh compatible con Next.js/Turbopack
export default function createMeshWorker() {
  return new Worker(new URL("./meshWorker.js", import.meta.url), {
    type: "module",
  });
}
