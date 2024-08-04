export interface WorkFlowDef {

}

export interface WFAbstractVar {
  name: string;
  description: string;
}

export interface WFIntVar extends WFAbstractVar {
  type: 'int';
  min: number;
  max: number;
  step: number;
  default: number;
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

export class SDAbstractPreset extends AbstractPreset implements ISDAbstractPreset {
  @observable accessor cfgRescale: number = 0;
  @observable accessor steps: number = 0;
  @observable accessor promptGuidance: number = 0;
  @observable accessor smea: boolean = false;
  @observable accessor dyn: boolean = false;
  @observable accessor sampling: string = '';
  @observable accessor noiseSchedule: string = '';
  @observable accessor backend: ModelBackend = { type: 'NAI' };
  @observable accessor uc: string = '';

  static fromJSON(json: ISDAbstractPreset): SDAbstractPreset {
    const preset = new SDAbstractPreset();
    Object.assign(preset, json);
    return preset;
  }

  toJSON(): ISDAbstractPreset {
    return {
      ...super.toJSON(),
      cfgRescale: this.cfgRescale,
      steps: this.steps,
      promptGuidance: this.promptGuidance,
      smea: this.smea,
      dyn: this.dyn,
      sampling: this.sampling,
      noiseSchedule: this.noiseSchedule,
      backend: this.backend,
      uc: this.uc,
    };
  }
}
