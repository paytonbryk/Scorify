const fs = require("fs")
const path = require('path')
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

const jobsPath = ".data/jobs.json"
const jobCompletePath = ".data/complete_jobs.json"
// const jobsFileName = "jobs.json"
const jobCompleteFileName = "complete_jobs.json"
// const ipPath = ".data/ip.json"
// const akPath = ".data/ak.json"
const freeJobsTotal = 3

let jobs
module.exports = function(fastify, opts, done) {
  fastify.get("/jobs", function(req, rep){
    console.log("jobs endpoint was triggered!")
    console.log("req.query.sig:", req.query.sig)

    if (req.query.sig === process.env.JOBS_GET_TEST){
      fs.readFile(jobsPath, "utf8", (err, str) => {
        if (err){
          throw err
        }
        else {
          jobs = JSON.parse("[" + str.slice(0, -2) + "]")
          rep.send({
            "message": "Request for data granted.",
            "jobs": jobs
          })
        }
      })
    }
  })
  
  fastify.get("/jobComplete", function(req, rep){
    console.log("jobs on Woodford was completed!")
    console.log("req.query.sig:", req.query.sig)

    if (req.query.sig === process.env.JOBS_GET_TEST){
      console.log("req.query.urls:", req.query.urls)
      
      // WRITE idJob and urls to .data/complete_jobs.json
      const currentIdJob = req.query.idJob
      const currentUrl = req.query.urls
      const idUser = req.query.idUser
      
      const smallUserID=idUser.slice(0, 3) // The first level of subfolders here use the first three characters of the user's id.
      // Check if a folder exist. If not, create a folder for the current user.
      const jobFolderPath = path.join(".data/project", smallUserID, idUser)
      const currentJobCompleteFile = path.join(jobFolderPath, jobCompleteFileName)
      
      let completeJobList
      
      // If we would like to search an URL by 'idJob', perhaps we will have to rewrite the whole file...
      fs.readFile(
        currentJobCompleteFile,
        {
          "encoding": "utf8"
        },
        function(err, data){
          if (err) throw err
          completeJobList = JSON.parse(data)

          completeJobList[currentIdJob] = currentUrl
          console.log("completeJobList updated:", completeJobList)

          // Write new version of user_sessions.json
          fs.writeFileSync(
            currentJobCompleteFile,
            JSON.stringify(completeJobList, null, 2),
            {
              "flag": "w",
              "encoding": "utf8"
            },
            (err) => {
              if (err){
                throw err
              }
              else{
                // This reply would go to woodforde, so it's kind of pointless!
                // But if we do not reply, woodforde will wait for a long time... So I added a short message here.
                rep.send({
                  "message": "Received and finished update.",
                })
              }
            }
          )
        }
      )
      
    }
  })
  
  fastify.post("/addJobToQueue", function(req, rep){
    // Due to the content and use of the apiKey endpoint, we can only get here if the API key is valid and at least one job remains.
    console.log("req.body:", req.body)

    if (req.body.apiKey !== ""){
      ////////////////////////////////////////////////////////
      // This one is for adding paid-for jobs to the queue. //
      ////////////////////////////////////////////////////////
      console.log("GOING TO ADD A PAID-FOR JOB TO THE QUEUE!")
      // We can process this job: user is under the limit.
      // Our idJob will start with the current date
      const idJob = get_date_string() + '_' + rand_lc_string(6)
      req.body.idJob = idJob
      // console.log(">>>idJob:", idJob)
      req.body.stampJob = new Date().toISOString()  // Not sure where 'stampJob' will be used...
      
      /*
      *  We will take people's ids and organise a folder/file structure using these ids, instead of having a single file (.data/complete_jobs.json).
      *  The structure of our folder to store jobs, and complete jobs is shown below:
      *  .data/project
      *         └────the first three characters of the user's id
      *                       └────subfolders for each user id
      *                                        └────complete_jobs.json (complete jobs, will be used to update the drop-down menu in a user's homepage)
      */
      const currentIdUser = req.body.idUser
      const smallUserID=currentIdUser.slice(0, 3) // The first level of subfolders here use the first three characters of the user's id.
      // Check if a folder exist. If not, create a folder for the current user.
      const jobFolderPath = path.join(".data/project", smallUserID, currentIdUser)
      // const currentJobsFile = path.join(jobFolderPath, jobsFileName)
      const currentJobCompleteFile = path.join(jobFolderPath, jobCompleteFileName)
      if (!fs.existsSync(jobFolderPath)) {
        // Create multi-level folder.
        fs.mkdirSync(jobFolderPath, { recursive: true });

        // Prepare an empty JSON file for completed jobs.
        const emptyObject = {};
        fs.writeFileSync(currentJobCompleteFile, JSON.stringify(emptyObject, null, 2), 'utf8');

        console.log("multi-level folder created: ", jobFolderPath);
      } 
      else {
        console.log(`multi-level folder '${jobFolderPath}' already exited.`);
      }
      

      // Save the information.
      fs.writeFile(
        jobsPath,
        JSON.stringify(req.body, null, 2) + ",\n",
        {
          "encoding": "utf8",
          "flag": "a"
        },
        (err) => {
          if (err){
            throw err
          }
          else {
            console.log("Jobs file updated.")
            const myInterval = setInterval(function(){
              
              try {
                console.log("Checking complete jobs.")
                const data = fs.readFileSync(
                  currentJobCompleteFile,
                  {
                    "encoding": "utf8"
                  }
                )
                const completeJobs = JSON.parse(data)
                // Search for relevant job id in completeJobs.

                // If there is the relevant job id
                if (completeJobs[idJob] !== undefined){
                  console.log(">>>completeJobs[idJob]:", completeJobs[idJob])
                  clearInterval(myInterval)

                  rep.send({
                    "message": "The variation is generated!",
                    "idJob": idJob,
                    "urls": completeJobs[idJob]
                  })
                }

              }
              catch(err){
                console.error("err:", err)
              }

              
            }, 10000)
            // rep.send({
            //   "message": "The processing of your job has begun.",
            //   "idJob": req.body.idJob
            // })
          }
        }
      )
      
    } // Ends adding of paid job to queue.
  })

  done()
}



function rand_lc_string(n){
  // Random lower-case string generator
  let outStr = ""
  for (let i = 0; i < n; i++){
    outStr += String.fromCharCode(
      97 + Math.floor((122 - 97 + 1)*Math.random())
    )
  }
  return outStr
}

function get_date_string(){
  // Get the current date in the format: YYYY_MM_DD
  const date = new Date()
  const YYYY = date.getFullYear()
  const MM = date.getMonth() + 1
  const DD = date.getDate()
  let out = YYYY+'-'+MM+'-'+DD
  out = out.toString()
  
  return out
}

function send_job_email(rbody){
  //////////////////////////////////////////////
  // Send an email about the job to the user. //
  //////////////////////////////////////////////
  let emailText = "Hi there!<br><br>Thanks for submitting your generation job."
  emailText += " It has been added to our generation queue, and as a reminder, the job details are as follows:<br>" +
  "<pre>" +
  "      <strong>job id: " + rbody.idJob + "</strong><br>" +
  "    model id: " + rbody.idModel + "<br>" +
  "run or train: " + rbody.runOrTrain + "<br>" +
  "dataset name: " + rbody.dsetName + "<br>" +
  "   timestamp: " + rbody.stampJob +
  "</pre>" + "<br>" +
  "If there are any issues with the way your job has been set up, you may receive another message titled \"Generation job failed\", containing a description of what has gone wrong and suggested fixes.<br><br>" +
  "Otherwise, you will receive another message titled \"Generation job complete\" in due course, containing a download link for your generated files. If the job is taking an unreasonable amount of time to complete, reply to this email quoting the job id in bold above, and we will investigate.<br><br>Kind regards,<br>T. Collins<br><br>"
  rbody.author = "Cocreate"
  rbody.subject = "Generation job queued"
  rbody.text = emailText
  const mailOptions = {
    from: '"'+rbody.author+'" <'+process.env.TEST_SENDER+'>', // Sender address
    to: rbody.email, // List of receivers
    subject: rbody.subject, // Subject line
    text: rbody.text, // Plaintext body
    html: rbody.text // HTML body
  }

  // Send mail with defined transport object.
  transporter.sendMail(mailOptions, function(error, info){
    if(error){
      return console.log(error)
    }
    console.log('Message sent: ' + info.response)

  })
}

