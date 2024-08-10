import { imageService, taskQueueService, workFlowService } from "..";
import { dataUriToBase64 } from "../ImageService";
import { createSDPrompts } from "../PromptService";
import { TaskParam } from "../TaskQueueService";
import { AugmentJob, GenericScene, PromptNode, Scene, SDAbstractJob, Session } from "../types";
import { WFDefBuilder, wfiIfIn, wfiInlineInput, wfiMiddlePlaceholderInput, wfiPresetSelect, wfiSceneOnly, wfiShowImage, wfiStack, WFVarBuilder } from "./WorkFlow";

const AugmentGenPreset = new WFVarBuilder()
  .addPromptVar('frontPrompt', '')
  .addPromptVar('backPrompt', '')

const AugmentGenShared = new WFVarBuilder()
  .addImageVar('image')
  .addIntVar('weaken', 0, 5, 1, 0)
  .addSelectVar('method',
    [{value:'emotion',label:'감정'}, {value:'colorize',label:'색칠'}, {value:'lineart',label:'라인아트'}, {value:'bg-removal',label:'배경제거'}, {value:'declutter',label:'글자제거'}, {value:'sketch',label:'스케치화'}]
    , 'emotion'
  )

const emotions = ['neutral', 'happy', 'sad', 'angry', 'scared', 'surprised', 'tired', 'excited', 'nervous', 'thinking', 'confused', 'shy', 'disgusted', 'smug', 'bored', 'laughing', 'irritated', 'aroused', 'embarrassed', 'worried', 'love', 'determined', 'hurt', 'playful']

const AugmentGenMeta = new WFVarBuilder()
  .addSelectVar('emotion', emotions.map((e) => ({value:e,label:e})), 'neutral')

const AugmentGenUI = wfiStack([
  wfiInlineInput('수정방법', 'method', 'shared', 'flex-none'),
  wfiInlineInput('이미지', 'image', 'shared', 'flex-none'),
  wfiShowImage('image', 'shared'),
  wfiIfIn('method', 'shared', ['emotion', 'colorize'],
    wfiPresetSelect(),
  ),
  wfiIfIn('method', 'shared', ['emotion', 'colorize'],
    wfiInlineInput('상위 프롬프트','frontPrompt', 'preset', 'flex-1'),
  ),
  wfiIfIn('method', 'shared', ['emotion', 'colorize'],
    wfiMiddlePlaceholderInput('중위 프롬프트 (이 씬에만 적용)'),
  ),
  wfiIfIn('method', 'shared', ['emotion', 'colorize'],
    wfiInlineInput('하위 프롬프트','backPrompt', 'preset', 'flex-1'),
  ),
  wfiIfIn('method', 'shared', ['emotion'],
    wfiSceneOnly(
      wfiInlineInput('감정','emotion', 'meta', 'flex-none', 'top')
    ),
  ),
  wfiIfIn('method', 'shared', ['emotion', 'colorize'],
    wfiInlineInput('강도 약화','weaken', 'shared', 'flex-none')
  ),
]);

const AugmentGenHandler = async (
  session: Session,
  scene: GenericScene,
  prompt: PromptNode,
  preset: any,
  shared: any,
  samples: number,
  meta?: any,
  onComplete?: (img: string) => void,
  nodelay?: boolean,
) => {
  if (!meta) {
    meta = workFlowService.buildMeta('AugmentGen');
  }
  const image = (await imageService.fetchVibeImage(session, shared.image))!;
  const job: AugmentJob = {
    type: 'augment',
    image: dataUriToBase64(image),
    method: shared.method,
    emotion: meta.emotion,
    weaken: shared.weaken,
    prompt: prompt,
    backend: preset.backend,
  };
  const param: TaskParam = {
    session: session,
    job: job,
    scene: scene,
    nodelay: nodelay,
    outputPath: imageService.getOutputDir(session, scene),
    onComplete: onComplete,
  };
  taskQueueService.addTask(param, samples);
};

const AugmentGenCreatePrompts = async (
  session: Session,
  scene: GenericScene,
  preset: any,
  shared: any,
) => {
  return await createSDPrompts(session, preset, shared, scene as Scene);
};

export const AugmentGenDef = new WFDefBuilder('AugmentGen')
  .setTitle('이미지 수정')
  .setBackendType('image')
  .setPresetVars(AugmentGenPreset.build())
  .setSharedVars(AugmentGenShared.build())
  .setMetaVars(AugmentGenMeta.build())
  .setEditor(AugmentGenUI)
  .setCreatePrompt(AugmentGenCreatePrompts)
  .setHandler(AugmentGenHandler)
  .build()

const AugmentPreset = new WFVarBuilder()
  .addImageVar('image')
  .addIntVar('weaken', 0, 5, 1, 0)
  .addSelectVar('method',
    [{value:'emotion',label:'감정'}, {value:'colorize',label:'색칠'}, {value:'lineart',label:'라인아트'}, {value:'bg-removal',label:'배경제거'}, {value:'declutter',label:'글자제거'}, {value:'sketch',label:'스케치화'}]
    , 'emotion'
  )
  .addSelectVar('emotion', emotions.map((e) => ({value:e,label:e})), 'neutral')
  .addPromptVar('prompt', '')

function createAugmentPreset(
  job: SDAbstractJob<string>,
  image?: string,
  mask?: string,
): any {
  const preset = workFlowService.buildPreset('Augment');
  preset.image = image;
  preset.prompt = job.prompt;
  return preset;
}

const AugmentUI = wfiStack([
  wfiInlineInput('수정방법', 'method', 'preset', 'flex-none'),
  wfiInlineInput('이미지', 'image', 'preset', 'flex-none'),
  wfiIfIn('method', 'preset', ['emotion', 'colorize'],
    wfiInlineInput('프롬프트','prompt', 'preset', 'flex-1'),
  ),
  wfiIfIn('method', 'preset', ['emotion'],
    wfiInlineInput('감정','emotion', 'preset', 'flex-none', 'top')
  ),
  wfiIfIn('method', 'preset', ['emotion', 'colorize'],
    wfiInlineInput('강도 약화','weaken', 'preset', 'flex-none')
  ),
]);


const AugmentHandler = async (
  session: Session,
  scene: GenericScene,
  prompt: PromptNode,
  preset: any,
  shared: any,
  samples: number,
  meta?: any,
  onComplete?: (img: string) => void,
  nodelay?: boolean,
) => {
  const image = (await imageService.fetchVibeImage(session, preset.image))!;
  const promptNode: PromptNode = {
    type: 'text',
    text: preset.prompt,
  }
  const job: AugmentJob = {
    type: 'augment',
    image: dataUriToBase64(image),
    method: preset.method,
    emotion: preset.emotion,
    weaken: preset.weaken,
    prompt: promptNode,
    backend: preset.backend,
  };
  const param: TaskParam = {
    session: session,
    job: job,
    scene: scene,
    nodelay: nodelay,
    outputPath: imageService.getOutputDir(session, scene),
    onComplete: onComplete,
  };
  taskQueueService.addTask(param, samples);
};

export const AugmentDef = new WFDefBuilder('Augment')
  .setTitle('이미지 수정')
  .setBackendType('image')
  .setI2I(true)
  .setEmoji('🪛')
  .setPresetVars(AugmentPreset.build())
  .setEditor(AugmentUI)
  .setCreatePreset(createAugmentPreset)
  .setHandler(AugmentHandler)
  .build()
