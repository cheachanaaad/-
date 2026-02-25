<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>이력서 편집기</title>
<style>
  body{margin:0;font-family:"Malgun Gothic","맑은 고딕",Arial,sans-serif;background:#f4f4f4}
  .sheet{width:210mm;min-height:297mm;background:#fff;margin:20px auto;padding:20mm;box-shadow:0 8px 28px rgba(0,0,0,.12)}
  .title{text-align:center;font-size:28px;letter-spacing:15px;font-weight:bold}
  table{width:100%;border-collapse:collapse;margin-top:10px}
  th,td{border:1px solid #111;padding:6px;font-size:14px}
  th{text-align:center}
  [contenteditable]{outline:none}
  .print-btn{position:fixed;top:10px;right:10px;padding:8px 14px;background:#111;color:#fff;border:none;border-radius:6px;cursor:pointer}
</style>
</head>
<body>

<button class="print-btn" onclick="window.print()">인쇄</button>

<div class="sheet" id="resume"></div>

<script>
function esc(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}

function parseData(){
  const m = location.hash.match(/#data=([^&]+)/);
  if(!m) return {};
  try{
    return JSON.parse(decodeURIComponent(escape(atob(m[1]))));
  }catch(e){
    return {};
  }
}

function render(){
  const data = parseData();

  const rows = (data.rows || []).map(r =>
    `<tr>
      <td contenteditable="true">${esc(r.date||"")}</td>
      <td contenteditable="true">${esc(r.content||"")}</td>
      <td contenteditable="true">${esc(r.issuer||"")}</td>
    </tr>`
  ).join("");

  document.getElementById("resume").innerHTML = `
    <div class="title">이 력 서</div>

    <table>
      <tr><th>성명</th><td contenteditable="true">${esc(data.name||"")}</td></tr>
      <tr><th>주민등록번호</th><td contenteditable="true">${esc(data.rrn||"")}</td></tr>
      <tr><th>생년월일</th><td contenteditable="true">${esc(data.birth||"")}</td></tr>
      <tr><th>성별</th><td contenteditable="true">${esc(data.gender||"")}</td></tr>
      <tr><th>주소</th><td contenteditable="true">${esc(data.address||"")}</td></tr>
      <tr><th>이메일</th><td contenteditable="true">${esc(data.email||"")}</td></tr>
      <tr><th>전화</th><td contenteditable="true">${esc(data.phone||"")}</td></tr>
    </table>

    <h3>학력 및 경력사항</h3>
    <table>
      <tr><th>년월일</th><th>내용</th><th>발령청</th></tr>
      ${rows}
    </table>

    <h3>자격증</h3>
    <div contenteditable="true">${esc((data.licenses||[]).join(" / "))}</div>
  `;
}

render();
</script>
</body>
</html>
