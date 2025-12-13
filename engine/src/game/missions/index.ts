/**
 * Mission System Exports
 */

// Types
export type {
  MissionType,
  BaseMission,
  DestroyShipMission,
  DeliverCargoMission,
  Mission,
  Cargo,
} from "../../models/missions";

export {
  isDestroyShipMission,
  isDeliverCargoMission,
} from "../../models/missions";

// Mission deck and dealing
export {
  MISSION_CONSTANTS,
  dealMissions,
  getDestroyTarget,
  getCargoMissions,
  type DealMissionsResult,
} from "./missionDeck";

// Mission completion checks
export {
  checkDestroyMission,
  checkCargoMission,
  processDestroyMissionCompletion,
  processCargoMissionCompletion,
  checkPlayerMissions,
  checkForWinner,
  getMissionProgress,
  type MissionCheckResult,
} from "./missionChecks";
