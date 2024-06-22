export type ImageEditor = 'photoshop' | 'gimp' | 'mspaint';

export interface Config {
  imageEditor?: ImageEditor;
}
