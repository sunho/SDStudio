// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

export type Channels =
  | 'write-file'
  | 'read-file'
  | 'delete-file'
  | 'image-gen'
  | 'inpaint-image'
  | 'list-files'
  | 'prompt'
  | 'login'
  | 'rename-file'
  | 'rename-dir'
  | 'write-data-file'
  | 'read-data-file'
  | 'copy-file'
  | 'close'
  | 'show-file'
  | 'zip-files'
  | 'get-version'
  | 'open-web-page'
  | 'search-tags'
  | 'load-pieces-db'
  | 'get-config'
  | 'set-config'
  | 'search-pieces'
  | 'trash-file'
  | 'delete-dir'
  | 'spawn-local-ai'
  | 'is-local-ai-running'
  | 'resize-image'
  | 'exist-file'
  | 'open-image-editor'
  | 'watch-image'
  | 'unwatch-image'
  | 'load-model'
  | 'extract-zip'
  | 'download'
  | 'remove-bg'
  | 'select-dir'
  | 'unzip-files'
  | 'select-file'
  | 'get-remain-credits';

const electronHandler = {
  ipcRenderer: {
    on(channel: string, func: (...args: any[]) => void | Promise<void>) {
      const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
        func(...args);
      ipcRenderer.on(channel, subscription);

      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
    once(channel: Channels, func: (...args: unknown[]) => void) {
      ipcRenderer.once(channel, (_event, ...args) => func(...args));
    },
    invoke(channel: Channels, ...args: unknown[]) {
      return ipcRenderer.invoke(channel, ...args);
    },
    onClose(func: () => void) {
      ipcRenderer.on('close', func);
    },
  },
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
