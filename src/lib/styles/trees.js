// Realistic tree models, generated once with EZ-Tree (MIT, github.com/dgreenheck/ez-tree)
// and reused for every day. Loaded on demand because the bark/leaf textures are large.
//
// Leaves are desaturated so any color can be applied per tree (instance color),
// and get our own wind sway that works with InstancedMesh.
import * as THREE from 'three';
import { Tree, TreePreset } from '@dgreenheck/ez-tree';

// Each species: an EZ-Tree preset and a few seeds for variety.
const SPECIES = {
  oak: { preset: 'Oak Medium', seeds: [11, 47] },
  ash: { preset: 'Ash Medium', seeds: [5, 83] },
  aspen: { preset: 'Aspen Medium', seeds: [19, 64] },
  pine: { preset: 'Pine Medium', seeds: [7, 52] },
  bush: { preset: 'Bush 1', seeds: [3], extra: ['Bush 2', 'Bush 3'] },
};

const LEAF_SIZE = 1.6; // bigger leaves so crowns read as full at board scale

let libraryPromise = null;

/** Builds (once) and returns { protos: { species: [proto] }, update(time) }. */
export function loadTreeLibrary() {
  libraryPromise ||= buildLibrary();
  return libraryPromise;
}

function waitForImage(texture) {
  return new Promise((resolve) => {
    const check = () => (texture.image && (texture.image.complete ?? true) && texture.image.width ? resolve() : setTimeout(check, 20));
    check();
  });
}

// Grayscale + brightened copy of a leaf texture, so instance colors tint it cleanly.
function desaturate(texture) {
  const img = texture.image;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const p = data.data;
  for (let i = 0; i < p.length; i += 4) {
    const l = 0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2];
    const v = Math.min(255, 70 + l * 1.5); // keep the vein detail, lose the green
    p[i] = p[i + 1] = p[i + 2] = v;
  }
  g.putImageData(data, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.premultiplyAlpha = false;
  return tex;
}

const windUniforms = { uTime: { value: 0 } };

function leafMaterial(map, alphaTest) {
  const mat = new THREE.MeshPhongMaterial({ map, side: THREE.DoubleSide, alphaTest, dithering: true, shininess: 8 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float phase = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 1.3;
      #else
        float phase = 0.0;
      #endif
      // leaves sway more the higher they sit in the texture (uv.y) and the tree (position.y)
      float sway = uv.y * (0.25 + position.y * 0.012);
      transformed.x += sway * (0.6 * sin(uTime * 1.3 + phase) + 0.3 * sin(uTime * 2.9 + phase * 1.7));
      transformed.z += sway * 0.5 * sin(uTime * 1.7 + phase * 0.8);`,
    );
  };
  return mat;
}

async function buildLibrary() {
  const leafMats = {};
  const protos = {};
  for (const [species, def] of Object.entries(SPECIES)) {
    protos[species] = [];
    const variants = [...def.seeds.map((seed) => [def.preset, seed]), ...(def.extra ?? []).map((p) => [p, null])];
    for (const [preset, seed] of variants) {
      const tree = new Tree();
      tree.options.copy(TreePreset[preset]);
      if (seed != null) tree.options.seed = seed;
      tree.options.leaves.size *= LEAF_SIZE;
      tree.generate();

      const leafType = tree.options.leaves.type;
      const srcMap = tree.leavesMesh.material.map;
      await waitForImage(srcMap);
      leafMats[leafType] ||= leafMaterial(desaturate(srcMap), tree.options.leaves.alphaTest);

      const box = new THREE.Box3().setFromObject(tree);
      const size = box.getSize(new THREE.Vector3());
      protos[species].push({
        species,
        branches: tree.branchesMesh.geometry,
        branchMat: tree.branchesMesh.material,
        leaves: tree.leavesMesh.geometry,
        leafMat: leafMats[leafType],
        height: size.y,
        width: Math.max(size.x, size.z),
      });
      tree.leavesMesh.material.dispose(); // we use our own leaf material
      // yield so the page stays responsive while the trees are generated
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  return {
    protos,
    update(seconds) {
      windUniforms.uTime.value = seconds;
    },
  };
}
