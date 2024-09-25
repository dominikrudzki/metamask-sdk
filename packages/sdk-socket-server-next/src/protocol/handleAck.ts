import { Server, Socket } from 'socket.io';
import { pubClient } from '../analytics-api';
import { getLogger } from '../logger';
import { ClientType } from '../socket-config';
import { QueuedMessage } from './handleMessage';

const logger = getLogger();

export type ACKParams = {
  io: Server;
  socket: Socket;
  channelId: string;
  clientType?: ClientType;
  context?: string;
  ackId: string;
};

export const handleAck = async ({
  channelId,
  ackId,
  socket,
  clientType,
}: ACKParams) => {
  const queueKey = `queue:${channelId}:${clientType}`;
  let messages: any[] = [];

  const socketId = socket.id;
  const clientIp = socket.request.socket.remoteAddress;
  try {
    // Retrieve all messages to find and remove the specified one
    messages = await pubClient.lrange(queueKey, 0, -1);
    logger.debug(
      `[handleAck] channelId=${channelId} -- Messages in ${clientType} queue: ${messages.length}`,
      messages,
    );
    const index = messages.findIndex((msg) => {
      try {
        const parsed = JSON.parse(msg) as QueuedMessage;
        // logger.debug(`Parsed ackId: ${parsed.ackId}, Target ackId: ${ackId}`);
        return parsed.ackId === ackId;
      } catch (e) {
        logger.error(
          `[handleAck] channelId=${channelId} -- Error parsing message`,
          msg,
          e,
        );
        return false;
      }
    });
    if (index === -1) {
      logger.warn(
        `[handleAck] channelId=${channelId} -- Message ${ackId} not found in ${clientType} queue.`,
        {
          channelId,
          socketId,
          clientIp,
        },
      );
    } else {
      const placeholder = `TO_REMOVE_${new Date().getTime()}`; // Unique placeholder
      await pubClient.lset(queueKey, index, placeholder); // Set the message at index to unique placeholder
      await pubClient.lrem(queueKey, 1, placeholder); // Remove the unique placeholder
      logger.info(
        `[handleAck] channelId=${channelId} -- Message ${ackId} removed from ${clientType} queue.`,
        {
          channelId,
          socketId,
          clientIp,
        },
      );
    }
  } catch (error) {
    logger.error(
      `[handleAck] channelId=${channelId} -- Error removing message: ${error}`,
      {
        channelId,
        socketId,
        clientIp,
      },
    );
  }
};
