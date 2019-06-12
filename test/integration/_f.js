// require("../../dist/utils/process").onExit(console.log)
// // process.once('SIGINT', (...args) => {
// // 	console.log(args, process.listeners('SIGINT').length)


// // 	process.kill(process.pid, 'SIGINT')
// // });
// // process.on('SIGINT', () => {
// // 	console.log('yyy') 
// // })
// // process.once('SIGTERM', console.log);

// async function x() {
// 	for (let i = 0; i < 1000; i++) {
// 		await cc()
// 	} 
// }

// async function cc() {
// 	await new Promise(setImmediate)
// 	console.log('aa')
// }

// x()

// // console.log('e')
// setTimeout(() => {
// 	console.log('ppp')
// }, 3000);

const { Worker, isMainThread, workerData } = require('worker_threads');

if (isMainThread) {
  const worker = new Worker(__filename, { workerData: {a: 'Hello, world!'} });
} else {
  console.log(workerData);  // Prints 'Hello, world!'.
}