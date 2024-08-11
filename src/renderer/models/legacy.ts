import { v4 } from "uuid";
import { backend, imageService, sessionService } from ".";
import { dataUriToBase64 } from "./ImageService";
import ExifReader from "exifreader";
import defaultassets from "../defaultassets";
import extractChunks from "png-chunks-extract";
import { IInpaintScene, IPieceLibrary, IPromptPiece, IScene, ISession, IVibeItem, Round } from "./types";
import { Buffer } from 'buffer';

export const defaultUC = `worst quality, bad quality, displeasing, very displeasing, lowres, bad anatomy, bad perspective, bad proportions, bad aspect ratio, bad face, long face, bad teeth, bad neck, long neck, bad arm, bad hands, bad ass, bad leg, bad feet, bad reflection, bad shadow, bad link, bad source, wrong hand, wrong feet, missing limb, missing eye, missing tooth, missing ear, missing finger, extra faces, extra eyes, extra eyebrows, extra mouth, extra tongue, extra teeth, extra ears, extra breasts, extra arms, extra hands, extra legs, extra digits, fewer digits, cropped head, cropped torso, cropped shoulders, cropped arms, cropped legs, mutation, deformed, disfigured, unfinished, chromatic aberration, text, error, jpeg artifacts, watermark, scan, scan artifacts`;

function readJSONFromPNG(base64PNG: string) {
  const buffer = Buffer.from(base64PNG, 'base64');
  const chunks = extractChunks(buffer);
  const jsonChunk = chunks.find(chunk => chunk.name === 'tEXt');
  if (jsonChunk) {
      let base64JsonData = Buffer.from(jsonChunk.data).toString();
      const startIndex = base64JsonData.indexOf('json:') + 5
      base64JsonData = base64JsonData.slice(startIndex);
      const jsonData = JSON.parse(Buffer.from(base64JsonData, 'base64').toString());
      return jsonData;
  } else {
      throw new Error('No JSON data found in the PNG.');
  }
}

async function importStyle(session: any, base64: string) {
  const json = readJSONFromPNG(base64);
  if (!json.profile) {
    return undefined;
  }
  const preset: any = json;
  const path = imageService.getVibesDir(session!) + '/' + v4() + '.png';
  await backend.writeDataFile(path, base64);
  preset.profile = path.split('/').pop()!;
  const presets = session.presets.filter((p: any) => p.type === 'style');
  let cnt = '';
  while (presets.find((p: any) => p.name === preset.name + cnt)) {
    cnt = cnt === '' ? '1' : (parseInt(cnt) + 1).toString();
  }
  preset.name = preset.name + cnt;
  session.presets.push(preset);
  session.presetMode = 'style';
  return preset;
}

function blobToDataUri(blob: Blob) : Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(blob);
  });
}

async function importDefaultPresets(session: any) {
  const images = await Promise.all(defaultassets.map(x=>fetch(x).then(res=>res.blob())));
  for (const image of images) {
    const datauri = await blobToDataUri(image);
    await importStyle(session, dataUriToBase64(datauri));
  }
}

function getInpaintOrgPath(session: any, inpaint: any) {
  return (
    'inpaint_orgs/' + session.name + '/' + inpaint.name + '.png'
  );
}

function base64ToArrayBuffer(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;

  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return bytes.buffer;
}

async function extractExifFromBase64(base64: string) {
  const arrayBuffer = base64ToArrayBuffer(base64);
  const exif = ExifReader.load(arrayBuffer);
  return exif;
}

async function extractPromptDataFromBase64(base64: string) {
  const exif = await extractExifFromBase64(base64);
  const comment = exif['Comment'];
  if (comment && comment.value) {
    const data = JSON.parse(comment.value as string);
    if (data['prompt']) {
      return [data['prompt'], data['seed'], data['scale'], data['sampler'], data['steps'], data['uc']];
    }
  }
  throw new Error("No prompt data found");
}

async function migrateSessionLegacy(session: any) {
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

    const newVibes: IVibeItem[] = [];
    for (const preset of Object.values(session.presets)) {
      for (const vibe of (preset as any).vibes) {
        newVibes.push({
          path: vibe.path.split('/').pop()!,
          info: vibe.info,
          strength: vibe.strength,
        });
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
            getInpaintOrgPath(session, inpaint),
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
            getInpaintOrgPath(session, inpaint),
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
      scene.imageMap = [];
      if (scene.game) {
        scene.game = scene.game.map((x: any) => ({
          rank: x.rank,
          path: x.path.split('/').pop()!,
        }));
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

export async function migrateSession(oldSession: any): Promise<ISession> {
  await migrateSessionLegacy(oldSession);
  const newSession: ISession = {
    version: 1,
    name: oldSession.name,
    presets: {},
    inpaints: {},
    scenes: {},
    library: {},
    presetShareds: {},
  };

  // Migrate presets
  for (const preset of oldSession.presets) {
    const newPreset = migratePreset(preset);
    if (newPreset.type === 'SDImageGen') {
      if (!newSession.presets['SDImageGen']) {
        newSession.presets['SDImageGen'] = [];
      }
      newSession.presets['SDImageGen'].push(newPreset);
    } else {
      if (!newSession.presets['SDImageGenEasy']) {
        newSession.presets['SDImageGenEasy'] = [];
      }
      newSession.presets['SDImageGenEasy'].push(newPreset);
    }
  }

  // Migrate scenes
  for (const [key, scene] of Object.entries(oldSession.scenes)) {
    newSession.scenes[key] = migrateScene(scene);
  }

  // Migrate inpaints
  for (const [key, inpaint] of Object.entries(oldSession.inpaints)) {
    newSession.inpaints[key] = await migrateInpaintScene(oldSession, inpaint);
  }

  // Migrate library
  for (const [key, library] of Object.entries(oldSession.library)) {
    newSession.library[key] = migratePieceLibrary(library);
  }

  // Migrate preset shareds
  for (const [_, shared] of Object.entries(oldSession.presetShareds)) {
    const newShared = migratePresetShared(shared);
    newSession.presetShareds[newShared.type] = newShared;
  }

  return newSession;
}

function migratePreset(preset: any): any {
  const basePreset = {
    name: preset.name,
    cfgRescale: preset.cfgRescale ?? 0,
    steps: preset.steps ?? 28,
    promptGuidance: preset.promptGuidance ?? 5,
    smea: !preset.smeaOff,
    dyn: !!preset.dynOn,
    sampling: preset.sampling ?? 'k_euler_ancestral',
    frontPrompt: preset.frontPrompt,
    backPrompt: preset.backPrompt,
    uc: preset.uc,
    noiseSchedule: preset.noiseSchedule ?? 'native',
    profile: '',
  };

  if (preset.type === 'style') {
    return {
      ...basePreset,
      type: 'SDImageGenEasy',
      profile: preset.profile,
    };
  }

  return {
    ...basePreset,
    type: 'SDImageGen',
  };
}


function migrateRound(round: any): Round | undefined {
  if (!round) {
    return undefined;
  }
  if (round.players == null || round.players.some((x: any) => x == null)) {
    return undefined;
  }
  return {
    curPlayer: round.curPlayer,
    players: round.players.map((player: any) => (player.path)),
    winMask: round.winMask,
  }
}

function migrateScene(scene: any): IScene {
  return {
    type: 'scene',
    name: scene.name,
    resolution: scene.resolution,
    slots: scene.slots.map((slot:any) => slot.map(migratePromptPiece)),
    game: scene.game,
    meta: {},
    round: migrateRound(scene.round),
    imageMap: scene.imageMap,
    mains: scene.mains,
  };
}

async function migrateInpaintScene(session: any, inpaint: any): Promise<IInpaintScene> {
  const imagePath = 'inpaint_orgs/' + session.name + '/' + inpaint.name + '.png';
  const maskPath = 'inpaint_masks/' + session.name + '/' + inpaint.name + '.png';
  let image = '';
  let mask = '';
  try {
    image = dataUriToBase64((await imageService.fetchImage(imagePath))!);
    image = await imageService.storeVibeImage(session, image);
  } catch(e) {}
  try {
    mask = dataUriToBase64((await imageService.fetchImage(maskPath))!);
    mask = await imageService.storeVibeImage(session, mask);
  } catch(e) {}
  return {
    type: 'inpaint',
    name: inpaint.name,
    resolution: inpaint.resolution,
    workflowType: 'SDInpaint',
    preset: {
      type: 'SDInpaint',
      image: image,
      mask: mask,
      strength: 0.7,
      cfgRescale: 0,
      steps: 28,
      promptGuidance: 5,
      smea: false,
      dyn: false,
      originalImage: inpaint.originalImage ?? true,
      sampling: 'k_euler_ancestral',
      prompt: inpaint.prompt,
      uc: inpaint.uc,
      noiseSchedule: 'native',
      vibes: [],
      seed: undefined,
    },
    game: inpaint.game,
    round: inpaint.round,
    imageMap: inpaint.imageMap,
    mains: [],
    sceneRef: inpaint.sceneRef,
  };
}

function migratePromptPiece(piece: any): IPromptPiece {
  return {
    prompt: piece.prompt,
    id: piece.id ?? v4(),
    enabled: piece.enabled,
  };
}

function migratePresetShared(shared: any): any {
  const baseShared = {
    vibes: shared.vibes,
    seed: shared.seed,
  };

  if (shared.type === 'style') {
    return {
      ...baseShared,
      type: 'SDImageGenEasy',
      characterPrompt: shared.characterPrompt,
      backgroundPrompt: shared.backgroundPrompt,
      uc: shared.uc,
    };
  }

  return {
    ...baseShared,
    type: 'SDImageGen',
  };
}

export function migratePieceLibrary(library: any): IPieceLibrary {
  const multi = library.multi ?? {};
  return {
    version: 1,
    name: library.description ?? library.name,
    pieces: Object.entries(library.pieces).map(([k, x]) => ({
      name: k,
      prompt: x as string,
      multi: multi[k],
    })),
  };
}
