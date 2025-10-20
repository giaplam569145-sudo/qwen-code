/**
 * @license
 * Copyright 2 to 25 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { RequestError } from './acp';
import { z } from 'zod';

// A little hack to get a typed constructor for a class with private fields.
const { Connection, AgentSideConnection } = await import('./acp.js');
type Connection = import('./acp.js').Connection;
type Agent = import('./acp.js').Agent;

describe('RequestError', () => {
  it('should create a parse error', () => {
    const error = RequestError.parseError('details');
    expect(error.code).toBe(-32700);
    expect(error.message).toBe('Parse error');
    expect(error.data?.details).toBe('details');
  });

  it('should create an invalid request error', () => {
    const error = RequestError.invalidRequest('details');
    expect(error.code).toBe(-32600);
    expect(error.message).toBe('Invalid request');
    expect(error.data?.details).toBe('details');
  });

  it('should create a method not found error', () => {
    const error = RequestError.methodNotFound('details');
    expect(error.code).toBe(-32601);
    expect(error.message).toBe('Method not found');
    expect(error.data?.details).toBe('details');
  });

  it('should create an invalid params error', () => {
    const error = RequestError.invalidParams('details');
    expect(error.code).toBe(-32602);
    expect(error.message).toBe('Invalid params');
    expect(error.data?.details).toBe('details');
  });

  it('should create an internal error', () => {
    const error = RequestError.internalError('details');
    expect(error.code).toBe(-32603);
    expect(error.message).toBe('Internal error');
    expect(error.data?.details).toBe('details');
  });

  it('should create an auth required error', () => {
    const error = RequestError.authRequired('details');
    expect(error.code).toBe(-32000);
    expect(error.message).toBe('Authentication required');
    expect(error.data?.details).toBe('details');
  });

  it('should convert to a result object', () => {
    const error = new RequestError(123, 'message', 'details');
    const result = error.toResult();
    expect(result.error.code).toBe(123);
    expect(result.error.message).toBe('message');
    expect(result.error.data).toEqual({ details: 'details' });
  });
});

describe('Connection', () => {
  it('should send and receive a request', async () => {
    const { client, server } = makeMockConnection(
      vi.fn().mockResolvedValue('pong'),
    );

    const response = await client.sendRequest('ping', 'payload');
    expect(response).toBe('pong');
  });

  it('should send and receive a notification', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const { client } = makeMockConnection(handler);

    await client.sendNotification('notify', 'payload');

    // Wait for the notification to be processed.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(handler).toHaveBeenCalledWith('notify', 'payload');
  });

  it('should handle a request that throws a RequestError', async () => {
    const { client } = makeMockConnection(async () => {
      throw RequestError.internalError('details');
    });

    await expect(client.sendRequest('ping', 'payload')).rejects.toEqual({
      code: -32603,
      message: 'Internal error',
      data: { details: 'details' },
    });
  });

  it('should handle a request that throws a ZodError', async () => {
    const { client } = makeMockConnection(async () => {
      throw new z.ZodError([]);
    });

    await expect(client.sendRequest('ping', 'payload')).rejects.toEqual({
      code: -32602,
      message: 'Invalid params',
      data: { details: expect.any(String) },
    });
  });

  it('should handle a request that throws a generic error', async () => {
    const { client } = makeMockConnection(async () => {
      throw new Error('generic error');
    });

    await expect(client.sendRequest('ping', 'payload')).rejects.toEqual({
      code: -32603,
      message: 'Internal error',
      data: { details: 'generic error' },
    });
  });
});

function makeMockConnection(
  handler: (method: string, params: unknown) => Promise<unknown>,
) {
  const a = new TransformStream();
  const b = new TransformStream();

  const client = new (Connection as any)(
    vi.fn(), // The client doesn't handle incoming requests in this test.
    a.writable,
    b.readable,
  );

  const server = new (Connection as any)(handler, b.writable, a.readable);

  return { client, server };
}

import * as schema from './schema.js';

describe('AgentSideConnection', () => {
  it('should handle initialize request', async () => {
    const agent = {
      initialize: vi.fn().mockResolvedValue({}),
    } as unknown as Agent;
    const { client } = makeMockAgentConnection(agent);

    await client.sendRequest(schema.AGENT_METHODS.initialize, {
      protocolVersion: 1,
      clientCapabilities: {
        fs: {
          readTextFile: true,
          writeTextFile: true,
        },
      },
    });

    expect(agent.initialize).toHaveBeenCalledWith({
      protocolVersion: 1,
      clientCapabilities: {
        fs: {
          readTextFile: true,
          writeTextFile: true,
        },
      },
    });
  });

  it('should handle newSession request', async () => {
    const agent = {
      newSession: vi.fn().mockResolvedValue({ sessionId: 'session-1' }),
    } as unknown as Agent;
    const { client } = makeMockAgentConnection(agent);

    await client.sendRequest(schema.AGENT_METHODS.session_new, {
      cwd: '/test',
      mcpServers: [],
    });
    expect(agent.newSession).toHaveBeenCalledWith({
      cwd: '/test',
      mcpServers: [],
    });
  });

  it('should handle loadSession request', async () => {
    const agent = {
      loadSession: vi.fn().mockResolvedValue({ sessionId: 'session-1' }),
    } as unknown as Agent;
    const { client } = makeMockAgentConnection(agent);

    await client.sendRequest(schema.AGENT_METHODS.session_load, {
      sessionId: 'session-1',
      cwd: '/test',
      mcpServers: [],
    });
    expect(agent.loadSession).toHaveBeenCalledWith({
      sessionId: 'session-1',
      cwd: '/test',
      mcpServers: [],
    });
  });

  it('should handle authenticate request', async () => {
    const agent = {
      authenticate: vi.fn().mockResolvedValue(undefined),
    } as unknown as Agent;
    const { client } = makeMockAgentConnection(agent);

    await client.sendRequest(schema.AGENT_METHODS.authenticate, {
      methodId: 'test',
    });
    expect(agent.authenticate).toHaveBeenCalledWith({
      methodId: 'test',
    });
  });

  it('should handle prompt request', async () => {
    const agent = {
      prompt: vi.fn().mockResolvedValue({}),
    } as unknown as Agent;
    const { client } = makeMockAgentConnection(agent);

    await client.sendRequest(schema.AGENT_METHODS.session_prompt, {
      sessionId: 'session-1',
      prompt: [],
    });
    expect(agent.prompt).toHaveBeenCalledWith({
      sessionId: 'session-1',
      prompt: [],
    });
  });

  it('should handle cancel request', async () => {
    const agent = {
      cancel: vi.fn().mockResolvedValue(undefined),
    } as unknown as Agent;
    const { client } = makeMockAgentConnection(agent);

    await client.sendNotification(schema.AGENT_METHODS.session_cancel, {
      sessionId: 'session-1',
    });
    // Wait for the notification to be processed.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(agent.cancel).toHaveBeenCalledWith({
      sessionId: 'session-1',
    });
  });

  it('should throw method not found for unknown method', async () => {
    const agent = {} as unknown as Agent;
    const { client } = makeMockAgentConnection(agent);

    await expect(client.sendRequest('unknown/method', {})).rejects.toEqual({
      code: -32601,
      message: 'Method not found',
      data: { details: 'unknown/method' },
    });
  });
});

function makeMockAgentConnection(agent: Agent) {
  const a = new TransformStream();
  const b = new TransformStream();

  const client = new (Connection as any)(
    vi.fn(), // The client doesn't handle incoming requests in this test.
    a.writable,
    b.readable,
  );

  const server = new (AgentSideConnection as any)(
    () => agent,
    b.writable,
    a.readable,
  );

  return { client, server };
}