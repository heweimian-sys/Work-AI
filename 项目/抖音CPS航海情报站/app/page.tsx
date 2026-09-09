'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, ChevronRight, Clock3, Download, Search, Share2, Ship, Sparkles, X } from 'lucide-react';
import { createPoster, type Issue } from './poster';
import { Input } from '@/components/ui/input';
import { archiveIssues, dailyIssue, questions } from '@/content/site-data';

type Tab = 'overview' | 'intel';

const tabs: { id: Tab; label: string }[] = [
  { id: 'overview', label: '今日概览' },
  { id: 'intel', label: '每日情报' },
];


export default function Home() {
  const [active, setActive] = useState<Tab>('overview');
  const [query, setQuery] = useState('');
  const filteredQuestions = useMemo(() => questions.filter(x => `${x.q}${x.a}${x.topic}`.includes(query.trim())), [query]);

  return (
    <main className="min-h-screen bg-white text-[#101814]">
      <header className="sticky top-0 z-30 border-b border-black/10 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-[1400px] flex-wrap items-center gap-x-8 gap-y-3 px-5 py-3 lg:px-10">
          <button className="flex items-center gap-2.5 text-left" onClick={() => setActive('overview')}>
            <span className="grid size-8 place-items-center rounded-full bg-[#0f5132] text-white"><Ship className="size-4" /></span>
            <span className="font-semibold tracking-tight">抖音 CPS · 五期航海</span>
          </button>
          <nav className="order-3 flex w-full gap-1 overflow-x-auto md:order-none md:w-auto" aria-label="主要页面">
            {tabs.map(tab => <button key={tab.id} onClick={() => setActive(tab.id)} className={`tab-button ${active === tab.id ? 'active' : ''}`}>{tab.label}</button>)}
          </nav>
          <div className="relative ml-auto hidden w-[290px] lg:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-black/40" />
            <Input value={query} onChange={e => setQuery(e.target.value)} onFocus={() => setActive('intel')} className="h-10 rounded-lg border-black/15 bg-white pl-9 shadow-none" placeholder="搜索密令、平台操作、制作…" />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1400px] px-5 pb-24 pt-8 lg:px-10 lg:pt-12">
        {active === 'overview' && <Overview onOpen={setActive} />}
        {active === 'intel' && <Intel query={query} setQuery={setQuery} questions={filteredQuestions} />}
      </div>
    </main>
  );
}

function Overview({ onOpen }: { onOpen: (tab: Tab) => void }) {
  const [shareOpen, setShareOpen] = useState(false);
  return <div className="page-enter">
    <section className="flex flex-wrap items-end justify-between gap-6 border-b border-black/10 pb-7">
      <div><p className="eyebrow">2026 年 9 月 9 日 · 星期三</p><h1 className="page-title">今日航海概览</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-black/55">今晚 20:00 直播讲流量排查。已经发布内容的船员，先准备作品数据和平台提示；遇到跳转、低播放或订单归因问题，可以按下面的专题查找。</p></div>
      <div className="flex flex-wrap items-center gap-3"><div className="flex items-center gap-2 text-xs text-black/45"><span className="status-dot" />当前更新至 9 月 9 日 17:42</div><button className="share-trigger" onClick={() => setShareOpen(true)}><Share2 />分享本期情报</button></div>
    </section>

    <section className="grid border-b border-black/10 lg:grid-cols-[.7fr_1fr_1.35fr]">
      <div className="metric-cell lg:border-r"><p className="metric-label">航行进度</p><p className="status-value">Day 5</p></div>
      <div className="metric-cell lg:border-r"><p className="metric-label">当前阶段</p><p className="mt-2 text-lg font-semibold">流量排查与链路归因</p></div>
      <div className="metric-cell"><p className="metric-label">下一个关键节点</p><p className="mt-2 text-lg font-semibold">今晚 20:00 高手领航直播</p></div>
    </section>

    <section className="overview-topics"><p className="section-kicker">按你现在遇到的事，直接开始</p>{dailyIssue.chapters.map(chapter => <button key={chapter.id} onClick={() => { onOpen('intel'); setTimeout(() => document.getElementById(chapter.id)?.scrollIntoView({behavior: 'smooth'}), 80); }}><span>{chapter.number}</span><div><strong>{chapter.title}</strong><p>{chapter.actions[0]}</p></div><ChevronRight /></button>)}</section>

    <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_330px] lg:gap-14">
      <section><div className="section-heading"><div><p className="section-kicker">今日简报</p><h2>航海正在发生什么</h2></div><button onClick={() => onOpen('intel')}>查看全部情报 <ArrowUpRight /></button></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <article className="brief-card"><span>01</span><h3>第二次高手领航提前到今晚</h3><p>9 月 9 日 20:00 企业微信直播，海宇分享“流量排查思路与实操玩法”。今天最好带着自己的作品数据、平台提示和口令跳转问题去听。</p></article>
          <article className="brief-card"><span>02</span><h3>减少推荐今天有了更细的处理法</h3><p>第三方引导提示不等于封号；买药个位数播放也可能成交。先看提示原因、观察 6 小时，再决定是否隐藏或改新内容。</p></article>
          <article className="brief-card"><span>03</span><h3>口令密令不只是“放进去”</h3><p>京东密令可以叠加使用；作品描述里的口令要放最前面；万能转链可以反复生成；推广位负责区分活动和账号数据。</p></article>
          <article className="brief-card"><span>04</span><h3>素材和文案要开始去 AI 味、去同质化</h3><p>对标文案不能直接照搬，优惠数字要回会场核验，平台 logo/红包/搜索等画面元素要打码或换代称，素材最好自己截取。</p></article>
        </div>
      </section>
      <aside className="timeline-panel"><div className="flex items-center justify-between"><p className="aside-title">今日更新时间轴</p><Clock3 className="size-4 text-black/35" /></div><ol className="timeline">
        <li><time>17:42</time><span>确认目前没有统一外卖密令，可在推广活动生成外卖口令</span></li><li><time>17:20</time><span>多活动归因方案确认：按活动或账号单独建推广位</span></li><li><time>14:19</time><span>前两次直播已放到高手领航入口，后续回放一般 1—2 天上传</span></li><li><time>12:58</time><span>今晚 20:00 第二次高手领航直播，主题为流量排查</span></li>
      </ol><div className="coverage"><strong>本版数据范围</strong><span>4 个航海群 · 9 月 8 日后增量</span><span>更新至 9 月 9 日 17:42</span><span>已完成七类情报分配</span></div></aside>
    </div>
    {shareOpen && <ShareCard issue={dailyIssue} onClose={() => setShareOpen(false)} />}
  </div>;
}

function ShareCard({ issue, onClose }: { issue: Issue; onClose: () => void }) {
  const [poster, setPoster] = useState<{url: string; blob: Blob} | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false, url = '';
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', escape);
    createPoster(issue).then(blob => {
      if (cancelled) return;
      url = URL.createObjectURL(blob); setPoster({url, blob});
    }).catch(() => setError('图片生成失败，请关闭后重试。'));
    return () => { cancelled = true; URL.revokeObjectURL(url); document.body.style.overflow = previous; document.removeEventListener('keydown', escape); };
  }, [issue]);
  async function shareImage() {
    if (!poster) return;
    const file = new File([poster.blob], `航海情报-${issue.day}.png`, {type: 'image/png'});
    try {
      if (navigator.canShare?.({files: [file]})) await navigator.share({files: [file], title: `${issue.day} 航海情报`});
      else setError('此浏览器不支持直接分享，请保存图片后在微信发送。');
    } catch (e) { if (!(e instanceof Error && e.name === 'AbortError')) setError('请保存图片后发送，或长按图片保存。'); }
  }
  return <dialog open className="share-backdrop" aria-modal="true" aria-label="完整情报长图">
    <div className="share-dialog">
      <div className="share-toolbar"><div><strong>{issue.day} · 完整情报长图</strong><span>预览即下载的图片，包含本期全部章节。手机可长按保存。</span></div><button autoFocus aria-label="关闭" onClick={onClose}><X /></button></div>
      <div className="share-actions-row">
        {poster && <a className="download-card primary" href={poster.url} download={`航海情报-${issue.day}.png`}><Download />保存完整图片</a>}
        {poster && <button className="download-card secondary" onClick={shareImage}><Share2 />分享图片</button>}
      </div>
      {error && <p role="alert">{error}</p>}
      {poster ? <img className="full-poster" src={poster.url} alt={`${issue.day} 完整情报，包含全部章节和操作建议`} /> : <p role="status" className="poster-loading">正在排版完整长图…</p>}
    </div>
  </dialog>;
}

function Intel({ query, setQuery, questions: filtered }: { query: string; setQuery: (v: string) => void; questions: typeof questions }) {
  const [mode, setMode] = useState<'latest' | 'archive'>('latest');
  const [selectedDay, setSelectedDay] = useState(archiveIssues[0].day.toLowerCase().replace(' ', ''));
  const selected = archiveIssues.find(x => x.day.toLowerCase().replace(' ', '') === selectedDay) ?? archiveIssues[0];
  return <div className="page-enter"><section className="page-header"><p className="eyebrow">每天一期 · 根据当天群聊动态编排</p><h1 className="page-title">每日情报</h1><p>先看重点，按问题查找，再照着步骤行动。</p></section>
    <div className="subnav"><button className={mode === 'latest' ? 'active' : ''} onClick={() => setMode('latest')}>最新情报</button><button className={mode === 'archive' ? 'active' : ''} onClick={() => setMode('archive')}>往期情报 <span>Day 0—4</span></button></div>
    <div className="relative mt-7 lg:hidden"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-black/40" /><Input value={query} onChange={e => setQuery(e.target.value)} className="h-11 rounded-lg border-black/15 pl-9" placeholder="搜索问题" /></div>
    {mode === 'archive' ? <Archive selected={selected} selectedDay={selectedDay} setSelectedDay={setSelectedDay} /> : query.trim() ? <SearchResults questions={filtered} /> : <DailyMagazine />}
  </div>;
}

function DailyMagazine({ issue = dailyIssue }: { issue?: Issue }) {
  const [shareOpen, setShareOpen] = useState(false);
  return <div className="magazine-layout">
    <section className="mobile-intel-snapshot">
      <div><p>{issue.day} · {issue.date}</p><button onClick={() => setShareOpen(true)}><Share2 />分享图片</button></div>
      <h2>{issue.title}</h2>
      <ul>{issue.briefing.slice(0, 3).map(item => <li key={item}>{item}</li>)}</ul>
      <div>{issue.metrics.map(item => <span key={item}>{item}</span>)}</div>
    </section>
    <details className="mobile-toc" open>
      <summary>按问题找章节</summary>
      <nav>{issue.chapters.map(chapter => <a key={chapter.id} href={`#${chapter.id}`}><span>{chapter.number}</span><strong>{chapter.title}</strong><small>{chapter.count}</small></a>)}</nav>
    </details>
    <aside className="magazine-index"><p className="aside-title">本期目录</p><nav>{issue.chapters.map(chapter => <a key={chapter.id} href={`#${chapter.id}`}><span>{chapter.number}</span><strong>{chapter.title}</strong><small>{chapter.count}</small></a>)}</nav><div className="coverage"><strong>本期覆盖</strong><span>4 个航海群</span><span>更新至 {issue.updatedAt}</span></div></aside>
    <article className="magazine-story">
      <header className="issue-cover"><div className="issue-cover-top"><p>{issue.day} · {issue.date}</p><button onClick={() => setShareOpen(true)}><Share2 />分享这期图片</button></div><h2>{issue.title}</h2><div className="issue-dek">{issue.dek}</div><div className="issue-metrics">{issue.metrics.map(item => <span key={item}>{item}</span>)}</div></header>
      {'lanes' in issue && <section className="lane-section mt-8 border-y border-black/10 py-7"><div className="mb-5 flex items-end justify-between gap-4"><div><p className="section-kicker">本期情报分配</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">本期阅读目录</h2></div><span className="text-xs text-black/40">点击直达对应章节</span></div><div className="grid gap-px overflow-hidden rounded-xl border border-black/10 bg-black/10 sm:grid-cols-2 xl:grid-cols-3">{issue.lanes.map(lane => <a className="bg-white p-5 transition hover:bg-[#f3f8f5]" href={`#${lane.target}`} key={lane.kind}><div className="flex items-center justify-between gap-3"><strong className="text-sm">{lane.kind}</strong><span className="text-xs font-medium text-[#0f6b43]">{lane.count}</span></div><p className="mt-3 text-sm leading-6 text-black/55">{lane.summary}</p></a>)}</div></section>}
      <section className="issue-brief"><div><Sparkles /><span>30 秒导读</span></div><ul>{issue.briefing.map(item => <li key={item}>{item}</li>)}</ul></section>
      {issue.chapters.map(chapter => <section className="story-chapter" id={chapter.id} key={chapter.id}><div className="chapter-number">{chapter.number}</div><header><h2>{chapter.title}</h2><div className="chapter-lead">{chapter.lead}</div></header><div className="chapter-action"><span>接下来怎么做</span><ol>{chapter.actions.map((action, index) => <li key={action}><b>{index + 1}</b>{action}</li>)}</ol></div><details className="chapter-detail" open><summary>具体说明与适用条件 · {chapter.sections.length} 项</summary><div className="chapter-sections">{chapter.sections.map(section => <section key={section.label}><h3>{section.label}</h3><p>{section.text}</p></section>)}</div></details><footer>本章来源：{chapter.sources}</footer></section>)}

      {shareOpen && <ShareCard issue={issue} onClose={() => setShareOpen(false)} />}
    </article>
  </div>;
}

function SearchResults({ questions: results }: { questions: typeof questions }) {
  return <section className="search-results"><div className="section-heading"><div><p className="section-kicker">搜索结果</p><h2>找到 {results.length} 个相关答案</h2></div></div>{results.length ? <div>{results.map(item => <article key={item.q}><span>{item.topic}</span><h3>{item.q}</h3><p>{item.a}</p><footer>{item.by} · {item.source}</footer></article>)}</div> : <p className="empty-search">没有找到相关内容，可以换一个更短的关键词。</p>}</section>;
}

function Archive({ selected, selectedDay, setSelectedDay }: { selected: Issue; selectedDay: string; setSelectedDay: (id: string) => void }) {
  return <section className="full-archive"><div className="date-switcher" aria-label="往期日期">{archiveIssues.map(issue => { const id = issue.day.toLowerCase().replace(' ', ''); return <button key={id} onClick={() => setSelectedDay(id)} className={selectedDay === id ? 'active' : ''}><strong>{issue.day}</strong><span>{issue.date.replace('2026 年 ', '')}</span></button>; })}</div><DailyMagazine issue={selected} /></section>;
}
