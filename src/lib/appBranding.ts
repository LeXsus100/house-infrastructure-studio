export const DEFAULT_APP_ICON_URL = '/app-icon.svg';

const APP_ICON_STORAGE_KEY = 'house-infrastructure-studio.app-icon.v1';
const SUPPORTED_ICON_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_ICON_BYTES = 4 * 1024 * 1024;

export function loadLocalAppIcon(): string {
  try {
    const value = localStorage.getItem(APP_ICON_STORAGE_KEY);
    return value?.startsWith('data:image/') ? value : DEFAULT_APP_ICON_URL;
  } catch {
    return DEFAULT_APP_ICON_URL;
  }
}

export function saveLocalAppIcon(dataUrl: string): void {
  if (!/^data:image\/(?:png|jpeg|webp);base64,/i.test(dataUrl)) throw new Error('Unsupported application icon data.');
  localStorage.setItem(APP_ICON_STORAGE_KEY, dataUrl);
}

export function resetLocalAppIcon(): string {
  localStorage.removeItem(APP_ICON_STORAGE_KEY);
  return DEFAULT_APP_ICON_URL;
}

export function readLocalAppIcon(file: File): Promise<string> {
  if (!SUPPORTED_ICON_TYPES.has(file.type)) return Promise.reject(new Error('Choose a PNG, JPEG, or WebP image.'));
  if (!file.size || file.size > MAX_ICON_BYTES) return Promise.reject(new Error('The application icon must be smaller than 4 MB.'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The application icon could not be read.'));
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('The application icon is invalid.'));
    reader.readAsDataURL(file);
  });
}
