'use client';
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';

type Props = {
  parentSessionId: string;
  index: number;
  total: number;
  agentType: string;
  status: 'active' | 'idle' | 'done';
};

function hashStr(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return h >>> 0;
}

export default function VoxelSubagent({ parentSessionId, index, total, agentType, status }: Props) {
  const ref = useRef<THREE.Group>(null);
  const seed = useMemo(() => hashStr(parentSessionId + agentType + index) % 360, [parentSessionId, agentType, index]);
  const skin = useMemo(() => new THREE.Color().setHSL(seed / 360, 0.45, 0.65), [seed]);
  const shirt = useMemo(() => new THREE.Color().setHSL(((seed + 120) % 360) / 360, 0.7, 0.5), [seed]);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime + (index / Math.max(total, 1)) * Math.PI * 2;
    const radius = 1.4;
    const speed = status === 'active' ? 0.8 : 0.3;
    ref.current.position.x = Math.cos(t * speed) * radius;
    ref.current.position.y = -0.4 + Math.abs(Math.sin(t * speed * 4)) * 0.05;
    ref.current.position.z = Math.sin(t * speed) * radius;
    ref.current.rotation.y = t * speed + Math.PI / 2;
  });

  return (
    <group ref={ref} scale={0.45}>
      {/* Mini body */}
      <mesh position={[0, -0.05, 0]}>
        <boxGeometry args={[0.45, 0.55, 0.28]} />
        <meshStandardMaterial color={shirt} flatShading />
      </mesh>
      {/* Head */}
      <mesh position={[0, 0.45, 0]}>
        <boxGeometry args={[0.36, 0.36, 0.36]} />
        <meshStandardMaterial color={skin} flatShading />
      </mesh>
      {/* Eyes */}
      <mesh position={[-0.07, 0.48, 0.185]}>
        <boxGeometry args={[0.05, 0.05, 0.02]} />
        <meshBasicMaterial color="#0a0a0a" />
      </mesh>
      <mesh position={[0.07, 0.48, 0.185]}>
        <boxGeometry args={[0.05, 0.05, 0.02]} />
        <meshBasicMaterial color="#0a0a0a" />
      </mesh>
      {/* Cape (purple = subagent) */}
      <mesh position={[0, -0.05, -0.16]}>
        <boxGeometry args={[0.5, 0.6, 0.05]} />
        <meshStandardMaterial color="#c08bff" emissive="#c08bff" emissiveIntensity={0.3} flatShading />
      </mesh>
      {/* Type label */}
      <Billboard position={[0, 1.0, 0]}>
        <Text fontSize={0.18} color="#c08bff" anchorX="center" anchorY="middle" outlineWidth={0.012} outlineColor="#000">
          {agentType}
        </Text>
      </Billboard>
    </group>
  );
}
