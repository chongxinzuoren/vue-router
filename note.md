#### 
- 路由配置项(RouteConfig):new Router时定义的
- 路由记录(RouteRecord): 基于路由配置项, 扩展了一些额外属性, 如当前路由组件实例, 匹配当前路由的正则, 父路由对下个你
- $route: 基于跳转时的url(如 router.push("/login") 就基于 "/login", 或者location对象), 扩展了一些额外属性

1. 当调用 Vue.use(Router) 时，会给全局的 beforeCreate，destroyed 混入2个钩子，使得在组件初始化时能够通过 this.$router / this.$route 访问到根实例的 router / route 对象，同时还定义了全局组件 router-view / router-link
2. 在实例化 vue-router 时，通过 createRouteMap 创建3个路由映射表，保存了所有路由的记录，另外创建了 match 函数用来创建 $route 对象，addRoutes 函数用来动态生成路由，这2个函数都是需要依赖路由映射表生成的
3. vue-router 还给开发者提供了3种不同的路由模式，每个模式下的跳转逻辑都有所差异


1. 当 vue 的根实例被实例化时，会执行 vue-router 的初始化逻辑, 建立 vue-router 和 Vue 组件之间的关系
2. 当初始化时会进行第一次路由跳转，根据跳转路径生成 location 对象，再通过 location 对象生成 $route
3. $route 对象的 matched 属性保存了当前和所有父级的路由记录，在路由跳转时会根据跳转前后 $route 对象的这2个 matched 属性，区分出相同和不同的路由记录，来决定哪些组件触发哪些路由守卫
4. vue-router 通过回调的形式异步的执行路由守卫，当前一个解析完毕后会调用回调继续执行下个守卫
5. 只有懒加载的路由都加载完成后，才会执行上述的回调，继续执行下个守卫，否则会一直等待




1. 当异步组件解析成功后，会执行 beforeRouteEnter 守卫
2. 通过 Vue 的 defineReactive 方法，当 $route 被赋值时就会触发 router-view 组件的重新渲染，达到更新视图的功能
3. 通过 Vue 核心库的 defineReactive 方法，当 $route 被赋值时就会触发 router-view 组件的重新渲染，达到更新视图的功能
4. vue-router 通过监听浏览器的 popState 或者 hashChange 使得点击前进后退也能更新视图


#### 路由守卫
- to, from, next
- 前两个是跳转后和跳转前的$route对象
- 执行 next 函数后会进行跳转, 如果包含 next 参数的路由守卫里没有执行该函数，页面会无法跳转


