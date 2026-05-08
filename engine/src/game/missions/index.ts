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
} from "../../models/missions.ts";

export {
  isDestroyShipMission,
  isDeliverCargoMission,
  isInterceptTransmissionMission,
} from "../../models/missions.ts";

// Mission deck and dealing
export {
  MISSION_CONSTANTS,
  dealMissionOffers,
  selectMissionsFromOffers,
  getDestroyTarget,
  getCargoMissions,
  type DealMissionOffersResult,
} from "./missionDeck.ts";

// Mission completion checks
export {
  checkDestroyMission,
  checkCargoMission,
  processDestroyMissionCompletion,
  processCargoMissionCompletion,
  checkPlayerMissions,
  checkForWinner,
  getMissionProgress,
} from "./missionChecks.ts";
