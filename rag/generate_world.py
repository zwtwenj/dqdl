"""
世界观文档批量生成器
通过 DeepSeek API 分批生成所有世界设定文档，保存到 rag 目录
"""

import os
import time
import json
from openai import OpenAI
from docx import Document
from docx.shared import Pt, Inches, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from dotenv import load_dotenv

load_dotenv()
client = OpenAI(api_key=os.getenv("apikey"), base_url="https://api.deepseek.com")

RAG_DIR = os.path.join(os.path.dirname(__file__), "rag")
os.makedirs(RAG_DIR, exist_ok=True)

# ========== 工具函数 ==========

def call_ai(system_prompt, user_prompt, temperature=0.8, max_tokens=8000):
    """调用 DeepSeek API"""
    response = client.chat.completions.create(
        model="deepseek-chat",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return response.choices[0].message.content

def save_docx(filename, title, content):
    """保存为 docx 文件"""
    doc = Document()
    
    # 设置默认字体
    style = doc.styles['Normal']
    style.font.name = '宋体'
    style.font.size = Pt(11)
    
    # 标题
    h = doc.add_heading(title, level=1)
    h.alignment = WD_ALIGN_PARAGRAPH.CENTER
    
    # 内容
    for paragraph_text in content.split('\n'):
        paragraph_text = paragraph_text.strip()
        if not paragraph_text:
            continue
        if paragraph_text.startswith('## ') or paragraph_text.startswith('二') or paragraph_text.startswith('三') or paragraph_text.startswith('四') or paragraph_text.startswith('五'):
            doc.add_heading(paragraph_text, level=2)
        elif paragraph_text.startswith('【') or paragraph_text.startswith('一'):
            doc.add_heading(paragraph_text, level=2)
        else:
            p = doc.add_paragraph(paragraph_text)
            if paragraph_text.startswith('-') or paragraph_text.startswith('1.') or paragraph_text.startswith('2.') or paragraph_text.startswith('3.'):
                p.style = doc.styles['List Bullet']
    
    filepath = os.path.join(RAG_DIR, filename)
    doc.save(filepath)
    file_size = os.path.getsize(filepath)
    print(f"  ✓ 已保存: {filename} ({file_size} bytes)")
    return filepath


# ========== 魔兽图鉴生成 ==========

def generate_beasts():
    """生成300种魔兽图鉴，分10批，每批30种"""
    print("\n" + "=" * 60)
    print("  生成魔兽图鉴（300种）")
    print("=" * 60)
    
    beast_levels = [
        {"level": 1, "range": "一阶", "realm": "斗之气", "count": 100, "batches": 4, "per_batch": 25},
        {"level": 2, "range": "二阶", "realm": "斗者", "count": 100, "batches": 4, "per_batch": 25},
        {"level": 3, "range": "三阶", "realm": "斗师", "count": 100, "batches": 4, "per_batch": 25},
    ]
    
    all_beasts = []
    
    for lv_info in beast_levels:
        for batch in range(lv_info["batches"]):
            nth = f"第{batch + 1}批"
            print(f"\n  生成{lv_info['range']}魔兽 {nth}（{lv_info['per_batch']}种）...")
            
            prompt = f"""请为斗气大陆世界观的文字冒险游戏生成{lv_info['per_batch']}种{lv_info['range']}魔兽（对应{lv_info['realm']}境界）。

每只魔兽必须包含以下字段，用严格的格式输出：

【名称】XXX
【分类】元素属性（火/水/风/土/雷/冰/暗/毒/木）
【品阶】{lv_info['range']}
【危险度】低/中/高
【栖息地】具体地点描述（如：魔兽山脉外围森林、沼泽湿地、地下洞穴等）
【外观】30-50字的外貌描述
【体型】体长、肩高等数据
【核心能力】1-2种战斗能力
【弱点】明确的克制方式
【魔核】品级与效果简述
【掉落物】1-2种材料
【性情】攻击性描述
【稀有度】常见/不常见/稀有
【战力参考】相当于人类什么境界的实力

要求：
- 名称要有创意，不要用现实中或已有作品中的名字，必须是全新原创
- 各属性魔兽均匀分布（火/水/风/土/雷/冰/暗/毒/木都要有）
- 栖息地多样化（森林、山脉、沼泽、洞穴、河流、草原、沙漠等）
- 能力描述要具体，不要空泛
- 这是{nth}的{lv_info['range']}魔兽，前面已有{(batch) * lv_info['per_batch']}种

请直接输出魔兽条目，每只魔兽之间用 --- 分隔。"""
            
            result = call_ai(
                "你是专业的游戏世界观设计师，擅长为奇幻世界设计魔兽图鉴。输出必须严格遵循指定格式，魔兽名称全部原创。",
                prompt,
                temperature=0.9,
                max_tokens=8000
            )
            all_beasts.append(result)
            print(f"  + 已获取 {nth} 内容 ({len(result)} 字)")
            time.sleep(1)
    
    # 合并保存
    full_content = "\n\n---\n\n".join(all_beasts)
    save_docx("魔兽图鉴.docx", "魔兽图鉴（一阶至三阶）", 
              "# 魔兽图鉴\n\n本文档收录了斗气大陆1-3阶魔兽共300种，对应斗之气、斗者、斗师境界。\n\n" + full_content)
    
    return full_content


# ========== 魔核体系 ==========

def generate_core_system():
    """生成魔核体系文档"""
    print("\n" + "=" * 60)
    print("  生成魔核体系文档")
    print("=" * 60)
    
    prompt = """请为斗气大陆世界观设计一套完整的魔核体系。要求：

一、魔核基础概念
- 魔核是什么（魔兽体内凝聚的能量结晶）
- 获取方式（猎杀魔兽后从其体内取出）
- 魔核与魔兽品阶的对应关系

二、魔核品级划分（1-3阶，对应斗之气、斗者、斗师）
- 一阶魔核：特征、外观、能量波动
- 二阶魔核：特征、外观、能量波动
- 三阶魔核：特征、外观、能量波动
- 各品阶魔核的市场参考价

三、魔核属性分类
- 火属性魔核（特征：温热、红色光泽）
- 水属性魔核（特征：清凉、蓝色光泽）
- 风属性魔核（特征：轻灵、绿色光泽）
- 土属性魔核（特征：厚重、褐色光泽）
- 雷属性魔核（特征：刺麻感、紫色光泽）
- 冰属性魔核（特征：冰冷、白色光泽）
- 暗属性魔核（特征：吸光、黑色光泽）
- 毒属性魔核（特征：腐蚀感、紫色光泽）
- 木属性魔核（特征：生命力、绿色光泽）

四、魔核的用途
- 炼丹（作为核心材料，不同属性魔核可用于不同丹药）
- 锻造（镶嵌于武器防具，赋予属性加成）
- 修炼（直接吸收魔核能量辅助突破）
- 交易（通用硬通货，可替代金币进行大宗交易）
- 阵法（作为阵眼能量源）

五、魔核成色与品质
- 普通（60%以下能量纯度）
- 精良（60-80%纯度）
- 极品（80-95%纯度）
- 完美（95%以上纯度）
- 不同品质对价格的影响系数

六、魔核交易规则
- 魔核作为"第二货币"的交易地位
- 常见兑换比（1枚一阶普通魔核 ≈ 50金币）
- 跨品阶兑换（1枚二阶 ≈ 5枚一阶）

请用清晰的标题和分点格式输出，便于后续检索。"""
    
    result = call_ai(
        "你是专业的游戏世界观设计师，擅长设计经济系统和物品体系。",
        prompt,
        temperature=0.7,
        max_tokens=4000
    )
    save_docx("魔核体系.docx", "魔核体系", result)
    return result


# ========== 草药图鉴 ==========

def generate_herbs():
    """生成100种草药图鉴"""
    print("\n" + "=" * 60)
    print("  生成草药图鉴（100种）")
    print("=" * 60)
    
    herb_levels = [
        {"level": 1, "range": "一阶", "realm": "斗之气", "count": 34, "per_batch": 17},
        {"level": 2, "range": "二阶", "realm": "斗者", "count": 33, "per_batch": 17},
        {"level": 3, "range": "三阶", "realm": "斗师", "count": 33, "per_batch": 17},
    ]
    
    all_herbs = []
    
    for lv_info in herb_levels:
        for batch in range(2):
            nth = f"第{batch + 1}批"
            print(f"\n  生成{lv_info['range']}草药 {nth}（{lv_info['per_batch']}种）...")
            
            prompt = f"""请为斗气大陆世界观的文字冒险游戏生成{lv_info['per_batch']}种{lv_info['range']}草药（对应{lv_info['realm']}境界炼药师可采集使用）。

每种草药必须包含以下字段：

【名称】XXX
【品阶】{lv_info['range']}
【类别】药性类别（补气/疗伤/解毒/强化/突破/凝神）
【栖息地】具体生长环境（如：阴湿山洞、悬崖峭壁、沼泽边、密林深处等）
【外观】30-40字的外观描述
【采集难度】容易/中等/困难
【核心功效】1-2种具体效果
【配伍药性】温/寒/平/烈
【市场价】金币参考价
【稀有度】常见/不常见/稀有

要求：
- 名称全部原创，可以参考中药材命名风格（如：赤血藤、寒冰草、龙涎果）但不要直接使用
- 类别均匀分布
- 生长环境多样化
- 这是{nth}，前面已有{(batch) * lv_info['per_batch']}种

请直接输出草药条目，每种之间用 --- 分隔。"""
            
            result = call_ai(
                "你是专业的游戏世界观设计师，擅长设计炼药和药材系统。输出必须严格遵循指定格式。",
                prompt,
                temperature=0.9,
                max_tokens=8000
            )
            all_herbs.append(result)
            print(f"  + 已获取 {nth} 内容 ({len(result)} 字)")
            time.sleep(1)
    
    full_content = "\n\n---\n\n".join(all_herbs)
    save_docx("草药图鉴.docx", "草药图鉴（一阶至三阶）",
              "# 草药图鉴\n\n本文档收录了斗气大陆1-3阶草药共100种。\n\n" + full_content)
    return full_content


# ========== 丹药图鉴 ==========

def generate_pills():
    """生成30种丹药图鉴"""
    print("\n" + "=" * 60)
    print("  生成丹药图鉴（30种）")
    print("=" * 60)
    
    pill_levels = [
        {"level": 1, "range": "一阶", "realm": "斗之气", "count": 10},
        {"level": 2, "range": "二阶", "realm": "斗者", "count": 10},
        {"level": 3, "range": "三阶", "realm": "斗师", "count": 10},
    ]
    
    all_pills = []
    
    for lv_info in pill_levels:
        print(f"\n  生成{lv_info['range']}丹药（{lv_info['count']}种）...")
        
        prompt = f"""请为斗气大陆世界观设计{lv_info['count']}种{lv_info['range']}丹药。可以参考斗破苍穹中的丹药体系（如回气丹、筑基灵液、聚气散等），也可以原创。

每种丹药必须包含以下字段：

【名称】XXX
【品阶】{lv_info['range']}
【类别】丹药类型（恢复/修炼/突破/战斗/解毒/疗伤/属性强化）
【主材料】2-3种核心药材（与草药图鉴中的药材名对应）
【辅助材料】1-2种辅助材料
【核心效果】具体数值效果（如：恢复XX点斗气、提升XX%修炼速度）
【持续时间】效果持续多久
【副作用/限制】使用限制或副作用
【炼制难度】容易/中等/困难
【市价】金币参考价（一阶10-100金币，二阶100-500金币，三阶500-2000金币）
【适用对象】适合什么境界的人使用

请直接输出丹药条目，每种之间用 --- 分隔。"""
        
        result = call_ai(
            "你是专业的游戏世界观设计师，擅长设计丹药和炼药系统。输出必须严格遵循指定格式。",
            prompt,
            temperature=0.85,
            max_tokens=6000
        )
        all_pills.append(result)
        print(f"  + 已获取 {lv_info['range']} 内容 ({len(result)} 字)")
        time.sleep(1)
    
    full_content = "\n\n---\n\n".join(all_pills)
    save_docx("丹药图鉴.docx", "丹药图鉴（一阶至三阶）",
              "# 丹药图鉴\n\n本文档收录了斗气大陆1-3阶丹药共30种。\n\n" + full_content)
    return full_content


# ========== 佣兵体系 ==========

def generate_mercenary_system():
    """生成佣兵体系文档"""
    print("\n" + "=" * 60)
    print("  生成佣兵体系与规则")
    print("=" * 60)
    
    prompt = """请为斗气大陆世界观设计一套完整的佣兵体系与规则。要求：

一、佣兵公会总部与分会
- 总部位置（可设想在加玛帝国帝都）
- 分会分布（各大城市均有分会，乌坦城有一处三级分会）
- 公会建筑外观与内部结构描述

二、佣兵等级体系
- 铁级佣兵（入门级，需要斗之气七段以上）
- 铜级佣兵（需要斗者境界）
- 银级佣兵（需要斗师境界）
- 金级佣兵（需要大斗师境界）
- 暗金级佣兵（需要斗灵及以上）

三、任务等级与报酬
- D级任务：收集药材、护送短途商队（报酬10-50金币）
- C级任务：猎杀一阶魔兽、探索指定区域（报酬50-200金币）
- B级任务：猎杀二阶魔兽、护送重要人物（报酬200-800金币）
- A级任务：猎杀三阶魔兽、调查危险区域（报酬800-3000金币）
- S级任务：特殊委托、猎杀四阶以上魔兽（报酬3000+金币）

四、佣兵晋升规则
- 完成任务可获得贡献点数
- 境界达标 + 贡献点数达标 → 晋升考核
- 考核未通过需等待30天冷却期
- 各等级所需贡献点

五、佣兵福利
- 公会内部交易折扣
- 情报共享系统
- 紧急救援支援
- 推荐信制度

六、佣兵团系统
- 组建条件（至少1名银级佣兵+3名铜级）
- 佣兵团等级（与个人等级并行）
- 团内职务（团长、副团长、斥候、医师等）
- 团任务（报酬更高但难度更大）

请用清晰的标题和分点格式输出。"""
    
    result = call_ai(
        "你是专业的游戏世界观设计师，擅长设计势力体系和规则系统。",
        prompt,
        temperature=0.7,
        max_tokens=4000
    )
    save_docx("佣兵体系与规则.docx", "佣兵体系与规则", result)
    return result


# ========== 经济体系 ==========

def generate_economy():
    """生成经济体系文档"""
    print("\n" + "=" * 60)
    print("  生成经济体系与物价")
    print("=" * 60)
    
    prompt = """请为斗气大陆世界观设计一套完整的经济体系与物价参考。以加玛帝国为基准。

一、货币体系
- 金币：主要流通货币，1金币 ≈ 普通人1个月生活费
- 银币：辅助货币，1金币 = 100银币
- 铜币：小额货币，1银币 = 100铜币  
- 魔核：硬通货，可用于大宗交易替代金币

二、常见物品物价表（以金币计）
- 普通兵器（铁剑、皮甲等）：5-30金币
- 精良兵器（百炼钢剑等）：30-200金币
- 一阶丹药：10-100金币
- 二阶丹药：100-500金币
- 三阶丹药：500-2000金币
- 一阶魔核（普通）：30-50金币
- 二阶魔核（普通）：150-250金币
- 三阶魔核（普通）：500-1000金币
- 一阶草药：5-20金币
- 二阶草药：20-80金币
- 三阶草药：80-300金币
- 客栈住宿（一晚）：5-10银币（中档）
- 一顿饭：10-30铜币
- 功法卷轴：黄阶50-300金币，玄阶500-3000金币

三、各地物价差异
- 乌坦城（边境城市）：物价基准
- 帝都（中心地带）：物价×1.5-2倍
- 魔兽山脉补给站：物价×2-3倍（运输困难）
- 黑角域：物价混乱，视情况而定

四、收入参考
- 普通佣兵D级任务年收入：约200-500金币
- 银级佣兵年收入：约2000-5000金币
- 炼药师（一品）年收入：约1000-3000金币
- 炼药师（三品）年收入：约10000-30000金币
- 普通店铺伙计月薪：约5-10金币

五、特殊交易规则
- 拍卖场加价比例（15%手续费）
- 以物易物折价（通常打8折）
- 魔核与金币的兑换浮动（±20%视市场供需）
- 批量采购折扣（10件以上9折，50件以上8折）

请用清晰的标题和分点格式输出。"""
    
    result = call_ai(
        "你是专业的游戏世界观设计师，擅长设计经济系统。",
        prompt,
        temperature=0.7,
        max_tokens=4000
    )
    save_docx("经济体系与物价.docx", "经济体系与物价", result)
    return result


# ========== 主流程 ==========

def main():
    print("=" * 60)
    print("  斗气大陆世界观文档批量生成器")
    print("=" * 60)
    print(f"  输出目录: {RAG_DIR}")
    print("=" * 60)
    
    # 1. 魔兽图鉴
    print("\n[1/6] 魔兽图鉴（300种）...")
    generate_beasts()
    
    # 2. 魔核体系
    print("\n[2/6] 魔核体系...")
    generate_core_system()
    
    # 3. 草药图鉴
    print("\n[3/6] 草药图鉴（100种）...")
    generate_herbs()
    
    # 4. 丹药图鉴
    print("\n[4/6] 丹药图鉴（30种）...")
    generate_pills()
    
    # 5. 佣兵体系
    print("\n[5/6] 佣兵体系与规则...")
    generate_mercenary_system()
    
    # 6. 经济体系
    print("\n[6/6] 经济体系与物价...")
    generate_economy()
    
    # 完成
    print("\n" + "=" * 60)
    print("  全部生成完成！")
    print("=" * 60)
    print(f"\n  rag 目录下生成的文件：")
    for f in sorted(os.listdir(RAG_DIR)):
        if f.endswith('.docx'):
            size = os.path.getsize(os.path.join(RAG_DIR, f))
            print(f"    {f} ({size:,} bytes)")


if __name__ == "__main__":
    main()
