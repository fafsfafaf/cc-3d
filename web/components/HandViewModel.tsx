'use client';
import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

type Props = {
  enabled: boolean;
};

// Minecraft-style first-person hand attached to the camera.
// Hangs in the bottom-right of the screen, bobs while walking, punches on click.
export default function HandViewModel({ enabled }: Props) {
  const handRef = useRef<THREE.Group>(null);
  const punchUntil = useRef(0);
  const lastCamPos = useRef(new THREE.Vector3());
  const movingAmount = useRef(0); // smoothed 0..1
  const initialized = useRef(false);
  const { camera, gl } = useThree();

  useEffect(() => {
    if (!enabled) {
      initialized.current = false;
      return;
    }
    const onClick = () => {
      punchUntil.current = performance.now() / 1000 + 0.35;
    };
    const dom = gl.domElement;
    dom.addEventListener('click', onClick);
    return () => dom.removeEventListener('click', onClick);
  }, [enabled, gl]);

  useFrame((state, delta) => {
    const g = handRef.current;
    if (!g || !enabled) return;

    // Detect movement by comparing camera position frame-to-frame
    if (!initialized.current) {
      lastCamPos.current.copy(camera.position);
      initialized.current = true;
    }
    const moveDist = camera.position.distanceTo(lastCamPos.current) / Math.max(delta, 0.001);
    lastCamPos.current.copy(camera.position);
    const walkingNow = moveDist > 1.0 ? 1 : 0;
    movingAmount.current += (walkingNow - movingAmount.current) * Math.min(1, delta * 6);

    // Reset transform
    g.position.copy(camera.position);
    g.quaternion.copy(camera.quaternion);

    g.translateX(0.45);
    g.translateY(-0.42);
    g.translateZ(-0.7);

    g.rotateY(-0.18);
    g.rotateX(-0.15);

    const t = state.clock.elapsedTime;
    const bobAmt = movingAmount.current;
    if (bobAmt > 0.01) {
      g.translateY(Math.sin(t * 8) * 0.022 * bobAmt);
      g.translateX(Math.cos(t * 8) * 0.018 * bobAmt);
      g.rotateZ(Math.sin(t * 8) * 0.05 * bobAmt);
    } else {
      g.translateY(Math.sin(t * 1.5) * 0.006);
    }

    const punchT = Math.max(0, punchUntil.current - t);
    if (punchT > 0) {
      const p = punchT / 0.35;
      const e = Math.sin(p * Math.PI);
      g.translateZ(-e * 0.35);
      g.translateY(-e * 0.05);
      g.rotateX(-e * 0.7);
    }
  });

  if (!enabled) return null;

  return (
    <group ref={handRef} renderOrder={999}>
      {/* Forearm */}
      <mesh position={[0, -0.25, 0]}>
        <boxGeometry args={[0.16, 0.5, 0.16]} />
        <meshStandardMaterial color="#e8c8a8" roughness={0.7} flatShading depthTest={false} />
      </mesh>
      {/* Sleeve cuff */}
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[0.18, 0.12, 0.18]} />
        <meshStandardMaterial color="#5a8fff" roughness={0.85} flatShading depthTest={false} />
      </mesh>
      {/* Hand (knuckles) */}
      <mesh position={[0, -0.55, 0.02]}>
        <boxGeometry args={[0.2, 0.18, 0.18]} />
        <meshStandardMaterial color="#e8c8a8" roughness={0.7} flatShading depthTest={false} />
      </mesh>
      {/* Thumb */}
      <mesh position={[0.13, -0.5, 0.02]}>
        <boxGeometry args={[0.07, 0.14, 0.1]} />
        <meshStandardMaterial color="#d8b898" roughness={0.7} flatShading depthTest={false} />
      </mesh>
    </group>
  );
}
