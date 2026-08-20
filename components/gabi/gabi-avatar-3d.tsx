'use client';

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { useGLTF, useAnimations, OrbitControls, Html, Environment, Lightformer } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import type { Group, Mesh, MeshStandardMaterial } from 'three';
import { setGabiFace } from './gabi-face-store';

// Modelo 3D da Gabi. Vem do próprio sistema (public/models/gabi.glb);
// pode ser sobrescrito por NEXT_PUBLIC_GABI_MODEL_URL (ex.: uma URL hospedada).
export const GABI_MODEL_URL = process.env.NEXT_PUBLIC_GABI_MODEL_URL || '/models/gabi.glb';
export const GABI_3D_ENABLED = !!GABI_MODEL_URL;

// Enquadramento: rosto/busto (cabeça no topo, ~y 1.8 no modelo Avaturn)
const CAM_POS: [number, number, number] = [0, 1.6, 0.92];
const CAM_TARGET: [number, number, number] = [0, 1.6, 0];
const CAM_FOV = 28;

function Model({ url }: { url: string }) {
  const group = useRef<Group>(null);
  const { scene, animations } = useGLTF(url);

  // Clona a cena por instância: o mesmo GLTF é usado em DOIS canvases (header
  // e boas-vindas) e um objeto three só pode viver em uma cena — sem o clone,
  // o segundo canvas "rouba" o modelo e o primeiro fica vazio.
  const cloned = useMemo(() => SkeletonUtils.clone(scene), [scene]);

  // Os materiais do Avaturn vêm com metallic=1 (corpo/roupa), que reflete o
  // ambiente e "estoura" em branco. Reduz o metálico para a cor real das
  // texturas aparecer sob luz normal.
  useEffect(() => {
    cloned.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats as MeshStandardMaterial[]) {
        if (!m || m.metalness === undefined) continue;
        if (m.metalness > 0.5) m.metalness = 0.1;
        if (m.roughness !== undefined && m.roughness < 0.6) m.roughness = 0.7;
        m.envMapIntensity = 0.6;
        m.needsUpdate = true;
      }
    });
  }, [cloned]);

  const { actions } = useAnimations(animations, group);

  useEffect(() => {
    const first = Object.values(actions)[0];
    first?.reset().fadeIn(0.4).play();
    return () => { first?.fadeOut(0.2); };
  }, [actions]);

  return (
    <group ref={group}>
      <primitive object={cloned} />
    </group>
  );
}

// Captura uma "foto" da Gabi ~1,4s após carregar, para reusar nos avatares
// das mensagens (evita um WebGL por mensagem).
function Capture() {
  const gl = useThree(s => s.gl);
  const scene = useThree(s => s.scene);
  const camera = useThree(s => s.camera);
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      if (cancelled) return;
      try {
        gl.render(scene, camera);
        setGabiFace(gl.domElement.toDataURL('image/png'));
      } catch {}
    }, 1400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [gl, scene, camera]);
  return null;
}

export function GabiAvatar3D({ size = 120 }: { size?: number }) {
  if (!GABI_3D_ENABLED) return null;

  return (
    <div style={{ width: size, height: size }}>
      <Canvas
        camera={{ position: CAM_POS, fov: CAM_FOV }}
        dpr={[1, 2]}
        gl={{ preserveDrawingBuffer: true, alpha: true, antialias: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.65} />
        <directionalLight position={[2, 4, 3]} intensity={1.0} />
        <directionalLight position={[-3, 2, 2]} intensity={0.4} color="#cfe0ff" />

        <Suspense fallback={<Html center><span style={{ color: '#22d3ee', fontSize: 10 }}>…</span></Html>}>
          <Model url={GABI_MODEL_URL} />
          {/* Ambiente suave gerado na cena (sem HDR externo) — só um toque de
              reflexo; a cor vem das texturas (metalness reduzido no Model). */}
          <Environment resolution={128}>
            <Lightformer intensity={1.0} position={[0, 3, 3]} scale={[9, 9, 1]} color="#ffffff" />
            <Lightformer intensity={0.6} position={[-5, 1, 2]} scale={[4, 6, 1]} color="#cfe0ff" />
            <Lightformer intensity={0.6} position={[5, 1, 2]} scale={[4, 6, 1]} color="#ffe6cc" />
          </Environment>
          <Capture />
        </Suspense>

        {/* Estática (não gira sozinha); ainda dá pra arrastar levemente */}
        <OrbitControls
          target={CAM_TARGET}
          enablePan={false}
          enableZoom={false}
          minPolarAngle={Math.PI / 2.35}
          maxPolarAngle={Math.PI / 2.05}
        />
      </Canvas>
    </div>
  );
}

// Pré-carrega o modelo
if (GABI_3D_ENABLED) {
  try { useGLTF.preload(GABI_MODEL_URL); } catch {}
}
