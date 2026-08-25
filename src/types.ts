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
}

export type ShapeKind = 'line' | 'rect';

export interface ShapeOverlayData {
  kind: ShapeKind;
  x: number;
  y: number;
  width: number;
  height: number; // 0 for lines
}

export interface PageOverlays {
  images: ImageOverlayData[];
  texts: TextOverlayData[];
  shapes?: ShapeOverlayData[];
}

export type OverlaysByPage = Record<number, PageOverlays>;

export interface PageDimensions {
  renderWidth: number;
  renderHeight: number;
}

export type PageDimensionsMap = Record<number, PageDimensions>;

export interface SelectedOverlay {
  type: 'image' | 'text' | 'shape';
  index: number;
}
