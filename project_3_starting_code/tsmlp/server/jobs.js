const fs = require("fs")
const path = require("path")
require('dotenv').config()
const nodemailer = require("nodemailer")
// Create reusable transporter object using the default SMTP transport.
const transporter = nodemailer.createTransport({
  "service": "gmail",
  "auth": {
    "user": process.env.SMTP_LOGIN,
    "pass": process.env.SMTP_PASSW
  }
})
const { "v4": uuidv4 } = require("uuid")
const mu = require("maia-util")

console.log("mode:", process.env.DEVMODE)

// let currTokens, sthg
// const sessionLength = 90*24*60*60*1000 // of 90 days
// const activeCutoff = 365*24*60*60*1000 // of 365 days
// // const nosActive = 10 // Number of active users to show on landing page

// Paths to various data files
let jobsPath
if (process.env.DEVMODE === "prod"){
  jobsPath = path.join("/mount", "jobs.json")
}
else {
  jobsPath = path.join(".data", "jobs.json")
}

// Load the legit users onto keys of an object.
// const legitUsers = {}
// JSON.parse(
//   fs.readFileSync(
//     legitUsersPath,
//     {
//       "encoding": "utf8"
//     }
//   )
// ).forEach(function(ea){
//   legitUsers[ea] = null
// })
// console.log("Object.keys(legitUsers).length:", Object.keys(legitUsers).length)
// console.log("legitUsers:", legitUsers)

// All the users' data, gathered from various folders on the back-end into one object.
// const allUserData = get_all_user_data()
// console.log("allUserData:", allUserData)


module.exports = async function(fastify, opts, done){

  // Gets the latest submitted jobs.
  fastify.get("/api/jobs", function(req, rep){
    console.log("req.query.sig:", req.query.sig)
    if (process.env.JOBS_PASSW === req.query.sig){
      console.log("Legitimate request for the jobs.json file.")
    }

    const jobs = JSON.parse(
      fs.readFileSync(
        jobsPath,
        {
          "encoding": "utf8"
        }
      )
    )

    rep.send({
      "jobs": jobs
    })
    return

  })





  done()

}
