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
      
    });
  
    await channel.bindQueue(queue.queue, exchange, key);
    return [channel, queue];
  }
  

  export async function subscribeJSON<T>(
    conn: amqp.ChannelModel,
    exchange: string,
    queueName: string,
    key: string,
    queueType: SimpleQueueType, // an enum to represent "durable" or "transient"
    handler: (data: T) => void,
  ): Promise<void> {
      const [channel, queue] = await declareAndBind(
        conn,
        exchange,
        queueName,
        key,
        queueType
      );
    
      await channel.consume(queueName, (msg) => {
        if (!msg) return;
        const parsedData = JSON.parse(msg.content.toString());
        handler(parsedData);
        channel.ack(msg);
      });
    }
  