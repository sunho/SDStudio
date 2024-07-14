export type ImageEditor = 'photoshop' | 'gimp' | 'mspaint';

export type ModelType = 'fast' | 'quality';

export type RemoveBgQuality = 'low' | 'normal' | 'high' | 'veryhigh' | 'veryveryhigh';

export interface Config {
  imageEditor?: ImageEditor;
  modelType?: ModelType;
  removeBgQuality?: RemoveBgQuality;
  useCUDA?: boolean;
  saveLocation?: string;
  noIpCheck?: boolean;
  uuid?: string;
}
