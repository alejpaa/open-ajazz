import { useSyncExternalStore } from 'react';
import { mouseService, BatteryInfo, ScreenHardwareInfo } from './mouseProtocol';

const IMAGE_KEY = 'openajazz.screenImage';
const MAX_ANIMATED_PREVIEW_BYTES = 1024 * 1024;

interface DeviceState {
  battery: BatteryInfo | null;
  batteryError: string | null;
  screenImage: string | null;
  screenInfo: ScreenHardwareInfo;
}

function loadImage(): string | null {
  try {
    return localStorage.getItem(IMAGE_KEY);
  } catch {
    return null;
  }
}

let state: DeviceState = { battery: null, batteryError: null, screenImage: loadImage(), screenInfo: { verified: false } };
const listeners = new Set<() => void>();
let batteryInFlight = false;

function update(patch: Partial<DeviceState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

async function staticThumbnail(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D no disponible');
    ctx.drawImage(
      img,
      (img.naturalWidth - side) / 2,
      (img.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      128,
      128
    );
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const deviceStore = {
  subscribe,
  getSnapshot: () => state,

  setScreenInfo(screenInfo: ScreenHardwareInfo) {
    update({ screenInfo });
  },

  async refreshBattery() {
    if (batteryInFlight) return;
    batteryInFlight = true;
    try {
      const battery = await mouseService.getBattery();
      update({ battery, batteryError: null });
    } catch (e: any) {
      update({ battery: null, batteryError: e?.message || String(e) });
    } finally {
      batteryInFlight = false;
    }
  },

  async rememberScreenImage(file: File) {
    const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
    const preview =
      isGif && file.size <= MAX_ANIMATED_PREVIEW_BYTES
        ? await readAsDataUrl(file)
        : await staticThumbnail(file);
    try {
      localStorage.setItem(IMAGE_KEY, preview);
    } catch {
      // sin persistencia: se mantiene solo en memoria
    }
    update({ screenImage: preview });
  },

  clearScreenImage() {
    try {
      localStorage.removeItem(IMAGE_KEY);
    } catch {
      // ignorar
    }
    update({ screenImage: null });
  },
};

export function useDeviceStore() {
  return useSyncExternalStore(subscribe, () => state);
}
