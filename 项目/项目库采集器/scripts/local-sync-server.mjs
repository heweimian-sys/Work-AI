import http from 'node:http';
import { insert, syncFieldMapping } from '../../航海小抓/lib/bitable.js';

const PORT = 43127;
const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type','Content-Type':'application/json; charset=utf-8'};
const media = (r) => r.media || {};
function fields(r) {
  const m=media(r); const t=Date.parse(r.collected_at||'');
  return {'标题':r.title||'未命名采集内容','平台':r.platform||'unknown','作者':r.author_name||'',
    '原文链接':r.content_url||'','主题标签':(r.detail?.hashtags||[]).join(' '),
    '一句话摘要':(r.text||r.detail?.body||'').slice(0,500),'核心观点':r.detail?.body||r.text||'',
    '内容类型':`${r.platform||'unknown'} / ${r.collection_method||'chrome_extension'}`,
    '图片链接':(m.image_urls||[]).join('\n'),'视频链接':(m.video_urls||[]).join('\n'),
    '内容ID':r.content_id||'','评论':JSON.stringify(r.comments||[]),'互动数据':JSON.stringify(r.metrics||{}),
    '项目相关性':r.project_relevance||'unknown','采集时间':Number.isFinite(t)?t:null,
    '内容指纹':r.dedupe_key||r.content_id||r.content_url||'','来源可信度':r.evidence_level||'L1',
    '归档状态':r.review_status||'pending','原始记录':JSON.stringify(r)};
}
function read(req){return new Promise((resolve,reject)=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>{try{resolve(JSON.parse(b||'{}'))}catch(e){reject(e)}})})}
const server=http.createServer(async(req,res)=>{
  if(req.method==='OPTIONS'){res.writeHead(204,cors);return res.end()}
  if(req.method!=='POST'||req.url!=='/sync'){res.writeHead(404,cors);return res.end(JSON.stringify({error:'not found'}))}
  try{const body=await read(req);const records=Array.isArray(body.records)?body.records:[];await syncFieldMapping();let success=0;const errors=[];for(const r of records){try{await insert(fields(r));success++}catch(e){errors.push({record_id:r.record_id||'',message:e.message})}}res.writeHead(200,cors);res.end(JSON.stringify({success,failed:errors.length,errors}))}catch(e){res.writeHead(400,cors);res.end(JSON.stringify({error:e.message}))}
});
server.listen(PORT,'127.0.0.1',()=>console.log(`项目库本地飞书同步服务已启动: http://127.0.0.1:${PORT}`));
