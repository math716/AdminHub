'use client';

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
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

// Duração da entrada do avatar, em segundos. Maior = surge mais devagar.
const DURACAO_ENTRADA = 0.7;

function Model({ url }: { url: string }) {
  const group = useRef<Group>(null);
  const { scene, animations } = useGLTF(url);

  // Clona a cena por instância: o mesmo GLTF é usado em DOIS canvases (header
  // e boas-vindas) e um objeto three só pode viver em uma cena — sem o clone,
  // o segundo canvas "rouba" o modelo e o primeiro fica vazio.
  const cloned = useMemo(() => {
    const c = SkeletonUtils.clone(scene);
    // SkeletonUtils.clone copia o grafo, mas os MATERIAIS continuam sendo os
    // mesmos objetos. Como há DUAS instâncias na tela (cabeçalho e boas-vindas),
    // as duas escreveriam na mesma opacidade durante a entrada e disputariam o
    // valor. Clonar os materiais isola cada instância.
    c.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(m => m.clone())
        : mesh.material.clone();
    });
    return c;
  }, [scene]);

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
    if (!first) return;
    // SEM fadeIn. Com ele, o peso da ação subia de 0 a 1 e o corpo INTERPOLAVA
    // da pose de descanso do rig (braços abertos) até a pose da animação — era
    // o "abre e fecha" que aparecia ao carregar. Em peso cheio desde o início,
    // o primeiro quadro já sai na pose certa.
    first.reset();
    first.setEffectiveWeight(1);
    first.play();
    return () => { first.stop(); };
  }, [actions]);

  // Materiais e seus valores originais, para a entrada suave abaixo.
  const materiais = useMemo(() => {
    const lista: { m: MeshStandardMaterial; transparente: boolean; opacidade: number }[] = [];
    cloned.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats as MeshStandardMaterial[]) {
        if (!m) continue;
        lista.push({ m, transparente: m.transparent, opacidade: m.opacity });
      }
    });
    return lista;
  }, [cloned]);

  // Entrada em ~0,7s: a Gabi surge gradualmente em vez de piscar na tela. O
  // mixer só aplica a animação a partir do 2º quadro, então a opacidade baixa
  // no começo também esconde o único quadro que ainda sairia na pose de
  // descanso.
  const entrada = useRef(0);
  useFrame((_, delta) => {
    if (entrada.current >= 1) return;
    const t = Math.min(1, entrada.current + delta / DURACAO_ENTRADA);
    entrada.current = t;
    const suave = t * t * (3 - 2 * t); // smoothstep — sem começo/fim abruptos
    for (const item of materiais) {
      if (t < 1) {
        if (!item.m.transparent) { item.m.transparent = true; item.m.needsUpdate = true; }
        item.m.opacity = item.opacidade * suave;
      } else {
        item.m.opacity = item.opacidade;
        if (item.m.transparent !== item.transparente) {
          item.m.transparent = item.transparente; // devolve o flag original
          item.m.needsUpdate = true;
        }
      }
    }
  });

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
