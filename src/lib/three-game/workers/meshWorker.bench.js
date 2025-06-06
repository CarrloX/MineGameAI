// Pruebas unitarias y benchmark para meshWorker.js
// Ejecutar con: node src/lib/three-game/workers/meshWorker.bench.js
const { Worker } = require('worker_threads');
const path = require('path');
const fs = require('fs');

function createChunkData(sizeX, sizeY, sizeZ, fillType = 'solid', blockType = 'stoneBlock') {
  const data = [];
  for (let x = 0; x < sizeX; x++) {
    data[x] = [];
    for (let y = 0; y < sizeY; y++) {
      data[x][y] = [];
      for (let z = 0; z < sizeZ; z++) {
        if (fillType === 'solid') {
          data[x][y][z] = blockType;
        } else if (fillType === 'empty') {
          data[x][y][z] = 'air';
        } else if (fillType === 'half') {
          data[x][y][z] = y < sizeY/2 ? blockType : 'air';
        } else if (fillType === 'checker') {
          data[x][y][z] = (x+y+z)%2===0 ? blockType : 'air';
        }
      }
    }
  }
  return data;
}

function getWorkerPath() {
  // Soporta ejecución desde cualquier ubicación del proyecto
  const tryPaths = [
    path.resolve(__dirname, '../../../public/workers/meshWorker.js'),
    path.resolve(__dirname, '../../../../public/workers/meshWorker.js'),
    path.resolve(__dirname, '../../../../../public/workers/meshWorker.js'),
    path.resolve(__dirname, '../../../public/workers/meshWorker.js').replace(/\\/g, '/'),
    path.resolve(__dirname, '../../../../public/workers/meshWorker.js').replace(/\\/g, '/'),
    path.resolve(__dirname, '../../../../../public/workers/meshWorker.js').replace(/\\/g, '/')
  ];
  for (const p of tryPaths) {
    try { require('fs').accessSync(p); return p; } catch { }
  }
  throw new Error('No se encontró meshWorker.js en public/workers');
}

const results = [];

function runWorkerTest(chunkData, label, done) {
  const workerPath = getWorkerPath();
  const t0 = Date.now();
  const worker = new Worker(workerPath);
  worker.on('message', (msg) => {
    const t1 = Date.now();
    const meshData = msg.meshData;
    // Test: ¿hay vértices y caras?
    if (!meshData.vertices || !meshData.faces) throw new Error('No mesh data');
    // Test: ¿los índices de las caras son válidos?
    for (const face of meshData.faces) {
      if (!face.indices) continue; // Saltar si no hay indices (el worker los elimina tras aplanar)
      for (const idx of face.indices) {
        if (idx < 0 || idx >= meshData.vertices.length) throw new Error('Índice de vértice fuera de rango');
      }
    }
    // Test: ¿no hay vértices duplicados?
    if (Array.isArray(meshData.vertices[0])) {
      const vertSet = new Set(meshData.vertices.map(v => v.join(',')));
      if (vertSet.size !== meshData.vertices.length) throw new Error('Vértices duplicados');
    } else if (ArrayBuffer.isView(meshData.vertices)) {
      // Si es Float32Array, cada 3 valores es un vértice
      const vertSet = new Set();
      for (let i = 0; i < meshData.vertices.length; i += 3) {
        vertSet.add(`${meshData.vertices[i]},${meshData.vertices[i+1]},${meshData.vertices[i+2]}`);
      }
      if (vertSet.size !== meshData.vertices.length / 3) throw new Error('Vértices duplicados');
    }
    // Test: ¿la luz está en rango?
    for (const face of meshData.faces) {
      if ('light' in face && (face.light < 0 || face.light > 1)) throw new Error('Valor de luz fuera de rango');
    }
    const elapsed = t1-t0;
    results.push({ label, vertices: meshData.vertices.length, faces: meshData.faces.length, elapsed });
    console.log(`${label}: ${meshData.vertices.length} vértices, ${meshData.faces.length} caras, tiempo: ${elapsed}ms`);
    worker.terminate();
    done();
  });
  worker.on('error', (err) => { throw err; });
  worker.postMessage({ chunkData, chunkX: 0, chunkZ: 0, worldSeed: 42 });
}

async function runBenchmarks() {
  const tests = [
    { size: [16,16,16], fill: 'solid' },
    { size: [16,16,16], fill: 'empty' },
    { size: [16,16,16], fill: 'half' },
    { size: [16,16,16], fill: 'checker' },
    { size: [32,32,32], fill: 'solid' },
    { size: [32,32,32], fill: 'half' },
    { size: [32,32,32], fill: 'checker' },
    { size: [16,64,16], fill: 'solid' },
    { size: [16,64,16], fill: 'half' },
    { size: [16,64,16], fill: 'checker' },
    // --- Pruebas de estrés/extremos ---
    { size: [64,64,64], fill: 'solid' }, // Chunk gigante sólido
    { size: [64,64,64], fill: 'empty' },
    { size: [64,64,64], fill: 'half' },
    { size: [64,64,64], fill: 'checker' },
    { size: [32,32,32], fill: 'solid', blockType: 'waterBlock' }, // Chunk gigante solo agua
    { size: [32,32,32], fill: 'checker', blockType: 'waterBlock' }, // Checker de agua
    // Cambios masivos: alternar entre sólido y vacío
    { size: [32,32,32], fill: 'solid', blockType: 'stoneBlock' },
    { size: [32,32,32], fill: 'solid', blockType: 'dirtBlock' },
    { size: [32,32,32], fill: 'solid', blockType: 'sandBlock' },
    { size: [32,32,32], fill: 'solid', blockType: 'waterBlock' },
  ];
  for (const t of tests) {
    await new Promise((resolve) => {
      const chunkData = createChunkData(...t.size, t.fill, t.blockType || 'stoneBlock');
      runWorkerTest(chunkData, `${t.size.join('x')} ${t.fill}${t.blockType ? ' ' + t.blockType : ''}`, resolve);
    });
  }
  // Resumen final
  const byType = {};
  for (const r of results) {
    const key = r.label.split(' ').slice(1).join(' ');
    if (!byType[key]) byType[key] = [];
    byType[key].push(r.elapsed);
  }
  console.log('\nResumen de tiempos promedio por tipo:');
  for (const key in byType) {
    const arr = byType[key];
    const avg = arr.reduce((a,b)=>a+b,0)/arr.length;
    console.log(`${key}: ${avg.toFixed(1)}ms promedio (${arr.length} tests)`);
  }
  // Exportar a CSV
  const csvHeader = 'label,vertices,faces,elapsed_ms\n';
  const csvRows = results.map(r => `${r.label},${r.vertices},${r.faces},${r.elapsed}`);
  const csvContent = csvHeader + csvRows.join('\n');
  fs.writeFileSync('meshWorker-benchmarks.csv', csvContent);
  console.log('Resultados exportados a meshWorker-benchmarks.csv');
  console.log('Benchmarks finalizados.');
}

runBenchmarks();
