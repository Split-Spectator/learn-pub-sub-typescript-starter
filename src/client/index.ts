import amqp from "amqplib";
import { clientWelcome, commandStatus, printClientHelp, printQuit } from "../internal/gamelogic/gamelogic.js";
import { declareAndBind, subscribeJSON, SimpleQueueType, publishJSON  } from "../internal/pubsub/message.js";
import { ExchangePerilDirect, PauseKey, ArmyMovesPrefix, ExchangePerilTopic, WarRecognitionsPrefix } from "../internal/routing/routing.js";
import type {  PlayingState, } from "../internal/gamelogic/gamestate.js";
import  { GameState } from "../internal/gamelogic/gamestate.js";
import { commandSpawn } from "../internal/gamelogic/spawn.js";
import { getInput } from "../internal/gamelogic/gamelogic.js";
import { commandMove, handleMove, MoveOutcome } from "../internal/gamelogic/move.js";
import { cleanupAndExit } from "../server/exit.js";
import { handlePause } from "../internal/gamelogic/pause.js";
import type { RecognitionOfWar, ArmyMove } from "../internal/gamelogic/gamedata.js";
import type { Ack } from "../internal/pubsub/message.js";
import {WarOutcome, handleWar } from "../internal/gamelogic/war.js";
 

async function main() {

  process.on('SIGINT', async () => {
    console.log('losing AMQP connection...');
    await channel.close();
    await connection.close();
    console.log('Connection closed.');
    process.exit(0);
});
 
  console.log("Starting Peril client...");
  const connection = await amqp.connect("amqp://guest:guest@localhost:5672/");
  const channel = await connection.createChannel();
  console.log("Connection Succesful!!!")

  const name = await clientWelcome();
  const confirmCh = await connection.createConfirmChannel();
  const pauseUser = `${PauseKey}.${name}` ;

  const armyMovesKey =   `${ArmyMovesPrefix}.*`;
  const armyMovesQueue =  `${ArmyMovesPrefix}.${name}` ;
  
  await declareAndBind(connection, ExchangePerilTopic, armyMovesQueue, armyMovesKey, SimpleQueueType.Transient );

  await declareAndBind(connection, ExchangePerilDirect, pauseUser, PauseKey, SimpleQueueType.Transient );


  const state = new GameState(name);
  await subscribeJSON<PlayingState>(
    connection,
    ExchangePerilDirect,
    pauseUser,
    PauseKey,
    SimpleQueueType.Transient,
    (ps) => handlePause(state, ps),
  );
  
  await subscribeJSON<ArmyMove>(
    connection,
    ExchangePerilTopic,
    armyMovesQueue,
    armyMovesKey,
    SimpleQueueType.Transient,
    makeHandlerMove(state, confirmCh, name),
  );

  await subscribeJSON(
    connection,
    ExchangePerilTopic,
    WarRecognitionsPrefix,
    `${WarRecognitionsPrefix}.*`,
    SimpleQueueType.Durable,
    handlerWar(state)
  );
  
  while (true) {
    const words = await getInput();
    if (!words.length) continue;
  
    try {
      switch (words[0]) {
        case "spawn":
          await commandSpawn(state, words);
          break;
        case "move":
          console.log(`armyMovesQueue = ${armyMovesQueue}`)
          const move = await commandMove(state, words);
         
          await publishJSON(confirmCh, ExchangePerilTopic, armyMovesQueue, move)

          break;
        case "status":
          await commandStatus(state);
          break;
        case "help":
          await printClientHelp();
          break;
        case "spam":
          console.log("Spamming not allowed yet!");
          break;
        case "quit":
          printQuit();
          await cleanupAndExit(0);
          return;
        default:
          console.log("unrecognized command");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(msg);
    }
  
    process.stdout.write("> ");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
 
function handlerPause(gs: GameState): (ps: PlayingState) => void {
  return function (ps: PlayingState) {
    if (ps.isPaused) {
      console.log();
      console.log("==== Game Paused ====");
      gs.pauseGame();
      console.log("------------------------");
    } else {
      console.log();
      console.log("==== Game Resumed ====");
      gs.resumeGame();
      console.log("------------------------");
    }
    console.log("> ");
  };
}

function makeHandlerMove(gs: GameState, ch: amqp.ConfirmChannel, username: string) {
  return async function (move: ArmyMove): Promise<Ack> {
    const outcome = handleMove(gs, move);

    if (outcome === MoveOutcome.MakeWar) {
      const key = `${WarRecognitionsPrefix}.${username}`;
      await publishJSON(ch, ExchangePerilTopic, key, move);
      process.stdout.write("> ");
      return "NackRequeue";
    }
    if (outcome === MoveOutcome.Safe) {
      process.stdout.write("> ");
      return "Ack";
    }
    if (outcome === MoveOutcome.SamePlayer) {
      process.stdout.write("> ");
      return "Ack";
    }
    process.stdout.write("> ");
    return "NackDiscard";
  };
}

function handlerWar(gs: GameState): (rw: RecognitionOfWar) => Ack {
  return function (rw: RecognitionOfWar): Ack {
    const warResolution = handleWar(gs, rw);

    switch (warResolution.result) {
      case WarOutcome.NotInvolved:
      case WarOutcome.NoUnits:
        process.stdout.write("> ");
        return "NackDiscard";

      case WarOutcome.OpponentWon:
      case WarOutcome.YouWon:
      case WarOutcome.Draw:
        process.stdout.write("> ");
        return "Ack";

      default:
        console.error("Unknown war outcome");
        process.stdout.write("> ");
        return  "NackDiscard";
    }
  };
}


