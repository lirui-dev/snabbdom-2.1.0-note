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

// sel & key 相同为同一节点
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

  // Node => VNode
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

  // 子节点 Diff 算法
  function updateChildren (parentElm: Node,
    oldCh: VNode[],
    newCh: VNode[],
    insertedVnodeQueue: VNodeQueue) {
    let oldStartIdx = 0 // 旧开始节点索引指针
    let newStartIdx = 0 // 新开始节点索引指针
    let oldEndIdx = oldCh.length - 1  // 旧结束节点索引指针
    let oldStartVnode = oldCh[0] // 旧开始节点
    let oldEndVnode = oldCh[oldEndIdx] // 旧结束节点
    let newEndIdx = newCh.length - 1  // 新结束节点索引指针
    let newStartVnode = newCh[0] // 新开始节点
    let newEndVnode = newCh[newEndIdx] // 新结束节点

    let oldKeyToIdx: KeyToIndexMap | undefined
    let idxInOld: number
    let elmToMove: VNode
    let before: any

    // 同级起始节点遍历比较
    while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {

      // 节点不存在 => 前/后移动一个位置
      if (oldStartVnode == null) {
        oldStartVnode = oldCh[++oldStartIdx] // Vnode might have been moved left
      } else if (oldEndVnode == null) {
        oldEndVnode = oldCh[--oldEndIdx]
      } else if (newStartVnode == null) {
        newStartVnode = newCh[++newStartIdx]
      } else if (newEndVnode == null) {
        newEndVnode = newCh[--newEndIdx]

        // 节点相同性比较四种情况：
      } else if (sameVnode(oldStartVnode, newStartVnode)) {
        // 情况1：旧开始节点 === 新开始节点

        patchVnode(oldStartVnode, newStartVnode, insertedVnodeQueue)
        // 新旧开始节点索引指针++
        oldStartVnode = oldCh[++oldStartIdx]
        newStartVnode = newCh[++newStartIdx]
      } else if (sameVnode(oldEndVnode, newEndVnode)) {
        // 情况2：旧结束节点 === 新技术节点

        patchVnode(oldEndVnode, newEndVnode, insertedVnodeQueue)
        // 新旧结束节点索引指针--
        oldEndVnode = oldCh[--oldEndIdx]
        newEndVnode = newCh[--newEndIdx]
      } else if (sameVnode(oldStartVnode, newEndVnode)) { // Vnode moved right
        // 情况3：旧开始 vnode 和 新结束 vnode 对比

        patchVnode(oldStartVnode, newEndVnode, insertedVnodeQueue)
        // 移动旧开始节点至结束位置
        api.insertBefore(parentElm, oldStartVnode.elm!, api.nextSibling(oldEndVnode.elm!))
        // 旧开始节点索引指针++；新结束节点索引指针--
        oldStartVnode = oldCh[++oldStartIdx]
        newEndVnode = newCh[--newEndIdx]
      } else if (sameVnode(oldEndVnode, newStartVnode)) { // Vnode moved left
        // 情况4：旧结束 vnode 和 新开始 vnode

        patchVnode(oldEndVnode, newStartVnode, insertedVnodeQueue)
        // 移动旧结束节点至开始位置
        api.insertBefore(parentElm, oldEndVnode.elm!, oldStartVnode.elm!)
        // 旧结束节点索引指针++；新开始节点索引指针--
        oldEndVnode = oldCh[--oldEndIdx]
        newStartVnode = newCh[++newStartIdx]

        // 起始节点相同性比较完毕
      } else {
        // 处理未遍历节点
        // 1. 获取剩余老节点 key-index Map
        if (oldKeyToIdx === undefined) {
          oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx)
        }
        // 2. 开始 -> 结束：处理剩余新节点
        idxInOld = oldKeyToIdx[newStartVnode.key as string] // 通过新开始节点 key，获取对应在剩余老节点中的节点
        if (isUndef(idxInOld)) { // 没有对应节点：创建新元素

          // 创建新开始节点，并插入到老开始节点前
          api.insertBefore(parentElm, createElm(newStartVnode, insertedVnodeQueue), oldStartVnode.elm!)
        } else { // 有对应节点
          // 1. 取出老节点
          elmToMove = oldCh[idxInOld]
          // 2. 新老对应节点 DOM 不相同（被修改过）：创建新开始节点，并插入到老开始节点前
          if (elmToMove.sel !== newStartVnode.sel) {
            api.insertBefore(parentElm, createElm(newStartVnode, insertedVnodeQueue), oldStartVnode.elm!)
          } else {
            // 3. 相同节点：
            // 3.1 diff
            patchVnode(elmToMove, newStartVnode, insertedVnodeQueue)
            // 3.2 删除老节点
            oldCh[idxInOld] = undefined as any
            // 3.3 对应老节点移到开始位置
            api.insertBefore(parentElm, elmToMove.elm!, oldStartVnode.elm!)
          }
        }
        newStartVnode = newCh[++newStartIdx] // 下一个新开始节点
      }
    }

    // 收尾工作
    if (oldStartIdx <= oldEndIdx || newStartIdx <= newEndIdx) { // 若至少一个数组未遍历处理完
      if (oldStartIdx > oldEndIdx) { // 老节点处理完，新节点还有剩余未处理
        // 剩余新节点插入到开始位置
        before = newCh[newEndIdx + 1] == null ? null : newCh[newEndIdx + 1].elm
        addVnodes(parentElm, before, newCh, newStartIdx, newEndIdx, insertedVnodeQueue)
      } else { // 新节点处理完，老节点还有剩余未处理
        // 移除未处理的老节点
        removeVnodes(parentElm, oldCh, oldStartIdx, oldEndIdx)
      }
    }
  }

  // 为同一节点的同级 diff 过程
  function patchVnode (oldVnode: VNode, vnode: VNode, insertedVnodeQueue: VNodeQueue) {
    // 过程一：触发 prepatch 和 update 钩子
    const hook = vnode.data?.hook
    // VNode prepatch hook
    hook?.prepatch?.(oldVnode, vnode)

    // 旧节点 DOM 赋值给 新节点 DOM
    const elm = vnode.elm = oldVnode.elm!

    // 获取节点的子节点（只获取一层子节点）
    const oldCh = oldVnode.children as VNode[]
    const ch = vnode.children as VNode[]

    // 真·同一节点（对象引用指针相同）则无需进一步 diff
    if (oldVnode === vnode) return

    // 新节点有 data 触发 update 钩子
    if (vnode.data !== undefined) {
      // modules update hook
      for (let i = 0; i < cbs.update.length; ++i) cbs.update[i](oldVnode, vnode)
      // VNode update hook
      vnode.data.hook?.update?.(oldVnode, vnode)
    }

    // 过程二：新旧节点差异对比
    if (isUndef(vnode.text)) {
      // 新节点没有 text 内容

      if (isDef(oldCh) && isDef(ch)) {
        // 新旧节点都有子节点

        // 不是真·相同，则 diff 比较新旧子节点
        if (oldCh !== ch) updateChildren(elm, oldCh, ch, insertedVnodeQueue)

      } else if (isDef(ch)) {
        // 新节点有子节点，旧节点没有

        // 若老节点虽没有子节点，但有 text 内容：
        if (isDef(oldVnode.text)) api.setTextContent(elm, '') // 清空 DOM 的 text 内容

        // 新节点所有子节点插入到 DOM 中
        addVnodes(elm, null, ch, 0, ch.length - 1, insertedVnodeQueue)
      } else if (isDef(oldCh)) { // 旧节点有子节点，新节点没有
        // 移除旧节点所有子节点
        removeVnodes(elm, oldCh, 0, oldCh.length - 1)
      } else if (isDef(oldVnode.text)) { // 只有旧节点有 text 内容
        api.setTextContent(elm, '') // 清空 DOM 的 text 内容
      }

      // 新节点有 text 内容：
    } else if (oldVnode.text !== vnode.text) { // 确保新旧节点 text 不相同（相同则是同一节点，无需处理）
      if (isDef(oldCh)) { // 旧节点有子节点
        // 移除所有旧节点的子节点
        removeVnodes(elm, oldCh, 0, oldCh.length - 1)
      }

      // 设置 DOM text 内容为新节点 text 内容
      api.setTextContent(elm, vnode.text!)
    }

    // 过程三：VNode postpatch hook
    hook?.postpatch?.(oldVnode, vnode)
  }

  /**
   * 节点 diff & 渲染（patch：diff 后的补丁）
   * @param oldVnode 旧虚拟节点 或 真实 DOM 节点
   * @param vnode 新的虚拟节点
   */
  return function patch (oldVnode: VNode | Element, vnode: VNode): VNode {
    let i: number, elm: Node, parent: Node

    const insertedVnodeQueue: VNodeQueue = [] // 存储新插入节点的钩子函数，为后面执行作准备
    for (i = 0; i < cbs.pre.length; ++i) cbs.pre[i]() // 执行所有模块的预处理钩子

    if (!isVnode(oldVnode)) { // 没有 sel 属性节点（虚拟节点）转换为虚拟节点
      oldVnode = emptyNodeAt(oldVnode) // non-VNode => VNode
    }

    // 新旧节点是否是同一节点（sel & key 相同）
    if (sameVnode(oldVnode, vnode)) {
      // 同一节点：进行 diff
      patchVnode(oldVnode, vnode, insertedVnodeQueue)
    } else {
      // 非同一节点：DOM 节点替换
      elm = oldVnode.elm!
      parent = api.parentNode(elm) as Node

      // 1. 创建子节点的 DOM 节点
      createElm(vnode, insertedVnodeQueue)

      // 2. 替换旧 DOM 节点
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
