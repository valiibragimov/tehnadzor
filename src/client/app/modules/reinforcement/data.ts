/**
 * Temporary build-path compatibility for the former reinforcement data module.
 * Mutable reinforcement state now belongs to the feature state passed by the
 * application bootstrap.
 */
export {
  addReinforcementBeam,
  addReinforcementColumn,
  addReinforcementWall,
  clearReinforcementRows,
  clearReinforcementRowsByType,
  createReinforcementBeam,
  createReinforcementColumn,
  createReinforcementWall,
  hasDuplicateBeamMarking,
  hasDuplicateColumnMarking,
  hasDuplicateWallAxes,
  removeReinforcementBeam,
  removeReinforcementColumn,
  removeReinforcementWall,
  setReinforcementBeams,
  setReinforcementColumns,
  setReinforcementWalls
} from "../../../features/inspections/reinforcement/state.js";
