import cover from '../assets/cover.webp';
import cup from '../assets/cup.webp';
import beans from '../assets/beans.webp';

export const images = { cover, cup, beans };

/* ---------------- 枚举（对齐 API 契约 0.3） ---------------- */

export const ROLES = {
  super: { label: '超级管理员', short: '超级', color: '#3e9b77', bg: '#e8f8f1' },
  admin: { label: '管理员', short: '管理员', color: '#3e86a9', bg: '#e6f4fa' },
  editor: { label: '编辑者', short: '编辑', color: '#0e9c8b', bg: '#edfaf7' },
  viewer: { label: '查看者', short: '查看', color: '#7c9b96', bg: '#f3f6f6' },
};

export const ROLE_KEYS = ['super', 'admin', 'editor', 'viewer'];

export const ASSET_TYPES = [
  { key: 'video', label: '视频' },
  { key: 'image', label: '图片' },
  { key: 'document', label: '文档' },
];

/* 素材来源（对齐 API 契约 0.3 asset_source） */
export const ASSET_SOURCE = {
  upload: { key: 'upload', label: '上传', tone: 'gray' },
  task: { key: 'task', label: '任务产出', tone: 'mint' },
  draft: { key: 'draft', label: '草稿', tone: 'amber' },
};

export const ASSET_SOURCE_FILTERS = [
  { key: 'all', label: '全部来源' },
  { key: 'upload', label: '上传' },
  { key: 'task', label: '任务产出' },
  { key: 'draft', label: '草稿' },
];

/* 视频水印可接受的本地导入格式 */
export const VIDEO_ACCEPT = ['.mp4', '.mov', '.mkv', '.webm'];
export const VIDEO_MAX_BYTES = 2 * 1024 * 1024 * 1024;

export const TASK_TYPES = {
  video: { label: '视频水印', icon: 'video', color: '#0e9c8b', bg: '#edfaf7' },
  article: { label: '文章编写', icon: 'doc', color: '#3e86a9', bg: '#e6f4fa' },
  prompt: { label: '生图提示词', icon: 'wand', color: '#8a6fbf', bg: '#f2eefb' },
};

export const TASK_STATUS = {
  pending: { label: '待处理', tone: 'amber' },
  processing: { label: '处理中', tone: 'blue' },
  done: { label: '已完成', tone: 'mint' },
  failed: { label: '失败', tone: 'danger' },
  canceled: { label: '已取消', tone: 'gray' },
};

export const POSITIONS = [
  { key: 'left_top', label: '左上' },
  { key: 'top_center', label: '上中' },
  { key: 'right_top', label: '右上' },
  { key: 'left_middle', label: '左中' },
  { key: 'center', label: '居中' },
  { key: 'right_middle', label: '右中' },
  { key: 'left_bottom', label: '左下' },
  { key: 'bottom_center', label: '下中' },
  { key: 'right_bottom', label: '右下' },
];

export const positionLabel = (key) =>
  (POSITIONS.find((p) => p.key === key) || {}).label || '右下';

export const PLATFORMS = [
  { key: 'xhs', label: '小红书' },
  { key: 'weibo', label: '微博' },
  { key: 'wechat', label: '微信公众号' },
  { key: 'douyin', label: '抖音' },
];

export const CONTENT_TYPES = [
  { key: 'science', label: '科普教育' },
  { key: 'commerce', label: '种草带货' },
  { key: 'course', label: '课程转化' },
  { key: 'event', label: '活动引流' },
  { key: 'market', label: '市场分析' },
];

export const AUDIENCES = [
  { key: 'general', label: '通俗' },
  { key: 'professional', label: '专业' },
  { key: 'mixed', label: '混合' },
];

export const KEYWORD_STRATEGIES = [
  { key: 'auto', label: '自动补采' },
  { key: 'existing', label: '只用现成' },
  { key: 'off', label: '不启用' },
];

export const ENCODE_PRESETS = ['ultrafast', 'fast', 'medium', 'slow'];

export const AI_PROVIDERS = [
  { key: 'deepseek', label: 'DeepSeek' },
  { key: 'zhipu', label: '智谱 AI' },
  { key: 'dashscope', label: '阿里云百炼' },
  { key: 'openai', label: 'OpenAI' },
  { key: 'openai_compatible', label: 'OpenAI 兼容' },
];

export const labelOf = (list, key) => (list.find((i) => i.key === key) || {}).label || key;

/* ---------------- 水印方案 ---------------- */

export const defaultWatermark = {
  textOn: true,
  text: '健衡学院',
  textPosition: 'right_bottom',
  fontSize: 40,
  fontColor: '#FFFFFF',
  textOpacity: 0.8,
  logoOn: false,
  logo: null,
  logoPosition: 'left_top',
  logoWidth: 160,
  logoOpacity: 0.85,
  margin: 40,
  crf: 20,
  preset: 'medium',
  threads: 8,
};

export const watermarkPresets = [
  {
    id: 'wc_1',
    name: '默认方案 · 右下角文字',
    isDefault: true,
    config: { ...defaultWatermark },
  },
  {
    id: 'wc_2',
    name: '左上角 Logo · 无文字',
    isDefault: false,
    config: {
      ...defaultWatermark,
      textOn: false,
      logoOn: true,
      logo: { name: '健衡学院-logo.png', src: null },
      logoPosition: 'left_top',
    },
  },
  {
    id: 'wc_3',
    name: '双水印 · 文字右下 + Logo 左上',
    isDefault: false,
    config: {
      ...defaultWatermark,
      text: '健衡学院 · 内部资料',
      fontSize: 32,
      textOpacity: 0.72,
      logoOn: true,
      logo: { name: '健衡学院-logo.png', src: null },
    },
  },
];

/* ---------------- 素材 ---------------- */

const assetSeed = [
  {
    id: 'a_v1',
    name: '夏季新品发布 · 竖版短视频',
    type: 'video',
    ext: 'MP4',
    size: '2.4 MB',
    time: '今天 10:24',
    folder: '市场部 / 夏季新品',
    resolution: '1920 × 1080',
    duration: '01:30',
    img: images.cover,
  },
  {
    id: 'a_v2',
    name: '门店探店混剪',
    type: 'video',
    ext: 'MP4',
    size: '86 MB',
    time: '昨天 18:40',
    folder: '市场部 / 门店',
    resolution: '1920 × 1080',
    duration: '02:12',
    img: images.cup,
  },
  {
    id: 'a_v3',
    name: '新品口播 · 竖版 30s',
    type: 'video',
    ext: 'MP4',
    size: '14 MB',
    time: '昨天 16:02',
    folder: '市场部 / 夏季新品',
    resolution: '1080 × 1920',
    duration: '00:30',
    img: images.beans,
  },
  {
    id: 'a_v4',
    name: '门店环境空镜',
    type: 'video',
    ext: 'MOV',
    size: '34 MB',
    time: '昨天 14:20',
    folder: '市场部 / 门店',
    resolution: '1080 × 1920',
    duration: '00:48',
    tone: 'g3',
    icon: 'film',
    iconColor: '#dceff2',
  },
  {
    id: 'a_i1',
    name: '夏季新品 · 主视觉',
    type: 'image',
    ext: 'JPG',
    size: '1.8 MB',
    time: '今天 09:40',
    folder: '设计 / 主视觉',
    img: images.cover,
  },
  {
    id: 'a_i2',
    name: '门店实拍 · 吧台',
    type: 'image',
    ext: 'PNG',
    size: '2.6 MB',
    time: '昨天 17:12',
    folder: '设计 / 门店',
    img: images.cup,
  },
  {
    id: 'a_i3',
    name: '产品细节 · 咖啡豆',
    type: 'image',
    ext: 'WEBP',
    size: '640 KB',
    time: '2 天前',
    folder: '设计 / 产品',
    img: images.beans,
  },
  {
    id: 'a_d1',
    name: '品牌故事长文案 V3',
    type: 'document',
    ext: 'DOCX',
    size: '18 KB',
    time: '今天 09:12',
    folder: '内容 / 品牌',
    tone: 'g2',
    icon: 'doc',
  },
  {
    id: 'a_d2',
    name: '618 活动价格表',
    type: 'document',
    ext: 'XLSX',
    size: '240 KB',
    time: '昨天 11:05',
    folder: '运营 / 活动',
    tone: 'g7',
    icon: 'doc',
  },
  {
    id: 'a_d3',
    name: '小红书种草文案 · 夏季系列',
    type: 'document',
    ext: 'PDF',
    size: '96 KB',
    time: '2 天前',
    folder: '内容 / 渠道',
    tone: 'g6',
    icon: 'doc',
  },
  {
    id: 'a_d0',
    name: '气压靴种草文 · 草稿',
    type: 'document',
    ext: 'MD',
    size: '4 KB',
    time: '今天 09:20',
    folder: '草稿 / 文章',
    source: 'draft',
    tone: 'g6',
    icon: 'doc',
    content:
      '# 跑完腿沉像灌铅？气压靴到底值不值\n\n最近训练量拉满，小腿每天都像灌了铅。\n\n#气压靴 #运动恢复 #跑步日常\n',
  },
];

export const initialAssets = assetSeed.map((a) => ({ source: 'upload', ...a }));

export const storage = { used: 136, total: 200, unit: 'GB', pct: 68 };

/* ---------------- 成员 ---------------- */

const DEMO_PWD = 'demo1234';

export const initialMembers = [
  {
    id: 'u_1',
    name: '林岸',
    username: 'linan',
    password: DEMO_PWD,
    role: 'super',
    scopeAll: true,
    active: true,
    lastActive: '在线',
    online: true,
    avatar: 'linear-gradient(135deg,#1aae9a,#4db89a)',
  },
  {
    id: 'u_2',
    name: '张嘉怡',
    username: 'zhangjy',
    password: DEMO_PWD,
    role: 'admin',
    scopeAll: true,
    active: true,
    lastActive: '在线',
    online: true,
    avatar: 'linear-gradient(135deg,#479ec9,#73c2e6)',
  },
  {
    id: 'u_3',
    name: '陈默',
    username: 'chenmo',
    password: DEMO_PWD,
    role: 'editor',
    scopeAll: false,
    active: true,
    lastActive: '12 分钟前',
    online: false,
    avatar: 'linear-gradient(135deg,#e3b870,#f2d49e)',
  },
  {
    id: 'u_4',
    name: '苏黎',
    username: 'suli',
    password: DEMO_PWD,
    role: 'viewer',
    scopeAll: false,
    active: true,
    lastActive: '昨天 18:20',
    online: false,
    avatar: 'linear-gradient(135deg,#5cc29e,#9ee0c7)',
  },
  {
    id: 'u_5',
    name: '何书宁',
    username: 'hesn',
    password: DEMO_PWD,
    role: 'editor',
    scopeAll: false,
    active: true,
    lastActive: '3 小时前',
    online: false,
    avatar: 'linear-gradient(135deg,#6bb8a8,#a8dbd1)',
  },
  {
    id: 'u_6',
    name: '郭亦',
    username: 'guoyi',
    password: DEMO_PWD,
    role: 'viewer',
    scopeAll: true,
    active: false,
    lastActive: '5 天前',
    online: false,
    avatar: 'linear-gradient(135deg,#7aa8c7,#b3cce0)',
  },
];

export const demoPassword = DEMO_PWD;

/* ---------------- 任务 ---------------- */

export const sampleArticle = (topic = '气压靴', platform = '小红书') => ({
  title: `跑完腿沉像灌铅？${topic}到底值不值`,
  body: [
    `最近训练量拉满，小腿每天都像灌了铅。试过泡沫轴、拉伸、冷水冲，能缓一会儿，第二天照样紧。直到朋友塞给我一双${topic}，说「你跑完套上，坐那儿刷手机就行」。`,
    `第一次用是夜跑之后。套上去按开始，气囊一段一段往上顶，从小腿肚推到脚踝，有点像被人从下往上挤。压力上来的时候会有一点点胀，但不会疼——它更像把「酸」往外推，而不是硬压。`,
    `用了两周，最大的变化不是「跑得更快」，而是第二天起床下楼梯不再需要扶扶手。这一点对天天跑的人来说，比什么参数都实在。`,
    `当然它也不是万能的。肌肉拉伤、明确的关节疼痛，还是得去看医生，别指望一台设备解决所有问题。它更适合「练完很累、想快点恢复」的日常场景。`,
    `最后说人话：如果你每周跑量稳定、又懒得手动按摩，${topic}值得进购物车；如果你一年跑两次，那买双好鞋更划算。`,
  ].join('\n\n'),
  tags: ['#气压靴', '#运动恢复', '#跑步日常', '#小腿放松', '#健身好物', '#训练后恢复', '#久站救星'],
  compliance: [
    '① 未出现「治疗、疗效、康复训练」等医疗承诺表述 ✓',
    '② 未涉及疾病诊断、用药建议与替代治疗方案 ✓',
    '③ 功效描述统一以「主观体感」呈现，未使用绝对化用语 ✓',
    '④ 未出现「最、第一、国家级」等极限词 ✓',
  ].join('\n'),
  coverage: [
    { word: '气压靴', len: 3, where: '标题 + 正文首段 + 结尾', ok: true },
    { word: '气压靴的作用', len: 6, where: '正文第 2 段（气囊推压描述）', ok: true },
    { word: '气压靴哪个牌子好', len: 8, where: '未覆盖（避免品牌对比）', ok: false },
    { word: '气压靴压力大了会怎样', len: 10, where: '正文第 3 段（胀感说明）', ok: true },
    { word: '跑步恢复', len: 4, where: '标签 + 正文第 4 段', ok: true },
  ],
  platform,
  words: 612,
});

export const initialTasks = [
  {
    id: 't_1007',
    name: '产品宣传片 · 水印版',
    type: 'video',
    status: 'processing',
    owner: '张嘉怡',
    createdAt: '今天 13:38',
    startedAt: '今天 13:38',
    finishedAt: '—',
    node: 'worker-1#4821',
    progress: 0.42,
    error: null,
    asset: '夏季新品发布 · 竖版短视频',
    result: null,
  },
  {
    id: 't_1006',
    name: '气压靴种草文',
    type: 'article',
    status: 'done',
    owner: '陈默',
    createdAt: '今天 11:20',
    startedAt: '今天 11:20',
    finishedAt: '今天 11:21',
    node: 'worker-2#3310',
    error: null,
    platform: '小红书',
    result: { article: sampleArticle('气压靴') },
  },
  {
    id: 't_1005',
    name: '靠墙静蹲封面图提示词',
    type: 'prompt',
    status: 'done',
    owner: '何书宁',
    createdAt: '今天 10:52',
    startedAt: '今天 10:52',
    finishedAt: '今天 10:53',
    node: 'worker-2#3310',
    error: null,
    result: {
      promptText:
        'A young Asian woman performing a wall sit exercise against a clean white wall in a bright minimal living room, knees bent at ninety degrees, back flat against the wall, wearing light sage athletic wear, soft natural daylight from the left window, shallow depth of field, crisp focus on knee alignment, muted green and warm beige color palette, editorial fitness photography, high detail, 4k, shot on 50mm lens',
      promptCn:
        '女生在明亮极简的客厅里靠着白墙做静蹲，膝盖约九十度，背部贴墙，穿浅豆绿色运动服；左侧自然光，浅景深，焦点落在膝关节对位上。',
      elements: '主体：25 岁左右亚洲女性 / 构图：正面平视、全身入画、留白充足 / 光线：左侧自然柔光 / 风格：干净专业的运动纪实 / 画质：4K，细节清晰',
      params: '画面比例 3:4 · 适用模型 gpt-image-1、即梦 3.0、通义万相',
    },
  },
  {
    id: 't_1004',
    name: '门店探店混剪 · 水印',
    type: 'video',
    status: 'done',
    owner: '张嘉怡',
    createdAt: '今天 10:10',
    startedAt: '今天 10:11',
    finishedAt: '今天 10:14',
    node: 'worker-1#4821',
    error: null,
    asset: '门店探店混剪',
    result: { outputName: '门店探店混剪_watermarked.mp4', outputSize: '86.4 MB', duration: '02:12' },
  },
  {
    id: 't_1003',
    name: '618 活动主图提示词',
    type: 'prompt',
    status: 'failed',
    owner: '苏黎',
    createdAt: '今天 09:47',
    startedAt: '今天 09:47',
    finishedAt: '今天 09:49',
    node: 'worker-2#3310',
    error: 'AI_PROVIDER_ERROR：调用生图模型失败（HTTP 502，上游超时），请检查系统设置中的生图供应商配置',
    result: null,
  },
  {
    id: 't_1002',
    name: '夏季新品口播文案',
    type: 'article',
    status: 'pending',
    owner: '何书宁',
    createdAt: '今天 09:30',
    startedAt: '—',
    finishedAt: '—',
    node: null,
    error: null,
    platform: '抖音',
    result: null,
  },
  {
    id: 't_1001',
    name: '品牌故事长文',
    type: 'article',
    status: 'canceled',
    owner: '陈默',
    createdAt: '昨天 18:02',
    startedAt: '昨天 18:02',
    finishedAt: '昨天 18:03',
    node: null,
    error: null,
    platform: '微信公众号',
    result: null,
  },
  {
    id: 't_0998',
    name: '周报封面 · 水印',
    type: 'video',
    status: 'failed',
    owner: '张嘉怡',
    createdAt: '昨天 16:40',
    startedAt: '昨天 16:41',
    finishedAt: '昨天 16:42',
    node: 'worker-1#4821',
    error: 'WATERMARK_INVALID：Logo 图片尺寸不足 64px，无法按指定宽度缩放',
    result: null,
  },
  {
    id: 't_0995',
    name: '小红书夏季系列 · 三篇',
    type: 'article',
    status: 'done',
    owner: '陈默',
    createdAt: '昨天 14:20',
    startedAt: '昨天 14:20',
    finishedAt: '昨天 14:26',
    node: 'worker-2#3310',
    error: null,
    platform: '小红书',
    result: { article: sampleArticle('冷萃液', '小红书') },
  },
  {
    id: 't_0990',
    name: '门店环境空镜 · 水印',
    type: 'video',
    status: 'pending',
    owner: '苏黎',
    createdAt: '昨天 11:05',
    startedAt: '—',
    finishedAt: '—',
    node: null,
    error: null,
    asset: '门店环境空镜',
    result: null,
  },
];

/* ---------------- 系统设置 ---------------- */

export const initialSettings = {
  ai: {
    provider: 'deepseek',
    apiKeyMasked: 'sk-3d36****f0b8',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    maxTokens: 16384,
    promptFile: 'prompts/article_system.md',
  },
  aiImage: {
    enabled: false,
    provider: 'dashscope',
    apiKeyMasked: 'sk-8a1c****2e47',
    model: 'wanx-v1',
    size: '1024x1024',
  },
  /* 全局默认水印：系统设置里可自定义，视频水印页打开时作为初值 */
  watermark: { ...defaultWatermark },
  lexicon: { tagMaxLen: 7, collectTimeout: 300, dataDir: '/data/lexicon' },
  worker: { videoWorkers: 2, textWorkers: 4, claimTimeout: 30, maxRetry: 2 },
  storage: { backend: 'local', root: '/data/media', quota: 200 },
};

export const serviceStatus = {
  serviceName: '内容中转平台',
  state: 'online',
  node: 'worker-1',
  heartbeatAt: '13:41:20',
  running: 1,
  pending: 2,
  summary: '本轮 found=12 ok=8 fail=1 skipped=3',
};

/* ---------------- 文章编写默认需求 ---------------- */

export const articleDefaults = {
  platform: 'xhs',
  contentType: 'commerce',
  audience: 'mixed',
  topic: '气压靴',
  sellingPoint: '轻便、压力可调、运动后 15 分钟即可使用',
  wordCount: '1200~1600 字',
  extra: '语气偏口语，不要夸大功效，避免出现医疗承诺表述',
  keyword: '气压靴',
  strategy: 'auto',
  refImages: [],
};

export const promptSample = {
  requirement:
    '女生在客厅做靠墙静蹲，突出膝关节康复动作标准，风格干净专业，适合做课程封面',
  result: {
    promptText:
      'A young Asian woman performing a wall sit exercise against a clean white wall in a bright minimal living room, knees bent at ninety degrees, back flat against the wall, wearing light sage athletic wear, soft natural daylight from the left window, shallow depth of field, crisp focus on knee alignment, muted green and warm beige color palette, editorial fitness photography, high detail, 4k, shot on 50mm lens',
    promptCn:
      '女生在明亮极简的客厅里靠着白墙做静蹲，膝盖约九十度，背部贴墙，穿浅豆绿色运动服；左侧自然光，浅景深，焦点落在膝关节对位上。整体干净、专业，适合课程封面。',
    elements:
      '主体：25 岁左右亚洲女性，全身入画\n构图：正面平视，人物居中偏右，左侧留白放标题\n光线：左侧窗户自然柔光，避免硬阴影\n风格：运动纪实 + 极简编辑风\n画质：4K，皮肤与织物细节清晰',
    params: '画面比例 3:4（封面）/ 16:9（横幅）· 适用模型 gpt-image-1、即梦 3.0、通义万相',
  },
};
