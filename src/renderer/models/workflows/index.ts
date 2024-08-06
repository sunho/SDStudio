import { SDImageGenDef } from "./SDWorkFlow";
import { WorkFlowCategoryFlag as WFF, WorkFlowService } from "./WorkFlowService";

export function registerWorkFlows(service: WorkFlowService) {
  service.addWorkFlow(WFF.General, SDImageGenDef);
}
