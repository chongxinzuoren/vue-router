/* @flow */

import { _Vue } from '../install'
import type Router from '../index'
import { inBrowser } from '../util/dom'
import { runQueue } from '../util/async'
import { warn, isError } from '../util/warn'
import { START, isSameRoute } from '../util/route'
import {
  flatten,
  flatMapComponents,
  resolveAsyncComponents
} from '../util/resolve-components'

export class History {
  router: Router;
  base: string;
  current: Route;
  pending: ?Route;
  cb: (r: Route) => void;
  ready: boolean;
  readyCbs: Array<Function>;
  readyErrorCbs: Array<Function>;
  errorCbs: Array<Function>;

  // implemented by sub-classes
  +go: (n: number) => void;
  +push: (loc: RawLocation) => void;
  +replace: (loc: RawLocation) => void;
  +ensureURL: (push?: boolean) => void;
  +getCurrentLocation: () => string;

  constructor (router: Router, base: ?string) {
    this.router = router
    this.base = normalizeBase(base)
    // start with a route object that stands for "nowhere"
    //当前路由的$route对象
    this.current = START
    this.pending = null
    this.ready = false
    this.readyCbs = []
    this.readyErrorCbs = []
    this.errorCbs = []
  }

  listen (cb: Function) {
    this.cb = cb
  }

  onReady (cb: Function, errorCb: ?Function) {
    if (this.ready) {
      cb()
    } else {
      this.readyCbs.push(cb)
      if (errorCb) {
        this.readyErrorCbs.push(errorCb)
      }
    }
  }

  onError (errorCb: Function) {
    this.errorCbs.push(errorCb)
  }
  //location: 跳转的路由信息
  //onComplete: 成功回调
  transitionTo (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    // this是history路由实例（HashHistory | HTML5History）
    // this.router是vueRouter实例
    // match方法会根据当前的location + 路由映射表（nameMap,pathMap），生成$route对象（src/create-matcher.js:31）
    // current是切换前的$route对象
    const route = this.router.match(location, this.current)
    // 触发路由钩子
    this.confirmTransition(route,/* 封装的成功回调 */ () => {
      //确认导航成功, 更新视图以及执行afterEach钩子
      this.updateRoute(route)
      //执行成功的回调
      onComplete && onComplete(route)
      this.ensureURL()

      // fire ready cbs once
      if (!this.ready) {
        this.ready = true
        this.readyCbs.forEach(cb => { cb(route) })
      }
    }, err => {
      if (onAbort) {
        onAbort(err)
      }
      if (err && !this.ready) {
        this.ready = true
        this.readyErrorCbs.forEach(cb => { cb(err) })
      }
    })
  }
  // 执行路由钩子
  confirmTransition (route: Route, onComplete: Function, onAbort?: Function) {
    const current = this.current
    const abort = err => {
      if (isError(err)) {
        if (this.errorCbs.length) {
          this.errorCbs.forEach(cb => { cb(err) })
        } else {
          warn(false, 'uncaught error during route navigation:')
          console.error(err)
        }
      }
      onAbort && onAbort(err)
    }
    //跳转前后路径相同, 取消跳转
    if (
      isSameRoute(route, current) &&
      // in the case the route map has been dynamically appended to
      route.matched.length === current.matched.length
    ) {
      this.ensureURL()
      return abort()
    }
    //通过跳转前后$route对象上的matched数组, 返回两个数组包含路由的区别
    //跳转时哪些组件触发哪些路由守卫就是这三个数组决定的
    //新增的组件触发 beforeRouteEnter 之类的进入守卫
    //相同部分触发 beforeRouteUpdate 守卫
    //删除部分触发 beforeRouteLeave 之类的离开守卫
    const {
      updated,//跳转前matched相同records
      deactivated,//删除部分records
      activated//新增部分records
    } = resolveQueue(this.current.matched, route.matched)

    //queue路由守卫组成的数组
    //NavigationGuard路由守卫的函数
    //导航完整解析流程https://p1-jj.byteimg.com/tos-cn-i-t2oaga2asx/gold-user-assets/2019/5/26/16af48f8dab298c1~tplv-t2oaga2asx-watermark.awebp
    const queue: Array<?NavigationGuard> = [].concat(
      // in-component leave guards
      //离开组件的beforeRouteLeave钩子函数(子->父)
      extractLeaveGuards(deactivated),
      // global before hooks
      //全局的beforeEach钩子函数
      this.router.beforeHooks,
      // in-component update hooks
      //当前组建的beforeUpdate钩子函数(父->子)
      extractUpdateHooks(updated),
      // in-config enter guards
      //返回当前组件的beforeEnter钩子函数(数组)
      activated.map(m => m.beforeEnter),
      // async components
      //解析异步组件
      resolveAsyncComponents(activated)
    )

    this.pending = route
    //即为runQueue的第二个参数fn
    //next为fn的第二个参数()=>step(index + 1)
    //路由守卫没有执行next方法, 也就不会
    const iterator = (hook: NavigationGuard, next) => {
      if (this.pending !== route) {
        return abort()
      }
      try {
        //执行某个导航守卫(to, from, next)
        hook(route, current, /*导航守卫第三个参数传入的next({...})*/(to: any) => {
          if (to === false || isError(to)) {
            // next(false) -> abort navigation, ensure current URL
            // 取消导航, 重置到from的路由
            this.ensureURL(true)
            abort(to)
          } else if (
            typeof to === 'string' ||
            (typeof to === 'object' && (
              typeof to.path === 'string' ||
              typeof to.name === 'string'
            ))
          ) {
            // next('/') or next({ path: '/' }) -> redirect
            // 在路由守卫中调用next方法, 并传入指定路径
            //取消原来的导航
            abort()
            //跳转到指定页面
            if (typeof to === 'object' && to.replace) {
              this.replace(to)
            } else {
              this.push(to)
            }
          } else {
            // confirm transition and pass on the value
            //执行next方法 不传参数
            //解析下一个queue
            next(to)
          }
        })
      } catch (e) {
        abort(e)
      }
    }
    //为什么不直接forEach,而使用runQueue
    //forEach是同步的, runQueue支持异步,vue-router 中可能存在异步路由 
    //queue都执行完毕, 会执行 第三个参数回调
    /*
    beforeRouteEnter(to,from,next){
      next(vm=>{vm代替this })
    }
    */
    runQueue(queue, iterator, () => {
      //存储beforeRouteEnter守卫中, 通过next方法传入的回调参数
      const postEnterCbs = []
      const isValid = () => this.current === route
      // wait until async components are resolved before
      // extracting in-component enter guards
      //给beforeRouteEnter回调包裹poll指定参数
      const enterGuards = extractEnterGuards(activated, postEnterCbs, isValid)
      //beforeRouteEnter和beforeResolve合并
      const queue = enterGuards.concat(this.router.resolveHooks)
      runQueue(queue, iterator, () => {
        if (this.pending !== route) {
          return abort()
        }
        this.pending = null
        //确认导航
        onComplete(route)
        if (this.router.app) {
          /*
          为什么只有 beforeRouteEnter 守卫获得组件实例时，需要定义一个回调并传入 next 函数中的原因?
          守卫的执行是同步的, 只有在nextTick后才能获得组件的实例
          vue-router通过回调的形式, 将回调的触发时机放在视图更新之后
          */
          //将beforeRouteEnter的回调放在nextTick后执行
          this.router.app.$nextTick(() => {
            postEnterCbs.forEach(cb => { cb() })
          })
        }
      })
    })
  }

  updateRoute (route: Route) {
    //更新前的$route
    const prev = this.current
    //更新后的$route
    this.current = route
    //hook.listen传入的回调,更新视图
    this.cb && this.cb(route)
    //遍历afterHooks执行afterEach钩子
    this.router.afterHooks.forEach(hook => {
      hook && hook(route, prev)
    })
  }
}

function normalizeBase (base: ?string): string {
  if (!base) {
    if (inBrowser) {
      // respect <base> tag
      const baseEl = document.querySelector('base')
      base = (baseEl && baseEl.getAttribute('href')) || '/'
      // strip full URL origin
      base = base.replace(/^https?:\/\/[^\/]+/, '')
    } else {
      base = '/'
    }
  }
  // make sure there's the starting slash
  if (base.charAt(0) !== '/') {
    base = '/' + base
  }
  // remove trailing slash
  return base.replace(/\/$/, '')
}

function resolveQueue (
  current: Array<RouteRecord>,
  next: Array<RouteRecord>
): {
  updated: Array<RouteRecord>,
  activated: Array<RouteRecord>,
  deactivated: Array<RouteRecord>
} {
  let i
  const max = Math.max(current.length, next.length)
  for (i = 0; i < max; i++) {
    if (current[i] !== next[i]) {
      break
    }
  }
  return {
    updated: next.slice(0, i),//相同的match
    activated: next.slice(i),//新增的match
    deactivated: current.slice(i)//删除match
  }
}
//根据records数组, 返回当前这个组件对用的路由守卫
function extractGuards (
  records: Array<RouteRecord>,
  name: string,
  bind: Function,
  reverse?: boolean
): Array<?Function> {
  const guards = flatMapComponents(records, (def, instance, match, key) => {
    const guard = extractGuard(def, name)
    if (guard) {
      return Array.isArray(guard)
        //绑定上下文this, 传入当前路由守卫函数, 实例, match, record和视图名字
        ? guard.map(guard => bind(guard, instance, match, key))
        : bind(guard, instance, match, key)
    }
  })
  //扁平化
  //倒叙数组, 之前是父-->子, reverse:true 就是 子-->父
  //离开某个路由时, 由于子路由需要先离开所以倒叙数组, 让子组件先触发beforeLeave钩子
  return flatten(reverse ? guards.reverse() : guards)
}

function extractGuard (
  def: Object | Function,//组件配置项
  key: string
): NavigationGuard | Array<NavigationGuard> {
  if (typeof def !== 'function') {
    // extend now so that global mixins are applied.
    // Vue.extend--> 组件构造器
    def = _Vue.extend(def)
  }
  // 返回Vue.options 中的路由守卫函数
  return def.options[key]
}

function extractLeaveGuards (deactivated: Array<RouteRecord>): Array<?Function> {
  return extractGuards(deactivated, 'beforeRouteLeave', bindGuard, true)
}

function extractUpdateHooks (updated: Array<RouteRecord>): Array<?Function> {
  return extractGuards(updated, 'beforeRouteUpdate', bindGuard)
}

function bindGuard (guard: NavigationGuard, instance: ?_Vue): ?NavigationGuard {
  if (instance) {
    return function boundRouteGuard () {
      return guard.apply(instance, arguments)
    }
  }
}

function extractEnterGuards (
  activated: Array<RouteRecord>,
  cbs: Array<Function>,//beforeRouterEnter的next传入的回调
  isValid: () => boolean
): Array<?Function> {
  return extractGuards(activated, 'beforeRouteEnter', (guard, _, match, key) => {
    return bindEnterGuard(guard, match, key, cbs, isValid)
  })
}

function bindEnterGuard (
  guard: NavigationGuard,
  match: RouteRecord,
  key: string,
  cbs: Array<Function>,
  isValid: () => boolean
): NavigationGuard {
  return function routeEnterGuard (to, from, next) {
    return guard(to, from, cb => {
      next(cb)
      if (typeof cb === 'function') {
        cbs.push(() => {
          // #750
          // if a router-view is wrapped with an out-in transition,
          // the instance may not have been registered at this time.
          // we will need to poll for registration until current route
          // is no longer valid.
          poll(cb, match.instances, key, isValid)
        })
      }
    })
  }
}

function poll (
  cb: any, // somehow flow cannot infer this is a function
  instances: Object,
  key: string,
  isValid: () => boolean
) {
  if (
    instances[key] &&
    !instances[key]._isBeingDestroyed // do not reuse being destroyed instance
  ) {
    //回调的参数为组件实例
    cb(instances[key])
  } else if (isValid()) {
    setTimeout(() => {
      poll(cb, instances, key, isValid)
    }, 16)
  }
}
