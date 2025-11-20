import amqp from "amqplib";
import { clientWelcome, commandStatus, printClientHelp, printQuit } from "../internal/gamelogic/gamelogic.js";
import { declareAndBind, publishJSON  } from "../internal/pubsub/message.js";
import { ExchangePerilDirect, PauseKey, ArmyMovesPrefix, ExchangePerilTopic, WarRecognitionsPrefix, GameLogSlug } from "../internal/routing/routing.js";
import type {  PlayingState, } from "../internal/gamelogic/gamestate.js";
import  { GameState } from "../internal/gamelogic/gamestate.js";
import { commandSpawn } from "../internal/gamelogic/spawn.js";
import { getInput } from "../internal/gamelogic/gamelogic.js";
import { commandMove, handleMove, MoveOutcome } from "../internal/gamelogic/move.js";
import { cleanupAndExit } from "../server/exit.js";
import { handlePause } from "../internal/gamelogic/pause.js";
import type { RecognitionOfWar, ArmyMove } from "../internal/gamelogic/gamedata.js";
import {WarOutcome, handleWar } from "../internal/gamelogic/war.js";
import { publishMsgPack } from "../internal/pubsub/publish.js";
import { subscribeJSON,  AckType,  SimpleQueueType  } from "../internal/pubsub/consume.js";
import { subscribeMsgPack } from "../internal/pubsub/consume.js";
import { writeLog, type GameLog } from "../internal/gamelogic/logs.js";


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
    handlerWar(state, confirmCh, name)
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
  return async function (move: ArmyMove): Promise<AckType> {
    const outcome = handleMove(gs, move);

    if (outcome === MoveOutcome.MakeWar) {
      const key = `${WarRecognitionsPrefix}.${username}`;
      const recognitionOfWar: RecognitionOfWar = {
        attacker: move.player,
        defender: gs.getPlayerSnap(),
      };
      try {
        await publishJSON(ch, ExchangePerilTopic, key, recognitionOfWar);
        process.stdout.write("> ");
        return AckType.Ack;
      } catch {
        process.stdout.write("> ");
        return AckType.NackRequeue;
      }
    }
    if (outcome === MoveOutcome.Safe) {
      process.stdout.write("> ");
      return AckType.Ack;
    }
    if (outcome === MoveOutcome.SamePlayer) {
      process.stdout.write("> ");
      return AckType.Ack;
    }
    process.stdout.write("> ");
    return AckType.NackDiscard;
  };
}

function handlerWar(
  gs: GameState,
  ch: amqp.ConfirmChannel,
  username: string,
): (rw: RecognitionOfWar) => Promise<AckType> {
  return async function (rw: RecognitionOfWar): Promise<AckType> {
    const warResolution = handleWar(gs, rw);

    switch (warResolution.result) {
      case WarOutcome.OpponentWon:
      case WarOutcome.YouWon: {
        const message = `${warResolution.winner} won a war against ${warResolution.loser}`;
        try {
          await publishGameLog(ch, username, message);
          process.stdout.write("> ");
          return AckType.Ack;
        } catch {
          process.stdout.write("> ");
          return AckType.NackRequeue;
        }
      }

      case WarOutcome.Draw: {
        const message = `A war between ${warResolution.attacker} and ${warResolution.defender} resulted in a draw`;
        try {
          await publishGameLog(ch, username, message);
          process.stdout.write("> ");
          return AckType.Ack;
        } catch {
          process.stdout.write("> ");
          return AckType.NackRequeue;
        }
      }

      case WarOutcome.NotInvolved:
      case WarOutcome.NoUnits:
        process.stdout.write("> ");
        return AckType.NackDiscard;

      default:
        console.error("Unknown war outcome");
        process.stdout.write("> ");
        return AckType.NackDiscard;
    }
  };
}

async function publishGameLog(ch: amqp.ConfirmChannel, username: string, message: string): Promise<void>{
  const log: GameLog = {
    currentTime: Date.now(), 
    message: message,
    username: username,
  } 
  await publishMsgPack(ch, ExchangePerilTopic, `${GameLogSlug}.${username}` , log );
};
 