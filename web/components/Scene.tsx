'use client';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Session } from '@/lib/useSessions';
import VoxelAgent from './VoxelAgent';
import VoxelSubagent from './VoxelSubagent';
import FreeCameraControls from './FreeCameraControls';
import HandViewModel from './HandViewModel';

type CamMode = 'orbit' | 'fly' | 'walk';

type Props = {
  sessions: Session[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  pulses: Record<string, number>;
  camMode: CamMode;
};

const ROOM_SIZE: [number, number, number] = [16, 8, 14];
const ROOM_OFFSET = 11;
const FLOOR_Y = -3.18;

export default function Scene({ sessions, selectedId, onSelect, pulses, camMode }: Props) {
  return (
    <Canvas
      shadows={false}
      dpr={[1, 1.5]}
      performance={{ min: 0.5 }}
      camera={{ position: [0, 6, 22], fov: 55 }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={['#1a2433']} />
      <fog attach="fog" args={['#1a2433', 50, 100]} />

      <ambientLight intensity={1.2} />
      <hemisphereLight args={['#ffe4c0', '#3a4a6c', 0.8]} />
      <directionalLight position={[15, 22, 10]} intensity={1.6} color="#fff5e0" />
      <directionalLight position={[-10, 15, -8]} intensity={0.7} color="#a8c8ff" />
      <pointLight position={[-ROOM_OFFSET, 6, 0]} intensity={3.5} color="#ffd089" distance={32} decay={1.3} />
      <pointLight position={[ROOM_OFFSET, 6, 0]} intensity={3.0} color="#a8c8ff" distance={32} decay={1.3} />

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

      {/* Connecting bridge floor (where agents walk between rooms) */}
      <mesh position={[0, -3.99, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ROOM_OFFSET * 2 - ROOM_SIZE[0], ROOM_SIZE[2]]} />
        <meshStandardMaterial color="#6c7a8c" roughness={0.92} />
      </mesh>
      {/* Bridge accent line on floor */}
      <mesh position={[0, -3.985, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ROOM_OFFSET * 2 - ROOM_SIZE[0], 0.4]} />
        <meshBasicMaterial color="#9eafc4" />
      </mesh>

      <AgentWorld
        sessions={sessions}
        selectedId={selectedId}
        onSelect={onSelect}
        pulses={pulses}
      />

      {camMode === 'orbit' && (
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
      {camMode !== 'orbit' && <FreeCameraControls enabled={true} walkMode={camMode === 'walk'} />}
      <HandViewModel enabled={camMode === 'walk'} />
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
      <mesh position={[0, -h / 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={floorColor} roughness={0.92} metalness={0.1} />
      </mesh>
      <gridHelper args={[w, w, accentColor, '#000']} position={[0, -h / 2 + 0.005, 0]}>
        <meshBasicMaterial transparent opacity={0.08} attach="material" />
      </gridHelper>
      <mesh position={[0, 0, -d / 2]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial color={wallColor} roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[isLeft ? -w / 2 : w / 2, 0, 0]} rotation={[0, isLeft ? Math.PI / 2 : -Math.PI / 2, 0]}>
        <planeGeometry args={[d, h]} />
        <meshStandardMaterial color={wallColor} roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -h / 2 + 0.6, d / 2]}>
        <planeGeometry args={[w, 1.2]} />
        <meshStandardMaterial color={wallColor} roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, h / 2 - 0.6, -d / 2 + 0.01]}>
        <planeGeometry args={[w * 0.95, 0.18]} />
        <meshBasicMaterial color={accentColor} transparent opacity={0.85} />
      </mesh>
      {[
        [-w / 2 + 0.15, 0, -d / 2 + 0.15],
        [w / 2 - 0.15, 0, -d / 2 + 0.15],
        [-w / 2 + 0.15, 0, d / 2 - 0.15],
        [w / 2 - 0.15, 0, d / 2 - 0.15],
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]}>
          <boxGeometry args={[0.3, h, 0.3]} />
          <meshStandardMaterial color={wallColor} roughness={0.85} />
        </mesh>
      ))}
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

// Each agent gets a "home slot" assigned per status. When status flips,
// the home target moves smoothly to the new room — VoxelAgent walks there.
function AgentWorld({
  sessions,
  selectedId,
  onSelect,
  pulses,
}: {
  sessions: Session[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  pulses: Record<string, number>;
}) {
  const visible = useMemo(
    () => sessions.filter((s) => s.status === 'active' || s.status === 'idle'),
    [sessions],
  );
  const active = useMemo(() => visible.filter((s) => s.status === 'active'), [visible]);
  const idle = useMemo(() => visible.filter((s) => s.status === 'idle'), [visible]);

  const activePos = useMemo(() => layoutAgents(active.length, ROOM_SIZE), [active.length]);
  const idlePos = useMemo(() => layoutAgents(idle.length, ROOM_SIZE), [idle.length]);

  const targetById = useMemo(() => {
    const map = new Map<string, [number, number, number]>();
    active.forEach((s, i) => {
      const p = activePos[i];
      map.set(s.sessionId, [p[0] + -ROOM_OFFSET, FLOOR_Y, p[2]]);
    });
    idle.forEach((s, i) => {
      const p = idlePos[i];
      map.set(s.sessionId, [p[0] + ROOM_OFFSET, FLOOR_Y, p[2]]);
    });
    return map;
  }, [active, idle, activePos, idlePos]);

  return (
    <>
      {visible.map((s) => {
        const target = targetById.get(s.sessionId)!;
        const subs = (s.subagents || []).slice(0, 5);
        return (
          <WalkingAgent
            key={s.sessionId}
            target={target}
            session={s}
            selected={selectedId === s.sessionId}
            pulse={pulses[s.sessionId] || 0}
            onClick={() => onSelect(s.sessionId)}
            subs={subs}
          />
        );
      })}
    </>
  );
}

function WalkingAgent({
  target,
  session,
  selected,
  pulse,
  onClick,
  subs,
}: {
  target: [number, number, number];
  session: Session;
  selected: boolean;
  pulse: number;
  onClick: () => void;
  subs: Session['subagents'];
}) {
  const groupRef = useRef<THREE.Group>(null);
  const initialized = useRef(false);
  const facing = useRef(0);

  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;
    if (!initialized.current) {
      g.position.set(target[0], target[1], target[2]);
      initialized.current = true;
      return;
    }
    const dx = target[0] - g.position.x;
    const dz = target[2] - g.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 0.02) {
      const speed = Math.min(8, dist * 2.5);
      const step = Math.min(dist, speed * delta);
      g.position.x += (dx / dist) * step;
      g.position.z += (dz / dist) * step;
      facing.current = Math.atan2(dx, dz);
    }
    g.rotation.y += (facing.current - g.rotation.y) * 0.12;
    g.position.y += (target[1] - g.position.y) * 0.1;
  });

  return (
    <group ref={groupRef}>
      <VoxelAgent
        position={[0, 0.85, 0]}
        sessionId={session.sessionId}
        projectName={session.projectName}
        model={session.model}
        status={session.status === 'active' ? 'active' : 'idle'}
        selected={selected}
        pulse={pulse}
        onClick={onClick}
        subagentBadge={subs.length}
        lastEventLabel={formatLastEvent(session)}
      />
      {subs.map((sub, j) => (
        <VoxelSubagent
          key={j}
          parentSessionId={session.sessionId}
          index={j}
          total={subs.length}
          agentType={sub.agentType}
          status={sub.status === 'active' ? 'active' : 'idle'}
        />
      ))}
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
