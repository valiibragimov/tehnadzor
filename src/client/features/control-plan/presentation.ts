import { t } from "../../shared/i18n/index.js";
import type { ControlPlanTask, ControlPlanRow } from "./service.js";

export const taskLabel = (task: ControlPlanTask) => t(`planModule_${task.moduleKey}`);
export const taskStatus = (task: ControlPlanTask) => t(`planTask_${task.status}`);
export const rowStatus = (row: ControlPlanRow) => t(`planRow_${row.status}`);
export const actionLabel = (row: ControlPlanRow) => t(`planAction_${row.nextAction}`, { module: row.nextActionModule ? t(`planModule_${row.nextActionModule}`) : "" });
