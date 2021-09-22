import View from './components/view'
import Link from './components/link'

export let _Vue

export function install (Vue) {
  if (install.installed && _Vue === Vue) return
  install.installed = true

  _Vue = Vue

  const isDef = v => v !== undefined

  //注册组件实例
  //当组件初始化后, 进入beforeCreate钩子, 才会有组件实例
  const registerInstance = (vm, callVal) => {
    //i为router-view组件占位符vnode
    let i = vm.$options._parentVnode
    //执行router-view中的registerRouteInstance
    if (isDef(i) && isDef(i = i.data) && isDef(i = i.registerRouteInstance)) {
      i(vm, callVal)
    }
  }

  Vue.mixin({
    beforeCreate () {
      //根组件
      if (isDef(this.$options.router)) {
        this._routerRoot = this
        this._router = this.$options.router
        //初始化
        this._router.init(this)
        //
        Vue.util.defineReactive(this, '_route', this._router.history.current)
      } else {
        //非根组件从父组件获取
        this._routerRoot = (this.$parent && this.$parent._routerRoot) || this
      }
      //
      registerInstance(this, this)
    },
    destroyed () {
      registerInstance(this)
    }
  })
  //代理
  Object.defineProperty(Vue.prototype, '$router', {
    get () { return this._routerRoot._router }
  })

  Object.defineProperty(Vue.prototype, '$route', {
    get () { return this._routerRoot._route }
  })
  //router-link和router-view
  Vue.component('RouterView', View)
  Vue.component('RouterLink', Link)
  //合并策略
  const strats = Vue.config.optionMergeStrategies
  // use the same hook merging strategy for route hooks
  strats.beforeRouteEnter = strats.beforeRouteLeave = strats.beforeRouteUpdate = strats.created
}
