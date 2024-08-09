import { action, observable, makeAutoObservable } from 'mobx';
import {
  GenericScene,
  ModelBackend,
  PromptNode,
  Session,
  VibeItem,
} from '../types';

export type WFBackendType = 'image' | 'none';

export interface WorkFlowDef {
  type: string;
  title: string;
  presetVars: WFVar[];
  sharedVars: WFVar[];
  backendType: WFBackendType;
  editor: WFIElement;
  innerEditor?: WFIElement;
  hasMask?: boolean;
  i2i: boolean;
  handler: WFHandler;
  createPrompt?: WFCreatePrompt;
}

export type WFHandler = (
  session: Session,
  scene: GenericScene,
  prompt: PromptNode,
  preset: any,
  shared: any,
  samples: number,
  onComplete?: (img: string) => void,
  nodelay?: boolean,
) => void | Promise<void>;
export type WFCreatePrompt = (
  session: Session,
  scene: GenericScene,
  preset: any,
  shared: any,
) => PromptNode[] | Promise<PromptNode[]>;

export interface WFAbstractVar {
  name: string;
}

export interface WFStringVar extends WFAbstractVar {
  type: 'string';
  default: string;
}

export interface WFBackendVar extends WFAbstractVar {
  type: 'backend';
  default: ModelBackend;
}

export interface WFIntVar extends WFAbstractVar {
  type: 'int';
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface WFNullIntVar extends WFAbstractVar {
  type: 'nullInt';
}

export interface WFVibeSetVar extends WFAbstractVar {
  type: 'vibeSet';
}

export interface WFSamplingVar extends WFAbstractVar {
  type: 'sampling';
  default: string;
}

export interface WFNoiseScheduleVar extends WFAbstractVar {
  type: 'noiseSchedule';
  default: string;
}

export interface WFBoolVar extends WFAbstractVar {
  type: 'bool';
  default: boolean;
}

export interface WFPromptVar extends WFAbstractVar {
  type: 'prompt';
  default: string;
}

export interface WFImageVar extends WFAbstractVar {
  type: 'image';
}

export interface WFMaskVar extends WFAbstractVar {
  type: 'mask';
  imageRef: string;
}

export type WFVar =
  | WFIntVar
  | WFVibeSetVar
  | WFSamplingVar
  | WFNoiseScheduleVar
  | WFBoolVar
  | WFPromptVar
  | WFImageVar
  | WFMaskVar
  | WFBackendVar
  | WFNullIntVar
  | WFStringVar;

export type WFIFlex = 'flex-1' | 'flex-2' | 'flex-none';

export interface WFIAbstract {}

export interface WFIPresetSelect extends WFIAbstract {
  type: 'presetSelect';
}

export interface WFIProfilePresetSelect extends WFIAbstract {
  type: 'profilePresetSelect';
}

export interface WFIStack extends WFIAbstract {
  type: 'stack';
  inputs: WFIElement[];
}

export interface WFIInlineInput extends WFIAbstract {
  type: 'inline';
  label: string;
  field: string;
  preset: boolean;
  flex: WFIFlex;
}

export interface WFIGroup extends WFIAbstract {
  type: 'group';
  label: string;
  inputs: WFIElement[];
}

export interface WFIMiddlePlaceholderInput extends WFIAbstract {
  type: 'middlePlaceholder';
  label: string;
}

export interface WFIPush extends WFIAbstract {
  type: 'push';
  direction: 'top' | 'bottom' | 'left' | 'right';
}

export type WFIElement =
  | WFIProfilePresetSelect
  | WFIPresetSelect
  | WFIStack
  | WFIInlineInput
  | WFIGroup
  | WFIMiddlePlaceholderInput
  | WFIPush;

function createDefaultValue(varObj: WFVar) {
  switch (varObj.type) {
    case 'int':
      return (varObj as WFIntVar).default;
    case 'vibeSet':
      return [];
    case 'sampling':
      return (varObj as WFSamplingVar).default;
    case 'noiseSchedule':
      return (varObj as WFNoiseScheduleVar).default;
    case 'bool':
      return (varObj as WFBoolVar).default;
    case 'prompt':
      return (varObj as WFPromptVar).default;
    case 'image':
      return '';
    case 'mask':
      return '';
    case 'backend':
      return (varObj as WFBackendVar).default;
    case 'nullInt':
      return null;
    case 'string':
      return (varObj as WFStringVar).default;
    default:
      throw new Error('Unknown type');
  }
}

function createMobxObject(vars: WFVar[]) {
  const obj: any = {};
  vars.forEach((varObj) => {
    obj[varObj.name] = createDefaultValue(varObj);
  });
  return makeAutoObservable(obj);
}

function materializeWFObj(type: string, vars: WFVar[]) {
  const obj = createMobxObject(vars);
  obj['type'] = type;
  const params: { [key: string]: WFVar } = {};
  for (const varObj of vars) {
    params[varObj.name] = varObj;
  }

  obj.fromJSON = (json: any) => {
    Object.keys(params).forEach((key) => {
      if (params[key].type === 'vibeSet') {
        obj[key] = json[key].map((x: any) => VibeItem.fromJSON(x));
      } else {
        obj[key] = json[key];
      }
    });
  };

  obj.toJSON = () => {
    const json: any = {};
    json['type'] = type;
    Object.keys(params).forEach((key) => {
      if (params[key].type === 'vibeSet') {
        json[key] = obj[key].map((x: VibeItem) => x.toJSON());
      } else {
        json[key] = obj[key];
      }
    });
    return json;
  };

  return obj;
}

export class WFVarBuilder {
  private vars: WFVar[] = [];

  clone() {
    const newBuilder = new WFVarBuilder();
    newBuilder.vars = this.vars.slice();
    return newBuilder;
  }

  addIntVar(
    name: string,
    min: number,
    max: number,
    step: number,
    defaultValue: number,
  ): this {
    this.vars.push({
      type: 'int',
      name,
      min,
      max,
      step,
      default: defaultValue,
    });
    return this;
  }

  addNullIntVar(name: string): this {
    this.vars.push({
      type: 'nullInt',
      name,
    });
    return this;
  }

  addVibeSetVar(name: string): this {
    this.vars.push({
      type: 'vibeSet',
      name,
    });
    return this;
  }

  addSamplingVar(name: string, defaultValue: string): this {
    this.vars.push({
      type: 'sampling',
      name,
      default: defaultValue,
    });
    return this;
  }

  addNoiseScheduleVar(name: string, defaultValue: string): this {
    this.vars.push({
      type: 'noiseSchedule',
      name,
      default: defaultValue,
    });
    return this;
  }

  addBoolVar(name: string, defaultValue: boolean): this {
    this.vars.push({
      type: 'bool',
      name,
      default: defaultValue,
    });
    return this;
  }

  addPromptVar(name: string, defaultValue: string): this {
    this.vars.push({
      type: 'prompt',
      name,
      default: defaultValue,
    });
    return this;
  }

  addImageVar(name: string): this {
    this.vars.push({
      type: 'image',
      name,
    });
    return this;
  }

  addMaskVar(name: string, imageRef: string): this {
    this.vars.push({
      type: 'mask',
      name,
      imageRef,
    });
    return this;
  }

  addBackendVar(name: string, defaultValue: ModelBackend): this {
    this.vars.push({
      type: 'backend',
      name,
      default: defaultValue,
    });
    return this;
  }

  addStringVar(name: string, defaultValue: string): this {
    this.vars.push({
      type: 'string',
      name,
      default: defaultValue,
    });
    return this;
  }

  build(): WFVar[] {
    return this.vars;
  }
}

export class WFWorkFlow {
  def: WorkFlowDef;
  constructor(def: WorkFlowDef) {
    this.def = def;
  }

  getType() {
    return this.def.type;
  }

  getTitle() {
    return this.def.title;
  }

  buildShared() {
    return materializeWFObj(this.def.type, this.def.sharedVars);
  }

  buildPreset() {
    let newVars = this.def.presetVars.concat([
      { type: 'string', name: 'name', default: '' },
      { type: 'string', name: 'profile', default: '' },
    ]);
    if (this.def.backendType === 'none') {
      return materializeWFObj(this.def.type, newVars);
    } else {
      newVars = newVars.concat([
        { type: 'backend', name: 'backend', default: { type: 'NAI' } },
      ]);
      return materializeWFObj(this.def.type, newVars);
    }
  }

  presetFromJSON(json: any) {
    const preset = this.buildPreset();
    preset.fromJSON(json);
    return preset;
  }

  sharedFromJSON(json: any) {
    const shared = this.buildShared();
    shared.fromJSON(json);
    return shared;
  }
}

export function wfiPresetSelect(): WFIPresetSelect {
  return { type: 'presetSelect' };
}

export function wfiProfilePresetSelect(): WFIProfilePresetSelect {
  return { type: 'profilePresetSelect' };
}

export function wfiStack(inputs: WFIElement[]): WFIStack {
  return { type: 'stack', inputs };
}

export function wfiInlineInput(
  label: string,
  field: string,
  preset: boolean,
  flex: WFIFlex,
): WFIInlineInput {
  return { type: 'inline', label, field, preset, flex };
}

export function wfiGroup(label: string, inputs: WFIElement[]): WFIGroup {
  return { type: 'group', label, inputs };
}

export function wfiMiddlePlaceholderInput(
  label: string,
): WFIMiddlePlaceholderInput {
  return { type: 'middlePlaceholder', label };
}

export function wfiPush(
  direction: 'top' | 'bottom' | 'left' | 'right',
): WFIPush {
  return { type: 'push', direction };
}

export class WFDefBuilder {
  private workflowDef: WorkFlowDef;

  constructor(type: string) {
    this.workflowDef = {
      type,
      presetVars: [],
      sharedVars: [],
      backendType: 'none',
      editor: null as any,
      innerEditor: null as any,
      i2i: false,
      title: '',
      handler: () => {},
    };
  }

  setTitle(title: string): this {
    this.workflowDef.title = title;
    return this;
  }

  setPresetVars(presetVars: WFVar[]): this {
    this.workflowDef.presetVars = presetVars;
    return this;
  }

  setSharedVars(sharedVars: WFVar[]): this {
    this.workflowDef.sharedVars = sharedVars;
    return this;
  }

  setBackendType(backendType: WFBackendType): this {
    this.workflowDef.backendType = backendType;
    return this;
  }

  setEditor(editor: WFIElement): this {
    this.workflowDef.editor = editor;
    return this;
  }

  setInnerEditor(innerEditor: WFIElement): this {
    this.workflowDef.innerEditor = innerEditor;
    return this;
  }

  setI2I(i2i: boolean): this {
    this.workflowDef.i2i = i2i;
    return this;
  }

  setHandler(handler: WFHandler): this {
    this.workflowDef.handler = handler;
    return this;
  }

  setCreatePrompt(createPrompt: WFCreatePrompt): this {
    this.workflowDef.createPrompt = createPrompt;
    return this;
  }

  setHasMask(hasMask: boolean): this {
    this.workflowDef.hasMask = hasMask;
    return this;
  }

  build(): WorkFlowDef {
    return this.workflowDef;
  }
}
