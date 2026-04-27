import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, useGLTF } from "@react-three/drei";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SculptureParams } from "../types";
import * as THREE from "three";

interface Props {
  params: SculptureParams;
  modelUrl: string | null;
  onModelRendered?: () => void;
}

const MODEL_DISPLAY_OFFSET = new THREE.Vector3(0, 2.2, 0);
const BACKGROUND_MODEL_Y_OFFSET = -1.8;

function getVisibleMeshBounds(root: THREE.Object3D) {
  root.updateWorldMatrix(true, true);

  const box = new THREE.Box3();
  const meshBox = new THREE.Box3();
  let hasMesh = false;

  root.traverse((child: any) => {
    if (!child.visible || !child.isMesh || !child.geometry) return;

    if (!child.geometry.boundingBox) {
      child.geometry.computeBoundingBox();
    }

    if (!child.geometry.boundingBox) return;

    meshBox.copy(child.geometry.boundingBox).applyMatrix4(child.matrixWorld);
    if (meshBox.isEmpty()) return;

    box.union(meshBox);
    hasMesh = true;
  });

  return hasMesh ? box : new THREE.Box3().setFromObject(root);
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

    if (box.isEmpty() && sculptureRoot) {
      getVisibleMeshBounds(gltf.scene).getCenter(center);
      getVisibleMeshBounds(gltf.scene).getBoundingSphere(sphere);
      return {
        center,
        radius: sphere.radius,
      };
    }

    box.getCenter(center);
    box.getBoundingSphere(sphere);

    return {
      center,
      radius: sphere.radius,
    };
  }, [gltf.scene]);

  useEffect(() => {
    if (!onRendered) return;

    const frame = requestAnimationFrame(() => {
      onRendered({ center: bounds.center.clone(), radius: bounds.radius });
    });

    return () => cancelAnimationFrame(frame);
  }, [onRendered, url, bounds]);

  useEffect(() => {
    try {
      const backgroundModel = gltf.scene.getObjectByName("buildings");
      if (backgroundModel) {
        const originalY = typeof backgroundModel.userData.originalY === "number"
          ? backgroundModel.userData.originalY
          : backgroundModel.position.y;
        backgroundModel.userData.originalY = originalY;
        backgroundModel.position.y = originalY + BACKGROUND_MODEL_Y_OFFSET;
      }

      gltf.scene.traverse((child: any) => {
        if (!child.isMesh) return;

        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((mat: any) => {
          if (!mat) return;
          if (mat.color) mat.color.set(0xffffff);
          if (mat.emissive) mat.emissive.set(0x000000);
          mat.metalness = typeof mat.metalness === "number" ? mat.metalness : 0.2;
          mat.roughness = typeof mat.roughness === "number" ? mat.roughness : 0.4;
          mat.needsUpdate = true;
        });
      });
    } catch (e) {
      console.warn("[GltfModel] Failed to normalize materials", e);
    }
  }, [gltf.scene]);

  return (
    <group position={[-bounds.center.x + MODEL_DISPLAY_OFFSET.x, -bounds.center.y + MODEL_DISPLAY_OFFSET.y, -bounds.center.z + MODEL_DISPLAY_OFFSET.z]}>
      <primitive object={gltf.scene} />
    </group>
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
    <group position={[-previewCenter.x, -previewCenter.y, -previewCenter.z]}>
      {Array.from({ length: params.slice_count }).map((_, i) => {
        const progress = i / Math.max(1, params.slice_count - 1);
        const z = progress * params.length;
        const angle = progress * (params.twist_angle * (Math.PI / 180));
        const waveOffset = Math.sin(i * 0.45) * params.wave;
        const inclineAngle = THREE.MathUtils.degToRad(params.incline);

        return (
          <mesh key={i} position={[waveOffset, 0, z]} rotation={[inclineAngle, 0, angle]} castShadow receiveShadow>
            <boxGeometry args={[2, 0.5, params.thickness]} />
            <meshStandardMaterial color={0xffffff} emissive={0x000000} metalness={0.35} roughness={0.45} />
          </mesh>
        );
      })}
    </group>
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
    loader.load(
      url,
      () => setErrorUrl(null),
      undefined,
      () => setErrorUrl(url),
    );
  }, [url]);

  if (!url || errorUrl === url) {
    return <ParametricPreview params={params} />;
  }

  return <GltfModel key={url} url={url} onRendered={onRendered} />;
}

function ModelPreloader({ url, onLoaded }: { url: string; onLoaded: (url: string) => void }) {
  useGLTF(url, false, true);

  useEffect(() => {
    onLoaded(url);
  }, [url, onLoaded]);

  return null;
}

export default function ThreeScene({ params, modelUrl, onModelRendered }: Props) {
  const cameraRef = useRef<any>(null);
  const controlsRef = useRef<any>(null);
  const [displayedModelUrl, setDisplayedModelUrl] = useState<string | null>(modelUrl);
  const fixedCameraDistance = 34;
  const focusOffset = useMemo(() => new THREE.Vector3(2.4, 0, 0), []);

  const handleModelRenderedInternal = useCallback(
    () => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;

      if (!camera || !controls) {
        onModelRendered?.();
        return;
      }

      try {
        const target = focusOffset.clone();
        const currentTarget = controls.target instanceof THREE.Vector3 ? controls.target : target;
        const viewDirection = new THREE.Vector3().subVectors(camera.position, currentTarget);

        if (viewDirection.lengthSq() === 0) {
          viewDirection.set(1, 1, 1);
        }

        viewDirection.normalize();
        camera.position.copy(target.clone().add(viewDirection.multiplyScalar(fixedCameraDistance)));
        controls.target.copy(target);
        controls.update();
      } catch (e) {
        console.warn("[ThreeScene] Failed to reset camera", e);
      }

      onModelRendered?.();
    },
    [fixedCameraDistance, focusOffset, onModelRendered],
  );

  useEffect(() => {
    if (modelUrl === null) {
      setDisplayedModelUrl(null);
    }
  }, [modelUrl]);

  const handleModelLoaded = useCallback((url: string) => {
    setDisplayedModelUrl(url);
  }, []);

  return (
    <div className="cipher-sky-scene relative h-full w-full">
      <Canvas shadows gl={{ alpha: true, preserveDrawingBuffer: true }}>
        <PerspectiveCamera ref={cameraRef} makeDefault position={[14, 14, 14]} />
        <OrbitControls ref={controlsRef} makeDefault target={[0, 0, 0]} />

        <hemisphereLight args={[0xffffff, 0x000000, 0.06]} />
        <ambientLight color={0xffffff} intensity={0.6} />
        <directionalLight color={0xffffff} position={[8, 12, 6]} intensity={0.95} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
        <pointLight color={0xffffff} position={[-8, -6, -10]} intensity={0.18} />
        <pointLight color={0xffffff} position={[4, 6, -6]} intensity={0.12} />

        <Suspense fallback={null}>
          {modelUrl && modelUrl !== displayedModelUrl && <ModelPreloader url={modelUrl} onLoaded={handleModelLoaded} />}
        </Suspense>

        <Suspense fallback={displayedModelUrl ? null : <ParametricPreview params={params} />}>
          <Model url={displayedModelUrl} params={params} onRendered={handleModelRenderedInternal} />
        </Suspense>
      </Canvas>
    </div>
  );
}
