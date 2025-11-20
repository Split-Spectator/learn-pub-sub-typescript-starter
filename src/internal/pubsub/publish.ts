import type { ConfirmChannel,  } from "amqplib";
import { encode } from "@msgpack/msgpack";


export function publishMsgPack<T>(
    ch: ConfirmChannel,
    exchange: string,
    routingKey: string,
    value: T,
  ): void {
    const encoded: Uint8Array = encode({value});
    const buffer: Buffer = Buffer.from(encoded.buffer, encoded.byteOffset, encoded.byteLength);
    const options = {
        contentType: "application/x-msgpack"
    };
    ch.publish(exchange, routingKey, buffer, options);
  };