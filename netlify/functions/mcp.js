exports.handler = async (event) => {
  const accept = (event.headers.accept||"").toLowerCase();
  if (event.httpMethod === "GET" && accept.includes("text/event-stream")) {
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
      },
      body: ":ok\n\nevent: ready\ndata: {}\n\n"
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const body = JSON.parse(event.body||"{}");
  const { id, method } = body;

  if (method === "initialize") {
    return {
      statusCode: 200,
      body: JSON.stringify({
        jsonrpc:"2.0",
        id,
        result:{
          protocolVersion:"2025-11-25",
          capabilities:{ tools:{ listChanged:false } },
          serverInfo:{ name:"resume-mcp", version:"1.0.0" }
        }
      })
    };
  }

  if (method === "tools/list") {
    return {
      statusCode: 200,
      body: JSON.stringify({
        jsonrpc:"2.0",
        id,
        result:{
          tools:[{
            name:"resume.open_editor",
            description:"이력서 편집기 링크 반환",
            inputSchema:{ type:"object" }
          }]
        }
      })
    };
  }

  if (method === "tools/call") {
    const url = `https://${event.headers.host}/editor.html`;
    return {
      statusCode: 200,
      body: JSON.stringify({
        jsonrpc:"2.0",
        id,
        result:{
          content:[{type:"text",text:`편집기 링크:\n${url}`}],
          isError:false
        }
      })
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ jsonrpc:"2.0", id, error:{ code:-32601, message:"Method not found"} })
  };
};