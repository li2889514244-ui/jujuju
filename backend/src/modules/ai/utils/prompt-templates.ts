// Prompt Template Management
// Centralized prompt templates for all AI features

export interface PromptTemplate {
  id: string;
  name: string;
  template: string;
  variables: string[];
  category: 'content' | 'publish' | 'trend' | 'anomaly' | 'review';
}

const templates: PromptTemplate[] = [
  // ===== Content Generation =====
  {
    id: 'video_script',
    name: '视频脚本生成',
    template: `你是一位专业的短视频内容创作者。请根据以下信息生成一个高质量的短视频脚本。

主题：{{topic}}
平台：{{platform}}
目标受众：{{audience}}
风格：{{style}}
{{#reference}}参考内容：{{reference}}{{/reference}}

请输出：
1. 视频标题（吸引眼球，15字以内）
2. 开头hook（前3秒抓住观众）
3. 主体内容（分段落，标注画面建议）
4. 结尾引导（关注/点赞/评论引导）
5. 推荐标签（5-8个）`,
    variables: ['topic', 'platform', 'audience', 'style', 'reference'],
    category: 'content',
  },
  {
    id: 'title_optimization',
    name: '标题优化',
    template: `你是一位擅长标题创作的运营专家。请为以下内容生成{{count}}个优化标题。

原始内容：{{topic}}
平台：{{platform}}
目标受众：{{audience}}

要求：
- 标题要吸引点击但不标题党
- 符合{{platform}}平台风格
- 包含悬念或价值点
- 控制在20字以内

请输出格式：
1. [标题] - 创作思路
2. [标题] - 创作思路
...`,
    variables: ['topic', 'platform', 'audience', 'count'],
    category: 'content',
  },
  {
    id: 'tag_recommendation',
    name: '标签推荐',
    template: `你是一位社交媒体运营专家。请为以下内容推荐热门标签。

内容主题：{{topic}}
平台：{{platform}}
{{#reference}}参考标签：{{reference}}{{/reference}}

请推荐：
- 5个高热度大标签（100万+使用量）
- 5个精准中标签（10-100万使用量）
- 3个长尾小标签（竞争小，容易获得曝光）

格式：标签名 | 预估热度 | 推荐理由`,
    variables: ['topic', 'platform', 'reference'],
    category: 'content',
  },
  {
    id: 'caption_generation',
    name: '文案生成',
    template: `请为以下内容生成吸引人的{{platform}}文案。

主题：{{topic}}
风格：{{style}}
目标受众：{{audience}}

要求：
- 开头有hook
- 中间有干货或情感共鸣
- 结尾有互动引导
- 适当使用emoji
- 字数控制在300字以内`,
    variables: ['topic', 'platform', 'style', 'audience'],
    category: 'content',
  },

  // ===== Publish Optimization =====
  {
    id: 'best_publish_time',
    name: '最佳发布时间',
    template: `你是一位资深的社交媒体运营分析师。请分析以下信息，推荐最佳发布时段。

平台：{{platform}}
内容类型：{{contentType}}
目标受众：{{audience}}
{{#historicalData}}历史数据：{{historicalData}}{{/historicalData}}

请分析并推荐：
1. 最佳发布时间段（具体到小时）
2. 每个时段的推荐理由
3. 一周中最佳发布日
4. 避免的时间段及原因`,
    variables: ['platform', 'contentType', 'audience', 'historicalData'],
    category: 'publish',
  },
  {
    id: 'publish_frequency',
    name: '发布频率优化',
    template: `请根据以下信息，制定最优发布频率策略。

平台：{{platform}}
内容类型：{{contentType}}
目标受众：{{audience}}
{{#historicalData}}历史数据：{{historicalData}}{{/historicalData}}

请输出：
1. 推荐发布频率（每日/每周次数）
2. 发布节奏建议
3. 不同阶段的频率调整策略
4. 内容矩阵建议（不同类型内容的配比）`,
    variables: ['platform', 'contentType', 'audience', 'historicalData'],
    category: 'publish',
  },

  // ===== Trend Prediction =====
  {
    id: 'follower_growth',
    name: '粉丝增长预测',
    template: `请根据以下数据预测粉丝增长趋势。

平台：{{platform}}
当前粉丝数：{{currentFollowers}}
历史增长数据：{{historicalData}}
预测周期：{{days}}天

请输出：
1. 预测增长曲线（按周）
2. 关键增长节点
3. 增长策略建议
4. 风险因素预警`,
    variables: ['platform', 'currentFollowers', 'historicalData', 'days'],
    category: 'trend',
  },
  {
    id: 'content_trend',
    name: '内容趋势分析',
    template: `请分析当前{{platform}}平台的内容趋势。

当前领域：{{topic}}
目标受众：{{audience}}

请分析：
1. 近期热门话题/挑战
2. 内容形式趋势（时长、风格、音乐等）
3. 值得关注的新兴趋势
4. 未来1-2个月的趋势预判
5. 内容创作建议`,
    variables: ['platform', 'topic', 'audience'],
    category: 'trend',
  },

  // ===== Anomaly Detection =====
  {
    id: 'data_anomaly',
    name: '数据异常检测',
    template: `请分析以下数据是否存在异常。

指标类型：{{metric}}
平台：{{platform}}
数据集：{{dataset}}
敏感度：{{sensitivity}}

请分析：
1. 是否存在异常数据点
2. 异常类型（突增/突降/持续偏离）
3. 可能的原因分析
4. 建议的处理措施`,
    variables: ['metric', 'platform', 'dataset', 'sensitivity'],
    category: 'anomaly',
  },

  // ===== Content Review =====
  {
    id: 'content_review',
    name: '内容审核',
    template: `请对以下内容进行合规性审核。

内容：{{content}}
平台：{{platform}}
严格程度：{{strictness}}

请检查：
1. 是否包含违规内容（色情、暴力、政治敏感等）
2. 是否包含敏感词汇
3. 是否存在虚假宣传风险
4. 是否违反{{platform}}平台规则
5. 整体风险等级：低/中/高
6. 修改建议（如有）`,
    variables: ['content', 'platform', 'strictness'],
    category: 'review',
  },
];

// Template engine (simple mustache-like)
export function renderTemplate(templateId: string, vars: Record<string, unknown>): string {
  const tpl = templates.find((t) => t.id === templateId);
  if (!tpl) throw new Error(`Template "${templateId}" not found`);

  let result = tpl.template;

  // Replace {{var}} patterns
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value ?? ''));
  }

  // Handle conditional blocks {{#var}}...{{/var}}
  for (const [key, value] of Object.entries(vars)) {
    const condRegex = new RegExp(`\\{\\{#${key}\\}\\}([\\s\\S]*?)\\{\\{/${key}\\}\\}`, 'g');
    if (value) {
      result = result.replace(condRegex, '$1');
    } else {
      result = result.replace(condRegex, '');
    }
  }

  // Clean up remaining unresolved conditionals
  result = result.replace(/\{\{#\w+\}\}[\s\S]*?\{\{\/\w+\}\}/g, '');

  return result.trim();
}

export function getTemplate(id: string): PromptTemplate | undefined {
  return templates.find((t) => t.id === id);
}

export function getTemplatesByCategory(category: PromptTemplate['category']): PromptTemplate[] {
  return templates.filter((t) => t.category === category);
}
