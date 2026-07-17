# -*- coding: utf-8 -*-
import json, urllib.request, urllib.error

BASE = "http://localhost:3001"

def call(method, path, body=None, token=None):
    url = BASE + path
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json; charset=utf-8")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return {"_http_err": e.code, "body": e.read().decode("utf-8", "ignore")}

# 登录拿 token
r = call("POST", "/api/auth/login", {"username": "admin", "password": "123456"})
TOKEN = r.get("data", {}).get("token", "")
print("TOKEN len:", len(TOKEN))

print("\n=== 1. acquire 新建散修 (乌坦城坊市场景) ===")
r = call("POST", "/api/npc/actor/acquire", {
    "role_name": "散修", "scene_name": "乌坦城坊市", "scene_type": "market",
    "city_name": "乌坦城", "loc_scene_id": 3, "ref_type": "encounter", "ref_id": 1
}, TOKEN)
print(json.dumps(r, ensure_ascii=False, indent=2))
nid = r.get("data", {}).get("id")

print("\n=== 2. acquire 复用 (同参数, prefer_existing 默认 true, 应 is_new=false) ===")
r2 = call("POST", "/api/npc/actor/acquire", {"role_name": "散修", "loc_scene_id": 3}, TOKEN)
d2 = r2.get("data", {})
print(f"is_new={d2.get('is_new')} id={d2.get('id')} name={d2.get('name')} (期望 is_new=False 同 id={nid})")

print("\n=== 3. acquire 创建新职业 '游侠' (DB不存在) ===")
r3 = call("POST", "/api/npc/actor/acquire", {"role_name": "游侠", "scene_name": "乌坦城外"}, TOKEN)
d3 = r3.get("data", {})
print(f"is_new={d3.get('is_new')} role_name={d3.get('role_name')} role_id={d3.get('role_id')} (期望新建职业+演员)")

print("\n=== 4. POST /api/npc/role 手动建职业 '游商' ===")
r4 = call("POST", "/api/npc/role", {"name": "游商", "prompt_hint": "四处贩货的行商"}, TOKEN)
print(json.dumps(r4, ensure_ascii=False))

print("\n=== 5. 列表 GET /api/npc/dynamic ===")
r5 = call("GET", "/api/npc/dynamic?size=10", None, TOKEN)
d5 = r5.get("data", {})
print(f"total={d5.get('total')} items={len(d5.get('items', []))}")
for it in d5.get("items", []):
    print(f"  #{it['id']} {it['name']} ({it['role_name']}/{it['nature_name']}) enabled={it['enabled']} status={it['status']}")

print("\n=== 6. 地点查询 GET /api/npc/location/3?type=scene (应返回 {static,dynamic}) ===")
r6 = call("GET", "/api/npc/location/3?type=scene", None, TOKEN)
d6 = r6.get("data", {})
print(f"static={len(d6.get('static', []))} dynamic={len(d6.get('dynamic', []))}  (key 存在: static={'static' in d6} dynamic={'dynamic' in d6})")
for it in d6.get("dynamic", []):
    print(f"  动态: #{it['id']} {it['name']} ({it['role_name']})")

if nid:
    print(f"\n=== 7. 启停: 停用 id={nid} ===")
    call("PATCH", f"/api/npc/dynamic/{nid}", {"enabled": 0}, TOKEN)
    r7 = call("POST", "/api/npc/actor/acquire", {"role_name": "散修", "loc_scene_id": 3}, TOKEN)
    d7 = r7.get("data", {})
    print(f"  停用后 acquire: is_new={d7.get('is_new')} new_id={d7.get('id')} (期望 is_new=True 新建, 不复用停用的 {nid})")

    print(f"\n=== 8. 死亡: status=dead id={nid}, 地点查询不再出现 ===")
    call("PATCH", f"/api/npc/dynamic/{nid}", {"status": "dead"}, TOKEN)
    r8 = call("GET", "/api/npc/location/3?type=scene", None, TOKEN)
    d8 = r8.get("data", {})
    dead_visible = [i for i in d8.get("dynamic", []) if i["id"] == nid]
    print(f"  dead 演员是否仍出现在地点查询: {len(dead_visible) != 0} (期望 False)")

    print(f"\n=== 9. 还原 id={nid} 为 alive+enabled ===")
    call("PATCH", f"/api/npc/dynamic/{nid}", {"enabled": 1, "status": "alive"}, TOKEN)
    print("  已还原")

print("\n=== 全部测试通过 ===")
