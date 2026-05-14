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
  bubbles: Record<string, { text: string; key: number }>;
  camMode: CamMode;
  whipEquipped: boolean;
};

const ROOM_SIZE: [number, number, number] = [16, 8, 14];
const ROOM_OFFSET = 11;
const FLOOR_Y = -3.18;

export default function Scene({ sessions, selectedId, onSelect, pulses, bubbles, camMode, whipEquipped }: Props) {
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

      <mesh position={[0, -3.99, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ROOM_OFFSET * 2 - ROOM_SIZE[0], ROOM_SIZE[2]]} />
        <meshStandardMaterial color="#6c7a8c" roughness={0.92} />
      </mesh>
      <mesh position={[0, -3.985, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ROOM_OFFSET * 2 - ROOM_SIZE[0], 0.4]} />
        <meshBasicMaterial color="#9eafc4" />
      </mesh>

      <AgentWorld
        sessions={sessions}
        selectedId={selectedId}
        onSelect={onSelect}
        pulses={pulses}
        bubbles={bubbles}
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
      <HandViewModel enabled={camMode === 'walk'} whipEquipped={whipEquipped} />
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

      {/* Big wall sign on the back wall */}
      <Text
        position={[0, h / 2 - 1.4, -d / 2 + 0.02]}
        fontSize={1.0}
        color={accentColor}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.18}
        outlineWidth={0.025}
        outlineColor="#000"
        maxWidth={w * 0.9}
      >
        {label}
      </Text>
      {/* Outer side wall sign */}
      <Text
        position={[isLeft ? -w / 2 + 0.02 : w / 2 - 0.02, h / 2 - 1.4, 0]}
        rotation={[0, isLeft ? Math.PI / 2 : -Math.PI / 2, 0]}
        fontSize={0.85}
        color={accentColor}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.16}
        outlineWidth={0.022}
        outlineColor="#000"
        maxWidth={d * 0.9}
      >
        {label}
      </Text>
    </group>
  );
}

// Project-clustered layout: agents from the same project group together,
// each cluster gets its own little area inside the room with a floor label.
function AgentWorld({
  sessions,
  selectedId,
  onSelect,
  pulses,
  bubbles,
}: {
  sessions: Session[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  pulses: Record<string, number>;
  bubbles: Record<string, { text: string; key: number }>;
}) {
  const visible = useMemo(
    () => sessions.filter((s) => s.status === 'active' || s.status === 'idle'),
    [sessions],
  );
  const active = useMemo(() => visible.filter((s) => s.status === 'active'), [visible]);
  const idle = useMemo(() => visible.filter((s) => s.status === 'idle'), [visible]);

  const activeLayout = useMemo(() => buildClusteredLayout(active, ROOM_SIZE), [active]);
  const idleLayout = useMemo(() => buildClusteredLayout(idle, ROOM_SIZE), [idle]);

  const targetById = useMemo(() => {
    const map = new Map<string, [number, number, number]>();
    for (const [sessionId, p] of activeLayout.positions) {
      map.set(sessionId, [p[0] - ROOM_OFFSET, FLOOR_Y, p[2]]);
    }
    for (const [sessionId, p] of idleLayout.positions) {
      map.set(sessionId, [p[0] + ROOM_OFFSET, FLOOR_Y, p[2]]);
    }
    return map;
  }, [activeLayout, idleLayout]);

  return (
    <>
      {/* Cluster floor labels */}
      {activeLayout.clusters.map((c) => (
        <ClusterLabel
          key={'a-' + c.projectName}
          position={[c.center[0] - ROOM_OFFSET, FLOOR_Y - 0.65, c.center[2] + c.radius + 0.5]}
          label={c.projectName}
          color="#ff8c1a"
        />
      ))}
      {idleLayout.clusters.map((c) => (
        <ClusterLabel
          key={'i-' + c.projectName}
          position={[c.center[0] + ROOM_OFFSET, FLOOR_Y - 0.65, c.center[2] + c.radius + 0.5]}
          label={c.projectName}
          color="#5a8fff"
        />
      ))}

      {visible.map((s) => {
        const target = targetById.get(s.sessionId);
        if (!target) return null;
        const subs = (s.subagents || []).slice(0, 5);
        const bubble = bubbles[s.sessionId];
        return (
          <WalkingAgent
            key={s.sessionId}
            target={target}
            session={s}
            selected={selectedId === s.sessionId}
            pulse={pulses[s.sessionId] || 0}
            onClick={() => onSelect(s.sessionId)}
            subs={subs}
            bubbleText={bubble?.text || null}
            bubbleKey={bubble?.key || 0}
          />
        );
      })}
    </>
  );
}

function ClusterLabel({
  position,
  label,
  color,
}: {
  position: [number, number, number];
  label: string;
  color: string;
}) {
  return (
    <Text
      position={position}
      rotation={[-Math.PI / 2, 0, 0]}
      fontSize={0.22}
      color={color}
      anchorX="center"
      anchorY="middle"
      letterSpacing={0.08}
      outlineWidth={0.008}
      outlineColor="#000"
    >
      {label.length > 22 ? label.slice(0, 21) + '…' : label}
    </Text>
  );
}

function WalkingAgent({
  target,
  session,
  selected,
  pulse,
  onClick,
  subs,
  bubbleText,
  bubbleKey,
}: {
  target: [number, number, number];
  session: Session;
  selected: boolean;
  pulse: number;
  onClick: () => void;
  subs: Session['subagents'];
  bubbleText: string | null;
  bubbleKey: number;
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
        projectName={session.label || session.projectName}
        model={session.model}
        status={session.status === 'active' ? 'active' : 'idle'}
        selected={selected}
        pulse={pulse}
        onClick={onClick}
        subagentBadge={subs.length}
        lastEventLabel={session.currentTask || formatLastEvent(session)}
        bubbleText={bubbleText}
        bubbleKey={bubbleKey}
        externalKind={session.isExternal ? session.externalKind : null}
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

// Cluster layout: group sessions by projectName, each cluster is a small grid
// laid out across the room floor.
function buildClusteredLayout(sessions: Session[], roomSize: [number, number, number]) {
  const positions = new Map<string, [number, number, number]>();
  const clusters: { projectName: string; center: [number, number, number]; radius: number }[] = [];
  if (!sessions.length) return { positions, clusters };

  const groups = new Map<string, Session[]>();
  for (const s of sessions) {
    const key = s.projectName || 'unknown';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  const groupKeys = [...groups.keys()].sort();
  const [w, , d] = roomSize;
  const padding = 1.4;
  const usableW = w * 0.78;
  const usableD = d * 0.7;

  // Place groups in a coarse grid
  const gCols = Math.ceil(Math.sqrt(groupKeys.length));
  const gRows = Math.ceil(groupKeys.length / gCols);
  const cellW = usableW / Math.max(gCols, 1);
  const cellD = usableD / Math.max(gRows, 1);

  groupKeys.forEach((projectName, gi) => {
    const gr = Math.floor(gi / gCols);
    const gc = gi % gCols;
    const cx = (gc - (gCols - 1) / 2) * cellW;
    const cz = (gr - (gRows - 1) / 2) * cellD;
    const members = groups.get(projectName)!;
    const cols = Math.ceil(Math.sqrt(members.length));
    const rows = Math.ceil(members.length / cols);
    const innerW = Math.min(cellW - padding, cols * 1.4);
    const innerD = Math.min(cellD - padding, rows * 1.4);
    const xStep = innerW / Math.max(cols - 1, 1);
    const zStep = innerD / Math.max(rows - 1, 1);

    let maxR = 0;
    members.forEach((s, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const x = cx + (cols === 1 ? 0 : (c - (cols - 1) / 2) * xStep);
      const z = cz + (rows === 1 ? 0 : (r - (rows - 1) / 2) * zStep);
      positions.set(s.sessionId, [x, 0, z]);
      const distFromCenter = Math.sqrt((x - cx) ** 2 + (z - cz) ** 2);
      if (distFromCenter > maxR) maxR = distFromCenter;
    });
    clusters.push({ projectName, center: [cx, 0, cz], radius: Math.max(maxR, 0.6) });
  });

  return { positions, clusters };
}

function formatLastEvent(s: Session): string {
  if (s.lastToolCall) return `${s.lastToolCall.name}: ${s.lastToolCall.description || ''}`;
  if (s.lastAssistantText) return s.lastAssistantText;
  if (s.lastUserPrompt) return `> ${s.lastUserPrompt}`;
  return s.lastEventType || '?';
}
