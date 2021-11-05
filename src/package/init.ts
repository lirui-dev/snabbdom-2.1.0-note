import { Module } from './modules/module'
import { vnode, VNode } from './vnode'
import * as is from './is'
import { htmlDomApi, DOMAPI } from './htmldomapi'

type NonUndefined<T> = T extends undefined ? never : T

function isUndef (s: any): boolean {
  return s === undefined
}
function isDef<A> (s: A): s is NonUndefined<A> {
  return s !== undefined
}

type VNodeQueue = VNode[]

const emptyNode = vnode('', {}, [], undefined, undefined)

function sameVnode (vnode1: VNode, vnode2: VNode): boolean {
  return vnode1.key === vnode2.key && vnode1.sel === vnode2.sel
}

function isVnode (vnode: any): vnode is VNode {
  return vnode.sel !== undefined
}

type KeyToIndexMap = {[key: string]: number}

type ArraysOf<T> = {
  [K in keyof T]: Array<T[K]>;
}

type ModuleHooks = ArraysOf<Required<Module>>

function createKeyToOldIdx (children: VNode[], beginIdx: number, endIdx: number): KeyToIndexMap {
  const map: KeyToIndexMap = {}
  for (let i = beginIdx; i <= endIdx; ++i) {
    const key = children[i]?.key
    if (key !== undefined) {
      map[key] = i
    }
  }
  return map
}

const hooks: Array<keyof Module> = ['create', 'update', 'remove', 'destroy', 'pre', 'post']

/**
 * 生成 patch 函数的高阶函数，并用于处理初始化配置
 * @param modules 应用模块声明数组
 * @param domApi 不同平台的 VNode 操作的 API 实现，默认使用 HTML DOM API
 * @returns patch 函数
 */
export function init (modules: Array<Partial<Module>>, domApi?: DOMAPI) {
  let i: number
  let j: number
  // callbacks
  const cbs: ModuleHooks = {
    create: [],
    update: [],
    remove: [],
    destroy: [],
    pre: [], // 预处理钩子函数
    post: [], // 后置处理钩子函数
  }

  const api: DOMAPI = domApi !== undefined ? domApi : htmlDomApi

  // 把模块钩子放入对应钩子中
  for (i = 0; i < hooks.length; ++i) {
    cbs[hooks[i]] = []
    for (j = 0; j < modules.length; ++j) {
      const hook = modules[j][hooks[i]]
      if (hook !== undefined) {
        // cbs => { create: [fn1, fn2], update: [fn1, fn2], ... }
        (cbs[hooks[i]] as any[]).push(hook)
      }
    }
  }

  function emptyNodeAt (elm: Element) {
    const id = elm.id ? '#' + elm.id : ''
    const c = elm.className ? '.' + elm.className.split(' ').join('.') : ''
    return vnode(api.tagName(elm).toLowerCase() + id + c, {}, [], undefined, elm)
  }

  function createRmCb (childElm: Node, listeners: number) {
    return function rmCb () {
      if (--listeners === 0) {
        // 只有在所有模块 remove 钩子执行完后才删除 DOM
        const parent = api.parentNode(childElm) as Node
        api.removeChild(parent, childElm)
      }
    }
  }

  function createElm (vnode: VNode, insertedVnodeQueue: VNodeQueue): Node {
    // 执行 init hook函数
    let i: any
    let data = vnode.data
    if (data !== undefined) {
      const init = data.hook?.init
      if (isDef(init)) { // isDef(inded) => (!== undefined)
        // VNode init hook
        init(vnode)
        data = vnode.data
      }
    }

    // 把 vnode 转换成真实 DOM（还没渲染到页面）
    const children = vnode.children
    const sel = vnode.sel
    if (sel === '!') {
      // 感叹号选择器创建为注释节点
      if (isUndef(vnode.text)) { // inUndef(ined)
        vnode.text = ''
      }
      vnode.elm = api.createComment(vnode.text!)
    } else if (sel !== undefined) {
      // Parse selector 解析选择器
      const hashIdx = sel.indexOf('#')
      const dotIdx = sel.indexOf('.', hashIdx)
      const hash = hashIdx > 0 ? hashIdx : sel.length
      const dot = dotIdx > 0 ? dotIdx : sel.length
      const tag = hashIdx !== -1 || dotIdx !== -1 ? sel.slice(0, Math.min(hash, dot)) : sel

      // 创建 DOM
      const elm = vnode.elm = isDef(data) && isDef(i = data.ns)
        ? api.createElementNS(i, tag) // NameSpace 一般用于创建 SVG
        : api.createElement(tag)

      // 在 DOM 上设置 id 和 class 属性
      if (hash < dot) elm.setAttribute('id', sel.slice(hash + 1, dot))
      if (dotIdx > 0) elm.setAttribute('class', sel.slice(dot + 1).replace(/\./g, ' '))

      // 执行所有模块的 create hook
      for (i = 0; i < cbs.create.length; ++i) cbs.create[i](emptyNode, vnode)

      if (is.array(children)) {
        // 处理数组子节点
        for (i = 0; i < children.length; ++i) {
          const ch = children[i]
          if (ch != null) {
            api.appendChild(elm, createElm(ch as VNode, insertedVnodeQueue))
          }
        }
      } else if (is.primitive(vnode.text)) {
        // 处理原始值子节点
        api.appendChild(elm, api.createTextNode(vnode.text))
      }

      const hook = vnode.data!.hook
      if (isDef(hook)) {
        // VNode create hook
        hook.create?.(emptyNode, vnode)
        if (hook.insert) {
          // cache VNode insert hook
          insertedVnodeQueue.push(vnode)
        }
      }
    } else {
      vnode.elm = api.createTextNode(vnode.text!)
    }

    // 返回新创建 DOM
    return vnode.elm
  }

  function addVnodes (
    parentElm: Node,
    before: Node | null,
    vnodes: VNode[],
    startIdx: number,
    endIdx: number,
    insertedVnodeQueue: VNodeQueue
  ) {
    for (; startIdx <= endIdx; ++startIdx) {
      const ch = vnodes[startIdx]
      if (ch != null) {
        api.insertBefore(parentElm, createElm(ch, insertedVnodeQueue), before)
      }
    }
  }

  function invokeDestroyHook (vnode: VNode) {
    const data = vnode.data
    if (data !== undefined) {
      // VNode destroy hook
      data?.hook?.destroy?.(vnode)
      // modules destroy hook
      for (let i = 0; i < cbs.destroy.length; ++i) cbs.destroy[i](vnode)
      if (vnode.children !== undefined) {
        for (let j = 0; j < vnode.children.length; ++j) {
          const child = vnode.children[j]
          if (child != null && typeof child !== 'string') {
            invokeDestroyHook(child)
          }
        }
      }
    }
  }

  function removeVnodes (parentElm: Node,
    vnodes: VNode[],
    startIdx: number,
    endIdx: number): void {
    for (; startIdx <= endIdx; ++startIdx) {
      let listeners: number
      let rm: () => void
      const ch = vnodes[startIdx]
      if (ch != null) {
        if (isDef(ch.sel)) {
          invokeDestroyHook(ch) // 执行 destroy hook
          listeners = cbs.remove.length + 1 // 防止模块执行 remove 钩子函数时，重复删除 DOM 元素，详情看 createRmCb 实现
          rm = createRmCb(ch.elm!, listeners)

          // modules remove hook
          for (let i = 0; i < cbs.remove.length; ++i) cbs.remove[i](ch, rm)

          const removeHook = ch?.data?.hook?.remove
          if (isDef(removeHook)) {
            // VNode remove hook
            removeHook(ch, rm)
          } else {
            rm()
          }

        } else { // Text node
          api.removeChild(parentElm, ch.elm!)
        }
      }
    }
  }

  // 优化的 Diff 算法：只比较同级节点（DOM 操作很少跨级）
  function updateChildren (parentElm: Node,
    oldCh: VNode[],
    newCh: VNode[],
    insertedVnodeQueue: VNodeQueue) {
    let oldStartIdx = 0
    let newStartIdx = 0
    let oldEndIdx = oldCh.length - 1
    let oldStartVnode = oldCh[0]
    let oldEndVnode = oldCh[oldEndIdx]
    let newEndIdx = newCh.length - 1
    let newStartVnode = newCh[0]
    let newEndVnode = newCh[newEndIdx]
    let oldKeyToIdx: KeyToIndexMap | undefined
    let idxInOld: number
    let elmToMove: VNode
    let before: any

    // 同时遍历新旧 vnode
    while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {

      // === null：处理已被移动的 DOM
      if (oldStartVnode == null) {
        oldStartVnode = oldCh[++oldStartIdx] // Vnode might have been moved left
      } else if (oldEndVnode == null) {
        oldEndVnode = oldCh[--oldEndIdx]
      } else if (newStartVnode == null) {
        newStartVnode = newCh[++newStartIdx]
      } else if (newEndVnode == null) {
        newEndVnode = newCh[--newEndIdx]

        // vnode 相同性比较
      } else if (sameVnode(oldStartVnode, newStartVnode)) {
        // 新和旧开始 vnode 对比
        patchVnode(oldStartVnode, newStartVnode, insertedVnodeQueue)
        oldStartVnode = oldCh[++oldStartIdx]
        newStartVnode = newCh[++newStartIdx]
      } else if (sameVnode(oldEndVnode, newEndVnode)) {
        // 旧和新结束 vnode 对比
        patchVnode(oldEndVnode, newEndVnode, insertedVnodeQueue)
        oldEndVnode = oldCh[--oldEndIdx]
        newEndVnode = newCh[--newEndIdx]
      } else if (sameVnode(oldStartVnode, newEndVnode)) { // Vnode moved right
        // 旧开始 vnode 和 新结束 vnode 对比
        patchVnode(oldStartVnode, newEndVnode, insertedVnodeQueue)
        api.insertBefore(parentElm, oldStartVnode.elm!, api.nextSibling(oldEndVnode.elm!))
        oldStartVnode = oldCh[++oldStartIdx]
        newEndVnode = newCh[--newEndIdx]
      } else if (sameVnode(oldEndVnode, newStartVnode)) { // Vnode moved left
        // 旧结束 vnode 和 新开始 vnode
        patchVnode(oldEndVnode, newStartVnode, insertedVnodeQueue)
        api.insertBefore(parentElm, oldEndVnode.elm!, oldStartVnode.elm!)
        oldEndVnode = oldCh[--oldEndIdx]
        newStartVnode = newCh[++newStartIdx]

      } else {
        if (oldKeyToIdx === undefined) {
          oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx)
        }
        idxInOld = oldKeyToIdx[newStartVnode.key as string]
        if (isUndef(idxInOld)) { // New element
          api.insertBefore(parentElm, createElm(newStartVnode, insertedVnodeQueue), oldStartVnode.elm!)
        } else {
          elmToMove = oldCh[idxInOld]
          if (elmToMove.sel !== newStartVnode.sel) {
            api.insertBefore(parentElm, createElm(newStartVnode, insertedVnodeQueue), oldStartVnode.elm!)
          } else {
            patchVnode(elmToMove, newStartVnode, insertedVnodeQueue)
            oldCh[idxInOld] = undefined as any
            api.insertBefore(parentElm, elmToMove.elm!, oldStartVnode.elm!)
          }
        }
        newStartVnode = newCh[++newStartIdx]
      }
    }

    if (oldStartIdx <= oldEndIdx || newStartIdx <= newEndIdx) {
      if (oldStartIdx > oldEndIdx) {
        before = newCh[newEndIdx + 1] == null ? null : newCh[newEndIdx + 1].elm
        addVnodes(parentElm, before, newCh, newStartIdx, newEndIdx, insertedVnodeQueue)
      } else {
        removeVnodes(parentElm, oldCh, oldStartIdx, oldEndIdx)
      }
    }
  }

  function patchVnode (oldVnode: VNode, vnode: VNode, insertedVnodeQueue: VNodeQueue) {
    // 过程一：触发 prepatch 和 update 钩子
    const hook = vnode.data?.hook
    // VNode prepatch hook
    hook?.prepatch?.(oldVnode, vnode)

    // 旧节点 DOM 赋值给 新节点 DOM
    const elm = vnode.elm = oldVnode.elm!

    const oldCh = oldVnode.children as VNode[]
    const ch = vnode.children as VNode[]

    // 新旧节点相同则结束
    if (oldVnode === vnode) return
    // 新旧节点不相同：

    // 新节点有 data 则触发 update 钩子
    if (vnode.data !== undefined) {
      // modules update hook
      for (let i = 0; i < cbs.update.length; ++i) cbs.update[i](oldVnode, vnode)
      // VNode update hook
      vnode.data.hook?.update?.(oldVnode, vnode)
    }

    // 过程二：对比新旧 VNode 差异
    if (isUndef(vnode.text)) { // text 和 children 互斥，后者优先
      // 新 VNode 没有 text
      if (isDef(oldCh) && isDef(ch)) {
        // 新旧 VNode 都有子 VNode，但不相同
        if (oldCh !== ch) updateChildren(elm, oldCh, ch, insertedVnodeQueue) // 更新 子 VNode
      } else if (isDef(ch)) {
        // 只有新 VNode 有 子 VNode
        if (isDef(oldVnode.text)) api.setTextContent(elm, '') // 老 VNode 有 text，则清空 text 内容
        // 新 VNode 子 VNode 插入到 DOM
        addVnodes(elm, null, ch, 0, ch.length - 1, insertedVnodeQueue)
      } else if (isDef(oldCh)) {
        // 只有老 VNode 有子 VNode，则进行移除
        removeVnodes(elm, oldCh, 0, oldCh.length - 1)
      } else if (isDef(oldVnode.text)) {
        // 只有 老 VNode 有 text
        api.setTextContent(elm, '')
      }
    } else if (oldVnode.text !== vnode.text) { // 新 VNode text 有值 且 新旧 VNode text 不同
      if (isDef(oldCh)) { // 老 VNode 有子 VNode 则要删除（为 过渡动画 结束后再进行删除）
        removeVnodes(elm, oldCh, 0, oldCh.length - 1)
      }
      api.setTextContent(elm, vnode.text!)
    }

    // 过程三：VNode postpatch hook
    hook?.postpatch?.(oldVnode, vnode)
  }

  /**
   * 新节点渲染；执行 Diff
   * @param oldVnode 旧的虚拟节点 或 真实节点
   * @param vnode 新的虚拟节点
   */
  return function patch (oldVnode: VNode | Element, vnode: VNode): VNode {
    let i: number, elm: Node, parent: Node

    const insertedVnodeQueue: VNodeQueue = [] // 存储新插入节点的钩子函数，为后面执行作准备
    for (i = 0; i < cbs.pre.length; ++i) cbs.pre[i]() // 执行所有模块的预处理钩子

    if (!isVnode(oldVnode)) { // oldVnode 有 sel 成员则是 VNode
      oldVnode = emptyNodeAt(oldVnode) // non-VNode => VNode
    }

    if (sameVnode(oldVnode, vnode)) { // 两节点 sel 和 key 相同为相同节点
      patchVnode(oldVnode, vnode, insertedVnodeQueue)
    } else{
      // 非相同 VNode 则创建新 VNode 的真实节点并插入到父 VNode 中
      elm = oldVnode.elm!
      parent = api.parentNode(elm) as Node

      createElm(vnode, insertedVnodeQueue)

      if (parent !== null) {
        api.insertBefore(parent, vnode.elm!, api.nextSibling(elm))
        removeVnodes(parent, [oldVnode], 0, 0)
      }
    }

    for (i = 0; i < insertedVnodeQueue.length; ++i) {
      // VNode insert hook
      insertedVnodeQueue[i].data!.hook!.insert!(insertedVnodeQueue[i]) // `!`：断言一定有值
    }
    for (i = 0; i < cbs.post.length; ++i) cbs.post[i]() // 执行所有模块的后置处理钩子
    return vnode
  }
}
