import encodeChunks from 'png-chunks-encode';
import extractChunks from 'png-chunks-extract';
import { v4 } from 'uuid';
import { backend, imageService, zipService } from '.';
import { FileEntry } from '../backend';
import defaultassets from '../defaultassets';
import { dataUriToBase64 } from './ImageService';
import { defaultUC } from './PromptService';
import { ResourceSyncService } from './ResourceSyncService';
import {
  PromptPieceSlot,
  GenericScene,
  InpaintScene,
  Scene,
  Session,
} from './types';
import { extractPromptDataFromBase64 } from './util';
import * as PngChunk from 'png-chunk-text';
import { cast, getSnapshot, onSnapshot } from 'mobx-state-tree';

const SESSION_SERVICE_INTERVAL = 5000;

export class SessionService extends ResourceSyncService<Session> {
  constructor() {
    super('projects', SESSION_SERVICE_INTERVAL);
  }

  async getHook(rc: Session, name: string) {
    rc.name = name;
    //await this.migrateSession(rc);
  }

  async createDefault(name: string) {
    const newSession = Session.fromJSON({
      name: name,
      presets: {},
      inpaints: {},
      scenes: Object.fromEntries([['default', {
          type: 'scene',
          name: 'default',
          resolution: 'portrait',
          slots: [[{prompt:'', id: v4()}]],
          game: undefined,
          round: undefined,
          imageMap: [],
          mains: [],
      }]]),
      library: {},
      presetShareds: {}
    });
    // await importDefaultPresets(newSession);
    return newSession;
  }

  getInpaintOrgPath(session: Session, inpaint: InpaintScene) {
    return 'inpaint_orgs/' + session.name + '/' + inpaint.name + '.png';
  }

  getInpaintMaskPath(session: Session, inpaint: InpaintScene) {
    return 'inpaint_masks/' + session.name + '/' + inpaint.name + '.png';
  }

  async exportSessionShallow(session: Session) {
    const sess: Session = Session.fromJSON(session.toJSON());
    sess.presetShareds.get('sdimagegen').vibes = [];
    for (const scene of Object.values(sess.scenes)) {
      scene.game = undefined;
      scene.round = undefined;
      scene.imageMap = cast([]);
      scene.mains = cast([]);
    }

    for (const scene of Object.values(sess.inpaints)) {
      scene.game = undefined;
      scene.round = undefined;
      scene.imageMap = [];
    }

    const newPresets = [];
    for (const preset of sess.presets) {
      if (preset.type === 'style') {
        try {
          const data = await backend.readDataFile(
            imageService.getVibesDir(session) + '/' + preset.profile,
          );
          const base64 = dataUriToBase64(data);
          preset.profile = base64;
          newPresets.push(preset);
        } catch (e) {}
      } else {
        newPresets.push(preset);
      }
    }
    return sess;
  }

  async exportSessionDeep(session: Session, outPath: string) {
    const ignoreError = async (f: Promise<any>) => {
      try {
        return await f;
      } catch (e) {
        return [];
      }
    };

    const projFile = 'projects/' + session.name + '.json';
    const entries: FileEntry[] = [];
    for (const scene of Object.values(session.scenes)) {
      const images = await ignoreError(
        backend.listFiles('outs/' + session.name + '/' + scene.name),
      );
      for (const image of images) {
        if (!image.endsWith('.png')) continue;
        entries.push({
          path: 'outs/' + session.name + '/' + scene.name + '/' + image,
          name: 'outs/' + scene.name + '/' + image,
        });
      }
    }
    const inpaintOrgs = await ignoreError(
      backend.listFiles('inpaint_orgs/' + session.name),
    );
    const inpaintMasks = await ignoreError(
      backend.listFiles('inpaint_masks/' + session.name),
    );
    for (const image of inpaintOrgs) {
      if (!image.endsWith('.png')) continue;
      entries.push({
        path: 'inpaint_orgs/' + session.name + '/' + image,
        name: 'inpaint_orgs/' + image,
      });
    }
    for (const image of inpaintMasks) {
      if (!image.endsWith('.png')) continue;
      entries.push({
        path: 'inpaint_masks/' + session.name + '/' + image,
        name: 'inpaint_masks/' + image,
      });
    }
    for (const inpaint of Object.values(session.inpaints)) {
      const inpaints = await ignoreError(
        backend.listFiles('inpaints/' + session.name + '/' + inpaint.name),
      );
      for (const image of inpaints) {
        if (!image.endsWith('.png')) continue;
        entries.push({
          path: 'inpaints/' + session.name + '/' + inpaint.name + '/' + image,
          name: 'inpaints/' + inpaint.name + '/' + image,
        });
      }
    }
    const vibes = await ignoreError(backend.listFiles('vibes/' + session.name));
    for (const vibe of vibes) {
      if (!vibe.endsWith('.png')) continue;
      entries.push({
        path: 'vibes/' + session.name + '/' + vibe,
        name: 'vibes/' + vibe,
      });
    }
    entries.push({ path: projFile, name: 'project.json' });
    if (zipService.isZipping) {
      throw new Error('Already zipping');
    }
    await zipService.zipFiles(entries, outPath);
  }

  async importSessionShallow(session: Session, name: string) {
    if (name in this.resources) {
      throw new Error('Resource already exists');
    }
    session.name = name;
    if (Array.isArray(session.presets)) {
      for (const preset of session.presets) {
        if (preset.type === 'style') {
          const path = imageService.getVibesDir(session) + '/' + v4() + '.png';
          await backend.writeDataFile(path, preset.profile);
          preset.profile = path.split('/').pop()!;
        }
      }
    }
    await this.createFrom(name, session);
  }

  async importSessionDeep(tarpath: string, name: string) {
    if (name in this.resources) {
      throw new Error('Resource already exists');
    }
    const path = 'tmp/' + v4();
    await backend.unzipFiles(tarpath, path);
    const session: Session = JSON.parse(
      await backend.readFile(path + '/project.json'),
    );
    session.name = name;
    try {
      await backend.renameDir(path + '/outs', 'outs/' + session.name);
    } catch (e) {
      console.error(e);
    }
    try {
      await backend.renameDir(path + '/inpaints', 'inpaints/' + session.name);
    } catch (e) {
      console.error(e);
    }
    try {
      await backend.renameDir(
        path + '/inpaint_orgs',
        'inpaint_orgs/' + session.name,
      );
    } catch (e) {
      console.error(e);
    }
    try {
      await backend.renameDir(
        path + '/inpaint_masks',
        'inpaint_masks/' + session.name,
      );
    } catch (e) {
      console.error(e);
    }
    try {
      await backend.renameDir(path + '/vibes', 'vibes/' + session.name);
    } catch (e) {
      console.error(e);
    }
    await this.createFrom(name, session);
  }

  async migrateSession(session: any) {
    if (!Array.isArray(session.presets)) {
      for (const preset of Object.values(session.presets)) {
        if ((preset as any).vibe) {
          (preset as any).vibes = [
            { image: (preset as any).vibe, info: 1, strength: 0.6 },
          ] as any;
          (preset as any).vibe = undefined;
        }
        if ((preset as any).vibes == null) {
          (preset as any).vibes = [];
        }
      }

      for (const preset of Object.values(session.presets)) {
        for (const vibe of (preset as any).vibes) {
          if ((vibe as any).image) {
            const path =
              imageService.getVibesDir(session) + '/' + v4() + '.png';
            await backend.writeDataFile(path, (vibe as any).image);
            vibe.path = path;
            (vibe as any).image = undefined;
          }
        }
      }

      session.presetShareds = {
        preset: {
          type: 'preset',
          vibes: [],
        },
        style: {
          type: 'style',
          backgroundPrompt: '',
          characterPrompt: '',
          uc: '',
          vibes: [],
        },
      };

      const newVibes = [];
      for (const preset of Object.values(session.presets)) {
        for (const vibe of (preset as any).vibes) {
          newVibes.push(vibe);
        }
      }
      session.presetShareds['preset'].vibes = newVibes;

      const newPresets = [];
      for (const [k, v] of Object.entries(session.presets as any)) {
        (v as any).name = k;
        (v as any).type = 'preset';
        newPresets.push(v);
      }
      session.presets = newPresets as any;
      await importDefaultPresets(session);
      session.presetMode = 'preset';
    }

    for (const inpaint of Object.values(session.inpaints) as any) {
      if (inpaint.image) {
        try {
          const path =
            'inpaint_orgs/' + session.name + '/' + inpaint.name + '.png';
          await backend.writeDataFile(path, inpaint.image);
          inpaint.image = undefined;
        } catch (e) {
          inpaint.image = undefined;
        }
      }
      if (inpaint.mask) {
        try {
          const path =
            'inpaint_masks/' + session.name + '/' + inpaint.name + '.png';
          await backend.writeDataFile(path, inpaint.mask);
          inpaint.mask = undefined;
        } catch (e) {
          inpaint.mask = undefined;
        }
      }
      if ((inpaint as any).middlePrompt != null) {
        inpaint.prompt = '';
        try {
          const image = dataUriToBase64(
            (await imageService.fetchImage(
              this.getInpaintOrgPath(session, inpaint),
            ))!,
          );
          const [prompt, seed, scale, sampler, steps, uc] =
            await extractPromptDataFromBase64(image);
          inpaint.prompt = prompt;
        } catch (e) {
          inpaint.prompt = (inpaint as any).middlePrompt;
        }
        (inpaint as any).middlePrompt = undefined;
      }
      if (!inpaint.uc) {
        inpaint.uc = '';
        try {
          const image = dataUriToBase64(
            (await imageService.fetchImage(
              this.getInpaintOrgPath(session, inpaint),
            ))!,
          );
          const [prompt, seed, scale, sampler, steps, uc] =
            await extractPromptDataFromBase64(image);
          inpaint.uc = uc;
        } catch (e) {
          inpaint.uc = defaultUC;
        }
      }
    }

    for (const scene of Object.values(session.scenes) as any) {
      if (scene.landscape != null) {
        if (scene.landscape) {
          scene.resolution = 'landscape';
        } else {
          scene.resolution = 'portrait';
        }
        scene.landscape = undefined;
      }
      if ((scene as any).main) {
        scene.mains = [(scene as any).main];
        (scene as any).main = undefined;
      }
      scene.mains = scene.mains ?? [];
    }

    for (const inpaint of Object.values(session.inpaints) as any) {
      if (inpaint.landscape != null) {
        if (inpaint.landscape) {
          inpaint.resolution = 'landscape';
        } else {
          inpaint.resolution = 'portrait';
        }
        inpaint.landscape = undefined;
      }
    }

    for (const library of Object.values(session.library) as any) {
      if (!library.multi) {
        library.multi = {};
      }
    }

    for (const scene of Object.values(session.scenes) as any) {
      if (!scene.imageMap) {
        scene.imageMap = cast([]);
        if (scene.game) {
          scene.game = cast(scene.game.map((x: any) => ({
            rank: x.rank,
            path: x.path.split('/').pop()!,
          })));
        }
        if (scene.round) {
          scene.round.players = scene.round.players.map((x: any) => ({
            rank: x.rank,
            path: x.path.split('/').pop()!,
          }));
        }
      }
    }

    for (const inpaint of Object.values(session.inpaints) as any) {
      if (!inpaint.imageMap) {
        inpaint.imageMap = [];
        if (inpaint.game) {
          inpaint.game = inpaint.game.map((x: any) => ({
            rank: x.rank,
            path: x.path.split('/').pop()!,
          }));
        }
        if (inpaint.round) {
          inpaint.round.players = inpaint.round.players.map((x: any) => ({
            rank: x.rank,
            path: x.path.split('/').pop()!,
          }));
        }
      }
    }
  }

  async saveInpaintImages(
    seesion: Session,
    inpaint: InpaintScene,
    image: string,
    mask: string,
  ) {
    await backend.writeDataFile(
      this.getInpaintOrgPath(seesion, inpaint),
      image,
    );
    await backend.writeDataFile(
      this.getInpaintMaskPath(seesion, inpaint),
      mask,
    );
    await imageService.invalidateCache(
      this.getInpaintOrgPath(seesion, inpaint),
    );
    await imageService.invalidateCache(
      this.getInpaintMaskPath(seesion, inpaint),
    );
  }

  inPaintHook(): void {
    this.dispatchEvent(new CustomEvent('inpaint-updated', {}));
  }

  mainImageUpdated(): void {
    this.dispatchEvent(new CustomEvent('main-image-updated', {}));
  }

  pieceLibraryImported(): void {
    this.dispatchEvent(new CustomEvent('piece-library-imported', {}));
  }

  sceneOrderChanged(): void {
    this.dispatchEvent(new CustomEvent('scene-order-changed', {}));
  }

  configChanged(): void {
    this.dispatchEvent(new CustomEvent('config-changed', {}));
  }

  async reloadPieceLibraryDB(session: Session) {
    const res = [];
    for (const [k, v] of session.library.entries()) {
      for (const piece of v.pieces) {
        res.push(k + '.' + piece.name);
      }
    }
    await backend.loadPiecesDB(res);
  }
}

export async function importDefaultPresets(session: Session) {
  const images = await Promise.all(
    defaultassets.map((x) => fetch(x).then((res) => res.blob())),
  );
  for (const image of images) {
    const datauri = await blobToDataUri(image);
    await importStyle(session, dataUriToBase64(datauri));
  }
}
function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(blob);
  });
}

export function embedJSONInPNG(inputBase64: string, jsonData: any) {
  const inputBuffer = Buffer.from(inputBase64, 'base64');
  const chunks = extractChunks(inputBuffer);

  const jsonTextChunk = PngChunk.encode(
    'tEXt',
    'json:' + Buffer.from(JSON.stringify(jsonData)).toString('base64'),
  );
  chunks.splice(1, 0, jsonTextChunk);
  const outputBuffer = Buffer.from(encodeChunks(chunks));
  const outputBase64 = outputBuffer.toString('base64');
  return outputBase64;
}

export function readJSONFromPNG(base64PNG: string) {
  const buffer = Buffer.from(base64PNG, 'base64');
  const chunks = extractChunks(buffer);
  const jsonChunk = chunks.find((chunk) => chunk.name === 'tEXt');
  if (jsonChunk) {
    let base64JsonData = Buffer.from(jsonChunk.data).toString();
    const startIndex = base64JsonData.indexOf('json:') + 5;
    base64JsonData = base64JsonData.slice(startIndex);
    const jsonData = JSON.parse(
      Buffer.from(base64JsonData, 'base64').toString(),
    );
    return jsonData;
  } else {
    throw new Error('No JSON data found in the PNG.');
  }
}

export async function importStyle(session: Session, base64: string) {
  const json = readJSONFromPNG(base64);
  if (!json.profile) {
    return undefined;
  }
  const preset: StylePreSet = json;
  const path = imageService.getVibesDir(session!) + '/' + v4() + '.png';
  await backend.writeDataFile(path, base64);
  preset.profile = path.split('/').pop()!;
  const presets = session.presets.filter((p) => p.type === 'style');
  let cnt = '';
  while (presets.find((p) => p.name === preset.name + cnt)) {
    cnt = cnt === '' ? '1' : (parseInt(cnt) + 1).toString();
  }
  preset.name = preset.name + cnt;
  session.presets.push(preset);
  session.presetMode = 'style';
  return preset;
}

export const getResultDirectory = (session: Session, scene: GenericScene) => {
  if (scene.type === 'scene') {
    return imageService.getImageDir(session, scene);
  }
  return imageService.getInPaintDir(session, scene);
};

export const renameScene = async (
  session: Session,
  oldName: string,
  newName: string,
) => {
  await imageService.onRenameScene(session, oldName, newName);
  const scene = session.scenes[oldName];
  scene.name = newName;
  delete session.scenes[oldName];
  session.scenes[newName] = scene;
};
