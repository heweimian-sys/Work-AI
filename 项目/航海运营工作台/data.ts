export type Mode = "demo" | "api";

export type ProjectId = "proj_xhs_03" | "proj_video_02" | "proj_private_05" | "proj_planet_01";

export type Project = {
  project_id: ProjectId;
  name: string;
  stage: string;
  day: number;
  status: string;
  risk: "低风险" | "中风险" | "高风险";
  summary: string;
  todayGoodNews: number;
  actions: number;
  coverage: string;
};

export type GoodNews = {
  good_news_id: string;
  project_id: ProjectId;
  group_id: string;
  request_id: string;
  evidence_ids: string[];
  time: string;
  project: string;
  group: string;
  sailor: string;
  summary: string;
  original: string;
  type: string;
  confidence: number;
  status: string;
  spreadable: boolean;
};

export type Action = {
  action_id: string;
  project_id: ProjectId;
  group_id: string;
  evidence_ids: string[];
  priority: "P1" | "P2" | "P3";
  project: string;
  issue: string;
  suggestion: string;
  source: "航海好事" | "风险异常" | "日报" | "群组观察";
  owner: string;
  due: string;
  status: "待处理" | "进行中" | "待确认" | "已完成";
  groupName: string;
};

export type Report = {
  request_id: string;
  project_id: ProjectId;
  project: string;
  date: string;
  status: "待确认" | "已确认";
  goodNews: number;
  actions: number;
  coverage: string;
  raw: number;
  deduped: number;
  updatedAt: string;
  dataStatus: string;
  mainLine: string;
};

export type Group = {
  group_id: string;
  project_id: ProjectId;
  project: string;
  group: string;
  messages: number;
  interactions: number;
  questions: number;
  leads: number;
  status: "高活跃" | "正常" | "低活跃" | "无互动";
  dataStatus: "已覆盖" | "未覆盖";
  riskReason?: string;
};

export type Evidence = {
  evidence_id: string;
  source: "群聊原文" | "截图" | "日报" | "飞书表格" | "运营备注";
  project_id: ProjectId;
  group_id: string;
  request_id: string;
  project: string;
  group: string;
  summary: string;
  related: string;
  trust: "已核实" | "待核实" | "存疑";
  time: string;
  raw: string;
  good_news_id?: string;
  action_id?: string;
};

export type DashboardData = {
  mode: Mode;
  date: string;
  projects: Project[];
  goodNews: GoodNews[];
  actions: Action[];
  reports: Report[];
  groups: Group[];
  evidence: Evidence[];
  trends: { date: string; goodNews: number; messages: number; interactions: number; activeGroups: number; lowGroups: number }[];
  topics: { name: string; count: number }[];
};

const projects: Project[] = [
  { project_id: "proj_xhs_03", name: "小红书实战营 3 期", stage: "航行第 12 天", day: 12, status: "正常推进", risk: "低风险", summary: "进展顺利，持续产出优质内容", todayGoodNews: 6, actions: 3, coverage: "7 / 8" },
  { project_id: "proj_video_02", name: "视频号实战营 2 期", stage: "航行第 10 天", day: 10, status: "稳步推进", risk: "低风险", summary: "稳步推进，内容数据持续增长", todayGoodNews: 5, actions: 3, coverage: "6 / 7" },
  { project_id: "proj_private_05", name: "私域增长训练营 5 期", stage: "航行第 8 天", day: 8, status: "需关注活跃", risk: "中风险", summary: "成交提升明显，转化表现良好", todayGoodNews: 4, actions: 2, coverage: "5 / 6" },
  { project_id: "proj_planet_01", name: "知识星球运营营 1 期", stage: "航行第 14 天", day: 14, status: "留存稳定", risk: "低风险", summary: "用户活跃提升，留存稳定", todayGoodNews: 3, actions: 2, coverage: "5 / 5" },
];

const goodNews: GoodNews[] = [
  { good_news_id: "GN-0214", project_id: "proj_xhs_03", group_id: "GRP-0007", request_id: "REQ-0817-XS-03", evidence_ids: ["EV-0821"], time: "08-17 10:23", project: "小红书实战营 3 期", group: "3 群", sailor: "航海家_小满", summary: "首个资料包成交 128 元", original: "第一个资料包成交，收到128元，终于跑通了第一单", type: "出单/成交", confidence: 92, status: "待跟进", spreadable: true },
  { good_news_id: "GN-0213", project_id: "proj_video_02", group_id: "GRP-0012", request_id: "REQ-0817-SP-02", evidence_ids: ["EV-0819"], time: "08-17 09:05", project: "视频号实战营 2 期", group: "2 群", sailor: "海风_阿远", summary: "连续 30 天写作发布第 15 篇", original: "今天第15篇发出去了，单条播放破 1 万", type: "完成作品", confidence: 90, status: "已记录", spreadable: false },
  { good_news_id: "GN-0212", project_id: "proj_private_05", group_id: "GRP-0020", request_id: "REQ-0816-SY-05", evidence_ids: ["EV-0816"], time: "08-16 21:47", project: "私域增长训练营 5 期", group: "5 群", sailor: "灯塔_思思", summary: "单条视频播放破 10 万，新增粉丝 2300+", original: "单条视频破10万了，新增粉丝2300多", type: "涨粉", confidence: 88, status: "可传播", spreadable: true },
  { good_news_id: "GN-0211", project_id: "proj_xhs_03", group_id: "GRP-0007", request_id: "REQ-0816-XS-03", evidence_ids: ["EV-0814"], time: "08-16 18:32", project: "小红书实战营 3 期", group: "3 群", sailor: "航行者_小北", summary: "完成选题验证", original: "终于完成选题验证，笔记被官方收录，获得流量推荐", type: "突破卡点", confidence: 82, status: "待核实", spreadable: false },
  { good_news_id: "GN-0210", project_id: "proj_planet_01", group_id: "GRP-0031", request_id: "REQ-0816-ZS-01", evidence_ids: ["EV-0812"], time: "08-16 16:08", project: "知识星球运营营 1 期", group: "1 群", sailor: "星航_老K", summary: "收到第二位付费客户，完成咨询闭环", original: "今天收到第二个付费客户，咨询流程闭环了", type: "获得客户", confidence: 86, status: "已跟进", spreadable: true },
];

const actions: Action[] = [
  { action_id: "ACT-0817-03", project_id: "proj_private_05", group_id: "GRP-0020", evidence_ids: ["EV-0821", "EV-0823"], priority: "P1", project: "私域增长训练营 5 期", issue: "激活低活跃群", suggestion: "发送价值内容并引导互动，提高群活跃度", source: "群组观察", owner: "航海家_小满", due: "今天", status: "待处理", groupName: "核心学员群" },
  { action_id: "ACT-0817-02", project_id: "proj_xhs_03", group_id: "GRP-0007", evidence_ids: ["EV-0821"], priority: "P1", project: "小红书实战营 3 期", issue: "补充首个成交案例截图", suggestion: "补充完整成交证据截图并上传", source: "航海好事", owner: "航海家_小满", due: "今天", status: "待处理", groupName: "3 群" },
  { action_id: "ACT-0817-01", project_id: "proj_video_02", group_id: "GRP-0012", evidence_ids: ["EV-0819"], priority: "P1", project: "视频号实战营 2 期", issue: "跟进连续 3 天未交日报", suggestion: "私信提醒并确认未交原因", source: "日报", owner: "航海家_阿泽", due: "今天", status: "待处理", groupName: "2 群" },
  { action_id: "ACT-0816-05", project_id: "proj_planet_01", group_id: "GRP-0031", evidence_ids: ["EV-0812"], priority: "P2", project: "知识星球运营营 1 期", issue: "优化星球主页定位", suggestion: "调整定位与价值主张文案", source: "日报", owner: "航海家_阿泽", due: "今天", status: "进行中", groupName: "1 群" },
  { action_id: "ACT-0816-04", project_id: "proj_xhs_03", group_id: "GRP-0008", evidence_ids: ["EV-0815"], priority: "P2", project: "小红书实战营 3 期", issue: "整理高频问题答疑", suggestion: "整理 TOP10 问题并回发群内", source: "群组观察", owner: "航海家_小满", due: "今天", status: "进行中", groupName: "8 群" },
  { action_id: "ACT-0820-01", project_id: "proj_private_05", group_id: "GRP-0021", evidence_ids: ["EV-0817"], priority: "P3", project: "私域增长训练营 5 期", issue: "沉淀高价值内容为笔记", suggestion: "将群内干货整理为图文笔记", source: "群组观察", owner: "航海家_小满", due: "8月20日", status: "待确认", groupName: "5 群" },
];

const reports: Report[] = [
  { request_id: "REQ-0817-XS-03", project_id: "proj_xhs_03", project: "小红书实战营 3 期", date: "8月17日", status: "待确认", goodNews: 6, actions: 3, coverage: "7/8", raw: 1842, deduped: 1678, updatedAt: "09:35", dataStatus: "基本完整", mainLine: "学员持续打卡输出，内容质量提升明显，转化意向增强" },
  { request_id: "REQ-0817-SP-02", project_id: "proj_video_02", project: "视频号实战营 2 期", date: "8月17日", status: "待确认", goodNews: 5, actions: 2, coverage: "6/7", raw: 1506, deduped: 1391, updatedAt: "09:28", dataStatus: "基本完整", mainLine: "内容发布节奏稳定，播放数据持续增长" },
  { request_id: "REQ-0817-SY-05", project_id: "proj_private_05", project: "私域增长训练营 5 期", date: "8月17日", status: "待确认", goodNews: 4, actions: 2, coverage: "5/6", raw: 1220, deduped: 1104, updatedAt: "09:31", dataStatus: "缺少 1 群", mainLine: "成交截图与朋友圈反馈增加，但低活跃群需介入" },
  { request_id: "REQ-0816-XS-02", project_id: "proj_video_02", project: "小红书实战营 2 期", date: "8月17日", status: "已确认", goodNews: 7, actions: 4, coverage: "8/8", raw: 1960, deduped: 1812, updatedAt: "昨天", dataStatus: "完整", mainLine: "案例数量增长，优质复盘可沉淀" },
];

const groups: Group[] = [
  { group_id: "GRP-0004", project_id: "proj_xhs_03", project: "小红书实战营", group: "4 群", messages: 156, interactions: 62, questions: 11, leads: 2, status: "高活跃", dataStatus: "已覆盖" },
  { group_id: "GRP-0022", project_id: "proj_private_05", project: "私域增长训练营", group: "2 群", messages: 132, interactions: 48, questions: 9, leads: 1, status: "高活跃", dataStatus: "已覆盖" },
  { group_id: "GRP-0011", project_id: "proj_video_02", project: "视频号实战营", group: "1 群", messages: 118, interactions: 41, questions: 7, leads: 1, status: "高活跃", dataStatus: "已覆盖" },
  { group_id: "GRP-0031", project_id: "proj_planet_01", project: "知识星球运营营", group: "1 群", messages: 96, interactions: 28, questions: 5, leads: 0, status: "正常", dataStatus: "已覆盖" },
  { group_id: "GRP-0008", project_id: "proj_xhs_03", project: "小红书实战营", group: "8 群", messages: 34, interactions: 8, questions: 2, leads: 0, status: "低活跃", dataStatus: "已覆盖", riskReason: "连续 2 天负面增多" },
  { group_id: "GRP-0017", project_id: "proj_video_02", project: "视频号实战营", group: "7 群", messages: 0, interactions: 0, questions: 0, leads: 0, status: "无互动", dataStatus: "未覆盖", riskReason: "连续 3 天无互动" },
];

const evidence: Evidence[] = [
  { evidence_id: "EV-0821", source: "群聊原文", project_id: "proj_xhs_03", group_id: "GRP-0007", request_id: "REQ-0817-XS-03", project: "小红书实战营 3 期", group: "3 群", summary: "第一个资料包成交，收到128元...", related: "航海好事 GN-0214", trust: "已核实", time: "08-17 09:41", raw: "第一个资料包成交，收到128元，终于跑通了第一单", good_news_id: "GN-0214" },
  { evidence_id: "EV-0819", source: "截图", project_id: "proj_xhs_03", group_id: "GRP-0007", request_id: "REQ-0817-XS-03", project: "小红书实战营 3 期", group: "3 群", summary: "学员反馈：方法很有效，已经...", related: "行动 ACT-0817-03", trust: "已核实", time: "08-17 08:31", raw: "学员反馈方法有效，已开始稳定发布", action_id: "ACT-0817-03" },
  { evidence_id: "EV-0817", source: "日报", project_id: "proj_private_05", group_id: "GRP-0020", request_id: "REQ-0817-SY-05", project: "私域增长训练营 5 期", group: "5 群", summary: "今日新增 12 位订阅，转化率...", related: "日报 REQ-0817-XS-03", trust: "待核实", time: "08-17 07:12", raw: "今日新增12位订阅，转化率提升", good_news_id: "GN-0210" },
  { evidence_id: "EV-0816", source: "飞书表格", project_id: "proj_video_02", group_id: "GRP-0012", request_id: "REQ-0816-SP-02", project: "视频号实战营 2 期", group: "2 群", summary: "第 3 条笔记播放破 1 万，数据...", related: "航海好事 GN-0212", trust: "已核实", time: "08-16 23:05", raw: "第3条笔记播放破1万，数据继续增长", good_news_id: "GN-0212" },
  { evidence_id: "EV-0814", source: "运营备注", project_id: "proj_planet_01", group_id: "GRP-0031", request_id: "REQ-0816-ZS-01", project: "知识星球运营营 1 期", group: "1 群", summary: "用户反馈：已经能稳定执行...", related: "行动 ACT-0814-01", trust: "待核实", time: "08-16 19:33", raw: "用户反馈已经能稳定执行发布计划", action_id: "ACT-0814-01" },
];

export const repository = {
  getDashboardData(mode: Mode = "demo"): DashboardData {
    return {
      mode,
      date: "8月17日",
      projects,
      goodNews,
      actions,
      reports,
      groups,
      evidence,
      trends: [
        { date: "8/11", goodNews: 8, messages: 892, interactions: 312, activeGroups: 5, lowGroups: 2 },
        { date: "8/12", goodNews: 12, messages: 1034, interactions: 398, activeGroups: 6, lowGroups: 2 },
        { date: "8/13", goodNews: 9, messages: 986, interactions: 356, activeGroups: 7, lowGroups: 2 },
        { date: "8/14", goodNews: 14, messages: 1102, interactions: 421, activeGroups: 8, lowGroups: 1 },
        { date: "8/15", goodNews: 16, messages: 1198, interactions: 468, activeGroups: 6, lowGroups: 2 },
        { date: "8/16", goodNews: 21, messages: 1346, interactions: 532, activeGroups: 6, lowGroups: 2 },
        { date: "8/17", goodNews: 18, messages: 1245, interactions: 487, activeGroups: 7, lowGroups: 2 },
      ],
      topics: [
        { name: "标题优化", count: 23 },
        { name: "内容选题", count: 18 },
        { name: "流量推荐", count: 15 },
        { name: "成交方法", count: 12 },
        { name: "私域转化", count: 9 },
      ],
    };
  },
};
