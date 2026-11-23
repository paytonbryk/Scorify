
/**
 * This is the main Node.js server script for your project
 * Check out the two endpoints this back-end API provides in fastify.get and fastify.post below
 */

const path = require("path")
const fs = require("fs")

// Require the fastify framework and instantiate it
const fastify = require("fastify")({
  // Set this to true for detailed logging:
  logger: false,
});

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

/**
 * Our POST route to handle and react to form submissions
 *
 * Accepts body data indicating the user choice
 */
let myUserSessions
const sessionLength = 10*24*60*60*1000 // of 1 min.
const jobCompleteFileName = "complete_jobs.json"

module.exports = function(fastify, opts, done) {
  fastify.post("/generateMagicLink", function (req, rep) {
    // Grab user email from the req.body.
    const ea = req.body.emailAddress
    if (ea === null){
      rep.code(404).send()
      return
    }

    fs.readFile(
      '.data/user_sessions.json',
      {
        "encoding": "utf8"
      },
      function(err, data){
        if (err) throw err
        myUserSessions = JSON.parse(data)
        console.log("myUserSessions:", myUserSessions)

        // Magic link generation
        const ml = uuidv4()
        console.log("ml:", ml)

        if (myUserSessions[ea] === undefined){
          console.log("We have a new user!")
          const entry = {
            "magicLink": ml,
            "id": ml,
            "stampCreate": Date.now()
          }
          myUserSessions[ea] = entry

          // Write new version of user_sessions.json
          fs.writeFileSync(
            '.data/user_sessions.json',
            JSON.stringify(
              myUserSessions, null, 2
            ),
            {
              "flag": "w",
              "encoding": "utf8"
            }
          )
          
          // Create 'complete_jobs.json' file.
          const currentIdUser = ml
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

          // Email to first-time user.
          const msgText = "Hello, thanks for signing up. Here is your link to access anything you create on this site:<br>"
          +
          "https://var-gen.glitch.me?ml="
          +
          ml
          +
          "<br><br>Bye!"
          // + magicLink

          // Setting up the email that will be sent.
          const mailOptions = {
            from: '"'+ "Chenyu" +'" <'+process.env.TEST_SENDER+'>', // Sender address
            to: ea, // List of receivers
            subject: 'Test Mail', // Subject line
            text: msgText, // Plaintext body
            html: msgText // HTML body
          }

          // Sending that email.
          transporter.sendMail(mailOptions, function(error, info){
            if(error){
              return console.log(error)
            }
            console.log('Message sent: ' + info.response)

            rep.send({
              "hello": "An email was sent to a new user."
            })
          })

        }
        else {
          // We have a returning user!
          myUserSessions[ea]["magicLink"] = ml
          myUserSessions[ea]["stampCreate"] = Date.now()

          // Write new version of user_sessions.json
          fs.writeFileSync(
            '.data/user_sessions.json',
            JSON.stringify(
              myUserSessions, null, 2
            ),
            {
              "flag": "w",
              "encoding": "utf8"
            }
          )

          // Email to returning user.
          const msgText = "Hello, thanks for coming again. Here is your link to access anything you create on this site:<br>"
          +
          "https://var-gen.glitch.me?ml="
          +
          ml
          +
          "<br><br>Bye!"
          // + magicLink
          const mailOptions = {
            from: '"'+ "Chenyu" +'" <'+process.env.TEST_SENDER+'>', // Sender address
            to: ea, // List of receivers
            subject: 'Test Mail', // Subject line
            text: msgText, // Plaintext body
            html: msgText // HTML body
          }
          // ...
          transporter.sendMail(mailOptions, function(error, info){
            if(error){
              return console.log(error)
            }
            console.log('Message sent: ' + info.response)

            rep.send({
              "hello": "An email was sent to a return user."
            })
          })

        }


      }
    )



  })


  fastify.post("/authenticate", function (req, rep) {
    console.log("Hello, I was triggered!")
    console.log("req.body:", req.body)
    const ml = req.body.ml
    if (ml === null){
      rep.code(404).send()
      return
    }

    const userSessionsStr = fs.readFileSync(
      '.data/user_sessions.json',
      {
        "encoding": "utf8"
      }
    )
    myUserSessions = JSON.parse(userSessionsStr)
    console.log("myUserSessions:", myUserSessions)


    const ea = Object.keys(myUserSessions)
      .find(function(k){
        return myUserSessions[k]["magicLink"] === ml

      }
    )
    console.log("ea:", ea)
    if (ea === undefined){
      rep.send({
        "hello": "Dodgy magic link!"
      })
      return
    }

    // See if current date minus stampCreate property is less than some arbitrary threshold.
    if (Date.now() - myUserSessions[ea]["stampCreate"] > sessionLength){
      // Session expired.
      rep.send({
        "hello": "Session expired!"
      })
    }
    else {
      // Session in date.
      // Grabbing more data from back-end, possibly.
      // ...
      // Generation history content
      const idUser = myUserSessions[ea]["id"]
      const smallUserID=idUser.slice(0, 3)
      const jobFolderPath = path.join(".data/project", smallUserID, idUser)
      const currentJobCompleteFile = path.join(jobFolderPath, jobCompleteFileName)
      
      let generationHistory
      
      // If we would like to search an URL by 'idJob', perhaps we will have to rewrite the whole file...
      fs.readFile(
        currentJobCompleteFile,
        {
          "encoding": "utf8"
        },
        function(err, data){
          if (err) throw err
          generationHistory = JSON.parse(data)
          // console.log("completeJobList:", completeJobList)
          // console.log("generationHistory:", generationHistory)

          console.log("myUserSessions[ea]", myUserSessions[ea])
          rep.send({
            "hello": "Authentication successful!",
            "allTheDetails": myUserSessions[ea],
            "email": ea,
            "magicLink": ml,
            "genHistory": generationHistory,
            "apiKeys": ml // Should we generate an apiKeys? or if we could use magicLink as the apiKeys?
          })
        }
      )

    }

  })


  fastify.post("/sendEmail", function (req, rep) {
    console.log("Hello, I was triggered!")
    console.log("req.body:", req.body)
    const ea = req.body.emailAddress
    if (ea === null){
      rep.code(404).send()
      return
    }

    const msgText = "Hello, this is a test email.<br><br>Bye!"
    // + magicLink

    // Setting up the email that will be sent.
    const mailOptions = {
      from: '"'+ "Tom" +'" <'+process.env.TEST_SENDER+'>', // Sender address
      to: ea, // List of receivers
      subject: 'Test Mail', // Subject line
      text: msgText, // Plaintext body
      html: msgText // HTML body
    }

    // Sending that email.
    transporter.sendMail(mailOptions, function(error, info){
      if(error){
        return console.log(error)
      }
      console.log('Message sent: ' + info.response)

      rep.send({
        "hello": "blah blah"
      })
    })




    // return reply.view("/src/pages/index.hbs", params);
  });
  
  done()
}
