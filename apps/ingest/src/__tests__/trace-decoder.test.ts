import { describe, expect, it, vi } from "vitest";
import { extractSpansFromTraceExport } from "../otel/trace-decoder.js";
import { createReceiverShape } from "../otel/receiver.js";

describe("trace export decoding", () => {
  it("extracts service, categories, session ids, and tool names from OTLP trace payloads", async () => {
    const request = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              {
                key: "service.name",
                value: {
                  stringValue: "gateway"
                }
              }
            ]
          },
          scopeSpans: [
            {
              spans: [
                {
                  attributes: [
                    {
                      key: "graphql.operation.name",
                      value: {
                        stringValue: "GetCatalog"
                      }
                    }
                  ],
                  endTimeUnixNano: "2000000",
                  kind: "SPAN_KIND_SERVER",
                  name: "POST /graphql",
                  spanId: Buffer.from("span0001"),
                  startTimeUnixNano: "1000000",
                  traceId: Buffer.from("trace000trace000")
                },
                {
                  attributes: [
                    {
                      key: "db.system",
                      value: {
                        stringValue: "postgresql"
                      }
                    }
                  ],
                  endTimeUnixNano: "2600000",
                  kind: "SPAN_KIND_CLIENT",
                  name: "SELECT widgets",
                  parentSpanId: Buffer.from("span0001"),
                  spanId: Buffer.from("span0002"),
                  startTimeUnixNano: "2200000",
                  traceId: Buffer.from("trace000trace000")
                }
              ]
            }
          ]
        },
        {
          resource: {
            attributes: [
              {
                key: "service.name",
                value: {
                  stringValue: "codex"
                }
              }
            ]
          },
          scopeSpans: [
            {
              spans: [
                {
                  attributes: [
                    {
                      key: "gen_ai.session.id",
                      value: {
                        stringValue: "sess-1"
                      }
                    }
                  ],
                  endTimeUnixNano: "5600000",
                  kind: "SPAN_KIND_INTERNAL",
                  name: "session.run",
                  spanId: Buffer.from("sess0001"),
                  startTimeUnixNano: "5000000",
                  traceId: Buffer.from("trace111trace111")
                },
                {
                  attributes: [
                    {
                      key: "gen_ai.session.id",
                      value: {
                        stringValue: "sess-1"
                      }
                    },
                    {
                      key: "tool.name",
                      value: {
                        stringValue: "exec_command"
                      }
                    }
                  ],
                  endTimeUnixNano: "5700000",
                  kind: "SPAN_KIND_INTERNAL",
                  name: "tool.exec_command",
                  parentSpanId: Buffer.from("sess0001"),
                  spanId: Buffer.from("tool0001"),
                  startTimeUnixNano: "5100000",
                  traceId: Buffer.from("trace111trace111")
                }
              ]
            }
          ]
        }
      ]
    };

    const spans = extractSpansFromTraceExport(request);

    expect(spans).toHaveLength(4);
    expect(spans[0]).toMatchObject({
      category: "graphql",
      serviceName: "gateway",
      spanName: "POST /graphql"
    });
    expect(spans[1]).toMatchObject({
      category: "db",
      serviceName: "gateway"
    });
    expect(spans[2]).toMatchObject({
      category: "agent_session",
      serviceName: "codex",
      sessionId: "sess-1"
    });
    expect(spans[3]).toMatchObject({
      category: "tool_call",
      serviceName: "codex",
      sessionId: "sess-1",
      toolName: "exec_command"
    });
  });

  it("passes decoded spans into the configured ingest callback", async () => {
    const ingestTraceExport = vi.fn();
    const receiver = createReceiverShape({
      ingestTraceExport
    });

    await new Promise<void>((resolve, reject) => {
      receiver.traceHandlers.Export(
        {
          request: {
            resourceSpans: [
              {
                resource: {
                  attributes: [
                    {
                      key: "service.name",
                      value: {
                        stringValue: "gateway"
                      }
                    }
                  ]
                },
                scopeSpans: [
                  {
                    spans: [
                      {
                        attributes: [],
                        endTimeUnixNano: "2000000",
                        kind: "SPAN_KIND_SERVER",
                        name: "GET /health",
                        spanId: Buffer.from("span9999"),
                        startTimeUnixNano: "1000000",
                        traceId: Buffer.from("trace999trace999")
                      }
                    ]
                  }
                ]
              }
            ]
          }
        } as never,
        (error, response) => {
          if (error) {
            reject(error);
            return;
          }

          expect(response).toMatchObject({
            partialSuccess: {}
          });
          resolve();
        }
      );
    });

    expect(ingestTraceExport).toHaveBeenCalledTimes(1);
    expect(ingestTraceExport.mock.calls[0]?.[0][0]).toMatchObject({
      category: "app",
      serviceName: "gateway",
      spanName: "GET /health"
    });
  });

  it("treats codex tool_name attributes as tool calls", () => {
    const spans = extractSpansFromTraceExport({
      resourceSpans: [
        {
          resource: {
            attributes: [
              {
                key: "service.name",
                value: {
                  stringValue: "codex-app-server"
                }
              }
            ]
          },
          scopeSpans: [
            {
              spans: [
                {
                  attributes: [
                    {
                      key: "tool_name",
                      value: {
                        stringValue: "exec_command"
                      }
                    },
                    {
                      key: "call_id",
                      value: {
                        stringValue: "call-1"
                      }
                    }
                  ],
                  endTimeUnixNano: "2000000",
                  kind: "SPAN_KIND_INTERNAL",
                  name: "exec_command",
                  spanId: Buffer.from("codex001"),
                  startTimeUnixNano: "1000000",
                  traceId: Buffer.from("tracecodextrace1")
                }
              ]
            }
          ]
        }
      ]
    });

    expect(spans[0]).toMatchObject({
      category: "tool_call",
      toolName: "exec_command"
    });
  });

  it("drops high-volume codex transport spans that are not useful for dashboards", () => {
    const spans = extractSpansFromTraceExport({
      resourceSpans: [
        {
          resource: {
            attributes: [
              {
                key: "service.name",
                value: {
                  stringValue: "codex-app-server"
                }
              }
            ]
          },
          scopeSpans: [
            {
              spans: [
                {
                  attributes: [],
                  endTimeUnixNano: "1000",
                  kind: "SPAN_KIND_INTERNAL",
                  name: "poll",
                  spanId: Buffer.from("noise000"),
                  startTimeUnixNano: "1000",
                  traceId: Buffer.from("trace-noise-span")
                },
                {
                  attributes: [
                    {
                      key: "tool_name",
                      value: {
                        stringValue: "exec_command"
                      }
                    }
                  ],
                  endTimeUnixNano: "2000000",
                  kind: "SPAN_KIND_INTERNAL",
                  name: "exec_command",
                  spanId: Buffer.from("keep0001"),
                  startTimeUnixNano: "1000000",
                  traceId: Buffer.from("trace-noise-span")
                }
              ]
            }
          ]
        }
      ]
    });

    expect(spans).toHaveLength(1);
    expect(spans[0]?.spanName).toBe("exec_command");
  });

  it("extracts token usage and codex tool payload details for agent dashboards", () => {
    const spans = extractSpansFromTraceExport({
      resourceSpans: [
        {
          resource: {
            attributes: [
              {
                key: "service.name",
                value: {
                  stringValue: "codex-app-server"
                }
              }
            ]
          },
          scopeSpans: [
            {
              spans: [
                {
                  attributes: [
                    {
                      key: "conversation.id",
                      value: {
                        stringValue: "conv-1"
                      }
                    },
                    {
                      key: "gen_ai.usage.input_tokens",
                      value: {
                        intValue: "1200"
                      }
                    },
                    {
                      key: "gen_ai.usage.output_tokens",
                      value: {
                        intValue: "350"
                      }
                    },
                    {
                      key: "tool_name",
                      value: {
                        stringValue: "exec_command"
                      }
                    },
                    {
                      key: "call",
                      value: {
                        stringValue:
                          'ToolCall { tool_name: "exec_command", call_id: "call-123", payload: Function { arguments: "{\\"cmd\\":\\"ls\\",\\"workdir\\":\\"/tmp\\"}" } }'
                      }
                    }
                  ],
                  endTimeUnixNano: "8000000",
                  kind: "SPAN_KIND_INTERNAL",
                  name: "handle_tool_call",
                  spanId: Buffer.from("tool1234"),
                  startTimeUnixNano: "5000000",
                  traceId: Buffer.from("trace-agent-0001")
                }
              ]
            }
          ]
        }
      ]
    });

    expect(spans[0]).toMatchObject({
      conversationId: "conv-1",
      inputTokens: 1200,
      outputTokens: 350,
      toolArguments: '{\n  "cmd": "ls",\n  "workdir": "/tmp"\n}',
      toolCallId: "call-123",
      toolName: "exec_command"
    });
  });

  it("drops duplicate codex tool bookkeeping spans without canonical payload data", () => {
    const spans = extractSpansFromTraceExport({
      resourceSpans: [
        {
          resource: {
            attributes: [
              {
                key: "service.name",
                value: {
                  stringValue: "codex-app-server"
                }
              }
            ]
          },
          scopeSpans: [
            {
              spans: [
                {
                  attributes: [
                    {
                      key: "tool_name",
                      value: {
                        stringValue: "exec_command"
                      }
                    }
                  ],
                  endTimeUnixNano: "2000000",
                  kind: "SPAN_KIND_INTERNAL",
                  name: "handle_responses",
                  spanId: Buffer.from("dropdup1"),
                  startTimeUnixNano: "1000000",
                  traceId: Buffer.from("trace-dupe-tool01")
                },
                {
                  attributes: [
                    {
                      key: "tool_name",
                      value: {
                        stringValue: "exec_command"
                      }
                    },
                    {
                      key: "call",
                      value: {
                        stringValue:
                          'ToolCall { tool_name: "exec_command", call_id: "call-keep-1", payload: Function { arguments: "{\\"cmd\\":\\"pwd\\"}" } }'
                      }
                    }
                  ],
                  endTimeUnixNano: "3000000",
                  kind: "SPAN_KIND_INTERNAL",
                  name: "handle_tool_call",
                  spanId: Buffer.from("keepdup1"),
                  startTimeUnixNano: "1000000",
                  traceId: Buffer.from("trace-dupe-tool01")
                }
              ]
            }
          ]
        }
      ]
    });

    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({
      spanName: "handle_tool_call",
      toolArguments: '{\n  "cmd": "pwd"\n}',
      toolCallId: "call-keep-1"
    });
  });
});
