const observe = require(".").observe;
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
//console.log(obj.a.aa.aaa = 234);

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
console.log(obj2.a = 456);

let obj3 = {
  arr: [2, 3, 5, 7, 11, 13]
};
observe(obj3);
obj3.arr.push(123);

let a = {
  get aa() {
    return 123;
  },
  set aa(val) {

  }
}
let b = Object.create(a);
b.aa = 456;
