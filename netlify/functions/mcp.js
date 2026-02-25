// netlify/functions/mcp.js
// MCP endpoint for ChatGPT Connector
// - GET (Accept: text/event-stream) : minimal SSE probe
// - POST JSON-RPC : initialize, tools/list, tools/call
//
// Tool: resume.open_editor
//  -> returns editor link with prefilled data: /editor.html#data=<base64(json)>

exports.handler = async (event) => {
  const accept = String(event.headers?.accept || event.headers?.Accept || "").toLowerCase();

  // Some clients probe with SSE GET first.
  if (event.httpMethod === "GET") {
    if (accept.includes("text/event-stream")) {
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-store",
          "Connection": "keep-alive",
        },
        body: ": ok\n\nevent: ready\ndata: {}\n\n",
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
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      }),
    };
  }

  const { id, method, params } = body;

  // --- initialize ---
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
          serverInfo: { name: "resume-mcp", version: "1.1.0" },
          instructions:
            "사용자에게서 이력서 정보를 받은 뒤 resume.open_editor 도구를 호출하세요. 반환된 링크를 열면 초안이 자동으로 채워져 있고 사용자가 직접 수정/인쇄할 수 있습니다.",
        },
      }),
    };
  }

  // --- tools/list ---
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
              title: "이력서 편집기 열기(초안 채움)",
              description:
                "입력된 이력서 정보를 바탕으로 편집기 링크를 생성합니다. 링크를 열면 초안이 자동으로 채워져 있으며 사용자가 직접 수정할 수 있습니다.",
              inputSchema: {
                type: "object",
                properties: {
                  name: { type: "string", description: "성명" },
                  rrn: { type: "string", description: "주민등록번호" },
                  birth: { type: "string", description: "생년월일" },
                  gender: { type: "string", description: "성별(남/여)" },
                  address: { type: "string", description: "주소" },
                  email: { type: "string", description: "이메일" },
                  phone: { type: "string", description: "전화/H.P" },
                  rows: {
                    type: "array",
                    description: "학력/경력 행 목록",
                    items: {
                      type: "object",
                      properties: {
                        date: { type: "string", description: "년 월 일" },
                        content: { type: "string", description: "학력 및 경력사항" },
                        issuer: { type: "string", description: "발령청(없으면 빈칸)" },
                      },
                      required: ["date", "content"],
                      additionalProperties: false,
                    },
                  },
                  licenses: {
                    type: "array",
                    description: "자격증 목록",
                    items: { type: "string" },
                  },
                },
                additionalProperties: false,
              },
            },
          ],
        },
      }),
    };
  }

  // --- tools/call ---
  if (method === "tools/call") {
    const toolName = params?.name;
    const args = params?.arguments || {};

    if (toolName !== "resume.open_editor") {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: `Unknown tool: ${toolName}` },
        }),
      };
    }

    // Build absolute base URL
    const proto = event.headers["x-forwarded-proto"] || "https";
    const host = event.headers.host;
    const baseUrl = `${proto}://${host}`;

    // Encode arguments into URL hash so server doesn't store data
    const json = JSON.stringify(args);
    const b64 = Buffer.from(json, "utf8").toString("base64");

    const url = `${baseUrl}/editor.html#data=${b64}`;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text:
                "이력서 초안(수정 가능) 링크입니다. 열면 내용이 자동으로 채워져 있습니다.\n" +
                url +
                "\n\n편집 후 인쇄: Ctrl+P (또는 편집기 내 인쇄 버튼)",
            },
          ],
          isError: false,
        },
      }),
    };
  }

  // --- default ---
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: id ?? null,
      error: { code: -32601, message: "Method not found" },
    }),
  };
};
