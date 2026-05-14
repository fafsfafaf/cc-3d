'use client';
import { useRef, useMemo } from 'react';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import { Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';

type Props = {
  position: [number, number, number];
  sessionId: string;
  projectName: string;
  model: string;
  status: 'active' | 'idle' | 'done';
  selected: boolean;
  pulse: number;
  onClick: () => void;
  subagentBadge?: number;
  lastEventLabel?: string;
};

// Deterministic colors from sessionId
function hashStr(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return h >>> 0;
}

function colorsFor(sessionId: string) {
  const h = hashStr(sessionId);
  const skinHue = h % 360;
  const shirtHue = (h >> 8) % 360;
  const pantsHue = (h >> 16) % 360;
  return {
    skin: new THREE.Color().setHSL(skinHue / 360, 0.45, 0.62),
    shirt: new THREE.Color().setHSL(shirtHue / 360, 0.7, 0.5),
    pants: new THREE.Color().setHSL(pantsHue / 360, 0.55, 0.35),
    hair: new THREE.Color().setHSL(((h >> 24) % 360) / 360, 0.5, 0.25),
  };
}

function hatFor(model: string) {
  if (!model) return null;
  if (model.includes('opus')) return { color: '#ffb347', kind: 'crown' };
  if (model.includes('sonnet')) return { color: '#5a8fff', kind: 'cap' };
  if (model.includes('haiku')) return { color: '#6cffb0', kind: 'bandana' };
  return null;
}

export default function VoxelAgent({
  position,
  sessionId,
  projectName,
  model,
  status,
  selected,
  pulse,
  onClick,
  subagentBadge,
  lastEventLabel,
}: Props) {
  const ref = useRef<THREE.Group>(null);
  const armLRef = useRef<THREE.Group>(null);
  const armRRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const auraRef = useRef<THREE.Mesh>(null);
  const bodyEmissiveRef = useRef<THREE.MeshStandardMaterial>(null);
  const colors = useMemo(() => colorsFor(sessionId), [sessionId]);
  const hat = useMemo(() => hatFor(model || ''), [model]);
  const seed = useMemo(() => (hashStr(sessionId) % 1000) / 1000, [sessionId]);

  useFrame((state, delta) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime + seed * 100;

    if (status === 'active') {
      // Bouncing + typing animation
      ref.current.position.y = position[1] + Math.abs(Math.sin(t * 4)) * 0.06;
      if (armLRef.current) armLRef.current.rotation.x = Math.sin(t * 8) * 0.6 - 0.3;
      if (armRRef.current) armRRef.current.rotation.x = -Math.sin(t * 8) * 0.6 - 0.3;
      if (headRef.current) headRef.current.rotation.y = Math.sin(t * 0.7) * 0.15;
    } else {
      // Idle: gentle look-around
      ref.current.position.y = position[1];
      if (armLRef.current) armLRef.current.rotation.x = 0;
      if (armRRef.current) armRRef.current.rotation.x = 0;
      if (headRef.current) headRef.current.rotation.y = Math.sin(t * 0.4) * 0.5;
    }

    // Pulse aura on tool calls
    if (auraRef.current) {
      const elapsedSinceP = state.clock.elapsedTime - pulse;
      const intensity = pulse > 0 && elapsedSinceP < 1.2 ? 1 - elapsedSinceP / 1.2 : 0;
      const scale = 1 + intensity * 0.6;
      auraRef.current.scale.set(scale, scale, scale);
      (auraRef.current.material as THREE.MeshBasicMaterial).opacity = intensity * 0.45;
    }

    // Body emissive boost when selected
    if (bodyEmissiveRef.current) {
      const target = selected ? 0.6 : 0;
      bodyEmissiveRef.current.emissiveIntensity += (target - bodyEmissiveRef.current.emissiveIntensity) * 0.15;
    }
  });

  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onClick();
  };

  const auraColor = status === 'active' ? '#ffb347' : '#5a8fff';

  return (
    <group ref={ref} position={position} onClick={click}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { document.body.style.cursor = 'default'; }}
    >
      {/* Aura ring on the floor */}
      <mesh ref={auraRef} position={[0, -0.85, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.45, 0.62, 24]} />
        <meshBasicMaterial color={auraColor} transparent opacity={0.0} side={THREE.DoubleSide} />
      </mesh>

      {/* Selection ring (always visible if selected) */}
      {selected && (
        <mesh position={[0, -0.84, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.55, 0.7, 32]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.85} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Legs */}
      <mesh position={[-0.13, -0.55, 0]} castShadow>
        <boxGeometry args={[0.22, 0.5, 0.22]} />
        <meshStandardMaterial color={colors.pants} roughness={0.85} flatShading />
      </mesh>
      <mesh position={[0.13, -0.55, 0]} castShadow>
        <boxGeometry args={[0.22, 0.5, 0.22]} />
        <meshStandardMaterial color={colors.pants} roughness={0.85} flatShading />
      </mesh>

      {/* Body */}
      <mesh position={[0, -0.05, 0]} castShadow>
        <boxGeometry args={[0.55, 0.7, 0.32]} />
        <meshStandardMaterial
          ref={bodyEmissiveRef}
          color={colors.shirt}
          emissive={auraColor}
          emissiveIntensity={0}
          roughness={0.7}
          flatShading
        />
      </mesh>

      {/* Arms (pivot at top of arm so swinging looks right) */}
      <group ref={armLRef} position={[-0.36, 0.2, 0]}>
        <mesh position={[0, -0.32, 0]} castShadow>
          <boxGeometry args={[0.18, 0.62, 0.18]} />
          <meshStandardMaterial color={colors.shirt} roughness={0.75} flatShading />
        </mesh>
      </group>
      <group ref={armRRef} position={[0.36, 0.2, 0]}>
        <mesh position={[0, -0.32, 0]} castShadow>
          <boxGeometry args={[0.18, 0.62, 0.18]} />
          <meshStandardMaterial color={colors.shirt} roughness={0.75} flatShading />
        </mesh>
      </group>

      {/* Head + Face */}
      <group ref={headRef} position={[0, 0.55, 0]}>
        {/* Hair (top of head) */}
        <mesh position={[0, 0.22, 0]} castShadow>
          <boxGeometry args={[0.46, 0.1, 0.42]} />
          <meshStandardMaterial color={colors.hair} roughness={0.9} flatShading />
        </mesh>
        {/* Head */}
        <mesh castShadow>
          <boxGeometry args={[0.42, 0.42, 0.42]} />
          <meshStandardMaterial color={colors.skin} roughness={0.6} flatShading />
        </mesh>
        {/* Eyes */}
        <mesh position={[-0.09, 0.05, 0.215]}>
          <boxGeometry args={[0.06, 0.06, 0.02]} />
          <meshBasicMaterial color="#0a0a0a" />
        </mesh>
        <mesh position={[0.09, 0.05, 0.215]}>
          <boxGeometry args={[0.06, 0.06, 0.02]} />
          <meshBasicMaterial color="#0a0a0a" />
        </mesh>
        {/* Mouth */}
        <mesh position={[0, -0.08, 0.215]}>
          <boxGeometry args={[0.12, 0.03, 0.02]} />
          <meshBasicMaterial color="#3a2418" />
        </mesh>

        {/* Hat */}
        {hat && hat.kind === 'crown' && (
          <group position={[0, 0.32, 0]}>
            {[-0.15, -0.05, 0.05, 0.15].map((x, i) => (
              <mesh key={i} position={[x, 0.05, 0]}>
                <boxGeometry args={[0.06, 0.12, 0.32]} />
                <meshStandardMaterial color={hat.color} emissive={hat.color} emissiveIntensity={0.3} flatShading />
              </mesh>
            ))}
            <mesh>
              <boxGeometry args={[0.42, 0.06, 0.42]} />
              <meshStandardMaterial color={hat.color} emissive={hat.color} emissiveIntensity={0.3} flatShading />
            </mesh>
          </group>
        )}
        {hat && hat.kind === 'cap' && (
          <>
            <mesh position={[0, 0.27, 0]}>
              <boxGeometry args={[0.46, 0.14, 0.46]} />
              <meshStandardMaterial color={hat.color} flatShading />
            </mesh>
            <mesh position={[0, 0.21, 0.28]}>
              <boxGeometry args={[0.46, 0.04, 0.18]} />
              <meshStandardMaterial color={hat.color} flatShading />
            </mesh>
          </>
        )}
        {hat && hat.kind === 'bandana' && (
          <mesh position={[0, 0.18, 0]}>
            <boxGeometry args={[0.46, 0.08, 0.46]} />
            <meshStandardMaterial color={hat.color} flatShading />
          </mesh>
        )}
      </group>

      {/* Subagent badge (small floating sphere over right shoulder) */}
      {subagentBadge && subagentBadge > 0 ? (
        <group position={[0.45, 0.65, 0]}>
          <mesh>
            <sphereGeometry args={[0.11, 12, 12]} />
            <meshStandardMaterial color="#c08bff" emissive="#c08bff" emissiveIntensity={0.6} />
          </mesh>
          <Billboard>
            <Text fontSize={0.13} color="#1a0a2e" anchorX="center" anchorY="middle" position={[0, 0, 0.12]}>
              {String(subagentBadge)}
            </Text>
          </Billboard>
        </group>
      ) : null}

      {/* Floating name tag */}
      <Billboard position={[0, 1.35, 0]}>
        <Text fontSize={0.16} color="#f4f8ff" anchorX="center" anchorY="middle" outlineWidth={0.012} outlineColor="#000">
          {projectName.length > 16 ? projectName.slice(0, 15) + '…' : projectName}
        </Text>
        <Text fontSize={0.1} color={status === 'active' ? '#ffb347' : '#7eb6ff'} anchorX="center" anchorY="middle" position={[0, -0.18, 0]} outlineWidth={0.008} outlineColor="#000">
          {sessionId.slice(0, 8)}
        </Text>
        {selected && lastEventLabel ? (
          <Text fontSize={0.085} color="#cdd9ec" anchorX="center" anchorY="middle" position={[0, -0.34, 0]} maxWidth={3} outlineWidth={0.006} outlineColor="#000">
            {lastEventLabel.length > 50 ? lastEventLabel.slice(0, 49) + '…' : lastEventLabel}
          </Text>
        ) : null}
      </Billboard>
    </group>
  );
}
