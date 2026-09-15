import type { WatermarkData } from '../types';

const STORAGE_KEY = 'pdf-editor-pro-wm-templates';

export interface WatermarkTemplate {
  id: string;
  name: string;
  createdAt: number;
  watermarks: WatermarkData[];
}

export function loadTemplates(): WatermarkTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Throws if localStorage quota is exceeded (large logo images). */
export function saveTemplate(name: string, watermarks: WatermarkData[]): WatermarkTemplate[] {
  const templates = loadTemplates();
  templates.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    createdAt: Date.now(),
    watermarks: watermarks.map(wm => ({ ...wm })),
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  return templates;
}

export function deleteTemplate(id: string): WatermarkTemplate[] {
  const templates = loadTemplates().filter(t => t.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  return templates;
}
