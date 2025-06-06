// filepath: src/lib/three-game/workers/meshWorker.js
// Worker para generación de mallas de chunks

// Utilidad para generar una malla serializable a partir de los datos del chunk
function generateMeshData(chunkData, blockPrototypes) {
  const CHUNK_SIZE_X = chunkData.length;
  const CHUNK_SIZE_Z = chunkData[0]?.[0]?.length || chunkData[0]?.length || 0;
  // Calcular la altura máxima por columna (puede variar por x,z)
  const getColumnHeight = (x, z) => (chunkData[x] && chunkData[x][0] && chunkData[x][0].length > 0) ? chunkData[x].length : 0;
  const vertices = [];
  const faces = [];
  const vertexMap = new Map(); // key: "x,y,z", value: index

  // Caras de un cubo (6 caras, cada una con 4 vértices)
  const cubeFaces = [
    [ [0,0,0], [1,0,0], [1,1,0], [0,1,0], [0,0,-1] ], // back
    [ [0,0,1], [1,0,1], [1,1,1], [0,1,1], [0,0,1] ],  // front
    [ [0,0,0], [0,0,1], [0,1,1], [0,1,0], [-1,0,0] ], // left
    [ [1,0,0], [1,0,1], [1,1,1], [1,1,0], [1,0,0] ],  // right
    [ [0,1,0], [1,1,0], [1,1,1], [0,1,1], [0,1,0] ],  // top
    [ [0,0,0], [1,0,0], [1,0,1], [0,0,1], [0,-1,0] ]  // bottom
  ];
  // Direcciones para vecinos: [dx, dy, dz]
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

  for (let x = 0; x < CHUNK_SIZE_X; x++) {
    const maxY = chunkData[x]?.length || 0;
    for (let y = 0; y < maxY; y++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const blockType = chunkData[x][y][z];
        if (blockType && blockType !== 'air') {
          for (let f = 0; f < cubeFaces.length; f++) {
            // Culling: solo agrega la cara si el vecino es 'air' o está fuera del chunk
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
              // Comprimir vértices: usar getVertexIndex para cada uno
              const idx0 = getVertexIndex(x + face[0][0], y + face[0][1], z + face[0][2]);
              const idx1 = getVertexIndex(x + face[1][0], y + face[1][1], z + face[1][2]);
              const idx2 = getVertexIndex(x + face[2][0], y + face[2][1], z + face[2][2]);
              const idx3 = getVertexIndex(x + face[3][0], y + face[3][1], z + face[3][2]);
              faces.push({ 
                indices: [idx0, idx1, idx2, idx3], 
                normal: face[4],
                blockType: blockType,
                faceIndex: f // 0=back, 1=front, 2=left, 3=right, 4=top, 5=bottom
              });
            }
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
