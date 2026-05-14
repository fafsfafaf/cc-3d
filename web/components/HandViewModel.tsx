'use client';
import { useRef, useEffect, useMemo } from 'react';
import { useFrame, useThree, createPortal } from '@react-three/fiber';
import * as THREE from 'three';

type Props = {
  enabled: boolean;
  whipEquipped: boolean;
};

const ROPE_SEGMENTS = 16;

// Minecraft-style first-person hand rendered in a SEPARATE scene + camera
// over the main view. This is the same trick Minecraft and FPS games use:
// the viewmodel is in its own render pass so it never clips into the world,
// is never occluded by walls, and renders at a constant size on screen.
export default function HandViewModel({ enabled, whipEquipped }: Props) {
  const handRef = useRef<THREE.Group>(null);
  const ropeRef = useRef<THREE.Mesh>(null);
  const lassoRef = useRef<THREE.Mesh>(null);
  const tipFlashRef = useRef<THREE.Mesh>(null);
  const crackUntil = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const { gl, scene: mainScene, camera: mainCamera, size } = useThree();

  // Dedicated scene + camera for the viewmodel
  const viewmodelScene = useMemo(() => {
    const s = new THREE.Scene();
    // Bright lighting for the hand so it always looks lit (independent of world lights)
    const ambient = new THREE.AmbientLight(0xffffff, 1.4);
    const dir = new THREE.DirectionalLight(0xffe8c0, 1.2);
    dir.position.set(2, 3, 2);
    s.add(ambient, dir);
    return s;
  }, []);
  const viewmodelCamera = useMemo(() => {
    const c = new THREE.PerspectiveCamera(55, 1, 0.01, 10);
    c.position.set(0, 0, 0);
    return c;
  }, []);

  // Keep viewmodel camera aspect in sync with the main canvas
  useEffect(() => {
    if (!size) return;
    viewmodelCamera.aspect = size.width / size.height;
    viewmodelCamera.updateProjectionMatrix();
  }, [size, viewmodelCamera]);

  // Reusable curve we update every frame
  const curve = useMemo(() => {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= ROPE_SEGMENTS; i++) points.push(new THREE.Vector3());
    return new THREE.CatmullRomCurve3(points);
  }, []);

  // Whip-crack sound on click
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

  // Render the viewmodel scene OVER the main scene every frame
  useFrame(() => {
    if (!enabled) return;

    // Animate whip rope
    if (whipEquipped && ropeRef.current) {
      const t = performance.now() / 1000;
      const crackT = Math.max(0, crackUntil.current - t);
      const cracking = crackT > 0;
      const phase = cracking ? 1 - crackT / 0.45 : 0;

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
          x = Math.sin(t * 0.6 + p * 3) * 0.03 * (1 - p);
          y = -0.2 - p * p * 1.4 - Math.sin(t * 0.8 + p * 6) * 0.04 * (1 - p);
          z = -p * 0.55 - Math.cos(t * 0.5 + p * 3) * 0.04 * (1 - p);
        }
        points[i].set(x, y, z);
        if (i === ROPE_SEGMENTS) { tipX = x; tipY = y; tipZ = z; }
      }
      curve.updateArcLengths();

      const newGeo = new THREE.TubeGeometry(curve, ROPE_SEGMENTS * 2, 0.04, 8, false);
      ropeRef.current.geometry.dispose();
      ropeRef.current.geometry = newGeo;

      if (lassoRef.current) {
        lassoRef.current.position.set(tipX, tipY - 0.08, tipZ);
        lassoRef.current.rotation.x = -0.4 + Math.sin(t * 0.7) * 0.1;
        lassoRef.current.rotation.z = Math.sin(t * 0.5) * 0.1;
        const scl = cracking ? 0.7 + Math.sin(phase * Math.PI) * 0.5 : 1.0;
        lassoRef.current.scale.setScalar(scl);
      }
      if (tipFlashRef.current) {
        tipFlashRef.current.position.set(tipX, tipY, tipZ);
        const flash = cracking && phase > 0.4 && phase < 0.55 ? 1 : 0;
        (tipFlashRef.current.material as THREE.MeshBasicMaterial).opacity = flash * 0.95;
        tipFlashRef.current.scale.setScalar(0.5 + flash * 1.5);
      }
    }

    // Render viewmodel scene OVER main scene
    gl.autoClear = false;
    gl.clearDepth();
    gl.render(viewmodelScene, viewmodelCamera);
    gl.autoClear = true;
  }, 100); // priority 100 = render after the default scene

  // Pull camera + scene from main view; render hand into the dedicated scene
  // via createPortal so React-Three-Fiber tree manages the meshes for us.
  if (!enabled) return null;

  return createPortal(
    <group ref={handRef} position={[0.55, -0.42, -0.85]} scale={1.0} frustumCulled={false}>
      {/* Forearm */}
      <mesh frustumCulled={false} rotation={[0.2, 0, -0.1]} position={[0, -0.1, 0]}>
        <boxGeometry args={[0.18, 0.55, 0.18]} />
        <meshStandardMaterial color="#e8c8a8" roughness={0.7} flatShading />
      </mesh>
      {/* Sleeve cuff */}
      <mesh frustumCulled={false} position={[0, 0.18, 0]}>
        <boxGeometry args={[0.21, 0.14, 0.21]} />
        <meshStandardMaterial color="#5a8fff" roughness={0.85} flatShading />
      </mesh>
      {/* Hand */}
      <mesh frustumCulled={false} position={[0.02, -0.4, 0.02]}>
        <boxGeometry args={[0.24, 0.22, 0.22]} />
        <meshStandardMaterial color="#e8c8a8" roughness={0.7} flatShading />
      </mesh>
      {/* Thumb */}
      <mesh frustumCulled={false} position={[0.18, -0.36, 0.04]}>
        <boxGeometry args={[0.09, 0.18, 0.13]} />
        <meshStandardMaterial color="#d8b898" roughness={0.7} flatShading />
      </mesh>
      {/* Knuckle ridge */}
      <mesh frustumCulled={false} position={[0.02, -0.5, 0.13]}>
        <boxGeometry args={[0.22, 0.04, 0.02]} />
        <meshStandardMaterial color="#c8a888" roughness={0.7} flatShading />
      </mesh>

      {whipEquipped && (
        <>
          {/* Whip handle (held in hand, points outward) */}
          <mesh frustumCulled={false} position={[0.02, -0.55, 0.18]} rotation={[0.7, 0, 0]}>
            <cylinderGeometry args={[0.06, 0.05, 0.45, 10]} />
            <meshStandardMaterial color="#6b3e2a" roughness={0.6} flatShading />
          </mesh>
          {/* Handle wraps */}
          <mesh frustumCulled={false} position={[0.02, -0.45, 0.07]} rotation={[0.7, 0, 0]}>
            <cylinderGeometry args={[0.065, 0.065, 0.04, 10]} />
            <meshStandardMaterial color="#3d2418" roughness={0.7} flatShading />
          </mesh>
          <mesh frustumCulled={false} position={[0.02, -0.62, 0.27]} rotation={[0.7, 0, 0]}>
            <cylinderGeometry args={[0.065, 0.065, 0.04, 10]} />
            <meshStandardMaterial color="#3d2418" roughness={0.7} flatShading />
          </mesh>
          {/* Pommel (golden ball) */}
          <mesh frustumCulled={false} position={[0.02, -0.4, 0]}>
            <sphereGeometry args={[0.075, 14, 14]} />
            <meshStandardMaterial color="#d4a878" emissive="#d4a878" emissiveIntensity={0.25} roughness={0.4} flatShading />
          </mesh>

          {/* The whip rope — origin at the handle tip, hangs forward + down */}
          <group position={[0.02, -0.7, 0.35]}>
            <mesh ref={ropeRef} frustumCulled={false}>
              <tubeGeometry args={[curve, ROPE_SEGMENTS * 2, 0.04, 8, false]} />
              <meshStandardMaterial color="#3d2418" roughness={0.7} flatShading />
            </mesh>

            {/* Lasso loop at the tip */}
            <mesh ref={lassoRef} frustumCulled={false} position={[0, -1.4, -0.5]}>
              <torusGeometry args={[0.2, 0.03, 8, 24]} />
              <meshStandardMaterial color="#4a2e1c" roughness={0.7} flatShading />
            </mesh>

            {/* Tip flash on crack */}
            <mesh ref={tipFlashRef} frustumCulled={false} position={[0, 0, 0]}>
              <sphereGeometry args={[0.08, 10, 10]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0} />
            </mesh>
          </group>
        </>
      )}
    </group>,
    viewmodelScene,
  );
}
