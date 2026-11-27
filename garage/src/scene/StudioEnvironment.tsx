import { createPortal, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { HalfFloatType, Scene, WebGLCubeRenderTarget, type CubeCamera } from 'three';

/**
 * Lights the garage's reflections with `children` (Lightformers), rendered once into a cube map, as drei's
 * <Environment frames={1}> does with children. drei's component also loads HDR, EXR and gain-map files, which this
 * garage never uses but which cost the bundle about 17 KB gzip.
 */
export function StudioEnvironment({ resolution = 256, children }: { resolution?: number; children: ReactNode }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const studio = useMemo(() => new Scene(), []);
  const camera = useRef<CubeCamera>(null);
  const target = useMemo(() => {
    const cube = new WebGLCubeRenderTarget(resolution);
    cube.texture.type = HalfFloatType;
    return cube;
  }, [resolution]);
  useEffect(() => () => target.dispose(), [target]);

  useLayoutEffect(() => {
    const autoClear = gl.autoClear;
    gl.autoClear = true;
    camera.current!.update(gl, studio);
    gl.autoClear = autoClear;
    const previous = scene.environment;
    scene.environment = target.texture;
    return () => {
      scene.environment = previous;
    };
  }, [children, gl, studio, target, scene]);

  return createPortal(
    <>
      {children}
      <cubeCamera ref={camera} args={[0.1, 1000, target]} />
    </>,
    studio,
  );
}
