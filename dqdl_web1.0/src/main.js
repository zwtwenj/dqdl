import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { vTooltip } from './directives/tooltip'
import './styles/main.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.directive('tooltip', vTooltip)   // 全局注册 v-tooltip 指令
app.mount('#app')
