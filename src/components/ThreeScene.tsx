import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { SculptureParams } from "../types";
import * as THREE from "three";

interface Props {
  params: SculptureParams;
  modelUrl: string | null;
  onModelRendered?: () => void;
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
    const sculptureRoot = gltf.scene.getObjectByName("Sculpture") ?? gltf.scene;
    const box = new THREE.Box3().setFromObject(sculptureRoot);
    const center = new THREE.Vector3();
    box.getCenter(center);
    // 计算包围球半径，便于后续相机自适配
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    const radius = sphere.radius;
    return {
      center,
      radius,
    };
  }, [gltf.scene]);

  useEffect(() => {
    if (!onRendered) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      onRendered({ center: bounds.center.clone(), radius: bounds.radius });
    });

    return () => cancelAnimationFrame(frame);
  }, [onRendered, url, bounds]);

  // 强制将 GLTF 中所有网格材质设为纯白（便于主题统一）
  useEffect(() => {
    try {
      gltf.scene.traverse((child: any) => {
        if (child.isMesh) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((mat: any) => {
            if (!mat) return;
            if (mat.color) mat.color.set(0xffffff);
            if (mat.emissive) mat.emissive.set(0x000000);
            mat.metalness = typeof mat.metalness === 'number' ? mat.metalness : 0.2;
            mat.roughness = typeof mat.roughness === 'number' ? mat.roughness : 0.4;
            mat.needsUpdate = true;
          });
        }
      });
    } catch (e) {
      console.warn('[GltfModel] 强制白色材质失败', e);
    }
  }, [gltf.scene]);

  return (
    <group position={[-bounds.center.x, -bounds.center.y, -bounds.center.z]}>
      <primitive object={gltf.scene} />
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
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!url) {
      setError(false);
      return;
    }

    const loader = new THREE.FileLoader();
    loader.load(
      url,
      () => setError(false),
      undefined,
      (err) => {
        console.warn("GLTF pre-load check failed:", err);
        setError(true);
      }
    );
  }, [url]);

  if (error || !url) {
    return (
      <group>
        {Array.from({ length: params.slice_count }).map((_, i) => {
          const z = (i / Math.max(1, params.slice_count - 1)) * params.length;
          const angle = (i / Math.max(1, params.slice_count - 1)) * (params.twist_angle * (Math.PI / 180));
          return (
            <mesh key={i} position={[0, 0, z]} rotation={[0, 0, angle]} castShadow receiveShadow>
              <boxGeometry args={[2, 0.5, params.thickness]} />
              <meshStandardMaterial
                color={0xffffff}
                emissive={0x000000}
                metalness={0.6}
                roughness={0.25}
              />
            </mesh>
          );
        })}
      </group>
    );
  }

  return <GltfModel key={url} url={url} onRendered={onRendered} />;
}

function LoadingPreview({ params }: { params: SculptureParams }) {
  return (
    <group>
      {Array.from({ length: params.slice_count }).map((_, i) => {
        const z = (i / Math.max(1, params.slice_count - 1)) * params.length;
        const angle = (i / Math.max(1, params.slice_count - 1)) * (params.twist_angle * (Math.PI / 180));
        return (
            <mesh key={i} position={[0, 0, z]} rotation={[0, 0, angle]}>
            <boxGeometry args={[2, 0.5, params.thickness]} />
            <meshStandardMaterial color={0xffffff} emissive={0x000000} metalness={0.12} roughness={0.75} />
          </mesh>
        );
      })}
    </group>
  );
}

export default function ThreeScene({ params, modelUrl, onModelRendered }: Props) {
  const cameraRef = useRef<any>(null);
  const controlsRef = useRef<any>(null);

  // 固定刷新后相机距离（单位与初始位置一致）
  const RESET_CAMERA_DISTANCE = 14;

  // 当模型真正渲染完成后调用（由 GltfModel 的 onRendered 触发）
  // 我们在这里重置相机到固定距离（相同方向），并在最后调用传入的 onModelRendered
  const handleModelRenderedInternal = useCallback((info?: { center?: THREE.Vector3; radius?: number }) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) {
      if (onModelRendered) onModelRendered();
      return;
    }

    try {
      // GltfModel 会把模型中心平移到原点，因此目标直接使用原点
      const target = new THREE.Vector3(0, 0, 0);

      // 计算从目标指向相机的方向并归一化
      const dir = new THREE.Vector3().subVectors(camera.position, target);
      if (dir.length() === 0) dir.set(1, 1, 1).normalize();
      else dir.normalize();

      // 根据目标屏幕面积占比计算目标距离（目标面积占比：20%）
      const AREA_FRACTION = 0.2; // 目标占屏幕面积的比例
      const heightFraction = Math.sqrt(AREA_FRACTION); // 线性高度占比

      let distance = RESET_CAMERA_DISTANCE;
      if (info?.radius && info.radius > 0) {
        const r = info.radius;
        // 摄像机参数
        const vFovDeg = camera.fov ?? 50; // 备用值
        const vFov = THREE.MathUtils.degToRad(vFovDeg);
        const aspect = camera.aspect || (window.innerWidth / window.innerHeight);

        const tanHalfVFov = Math.tan(vFov / 2);
        const hFov = 2 * Math.atan(tanHalfVFov * aspect);
        const tanHalfHFov = Math.tan(hFov / 2);

        // 目标高度占比对应的距离： d = r / (heightFraction * tan(fov/2))
        const dV = r / (heightFraction * tanHalfVFov);
        const dH = r / (heightFraction * tanHalfHFov);

        // 取较大值以确保在宽/高任一方向上都不会溢出视图
        distance = Math.max(dV, dH);
      }

      dir.multiplyScalar(distance);
      const newPos = new THREE.Vector3().addVectors(target, dir);
      camera.position.copy(newPos);

      controls.target.copy(target);
      controls.update();
    } catch (e) {
      console.warn("[ThreeScene] 相机重置失败:", e);
    }

    if (onModelRendered) onModelRendered();
  }, [onModelRendered]);

  return (
    <div className="relative w-full h-full">
      <Canvas shadows gl={{ preserveDrawingBuffer: true }}>
        <Suspense fallback={<LoadingPreview params={params} />}>
          <PerspectiveCamera ref={cameraRef} makeDefault position={[14, 14, 14]} />
          <OrbitControls ref={controlsRef} makeDefault target={[0, 0, 0]} />

          {/* Neutral white lighting so white materials appear neutral */}
          <hemisphereLight skyColor={0xffffff} groundColor={0x000000} intensity={0.06} />
          <ambientLight color={0xffffff} intensity={0.6} />
          <directionalLight color={0xffffff} position={[8, 12, 6]} intensity={0.95} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
          <pointLight color={0xffffff} position={[-8, -6, -10]} intensity={0.18} />
          <pointLight color={0xffffff} position={[4, 6, -6]} intensity={0.12} />

          {/* subtle ground to catch light */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.2, 0]} receiveShadow>
            <planeGeometry args={[200, 200]} />
            <meshStandardMaterial color={0x060606} metalness={0.2} roughness={0.7} emissive={0x000000} />
          </mesh>

          <Model
            url={modelUrl}
            params={params}
            onRendered={handleModelRenderedInternal}
          />

          {/* 网格已移除，如需恢复请取消注释 */}
        </Suspense>
      </Canvas>
    </div>
  );
}