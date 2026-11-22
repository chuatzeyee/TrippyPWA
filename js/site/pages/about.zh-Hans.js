// 关于 Trippy，简体中文版。结构、区块和 section id 与 about.en.js 一一对应，英文版为准。
// The About page in Chinese (Simplified): a copy of about.en.js with its own words. The sample plan
// (places, stops, sketch labels) is translated here and passed to demoHtml and mountAbout.
import '../../../css/components/site-about.css';
import { demoHtml, limitsHtml, squareHtml, stepsHtml, viewsHtml } from '../about/blocks.js';
import { mountAbout } from '../about/mount.js';
import { SKETCH_PLACES } from '../about/plan-sketch.js';

const BASE_URL = import.meta.env?.BASE_URL || '/';

// The sample plan in Chinese: same ids, times, costs and temperatures as SKETCH_PLACES, with the
// names, months, day titles and conditions below. One row per day: [title, condition, stop names].
const PLACE_WORDS = {
  kyoto: {
    name: '京都', month: '4 月',
    days: [
      ['步行游东山', '多云间晴', ['清水寺', '三年坂和二年坂', '八坂神社附近午餐', '建仁寺', '先斗町晚餐']],
      ['伏见和市场', '晴', ['伏见稻荷大社', '锦市场午餐', '二条城', '乌丸附近晚餐']],
      ['岚山', '有阵雨', ['竹林小径', '天龙寺庭园', '河边豆腐午餐', '大河内山庄']],
      ['城北', '多云间晴', ['金阁寺', '龙安寺石庭', '北野附近荞麦面午餐', '大德寺庭园', '回祇园晚餐']],
    ],
  },
  lisbon: {
    name: '里斯本', month: '5 月',
    days: [
      ['阿尔法玛和城堡', '晴', ['圣若热城堡', '圣卢西亚观景台', '阿尔法玛午餐', '里斯本主教座堂', '听法朵的晚餐']],
      ['贝伦', '晴', ['热罗尼莫斯修道院', 'Pastéis de Belém 的葡式蛋挞', '河边午餐', 'MAAT 博物馆']],
      ['拜沙和希亚多', '多云间晴', ['商业广场', '卡尔莫修道院', 'Time Out 市场午餐', 'LX Factory', '上城区晚餐']],
      ['辛特拉一日游', '多云', ['从罗西奥站乘火车', '佩纳宫', '老城午餐', '雷加莱拉庄园']],
    ],
  },
  penang: {
    name: '槟城', month: '2 月',
    days: [
      ['步行游乔治市', '晴', ['龙山堂邱公司', '本头公巷一带的街头壁画', '汕头街炒粿条', '张弼士故居（蓝屋）', '新关仔角小贩晚餐']],
      ['升旗山和极乐寺', '多云间晴', ['升旗山缆车', '亚依淡亚参叻沙', '极乐寺', '新巷小贩街晚餐']],
      ['姓氏桥和老宅', '有阵雨', ['姓周桥', '槟城侨生博物馆', '扁担饭午餐', '康华丽斯堡']],
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
  title: '{month}的{place}，{days} 天',
  day: '第 {n} 天',
  stops: '地点',
  cost: '活动估算',
  costBasis: '每人',
  weather: '典型天气',
  range: '{low} 至 {high}°C',
  free: '免费',
};

const DEMO = {
  legendPlace: '地点',
  legendDays: '天数',
  daysOption: '{n} 天',
  note: '这个示例是专为本页手写的，你更改选项时不会向任何地方发送任何内容。地点都是真实的，价格则是为了展示版面而取的整数，请不要拿来做预算。',
};

const STEPS = {
  openAll: '展开所有步骤',
  closeAll: '收起所有步骤',
  next: '下一步：{title}',
  steps: [
    {
      title: '你描述这趟行程',
      summary: '七个简短的页面',
      body: [
        '规划器会问你要去哪里（一个城市或几个城市）、什么时候去、几个人、想要多舒适、一天打算花多少、想住在哪里、怎么去，以及喜欢怎么安排时间。最后一页把所有回答列在一起，还有一个让你自己写备注的输入框：非去不可的地方、不能吃的食物、想避开的事情，或者从别处贴过来的资料。',
        '如果机票或酒店已经订好，把它们填进去，计划就会围绕它们来安排。第 1 天从你落地之后开始，而不是之前。如果是出国，它还会问同行的人各持哪国护照，好告诉你签证和入境卡方面的要求。',
      ],
    },
    {
      title: '请求发给 AI 模型',
      summary: '先用 Google Gemini，另有两个后备',
      body: [
        '你的回答会整理成一份文字请求，发给 Google 的 Gemini 模型。如果 Gemini 繁忙或出错，就由一个较轻量的 Gemini 模型接手，再不行则交给 Mistral 的模型。请求里不包含你的姓名和电邮地址，但你在备注框里写的内容会包含在内。',
        '长途行程一次回复写不完，所以计划是分批写的，每批大约四天。这就是为什么两个星期的行程要五分钟左右，而一个周末的行程快得多。等待时可以关掉窗口，计划会继续写下去，你也可以要求在写好时收到通知。',
      ],
    },
    {
      title: '回来的草稿是一份计划，不是一篇文章',
      summary: '日程、地点、时间、花费',
      body: [
        '模型按固定的结构作答：每一天是一串地点，每个地点有时间、名称、地址和坐标、一条小提示、每人的花费，还有一行说明怎么从上一个地点过去。写头几天时，它也会把整趟行程层面的内容写好：从你所在城市出发的航班，近的地方则是渡轮、火车或巴士；每个城市的住宿；以及需要提前预订的事项清单。',
        'Trippy 会先检查回复再保存。回复如果中途被截断，已写完的那几天会保留，其余的重新请求。别的日子已经用过的餐馆会被去掉。在整份新计划保存好之前，旧计划不会被替换，所以就算一次尝试失败，你原有的计划还在。',
      ],
    },
    {
      title: '照片是之后才找的',
      summary: '要么是该地点的真实照片，要么不放',
      body: [
        '模型不提供图片。Trippy 会为每个地点去找那个地方本身的照片：先找 OpenStreetMap、Wikidata、Wikipedia 和 Wikimedia Commons，再找场所自己的网站和 Openverse，最后才是该场所在 Google Maps上的页面和提到它的网页。只有能通过识别码、坐标或名称确认属于该场所的照片才会采用。',
        '如果找不到能确认的照片，卡片上就显示一幅手绘的占位图。一张看着没问题其实不对的照片，比没有照片更糟。每张照片都保留署名，页脚的**照片来源**会列出你当前页面上的那些。',
      ],
    },
    {
      title: '地图按坐标绘制',
      summary: '底图是 OpenStreetMap',
      body: [
        '每个地点都按模型给出的坐标标在地图上。街道地图用的是 OpenStreetMap，Atlas 视图里的世界轮廓来自 Natural Earth。你自己添加或修改地点时，地点搜索用的也是 OpenStreetMap 的数据，到下一个地点的步行距离会重新计算。',
        '模型给的坐标可能偏差一两条街，偶尔还会明显出错。凡是重要的地方，出发前先核对地址。',
      ],
    },
    {
      title: '有两个标签的措辞特别小心',
      summary: '典型天气，活动估算',
      body: [
        '**Typical weather**（典型天气）是模型对那个地方在那个时节的天气预期，在计划生成时写下，只写一次。它不是天气预报，不会更新，也不知道你在当地那一周的情况。用它来决定带什么行李，出发前几天再去查天气服务。',
        '**Activities estimated**（活动估算）是模型为计划里每个地点给出的花费的总和：门票、餐饮、导览。它按每人计算，不含机票、住宿和交通。价格是模型凭印象给出的，不是报价，也可能已经过时。',
      ],
    },
    {
      title: '然后它就是你的了',
      summary: '修改、替换、分享、离线查看',
      body: [
        '任何地点你都可以修改、添加或删除。**Alternatives**（替代选项）会为某个地点提供三个附近的替换选择。行程页的聊天面板可以接受“把第 3 天安排得轻松一点”这样的要求，并列出它建议的改动，你接受之前什么都不会保存。你可以让整份计划重新生成，分享一个只读链接，用电邮邀请别人查看或编辑，也可以导出 PDF。',
        '你最近打开过的行程会保存在设备上，所以在飞机上或地下室的餐馆里，计划照样打得开。',
      ],
    },
  ],
};

const LIMITS = {
  does: {
    title: '它能做什么',
    items: [
      '根据几个回答写出完整的逐日计划，通常只要几分钟。',
      '围绕已经定下的安排来规划：订好的航班、订好的酒店、必须工作的日子。',
      '给出真实的地点，附上地址、地图位置和一行交通说明。',
      '目的地离家近时，把航班换成渡轮、火车或巴士。',
      '按同行者所持的护照，列出签证、入境卡和旅行许可，并附上官方网站的链接。',
      '通过 **Import trip**（导入行程）把你在别处规划好的行程连同预订信息一起收进来。',
      '没有网络时，最近的行程照样能看。',
    ],
  },
  doesNot: {
    title: '它不做什么',
    items: [
      '它不代订任何东西。航空公司、酒店和订票网站的链接会带你到对方的网站，你在那里购买。',
      '它不知道实时价格。花费是活动的每人估算，机票和酒店价格只是粗略参考。',
      '它不知道到时候天气如何。计划上的天气是该季节的典型天气，不是天气预报。',
      '它不核对营业时间、是否停业或门票是否售罄。模型记得的地方可能已经关门。',
      '它不提供入境方面的法律意见。入境要求仅供参考，规定会变，所以付款之前请向各国当局确认。',
      '它不追踪你的位置。行程进行当天，地图上的标记是按时钟移动的，不是按手机定位。',
    ],
  },
};

const VIEWS = {
  legend: '显示的视图',
  isDefault: '默认',
  alt: '手机上 {view} 仪表板的顶部，使用示例账户',
  views: {
    atlas: {
      name: 'Atlas',
      text: [
        '一张地图加一本日志。仪表板开头用一句话说明你的计划进行到哪里，接着是正在进行或即将出发的那趟行程。',
        'Atlas 还有自己的一页：你规划过的每个地方都画在一张世界地图上，下面的日志显示每年有哪几个月安排了行程。',
      ],
    },
    departures: {
      name: 'Departures',
      text: [
        '把你的行程排成一块机场出发信息牌：每趟行程一行，写着何时出发、多少天、活动估算花费多少、准备得怎么样。数字用等宽字体，标题像老式机场翻牌显示屏那样翻动。',
        '适合想先看数字的人。',
      ],
    },
    concierge: {
      name: 'Concierge',
      text: [
        '仪表板变成一份晨间简报。它用一段话告诉你今天是行程的第几天、接下来是什么、还有什么没定下来，文字里提到的行程都可以点进去。',
        '三种视图里它最安静，留给文字的空间也最多。',
      ],
    },
  },
};

const SQUARE = {
  alt: '方形布局下的仪表板：一张行程卡片占满屏幕，下方的圆点代表其他卡片',
  text: [
    '有少数手机是方形屏幕，比如 Unihertz Titan 2，在这种屏幕上滚动长页面很难受。在接近方形的屏幕上，Trippy 会把每个页面变成一叠卡片，一屏一张，左右翻页。',
    '它会自动开启，也可以在[设置](#/settings)里用 **Square layout**（方形布局）强制打开或关闭。这个选择保存在设备上，不在你的账户里。',
  ],
  credit: '示例账户。塞维利亚主教座堂的照片来自 [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Sevilla_Cathedral_-_Southeast.jpg)。',
};

/** @type {import('../content.js').SitePage} */
export default {
  title: '关于 Trippy',
  intro: [
    'Trippy 是一款在浏览器里运行的旅行规划工具。你回答几个关于行程的问题，AI 模型就会为每一天写出计划，里面有真实的地点、时间和大致花费。哪里不满意，你再自己改。',
    '它免费，没有广告，也不代订或售卖任何东西。',
  ],
  sections: [
    {
      id: 'what-it-is',
      heading: 'Trippy 是什么',
      blocks: [
        { type: 'p', text: '自己动手规划行程，少不了十几个浏览器标签页和一张表格。Trippy 替你把这份工作的初稿做出来。它问你去哪里、什么时候、和谁去、预算多少，然后交回一份像下面示例那样的东西：每天有个主题，地点按在地图上走得通的顺序排列，每个地点有时间，还有活动花费的累计估算。' },
        { type: 'p', text: '真正的计划比这长，还带有地址、照片、地图、航班或陆路交通、住宿，以及需要提早预订的事项清单。选一个地点和天数，看看计划的大致模样。' },
        { type: 'custom', html: demoHtml(DEMO, { places: PLACES, sketchWords: SKETCH }) },
        { type: 'p', text: '草稿只是起点。用 Trippy 的时间，大多花在草稿之后：把博物馆挪到下雨那天，换一家餐馆，机票付款后补上订位编号。' },
      ],
    },
    {
      id: 'how-a-plan-is-made',
      heading: '计划是怎么生成的',
      blocks: [
        { type: 'p', text: '这里没有什么是藏着的。知道计划是怎么拼出来的，你就知道哪些部分可以信。从按下按钮到读到第 1 天，中间有这些步骤。' },
        { type: 'custom', html: stepsHtml(STEPS) },
      ],
    },
    {
      id: 'what-it-does-and-does-not-do',
      heading: '它能做什么，不做什么',
      blocks: [
        { type: 'p', text: '规划里繁琐的那部分，Trippy 很拿手；另外有些部分，它完全帮不上忙。依赖它之前，两张清单都值得看一看。' },
        { type: 'custom', html: limitsHtml(LIMITS) },
        { type: 'note', title: 'AI 可能出错', text: '语言模型不管对不对，写出来都一样流畅。它可能把咖啡馆标在错的街上，报出去年的票价，或者推荐一家已经停业的店。对待一份计划，就像对待一位见多识广、但近来没去过当地的朋友给的建议：凡是弄错了会让你懊恼的事，都自己查一查。' },
      ],
    },
    {
      id: 'views',
      heading: '同样的行程，三种视图',
      blocks: [
        { type: 'p', text: '每个人看计划的方式不一样，所以登录后的页面有三种视图。它们显示的是同样的行程、同样的信息，只是按不同的喜好来编排。第一次登录时会请你选一种，之后随时可以在[设置](#/settings)里更改。每种视图都有深色和浅色主题。' },
        { type: 'custom', html: viewsHtml(VIEWS, { baseUrl: BASE_URL }) },
        { type: 'subheading', text: '方形屏幕' },
        { type: 'custom', html: squareHtml(SQUARE, { baseUrl: BASE_URL }) },
      ],
    },
    {
      id: 'your-data',
      heading: '你的资料',
      blocks: [
        { type: 'p', text: '你用 Google 账户登录，Trippy 会保存其中的姓名、电邮地址和头像。它也保存你告诉它的内容：你居住的城市、你的货币、你所持的护照，以及你的行程和其中的一切。你为某趟行程填写的回答会发给 AI 服务商，好让它写出计划。最近的行程也存在你的设备上，以便离线打开，退出登录时会从设备上清除。没有广告，也没有广告追踪器。[隐私政策](#/privacy)把这一切完整写明，包括如何查看、更正或删除我们持有的关于你的资料，以及如何撤回同意。' },
      ],
    },
    {
      id: 'who-makes-it',
      heading: '谁做的',
      blocks: [
        { type: 'p', text: 'Trippy 是一个个人项目，制作和运营地点：{country}。它起初是我们为了规划从新加坡出发的行程而做的工具，所以默认设置偏向这边：货币用新元，建议里有去峇淡岛、迪沙鲁这类地方的短途行程。不过它可以规划从任何地方到任何地方的行程。' },
        { type: 'p', text: '使用它不用花钱，也没有付费版。订票网站的链接只是普通链接，你点进去，Trippy 不会因此赚到任何钱。如果哪天情况有变，会先在这一页说明。' },
        { type: 'defs', rows: [
          { term: '运营者', text: '{operator}' },
          { term: '疑问和问题', text: '请写信至：{contactEmail}' },
          { term: '关于你的个人资料', text: '请写信给资料保护联络人：{dpoEmail}' },
          { term: '网址', text: '应用的网址是 {siteUrl}' },
        ] },
      ],
    },
    {
      id: 'built-on',
      heading: '它建立在什么之上',
      blocks: [
        { type: 'p', text: 'Trippy 之所以小，是因为难做的部分别人已经做好并且分享了出来。下面是它所依靠的开放数据和服务。' },
        { type: 'defs', rows: [
          { term: 'OpenStreetMap', text: '街道地图、地点搜索（通过 Photon）和步行路线（通过 OSRM）。地图数据 © [OpenStreetMap](https://www.openstreetmap.org/copyright) 贡献者。' },
          { term: 'Natural Earth', text: 'Atlas 视图里的世界轮廓。[Natural Earth](https://www.naturalearthdata.com/) 属于公有领域。' },
          { term: 'Wikimedia Commons、Wikipedia 和 Wikidata', text: '大部分场所照片和封面照片，每张都注明作者和许可。原图可以在 [Wikimedia Commons](https://commons.wikimedia.org/) 找到。' },
          { term: 'Openverse 和 Pexels', text: '更多照片：通过 [Openverse](https://openverse.org/) 找到的开放许可照片，以及来自 [Pexels](https://www.pexels.com/) 的部分行程封面。' },
          { term: '场所网站和其他网页', text: '开放来源找不到时，照片可能来自场所自己的网站、它在 Google Maps上的页面，或者提到它的网页。这些照片留在原处，归其所有者所有，显示时附有来源链接。' },
          { term: 'Google Gemini 和 Mistral', text: '负责写计划、建议替代选项、在聊天面板里作答，并检查封面照片拍的是不是对的地方的 AI 模型。' },
          { term: 'Supabase', text: '登录、保存行程的数据库、文件存储，以及与 AI 服务商通信的服务器函数。' },
          { term: 'Leaflet', text: '绘制地图的程序库。' },
          { term: 'GitHub Pages', text: '应用本身就托管在这里。' },
        ] },
      ],
    },
    {
      id: 'questions',
      heading: '常见问题',
      blocks: [
        { type: 'faq', items: [
          { q: '真的免费吗？', a: '是的。没有付费版本，没有会到期的试用，也没有广告。' },
          { q: '需要账户吗？', a: '要规划行程就需要，而且只能用 Google 账户登录。如果只是看别人用链接分享给你的行程，就不需要。' },
          { q: 'Trippy 会代订机票或酒店吗？', a: '不会。它只给出建议，并附上航空公司或订票网站的链接，由你自己到那里预订。订好之后，可以把航班号、时间和订位编号填到行程里，所有东西就都在一处了。' },
          { q: '生成一份计划要多久？', a: '十天到两个星期的行程大约五分钟，短的更快。你不必守在页面上。可以关掉窗口过后再回来，或者要求在完成时收到通知。' },
          { q: '这份计划能信到什么程度？', a: [
            '大的安排可以信：哪些区域适合排在一起，一天能排多少，什么要提早订。那些错了就要赔上金钱或时间的细节，请自己核对：开放日、票价、餐馆是否还在营业、转乘要多久。',
            '入境要求最需要小心。Trippy 会列出它认为适用于你护照的要求，并附上官方网站的链接。但决定权在各国的移民当局，所以请亲自阅读他们的网页。',
          ] },
          { q: '为什么天气写的是“典型”？', a: '计划可能在你出发前几个月就写好了，那时谁也不知道天气会怎样。显示的是那个地方在那个月份通常的天气，在计划生成时写下。它不是天气预报，实际天气怎么变，它都不会变。' },
          { q: '没有网络时能用吗？', a: '可以阅读。你最近打开过的行程保存在设备上，离线也能打开，你还可以像安装应用那样把 Trippy 添加到主屏幕。生成新计划、编辑和聊天面板则需要联网。' },
          { q: '两个人可以一起规划吗？', a: '可以。用电邮邀请对方当查看者或编辑者，一方修改行程，另一方就会看到更新。你也可以为只需要看一看的人生成一个只读链接，以后再把它关掉。' },
          { q: '我已经在别处规划好行程了，可以带过来吗？', a: '可以。**Import trip**（导入行程）会给你一段提示词，把它连同你的笔记贴进任何一个 AI 助手，再把结果贴回来。保存之前你会先看到预览，导入之后也可以撤销。' },
          { q: '它有哪些语言？', a: '页脚和这几个页面（关于、隐私政策、使用条款）有英文、马来文、简体中文和芬兰文。应用的其余部分，以及计划本身，目前只有英文。' },
          { q: '怎样删除我的行程或账户？', a: '[设置](#/settings)里的 **Delete all my trips**（删除我的所有行程）会永久删除你拥有的每一趟行程。如果还想把账户和个人档案一并删除，请写信给资料保护联络人：{dpoEmail}。之后会怎样，[隐私政策](#/privacy)有说明。' },
        ] },
      ],
    },
  ],
};

/** Binds the plan sketch and the steps (js/site/about/mount.js), with the Chinese sample plan. */
export const mount = (root) => mountAbout(root, { places: PLACES, sketchWords: SKETCH });
