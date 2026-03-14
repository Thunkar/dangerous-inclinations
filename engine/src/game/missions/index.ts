/**
 * Mission System Exports
 */

// Types
export type {
  MissionType,
  BaseMission,
  DestroyShipMission,
  DeliverCargoMission,
  InterceptTransmissionMission,
  Mission,
  Cargo,
  MissionCheckResult,
} from "../../models/missions";

export {
  isDestroyShipMission,
  isDeliverCargoMission,
  isInterceptTransmissionMission,
} from "../../models/missions";

// Mission deck and dealing
export {
  MISSION_CONSTANTS,
  dealMissions,
  dealMissionOffers,
  selectMissionsFromOffers,
  getDestroyTarget,
  getCargoMissions,
  type DealMissionsResult,
  type DealMissionOffersResult,
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
} from "./missionChecks";
