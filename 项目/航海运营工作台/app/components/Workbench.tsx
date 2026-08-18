"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Action, DashboardData, GoodNews, Group, Project, repository } from "../lib/data";

type PageKey = "overview" | "project" | "good-news" | "actions" | "reports" | "groups" | "evidence";

const nav: { key: PageKey; label: string; path: string }[] = [
  { key: "overview", label: "运营总览", path: "/" },
  { key: "project", label: "项目驾驶舱", path: "/project-dashboard" },
  { key: "good-news", label: "航海好事", path: "/good-news" },
  { key: "actions", label: "今日行动", path: "/actions" },
  { key: "reports", label: "日报中心", path: "/reports" },
  { key: "groups", label: "群组观察", path: "/groups" },
  { key: "evidence", label: "资料与证据", path: "/evidence" },
];

export function Workbench({ initialPage = "overview" }: { initialPage?: PageKey }) {
  const [page, setPage] = useState<PageKey>(initialPage);
  const [mode, setMode] = useState<"demo" | "api">("api");
  const data = repository.getDashboardData(mode);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">航海运营工作台</div>
        <nav>
          {nav.map((item) => (
            <a
              className={`nav-item ${item.key === page ? "active" : ""}`}
              href={item.path}
              key={item.key}
              onClick={(event) => {
                event.preventDefault();
                window.history.pushState(null, "", item.path);
                setPage(item.key);
              }}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="sidebar-note">Demo / API 双模式 · 好事优先</div>
      </aside>
      <section className="workspace">
        <Topbar data={data} mode={mode} setMode={setMode} page={page} />
        {page === "overview" && <Overview data={data} go={setPage} />}
        {page === "project" && <ProjectDashboard data={data} />}
        {page === "good-news" && <GoodNewsPage data={data} />}
        {page === "actions" && <ActionsPage data={data} />}
        {page === "reports" && <ReportsPage data={data} />}
        {page === "groups" && <GroupsPage data={data} />}
        {page === "evidence" && <EvidencePage data={data} />}
      </section>
    </main>
  );
}

function Topbar({ data, mode, setMode, page }: { data: DashboardData; mode: "demo" | "api"; setMode: (mode: "demo" | "api") => void; page: PageKey }) {
  const titles: Record<PageKey, [string, string]> = {
    overview: ["运营总览", "今天最值得关注的航海动态"],
    project: ["项目驾驶舱", "项目进展、结果与风险"],
    "good-news": ["航海好事", "看见船员拿到的真实结果"],
    actions: ["今日行动", "把判断转成可执行的下一步"],
    reports: ["日报中心", "确认每日分析，沉淀好事与行动"],
    groups: ["群组观察", "发现活跃、风险与潜在好事"],
    evidence: ["资料与证据", "让每条判断都能回到原始记录"],
  };
  return (
    <header className="topbar">
      <div>
        <h1>{titles[page][0]}</h1>
        <p>{titles[page][1]}</p>
      </div>
      <div className="top-actions">
        <button className="date-button">{data.date}⌄</button>
        <div className="mode-switch">
          <button className={mode === "demo" ? "active" : ""} onClick={() => setMode("demo")}>Demo</button>
          <button className={mode === "api" ? "active" : ""} onClick={() => setMode("api")}>API</button>
        </div>
        <span className="demo-badge">{mode === "demo" ? "演示数据" : "接口模式"}</span>
      </div>
    </header>
  );
}

function Overview({ data, go }: { data: DashboardData; go: (page: PageKey) => void }) {
  const hero = data.goodNews[0];
  return (
    <div className="page-stack">
      <MetricGrid metrics={[
        ["真实记录", modeValue(data.mode, "87,331", "18"), "gold"],
        ["覆盖群组", modeValue(data.mode, "51", "6"), "orange"],
        ["好事候选", modeValue(data.mode, "30", "3"), "blue"],
        ["已确认公开", modeValue(data.mode, "0", "2"), "red"],
      ]} />
      <div className="overview-grid">
        <Card className="span-2">
          <h2>今日航海好事</h2>
          {hero ? <article className="hero-good">
            <div>
              <h3>{hero.summary}</h3>
              <div className="meta-grid">
                <span>来源/群组：{hero.project} {hero.group}</span>
                <span>参与者：{hero.sailor}</span>
                <span>可信度：{hero.confidence}%</span>
                <span>证据 ID：{hero.evidence_ids.join("、")}</span>
              </div>
            </div>
            <div className="button-row">
              <button className="ghost" onClick={() => go("evidence")}>查看证据</button>
              <button onClick={() => go("actions")}>创建跟进</button>
            </div>
          </article> : <div className="empty-state"><h3>真实资料已完成首轮聚合</h3><p>已解析 87,331 条记录、覆盖 51 个群组；30 条好事候选正在去重和核验，暂不公开原始内容。</p></div>}
          <DataTable headers={["项目", "原始总结（摘要）", "类型", "状态"]} rows={data.goodNews.slice(1).map((g) => [g.project, g.summary, <Tag key={g.good_news_id} tone="mint">{g.type}</Tag>, <Tag key={`${g.good_news_id}-s`} tone={g.status.includes("待") ? "orange" : "green"}>{g.status}</Tag>])} />
          <button className="link-button" onClick={() => go("good-news")}>查看候选列表 ›</button>
        </Card>
        <aside className="side-stack">
          <Card>
            <h2>近7天好事趋势</h2>
            <LineChart data={data.trends.map((t) => ({ label: t.date, value: t.goodNews }))} color="#B88934" />
            <div className="tag-row">
              <Tag tone="mint">完成作品</Tag><Tag tone="gold">出单成交</Tag><Tag tone="purple">突破卡点</Tag>
            </div>
          </Card>
          <Card>
            <h2>今天需要处理</h2>
            {[
              ["6 条待跟进好事", "及时跟进，帮助航海家沉淀价值"],
              ["3 条待确认日报", "确认日报，支持复盘与迭代"],
              ["2 个高风险项目", "关注风险，协助项目平稳推进"],
            ].map((item) => <ActionSummary key={item[0]} title={item[0]} text={item[1]} onClick={() => go("actions")} />)}
          </Card>
        </aside>
      </div>
      <Card>
        <h2>项目状态</h2>
        <div className="project-strip">
          {data.projects.map((project) => <ProjectMini key={project.project_id} project={project} />)}
        </div>
      </Card>
    </div>
  );
}

function modeValue(mode: Mode, apiValue: string, demoValue: string) {
  return mode === "api" ? apiValue : demoValue;
}

function ProjectDashboard({ data }: { data: DashboardData }) {
  const [selected, setSelected] = useState(data.projects[0].project_id);
  const project = data.projects.find((p) => p.project_id === selected) ?? data.projects[0];
  const projectGoods = data.goodNews.filter((g) => g.project_id === project.project_id);
  return (
    <div className="page-stack">
      <div className="inline-title-control"><select value={selected} onChange={(e) => setSelected(e.target.value as Project["project_id"])}>{data.projects.map((p) => <option key={p.project_id} value={p.project_id}>{p.name}</option>)}</select></div>
      <MetricGrid metrics={[
        ["当前阶段", project.stage, "gold"],
        ["项目状态", project.status, "green"],
        ["今日好事", String(project.todayGoodNews), "gold"],
        ["待处理行动", String(project.actions), "blue"],
        ["群聊覆盖", project.coverage, "orange"],
      ]} compact />
      <div className="two-col">
        <Card><h2>今日项目判断</h2><Judgement /></Card>
        <Card><h2>群聊趋势</h2><LineChart data={data.trends.map((t) => ({ label: t.date, value: t.activeGroups }))} color="#237B69" /><div className="chart-legend"><span>活跃群 6</span><span>低活跃群 2</span></div></Card>
      </div>
      <div className="project-main-grid">
        <Card className="span-2"><h2>本项目航海好事</h2><GoodNewsTable goods={projectGoods.length ? projectGoods : data.goodNews} /></Card>
        <Card><h2>高频讨论</h2><BarList items={data.topics} /></Card>
        <Card className="project-progress"><h2>用户进展</h2><Funnel /></Card>
      </div>
      <div className="two-col">
        <Card><h2>风险与异常</h2><DataTable headers={["风险描述", "严重度", "证据", "负责人"]} rows={[["2 个低活跃群连续两天无有效反馈", <Tag key="r1" tone="red">高</Tag>, "EV-0807, EV-0812", "航海家_小满"], ["部分船员发布内容疑似搬运", <Tag key="r2" tone="orange">中</Tag>, "EV-0803", "内容管理员"], ["1 名船员成交数据未提供证据截图", <Tag key="r3" tone="mint">低</Tag>, "EV-0815", "运营小助手"]]} /></Card>
        <Card><h2>运营行动建议</h2><DataTable headers={["优先级", "行动建议", "负责人", "状态"]} rows={data.actions.slice(0, 3).map((a) => [<Tag key={a.action_id} tone={a.priority === "P1" ? "red" : "orange"}>{a.priority}</Tag>, a.suggestion, a.owner, <Tag key={`${a.action_id}-s`} tone="mint">{a.status}</Tag>])} /></Card>
      </div>
      <Card className="folded">数据覆盖与最新待确认日报⌄</Card>
    </div>
  );
}

function GoodNewsPage({ data }: { data: DashboardData }) {
  const [selected, setSelected] = useState<GoodNews>(data.goodNews[0]);
  return (
    <div className="page-stack">
      <FilterBar labels={["全部项目", "全部类型", "可信度", "时间范围", "搜索船员或原文"]} action="导出好事" />
      <MetricGrid metrics={[["今日好事", "18", "gold"], ["近7天好事", "96", "gold"], ["拿到结果", "41", "gold"], ["待核实", "6", "orange"], ["可对外传播", "12", "blue"]]} compact />
      <div className="three-col">
        <Card><h2>近7天好事趋势</h2><LineChart data={data.trends.map((t) => ({ label: t.date, value: t.goodNews }))} color="#B88934" /></Card>
        <Card><h2>好事类型分布</h2><BarList items={[{ name: "完成作品", count: 28 }, { name: "出单/成交", count: 21 }, { name: "突破卡点", count: 17 }, { name: "涨粉", count: 13 }, { name: "获得客户", count: 9 }]} /></Card>
        <Card><h2>项目分布</h2><BarList items={[{ name: "小红书实战营", count: 68 }, { name: "视频号实战营", count: 42 }, { name: "私域增长训练营", count: 28 }, { name: "知识星球运营营", count: 18 }]} /><p className="insight">小红书实战营今日新增最多</p></Card>
      </div>
      <div className="detail-grid">
        <Card><h2>最新好事</h2><GoodNewsTable goods={data.goodNews} onSelect={setSelected} selected={selected.good_news_id} /><button className="link-button">查看更多 ›</button></Card>
        <GoodNewsDetail item={selected} />
      </div>
    </div>
  );
}

function ActionsPage({ data }: { data: DashboardData }) {
  const [selected, setSelected] = useState<Action>(data.actions[0]);
  return (
    <div className="page-stack">
      <FilterBar labels={["全部项目", "全部负责人", "全部来源", "优先级", "状态", "搜索问题或行动"]} action="新建行动" />
      <MetricGrid metrics={[["待处理", "8", "orange"], ["今日到期", "5", "orange"], ["高优先级", "3", "red"], ["已完成", "12", "green"], ["来自航海好事", "4", "gold"]]} compact />
      <div className="detail-grid">
        <Card>
          <h2>行动队列</h2>
          <ActionGroup title="立即处理" actions={data.actions.slice(0, 3)} onSelect={setSelected} />
          <ActionGroup title="今天完成" actions={data.actions.slice(3, 5)} onSelect={setSelected} />
          <ActionGroup title="本周跟进" actions={data.actions.slice(5)} onSelect={setSelected} />
          <h2 className="section-gap">今日已完成</h2>
          <DataTable headers={["项目", "问题", "建议动作", "来源", "负责人", "完成时间", "状态"]} rows={[["小红书实战营 3 期", "首个资料包支付确认", "已确认资料包并发放", <Tag key="s1" tone="mint">航海好事</Tag>, "航海家_小满", "10:12", <Tag key="d1" tone="green">已完成</Tag>]]} />
        </Card>
        <aside className="side-stack">
          <Card><h2>今日完成进度</h2><Donut value={60} label="12/20" /><Workload /></Card>
          <Card><h2>行动来源</h2><SourceList /></Card>
          <ActionDetail action={selected} />
        </aside>
      </div>
    </div>
  );
}

function ReportsPage({ data }: { data: DashboardData }) {
  const selected = data.reports[0];
  return (
    <div className="page-stack">
      <FilterBar labels={["全部项目", "日报状态", "数据状态", "时间范围", "搜索项目或群组"]} action="生成今日日报" />
      <MetricGrid metrics={[["待确认日报", "3", "blue"], ["已确认日报", "24", "green"], ["今日提取好事", "18", "gold"], ["今日生成行动", "8", "orange"], ["数据异常", "1", "red"]]} compact />
      <div className="reports-grid">
        <Card><h2>日报列表</h2><ReportList reports={data.reports} /></Card>
        <Card><h2>日报预览</h2><ReportPreview report={selected} /></Card>
        <Card><h2>确认信息</h2><InfoList items={[["日报状态", "待确认"], ["request_id", selected.request_id], ["project_id", selected.project_id], ["覆盖群组", selected.coverage], ["原始记录数", String(selected.raw)], ["去重后记录数", String(selected.deduped)], ["数据更新时间", selected.updatedAt], ["数据状态", selected.dataStatus]]} /><div className="warning">发现问题：缺少 1 个群数据（9群-成长营）</div><button>确认日报</button><button className="ghost full">退回补充</button><div className="confirm-result"><span>好事入库 <b>6</b></span><span>行动入队 <b>3</b></span></div></Card>
      </div>
      <Card className="folded">技术字段与处理记录⌄</Card>
    </div>
  );
}

function GroupsPage({ data }: { data: DashboardData }) {
  const selected = data.groups[0];
  return (
    <div className="page-stack">
      <FilterBar labels={["全部项目", "全部群组", "活跃等级", "数据状态", "近7天（8/11 - 8/17）"]} />
      <MetricGrid metrics={[["今日消息", "1245", "blue"], ["活跃群", "21", "green"], ["覆盖群", "25 / 29", "blue"], ["提问求助", "136", "blue"], ["无互动群", "4", "red"], ["潜在好事", "9", "gold"]]} compact />
      <div className="groups-main-grid">
        <Card className="span-2"><h2>消息量与互动趋势</h2><LineChart data={data.trends.map((t) => ({ label: t.date, value: t.messages }))} color="#397AA8" /></Card>
        <aside className="side-stack">
          <Card><h2>活跃群排行 TOP5</h2><RankList groups={data.groups.slice(0, 5)} /></Card>
          <Card><h2>风险群排行 TOP5</h2><RankList groups={data.groups.filter((g) => g.riskReason || g.status === "无互动")} risk /></Card>
        </aside>
      </div>
      <div className="two-col wide-left">
        <Card><h2>群组状态列表</h2><DataTable headers={["项目/群组", "今日消息", "有效互动", "提问", "好事线索", "活跃状态", "数据状态", "操作"]} rows={data.groups.map((g) => [`${g.project} · ${g.group}`, g.messages, g.interactions, g.questions, g.leads, <Tag key={g.group_id} tone={g.status === "无互动" ? "red" : g.status === "低活跃" ? "orange" : "mint"}>{g.status}</Tag>, <Tag key={`${g.group_id}-d`} tone={g.dataStatus === "未覆盖" ? "red" : "green"}>{g.dataStatus}</Tag>, "查看"])} /></Card>
        <Card><h2>选中群组详情 <span className="pill">{selected.status}</span></h2><InfoList items={[["今日消息", String(selected.messages)], ["有效互动", String(selected.interactions)], ["提问求助", String(selected.questions)], ["好事线索", String(selected.leads)], ["覆盖状态", selected.dataStatus]]} /><h3>未解决提问</h3><ul className="bullet-list"><li>笔记流量突然下降怎么办？</li><li>如何判断选题有没有市场？</li></ul><h3>潜在好事线索</h3><div className="lead-card">学员分享爆款笔记拆解方法，可信度 88%，证据 EV-1012</div><button className="ghost full">识别为航海好事</button><button>创建行动</button></Card>
      </div>
      <Card><h2>缺失群与覆盖说明</h2><div className="coverage">计划群 29　已覆盖群 25　缺失群 4　数据更新于 8月17日 10:30</div></Card>
    </div>
  );
}

function EvidencePage({ data }: { data: DashboardData }) {
  const selected = data.evidence[0];
  const sourceRows = [
    ["微信群聊", "08-17 09:35", "正常", "监控 126 个群组，近 7 天消息已覆盖"],
    ["飞书文档", "08-17 09:28", "正常", "同步 42 个文档空间，近 30 天内容已覆盖"],
    ["飞书表格", "08-17 09:30", "正常", "同步 18 个表格，近 30 天数据已覆盖"],
    ["小红书", "08-17 09:31", "正常", "监控 32 个账号，近 7 天笔记与评论已覆盖"],
    ["知识星球", "08-17 09:24", "正常", "监控 28 个星球，近 7 天内容已覆盖"],
    ["群聊监控", "08-17 09:33", "缺少群组授权", "监控 96 个关键词，近 7 天消息已覆盖"],
    ["手动上传", "08-17 09:15", "正常", "人工上传的资料按时间戳纳入覆盖"],
  ];
  return (
    <div className="page-stack">
      <FilterBar labels={["全部项目", "资料类型", "关联对象", "核实状态", "时间范围", "搜索证据编号或原文"]} action="同步数据" />
      <MetricGrid metrics={[["证据记录", "18432", "blue"], ["今日新增", "286", "orange"], ["已关联好事", "96", "gold"], ["已关联行动", "38", "blue"], ["待核实", "12", "red"], ["数据源", "7", "purple"]]} compact />
      <section className="evidence-workspace">
        <div className="evidence-list-pane">
          <div className="evidence-tabs">
            {["全部", "好事证据", "行动证据", "日报证据", "未关联"].map((tab, index) => <button className={index === 0 ? "active" : ""} key={tab}>{tab}</button>)}
          </div>
          <DataTable headers={["证据编号", "来源", "项目/群组", "原文摘要", "关联对象", "核实状态", "时间", "操作"]} rows={data.evidence.map((e) => [e.evidence_id, e.source, `${e.project} ${e.group}`, e.summary, e.related, <Tag key={`${e.evidence_id}-trust`} tone={e.trust === "已核实" ? "blue" : "red"}>{e.trust}</Tag>, e.time, <button className="text-action" key={`${e.evidence_id}-view`}>查看</button>])} />
          <div className="pagination">共 18432 条　1 2 3 4 5 ... 1540　20 条/页</div>
        </div>
        <aside className="evidence-detail-pane">
          <header className="detail-heading">
            <h2>证据详情</h2>
            <span>{selected.evidence_id}</span>
          </header>
          <div className="detail-meta">
            <span>来源：群聊原文（{selected.project} {selected.group}）</span>
            <span>采集时间：2025-08-17 09:41:23</span>
          </div>
          <h3>原文</h3>
          <div className="quote">{selected.raw}</div>
          <h3>原始截图</h3>
          <div className="screenshot-mock">第一个资料包成交，收到 128 元<br />+128.00</div>
          <div className="detail-fields">
            <span>好事类型 <b>出单成交</b></span>
            <span>金额 <b>128 元</b></span>
            <span>可信度 <b>92%</b></span>
            <span>核实状态 <b>已核实</b></span>
          </div>
          <div className="detail-split">
            <div>
              <h3>关联实体</h3>
              <InfoList items={[["good_news_id", selected.good_news_id ?? "-"], ["project_id", selected.project_id], ["group_id", selected.group_id], ["request_id", selected.request_id]]} />
            </div>
            <div>
              <h3>核实历史</h3>
              <InfoList items={[["已核实", "航海运营_小源 · 2025-08-17 10:12:03"], ["待核实", "系统采集 · 2025-08-17 09:41:23"]]} />
            </div>
          </div>
          <div className="button-row bottom">
            <button className="ghost">标记已核实</button>
            <button>关联到好事</button>
          </div>
        </aside>
      </section>
      <section className="flat-section">
        <h2>数据源与覆盖</h2>
        <DataTable headers={["数据源", "最近同步", "状态", "覆盖说明"]} rows={sourceRows.map(([source, syncedAt, status, coverage]) => [source, syncedAt, <Tag key={source} tone={status === "正常" ? "blue" : "orange"}>{status}</Tag>, coverage])} />
        <button className="link-button technical-link">查看技术状态与任务记录</button>
      </section>
    </div>
  );
}

function MetricGrid({ metrics, compact = false }: { metrics: [string, string, string][]; compact?: boolean }) {
  return <section className={`metric-band ${compact ? "compact" : ""}`}>{metrics.map(([label, value, tone]) => {
    const isTextValue = /[\u4e00-\u9fa5]/.test(value) || value.length > 4;
    return <div className={`metric-item ${tone}`} key={label}><small>{label}</small><strong className={isTextValue ? "text-value" : ""}>{value}</strong></div>;
  })}</section>;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

function DataTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return <table className="data-table"><thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table>;
}

function GoodNewsTable({ goods, onSelect, selected }: { goods: GoodNews[]; onSelect?: (item: GoodNews) => void; selected?: string }) {
  return <DataTable headers={["时间", "项目/群组", "船员", "原文摘要", "好事类型", "可信度", "证据", "跟进"]} rows={goods.map((g) => [
    g.time, `${g.project} ${g.group}`, g.sailor, <button className={`row-button ${selected === g.good_news_id ? "selected" : ""}`} onClick={() => onSelect?.(g)} key={g.good_news_id}>{g.summary}</button>, <Tag key={`${g.good_news_id}-type`} tone="gold">{g.type}</Tag>, <Confidence key={`${g.good_news_id}-c`} value={g.confidence} />, <a key={`${g.good_news_id}-e`} href="/evidence">{g.evidence_ids[0]}</a>, <Tag key={`${g.good_news_id}-s`} tone={g.status.includes("待") ? "orange" : "green"}>{g.status}</Tag>
  ])} />;
}

function GoodNewsDetail({ item }: { item: GoodNews }) {
  return <Card><h2>好事详情</h2><h3>原文摘要</h3><p>{item.summary}</p><h3>识别结果</h3><p>{item.type}</p><div className="split"><span>证据编号<br /><b>{item.evidence_ids.join("、")}</b></span><span>可信度<br /><b>{item.confidence}%</b> <Confidence value={item.confidence} /></span></div><h3>运营建议</h3><p>联系船员补充成交截图，可沉淀为案例</p><div className="button-row bottom"><button className="ghost">标记已核实</button><button>创建跟进行动</button></div></Card>;
}

function ActionGroup({ title, actions, onSelect }: { title: string; actions: Action[]; onSelect: (action: Action) => void }) {
  return <div className="action-group"><h3>{title} <span>{actions.length}</span></h3><DataTable headers={["优先级", "项目", "问题", "建议动作", "来源", "负责人", "截止时间", "状态"]} rows={actions.map((a) => [<Tag key={a.action_id} tone={a.priority === "P1" ? "red" : a.priority === "P2" ? "orange" : "mint"}>{a.priority}</Tag>, a.project, <button key={`${a.action_id}-i`} className="row-button" onClick={() => onSelect(a)}>{a.issue}</button>, a.suggestion, <Tag key={`${a.action_id}-src`} tone="purple">{a.source}</Tag>, a.owner, a.due, <Tag key={`${a.action_id}-s`} tone="orange">{a.status}</Tag>])} /></div>;
}

function ActionDetail({ action }: { action: Action }) {
  return <Card><h2>选中行动详情</h2><InfoList items={[["行动 ID", action.action_id], ["关联项目", action.project], ["关联群组", `${action.project} | ${action.groupName}`], ["关联证据", action.evidence_ids.join("、")], ["问题", action.issue], ["建议动作", action.suggestion], ["负责人", action.owner], ["截止时间", `2025-08-17（今天）`], ["优先级", action.priority], ["来源", action.source], ["状态", action.status]]} /><div className="button-row bottom"><button>标记完成</button><button className="ghost">调整负责人</button></div></Card>;
}

function FilterBar({ labels, action }: { labels: string[]; action?: string }) {
  return <div className="filter-bar">{labels.map((label, i) => i === labels.length - 1 && label.includes("搜索") ? <input key={label} placeholder={label} /> : <select key={label}><option>{label}</option></select>)}{action && <button>{action}</button>}</div>;
}

function Tag({ children, tone = "green" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`tag ${tone}`}>{children}</span>;
}

function LineChart({ data, color }: { data: { label: string; value: number }[]; color: string }) {
  return (
    <div className="line-chart" role="img" aria-label="近 7 天趋势图">
      <ResponsiveContainer width="100%" height={170}>
        <RechartsLineChart data={data} margin={{ top: 12, right: 16, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="#ECEFEC" strokeDasharray="4 4" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#E2E6E3" }} tick={{ fill: "#5F6B66", fontSize: 12 }} />
          <YAxis tickLine={false} axisLine={{ stroke: "#E2E6E3" }} tick={{ fill: "#5F6B66", fontSize: 12 }} />
          <Tooltip contentStyle={{ borderRadius: 6, borderColor: "#E2E6E3" }} />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={3} dot={{ r: 4, fill: "#fff", stroke: color, strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={false} />
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
}

function BarList({ items }: { items: { name: string; count: number }[] }) {
  const max = Math.max(...items.map((i) => i.count));
  return <div className="bar-list">{items.map((item) => <div className="bar-row" key={item.name}><span>{item.name}</span><i style={{ width: `${(item.count / max) * 72}%` }} /><b>{item.count}</b></div>)}</div>;
}

function Confidence({ value }: { value: number }) {
  return <span className="confidence">{value}%</span>;
}

function Judgement() {
  return <div className="judgement"><p><b>今日主线：</b>船员进入集中发布与首轮成交验证阶段</p><p><b>最高风险：</b>2 个低活跃群连续两天无有效反馈</p><p><b>最优先动作：</b>跟进首批出单船员，补充截图与完整过程</p></div>;
}

function Funnel() {
  return <div className="funnel">{[["已开始", 268], ["完成作品", 146], ["已发布", 93], ["首次成交", 21]].map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div>;
}

function ProjectMini({ project }: { project: Project }) {
  return <article><h3>{project.name}</h3><p>{project.summary}</p><Tag tone={project.risk === "中风险" ? "orange" : "mint"}>{project.risk}</Tag><strong>{project.todayGoodNews} 条</strong><small>今日好事</small></article>;
}

function ActionSummary({ title, text, onClick }: { title: string; text: string; onClick: () => void }) {
  return <button className="summary-row" onClick={onClick}><b>{title}</b><small>{text}</small><i>›</i></button>;
}

function Donut({ value, label }: { value: number; label: string }) {
  return <div className="donut" style={{ background: `conic-gradient(#237B69 ${value * 3.6}deg, #ECEFEC 0)` }}><span>{label}<small>{value}%</small></span></div>;
}

function Workload() {
  return <div className="workload">{["航海家_小满 8/10", "航海家_阿泽 7/10", "航海家_可可 4/10", "航海家_大海 2/10"].map((w, i) => <p key={w}><span>{w}</span><i style={{ width: `${80 - i * 18}%` }} /></p>)}</div>;
}

function SourceList() {
  return <div className="source-list">{[["航海好事", "4 (50%)"], ["风险异常", "2 (25%)"], ["日报", "1 (12.5%)"], ["群组观察", "1 (12.5%)"]].map(([a, b]) => <p key={a}><span>{a}</span><b>{b}</b></p>)}</div>;
}

function ReportList({ reports }: { reports: DashboardData["reports"] }) {
  return <div className="report-list">{reports.map((r) => <article className={r.status === "待确认" ? "active" : ""} key={r.request_id}><b>{r.project}</b><span>{r.date}</span><Tag tone={r.status === "待确认" ? "orange" : "green"}>{r.status}</Tag><small>好事 {r.goodNews}　行动 {r.actions}　覆盖 {r.coverage}</small></article>)}</div>;
}

function ReportPreview({ report }: { report: DashboardData["reports"][number] }) {
  return <div className="report-preview"><h3>今日主线</h3><div className="main-line">{report.mainLine}</div><h3>航海好事（3）</h3>{["学员笔记登上小红书热门，单篇曝光 2.1w", "群内促成 3 单成交，客单价 128 元", "学员主动组织打卡活动，参与度提升 40%"].map((x) => <p key={x}>{x}<Tag tone="gold">高</Tag></p>)}<h3>风险与异常（2）</h3><p>8月16日缺少「9群-成长营」数据 <Tag tone="red">数据缺失</Tag></p><h3>运营行动建议（3）</h3><p>补充 9群数据，完善分析 <Tag tone="red">高</Tag></p></div>;
}

function RankList({ groups, risk = false }: { groups: Group[]; risk?: boolean }) {
  return <ol className="rank-list">{groups.map((g, i) => <li key={g.group_id}><span>{i + 1}</span><b>{g.project} · {g.group}</b><em>{risk ? g.riskReason ?? "负面情绪上升" : g.messages}</em></li>)}</ol>;
}

function InfoList({ items }: { items: [string, string][] }) {
  return <dl className="info-list">{items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}
