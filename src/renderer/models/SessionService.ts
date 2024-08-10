import extractChunks from 'png-chunks-extract';
import { Buffer } from 'buffer';
import { v4 } from 'uuid';
import { backend, imageService, workFlowService, zipService } from '.';
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
  ISession,
} from './types';
import { extractPromptDataFromBase64 } from './util';
import * as PngChunk from 'png-chunk-text';
import { Sampling } from '../backends/imageGen';
import encodeChunks from 'png-chunks-encode';
import * as legacy from './legacy';

const SESSION_SERVICE_INTERVAL = 5000;

export class SessionService extends ResourceSyncService<Session> {
  constructor() {
    super('projects', SESSION_SERVICE_INTERVAL);
  }

  async getHook(rc: Session, name: string) {
    rc.name = name;
  }

  async migrate(rc: any) {
    if (!rc.version)  {
      rc = await legacy.migrateSession(rc);
    }
    await this.migrateSession(rc);
    console.log("migrated", rc);
    return rc;
  }

  async createDefault(name: string) {
    const newSession = Session.fromJSON({
      name: name,
      version: 1,
      presets: {},
      inpaints: {},
      scenes: Object.fromEntries([
        [
          'default',
          {
            type: 'scene',
            name: 'default',
            resolution: 'portrait',
            slots: [[{ prompt: '', id: v4() }]],
            game: undefined,
            round: undefined,
            imageMap: [],
            mains: [],
          },
        ],
      ]),
      library: {},
      presetShareds: {},
    });
    await importDefaultPresets(newSession);
    return newSession;
  }

  getInpaintOrgPath(session: Session, inpaint: InpaintScene) {
    return 'inpaint_orgs/' + session.name + '/' + inpaint.name + '.png';
  }

  getInpaintMaskPath(session: Session, inpaint: InpaintScene) {
    return 'inpaint_masks/' + session.name + '/' + inpaint.name + '.png';
  }

  async exportSessionShallow(session: Session) {
    const sess: ISession = session.toJSON();
    if (sess.presetShareds.SDImageGenEasy) {
      sess.presetShareds.SDImageGenEasy.vibes = [];
    }
    if (sess.presetShareds.SDImageGen) {
      sess.presetShareds.SDImageGen.vibes = [];
    }
    for (const scene of Object.values(sess.scenes)) {
      scene.game = undefined;
      scene.round = undefined;
      scene.imageMap = [];
      scene.mains = [];
    }
    sess.inpaints = {};

    for (const presetSet of Object.values(sess.presets)){
      for (const preset of presetSet) {
        if (preset.profile) {
          try {
            const data = (await imageService.fetchVibeImage(session, preset.profile))!;
            const base64 = dataUriToBase64(data);
            preset.profile = base64;
          } catch (e) {}
        }
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
    for (const scene of session.scenes.values()) {
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
    for (const inpaint of session.inpaints.values()) {
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

  async importSessionShallow(session: ISession, name: string) {
    if (name in this.resources) {
      throw new Error('Resource already exists');
    }
    session.name = name;
    if (Array.isArray(session.presets)) {
      for (const preset of session.presets) {
        if (preset.type === 'style') {
          try {
            const path = 'vibes/' + name + '/' + v4() + '.png';
            await backend.writeDataFile(path, preset.profile);
            preset.profile = path.split('/').pop()!;
          } catch(e){}
        }
      }
    } else if (session.presets) {
      for (const presetSet of Object.values(session.presets)){
        for (const preset of presetSet) {
          if (preset.profile) {
            try {
              const path = 'vibes/' + name + '/' + v4() + '.png';
              await backend.writeDataFile(path, preset.profile);
              preset.profile = path.split('/').pop()!;
            } catch(e){}
          }
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

  styleEdit(preset: any, container: any) {
    this.dispatchEvent(
      new CustomEvent('style-edit', { detail: { preset, container } }),
    );
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
  if (!session.presets.has('SDImageGenEasy')) {
    session.presets.set('SDImageGenEasy', []);
  }
  const images = await Promise.all(
    defaultassets.map((x) => fetch(x).then((res) => res.blob())),
  );
  for (const image of images) {
    const datauri = await blobToDataUri(image);
    await importPreset(session, dataUriToBase64(datauri));
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
  try {
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
      return undefined;
    }
  } catch (e) {
    return undefined;
  }
}

export async function importPreset(session: Session, base64: string) {
  let json = readJSONFromPNG(base64);
  if (!json || !json.type || !json.name) {
    return undefined;
  }
  if (json.type === 'style') {
    const newJson: any = {};
    newJson.type = 'SDImageGenEasy'
    newJson.name = json.name;
    newJson.profile = json.profile;
    newJson.dyn = !!json.dynOn;
    newJson.smea = !json.smeaOff;
    newJson.sampling = json.sampling ?? Sampling.KEulerAncestral;
    newJson.noiseSchedule = json.noiseSchedule ?? 'native';
    newJson.promptGuidance = json.promptGuidance ?? 5;
    newJson.cfgRescale = json.cfgRescale ?? 0;
    newJson.frontPrompt = json.frontPrompt;
    newJson.backPrompt = json.backPrompt;
    newJson.uc = json.uc;
    newJson.steps = json.steps ?? 28;
    json = newJson;
  }
  const path = await imageService.storeVibeImage(session, base64);
  json.profile = path;
  const preset = workFlowService.presetFromJSON(json);
  session.addPreset(preset);
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
  const scene = session.scenes.get(oldName)!;
  scene.name = newName;
  session.scenes.delete(oldName);
  session.scenes.set(newName, scene);
};

export function createImageWithText(
  width: number,
  height: number,
  text: string,
  fontSize: number = 30,
  fontFamily: string = 'Arial',
  textColor: string = 'black',
  backgroundColor: string = 'white'
) {
  const canvas: HTMLCanvasElement = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Unable to get 2D context from canvas');
  }

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = textColor;
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillText(text, width / 2, height / 2);

  return dataUriToBase64(canvas.toDataURL('image/png'));
}
