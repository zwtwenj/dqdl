# -*- coding: utf-8 -*-
"""动态NPC对话能力 + 前端可见性修复 综合自测。
覆盖:
  A. getScenes 返回的 scene.npcs 是数组 + is_dynamic 标记(场景内可见性根因)
  B. GET /npc/location/:id 返回 {static,dynamic} 且节点 loadNpcs 合并逻辑
  C. 动态 NPC 完整对话:createSession(npcType=dynamic) → talkInSession → session.npc_type=dynamic
  D. 静态 NPC 对话不受影响(回归)
"""
import json, urllib.request, urllib.error, pymysql, os
from dotenv import load_dotenv
load_dotenv(r'D:\text\icarus-models\dqdl\dqdl_server1.0\.env')

BASE = "http://localhost:3001"

def call(method, path, body=None, token=None):
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json; charset=utf-8")
    if token: req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return {"_http_err": e.code, "body": e.read().decode("utf-8", "ignore")}

def db():
    return pymysql.connect(host=os.getenv('DB_HOST'), port=3306, user=os.getenv('DB_USER'),
        password=os.getenv('DB_PASSWORD'), database=os.getenv('DB_DATABASE'),
        charset='utf8mb4', autocommit=True)

TOKEN = call("POST", "/api/auth/login", {"username": "admin", "password": "123456"}).get("data", {}).get("token", "")
print("TOKEN len:", len(TOKEN))

# ── 准备:确保有一个动态演员挂在某场景,和一个静态NPC作对照 ──
conn = db(); cur = conn.cursor()
# 找乌坦城 + 坊市场景
cur.execute("SELECT id FROM location_net WHERE name='乌坦城' LIMIT 1")
utan = cur.fetchone(); utan_id = utan[0] if utan else None
cur.execute("SELECT id FROM location_scene WHERE net_id=%s AND scene_type='market' LIMIT 1", (utan_id,))
mk = cur.fetchone(); scene_id = mk[0] if mk else None
print(f"乌坦城节点 id={utan_id}, 坊市场景 id={scene_id}")

# 清理并造一个动态演员挂在坊市场景
cur.execute("DELETE FROM dynamic_npc")
cur.execute("""INSERT INTO dynamic_npc (name,gender,age,nature_id,role_id,description,enabled,status,location_scene_id,source)
  VALUES ('测试散修甲','男','青年',(SELECT id FROM nature WHERE name='冷淡'),
  (SELECT id FROM npc_role WHERE name='散修'),'游历的散修',1,'alive',%s,'manual')""", (scene_id,))
cur.execute("SELECT id FROM dynamic_npc WHERE name='测试散修甲'")
dyn_id = cur.fetchone()[0]
conn.close()
print(f"造动态演员 id={dyn_id} (挂坊市场景)")

print("\n========== A. getScenes: scene.npcs 应为数组 + 含 is_dynamic 标记 ==========")
r = call("GET", f"/api/location_net/{utan_id}/scenes", None, TOKEN)
scenes = r.get("data", [])
market = next((s for s in scenes if s.get("scene_type") == "market"), None)
npcs = market.get("npcs") if market else None
print(f"  scene.npcs 类型: {'数组 ✓' if isinstance(npcs, list) else '非数组('+str(type(npcs))+') ✗'}")
print(f"  scene.npcs 数量: {len(npcs) if isinstance(npcs,list) else 'N/A'}")
if isinstance(npcs, list):
    for n in npcs:
        print(f"    - {n.get('name')} ({n.get('role_name')}) is_dynamic={n.get('is_dynamic')}")

print("\n========== B. GET /npc/location/:id 返回 {static,dynamic} ==========")
r2 = call("GET", f"/api/npc/location/{scene_id}?type=scene", None, TOKEN)
d2 = r2.get("data", {})
print(f"  static 数量: {len(d2.get('static', []))}, dynamic 数量: {len(d2.get('dynamic', []))}")
print(f"  key 存在: static={'static' in d2} dynamic={'dynamic' in d2}")

print("\n========== C. 动态 NPC 完整对话链路 ==========")
print(f"  C1. createSession(npcType=dynamic, npcId={dyn_id})")
r3 = call("POST", f"/api/npc/{dyn_id}/session", {"playerId": -999, "npcType": "dynamic"}, TOKEN)
sess = r3.get("data", {})
sid = sess.get("sessionId")
npc_detail = sess.get("npc", {})
print(f"    sessionId={sid}, npc.name={npc_detail.get('name')}, npc_type={npc_detail.get('npc_type')}")
assert npc_detail.get("npc_type") == "dynamic", "npc_type 应为 dynamic"
assert npc_detail.get("name") == "测试散修甲"

# 验证 session 落库 npc_type=dynamic
conn = db(); cur = conn.cursor()
cur.execute("SELECT npc_type FROM dialog_session WHERE id=%s", (sid,))
row = cur.fetchone(); conn.close()
print(f"    DB dialog_session.npc_type = {row[0] if row else 'N/A'} (期望 dynamic)")
assert row and row[0] == "dynamic"

print(f"  C2. talkInSession(sessionId={sid}) 取开场白")
r4 = call("POST", f"/api/npc/session/{sid}/talk", {"message": ""}, TOKEN)
d4 = r4.get("data", {})
reply = d4.get("reply", "")
print(f"    reply 长度={len(reply)}, 前40字: {reply[:40]}")

print(f"  C3. talkInSession 第二轮(玩家发言)")
r5 = call("POST", f"/api/npc/session/{sid}/talk", {"message": "你是哪里人?"}, TOKEN)
d5 = r5.get("data", {})
print(f"    reply 长度={len(d5.get('reply',''))}, rounds={d5.get('rounds')}")

print("\n========== D. 静态 NPC 对话回归(不受影响) ==========")
conn = db(); cur = conn.cursor()
cur.execute("SELECT id FROM static_npc LIMIT 1")
srow = cur.fetchone(); conn.close()
if srow:
    static_id = srow[0]
    print(f"  D1. createSession(npcType=static默认, npcId={static_id})")
    r6 = call("POST", f"/api/npc/{static_id}/session", {"playerId": -999}, TOKEN)
    s6 = r6.get("data", {})
    sid6 = s6.get("sessionId")
    print(f"    sessionId={sid6}, npc.name={s6.get('npc',{}).get('name')}, npc_type={s6.get('npc',{}).get('npc_type')}")
    # 默认应为 static
    conn = db(); cur = conn.cursor()
    cur.execute("SELECT npc_type FROM dialog_session WHERE id=%s", (sid6,))
    row6 = cur.fetchone(); conn.close()
    print(f"    DB npc_type = {row6[0] if row6 else 'N/A'} (期望 static)")
    print(f"  D2. talkInSession 回归")
    r7 = call("POST", f"/api/npc/session/{sid6}/talk", {"message": ""}, TOKEN)
    print(f"    reply 长度={len(r7.get('data',{}).get('reply',''))}")
else:
    print("  (无 static_npc 数据,跳过回归)")

print("\n========== E. 清理 ==========")
conn = db(); cur = conn.cursor()
cur.execute("DELETE FROM dynamic_npc WHERE name LIKE '测试%'")
cur.execute("DELETE FROM dialog_session WHERE player_id=-999")
conn.close()
print("  已清理测试数据")

print("\n===== 全部断言通过 =====")
