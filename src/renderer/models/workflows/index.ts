import { AugmentDef, AugmentGenDef } from './AugmentWorkFlow';
import { SDI2IDef, SDImageGenDef, SDImageGenEasyDef, SDInpaintDef } from './SDWorkFlow';
import {
  WorkFlowCategoryFlag as WFF,
  WorkFlowService,
} from './WorkFlowService';

export function registerWorkFlows(service: WorkFlowService) {
  service.addWorkFlow(WFF.General, SDImageGenEasyDef);
  service.addWorkFlow(WFF.General, SDImageGenDef);
  service.addWorkFlow(WFF.General, AugmentGenDef);
  service.addWorkFlow(WFF.I2I, SDInpaintDef);
  service.addWorkFlow(WFF.I2I, SDI2IDef);
  service.addWorkFlow(WFF.I2I, AugmentDef);
}
