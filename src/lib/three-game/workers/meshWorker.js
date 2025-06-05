// filepath: src/lib/three-game/workers/meshWorker.js
// Worker para generación de mallas de chunks

// Utilidad para generar una malla serializable a partir de los datos del chunk
function generateMeshData(chunkData, blockPrototypes) {
  const CHUNK_SIZE = chunkData.length;
  const vertices = [];
  const faces = [];
  // Caras de un cubo (6 caras, cada una con 4 vértices)
  const cubeFaces = [
    // [offsetX, offsetY, offsetZ, normalX, normalY, normalZ]
    [ [0,0,0], [1,0,0], [1,1,0], [0,1,0], [0,0,-1] ], // back
    [ [0,0,1], [1,0,1], [1,1,1], [0,1,1], [0,0,1] ],  // front
    [ [0,0,0], [0,0,1], [0,1,1], [0,1,0], [-1,0,0] ], // left
    [ [1,0,0], [1,0,1], [1,1,1], [1,1,0], [1,0,0] ],  // right
    [ [0,1,0], [1,1,0], [1,1,1], [0,1,1], [0,1,0] ],  // top
    [ [0,0,0], [1,0,0], [1,0,1], [0,0,1], [0,-1,0] ]  // bottom
  ];
  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let y = 0; y < chunkData[x].length; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const blockType = chunkData[x][y][z];
        if (blockType && blockType !== 'air') {
          // Para cada cara, podrías comprobar si el bloque vecino es 'air' y solo agregar la cara si es visible
          for (let f = 0; f < cubeFaces.length; f++) {
            // Aquí deberías comprobar el bloque vecino, pero para el ejemplo agregamos todas las caras
            const face = cubeFaces[f];
            const vIdx = vertices.length;
            // Añadir los 4 vértices de la cara
            for (let i = 0; i < 4; i++) {
              const [ox, oy, oz] = face[i];
              vertices.push([x + ox, y + oy, z + oz]);
            }
            // Añadir la cara (índices de los 4 vértices y normal)
            faces.push({ indices: [vIdx, vIdx+1, vIdx+2, vIdx+3], normal: face[4] });
          }
        }
      }
    }
  }
  return { vertices, faces };
}

self.onmessage = function(e) {
  const { chunkData, chunkX, chunkZ, worldSeed, blockPrototypes } = e.data;
  // Lógica de generación de geometría/malla basada en chunkData
  const meshData = generateMeshData(chunkData, blockPrototypes);
  self.postMessage({
    chunkX,
    chunkZ,
    meshData,
    status: 'done'
  });
};
