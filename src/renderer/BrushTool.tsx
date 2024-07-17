import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useInsertionEffect,
  useRef,
  useState,
} from 'react';

export function base64ToDataUri(data: string) {
  return 'data:image/png;base64,' + data;
}

export function getImageDimensions(
  base64: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const width = img.width;
      const height = img.height;
      resolve({ width, height });
    };
    img.onerror = reject;
    img.src = base64ToDataUri(base64);
  });
}

export function maskToBase64(
  image: ImageData,
  width: number,
  height: number,
): string {
  const bitmap = new Uint8ClampedArray(image.data);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  for (let i = 0; i < bitmap.length; i += 4) {
    const r = bitmap[i];
    const g = bitmap[i + 1];
    const b = bitmap[i + 2];

    if (r !== 0 || g !== 0 || b !== 0) {
      bitmap[i] = 255;
      bitmap[i + 1] = 255;
      bitmap[i + 2] = 255;
      bitmap[i + 3] = 255;
    } else {
      bitmap[i] = 0;
      bitmap[i + 1] = 0;
      bitmap[i + 2] = 0;
      bitmap[i + 3] = 255;
    }
  }

  const imageData = new ImageData(bitmap, width, height);

  ctx.putImageData(imageData, 0, 0);

  const dataURL = canvas.toDataURL('image/png');

  const base64String = dataURL.split(',')[1];

  return base64String;
}

interface Props {
  image: string;
  brushSize: number;
  mask?: string;
  imageWidth: number;
  imageHeight: number;
}

export interface BrushToolRef {
  getMaskBase64(): string;
  startBrushing(): void;
  stopBrushing(): void;
  clear(): void;
  undo(): void;
}

const BrushTool = forwardRef<BrushToolRef, Props>(
  ({ image, mask, imageWidth, imageHeight, brushSize }, ref) => {
    const canvasRef = useRef<any>(null);
    const [loaded, setLoaded] = useState(false);
    const brushingRef = useRef(true);
    const isDrawingRef = useRef(false);
    const lastPosRef = useRef({ x: -1, y: -1 });
    const curPosRef = useRef({ x: -1, y: -1 });
    const historyRef = useRef<any>([]);
    const curImageRef = useRef<any>(undefined);
    const brushColor = 'rgba(0, 0, 255, 1)';

    const undoImpl = () => {
      const canvas = canvasRef.current as any;
      const ctx = canvas.getContext('2d')!;
      if (historyRef.current.length > 1) {
        const imageData = historyRef.current[historyRef.current.length - 1];
        curImageRef.current = imageData;
        ctx.putImageData(imageData, 0, 0);
        historyRef.current.pop();
      }
    }

    useImperativeHandle(ref, () => ({
      getMaskBase64() {
        return maskToBase64(curImageRef.current, imageWidth, imageHeight);
      },
      clear() {
        historyRef.current = [
          new Uint8ClampedArray(imageWidth * imageHeight * 4),
        ];
        const canvas = canvasRef.current as any;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, imageWidth, imageHeight);
        curImageRef.current = ctx.getImageData(0, 0, imageWidth, imageHeight);
      },
      undo() {
        undoImpl();
      },
      startBrushing() {
        brushingRef.current = true;
      },
      stopBrushing() {
        brushingRef.current = false;
      }
    }));

    useEffect(() => {
      const canvas = canvasRef.current as any;
      const ctx = canvas.getContext('2d')!;

      if (imageWidth === 0 || imageHeight === 0) return;

      canvas.width = imageWidth;
      canvas.height = imageHeight;

      ctx.clearRect(0, 0, imageWidth, imageHeight);
      curImageRef.current = ctx.getImageData(0, 0, imageWidth, imageHeight);
      historyRef.current = [curImageRef.current];

      if (mask) {
        setLoaded(false);
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(
            0,
            0,
            img.naturalWidth,
            img.naturalHeight,
          );
          const bitmap = imageData.data;

          for (let i = 0; i < bitmap.length; i += 4) {
            if (bitmap[i] !== 0 || bitmap[i + 1] !== 0 || bitmap[i + 2] !== 0) {
              bitmap[i] = 0;
              bitmap[i + 1] = 0;
              bitmap[i + 2] = 255;
              bitmap[i + 3] = 255;
            } else {
              bitmap[i] = 0;
              bitmap[i + 1] = 0;
              bitmap[i + 2] = 0;
              bitmap[i + 3] = 0;
            }
          }
          ctx.putImageData(imageData, 0, 0);
          const imageData2 = ctx.getImageData(
            0,
            0,
            img.naturalWidth,
            img.naturalHeight,
          );
          historyRef.current = [imageData2];
          curImageRef.current = imageData2;
          setLoaded(true);
        };
        img.src = mask;
      } else {
        setLoaded(true);
      }
    }, [mask, image, imageHeight, imageWidth]);

    useEffect(() => {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      const drawBrush = (x: any, y: any) => {
        ctx.beginPath();
        ctx.arc(x, y, brushSize, 0, Math.PI * 2);
        ctx.fillStyle = brushColor;
        ctx.fill();
      };

      const interpolate = (x0: any, y0: any, x1: any, y1: any) => {
        const dist = Math.hypot(x1 - x0, y1 - y0);
        const steps = Math.ceil(dist / brushSize) * 2;
        const dx = (x1 - x0) / steps;
        const dy = (y1 - y0) / steps;
        for (let i = 0; i <= steps; i++) {
          const x = x0 + dx * i;
          const y = y0 + dy * i;
          drawBrush(x, y);
        }
      };

      const draw = (e: any) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        const x = (clientX - rect.left) * (canvas.width / rect.width);
        const y = (clientY - rect.top) * (canvas.height / rect.height);

        if (isDrawingRef.current) {
          const lastPos = lastPosRef.current;
          if (lastPos.x !== -1) {
            interpolate(lastPos.x, lastPos.y, x, y);
          } else {
            drawBrush(x, y);
          }
        }

        lastPosRef.current = { x, y };
      };

      const undo = (e: any) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
          undoImpl();
        }
      };

      const startDrawing = (e: any) => {
        if (!brushingRef.current) return;
        e.preventDefault();
        ctx.putImageData(curImageRef.current, 0, 0);
        const imageData = curImageRef.current;
        historyRef.current.push(imageData);
        isDrawingRef.current = true;
        draw(e);
      };

      const stopDrawing = () => {
        if (isDrawingRef.current) {
          curImageRef.current = ctx.getImageData(
            0,
            0,
            canvas.width,
            canvas.height,
          );
        }
        isDrawingRef.current = false;
        lastPosRef.current.x = -1;
      };

      const drawIfDrawing = (e: any) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        const x = (clientX - rect.left) * (canvas.width / rect.width);
        const y = (clientY - rect.top) * (canvas.height / rect.height);
        curPosRef.current = { x, y };
        if (isDrawingRef.current) {
          draw(e);
        } else {
          ctx.putImageData(curImageRef.current, 0, 0);
          ctx.beginPath();
          ctx.arc(x, y, brushSize, 0, Math.PI * 2);
          ctx.strokeStyle = 'black';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      };

      canvas.addEventListener('mousedown', startDrawing);
      canvas.addEventListener('mousemove', drawIfDrawing);
      canvas.addEventListener('mouseup', stopDrawing);
      canvas.addEventListener('mouseleave', stopDrawing);
      canvas.addEventListener('touchstart', startDrawing);
      canvas.addEventListener('touchmove', drawIfDrawing);
      canvas.addEventListener('touchend', stopDrawing);
      window.addEventListener('keydown', undo);

      return () => {
        canvas.removeEventListener('mousedown', startDrawing);
        canvas.removeEventListener('mousemove', drawIfDrawing);
        canvas.removeEventListener('mouseup', stopDrawing);
        canvas.removeEventListener('mouseleave', stopDrawing);
        canvas.removeEventListener('touchstart', startDrawing);
        canvas.removeEventListener('touchmove', drawIfDrawing);
        canvas.removeEventListener('touchend', stopDrawing);
        window.removeEventListener('keydown', undo);
      };
    }, [brushSize]);

    return (
      <div className="canvas-container overflow-auto w-full md:w-auto h-auto md:h-full ">
        {loaded && <img src={image} className="canvas-image" />}
        <canvas
          className="canvas"
          ref={canvasRef}
          width={imageWidth}
          height={imageHeight}
        />
      </div>
    );
  },
);

export default BrushTool;
