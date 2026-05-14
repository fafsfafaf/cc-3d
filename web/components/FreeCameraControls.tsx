'use client';
import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

type Props = {
  enabled: boolean;
  walkMode?: boolean; // ground-locked first-person; if false: free fly
};

const EYE_HEIGHT = 1.7;
const FLOOR_Y = -3.99;

export default function FreeCameraControls({ enabled, walkMode = false }: Props) {
  const { camera, gl } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const yaw = useRef(0);
  const pitch = useRef(0);
  const isDragging = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const initialized = useRef(false);
  const velocity = useRef(new THREE.Vector3());
  const verticalVel = useRef(0); // for walk-mode jumping

  useEffect(() => {
    if (!enabled) {
      keys.current = {};
      return;
    }

    if (!initialized.current) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      yaw.current = Math.atan2(-dir.x, -dir.z);
      pitch.current = Math.asin(dir.y);
      initialized.current = true;
    }

    if (walkMode) {
      // Spawn at a safe position in the middle bridge area, looking at the rooms
      camera.position.set(0, FLOOR_Y + EYE_HEIGHT, 5);
      yaw.current = Math.PI; // face -Z (toward back walls / labels)
      pitch.current = 0;
      const e = new THREE.Euler(pitch.current, yaw.current, 0, 'YXZ');
      camera.quaternion.setFromEuler(e);
    }

    const dom = gl.domElement;
    dom.tabIndex = 0;
    dom.style.outline = 'none';
    dom.focus();

    const isFormElement = (el: EventTarget | null) =>
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement ||
      (el instanceof HTMLElement && el.isContentEditable);

    const onKeyDown = (e: KeyboardEvent) => {
      if (isFormElement(e.target)) return;
      keys.current[e.code] = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (isFormElement(e.target)) return;
      keys.current[e.code] = false;
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      isDragging.current = true;
      last.current = { x: e.clientX, y: e.clientY };
      try { dom.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      dom.focus();
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
    const onBlur = () => { keys.current = {}; };
    const onWheel = (e: WheelEvent) => {
      if (walkMode) return; // wheel does nothing in walk mode
      e.preventDefault();
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const step = -e.deltaY * 0.02;
      camera.position.addScaledVector(fwd, step);
      if (camera.position.y < 0.5) camera.position.y = 0.5;
      if (camera.position.y > 22) camera.position.y = 22;
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onBlur);
    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointermove', onMove);
    dom.addEventListener('pointerup', onUp);
    dom.addEventListener('pointercancel', onUp);
    dom.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', onBlur);
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerup', onUp);
      dom.removeEventListener('pointercancel', onUp);
      dom.removeEventListener('wheel', onWheel);
      keys.current = {};
    };
  }, [enabled, walkMode, camera, gl]);

  useFrame((_, delta) => {
    if (!enabled) return;
    const dt = Math.min(delta, 0.05);
    const k = keys.current;
    const sprint = k['ShiftLeft'] || k['ShiftRight'];

    const euler = new THREE.Euler(pitch.current, yaw.current, 0, 'YXZ');
    camera.quaternion.setFromEuler(euler);

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    forward.y = 0; forward.normalize();
    right.y = 0; right.normalize();

    if (walkMode) {
      const targetSpeed = sprint ? 12 : 6;
      const wish = new THREE.Vector3();
      if (k['KeyW'] || k['ArrowUp']) wish.add(forward);
      if (k['KeyS'] || k['ArrowDown']) wish.sub(forward);
      if (k['KeyA'] || k['ArrowLeft']) wish.sub(right);
      if (k['KeyD'] || k['ArrowRight']) wish.add(right);
      if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(targetSpeed);

      // Smooth horizontal velocity
      velocity.current.x = THREE.MathUtils.lerp(velocity.current.x, wish.x, 1 - Math.pow(0.0001, dt));
      velocity.current.z = THREE.MathUtils.lerp(velocity.current.z, wish.z, 1 - Math.pow(0.0001, dt));

      // Gravity + jump
      const onGround = camera.position.y <= FLOOR_Y + EYE_HEIGHT + 0.01;
      if (onGround) {
        verticalVel.current = 0;
        if (k['Space']) verticalVel.current = 6;
        camera.position.y = FLOOR_Y + EYE_HEIGHT;
      } else {
        verticalVel.current -= 18 * dt;
      }

      camera.position.x += velocity.current.x * dt;
      camera.position.z += velocity.current.z * dt;
      camera.position.y += verticalVel.current * dt;

      // Head bob when walking on ground
      const moving = onGround && (Math.abs(velocity.current.x) + Math.abs(velocity.current.z)) > 0.5;
      if (moving) {
        const t = performance.now() / 100;
        camera.position.y += Math.sin(t * (sprint ? 1.3 : 1.0)) * 0.04;
      }
    } else {
      const targetSpeed = sprint ? 22 : 9;
      const wish = new THREE.Vector3();
      if (k['KeyW'] || k['ArrowUp']) wish.add(forward);
      if (k['KeyS'] || k['ArrowDown']) wish.sub(forward);
      if (k['KeyA'] || k['ArrowLeft']) wish.sub(right);
      if (k['KeyD'] || k['ArrowRight']) wish.add(right);
      if (k['Space'] || k['KeyE']) wish.y += 1;
      if (k['ControlLeft'] || k['KeyQ']) wish.y -= 1;
      if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(targetSpeed);

      velocity.current.lerp(wish, 1 - Math.pow(0.0001, dt));
      camera.position.addScaledVector(velocity.current, dt);

      if (camera.position.y < 0.5) camera.position.y = 0.5;
      if (camera.position.y > 22) camera.position.y = 22;
    }
  });

  return null;
}
