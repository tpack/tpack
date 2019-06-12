# 源映射（Source Map) 操作
这篇文章将告诉你如何用代码读取和生成源映射（Source Map)。

## 读取源映射
通过工具压缩 tpack.js 时，会生成压缩后的 tpack.min.js 文件和对应的 tpack.min.js.map 源映射文件。

先创建一个 `SourceMapBuilder` 对象用于解析它：
```js
const sourceMap = require("tutils/sourceMap")

const mapString = '{"version":3,"file":"tpack.min.js","sources":["tpack.js"],"mappings":";AAUoG,EAUoGA;;AAUoG,UCftJ,UDKkD,UCKkD,CDVpG;;;C,MCyL5I,6FDpGLC"}'
// 也可以直接从文件读取，如：
// const mapString = require("fs").readFileSync("tpack.min.js.map", "utf-8")

const mapBuilder = new sourceMap.SourceMapBuilder(mapString)
// 也可以传入已解析的对象，如：
// const mapBuilder = new sourceMap.SourceMapBuilder(JSON.parse(mapString))
```

### 从生成位置查询源码位置
要查询 tpack.min.js 中第 4 行第 10 个字符的源码在哪里，使用：
```js
const source = mapBuilder.getSource(3, 9) // 注意代码中，行列号都是从 0 开始的
console.log(source)
// => { 
//     sourcePath: "tpack.js", 
//     line: 30, 
//     column: 309
// }
```
并不是所有的位置都有源码信息，如果没有则返回 `null`。

源映射的规范中每个映射点都是独立的，缺少明确的映射点就无法获取对应的源码信息。
而实际项目中其实是可以通过上一行列的映射点推算相邻位置的映射点的，要启用这种推算，可以使用：
```js
const source = mapBuilder.getSource(3, 9, true /* 推算行*/, true /* 推算列 */)
```
使用推算后可以降低返回 `null` 的可能性。

### 从源码位置查询生成位置
要查询 tpack.js 中第 21 行第 201 个字符生成到了哪里，使用：
```js
const generated = mapBuilder.getAllGenerated("tpack.js", 20, 200) // 注意代码中，行列号都是从 0 开始的
console.log(generated)
// => [{ 
//     line: 1, 
//     column: 2
// }, { 
//     line: 3, 
//     column: 20
// }]
```
注意一个源码可能生成到多个位置，所以返回是一个数组，如果找不到生成的位置，则返回空数组。

如果只传行号，可以查询该行的所有映射点。

### 遍历所有映射点
```js
mapBuilder.eachMapping((generatedLine, generatedColumn, sourcePath, sourceLine, sourceColumn, name, mapping) => {
	console.log(generatedLine, generatedColumn, sourcePath, sourceLine, sourceColumn, name)
})
```
遍历的回调函数如果返回 `false`，会终止遍历。

## 生成源映射
要创建新的空源映射：
```js
const mapBuilder = new sourceMap.SourceMapBuilder()
````

也可以从已有的源映射继续编辑：
```js
const mapBuilder = new sourceMap.SourceMapBuilder(/* 已有的源映射，字符串或对象形式 */)
```

### （可选）设置生成的文件名
```js
mapBuilder.file = "tpack.js"
```

### 添加映射点
比如要记录生成的 tpack.js 中的第 21 行第 201 个字符生成到了 tpack.min.js 的第 4 行第 21 个字符：
```js
mapBuilder.addMapping(3, 20, "tpack.js", 20, 200) // 注意代码中，行列号都是从 0 开始的
```
可以反复调用 `addMapping` 添加所有映射点。

### 生成最终的源映射
```js
const mapObject = mapBuilder.toJSON() // 生成对象形式的源映射
const mapString = mapBuilder.toString() // 生成字符串形式的源映射
```

## 合并源映射
假如有源文件 A，通过一次生成得到 B，其源映射记作 S1；
然后 B 通过再次生成得到 C，其源映射记作 S2；
此时可以调用 `S2.applySourceMap(S1)`，将 S2 更新为 A 到 C 的源映射。
```js
const s1 = new sourceMap.SourceMapBuilder(/* A 的源映射 */)
const s2 = new sourceMap.SourceMapBuilder(/* B 的源映射 */)

s2.applySourceMap(s1)
console.log(s2.toJSON())
```

## 修改代码并生成源映射
假如现在有代码：`var url = "http://www.tealui.com/";`，
现在需要对代码做一些替换，并生成源映射：
```js
const { replace } = require("tutils/textDocument")

const input = `var url = "http://www.tealui.com/";`

const data = replace({ content: input }, "http:", "")
console.log(data)
// => {
//      content: `var url = "//www.tealui.com/`,
//      sourceMap: { ... }
// }
```

之后可以在代码末尾插入源映射注释：
```js
const output = setSourceMappingURL(input, "tpack.min.js.map")
````