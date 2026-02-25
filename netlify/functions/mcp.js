// netlify/functions/mcp.js
// MCP endpoint for ChatGPT Connector
// - GET (Accept: text/event-stream): minimal SSE probe
// - POST JSON-RPC: initialize, tools/list, tools/call
//
// Tool: resume.open_editor
//  -> returns editor link with prefilled data: /editor.html#data=<base64(json)>
//
// 핵심: required 스키마 + 서버측 검증으로 빈 {} 호출 방지

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

  // ---- 공통 스키마(규칙) ----
  // 필수: name, phone, email, address, rows(최소 1개)
  // rows의 각 항목은 date+content 필수
  const TOOL_SCHEMA = {
    type: "object",
    properties: {
      name: { type: "string", description: "성명" },
      rrn: { type: "string", description: "주민등록번호(선택)" },
      birth: { type: "string", description: "생년월일(선택)" },
      gender: { type: "string", description: "성별(선택: 남/여)" },
      address: { type: "string", description: "주소" },
      email: { type: "string", description: "이메일" },
      phone: { type: "string", description: "전화/H.P" },
      rows: {
        type: "array",
        description: "학력/경력 행 목록(위에서 아래 순서대로 출력)",
        items: {
          type: "object",
          properties: {
            date: { type: "string", description: "년 월 일(예: 2020.03)" },
            content: { type: "string", description: "학력 및 경력사항" },
            issuer: { type: "string", description: "발령청(없으면 빈칸)" },
          },
          required: ["date", "content"],
          additionalProperties: false,
        },
        minItems: 1,
      },
      licenses: {
        type: "array",
        description: "자격증 목록(선택)",
        items: { type: "string" },
      },
    },
    required: ["name", "phone", "email", "address", "rows"],
    additionalProperties: false,
  };

  function json(okObj) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      body: JSON.stringify(okObj),
    };
  }

  function jsonError(rpcId, code, message) {
    return json({
      jsonrpc: "2.0",
      id: rpcId ?? null,
      error: { code, message },
    });
  }

  function validateArgs(args) {
    const missing = [];
    if (!args || typeof args !== "object") return ["name", "phone", "email", "address", "rows"];

    if (!String(args.name || "").trim()) missing.push("name");
    if (!String(args.phone || "").trim()) missing.push("phone");
    if (!String(args.email || "").trim()) missing.push("email");
    if (!String(args.address || "").trim()) missing.push("address");

    if (!Array.isArray(args.rows) || args.rows.length === 0) {
      missing.push("rows");
    } else {
      // rows 내부 필수 확인
      for (let i = 0; i < args.rows.length; i++) {
        const r = args.rows[i] || {};
        if (!String(r.date || "").trim() || !String(r.content || "").trim()) {
          // rows 항목 자체가 불완전하면 rows로 처리 (상세는 메시지로 안내)
          missing.push("rows");
          break;
        }
      }
    }
    return missing;
  }

  // --- initialize ---
  if (method === "initialize") {
    return json({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2025-11-25",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "resume-mcp", version: "1.2.0" },

        // ✅ 여기 “규칙”을 명시: 먼저 수집 → tool 호출
        instructions: [
          "당신은 이력서 양식을 자동으로 채우는 도구를 사용할 수 있다.",
          "도구 호출 전 반드시 사용자로부터 아래 필수 정보를 수집해 구조화된 JSON arguments로 만들어라:",
          "- name(성명), phone(전화), email(이메일), address(주소), rows(학력/경력 최소 1개)",
          "rows의 각 항목은 { date, content }가 필수이며 issuer는 선택이다.",
          "필수 정보가 없으면 도구를 호출하지 말고 사용자에게 누락 항목을 질문하라.",
          "필수 정보가 모이면 resume.open_editor를 호출해, 값이 채워진 편집기 링크를 제공하라.",
        ].join("\n"),
      },
    });
  }

  // --- tools/list ---
  if (method === "tools/list") {
    return json({
      jsonrpc: "2.0",
      id,
      result: {
        tools: [
          {
            name: "resume.open_editor",
            title: "이력서 편집기 열기(초안 채움)",
            description:
              "입력된 이력서 정보를 바탕으로 편집기 링크를 생성합니다. 링크를 열면 초안이 자동으로 채워져 있으며 사용자가 직접 수정/인쇄할 수 있습니다.",
            inputSchema: TOOL_SCHEMA, // ✅ required 포함
          },
        ],
      },
    });
  }

  // --- tools/call ---
  if (method === "tools/call") {
    const toolName = params?.name;
    const args = params?.arguments || {};

    if (toolName !== "resume.open_editor") {
      return jsonError(id, -32602, `Unknown tool: ${toolName}`);
    }

    // ✅ 서버 측에서 빈 {} 방지 (근본 해결)
    const missing = validateArgs(args);
    if (missing.length) {
      return jsonError(
        id,
        -32602,
        `필수 입력 누락: ${missing.join(", ")}. 사용자 정보를 먼저 수집한 뒤 다시 호출하세요. ` +
          `필수: name, phone, email, address, rows(각 row는 date+content 필수).`
      );
    }

    // base URL 구성
    const proto = event.headers["x-forwarded-proto"] || "https";
    const host = event.headers.host;
    const baseUrl = `${proto}://${host}`;

    // args(JSON)를 base64로 링크 hash에 포함 (서버 저장 없음)
    const jsonStr = JSON.stringify(args);
    const b64 = Buffer.from(jsonStr, "utf8").toString("base64");
    const url = `${baseUrl}/editor.html#data=${b64}`;

    return json({
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
    });
  }

  // --- default ---
  return jsonError(id, -32601, "Method not found");
};
