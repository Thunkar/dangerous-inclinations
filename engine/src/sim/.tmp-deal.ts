/** Scratch: does every seat get a legal choice of secondaries? */
import { dealMissionOffers } from "../game/missions/missionDeck.ts";
import { isPrimaryType } from "../models/missions.ts";
import { Rng } from "../utils/rng.ts";

for (const seats of [2, 3, 4, 5, 6]) {
  const players = Array.from({ length: seats }, (_, i) => ({ id: `p${i}` }));
  let hands = 0, threeOfAKind = 0, twoKinds = 0, threeKinds = 0;
  for (let d = 0; d < 4000; d++) {
    for (const [, offers] of dealMissionOffers(players, new Rng(d * 7919 + seats))) {
      const sec = offers.filter((m) => !isPrimaryType(m.type)).map((m) => m.type);
      hands++;
      const kinds = new Set(sec).size;
      if (kinds === 1) threeOfAKind++;
      if (kinds === 2) twoKinds++;
      if (kinds === 3) threeKinds++;
      if (sec.length !== 3) throw new Error(`${seats} seats: dealt ${sec.length} secondaries`);
    }
  }
  const pc = (n: number) => `${((100 * n) / hands).toFixed(1)}%`;
  console.log(
    `${seats} seats: ${hands} hands — three of a kind ${pc(threeOfAKind)} (must be 0), two kinds ${pc(twoKinds)}, all three ${pc(threeKinds)}`
  );
}
