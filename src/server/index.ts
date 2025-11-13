import amqp from "amqplib";
import process from "node:process";
import { declareAndBind, publishJSON, SimpleQueueType } from "../internal/pubsub/message.js";
import { ExchangePerilDirect, PauseKey, ExchangePerilTopic, GameLogSlug } from "../internal/routing/routing.js";
import type { PlayingState, GameState } from "../internal/gamelogic/gamestate.js";
import { printServerHelp, getInput } from "../internal/gamelogic/gamelogic.js";
import { cleanupAndExit } from "./exit.js";




async function main() {
  console.log("Starting Peril server...");
  const connection = await amqp.connect("amqp://guest:guest@localhost:5672/");
  const channel = await connection.createChannel();
  const ch = await connection.createConfirmChannel();



  process.on("SIGINT", () => {
    console.log("Closing AMQP connection...");
    cleanupAndExit(0);
  });

  await declareAndBind(connection, ExchangePerilTopic,  GameLogSlug ,  "game_logs.*", SimpleQueueType.Transient);

  printServerHelp();
  await publishJSON(ch, ExchangePerilDirect, PauseKey, { isPaused: true });
  while (true) {
    const words = await getInput();
    if (!words.length) continue;

    switch (words[0]) {
      case "pause":
        console.log("publishing pause message");
        await publishJSON(ch, ExchangePerilDirect, PauseKey, { isPaused: true });
        break;
      case "resume":
        console.log("publishing resume message");
        await publishJSON(ch, ExchangePerilDirect, PauseKey, { isPaused: false });
        break;
      case "quit":
        console.log("exiting");
        await cleanupAndExit(0);
        return;
      default:
        console.log("unrecognized command");
    }
  }
}


main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});


