const execSync = require('child_process').execSync
const res = execSync("refresh", { encoding: 'utf-8' })
console.log("res:", res)