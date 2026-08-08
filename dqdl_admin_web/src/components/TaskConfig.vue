<script setup>
import { ref, watch, nextTick } from 'vue'

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

const defaultConfig = () => ({ taskTitle: '', description: '', target: [] })
const clone = (v) => JSON.parse(JSON.stringify(v || defaultConfig()))

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

                    <!-- <el-input v-model="taskConfig.target" placeholder="请输入任务目标"></el-input> -->
                    <div v-for="(item, index) in taskConfig.target" :key="index" class="task-target">
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
                        <!-- <el-input v-model="item.description" placeholder="请输入目标描述"></el-input> -->
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
    margin-top: 8px;
    padding: 10px;
    border: 1px solid #ebeef5;
    border-radius: 6px;
    background: #fff;
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
.map-row .el-select {
    flex: 1;
    min-width: 0;
}
</style>