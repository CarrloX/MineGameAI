// filepath: src/lib/three-game/workers/meshWorker.js
// Worker para generación de mallas de chunks

// Utilidad para generar una malla serializable a partir de los datos del chunk
function generateMeshData(chunkData, blockPrototypes) {
  const CHUNK_SIZE_X = chunkData.length;
  const CHUNK_SIZE_Z = chunkData[0]?.[0]?.length || chunkData[0]?.length || 0;
  const vertices = [];
  const faces = [];
  const vertexMap = new Map();

  const cubeFaces = [
    [ [0,0,0], [1,0,0], [1,1,0], [0,1,0], [0,0,-1] ], // back
    [ [0,0,1], [1,0,1], [1,1,1], [0,1,1], [0,0,1] ],  // front
    [ [0,0,0], [0,0,1], [0,1,1], [0,1,0], [-1,0,0] ], // left
    [ [1,0,0], [1,0,1], [1,1,1], [1,1,0], [1,0,0] ],  // right
    [ [0,1,0], [1,1,0], [1,1,1], [0,1,1], [0,1,0] ],  // top
    [ [0,0,0], [1,0,0], [1,0,1], [0,0,1], [0,-1,0] ]  // bottom
  ];
  const neighborOffsets = [
    [0, 0, -1], // back
    [0, 0, 1],  // front
    [-1, 0, 0], // left
    [1, 0, 0],  // right
    [0, 1, 0],  // top
    [0, -1, 0], // bottom
  ];

  function getVertexIndex(x, y, z) {
    const key = `${x},${y},${z}`;
    if (vertexMap.has(key)) {
      return vertexMap.get(key);
    } else {
      const idx = vertices.length;
      vertices.push([x, y, z]);
      vertexMap.set(key, idx);
      return idx;
    }
  }

  // Parámetros de luz: dirección del sol y valores básicos
  const sunDir = [0.5, 1, 0.5]; // Luz diagonal desde arriba
  const sunNorm = Math.sqrt(sunDir[0]**2 + sunDir[1]**2 + sunDir[2]**2);
  const sun = sunDir.map(v => v / sunNorm);
  const ambient = 0.5; // Luz ambiental mínima
  const sunIntensity = 0.7; // Luz solar máxima

  for (let x = 0; x < CHUNK_SIZE_X; x++) {
    const maxY = chunkData[x]?.length || 0;
    for (let y = 0; y < maxY; y++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const blockType = chunkData[x][y][z];
        if (blockType && blockType !== 'air') {
          for (let f = 0; f < cubeFaces.length; f++) {
            const [dx, dy, dz] = neighborOffsets[f];
            const nx = x + dx;
            const ny = y + dy;
            const nz = z + dz;
            let neighborType = null;
            if (
              nx >= 0 && nx < CHUNK_SIZE_X &&
              ny >= 0 && ny < (chunkData[nx]?.length || 0) &&
              nz >= 0 && nz < CHUNK_SIZE_Z
            ) {
              neighborType = chunkData[nx][ny][nz];
            }
            if (!neighborType || neighborType === 'air') {
              const face = cubeFaces[f];
              const idx0 = getVertexIndex(x + face[0][0], y + face[0][1], z + face[0][2]);
              const idx1 = getVertexIndex(x + face[1][0], y + face[1][1], z + face[1][2]);
              const idx2 = getVertexIndex(x + face[2][0], y + face[2][1], z + face[2][2]);
              const idx3 = getVertexIndex(x + face[3][0], y + face[3][1], z + face[3][2]);
              // Iluminación básica: dot(normal, sunDir)
              const normal = face[4];
              const normLen = Math.sqrt(normal[0]**2 + normal[1]**2 + normal[2]**2);
              const n = normLen > 0 ? normal.map(v => v / normLen) : [0,1,0];
              let dot = n[0]*sun[0] + n[1]*sun[1] + n[2]*sun[2];
              dot = Math.max(0, dot); // Solo luz directa
              // Exposición al cielo: si no hay bloque encima, más luz
              let sky = 1;
              if (f === 4) { // top
                for (let y2 = y+1; y2 < maxY; y2++) {
                  if (chunkData[x][y2][z] && chunkData[x][y2][z] !== 'air') {
                    sky = 0.7; // Hay algo encima
                    break;
                  }
                }
              }
              // Iluminación avanzada: color RGB por vértice (efecto atardecer/cueva)
              // Parámetros de color: puedes parametrizar según hora del día, aquí ejemplo simple
              let sunColor = [1.0, 0.95, 0.8]; // Luz solar (amarillo cálido)
              let ambientColor = [0.3, 0.4, 0.6]; // Luz ambiente (azul tenue)
              // Puedes modificar sunColor dinámicamente según hora del día
              let light = ambient + sunIntensity * dot * sky;
              // Clamp
              light = Math.min(1, Math.max(0, light));
              // Color final = mezcla de luz solar y ambiente
              let r = ambientColor[0] * ambient + sunColor[0] * sunIntensity * dot * sky;
              let g = ambientColor[1] * ambient + sunColor[1] * sunIntensity * dot * sky;
              let b = ambientColor[2] * ambient + sunColor[2] * sunIntensity * dot * sky;
              // Clamp
              r = Math.min(1, Math.max(0, r));
              g = Math.min(1, Math.max(0, g));
              b = Math.min(1, Math.max(0, b));
              // Material/animación avanzado: asignar ID de material/animación por cara
              let materialId = 0;
              let animationId = 0;
              if (blockPrototypes && blockPrototypes[blockType]) {
                // Ejemplo: blockPrototypes[blockType].materialId, .animationId
                materialId = blockPrototypes[blockType].materialId ?? 0;
                animationId = blockPrototypes[blockType].animationId ?? 0;
              } else {
                // Por defecto: agua=1, lava=2, etc. Puedes personalizar
                if (blockType === 'waterBlock') materialId = 1;
                if (blockType === 'lavaBlock') materialId = 2;
              }
              faces.push({ 
                indices: [idx0, idx1, idx2, idx3], 
                normal: face[4],
                blockType: blockType,
                faceIndex: f,
                color: [r, g, b],
                materialId,
                animationId
              });
            }
          }
        }
      }
    }
  }
  return { vertices, faces };
}

// Compatibilidad dual: navegador y Node.js
if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  self.onmessage = function(e) {
    const { chunkData, chunkX, chunkZ, worldSeed, blockPrototypes } = e.data;
    const meshData = generateMeshData(chunkData, blockPrototypes);
    // Transferir buffers de vértices e índices para máxima eficiencia
    let transfer = [];
    // Vértices
    if (Array.isArray(meshData.vertices[0])) {
      const flat = meshData.vertices.flat();
      const verticesBuffer = new Float32Array(flat);
      meshData.vertices = verticesBuffer;
      transfer.push(verticesBuffer.buffer);
    } else if (ArrayBuffer.isView(meshData.vertices)) {
      transfer.push(meshData.vertices.buffer);
    }
    // Índices
    if (meshData.faces && meshData.faces.length > 0 && meshData.faces[0].indices) {
      // Aplanar todos los índices de todas las caras
      const flatIndices = meshData.faces.flatMap(face => face.indices);
      const indicesBuffer = new Int32Array(flatIndices);
      meshData.indices = indicesBuffer;
      transfer.push(indicesBuffer.buffer);
      // Opcional: eliminar los indices de cada face para ahorrar memoria
      meshData.faces.forEach(face => { delete face.indices; });
    }
    self.postMessage({
      chunkX,
      chunkZ,
      meshData,
      status: 'done'
    }, transfer);
  };
} else if (typeof require !== 'undefined' && typeof module !== 'undefined') {
  try {
    const { parentPort } = require('worker_threads');
    if (parentPort) {
      parentPort.on('message', (e) => {
        const { chunkData, chunkX, chunkZ, worldSeed, blockPrototypes } = e;
        const meshData = generateMeshData(chunkData, blockPrototypes);
        // En Node.js no es necesario transferir buffers, pero mantenemos la estructura
        if (meshData.faces && meshData.faces.length > 0 && meshData.faces[0].indices) {
          const flatIndices = meshData.faces.flatMap(face => face.indices);
          meshData.indices = new Int32Array(flatIndices);
          meshData.faces.forEach(face => { delete face.indices; });
        }
        if (Array.isArray(meshData.vertices[0])) {
          meshData.vertices = new Float32Array(meshData.vertices.flat());
        }
        parentPort.postMessage({
          chunkX,
          chunkZ,
          meshData,
          status: 'done'
        });
      });
    }
  } catch (err) {
    // No estamos en Node.js worker_threads
  }
}
