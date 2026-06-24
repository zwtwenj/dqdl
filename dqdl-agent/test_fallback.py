"""Agent 降级/校验纯函数的契约测试（行为冻结）。

阶段 3 会把 app.py 拆成 Blueprint，这些纯函数会被搬运到 prompts/ 与 services/，
其输入/输出契约必须 1:1 保持。所有用例不依赖 DeepSeek / RAG / 网络。
"""
import random
import pytest

import app as agent


# ─────────────── _parse_json_object ───────────────
class TestParseJsonObject:
    def test_plain_object(self):
        assert agent._parse_json_object('{"a": 1}') == {'a': 1}

    def test_fenced_json_block(self):
        content = '```json\n{"b": 2}\n```'
        assert agent._parse_json_object(content) == {'b': 2}

    def test_fenced_plain_block(self):
        content = '```\n{"b": 9}\n```'
        assert agent._parse_json_object(content) == {'b': 9}

    def test_object_embedded_in_text(self):
        content = '前缀文字 {"c": 3} 后缀'
        assert agent._parse_json_object(content) == {'c': 3}

    def test_array_raises_value_error(self):
        with pytest.raises(ValueError):
            agent._parse_json_object('[1, 2, 3]')


# ─────────────── _normalize_dungeon ───────────────
class TestNormalizeDungeon:
    def _full(self):
        return {
            'title': '秘境', 'intro': 'intro',
            'acts': [
                {'index': 1, 'type': 'combat', 'title': 't1', 'narrative': 'n1'},
                {'index': 2, 'type': 'sneak', 'title': 't2', 'narrative': 'n2'},
                {'index': 3, 'type': 'explore', 'title': 't3', 'narrative': 'n3'},
                {'index': 4, 'type': 'item', 'title': 't4', 'narrative': 'n4'},
                {'index': 5, 'type': 'combat', 'title': 't5', 'narrative': 'n5'},
            ],
        }

    def test_full_blueprint_keeps_structure(self):
        r = agent._normalize_dungeon(self._full(), '山洞')
        assert r['title'] == '秘境'
        assert r['scene_type'] == '山洞'
        assert [a['index'] for a in r['acts']] == [1, 2, 3, 4, 5]
        assert r['acts'][4]['type'] == 'boss'  # 第五幕强制 boss

    def test_too_few_acts_raises(self):
        with pytest.raises(ValueError):
            agent._normalize_dungeon({'acts': [{'type': 'combat'}]}, '山洞')

    def test_missing_acts_field_raises(self):
        with pytest.raises(ValueError):
            agent._normalize_dungeon({}, '山洞')

    def test_invalid_type_falls_back_to_combat(self):
        bp = {'acts': [{'type': 'BOGUS'}, {'type': 'x'}, {'type': 'y'}, {'type': 'z'}, {'type': 'w'}]}
        r = agent._normalize_dungeon(bp, '密林')
        assert [a['type'] for a in r['acts']] == ['combat', 'combat', 'combat', 'combat', 'boss']

    def test_missing_fields_get_defaults(self):
        r = agent._normalize_dungeon({'acts': [{}, {}, {}, {}, {}]}, '山谷')
        assert r['acts'][0]['title'] == '第1幕'
        assert r['acts'][4]['type'] == 'boss'


# ─────────────── _fallback_dungeon ───────────────
class TestFallbackDungeon:
    @pytest.mark.parametrize('st', ['山洞', '密林', '山谷', '浅滩'])
    def test_known_scene_types(self, st):
        r = agent._fallback_dungeon(st)
        assert r['scene_type'] == st
        assert r['title']
        assert len(r['acts']) == 5
        assert [a['index'] for a in r['acts']] == [1, 2, 3, 4, 5]
        assert r['acts'][0]['type'] == 'sneak'
        assert r['acts'][4]['type'] == 'boss'

    def test_known_scene_type_has_fixed_title(self):
        assert agent._fallback_dungeon('山洞')['title'] == '幽冥石洞'
        assert agent._fallback_dungeon('密林')['title'] == '迷雾密林'

    def test_unknown_scene_type_uses_default(self):
        r = agent._fallback_dungeon('虚空')
        assert r['title'] == '虚空秘境'
        assert r['intro'] == '你进入了一处虚空。'


# ─────────────── fallback_generate (地图降级) ───────────────
class TestFallbackGenerate:
    def test_depth_lt3_uses_city_pool(self):
        random.seed(42)
        r = agent.fallback_generate({'depth': 2, 'name': '某帝国'}, 3)
        cities = ['云岚城', '黑岩城', '赤焰城', '碧水城', '风雷城', '天星城', '落雁城', '紫月城']
        assert len(r) == 3
        assert [x['name'] for x in r] == cities[:3]
        assert all(x['loc_type'] == 'city' for x in r)
        for x in r:
            assert 1 <= x['danger_level'] <= 5
            assert x['available_actions'] == ['explore']
            assert x['tags'] == ['生成']

    def test_depth_ge3_uses_district_pool(self):
        random.seed(1)
        r = agent.fallback_generate({'depth': 3, 'name': '某城'}, 4)
        assert all(x['loc_type'] == 'district' for x in r)
        assert len(r) == 4

    def test_count_capped_at_pool_size(self):
        r = agent.fallback_generate({'depth': 0}, 100)
        assert len(r) == 8  # city pool 大小


# ─────────────── ensure_city_districts ───────────────
class TestEnsureCityDistricts:
    def test_mandatory_districts_appended_and_original_kept(self):
        random.seed(0)  # 固定拍卖行 50% 判定
        out = agent.ensure_city_districts([{'name': '已有区域'}], {'name': '某城'})
        names = [x['name'] for x in out]
        assert out[0]['name'] == '已有区域'  # 原数据保留
        assert '坊市' in names
        assert '佣兵公会' in names
        # 必选/可选项均为 district 类型（原数据不被改写）
        for x in out:
            if x['name'] in ('坊市', '佣兵公会', '拍卖行'):
                assert x['loc_type'] == 'district'

    def test_does_not_duplicate_existing_mandatory(self):
        random.seed(0)
        out = agent.ensure_city_districts([{'name': '坊市'}], {'name': '某城'})
        assert [x['name'] for x in out].count('坊市') == 1
