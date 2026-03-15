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

export interface PageOverlays {
  images: ImageOverlayData[];
  texts: TextOverlayData[];
}

export type OverlaysByPage = Record<number, PageOverlays>;

export interface PageDimensions {
  renderWidth: number;
  renderHeight: number;
}

export type PageDimensionsMap = Record<number, PageDimensions>;

export interface SelectedOverlay {
  type: 'image' | 'text';
  index: number;
}
