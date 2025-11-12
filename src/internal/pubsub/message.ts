import type { ConfirmChannel,  } from "amqplib";
import amqp  from "amqplib";
//import type {SimpleQueueType} from ""
 import type {Channel } from "amqplib";

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
  type SimpleQueueType = "durable" | "transient";
 
  export async function declareAndBind(
    conn: amqp.ChannelModel,
    exchange: string,
    queueName: string,
    key: string,
    queueType: SimpleQueueType,
  ): Promise<[Channel, amqp.Replies.AssertQueue]> {
    const channel = await conn.createChannel();

    const isTransient = queueType === "transient";
  
    const queue = await channel.assertQueue(queueName, {
      durable: !isTransient,
      autoDelete: isTransient,
      exclusive: isTransient,
      
    });
  
    await channel.bindQueue(queue.queue, exchange, key);
    return [channel, queue];
  }
  