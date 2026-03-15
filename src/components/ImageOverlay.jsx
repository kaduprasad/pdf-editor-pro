import { Rnd } from 'react-rnd';
import { X, Crop, Check, XCircle } from 'lucide-react';
import { useState, useCallback } from 'react';

const cornerHandle = (cursor) => ({
  width: 14,
  height: 14,
  background: '#1a8cff',
  border: '2px solid #fff',
  borderRadius: '50%',
  position: 'absolute',
  zIndex: 15,
  cursor,
  boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
});

/* Thin bar style for crop edge handles */
const edgeBarBase = {
  position: 'absolute',
  background: '#1a8cff',
  borderRadius: 3,
  zIndex: 25,
  boxShadow: '0 0 4px rgba(0,0,0,0.4)',
};

function CropEdgeBar({ edge, insets, imageWidth, imageHeight, onDrag }) {
  const handleMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startVal = insets[edge];

    const onMouseMove = (moveE) => {
      const dx = moveE.clientX - startX;
      const dy = moveE.clientY - startY;
      let newVal;
      switch (edge) {
        case 'top':
          newVal = Math.max(0, Math.min(startVal + dy, imageHeight - insets.bottom - 30));
          break;
        case 'bottom':
          newVal = Math.max(0, Math.min(startVal - dy, imageHeight - insets.top - 30));
          break;
        case 'left':
          newVal = Math.max(0, Math.min(startVal + dx, imageWidth - insets.right - 30));
          break;
        case 'right':
          newVal = Math.max(0, Math.min(startVal - dx, imageWidth - insets.left - 30));
          break;
      }
      onDrag(edge, newVal);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  let style = { ...edgeBarBase };
  const barLen = 36;
  const barThick = 6;

  switch (edge) {
    case 'top':
      style.top = insets.top - barThick / 2;
      style.left = insets.left + (imageWidth - insets.left - insets.right) / 2 - barLen / 2;
      style.width = barLen;
      style.height = barThick;
      style.cursor = 'ns-resize';
      break;
    case 'bottom':
      style.bottom = insets.bottom - barThick / 2;
      style.left = insets.left + (imageWidth - insets.left - insets.right) / 2 - barLen / 2;
      style.width = barLen;
      style.height = barThick;
      style.cursor = 'ns-resize';
      break;
    case 'left':
      style.left = insets.left - barThick / 2;
      style.top = insets.top + (imageHeight - insets.top - insets.bottom) / 2 - barLen / 2;
      style.width = barThick;
      style.height = barLen;
      style.cursor = 'ew-resize';
      break;
    case 'right':
      style.right = insets.right - barThick / 2;
      style.top = insets.top + (imageHeight - insets.top - insets.bottom) / 2 - barLen / 2;
      style.width = barThick;
      style.height = barLen;
      style.cursor = 'ew-resize';
      break;
  }

  return <div style={style} onMouseDown={handleMouseDown} />;
}

export default function ImageOverlay({ image, index, selected, onSelect, onUpdate, onDelete }) {
  const [isCropping, setIsCropping] = useState(false);
  const [cropInsets, setCropInsets] = useState({ top: 0, right: 0, bottom: 0, left: 0 });

  const startCrop = (e) => {
    e.stopPropagation();
    setIsCropping(true);
    setCropInsets({ top: 0, right: 0, bottom: 0, left: 0 });
  };

  const cancelCrop = (e) => {
    e.stopPropagation();
    setIsCropping(false);
    setCropInsets({ top: 0, right: 0, bottom: 0, left: 0 });
  };

  const applyCrop = useCallback((e) => {
    e.stopPropagation();
    const { top, right, bottom, left } = cropInsets;
    if (top === 0 && right === 0 && bottom === 0 && left === 0) {
      setIsCropping(false);
      return;
    }

    // Use canvas to actually crop the image data
    const imgEl = new Image();
    imgEl.onload = () => {
      const scaleX = imgEl.naturalWidth / image.width;
      const scaleY = imgEl.naturalHeight / image.height;

      const sx = left * scaleX;
      const sy = top * scaleY;
      const sw = (image.width - left - right) * scaleX;
      const sh = (image.height - top - bottom) * scaleY;

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(sw);
      canvas.height = Math.round(sh);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, sw, sh);

      const croppedSrc = canvas.toDataURL('image/png');
      onUpdate(index, {
        ...image,
        src: croppedSrc,
        x: image.x + left,
        y: image.y + top,
        width: image.width - left - right,
        height: image.height - top - bottom,
      });
      setIsCropping(false);
      setCropInsets({ top: 0, right: 0, bottom: 0, left: 0 });
    };
    imgEl.src = image.src;
  }, [cropInsets, image, index, onUpdate]);

  const handleEdgeDrag = useCallback((edge, value) => {
    setCropInsets(prev => ({ ...prev, [edge]: value }));
  }, []);

  return (
    <Rnd
      size={{ width: image.width, height: image.height }}
      position={{ x: image.x, y: image.y }}
      onDragStart={() => { if (!selected) onSelect(); }}
      onDragStop={(e, d) => {
        if (isCropping) return;
        onUpdate(index, { ...image, x: d.x, y: d.y });
      }}
      onResizeStop={(e, direction, ref, delta, position) => {
        if (isCropping) return;
        onUpdate(index, {
          ...image,
          width: parseFloat(ref.style.width),
          height: parseFloat(ref.style.height),
          x: position.x,
          y: position.y,
        });
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        if (!selected) onSelect();
      }}
      lockAspectRatio={!isCropping}
      disableDragging={isCropping}
      bounds="parent"
      style={{
        border: isCropping
          ? '2px dashed #1a8cff'
          : selected
            ? '2px solid rgba(26, 140, 255, 0.6)'
            : '1px solid rgba(26, 140, 255, 0.08)',
        borderRadius: '2px',
        cursor: isCropping ? 'default' : 'move',
        zIndex: selected ? 12 : 10,
        overflow: 'visible',
      }}
      enableResizing={(!selected || isCropping) ? false : {
        top: false,
        right: false,
        bottom: false,
        left: false,
        topRight: true,
        bottomRight: true,
        bottomLeft: true,
        topLeft: true,
      }}
      resizeHandleStyles={{
        topLeft: { ...cornerHandle('nwse-resize'), top: -7, left: -7 },
        topRight: { ...cornerHandle('nesw-resize'), top: -7, right: -7 },
        bottomLeft: { ...cornerHandle('nesw-resize'), bottom: -7, left: -7 },
        bottomRight: { ...cornerHandle('nwse-resize'), bottom: -7, right: -7 },
      }}
    >
      {/* Action buttons — only shown when selected */}
      {selected && (
        <div style={{
          position: 'absolute',
          top: -14,
          right: isCropping ? -4 : 16,
          display: 'flex',
          gap: 4,
          zIndex: 30,
          pointerEvents: 'auto',
        }}>
        {isCropping ? (
          <>
            <button
              onClick={applyCrop}
              style={{
                width: 26, height: 26, borderRadius: '50%',
                background: '#22c55e', border: 'none', color: '#fff',
                cursor: 'pointer', display: 'flex', alignItems: 'center',
                justifyContent: 'center', padding: 0,
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              }}
              title="Apply crop"
            >
              <Check size={14} />
            </button>
            <button
              onClick={cancelCrop}
              style={{
                width: 26, height: 26, borderRadius: '50%',
                background: '#888', border: 'none', color: '#fff',
                cursor: 'pointer', display: 'flex', alignItems: 'center',
                justifyContent: 'center', padding: 0,
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              }}
              title="Cancel crop"
            >
              <XCircle size={14} />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={startCrop}
              style={{
                width: 26, height: 26, borderRadius: '50%',
                background: '#1a8cff', border: 'none', color: '#fff',
                cursor: 'pointer', display: 'flex', alignItems: 'center',
                justifyContent: 'center', padding: 0,
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              }}
              title="Crop image"
            >
              <Crop size={13} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(index); }}
              style={{
                width: 26, height: 26, borderRadius: '50%',
                background: '#e94560', border: 'none', color: '#fff',
                cursor: 'pointer', display: 'flex', alignItems: 'center',
                justifyContent: 'center', padding: 0,
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              }}
              title="Remove image"
            >
              <X size={14} />
            </button>
          </>
        )}
      </div>
      )}

      {/* Image + crop overlays — overflow:hidden keeps crop darkening contained */}
      <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
        <img
          src={image.src}
          alt="overlay"
          draggable={false}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />

        {isCropping && (
          <>
            {cropInsets.top > 0 && (
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0,
                height: cropInsets.top,
                background: 'rgba(0,0,0,0.45)',
                pointerEvents: 'none',
              }} />
            )}
            {cropInsets.bottom > 0 && (
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                height: cropInsets.bottom,
                background: 'rgba(0,0,0,0.45)',
                pointerEvents: 'none',
              }} />
            )}
            {cropInsets.left > 0 && (
              <div style={{
                position: 'absolute',
                top: cropInsets.top, bottom: cropInsets.bottom, left: 0,
                width: cropInsets.left,
                background: 'rgba(0,0,0,0.45)',
                pointerEvents: 'none',
              }} />
            )}
            {cropInsets.right > 0 && (
              <div style={{
                position: 'absolute',
                top: cropInsets.top, bottom: cropInsets.bottom, right: 0,
                width: cropInsets.right,
                background: 'rgba(0,0,0,0.45)',
                pointerEvents: 'none',
              }} />
            )}

            <div style={{
              position: 'absolute',
              top: cropInsets.top,
              left: cropInsets.left,
              right: cropInsets.right,
              bottom: cropInsets.bottom,
              border: '1.5px dashed rgba(255,255,255,0.7)',
              pointerEvents: 'none',
              zIndex: 22,
            }} />

            <CropEdgeBar edge="top" insets={cropInsets} imageWidth={image.width} imageHeight={image.height} onDrag={handleEdgeDrag} />
            <CropEdgeBar edge="bottom" insets={cropInsets} imageWidth={image.width} imageHeight={image.height} onDrag={handleEdgeDrag} />
            <CropEdgeBar edge="left" insets={cropInsets} imageWidth={image.width} imageHeight={image.height} onDrag={handleEdgeDrag} />
            <CropEdgeBar edge="right" insets={cropInsets} imageWidth={image.width} imageHeight={image.height} onDrag={handleEdgeDrag} />
          </>
        )}
      </div>
    </Rnd>
  );
}
