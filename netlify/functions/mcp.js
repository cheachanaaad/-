exports.handler = async (event) => {
  const accept = (event.headers.accept || "").toLowerCase();

  // 커넥터가 먼저 SSE probe를 할 수 있으니 GET+event-stream 허용
  if (event.httpMethod === "GET") {
    if (accept.includes("text/event-stream")) {
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-store",
          "Connection": "keep-alive",
        },
        body: ":ok\n\nevent: ready\ndata: {}\n\n",
      };
    }
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }),
    };
  }

  const { id, method, params } = body;

  if (method === "initialize") {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2025-11-25",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "resume-mcp", version: "1.0.1" },
          instructions: "resume.open_editor 도구를 호출해 편집기 링크를 제공하세요.",
        },
      }),
    };
  }

  if (method === "tools/list") {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        result: {
          tools: [
            {
              name: "resume.open_editor",
              description: "이력서 편집기 링크 반환",
              inputSchema: { type: "object" },
            },
          ],
        },
      }),
    };
  }

  if (method === "tools/call") {
    const toolName = params?.name;
    if (toolName !== "resume.open_editor") {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32602, message: "Unknown tool" } }),
      };
    }

    const url = `https://${event.headers.host}/editor.html`;
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: `편집기 링크:\n${url}` }],
          isError: false,
        },
      }),
    };
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } }),
  };
};
