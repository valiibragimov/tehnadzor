import { TOLERANCES } from "../config.js";
import { parseConcreteStrength, parseDecimal } from "../utils.js";

const DEFAULT_GEO_TOL_PLAN = TOLERANCES.PLAN_XY || 8;
const DEFAULT_GEO_TOL_H = TOLERANCES.HEIGHT || 10;

export function evaluateGeoColumnNode(columns, tolXY = DEFAULT_GEO_TOL_PLAN) {
  if (!columns || columns.length === 0) {
    return {
      status: "empty",
      hasAllData: false,
      hasProjXY: false,
      hasFactXY: false
    };
  }

  let hasAnyProj = false;
  let hasAnyFact = false;
  let allColumnsHaveProj = true;
  let allColumnsHaveFact = true;
  let allColumnsOk = true;

  for (const col of columns) {
    const pX = parseDecimal(col.projX);
    const pY = parseDecimal(col.projY);
    const fX = parseDecimal(col.factX);
    const fY = parseDecimal(col.factY);

    const hasProj = pX != null && pY != null;
    const hasFact = fX != null && fY != null;

    if (hasProj) hasAnyProj = true;
    if (hasFact) hasAnyFact = true;
    if (!hasProj) allColumnsHaveProj = false;
    if (!hasFact) allColumnsHaveFact = false;

    if (hasProj && hasFact) {
      const dX = Math.abs(fX - pX);
      const dY = Math.abs(fY - pY);
      const colOk = dX <= tolXY && dY <= tolXY;
      if (!colOk) allColumnsOk = false;
    }
  }

  const hasAllData = allColumnsHaveProj && allColumnsHaveFact;

  if (!hasAllData) {
    return {
      status: "empty",
      hasAllData: false,
      hasProjXY: hasAnyProj,
      hasFactXY: hasAnyFact
    };
  }

  return {
    status: allColumnsOk ? "ok" : "bad",
    hasAllData: true,
    hasProjXY: true,
    hasFactXY: true
  };
}

export function evaluateGeoWallNode(walls, tolXY = DEFAULT_GEO_TOL_PLAN) {
  if (!walls || walls.length === 0) {
    return {
      status: "empty",
      hasAllData: false,
      hasProjXY: false,
      hasFactXY: false
    };
  }

  let hasAnyProj = false;
  let hasAnyFact = false;
  let allWallsHaveProj = true;
  let allWallsHaveFact = true;
  let allWallsOk = true;

  for (const wall of walls) {
    let hasProj = false;
    let hasFact = false;
    let wallOk = true;

    if (wall.bindingType === "number_letters") {
      const pX1 = parseDecimal(wall.projX_num_let1);
      const pY1 = parseDecimal(wall.projY_num_let1);
      const pX2 = parseDecimal(wall.projX_num_let2);
      const pY2 = parseDecimal(wall.projY_num_let2);
      const fX1 = parseDecimal(wall.factX_num_let1);
      const fY1 = parseDecimal(wall.factY_num_let1);
      const fX2 = parseDecimal(wall.factX_num_let2);
      const fY2 = parseDecimal(wall.factY_num_let2);

      hasProj = pX1 != null && pY1 != null && pX2 != null && pY2 != null;
      hasFact = fX1 != null && fY1 != null && fX2 != null && fY2 != null;

      if (hasProj && hasFact) {
        const dX1 = Math.abs(fX1 - pX1);
        const dY1 = Math.abs(fY1 - pY1);
        const dX2 = Math.abs(fX2 - pX2);
        const dY2 = Math.abs(fY2 - pY2);
        wallOk = dX1 <= tolXY && dY1 <= tolXY && dX2 <= tolXY && dY2 <= tolXY;
      }
    } else {
      const pX1 = parseDecimal(wall.projX_let_num1);
      const pY1 = parseDecimal(wall.projY_let_num1);
      const pX2 = parseDecimal(wall.projX_let_num2);
      const pY2 = parseDecimal(wall.projY_let_num2);
      const fX1 = parseDecimal(wall.factX_let_num1);
      const fY1 = parseDecimal(wall.factY_let_num1);
      const fX2 = parseDecimal(wall.factX_let_num2);
      const fY2 = parseDecimal(wall.factY_let_num2);

      hasProj = pX1 != null && pY1 != null && pX2 != null && pY2 != null;
      hasFact = fX1 != null && fY1 != null && fX2 != null && fY2 != null;

      if (hasProj && hasFact) {
        const dX1 = Math.abs(fX1 - pX1);
        const dY1 = Math.abs(fY1 - pY1);
        const dX2 = Math.abs(fX2 - pX2);
        const dY2 = Math.abs(fY2 - pY2);
        wallOk = dX1 <= tolXY && dY1 <= tolXY && dX2 <= tolXY && dY2 <= tolXY;
      }
    }

    if (hasProj) hasAnyProj = true;
    if (hasFact) hasAnyFact = true;
    if (!hasProj) allWallsHaveProj = false;
    if (!hasFact) allWallsHaveFact = false;
    if (!wallOk) allWallsOk = false;
  }

  const hasAllData = allWallsHaveProj && allWallsHaveFact;

  if (!hasAllData) {
    return {
      status: "empty",
      hasAllData: false,
      hasProjXY: hasAnyProj,
      hasFactXY: hasAnyFact
    };
  }

  return {
    status: allWallsOk ? "ok" : "bad",
    hasAllData: true,
    hasProjXY: true,
    hasFactXY: true
  };
}

export function evaluateGeoBeamNode(beams, tolXY = DEFAULT_GEO_TOL_PLAN) {
  if (!beams || beams.length === 0) {
    return {
      status: "empty",
      hasAllData: false,
      hasProjXY: false,
      hasFactXY: false
    };
  }

  let hasAnyProj = false;
  let hasAnyFact = false;
  let allBeamsHaveProj = true;
  let allBeamsHaveFact = true;
  let allBeamsOk = true;

  for (const beam of beams) {
    let hasProj = false;
    let hasFact = false;
    let beamOk = true;

    if (beam.bindingType === "number_letters") {
      const pX1 = parseDecimal(beam.projX_num_let1);
      const pY1 = parseDecimal(beam.projY_num_let1);
      const pX2 = parseDecimal(beam.projX_num_let2);
      const pY2 = parseDecimal(beam.projY_num_let2);
      const fX1 = parseDecimal(beam.factX_num_let1);
      const fY1 = parseDecimal(beam.factY_num_let1);
      const fX2 = parseDecimal(beam.factX_num_let2);
      const fY2 = parseDecimal(beam.factY_num_let2);

      hasProj = pX1 != null && pY1 != null && pX2 != null && pY2 != null;
      hasFact = fX1 != null && fY1 != null && fX2 != null && fY2 != null;

      if (hasProj && hasFact) {
        const dX1 = Math.abs(fX1 - pX1);
        const dY1 = Math.abs(fY1 - pY1);
        const dX2 = Math.abs(fX2 - pX2);
        const dY2 = Math.abs(fY2 - pY2);
        beamOk = dX1 <= tolXY && dY1 <= tolXY && dX2 <= tolXY && dY2 <= tolXY;
      }
    } else {
      const pX1 = parseDecimal(beam.projX_let_num1);
      const pY1 = parseDecimal(beam.projY_let_num1);
      const pX2 = parseDecimal(beam.projX_let_num2);
      const pY2 = parseDecimal(beam.projY_let_num2);
      const fX1 = parseDecimal(beam.factX_let_num1);
      const fY1 = parseDecimal(beam.factY_let_num1);
      const fX2 = parseDecimal(beam.factX_let_num2);
      const fY2 = parseDecimal(beam.factY_let_num2);

      hasProj = pX1 != null && pY1 != null && pX2 != null && pY2 != null;
      hasFact = fX1 != null && fY1 != null && fX2 != null && fY2 != null;

      if (hasProj && hasFact) {
        const dX1 = Math.abs(fX1 - pX1);
        const dY1 = Math.abs(fY1 - pY1);
        const dX2 = Math.abs(fX2 - pX2);
        const dY2 = Math.abs(fY2 - pY2);
        beamOk = dX1 <= tolXY && dY1 <= tolXY && dX2 <= tolXY && dY2 <= tolXY;
      }
    }

    if (hasProj) hasAnyProj = true;
    if (hasFact) hasAnyFact = true;
    if (!hasProj) allBeamsHaveProj = false;
    if (!hasFact) allBeamsHaveFact = false;
    if (!beamOk) allBeamsOk = false;
  }

  const hasAllData = allBeamsHaveProj && allBeamsHaveFact;

  if (!hasAllData) {
    return {
      status: "empty",
      hasAllData: false,
      hasProjXY: hasAnyProj,
      hasFactXY: hasAnyFact
    };
  }

  return {
    status: allBeamsOk ? "ok" : "bad",
    hasAllData: true,
    hasProjXY: true,
    hasFactXY: true
  };
}

export function evaluateGeoNode(nodeData, tolXY = DEFAULT_GEO_TOL_PLAN, tolH = DEFAULT_GEO_TOL_H) {
  const { projX, factX, projY, factY, projH, factH } = nodeData;

  const hasProjXY = projX != null && projY != null && !isNaN(projX) && !isNaN(projY);
  const hasFactXY = factX != null && factY != null && !isNaN(factX) && !isNaN(factY);
  const hasAllData = hasProjXY && hasFactXY;

  if (!hasAllData) {
    return {
      status: "empty",
      details: [],
      hasAllData: false,
      hasProjXY,
      hasFactXY
    };
  }

  const checks = [];
  const dX = Math.abs(factX - projX);
  const okX = dX <= tolXY;
  checks.push({ axis: "X", dev: dX, ok: okX, tol: tolXY });

  const dY = Math.abs(factY - projY);
  const okY = dY <= tolXY;
  checks.push({ axis: "Y", dev: dY, ok: okY, tol: tolXY });

  if (projH != null && factH != null && !isNaN(projH) && !isNaN(factH)) {
    const dH = Math.abs(factH - projH);
    const okH = dH <= tolH;
    checks.push({ axis: "H", dev: dH, ok: okH, tol: tolH });
  }

  const allOk = checks.every((check) => check.ok);

  return {
    status: allOk ? "ok" : "bad",
    details: checks,
    hasAllData: true,
    hasProjXY: true,
    hasFactXY: true
  };
}

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

export function evaluateStrengthCheck(checkData) {
  const markVal = parseConcreteStrength(checkData.mark || checkData.markValue);
  const daysVal = parseDecimal(checkData.days);
  const actualVal = parseDecimal(checkData.actual);

  if (!markVal || markVal <= 0 || !daysVal || daysVal <= 0) {
    return {
      status: "empty",
      summaryText: "Не заполнено"
    };
  }

  if (actualVal == null) {
    return {
      status: "empty",
      summaryText: "Не заполнено"
    };
  }

  const norm = markVal * Math.log10(daysVal) / Math.log10(28);
  const ok = actualVal >= norm;

  return {
    status: ok ? "ok" : "exceeded",
    summaryText: ok ? "в норме" : "превышено"
  };
}
