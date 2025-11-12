import amqp from "amqplib";
import { clientWelcome } from "../internal/gamelogic/gamelogic.js";
import { declareAndBind } from "../internal/pubsub/message.js";
import { ExchangePerilDirect, PauseKey } from "../internal/routing/routing.js";

async function main() {
  console.log("Starting Peril client...");
  const connection = await amqp.connect("amqp://guest:guest@localhost:5672/");
  const channel = await connection.createChannel();
  console.log("Connection Succesful!!!")

  const name = await clientWelcome();
  const queueName = `${PauseKey}.${name}` 

  await declareAndBind(connection, ExchangePerilDirect, queueName, PauseKey, "transient" );

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
