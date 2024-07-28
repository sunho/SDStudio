import { registerPlugin } from '@capacitor/core';

export interface ResizeImageInput {
  base64Input: string;
  maxWidth: number;
  maxHeight: number;
}

export interface ResizeImageOutput {
  base64Output: string;
}

export interface ImageResizerPlugin {
  resizeImage(options: ResizeImageInput): Promise<ResizeImageOutput>;
}

const ImageResizer = registerPlugin<ImageResizerPlugin>('ImageResizer');

export default ImageResizer;
