// 关于 Trippy，简体中文版。
// The About page in Chinese (Simplified), written from about.en.js for readers in Singapore: the same
// sections, ids and blocks, with its own words. The sample plan (places, stops, sketch labels) is
// translated here and passed to demoHtml and mountAbout. House rules for this language: 你 not 您;
// a space between Chinese and a Latin word, none between Chinese and a figure (7天, 第1天); the
// country is written 新加坡 where the English page prints {country}; names of controls that the app
// shows in English keep the English label, with the meaning in brackets where it helps.
import '../../../css/components/site-about.css';
import { demoHtml, limitsHtml, squareHtml, stepsHtml, viewsHtml } from '../about/blocks.js';
import { mountAbout } from '../about/mount.js';
import { SKETCH_PLACES } from '../about/plan-sketch.js';

const BASE_URL = import.meta.env?.BASE_URL || '/';

// The sample plan in Chinese: same ids, times, costs and temperatures as SKETCH_PLACES, with the
// names, months, day titles and conditions below. One row per day: [title, condition, stop names].
// Penang uses the Chinese street and place names that people there use.
const PLACE_WORDS = {
  kyoto: {
    name: '京都', month: '4月',
    days: [
      ['漫步东山', '晴间多云', ['清水寺', '三年坂与二年坂', '八坂神社附近午餐', '建仁寺', '先斗町晚餐']],
      ['伏见与锦市场', '晴', ['伏见稻荷大社', '锦市场午餐', '二条城', '乌丸一带晚餐']],
      ['岚山', '阵雨', ['竹林小径', '天龙寺庭园', '河畔豆腐料理午餐', '大河内山庄']],
      ['京都北部', '晴间多云', ['金阁寺', '龙安寺石庭', '北野一带荞麦面午餐', '大德寺庭园', '回祇园吃晚餐']],
    ],
  },
  lisbon: {
    name: '里斯本', month: '5月',
    days: [
      ['阿尔法玛与城堡', '晴', ['圣若热城堡', '圣卢西亚观景台', '阿尔法玛午餐', '里斯本主教座堂', '听法朵、吃晚餐']],
      ['贝伦', '晴', ['热罗尼莫斯修道院', 'Pastéis de Belém 葡式蛋挞', '河畔午餐', 'MAAT 博物馆']],
      ['拜沙与希亚多', '晴间多云', ['商业广场', '卡尔莫修道院', 'Time Out 市场午餐', 'LX Factory', '上城区晚餐']],
      ['辛特拉一日游', '多云', ['罗西奥站搭火车', '佩纳宫', '老城区午餐', '雷加莱拉庄园']],
    ],
  },
  penang: {
    name: '槟城', month: '2月',
    days: [
      ['漫步乔治市', '晴', ['龙山堂邱公司', '本头公巷一带的壁画', '汕头街炒粿条', '张弼士故居（蓝屋）', '新关仔角小贩中心晚餐']],
      ['升旗山与极乐寺', '晴间多云', ['升旗山缆车', '亚依淡亚参叻沙', '极乐寺', '新巷小贩街晚餐']],
      ['姓氏桥与老宅', '阵雨', ['姓周桥', '槟城侨生博物馆', '扁担饭午餐', '康华丽斯古堡']],
      ['北海岸', '晴', ['槟城国家公园步道', '直落巴巷午餐', '热带香料园', '峇都丁宜夜市']],
    ],
  },
};

const PLACES = SKETCH_PLACES.map((place) => {
  const words = PLACE_WORDS[place.id];
  if (!words) return place;
  return {
    ...place,
    name: words.name,
    month: words.month,
    days: place.days.map((day, dayIndex) => {
      const [title, condition, stops] = words.days[dayIndex] ?? [day.title, day.condition, []];
      return { ...day, title, condition, stops: day.stops.map((stop, stopIndex) => ({ ...stop, name: stops[stopIndex] ?? stop.name })) };
    }),
  };
});

const SKETCH = {
  title: '{month}的{place}，{days}天',
  day: '第{n}天',
  stops: '站点',
  cost: '活动费用估算',
  costBasis: '每人',
  weather: '典型天气',
  range: '{low}至{high}°C',
  free: '免费',
};

const DEMO = {
  legendPlace: '地点',
  legendDays: '天数',
  daysOption: '{n}天',
  note: '这份示例是特地为本页手写的，你怎么切换，都不会有资料发送出去。地点都是真的；价格只取整数，用来示意版面，别拿来做预算。',
};

const STEPS = {
  openAll: '展开所有步骤',
  closeAll: '收起所有步骤',
  next: '下一步：{title}',
  steps: [
    {
      title: '由你描述行程',
      summary: '七个简短的页面',
      body: [
        '规划器会问你：去哪里（一个城市或多个城市），什么时候去、几个人，要多舒适、每天打算花多少，想住在哪里，打算怎么去，喜欢怎么安排时间。最后一页把所有答案一并列出，还有一栏让你写备注：非去不可的地方、不能吃的食物、想避开的事情，或是从别处贴过来的资料。',
        '如果航班或酒店已经订好，把资料填进去，计划就会围绕它们来安排。第1天的安排，从你落地之后才开始。出国旅行的话，它还会问同行者各持哪国护照，好告诉你签证和入境卡的要求。',
      ],
    },
    {
      title: '把要求发给 AI 模型',
      summary: '先用 Google Gemini，另有两个后备',
      body: [
        '你的答案会整理成一份文字要求，发给 Google 的 Gemini 模型。Gemini 繁忙或出错时，由较轻量的 Gemini 模型接手，再不行就交给 Mistral 的模型。要求里不含你的姓名和电邮地址，但备注栏里写的内容会一并发出。',
        '行程一长，一次回复写不完，所以计划分段来写，每段大约四天。两周的行程要五分钟左右，周末短途快得多，原因就在这里。生成期间可以关掉窗口，计划照样写下去；你也可以要求写好时通知你。',
      ],
    },
    {
      title: '交回来的是计划，不是文章',
      summary: '日程、站点、时间、费用',
      body: [
        '模型按固定结构作答：每天一份站点清单，每一站有时间、地点名称、地址和坐标、一条提示、每人费用，还有一行说明怎么从上一站过来。写头几天的时候，它也顺带写出属于整趟行程的部分：从你居住的城市出发的航班，目的地近的话则是渡轮、火车或巴士；每个城市的住宿；还有一份要提早预订的清单。',
        'Trippy 会先检查回复，再决定是否保存。回复如果中途断了，写完的那几天留下，其余的再要一次。别的日子已经排过的餐馆，会剔除。新计划整份存好之前，不会盖掉旧计划，所以就算生成失败，原来的计划还在。',
      ],
    },
    {
      title: '照片是事后才找的',
      summary: '用该地点的真实照片，找不到就不放',
      body: [
        '模型不提供图片。Trippy 会为每一站寻找那个地点本身的照片：先找 OpenStreetMap、Wikidata、Wikipedia 和 Wikimedia Commons，再找该地点的官网和 Openverse，最后才找它在 Google Maps 上的页面和提到它的网页。照片必须能凭识别码、坐标或名称对上该地点，才会采用。',
        '一张都对不上的话，卡片就只放一幅示意图。看着像、其实不对的照片，比没有照片更糟。每张照片都保留来源说明，页脚的**照片来源**会列出你当前页面上的照片。',
      ],
    },
    {
      title: '地图按坐标绘制',
      summary: '底图是 OpenStreetMap',
      body: [
        '每一站按模型给的坐标标在地图上。街道地图来自 OpenStreetMap，Atlas 视图里的世界轮廓图来自 Natural Earth。你自己添加或更改站点时，地点搜索用的也是 OpenStreetMap 的数据，到下一站的步行距离也会重新计算。',
        '模型给的坐标可能偏差一两条街，偶尔还会错得离谱。要去重要的地方，出发前请先核对地址。',
      ],
    },
    {
      title: '两个标签，措辞格外小心',
      summary: '典型天气、活动费用估算',
      body: [
        '**典型天气**是模型预计当地在那个季节的天气，在生成计划时写下，只写一次。它不是天气预报，不会更新，也不知道你到访那一周天气如何。拿它来决定带什么行李就好，出发前几天再查天气预报。',
        '**活动费用估算**是模型为计划里每一站所估费用的总和，包括门票、餐饮和导览。这是每人的费用，不含机票、住宿和交通。价格是模型凭记忆估的，不是报价，也可能已经过时。',
      ],
    },
    {
      title: '接下来由你做主',
      summary: '修改、替换、分享、离线查看',
      body: [
        '任何一站都可以更改、添加或删除。**Alternatives**（替代选项）会为某一站提出三个附近的替换地点。行程页面上的聊天栏可以接受“把第3天排松一点”这类要求，并列出它建议的改动；你接受之前，什么都不会保存。你还可以把整份计划重新生成一次，分享只读链接，用电邮邀请别人查看或编辑，也可以导出 PDF。',
        '你最近打开过的行程会保存在设备上，所以在飞机上或地下室的餐馆里，计划照样打得开。',
      ],
    },
  ],
};

const LIMITS = {
  does: {
    title: '它能做的事',
    items: [
      '你回答几个问题，它就写出完整的逐日计划，通常只要几分钟。',
      '围绕已经定下的安排来规划：订好的航班、订好的酒店、必须工作的日子。',
      '列出真实的地点，附上地址、地图位置，还有一行说明怎么去。',
      '目的地离家近时，不排航班，改排渡轮、火车或巴士。',
      '按同行者所持的护照，列出签证、入境卡和旅行许可的要求，并附上官方网站的链接。',
      '通过 **Import trip**（导入行程），把你在别处规划好的行程连同预订资料一起带进来。',
      '没有网络时，最近的行程照样读得到。',
    ],
  },
  doesNot: {
    title: '它不做的事',
    items: [
      '不卖任何东西，也不代订。通往航空公司、酒店和预订网站的链接都是普通链接，只是把你带过去，要买就在那里买。Trippy 不赚取佣金。',
      '不知道实时价格。费用是活动的每人估算，机票和酒店价格只是粗略参考。',
      '不知道到时天气如何。计划上的天气是当季的典型天气，不是预报。',
      '不核对营业时间、休馆日或门票是否售完。模型记得的地方，可能已经关门。',
      '不提供入境方面的法律意见。入境要求只供参考，规定又常有更改，付任何款项之前，请先向各国当局确认。',
      '不追踪你的位置。行程进行当天，标记是跟着时钟走的，不是跟着手机定位走。',
    ],
  },
};

const VIEWS = {
  legend: '显示的视图',
  isDefault: '默认',
  alt: '手机上 {view} 主页的上半部分，使用示例账户',
  views: {
    atlas: {
      name: 'Atlas',
      text: [
        '一张地图，一本日志。主页开头用一句话交代你的行程进度，接着是正在进行或即将出发的行程。',
        'Atlas 另有专属页面，把你规划过的每个地方画在世界地图上；下方的日志显示每年有哪几个月排了行程。',
      ],
    },
    departures: {
      name: 'Departures',
      text: [
        '把行程排成机场的航班显示板：每个行程一行，列出出发时间、天数、活动费用估算和准备进度。数字用等宽字体，标题像旧式机场的翻牌显示板那样翻动。',
        '适合想先看数字的人。',
      ],
    },
    concierge: {
      name: 'Concierge',
      text: [
        '把主页写成一份晨间简报，用一段话告诉你今天是行程的第几天、接下来做什么、还有什么没安排好，文中提到行程的地方都链接到该行程。',
        '三种视图里它最素净，留给文字的空间也最多。',
      ],
    },
  },
};

const SQUARE = {
  alt: '方形布局下的主页：一张行程卡占满屏幕，下方的圆点代表其他卡片',
  text: [
    '少数手机用的是方形屏幕，例如 Unihertz Titan 2，在这种屏幕上滚动长页面很受罪。屏幕接近方形时，Trippy 会把每个页面变成一叠卡片，一屏一张，左右翻阅。',
    '方形布局会自动启用，也可以在[设置](#/settings)里用 **Square layout**（方形布局）强制开启或关闭。这项选择保存在设备上，不在账户里。',
  ],
  credit: '示例账户。塞维利亚主教座堂照片来自 [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Sevilla_Cathedral_-_Southeast.jpg)。',
};

/** @type {import('../content.js').SitePage} */
export default {
  title: '关于 Trippy',
  intro: [
    'Trippy 是在浏览器里使用的旅行规划工具。你回答几个关于行程的问题，AI 模型就为每一天写出计划，列出真实的地点、时间和大概的花费。哪里不合意，你再自己改。',
    '这是一项免费的实验性服务：没有广告，不卖东西，不代订，也不赚取佣金。',
  ],
  sections: [
    {
      id: 'what-it-is',
      heading: 'Trippy 是什么',
      blocks: [
        { type: 'p', text: '自己动手规划行程，少不了开十几个浏览器标签页，外加一张试算表。Trippy 替你完成初稿。它问清楚去哪里、什么时候去、几个人、预算多少，然后交出一份像下面示例那样的计划：每天有主题，各站的先后次序在地图上走得通，每一站有时间，还有一路累加的活动费用估算。' },
        { type: 'p', text: '真正的计划比这个长，还附有地址、照片、地图、航班或陆路交通、住宿，以及一份需要提早预订的清单。选一个地点和天数，看看计划的大致模样。' },
        { type: 'custom', html: demoHtml(DEMO, { places: PLACES, sketchWords: SKETCH }) },
        { type: 'p', text: '初稿只是起点。用 Trippy 的时间，大多花在初稿之后：把博物馆挪到下雨那天，换一家餐馆，机票付款后补上预订编号。' },
      ],
    },
    {
      id: 'how-a-plan-is-made',
      heading: '计划是怎么生成的',
      blocks: [
        { type: 'p', text: '这里没有什么藏着不说的。知道计划怎么拼出来，你就知道哪些部分信得过。从按下按钮到读到第1天，中间有这几个步骤。' },
        { type: 'custom', html: stepsHtml(STEPS) },
      ],
    },
    {
      id: 'what-it-does-and-does-not-do',
      heading: '它能做什么，不做什么',
      blocks: [
        { type: 'p', text: '规划行程里繁琐的部分，Trippy 很在行；另一些部分，它完全帮不上忙。依靠它之前，两份清单都值得看一看。' },
        { type: 'custom', html: limitsHtml(LIMITS) },
        { type: 'note', title: 'AI 可能出错', text: '语言模型不管对不对，写起来都一样流畅。它可能把咖啡馆放错街，报出去年的票价，或推荐一家已经结业的店。把计划当作朋友的建议就好：这位朋友书读得多，却好一阵子没去过当地。凡是弄错了会让你懊恼的事，都要自己查证。' },
      ],
    },
    {
      id: 'views',
      heading: '同样的行程，三种视图',
      blocks: [
        { type: 'p', text: '每个人读计划的方式不同，所以登录后的页面有三种视图。三种视图显示的行程和内容完全相同，只是编排不同，各合口味。第一次登录时会让你选，之后随时可以在[设置](#/settings)里更改。每种视图都有深色和浅色主题。' },
        { type: 'custom', html: viewsHtml(VIEWS, { baseUrl: BASE_URL }) },
        { type: 'subheading', text: '方形屏幕' },
        { type: 'custom', html: squareHtml(SQUARE, { baseUrl: BASE_URL }) },
      ],
    },
    {
      id: 'your-data',
      heading: '你的资料',
      blocks: [
        { type: 'p', text: '你用 Google 账户登录，Trippy 会保存其中的姓名、电邮地址和头像，也保存你告诉它的资料：居住城市、货币、所持护照，以及你的行程和其中所有内容。你为行程填写的答案会发给 AI 供应商，由它写出计划。这家供应商是 Google，用的是 Google 服务的免费层级；在免费层级下，Google 可以用收到的内容改进产品，人工审核员也可能读到，所以请不要在自由填写栏里写敏感的个人资料。你最近的行程也会存在设备上，方便离线打开，登出时就会从设备上清除。这里没有广告，也没有广告追踪器。[隐私政策](#/privacy)有完整说明，包括怎样查看或更正我们手上有关你的资料，怎样在设置里自行删除账户，以及怎样撤回同意。' },
      ],
    },
    {
      id: 'who-makes-it',
      heading: '谁在做 Trippy',
      blocks: [
        { type: 'p', text: 'Trippy 是个人项目，也是一项实验，由一个人制作，不是公司出品，在新加坡营运。它起初是我们为规划自己从新加坡出发的行程而做的工具，所以默认设置也偏向这里：货币用新元，建议里还有去巴淡岛、迪沙鲁这类地方的短途行程。不过，不管从哪里出发、去哪里，它都能规划。' },
        { type: 'p', text: '使用 Trippy 不用付费，也没有付费版。Trippy 不卖票，也不代订。通往预订网站的链接都是普通链接，你点开链接或在那里预订，Trippy 都不赚取佣金，也没有其他收益。' },
        { type: 'defs', rows: [
          { term: '营运者', text: '{operator}' },
          { term: '有疑问或遇到问题', text: '请电邮至：{contactEmail}' },
          { term: '关于你的个人资料', text: '请电邮给资料保护联络人：{dpoEmail}' },
          { term: '网址', text: '应用的网址是 {siteUrl}' },
        ] },
      ],
    },
    {
      id: 'built-on',
      heading: 'Trippy 背后用了什么',
      blocks: [
        { type: 'p', text: 'Trippy 能做得这么小，是因为难的部分别人已经做好，还拿出来分享。它依靠的开放数据和服务如下。' },
        { type: 'defs', rows: [
          { term: 'OpenStreetMap', text: '街道地图、地点搜索（通过 Photon）和步行路线（通过 OSRM）。地图数据 © [OpenStreetMap](https://www.openstreetmap.org/copyright) 贡献者。' },
          { term: 'Natural Earth', text: 'Atlas 视图里的世界轮廓图。[Natural Earth](https://www.naturalearthdata.com/) 属公有领域。' },
          { term: 'Wikimedia Commons、Wikipedia 和 Wikidata', text: '大部分地点照片和封面照片的来源，每张都注明作者和授权条款。原图可以在 [Wikimedia Commons](https://commons.wikimedia.org/) 找到。' },
          { term: 'Openverse 和 Pexels', text: '更多照片：开放授权的照片通过 [Openverse](https://openverse.org/) 取得，部分行程封面来自 [Pexels](https://www.pexels.com/)。' },
          { term: '地点官网和其他网页', text: '开放来源找不到照片时，照片可能来自地点的官网、它在 Google Maps 上的页面，或提到它的网页。这些照片留在原处，归原主所有，显示时附上来源链接。' },
          { term: 'Google Gemini 和 Mistral', text: '这些 AI 模型负责写计划、建议替代地点、在聊天栏里作答，并检查封面照片拍的是不是对的地方。' },
          { term: 'Supabase', text: '登录服务、保存行程的数据库、文件存储，以及与 AI 供应商联系的服务器函数。数据库、登录服务和存储的照片都托管在新加坡。' },
          { term: 'Leaflet', text: '绘制地图的程序库。' },
          { term: 'GitHub Pages', text: '应用本身的文件由这里提供。' },
        ] },
      ],
    },
    {
      id: 'questions',
      heading: '常见问题',
      blocks: [
        { type: 'faq', items: [
          { q: '真的免费吗？', a: '是的。没有付费版，没有会到期的试用期，没有广告，Trippy 也不从所链接的网站赚取佣金。它是一项实验，所以可能更改，也可能停办。' },
          { q: '需要账户吗？', a: '规划行程需要，而且只能用 Google 账户登录。只是打开别人用链接分享给你的行程，就不需要。' },
          { q: 'Trippy 会代订机票或酒店吗？', a: '不会。它只提出建议，并附上航空公司或预订网站的链接，由你自己到那里预订。订好之后，可以把航班号、时间和预订编号填进行程，所有资料就集中在一处。' },
          { q: '生成一份计划要多久？', a: '十天到两周的行程大约五分钟，短途更快。你不必守在页面上：可以关掉窗口，过后再回来，也可以要求在完成时收到通知。' },
          { q: '计划有多可靠？', a: [
            '大方向可以信：哪些地区适合排在一起，一天排得下多少，哪些要提早预订。弄错了会赔上金钱或时间的细节，就要自己查证：开放日、票价、餐馆是否还在营业、转车要多久。',
            '入境要求最要小心。Trippy 列出它认为适用于你们护照的要求，并附上官方网站的链接。能否入境由各国移民当局决定，所以请亲自阅读官方页面。',
          ] },
          { q: '天气为什么写“典型”？', a: '计划可能在出发前几个月就写好，那时谁也说不准到时的天气。显示的是当地那个月份通常的天气，在生成计划时写下。它不是预报，不管实际天气如何，都不会改变。' },
          { q: '没有网络能用吗？', a: '查看可以。你最近打开过的行程存在设备上，离线也能打开；你也可以像安装应用那样，把 Trippy 添加到主屏幕。生成新计划、编辑和聊天栏都需要网络。' },
          { q: '可以两个人一起规划吗？', a: '可以。用电邮邀请对方，让对方只看或一起编辑；一方改了行程，另一方就看到更新。只需要看的人，给一个只读链接就行。链接7天后失效，你也可以提早关闭。' },
          { q: '我已经在别处规划好了，可以带进来吗？', a: '可以。**Import trip**（导入行程）会给你一段提示词，你把它连同自己的笔记贴给任何 AI 助手，再把结果贴回来。保存之前会先显示预览，导入之后也可以撤销。' },
          { q: '有哪些语言？', a: '页脚和这几个页面（关于 Trippy、隐私政策、使用条款）有英文、马来文、简体中文和芬兰文版本。应用的其余部分和计划本身，目前只有英文。' },
          { q: '怎样删除我的行程或账户？', a: '[设置](#/settings)里的 **Delete all my trips**（删除我的所有行程）会永久删除你拥有的每个行程。同一页 Account（账户）部分的 **Delete my account**（删除我的账户）会删除你的账户、个人档案和其中所有内容，全程由你自己操作。[隐私政策](#/privacy/retention)列明哪些会删除，哪些无法删除。' },
        ] },
      ],
    },
  ],
};

/** Binds the plan sketch and the steps (js/site/about/mount.js), with the Chinese sample plan. */
export const mount = (root) => mountAbout(root, { places: PLACES, sketchWords: SKETCH });
