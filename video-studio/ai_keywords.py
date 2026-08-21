"""
ai_keywords.py — 使用 DeepSeek（或其他LLM）提取 B-roll 搜索关键词

流程:
  1. 传入字幕文本（从语音识别得到）
  2. DeepSeek 分析字幕内容，为每段提取最合适的搜索关键词
  3. 返回关键词列表，用于去 Pixabay/Pexels 搜索 B-roll

支持的 LLM:
  - DeepSeek（最便宜）
  - 通义千问 Qwen
  - 月之暗面 Kimi
  - OpenAI
  - none（不调用AI，用简单分词）
"""
from typing import List, Tuple
from loguru import logger
import config


def _get_llm_client():
    """根据配置创建 OpenAI 兼容客户端（DeepSeek/Qwen/Kimi/OpenAI 都兼容 OpenAI SDK）"""
    from openai import OpenAI

    provider = config.get("ai", "provider", "none")
    if provider == "none":
        return None, provider

    providers = {
        "deepseek": {
            "key_key": "deepseek_api_key",
            "url_key": "deepseek_base_url",
            "model_key": "deepseek_model",
        },
        "qwen": {
            "key_key": "qwen_api_key",
            "url_key": "qwen_base_url",
            "model_key": "qwen_model",
        },
        "moonshot": {
            "key_key": "moonshot_api_key",
            "url_key": "moonshot_base_url",
            "model_key": "moonshot_model",
        },
        "openai": {
            "key_key": "openai_api_key",
            "url_key": "openai_base_url",
            "model_key": "openai_model",
        },
    }

    p = providers.get(provider)
    if not p:
        logger.error(f"未知 AI 提供商: {provider}")
        return None, provider

    api_key = config.get("ai", p["key_key"], "")
    base_url = config.get("ai", p["url_key"], "")
    model = config.get("ai", p["model_key"], "")

    if not api_key:
        logger.error(f"{provider} API key 未配置")
        return None, provider

    client = OpenAI(api_key=api_key, base_url=base_url)
    return (client, model), provider


def extract_keywords(
    subtitle_segments: List[Tuple[float, float, str]],
    max_keywords: int = 8,
) -> List[str]:
    """
    从字幕内容中提取 B-roll 搜索关键词
    
    参数:
        subtitle_segments: [(start, end, text), ...]
        max_keywords: 最多返回几个关键词
    
    返回:
        ["关键词1", "关键词2", ...]
    """
    (client_info, provider) = _get_llm_client()

    if provider == "none" or client_info is None:
        return _simple_extract(subtitle_segments, max_keywords)

    client, model = client_info

    # 拼接所有字幕文本
    full_text = " ".join(text for _, _, text in subtitle_segments)
    if len(full_text) > 2000:
        full_text = full_text[:2000]  # 截断，避免 token 过多

    prompt = f"""请分析以下视频字幕内容，提取 {max_keywords} 个最适合搜索 B-roll 空镜素材的关键词。

要求：
1. 关键词应该是能搜到视频素材的具体事物、场景、动作
2. 关键词用英文（因为素材网站主要是英文搜索）
3. 每个关键词单独一行，不要编号
4. 如果字幕内容涉及美食，就搜 food/cooking；涉及自然，就搜 nature/landscape
5. 关键词要具体，比如 "coffee pouring" 比 "drink" 好

字幕内容：
{full_text}

请直接输出关键词，每行一个："""

    logger.info(f"[AI] 使用 {provider}/{model} 提取关键词...")
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=300,
        )
        result = response.choices[0].message.content.strip()
        keywords = [k.strip() for k in result.split("\n") if k.strip()][:max_keywords]

        # 过滤掉太长或太短的关键词
        keywords = [k for k in keywords if 2 <= len(k) <= 50]

        logger.info(f"[AI] 提取到 {len(keywords)} 个关键词: {keywords}")
        return keywords

    except Exception as e:
        logger.error(f"[AI] 关键词提取失败: {type(e).__name__}: {e}")
        logger.info("[AI] 回退到简单分词模式")
        return _simple_extract(subtitle_segments, max_keywords)


def _simple_extract(
    subtitle_segments: List[Tuple[float, float, str]],
    max_keywords: int,
) -> List[str]:
    """不调用 AI，用简单的方式提取关键词（回退方案）"""
    # 简单策略：取出现频率最高的几个名词性词汇
    # 这里用一个通用列表，至少能搜到一些素材
    text = " ".join(text for _, _, text in subtitle_segments)

    # 通用关键词，确保总能搜到素材
    generic = ["lifestyle", "technology", "business", "nature"]

    # 如果文本包含一些常见中文关键词，映射到英文搜索词
    keyword_map = {
        "美食": "food cooking",
        "咖啡": "coffee",
        "茶": "tea",
        "旅行": "travel",
        "运动": "sports fitness",
        "音乐": "music",
        "科技": "technology",
        "商业": "business",
        "教育": "education",
        "健康": "health medical",
        "自然": "nature landscape",
        "城市": "city urban",
        "动物": "animals wildlife",
        "孩子": "children kids",
        "家庭": "family home",
        "工作": "office work",
        "汽车": "car driving",
        "衣服": "fashion clothing",
        "化妆": "makeup beauty",
        "书": "books reading",
    }

    matched = []
    for cn, en in keyword_map.items():
        if cn in text:
            matched.append(en)

    if not matched:
        matched = generic

    return matched[:max_keywords]


def optimize_subtitle(
    subtitle_segments: List[Tuple[float, float, str]],
) -> List[Tuple[float, float, str]]:
    """
    用 DeepSeek 优化字幕文案：去语气词、修正语法、断句更自然
    
    返回: 优化后的 [(start, end, text), ...]
    """
    (client_info, provider) = _get_llm_client()

    if provider == "none" or client_info is None:
        return subtitle_segments  # 不优化

    client, model = client_info

    # 构造输入
    lines = []
    for i, (start, end, text) in enumerate(subtitle_segments):
        lines.append(f"[{i}] {text}")

    prompt = f"""请优化以下视频字幕，要求：
1. 去掉"嗯""啊""就是""然后"等语气词和废话
2. 修正明显的语法错误
3. 适当断句，让每条字幕不要太长（适合手机观看）
4. 保持原意，不要添加内容
5. 保持原始编号格式 [编号] 文本
6. 如果某条不需要修改，原样返回

原始字幕：
{chr(10).join(lines)}

请输出优化后的字幕，保持 [编号] 格式："""

    logger.info(f"[AI] 使用 {provider}/{model} 优化字幕文案...")
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=2000,
        )
        result = response.choices[0].message.content.strip()

        # 解析返回结果
        optimized = {}
        for line in result.split("\n"):
            line = line.strip()
            if not line:
                continue
            # 提取 [编号] 后面的文本
            if line.startswith("["):
                end_bracket = line.find("]")
                if end_bracket > 0:
                    try:
                        idx = int(line[1:end_bracket])
                        text = line[end_bracket + 1:].strip()
                        optimized[idx] = text
                    except ValueError:
                        continue

        # 用优化结果替换原始字幕
        result_segments = []
        for i, (start, end, text) in enumerate(subtitle_segments):
            new_text = optimized.get(i, text)
            result_segments.append((start, end, new_text))

        logger.info(f"[AI] 字幕优化完成，修改了 {sum(1 for i in range(len(subtitle_segments)) if optimized.get(i, subtitle_segments[i][2]) != subtitle_segments[i][2])} 条")
        return result_segments

    except Exception as e:
        logger.error(f"[AI] 字幕优化失败: {type(e).__name__}: {e}")
        return subtitle_segments  # 失败则返回原始字幕
