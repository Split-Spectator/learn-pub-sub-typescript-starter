import type { GameState, PlayingState } from "./gamestate.js";
import { AckType} from "../pubsub/consume.js";

export function handlePause(gs: GameState, ps: PlayingState): AckType {
  console.log();
  if (ps.isPaused) {
    console.log("==== Pause Detected ====");
    gs.pauseGame();
  } else {
    console.log("==== Resume Detected ====");
    gs.resumeGame();
  }
  console.log("------------------------");
  console.log("> ");
  return AckType.Ack;
}
