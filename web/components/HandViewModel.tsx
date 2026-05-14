'use client';
import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

type Props = {
  enabled: boolean;
};

// Static Minecraft-style first-person hand attached to the camera.
// Bigger, more visible, no animation.
export default function HandViewModel({ enabled }: Props) {
  const handRef = useRef<THREE.Group>(null);
  const { camera } = useThree();

  useFrame(() => {
    const g = handRef.current;
    if (!g || !enabled) return;

    g.position.copy(camera.position);
    g.quaternion.copy(camera.quaternion);

    // Larger offset: closer + lower-right + slightly bigger angle
    g.translateX(0.55);
    g.translateY(-0.55);
    g.translateZ(-0.85);

    g.rotateY(-0.18);
    g.rotateX(-0.15);
  });

  if (!enabled) return null;

  return (
    <group ref={handRef} renderOrder={999} scale={1.6}>
      {/* Forearm */}
      <mesh position={[0, -0.25, 0]}>
        <boxGeometry args={[0.18, 0.55, 0.18]} />
        <meshStandardMaterial color="#e8c8a8" roughness={0.7} flatShading depthTest={false} />
      </mesh>
      {/* Sleeve cuff */}
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[0.21, 0.14, 0.21]} />
        <meshStandardMaterial color="#5a8fff" roughness={0.85} flatShading depthTest={false} />
      </mesh>
      {/* Hand (knuckles) */}
      <mesh position={[0, -0.6, 0.02]}>
        <boxGeometry args={[0.24, 0.22, 0.22]} />
        <meshStandardMaterial color="#e8c8a8" roughness={0.7} flatShading depthTest={false} />
      </mesh>
      {/* Thumb */}
      <mesh position={[0.16, -0.55, 0.04]}>
        <boxGeometry args={[0.09, 0.18, 0.13]} />
        <meshStandardMaterial color="#d8b898" roughness={0.7} flatShading depthTest={false} />
      </mesh>
      {/* Fingernail / knuckle ridge for extra definition */}
      <mesh position={[0, -0.7, 0.13]}>
        <boxGeometry args={[0.22, 0.04, 0.02]} />
        <meshStandardMaterial color="#c8a888" roughness={0.7} flatShading depthTest={false} />
      </mesh>
    </group>
  );
}
