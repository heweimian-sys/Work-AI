/**
 * tools/feedback.js — 反馈处理工具（Phase 1 占位）
 *
 * 当前仅返回感谢语，后续 Phase 4 可接入：
 * - 飞书消息卡片的 "有用/没用" 按钮
 * - 将反馈写入多维表格或数据库
 * - 根据反馈调整排序权重
 */

export async function run(args) {
  const { event } = args;
  const text = (event.userText ?? '').trim();

  const isPositive = /有用|对的|好的|谢谢|可以|不错|赞|👍|👌/.test(text);
  const isNegative = /没用|不对|错的|不行|不好|垃圾|👎/.test(text);

  if (isPositive) {
    return { text: '收到，你的认可是我们优化的动力。' };
  }
  if (isNegative) {
    return { text: '收到，我会把这个反馈记录下来，后续改进。你也可以直接告诉运营同学补录资料。' };
  }

  return { text: '已记录你的反馈。' };
}
