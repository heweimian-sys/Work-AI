"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DashboardResponse,
  EMPTY_OPS,
  McpOpsSnapshot,
  QaProjectMetric,
  TaskWindow,
  buildProjectDecisions,
  formatDate,
  formatInteger,
  hoursUntil,
  projectName,
  qaTotals,
  tasksDueWithin,
} from "../lib/data";

type PageKey = "today" | "project" | "qa" | "good-news" | "actions" | "data";

const NAV: { key: PageKey; label: string; path: string }[] = [
  { key: "today", label: "今日运营", path: "/" },
  { key: "project", label: "项目作战室", path: "/project-dashboard" },
  { key: "qa", label: "答疑雷达", path: "/qa-radar" },
  { key: "good-news", label: "航海好事", path: "/good-news" },
  { key: "actions", label: "行动建议", path: "/actions" },
  { key: "data", label: "数据健康", path: "/evidence" },
];

const TITLES: Record<PageKey, [string, string]> = {
  today: ["今日运营", "只看今天需要决定、提醒和跟进的事项"],
  project: ["项目作战室", "按项目查看真实关卡时间、答疑压力与数据缺口"],
  qa: ["答疑雷达", "按首答状态和问题年龄识别处理压力"],
  "good-news": ["航海好事", "MCP 只发现候选，内容结论由运营人工判断"],
  actions: ["行动建议", "把关卡和答疑信号合并成按风险排序的项目决策清单"],
  data: ["数据健康", "明确哪些指标能用，哪些仍不可得"],
};

export function Workbench({ initialPage = "today" }: { initialPage?: PageKey }) {
  const [page, setPage] = useState<PageKey>(initialPage);
  const [ops, setOps] = useState<McpOpsSnapshot>(EMPTY_OPS);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [healthStatus, setHealthStatus] = useState<DashboardResponse["health_status"]>();

  useEffect(() => {
    fetch("/api/dashboard", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("dashboard unavailable");
        return await response.json() as DashboardResponse;
      })
      .then((response) => {
        setOps(response.ops || EMPTY_OPS);
        setHealthStatus(response.health_status);
        setState(response.ops ? "ready" : "error");
      })
      .catch(() => setState("error"));
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const matched = NAV.find((item) => item.path === window.location.pathname);
      if (matched) setPage(matched.key);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = (item: (typeof NAV)[number]) => {
    window.history.pushState(null, "", item.path);
    setPage(item.key);
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">航海运营工作台</div>
        <nav>{NAV.map((item) => (
          <a className={`nav-item ${item.key === page ? "active" : ""}`} href={item.path} key={item.key} onClick={(event) => { event.preventDefault(); navigate(item); }}>{item.label}</a>
        ))}</nav>
        <div className="sidebar-note">生财 MCP<br />匿名运营聚合</div>
      </aside>
      <section className="workspace">
        <Topbar ops={ops} page={page} state={state} healthStatus={healthStatus} />
        {state === "loading" ? <LoadingState /> : null}
        {state === "error" ? <EmptyState title="运营数据暂时无法加载" text="页面不会回退到演示数据，请稍后检查 MCP 快照和健康接口。" /> : null}
        {state === "ready" ? <>
          {page === "today" && <TodayOps ops={ops} go={setPage} />}
          {page === "project" && <ProjectWarRoom ops={ops} />}
          {page === "qa" && <QaRadar ops={ops} />}
          {page === "good-news" && <GoodNewsWorkbench ops={ops} />}
          {page === "actions" && <ActionLedger ops={ops} />}
          {page === "data" && <DataHealth ops={ops} />}
        </> : null}
      </section>
    </main>
  );
}

function Topbar({ ops, page, state, healthStatus }: { ops: McpOpsSnapshot; page: PageKey; state: string; healthStatus?: DashboardResponse["health_status"] }) {
  const stateLabel = state === "loading" ? "正在读取" : state === "error" ? "同步异常" : healthStatus === "stale" ? "快照已陈旧" : healthStatus === "degraded" ? "数据不完整" : `更新于 ${formatDate(ops.retrievedAt)}`;
  return <header className="topbar">
    <div><h1>{TITLES[page][0]}</h1><p>{TITLES[page][1]}</p></div>
    <div className="top-actions"><span className="scope-chip">{ops.label || "MCP 运营数据"}</span><span className={`sync-chip ${state === "error" || healthStatus === "stale" || healthStatus === "degraded" ? "error" : ""}`}>{stateLabel}</span></div>
  </header>;
}

function referenceNow() {
  return new Date();
}

function taskStatus(task: TaskWindow) {
  const hours = hoursUntil(task.suggestedFinishAt, referenceNow());
  if (hours === null) return { label: "时间缺失", tone: "neutral", rank: 5 };
  if (hours < -72) return { label: "建议日已过", tone: "neutral", rank: 4 };
  if (hours < 0) return { label: "刚过建议日", tone: "orange", rank: 1 };
  if (hours <= 24) return { label: "24 小时内", tone: "red", rank: 0 };
  if (hours <= 72) return { label: "72 小时内", tone: "orange", rank: 2 };
  return { label: "后续节点", tone: "blue", rank: 3 };
}

function TodayOps({ ops, go }: { ops: McpOpsSnapshot; go: (page: PageKey) => void }) {
  const totals = qaTotals(ops);
  const tasks72h = tasksDueWithin(ops, 72, referenceNow()).sort((a, b) => Date.parse(a.suggestedFinishAt) - Date.parse(b.suggestedFinishAt));
  const decisions = buildProjectDecisions(ops, referenceNow());
  const priorityDecisions = decisions.slice(0, 5);

  return <div className="page-stack">
    <MetricGrid metrics={[
      ["未来 72h 关卡", formatInteger(tasks72h.length), "orange", "按建议完成时间"],
      ["P1 风险项目", formatInteger(decisions.filter((item) => item.priority === "P1").length), "red", "关卡与答疑合并排序"],
      ["24h 新问题未首答", formatInteger(totals.new24hUnanswered), "red", "answerCount = 0"],
      ["超过 48h 未首答", formatInteger(totals.awaitingFirstReply48h), "red", "不是平台待回答状态"],
      ["待运营看稿", formatInteger(ops.operations.goodNews.stages.find((item) => item.stage === "待运营看稿")?.count || 0), "green", "好事人工台账"],
    ]} />

    <section className="decision-strip"><div><b>今天先处理</b><span>同一项目只出现一次，风险分综合 48h 积压、24h 新增未首答和关卡临期信号。</span></div><button onClick={() => go("actions")}>查看全部建议</button></section>

    <div className="ops-grid-main">
      <Card><SectionHead title="项目决策优先级" note="最多显示 5 个项目；这是只读建议，不伪装成已指派任务" />
        {priorityDecisions.length ? <div className="action-list">{priorityDecisions.map((decision, index) => <article className="action-row" key={decision.id}>
          <span className={`priority ${decision.priority.toLowerCase()}`}>{decision.priority}</span>
          <div><small>{projectName(ops, decision.projectId)} · 风险分 {decision.riskScore}</small><strong>{index + 1}. {decision.title}</strong><p>{decision.signals.join("；")}</p><p className="recommendation">建议：{decision.recommendation}</p></div>
          <div className="action-meta"><span>{decision.dueAt ? formatDate(decision.dueAt) : "无硬截止"}</span><em>数据 {formatDate(decision.dataAsOf)}</em></div>
        </article>)}</div> : <EmptyState title="暂无可验证的紧急事项" text="下一次同步后会按真实任务和答疑时效重新计算。" />}
      </Card>
      <Card><SectionHead title="未来 72 小时关卡" note="这是项目节奏节点，不代表成员完成率" />
        {tasks72h.length ? <TaskCompactList ops={ops} tasks={tasks72h} /> : <EmptyState title="72 小时内没有新节点" text="可在项目作战室查看全部关卡时间。" />}
      </Card>
    </div>

    <Card><SectionHead title="项目答疑变化" note="只展示最近新增与未首答，不再使用失真的平台“待回答总量”" action="查看答疑雷达" onAction={() => go("qa")} />
      <QaProjectTable ops={ops} rows={[...ops.operations.qaProjects].sort((a, b) => b.awaitingFirstReply48h - a.awaitingFirstReply48h || b.new24hUnanswered - a.new24hUnanswered)} />
    </Card>
  </div>;
}

function ProjectWarRoom({ ops }: { ops: McpOpsSnapshot }) {
  const [selectedId, setSelectedId] = useState(ops.projects[0]?.id || "");
  const project = ops.projects.find((item) => item.id === selectedId) || ops.projects[0];
  if (!project) return <EmptyState title="暂无项目" text="MCP 返回项目后会显示作战室。" />;
  const tasks = ops.operations.taskWindows.filter((task) => task.projectId === project.id).sort((a, b) => Date.parse(a.suggestedFinishAt) - Date.parse(b.suggestedFinishAt));
  const qa = ops.operations.qaProjects.find((item) => item.projectId === project.id);

  return <div className="page-stack">
    <div className="project-selector"><label>当前项目</label><select value={project.id} onChange={(event) => setSelectedId(event.target.value)}>{ops.projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
    <section className="war-room-header"><div><div className="tag-row"><Tag tone="green">{project.status}</Tag>{project.platforms.map((platform) => <Tag key={platform} tone="blue">{platform}</Tag>)}</div><h2>{project.name}</h2><p>{project.target}</p></div><div className="war-room-dates"><span>项目结束</span><strong>{formatDate(project.endAt)}</strong></div></section>
    <MetricGrid compact metrics={[
      ["关卡定义", formatInteger(tasks.length), "blue", ops.operations.collection.taskDefinitionsComplete ? "完整读取" : "可能不完整"],
      ["24h 新问题", formatInteger(qa?.new24h || 0), "blue", "按创建时间"],
      ["新问题未首答", formatInteger(qa?.new24hUnanswered || 0), "red", "最近 24 小时"],
      ["48h+ 未首答", formatInteger(qa?.awaitingFirstReply48h || 0), "red", qa?.oldestUnansweredAt ? `最早 ${formatDate(qa.oldestUnansweredAt)}` : "当前为 0"],
      ["全部未首答", formatInteger(qa?.awaitingFirstReply || 0), "orange", "answerCount = 0"],
    ]} />
    <div className="two-col equal-cols">
      <Card><SectionHead title="关卡时间线" note="按建议完成时间排列" />{tasks.length ? <TaskTimeline ops={ops} tasks={tasks} /> : <EmptyState title="暂无关卡定义" text="任务接口尚未返回该项目的关卡。" />}</Card>
      <Card><SectionHead title="答疑主题" note="固定分类聚合，不展示成员问题原文" />{qa?.topicBuckets.length ? <TopicList rows={qa.topicBuckets} /> : <EmptyState title="暂无可用主题聚合" text="不会用空数据生成判断。" />}</Card>
    </div>
    <section className="definition-bar"><b>数据更新时间</b><span>{formatDate(qa?.dataAsOf || project.dataAsOf)}；另有 {formatInteger(qa?.answeredButOpen || 0)} 条“已有回复但平台状态未闭合”，只作为数据质量问题，不进入运营待办。</span></section>
    <section className="coverage-note"><strong>提交趋势暂不展示</strong><span>{ops.operations.collection.submissionTrendReason}</span></section>
  </div>;
}

function QaRadar({ ops }: { ops: McpOpsSnapshot }) {
  const totals = qaTotals(ops);
  const topics = useMemo(() => {
    const merged = new Map<string, { recent7d: number; awaitingFirstReply: number; awaitingFirstReply48h: number }>();
    for (const project of ops.operations.qaProjects) for (const row of project.topicBuckets) {
      const current = merged.get(row.topic) || { recent7d: 0, awaitingFirstReply: 0, awaitingFirstReply48h: 0 };
      current.recent7d += row.recent7d;
      current.awaitingFirstReply += row.awaitingFirstReply;
      current.awaitingFirstReply48h += row.awaitingFirstReply48h;
      merged.set(row.topic, current);
    }
    return [...merged.entries()].map(([topic, value]) => ({ topic, ...value })).sort((a, b) => b.awaitingFirstReply48h - a.awaitingFirstReply48h || b.recent7d - a.recent7d);
  }, [ops.operations.qaProjects]);

  return <div className="page-stack">
    <MetricGrid metrics={[
      ["24h 新问题", formatInteger(totals.new24h), "blue", "真实创建时间"],
      ["24h 新问题未首答", formatInteger(totals.new24hUnanswered), "red", "首答处理入口"],
      ["全部未首答", formatInteger(totals.awaitingFirstReply), "orange", "answerCount = 0"],
      ["超过 48h 未首答", formatInteger(totals.awaitingFirstReply48h), "red", "优先清理"],
      ["覆盖项目", formatInteger(ops.operations.qaProjects.length), "purple", "逐项目显示数据时间"],
    ]} />
    <section className="definition-bar"><b>新版口径</b><span>“未首答”只看是否存在回答；平台 questionStatus 大量未闭合，因此不再显示为运营待回答总数。</span></section>
    <Card><SectionHead title="项目首答压力" note="先看 48 小时以上，再看 24 小时新增" /><QaProjectTable ops={ops} rows={[...ops.operations.qaProjects].sort((a, b) => b.awaitingFirstReply48h - a.awaitingFirstReply48h || b.new24hUnanswered - a.new24hUnanswered)} /></Card>
    <Card><SectionHead title="问题主题聚合" note={`分类器 ${ops.operations.collection.qaClassifierVersion || "未标记"}；主题可重叠风险已通过单分类控制`} />
      {topics.length ? <TopicList rows={topics} /> : <EmptyState title="暂无主题数据" text="不会展示问答原文或成员信息。" />}
    </Card>
  </div>;
}

const GOOD_NEWS_FLOW = ["候选发现", "待运营看稿", "需船员修改", "运营复看", "待同步精华修改", "后续处理中", "已完成", "本轮不推进"];

function GoodNewsWorkbench({ ops }: { ops: McpOpsSnapshot }) {
  const byStage = new Map(ops.operations.goodNews.stages.map((item) => [item.stage, item.count]));
  return <div className="page-stack">
    <MetricGrid metrics={[
      ["候选发现", formatInteger(byStage.get("候选发现") || 0), "blue", "MCP 仅提供候选来源"],
      ["待运营看稿", formatInteger(byStage.get("待运营看稿") || 0), "orange", "唯一内容判断入口"],
      ["修改与复看", formatInteger((byStage.get("需船员修改") || 0) + (byStage.get("运营复看") || 0)), "purple", "运营跟进"],
      ["已完成", formatInteger(byStage.get("已完成") || 0), "green", "人工确认"],
    ]} />
    <section className="role-boundary"><strong>判断边界</strong><span>运营是唯一内容审核人；领队和志愿者只负责传达。作业量、关键词、点赞和评论都不能自动等同航海好事。</span></section>
    <div className="good-news-flow">{GOOD_NEWS_FLOW.map((stage, index) => <article key={stage}><span>{index + 1}</span><b>{stage}</b><strong>{formatInteger(byStage.get(stage) || 0)}</strong></article>)}</div>
    {(ops.operations.goodNews.candidateCount || 0) === 0 ? <EmptyState title="当前没有经过人工建档的好事候选" text={ops.operations.goodNews.note || "MCP 作业尚未经过运营去重、证据核验和内容判断。"} /> : <Card><SectionHead title="候选台账" note="仅展示匿名状态；正文和证据保留在受保护的内部系统" /></Card>}
  </div>;
}

function ActionLedger({ ops }: { ops: McpOpsSnapshot }) {
  const decisions = buildProjectDecisions(ops, referenceNow());
  return <div className="page-stack">
    <MetricGrid metrics={[
      ["建议项目", formatInteger(decisions.length), "blue", "一个项目一项"],
      ["P1 风险项目", formatInteger(decisions.filter((item) => item.priority === "P1").length), "red", "先处理"],
      ["关卡临期项目", formatInteger(decisions.filter((item) => item.dueAt).length), "orange", "未来 72h 或刚过期"],
      ["48h 积压项目", formatInteger(ops.operations.qaProjects.filter((item) => item.awaitingFirstReply48h > 0).length), "purple", "需集中答疑"],
    ]} />
    <section className="definition-bar"><b>使用方式</b><span>先按风险分选择项目，再由运营决定“集中答疑 / 发送关卡提醒 / 暂缓”。公开页保持只读，不显示虚假的负责人和完成状态。</span></section>
    <Card><SectionHead title="项目决策清单" note="风险分只用于排序，不代表项目完成率" />
      {decisions.length ? <DataTable headers={["优先级", "项目", "风险分", "真实信号", "建议动作", "关卡节点", "数据时间"]} rows={decisions.map((decision) => [<Tag key={decision.id} tone={decision.priority === "P1" ? "red" : decision.priority === "P2" ? "orange" : "blue"}>{decision.priority}</Tag>, projectName(ops, decision.projectId), formatInteger(decision.riskScore), decision.signals.join("；"), decision.recommendation, decision.dueAt ? formatDate(decision.dueAt) : "无硬截止", formatDate(decision.dataAsOf)])} /> : <EmptyState title="暂无行动建议" text="下一次 MCP 同步后重新计算。" />}
    </Card>
  </div>;
}

function DataHealth({ ops }: { ops: McpOpsSnapshot }) {
  const fetched = ops.operations.qaProjects.reduce((sum, item) => sum + item.fetched, 0);
  const expected = ops.operations.qaProjects.reduce((sum, item) => sum + item.upstreamTotal, 0);
  return <div className="page-stack">
    <MetricGrid metrics={[
      ["项目", formatInteger(ops.projects.length), "green", "当前运营范围"],
      ["任务定义", formatInteger(ops.operations.taskWindows.length), "blue", ops.operations.collection.taskDefinitionsComplete ? "完整" : "不完整"],
      ["问答聚合覆盖", `${formatInteger(fetched)} / ${formatInteger(expected)}`, "blue", ops.operations.collection.qaRecordsComplete ? "完整" : "部分"],
      ["平台状态异常", formatInteger(qaTotals(ops).answeredButOpen), "orange", "已有回复但未闭合"],
      ["快照时间", formatDate(ops.retrievedAt), "purple", "北京时间"],
    ]} />
    <div className="two-col equal-cols">
      <Card><SectionHead title="现在可用于运营" /><ul className="plain-list"><li>真实关卡标题、建议完成时间和项目结束时间</li><li>最近 24 小时新增问题</li><li>尚无首答的问题与 48 小时老化</li><li>固定主题的匿名问答聚合</li><li>人工航海好事流转状态</li></ul></Card>
      <Card><SectionHead title="明确不再使用" /><ul className="plain-list"><li>总报名、总作业和人均作业排名</li><li>未点评总量与点评覆盖率</li><li>平台 questionStatus 直接当运营待办</li><li>提交次数推导完成率、掉队人数</li><li>关键词命中直接当航海好事</li></ul></Card>
    </div>
    <Card><SectionHead title="数据源状态" note="失败、部分结果和边界必须显式展示" /><DataTable headers={["MCP 工具", "状态", "用途 / 边界"]} rows={ops.sourceChecks.map((check) => [check.tool, check.status, check.scope])} /></Card>
    <section className="coverage-note"><strong>公开安全边界</strong><span>页面与 API 不包含成员姓名、用户 ID、作业或问答原文、链接、证据正文、群聊和 ZIP 数据。</span></section>
  </div>;
}

function TaskCompactList({ ops, tasks }: { ops: McpOpsSnapshot; tasks: TaskWindow[] }) {
  return <div className="task-compact-list">{tasks.map((task) => { const status = taskStatus(task); return <article key={task.taskId}><div><small>{projectName(ops, task.projectId)}</small><strong>{task.title}</strong><span>{formatDate(task.suggestedFinishAt)}</span></div><Tag tone={status.tone}>{status.label}</Tag></article>; })}</div>;
}

function TaskTimeline({ tasks }: { ops: McpOpsSnapshot; tasks: TaskWindow[] }) {
  return <div className="task-timeline">{tasks.map((task) => { const status = taskStatus(task); return <article key={task.taskId}><i className={status.tone} /><div><small>{formatDate(task.suggestedFinishAt)}</small><strong>{task.title}</strong><span>提交窗口至 {formatDate(task.endAt)}</span></div><Tag tone={status.tone}>{status.label}</Tag></article>; })}</div>;
}

function QaProjectTable({ ops, rows }: { ops: McpOpsSnapshot; rows: QaProjectMetric[] }) {
  return <DataTable headers={["项目", "24h 新增", "新问题未首答", "全部未首答", "48h+ 未首答", "数据时间", "数据覆盖"]} rows={rows.map((row) => [projectName(ops, row.projectId), formatInteger(row.new24h), formatInteger(row.new24hUnanswered), formatInteger(row.awaitingFirstReply), formatInteger(row.awaitingFirstReply48h), formatDate(row.dataAsOf), row.complete && !row.partialResults ? "完整" : `${formatInteger(row.fetched)} / ${formatInteger(row.upstreamTotal)}`])} />;
}

function TopicList({ rows }: { rows: { topic: string; recent7d: number; awaitingFirstReply: number; awaitingFirstReply48h: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.awaitingFirstReply));
  return <div className="topic-list">{rows.map((row) => <article key={row.topic}><div><b>{row.topic}</b><span>近 7 天 {formatInteger(row.recent7d)} 条</span></div><div className="topic-bar"><i style={{ width: `${Math.max(2, row.awaitingFirstReply / max * 100)}%` }} /></div><strong>{formatInteger(row.awaitingFirstReply48h)}<small> 48h+</small></strong></article>)}</div>;
}

function MetricGrid({ metrics, compact = false }: { metrics: [string, string, string, string][]; compact?: boolean }) {
  return <div className={`metric-band mcp-metrics ${compact ? "compact" : ""}`}>{metrics.map(([label, value, tone, note]) => <article className={`metric-item ${tone}`} key={label}><span>{label}</span><strong className={value.length > 12 ? "text-value" : ""}>{value}</strong><em>{note}</em></article>)}</div>;
}

function Card({ children }: { children: React.ReactNode }) { return <section className="card">{children}</section>; }
function SectionHead({ title, note, action, onAction }: { title: string; note?: string; action?: string; onAction?: () => void }) { return <div className="section-head"><div><h2>{title}</h2>{note ? <p>{note}</p> : null}</div>{action ? <button className="text-action" onClick={onAction}>{action}</button> : null}</div>; }
function Tag({ children, tone = "neutral" }: { children: React.ReactNode; tone?: string }) { return <span className={`tag ${tone}`}>{children}</span>; }
function EmptyState({ title, text }: { title: string; text: string }) { return <section className="empty-state"><b>{title}</b><span>{text}</span></section>; }
function LoadingState() { return <section className="empty-state loading-state"><b>正在读取 MCP 运营快照</b><span>只加载真实数据，不显示演示内容。</span></section>; }

function DataTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return <div className="table-scroll"><table className="data-table"><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>;
}
