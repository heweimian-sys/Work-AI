'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, ChevronRight, Download, Search, Share2, Ship, Sparkles, X } from 'lucide-react';
import { createPoster, type Issue } from './poster';
import { Input } from '@/components/ui/input';
import { archiveIssues, dailyIssue, questions } from '@/content/site-data';

type Tab = 'overview' | 'intel';

const tabs: { id: Tab; label: string }[] = [
  { id: 'overview', label: '今日重点' },
  { id: 'intel', label: '情报全文' },
];


export default function Home() {
  const [active, setActive] = useState<Tab>('overview');
  const [query, setQuery] = useState('');
  const filteredQuestions = useMemo(() => questions.filter(x => `${x.q}${x.a}${x.topic}`.includes(query.trim())), [query]);

  return (
    <main className="reader-app min-h-screen bg-white text-[#101814]" data-version="reader-v3">
      <header className="sticky top-0 z-30 border-b border-black/10 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-[1400px] flex-wrap items-center gap-x-8 gap-y-3 px-5 py-3 lg:px-10">
          <button className="flex items-center gap-2.5 text-left" onClick={() => setActive('overview')}>
            <span className="grid size-8 place-items-center rounded-full bg-[#0f5132] text-white"><Ship className="size-4" /></span>
            <span className="font-semibold tracking-tight">抖音 CPS · 五期航海</span>
          </button>
          <nav className="order-3 flex w-full gap-1 overflow-x-auto md:order-none md:w-auto" aria-label="主要页面">
            {tabs.map(tab => <button key={tab.id} aria-current={active === tab.id ? 'page' : undefined} onClick={() => { setActive(tab.id); window.scrollTo(0, 0); }} className={`tab-button ${active === tab.id ? 'active' : ''}`}>{tab.label}</button>)}
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
  function read(id: string) { onOpen('intel'); setTimeout(() => document.getElementById(id)?.scrollIntoView({behavior:'smooth'}), 100); }
  const highlights = [
    { title: '今晚直播提前到 20:00', body: '海宇讲流量排查与实操玩法。已发过作品的船员，带上播放数据、平台提示和跳转问题。', action: '准备 1—3 条作品的数据和问题截图', target: 'day5-notices', label: '时间变化' },
    { title: '播放低，先检查再判断', body: '群内建议先看平台提示并观察约 6 小时；买药图文也有低播放成交样本，不能只用播放量判断效果。', action: '一起记录播放、提示和订单，再看处理方法', target: 'day5-highlights', label: '发布之后' },
    { title: '订单来自哪里，用推广位区分', body: '多个账号或活动共用推广位，容易分不清订单来源。推广位用于统计，不决定口令是否有效。', action: '按需要追踪的活动或账号分别建推广位', target: 'day5-resources', label: '查看结果' },
  ];
  return <div className="home-reading">
    <div className="reading-meta"><span>{dailyIssue.date} · {dailyIssue.day}</span><span>更新至 {dailyIssue.updatedAt}</span></div>
    <div className="reading-heading"><h1>今日重点</h1><button className="share-trigger" onClick={() => setShareOpen(true)}><Share2 />分享图片</button></div>
    <div className="voyage-strip"><span><b>{dailyIssue.day}</b> 航行中</span><span>当前：流量排查与订单追踪</span></div>
    <p className="reading-intro">今天先关注这三件事，遇到具体问题再读完整说明。</p>
    <section className="priority-stories" aria-label="今日重要变化">
      {highlights.map((item, index) => <article key={item.target}><p className="story-label">0{index + 1} · {item.label}</p><h2>{item.title}</h2><p>{item.body}</p><div className="next-step"><strong>你可以先做</strong><p>{item.action}</p></div><button onClick={() => read(item.target)}>查看具体说明与条件 <ArrowUpRight /></button></article>)}
    </section>
    <section className="topic-directory"><h2>继续查找</h2><p>完整保留当天的操作细节、经验和结果。</p>{dailyIssue.chapters.map(chapter => <button key={chapter.id} onClick={() => read(chapter.id)}><span>{chapter.number}</span><strong>{chapter.title.split('：').slice(1).join('：') || chapter.title}</strong><ChevronRight /></button>)}</section>
    <footer className="reading-footer">来源：本期 4 个航海群 · 本版更新至 {dailyIssue.date} {dailyIssue.updatedAt}<br/>群友实操经验保留适用条件，具体活动以平台当前页面为准。</footer>
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
  return <div className="page-enter"><section className="page-header"><p className="eyebrow">每天一期 · 根据当天群聊动态编排</p><h1 className="page-title">情报全文</h1><p>先看重点，按问题查找，再照着步骤行动。</p></section>
    <div className="subnav"><button className={mode === 'latest' ? 'active' : ''} onClick={() => setMode('latest')}>最新情报</button><button className={mode === 'archive' ? 'active' : ''} onClick={() => setMode('archive')}>往期情报 <span>Day 0—4</span></button></div>
    <div className="relative mt-7 lg:hidden"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-black/40" /><Input value={query} onChange={e => setQuery(e.target.value)} className="h-11 rounded-lg border-black/15 pl-9" placeholder="搜索问题" /></div>
    {query.trim() ? <SearchResults questions={filtered} /> : mode === 'archive' ? <Archive selected={selected} selectedDay={selectedDay} setSelectedDay={setSelectedDay} /> : <DailyMagazine />}
  </div>;
}

function DailyMagazine({ issue = dailyIssue }: { issue?: Issue }) {
  const [shareOpen, setShareOpen] = useState(false);
  return <div className="magazine-layout">
    <section className="mobile-intel-snapshot">
      <div><p>{issue.day} · {issue.date}</p><button onClick={() => setShareOpen(true)}><Share2 />分享图片</button></div>
      <h2>{issue.title}</h2>
      <p className="issue-reading-note">{issue.chapters.length} 个章节 · 含操作步骤、适用条件与来源</p>
      <div>{issue.metrics.map(item => <span key={item}>{item}</span>)}</div>
    </section>
    <details className="mobile-toc">
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
