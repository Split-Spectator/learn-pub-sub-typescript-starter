import amqp from "amqplib";
import { clientWelcome, commandStatus, printClientHelp, printQuit } from "../internal/gamelogic/gamelogic.js";
import { declareAndBind, subscribeJSON, SimpleQueueType, publishJSON  } from "../internal/pubsub/message.js";
import { ExchangePerilDirect, PauseKey, ArmyMovesPrefix, ExchangePerilTopic } from "../internal/routing/routing.js";
import type {  PlayingState, } from "../internal/gamelogic/gamestate.js";
import  { GameState } from "../internal/gamelogic/gamestate.js";
import { commandSpawn } from "../internal/gamelogic/spawn.js";
import { getInput } from "../internal/gamelogic/gamelogic.js";
import { commandMove, handleMove } from "../internal/gamelogic/move.js";
import { cleanupAndExit } from "../server/exit.js";
import { handlePause } from "../internal/gamelogic/pause.js";
import type { ArmyMove } from "../internal/gamelogic/gamedata.js";

 
 

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
    (m) => handleMove(state, m), // returns Ack
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

function handlerMove(gs: GameState): (move: ArmyMove) => void {
  return function (move: ArmyMove) {
    handleMove(gs, move);
    console.log(`Moved ${move.units.length} units to ${move.toLocation}`);
    process.stdout.write("> ");
  };
}
