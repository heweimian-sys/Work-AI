"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DashboardResponse,
  EMPTY_OPS,
  McpOpsSnapshot,
  McpProject,
  daysRemaining,
  formatDate,
  formatInteger,
  outputDensity,
  openQaPerHundred,
  reviewCoverage,
  sum,
} from "../lib/data";

type PageKey = "overview" | "project" | "good-news" | "actions" | "reports" | "groups" | "evidence";

const NAV: { key: PageKey; label: string; path: string }[] = [
  { key: "overview", label: "运营总览", path: "/" },
  { key: "project", label: "项目驾驶舱", path: "/project-dashboard" },
  { key: "good-news", label: "成果观察", path: "/good-news" },
  { key: "actions", label: "运营行动", path: "/actions" },
  { key: "reports", label: "项目快照", path: "/reports" },
  { key: "groups", label: "项目对比", path: "/groups" },
  { key: "evidence", label: "数据口径", path: "/evidence" },
];

const TITLES: Record<PageKey, [string, string]> = {
  overview: ["运营总览", "本期项目规模、产出、问答与临期事项"],
  project: ["项目驾驶舱", "逐项目查看节奏、里程碑与运营压力"],
  "good-news": ["成果观察", "只展示 MCP 可验证的作业产出，不冒充航海好事"],
  actions: ["运营行动", "把项目指标转成需要人工判断的运营建议"],
  reports: ["项目快照", "保存当前 MCP 截面，后续逐日形成趋势"],
  groups: ["项目对比", "按项目、类型与方向比较关键指标"],
  evidence: ["数据口径", "清楚说明来源、边界、新鲜度和缺失项"],
};

type OpsAction = {
  priority: "P1" | "P2" | "P3";
  project: string;
  signal: string;
  suggestion: string;
  basis: string;
};

export function Workbench({ initialPage = "overview" }: { initialPage?: PageKey }) {
  const [page, setPage] = useState<PageKey>(initialPage);
  const [ops, setOps] = useState<McpOpsSnapshot>(EMPTY_OPS);
  const [loadError, setLoadError] = useState(false);
  const [healthStatus, setHealthStatus] = useState<DashboardResponse["health_status"]>();

  useEffect(() => {
    fetch("/api/dashboard", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("dashboard unavailable");
        return await response.json() as DashboardResponse;
      })
      .then((response) => {
        setOps(response.ops || EMPTY_OPS);
        setLoadError(!response.ops);
        setHealthStatus(response.health_status);
      })
      .catch(() => setLoadError(true));
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
        <div className="sidebar-note">仅使用生财 MCP<br />项目级安全聚合</div>
      </aside>
      <section className="workspace">
        <Topbar ops={ops} page={page} loadError={loadError} healthStatus={healthStatus} />
        {loadError && !ops.projects.length ? <EmptyState title="MCP 数据暂时无法加载" text="页面会保留明确空状态，不会回退到演示数据。" /> : null}
        {!loadError || ops.projects.length ? <>
          {page === "overview" && <Overview ops={ops} go={setPage} />}
          {page === "project" && <ProjectCockpit ops={ops} />}
          {page === "good-news" && <ResultsView ops={ops} />}
          {page === "actions" && <ActionsView ops={ops} />}
          {page === "reports" && <SnapshotView ops={ops} />}
          {page === "groups" && <CompareView ops={ops} />}
          {page === "evidence" && <DataScopeView ops={ops} />}
        </> : null}
      </section>
    </main>
  );
}

function Topbar({ ops, page, loadError, healthStatus }: { ops: McpOpsSnapshot; page: PageKey; loadError: boolean; healthStatus?: DashboardResponse["health_status"] }) {
  const hasPartialResults = ops.sourceChecks.some((check) => check.status.includes("部分"));
  const syncState = loadError
    ? "同步异常"
    : healthStatus === "stale"
      ? "MCP 快照已陈旧"
      : hasPartialResults
        ? "MCP 有部分结果"
        : ops.retrievedAt
          ? `MCP 拉取 ${formatDate(ops.retrievedAt)}`
          : "等待 MCP";
  return (
    <header className="topbar">
      <div><h1>{TITLES[page][0]}</h1><p>{TITLES[page][1]}</p></div>
      <div className="top-actions">
        <span className="scope-chip">{ops.label}</span>
        <span className={`sync-chip ${loadError || healthStatus === "stale" ? "error" : hasPartialResults ? "warn" : ""}`}>{syncState}</span>
      </div>
    </header>
  );
}

function Overview({ ops, go }: { ops: McpOpsSnapshot; go: (page: PageKey) => void }) {
  const projects = ops.projects;
  const joins = sum(projects, "joinCount");
  const outputs = sum(projects, "outputCount");
  const qaOpen = sum(projects, "qaOpen");
  const unreviewed = sum(projects, "unreviewedCount");
  const endingSoon = projects.filter((project) => daysRemaining(project) <= 7).length;
  const reviewPressureLeader = [...projects].sort((a, b) => (b.unreviewedCount ?? 0) - (a.unreviewedCount ?? 0))[0];
  const pressureLeader = [...projects].sort((a, b) => b.qaOpen - a.qaOpen)[0];

  return <div className="page-stack">
    <MetricGrid metrics={[
      ["本期项目", formatInteger(projects.length), "green", `${ops.historicalPeriodCount} 个历史期数`],
      ["报名人数", formatInteger(joins), "gold", "activityList 口径"],
      ["审核可见产出", formatInteger(outputs), "blue", `较上次 +${formatInteger(ops.snapshotComparison.outputDelta)}`],
      ["未点评作业", formatInteger(unreviewed), "red", "导师点评状态"],
      ["待回答问答", formatInteger(qaOpen), "red", "MCP 可见状态"],
      ["7 天内结束", formatInteger(endingSoon), "orange", "需进入收尾节奏"],
    ]} />

    <div className="overview-grid mcp-overview-grid">
      <Card>
        <SectionHead title="项目运营矩阵" note="排序依据为审核可见产出量" action="打开项目对比" onAction={() => go("groups")} />
        <ProjectTable projects={[...projects].sort((a, b) => b.outputCount - a.outputCount)} />
      </Card>
      <div className="side-stack">
        <Card><h2>本期关键判断</h2><div className="signal-list">
          <Signal tone="blue" label="点评压力" value={reviewPressureLeader ? `${reviewPressureLeader.name}：${formatInteger(reviewPressureLeader.unreviewedCount ?? 0)} 未点评` : "等待数据"} detail="点评状态聚合；查询边界项目按下限展示。" />
          <Signal tone="red" label="答疑压力" value={pressureLeader ? `${pressureLeader.name}：${formatInteger(pressureLeader.qaOpen)} 待回答` : "等待数据"} detail="依据 MCP 问答状态，需要运营确认实际处理机制。" />
          <Signal tone="orange" label="收尾窗口" value={`${endingSoon} 个项目将在 7 天内结束`} detail="优先检查最终成果任务、提醒节奏与答疑承接。" />
        </div></Card>
        <Card><h2>运营动作入口</h2><button className="full" onClick={() => go("actions")}>查看自动建议的行动队列</button><p className="card-note">建议仅基于聚合指标生成，执行前仍需运营人员判断。</p></Card>
      </div>
    </div>

    <div className="two-col equal-cols">
      <Card><h2>人均作业密度</h2><BarList items={[...projects].sort((a, b) => outputDensity(b) - outputDensity(a)).map((project) => ({ name: project.name, value: outputDensity(project) }))} format={(value) => value.toFixed(2)} /></Card>
      <Card><h2>近 8 期项目数量</h2><TrendChart data={ops.recentTimeline.map((item) => ({ label: item.label, value: item.projects }))} /></Card>
    </div>
  </div>;
}

function ProjectCockpit({ ops }: { ops: McpOpsSnapshot }) {
  const [selectedId, setSelectedId] = useState(ops.projects[0]?.id || "");
  const project = ops.projects.find((item) => item.id === selectedId) || ops.projects[0];
  if (!project) return <EmptyState title="暂无项目" text="MCP 返回项目后会显示驾驶舱。" />;
  const remaining = daysRemaining(project);

  return <div className="page-stack">
    <div className="project-selector"><label>当前项目</label><select value={project.id} onChange={(event) => setSelectedId(event.target.value)}>{ops.projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
    <section className="project-hero-band">
      <Image src={project.avatar} alt="" width={80} height={80} unoptimized />
      <div><div className="tag-row"><Tag tone="green">{project.status}</Tag><Tag tone="blue">{project.type}</Tag>{project.platforms.map((platform) => <Tag key={platform} tone="gold">{platform}</Tag>)}</div><h2>{project.name}</h2><p>{project.target}</p></div>
      <div className="hero-days"><strong>{remaining}</strong><span>天后结束</span></div>
    </section>
    <MetricGrid compact metrics={[
      ["报名人数", formatInteger(project.joinCount), "gold", project.isFull ? "报名已满" : "MCP 报名口径"],
      ["审核可见产出", `${project.outputCountAtBoundary ? "≥" : ""}${formatInteger(project.outputCount)}`, "blue", "不等于独立人数"],
      ["未点评作业", `${project.outputCountAtBoundary ? "≥" : ""}${formatInteger(project.unreviewedCount ?? 0)}`, "red", "导师点评状态"],
      ["点评覆盖", `${reviewCoverage(project).toFixed(2)}%`, "orange", project.outputCountAtBoundary ? "查询边界，仅供参考" : "已点评 ÷ 点评状态总量"],
      ["人均作业密度", outputDensity(project).toFixed(2), "green", "产出数 ÷ 报名数"],
      ["任务数", formatInteger(project.taskCount), "purple", "任务定义"],
      ["待回答问答", formatInteger(project.qaOpen), "red", `${openQaPerHundred(project).toFixed(1)} / 百人`],
      ["手册正文节点", formatInteger(project.manualReadableCount ?? 0), "green", `目录共 ${formatInteger(project.manualTocCount ?? 0)} 节点`],
    ]} />
    <div className="two-col equal-cols">
      <Card><h2>项目节奏</h2><TimelineRow label="报名截止" value={formatDate(project.enrollEnd)} state="done" /><TimelineRow label="正式开船" value={formatDate(project.sailAt)} state="done" /><TimelineRow label="当前建议节点" value={project.currentMilestone} state="current" /><TimelineRow label="下一节点" value={`${project.nextMilestone} · ${formatDate(project.nextDueAt)}`} state="next" /><TimelineRow label="项目结束" value={formatDate(project.endAt)} state="next" /></Card>
      <Card><h2>运营压力</h2><CompareBars rows={[
        { label: "作业密度", value: outputDensity(project), max: 4, display: outputDensity(project).toFixed(2) },
        { label: "点评覆盖", value: reviewCoverage(project), max: 100, display: `${reviewCoverage(project).toFixed(2)}%` },
        { label: "百人待回答", value: openQaPerHundred(project), max: 30, display: openQaPerHundred(project).toFixed(1) },
        { label: "问答解决", value: project.qaTotal ? (project.qaResolved / project.qaTotal) * 100 : 0, max: 100, display: `${project.qaResolved}/${project.qaTotal}` },
      ]} /><p className="card-note">指标只用于项目间比较，不代表学习完成率或运营质量结论。</p></Card>
    </div>
    <Card><h2>当前运营判断</h2><div className="judgement-grid">
      <Judgement label="阶段" text={remaining <= 7 ? "已进入收尾窗口，应优先守住最终任务与答疑。" : "仍在中段推进，重点看下一里程碑的作业承接。"} />
      <Judgement label="产出" text={`当前人均 ${outputDensity(project).toFixed(2)} 条审核可见作业；作业量不能直接当作成果质量。`} />
      <Judgement label="点评" text={`${formatInteger(project.unreviewedCount ?? 0)} 条处于未点评状态；应结合教练排班确认真实处理优先级。`} />
      <Judgement label="问答" text={project.qaPartialResults ? `${formatInteger(project.qaOpen)} 条待回答，但 MCP 标记为部分结果，不能视为完整总量。` : `${formatInteger(project.qaOpen)} 条处于待回答状态，需要核对答疑排班和状态回写。`} />
      <Judgement label="边界" text={project.outputCountAtBoundary ? "产出查询触及 10,000 条边界，页面按下限展示。" : project.qaPartialResults ? "问答端点返回 PARTIAL，页面保留缺口提示。" : "当前项目查询未标记结果边界。"} />
    </div></Card>
  </div>;
}

function ResultsView({ ops }: { ops: McpOpsSnapshot }) {
  const projects = [...ops.projects].sort((a, b) => b.outputCount - a.outputCount);
  const reviewed = sum(projects, "reviewedCount");
  const unreviewed = sum(projects, "unreviewedCount");
  return <div className="page-stack">
    <MetricGrid metrics={[
      ["审核可见产出", formatInteger(sum(projects, "outputCount")), "blue", "任务制作业"],
      ["已点评作业", formatInteger(reviewed), "green", "导师点评状态"],
      ["未点评作业", formatInteger(unreviewed), "red", "动态批次聚合"],
      ["总体点评覆盖", `${((reviewed / Math.max(1, reviewed + unreviewed)) * 100).toFixed(2)}%`, "orange", "边界项目仅供参考"],
      ["平均人均密度", (sum(projects, "outputCount") / Math.max(1, sum(projects, "joinCount"))).toFixed(2), "green", "跨项目粗粒度"],
      ["可验证好事", "暂不可得", "orange", "MCP 无任务制映射"],
    ]} />
    <section className="boundary-banner"><strong>为什么这里不直接展示“航海好事”？</strong><span>{ops.goodNewsMapping.reason}</span></section>
    <div className="two-col equal-cols">
      <Card><h2>产出总量排行</h2><BarList items={projects.map((project) => ({ name: project.name, value: project.outputCount }))} format={(value) => formatInteger(value)} /></Card>
      <Card><h2>点评覆盖排行</h2><BarList items={[...projects].sort((a, b) => reviewCoverage(b) - reviewCoverage(a)).map((project) => ({ name: project.name, value: reviewCoverage(project) }))} format={(value) => `${value.toFixed(2)}%`} /></Card>
    </div>
    <Card><h2>项目成果观察</h2><DataTable headers={["项目", "审核可见产出", "已点评", "未点评", "点评覆盖", "人均密度", "最近提交", "数据质量"]} rows={projects.map((project) => [project.name, `${project.outputCountAtBoundary ? "≥" : ""}${formatInteger(project.outputCount)}`, formatInteger(project.reviewedCount ?? 0), `${project.outputCountAtBoundary ? "≥" : ""}${formatInteger(project.unreviewedCount ?? 0)}`, `${reviewCoverage(project).toFixed(2)}%`, outputDensity(project).toFixed(2), formatDate(project.lastSubmissionAt), <ProjectQualityTag key={project.id} project={project} />])} /></Card>
  </div>;
}

function buildActions(projects: McpProject[]): OpsAction[] {
  const actions: OpsAction[] = [];
  projects.filter((project) => (project.unreviewedCount ?? 0) >= 8000).sort((a, b) => (b.unreviewedCount ?? 0) - (a.unreviewedCount ?? 0)).forEach((project) => actions.push({ priority: "P1", project: project.name, signal: `${project.outputCountAtBoundary ? "≥" : ""}${formatInteger(project.unreviewedCount ?? 0)} 条作业未点评`, suggestion: "核对点评分工、批量反馈机制和优先任务覆盖", basis: "searchVisibleActivitySubmissions" }));
  projects.filter((project) => project.qaOpen >= 1000).sort((a, b) => b.qaOpen - a.qaOpen).forEach((project) => actions.push({ priority: "P1", project: project.name, signal: `${formatInteger(project.qaOpen)} 条问答待回答`, suggestion: "核对答疑排班、集中答疑入口和状态回写机制", basis: "searchActivityQa" }));
  projects.filter((project) => (project.unreviewedCount ?? 0) >= 3000 && (project.unreviewedCount ?? 0) < 8000).sort((a, b) => (b.unreviewedCount ?? 0) - (a.unreviewedCount ?? 0)).forEach((project) => actions.push({ priority: "P2", project: project.name, signal: `${formatInteger(project.unreviewedCount ?? 0)} 条作业未点评`, suggestion: "抽查关键任务点评覆盖，确认是否需要集中反馈", basis: "searchVisibleActivitySubmissions" }));
  projects.filter((project) => daysRemaining(project) <= 7).forEach((project) => actions.push({ priority: "P2", project: project.name, signal: `${daysRemaining(project)} 天后结束`, suggestion: `围绕“${project.nextMilestone}”安排收尾提醒`, basis: "activityList + searchActivityTasks" }));
  projects.filter((project) => project.isFull).forEach((project) => actions.push({ priority: "P2", project: project.name, signal: "报名状态为已满", suggestion: "确认满额后的候补、入群与开营承接是否完整", basis: "activityList" }));
  projects.filter((project) => project.outputCountAtBoundary).forEach((project) => actions.push({ priority: "P3", project: project.name, signal: "产出数正好为 10,000", suggestion: "复核 MCP 查询是否存在总数边界，避免低估实际产出", basis: "searchActivityOutputs" }));
  projects.filter((project) => project.qaPartialResults).forEach((project) => actions.push({ priority: "P3", project: project.name, signal: "问答端点返回部分结果", suggestion: "补拉问答聚合或在运营判断中保留数据缺口", basis: "searchActivityQa" }));
  return actions;
}

function ActionsView({ ops }: { ops: McpOpsSnapshot }) {
  const actions = useMemo(() => buildActions(ops.projects), [ops.projects]);
  return <div className="page-stack">
    <MetricGrid metrics={[
      ["建议行动", formatInteger(actions.length), "blue", "自动生成，人工确认"],
      ["P1 高压项", formatInteger(actions.filter((item) => item.priority === "P1").length), "red", "点评与答疑"],
      ["未点评总量", formatInteger(sum(ops.projects, "unreviewedCount")), "orange", "导师点评状态"],
      ["临期项目", formatInteger(ops.projects.filter((item) => daysRemaining(item) <= 7).length), "orange", "7 天内结束"],
      ["数据质量项", formatInteger(actions.filter((item) => item.priority === "P3").length), "purple", "需核对查询口径"],
    ]} />
    <section className="boundary-banner"><strong>这是建议，不是自动指令</strong><span>所有动作都由聚合指标触发；负责人、截止时间和实际执行状态尚未从 MCP 获得。</span></section>
    <Card><h2>行动队列</h2><DataTable headers={["优先级", "项目", "信号", "建议动作", "依据"]} rows={actions.map((item) => [<Tag key={`${item.project}-${item.signal}`} tone={item.priority === "P1" ? "red" : item.priority === "P2" ? "orange" : "blue"}>{item.priority}</Tag>, item.project, item.signal, item.suggestion, item.basis])} /></Card>
  </div>;
}

function SnapshotView({ ops }: { ops: McpOpsSnapshot }) {
  return <div className="page-stack">
    <MetricGrid metrics={[
      ["快照时间", formatDate(ops.retrievedAt), "green", "本次 MCP 拉取"],
      ["上游数据时间", formatDate(ops.dataAsOf), "blue", "项目间可能不同"],
      ["产出增量", `+${formatInteger(ops.snapshotComparison.outputDelta)}`, "green", `较 ${formatDate(ops.snapshotComparison.previousRetrievedAt)}`],
      ["建议节点已过", formatInteger(ops.taskSchedule.suggestedFinishElapsed), "orange", "不是成员逾期数"],
      ["建议节点未到", formatInteger(ops.taskSchedule.suggestedFinishUpcoming), "purple", ops.taskSchedule.allOpenAtRetrievedAt ? `${formatInteger(ops.taskSchedule.total)} 个任务均在开放窗` : "部分任务开放状态待核对"],
      ["历史期数", formatInteger(ops.historicalPeriodCount), "gold", "activityList 时间轴"],
    ]} />
    <div className="two-col equal-cols">
      <Card><h2>本次项目快照</h2><InfoRows rows={[
        ["报名人数", formatInteger(sum(ops.projects, "joinCount"))],
        ["审核可见产出", formatInteger(sum(ops.projects, "outputCount"))],
        ["已点评作业", formatInteger(sum(ops.projects, "reviewedCount"))],
        ["未点评作业", formatInteger(sum(ops.projects, "unreviewedCount"))],
        ["任务定义", formatInteger(sum(ops.projects, "taskCount"))],
        ["可见问答", formatInteger(sum(ops.projects, "qaTotal"))],
        ["待回答状态", formatInteger(sum(ops.projects, "qaOpen"))],
        ["已解决状态", formatInteger(sum(ops.projects, "qaResolved"))],
      ]} /></Card>
      <Card><h2>近 8 期项目数量</h2><TrendChart data={ops.recentTimeline.map((item) => ({ label: item.label, value: item.projects }))} /></Card>
    </div>
    <div className="two-col equal-cols">
      <Card><h2>任务节奏</h2><CompareBars rows={[
        { label: "建议节点已过", value: ops.taskSchedule.suggestedFinishElapsed, max: Math.max(1, ops.taskSchedule.total), display: `${ops.taskSchedule.suggestedFinishElapsed}/${ops.taskSchedule.total}` },
        { label: "建议节点未到", value: ops.taskSchedule.suggestedFinishUpcoming, max: Math.max(1, ops.taskSchedule.total), display: `${ops.taskSchedule.suggestedFinishUpcoming}/${ops.taskSchedule.total}` },
      ]} /><p className="card-note">表示任务配置中的建议完成时间，不代表成员已完成或逾期。</p></Card>
      <Card><h2>手册覆盖</h2><InfoRows rows={[
        ["目录节点", formatInteger(ops.manualCoverage.tocCount)],
        ["可读正文节点", formatInteger(ops.manualCoverage.readableCount)],
        ["覆盖项目", `${ops.projects.length} / ${ops.projects.length}`],
        ["正文覆盖率", `${((ops.manualCoverage.readableCount / Math.max(1, ops.manualCoverage.tocCount)) * 100).toFixed(1)}%`],
      ]} /></Card>
    </div>
    <Card><h2>逐项目数据新鲜度</h2><DataTable headers={["项目", "上游数据时间", "最近审核可见提交", "手册正文", "状态"]} rows={ops.projects.map((project) => [project.name, formatDate(project.dataAsOf), formatDate(project.lastSubmissionAt), `${formatInteger(project.manualReadableCount ?? 0)} / ${formatInteger(project.manualTocCount ?? 0)}`, <ProjectQualityTag key={project.id} project={project} />])} /></Card>
    <section className="boundary-banner"><strong>趋势说明</strong><span>当前只有单次正式运营快照，不能补造逐日趋势。后续每天保存同一组 MCP 指标后，才会形成真实日变化。</span></section>
  </div>;
}

function CompareView({ ops }: { ops: McpOpsSnapshot }) {
  const [type, setType] = useState("全部类型");
  const [platform, setPlatform] = useState("全部方向");
  const types = [...new Set(ops.projects.map((project) => project.type))];
  const platforms = [...new Set(ops.projects.flatMap((project) => project.platforms))];
  const projects = ops.projects.filter((project) => (type === "全部类型" || project.type === type) && (platform === "全部方向" || project.platforms.includes(platform)));

  return <div className="page-stack">
    <div className="filter-bar"><select value={type} onChange={(event) => setType(event.target.value)}><option>全部类型</option>{types.map((item) => <option key={item}>{item}</option>)}</select><select value={platform} onChange={(event) => setPlatform(event.target.value)}><option>全部方向</option>{platforms.map((item) => <option key={item}>{item}</option>)}</select><span className="filter-result">当前显示 {projects.length} 个项目</span></div>
    <Card><h2>项目横向对比</h2><DataTable headers={["项目", "方向", "报名", "产出", "未点评", "点评覆盖", "任务", "待回答", "百人待回答", "剩余天数"]} rows={projects.map((project) => [project.name, project.platforms.join(" / "), formatInteger(project.joinCount), `${project.outputCountAtBoundary ? "≥" : ""}${formatInteger(project.outputCount)}`, `${project.outputCountAtBoundary ? "≥" : ""}${formatInteger(project.unreviewedCount ?? 0)}`, `${reviewCoverage(project).toFixed(2)}%`, project.taskCount, project.qaPartialResults ? `≥${formatInteger(project.qaOpen)}` : formatInteger(project.qaOpen), openQaPerHundred(project).toFixed(1), daysRemaining(project)])} /></Card>
    <div className="three-col">
      <Card><h2>作业密度</h2><BarList items={[...projects].sort((a, b) => outputDensity(b) - outputDensity(a)).map((project) => ({ name: project.name, value: outputDensity(project) }))} format={(value) => value.toFixed(2)} /></Card>
      <Card><h2>点评覆盖</h2><BarList items={[...projects].sort((a, b) => reviewCoverage(b) - reviewCoverage(a)).map((project) => ({ name: project.name, value: reviewCoverage(project) }))} format={(value) => `${value.toFixed(2)}%`} /></Card>
      <Card><h2>百人待回答</h2><BarList items={[...projects].sort((a, b) => openQaPerHundred(b) - openQaPerHundred(a)).map((project) => ({ name: project.name, value: openQaPerHundred(project) }))} format={(value) => value.toFixed(1)} /></Card>
    </div>
  </div>;
}

function DataScopeView({ ops }: { ops: McpOpsSnapshot }) {
  return <div className="page-stack">
    <MetricGrid metrics={[
      ["数据源", "生财 MCP", "green", "唯一业务数据源"],
      ["项目范围", ops.label, "gold", `${ops.projects.length} 个项目`],
      ["个人信息", "不保存", "blue", "无成员标识和原文"],
      ["群聊数据", "未使用", "orange", "ZIP 同步已关闭"],
    ]} />
    <div className="two-col equal-cols">
      <Card className="source-checks-card"><h2>MCP 工具健康</h2><DataTable headers={["工具", "状态", "面板用途"]} rows={ops.sourceChecks.map((item) => [item.tool, <Tag key={item.tool} tone={item.status === "正常" ? "green" : "orange"}>{item.status}</Tag>, item.scope])} /></Card>
      <Card><h2>指标定义</h2><InfoRows rows={[
        ["报名人数", "activityList 返回的 joinCnt"],
        ["审核可见产出", "searchActivityOutputs / 可见作业接口返回的任务制作业总数"],
        ["已点评 / 未点评", "searchVisibleActivitySubmissions 的导师点评状态，不是内容审核状态"],
        ["人均作业密度", "审核可见产出 ÷ 报名人数，不是完成率"],
        ["待回答问答", "searchActivityQa 中 questionStatus=1"],
        ["已解决问答", "searchActivityQa 中 questionStatus=2"],
        ["手册正文节点", "activityManualToc 中 hasContent=true 的节点数，不是阅读率"],
        ["建议节点已过", "任务建议完成时间已过，不是成员逾期或未完成"],
        ["剩余天数", "按北京时间日历日计算到项目结束日期"],
      ]} /></Card>
    </div>
    <Card><h2>公开边界</h2><div className="boundary-grid"><Boundary title="允许展示" text="项目名称、类型、方向、目标、报名数、任务数、作业与点评聚合、问答状态、手册覆盖、时间节点和聚合建议。" /><Boundary title="不进入网站" text="成员身份、memberRef、作业原文、问答原文、联系方式、群聊、ZIP、证据编号和未经确认的个人好事。" /><Boundary title="当前不能判断" text="独立提交人数、完课率、内容质量、GMV、转化、答疑 SLA、真实好事映射和成员学习进度。" /></div></Card>
  </div>;
}

function ProjectTable({ projects }: { projects: McpProject[] }) {
  return <DataTable headers={["项目", "类型", "报名", "产出", "未点评", "待回答", "下一节点", "剩余"]} rows={projects.map((project) => [<div className="project-name-cell" key={`${project.id}-name`}><Image src={project.avatar} alt="" width={32} height={32} unoptimized /><span><b>{project.name}</b><small>{project.platforms.join(" / ")}</small></span></div>, project.type, formatInteger(project.joinCount), `${project.outputCountAtBoundary ? "≥" : ""}${formatInteger(project.outputCount)}`, `${project.outputCountAtBoundary ? "≥" : ""}${formatInteger(project.unreviewedCount ?? 0)}`, project.qaPartialResults ? `≥${formatInteger(project.qaOpen)}` : formatInteger(project.qaOpen), <span className="milestone-cell" key={`${project.id}-milestone`}>{project.nextMilestone}<small>{formatDate(project.nextDueAt)}</small></span>, `${daysRemaining(project)} 天`])} />;
}

function MetricGrid({ metrics, compact = false }: { metrics: [string, string, string, string?][]; compact?: boolean }) {
  return <section className={`metric-band mcp-metrics ${compact ? "compact" : ""}`}>{metrics.map(([label, value, tone, note]) => <div className={`metric-item ${tone}`} key={label}><small>{label}</small><strong className={/[\u4e00-\u9fa5]/.test(value) || value.length > 8 ? "text-value" : ""}>{value}</strong>{note ? <em>{note}</em> : null}</div>)}</section>;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) { return <section className={`card ${className}`}>{children}</section>; }

function DataTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  if (!rows.length) return <div className="empty-state"><p>当前筛选条件下暂无数据。</p></div>;
  return <div className="table-scroll"><table className="data-table"><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>;
}

function Tag({ children, tone = "green" }: { children: React.ReactNode; tone?: string }) { return <span className={`tag ${tone}`}>{children}</span>; }

function ProjectQualityTag({ project }: { project: McpProject }) {
  if (project.outputCountAtBoundary) return <Tag tone="orange">产出为下限</Tag>;
  if (project.qaPartialResults) return <Tag tone="orange">问答部分结果</Tag>;
  return <Tag tone="green">聚合完整</Tag>;
}

function BarList({ items, format }: { items: { name: string; value: number }[]; format: (value: number) => string }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return <div className="bar-list mcp-bar-list">{items.map((item) => <div className="bar-row" key={item.name}><span title={item.name}>{item.name}</span><div className="bar-track"><i style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }} /></div><b>{format(item.value)}</b></div>)}</div>;
}

function TrendChart({ data }: { data: { label: string; value: number }[] }) {
  return <div className="line-chart" role="img" aria-label="历史项目数量趋势"><ResponsiveContainer width="100%" height={190}><RechartsLineChart data={data} margin={{ top: 12, right: 16, left: -20, bottom: 0 }}><CartesianGrid stroke="#ECEFEC" strokeDasharray="4 4" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#E2E6E3" }} tick={{ fill: "#5F6B66", fontSize: 11 }} /><YAxis allowDecimals={false} tickLine={false} axisLine={{ stroke: "#E2E6E3" }} tick={{ fill: "#5F6B66", fontSize: 11 }} /><Tooltip contentStyle={{ borderRadius: 6, borderColor: "#E2E6E3" }} /><Line type="monotone" dataKey="value" stroke="#237B69" strokeWidth={3} dot={{ r: 4, fill: "#fff", stroke: "#237B69", strokeWidth: 2 }} isAnimationActive={false} /></RechartsLineChart></ResponsiveContainer></div>;
}

function SectionHead({ title, note, action, onAction }: { title: string; note: string; action?: string; onAction?: () => void }) { return <div className="section-head"><div><h2>{title}</h2><p>{note}</p></div>{action ? <button className="ghost" onClick={onAction}>{action}</button> : null}</div>; }
function Signal({ tone, label, value, detail }: { tone: string; label: string; value: string; detail: string }) { return <article className={`signal-item ${tone}`}><small>{label}</small><strong>{value}</strong><p>{detail}</p></article>; }
function TimelineRow({ label, value, state }: { label: string; value: string; state: string }) { return <div className={`timeline-row ${state}`}><i /><span>{label}</span><b>{value}</b></div>; }
function Judgement({ label, text }: { label: string; text: string }) { return <article><small>{label}</small><p>{text}</p></article>; }
function Boundary({ title, text }: { title: string; text: string }) { return <article><h3>{title}</h3><p>{text}</p></article>; }
function InfoRows({ rows }: { rows: [string, string][] }) { return <dl className="info-rows">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>; }
function CompareBars({ rows }: { rows: { label: string; value: number; max: number; display: string }[] }) { return <div className="compare-bars">{rows.map((row) => <div key={row.label}><span>{row.label}</span><div className="bar-track"><i style={{ width: `${Math.min(100, (row.value / row.max) * 100)}%` }} /></div><b>{row.display}</b></div>)}</div>; }
function EmptyState({ title, text }: { title: string; text: string }) { return <div className="page-stack"><Card><div className="empty-state"><h2>{title}</h2><p>{text}</p></div></Card></div>; }
