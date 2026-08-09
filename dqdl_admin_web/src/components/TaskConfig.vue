<script setup>
import { ref, watch, nextTick } from 'vue'
import { ElMessageBox } from 'element-plus'
import { Close } from '@element-plus/icons-vue'

/**
 * 发布任务配置组件。
 * 通过 v-model 与父组件双向绑定：父组件持有配置（可预填已保存的值），
 * 组件内部编辑后经 update:modelValue 抛回父组件，父组件有值时同样可正常编辑。
 */
const props = defineProps({
    /** 任务配置对象；null/undefined 时使用默认空配置 */
    modelValue: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue'])

const targetOptions = [
    // { text: '击败敌人', value: 'defeat_enemy' },
    // { text: '收集物品', value: 'collect_item' },
    { text: '前往某地', value: 'go_to_location' },
    { text: '前往某地击败怪物', value: 'go_to_location_defeat_mob' },
]
const rewardOptions = [
    { text: '金币', value: 'money' },
    { text: '物品', value: 'item' },
]

const defaultConfig = () => ({ taskTitle: '', description: '', target: [], reward: [] })
// 兼容旧结构：父值可能是早期保存的配置（缺 reward/target 字段），逐字段兜底补默认值
const clone = (v) => {
    const src = v && typeof v === 'object' ? v : {}
    return {
        taskTitle: src.taskTitle ?? '',
        description: src.description ?? '',
        target: Array.isArray(src.target) ? src.target : [],
        reward: Array.isArray(src.reward) ? src.reward : [],
    }
}

// 本地表单副本：父值同步进来 → 本地；本地编辑 → 抛回父组件
const taskConfig = ref(clone(props.modelValue))

let syncing = false
// 父组件值变化（切换连线 / 回填已保存配置）→ 同步进本地
watch(
    () => props.modelValue,
    (val) => {
        syncing = true
        taskConfig.value = clone(val)
        nextTick(() => {
            syncing = false
        })
    },
    { deep: true }
)

// 本地编辑 → 抛回父组件（syncing 期间不抛，避免与上方同步互踩成环）
watch(
    taskConfig,
    (val) => {
        if (!syncing) emit('update:modelValue', clone(val))
    },
    { deep: true }
)

const addTarget = () => {
    taskConfig.value.target.push({
        type: '',
        value: {}
    })
}
const changeTargetType = (value, target) => {
    // 根据选择的目标类型，初始化对应的 value 对象
    if (value === 'go_to_location_defeat_mob') {
        target.type = 'go_to_location_defeat_mob'
        target.value = {
            location: {
                distance: '',
                loc_type: '',
                mob_count: 0
            }
        }
    } else if (value === 'go_to_location') {
        // 前往某地：只需地图配置
        target.type = 'go_to_location'
        target.value = {
            location: {
                distance: '',
                loc_type: ''
            }
        }
    }
}

const addReward = () => {
    // 空奖励项：type 由用户选择后 changeRewardType 初始化对应字段
    taskConfig.value.reward.push({ type: '' })
}
const changeRewardType = (value, reward) => {
    // 根据选择的奖励类型，初始化对应的数据结构（扁平，对齐后端 TaskReward）
    if (value === 'money') {
        reward.type = 'money'
        reward.value = 0            // 金币数量
        delete reward.item_id
        delete reward.item_name
        delete reward.count
    } else if (value === 'item') {
        reward.type = 'item'
        reward.item_id = ''         // item 表全局唯一 ID（手输，保存时校验存在性）
        reward.item_name = ''       // 保存时后端自动回填物品名
        reward.count = 1
        delete reward.value
    }
}

/** 删除目标条目（右上角 ×，二次确认） */
const removeTarget = (index) => {
    const item = taskConfig.value.target[index]
    const label = item?.type ? targetOptions.find((o) => o.value === item.type)?.text : ''
    ElMessageBox.confirm(
        `确定删除该任务目标${label ? `（${label}）` : ''}吗？`,
        '删除确认',
        { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
        .then(() => {
            taskConfig.value.target.splice(index, 1)
        })
        .catch(() => {})
}

/** 删除奖励条目（右上角 ×，二次确认） */
const removeReward = (index) => {
    const item = taskConfig.value.reward[index]
    const label = item?.type ? rewardOptions.find((o) => o.value === item.type)?.text : ''
    ElMessageBox.confirm(
        `确定删除该任务奖励${label ? `（${label}）` : ''}吗？`,
        '删除确认',
        { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
        .then(() => {
            taskConfig.value.reward.splice(index, 1)
        })
        .catch(() => {})
}
</script>

<template>
    <div class="task-config">
        <el-form>
            <el-form-item label="任务标题：">
                <el-input v-model="taskConfig.taskTitle" placeholder="请输入任务标题"></el-input>
            </el-form-item>
            <el-form-item label="任务描述：">
                <el-input type="textarea" v-model="taskConfig.description" placeholder="请输入任务描述"></el-input>
            </el-form-item>
            <el-form-item label="任务目标：">
                <div style="width: 100%;">
                    <el-button class="add-target-btn" @click="addTarget">＋ 添加目标</el-button>
                    <div v-for="(item, index) in taskConfig.target" :key="index" class="task-target">
                        <el-icon class="item-close" title="删除该目标" @click="removeTarget(index)"><Close /></el-icon>
                        <el-select v-model="item.type" placeholder="请选择目标类型" @change="(value) => changeTargetType(value, item)">
                            <el-option v-for="option in targetOptions" :key="option.value" :label="option.text" :value="option.value"></el-option>
                        </el-select>
                        <div v-if="item.type === 'go_to_location_defeat_mob'" class="task-map-config">
                            <div class="map-title">地图配置</div>
                            <div class="map-row">
                                <span class="map-label">玩家距离</span>
                                <el-input v-model="item.value.location.distance" placeholder="请输入距离"></el-input>
                            </div>
                            <div class="map-row">
                                <span class="map-label">地图类型</span>
                                <el-select v-model="item.value.location.loc_type" placeholder="请选择地图类型">
                                    <el-option v-for="option in ['city', 'wild', 'sect']" :key="option" :label="option" :value="option"></el-option>
                                </el-select>
                            </div>
                            <div class="map-row">
                                <span class="map-label">怪物数量</span>
                                <el-input v-model="item.value.location.mob_count" placeholder="请输入怪物数量"></el-input>
                            </div>
                        </div>
                        <div v-if="item.type === 'go_to_location'" class="task-map-config">
                            <div class="map-title">地图配置</div>
                            <div class="map-row">
                                <span class="map-label">玩家距离</span>
                                <el-input v-model="item.value.location.distance" placeholder="请输入距离"></el-input>
                            </div>
                            <div class="map-row">
                                <span class="map-label">地图类型</span>
                                <el-select v-model="item.value.location.loc_type" placeholder="请选择地图类型">
                                    <el-option v-for="option in ['city', 'wild', 'sect']" :key="option" :label="option" :value="option"></el-option>
                                </el-select>
                            </div>
                        </div>
                    </div>
                </div>
            </el-form-item>
            <el-form-item label="任务奖励：">
                <div style="width: 100%;">
                    <el-button class="add-target-btn" @click="addReward">＋ 添加奖励</el-button>
                    <div v-for="(reward, index) in taskConfig.reward" :key="index" class="task-reward-item">
                        <el-icon class="item-close" title="删除该奖励" @click="removeReward(index)"><Close /></el-icon>
                        <el-select v-model="reward.type" placeholder="请选择奖励类型" @change="(value) => changeRewardType(value, reward)">
                            <el-option v-for="option in rewardOptions" :key="option.value" :label="option.text" :value="option.value"></el-option>
                        </el-select>
                        <!-- 金币：数量 -->
                        <div v-if="reward.type === 'money'" class="task-reward-config">
                            <div class="reward-title">金币奖励</div>
                            <div class="map-row">
                                <span class="map-label">金币数量</span>
                                <el-input-number v-model="reward.value" :min="0" controls-position="right" placeholder="请输入金币" />
                            </div>
                        </div>
                        <!-- 物品：item 表 ID（手输）+ 数量 -->
                        <div v-if="reward.type === 'item'" class="task-reward-config">
                            <div class="reward-title">物品奖励</div>
                            <div class="map-row">
                                <span class="map-label">物品ID</span>
                                <el-input v-model="reward.item_id" placeholder="请输入物品ID（item表）" />
                            </div>
                            <div v-if="reward.item_name" class="reward-hint">物品：{{ reward.item_name }}</div>
                            <div class="map-row">
                                <span class="map-label">物品数量</span>
                                <el-input-number v-model="reward.count" :min="1" controls-position="right" placeholder="请输入数量" />
                            </div>
                        </div>
                    </div>
                </div>
            </el-form-item>
        </el-form>
    </div>
</template>

<style scoped>
/* ===== 发布任务配置面板 ===== */
.task-config {
    margin-top: 10px;
    padding: 10px 12px 4px;
    border: 1px solid #e4e7ed;
    border-radius: 6px;
    background: #f8f9fb;
}

.task-config :deep(.el-form-item) {
    margin-bottom: 10px;
}

.task-config :deep(.el-form-item__label) {
    font-size: 13px;
    color: #606266;
    line-height: 32px;
}

/* 添加目标：整行虚线按钮 */
.add-target-btn {
    width: 100%;
    border-style: dashed;
    border-color: #c0c4cc;
    color: #606266;
}

/* 单个目标条目 */
.task-target {
    position: relative;
    margin-top: 8px;
    padding: 10px;
    border: 1px solid #ebeef5;
    border-radius: 6px;
    background: #fff;
}

/* 条目右上角关闭（删除）按钮 */
.item-close {
    position: absolute;
    top: 6px;
    right: 6px;
    z-index: 1;
    cursor: pointer;
    color: #c0c4cc;
    font-size: 14px;
    transition: color 0.15s;
}

.item-close:hover {
    color: #f56c6c;
}

.task-target .el-select {
    width: 100%;
}

/* 地图配置子面板 */
.task-map-config {
    margin-top: 8px;
    padding: 8px 10px;
    border-left: 3px solid #409eff;
    border-radius: 4px;
    background: #f0f6ff;
}

.map-title {
    font-size: 12px;
    font-weight: 600;
    color: #409eff;
    margin-bottom: 4px;
}

.map-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 6px 0;
}

.map-label {
    flex-shrink: 0;
    min-width: 56px;
    font-size: 12px;
    color: #606266;
}

.map-row .el-input,
.map-row .el-select,
.map-row .el-input-number {
    flex: 1;
    min-width: 0;
}

/* ===== 奖励条目（金色调，与目标蓝色区分） ===== */
.task-reward-item {
    position: relative;
    margin-top: 8px;
    padding: 10px;
    border: 1px solid #ebeef5;
    border-radius: 6px;
    background: #fff;
}

.task-reward-item .el-select {
    width: 100%;
}

.task-reward-config {
    margin-top: 8px;
    padding: 8px 10px;
    border-left: 3px solid #e6a23c;
    border-radius: 4px;
    background: #fdf6ec;
}

.reward-title {
    font-size: 12px;
    font-weight: 600;
    color: #e6a23c;
    margin-bottom: 4px;
}

.reward-hint {
    font-size: 12px;
    color: #e6a23c;
    margin: 2px 0;
}
</style>