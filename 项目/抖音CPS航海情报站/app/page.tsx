'use client';

import { useMemo, useState } from 'react';
import { ArrowUpRight, Check, ChevronRight, CircleAlert, Clock3, Copy, Search, Share2, Ship, Sparkles, X } from 'lucide-react';
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
      <div><p className="eyebrow">2026 年 9 月 8 日 · 星期二</p><h1 className="page-title">今日航海概览</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-black/55">Day 4 已读取四个群 477 条当日消息。今天不是“又有人出单了”这么简单，而是减少推荐、内容耗时、口令跟单和类目选择集中碰撞的一天。</p></div>
      <div className="flex flex-wrap items-center gap-3"><div className="flex items-center gap-2 text-xs text-black/45"><span className="status-dot" />当前更新至 9 月 8 日 22:50</div><button className="share-trigger" onClick={() => setShareOpen(true)}><Share2 />分享本期情报</button></div>
    </section>

    <section className="grid border-b border-black/10 lg:grid-cols-[.7fr_1fr_1.35fr]">
      <div className="metric-cell lg:border-r"><p className="metric-label">航行进度</p><p className="status-value">Day 4</p></div>
      <div className="metric-cell lg:border-r"><p className="metric-label">当前阶段</p><p className="mt-2 text-lg font-semibold">首单验证与方法复制</p></div>
      <div className="metric-cell"><p className="metric-label">下一个关键节点</p><p className="mt-2 text-lg font-semibold">把偶然出单变成连续复现</p></div>
    </section>

    <section className="mt-10 grid gap-4 md:grid-cols-3">
      <button className="summary-card green" onClick={() => onOpen('intel')}><span className="card-icon"><CircleAlert /></span><p className="metric-label">今天最该读</p><strong>{dailyIssue.chapters.length} 个完整章节</strong><span>从主线读到战报 <ChevronRight /></span></button>
      <button className="summary-card" onClick={() => onOpen('intel')}><span className="card-icon"><Check /></span><p className="metric-label">已整理问题</p><strong>30+ 个具体回答</strong><span>减少推荐、跟单、口令都在里面 <ChevronRight /></span></button>
      <button className="summary-card" onClick={() => onOpen('intel')}><span className="card-icon"><Sparkles /></span><p className="metric-label">可复制动作</p><strong>12 个执行清单</strong><span>从今天群聊里抽出来的下一步 <ChevronRight /></span></button>
    </section>

    <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_330px] lg:gap-14">
      <section><div className="section-heading"><div><p className="section-kicker">今日简报</p><h2>航海正在发生什么</h2></div><button onClick={() => onOpen('intel')}>查看全部情报 <ArrowUpRight /></button></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <article className="brief-card"><span>01</span><h3>421 位船员跑通 0—1，但这不是终点</h3><p>今晚日志给出阶段性结果：全体 46.77% 已出首单。接下来要记录作品、推广位、播放、订单和佣金，看哪套动作能复现。</p></article>
          <article className="brief-card"><span>02</span><h3>减少推荐不能一刀切处理</h3><p>有人看到提示后仍出 2 单，也有人低播放买药出了单。群里更有效的处理方式是先看平台原因、观察 6 小时，再决定改文案、留作品或重发。</p></article>
          <article className="brief-card"><span>03</span><h3>真正拖慢执行的是“每条从零做”</h3><p>今天有人反馈单条内容要 3 小时。更可执行的办法是先做母版工程，把脚本、字幕、素材和口令检查固定下来，再做差异化替换。</p></article>
          <article className="brief-card"><span>04</span><h3>口令、密令、推广位仍是反复卡点</h3><p>今天的问题不是概念没讲过，而是到了真实发布时容易混。日报里把“单品用什么、GMV怎么看、京东怎么跟单、推广位怎么分账号”拆开写。</p></article>
        </div>
      </section>
      <aside className="timeline-panel"><div className="flex items-center justify-between"><p className="aside-title">今日更新时间轴</p><Clock3 className="size-4 text-black/35" /></div><ol className="timeline">
        <li><time>22:03</time><span>发布 Day 4 航行日志：421 人跑通首单，占 46.77%</span></li><li><time>20:40</time><span>出现减少推荐后仍出 2 单的反馈，低播放判断被重新讨论</span></li><li><time>19:52</time><span>买药图文单条 4 单，说明垂直需求不一定需要高播放</span></li><li><time>17:05</time><span>制作效率成为集中卡点，群里开始讨论母版工程和批量素材</span></li>
      </ol><div className="coverage"><strong>本版数据范围</strong><span>4 个航海群 · 477 条 Day 4 消息</span><span>9 月 8 日 00:02—22:50</span><span>已完成七类情报分配</span></div></aside>
    </div>
    {shareOpen && <ShareCard issue={dailyIssue} onClose={() => setShareOpen(false)} />}
  </div>;
}

function ShareCard({ issue, onClose }: { issue: (typeof archiveIssues)[number]; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const longText = [
    `抖音 CPS 五期航海｜${issue.day} 船员情报`,
    `${issue.date}｜更新至 ${issue.updatedAt}`,
    '', issue.title, '', issue.dek, '',
    '今天先看', ...issue.briefing.map((item, index) => `${index + 1}、${item}`), '',
    ...issue.chapters.flatMap(chapter => [
      `${chapter.number}  ${chapter.title}`, '', chapter.lead, '',
      ...chapter.sections.flatMap(section => [`▍${section.label}`, section.text, '']),
      '现在就做', ...chapter.actions.map((item, index) => `${index + 1}. ${item}`), '',
    ]),
    `信息范围：4 个航海群｜${issue.metrics[0]}｜更新至 ${issue.updatedAt}`,
    '说明：内容从群聊中提炼，已删除“收到”、表情和重复消息；个别船员经验仅作为实操样本，不视为稳定规律。'
  ].join('\n');

  async function copyLongText() { await navigator.clipboard.writeText(longText); setCopied(true); setTimeout(() => setCopied(false), 1800); }

  return <dialog open className="share-backdrop" aria-label="今日长文预览">
    <div className="share-dialog"><div className="share-toolbar"><div><strong>{issue.day} 情报 · 分享长文</strong><span>不是摘要卡，共 {issue.chapters.length} 章，复制后可直接发群</span></div><button aria-label="关闭" onClick={onClose}><X /></button></div>
      <article className="share-article">
        <header><p>抖音 CPS 五期航海 · {issue.day}</p><h2>{issue.title}</h2><div>{issue.date} · 更新至 {issue.updatedAt}</div><span>{issue.dek}</span></header>
        <section className="share-brief"><strong>今天先看</strong><ol>{issue.briefing.map((item, index) => <li key={item}><b>{index + 1}</b><span>{item}</span></li>)}</ol></section>
        {issue.chapters.map(chapter => <section className="share-section" key={chapter.id}><div className="share-section-no">{chapter.number}</div><h3>{chapter.title}</h3><p className="share-section-lead">{chapter.lead}</p>{chapter.sections.map(section => <div className="share-paragraph" key={section.label}><h4>{section.label}</h4><p>{section.text}</p></div>)}<div className="share-actions"><strong>现在就做</strong><ol>{chapter.actions.map(action => <li key={action}>{action}</li>)}</ol></div></section>)}
        <footer><strong>信息范围</strong><span>4 个航海群 · {issue.metrics[0]} · 更新至 {issue.updatedAt}</span><p>已删除“收到”、表情和重复消息；个别船员经验仅作为实操样本，不视为稳定规律。</p></footer>
      </article>
      <button className="download-card" onClick={copyLongText}><Copy />{copied ? '已复制，可以直接去分享' : '一键复制完整长文'}</button>
    </div>
  </dialog>;
}

function Intel({ query, setQuery, questions: filtered }: { query: string; setQuery: (v: string) => void; questions: typeof questions }) {
  const [mode, setMode] = useState<'latest' | 'archive'>('latest');
  const [selectedDay, setSelectedDay] = useState('day3');
  const selected = archiveIssues.find(x => x.day.toLowerCase().replace(' ', '') === selectedDay) ?? archiveIssues[0];
  return <div className="page-enter"><section className="page-header"><p className="eyebrow">每天一期 · 根据当天群聊动态编排</p><h1 className="page-title">每日情报</h1><p>从四个航海群的真实讨论中生成章节，连续读完当天进展，也可以直接查找具体问题。</p></section>
    <div className="subnav"><button className={mode === 'latest' ? 'active' : ''} onClick={() => setMode('latest')}>最新情报</button><button className={mode === 'archive' ? 'active' : ''} onClick={() => setMode('archive')}>往期情报 <span>Day 0—4</span></button></div>
    <details className="update-policy"><summary>这份情报怎样更新</summary><div><p><strong>先尽量收全：</strong>事实、具体问题、有效回答、失败过程、实操方法和真实结果，即使只出现一次也进入候选。</p><p><strong>再按当天讨论成章：</strong>不预设固定栏目，把同一问题的提问、追问、教练回答与后续验证串在一起。</p><p><strong>公开前人工核对：</strong>工作数据每 30 分钟增量拉取；公开版计划在 12:00、18:00、22:30 审核更新，不把未核验推断写成结论。</p></div></details>
    <div className="relative mt-7 lg:hidden"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-black/40" /><Input value={query} onChange={e => setQuery(e.target.value)} className="h-11 rounded-lg border-black/15 pl-9" placeholder="搜索问题" /></div>
    {mode === 'archive' ? <Archive selected={selected} selectedDay={selectedDay} setSelectedDay={setSelectedDay} /> : query.trim() ? <SearchResults questions={filtered} /> : <DailyMagazine />}
  </div>;
}

function DailyMagazine({ issue = dailyIssue }: { issue?: (typeof archiveIssues)[number] }) {
  const [shareOpen, setShareOpen] = useState(false);
  return <div className="magazine-layout">
    <aside className="magazine-index"><p className="aside-title">本期目录</p><nav>{issue.chapters.map(chapter => <a key={chapter.id} href={`#${chapter.id}`}><span>{chapter.number}</span><strong>{chapter.title}</strong><small>{chapter.count}</small></a>)}</nav><div className="coverage"><strong>本期覆盖</strong><span>4 个航海群</span><span>更新至 {issue.updatedAt}</span></div></aside>
    <article className="magazine-story">
      <header className="issue-cover"><div className="issue-cover-top"><p>{issue.day} · {issue.date}</p><button onClick={() => setShareOpen(true)}><Share2 />分享这期长文</button></div><h2>{issue.title}</h2><div className="issue-dek">{issue.dek}</div><div className="issue-metrics">{issue.metrics.map(item => <span key={item}>{item}</span>)}</div></header>
      {'lanes' in issue && <section className="mt-8 border-y border-black/10 py-7"><div className="mb-5 flex items-end justify-between gap-4"><div><p className="section-kicker">本期情报分配</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">7 类信息，一个都不漏</h2></div><span className="text-xs text-black/40">点击直达对应章节</span></div><div className="grid gap-px overflow-hidden rounded-xl border border-black/10 bg-black/10 sm:grid-cols-2 xl:grid-cols-3">{issue.lanes.map(lane => <a className="bg-white p-5 transition hover:bg-[#f3f8f5]" href={`#${lane.target}`} key={lane.kind}><div className="flex items-center justify-between gap-3"><strong className="text-sm">{lane.kind}</strong><span className="text-xs font-medium text-[#0f6b43]">{lane.count}</span></div><p className="mt-3 text-sm leading-6 text-black/55">{lane.summary}</p></a>)}</div></section>}
      <section className="issue-brief"><div><Sparkles /><span>30 秒导读</span></div><ul>{issue.briefing.map(item => <li key={item}>{item}</li>)}</ul></section>
      {issue.chapters.map(chapter => <section className="story-chapter" id={chapter.id} key={chapter.id}><div className="chapter-number">{chapter.number}</div><header><p>{chapter.count}</p><h2>{chapter.title}</h2><div className="chapter-lead">{chapter.lead}</div></header><div className="chapter-sections">{chapter.sections.map(section => <section key={section.label}><h3>{section.label}</h3><p>{section.text}</p></section>)}</div><div className="chapter-action"><span>现在可以怎么做</span><ol>{chapter.actions.map((action, index) => <li key={action}><b>{index + 1}</b>{action}</li>)}</ol></div><footer>本章来源：{chapter.sources}</footer></section>)}
      {shareOpen && <ShareCard issue={issue} onClose={() => setShareOpen(false)} />}
    </article>
  </div>;
}

function SearchResults({ questions: results }: { questions: typeof questions }) {
  return <section className="search-results"><div className="section-heading"><div><p className="section-kicker">搜索结果</p><h2>找到 {results.length} 个相关答案</h2></div></div>{results.length ? <div>{results.map(item => <article key={item.q}><span>{item.topic}</span><h3>{item.q}</h3><p>{item.a}</p><footer>{item.by} · {item.source}</footer></article>)}</div> : <p className="empty-search">没有找到相关内容，可以换一个更短的关键词。</p>}</section>;
}

function Archive({ selected, selectedDay, setSelectedDay }: { selected: (typeof archiveIssues)[number]; selectedDay: string; setSelectedDay: (id: string) => void }) {
  return <section className="full-archive"><div className="date-switcher" aria-label="往期日期">{archiveIssues.map(issue => { const id = issue.day.toLowerCase().replace(' ', ''); return <button key={id} onClick={() => setSelectedDay(id)} className={selectedDay === id ? 'active' : ''}><strong>{issue.day}</strong><span>{issue.date.replace('2026 年 ', '')}</span></button>; })}</div><DailyMagazine issue={selected} /></section>;
}
