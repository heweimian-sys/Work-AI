export function GET() {
  // 首版不自动发布资料；人工审核后的公开投影接入 D1 后再读取。
  return Response.json({ ok: true, voyages: [], updated_at: null });
}
