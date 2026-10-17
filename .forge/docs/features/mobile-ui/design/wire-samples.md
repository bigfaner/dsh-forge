---
created: 2026-10-17
---

# wire-samples：真实会话各类型消息样本（截断）

来源：dsh-home sessions v4 JSONL（多帧 zstd 流式解压，扫描 4 个最大会话 / 20546 行），每类型取首个完整事件；字符串截断 220 字符、数组截 3 项。T1 单测 fixture 以同法提取的未截断样本为准。

### `permission/preset`

```json
{
  "type": "permission/preset",
  "seq": 0,
  "time": 1791687255277,
  "data": {
    "preset": "danger-full-access"
  }
}
```

### `sandbox/mode`

```json
{
  "type": "sandbox/mode",
  "seq": 1,
  "time": 1791687255277,
  "data": {
    "mode": "danger-full-access"
  }
}
```

### `approval/policy`

```json
{
  "type": "approval/policy",
  "seq": 2,
  "time": 1791687255277,
  "data": {
    "policy": "never"
  }
}
```

### `agent-preset/selected`

```json
{
  "type": "agent-preset/selected",
  "seq": 3,
  "time": 1791687259799,
  "data": {
    "agentPreset": "blitz"
  }
}
```

### `agent/inbox/spliced`

```json
{
  "type": "agent/inbox/spliced",
  "seq": 4,
  "time": 1791687365485,
  "data": {
    "target": "next-turn",
    "start": 0,
    "inserted": [
      {
        "content": [
          {
            "type": "text",
            "text": "/brainstorm 深度探索：把/run-tasks skill 重构dsh的指令。可以先探索dsh内置的指令。\n- 通过askUser工具，让用户选择一个尚有未执行完任务的slug(提案或feature)。根据选中的slug构建消息，让agent执行dispatchTask(slug)。\r\n- 派发任务与继续任务逻辑相近，消息模板稍有不同。"
          }
        ],
        "source": {
          "kind": "user",
          "rpcId": "375df8f8-1f5d-4508-bb3e-db114dd72d3f",
          "clientTimeZone": "Asia/Shanghai"
        },
        "role": "user",
        "id": "c84b4013-1228-4c09-973c-9aceabaec7f7"
      }
    ]
  }
}
```

### `turn/start`

```json
{
  "type": "turn/start",
  "seq": 5,
  "time": 1791687365485,
  "data": {
    "turn": 1
  }
}
```

### `step/start`

```json
{
  "type": "step/start",
  "seq": 7,
  "time": 1791687365513,
  "data": {
    "turn": 1,
    "step": 1
  }
}
```

### `system/message`

```json
{
  "type": "system/message",
  "seq": 8,
  "time": 1791687365514,
  "data": {
    "turn": 1,
    "step": 1,
    "message": {
      "role": "system",
      "content": [
        {
          "type": "text",
          "text": "You are an AI agent powered by DeepSeek Harness.\n\nYou are a coding agent powered by the glm-5.3 model. 突击作风：直奔要害、最小可用——单线推进、快速收口、验收即止，不扩张范围、不引入新机械。\n\n## Project knowledge base\n\nA project knowledge base may be registered f…[截断]"
        }
      ],
      "source": {
        "kind": "system-prompt"
      },
      "id": "50bff3f6-ba20-4f99-9ae6-1b55c815b61e"
    }
  },
  "surfaceOp": "append"
}
```

### `user/message`

```json
{
  "type": "user/message",
  "seq": 9,
  "time": 1791687365514,
  "data": {
    "content": [
      {
        "type": "text",
        "text": "/brainstorm 深度探索：把/run-tasks skill 重构dsh的指令。可以先探索dsh内置的指令。\n- 通过askUser工具，让用户选择一个尚有未执行完任务的slug(提案或feature)。根据选中的slug构建消息，让agent执行dispatchTask(slug)。\r\n- 派发任务与继续任务逻辑相近，消息模板稍有不同。"
      }
    ],
    "source": {
      "kind": "user",
      "rpcId": "375df8f8-1f5d-4508-bb3e-db114dd72d3f",
      "clientTimeZone": "Asia/Shanghai"
    },
    "role": "user",
    "id": "c84b4013-1228-4c09-973c-9aceabaec7f7"
  },
  "surfaceOp": "append"
}
```

### `request/header`

```json
{
  "type": "request/header",
  "seq": 14,
  "time": 1791687365516,
  "data": {
    "header": {
      "config": {
        "provider": "zai-coding-cn",
        "model": "glm-5.3",
        "reasoningEffort": "max"
      },
      "tools": [
        {
          "name": "addTask",
          "description": "Add a task to a container in the forge pipeline state layer (source_kind: feature for expedition breakdowns, proposal for blitz direct-attached tasks). Use source_task_slug + source_task_local_id (with block_source) to s…[截断]",
          "parameters": {
            "type": "object",
            "properties": {
              "source_kind": {
                "type": "string",
                "description": "Container kind, one of: feature, proposal (feature = expedition chain / proposal = blitz direct-attach)."
              },
              "source_slug": {
                "type": "string",
                "description": "Container slug (feature directory name or proposal slug; must exist — the task slug equals it)."
              },
              "title": {
                "type": "string",
                "description": "Short task title."
              },
              "type": {
                "type": "string",
                "description": "Task type, one of: coding-feature, coding-enhancement, coding-cleanup, coding-refactor, code-quality-simplify, coding-fix, gate, doc, doc-consolidate, doc-drift, doc-review, doc-summary, test-run, test-gen-contracts, tes…[截断]"
              },
              "task_desc": {
                "type": "string",
                "description": "Content payload (hard rules, reference list, free text)."
              },
              "acceptance_criteria": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "description": "Acceptance criteria checklist (submit with result=success later requires gate.test passing when this is non-empty)."
              },
              "priority": {
                "type": "string",
                "description": "Priority, one of: P0, P1, P2."
              },
              "estimated_time": {
                "type": "string",
                "description": "Rough estimate such as '1-2h'."
              },
              "vars": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "description": "Injection variables as KEY=VALUE entries (duplicate keys are rejected)."
              },
              "depends_on": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "description": "Local ids of prerequisite tasks in the same container."
              },
              "source_task_slug": {
                "type": "string",
                "description": "Slug of the chain source task (pair with source_task_local_id; same value as source_slug)."
              },
              "source_task_local_id": {
                "type": "string",
                "description": "Local id of the chain source task (pair with source_task_slug)."
              },
              "block_source": {
                "type": "boolean",
                "description": "true = block the source task in the same transaction until this fix completes (fix chain)."
              },
              "breaking": {
                "type": "boolean",
                "description": "Breaking-change flag (default false)."
              },
              "coverage": {
                "type": "number",
                "description": "Coverage threshold as a 0-1 fraction (omit for global default)."
              },
              "complexity": {
                "type": "string",
                "description": "One of: low, medium, high."
              },
              "surface_key": {
                "type": "string",
                "description": "Surface key the task targets."
              },
              "surface_type": {
                "type": "string",
                "description": "Surface type the task targets (web/api/cli/tui/mobile)."
              }
            },
            "required": [
              "…"
            ]
          }
        },
        {
          "name": "ask_user_question",
          "description": "Ask the user a concise question when you need confirmation, a choice, or missing information before proceeding.",
          "parameters": {
            "type": "object",
            "properties": {
              "questions": {
                "type": "array",
                "description": "Questions to ask the user before continuing.",
                "items": {
                  "type": "object",
                  "additionalProperties": true,
                  "properties": {
                    "id": {
                      "type": "string",
                      "description": "Stable id for this question; echoed in the answer."
                    },
                    "question": {
                      "type": "string",
                      "description": "The specific question to ask the user."
                    },
                    "header": {
                      "type": "string",
                      "description": "Optional short heading for the question, such as \"Confirm\" or \"Choose Mode\"."
                    },
                    "options": {
                      "type": "array",
                      "description": "Optional choices to show the user. If you recommend one, put it first and append \"(Recommended)\" to that label.",
                      "items": {
                        "type": "object",
                        "additionalProperties": true,
                        "properties": {
                          "label": {
                            "type": "string",
                            "description": "Short user-facing option label."
                          },
                          "description": {
                            "type": "string",
                            "description": "One sentence explaining the tradeoff or impact."
                          }
                        },
                        "required": [
                          "…"
                        ]
                      }
                    },
                    "multi_select": {
                      "type": "boolean",
                      "description": "Whether the user may select more than one option. Defaults to false."
                    }
                  },
                  "required": [
                    "…"
                  ]
                }
              }
            },
            "required": [
              "…"
            ]
          }
        },
        {
          "name": "createProposal",
          "description": "Register a proposal row in the forge pipeline (identity and name are separate: the slug can be renamed later, links use proposalId). rel_path points at the proposal document relative to the workspace docs root. mode reco…[截断]",
          "parameters": {
            "type": "object",
            "properties": {
              "slug": {
                "type": "string",
                "description": "Proposal slug (unique)."
              },
              "title": {
                "type": "string",
                "description": "Proposal title."
              },
              "rel_path": {
                "type": "string",
                "description": "Proposal document path relative to the workspace docs root, forward slashes (e.g. 'proposals/<slug>/proposal.md')."
              },
              "status": {
                "type": "string",
                "description": "Initial status, one of: draft, under-review, accepted, rejected, superseded (default draft)."
              },
              "mode": {
                "type": "string",
                "description": "Lineage mode, one of: expedition, blitz (expedition or blitz; omit = undecided placeholder)."
              }
            },
            "required": [
              "…"
            ]
          }
        }
      ]
    },
    "reason": "initial"
  }
}
```

### `request/context`

```json
{
  "type": "request/context",
  "seq": 15,
  "time": 1791687365517,
  "data": {
    "provider": "zai-coding-cn",
    "model": "glm-5.3",
    "contextWindow": 1000000
  }
}
```

### `session/title`

```json
{
  "type": "session/title",
  "seq": 16,
  "time": 1791687365519,
  "data": {
    "title": "/brainstorm 深度探索：把/run-tasks",
    "messageSeqs": [
      9
    ],
    "source": {
      "kind": "fallback"
    }
  }
}
```

### `session/title-llm-request`

```json
{
  "type": "session/title-llm-request",
  "seq": 17,
  "time": 1791687365520,
  "data": {
    "titleProvider": "session-title-first-prompt-llm",
    "messageSeqs": [
      9
    ],
    "route": {
      "provider": "zai-coding-cn",
      "model": "glm-5.3"
    },
    "system": "Create a concise title for an AI coding-assistant session from the supplied human messages.\nReturn only the title on one line, **in plain text of natural language**, with no quotes, prefix, explanation, Markdown, XML, or…[截断]",
    "messages": [
      {
        "content": [
          {
            "type": "text",
            "text": "Generate the session title from this JSON array of human messages:\n[{\"seq\":9,\"text\":\"/brainstorm 深度探索：把/run-tasks skill 重构dsh的指令。可以先探索dsh内置的指令。\\n- 通过askUser工具，让用户选择一个尚有未执行完任务的slug(提案或feature)。根据选中的slug构建消息，让agent执行dispat…[截断]"
          }
        ],
        "source": {
          "kind": "dsh-session-title-llm"
        },
        "role": "user",
        "id": "bf3f4a40-83db-40be-a58f-6745533866f0"
      }
    ],
    "maxTokens": 64
  }
}
```

### `assistant/message`

```json
{
  "type": "assistant/message",
  "seq": 19,
  "time": 1791687375633,
  "data": {
    "turn": 1,
    "step": 1,
    "message": {
      "role": "assistant",
      "content": [
        {
          "type": "reasoning",
          "text": "用户想要深度探索一个想法：把 /run-tasks skill 重构为 dsh 的指令（内置指令/slash command）。让我理解需求：\n\n1. 探索 dsh 内置的指令（slash commands）机制\n2. 通过 askUser 工具（应该对应 ask_user_question），让用户选择一个尚有未执行完任务的 slug（提案或 feature）\n3. 根据选中的 slug 构建消息，让 agent 执行 dispatc…[截断]"
        },
        {
          "type": "tool-call",
          "id": "call_a4e818eb9a784f5ca5781102",
          "name": "read",
          "arguments": "{\"file_path\":\"Z:\\\\project\\\\dsh\\\\dsh-forge\\\\node_modules\\\\.pnpm\\\\node_modules\\\\@dsh-forge\\\\plugin-forge\\\\skills\\\\run-tasks\\\\SKILL.md\"}"
        },
        {
          "type": "tool-call",
          "id": "call_b6dffb310a0b4702aa3f9f85",
          "name": "grep",
          "arguments": "{\"include\":\"*.ts\",\"path\":\"Z:\\\\project\\\\dsh\\\\dsh-forge\\\\apps\\\\host\\\\profile.dev\",\"pattern\":\"slash|SlashCommand|slash-command\"}"
        }
      ],
      "source": {
        "kind": "model",
        "provider": "zai-coding-cn",
        "model": "glm-5.3",
        "replayState": {
          "response": {
            "kind": "pi-ai",
            "version": 2,
            "api": "openai-completions",
            "provider": "zai-coding-cn",
            "model": "glm-5.3",
            "responseId": "2026101110560515553ede46564a76",
            "stopReason": "toolUse"
          },
          "blocks": [
            "…"
          ]
        }
      },
      "id": "c38c10b0-4c87-4c9b-b0ea-85a378049492"
    },
    "usage": {
      "inputTokens": 2195,
      "outputTokens": 455,
      "totalTokens": 12826,
      "cacheReadTokens": 10176
    },
    "stream": [
      {
        "type": "chunk",
        "time": 1791687369994,
        "chunk": {
          "type": "block-start",
          "index": 0,
          "blockType": "reasoning"
        }
      },
      {
        "type": "reasoning-chunks",
        "time0": 1791687369994,
        "index": 0,
        "dt": [
          47,
          48,
          0
        ],
        "texts": [
          "用户",
          "想要",
          "深度"
        ]
      },
      {
        "type": "chunk",
        "time": 1791687374753,
        "chunk": {
          "type": "block-start",
          "index": 1,
          "blockType": "tool-call"
        }
      }
    ]
  },
  "surfaceOp": "append"
}
```

### `tool/call`

```json
{
  "type": "tool/call",
  "seq": 20,
  "time": 1791687375634,
  "data": {
    "turn": 1,
    "step": 1,
    "callId": "call_a4e818eb9a784f5ca5781102",
    "name": "read",
    "arguments": "{\"file_path\":\"Z:\\\\project\\\\dsh\\\\dsh-forge\\\\node_modules\\\\.pnpm\\\\node_modules\\\\@dsh-forge\\\\plugin-forge\\\\skills\\\\run-tasks\\\\SKILL.md\"}"
  }
}
```

### `tool/result`

```json
{
  "type": "tool/result",
  "seq": 21,
  "time": 1791687375653,
  "data": {
    "turn": 1,
    "step": 1,
    "message": {
      "role": "tool",
      "source": {
        "kind": "tool",
        "callId": "call_a4e818eb9a784f5ca5781102"
      },
      "toolCallId": "call_a4e818eb9a784f5ca5781102",
      "content": [
        {
          "type": "text",
          "text": "<path>Z:\\project\\dsh\\dsh-forge\\node_modules\\.pnpm\\node_modules\\@dsh-forge\\plugin-forge\\skills\\run-tasks\\SKILL.md</path>\n<type>file</type>\n<content>\n1: ---\n2: name: run-tasks\n3: description: Forge dispatch loop — backgrou…[截断]"
        }
      ],
      "isError": false,
      "id": "fddcffd5-d06d-48c8-866e-7c4b5635d49b"
    },
    "meta": {
      "path": "Z:\\project\\dsh\\dsh-forge\\node_modules\\.pnpm\\node_modules\\@dsh-forge\\plugin-forge\\skills\\run-tasks\\SKILL.md",
      "offset": 1,
      "lines": [
        {
          "number": 1,
          "text": "---"
        },
        {
          "number": 2,
          "text": "name: run-tasks"
        },
        {
          "number": 3,
          "text": "description: Forge dispatch loop — background-dispatch until no-task, drain each in-flight job's settlement via job_output, then keep dispatching; carries the mode-mismatch guard line and the canonical fix-chain protocol…[截断]"
        }
      ],
      "totalLines": 168,
      "lang": "md"
    }
  },
  "sourceEventSeqs": [
    20
  ],
  "surfaceOp": "append"
}
```

### `step/end`

```json
{
  "type": "step/end",
  "seq": 24,
  "time": 1791687375863,
  "data": {
    "turn": 1,
    "step": 1
  }
}
```

### `assistant/attempt`

```json
{
  "type": "assistant/attempt",
  "seq": 241,
  "time": 1791687964264,
  "data": {
    "turn": 1,
    "step": 38,
    "stream": []
  }
}
```

### `turn/end`

```json
{
  "type": "turn/end",
  "seq": 243,
  "time": 1791687964264,
  "data": {
    "turn": 1,
    "reason": {
      "kind": "aborted",
      "reason": {
        "kind": "user"
      }
    }
  }
}
```

### `workspace/changes`

```json
{
  "type": "workspace/changes",
  "seq": 330,
  "time": 1791688509383,
  "data": {
    "turn": 2
  }
}
```

### `web/deepseek-search-llm-request`

```json
{
  "type": "web/deepseek-search-llm-request",
  "seq": 535,
  "time": 1791689411007,
  "data": {
    "endpoint": "https://api.deepseek.com/anthropic/v1/messages",
    "apiVersion": "2023-06-01",
    "body": {
      "model": "deepseek-v4-flash",
      "max_tokens": 4096,
      "messages": [
        {
          "role": "user",
          "content": [
            "…"
          ]
        }
      ],
      "tools": [
        {
          "type": "web_search_20250305",
          "name": "web_search",
          "max_uses": 5
        }
      ]
    }
  }
}
```

### `session/end-seed`

```json
{
  "type": "session/end-seed",
  "seq": 784,
  "time": 1791690978566,
  "data": {}
}
```

### `llm/retry`

```json
{
  "type": "llm/retry",
  "seq": 824,
  "time": 1791691582704,
  "data": {
    "retryId": "0f1e898b-4b14-49ba-a0b2-90bae1090724",
    "turn": 13,
    "step": 7,
    "provider": "zai-coding-cn",
    "mode": "normal",
    "policyKey": "[\"normal\",5,[\"EMPTY_RESPONSE\",\"RATE_LIMIT\",\"SERVER\",\"TIMEOUT\",\"TRANSPORT\"],500,10000,0.1]",
    "retry": 1,
    "maxRetries": 5,
    "delayMs": 456.30638657951283,
    "failure": {
      "message": "500: {\"code\":\"1234\",\"message\":\"网络错误，错误id 20261011120322beca74030fff428d ，请稍后重试。\"}",
      "code": "SERVER"
    }
  }
}
```

### `llm/retry-started`

```json
{
  "type": "llm/retry-started",
  "seq": 825,
  "time": 1791691583163,
  "data": {
    "retryId": "0f1e898b-4b14-49ba-a0b2-90bae1090724",
    "turn": 13,
    "step": 7,
    "retry": 1
  }
}
```

### `command/run`

```json
{
  "type": "command/run",
  "seq": 2633,
  "time": 1791699025489,
  "data": {
    "commandId": "cmd-33fa9a4a-2",
    "name": "compact",
    "args": "",
    "source": {
      "kind": "user"
    }
  }
}
```

### `compaction/start`

```json
{
  "type": "compaction/start",
  "seq": 2634,
  "time": 1791699025492,
  "data": {
    "compactionId": "6b32b0dc-7e93-45fd-9521-23a5a71889d5",
    "sourceCommandId": "cmd-33fa9a4a-2",
    "turn": null
  }
}
```

### `compaction/summary`

```json
{
  "type": "compaction/summary",
  "seq": 2635,
  "time": 1791699079189,
  "data": {
    "compactionId": "6b32b0dc-7e93-45fd-9521-23a5a71889d5",
    "sourceCommandId": "cmd-33fa9a4a-2",
    "summary": [
      {
        "type": "text",
        "text": "## Primary Request and Intent\n\n- Original: refactor the `/run-tasks` skill (dispatcher agent session runs the dispatch loop) into a **dsh built-in command** `/run-dag-tasks` with a **host-process-driven dispatch loop** (…[截断]"
      }
    ],
    "rawOutput": [
      {
        "type": "text",
        "text": "## Primary Request and Intent\n\n- Original: refactor the `/run-tasks` skill (dispatcher agent session runs the dispatch loop) into a **dsh built-in command** `/run-dag-tasks` with a **host-process-driven dispatch loop** (…[截断]"
      }
    ],
    "llmStreamCall": true,
    "shadowedRange": {
      "start": 9,
      "end": 2626
    },
    "shadowedSeqs": [
      9,
      10,
      11
    ],
    "shadowedTokenCount": 244792,
    "provider": "zai-coding-cn",
    "model": "glm-5.3",
    "maxTokens": 65536,
    "usage": {
      "inputTokens": 392503,
      "outputTokens": 2900,
      "totalTokens": 395403
    }
  }
}
```

### `compaction/end`

```json
{
  "type": "compaction/end",
  "seq": 2637,
  "time": 1791699079191,
  "data": {
    "compactionId": "6b32b0dc-7e93-45fd-9521-23a5a71889d5",
    "sourceCommandId": "cmd-33fa9a4a-2",
    "turn": null
  }
}
```

### `command/done`

```json
{
  "type": "command/done",
  "seq": 2638,
  "time": 1791699079196,
  "data": {
    "commandId": "cmd-33fa9a4a-2",
    "kind": "success",
    "text": "Compacted 960 history items (~244792 tokens).",
    "sourceEventSeq": 2635
  }
}
```

### `deliverables/presented`

```json
{
  "type": "deliverables/presented",
  "seq": 3521,
  "time": 1791725415666,
  "data": {
    "turn": 87,
    "callId": "call_73ace585ee524b00b262143a",
    "files": [
      {
        "description": "存量 forge.db 补列补丁脚本（你审核后执行）",
        "path": "Z:\\project\\dsh\\dsh-forge\\.forge\\docs\\proposals\\run-tasks-host-command\\walkthrough\\patch-forge-db-loop-sourced.cjs"
      }
    ]
  }
}
```

### `model/selection`

```json
{
  "type": "model/selection",
  "seq": 3961,
  "time": 1791728311420,
  "data": {
    "provider": "zai-coding-cn",
    "model": "glm-4.6v"
  }
}
```

### `compaction/prune`

```json
{
  "type": "compaction/prune",
  "seq": 3979,
  "time": 1791728330207,
  "data": {
    "shadowedRange": {
      "start": 2659,
      "end": 2659
    },
    "shadowedSeqs": [
      2659
    ],
    "shadowedTokenCount": 2789
  }
}
```

### `subagent/catalog`

```json
{
  "type": "subagent/catalog",
  "seq": 1393,
  "time": 1791725779104,
  "data": {
    "version": 0,
    "childId": "a80e4eda-3837-4e1d-b094-34d3ae590e00",
    "childCreatedAt": 1791725779050,
    "mode": "continuable",
    "label": "评审提案工程可行性"
  }
}
```

### `plan/mode`

```json
{
  "type": "plan/mode",
  "seq": 4676,
  "time": 1791871142141,
  "data": {
    "active": true
  }
}
```

### `forge/progress`

```json
{
  "type": "forge/progress",
  "seq": 11,
  "time": 1791947189280,
  "data": {
    "sourceSlug": "mobile-remote-approval",
    "verb": "claim",
    "status": "running",
    "taskKey": "mobile-remote-approval/1.1",
    "counts": {
      "pending": 4,
      "running": 1,
      "done": 0
    },
    "at": 1791947189280
  }
}
```

### `approval/asked`

```json
{
  "type": "approval/asked",
  "seq": 644,
  "time": 1791521931800,
  "data": {
    "id": "8f9ecf5f-6fa8-45a6-b55d-a99a537952c9",
    "toolName": "pwsh",
    "callId": "call_308eeb0d38f34163812e176c",
    "reason": "escalate sandbox to danger-full-access: 需要修复 .forge 下原型目录的 Windows 文件权限：脚本会在该目录及祖先链上为当前用户补上缺失的完全控制条目（不改文件内容与所有者），并把每条变更备份到 tmp\\acl-reports，打印可撤销命令——修好后 shell 才能覆写这些原型文件。"
  }
}
```

### `approval/decided`

```json
{
  "type": "approval/decided",
  "seq": 645,
  "time": 1791523842809,
  "data": {
    "id": "8f9ecf5f-6fa8-45a6-b55d-a99a537952c9",
    "outcome": "allowed-once"
  }
}
```
