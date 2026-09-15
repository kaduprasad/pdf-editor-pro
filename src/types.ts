export interface ImageOverlayData {
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextOverlayData {
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  bold: boolean;
  role?: 'page-number'; // generated overlays, replaced/removed as a set
}

export type PageNumberPosition = 'bottom-left' | 'bottom-center' | 'bottom-right';

export interface PageNumberOptions {
  startNumber: number;
  fontSize: number;
  position: PageNumberPosition;
}

export type ShapeKind = 'line' | 'rect' | 'arrow';

export type ToolKind = ShapeKind | 'text';

export interface ShapeOverlayData {
  kind: ShapeKind;
  x: number;
  y: number;
  width: number;
  height: number; // 0 for horizontal lines/arrows; vertical arrows use width 0
  dir?: 'left' | 'right' | 'up' | 'down'; // arrowhead direction (arrows only)
  thickness?: number; // stroke width in render px (default 2)
}

export type WatermarkTile = 'single' | 'grid' | 'diagonal';
export type WatermarkEffect = 'none' | 'grayscale';
export type WatermarkFont = 'Arial' | 'Times New Roman' | 'Courier';

interface WatermarkBase {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;    // size multiplier controlled by the panel slider
  tile: WatermarkTile;
  opacity: number;  // 0–1
  rotation: number; // degrees, -180..180
  effect: WatermarkEffect;
}

export interface TextWatermarkData extends WatermarkBase {
  type: 'text';
  content: string;
  font: WatermarkFont;
  color: string; // hex
  bold?: boolean;
}

export interface ImageWatermarkData extends WatermarkBase {
  type: 'image';
  src: string;
}

export type WatermarkData = TextWatermarkData | ImageWatermarkData;

export interface PageOverlays {
  images: ImageOverlayData[];
  texts: TextOverlayData[];
  shapes?: ShapeOverlayData[];
  watermarks?: WatermarkData[];
}

export type OverlaysByPage = Record<number, PageOverlays>;

export interface PageDimensions {
  renderWidth: number;
  renderHeight: number;
}

export type PageDimensionsMap = Record<number, PageDimensions>;

export interface SelectedOverlay {
  type: 'image' | 'text' | 'shape' | 'watermark';
  index: number;
}
