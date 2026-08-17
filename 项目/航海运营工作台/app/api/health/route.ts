export function GET() {
  return Response.json({ ok: true, service: "voyage-ops-workbench", data_source: "d1" });
}
