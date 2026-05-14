'use client';
import { useRef, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

type Props = {
  enabled: boolean;
  whipEquipped: boolean;
};

const ROPE_SEGMENTS = 16;

// First-person hand. Optionally equipped with a thick voxel-style lasso/whip.
export default function HandViewModel({ enabled, whipEquipped }: Props) {
  const handRef = useRef<THREE.Group>(null);
  const ropeRef = useRef<THREE.Mesh>(null);
  const lassoRef = useRef<THREE.Mesh>(null);
  const tipFlashRef = useRef<THREE.Mesh>(null);
  const crackUntil = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const { camera, gl } = useThree();

  // Reusable curve we update every frame
  const curve = useMemo(() => {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= ROPE_SEGMENTS; i++) points.push(new THREE.Vector3());
    return new THREE.CatmullRomCurve3(points);
  }, []);

  // Whip-crack sound (only when whip equipped)
  useEffect(() => {
    if (!enabled || !whipEquipped) return;
    const playWhipCrack = () => {
      try {
        if (!audioCtxRef.current) {
          const Ctx = window.AudioContext || (window as any).webkitAudioContext;
          if (!Ctx) return;
          audioCtxRef.current = new Ctx();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') ctx.resume();

        const whooshLen = 0.18;
        const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * whooshLen, ctx.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        const noiseSrc = ctx.createBufferSource();
        noiseSrc.buffer = noiseBuf;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(2400, ctx.currentTime);
        bp.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + whooshLen);
        bp.Q.value = 6;
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.0, ctx.currentTime);
        noiseGain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.04);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + whooshLen);
        noiseSrc.connect(bp).connect(noiseGain).connect(ctx.destination);
        noiseSrc.start();
        noiseSrc.stop(ctx.currentTime + whooshLen);

        const crackStart = ctx.currentTime + whooshLen - 0.01;
        const crackLen = 0.06;
        const crackBuf = ctx.createBuffer(1, ctx.sampleRate * crackLen, ctx.sampleRate);
        const cd = crackBuf.getChannelData(0);
        for (let i = 0; i < cd.length; i++) {
          const env = Math.exp(-i / (ctx.sampleRate * 0.008));
          cd[i] = (Math.random() * 2 - 1) * env;
        }
        const crackSrc = ctx.createBufferSource();
        crackSrc.buffer = crackBuf;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 1500;
        const crackGain = ctx.createGain();
        crackGain.gain.setValueAtTime(0.95, crackStart);
        crackGain.gain.exponentialRampToValueAtTime(0.001, crackStart + crackLen);
        crackSrc.connect(hp).connect(crackGain).connect(ctx.destination);
        crackSrc.start(crackStart);
        crackSrc.stop(crackStart + crackLen);
      } catch { /* ignore */ }
    };

    const onClick = () => {
      crackUntil.current = performance.now() / 1000 + 0.45;
      playWhipCrack();
    };
    const dom = gl.domElement;
    dom.addEventListener('click', onClick);
    return () => dom.removeEventListener('click', onClick);
  }, [enabled, whipEquipped, gl]);

  useFrame((state) => {
    const g = handRef.current;
    if (!g || !enabled) return;

    g.position.copy(camera.position);
    g.quaternion.copy(camera.quaternion);

    // Hand offset bottom-right of view
    g.translateX(0.4);
    g.translateY(-0.45);
    g.translateZ(-0.7);
    g.rotateY(-0.16);
    g.rotateX(-0.12);

    if (whipEquipped && ropeRef.current) {
      const t = state.clock.elapsedTime;
      const crackT = Math.max(0, crackUntil.current - t);
      const cracking = crackT > 0;
      const phase = cracking ? 1 - crackT / 0.45 : 0;

      // Compute curve points (relative to handle base at -0.85 below hand origin)
      const points = curve.points;
      let tipX = 0, tipY = 0, tipZ = 0;
      for (let i = 0; i <= ROPE_SEGMENTS; i++) {
        const p = i / ROPE_SEGMENTS;
        let x: number, y: number, z: number;
        if (cracking) {
          const snap = Math.sin(phase * Math.PI);
          const angle = -1.4 - p * 1.5;
          const radius = 0.5 + p * 1.8 + snap * 0.4 * p;
          x = Math.sin(t * 22 + p * 12) * 0.05 * snap * p;
          y = -0.3 + Math.sin(angle) * radius * (snap * 0.7 + 0.3);
          z = Math.cos(angle) * radius * -1;
        } else {
          // Hangs forward + down with gentle sway
          x = Math.sin(t * 0.6 + p * 3) * 0.03 * (1 - p);
          y = -0.2 - p * p * 1.4 - Math.sin(t * 0.8 + p * 6) * 0.04 * (1 - p);
          z = -p * 0.55 - Math.cos(t * 0.5 + p * 3) * 0.04 * (1 - p);
        }
        points[i].set(x, y, z);
        if (i === ROPE_SEGMENTS) { tipX = x; tipY = y; tipZ = z; }
      }
      curve.updateArcLengths();

      // Build a fresh tube geometry (cheap at 16 segments)
      const tubeGeo = new THREE.TubeGeometry(curve, ROPE_SEGMENTS * 2, 0.03, 6, false);
      ropeRef.current.geometry.dispose();
      ropeRef.current.geometry = tubeGeo;

      // Position the lasso loop at the tip
      if (lassoRef.current) {
        lassoRef.current.position.set(tipX, tipY - 0.08, tipZ);
        lassoRef.current.rotation.x = -0.4 + Math.sin(t * 0.7) * 0.1;
        lassoRef.current.rotation.z = Math.sin(t * 0.5) * 0.1;
        const scl = cracking ? 0.7 + Math.sin(phase * Math.PI) * 0.5 : 1.0;
        lassoRef.current.scale.setScalar(scl);
      }

      // Tip flash on crack
      if (tipFlashRef.current) {
        tipFlashRef.current.position.set(tipX, tipY, tipZ);
        const flash = cracking && phase > 0.4 && phase < 0.55 ? 1 : 0;
        (tipFlashRef.current.material as THREE.MeshBasicMaterial).opacity = flash * 0.95;
        tipFlashRef.current.scale.setScalar(0.5 + flash * 1.5);
      }
    }
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
      {/* Hand */}
      <mesh position={[0, -0.6, 0.02]}>
        <boxGeometry args={[0.24, 0.22, 0.22]} />
        <meshStandardMaterial color="#e8c8a8" roughness={0.7} flatShading depthTest={false} />
      </mesh>
      {/* Thumb */}
      <mesh position={[0.16, -0.55, 0.04]}>
        <boxGeometry args={[0.09, 0.18, 0.13]} />
        <meshStandardMaterial color="#d8b898" roughness={0.7} flatShading depthTest={false} />
      </mesh>
      {/* Knuckle ridge */}
      <mesh position={[0, -0.7, 0.13]}>
        <boxGeometry args={[0.22, 0.04, 0.02]} />
        <meshStandardMaterial color="#c8a888" roughness={0.7} flatShading depthTest={false} />
      </mesh>

      {whipEquipped && (
        <>
          {/* Whip handle (held in hand) */}
          <mesh position={[0, -0.78, 0.08]} rotation={[0.4, 0, 0]}>
            <cylinderGeometry args={[0.055, 0.045, 0.4, 8]} />
            <meshStandardMaterial color="#6b3e2a" roughness={0.6} flatShading depthTest={false} />
          </mesh>
          {/* Handle wraps */}
          <mesh position={[0, -0.7, 0.05]} rotation={[0.4, 0, 0]}>
            <cylinderGeometry args={[0.062, 0.062, 0.04, 8]} />
            <meshStandardMaterial color="#3d2418" roughness={0.7} flatShading depthTest={false} />
          </mesh>
          <mesh position={[0, -0.85, 0.12]} rotation={[0.4, 0, 0]}>
            <cylinderGeometry args={[0.062, 0.062, 0.04, 8]} />
            <meshStandardMaterial color="#3d2418" roughness={0.7} flatShading depthTest={false} />
          </mesh>
          {/* Pommel (golden ball at handle end) */}
          <mesh position={[0, -0.62, 0.02]}>
            <sphereGeometry args={[0.07, 12, 12]} />
            <meshStandardMaterial color="#d4a878" emissive="#d4a878" emissiveIntensity={0.2} roughness={0.4} flatShading depthTest={false} />
          </mesh>

          {/* Whip rope — actual 3D tube (not a line!) */}
          <group position={[0, -0.95, 0.15]}>
            <mesh ref={ropeRef}>
              <tubeGeometry args={[curve, ROPE_SEGMENTS * 2, 0.03, 6, false]} />
              <meshStandardMaterial color="#3d2418" roughness={0.7} flatShading depthTest={false} />
            </mesh>

            {/* Lasso loop at the tip */}
            <mesh ref={lassoRef} position={[0, -1.4, -0.5]}>
              <torusGeometry args={[0.18, 0.025, 6, 20]} />
              <meshStandardMaterial color="#4a2e1c" roughness={0.7} flatShading depthTest={false} />
            </mesh>

            {/* Tip flash (only visible during crack) */}
            <mesh ref={tipFlashRef} position={[0, 0, 0]}>
              <sphereGeometry args={[0.06, 8, 8]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0} depthTest={false} />
            </mesh>
          </group>
        </>
      )}
    </group>
  );
}
