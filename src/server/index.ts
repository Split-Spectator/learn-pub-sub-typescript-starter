import amqp from "amqplib";
import process from "node:process";
import { publishJSON } from "../internal/pubsub/message.js";
import { ExchangePerilDirect, PauseKey } from "../internal/routing/routing.js";
import type { PlayingState } from "../internal/gamelogic/gamestate.js";
async function main() {
 
  console.log("Starting Peril server...");
  const connection = await amqp.connect("amqp://guest:guest@localhost:5672/");
  const channel = await connection.createChannel();
  console.log("Connection Succesful!!!")
  const ch = await connection.createConfirmChannel(); 
  const value: PlayingState = {
    isPaused: true,
  }
  
  await publishJSON(ch, ExchangePerilDirect, PauseKey, value)

  process.on('SIGINT', async () => {
    console.log('losing AMQP connection...');
    await channel.close();
    await connection.close();
    console.log('Connection closed.');
    process.exit(0);

});
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
