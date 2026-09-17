---
title: "调研依据：研究映射与工程现状"
date: "2026-09-16"
status: "待评审"
---

# 调研依据：研究映射与工程现状

本章汇总两类依据：(A) 2026-09-16 对话中已引用、并经本次联网核对的研究；(B) 本次针对需求缺口补充的调研（记忆认知科学、工程平台现状、内驱力与人格生成）。每条给出机制、对本项目的落点与来源。

## A. 记忆与认知科学

### A1. Letta sleep-time compute

- 机制：空闲期由独立 sleep-time agent 只读共享上下文（对话史/文档，不含未来问题），预测可能的问题并提前推理，把"原始上下文"改写为"已学习上下文"，降低在线推理量。Letta 0.7.0 起双 agent 结构：主 agent 只对话+检索，被剥夺编辑 core memory 的工具；sleep-time agent 独占记忆编辑、异步重写记忆块，抑制增量膨胀。
- 数字：同精度省 5× 在线算力；加大 sleep 算力精度再 +13%（GSM）/+18%（AIME）；多查询摊薄后单查询成本降 2.5×（数学基准口径，记忆任务数字未公布）。
- 落点：夜间整理（[06-memory.md](06-memory.md)）的参照实现：独立整理 agent + 主 agent 记忆编辑权分离。
- 来源：[arXiv 2504.13171](https://arxiv.org/abs/2504.13171)、[Letta 博客](https://www.letta.com/blog/sleep-time-compute)。

### A2. Generative Agents（斯坦福小镇）

- 机制：memory stream = 记忆对象列表（自然语言描述 + 创建时间 + 最近访问时间）；检索分 = recency（0.995^小时数）+ importance（入库时 LLM 打 1–10 分）+ relevance（嵌入余弦），各归一后求和；reflection 在最近事件 importance 累计超阈值时触发，用近期记忆生成高层 insights 作为新记忆，可递归成树。
- 证据：25 个 agent 小镇仅给一个"办派对"种子，两天内自发扩散邀请、互约同伴；消融显示观察/规划/反思对可信度均关键。
- 落点：主观评价的自然语言概述 + 按需压缩（[10-emotion-relations.md](10-emotion-relations.md)）；激活召回三因子的先例（[06-memory.md](06-memory.md)）。
- 来源：[arXiv 2304.03442](https://arxiv.org/abs/2304.03442)。

### A3. ACT-R 基线激活

- 机制：B_i = β_i + Σ_j t_j^(-d)（t_j = 第 j 次使用距今时间，d≈0.5）；总激活超阈值才可检索；检索延迟 T_i = F·e^(-f·A_i)，检索概率为 logistic。频率与近因在同一个公式里。
- 工程点：全历史求和是 O(n)；Derbinsky & Anderson (2012) 给出分段常数近似的 O(1) 增量更新，适合长记忆流。
- 落点：[06-memory.md](06-memory.md) 激活度模型的公式基础；Trace 记录的就是每次使用的 t_j。
- 来源：[ACT-R subsymbolic](https://people.ucsc.edu/~abrsvn/ACT-R_subsymbolic_3.pdf)、[Derbinsky & Anderson 2012](https://iccm-conference.neocities.org/2012/proceedings/papers/0022/paper0022.pdf)。

### A4. Bjork 新失用理论

- 机制：每条记忆两个独立变量——存储强度 SS（学习深度，只增不减）与提取强度 RS（当下可及性，随闲置衰减、随线索波动）；重取的巩固增益与当时 RS 成反比（费力想起 = 巩固最多），解释间隔效应与"合意困难"。
- 落点：记忆双状态量设计——"留存分"（只累积，决定保留/重学）与"可提取分"（衰减，用于检索排序）分离；"提示可恢复但平时想不起"是合法状态而非 bug。
- 来源：[Bjork & Bjork 1992](https://bjorklab.psych.ucla.edu/wp-content/uploads/sites/13/2016/07/RBjork_EBjork_1992.pdf)。

### A5. FSRS 间隔重复调度器

- 机制：三变量 DSR——Difficulty D∈[1,10]；Stability S = 保持率从 100% 降到 90% 的天数；Retrievability R(t,S) = (1 + FACTOR·t/S)^DECAY（幂函数遗忘曲线，FSRS-4.5/5 定数 DECAY=-0.5、FACTOR=19/81；FSRS-6 改可训练）。按复习评分（Again/Hard/Good/Easy）更新 S 与 D，D 向均值回归防漂移；权重从个人复习日志梯度下降训练。
- 落点：[06-memory.md](06-memory.md) "可训练的遗忘参数"——从 Agent 自身召回日志训练遗忘曲线。
- 来源：[FSRS 算法 wiki](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm)、[参数详解](https://expertium.github.io/Algorithm.html)。

## B. 工程与平台现状（2025–2026）

### B1. 主动开口的语音 Agent

- 现状：API 层已成熟——OpenAI Realtime API 支持 server/semantic VAD，应用可随时下发 `response.create` 让 AI 在无人提问时主动说话；LiveKit 提供 Turn Detector（模型判句尾）与可配置 interruption。消费级语音产品（ChatGPT Advanced Voice 等）截至 2026 年初**不会**在会话外主动发起对话（此项不确定是否已有变化）。
- 落点："主动张嘴"（PV-3）是应用层编排能力：轮次检测与发言触发解耦，发言可由外部事件注入——与事件流闭环（[02-architecture.md](02-architecture.md)）一致。
- 来源：[Realtime API](https://developers.openai.com/api/docs/guides/realtime)、[LiveKit turn-taking](https://docs.livekit.io/agents/logic/turns/)。

### B2. 后台/常驻 Agent

- 现状：ChatGPT Tasks（定时任务 + push/email 通知）、ChatGPT Agent（自主沙箱执行）；Claude Code 后台任务的官方通知触发点为三类——**任务完成 / 需要权限审批 / 出错阻塞**（工程坑：并发完成时曾只处理第一条通知）。
- 落点：冒泡协议（[04-workers.md](04-workers.md)）与通知场景采用同一三分法。
- 来源：[ChatGPT Tasks](https://help.openai.com/en/articles/10291617-tasks-in-chatgpt)、[Claude Code 自动化](https://www.anthropic.com/news/enabling-claude-code-to-work-more-autonomously)。

### B3. 时序知识图谱

- 现状：核心模型是双时态（bitemporal）——每条事实带 valid time（世界中为真的时间）与 transaction time（系统获知的时间）；Neo4j 惯例在边上存 valid_from/valid_to；Zep 的 Graphiti 验证了"新事实使旧边失效而非删除"的路线（Episode 溯源 → Entity 节点 + 带有效期窗口的 Fact 边）。
- 落点：时间轴记忆（[06-memory.md](06-memory.md)）的工程实现路径；世界图（[07-world-graph.md](07-world-graph.md)）的边带双时间戳。
- 来源：[Zep/Graphiti 论文](https://arxiv.org/abs/2501.13956)、[Graphiti](https://github.com/getzep/graphiti)、[时序数据库综述](https://en.wikipedia.org/wiki/Temporal_database)。

### B4. Agent 记忆框架对比

- 现状：三条路线——Letta（stateful agent + 可自编辑 memory blocks + sleep-time）、Mem0（通用记忆层 API，采用最广）、Zep/Graphiti（双时态图记忆，DMR 基准声称超 MemGPT）。注意三家 benchmark 互有攻击，数字打折看。
- 落点：memory blocks（自编辑的自我描述，保人格一致性）与图记忆（结构化长期事实）互补——与双层存储（[06-memory.md](06-memory.md)）的设计一致。
- 来源：[Letta docs](https://docs.letta.com/)、[Mem0 vs Zep 讨论](https://forum.letta.com/t/agent-memory-letta-vs-mem0-vs-zep-vs-cognee/88)。

### B5. 多 Agent 冲突裁决

- 现状：三种模式——多 Agent 辩论（MAD）、独立仲裁 Judge、共享记忆一致性。反面证据：2025 年跨 9 基准研究显示 MAD 常不优于单 Agent 基线且有从众问题。
- 落点：支持不建仲裁器（[11-consistency.md](11-consistency.md)）：冲突结论带置信度与时间戳落库，由时序记忆做最终裁决。
- 来源：[MAD 经验研究](https://arxiv.org/html/2607.26212v1)、[冲突模式分析](https://tianpan.co/blog/2026-05-02-multi-agent-conflict-resolution-disagreement-patterns)。

## C. 内驱力与人格生成

### C1. 稳态强化学习（Homeostatic RL）

- 机制：Keramati & Gutkin 定义内稳态空间（每个维度是带设定点的内部变量），驱力 D = Σ|h* - h|^(n/m)，奖励 = 驱力下降量；数学上证明折现奖励最大化 ⟺ 最小化折现设定点偏差——"追求奖励"与"维持稳态"是同一目标；时间折现是最优性要求而非偏差。2025 年 HRRL 框架（arXiv 2507.04998）整合为可深度 RL 化的形式，自然涌现风险规避与预期性调节（allostasis：提前行动）。
- 落点：内驱性（PV-2）的数学基础——给 Agent 一组带设定点的内部变量（生理层指标，[10-emotion-relations.md](10-emotion-relations.md)），无人指令时"降低内态偏差"就是行动理由。
- 来源：[eLife 04811](https://elifesciences.org/articles/04811)、[arXiv 2507.04998](https://arxiv.org/abs/2507.04998)、[arXiv 2109.06580](https://arxiv.org/abs/2109.06580)。

### C2. 内感受 AI（Nature Machine Intelligence 2026）

- 论点：内感受（对内部状态的监控与调节）是"自设目标 + 适应非平稳环境"的生物模板；关键是把内部状态抽象为可计算的函数形式——内部变量是外部世界漂移时的稳定参考系，调制学习与行为；神经调质按代谢状态切换探索/利用。
- 落点：生理层不只影响语气，而是作为策略上下文调制整个决策（与情绪投影模型一致）。
- 来源：[Nature MI s42256-026-01296-8](https://www.nature.com/articles/s42256-026-01296-8)。

### C3. PEPA（持续自主具身 Agent）

- 机制：三层认知架构——云端层从人格合成目标（终极目标 ← 人格描述；每日目标 3–5 条由前日运行记忆生成，格式"条件→行动"，多日自反思校准内在奖励）；慎思层用 MCTS 仲裁内外奖励；执行层跑在四足机器人上（无固定任务脚本，自主乘电梯、低电回充）。五个 Big-Five 锚定原型。
- 落点：人格是目标生成器（[09-persona.md](09-persona.md)）；"记忆 + 每日反思驱动目标演化"与夜间整理 + 思考线唤醒同构。
- 来源：[arXiv 2603.00117](https://arxiv.org/abs/2603.00117)、[项目页](https://sites.google.com/view/pepa-persistent/)。

### C4. 人格一致性与身份涌现

- 机制与证据：Step-Level Preference Learning（arXiv 2607.14485）在生成式 Agent 的规划/检索/反思/行动中间步采集 57K 人类偏好，SFT+DPO 训入权重——人格一致性可训入权重而非全靠 prompt；SPASM（arXiv 2604.09212）实证多轮对话的 persona 漂移/角色混淆是可测量失效模式；Project Sid（arXiv 2411.00114，1000+ Minecraft agent）显示**同人格初始的 agent 仍分化出不同身份**——身份可由经历涌现。
- 落点：人生发生器（[09-persona.md](09-persona.md)）的三重支撑——经历涌现身份（Project Sid）、漂移是可测量风险（SPASM）、一致性可训练（步级偏好学习）。
- 来源：[arXiv 2607.14485](https://arxiv.org/abs/2607.14485)、[arXiv 2604.09212](https://arxiv.org/html/2604.09212v1)、[arXiv 2411.00114](https://arxiv.org/html/2411.00114v1)。

### C5. Theory of Mind 证据（否决的复核）

- 双向：主流 LLM 高阶 ToM 测验达成人水平，仅提示即可增益（支持"记忆+上下文"方案）；但模块化 ToM 在共情/说服对话、对手预测、显式信念表示场景有可测提升。
- 落点：维持否决（[11-consistency.md](11-consistency.md)），若进入说服/谈判密集产品域，补轻量"对方建模"步骤。
- 来源：[arXiv 2509.22887](https://arxiv.org/abs/2509.22887)、[arXiv 2501.15355](https://arxiv.org/abs/2501.15355)。

## D. 本体、权限与相关（对话中引用，经核对）

| 主题 | 对话中的用途 | 代表来源 |
|---|---|---|
| UFO/BFO 本体论、REA 会计模型 | 本体五原语的参照（[07-world-graph.md](07-world-graph.md)） | [UFO](https://www.inf.ufes.br/~gguizzardi/Applied_Ontology__UFO__Unified_Foundational_Ontology.pdf) |
| Affordance（Gibson 生态心理学） | 可供性概念来源 | [Affordance](https://en.wikipedia.org/wiki/Affordance) |
| ABAC（NIST SP 800-162）、Cedar、OPA、Zanzibar | 可控性/权限的工程实现 | [Cedar](https://docs.cedarpolicy.com/)、[Zanzibar](https://research.google/pubs/zanzibar-googles-consistent-global-authorization-system/) |
| W3C PROV | 溯源字段标准 | [PROV-DM](https://www.w3.org/TR/prov-dm/) |
| BDI（信念-愿望-意图） | 思考线/目标体系的概念参照 | [BDI: From Theory to Practice](https://cdn.aaai.org/ICMAS/1995/ICMAS95-042.pdf) |
| Wolfram 计算不可约性 | 人生只能推演不能预测（[09-persona.md](09-persona.md)） | [MathWorld](https://mathworld.wolfram.com/ComputationalIrreducibility.html) |
| 叙事身份（Singer 2013） | 关键事件构建人格 | [Singer 2013](https://onlinelibrary.wiley.com/doi/10.1111/jopy.12005) |
| Voyager、Reflexion、Agent Workflow Memory、MUSE-Autoskill、SkillLens、Agent Skill Security | 技能系统参照（[08-skills.md](08-skills.md)） | [Voyager](https://openreview.net/pdf?id=P8E4Br72j3)、[Reflexion](https://arxiv.org/abs/2303.11366)、[AWM](https://arxiv.org/abs/2409.07429)、[SkillLens](https://microsoft.github.io/SkillLens/)、[Skill Security](https://arxiv.org/abs/2607.13987) |
