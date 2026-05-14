'use client';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text, ContactShadows } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import type { Session } from '@/lib/useSessions';
import VoxelAgent from './VoxelAgent';
import VoxelSubagent from './VoxelSubagent';
import FreeCameraControls from './FreeCameraControls';

type Props = {
  sessions: Session[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  pulses: Record<string, number>;
  freeCam: boolean;
};

const ROOM_SIZE: [number, number, number] = [16, 8, 14];
const ROOM_OFFSET = 11;

export default function Scene({ sessions, selectedId, onSelect, pulses, freeCam }: Props) {
  const active = sessions.filter((s) => s.status === 'active');
  const idle = sessions.filter((s) => s.status === 'idle');

  return (
    <Canvas
      shadows
      camera={{ position: [0, 6, 22], fov: 55 }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={['#1a2433']} />
      <fog attach="fog" args={['#1a2433', 50, 100]} />

      <ambientLight intensity={1.2} />
      <hemisphereLight args={['#ffe4c0', '#3a4a6c', 0.8]} />
      <directionalLight
        position={[15, 22, 10]}
        intensity={1.4}
        color="#fff5e0"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={60}
        shadow-camera-left={-35}
        shadow-camera-right={35}
        shadow-camera-top={25}
        shadow-camera-bottom={-25}
      />
      <directionalLight position={[-10, 15, -8]} intensity={0.6} color="#a8c8ff" />
      <pointLight position={[-ROOM_OFFSET, 6, 0]} intensity={3.5} color="#ffd089" distance={32} decay={1.3} />
      <pointLight position={[-ROOM_OFFSET, 6, -4]} intensity={1.5} color="#ffb347" distance={20} decay={1.5} />
      <pointLight position={[-ROOM_OFFSET, 6, 4]} intensity={1.5} color="#ffb347" distance={20} decay={1.5} />
      <pointLight position={[ROOM_OFFSET, 6, 0]} intensity={3.0} color="#a8c8ff" distance={32} decay={1.3} />
      <pointLight position={[ROOM_OFFSET, 6, -4]} intensity={1.3} color="#5a8fff" distance={20} decay={1.5} />
      <pointLight position={[ROOM_OFFSET, 6, 4]} intensity={1.3} color="#5a8fff" distance={20} decay={1.5} />
      <pointLight position={[0, 5, 8]} intensity={0.8} color="#ffffff" distance={20} />

      <Room
        position={[-ROOM_OFFSET, 0, 0]}
        size={ROOM_SIZE}
        floorColor="#a87852"
        wallColor="#d4a878"
        accentColor="#ff8c1a"
        label="ACTIVE WORKSHOP"
        sideOuter="left"
      />
      <Room
        position={[ROOM_OFFSET, 0, 0]}
        size={ROOM_SIZE}
        floorColor="#5878a8"
        wallColor="#7898c8"
        accentColor="#1a5cff"
        label="IDLE OFFICE"
        sideOuter="right"
      />

      {/* Connecting bridge floor */}
      <mesh receiveShadow position={[0, -3.99, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ROOM_OFFSET * 2 - ROOM_SIZE[0], ROOM_SIZE[2]]} />
        <meshStandardMaterial color="#6c7a8c" roughness={0.92} />
      </mesh>

      <AgentGrid
        sessions={active}
        roomCenter={[-ROOM_OFFSET, -3.18, 0]}
        roomSize={ROOM_SIZE}
        selectedId={selectedId}
        onSelect={onSelect}
        pulses={pulses}
      />
      <AgentGrid
        sessions={idle}
        roomCenter={[ROOM_OFFSET, -3.18, 0]}
        roomSize={ROOM_SIZE}
        selectedId={selectedId}
        onSelect={onSelect}
        pulses={pulses}
      />

      <ContactShadows position={[0, -3.98, 0]} opacity={0.4} scale={50} blur={2.5} far={8} />

      {!freeCam && (
        <OrbitControls
          enablePan
          panSpeed={0.6}
          minDistance={6}
          maxDistance={45}
          minPolarAngle={0.15}
          maxPolarAngle={Math.PI / 2 - 0.05}
          target={[0, 0, 0]}
        />
      )}
      {freeCam && <FreeCameraControls enabled={freeCam} />}
    </Canvas>
  );
}

function Room({
  position,
  size,
  floorColor,
  wallColor,
  accentColor,
  label,
  sideOuter,
}: {
  position: [number, number, number];
  size: [number, number, number];
  floorColor: string;
  wallColor: string;
  accentColor: string;
  label: string;
  sideOuter: 'left' | 'right';
}) {
  const [w, h, d] = size;
  const isLeft = sideOuter === 'left';
  return (
    <group position={position}>
      {/* Floor */}
      <mesh receiveShadow position={[0, -h / 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={floorColor} roughness={0.92} metalness={0.1} />
      </mesh>
      {/* Floor pixel-grid pattern */}
      <gridHelper args={[w, w, accentColor, '#000']} position={[0, -h / 2 + 0.005, 0]}>
        <meshBasicMaterial transparent opacity={0.08} attach="material" />
      </gridHelper>
      {/* Back wall */}
      <mesh position={[0, 0, -d / 2]} receiveShadow>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial color={wallColor} roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      {/* Outer side wall */}
      <mesh position={[isLeft ? -w / 2 : w / 2, 0, 0]} rotation={[0, isLeft ? Math.PI / 2 : -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[d, h]} />
        <meshStandardMaterial color={wallColor} roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      {/* Front wall (low, like a pony wall) */}
      <mesh position={[0, -h / 2 + 0.6, d / 2]}>
        <planeGeometry args={[w, 1.2]} />
        <meshStandardMaterial color={wallColor} roughness={0.95} side={THREE.DoubleSide} />
      </mesh>

      {/* Accent stripe on back wall */}
      <mesh position={[0, h / 2 - 0.6, -d / 2 + 0.01]}>
        <planeGeometry args={[w * 0.95, 0.18]} />
        <meshBasicMaterial color={accentColor} transparent opacity={0.85} />
      </mesh>

      {/* Corner pillars */}
      {[
        [-w / 2 + 0.15, 0, -d / 2 + 0.15],
        [w / 2 - 0.15, 0, -d / 2 + 0.15],
        [-w / 2 + 0.15, 0, d / 2 - 0.15],
        [w / 2 - 0.15, 0, d / 2 - 0.15],
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]} castShadow>
          <boxGeometry args={[0.3, h, 0.3]} />
          <meshStandardMaterial color={wallColor} roughness={0.85} />
        </mesh>
      ))}

      {/* Top light strip */}
      <mesh position={[0, h / 2 - 0.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[w * 0.18, w * 0.22, 4]} />
        <meshBasicMaterial color={accentColor} transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>

      {/* Floor label */}
      <Text
        position={[0, -h / 2 + 0.02, d / 2 - 1.4]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.45}
        color={accentColor}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.22}
        outlineWidth={0.012}
        outlineColor="#000"
      >
        {label}
      </Text>
    </group>
  );
}

function AgentGrid({
  sessions,
  roomCenter,
  roomSize,
  selectedId,
  onSelect,
  pulses,
}: {
  sessions: Session[];
  roomCenter: [number, number, number];
  roomSize: [number, number, number];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  pulses: Record<string, number>;
}) {
  const positions = useMemo(() => layoutAgents(sessions.length, roomSize), [sessions.length, roomSize]);
  return (
    <group position={roomCenter}>
      {sessions.map((s, i) => {
        const subs = (s.subagents || []).slice(0, 5);
        return (
          <group key={s.sessionId} position={positions[i]}>
            <VoxelAgent
              position={[0, 0.85, 0]}
              sessionId={s.sessionId}
              projectName={s.projectName}
              model={s.model}
              status={s.status === 'active' ? 'active' : 'idle'}
              selected={selectedId === s.sessionId}
              pulse={pulses[s.sessionId] || 0}
              onClick={() => onSelect(s.sessionId)}
              subagentBadge={subs.length}
              lastEventLabel={formatLastEvent(s)}
            />
            {subs.map((sub, j) => (
              <VoxelSubagent
                key={j}
                parentSessionId={s.sessionId}
                index={j}
                total={subs.length}
                agentType={sub.agentType}
                status={sub.status === 'active' ? 'active' : 'idle'}
              />
            ))}
          </group>
        );
      })}
    </group>
  );
}

function layoutAgents(count: number, roomSize: [number, number, number]): [number, number, number][] {
  if (count === 0) return [];
  const [w, , d] = roomSize;
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const xStep = (w * 0.7) / Math.max(cols, 1);
  const zStep = (d * 0.7) / Math.max(rows, 1);
  const positions: [number, number, number][] = [];
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = (c - (cols - 1) / 2) * xStep;
    const z = (r - (rows - 1) / 2) * zStep;
    positions.push([x, 0, z]);
  }
  return positions;
}

function formatLastEvent(s: Session): string {
  if (s.lastToolCall) return `${s.lastToolCall.name}: ${s.lastToolCall.description || ''}`;
  if (s.lastAssistantText) return s.lastAssistantText;
  if (s.lastUserPrompt) return `> ${s.lastUserPrompt}`;
  return s.lastEventType || '?';
}
