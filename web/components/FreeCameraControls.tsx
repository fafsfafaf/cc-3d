'use client';
import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

type Props = { enabled: boolean };

export default function FreeCameraControls({ enabled }: Props) {
  const { camera, gl } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const yaw = useRef(0);
  const pitch = useRef(0);
  const isDragging = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    if (!initialized.current) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      yaw.current = Math.atan2(-dir.x, -dir.z);
      pitch.current = Math.asin(dir.y);
      initialized.current = true;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      keys.current[e.code] = true;
    };
    const onKeyUp = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    const dom = gl.domElement;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      isDragging.current = true;
      last.current = { x: e.clientX, y: e.clientY };
      dom.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!isDragging.current || !last.current) return;
      const dx = e.clientX - last.current.x;
      const dy = e.clientY - last.current.y;
      last.current = { x: e.clientX, y: e.clientY };
      yaw.current -= dx * 0.0035;
      pitch.current -= dy * 0.0035;
      pitch.current = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, pitch.current));
    };
    const onUp = (e: PointerEvent) => {
      isDragging.current = false;
      last.current = null;
      try { dom.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointermove', onMove);
    dom.addEventListener('pointerup', onUp);
    dom.addEventListener('pointercancel', onUp);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerup', onUp);
      dom.removeEventListener('pointercancel', onUp);
      keys.current = {};
    };
  }, [enabled, camera, gl]);

  useFrame((_, delta) => {
    if (!enabled) return;
    const k = keys.current;
    const sprint = k['ShiftLeft'] || k['ShiftRight'];
    const speed = (sprint ? 18 : 7) * delta;

    // Apply rotation: yaw on Y, then pitch on local X
    const euler = new THREE.Euler(pitch.current, yaw.current, 0, 'YXZ');
    camera.quaternion.setFromEuler(euler);

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    forward.y = 0; forward.normalize();
    right.y = 0; right.normalize();

    if (k['KeyW']) camera.position.addScaledVector(forward, speed);
    if (k['KeyS']) camera.position.addScaledVector(forward, -speed);
    if (k['KeyA']) camera.position.addScaledVector(right, -speed);
    if (k['KeyD']) camera.position.addScaledVector(right, speed);
    if (k['Space'] || k['KeyE']) camera.position.y += speed;
    if (k['ControlLeft'] || k['KeyQ']) camera.position.y -= speed;

    // Soft floor + ceiling
    if (camera.position.y < 0.5) camera.position.y = 0.5;
    if (camera.position.y > 18) camera.position.y = 18;
  });

  return null;
}
