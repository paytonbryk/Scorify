require("dotenv").config()
const fs = require("fs")
const path = require("path")
const execSync = require('child_process').execSync;
const findJobs = require("./find_new_jobs.js")

// need to be changed to a new folder to save files.
const rootDir = path.join("/home", "vargen")

setInterval(
  function(){

    try {
      console.log("Getting latest submissions.")
      let execStr = 'curl -X GET'
      execStr += ' -H "Content-Type: application/json"'
      execStr += ' -is "https://var-gen.glitch.me/jobs?sig=e0944fd2d427cg"'
      console.log("execStr:", execStr)
      const resStr = execSync(execStr, { encoding: 'utf-8' }).split("\r\n\r\n")[1]
     // console.log("resStr:", resStr)
      const res = JSON.parse(resStr)
      // console.log("res:", res)
      const res2 = res.jobs
      console.log("res2:", res2)
      fs.writeFileSync(
        path.join(rootDir, "jobs.json"),
        JSON.stringify(res2, null, 2),
        {
          "encoding": "utf8"
        }
      )
      console.log("Jobs written to file.")

      findJobs.find_new_jobs()

    }
    catch(err){
      console.error("err:", err)
    }
    
   
  },
  30000 // 60000
)