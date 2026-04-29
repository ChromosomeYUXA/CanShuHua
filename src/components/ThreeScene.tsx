import { Canvas } from "@react-three/fiber";
import {
  ContactShadows,
  Float,
  MeshReflectorMaterial,
  OrbitControls,
  PerspectiveCamera,
  Stars,
  useGLTF,
} from "@react-three/drei";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { SculptureParams } from "../types";

interface Props {
  params: SculptureParams;
  modelUrl: string | null;
  onModelRendered?: () => void;
  presentationMode?: boolean;
}

const MODEL_DISPLAY_OFFSET = new THREE.Vector3(0, 1.45, 0);
const WHITE_MATERIAL = {
  color: "#f8fafc",
  metalness: 0.1,
  roughness: 0.2,
};

function getVisibleMeshBounds(root: THREE.Object3D) {
  root.updateWorldMatrix(true, true);

  const box = new THREE.Box3();
  const meshBox = new THREE.Box3();
  let hasMesh = false;

  root.traverse((child: any) => {
    if (!child.visible || !child.isMesh || !child.geometry) return;
    if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
    if (!child.geometry.boundingBox) return;

    meshBox.copy(child.geometry.boundingBox).applyMatrix4(child.matrixWorld);
    if (meshBox.isEmpty()) return;

    box.union(meshBox);
    hasMesh = true;
  });

  return hasMesh ? box : new THREE.Box3().setFromObject(root);
}

function normalizeSculptureMaterial(root: THREE.Object3D) {
  root.traverse((child: any) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((mat: any) => {
      if (!mat) return;
      if (mat.color) mat.color.set(WHITE_MATERIAL.color);
      if (mat.emissive) mat.emissive.set(0x000000);
      mat.metalness = WHITE_MATERIAL.metalness;
      mat.roughness = WHITE_MATERIAL.roughness;
      mat.needsUpdate = true;
    });
  });
}

function GltfModel({
  url,
  onRendered,
}: {
  url: string;
  onRendered?: (info?: { center?: THREE.Vector3; radius?: number }) => void;
}) {
  const gltf = useGLTF(url, false, true);

  const bounds = useMemo(() => {
    const sculptureRoot = gltf.scene.getObjectByName("Sculpture");
    const box = getVisibleMeshBounds(sculptureRoot ?? gltf.scene);
    const center = new THREE.Vector3();
    const sphere = new THREE.Sphere();
    box.getCenter(center);
    box.getBoundingSphere(sphere);
    return { center, radius: sphere.radius };
  }, [gltf.scene]);

  useEffect(() => {
    normalizeSculptureMaterial(gltf.scene);
  }, [gltf.scene]);

  useEffect(() => {
    if (!onRendered) return;
    const frame = requestAnimationFrame(() => {
      onRendered({ center: bounds.center.clone(), radius: bounds.radius });
    });
    return () => cancelAnimationFrame(frame);
  }, [bounds, onRendered, url]);

  return (
    <Float speed={1.35} rotationIntensity={0.12} floatIntensity={0.28}>
      <group position={[-bounds.center.x + MODEL_DISPLAY_OFFSET.x, -bounds.center.y + MODEL_DISPLAY_OFFSET.y, -bounds.center.z + MODEL_DISPLAY_OFFSET.z]}>
        <primitive object={gltf.scene} />
      </group>
    </Float>
  );
}

function ParametricPreview({ params }: { params: SculptureParams }) {
  const previewCenter = useMemo(() => {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < params.slice_count; i += 1) {
      const waveOffset = Math.sin(i * 0.45) * params.wave;
      minX = Math.min(minX, waveOffset - 1);
      maxX = Math.max(maxX, waveOffset + 1);
    }

    return new THREE.Vector3((minX + maxX) / 2, 0, params.length / 2).sub(MODEL_DISPLAY_OFFSET);
  }, [params.length, params.slice_count, params.wave]);

  return (
    <Float speed={1.35} rotationIntensity={0.12} floatIntensity={0.28}>
      <group position={[-previewCenter.x, -previewCenter.y, -previewCenter.z]}>
        {Array.from({ length: params.slice_count }).map((_, i) => {
          const progress = i / Math.max(1, params.slice_count - 1);
          const z = progress * params.length;
          const angle = progress * THREE.MathUtils.degToRad(params.twist_angle);
          const waveOffset = Math.sin(i * 0.45) * params.wave;
          const inclineAngle = THREE.MathUtils.degToRad(params.incline);

          return (
            <mesh key={i} position={[waveOffset, 0, z]} rotation={[inclineAngle, 0, angle]} castShadow receiveShadow>
              <boxGeometry args={[2, 0.5, params.thickness]} />
              <meshStandardMaterial {...WHITE_MATERIAL} />
            </mesh>
          );
        })}
      </group>
    </Float>
  );
}

function Model({
  url,
  params,
  onRendered,
}: {
  url: string | null;
  params: SculptureParams;
  onRendered?: (info?: { center?: THREE.Vector3; radius?: number }) => void;
}) {
  const [errorUrl, setErrorUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      setErrorUrl(null);
      return;
    }

    const loader = new THREE.FileLoader();
    loader.load(url, () => setErrorUrl(null), undefined, () => setErrorUrl(url));
  }, [url]);

  if (!url || errorUrl === url) return <ParametricPreview params={params} />;
  return <GltfModel key={url} url={url} onRendered={onRendered} />;
}

function ModelPreloader({ url, onLoaded }: { url: string; onLoaded: (url: string) => void }) {
  useGLTF(url, false, true);

  useEffect(() => {
    onLoaded(url);
  }, [url, onLoaded]);

  return null;
}

function Cityscape() {
  const buildings = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => {
        const row = i % 2;
        const side = i < 15 ? -1 : 1;
        const depth = -14 - row * 4 - Math.floor((i % 15) / 5) * 5;
        return {
          x: side * (8 + (i % 5) * 2.9 + row * 1.2),
          z: depth,
          h: 5 + ((i * 7) % 9),
          w: 1.3 + ((i * 3) % 4) * 0.35,
        };
      }),
    [],
  );

  return (
    <group>
      {buildings.map((building, index) => (
        <group key={index} position={[building.x, building.h / 2 - 1.1, building.z]}>
          <mesh receiveShadow>
            <boxGeometry args={[building.w, building.h, 1.35]} />
            <meshStandardMaterial color="#050814" metalness={0.2} roughness={0.5} />
          </mesh>
          {Array.from({ length: Math.max(2, Math.floor(building.h / 2.2)) }).map((_, stripIndex) => (
            <mesh key={stripIndex} position={[0, -building.h / 2 + 1.15 + stripIndex * 1.8, 0.681]}>
              <boxGeometry args={[building.w * 0.82, 0.035, 0.025]} />
              <meshStandardMaterial color="#60a5fa" emissive="#38bdf8" emissiveIntensity={2.4} toneMapped={false} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function LabFloor() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.15, 0]} receiveShadow>
        <planeGeometry args={[90, 90]} />
        <MeshReflectorMaterial
          blur={[280, 80]}
          resolution={768}
          mixBlur={0.8}
          mixStrength={0.32}
          roughness={0.42}
          depthScale={0.55}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.25}
          color="#050816"
          metalness={0.45}
        />
      </mesh>
      <gridHelper args={[90, 45, "#1d4ed8", "#111827"]} position={[0, -1.135, 0]} />
    </group>
  );
}

export default function ThreeScene({ params, modelUrl, onModelRendered, presentationMode = false }: Props) {
  const cameraRef = useRef<any>(null);
  const controlsRef = useRef<any>(null);
  const [displayedModelUrl, setDisplayedModelUrl] = useState<string | null>(modelUrl);
  const fixedCameraDistance = presentationMode ? 24 : 26;
  const focusOffset = useMemo(
    () => (presentationMode ? new THREE.Vector3(0, 0.85, 0) : new THREE.Vector3(1.5, 0.55, 0)),
    [presentationMode],
  );

  const resetCamera = useCallback(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;

    if (camera && controls) {
      const target = focusOffset.clone();
      const viewDirection = new THREE.Vector3().subVectors(camera.position, controls.target);
      if (viewDirection.lengthSq() === 0) viewDirection.set(1, 0.7, 1);
      viewDirection.normalize();
      camera.position.copy(target.clone().add(viewDirection.multiplyScalar(fixedCameraDistance)));
      controls.target.copy(target);
      controls.update();
    }
  }, [fixedCameraDistance, focusOffset]);

  const handleModelRenderedInternal = useCallback(() => {
    resetCamera();
    onModelRendered?.();
  }, [onModelRendered, resetCamera]);

  useEffect(() => {
    resetCamera();
  }, [resetCamera]);

  useEffect(() => {
    if (modelUrl === null) setDisplayedModelUrl(null);
  }, [modelUrl]);

  const handleModelLoaded = useCallback((url: string) => {
    setDisplayedModelUrl(url);
  }, []);

  return (
    <div className="lab-scene absolute inset-0 h-full w-full">
      <Canvas shadows gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }} dpr={[1, 1.75]}>
        <color attach="background" args={["#020617"]} />
        <fog attach="fog" args={["#020617", 24, 72]} />
        <PerspectiveCamera ref={cameraRef} makeDefault position={[13, 8, 18]} fov={presentationMode ? 38 : 42} />
        <OrbitControls
          ref={controlsRef}
          makeDefault
          target={presentationMode ? [0, 0.85, 0] : [1.5, 0.55, 0]}
          enableDamping
          dampingFactor={0.06}
          minDistance={11}
          maxDistance={42}
          maxPolarAngle={Math.PI * 0.48}
        />

        <hemisphereLight args={["#dbeafe", "#020617", 0.38]} />
        <ambientLight color="#93c5fd" intensity={0.26} />
        <directionalLight
          color="#ffffff"
          position={[6, 12, 8]}
          intensity={2.4}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <pointLight color="#60a5fa" position={[-8, 5, 6]} intensity={3.4} distance={36} />
        <pointLight color="#bfdbfe" position={[8, 4, -8]} intensity={1.4} distance={30} />
        <spotLight color="#60a5fa" position={[0, 10, -12]} angle={0.38} penumbra={0.8} intensity={2.2} />

        <Stars radius={105} depth={54} count={1900} factor={4.8} saturation={0} fade speed={0.42} />
        <Cityscape />
        <LabFloor />

        <Suspense fallback={null}>
          {modelUrl && modelUrl !== displayedModelUrl && <ModelPreloader url={modelUrl} onLoaded={handleModelLoaded} />}
        </Suspense>

        <Suspense fallback={displayedModelUrl ? null : <ParametricPreview params={params} />}>
          <Model url={displayedModelUrl} params={params} onRendered={handleModelRenderedInternal} />
        </Suspense>

        <ContactShadows position={[0, -1.08, 0]} opacity={0.52} scale={22} blur={2.8} far={5} color="#020617" />
      </Canvas>
    </div>
  );
}
