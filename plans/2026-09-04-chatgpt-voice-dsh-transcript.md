---
title: "梳理DSH技术细节（ChatGPT 对话原文存档）"
source: "https://chatgpt.com/share/6a9a603b-ead4-83e9-973e-2ea96cb2e588"
date: "2026-09-04"
---

# 梳理DSH技术细节

> ChatGPT 语音对话完整原文存档。
> 对话时间：2026-09-03 19:11 至 2026-09-04 14:06，跨多次语音会话；标题「梳理DSH技术细节」。
> 提取方式：2026-09-04 从分享页的 turbo-stream 数据载荷中解码出完整线性会话（488 条），这是分享页的权威数据，逐条对应消息 ID。
> 有效对话共 318 条气泡（130 条用户语音转写 + 188 条助手气泡），合并为 258 轮（129 问 / 129 答）。会话另有 39 条工具调用记录，其输出在分享页中被脱敏（The output of this plugin was redacted.），助手「我查一下/翻一下代码」后的检索过程因此不可见；隐藏思考（thoughts / reasoning recap）不在分享数据中；1 条系统注入的自定义指令通知未收录。
> 正文按原样保留：语音转写的停顿符「-」、口语、截断（语音打断导致的半句话）均未改动；用户消息两侧的引号是分享页界面装饰，已去除。助手同一轮被流式拆成多条气泡的已合并为一轮。回复中引用的网页链接已从正文剥离，附于对应轮次之后，全部去重链接见文末附录。


## User

嗨,我想让你帮我,捋一下DSH它的技术细节

## ChatGPT

好,我来过一遍,稍等,我在梳理......

行,我按DSH是DeepSeek Harness来讲;如果你说的不是这个,我们等会儿再改。简单说,DSH不是一个单一模型,而是一个代理运行底座,把模型、工具、权限、记忆和交互组合起来,让 agent可以稳定长期跑任务。它大概分三层:SDK底座、DSH工具层和生态层,生态里是插件、技能、profiles这些。核心就是 profile加插件加运行循环。Profile定义用哪套插件和配置;插件把模型、工具、存储等等全部模块化;运行循环负责把用户输入、上下文、工具调用串成一个可持续的任务循环。

如果你想继续深入,

引用链接：
- <https://dsh.hicyou.com/en/docs/getting-started/introduction>
- <https://www.dshfind.com/zh/learn/intro/what-is-dsh>
- <https://dsh.hicyou.com/en/docs/help/glossary>
- <https://github.com/Electricitysheep/dsh-handbook/blob/main/docs/01-intro.en.md>
- <https://dsh.fish/docs/concepts>
- <https://www.deepseekdsh.com/zh>
- <https://www.dshfind.com/zh/docs/subsystems/core>
- <https://arxiv.org/abs/2608.16393>

## User

那我

## ChatGPT

比如,怎么把你现在的Agent平台映射到DSH,还是想先看它的安全边界?

## User

我想知道它- 嗯- 我要怎么样把它能- 能系统的了解呢?比如说你刚才说了- 用profile来定义一个- 什么什么东西,然后- 就是- 嗯- 它和我已经知道了哪个系统很像然后我们用这种类比的方式- 我是不是更容易理解一下- 它是一个

## ChatGPT

嗯

## User

- 嗯...web开发- 然后经常用Vue,然后也用Node.js等等- 能给我举个例子吗

## ChatGPT

我来想一下,怎么类比你更熟悉......

对,用你熟悉的Web开发来比喻会更直观。你可以把DSH粗略理解成:Agent世界里的Nuxt或 NestJS加上 npm插件生态和 Docker Compose的组合。Profile就像你的package.json加上.env加上配置文件,定义这个Agent启动时加载哪些插件、用哪个模型、能访问哪些工具和权限,插件就像 npm 包,给它扩展能力。比如文件系统、Shell、浏览器、存储、第三方 API,运行循环就像后端请求处理流程:用户输入类似一个请求,Agent根据配置组装上下文,调用模型,模型决定要不要调工具,工具执行后把结果写回,再进入下一步,直到完成响应。所以学习路径也可以套你熟悉的方式:先啃配置,搞清楚-

## User

那我等一下,我先问

## ChatGPT

嗯

## User

- 我问几点- 第一个- 就是- 如果- 如果它是这种所有都是模块的话- 就像是我用C写也可以所有都是模块- 但是C永远有一个- main函数,它从main进入以后,main来启动、驱动所有的这些- 东西连起来- 如果它是一个佛珠,它中间有一根线,然后外边都是珠子,对吧所以现在我的想法是- 那这套系统是不是得有一根线然后这些珠子都是插件,对吗

## ChatGPT

我来确认下这个部分......

对,你这个比喻非常准,DSH一定有那根线。在DSH里,这根线就是它的核心运行时或叫Agent Loop,就像C里的main函数。它负责启动、装配、调度、循环执行,插件是珠子,提供具体能力,但没有运行时去拉起和调度,插件就只是摆设。Profile不是那根线,更像穿珠子的说明书或配线方案;真正穿起来并让它跑的是runtime本身。

## User

但是据我所知,那个runtime本身也可以是插件类的

## ChatGPT

我来确认一下。

对,你说得更精确。我

引用链接：
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/>
- <https://deepseekdocs.com/en/docs/learn/core/agent-loop>
- <https://dsh.pub/en/plugins/agent-loop/>
- <https://dsh.pub/en/plugins/agent/>
- <https://deepseekdocs.com/docs/learn/core/agent-loop>
- <https://qgithub.com/sandbaseai/deepseek-harness-handbook/blob/main/docs/en/architecture/agent-runtime.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/config-catalog.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md>
- <https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/core>
- <https://dshplugin.app/guides/dsh-plugins-bundles-profiles>
- <https://ithub.global.ssl.fastly.net/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.md>
- <https://www.reddit.com/r/DeepSeek/comments/1vnamjq/the_deeseek_harness/>
- <https://www.reddit.com/r/DeepSeek/comments/1vtvbmw/i_built_a_conversation_tree_for_deepseek_harness/>
- <https://www.reddit.com/r/DeepSeek/comments/1vpqkgi/deepseek_harness/>
- <https://www.reddit.com/r/DeepSeek/comments/1vta7wc/any_recommended_plugin_for_dsh/>
- <https://www.reddit.com/r/DeepSeek/comments/1vyarox/i_built_a_deepseek_harness_plugin_that_proves_why/>
- <https://www.reddit.com/r/sideprojects/comments/1vyb5kp/i_built_a_deepseek_harness_plugin_that_proves_why/>
- <https://www.reddit.com/r/DeepSeek/comments/1vz0dkf/i_made_a_dsh_plugin_that_finds_and_installs_other/>
- <https://www.reddit.com/r/DeepSeek/comments/1vwzsf9/deepseek_harness_is_so_cool/>
- <https://www.reddit.com/r/DeepSeek/comments/1vvlnml/switched_to_deepseek_harness_your_context_didnt/>
- <https://www.reddit.com/r/DeepSeek/comments/1vyu5jy/i_built_a_plugin_so_you_can_play_games_while/>
- <https://www.reddit.com/r/DeepSeek/comments/1vnpt5n/my_first_impressions_of_deepseek_harness/>
- <https://www.reddit.com/r/DeepSeek/comments/1vw0i8b/i_tried_fixing_deepseek_harness_forgetting/>
- <https://openreview.net/pdf/e91939038571a474d5d9d089933e0f3323af584d.pdf>
- <https://arxiv.org/abs/2608.16393>
- <https://en.wikipedia.org/wiki/DeepSeek>

## User

一下

## ChatGPT

刚才说的线太粗了,DSH里连运行循环本身也可以做成插件,由一个非常薄的启动器去装配和拉起来。也就是说,一定有个最小不可再拆的 bootstrap,但那个最小的部分非常克制,只是加载配置、装插件、启动主循环。主循环自己也是可替换的。这就像在 Node里有个极简的入口文件,真正业务跑法却由后面挂载的核心插件决定。

## User

那我现在是不是- 可以理解成为- 整个- 嗯...DSH它- 是一系列的这些块。然后有一个触发- 然后触发完以后,这些块是怎么样穿起来的,谁先谁后它是通过那个profile来定义的

## ChatGPT

我再确认下这个逻辑......

嗯,可以接近这么理解,但要稍微纠正:profile更像装配清单和默认配置,决定要加载哪些模块。但谁先谁后怎么跑,通常是由运行时和插件的钩子机制共同决定的,而不是在 profile 里手写流程。打个比方, Vue里你用 app.use 装插件,但真正生命周期是由 Vue runtime 定义的。DSH也类似,profile决定装哪些珠子,主循环和钩子机制决定珠子什么时候被用、怎么参与。所以系统性抓手可以是:先理解运行时生命周期,再看 profile 如何装配,最后深入各个插件的插入点。

## User

那我继续提问- 那这些插入点是- 固定的,就像是生命周期的hook一样,还是说

## ChatGPT

我再确认下这个部分。

## User

- 这些插入点本身它也是一个可以定义的某一个东西- 类似profile里边去定义的

## ChatGPT

我来核对一下。稍等。

对,有两层:一层是系统级插入入点是比较固定的,类似 Vue 的生命周期钩子;另一层是插件还能继续往里加自己的扩展点。DSH的事件系统就是扩展点本身,有会话级、代理级、能力级三类;插件能往共享上下文里注册新的 service、事件甚至副作用,也就是说,基础生命周期由核心和主循环约定好,但扩展点本身是可以被插件继续扩展的。Profile通常不发明新的 hook,它更多是选择加载哪些插件组合、用哪些补丁配置去改装这些插件。所以更贴切的说法是,插入点的框架是约定好的,但插件可以叠加新的扩展面,profile只是选用哪套组合和配置,而不是流程编排语言。

引用链接：
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/>
- <https://dsh.pub/en/plugins/agent-loop/>
- <https://dsh.pub/en/plugins/hooks-adapter/>
- <https://dsh.pub/en/plugins/hooks-codex/>
- <https://dsh.pub/en/categories/runtime/>
- <https://deepseekdocs.com/en/docs/learn/core/agent-loop>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.md>
- <https://www.dshbase.com/plugins/dsh-hooks/>
- <https://www.dshbase.com/plugins/dsh-loop-dock/>
- <https://dsh-in-depth.com/core/agent-loop>
- <https://dshai.org/>
- <https://www.reddit.com/r/DeepSeek/comments/1vnamjq/the_deeseek_harness/>
- <https://www.reddit.com/r/DeepSeek/comments/1vyu5jy/i_built_a_plugin_so_you_can_play_games_while/>
- <https://www.reddit.com/r/DeepSeek/comments/1vz0dkf/i_made_a_dsh_plugin_that_finds_and_installs_other/>
- <https://www.reddit.com/r/DeepSeek/comments/1vu9cfq/deepseek_harness_vs_pi_two_bets_on_who_writes/>
- <https://www.reddit.com/r/DeepSeek/comments/1vywtbs/your_agent_just_finished_and_you_missed_it_here/>
- <https://www.reddit.com/r/DeepSeek/comments/1w3k79h/deepseek_harness_version_update/>
- <https://www.reddit.com/r/sideprojects/comments/1vyb5kp/i_built_a_deepseek_harness_plugin_that_proves_why/>
- <https://www.reddit.com/r/LocalLLM/comments/1vw3ecz/deepseek_harness_review_everything_is_a_plugin_dsh/>
- <https://www.reddit.com/r/DeepSeek/comments/1vrc8fe/deepseek_harness_didnt_have_chatgptstyle_image/>
- <https://www.reddit.com/r/DeepSeek/comments/1vnv6nk/deepseek_harness_looks_insanely_flexible_but/>
- <https://www.reddit.com/r/DeepSeek/comments/1vnfz2l/deepseek_harness_is_on_whole_different_level/>
- <https://www.reddit.com/r/DeepSeek/comments/1vpqkgi/deepseek_harness/>
- <https://arxiv.org/abs/2608.23953>
- <https://arxiv.org/abs/2608.16393>
- <https://arxiv.org/abs/2605.13357>

## User

好,我继续提问- 那如果我现在的需求是- 如果最小化,也就是说- 最小化就是一直把里边所有的插件都删掉- 删到不能再删,它剩下什么

## ChatGPT

我来确认下。

对,这是个关键问题。把插件删到不能再删,DSH只剩一个基于 Cordis 的插件组合器和启动器,能解析 profile、挂载插件、提供共享上下文和加载卸载机制。这时还不是一个真正能干活的 agent。要成为最小可用 agent,至少还得再加上 agent loop、模型适配器、会话记录和系统提示组装,以及最基本的工具注册表等等。这些在 DSH里也都是以插件-嗯

引用链接：
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.md>
- <https://deepseek.com/harness/en/>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md?ref=explainx>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/AGENTS.md>
- <https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/>
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/>
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/core>
- <https://www.deepseek.com/harness/en/>
- <https://deepseekplugin.com/docs>
- <https://dsharness.org/install>
- <https://deepseekdocs.com/en/docs/learn/intro/what-is-dsh>
- <https://deepseekdocs.com/en/docs/learn/dev/hello-plugin>
- <https://dshhub.dev/docs>
- <https://qgithub.com/sandbaseai/deepseek-harness-handbook/blob/main/docs/en/architecture/agent-runtime.md>
- <https://dshplugin.app/guides/dsh-plugins-bundles-profiles>
- <https://dsh.hicyou.com/en/docs/developer/architecture>
- <https://dsh.hicyou.com/en/docs/developer>
- <https://www.reddit.com/r/DeepSeek/comments/1vnamjq/the_deeseek_harness/>
- <https://www.reddit.com/r/DeepSeek/comments/1vw0i8b/i_tried_fixing_deepseek_harness_forgetting/>
- <https://www.reddit.com/r/DeepSeek/comments/1votejd/tldr_of_why_dshcordis_is_a_big_deal_lh_tasks_and/>
- <https://arxiv.org/abs/2608.23953>

## User

那这又太多了我现在- 我现在的需求是- 如果我现在- 就是要最小的跑起来。我所谓的跑起来就是just run- 不需要其他什么功能- 就只需要run- 它只要run起来,那么我我认为这件事情就已经跑通了- 那我现在如果需要run起来- 也就是最小的这个 “Hello World ”然后它是什么东西呢

## ChatGPT

我确认下。

对,那就把Hello World定义成DSH能启动起来,而不是最小 agent能干活儿,官方给的最小跑法其实就是 npx @deepseek-ai/dsh web,用 Web UI 启动,这会拉起默认配置和插件树,但这已经不是删到不能再删的极简了。如果你追求真正极简,那只剩下 Cordis + DSH bootstrap,它只会证明插件系统能被装载,不会有可见的 agent 行为。如果你要一个介于两者之间的“最小能动的 Agent”,官方有个叫 sdk-minimal

引用链接：
- <https://www.deepseek.com/harness/en/>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/sdk-minimal/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/python/sdk/examples/README.md>
- <https://www.deepseekdsh.com/guides/commands>
- <https://dsharness.org/install>
- <https://dsh-in-depth.com/overview/getting-started>
- <https://deepseek-harness.github.io/deepseek-harness/en/guide/quickstart>
- <https://www.dsharness.io/en/blog/getting-started-with-deepseek-harness>
- <https://www.deepseekharness.online/en/guide/quick-start/>
- <https://dshx.dev/docs/quickstart/>
- <https://deepseekharnessplugins.com/learn/quickstart>
- <https://deepseekdocs.com/en/docs/getting-started/quickstart>
- <https://www.reddit.com/r/LocalLLaMA/comments/1vtw870/how_to_use_qwen27b_with_deepseek_harness/>
- <https://www.reddit.com/r/accelerate/comments/1vpcvce/deepseek_harness_being_opensource_is_allowing_the/>
- <https://www.reddit.com/r/DeepSeek/comments/1vw9rel/made_deepseek_harness_tunnel_to_your_phone_using/>
- <https://www.reddit.com/r/DeepSeek/comments/1vwgaez/new_to_deepseek_need_a_little_clarification/>
- <https://www.reddit.com/r/DeepSeek/comments/1vpcutr/deepseek_v4_pro_0813_minimal_preset_on_dsh_vs/>
- <https://www.reddit.com/r/DeepSeek/comments/1vqk5w5/deepseek_harness_and_skills/>
- <https://www.reddit.com/r/DeepSeek/comments/1w230u9/we_ran_162_migration_tests_before_calling_our_dsh/>
- <https://www.reddit.com/r/DeepSeek/comments/1vovxxc/deepseek_4_pro_ga_has_an_astonishing_blunder/>
- <https://www.reddit.com/r/DeepSeek/comments/1t6e2i8/a_claudecodeclass_harness_for_deepseek/>
- <https://www.reddit.com/r/DeepSeek/comments/1vww7ln/anyone_else_built_voice_input_plugin_for_deepseek/>
- <https://www.reddit.com/r/DeepSeek/comments/1vum3f3/getting_the_vision_model_to_work_in_dsh/>
- <https://www.reddit.com/r/DeepSeek/comments/1w3k79h/deepseek_harness_version_update/>
- <https://doccompiler.ai/api/v1/jobs/shared/job_1776399442436_d3b62c6a/download/deepseek-ai__DeepSeek-V3__UserGuide.pdf>
- <https://arxiv.org/abs/2608.16393>
- <https://www.belmont.edu/data/_files/deepseek-a-step-by-step-beginners-guide.pdf>
- <https://shoepaly.app/?_=%2Fpdf%2F2606.09498%23hKr38k1yZITo%2FkpxGBdjJos%3D>

## User

我没有要两者之间,你他妈不要给自己加!我操你妈的!我- 我跟你好好说话,你不要自己胡他妈加

## ChatGPT

我......

## User

连话都听不懂吗

## ChatGPT

明白了,我刚才加多了,按你的标准,最小 run 就是进程能启动、配置能读、插件容器能初始化、然后不崩掉。这种最小壳子本身不等于 Agent,只是个可启动的插件运行壳。

## User

我知道我知道,别他妈那么多废话,行不行

## ChatGPT

我收住,按最短说......

## User

我问啥你答啥行不行

## ChatGPT

行。最小的 Hello World,就是 bootstrap 能启动,加载一个空的 profile,插件容器初始化成功,没别的了。

## User

那bootstrap是个什么东西呀- 是一个文件吗

## ChatGPT

我来确认下。

## User

它底层是拿Node.js写的吗

## ChatGPT

不是单独一个文件,而是一段启动逻辑,可能由一个入口文件触发,但本质是“把系统从零拉起来”的那部分代码;DSH 这套实现是基于 Node.js 和 npm 生态的。

## User

那是不是理论上它也可以用Bun一类的东西重写

## ChatGPT

我确认一下。

理论上可以,但那就不再是直接跑现有 DSH,而是你自己用 Bun 重写一套同构的启动加插件系统。

## User

那bootstrap它本身做的作用是什么?就只是启动运行

## ChatGPT

我来仔细想想。

## User

如果用一个最简单的JS文件来- 来类比的话,那这一个JS文件它里边的代码是什么?最小

## ChatGPT

我想确认下最小的示例长什么样......

我想确认下最小的示例长什么样......稍等。最小可以类比成,有个入口文件,读一个配置对象,创建一个共享上下文,按配置把插件函数依次 require 或 import 进来执行,最后打印一句“started”就算跑起来了。用伪代码就是:读 profile、建 ctx、加载 plugins、启动。

## User

那ctx就是一个对象,那么接下来所有的这些上下文都往这个对象里边塞东西,对吗

## ChatGPT

我来确认一下。

我来确认一下。对,基本可以这么理解。ctx 就是共享容器,插件往里挂服务和能力,后续从里边取用,它更像服务容器,不是聊天内容本身。聊天记录通常是 ctx 里某个 service 负责。

## User

那bootstrap已经挂接了插件,那么,agent loop是也是在插件里边的吗

## ChatGPT

我来确认下。

我来确认下。对,agent loop 通常也是一个插件挂进来的,由 bootstrap 加载后交出控制权,后面主要就是它在驱动。

## User

那么- 原始的版本中,Agent Loop是怎么写的

## ChatGPT

我确认下。

原始默认的 Agent Loop大概就是一个循环,不停取用户输入,组装系统提示和会话历史,调用模型,如果模型要调用就执行工具,把结果写回,直到这一轮没有工具调用,就关闭本轮。更像一个 ReAct 循环的精简-嗯

引用链接：
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/package.json>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/src/agent.ts>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/README.zh.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/README.md>
- <https://deepseekdocs.com/en/docs/learn/core/agent-loop>
- <https://deepseekdocs.com/docs/learn/core/agent-loop>
- <https://dsh-in-depth.com/core/agent-loop>
- <https://dsh-in-depth.com/zh/core/agent-loop>
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/core>
- <https://deepseek-harness.github.io/deepseek-harness/reference/config-catalog>
- <https://ithub.global.ssl.fastly.net/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.md>
- <https://ithub.global.ssl.fastly.net/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/README.zh.md>
- <https://ithub.global.ssl.fastly.net/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/src/index.ts>
- <https://gist.github.com/sing1ee/49829eacc32e31e69fa31a783047cb0f>
- <https://www.dshfind.com/en/docs/subsystems/core>
- <https://dshx.dev/docs/tutorial/source/agent-source/>
- <https://www.reddit.com/r/DeepSeek/comments/1vtlef9/native_macos_gui_for_deepseeks_dsh_agent_harness/>
- <https://www.reddit.com/r/DeepSeek/comments/1vn9yx2/deepseek_harness/>
- <https://www.reddit.com/r/DeepSeek/comments/1vywtbs/your_agent_just_finished_and_you_missed_it_here/>
- <https://www.reddit.com/r/DeepSeek/comments/1w230u9/we_ran_162_migration_tests_before_calling_our_dsh/>
- <https://www.reddit.com/r/DeepSeek/comments/1vvlnml/switched_to_deepseek_harness_your_context_didnt/>
- <https://www.reddit.com/r/DeepSeek/comments/1vz0dkf/i_made_a_dsh_plugin_that_finds_and_installs_other/>
- <https://github.com/yangbobo2021/Relay/blob/codex/relay-foundation/docs/media/dsh-plugin-manager-codex-install-demo.en.mp4? ... DeepSeek Harness already supports plugins, but installing one still means finding the right package and using the CLI.>
- <https://www.reddit.com/r/DeepSeek/comments/1vnamjq/the_deeseek_harness/>
- <https://www.reddit.com/r/DeepSeek/comments/1vtvbmw/i_built_a_conversation_tree_for_deepseek_harness/>
- <https://www.reddit.com/r/DeepSeek/comments/1vxm2nu/dshclaudelive_stream_claude_codes_live_steps_into/>
- <https://www.reddit.com/r/DeepSeek/comments/1vrnnv8/i_built_ohmydsh_a_curated_distribution_layer_for/>
- <https://www.reddit.com/r/DeepSeek/comments/1vyarox/i_built_a_deepseek_harness_plugin_that_proves_why/>

## User

但是据我所知- 但是据我所知,现在它是无状态的。也就是说- 每一次对话,它- 类似HTTP请求一样,请求完就完了- 但只不过下次再请求的时候,它只是带了一个session ID一类的东西- 它从session log里边拿出来之前的上下文,再装载回去,我的理解对吗

## ChatGPT

我来仔细确认一下。

我来仔细确认一下。对,你理解基本对模型调用本身是无状态的,状态靠 session log 还原;每次请求根据 sessionId 找日志,把历史组装成这次模型的上下文。运行时会有一些内存对象,但每轮都会从日志重建,请求结束就释放,通过 session ID关联历史,所以体验上是有连续对话的。

引用链接：
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/session>
- <https://dsh.pub/en/plugins/session/>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/README.zh.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/session.md>
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/core>
- <https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/core>
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/>
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/persistence>
- <https://ithub.global.ssl.fastly.net/deepseek-ai/deepseek-harness/blob/master/packages/core/README.md>
- <https://ithub.global.ssl.fastly.net/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.md>
- <https://www.dshfind.com/en/docs/subsystems/core>
- <https://www.deepseek.com/harness/en/>
- <https://dsh-in-depth.com/core/agent-loop>
- <https://dsh-in-depth.com/core/session>
- <https://dshbase.com/blog/deepseek-harness-session-log/>
- <https://arxiv.org/abs/2608.23953>
- <https://www.reddit.com/r/DeepSeek/comments/1vnamjq/the_deeseek_harness/>

## User

模型实是对应的是什么意思啊

## ChatGPT

意思是说模型本身不记状态,就像无状态的HTTP 请求一样,每次都要把相关历史重新带上,它不会自己记得上一次。所以“有状态”的感觉其实是由外层把历史补回去实现的。

## User

那我继续提问

## ChatGPT

好。

## User

。那- 加载完插件以后,哪个插件先,哪个插件后,这个先后顺序是哪个文件定义的

## ChatGPT

我来确认下......通常是入口配置文件,比如 profile

我来确认下......通常是入口配置文件,比如 profile 或主配置里声明的加载顺序决定,更明确一点,主配置里列出 bundle 的顺序,每个 bundle 再通过自己的补丁文件插入具体插件。后面的层级会覆盖前面的,想看最终加载结果可以用--dump-config 把合成后的插件树打印出来。

引用链接：
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/base/cordis.patch.yml>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md?ref=explainx>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md?ref=explainx>
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/>
- <https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish>
- <https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish>
- <https://git.hubp.de/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md>
- <https://deepseekplugin.org/en/docs/package-install>
- <https://qgithub.com/sandbaseai/deepseek-harness-handbook/blob/main/docs/en/plugin-development/first-plugin.md>
- <https://deepseekdocs.com/en/docs/user-guide/configuration>
- <https://download.plaud.ai/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md>
- <https://ithub.global.ssl.fastly.net/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md>
- <https://www.reddit.com/r/DeepSeek/comments/1vthl6g/deepseek_harness_the_everything_is_a_plugin_pitch/>
- <https://arxiv.org/abs/2609.01600>
- <https://arxiv.org/abs/2608.16393>
- <https://openreview.net/pdf/e91939038571a474d5d9d089933e0f3323af584d.pdf>
- <https://shoepaly.app/?_=%2Fpdf%2F2606.09498%23hKr38k1yZITo%2FkpxGBdjJos%3D>

## User

你还是没有说明白,我问的- 是谁决定的,谁先谁后,还是用什么样的机制- 把这些珠子运行起來的

## ChatGPT

我来仔细核对下......谁决定

我来仔细核对下......谁决定加载顺序,不是某个插件自己决定全部顺序,而是由启动器按合成后的插件树依次挂载,运行时由 Agent Loop 发生命周期事件。插件提前注册好钩子,等事件触发时被调用。所以“谁先谁后”分两层:装配顺序是 profile 加 patch 合成的插件树,调度顺序是 Agent Loop 的生命周期事件。插件本身多数是被动注册能力,等待被调用。

引用链接：
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.zh.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md?ref=explainx>
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/>
- <https://deepseek-harness.github.io/deepseek-harness/reference/>
- <https://git.hubp.de/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md>
- <https://deepseekplugin.org/en/docs/package-install>
- <https://download.plaud.ai/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md>
- <https://dshkit.dev/plugins/everything-is-a-plugin>
- <https://dsh.hicyou.com/en/docs/developer/architecture>
- <https://qgithub.com/sandbaseai/deepseek-harness-handbook/blob/main/docs/en/plugin-development/first-plugin.md>
- <https://www.reddit.com/r/DeepSeek/comments/1vnamjq/the_deeseek_harness/>
- <https://www.reddit.com/r/DeepSeek/comments/1vz0dkf/i_made_a_dsh_plugin_that_finds_and_installs_other/>
- <https://www.reddit.com/r/DeepSeek/comments/1vw0i8b/i_tried_fixing_deepseek_harness_forgetting/>
- <https://www.reddit.com/r/DeepSeek/comments/1w3k79h/deepseek_harness_version_update/>
- <https://www.reddit.com/r/DeepSeek/comments/1vthl6g/deepseek_harness_the_everything_is_a_plugin_pitch/>
- <https://www.reddit.com/r/DeepSeek/comments/1w0qu8q/deepseek_harness_is_frustrating_is_it_just_me/>
- <https://arxiv.org/abs/2608.23953>
- <https://arxiv.org/abs/2609.01600>
- <https://arxiv.org/abs/2608.16393>
- <https://www.cambridge.org/engage/api-gateway/coe/assets/orp/resource/item/69ee2903810b9dcc828c5b8b/original/harness-resilience-from-llm-availability-to-toolchain-continuity-in-agentic-ai-engineering.pdf>

## User

我还是不明白,就是插件- 会- 事件调用。那么事件又是被谁调用的

## ChatGPT

我来核实下。事件是由运行时主动发出的

我来核实下。事件是由运行时主动发出的谁在那一刻掌控主流程,谁就在代码里 emit 事件。在DSH里主要是 Agent Loop 在跑主循环,它会在关键步骤前后发事件,插件只是提前注册监听函数,等事件被 emit 时响应。所以说到底,事件是被主流程调度的。

## User

那主流程,刚才又说了agent do- agent loop也不是主流程。而agent loop是被- 是被作为插件来加载的。那我想知道- 那agent loop是被- 是被插件加载,那就相当于- 如果整个插件流程里边只需要一个agent loop,agent loop不停地分发事件,那么这件事情就已经跑起来了,对吗

## ChatGPT

我再核对一下。

对,这次你理解对了,启动

## User

你说什么

## ChatGPT

对,这次你理解对了。启动阶段是 bootstrap 在当主流程,把插件都加载进来,加载完谁来跑日常主循环,就是 Agent Loop。它开始emit 事件、调模型、调工具等等。所以最小能跑版本就是 bootstrap 加载出一个 Agent Loop,然后调用它的 run,其余能力都可以是空实现或 stub。关键是 Agent Loop 能访问到它依赖的最小接口就行。

## User

那空实现是什么,就是- 只是- 只是有一个空的软件接口吗,然后具体不实现

## ChatGPT

对,差不多就是那个意思。空实现就是把接口摆在那里,能被调用,但里面什么都不做,或者只返回一个固定的假结果。比如工具执行函数在那儿,但直接返回 OK,不做真正逻辑。这样主流程能跑通,先...

## User

噢,那我继续去问

## ChatGPT

嗯。你说。

## User

我 -我继续问

## ChatGPT

嗯。

## User

如果- 如果现在里边出现了- 比如说- 某些agent要调用- 或者是某 -某些事件要调用某一个插件,而这个插件如果没有安装的话- 他帮我确认一下,它就是运行的空- 空- 空结果吗

## ChatGPT

我来确认下。

不一定是空结果,取决于依赖怎么声明。如果插件声明了必需依赖但没装,通常是插件不会被加载,或者直接报错。DSH 不会自动帮你降级成空实现。只有当插件作者自己写了可选依赖或 fallback 逻辑时,才会返回空结果或跳过。

引用链接：
- <https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/03-services>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/framework/service.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/framework/service.zh.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-tutorial/03-services.md>
- <https://github.com/deepseek-ai/deepseek-harness/discussions/1197>
- <https://deepseek-harness.github.io/deepseek-harness/en/develop/framework/service>
- <https://deepseek-harness.github.io/deepseek-harness/develop/framework/service>
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-primer>
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-api/registry>
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-api/context>
- <https://deepseek-harness.github.io/deepseek-harness/en/develop/framework/>
- <https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/06-composition-and-hmr>
- <https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish>
- <https://deepseekplugin.org/en/docs/services-dependencies>
- <https://deepseekplugin.org/docs/services-dependencies>
- <https://dshkit.dev/errors/plugin-not-loading>
- <https://qgithub.com/sandbaseai/deepseek-harness-handbook/blob/main/docs/en/troubleshooting/plugin-install-recovery.md>
- <https://qgithub.com/sandbaseai/deepseek-harness-handbook/blob/main/docs/en/troubleshooting/plugin-peer-dependency-warnings.md>
- <https://dsharness.org/install>
- <https://www.dshbase.com/troubleshooting/>
- <https://deepseekharness.dev/tutorials/services-and-dependencies>
- <https://deepseekdocs.com/en/docs/user-guide/plugins>
- <https://www.reddit.com/r/DeepSeek/comments/1vw0i8b/i_tried_fixing_deepseek_harness_forgetting/>

## User

我最后没听过,没听清楚- 是什么情况下才会有空结果或者跳过

## ChatGPT

只有当插件作者主动写了可选依赖或 fallback 逻辑时,才会出现空结果或跳过;否则就是不加载或直接报错。

## User

Fallback- 是什么东西

## ChatGPT

就是兜底方案,比如说,发现某个服务没装,就自己走一个简化流程,返回一个默认值,而不是直接崩掉。简单说,主流程发现缺件时的备胎做法。

## User

噢- 那profile 本身- 就像- Node 的package- 装哪个,然后装的顺序其实不是package- 的

## ChatGPT

我来确认下。

## User

不是profile 来定义哪个先后

## ChatGPT

对,差不多是。profile 更像装配清单,决定装什么和配置覆盖关系,但不直接规定运行先后。加载先后是合成后的插件树决定,运行先后是 Agent Loop发事件决定。所以 profile 管装配,不直接管谁先跑。这就像 package.json 列依赖,但 Express 的 middleware 顺序才决定请求怎么跑一样。

## User

噢- Middleware是挂载在- 呃,比如说是Middleware是挂挂载在router里边的,对吧

## ChatGPT

我来确认下......

我来确认下......对,但更准确点,middleware 可以挂在 app 上,也可以挂在特定 router 上。谁先谁后由你 use 的注册顺序决定。类比到 DSH,插件就是挂在 agent loop 暴露的事件点上。

## User

那我现在想问,现在有一个问题- 要你这么说的话,bootstrap然后它- 触发的,尤其也只有agent loop

## ChatGPT

嗯。

## User

如果我想要在这个流程当中,不止运行Agent Loop,那我要挂载到哪儿呢?所以就是Agent Loop是一个特殊挂载- 挂载进去以后,它就会直接执行

## ChatGPT

我来确认下。

对,抓到点上了。Agent Loop 是个特殊的主 runner,通常由 bootstrap 在装配完成后主动启动它。但系统里不一定只能有它一个运行器。你要“不止 Agent Loop”,有两种常见位置:一是挂在 bootstrap 之后的 start 阶段,和 Agent 并列跑,比如 web server、定时任务、MQTT连接;二是挂在 Agent Loop 的生命周期事件上参与 Agent 流程。一句话,想参与 Agent 思考就挂 Agent Loop的 hook;想并列跑服务就挂在 bootstrap 之后的应用启动阶段。

## User

那就相当于是- Agent Loop是可以平行的挂好几个

## ChatGPT

我来确认下。

我来确认下。对,技术上可以并行挂好几个 Agent Loop,但一般建议一个 session 或任务只有一个主 Agent Loop,否则状态会打架。多个 loop 可以并行,但要各管各的任务队列或 session,彼此不要抢同一个上下文。如果你真想让多个 loop处理一个任务,那中间必须加调度器,明确谁先谁后。一句话:能并行,但要隔离或调度,不能抢......

## User

那AgentLoop -现在- 哎呀,你他妈别那么多废话

## ChatGPT

行,我收住,结

行,我收住,结论是......Agent Loop 就是运行期主调度器。

## User

你不要结论,我他妈没问你要结论

## ChatGPT

好,那我不总结了。

## User

那平行的Agent Loop可以有- 很多个- 执行,但一般来说只挂一个,那web server也是平行来说只挂一个

## ChatGPT

我来确认下。

是,但 Web Server 和 Agent Loop 更像是同一层级的并行运行体,分别由 bootstrap 启动,通常也是各一个主实例,但也能开多个端口或进程。关键是,它们都属于 bootstrap

## User

那- 挂接的时候

## ChatGPT

后并列启动的 runner,而不是谁挂在谁上面。你说。

## User

这些所以现在- 所以现在runner是在- 嗯,我我现在- 就是bootstrap下边是下边一层是runner,可以挂多个runner然后挂了runner以后,runner就会自己跑自己的。而runner又是非阻塞的,所以也挂多个runner的时候- 运行第一个,第二个马上也会启动

## ChatGPT

我来核实,

## User

我理解对吗

## ChatGPT

大方向是对的,bootstrap 启动后把多个 runner 拉起来是可以的,但 runner 不是固定一层结构,而是插件注册出来的长期运行任务。它们能并行启动,但前提是启动方式是非阻塞的,比如 Promise .all 或后台任务如果 await 卡住了,后面的就起不来。所以,并行与否看启动方式,不是天然全部非阻塞。

## User

那我明白了,那- runner是一种类型的插件,对吗?只要是在bootstrap里边- 注册,通过profile注册的插件中,有runner这个类型的插件,那么runner就会在这儿- 被调用- 而- 除runner以外,应该还有其他类型的插件,对吗

## ChatGPT

我来核实下......

对,可以这么理解。runner 就是一类会被启动后长期运行的插件。但除了runner还有大量提供能力的插件,比如模型适配器、工具注册、session 日志、权限、内存等等。这些不主动跑,而是被 runner 调用。所以结构大致是 profile 选插件、bootstrap 加载插件、runner 启动后调用其他插件���所以你的表述基本方向是对的,只是 runner 是其中一种会主动跑的插件类型。

引用链接：
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md?ref=explainx>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/extensions/tool-cordis/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/AGENTS.md>
- <https://deepseek.com/harness/en/>
- <https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/>
- <https://github.laiyagushi.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md>
- <https://dshplugin.app/guides/dsh-plugins-bundles-profiles>
- <https://dsh.hicyou.com/en/docs/developer/architecture>
- <https://cordis.run/en/guides>
- <https://deepseekdocs.com/en/docs/learn/core/plugin-anatomy>
- <https://www.reddit.com/r/DeepSeek/comments/1vnamjq/the_deeseek_harness/>
- <https://www.reddit.com/r/DeepSeek/comments/1vu9cfq/deepseek_harness_vs_pi_two_bets_on_who_writes/>
- <https://www.reddit.com/r/DeepSeek/comments/1vnpt5n/my_first_impressions_of_deepseek_harness/>
- <https://www.reddit.com/r/DeepSeek/comments/1vthl6g/deepseek_harness_the_everything_is_a_plugin_pitch/>
- <https://www.reddit.com/r/DeepSeek/comments/1w0qu8q/deepseek_harness_is_frustrating_is_it_just_me/>
- <https://www.reddit.com/r/DeepSeek/comments/1vyarox/i_built_a_deepseek_harness_plugin_that_proves_why/>
- <https://arxiv.org/abs/2608.23953>
- <https://arxiv.org/abs/2609.01600>
- <https://arxiv.org/abs/2608.16393>
- <https://www.preprints.org/frontend/manuscript/2ac614cb5a2d08573aea6cd8fd2f1675/download_pub>
- <https://openreview.net/pdf/e91939038571a474d5d9d089933e0f3323af584d.pdf>

## User

那我想问- runner这种主动跑的插件类型,是在哪儿定义的?是这个插件本身它有一个key是- type等于runner,还是说- 它在- 它在profile里边定义的时候,有一个对应的接口,那就是- 在那儿定义的这个插件属于runner,那它就会按照runner- 那么它还有其他的类型吗?帮我列出来其他类型

## ChatGPT

我来确认下。

不是靠写 type = runner 这种字段。目前 DSH 里插件就是在 profile patch 里声明一个插件名和配置,是不是 runner,取决于插件自己注册了什么能力和暴露的接口,比如 web runner、headless runner、agent loop 都是各自实现的。其他类型也不是严格枚举,更多是角色划分:有 runner 类型的、service 类型的、tool 类型的、policy

prompt UI 等等,但这些是约定俗成...

引用链接：
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/base/cordis.patch.yml>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/src/index.ts>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/package.json>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/extensions/cordis-host-runner/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/extensions/tool-cordis/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/config-catalog.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md?ref=explainx>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.zh.md>
- <https://github.com/deepseek-ai/deepseek-harness/>
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/>
- <https://dsh.pub/en/plugins/cordis-client-runner/>
- <https://dsh.pub/en/plugins/cordis-host-runner/>
- <https://dsh.pub/en/plugins/tool-cordis/>
- <https://dsh.pub/en/plugins/dsh-dynplugin-manager/>
- <https://dsh.pub/en/plugins/sev7een-dsh-plugin-ds-api-usage/>
- <https://dsh.pub/en/plugins/dsh-remote/>
- <https://cordis.run/en/guides>
- <https://dsharness.org/install>
- <https://deepseekharness.dev/tutorials/package-and-install>

## User

你你还是没有理解,我想- 就属于这个类型- 还是说- 它要声明成为哪个类,还是说- 或者它有一个什么configure文件定义了它是哪种类型- 这种类型是这种明确的硬- 硬

## ChatGPT

嗯,我来确认。

## User

只是- 它而只是你他妈听我说完- 而只是它约定俗成的一种- 处理方法

## ChatGPT

我来核对。

对,是后者,不是硬类型字段,也不是 profile 里声明类型,更多是插件在代码里注册了什么能力,比如注册了一个 run,然后被启动器当成要启动的东西。这是约定俗成加实现决定的,不是硬性类型字段。

引用链接：
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/extensions/tool-cordis/README.md>
- <https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish>
- <https://deepseekharness.dev/tutorials/package-and-install>
- <https://dshplugin.app/guides/dsh-plugins-bundles-profiles>
- <https://dshkit.dev/plugins/patching-plugin-config>
- <https://dshkit.dev/plugins/write-your-first-plugin>
- <https://dsh.hicyou.com/zh/docs/user-guide/plugins>
- <https://git.hubp.de/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md>
- <https://cordis.run/en/guides>
- <https://deepseekharness.wiki/en/tutorials/package-and-install>
- <https://www.reddit.com/r/DeepSeek/comments/1vthl6g/deepseek_harness_the_everything_is_a_plugin_pitch/>
- <https://arxiv.org/abs/2609.01600>
- <https://arxiv.org/abs/2608.16393>
- <https://runner.readthedocs.io/_/downloads/en/latest/pdf/>
- <https://shoepaly.app/?_=%2Fpdf%2F2606.09498%23hKr38k1yZITo%2FkpxGBdjJos%3D>

## User

那这个run是从哪儿来的呢

## ChatGPT

我来核实下。

run 就是插件代码里自己实现并注册的方法,比如 agent loop 插件实现了一个约定的接口,然后把自己注册到

引用链接：
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/src/index.ts>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.zh.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/src/index.ts>
- <https://deepseekdocs.com/en/docs/learn/core/agent-loop>
- <https://deepseekdocs.com/docs/learn/core/agent-loop>
- <https://ithub.global.ssl.fastly.net/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.md>
- <https://ithub.global.ssl.fastly.net/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/README.zh.md>
- <https://ithub.global.ssl.fastly.net/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/README.zh.md>
- <https://dsh-in-depth.com/core/agent-loop>
- <https://www.reddit.com/r/DeepSeek/comments/1vyarox/i_built_a_deepseek_harness_plugin_that_proves_why/>
- <https://www.reddit.com/r/DeepSeek/comments/1vtvbmw/i_built_a_conversation_tree_for_deepseek_harness/>
- <https://www.reddit.com/r/DeepSeek/comments/1tvdamv/i_made_a_batteriesincluded_agent_in_rust_that/>
- <https://www.reddit.com/r/sideprojects/comments/1vyb5kp/i_built_a_deepseek_harness_plugin_that_proves_why/>
- <https://www.reddit.com/r/DeepSeek/comments/1vyu5jy/i_built_a_plugin_so_you_can_play_games_while/>
- <https://www.reddit.com/r/DeepSeek/comments/1w2vxj3/how_would_you_build_a_multiagent_software/>
- <https://www.reddit.com/r/DeepSeek/comments/1w3k79h/deepseek_harness_version_update/>
- <https://www.reddit.com/r/DeepSeek/comments/1vthl6g/deepseek_harness_the_everything_is_a_plugin_pitch/>
- <https://www.reddit.com/r/codex/comments/1vo2jwu/deepseek_harness_may_have_a_higher_ceiling_than/>
- <https://www.reddit.com/r/DeepSeek/comments/1vywtbs/your_agent_just_finished_and_you_missed_it_here/>
- <https://www.reddit.com/r/DeepSeek/comments/1vvlnml/switched_to_deepseek_harness_your_context_didnt/>
- <https://www.reddit.com/r/DeepSeek/comments/1vwzsf9/deepseek_harness_is_so_cool/>
- <https://arxiv.org/abs/2608.16393>
- <https://arxiv.org/abs/2607.27309>
- <https://www.oracle.com/webfolder/technetwork/slackimages/devrel/slides-devcoach-040226.pdf?elqTrackId=7a7d2ac032514a669b9f2e635f3bc353&elqaid=152842&elqak=8AF50BCA0367108AD23D779DD94A31808CA723D89A93BF14D7741BB2C054C7ACA2C2&elqat=2>
- <https://openreview.net/pdf/f358711a95aaaf61fdeffd4ef3fc60fba9b8da57.pdf>

## User

不是,不是。我- 你现在还没理解

## ChatGPT

嗯,你说。

## User

,就是来定义的,必须得有有一个run,它就是runner

## ChatGPT

嗯,我来......

## User

就是这个这个规范是从哪儿来走的

## ChatGPT

我来-

## User

就我现在在问整个这个结构的规范

## ChatGPT

我来确认下......

刚才我说 run 这个不严谨,没有统一的 runner 类型字段,规范来自两层:Cordis 定义插件怎么挂 ctx,DSH 核心服务契约定义了哪些接口。Agent Loop本质是实现了 AgentFactory 接口,然后注册到 ctx.agents

.setFactory 上。所以,谁实现并注册到哪个核心服务,谁就扮演那个角色,而不是靠run 类型字段。如果你想要具体

引用链接：
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/src/index.ts>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/src/index.ts>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.zh.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-tutorial/index.md>
- <https://ithub.global.ssl.fastly.net/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.md>
- <https://ithub.global.ssl.fastly.net/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/src/index.ts>
- <https://dsh-in-depth.com/core/agent-loop>
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/core>
- <https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/core>
- <https://deepseekdocs.com/en/docs/learn/core/agent-loop>
- <https://deepseekharness.dev/tutorials/plugin-lifecycle>
- <https://deepseekharness.wiki/en/tutorials/plugin-lifecycle>
- <https://deepseek-harness-hub.com/tutorials/develop-framework/>
- <https://dsh.pub/en/plugins/agent-loop/>
- <https://www.reddit.com/r/DeepSeek/comments/1vnamjq/the_deeseek_harness/>
- <https://www.reddit.com/r/DeepSeek/comments/1w3k79h/deepseek_harness_version_update/>
- <https://www.reddit.com/r/AI_Agents/comments/1swcp29/deepseek_v32_looping_bug_what_settings_harness/>
- <https://www.reddit.com/r/DeepSeek/comments/1vu20xd/i_built_a_conversation_manager_for_deepseek/>
- <https://www.reddit.com/r/DeepSeek/comments/1vyz316/context_is_editable_now_i_made_a_plugin_for/>
- <https://www.reddit.com/r/DeepSeek/comments/1t6e2i8/a_claudecodeclass_harness_for_deepseek/>
- <https://arxiv.org/abs/2609.01600>

## User

啊那说明它开发的时候,还是得有一个

## ChatGPT

......

## User

官方官方的一个开发标准,比如说它要实现的这个呃,方法。那么在这个方法运行的时候,就会触发这件事,是这个逻辑吗

## ChatGPT

对,差不多是这个意思:有一套约定的接口和生命周期

## User

你他妈别差不多,你去看代码去

## ChatGPT

。

嗯,行,我去翻代码。稍等。

看了,有硬规范,但不是 type: runner,而是DSH core 定义的服务接口,比如 AgentFactory。Agent Loop 插件实现这个接口,然后在初始化时通过 ctx.agents.setFactory

注册,其他模块只通过ctx.agents间接使用它。同理,模型、工具、会话日志也是类似的服务规范,不���跑某个固定方法就算runner。换句话说,是核心服务接口规定好了形状,插件按那个形状实现并注册,这就是“谁来定义”。

引用链接：
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/src/index.ts>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/src/index.ts>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/src/runtime-context.ts>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/tools/src/index.ts>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/README.zh.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/package.json>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/src/agent.ts>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.zh.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/framework/service.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-tutorial/03-services.md>
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/core>
- <https://deepseek-harness.github.io/deepseek-harness/en/develop/framework/service>
- <https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/03-services>
- <https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/>
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-primer>
- <https://ithub.global.ssl.fastly.net/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.md>
- <https://ithub.global.ssl.fastly.net/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/src/index.ts>
- <https://ithub.global.ssl.fastly.net/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/README.zh.md>
- <https://dsh-in-depth.com/core/agent-loop>
- <https://deepseekdocs.com/en/docs/learn/core/agent-loop>
- <https://arxiv.org/abs/2608.16393>
- <https://arxiv.org/abs/2603.18000>

## User

那- 如果现在需要起一个web服务,这个web服务是也是挂在一个- Agent的- Func-fac- Factory里边儿,还是有专门给web服务的,或者是UI的?也是查代码

## ChatGPT

嗯,等我翻一下代码。

查到了,不是挂AgentFactory,web 服务有自己独立的服务契约:@deepseek-ai/dsh-host-webserver

这个插件提供了ctx.webServer,它是个 Cordis Service,基于 node:http,不懂 Agent 概念,负责监听端口、注册路由、upgrade 和 fallback,其他 Web UI 插件再往上......

引用链接：
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/web-server>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/host/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/web-app/src/index.ts>
- <https://github.com/deepseek-ai/deepseek-harness/>
- <https://github.com/deepseek-ai/deepseek-harness>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/web-server.md>
- <https://github.com/deepseek-ai/DeepSeek-Harness>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/web.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/config-catalog.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/host/webserver/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/connection/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/web/web/package.json>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.md>
- <https://www.dshfind.com/en/docs/subsystems/web-server>
- <https://www.dshfind.com/en/docs/subsystems/web>
- <https://dsh-plugin.com/plugins/deepseek-ai/deepseek-harness/packages/bundle/web-app>
- <https://dsh.pub/en/plugins/web/>
- <https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/web>
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/web>
- <https://dsh-in-depth.com/frontend/web-frontend>
- <https://www.reddit.com/r/DeepSeek/comments/1vnv0hs/github_awesomedshplugindshfindplugin_find_dsh/>

## User

那等一下,那那就相当于是这些- 这些web server是本身就在它的core里边就定义了,得有- 一个Web Server吗?不是啊- 那如果说这是一个纯的CLI的话,就根本不需要有web server。那CLI又挂在哪儿呢?所以它一定不是一个在接口里边定义一个啊,我这插一个web- web服务,我那儿插一个CLI服务,我这儿插一个什么服务。然后好,你们写自己的插件来- 来对齐这些服务吧。那肯定不是这种- 这种逻辑啊

## ChatGPT

我来核对下......

## User

就是如果插件是一个子系统,那么它的父级系统- 是定义了什么样的东西子系统接上去。那么符合了父系统的- 还是说父系统没有指定什么东西- 要- 子系统上去以后,子系统汇报说我是一个什么东西然后我在这- 给我运行,你别管我内部怎么实现- 我在这个地方运行就行了。是哪种情况,到底是父- 定义的还是子定义的

## ChatGPT

对,更接近你后面说的那种,父系统没有一堆预设的硬插槽位,而是提供插件运行框架。CLI 在插件系统外面,只是解析命令选profile,然后拉起插件树。webServer也不是core固定有的,只是某个插件bundle提供了 ctx.webServer这个服务,别的插件声明依赖它,再往上注册路由。所以不是父亲说我有web槽,也不是子系统随便报个名就行,而是子系统按约定提供或依赖某个命名服务。框架只负责把这些拼起来。

## User

好,那我现在- 要开发一个语音的插件,那么按照- 它的插件开发规范我现在应该是用什么样的方法去把这个语音的插件跑起来呢- 我语音的插件要实现的是- 如果外部传入语音,那么它把语音转换成文字。然后,转化成文字以后,用文字来进入到Agent Loop里边- 但是语音转文字这件事情本身也是需要一个- Agent Loop来做,因为- 本身语音转文字,它就需要- 相关的STT模型。那这两个如果我要做的话,它属于- 两个并行的Agent Loop,对吗

## ChatGPT

我来查一下。

不是两个并行的Agent Loop一个音频入口插件收外部音频,调用一个STT服务把音频转成文本,然后把文本交给已有的 Agent Loop 走正常流程就行。STT模型只是被调用的模型,不是一个 Agent Loop,Agent Loop是调度LLM和工具的循环。实现上更像写一个提供 ctx.stt 或 voiceInput 的插件,然后把识别出的文本投递给现有 Agent,如果需要实时监听,可以有一个长期运行的音频输入 runner,但那也不是 Agent Loop,只是一个独立的输入服务。

引用链接：
- <https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/>
- <https://deepseek-harness.github.io/deepseek-harness/en/develop/framework/service>
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/web-server>
- <https://www.deepseek.com/harness/en/>
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/core>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/web-server.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/framework/service.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.md?ref=aiposthub.com>
- <https://deepseekplugin.com/docs>
- <https://github.laiyagushi.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-tutorial/index.md>
- <https://qgithub.com/sandbaseai/deepseek-harness-handbook/blob/main/docs/en/plugin-development/first-plugin.md>
- <https://www.reddit.com/r/DeepSeek/comments/1vyz316/context_is_editable_now_i_made_a_plugin_for/>
- <https://www.reddit.com/r/DeepSeek/comments/1vyarox/i_built_a_deepseek_harness_plugin_that_proves_why/>
- <https://www.reddit.com/r/sideprojects/comments/1vyb5kp/i_built_a_deepseek_harness_plugin_that_proves_why/>
- <https://www.reddit.com/r/DeepSeek/comments/1w3k79h/deepseek_harness_version_update/>
- <https://www.reddit.com/r/DeepSeek/comments/1vu20xd/i_built_a_conversation_manager_for_deepseek/>
- <https://api.pageplace.de/preview/DT0400.9781040444849_A62767611/preview-9781040444849_A62767611.pdf>
- <https://s3-euw1-ap-pe-df-pch-content-store-p.s3.eu-west-1.amazonaws.com/9781003674702/cddb0c87-f382-48f3-adf8-f4b52c4da32f/preview.pdf?AWSAccessKeyId=ASIAQFVOSJ57RVKKWULD&Expires=1772040622&Signature=1c1DfzlQmaBBRPGXZ9yubTpdwN4%3D&response-content-disposition=attachment%3B+filename%3D%2210.1201_9781003674702_previewpdf.pdf%22&x-amz-security-token=IQoJb3JpZ2luX2VjEEYaCXVzLWVhc3QtMSJIMEYCIQDEGoPVbEKnbK2feugGLCjWcnV6ZtK0gvAFwNnKd%2BypswIhANploCfJrS3qVKE3Ea3AFgjtrIkX0gL3j8BKRn6vRtnzKo0ECA8QBBoMMDEyMTc3MjY0NTExIgz0QJPDFL%2F%2FSflECHcq6gOgswHQbZfVXvwPffkZYZFuGiz9P4S9II3Isf8ufsL8OH8Nj0pWicbwCXr5zRJAOn6L1%2BMKu%2FLnIEUKMCKyP0YXaZSSO9riqPX7mkNhzcj72m5FwukwN3IW%2F%2BS2tsiQxtQq5fzrCvVpmD2GDPKpbx6b%2FlMu%2BrgFgPpKrh2KV5ZBalKcqbWnXfniFDEn6%2FIesWs%2BAn%2BOcZ8OPh5HgA6GgPkC%2FLIa2bmZyT%2ByNp3DA3Nv%2FGwORimzpq3gxJVtiEJ89QBAEk9Nrobz8kv%2BAMxT1n5b3FgAW6WqRdRUfvKGsr5C8sSVppP8o0ifrm2kCxtCOQvxlGmhDykj1t3vIyG10BVEebBIybWmoP1yVt4z6RAdQMUMDqgMtJVlPaCW6krTiHcYqnqiH2rQ%2F8os2Nc2By4rm61qQgb%2F5%2FBuhmZGFEyqf2TOCvXeyTCFYz6tqEPUQgZ4cJTfCvHy9Wjwr69o6int%2BDWmsIz8SL0qyIt364fWClR9gXlG7X9f6VlHItdbuKkWhj3g0fAqHQNrep%2B3MPvGU6sLDgIZieWEF1dsIKHuC0Tpd%2FNCGB9JJQuwaD2uVz7%2B0rg6Ud%2BjmUTR8tGPnPBoWANInx9swybJSkk1ta8tOVr3aniyXy7FsktT0IKbDviZkhfiP5rMIrQ2MIL2%2B8wGOqQB5akdj5dIR5DlC1W0t%2FBg6m88x%2BWCJh4pK0vI7yLqzQnGT51zGKZb10jl0c6PrmgWqTquxY1bA2pMGfl4W2MfxNbKFxdPoi2Ek9mbmCE9qp4WtIlNAHZx%2F8JAtpbf8w%2B%2BSeKVILE33EL6PcO4MnMWTUCfBvkec5PTukcPS3lDvUlVPZKKml8ekFzOBDd1Au4e%2B%2BpoGcZXlfOmSNihqKlj1brgzuo%3D>

## User

那你这有问题啊,如果说我现在语音输入是一个复杂的agent。就比如说我现在说的语言- 到底是什么语言,它还并行的- 要把这些东西翻译过来。那它本身翻译也是一个最小的agent然后如果说是音频进来以后,有一些口误- 有一些词识别不对,那也需要一个大模型,来根据- 我的- 上下文,然后也有可能- 要根据我自己存起来的这些热词,然后动态的修改我刚才说过什么样的话。那本质上- 它也是一个agent啊,你怎么能把它就直接变成了一个voice input呢

## ChatGPT

我再仔细核对一下......

对,我刚才说窄了,如果语音这块复杂到要判语种、纠错、热词修正、多步推理,那它就是一个语音前置的 Agent,但它是主 Agent 前的一段 loop,而不是和主 Agent 平级的两个主循环。也就是说可以有一个语音 Agent loop,先把 audio变成高质量 text,再把 text 交给主 Agent loop。这两段可以都是 Agent形态,但分层:前置语音 Agent 做输入理解,主 Agent 做任务理解和工具调用,这样既不混也不抢控制权。

引用链接：
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/framework/service.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/src/index.ts>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/framework/service.zh.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-tutorial/03-services.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/src/index.ts>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/README.zh.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/README.zh.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.md?ref=aiposthub.com>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.zh.md>
- <https://github.com/deepseek-ai/deepseek-harness/>
- <https://github.com/deepseek-ai/deepseek-harness>
- <https://deepseek-harness.github.io/deepseek-harness/en/develop/framework/service>
- <https://deepseek-harness.github.io/deepseek-harness/develop/framework/service>
- <https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/03-services>
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-api/context>
- <https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/>
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-primer>
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/core>
- <https://ithub.global.ssl.fastly.net/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.md>
- <https://ithub.global.ssl.fastly.net/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/src/index.ts>
- <https://dsh-in-depth.com/core/agent-loop>
- <https://deepseekplugin.org/en/docs/services-dependencies>
- <https://deepseekdocs.com/en/docs/learn/core/agent-loop>
- <https://www.dshbase.com/plugins/dsh-loop-dock/>

## User

那这儿有一个问题,每一个店- 是只有一个agent loop,对吗

## ChatGPT

我确认一下。

不是。不是每个点都有一个 Agent Loop,只有每个独立决策单元,也就是一个自治 Agent 才需要自己的 loop。普通处理节点就是函数或服务调用,不需要 Agent Loop。比如语音链路里:音频接收节点不需要、STT 节点不需要、热词修正节点不需要,真正需要 Agent Loop 的是那层会自己多步判断、调用工具、决定下一步的自治单元。所以不是“每个点”......

## User

那么这儿有两种处理方法- 第一种处理方法就是- 我把音频处理也放在主的- Agent loop里边- 第二种处理方法就是- Agent loop本身只接收一个文本- 它不区分到底是语音消息- 还是普通消息- 那这样的话,前置的这整个流程,其实就是属于一个子的店DSH- Deep Sea Harness- 然后- 前置的这部分是一个系统,后置的是一个系统。那么这样的话,不就出现了两个DSH系统- 那这个时候,我是起两套DSH,还是在一套DSH里边也能做呢

## ChatGPT

我再核对一下。

不用起两套,一套DSH里做两个子系统就行。主 Agent Loop只收文本,前面语音子系统负责把音频变成修正后的文本再投递。这两个子系统都跑在同一个 DSH runtime里,共享 ctx,用 service 或 agent 对接就行。只有在需要强隔离、独立部署或跨进程复用时,才考虑两套 DSH,否则会引入不必要的复杂度,比如进程间通信、session 对齐、权限同步等等。

引用链接：
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/core>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/web-server.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md?ref=explainx>
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/>
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/web-server>
- <https://www.deepseek.com/harness/en/>
- <https://www.dshfind.com/en/docs/subsystems/web-server>
- <https://deepseekplugins.org/docs>
- <https://github.laiyagushi.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md>
- <https://www.reddit.com/r/DeepSeek/comments/1vyu5jy/i_built_a_plugin_so_you_can_play_games_while/>
- <https://www.reddit.com/r/DeepSeek/comments/1w3k79h/deepseek_harness_version_update/>
- <https://www.reddit.com/r/DeepSeek/comments/1vnfz2l/deepseek_harness_is_on_whole_different_level/>
- <https://www.reddit.com/r/DeepSeek/comments/1w2vxj3/how_would_you_build_a_multiagent_software/>
- <https://arxiv.org/abs/2608.25593>

## User

我现在真有一个需求,那就是- 如果我现在需要实现快慢脑- 快脑是一个快模型,然后接收的内容- 就是用户输入的。那慢脑是一个慢模型,它需要推理- 但是它接收的内容也是用户输入的- 而两个上下文是要独立的- 因为快- 快慢脑- 它是并行运行的。所以呢这个时候呢,我是要运行两套agent loop,对不对?那如果后续- 还有更多的这种- 慢模型- 因为有些是处理我的财务,有些是处理我当前对话的情绪- 有些可能是处理- 我自己对于- 呃,对于- - 其他- 其他什么- 什么情况,但是它都是并行的。那这几个并行的,上下文又要隔离。它每次对话- 都是要求要- 要- 同时运行,而且它们之间也有可能,比如说慢脑想到了,要把它交回给快脑,然后快脑再转换成给用户发的说的话。那么整个这个流程就会变得异常复杂。那按照你说的,不要增加复杂度,那我这个东西要怎么开发呢- 我是要用一个agent loop还是用多个agent loop,还是用多套DSH呢

## ChatGPT

我来仔细想一下。

你的这种需求,正确的做法是一套DSH,多个 Agent 实例,加一个协调者。不是多套 DSH,也不是把所有脑子硬塞进一个 Agent Loop。你可以起多个 Agent,每个有自己的 session 和模型配置,比如快脑用快模型独立会话,慢脑、财务、情绪、记忆,各自是独立的 Agent 和 session。协调者负责把用户输入广播给相关 Agent,收集它们的异步结果,根据规则决定要不要把哪些结论注入给快脑,再由快脑对用户说话。这样保持上下文隔离,又避免多进程、多 DSH 带来的通信和运维复杂度。

引用链接：
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.md>
- <https://www.deepseek.com/harness/en/>
- <https://www.deepseek.com/harness/>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md?ref=explainx>
- <https://github.com/deepseek-ai/deepseek-harness/>
- <https://github.com/deepseek-ai/DeepSeek-Harness>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/src/index.ts>
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/>
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/core>
- <https://deepseek-harness.github.io/deepseek-harness/reference/config-catalog>
- <https://deepseekplugin.com/docs/architecture>
- <https://github.laiyagushi.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md>
- <https://dsh-in-depth.com/architecture/overview>
- <https://dsh-in-depth.com/core/agent-loop>
- <https://dshai.org/>
- <https://deepseekdocs.com/en/docs/learn/intro/architecture>
- <https://ithub.global.ssl.fastly.net/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/src/index.ts>
- <https://dsh.pub/en/plugins/dsh-loop-dock/>
- <https://www.dshfind.com/en/docs/subsystems/core>
- <https://arxiv.org/abs/2608.23953>
- <https://www.reddit.com/r/DeepSeek/comments/1vyu5jy/i_built_a_plugin_so_you_can_play_games_while/>

## User

那它其实是- 起了多个session,对吗

## ChatGPT

我确认一下。

对,核心就是多个 session,而不是多套 DSH。每个自治脑一个独立 session,由协调者转发输入和结果,不要共享同一个 session。

## User

那照你这么说的话,协调者是怎么设计呢

## ChatGPT

我来仔细-

## User

它是可以穿梭在多个session中吗

## ChatGPT

我再核对一下......

是,但别叫穿梭,更准确是协调器能访问多个 session,做消息路由,但不混上下文。也就是说它读写各 session,但只在消息层面转发或摘要,不共享内部上下文。可以这么做:每个 Agent 绑定自己的 session,协调器把用户输入复制给各 session,等慢脑有结果,把结论作为一条结构化消息,注入到快脑的 session 里,由快脑决定怎么对用户表达。关键是 session 隔离、消息桥接、单点对用户说话。

## User

好的,好的,那我知道了

花旗

## ChatGPT

......我查一下。

## User

- 我是说我们 -我回来我们继续聊这个话题

## ChatGPT

喔,明白,如果你说的“花旗”指的是要接银行或财务这块,那它就适合......

## User

哎呀,我说的是话题

## ChatGPT

啊!我刚才听成“花旗”了  ,回来这个话题,我们继续沿着刚才的结构往下。

你刚才说到哪儿了?你是想问这个多 Agent 并行的实现细节吗?还是怎么落到代码结构上?

## User

我是说现在如果

## ChatGPT

嗯。

## User

多个多个对话,然后它们的

## ChatGPT

嗯。

## User

上下文要互相串起来的话

## ChatGPT

嗯。

## User

,它是用什么样的机制去开发呢?它是全部挂载在一个上下文里边,但是每一个 Agent Loop都用自己的独立- 独立上下文吗?还是从主上下文里边拆出来自己的上下文

## ChatGPT

我来仔细核对一下。

查到了,不是把所有 Agent 都挂在一个上下文里,也不是简单的从主上下文里拆一份出来。更常见、也更干净的做法是每个 Agent session 有自己的私有上下文,外面有一层协调器负责把用户输入写进一个全局事件流,然后按规则分发给各个 Agent。每个 Agent 用自己的历史和记忆去思考,产出结构化的结果,再写回这个共享层。协调器决定哪些结果要注入到快脑,或者广播给其他 Agent。所以它像是一个事件总线加各自的私有记忆,不是一个大上下文硬塞所有东西。这样快脑可以轻量、响应快,慢脑可以很重很慢,彼此隔离但又能通过结构化消息协作。

## User

那我又有一个问题,如果我现在想要

## ChatGPT

嗯。

## User

- 让慢脑

## ChatGPT

嗯。

## User

在拿到用户回应的时候

## ChatGPT

嗯。

## User

- 之前的内容可以命中到缓存,同时它自己的- 上下文。也可以部分不丢失,有可能做到吗

## ChatGPT

我来仔细核对一下。

可以做到,但要分清两件事儿:缓存和上下文连续性。想要缓存命中,关键是让稳定不变的那一大段内容放在前面,比如 system prompt、工具说明......

## User

你不用跟我解释原理,我当然知道原理,我只是说你现在能不能给出一个- 方案,因为我现在想这件事情好像很难

## ChatGPT

嗯。

## User

。首先我原先规划的是- 主对话它只有- 表演层

## ChatGPT

嗯。

## User

。而- 慢脑它属于- 它自己也要思考,也要调用- 工具或者是联网搜索这些

## ChatGPT

嗯。

## User

但是它的这些- 内容是属于它的上下文,它每次只贡献它的答案。但是这些上下文和- 表演层的上下文,是要一样吗?还是不一样?我现在没有想明白这件事。然后这是一方面,还有另外一方面的话- 如果说每次都是从主对话拆出来- 那么主对话中,它说的那些话- 也要给- 慢脑吗?也就是快脑说那些话也要跟慢脑说吗

## ChatGPT

嗯。

## User

?这个也是我现在考虑的问题,就是如果说的话- 那么就会出现- 慢脑里边上下文会优先堆积的很多。如果不说的话,那之前- 用户感受到的其实是快脑的- 这个渲染过的表演层的内容。那么缺少这些内容又不好 -没办法很好地能

## ChatGPT

嗯。

## User

- 回答。这个就是个很困惑的事

## ChatGPT

我来仔细的想一下。

对,你这个困惑是对的,这里不能用一个主对话拆上下文的思路,直接主对话是表演层,它本身不该是源头,更准确的是用户输入进入一个全局事件流,快脑、慢脑各自维护自己的 session, 慢脑不需要也不应该完整继承快脑说过的所有废话,但它必须知道已经对用户说出去的关键结论和承诺,不然就会脱节。所以实际方案是:用户原始输入始终给慢脑,快脑的输出提炼成一个用户可见状态摘要再喂给慢脑,而不是全量对话。这样慢脑既知道......

## User

不对,这里还有一个问题就是慢脑不止只有一个,它可能会有多个而且慢脑不一定- 它只是我们这样表述它是理性脑,会变成慢脑但它也不一定真的慢所以很有可能是

## ChatGPT

嗯。嗯。嗯。嗯。嗯。

## User

- 一个主对话,然后它是表演层,它是相对最快的那一个

## ChatGPT

嗯。嗯。

## User

而其他很多个分支,它都是并行的那么它应该是一个交错的,就是多份交错平行

## ChatGPT

嗯。

## User

- 串- 串联的这么一个结构

## ChatGPT

我来仔细想。

## User

而平行串联这个结构- 其他分支的

## ChatGPT

嗯。

## User

- 说的话,它也会并入到主分支中

## ChatGPT

对,你说的......

## User

而主分支- 表演主要是为了- 把这些想法合到一起然后

## ChatGPT

嗯。

## User

哪些需要回答,哪些不需要回答- 这个是表演层来- 做的。但是- 它就是- 大部分的 thinking 模型- 它thinking- 产出的这个过程其实是慢的而现在我们只是把- 并行的这些thinking 的内容

## ChatGPT

嗯。

## User

- 平行的快速的塞到了一个上下文里然后它就不需要thinking很多,但是会突然有很多上下文。这样就会能- 保证- 有更好的- 效果。我说的更好效果就是- 它的速度���很快,但是它思考了这些内容是其他的- 分支里边已经深思熟虑过的内容给它塞回来的

## ChatGPT

我来仔细想一下。

## User

嗯

## ChatGPT

对,你这个理解是对的,而且这恰恰是这个架构有价值的地方:主分支不自己深度思考,而是多个并行的分支提前思考,然后把可用的结论压缩后塞回主分支,主分支只负责整合加表达。这没有问题,关键是其他分支产出的不是一堆原始上下文,而是一份结构化的思考成果。比如,发现了什么、建议怎么说、置信度多高、是否影响当前回复等等。主分支只消费这些被压缩后的结论,而不是完整的思考过程。这样的话,主分支看起来没怎么思考,但其实已经站在很多并行思考的结果之上。所以你要实现的不是共享上下文,而是多 Agent 并行思考加结果汇总层。汇总层决定哪些结果值得进入......

## User

你话又太多了

## ChatGPT

明白,一句话:别共享全文,让多个 Agent 并行跑,只把压缩后的高价值结论喂给主对话就行。

## User

哎呀,不要他妈的这么多废话,跟你说话真费劲

## ChatGPT

好,多 Agent 并行,各自有自己的上下文,只把结论喂给主对话。

## User

你帮我搜索一下- 现在- 像这种多专家的逻辑其实和现在就很像- 就是- 它一个大模型是

## ChatGPT

嗯。

## User

嗯,多专家模型,然后它其实一个模型里边有很多个小的专家我现在就好奇为什么它们不能把- 所有的这些专家都激活,那它本质上是不是- 就做到了我是刚才说的这种情况- 就是每一个专家在思考各自专家的事情。然后都给出,然后再合并到一起再给出来

## ChatGPT

嗯。

## User

。是不是有哪些模型架构本身就是这样子设计的

## ChatGPT

我来查一下。

有点接近但不完全一样。模型里的 MoE 专家通常是稀疏激活,不是所有专家都跑一遍。全激活几乎就等同于一个超大 dense 模型,成本和延迟都会爆炸。但你说的这种像的是多 Agent 并行然后聚合,这更接近 Mixture of Agents,也就是多个模型或 Agent 并行产出,然后由一个聚合器来综合。这和你描述的架构很像,只是它发生在系统编排层,而不是在单一模型内部。所以你的方向在系统架构层面是成立的,但它不是模型内部的 MoE,而是外部编排的 MoA 或多 Agent 协同。核心难点不在于全激活,而在于怎么把并行结果压缩、排序、去冲突,再喂给主对话。

引用链接：
- <https://arxiv.org/abs/2202.09368>
- <https://arxiv.org/abs/2401.06066>
- <https://arxiv.org/pdf/2101.03961>
- <https://arxiv.org/abs/2406.04692>
- <https://openreview.net/forum?id=h0ZfDIrj7T>
- <https://arxiv.org/abs/2110.07431>
- <https://cameronrwolfe.substack.com/p/moe-llms>
- <https://arxiv.org/pdf/2507.11181>
- <https://arxiv.org/html/2501.06322v1>
- <https://arxiv.org/abs/2601.22297>
- <https://arxiv.org/abs/2511.07784>
- <https://www.madebymixture.com/?srsltid=AfmBOoqRWpNG_995JAdQO0kB0A81STt7ddxoxFP3C0Ji7gl0dLy4tsrF>
- <https://getmulti.ai/>
- <https://en.wikipedia.org/wiki/Large_language_model>
- <https://en.wikipedia.org/wiki/Mixture>
- <https://www.facebook.com/groups/698593531630485/posts/1214240673399099/>
- <https://huggingface.co/blog/moe-transformers>
- <https://www.merriam-webster.com/dictionary/mixture>
- <https://www.merriam-webster.com/dictionary/multi->
- <https://aman.ai/primers/ai/mixture-of-experts/>
- <https://papers.nips.cc/paper_files/paper/2022/hash/2f00ecd787b432c1d36f3de9800728eb-Abstract-Conference.html>
- <https://newsletter.maartengrootendorst.com/p/a-visual-guide-to-mixture-of-experts>
- <https://d2jud02ci9yv69.cloudfront.net/2025-04-28-mad-159/blog/mad/>
- <https://github.com/kyegomez/awesome-multi-agent-papers>
- <https://arxiv.org/abs/2412.21200>
- <https://arxiv.org/abs/2508.05492>
- <https://arxiv.org/abs/2502.00674>
- <https://medium.com/%40weidagang/coffee-time-papers-mixture-of-agents-23feccb52f3c>
- <https://github.com/togethercomputer/moa>
- <https://docs.together.ai/docs/mixture-of-agents>
- <https://huggingface.co/papers/2406.04692>
- <https://www.alphaxiv.org/abs/2406.04692>
- <https://www.semanticscholar.org/paper/Mixture-of-Agents-Enhances-Large-Language-Model-Wang-Wang/2b3ad2fdd9d2013119232ee49e6d21eb08474b74>
- <https://www.emergentmind.com/topics/mixture-of-agents>
- <https://www.clioapp.ai/research/mixture-of-agents>
- <https://www.youtube.com/watch?v=i90wkMO8uxI>
- <https://www.youtube.com/watch?v=Cf0Jidg-pDc>
- <https://blog.gopenai.com/mixture-of-agents-moa-collaborative-ai-surpasses-single-llms-5d48f25f8b32>

## User

那我现在又有另外一个问题

## ChatGPT

嗯。

## User

- 就是,如果一个很强大的模型它本身调用工具的时候是

## ChatGPT

嗯。

## User

- 异- 异步调用的。那么它在每次回答之前

## ChatGPT

嗯。

## User

- 先把这些工具- 要调用的工具- 全部触发一次

## ChatGPT

嗯。

## User

然后也是异步的,调用了这些- 外部的工具。而这些外部的工具也本身可以是模型

## ChatGPT

嗯。

## User

所以,那是不是用这种方法也实现了我说的一个主模型,然后它有很多个- 可以外挂的模型,它来- 对接

## ChatGPT

我来仔细想一下。

我来仔细想一下。可以,本质上这是主模型当编排器,多个模型作为工具的架构,主模型异步调用这些模型工具,拿到结果后再整合回答,这能达到你说的“主模型快、后台深度思考”的效果。但这些外部模型如果只是被调用,它们就是工具而不是自治 agent。所以第一版你可以先把其他模型当工具异步调用,只要记住别无脑全触发,加一个轻量 router 判断需要哪些专家就够了。后面再把特别重要的升级成有自己 session 的独立 agent。这样路线最稳。

## User

嗯

## ChatGPT

嗯。

## User

但是这样,我感觉就嗯- 就是- 如果说一个- 一个对话,它- -你看啊,我- 调用一个tools- 它本身这个tools具体是怎么样实现的?主模型其实是不知道的所以它调用这个tools- 它具体是一个agent还是它调用了一个function

## ChatGPT

嗯。嗯。

## User

- 本质上,对于主模型来说,不重要,而- 它也不知道。那么这样子的话,我们的结构- 一方面可以用我们- harness 的方法来并行发出另外一方面,也可以- 变成一个呃,想想

## ChatGPT

嗯,你慢慢说。

## User

另外一方面,它就可以变成一个善于编排和说话的模型,然后又负责编排又负责说话

## ChatGPT

嗯。

## User

。这样的话- 呃,你刚才说的轻量级的router是不是就已经算是合并到主线程里边,而且这样开发会更简单一些

## ChatGPT

我来仔细确认一下。

对,你这个理解没错,第一版可以把 router 合并进主线程,让主模型自己决定要不要调哪些工具,工具可以是普通函数,也可以是模型黑盒,主模型不用关心内部,只看输入输出就行。异步并发由 harness 控制,主模型只负责决定调谁和怎么用结果说话。这条路最短、最易落地。后面复杂了,再把 router 拆出来就可以了。别一开始就上完整的......嗯。

## User

那这还有一个问题,就是- 如果- 如果调用工具这件事情它是一个简单的,那么现在的编排逻辑

## ChatGPT

嗯。

## User

不会说是长程模型那么难那

## ChatGPT

嗯。

## User

- -现在我就- 去- 反推回来- 它本质上是- 安排这件事情还是复杂的- 就因为是复杂的,所以

## ChatGPT

嗯。

## User

- 现在的- 很多大模型长程任务的编排,才变得那么难。那么这样来看的话- 其实不太可能有一个又快又小的模型,它编排能力又强

## ChatGPT

嗯。

## User

同时,它又能很善于说话。我的这个推断正确吗,我希望你能联网搜索帮我确认我的想法

## ChatGPT

我来核对一下。

大体方向对,但有细节,编排长城任务难点在状态管理、错误恢复、结果合并、重试和工具调度,这些不是简单分类,更像调度系统,所以不太可能有一个又小又快还通用的编排怪兽。但例外是小模型做窄域 router 可行,也就是只判断要不要调某类工具或选哪个专家。至于怎么并行、重试、超时、取消,这些交给代码和框架,别让模型全包。而说话和编排最好解耦,你的方向是对的,只是别指望一个小模型全能全包,把表达和编排拆开会更稳,一步一步来,不要一开始就追求全能。

引用链接：
- <https://arxiv.org/abs/2511.01527>
- <https://arxiv.org/abs/2406.18665>
- <https://arxiv.org/abs/2406.04692>
- <https://arxiv.org/html/2604.24964v1>
- <https://arxiv.org/abs/2307.13854>
- <https://arxiv.org/abs/2606.22388>
- <https://arxiv.org/html/2412.16516v1>
- <https://arxiv.org/abs/2406.12045>
- <https://arxiv.org/abs/2604.24964>
- <https://arxiv.org/abs/2606.06178>
- <https://github.com/lm-sys/routellm>
- <https://github.com/AGI-Edgerunners/LLM-Agents-Papers>
- <https://github.com/Applied-Machine-Learning-Lab/Awesome-Function-Callings>
- <https://www.madebymixture.com/?srsltid=AfmBOooPnuou9_Uqu4VRPdZBvNN0Y6pqsRQWnTcS12RCV99XmTIrA-qN>
- <https://en.wikipedia.org/wiki/Large_language_model>
- <https://en.wikipedia.org/wiki/Mixture>
- <https://www.emergentmind.com/topics/long-horizon-agent-planning>
- <https://www.merriam-webster.com/thesaurus/mixture>
- <https://alphaxiv.org/overview/2411.15399v1>

## User

那现在合理的方式还是通过某个- 嗯,某个harness来做编排- 然后模型的话只负责各自负责的部分那你之前说不要全部- 全部模型- 分支都触发

## ChatGPT

我确认一下。不是所有分支都触发,不......

## User

- 那这个是出于成本考虑呢,还是说是效率

## ChatGPT

我给你确认一下

我给你确认一下。

两都有,但效率优先。全触发会被最慢的分支拖住,还会引入一堆不相关的输出,让结果更乱,钱只是第三个问题。

## User

不对,我现在要的其实并不是- 它每次触发就一定得拿结果。每次这个- 结果每次都要说话我现在需要的是每一个分支都只负责这个分支该考虑- 考虑的问题- 如果这个内容本身跟它的分支考虑的内容- 不相关,那么当前的这个分支马上就会- 就会返回一个- 关我屁事。- 那么- 它都关他屁事了。那么后续也不会再输出什么样的内容。所以- 我认为作为 Router,它不用管- 谁开,或者是谁关- 我感觉它更应该是偏向于- 当前场景内- 哪些应该开,哪些应该关。而这个应该和- 逻辑上的- 这种理解以后的应该不一样,我所谓的应该,我举个例子- 比如说我现在订了澡堂,那么- 视觉模块儿就不应该开,它不管说是当前的逻辑是什么- 视觉开了,它就是个麻烦事儿- 它就跟隐私相关,它就跟- 这些安全相关了- 那- 在某些场景下,比如说- 假如说它是一个硬件传感器- 我现在- 到了- 这个- 加油站- 我到了加油站,那么打火器这种- 这种硬件就不应该开,那它- 不管任何逻辑,它就不能开。- 所以这两个- 我- 如果说是通过- harness层- 不需要智能的方法,然后只需要判定场景和这个场景哪些事儿- 硬约束- 那么其他这些软约束都让智能来去判断。它被触发了,但是它也可以选择不继续进行运行。因为跟它没关系。- 但如果说是- 它被触发了,也跟它有关系。那么它输出内容,然后再- 再返回给主流程,就算是主流程现在- 已经聊过了- 当时的那个对话。- 但实际上- 主流程也可以判断- 我现在要不要跟它继续说这个话题,还是说- 我现在说的这些内容- 先转存起来。那以后是不是遇到同类型的内容,我的记忆中就可以有这一份答案。- 那这份答案是什么,就是- 诶,那天你给我提过那个事儿,然后当时我是这么想的,忘了跟你说了。它其实是一个很自然的这么一个过程

## ChatGPT

嗯。我来仔细想一下。

对,你这个拆法更准:harness只管硬约束,像安全、隐私、合规,加油站禁用某硬件、敏感场景禁视觉,这些直接在系统层拦死,不交给模型。剩下的软判断才交给各个 Agent:相关就跑,不相关就立刻返回 ignore,主流程只决定是否现在说,不说就存进记忆。

## User

那如果现在给你个机会要反驳我的话,你会怎么样反驳我当前的方案呢

## ChatGPT

我来仔细想一下。

我会这么反驳哈,你这个方案最大的漏洞在于,你假设每个 Agent 都能可靠地自我判断跟我无关,但现实是模型倾向于觉得我可能有关,结果就是所有分支都跑,噪音和成本还是会爆,所以中间仍然需要一个非常轻量的兴趣门,粗略筛一下谁该听,否则系统会失控,其次延迟答案会堆积,如果没有记忆质量控制,以后检索只会越来越脏,所以不是你方向错,而是少了两道闸:一个是相关性初筛,一个是记忆质量控制。

## User

但现在对于我来说,延迟是一个非常非常严重的- 我需要考量的点- 那如果- 现在没有办法解决延迟的问题,那么它一定会让我- 没有办法把这个项目正常的推进下去。而你刚才说,增加了一个小模型,哪怕它是兴趣,哪怕它是- 只是做判断,但是模型的- 判断和代码的判断,完全是两个数量级的。那每增加一层,就会导致- 就是调用也会有延迟,然后运行也会有延迟,首个token也会有延迟。- 输出传输也会有延迟,这些延迟累积下来- 就会导致整个这个对话就变得不轻盈,而且- 反应变慢了

## ChatGPT

我来仔细的思考一下,这个我得仔细想想。

对,你说得对,interest gate不能是模型放在主链路里,主链路要极短,硬规则加表演层直接回应,所有分支异步跑,晚到就晚到,主流程不等。兴趣门只能做代码级,比如静态订阅加场景标签,说白了就是位标记、关键词、用户配置,绝不走模型。换句话说,同步路径只保轻盈,异步路径慢慢想,合并不是等齐再说,而是有就用,没就算。这样才能守住你要的实时体验,其余的当作认知在后台追赶。

## User

那如果现在让你反驳我,你又会怎么反驳呢

## ChatGPT

我来仔细再想一下。

我会这么反驳:你主链路完全不等后台这点,会让主回复长期停留在浅层水平,很多关键判断其实来自后台,你不等等于放弃质量上限。第二,晚到就存,听起来很优雅,但如果频繁出现刚才那事我补充一下,用户的节奏会被打断,反而像反复插话,造成体验上的延迟感,只是把延迟从前面挪到了后面。第三,纯代码 interest gate 很快但很钝,漏掉的相关性会直接变成沉默的失败,尤其是语义相关但没关键词的情况,所以我会主张主链路不是完全不等,而是设置一个极短的预算窗口,几十到一两百毫秒,有就合并,没就立即说,这样比完全不等更稳。总结,实时不等于完全不等,你要控的是最大等待时间,而不是是否等待。

## User

我认为这里有一个问题- 就是你没有理解- 我现在如果使用场景是语音的话- 语音传输本身就有延迟一句话- 它就算这个模型很快,它直接输出了五句话- 但- 五句话变成音频以后,把这五句话播完,总得几十秒。而这几十秒对于- token来说,它其实是非常快的一个速度- 所以并不是说都不等- 而是说- 每次返回的时候- 它要对齐某个时间戳,所以现在- 我意识到有一个- 隐形的时间戳,这个时间戳其实是- 用户可见窗口的时间戳,这个是可- 可见窗口时间戳是来源于音- 音频播放的这个流- 来导致的。比如说- 音频正在说,然后它每一个字其实都要消耗时间- 无论它的音频的速度更快或者是更慢- 它一定是不可能,就是人类是不可能五倍速听说一句话的。现在- 大家- 常规- 最快的速度也就是三倍速说话- 三倍速说话已经很快了- 但是三倍速说话对于Token 输出来说的话- 也是很慢的,所以- 在这个窗口期的话,我们是不是应该设计一个窗口期- 这个窗口时间轴来判定哪些需要等、哪些不需要等- 我所谓的需要等和不需要等就是- 在窗口期还在播放,就说明用户还有的听- 那么下一句过来接上,它其实就是在同一句话在说不一样的事儿而如果当前的窗口期已经跳过- 也就是说用户的播放已经停了- 或者是已经来了下一句话打断了这个播放了那么- 接下来要- 切入的这个内容可能就不适合- 继续对话了- 我是否说的- 够明白

## ChatGPT

我来仔细思考一下。

说得很明白,你抓到一个核心点,语音场景里所谓当前对话不是模型输出时间,而是播放时间轴。主流程应该绑定用户可见时间线,后台结果能赶上还没播出的部分就自然插入,赶不上就沉淀为延迟洞察。关键是维护一个播放状态机:每段话有生成到哪儿、播放到哪儿、是否被打断的状态,后台结果回来先对齐这个状态。所以你说的对,等与不等不是按token时间,而是按用户听到的进度。这其实是把延迟问题重定义为- 播放调度,而不是模型速度。

## 附录：全部引用链接（去重）

- <https://dsh.hicyou.com/en/docs/getting-started/introduction>
- <https://www.dshfind.com/zh/learn/intro/what-is-dsh>
- <https://dsh.hicyou.com/en/docs/help/glossary>
- <https://github.com/Electricitysheep/dsh-handbook/blob/main/docs/01-intro.en.md>
- <https://dsh.fish/docs/concepts>
- <https://www.deepseekdsh.com/zh>
- <https://www.dshfind.com/zh/docs/subsystems/core>
- <https://arxiv.org/abs/2608.16393>
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/>
- <https://deepseekdocs.com/en/docs/learn/core/agent-loop>
- <https://dsh.pub/en/plugins/agent-loop/>
- <https://dsh.pub/en/plugins/agent/>
- <https://deepseekdocs.com/docs/learn/core/agent-loop>
- <https://qgithub.com/sandbaseai/deepseek-harness-handbook/blob/main/docs/en/architecture/agent-runtime.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/config-catalog.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md>
- <https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/core>
- <https://dshplugin.app/guides/dsh-plugins-bundles-profiles>
- <https://ithub.global.ssl.fastly.net/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.md>
- <https://www.reddit.com/r/DeepSeek/comments/1vnamjq/the_deeseek_harness/>
- <https://www.reddit.com/r/DeepSeek/comments/1vtvbmw/i_built_a_conversation_tree_for_deepseek_harness/>
- <https://www.reddit.com/r/DeepSeek/comments/1vpqkgi/deepseek_harness/>
- <https://www.reddit.com/r/DeepSeek/comments/1vta7wc/any_recommended_plugin_for_dsh/>
- <https://www.reddit.com/r/DeepSeek/comments/1vyarox/i_built_a_deepseek_harness_plugin_that_proves_why/>
- <https://www.reddit.com/r/sideprojects/comments/1vyb5kp/i_built_a_deepseek_harness_plugin_that_proves_why/>
- <https://www.reddit.com/r/DeepSeek/comments/1vz0dkf/i_made_a_dsh_plugin_that_finds_and_installs_other/>
- <https://www.reddit.com/r/DeepSeek/comments/1vwzsf9/deepseek_harness_is_so_cool/>
- <https://www.reddit.com/r/DeepSeek/comments/1vvlnml/switched_to_deepseek_harness_your_context_didnt/>
- <https://www.reddit.com/r/DeepSeek/comments/1vyu5jy/i_built_a_plugin_so_you_can_play_games_while/>
- <https://www.reddit.com/r/DeepSeek/comments/1vnpt5n/my_first_impressions_of_deepseek_harness/>
- <https://www.reddit.com/r/DeepSeek/comments/1vw0i8b/i_tried_fixing_deepseek_harness_forgetting/>
- <https://openreview.net/pdf/e91939038571a474d5d9d089933e0f3323af584d.pdf>
- <https://en.wikipedia.org/wiki/DeepSeek>
- <https://dsh.pub/en/plugins/hooks-adapter/>
- <https://dsh.pub/en/plugins/hooks-codex/>
- <https://dsh.pub/en/categories/runtime/>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.md>
- <https://www.dshbase.com/plugins/dsh-hooks/>
- <https://www.dshbase.com/plugins/dsh-loop-dock/>
- <https://dsh-in-depth.com/core/agent-loop>
- <https://dshai.org/>
- <https://www.reddit.com/r/DeepSeek/comments/1vu9cfq/deepseek_harness_vs_pi_two_bets_on_who_writes/>
- <https://www.reddit.com/r/DeepSeek/comments/1vywtbs/your_agent_just_finished_and_you_missed_it_here/>
- <https://www.reddit.com/r/DeepSeek/comments/1w3k79h/deepseek_harness_version_update/>
- <https://www.reddit.com/r/LocalLLM/comments/1vw3ecz/deepseek_harness_review_everything_is_a_plugin_dsh/>
- <https://www.reddit.com/r/DeepSeek/comments/1vrc8fe/deepseek_harness_didnt_have_chatgptstyle_image/>
- <https://www.reddit.com/r/DeepSeek/comments/1vnv6nk/deepseek_harness_looks_insanely_flexible_but/>
- <https://www.reddit.com/r/DeepSeek/comments/1vnfz2l/deepseek_harness_is_on_whole_different_level/>
- <https://arxiv.org/abs/2608.23953>
- <https://arxiv.org/abs/2605.13357>
- <https://deepseek.com/harness/en/>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md?ref=explainx>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/AGENTS.md>
- <https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/>
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/core>
- <https://www.deepseek.com/harness/en/>
- <https://deepseekplugin.com/docs>
- <https://dsharness.org/install>
- <https://deepseekdocs.com/en/docs/learn/intro/what-is-dsh>
- <https://deepseekdocs.com/en/docs/learn/dev/hello-plugin>
- <https://dshhub.dev/docs>
- <https://dsh.hicyou.com/en/docs/developer/architecture>
- <https://dsh.hicyou.com/en/docs/developer>
- <https://www.reddit.com/r/DeepSeek/comments/1votejd/tldr_of_why_dshcordis_is_a_big_deal_lh_tasks_and/>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/sdk-minimal/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/python/sdk/examples/README.md>
- <https://www.deepseekdsh.com/guides/commands>
- <https://dsh-in-depth.com/overview/getting-started>
- <https://deepseek-harness.github.io/deepseek-harness/en/guide/quickstart>
- <https://www.dsharness.io/en/blog/getting-started-with-deepseek-harness>
- <https://www.deepseekharness.online/en/guide/quick-start/>
- <https://dshx.dev/docs/quickstart/>
- <https://deepseekharnessplugins.com/learn/quickstart>
- <https://deepseekdocs.com/en/docs/getting-started/quickstart>
- <https://www.reddit.com/r/LocalLLaMA/comments/1vtw870/how_to_use_qwen27b_with_deepseek_harness/>
- <https://www.reddit.com/r/accelerate/comments/1vpcvce/deepseek_harness_being_opensource_is_allowing_the/>
- <https://www.reddit.com/r/DeepSeek/comments/1vw9rel/made_deepseek_harness_tunnel_to_your_phone_using/>
- <https://www.reddit.com/r/DeepSeek/comments/1vwgaez/new_to_deepseek_need_a_little_clarification/>
- <https://www.reddit.com/r/DeepSeek/comments/1vpcutr/deepseek_v4_pro_0813_minimal_preset_on_dsh_vs/>
- <https://www.reddit.com/r/DeepSeek/comments/1vqk5w5/deepseek_harness_and_skills/>
- <https://www.reddit.com/r/DeepSeek/comments/1w230u9/we_ran_162_migration_tests_before_calling_our_dsh/>
- <https://www.reddit.com/r/DeepSeek/comments/1vovxxc/deepseek_4_pro_ga_has_an_astonishing_blunder/>
- <https://www.reddit.com/r/DeepSeek/comments/1t6e2i8/a_claudecodeclass_harness_for_deepseek/>
- <https://www.reddit.com/r/DeepSeek/comments/1vww7ln/anyone_else_built_voice_input_plugin_for_deepseek/>
- <https://www.reddit.com/r/DeepSeek/comments/1vum3f3/getting_the_vision_model_to_work_in_dsh/>
- <https://doccompiler.ai/api/v1/jobs/shared/job_1776399442436_d3b62c6a/download/deepseek-ai__DeepSeek-V3__UserGuide.pdf>
- <https://www.belmont.edu/data/_files/deepseek-a-step-by-step-beginners-guide.pdf>
- <https://shoepaly.app/?_=%2Fpdf%2F2606.09498%23hKr38k1yZITo%2FkpxGBdjJos%3D>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/package.json>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/src/agent.ts>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/README.zh.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/README.md>
- <https://dsh-in-depth.com/zh/core/agent-loop>
- <https://deepseek-harness.github.io/deepseek-harness/reference/config-catalog>
- <https://ithub.global.ssl.fastly.net/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/README.zh.md>
- <https://ithub.global.ssl.fastly.net/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/src/index.ts>
- <https://gist.github.com/sing1ee/49829eacc32e31e69fa31a783047cb0f>
- <https://www.dshfind.com/en/docs/subsystems/core>
- <https://dshx.dev/docs/tutorial/source/agent-source/>
- <https://www.reddit.com/r/DeepSeek/comments/1vtlef9/native_macos_gui_for_deepseeks_dsh_agent_harness/>
- <https://www.reddit.com/r/DeepSeek/comments/1vn9yx2/deepseek_harness/>
- <https://github.com/yangbobo2021/Relay/blob/codex/relay-foundation/docs/media/dsh-plugin-manager-codex-install-demo.en.mp4? ... DeepSeek Harness already supports plugins, but installing one still means finding the right package and using the CLI.>
- <https://www.reddit.com/r/DeepSeek/comments/1vxm2nu/dshclaudelive_stream_claude_codes_live_steps_into/>
- <https://www.reddit.com/r/DeepSeek/comments/1vrnnv8/i_built_ohmydsh_a_curated_distribution_layer_for/>
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/session>
- <https://dsh.pub/en/plugins/session/>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/session.md>
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/persistence>
- <https://ithub.global.ssl.fastly.net/deepseek-ai/deepseek-harness/blob/master/packages/core/README.md>
- <https://dsh-in-depth.com/core/session>
- <https://dshbase.com/blog/deepseek-harness-session-log/>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/base/cordis.patch.yml>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md?ref=explainx>
- <https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish>
- <https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish>
- <https://git.hubp.de/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md>
- <https://deepseekplugin.org/en/docs/package-install>
- <https://qgithub.com/sandbaseai/deepseek-harness-handbook/blob/main/docs/en/plugin-development/first-plugin.md>
- <https://deepseekdocs.com/en/docs/user-guide/configuration>
- <https://download.plaud.ai/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md>
- <https://ithub.global.ssl.fastly.net/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md>
- <https://www.reddit.com/r/DeepSeek/comments/1vthl6g/deepseek_harness_the_everything_is_a_plugin_pitch/>
- <https://arxiv.org/abs/2609.01600>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.zh.md>
- <https://deepseek-harness.github.io/deepseek-harness/reference/>
- <https://dshkit.dev/plugins/everything-is-a-plugin>
- <https://www.reddit.com/r/DeepSeek/comments/1w0qu8q/deepseek_harness_is_frustrating_is_it_just_me/>
- <https://www.cambridge.org/engage/api-gateway/coe/assets/orp/resource/item/69ee2903810b9dcc828c5b8b/original/harness-resilience-from-llm-availability-to-toolchain-continuity-in-agentic-ai-engineering.pdf>
- <https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/03-services>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/framework/service.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/framework/service.zh.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-tutorial/03-services.md>
- <https://github.com/deepseek-ai/deepseek-harness/discussions/1197>
- <https://deepseek-harness.github.io/deepseek-harness/en/develop/framework/service>
- <https://deepseek-harness.github.io/deepseek-harness/develop/framework/service>
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-primer>
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-api/registry>
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-api/context>
- <https://deepseek-harness.github.io/deepseek-harness/en/develop/framework/>
- <https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/06-composition-and-hmr>
- <https://deepseekplugin.org/en/docs/services-dependencies>
- <https://deepseekplugin.org/docs/services-dependencies>
- <https://dshkit.dev/errors/plugin-not-loading>
- <https://qgithub.com/sandbaseai/deepseek-harness-handbook/blob/main/docs/en/troubleshooting/plugin-install-recovery.md>
- <https://qgithub.com/sandbaseai/deepseek-harness-handbook/blob/main/docs/en/troubleshooting/plugin-peer-dependency-warnings.md>
- <https://www.dshbase.com/troubleshooting/>
- <https://deepseekharness.dev/tutorials/services-and-dependencies>
- <https://deepseekdocs.com/en/docs/user-guide/plugins>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/extensions/tool-cordis/README.md>
- <https://github.laiyagushi.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md>
- <https://cordis.run/en/guides>
- <https://deepseekdocs.com/en/docs/learn/core/plugin-anatomy>
- <https://www.preprints.org/frontend/manuscript/2ac614cb5a2d08573aea6cd8fd2f1675/download_pub>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/src/index.ts>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/extensions/cordis-host-runner/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.zh.md>
- <https://github.com/deepseek-ai/deepseek-harness/>
- <https://dsh.pub/en/plugins/cordis-client-runner/>
- <https://dsh.pub/en/plugins/cordis-host-runner/>
- <https://dsh.pub/en/plugins/tool-cordis/>
- <https://dsh.pub/en/plugins/dsh-dynplugin-manager/>
- <https://dsh.pub/en/plugins/sev7een-dsh-plugin-ds-api-usage/>
- <https://dsh.pub/en/plugins/dsh-remote/>
- <https://deepseekharness.dev/tutorials/package-and-install>
- <https://dshkit.dev/plugins/patching-plugin-config>
- <https://dshkit.dev/plugins/write-your-first-plugin>
- <https://dsh.hicyou.com/zh/docs/user-guide/plugins>
- <https://deepseekharness.wiki/en/tutorials/package-and-install>
- <https://runner.readthedocs.io/_/downloads/en/latest/pdf/>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/src/index.ts>
- <https://ithub.global.ssl.fastly.net/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/README.zh.md>
- <https://www.reddit.com/r/DeepSeek/comments/1tvdamv/i_made_a_batteriesincluded_agent_in_rust_that/>
- <https://www.reddit.com/r/DeepSeek/comments/1w2vxj3/how_would_you_build_a_multiagent_software/>
- <https://www.reddit.com/r/codex/comments/1vo2jwu/deepseek_harness_may_have_a_higher_ceiling_than/>
- <https://arxiv.org/abs/2607.27309>
- <https://www.oracle.com/webfolder/technetwork/slackimages/devrel/slides-devcoach-040226.pdf?elqTrackId=7a7d2ac032514a669b9f2e635f3bc353&elqaid=152842&elqak=8AF50BCA0367108AD23D779DD94A31808CA723D89A93BF14D7741BB2C054C7ACA2C2&elqat=2>
- <https://openreview.net/pdf/f358711a95aaaf61fdeffd4ef3fc60fba9b8da57.pdf>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-tutorial/index.md>
- <https://deepseekharness.dev/tutorials/plugin-lifecycle>
- <https://deepseekharness.wiki/en/tutorials/plugin-lifecycle>
- <https://deepseek-harness-hub.com/tutorials/develop-framework/>
- <https://www.reddit.com/r/AI_Agents/comments/1swcp29/deepseek_v32_looping_bug_what_settings_harness/>
- <https://www.reddit.com/r/DeepSeek/comments/1vu20xd/i_built_a_conversation_manager_for_deepseek/>
- <https://www.reddit.com/r/DeepSeek/comments/1vyz316/context_is_editable_now_i_made_a_plugin_for/>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/src/runtime-context.ts>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/tools/src/index.ts>
- <https://arxiv.org/abs/2603.18000>
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/web-server>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/host/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/web-app/src/index.ts>
- <https://github.com/deepseek-ai/deepseek-harness>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/web-server.md>
- <https://github.com/deepseek-ai/DeepSeek-Harness>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/web.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/host/webserver/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/connection/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/README.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/web/web/package.json>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.md>
- <https://www.dshfind.com/en/docs/subsystems/web-server>
- <https://www.dshfind.com/en/docs/subsystems/web>
- <https://dsh-plugin.com/plugins/deepseek-ai/deepseek-harness/packages/bundle/web-app>
- <https://dsh.pub/en/plugins/web/>
- <https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/web>
- <https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/web>
- <https://dsh-in-depth.com/frontend/web-frontend>
- <https://www.reddit.com/r/DeepSeek/comments/1vnv0hs/github_awesomedshplugindshfindplugin_find_dsh/>
- <https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.md?ref=aiposthub.com>
- <https://github.laiyagushi.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-tutorial/index.md>
- <https://api.pageplace.de/preview/DT0400.9781040444849_A62767611/preview-9781040444849_A62767611.pdf>
- <https://s3-euw1-ap-pe-df-pch-content-store-p.s3.eu-west-1.amazonaws.com/9781003674702/cddb0c87-f382-48f3-adf8-f4b52c4da32f/preview.pdf?AWSAccessKeyId=ASIAQFVOSJ57RVKKWULD&Expires=1772040622&Signature=1c1DfzlQmaBBRPGXZ9yubTpdwN4%3D&response-content-disposition=attachment%3B+filename%3D%2210.1201_9781003674702_previewpdf.pdf%22&x-amz-security-token=IQoJb3JpZ2luX2VjEEYaCXVzLWVhc3QtMSJIMEYCIQDEGoPVbEKnbK2feugGLCjWcnV6ZtK0gvAFwNnKd%2BypswIhANploCfJrS3qVKE3Ea3AFgjtrIkX0gL3j8BKRn6vRtnzKo0ECA8QBBoMMDEyMTc3MjY0NTExIgz0QJPDFL%2F%2FSflECHcq6gOgswHQbZfVXvwPffkZYZFuGiz9P4S9II3Isf8ufsL8OH8Nj0pWicbwCXr5zRJAOn6L1%2BMKu%2FLnIEUKMCKyP0YXaZSSO9riqPX7mkNhzcj72m5FwukwN3IW%2F%2BS2tsiQxtQq5fzrCvVpmD2GDPKpbx6b%2FlMu%2BrgFgPpKrh2KV5ZBalKcqbWnXfniFDEn6%2FIesWs%2BAn%2BOcZ8OPh5HgA6GgPkC%2FLIa2bmZyT%2ByNp3DA3Nv%2FGwORimzpq3gxJVtiEJ89QBAEk9Nrobz8kv%2BAMxT1n5b3FgAW6WqRdRUfvKGsr5C8sSVppP8o0ifrm2kCxtCOQvxlGmhDykj1t3vIyG10BVEebBIybWmoP1yVt4z6RAdQMUMDqgMtJVlPaCW6krTiHcYqnqiH2rQ%2F8os2Nc2By4rm61qQgb%2F5%2FBuhmZGFEyqf2TOCvXeyTCFYz6tqEPUQgZ4cJTfCvHy9Wjwr69o6int%2BDWmsIz8SL0qyIt364fWClR9gXlG7X9f6VlHItdbuKkWhj3g0fAqHQNrep%2B3MPvGU6sLDgIZieWEF1dsIKHuC0Tpd%2FNCGB9JJQuwaD2uVz7%2B0rg6Ud%2BjmUTR8tGPnPBoWANInx9swybJSkk1ta8tOVr3aniyXy7FsktT0IKbDviZkhfiP5rMIrQ2MIL2%2B8wGOqQB5akdj5dIR5DlC1W0t%2FBg6m88x%2BWCJh4pK0vI7yLqzQnGT51zGKZb10jl0c6PrmgWqTquxY1bA2pMGfl4W2MfxNbKFxdPoi2Ek9mbmCE9qp4WtIlNAHZx%2F8JAtpbf8w%2B%2BSeKVILE33EL6PcO4MnMWTUCfBvkec5PTukcPS3lDvUlVPZKKml8ekFzOBDd1Au4e%2B%2BpoGcZXlfOmSNihqKlj1brgzuo%3D>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/README.zh.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md>
- <https://deepseekplugins.org/docs>
- <https://arxiv.org/abs/2608.25593>
- <https://www.deepseek.com/harness/>
- <https://deepseekplugin.com/docs/architecture>
- <https://dsh-in-depth.com/architecture/overview>
- <https://deepseekdocs.com/en/docs/learn/intro/architecture>
- <https://dsh.pub/en/plugins/dsh-loop-dock/>
- <https://arxiv.org/abs/2202.09368>
- <https://arxiv.org/abs/2401.06066>
- <https://arxiv.org/pdf/2101.03961>
- <https://arxiv.org/abs/2406.04692>
- <https://openreview.net/forum?id=h0ZfDIrj7T>
- <https://arxiv.org/abs/2110.07431>
- <https://cameronrwolfe.substack.com/p/moe-llms>
- <https://arxiv.org/pdf/2507.11181>
- <https://arxiv.org/html/2501.06322v1>
- <https://arxiv.org/abs/2601.22297>
- <https://arxiv.org/abs/2511.07784>
- <https://www.madebymixture.com/?srsltid=AfmBOoqRWpNG_995JAdQO0kB0A81STt7ddxoxFP3C0Ji7gl0dLy4tsrF>
- <https://getmulti.ai/>
- <https://en.wikipedia.org/wiki/Large_language_model>
- <https://en.wikipedia.org/wiki/Mixture>
- <https://www.facebook.com/groups/698593531630485/posts/1214240673399099/>
- <https://huggingface.co/blog/moe-transformers>
- <https://www.merriam-webster.com/dictionary/mixture>
- <https://www.merriam-webster.com/dictionary/multi->
- <https://aman.ai/primers/ai/mixture-of-experts/>
- <https://papers.nips.cc/paper_files/paper/2022/hash/2f00ecd787b432c1d36f3de9800728eb-Abstract-Conference.html>
- <https://newsletter.maartengrootendorst.com/p/a-visual-guide-to-mixture-of-experts>
- <https://d2jud02ci9yv69.cloudfront.net/2025-04-28-mad-159/blog/mad/>
- <https://github.com/kyegomez/awesome-multi-agent-papers>
- <https://arxiv.org/abs/2412.21200>
- <https://arxiv.org/abs/2508.05492>
- <https://arxiv.org/abs/2502.00674>
- <https://medium.com/%40weidagang/coffee-time-papers-mixture-of-agents-23feccb52f3c>
- <https://github.com/togethercomputer/moa>
- <https://docs.together.ai/docs/mixture-of-agents>
- <https://huggingface.co/papers/2406.04692>
- <https://www.alphaxiv.org/abs/2406.04692>
- <https://www.semanticscholar.org/paper/Mixture-of-Agents-Enhances-Large-Language-Model-Wang-Wang/2b3ad2fdd9d2013119232ee49e6d21eb08474b74>
- <https://www.emergentmind.com/topics/mixture-of-agents>
- <https://www.clioapp.ai/research/mixture-of-agents>
- <https://www.youtube.com/watch?v=i90wkMO8uxI>
- <https://www.youtube.com/watch?v=Cf0Jidg-pDc>
- <https://blog.gopenai.com/mixture-of-agents-moa-collaborative-ai-surpasses-single-llms-5d48f25f8b32>
- <https://arxiv.org/abs/2511.01527>
- <https://arxiv.org/abs/2406.18665>
- <https://arxiv.org/html/2604.24964v1>
- <https://arxiv.org/abs/2307.13854>
- <https://arxiv.org/abs/2606.22388>
- <https://arxiv.org/html/2412.16516v1>
- <https://arxiv.org/abs/2406.12045>
- <https://arxiv.org/abs/2604.24964>
- <https://arxiv.org/abs/2606.06178>
- <https://github.com/lm-sys/routellm>
- <https://github.com/AGI-Edgerunners/LLM-Agents-Papers>
- <https://github.com/Applied-Machine-Learning-Lab/Awesome-Function-Callings>
- <https://www.madebymixture.com/?srsltid=AfmBOooPnuou9_Uqu4VRPdZBvNN0Y6pqsRQWnTcS12RCV99XmTIrA-qN>
- <https://www.emergentmind.com/topics/long-horizon-agent-planning>
- <https://www.merriam-webster.com/thesaurus/mixture>
- <https://alphaxiv.org/overview/2411.15399v1>
