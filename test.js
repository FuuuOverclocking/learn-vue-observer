const observe = require(".").observe;
const Watcher = require("./watcher").Watcher;

console.log("Test:");

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

observe(obj);
new Watcher(obj, "a.aa.bbb", val => console.log(val), { sync: true });
console.log("obj:");
obj.a.aa.bbb = 999;
obj.a.aa = {
  aaa: 123,
  bbb: 456,
};

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
  configurable: true,
  enumerable: false,
  value: 123,
  writable: true,
});

observe(obj2);
new Watcher(obj2, "a", val => console.log(val), { sync: true });
console.log("obj2:");
obj2.a = 456;

let obj3 = {
  arr: [2, 3, 5, 7, 11, 13]
};
observe(obj3);
new Watcher(obj3, "arr", val => console.log(val), { sync: true });
console.log("obj3:");
obj3.arr.push(17);

let wat = new Watcher(obj, "a.aa.aaa", val => console.log(val), { sync: true });
console.log("obj:");
obj.a.aa.aaa = 999;
wat.teardown();
obj.a.aa = {
  aaa: 123,
  bbb: 456,
};

new Watcher(obj, "a.aa.aaa", val => console.log(val), { sync: false });
console.log("obj:");
obj.a.aa.aaa = 999;
console.log("sync or async?");