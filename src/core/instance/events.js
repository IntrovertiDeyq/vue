/* @flow */

import {
  tip,
  toArray,
  hyphenate,
  formatComponentName,
  invokeWithErrorHandling
} from '../util/index'
import { updateListeners } from '../vdom/helpers/index'

//实例化阶段的初始化事件，实际上是将父组件在模板中注册的事件添加到子组件的事件系统中
//在渲染阶段生成vnode进行对比渲染创建元素时，会判断标签为组件标签或者是普通标签
//组件标签则实例化子组件并传递相关参数，平台标签则注册浏览器事件
//子组件自身在模板中注册的事件，只要在渲染的时候才会根据虚拟DOM的对比结果判断是注册事件还是解绑事件
export function initEvents (vm: Component) {
  vm._events = Object.create(null)
  vm._hasHookEvent = false
  // init parent attached events
  //模板编译时解析到组件标签时会实例化子组件，并且将标签中的事件解析成Object通过参数传递给子组件
  //子组件被实例化时可以在参数中获取父组件传递的参数
  const listeners = vm.$options._parentListeners
  if (listeners) {
    updateComponentListeners(vm, listeners)
  }
}

let target: any

//新增事件
function add (event, fn) {
  target.$on(event, fn)
}

//删除事件
function remove (event, fn) {
  target.$off(event, fn)
}

//创建只执行一次的函数
function createOnceHandler (event, fn) {
  const _target = target
  return function onceHandler () {
    const res = fn.apply(null, arguments)
    if (res !== null) {
      _target.$off(event, onceHandler)
    }
  }
}

//将父组件向子组件注册的事件注册到子组件实例中
export function updateComponentListeners (
  vm: Component,
  listeners: Object,
  oldListeners: ?Object
) {
  target = vm
  updateListeners(listeners, oldListeners || {}, add, remove, createOnceHandler, vm)
  target = undefined
}

export function eventsMixin (Vue: Class<Component>) {
  const hookRE = /^hook:/
  //监听实例上的自定义事件，回调函数接收所有传入事件所触发的函数的额外参数
  //event可以传入String或者数组
  //on的作用就是在注册的时候收集事件的回调函数
  Vue.prototype.$on = function (event: string | Array<string>, fn: Function): Component {
    const vm: Component = this
    if (Array.isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$on(event[i], fn)
      }
    } else {
      //判断事件名对应的事件列表是否已经存在，存在则收集回调函数(不会判断回调函数是否重复，所以会出现一个事件触发多个相同函数的情况)
      //不存在则初始化该事件名对应的事件列表为空数组
      (vm._events[event] || (vm._events[event] = [])).push(fn)
      // optimize hook:event cost by using a boolean flag marked at registration
      // instead of a hash lookup
      if (hookRE.test(event)) {
        vm._hasHookEvent = true
      }
    }
    return vm
  }
  //监听一个事件只触发一次，在触发完成后删除监听器
  Vue.prototype.$once = function (event: string, fn: Function): Component {
    const vm: Component = this
    function on () {
      vm.$off(event, on)
      fn.apply(vm, arguments)
    }
    //移除监听器时需要将用户提供的回调函数和列表中的监听器函数作对比，相同才会移除
    //但是我们封装的on函数拦截器添加到事件列表时会导致移除操作失败
    //解决方案就是将用户提供的原始监听器保存到on函数拦截器的fn属性中
    on.fn = fn
    vm.$on(event, on)
    return vm
  }

  //event可以传入Sting或者Array
  Vue.prototype.$off = function (event?: string | Array<string>, fn?: Function): Component {
    const vm: Component = this
    // all
    //没有提供参数则移除所有的事件监听器
    if (!arguments.length) {
      vm._events = Object.create(null)
      return vm
    }
    // array of events
    //遍历数组依次移除事件监听器
    if (Array.isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$off(event[i], fn)
      }
      return vm
    }
    // specific event
    //只提供了事件名移除该事件所有的监听器
    const cbs = vm._events[event]
    if (!cbs) {
      return vm
    }
    if (!fn) {
      vm._events[event] = null
      return vm
    }
    // specific handler
    //如果提供了事件名和回调函数则只移除该事件对应的回调函数
    let cb
    let i = cbs.length
    //注意循环是从后往前，避免因为从前往后遍历时移除当前位置的监听器之后会造成后面的监听器前移而跳过一个元素
    while (i--) {
      cb = cbs[i]
      if (cb === fn || cb.fn === fn) {
        cbs.splice(i, 1)
        break
      }
    }
    return vm
  }

  //emit触发事件，附加的参数都会传给监听器回调
  Vue.prototype.$emit = function (event: string): Component {
    const vm: Component = this
    if (process.env.NODE_ENV !== 'production') {
      const lowerCaseEvent = event.toLowerCase()
      if (lowerCaseEvent !== event && vm._events[lowerCaseEvent]) {
        tip(
          `Event "${lowerCaseEvent}" is emitted in component ` +
          `${formatComponentName(vm)} but the handler is registered for "${event}". ` +
          `Note that HTML attributes are case-insensitive and you cannot use ` +
          `v-on to listen to camelCase events when using in-DOM templates. ` +
          `You should probably use "${hyphenate(event)}" instead of "${event}".`
        )
      }
    }
    //取出对于事件的所有监听器回调函数列表
    let cbs = vm._events[event]
    if (cbs) {
      //toArray可以将类数组转换成真正的数组，第二个参数是起始位置
      cbs = cbs.length > 1 ? toArray(cbs) : cbs
      const args = toArray(arguments, 1)
      const info = `event handler for "${event}"`
      for (let i = 0, l = cbs.length; i < l; i++) {
        //依次执行回调函数并且捕获错误
        invokeWithErrorHandling(cbs[i], vm, args, vm, info)
      }
    }
    return vm
  }
}
