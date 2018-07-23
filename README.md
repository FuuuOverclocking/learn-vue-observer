笔者日前学习了 Vue 的 Observer 部分，简单地谷歌了一下，因为没有找到解释地十分彻底的中文资源，记下自己对其的理解并分享。

转载需注明出处 https://segmentfault.com/a/1190000015709022 ，有帮助请点赞。

本文引用的 Vue 版本为 v2.5.17-beta.0 。
不过 Vue 的 Observer 部分自2017年以来至今没什么大变化，v2.5.16 到 v2.5.17-beta.0 对 Observer 有个小小的 bugfix。

## 内容

本文介绍 Vue 响应式原理的实现过程，并试图以之为参照改造出一个便于移植的库。这里笔者把 Vue 的 observer 部分提出来独立地讲，读者不需要对 Vue 其他部分十分熟悉。

Vue 的响应式模型十分完善，实现地足够巧妙，私以为有学习的必要。本文准备从写一个简单的模型出发，一步步填充功能，演化成 Vue 源码的形态，所以文章看起来似乎巨长，但代码多有重复；我认为这样写，读者看起来会比较轻松，所以请不必长文恐惧。卢瑟福说，“只有你能将一个理论讲得连女仆都懂了，你才算真正懂了”。虽然读者可能不是女仆(?)，我也会写得尽量明白的。

本文对 Observer 介绍地很完全，对象和数组的不同处理，[deep watching][7]，以及异步队列都会讲解。当然，也不会完全整成源码那么麻烦，一些只和 Vue 有关的代码删除了，此外[计算属性(computed property)][6]的部分只说明原理，省略了实现。

但一般的 JS 技巧，[ECMAScript 6][1]，闭包的知识，[Object.defineProperty][2] 的知识还是需要具备的。

Vue 源码是用 Flow 写的，本文改成 TypeScript 了(同为类型注解，毕竟后者更流行)，未学习过的同学只要把文中不像 JS 的部分去掉，当 JS 就行了。

JS 中数组是对象的一种，因为 Observer 部分对数组与普通对象的对待区别很大，所以下文说到对象，都是指 constructor 为 Object 的普通对象。

## 准备

可以先`git clone git@github.com:vuejs/vue.git`一份源码备看。observer 的部分在源码的 src/core/observer 目录下。

新建文件夹 learn-vue-observer，创建几个文件。

util.ts
```js
/* 一些常用函数的简写 */

export function def(obj: any, key: string, value: any, enumerable: boolean = false) {
  Object.defineProperty(obj, key, {
    value,
    enumerable,
    writable: true,
    configurable: true,
  });
}

export function isObject(obj: any) {
  return obj !== null && typeof obj === "object";
}

export function hasOwn(obj: any, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function isPlainObject(obj: any): boolean {
  return Object.prototype.toString.call(obj) === "[object Object]";
}

export function isNative(ctor: any): boolean {
  return typeof ctor === "function" && /native code/.test(ctor.toString());
}

export function remove(arr: any[], item: any): any[] | void {
  if (arr.length) {
    const index = arr.indexOf(item);
    if (index > -1) {
      return arr.splice(index, 1);
    }
  }
}
```

## 版本 0.1

假设我们要把下面这个对象转变成响应式的。

```js
let obj = {
  a: {
    aa: {
      aaa: 123,
      bbb: 456,
    },
    bb: "obj.a.bb",
  },
  b: "obj.b",
};
```

怎样算作是响应式的呢？如果将 obj 的任意键的值改变，都能执行一个相应的函数进行相关操作（比如更新DOM），那么就算得上响应式了。为此，我们势必为 obj 的每个键创建代理，使对 obj 的直接操作变成透过代理操作。代理的方式有许多，[Object.observe][3]，[Proxy][4]，getter/setter。但 Object.observe 已经被废弃，Proxy 巨硬家从 Edge 才开始支持，IE 全灭，所以可行的只有 getter/setter （IE9 开始支持）。然而 getter/setter 依然有很大的局限性，即只能转化已有属性，因此需要为用户提供特别的函数来设置新属性，这个函数我们最后再提。

obj 的值都转成 getter/setter 了，真实值存在哪呢？Vue 的做法是藏在闭包里。

下面我们定义3个函数/类，尝试递归地设置 obj 的 getter/setter。

index.ts
```js
import { def, hasOwn, isObject, isPlainObject } from "./util";

/**
 * 尝试对 value 创建 Observer 实例，
 * value 如果不是对象或数组，什么都不做。
 * @param value 需要尝试监视的目标
 */
export function observe(value: any) {
  if (!isObject(value)) {
    return;
  }

  let ob: Observer | void;
  if (typeof value.__ob__ !== "undefined") {
    ob = value.__ob__;
  } else {
    ob = new Observer(value);
  }
  return ob;
}

export class Observer {
  constructor(value: any) {
    def(value, "__ob__", this);
    this.walk(value);
  }
  public walk(value: any) {
    for (const key of Object.keys(value)) {
      defineReactive(value, key);
    }
  }
}

function defineReactive(obj: any, key: string, val?: any) {
  // 闭包中的 val 藏着 obj[key] 的真实值
  if (arguments.length === 2) {
    val = obj[key];
  }

  let childOb = observe(val); // val 如果不是对象的话，是返回 undefined 的。
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get() {
      ////////////////
      console.log("you get " + val);
      ////////////////
      return val;
    },
    set(newVal) {
      if (newVal === val) {
        return;
      }
      ////////////////
      console.log("you set " + newVal);
      ////////////////
      val = newVal;
      childOb = observe(newVal);
    }
  });
}
```

我们可以试一下

```js
observe(obj);
console.log(obj.a.aa.aaa = 234);
```

输出应为

```
you get [object Object]
you get [object Object]
you set 234
234
```

但是，有个问题，我们不应假设 obj 的每个键就是简单的值，万一本来就是 getter/setter 呢？

```js
let obj2 = {};
Object.defineProperty(obj2, "a", {
    configurable: true,
    enumerable: true,
    get() {
        return obj2._a;
    },
    set(val) {
        obj2._a = val;
    },
});
Object.defineProperty(obj2, "_a", {
    enumerable: false,
    value: 123,
    writable: true,
});
```

因此，需要修改 defineReactive ，继续用闭包保存 getter/setter 。

```js
function defineReactive(obj: any, key: string, val?: any) {
  const property = Object.getOwnPropertyDescriptor(obj, key);
  if (property && property.configurable === false) {
    return;
  }

  const getter = property!.get; // property! 的叹号是 TypeScript 语法，忽略即可
  const setter = property!.set;

  // 为什么写成 (!getter || setter) ？后面会讨论。
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key];
  }

  let childOb = observe(val);
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get() {
      const value = getter ? getter.call(obj) : val;
      ////////////////
      console.log("you get " + value);
      ////////////////
      return value;
    },
    set(newVal) {
      const value = getter ? getter.call(obj) : val;
      if (newVal === value) {
        return;
      }
      ////////////////
      console.log("you set " + newVal);
      ////////////////
      if (setter) {
        setter.call(obj, newVal);
      } else {
        val = newVal;
      }
      childOb = observe(newVal);
    },
  });
}
```

这样就可以成功地把 obj2 转变成响应式的。

笔者在理解 ```if ((!getter || setter) && arguments.length === 2)``` 时遇到过障碍，这其实是讲：

  1. 如果 arguments 长为3，参数 val 存在，就认为是显式地设置了这个键的值，原来的值就不考虑了
  2. 如果 getter setter 都存在，就认为这对 getter/setter 是在代理某个真实值，所以需要 val = obj[key]，然后 let childOb = observe(val) 对这个真实值继续进行递归设置
  3. 否则 如果 getter 存在，setter 不存在，认为 getter 大概只是返回某个生成的值，不执行 val = obj[key]，也就导致下面 let childOb = observe(undefined)
  4. getter 不存在，setter 存在，这类奇葩事情不在考虑范围内（例如 document.cookie）

这是 v2.5.17-beta.0 的一个 bugfix ，有关的讨论原文来自↓
[issue/7280](https://github.com/vuejs/vue/issues/7280)
[issue/7302](https://github.com/vuejs/vue/issues/7302)
[pull/7981](https://github.com/vuejs/vue/pull/7981)
[issue/8494](https://github.com/vuejs/vue/issues/8494)

## 版本 0.2: 加上对数组的支持

并不是说之前的版本不支持数组，而是一般开发者使用数组与使用对象的方法有区别。数组在 JS 中常被当作栈，队列，集合等数据结构的实现方式，会储存批量的数据以待遍历。编译器对对象与数组的优化也有所不同。所以对数组的处理需要特化出来以提高性能。

首先，不能再对数组每个键设置 getter/setter 了，而是修改覆盖数组的 push, pop, ... 等方法。[用户要修改数组只能使用这些方法，否则不会是响应式的][5]（除了 Vue.set, Vue.delete）。

因此，准备一个数组方法的替代品。哪些方法应当替代掉？那些不会干涉原数组的方法不需要修改；删除数组元素的方法需要替代；增加或替换数组元素的方法需要替换，还要尝试把新的值变成响应式的。

array.ts
```js
import { def } from './util';

const arrayProto = Array.prototype as any;
// 建立以 Array.prototype 为原型的 arrayMethods 并导出
export const arrayMethods = Object.create(arrayProto);

// 会干涉原数组的方法
const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
];

methodsToPatch.forEach((method: string) => {
  // 原方法的缓存
  const original = arrayProto[method];

  // 在 arrayMethods 上定义替代方法
  def(arrayMethods, method, function (this: any, ...args: any[]) {
    const result = original.apply(this, args);
    const ob = this.__ob__;

    // 新增的元素
    let inserted: any[] | void;

    switch (method) {
      // 会增加或替换元素的方法
      case 'push':
      case 'unshift':
        inserted = args;
        break;
      case 'splice':
        inserted = args.slice(2);
        break;
    }
    if (inserted){
      ob.observeArray(inserted); // Observer 上新增的方法
    }
    ///////////////////////////////
    console.log("array is modified.");
    ///////////////////////////////
    return result;
  });
});
```

然后修改 Observer，区别对待数组。

```js
export class Observer {
  constructor(value: any) {
    def(value, "__ob__", this);
    if (Array.isArray(value)) {
      // 替换原型（Object.setPrototype 这个方法执行地比较慢，而且支持情况堪忧）
      Object.setPrototypeOf(value, arrayMethods);
      this.observeArray(value);
    } else {
      this.walk(value);
    }
  }
  public walk(value: any) {
    for (const key of Object.keys(value)) {
      defineReactive(value, key);
    }
  }
  public observeArray(items: any[]) {
    // 设置 l = items.length 防止遍历过程中 items 长度变化
    for (let i = 0, l = items.length; i < l; i++) {
      // 直接观察数组元素，省略在键上设置 getter/setter 的步骤
      observe(items[i]);
    }
  }
}
```

## 版本 1.0: 增加 Dep, Watcher

### 从 API 出发思考写法

vm.$watch( expressionOrFunction, callback [, options] ) 是 Vue 最基础的观察自身 data 的方式。我们参考这个函数，提出适用本文的一个函数:

**watch( target, expression, callback )**

观察 target 这个对象的表达式 exp 的值，一旦发生变化时执行 callback （同步地）。callback 的第一个参数为新的值，第二个参数为旧的值，this 为 target。

例如 `watch(obj, "a.aa.bbb", val => console.log(val))` ，当 obj.a.aa.bbb 改变时，控制台会打印新的值。注意 obj 应该已经经过 observe(obj) 转化过了。

之前版本我们在 getter/setter 处留下了

/////////////////
console.log(XXX)
/////////////////

只要把这些替换成相应代码，就能实现 watch 方法了。

现在来定义一下哪些情况应执行 callback 。

假设 obj.a.aa.bbb = 456 ，我们对这个键进行了 watch :
1. obj.a.aa.bbb = 456 值没变，不需要
2. obj.a.aa.bbb = 999 应执行 callback
3. obj.a.aa = { bbb: 456 } 值没变，不执行 callback
4. obj.a.aa = { bbb: 999 } 应执行 callback
5. obj = {a:{aa:{bbb:999}}} 对象都被替换成新的了，想执行 callback 也不可能

假设我们还对 obj.a.aa 进行了 watch :
1. obj.a.aa.bbb = 999 虽然 obj.a.aa 发生了变异(mutation)，但 obj.a.aa 还是它自己，不执行 callback
2. obj.a.aa = { bbb: 456 } 应执行 callback

简而言之，如果 target 沿着 expression 解析到的值与之前的不全等，就认为需要执行 callback 。对于基础类型来说，就是值的不全等。对于普通对象，就是引用不相同。但数组比较特殊，对数组元素进行了操作，就应执行 callback 。

怎么组织代码呢？Evan You (Vue 作者) 的方法比较巧妙。

### Observer, Dep, Watcher

创建两个新的类，Dep, Watcher 。Dep 是 Dependency 的简称，每个 Observer 的实例，成员中都有一个 Dep 的实例。

这个 Dep 的实质是个数组，放置着监听这个 Observer 的 Watcher ，当这个 Observer 对应的值变化时，就通知 Dep 中的所有 Watcher 执行 callback 。

```js
export class Observer {
  constructor(value: any) {
    this.dep = new Dep(); // 新增
    def(value, "__ob__", this);
    if (Array.isArray(value)) {
// .........................
```

Watcher 是调用 watch 函数产生的，它保存着 callback 并且维护了一个数组，数组存放了所有 存有这个 Watcher 的 Dep 。这样当这个 Watcher 需要被删除时，可以遍历数组，从各个 Dep 中删去自身，也就是 unwatch 的过程。

Watcher 何时被放入 Dep 中的先不谈。先说说 Dep 都在什么地方。

以上说得并不全对，应该说，原始的 Dep 是创建在 defineReactive 的闭包中，Observer 的 dep 成员只是这个原始的 Dep 的备份，始终一起被维护，保持一致。另外，Observer 只会建立在对象或数组的 \_\_ob\_\_ 上，如果键的值不是对象或数组，只会有闭包中的 Dep 保存这个键的 Watcher 。

```js
function defineReactive(obj: any, key: string, val?: any) {
  const dep = new Dep(); // 新增
  const property = Object.getOwnPropertyDescriptor(obj, key);
// ...........................
```

举例来说，

```js
let obj = {
  // obj.__ob__.dep: 保存 obj 的 dep

  a: { // 闭包中有 obj.a 的 dep
    // obj.a.__ob__.dep: 保存 obj.a 的 dep

    aa: { // 闭包中有 obj.a.aa 的 dep
      // obj.a.aa.__ob__.dep: 保存 obj.a.aa 的 dep

      aaa: 123, // 闭包中有 obj.a.aa.aaa 的 dep
      bbb: 456, // 闭包中有 obj.a.aa.bbb 的 dep
    },
    bb: "obj.a.bb", // 闭包中有 obj.a.bb 的 dep
  },
  b: "obj.b", // 闭包中有 obj.b 的 dep
};
observe(obj);
```

数组特殊对待，不对数组的成员进行 defineReactive ，

```js
let obj = {
  arr: [ // 闭包中 obj.arr 的 dep
    // obj.arr.__ob__.dep

    2, // 没有 dep ，没有闭包
    3,
    5,
    7,
    11,
    { // 没有闭包
      // obj.arr[6].__ob__.dep 存在
    },
    [ // 没有闭包
      // obj.arr[7].__ob__.dep 存在
    ],
  ],
};
observe(obj);
```

复习一下，dep 实质是个数组，放着监听这个键的 Watcher 。

当这个键的值被修改时，就应该通知相应 dep 的所有 Watcher ，我们在 Dep 上设置 notify 方法，用来实现这个功能。

为此，修改 setter 的部分。

```js
function defineReactive(obj: any, key: string, val?: any) {
  const dep = new Dep();
  // .................................
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get() {
      // .............................
    },
    set(newVal) {
      // .............................
      }
      childOb = observe(newVal);
      dep.notify();
    },
  });
}
```

数组的部分，

array.ts
```js
  // ................
  def(arrayMethods, method, function (this: any, ...args: any[]) {
    const result = original.apply(this, args);
    const ob = this.__ob__;
    // .....................
    if (inserted){
      ob.observeArray(inserted);
    }
    ob.dep.notify();
    return result;
  });
```

如此一来，每当修改值时，相应的 Watcher 都会被通知了。

现在的问题是，何时怎么把 Watcher 放入 dep 中。下面我们先来尝试实现 Dep 。

dep.ts
```js
import { remove } from "./util";
import { Watcher } from "./watcher";

let uid = 0;

export default class Dep {
  public id: number;
  public subs: Watcher[];

  constructor() {
    this.id = uid++;
    this.subs = [];
  }

  public addSub(sub: Watcher) {
    this.subs.push(sub);
  }

  public removeSub(sub: Watcher) {
    remove(this.subs, sub);
  }

  public notify() {
    // 先复制一份，应对通知 Watcher 过程中，this.subs 可能变化的情况
    const subs = this.subs.slice();
    for (let i = 0, l = subs.length; i < l; i++) {
      // Watcher 上定义了 update 方法，用来被通知
      subs[i].update();
    }
  }
}
```

### （重点）用 Touch 的方法，收集依赖

假设用 `watch(obj, "a.aa.bbb", val => console.log(val))` ，创建了一个 Watcher ，这个 Watcher 应被放进哪些 Dep 中呢？

因为 `obj.a`, `obj.a.aa` 改变时，`obj.a.aa.bbb` 的值可能改变，所以答案是 `obj.a`, `obj.a.aa`, `obj.a.aa.bbb` 的闭包中的 Dep, 前两者是对象，所以在 \_\_ob\_\_.dep 中再放一份。

因为在对表达式 `obj.a.aa.bbb` 求值时，会依次执行 `obj.a`, `(obj.a).aa`, `((obj.a).aa).bbb` 的 getter ，这也正好对应了应被放入 Watcher 的键，所以很自然的一个想法是，

**规定一个全局变量，平常是 null ，当在决定某个 Watcher 该放入哪些 Dep 的时候（即 依赖收集 阶段），让这个全局变量指向这个 Watcher 。然后 touch 被监视的那个键，换言之，对那个键求值。途中会调用一连串的 getter ，往那些 getter 所对应的 Dep 里放入这个 Watcher 就对了。之后再将全局变量改回 null 。**

这个做法的妙处，还在于它可以同时适用 [deep watching][7] 和 [计算属性(computed property)][6]。deep watching 后面会再说，对于计算属性，这使得用户直接写函数就行，无需显式说明这个计算属性所依赖的其他属性，十分优雅，因为在运算这个函数时，用到其他属性就会触发 getter ，可能的依赖都会被收集起来。

我们来尝试实现，

```js
export default class Dep {
  // Dep.target 即前文所谓的全局变量
  public static target: Watcher | null = null;

  public id: number;
  public subs: Watcher[];

  public depend() {
    if (Dep.target) {
      this.addSub(Dep.target);
    }
  }
// ...................................................
```

```js
function defineReactive(obj: any, key: string, val?: any) {
  const dep = new Dep();
  // ...................................................
  let childOb = observe(val);
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get() {
      const value = getter ? getter.call(obj) : val;

      // 如果处在依赖收集阶段
      if (Dep.target) {
        dep.depend();
        if (childOb) {
          childOb.dep.depend();
        }
      }

      return value;
    },
  // ....................................................
}
```

现在也该把一直谈论的 Watcher 给实现了。根据前面说的，它应该有个 update 方法。

watcher.ts
```js
import Dep from "./dep";

let uid = 0;

export class Watcher {
  public id: number;
  public value: any;
  public target: any;
  public getter: (target: any) => any;
  public callback: (newVal: any, oldVal: any) => void;

  constructor(
    target: any,
    expression: string,
    callback: (newVal: any, oldVal: any) => void,
  ) {
    this.id = uid++;
    this.target = target;
    this.getter = parsePath(expression);
    this.callback = callback;
    this.value = this.get();
  }

  public get() {
    // 进入依赖收集阶段
    Dep.target = this;

    let value: any;
    const obj = this.target;
    try {
      // 调用了一连串 getter ，对应的键的 dep 中放入了这个 watcher
      value = this.getter(obj);
    } finally {
      // 退出依赖收集阶段
      Dep.target = null;
    }
    return value;
  }

  public update() {
    this.run();
  }
  public run() {
    this.getAndInvoke(this.callback);
  }
  public getAndInvoke(cb: (newVal: any, oldVal: any) => void) {
    const value = this.get();
    if (value !== this.value || isObject(value) /* 监视目标为对象或数组的话，仍应执行回调，因为值可能变异了 */) {
      const oldVal = this.value;
      this.value = value;
      cb.call(this.target, value, oldVal);
    }
  }
}

const bailRE = /[^\w.$]/;
function parsePath(path: string): any {
  if (bailRE.test(path)) {
    return;
  }
  const segments = path.split(".");
  return (obj: any) => {
    for (const segment of segments) {
      if (!obj) { return; }
      obj = obj[segment];
    }
    return obj;
  };
}
```

## 版本 1.1: 特化数组的依赖收集

```js
function defineReactive(obj: any, key: string, val?: any) {
// .....................................
      if (Dep.target) {
        dep.depend();
        if (childOb) {
          childOb.dep.depend();
          if (Array.isArray(value)) {
            dependArray(value);
          }
        }
      }
// ......................................
}

function dependArray(value: any[]) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i];

    // 若为多维数组，继续递归监视
    e && e.__ob__ && e.__ob__.dep.depend();
    if (Array.isArray(e)) {
      dependArray(e);
    }
  }
}
```

讨论的原文来自 [issue/3883][8] ，举例而言，

```js
let obj = {
  matrix: [
    [2, 3, 5, 7, 11],
    [13, 17, 19, 23, 29],
  ],
};
observe(obj);
watch(obj, "matrix", val => console.log(val));
obj.matrix[0].push(1);
// 导致 matrix[0].__ob__.dep.notify() ，由于递归监视，这个 dep 里也有上面的 Watcher
```

## 版本 1.2: 完善 Watcher 的生命周期

只有 watch 没有 unwatch 自然是不合理的。[前面提到](https://segmentfault.com/a/1190000015709022#articleHeader6)，Watcher 也维护了一个数组 deps，存放所有 放了这个 Watcher 的 Dep ，当这个 Watcher 析构时，可以从这些 Dep 中删去自身。

我们给 Watcher 增加 active, deps, depIds, newDeps, newDepIds 属性，addDep, cleanupDeps, teardown 方法，其中 teardown 方法起的是析构的作用，active 标志 Watcher 是否可用，其他的都是围绕着维护 deps 。

```js
export class Watcher {
  // ..............................
  public active = true;
  public deps: Dep[] = [];
  public depIds = new Set<number>();
  public newDeps: Dep[] = [];
  public newDepIds = new Set<number>();

  public run() {
    if (this.active) {
      this.getAndInvoke(this.callback);
    }
  }

  // newDeps 是新一轮收集的依赖，deps 是之前一轮收集的依赖
  public addDep(dep: Dep) {
    const id = dep.id;
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id);
      this.newDeps.push(dep);
      if (!this.depIds.has(id)) {
        dep.addSub(this);
      }
    }
  }

  public get() {
    Dep.target = this;

    let value: any;
    const obj = this.target;
    try {
      value = this.getter(obj);
    } finally {
      Dep.target = null;
      this.cleanupDeps();
    }
    return value;
  }

  // 清理依赖
  // 之前收集的依赖 如果不出现在新一轮收集的依赖中，就清除掉
  // 再交换 deps/newDeps, depIds/newDepIds
  public cleanupDeps() {
    let i = this.deps.length;
    while (i--) {
      const dep = this.deps[i];
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this);
      }
    }
    const tmpIds = this.depIds;
    this.depIds = this.newDepIds;
    this.newDepIds = tmpIds;
    this.newDepIds.clear();

    const tmp = this.deps;
    this.deps = this.newDeps;
    this.newDeps = tmp;
    this.newDeps.length = 0;
  }

  public teardown() {
    if (this.active) {
      let i = this.deps.length;
      while (i--) {
        this.deps[i].removeSub(this);
      }
      this.active = false;
    }
  }
}
```

修改之前的 dep.ts

```js
export default class Dep {
  public depend() {
    if (Dep.target) {
      // this.addSub(Dep.target);
      Dep.target.addDep(this);
    }
  }
}
```

## 版本 2.0: deep watching

Deep watching 的原理很简单，就是在用 touch 收集依赖的基础上，递归遍历并 touch 所有子元素，如此一来，所有子元素都被收集到依赖中。其中只有防止对象引用成环需要稍微注意一下，这个用一个集合记录遍历到的元素来解决。

我们给 Watcher 构造函数增加一个 deep 选项。

直接贴代码，

```js
export class Watcher {
  public deep: boolean;
  constructor(
    target: any,
    expression: string,
    callback: (newVal: any, oldVal: any) => void,
    {
      deep = false,
    },
  ) {
    this.deep = deep;
    // ................................
  }
  public get() {
    Dep.target = this;

    let value: any;
    const obj = this.target;
    try {
      value = this.getter(obj);
    } finally {
      if (this.deep) {
        // touch 所有子元素，收集到依赖中
        traverse(value);
      }
      Dep.target = null;
      this.cleanupDeps();
    }
    return value;
  }

  public getAndInvoke(cb: (newVal: any, oldVal: any) => void) {
    const value = this.get();
    if (value !== this.value ||
      isObject(value) ||
      this.deep /* deep watcher 始终执行 */
    ) {
      const oldVal = this.value;
      this.value = value;
      cb.call(this.target, value, oldVal);
    }
  }
}
```

traverse.ts
```js
import { isObject } from "./util";

const seenObjects = new Set();

export function traverse(val: any) {
  _traverse(val, seenObjects);
  seenObjects.clear();
}

function _traverse(val: any, seen: Set<any>) {
  let i;
  let keys;
  const isA = Array.isArray(val);
  if ((!isA && !isObject(val)) || Object.isFrozen(val)) {
    return;
  }
  if (val.__ob__) {
    const depId = val.__ob__.dep.id;
    if (seen.has(depId)) {
      return;
    }
    seen.add(depId);
  }
  if (isA) {
    i = val.length;
    while (i--) { _traverse(val[i] /* touch */, seen); }
  } else {
    keys = Object.keys(val);
    i = keys.length;
    while (i--) { _traverse(val[keys[i]] /* touch */, seen); }
  }
}
```

## 版本 2.1: 异步 Watcher, 异步队列

使用异步 Watcher 可以缓冲在同一次事件循环中发生的所有数据改变。如果在本次执行栈中同一个 Watcher 被多次触发，只会被推入到队列中一次。这样在缓冲时去除重复数据，能够避免不必要的计算，提高性能。

Vue 源码中的异步队列模型比下文中的复杂，因为 Vue 要保证

1. 从父组件到子组件的更新顺序
2. 用户定义的 watcher 在 负责渲染的 watcher 之前运行
3. 若在父组件的 watcher 运行时摧毁了子组件，子组件的 watcher 应被跳过
4. 被计算属性依赖的另一计算属性先运行

如果这些是你的兴趣，请直接转战源码 src/core/observer/scheduler.js 。

现在修改 watcher.ts ，

```js
export class Watcher {
  public deep: boolean;
  public sync: boolean;
  constructor(
    target: any,
    expression: string,
    callback: (newVal: any, oldVal: any) => void,
    {
      deep = false,
      sync = false, // 增加同步选项
    },
  ) {
    this.deep = deep;
    this.sync = sync;
    // ............................
  }
  public update() {
    if (this.sync) {
      this.run();
    } else {
      queueWatcher(this); // 推入队列
    }
  }
}
```

创建 scheduler.ts
```js
/// <reference path="next-tick.d.ts" />
import { nextTick } from "./next-tick";
import { Watcher } from "./watcher";

const queue: Watcher[] = [];
let has: { [key: number]: true | null } = {};
let waiting = false;
let flushing = false;
let index = 0;

/**
 * 重置 scheduler 的状态.
 */
function resetSchedulerState() {
  index = queue.length = 0;
  has = {};
  waiting = flushing = false;
}

/**
 * 刷新队列，并运行 watcher
 */
function flushSchedulerQueue() {
  flushing = true;
  let watcher;
  let id;

  queue.sort((a, b) => a.id - b.id);

  
  for (index = 0; index < queue.length /* 不缓存队列长度，因为新的 watcher 可能在执行队列时加进来 */; index++) {
    watcher = queue[index];
    id = watcher.id;
    has[id] = null;
    watcher.run();
  }

  resetSchedulerState();
}

/**
 * 将一个 watcher 推入队列
 * 相同 ID 的 watcher 会被跳过
 * 除非队列中之前的相同ID的 watcher 已被处理掉
 */
export function queueWatcher(watcher: Watcher) {
  const id = watcher.id;
  if (has[id] == null) {
    has[id] = true;
    if (!flushing) {
      queue.push(watcher);
    } else {
      let i = queue.length - 1;

      // 放到队列中相应 ID 的位置
      while (i > index && queue[i].id > watcher.id) {
        i--;
      }
      queue.splice(i + 1, 0, watcher);
    }
    if (!waiting) {
      waiting = true;
      
      // 放入微任务队列
      nextTick(flushSchedulerQueue);
    }
  }
}
```

如果不清楚微任务队列是什么，可以阅读下 [理解浏览器和node.js中的Event loop事件循环][9] 。

下面贴一下 Vue 的 nextTick 实现。
next-tick.d.ts
```js
// 自己给 next-tick 写了下接口
export declare function nextTick(cb: () => void, ctx?: any): Promise<any>;
```

next-tick.js (注意这是 JS)
```js
import { isNative } from "./util";

const inBrowser = typeof window !== "undefined";
const inWeex = typeof WXEnvironment == "undefined" && !!WXEnvironment.platform;
const weexPlatform = inWeex && WXEnvironment.platform.toLowerCase();
const UA = inBrowser && window.navigator.userAgent.toLowerCase();
const isIOS = (UA && /iphone|ipad|ipod|ios/.test(UA)) || (weexPlatform === "ios");

function noop() {}
function handleError() {}

const callbacks = [];
let pending = false;

function flushCallbacks() {
  pending = false;
  const copies = callbacks.slice(0);
  callbacks.length = 0;
  for (let i = 0; i < copies.length; i++) {
    copies[i]();
  }
}

// Here we have async deferring wrappers using both microtasks and (macro) tasks.
// In < 2.4 we used microtasks everywhere, but there are some scenarios where
// microtasks have too high a priority and fire in between supposedly
// sequential events (e.g. #4521, #6690) or even between bubbling of the same
// event (#6566). However, using (macro) tasks everywhere also has subtle problems
// when state is changed right before repaint (e.g. #6813, out-in transitions).
// Here we use microtask by default, but expose a way to force (macro) task when
// needed (e.g. in event handlers attached by v-on).
let microTimerFunc;
let macroTimerFunc;
let useMacroTask = false;

// Determine (macro) task defer implementation.
// Technically setImmediate should be the ideal choice, but it's only available
// in IE. The only polyfill that consistently queues the callback after all DOM
// events triggered in the same loop is by using MessageChannel.
/* istanbul ignore if */
if (typeof setImmediate !== "undefined" && isNative(setImmediate)) {
  macroTimerFunc = () => {
    setImmediate(flushCallbacks);
  };
} else if (typeof MessageChannel !== "undefined" && (
  isNative(MessageChannel) ||
  // PhantomJS
  MessageChannel.toString() === "[object MessageChannelConstructor]"
)) {
  const channel = new MessageChannel();
  const port = channel.port2;
  channel.port1.onmessage = flushCallbacks;
  macroTimerFunc = () => {
    port.postMessage(1);
  };
} else {
  /* istanbul ignore next */
  macroTimerFunc = () => {
    setTimeout(flushCallbacks, 0);
  };
}

// Determine microtask defer implementation.
/* istanbul ignore next, $flow-disable-line */
if (typeof Promise !== "undefined" && isNative(Promise)) {
  const p = Promise.resolve();
  microTimerFunc = () => {
    p.then(flushCallbacks);
    // in problematic UIWebViews, Promise.then doesn't completely break, but
    // it can get stuck in a weird state where callbacks are pushed into the
    // microtask queue but the queue isn't being flushed, until the browser
    // needs to do some other work, e.g. handle a timer. Therefore we can
    // "force" the microtask queue to be flushed by adding an empty timer.
    if (isIOS) { setTimeout(noop); }
  };
} else {
  // fallback to macro
  microTimerFunc = macroTimerFunc;
}

/**
 * Wrap a function so that if any code inside triggers state change,
 * the changes are queued using a (macro) task instead of a microtask.
 */
export function withMacroTask(fn) {
  return fn._withTask || (fn._withTask = function() {
    useMacroTask = true;
    const res = fn.apply(null, arguments);
    useMacroTask = false;
    return res;
  });
}

export function nextTick(cb, ctx) {
  let _resolve;
  callbacks.push(() => {
    if (cb) {
      try {
        cb.call(ctx);
      } catch (e) {
        handleError(e, ctx, "nextTick");
      }
    } else if (_resolve) {
      _resolve(ctx);
    }
  });
  if (!pending) {
    pending = true;
    if (useMacroTask) {
      macroTimerFunc();
    } else {
      microTimerFunc();
    }
  }
  // $flow-disable-line
  if (!cb && typeof Promise !== "undefined") {
    return new Promise((resolve) => {
      _resolve = resolve;
    });
  }
}
```

## 总结

本文代码已经放在 https://github.com/xyzingh/learn-vue-observer ，运行 `npm i && npm run test` 可以测试。

  [1]: http://es6.ruanyifeng.com/
  [2]: https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Object/defineProperty
  [3]: https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Object/observe
  [4]: http://es6.ruanyifeng.com/#docs/proxy
  [5]: https://cn.vuejs.org/v2/guide/list.html#%E6%95%B0%E7%BB%84%E6%9B%B4%E6%96%B0%E6%A3%80%E6%B5%8B
  [6]: https://cn.vuejs.org/v2/guide/computed.html#%E8%AE%A1%E7%AE%97%E5%B1%9E%E6%80%A7
  [7]: https://cn.vuejs.org/v2/api/#vm-watch
  [8]: https://github.com/vuejs/vue/issues/3883
  [9]: https://juejin.im/post/5ab88836f265da237410f701