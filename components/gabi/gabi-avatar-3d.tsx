'use client';

import { Suspense, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { useGLTF, useAnimations, OrbitControls, Html } from '@react-three/drei';
import type { Group } from 'three';

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
  const { actions } = useAnimations(animations, group);

  // toca a 1ª animação (idle), se o modelo tiver
  useEffect(() => {
    const first = Object.values(actions)[0];
    first?.reset().fadeIn(0.4).play();
    return () => { first?.fadeOut(0.2); };
  }, [actions]);

  return (
    <group ref={group}>
      <primitive object={scene} />
    </group>
  );
}

export function GabiAvatar3D({ size = 120 }: { size?: number }) {
  if (!GABI_3D_ENABLED) return null;

  return (
    <div style={{ width: size, height: size }}>
      <Canvas
        camera={{ position: CAM_POS, fov: CAM_FOV }}
        dpr={[1, 2]}
        gl={{ preserveDrawingBuffer: false, alpha: true, antialias: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.9} />
        <directionalLight position={[2, 4, 3]} intensity={1.3} />
        <directionalLight position={[-3, 2, -2]} intensity={0.4} />

        <Suspense fallback={<Html center><span style={{ color: '#22d3ee', fontSize: 10 }}>…</span></Html>}>
          <Model url={GABI_MODEL_URL} />
        </Suspense>

        <OrbitControls
          target={CAM_TARGET}
          enablePan={false}
          enableZoom={false}
          autoRotate
          autoRotateSpeed={1.4}
          minPolarAngle={Math.PI / 2.35}
          maxPolarAngle={Math.PI / 2.05}
        />
      </Canvas>
    </div>
  );
}

// Pré-carrega o modelo (só se configurado)
if (GABI_3D_ENABLED) {
  try { useGLTF.preload(GABI_MODEL_URL); } catch {}
}
