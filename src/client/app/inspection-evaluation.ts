import { TOLERANCES } from "../config.js";
import { parseDecimal } from "../utils.js";


export function evaluateReinfCheck(checkData) {
  const TOL_STEP = TOLERANCES.STEP;
  const TOL_COVER = TOLERANCES.COVER;

  let hasAnyData = false;
  let allOk = true;
  let hasRequiredData = false;

  if (checkData.columns || checkData.beams || checkData.walls) {
    const items = checkData.columns || checkData.beams || checkData.walls;

    for (const item of items) {
      const projDiaV = parseDecimal(item.projDia);
      const factDiaV = parseDecimal(item.factDia);
      if (projDiaV != null && factDiaV != null) {
        hasAnyData = true;
        hasRequiredData = true;
        const dev = Math.abs(factDiaV - projDiaV);
        if (dev !== 0) allOk = false;
      } else if (projDiaV != null || factDiaV != null) {
        hasAnyData = true;
      }

      const projStepV = parseDecimal(item.projStep);
      const factStepV = parseDecimal(item.factStep);
      if (projStepV != null && factStepV != null) {
        hasAnyData = true;
        hasRequiredData = true;
        const dev = Math.abs(factStepV - projStepV);
        if (dev > TOL_STEP) allOk = false;
      } else if (projStepV != null || factStepV != null) {
        hasAnyData = true;
      }

      const projCoverV = parseDecimal(item.projCover);
      const factCoverV = parseDecimal(item.factCover);
      if (projCoverV != null && factCoverV != null) {
        hasAnyData = true;
        hasRequiredData = true;
        const dev = Math.abs(factCoverV - projCoverV);
        if (dev > TOL_COVER) allOk = false;
      } else if (projCoverV != null || factCoverV != null) {
        hasAnyData = true;
      }

      if (checkData.columns && item.projHoopsStep != null && item.factHoopsStep != null) {
        const TOL_HOOPS_STEP = TOLERANCES.HOOPS_STEP;
        const projHoopsStepV = parseDecimal(item.projHoopsStep);
        const factHoopsStepV = parseDecimal(item.factHoopsStep);
        if (projHoopsStepV != null && factHoopsStepV != null) {
          hasAnyData = true;
          hasRequiredData = true;
          const dev = Math.abs(factHoopsStepV - projHoopsStepV);
          if (dev > TOL_HOOPS_STEP) allOk = false;
        } else if (projHoopsStepV != null || factHoopsStepV != null) {
          hasAnyData = true;
        }
      }
    }
  } else {
    const projDiaV = parseDecimal(checkData.projDia);
    const factDiaV = parseDecimal(checkData.factDia);
    const projStepV = parseDecimal(checkData.projStep);
    const factStepV = parseDecimal(checkData.factStep);
    const projCoverV = parseDecimal(checkData.projCover);
    const factCoverV = parseDecimal(checkData.factCover);

    if (projDiaV != null && factDiaV != null) {
      hasAnyData = true;
      hasRequiredData = true;
      const dev = Math.abs(factDiaV - projDiaV);
      if (dev !== 0) allOk = false;
    } else if (projDiaV != null || factDiaV != null) {
      hasAnyData = true;
    }

    if (projStepV != null && factStepV != null) {
      hasAnyData = true;
      hasRequiredData = true;
      const dev = Math.abs(factStepV - projStepV);
      if (dev > TOL_STEP) allOk = false;
    } else if (projStepV != null || factStepV != null) {
      hasAnyData = true;
    }

    if (projCoverV != null && factCoverV != null) {
      hasAnyData = true;
      hasRequiredData = true;
      const dev = Math.abs(factCoverV - projCoverV);
      if (dev > TOL_COVER) allOk = false;
    } else if (projCoverV != null || factCoverV != null) {
      hasAnyData = true;
    }
  }

  if (!hasAnyData || !hasRequiredData) {
    return {
      status: "empty",
      summaryText: "Не заполнено"
    };
  }

  return {
    status: allOk ? "ok" : "exceeded",
    summaryText: allOk ? "в норме" : "превышено"
  };
}
