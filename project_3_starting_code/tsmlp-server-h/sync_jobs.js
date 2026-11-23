require("dotenv").config()
const fs = require("fs")
const path = require("path")
const execSync = require('child_process').execSync;
const findJobs = require("./find_new_jobs.js")

let urlForCurl, rootDir
if (process.env.DEVMODE === "prod"){
  rootDir = path.join("/home", "tsmlp", "project_files")
  urlForCurl = "https://tsmlp.onrender.com"
}
else {
  rootDir = path.join(
    "/Users", "tomthecollins", "Shizz", "UMiami", "Projects", "tsmlp",
    "dev_server"
  )
  urlForCurl = "http://localhost:3003"
}

setInterval(
  function(){

    try {
      console.log("Getting latest submissions.")
      // Get jobs.txt
      // curl -X GET -H "Content-Type: application/json" -is https://unmix.glitch.me/jobs?sig=hidkfigodofo -o /home/transcription/transcription/webService/jobs.txt
      // let execStr = 'curl -X GET'
      // execStr += ' -H "Content-Type: application/json"'
      // execStr += ' -is "' + urlForCurl + '/api/jobs?sig=' + process.env.JOBS_PASSW + '"'
      // console.log("execStr:", execStr)
      // const resStr = execSync(execStr, { encoding: 'utf-8' }).split("\r\n\r\n")[1]
      // const res = JSON.parse(resStr)
      // console.log("res:", res)
      // const res2 = res.jobs
      // // console.log("res2:", res2)
      // fs.writeFileSync(
      //   path.join(rootDir, "jobs.json"),
      //   JSON.stringify(res2, null, 2),
      //   {
      //     "encoding": "utf8"
      //   }
      // )
      // console.log("Jobs written to file.")


      findJobs.find_new_jobs()
    }
    catch(err){
      console.error("err:", err)
    }

  },
  5000
)
