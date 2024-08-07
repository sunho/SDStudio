import { SDImageGenDef, SDImageGenEasyDef, SDInpaintDef } from "./SDWorkFlow";
import { WorkFlowCategoryFlag as WFF, WorkFlowService } from "./WorkFlowService";

export function registerWorkFlows(service: WorkFlowService) {
  service.addWorkFlow(WFF.General, SDImageGenDef);
  service.addWorkFlow(WFF.General, SDImageGenEasyDef);
  service.addWorkFlow(WFF.I2I, SDInpaintDef);
}
