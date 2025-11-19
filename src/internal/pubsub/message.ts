import type { ConfirmChannel,  } from "amqplib";
import amqp  from "amqplib";
//import type {SimpleQueueType} from ""
 import type {Channel, ConsumeMessage } from "amqplib";
import { handleWar } from "../gamelogic/war.js";


export async function publishJSON<T>(
    ch: ConfirmChannel,
    exchange: string,
    routingKey: string,
    value: T,
  ): Promise<void> {
    const jsonString = JSON.stringify(value);
    const jsonBytes = new TextEncoder().encode(jsonString);
    const buf = Buffer.from(jsonBytes);
    const options = {
        contentType: "application/json"
    };
    ch.publish(exchange, routingKey, buf, options);

  };
 export enum SimpleQueueType {
   "Durable", 
  "Transient",
 } 
 
  export async function declareAndBind(
    conn: amqp.ChannelModel,
    exchange: string,
    queueName: string,
    key: string,
    queueType: SimpleQueueType,
  ): Promise<[Channel, amqp.Replies.AssertQueue]> {
    const channel = await conn.createChannel();

    const isTransient = queueType === SimpleQueueType.Transient;
  
    const queue = await channel.assertQueue(queueName, {
      durable: !isTransient,
      autoDelete: isTransient,
      exclusive: isTransient,
      arguments: {
        "x-dead-letter-exchange": "peril_dlx",
      },
      
    });
  
    await channel.bindQueue(queue.queue, exchange, key);
    return [channel, queue];
  }
  

  export async function subscribeJSON<T>(
    conn: amqp.ChannelModel,
    exchange: string,
    queueName: string,
    key: string,
    queueType: SimpleQueueType, 
    handler: (data: T) =>  Ack | Promise<Ack>,
  ): Promise<void> {
      const [channel, queue] = await declareAndBind(
        conn,
        exchange,
        queueName,
        key,
        queueType
      );
    
      await channel.consume(queueName, async (msg) => { 
        if (!msg) return;
        console.log(`[${queueName}] message received`);
        try {
        const parsedData = JSON.parse(msg.content.toString());
        const ack = await handler(parsedData);
        //console.log(`[${queueName}] handler typeof: ${typeof ack}, value:`, ack);
        switch (ack) {
          case "Ack":
            //console.log(`[${queueName}] Ack`);
            channel.ack(msg);
            break;
          case "NackRequeue":
            //console.log(`[${queueName}] NackRequeue`);
            channel.nack(msg, false, true);
            break;
          case "NackDiscard":
            //console.log(`[${queueName}] NackDiscard`);
            channel.nack(msg, false, false);
            break; 
          default:
            //console.log("something is funked. hit default")
            channel.nack(msg, false, false);
            break;
        } 
       }catch (err) {
          console.log(`[${queueName}] Handler error -> NackDiscard`, err);
          channel.nack(msg, false, false);
        }
      });
    }
  
    export type Ack = "Ack" | "NackRequeue" | "NackDiscard";