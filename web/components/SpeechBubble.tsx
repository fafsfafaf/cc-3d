'use client';
import { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';

type Props = {
  text: string | null;
  triggerKey: number; // increments to re-show
};

// Pops up over a character for ~3s when triggerKey changes.
export default function SpeechBubble({ text, triggerKey }: Props) {
  const [visibleAt, setVisibleAt] = useState(0);
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (!text || triggerKey === 0) return;
    setVisibleAt(performance.now() / 1000);
  }, [triggerKey, text]);

  useFrame((state) => {
    const g = groupRef.current;
    if (!g) return;
    const elapsed = state.clock.elapsedTime - visibleAt;
    const lifetime = 3.0;
    if (elapsed > lifetime || visibleAt === 0) {
      g.visible = false;
      return;
    }
    g.visible = true;
    // Fade out in last 0.6s + slight rise
    const fadeT = Math.max(0, (lifetime - elapsed) / 0.6);
    g.position.y = 1.95 + Math.min(elapsed * 0.6, 0.3);
    g.scale.setScalar(Math.min(1, elapsed * 6) * Math.min(1, fadeT));
  });

  if (!text) return null;
  const display = text.length > 40 ? text.slice(0, 39) + '…' : text;

  return (
    <group ref={groupRef} position={[0, 1.95, 0]} visible={false}>
      <Billboard>
        {/* Bubble background */}
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[Math.max(0.8, display.length * 0.085), 0.36]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.96} />
        </mesh>
        <mesh position={[0, 0, -0.005]}>
          <planeGeometry args={[Math.max(0.8, display.length * 0.085) - 0.04, 0.32]} />
          <meshBasicMaterial color="#1a2433" transparent opacity={0.95} />
        </mesh>
        {/* Text */}
        <Text fontSize={0.13} color="#ffffff" anchorX="center" anchorY="middle" maxWidth={5}>
          {display}
        </Text>
        {/* Tail */}
        <mesh position={[0, -0.22, -0.005]} rotation={[0, 0, Math.PI / 4]}>
          <planeGeometry args={[0.12, 0.12]} />
          <meshBasicMaterial color="#1a2433" />
        </mesh>
      </Billboard>
    </group>
  );
}
