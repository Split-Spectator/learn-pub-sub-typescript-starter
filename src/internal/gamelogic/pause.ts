import type { GameState, PlayingState } from "./gamestate.js";
import type { Ack } from "../pubsub/message.js";

export function handlePause(gs: GameState, ps: PlayingState): Ack {
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
  return "Ack";
}
