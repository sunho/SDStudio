import { WFWorkFlow, WorkFlowDef } from "./WorkFlow";


export enum WorkFlowCategoryFlag {
  General = 1 << 0,
  I2I = 1 << 1,
  OneTime = 1 << 2,
}

export type WorkFlowCategory = number;

export class WorkFlowService {
  workflows: Map<string, WFWorkFlow>;
  generalFlows: WFWorkFlow[] = [];
  i2iFlows: WFWorkFlow[] = [];
  oneTimeFlows: WFWorkFlow[] = [];
  constructor() {
    this.workflows = new Map();
  }

  addWorkFlow(category: WorkFlowCategory, def: WorkFlowDef) {
    const workflow = new WFWorkFlow(def);
    if (category & WorkFlowCategoryFlag.General) {
      this.generalFlows.push(workflow);
    }
    if (category & WorkFlowCategoryFlag.I2I) {
      this.i2iFlows.push(workflow);
    }
    if (category & WorkFlowCategoryFlag.OneTime) {
      this.oneTimeFlows.push(workflow);
    }
    this.workflows.set(workflow.getType(), workflow);
  }

  presetFromJSON(json: any) {
    const wf = this.workflows.get(json.type);
    if (!wf) {
      throw new Error(`Unknown workflow type: ${json.type}`);
    }
    return wf.presetFromJSON(json);
  }

  sharedFromJSON(json: any) {
    const wf = this.workflows.get(json.type);
    if (!wf) {
      throw new Error(`Unknown workflow type: ${json.type}`);
    }
    return wf.sharedFromJSON(json);
  }

  buildShared(type: string) {
    const wf = this.workflows.get(type);
    if (!wf) {
      throw new Error(`Unknown workflow type: ${type}`);
    }
    return wf.buildShared();
  }

  buildPreset(type: string) {
    const wf = this.workflows.get(type);
    if (!wf) {
      throw new Error(`Unknown workflow type: ${type}`);
    }
    return wf.buildPreset();
  }

  getGeneralEditor(type: string) {
    return this.generalFlows.find(wf => wf.getType() === type)!.def.editor;
  }

  getDef(type: string) {
    return this.workflows.get(type)!.def;
  }

  getVarDef(type: string, preset: boolean, field: string) {
    const def = this.getDef(type);
    if (preset) {
      return def.presetVars.find(v => v.name === field);
    } else {
      return def.sharedVars.find(v => v.name === field);
    }
  }
}
