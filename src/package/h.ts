import { vnode, VNode, VNodeData } from './vnode'
import * as is from './is'

export type VNodes = VNode[]
export type VNodeChildElement = VNode | string | number | undefined | null
export type ArrayOrElement<T> = T | T[]
export type VNodeChildren = ArrayOrElement<VNodeChildElement>

function addNS (data: any, children: VNodes | undefined, sel: string | undefined): void {
  data.ns = 'http://www.w3.org/2000/svg'
  if (sel !== 'foreignObject' && children !== undefined) {
    for (let i = 0; i < children.length; ++i) {
      const childData = children[i].data
      if (childData !== undefined) {
        addNS(childData, (children[i] as VNode).children as VNodes, children[i].sel)
      }
    }
  }
}

// h 函数的参数重载
export function h (sel: string): VNode
export function h (sel: string, data: VNodeData | null): VNode
export function h (sel: string, children: VNodeChildren): VNode
export function h (sel: string, data: VNodeData | null, children: VNodeChildren): VNode
export function h (sel: any, b?: any, c?: any): VNode {
  var data: VNodeData = {}
  var children: any
  var text: any
  var i: number

  // 处理参数重载
  if (c !== undefined) {
    // 三个参数情况：sel, data, children
    if (b !== null) {
      data = b
    }
    if (is.array(c)) {
      // c 是数组？
      children = c
    } else if (is.primitive(c)) {
      // c 是原始值？
      text = c
    } else if (c && c.sel) {
      // c 是 VNode
      children = [c]
    }
  } else if (b !== undefined && b !== null) {
    // 两个参数情况：sel, data|children
    if (is.array(b)) {
      // 数组，则 b 是子节点数组
      children = b
    } else if (is.primitive(b)) {
      // 原始值，则是 text Node
      text = b
    } else if (b && b.sel) {
      // VNode 则处理成单元素数组
      children = [b]
    } else { data = b } // 都不是则是 data
  }
  // 处理子节点
  if (children !== undefined) {
    // 遍历处理
    for (i = 0; i < children.length; ++i) {
      // 是原始值则处理成 VNode
      if (is.primitive(children[i])) children[i] = vnode(undefined, undefined, undefined, children[i], undefined)
    }
  }
  // 处理 SVG
  if (
    sel[0] === 's' && sel[1] === 'v' && sel[2] === 'g' &&
    (sel.length === 3 || sel[3] === '.' || sel[3] === '#')
  ) {
    // SVG 添加命名空间
    addNS(data, children, sel)
  }
  return vnode(sel, data, children, text, undefined) // 返回处理后的 VNode
};
