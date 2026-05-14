'use client';
import { useRef, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

type Props = {
  enabled: boolean;
  whipEquipped: boolean;
};

// First-person hand. Optionally equipped with a whip (toggle in the HUD).
export default function HandViewModel({ enabled, whipEquipped }: Props) {
  const handRef = useRef<THREE.Group>(null);
  const whipGroupRef = useRef<THREE.Group>(null);
  const ropeMatRef = useRef<THREE.LineBasicMaterial>(null);
  const tipRef = useRef<THREE.Mesh>(null);
  const crackUntil = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const { camera, gl } = useThree();

  const segments = 24;
  const ropePoints = useMemo(() => {
    const arr: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) arr.push(new THREE.Vector3());
    return arr;
  }, []);
  const ropeGeom = useMemo(() => new THREE.BufferGeometry().setFromPoints(ropePoints), [ropePoints]);

  // Whip-crack sound + click handler — only when whip equipped
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

    // Position: more centered + closer + slightly lower
    g.translateX(0.4);
    g.translateY(-0.45);
    g.translateZ(-0.7);
    g.rotateY(-0.16);
    g.rotateX(-0.12);

    if (whipEquipped && whipGroupRef.current) {
      const t = state.clock.elapsedTime;
      const crackT = Math.max(0, crackUntil.current - t);
      const cracking = crackT > 0;
      const phase = cracking ? 1 - crackT / 0.45 : 0;

      const positions = ropeGeom.attributes.position;
      let tipX = 0, tipY = 0, tipZ = 0;
      for (let i = 0; i <= segments; i++) {
        const p = i / segments;
        let x: number, y: number, z: number;
        if (cracking) {
          const snap = Math.sin(phase * Math.PI);
          const angle = -1.4 - p * 1.5;
          const radius = 0.4 + p * 1.6 + snap * 0.4 * p;
          x = Math.sin(t * 22 + p * 12) * 0.04 * snap * p;
          y = -0.3 + Math.sin(angle) * radius * (snap * 0.7 + 0.3);
          z = Math.cos(angle) * radius * -1;
        } else {
          x = 0;
          y = -0.4 - p * 0.9 - Math.sin(t * 0.8 + p * 6) * 0.04 * (1 - p);
          z = -p * 0.15 - Math.sin(t * 0.6 + p * 4) * 0.03 * (1 - p);
        }
        positions.setXYZ(i, x, y, z);
        if (i === segments) { tipX = x; tipY = y; tipZ = z; }
      }
      positions.needsUpdate = true;
      ropeGeom.computeBoundingSphere();

      if (tipRef.current) {
        tipRef.current.position.set(tipX, tipY, tipZ);
        const flash = cracking && phase > 0.4 && phase < 0.55 ? 1 : 0;
        (tipRef.current.material as THREE.MeshBasicMaterial).opacity = flash * 0.95;
        tipRef.current.scale.setScalar(0.6 + flash * 1.5);
      }
      if (ropeMatRef.current) ropeMatRef.current.opacity = cracking ? 1.0 : 0.95;
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
          {/* Whip handle */}
          <mesh position={[0, -0.7, 0.05]}>
            <boxGeometry args={[0.1, 0.32, 0.1]} />
            <meshStandardMaterial color="#6b3e2a" roughness={0.6} flatShading depthTest={false} />
          </mesh>
          <mesh position={[0, -0.8, 0.06]}>
            <boxGeometry args={[0.11, 0.04, 0.11]} />
            <meshStandardMaterial color="#3d2418" roughness={0.7} flatShading depthTest={false} />
          </mesh>
          <mesh position={[0, -0.7, 0.06]}>
            <boxGeometry args={[0.11, 0.04, 0.11]} />
            <meshStandardMaterial color="#3d2418" roughness={0.7} flatShading depthTest={false} />
          </mesh>
          <mesh position={[0, -0.92, 0.05]}>
            <boxGeometry args={[0.12, 0.06, 0.12]} />
            <meshStandardMaterial color="#caa078" roughness={0.5} flatShading depthTest={false} />
          </mesh>

          {/* Whip rope */}
          <group ref={whipGroupRef} position={[0, -0.85, 0.05]}>
            <line>
              <primitive attach="geometry" object={ropeGeom} />
              <lineBasicMaterial ref={ropeMatRef} attach="material" color="#2a1810" linewidth={3} transparent opacity={0.95} depthTest={false} />
            </line>
            <mesh ref={tipRef} position={[0, 0, 0]} renderOrder={1000}>
              <sphereGeometry args={[0.05, 8, 8]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0} depthTest={false} />
            </mesh>
          </group>
        </>
      )}
    </group>
  );
}
